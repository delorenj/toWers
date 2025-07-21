package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"one-mcp/backend/common"
	"one-mcp/backend/library/proxy"
	"one-mcp/backend/model"

	"github.com/burugo/thing"
	"github.com/gin-gonic/gin"
)

// parseInt64 is a helper function to safely parse int64 from various numeric types or string.
// It's used for retrieving userID from gin.Context.
func parseInt64(value interface{}) (int64, error) {
	switch v := value.(type) {
	case int64:
		return v, nil
	case float64:
		return int64(v), nil
	case json.Number:
		return v.Int64()
	case string:
		num, err := json.Number(v).Int64()
		if err == nil {
			return num, nil
		}
		// Fallback for plain integer strings if json.Number fails (e.g. not a valid JSON number but simple int string)
		var i int64
		_, scanErr := fmt.Sscan(v, &i)
		return i, scanErr
	default:
		return 0, fmt.Errorf("cannot parse type %T to int64", value)
	}
}

// checkDailyRequestLimit checks if the user has exceeded their daily request limit for the service
func checkDailyRequestLimit(serviceID int64, userID int64, rpdLimit int) error {
	// If RPD limit is 0, no limit is enforced
	if rpdLimit <= 0 {
		return nil
	}

	// Get today's request count from cache
	cacheClient := thing.Cache()
	if cacheClient == nil {
		common.SysError(fmt.Sprintf("[RPD] Cache client is nil for service %d, user %d", serviceID, userID))
		// If cache is not available, allow the request to proceed (fail open)
		return nil
	}

	today := time.Now().Format("2006-01-02")
	// Use a different cache key for user-specific request counts (different from global service counts)
	cacheKey := fmt.Sprintf("user_request:%s:%d:%d:count", today, serviceID, userID)

	ctx := context.Background()
	countStr, err := cacheClient.Get(ctx, cacheKey)
	if err != nil {
		// If key doesn't exist, count is 0
		return nil
	}

	count, err := strconv.ParseInt(countStr, 10, 64)
	if err != nil {
		common.SysError(fmt.Sprintf("[RPD] Failed to parse cache count value for user %d, service %d: %v", userID, serviceID, err))
		// If parsing fails, allow the request to proceed (fail open)
		return nil
	}

	if count >= int64(rpdLimit) {
		return fmt.Errorf("daily request limit exceeded: %d/%d requests used today", count, rpdLimit)
	}

	return nil
}

// tryGetOrCreateUserSpecificHandler attempts to find or create a handler tailored for a specific user.
// proxyType should be "sseproxy" or "httpproxy"
func tryGetOrCreateUserSpecificHandler(c *gin.Context, mcpDBService *model.MCPService, userID int64, proxyType string) (http.Handler, error) {

	// Prepare user-specific environment variables
	currentEnvMap := make(map[string]string)
	// Populate currentEnvMap from DefaultEnvsJSON first
	if mcpDBService.DefaultEnvsJSON != "" && mcpDBService.DefaultEnvsJSON != "{}" {
		if err := json.Unmarshal([]byte(mcpDBService.DefaultEnvsJSON), &currentEnvMap); err != nil {
			common.SysError(fmt.Sprintf("[ProxyHandler] Error unmarshalling DefaultEnvsJSON for %s (user-specific): %v", mcpDBService.Name, err))
			currentEnvMap = make(map[string]string)
		}
	}

	// Fetch and merge user-specific ENVs
	userEnvs, userEnvErr := model.GetUserSpecificEnvs(userID, mcpDBService.ID)
	if userEnvErr != nil {
		common.SysError(fmt.Sprintf("[ProxyHandler] Error fetching user-specific ENVs for user %d, service %s: %v", userID, mcpDBService.Name, userEnvErr))
	}

	if len(userEnvs) > 0 {
		for k, v := range userEnvs {
			currentEnvMap[k] = v // User-specific ENVs override DefaultEnvsJSON
		}
	}

	// Marshal the merged env map back to JSON
	mergedEnvsJSONBytes, marshalErr := json.Marshal(currentEnvMap)
	if marshalErr != nil {
		common.SysError(fmt.Sprintf("[ProxyHandler] Error marshalling merged ENVs for user %d, service %s: %v. Proceeding with original DefaultEnvsJSON.", userID, mcpDBService.Name, marshalErr))
		mergedEnvsJSONBytes = []byte(mcpDBService.DefaultEnvsJSON)
	}
	mergedEnvsJSON := string(mergedEnvsJSONBytes)

	// Create user-specific shared MCP instance
	ctx := c.Request.Context()
	userSharedCacheKey := fmt.Sprintf("user-%d-service-%d-shared", userID, mcpDBService.ID)
	instanceNameDetail := fmt.Sprintf("user-%d-shared-svc-%d", userID, mcpDBService.ID)

	sharedInst, err := proxy.GetOrCreateSharedMcpInstanceWithKey(ctx, mcpDBService, userSharedCacheKey, instanceNameDetail, mergedEnvsJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to create user-specific shared MCP instance for %s (user %d): %w", mcpDBService.Name, userID, err)
	}

	var targetHandler http.Handler
	switch proxyType {
	case "sseproxy":
		targetHandler, err = proxy.GetOrCreateProxyToSSEHandler(ctx, mcpDBService, sharedInst)
		if err != nil {
			return nil, fmt.Errorf("failed to create user-specific SSE proxy handler for %s (user %d): %w", mcpDBService.Name, userID, err)
		}
	case "httpproxy":
		targetHandler, err = proxy.GetOrCreateProxyToHTTPHandler(ctx, mcpDBService, sharedInst)
		if err != nil {
			return nil, fmt.Errorf("failed to create user-specific HTTP proxy handler for %s (user %d): %w", mcpDBService.Name, userID, err)
		}
	default:
		return nil, fmt.Errorf("unsupported proxy type for user-specific handler: %s", proxyType)
	}

	return targetHandler, nil
}

