package common

// GetGitHubClientId gets GitHub client ID
func GetGitHubClientId() string {
	return OptionMap["GitHubClientId"]
}

// GetGitHubClientSecret gets GitHub client secret
func GetGitHubClientSecret() string {
	return OptionMap["GitHubClientSecret"]
}

// GetGitHubOAuthEnabled gets whether GitHub OAuth is enabled
func GetGitHubOAuthEnabled() bool {
	return OptionMap["GitHubOAuthEnabled"] == "true"
}

// GetGoogleClientId gets Google client ID
func GetGoogleClientId() string {
	return OptionMap["GoogleClientId"]
}

// GetGoogleClientSecret gets Google client secret
func GetGoogleClientSecret() string {
	return OptionMap["GoogleClientSecret"]
}

// GetGoogleOAuthEnabled gets whether Google OAuth is enabled
func GetGoogleOAuthEnabled() bool {
	return OptionMap["GoogleOAuthEnabled"] == "true"
}

// GetServerAddress gets server address
func GetServerAddress() string {
	return OptionMap["ServerAddress"]
}

// GetSystemName gets system name
func GetSystemName() string {
	return OptionMap["SystemName"]
}

// GetFooter gets footer information
func GetFooter() string {
	return OptionMap["Footer"]
}

// GetHomePageLink gets homepage link
func GetHomePageLink() string {
	return OptionMap["HomePageLink"]
}

// GetRegisterEnabled gets whether registration is enabled
func GetRegisterEnabled() bool {
	return OptionMap["RegisterEnabled"] == "true"
}

// GetEmailVerificationEnabled gets whether email verification is enabled
func GetEmailVerificationEnabled() bool {
	return OptionMap["EmailVerificationEnabled"] == "true"
}

// GetWeChatAuthEnabled gets whether WeChat authentication is enabled
func GetWeChatAuthEnabled() bool {
	return OptionMap["WeChatAuthEnabled"] == "true"
}

// GetWeChatServerAddress gets WeChat server address
func GetWeChatServerAddress() string {
	return OptionMap["WeChatServerAddress"]
}

// GetWeChatServerToken gets WeChat server token
func GetWeChatServerToken() string {
	return OptionMap["WeChatServerToken"]
}

// GetWeChatAccountQRCodeImageURL gets WeChat account QR code image URL
func GetWeChatAccountQRCodeImageURL() string {
	return OptionMap["WeChatAccountQRCodeImageURL"]
}

// GetTurnstileCheckEnabled gets whether Turnstile check is enabled
func GetTurnstileCheckEnabled() bool {
	return OptionMap["TurnstileCheckEnabled"] == "true"
}

// GetTurnstileSiteKey gets Turnstile site key
func GetTurnstileSiteKey() string {
	return OptionMap["TurnstileSiteKey"]
}

// GetTurnstileSecretKey gets Turnstile secret key
func GetTurnstileSecretKey() string {
	return OptionMap["TurnstileSecretKey"]
}

// GetSMTPServer gets SMTP server
func GetSMTPServer() string {
	return OptionMap["SMTPServer"]
}

// GetSMTPAccount gets SMTP account
func GetSMTPAccount() string {
	return OptionMap["SMTPAccount"]
}

// GetSMTPToken gets SMTP token
func GetSMTPToken() string {
	return OptionMap["SMTPToken"]
}

// GetEnableGzip checks if gzip compression should be enabled.
// Defaults to true if the option is not explicitly set to "false".
func GetEnableGzip() bool {
	// We treat any value other than "false" as true for safety.
	return OptionMap["EnableGzip"] != "false"
}
