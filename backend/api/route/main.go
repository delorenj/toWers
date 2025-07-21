package route

import (
	"embed"
	"one-mcp/backend/api/middleware"
	"one-mcp/backend/common"

	"github.com/gin-gonic/gin"
)

func SetRouter(route *gin.Engine, buildFS embed.FS, indexPage []byte) {
	// Apply CORS middleware globally
	route.Use(middleware.CORS())

	// Conditionally apply gzip middleware based on configuration
	if common.GetEnableGzip() {
		// Apply gzip middleware to the entire application
		route.Use(middleware.GzipDecodeMiddleware()) // Decode gzipped requests
		route.Use(middleware.GzipEncodeMiddleware()) // Compress responses with gzip
	}

	SetApiRouter(route)
	setWebRouter(route, buildFS, indexPage)
}