// tryGetOrCreateGlobalHandler attempts to find or create a global handler for the service.
// proxyType should be "sseproxy" or "httpproxy"
func tryGetOrCreateGlobalHandler(c *gin.Context, mcpDBService *model.MCPService, proxyType string) (http.Handler, error) {

	// Use unified global cache key and standardized parameters (same as ServiceFactory)
	ctx := c.Request.Context()
	globalSharedCacheKey := fmt.Sprintf("global-service-%d-shared", mcpDBService.ID)
	instanceNameDetail := fmt.Sprintf("global-shared-svc-%d", mcpDBService.ID)
	effectiveEnvs := mcpDBService.DefaultEnvsJSON

	sharedInst, err := proxy.GetOrCreateSharedMcpInstanceWithKey(ctx, mcpDBService, globalSharedCacheKey, instanceNameDetail, effectiveEnvs)
	if err != nil {
		return nil, fmt.Errorf("failed to create shared MCP instance for %s: %w", mcpDBService.Name, err)
	}

	var targetHandler http.Handler
	switch proxyType {
	case "sseproxy":
		targetHandler, err = proxy.GetOrCreateProxyToSSEHandler(ctx, mcpDBService, sharedInst)
		if err != nil {
			return nil, fmt.Errorf("failed to create SSE proxy handler for %s: %w", mcpDBService.Name, err)
		}
	case "httpproxy":
		targetHandler, err = proxy.GetOrCreateProxyToHTTPHandler(ctx, mcpDBService, sharedInst)
		if err != nil {
			return nil, fmt.Errorf("failed to create HTTP proxy handler for %s: %w", mcpDBService.Name, err)
		}
	default:
		return nil, fmt.Errorf("unsupported proxy type: %s", proxyType)
	}

	return targetHandler, nil
}

