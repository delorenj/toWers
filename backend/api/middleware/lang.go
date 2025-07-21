package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// LangMiddleware injects lang into context
func LangMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		lang := c.GetHeader("Accept-Language")
		if lang == "" {
			lang = "en" // default English
		} else {
			// Only take the first language
			lang = strings.Split(lang, ",")[0]
		}
		// Set to gin.Context so c.GetString("lang") can retrieve it
		c.Set("lang", lang)
		c.Next()
	}
}
