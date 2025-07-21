package i18n

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Default language
const (
	DefaultLang = "en"
)

// Language resource mapping
var (
	messages     = make(map[string]map[string]string)
	messagesLock sync.RWMutex
)

// Init initializes i18n, loads all language resources
func Init(localesDir string) error {
	// Ensure directory exists
	if _, err := os.Stat(localesDir); os.IsNotExist(err) {
		return fmt.Errorf("locales directory not found: %s", localesDir)
	}

	// Read all language files
	files, err := os.ReadDir(localesDir)
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.IsDir() || filepath.Ext(file.Name()) != ".json" {
			continue
		}

		// Extract language code (filename without extension)
		lang := file.Name()[:len(file.Name())-5]

		// Read language file
		data, err := os.ReadFile(filepath.Join(localesDir, file.Name()))
		if err != nil {
			return err
		}

		// Parse JSON
		var langMessages map[string]string
		if err := json.Unmarshal(data, &langMessages); err != nil {
			return err
		}

		// Add to message mapping
		messagesLock.Lock()
		messages[lang] = langMessages
		messagesLock.Unlock()
	}

	return nil
}

// getMessageTemplate gets message template
func getMessageTemplate(code string, lang string) string {
	messagesLock.RLock()
	defer messagesLock.RUnlock()

	// Check if language exists
	langMessages, ok := messages[lang]
	if !ok {
		// Fall back to default language
		langMessages = messages[DefaultLang]
		// If default language doesn't exist either, return error code directly
		if langMessages == nil {
			return code
		}
	}

	// Check if message exists
	message, ok := langMessages[code]
	if !ok {
		// If message not found, try using default language
		if lang != DefaultLang && messages[DefaultLang] != nil {
			if defaultMsg, ok := messages[DefaultLang][code]; ok {
				return defaultMsg
			}
		}
		// Finally fall back to error code itself
		return code
	}

	return message
}

// Translate translates error code to message
func Translate(code string, lang string, args ...interface{}) string {
	template := getMessageTemplate(code, lang)

	// If there are parameters, format the message
	if len(args) > 0 {
		return fmt.Sprintf(template, args...)
	}

	return template
}
