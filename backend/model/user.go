package model

import (
	"errors" // Added for logging
	"one-mcp/backend/common"
	"strconv"
	"strings"

	"github.com/burugo/thing"
	"github.com/google/uuid"
)

// User represents the user model in the database.
// Adapted from one-mcp/backend and example. Removed Token field (using JWT).
// Sensitive fields like Password should not be included in API responses.
type User struct {
	thing.BaseModel
	Username         string `json:"username" db:"username"`
	Password         string `json:"-" db:"password"`
	DisplayName      string `json:"display_name" db:"display_name"`
	Role             int    `json:"role" db:"role"`
	Status           int    `json:"status" db:"status"`
	Email            string `json:"email" db:"email"`
	GitHubId         string `json:"github_id" db:"github_id"`
	GoogleId         string `json:"google_id" db:"google_id"`
	WeChatId         string `json:"wechat_id" db:"wechat_id"`
	VerificationCode string `json:"verification_code" db:"-"`
	Token            string `json:"token" db:"token"`

	// Fields from example, consider if needed later:
	// LarkId           string `json:"lark_id" gorm:"column:lark_id;index"`
	// OidcId           string `json:"oidc_id" gorm:"column:oidc_id;index"`
	// Quota            int64  `json:"quota" gorm:"bigint;default:0"`
	// UsedQuota        int64  `json:"used_quota" gorm:"bigint;default:0;column:used_quota"` // used quota
	// RequestCount     int    `json:"request_count" gorm:"type:int;default:0;"`             // request number
	// Group            string `json:"group" gorm:"type:varchar(32);default:'default'"`
	// AffCode          string `json:"aff_code" gorm:"type:varchar(32);column:aff_code;uniqueIndex"`
	// InviterId        int    `json:"inviter_id" gorm:"type:int;column:inviter_id;index"`
}

var UserDB *thing.Thing[*User]

// UserInit initializes UserDB during InitDB
func UserInit() error {
	var err error
	UserDB, err = thing.Use[*User]()
	if err != nil {
		return err
	}
	return nil
}

func GetMaxUserId() int64 {
	users, err := UserDB.Order("id DESC").Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return 0
	}
	return users[0].ID
}

func GetAllUsers(startIdx int, num int) ([]*User, error) {
	return UserDB.Order("id DESC").Fetch(startIdx, num)
}

func SearchUsers(keyword string) ([]*User, error) {
	// Try to convert keyword to number
	if id, err := strconv.ParseUint(keyword, 10, 64); err == nil {
		// keyword is a number, include ID search
		return UserDB.Where(
			"id = ? OR username LIKE ? OR email LIKE ? OR display_name LIKE ?",
			id, keyword+"%", keyword+"%", keyword+"%",
		).Order("id DESC").Fetch(0, 100)
	} else {
		// keyword is not a number, only search string fields
		return UserDB.Where(
			"username LIKE ? OR email LIKE ? OR display_name LIKE ?",
			keyword+"%", keyword+"%", keyword+"%",
		).Order("id DESC").Fetch(0, 100)
	}
}

// GetUserById gets user by ID
func GetUserById(id int64, selectAll bool) (*User, error) {
	if id == 0 {
		return nil, errors.New("empty_id")
	}
	user, err := UserDB.ByID(id)
	if err != nil {
		if errors.Is(err, ErrRecordNotFound) {
			return nil, errors.New("user_not_found")
		}
		return nil, err
	}
	return user, nil
}

// DeleteUserById soft deletes user by ID
func DeleteUserById(id int64) error {
	if id == 0 {
		return errors.New("empty_id")
	}
	user, err := UserDB.ByID(id)
	if err != nil {
		if errors.Is(err, ErrRecordNotFound) {
			return errors.New("user_not_found")
		}
		return err
	}
	return UserDB.SoftDelete(user)
}

func (user *User) Insert() error {
	if user.Password != "" {
		var err error
		user.Password, err = common.Password2Hash(user.Password)
		if err != nil {
			return err
		}
	}

	// Generate token if not already set
	if user.Token == "" {
		user.Token = GenerateUserToken()
	}

	return UserDB.Save(user)
}

// GenerateUserToken creates a new UUID token without dashes and ensures its uniqueness
func GenerateUserToken() string {
	for {
		token := uuid.New().String()
		token = strings.Replace(token, "-", "", -1)

		existingUsers, err := UserDB.Where("token = ?", token).Fetch(0, 1)
		if err != nil {
			// Log the error or handle it appropriately.
			// For now, we return a non-unique token in case of DB error to avoid infinite loop
			// or panic, but a more robust solution might involve retries or specific error handling.
			return "" // Or panic, or return an error. Returning empty for now.
		}
		if len(existingUsers) == 0 {
			return token // Token is unique
		}
		// Regenerate token if duplicate found
	}
}