// ProxyHandler handles GET and POST /proxy/:serviceName/*action
func ProxyHandler(c *gin.Context) {
	serviceName := c.Param("serviceName")
	action := c.Param("action") // This captures the path after /proxy/:serviceName
	requestPath := c.Request.URL.Path
	requestMethod := c.Request.Method

	// Only log if there's a query string for debugging
	if c.Request.URL.RawQuery != "" {
		common.SysLog(fmt.Sprintf("[ProxyHandler] %s %s?%s", requestMethod, requestPath, c.Request.URL.RawQuery))
	}

	mcpDBService, err := model.GetServiceByName(serviceName)
	if err != nil || mcpDBService == nil {
		common.SysError(fmt.Sprintf("[ProxyHandler] Service not found: %s, error: %v", serviceName, err))
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Service not found: " + serviceName})
		return
	}
	if !mcpDBService.Enabled {
		common.SysLog(fmt.Sprintf("WARN: [ProxyHandler] Service not enabled: %s", serviceName))
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Service not enabled: " + serviceName})
		return
	}

	var targetHandler http.Handler
	var handlerErr error
	var userID int64

	if idVal, exists := c.Get("userID"); exists {
		parsedID, parseErr := parseInt64(idVal)
		if parseErr == nil {
			userID = parsedID
		} else {
			common.SysLog(fmt.Sprintf("WARN: [ProxyHandler] userID parse failed: %v, type: %T, err: %v", idVal, idVal, parseErr))
		}
	}

	// NEW: If userID is 0, it means no valid user ID was found in the context.
	// This check ensures that even if middleware (like TokenAuth)
	// doesn't explicitly abort the request, ProxyHandler still enforces authentication.
	if userID == 0 {
		common.SysLog(fmt.Sprintf("WARN: [ProxyHandler] Unauthorized access: userID not found or invalid for service %s", serviceName))
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Authentication required. Please provide a valid user ID."})
		return
	}

	// Check daily request limit (RPD) if user is authenticated and limit is set
	if userID > 0 && mcpDBService.RPDLimit > 0 {
		if rpdErr := checkDailyRequestLimit(mcpDBService.ID, userID, mcpDBService.RPDLimit); rpdErr != nil {
			common.SysLog(fmt.Sprintf("[RPD] User %d exceeded limit for %s: %v", userID, serviceName, rpdErr))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success":    false,
				"message":    rpdErr.Error(),
				"error_code": "DAILY_LIMIT_EXCEEDED",
			})
			return
		}
	}

	if userID > 0 && mcpDBService.AllowUserOverride && mcpDBService.Type == model.ServiceTypeStdio {
		// Determine proxy type based on action (SSE vs Streamable endpoint routing)
		proxyType := "sseproxy" // default to SSE
		if action == "/mcp" {
			proxyType = "httpproxy" // Streamable endpoint
		}
		// Note: Both /sse and /message are SSE type endpoints and use sseproxy

		targetHandler, handlerErr = tryGetOrCreateUserSpecificHandler(c, mcpDBService, userID, proxyType)
		if handlerErr != nil {
			common.SysError(fmt.Sprintf("[ProxyHandler] User-specific handler failed for %s (user %d), fallback to global: %v", serviceName, userID, handlerErr))
			// Clear handlerErr so global fallback logic doesn't use this error message if global succeeds
			handlerErr = nil
		}
	}

	if targetHandler == nil { // Fallback to Global Handler

		// Determine proxy type based on action (SSE vs Streamable endpoint routing)
		proxyType := "sseproxy" // default to SSE for /sse and /message endpoints
		if action == "/mcp" {
			proxyType = "httpproxy" // Streamable endpoint uses HTTP proxy
		}
		// Additional routing validation for better error messages
		if action != "/sse" && action != "/message" && action != "/mcp" &&
			!strings.HasPrefix(action, "/sse/") && !strings.HasPrefix(action, "/message/") && !strings.HasPrefix(action, "/mcp/") {
			common.SysLog(fmt.Sprintf("WARN: [ProxyHandler] Unrecognized action %s for %s, using SSE proxy", action, serviceName))
		}

		targetHandler, handlerErr = tryGetOrCreateGlobalHandler(c, mcpDBService, proxyType)
	}

	if targetHandler != nil {

		// Unified logic for determining if this request should be recorded for statistics
		shouldRecordStat := false
		requestTypeForStat := ""
		methodForStat := ""

		if requestMethod == http.MethodPost {
			if action == "/message" || action == "/mcp" {
				if c.Request.Body != nil {
					// Read the entire request body to inspect it.
					bodyBytes, err := io.ReadAll(c.Request.Body)
					if err != nil {
						// Log the error, as it's unexpected.
						common.SysError(fmt.Sprintf("[ProxyHandler] failed to read request body for stat check: %v", err))
					}

					// CRITICAL: Always restore the request body so that the downstream handler can read it.
					// We use the bytes we read, even if there was an error, to preserve as much of the body as possible.
					c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

					// If we successfully read the body, proceed to check if it's a "tools/call".
					if err == nil && len(bodyBytes) > 0 {
						var parsedBody map[string]interface{}
						// We don't care about unmarshalling errors, as the body might not be JSON.
						// The downstream handler is responsible for proper body parsing and error handling.
						if json.Unmarshal(bodyBytes, &parsedBody) == nil {
							if actualMethod, ok := parsedBody["method"].(string); ok && actualMethod == "tools/call" {
								shouldRecordStat = true
								methodForStat = "tools/call"
								// requestBodyForStat = string(bodyBytes)
								if action == "/message" {
									requestTypeForStat = "sse"
								} else { // action == "/mcp"
									requestTypeForStat = "http"
								}
							}
						}
					}
				}
			}
		}

		if shouldRecordStat {
			startTime := time.Now()

			// It's important to serve the request using the potentially restored body
			targetHandler.ServeHTTP(c.Writer, c.Request)

			duration := time.Since(startTime)
			statusCode := c.Writer.Status()
			success := statusCode >= 200 && statusCode < 300

			// Record the statistic to database and cache (including user-specific daily count)
			go model.RecordRequestStat(
				mcpDBService.ID,
				mcpDBService.Name, // Service Name
				userID,
				model.ProxyRequestType(requestTypeForStat),
				methodForStat,
				requestPath,
				duration.Milliseconds(),
				statusCode,
				success,
			)

		} else {
			// If not recording stats, just serve the request
			// If body was read for a non-stat HTTP/MCP call, it should have been restored already.
			targetHandler.ServeHTTP(c.Writer, c.Request)
		}

	} else {
		finalErrMsg := "critical: unable to obtain any valid handler for service " + serviceName
		if handlerErr != nil {
			finalErrMsg = fmt.Sprintf("Service handler unavailable for %s: %s", serviceName, handlerErr.Error())
		}
		common.SysError(fmt.Sprintf("[ProxyHandler] Error: %s", finalErrMsg))
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": finalErrMsg})
	}
}
