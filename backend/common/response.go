package common

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// APIResponse standard format for API responses
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Time format constants
const (
	RFC3339MilliZ = "2006-01-02T15:04:05.000Z07:00"
)

// RespSuccess responds with success and returns data
func RespSuccess(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Message: "",
		Data:    data,
	})
}

// RespSuccessStr responds with success and returns message
func RespSuccessStr(c *gin.Context, msg string) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Message: msg,
	})
}

// RespError responds with error including error information
func RespError(c *gin.Context, statusCode int, msg string, err error) {
	errMsg := msg
	if err != nil {
		errMsg = msg + ": " + err.Error()
	}

	c.JSON(statusCode, APIResponse{
		Success: false,
		Message: errMsg,
	})
}

// RespErrorStr responds with error containing only error message
func RespErrorStr(c *gin.Context, statusCode int, msg string) {
	c.JSON(statusCode, APIResponse{
		Success: false,
		Message: msg,
	})
}

// FormatTime formats time to RFC3339MilliZ format
func FormatTime(t time.Time) string {
	return t.Format(RFC3339MilliZ)
}