func (user *User) Update(updatePassword bool) error {
	if updatePassword {
		var err error
		user.Password, err = common.Password2Hash(user.Password)
		if err != nil {
			return err
		}
	}
	return UserDB.Save(user)
}

func (user *User) Delete() error {
	if user.ID == 0 {
		return errors.New("empty_id")
	}
	return UserDB.SoftDelete(user)
}

func (user *User) ValidateAndFill() error {
	if user.Username == "" || user.Password == "" {
		return errors.New("empty_username_or_password")
	}
	users, err := UserDB.Where("username = ?", user.Username).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("invalid_username_or_password")
	}
	found := users[0]

	okay := common.ValidatePasswordAndHash(user.Password, found.Password)

	if !okay || found.Status != common.UserStatusEnabled {
		return errors.New("invalid_username_or_password")
	}
	*user = *found
	return nil
}

func (user *User) FillUserById() error {
	if user.ID == 0 {
		return errors.New("empty_id")
	}
	found, err := UserDB.ByID(user.ID)
	if err != nil {
		if errors.Is(err, ErrRecordNotFound) {
			return errors.New("user_not_found")
		}
		return err
	}
	*user = *found
	return nil
}

func (user *User) FillUserByEmail() error {
	if user.Email == "" {
		return errors.New("empty_email")
	}
	users, err := UserDB.Where("email = ?", user.Email).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("user_not_found")
	}
	*user = *users[0]
	return nil
}

func (user *User) FillUserByGitHubId() error {
	if user.GitHubId == "" {
		return errors.New("empty_github_id")
	}
	users, err := UserDB.Where("github_id = ?", user.GitHubId).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("user_not_found")
	}
	*user = *users[0]
	return nil
}

func (user *User) FillUserByGoogleId() error {
	if user.GoogleId == "" {
		return errors.New("empty_google_id")
	}
	users, err := UserDB.Where("google_id = ?", user.GoogleId).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("user_not_found")
	}
	*user = *users[0]
	return nil
}

func (user *User) FillUserByWeChatId() error {
	if user.WeChatId == "" {
		return errors.New("empty_wechat_id")
	}
	users, err := UserDB.Where("wechat_id = ?", user.WeChatId).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("user_not_found")
	}
	*user = *users[0]
	return nil
}

func (user *User) FillUserByUsername() error {
	if user.Username == "" {
		return errors.New("empty_username")
	}
	users, err := UserDB.Where("username = ?", user.Username).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("user_not_found")
	}
	*user = *users[0]
	return nil
}

func ValidateUserToken(token string) *User {
	// Stub implementation - always returns nil (invalid token) for now
	// This will be replaced with proper JWT validation later
	return nil
}

// ValidateUserTokenByTokenString validates a user token string and returns the user if valid
func ValidateUserTokenByTokenString(tokenString string) *User {
	if tokenString == "" {
		return nil
	}

	users, err := UserDB.Where("token = ?", tokenString).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return nil
	}

	user := users[0]
	if user.Status != common.UserStatusEnabled {
		return nil
	}

	return user
}

func IsEmailAlreadyTaken(email string) bool {
	users, err := UserDB.Where("email = ?", email).Fetch(0, 1)
	return err == nil && len(users) > 0
}

func IsWeChatIdAlreadyTaken(wechatId string) bool {
	users, err := UserDB.Where("wechat_id = ?", wechatId).Fetch(0, 1)
	return err == nil && len(users) > 0
}

func IsGitHubIdAlreadyTaken(githubId string) bool {
	users, err := UserDB.Where("github_id = ?", githubId).Fetch(0, 1)
	return err == nil && len(users) > 0
}

func IsGoogleIdAlreadyTaken(googleId string) bool {
	users, err := UserDB.Where("google_id = ?", googleId).Fetch(0, 1)
	return err == nil && len(users) > 0
}

func IsUsernameAlreadyTaken(username string) bool {
	users, err := UserDB.Where("username = ?", username).Fetch(0, 1)
	return err == nil && len(users) > 0
}

func ResetUserPasswordByEmail(email string, password string) error {
	if email == "" || password == "" {
		return errors.New("empty_email_or_password")
	}
	hashedPassword, err := common.Password2Hash(password)
	if err != nil {
		return err
	}
	users, err := UserDB.Where("email = ?", email).Fetch(0, 1)
	if err != nil || len(users) == 0 {
		return errors.New("user_not_found")
	}
	user := users[0]
	user.Password = hashedPassword
	return UserDB.Save(user)
}

// GetUserByUsernameForAdmin gets user by username (for admin operations, not restricted by status)
func GetUserByUsernameForAdmin(username string) (*User, error) {
	if username == "" {
		return nil, errors.New("empty_username")
	}
	users, err := UserDB.Where("username = ?", username).Fetch(0, 1)
	if err != nil {
		return nil, err
	}
	if len(users) == 0 {
		return nil, errors.New("user_not_found")
	}
	return users[0], nil
}
