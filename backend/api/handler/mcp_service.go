package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"one-mcp/backend/common"
	"one-mcp/backend/common/i18n"
	"one-mcp/backend/library/proxy"
	"one-mcp/backend/model"
	"strconv"

	"github.com/gin-gonic/gin"
)

// UpdateMCPService godoc
// @Summary 更新MCP服务
// @Description 更新现有的MCP服务，支持修改环境变量定义和包管理器信息
// @Tags MCP Services
// @Accept json
// @Produce json
// @Param id path int true "服务ID"
// @Param service body object true "服务信息"
// @Security ApiKeyAuth
// @Success 200 {object} object
// @Failure 400 {object} common.APIResponse
// @Failure 404 {object} common.APIResponse
// @Failure 500 {object} common.APIResponse
// @Router /api/mcp_services/{id} [put]
func UpdateMCPService(c *gin.Context) {
	lang := c.GetString("lang")
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.RespError(c, http.StatusBadRequest, i18n.Translate("invalid_service_id", lang), err)
		return
	}

	service, err := model.GetServiceByID(id)
	if err != nil {
		common.RespError(c, http.StatusNotFound, i18n.Translate("service_not_found", lang), err)
		return
	}

	// 保存原始值用于比较
	oldPackageManager := service.PackageManager
	oldSourcePackageName := service.SourcePackageName
	// Preserve original Command and ArgsJSON before binding, so we can see if user explicitly changed them
	// or if our PackageManager logic should take precedence if they become empty after binding.
	// However, the current logic is that PackageManager dictates Command/ArgsJSON if they are empty.

	if err := c.ShouldBindJSON(service); err != nil {
		common.RespError(c, http.StatusBadRequest, i18n.Translate("invalid_request_data", lang), err)
		return
	}

	// 基本验证
	if service.Name == "" || service.DisplayName == "" {
		common.RespErrorStr(c, http.StatusBadRequest, i18n.Translate("name_and_display_name_required", lang))
		return
	}

	// 验证服务类型
	if !isValidServiceType(service.Type) {
		common.RespErrorStr(c, http.StatusBadRequest, i18n.Translate("invalid_service_type", lang))
		return
	}

	// 验证RequiredEnvVarsJSON (如果提供)
	if service.RequiredEnvVarsJSON != "" {
		if err := validateRequiredEnvVarsJSON(service.RequiredEnvVarsJSON); err != nil {
			common.RespError(c, http.StatusBadRequest, i18n.Translate("invalid_env_vars_json", lang), err)
			return
		}
	}

	// 如果是marketplace服务（stdio类型且PackageManager不为空），验证相关字段
	if service.Type == model.ServiceTypeStdio && service.PackageManager != "" {
		if service.SourcePackageName == "" {
			common.RespErrorStr(c, http.StatusBadRequest, i18n.Translate("source_package_name_required", lang))
			return
		}

		// 检查是否修改了关键包信息，可能需要重新安装
		if oldPackageManager != service.PackageManager || oldSourcePackageName != service.SourcePackageName {
			// 这里可以添加处理逻辑或警告...
			// If PackageManager or SourcePackageName changes, ArgsJSON might need to be re-evaluated
			// or cleared if it was auto-generated. For now, we rely on the logic below to set it.
		}
	}

	// Set Command and potentially ArgsJSON based on PackageManager
	// This logic applies on update as well, ensuring Command/ArgsJSON are consistent with PackageManager
	if service.PackageManager == "npm" {
		service.Command = "npx"
		if service.ArgsJSON == "" && service.SourcePackageName != "" {
			service.ArgsJSON = fmt.Sprintf(`["-y", "%s"]`, service.SourcePackageName)
		}
	} else if service.PackageManager == "pypi" {
		service.Command = "uvx"
		if service.ArgsJSON == "" && service.SourcePackageName != "" {
			service.ArgsJSON = fmt.Sprintf(`["-y", "%s"]`, service.SourcePackageName)
		}
	} // Add else if for other package managers or if service.PackageManager == "" to potentially clear Command/ArgsJSON if they were auto-set.
	// For now, if PackageManager is not npm or pypi, Command and ArgsJSON remain as bound from request.

	if err := model.UpdateService(service); err != nil {
		common.RespError(c, http.StatusInternalServerError, i18n.Translate("update_service_failed", lang), err)
		return
	}

	jsonBytes, err := model.MCPServiceDB.ToJSON(service)
	if err != nil {
		common.RespError(c, http.StatusInternalServerError, i18n.Translate("serialize_service_failed", lang), err)
		return
	}
	c.Data(http.StatusOK, "application/json", jsonBytes)
}

