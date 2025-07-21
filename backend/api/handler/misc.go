package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"toWers/backend/common"
	"toWers/backend/model"

	"github.com/gin-gonic/gin"
)

func GetStatus(c *gin.Context) {
	// Get current language from context (set by LangMiddleware)
	lang := c.GetString("lang")
	if lang == "" {
		lang = "en" // Default language
	}

	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"github_oauth":     common.GetGitHubOAuthEnabled(),
			"github_client_id": common.GetGitHubClientId(),
			"google_oauth":     common.GetGoogleOAuthEnabled(),
			"google_client_id": common.GetGoogleClientId(),
		},
	})
	return
}

func GetNotice(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.OptionMap["Notice"],
	})
	return
}

func GetAbout(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.OptionMap["About"],
	})
	return
}

func SendEmailVerification(c *gin.Context) {
	email := c.Query("email")
	if err := common.Validate.Var(email, "required,email"); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Thanks",
		})
		return
	}
	if model.IsEmailAlreadyTaken(email) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Email address is already taken",
		})
		return
	}
	code := common.GenerateVerificationCode(6)
	common.RegisterVerificationCodeWithKey(email, code, common.EmailVerificationPurpose)
	subject := fmt.Sprintf("%s Email Verification", common.GetSystemName())
	content := fmt.Sprintf("<p>Hello, you are verifying your email for %s.</p>"+
		"<p>Your verification code is: <strong>%s</strong></p>"+
		"<p>The code is valid for %d minutes. If this wasn't you, please ignore this email.</p>", common.GetSystemName(), code, common.VerificationValidMinutes)
	err := common.SendEmail(subject, email, content)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func SendPasswordResetEmail(c *gin.Context) {
	email := c.Query("email")
	if err := common.Validate.Var(email, "required,email"); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Ooops.",
		})
		return
	}
	if !model.IsEmailAlreadyTaken(email) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "This email address is not registered",
		})
		return
	}
	code := common.GenerateVerificationCode(0)
	common.RegisterVerificationCodeWithKey(email, code, common.PasswordResetPurpose)
	link := fmt.Sprintf("%s/user/reset?email=%s&token=%s", common.GetServerAddress(), email, code)
	subject := fmt.Sprintf("%s Password Reset", common.GetSystemName())
	content := fmt.Sprintf("<p>Hello, you are resetting your password for %s.</p>"+
		"<p>Click <a href='%s'>here</a> to reset your password.</p>"+
		"<p>The reset link is valid for %d minutes. If this wasn't you, please ignore this email.</p>", common.GetSystemName(), link, common.VerificationValidMinutes)
	err := common.SendEmail(subject, email, content)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

type PasswordResetRequest struct {
	Email string `json:"email"`
	Token string `json:"token"`
}

func ResetPassword(c *gin.Context) {
	var req PasswordResetRequest
	err := json.NewDecoder(c.Request.Body).Decode(&req)
	if req.Email == "" || req.Token == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Nope.",
		})
		return
	}
	if !common.VerifyCodeWithKey(req.Email, req.Token, common.PasswordResetPurpose) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Reset link is invalid or has expired",
		})
		return
	}
	password := common.GenerateVerificationCode(12)
	err = model.ResetUserPasswordByEmail(req.Email, password)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	common.DeleteKey(req.Email, common.PasswordResetPurpose)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    password,
	})
}
