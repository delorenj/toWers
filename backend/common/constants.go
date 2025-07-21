package common

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

var StartTime = time.Now().Unix() // unit: second
var Version = "v0.0.1"            // this hard coding will be replaced automatically when building, no need to manually change
var SystemName = "toWers"
var ServerAddress = "http://localhost:3000"
var Footer = ""
var HomePageLink = ""

// Any options with "Secret", "Token" in its key won't be return by GetOptions

var SessionSecret = uuid.New().String()
var SQLitePath = "data/toWers.db"

var OptionMap = make(map[string]string)

var OptionMapRWMutex sync.RWMutex

var ItemsPerPage = 10

var PasswordLoginEnabled = true
var PasswordRegisterEnabled = true
var RegisterEnabled = true
var SMTPPort = 587

// These variables are still used during initialization from environment variables
// They will be moved to OptionMap after initialization
var GoogleClientId = ""
var GoogleClientSecret = ""

// JWT constants
var JWTSecret = uuid.New().String()        // Secret for signing JWT tokens
var JWTRefreshSecret = uuid.New().String() // Secret for signing refresh tokens
var JWTExpiryHours = 24                    // Token expiry in hours
var JWTRefreshExpiryHours = 168            // Refresh token expiry in hours (7 days)

const (
	RoleGuestUser  = 0
	RoleCommonUser = 1
	RoleAdminUser  = 10
	RoleRootUser   = 100
)

var (
	FileUploadPermission    = RoleGuestUser
	FileDownloadPermission  = RoleGuestUser
	ImageUploadPermission   = RoleGuestUser
	ImageDownloadPermission = RoleGuestUser
)

// All duration's unit is seconds
// Shouldn't larger then RateLimitKeyExpirationDuration
var (
	GlobalApiRateLimitNum            = 60
	GlobalApiRateLimitDuration int64 = 3 * 60

	GlobalWebRateLimitNum            = 60
	GlobalWebRateLimitDuration int64 = 3 * 60

	UploadRateLimitNum            = 10
	UploadRateLimitDuration int64 = 60

	DownloadRateLimitNum            = 10
	DownloadRateLimitDuration int64 = 60

	CriticalRateLimitNum            = 20
	CriticalRateLimitDuration int64 = 20 * 60
)

var RateLimitKeyExpirationDuration = 20 * time.Minute

const (
	UserStatusEnabled  = 1 // don't use 0, 0 is the default value!
	UserStatusDisabled = 2 // also don't use 0
)
