package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/burugo/thing"
)

// HealthCacheManager manages health status cache based on Thing ORM cache
type HealthCacheManager struct {
	cacheClient thing.CacheClient
	expireTime  time.Duration
	mutex       sync.RWMutex // For protecting concurrent access
}

// NewHealthCacheManager creates a new health status cache manager
func NewHealthCacheManager(expireTime time.Duration) *HealthCacheManager {
	if expireTime <= 0 {
		expireTime = 1 * time.Hour // Default 1 hour expiration
	}

	return &HealthCacheManager{
		cacheClient: thing.Cache(), // Uses Thing ORM v0.1.17 global cache
		expireTime:  expireTime,
	}
}

// generateCacheKey generates cache key for service health status
func (hcm *HealthCacheManager) generateCacheKey(serviceID int64) string {
	return fmt.Sprintf("health:service:%d", serviceID)
}

// SetServiceHealth sets service health status to cache
func (hcm *HealthCacheManager) SetServiceHealth(serviceID int64, health *ServiceHealth) {
	if health == nil {
		return
	}

	hcm.mutex.Lock()
	defer hcm.mutex.Unlock()

	ctx := context.Background()
	cacheKey := hcm.generateCacheKey(serviceID)

	// Create a copy of health status to avoid concurrent modifications
	healthCopy := *health

	// Serialize ServiceHealth to JSON for cache storage
	healthJSON, err := json.Marshal(&healthCopy)
	if err != nil {
		log.Printf("Error marshaling health status for service %d: %v", serviceID, err)
		return
	}

	// Use Thing ORM cache to set value
	err = hcm.cacheClient.Set(ctx, cacheKey, string(healthJSON), hcm.expireTime)
	if err != nil {
		log.Printf("Error setting health status cache for service %d: %v", serviceID, err)
		return
	}

	log.Printf("Successfully cached health status for service %d (key: %s)", serviceID, cacheKey)
}

// GetServiceHealth retrieves service health status from cache
func (hcm *HealthCacheManager) GetServiceHealth(serviceID int64) (*ServiceHealth, bool) {
	hcm.mutex.RLock()
	defer hcm.mutex.RUnlock()

	ctx := context.Background()
	cacheKey := hcm.generateCacheKey(serviceID)

	// Get value from Thing ORM cache
	healthJSON, err := hcm.cacheClient.Get(ctx, cacheKey)
	if err != nil {
		// Not found in cache or other error
		return nil, false
	}

	// Deserialize JSON to ServiceHealth struct
	var health ServiceHealth
	err = json.Unmarshal([]byte(healthJSON), &health)
	if err != nil {
		log.Printf("Error unmarshaling health status for service %d: %v", serviceID, err)
		// If deserialization fails, delete invalid cache entry
		go hcm.DeleteServiceHealth(serviceID)
		return nil, false
	}

	// Return a copy of health status
	return &health, true
}

// DeleteServiceHealth deletes service health status from cache
func (hcm *HealthCacheManager) DeleteServiceHealth(serviceID int64) {
	hcm.mutex.Lock()
	defer hcm.mutex.Unlock()

	ctx := context.Background()
	cacheKey := hcm.generateCacheKey(serviceID)

	err := hcm.cacheClient.Delete(ctx, cacheKey)
	if err != nil {
		log.Printf("Error deleting health status cache for service %d: %v", serviceID, err)
	} else {
		log.Printf("Successfully deleted health status cache for service %d (key: %s)", serviceID, cacheKey)
	}
}

// CleanExpiredEntries is kept for compatibility but does nothing since Thing ORM cache handles expiration automatically
func (hcm *HealthCacheManager) CleanExpiredEntries() {
	// Thing ORM cache handles expiration automatically
	// This method is kept to maintain interface compatibility
	log.Printf("CleanExpiredEntries called - Thing ORM cache handles expiration automatically")
}

// GetCacheStats retrieves cache statistics
func (hcm *HealthCacheManager) GetCacheStats() map[string]interface{} {
	ctx := context.Background()

	// Get Thing ORM cache statistics
	var thingCacheStats map[string]interface{}
	if hcm.cacheClient != nil {
		stats := hcm.cacheClient.GetCacheStats(ctx)
		thingCacheStats = map[string]interface{}{
			"thing_cache_counters": stats.Counters,
		}
	}

	// Combine our own statistics
	combinedStats := map[string]interface{}{
		"expire_time":      hcm.expireTime.String(),
		"cache_type":       "thing_orm_cache",
		"thing_cache_info": thingCacheStats,
	}

	return combinedStats
}

// Shutdown shuts down the cache manager
func (hcm *HealthCacheManager) Shutdown() {
	// Thing ORM cache is global and doesn't need explicit closing
	// This method is kept to maintain interface compatibility
	log.Printf("HealthCacheManager shutdown called - Thing ORM cache is global and managed separately")
}

// Global health status cache manager instance
var globalHealthCacheManager *HealthCacheManager
var healthCacheOnce sync.Once

// GetHealthCacheManager gets the global health status cache manager instance
func GetHealthCacheManager() *HealthCacheManager {
	healthCacheOnce.Do(func() {
		globalHealthCacheManager = NewHealthCacheManager(1 * time.Hour) // Ensure 1 hour is used here too
	})
	return globalHealthCacheManager
}