// ToggleMCPService godoc
// @Summary 切换MCP服务启用状态
// @Description 切换MCP服务的启用/禁用状态
// @Tags MCP Services
// @Accept json
// @Produce json
// @Param id path int true "服务ID"
// @Security ApiKeyAuth
// @Success 200 {object} common.APIResponse
// @Failure 400 {object} common.APIResponse
// @Failure 404 {object} common.APIResponse
// @Failure 500 {object} common.APIResponse
// @Router /api/mcp_services/{id}/toggle [post]
func ToggleMCPService(c *gin.Context) {
	lang := c.GetString("lang")
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.RespError(c, http.StatusBadRequest, i18n.Translate("invalid_service_id", lang), err)
		return
	}

	// 尝试获取服务，确认它存在
	service, err := model.GetServiceByID(id)
	if err != nil {
		common.RespError(c, http.StatusNotFound, i18n.Translate("service_not_found", lang), err)
		return
	}

	// 切换启用状态
	if err := model.ToggleServiceEnabled(id); err != nil {
		common.RespError(c, http.StatusInternalServerError, i18n.Translate("toggle_service_status_failed", lang), err)
		return
	}

	status := i18n.Translate("enabled", lang)
	if !service.Enabled {
		status = i18n.Translate("disabled", lang)
	}

	common.RespSuccessStr(c, i18n.Translate("service_toggle_success", lang)+status)
}

// CheckMCPServiceHealth godoc
// @Summary 检查MCP服务的健康状态
// @Description 强制检查指定MCP服务的健康状态，并返回最新结果
// @Tags MCP Services
// @Accept json
// @Produce json
// @Param id path int true "服务ID"
// @Security ApiKeyAuth
// @Success 200 {object} common.APIResponse
// @Failure 400 {object} common.APIResponse
// @Failure 404 {object} common.APIResponse
// @Failure 500 {object} common.APIResponse
// @Router /api/mcp_services/{id}/health/check [post]
func CheckMCPServiceHealth(c *gin.Context) {
	lang := c.GetString("lang")
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.RespError(c, http.StatusBadRequest, i18n.Translate("invalid_service_id", lang), err)
		return
	}

	// 获取服务信息
	service, err := model.GetServiceByID(id)
	if err != nil {
		common.RespError(c, http.StatusNotFound, i18n.Translate("service_not_found", lang), err)
		return
	}

	// 获取服务管理器
	serviceManager := proxy.GetServiceManager()

	// 检查服务是否已经注册
	_, err = serviceManager.GetService(id)
	if err == proxy.ErrServiceNotFound {
		// 服务尚未注册，尝试注册
		ctx := c.Request.Context()
		if err := serviceManager.RegisterService(ctx, service); err != nil {
			common.RespError(c, http.StatusInternalServerError, i18n.Translate("register_service_failed", lang), err)
			return
		}
	}

	// 强制检查健康状态
	health, err := serviceManager.ForceCheckServiceHealth(id)
	if err != nil {
		common.RespError(c, http.StatusInternalServerError, i18n.Translate("check_service_health_failed", lang), err)
		return
	}

	// 更新数据库中的健康状态
	if err := serviceManager.UpdateMCPServiceHealth(id); err != nil {
		common.RespError(c, http.StatusInternalServerError, i18n.Translate("update_service_health_failed", lang), err)
		return
	}

	// 构建响应
	healthData := map[string]interface{}{
		"service_id":     service.ID,
		"service_name":   service.Name,
		"health_status":  string(health.Status),
		"last_checked":   health.LastChecked,
		"health_details": health,
	}

	common.RespSuccess(c, healthData)
}

// 辅助函数：验证服务类型
func isValidServiceType(sType model.ServiceType) bool {
	return sType == model.ServiceTypeStdio ||
		sType == model.ServiceTypeSSE ||
		sType == model.ServiceTypeStreamableHTTP
}

// 辅助函数：验证RequiredEnvVarsJSON格式
func validateRequiredEnvVarsJSON(envVarsJSON string) error {
	if envVarsJSON == "" {
		return nil
	}

	var envVars []model.EnvVarDefinition
	if err := json.Unmarshal([]byte(envVarsJSON), &envVars); err != nil {
		return err
	}

	// 验证每个环境变量是否有name字段
	for _, envVar := range envVars {
		if envVar.Name == "" {
			return errors.New("missing name field in env var definition")
		}
	}

	return nil
}
