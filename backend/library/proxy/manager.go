package proxy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"toWers/backend/model"
)

var (
	// ErrServiceAlreadyExists indicates service already exists
	ErrServiceAlreadyExists = errors.New("service already exists")
	// ErrServiceNotFound indicates service not found
	ErrServiceNotFound = errors.New("service not found")
	// ErrServiceStartFailed indicates service start failed
	ErrServiceStartFailed = errors.New("service start failed")
	// ErrServiceStopFailed indicates service stop failed
	ErrServiceStopFailed = errors.New("service stop failed")
)

// ServiceManager manages all MCP service instances
type ServiceManager struct {
	services      map[int64]Service
	mutex         sync.RWMutex
	healthChecker *HealthChecker
	initialized   bool
}

// globalManager is the global service manager instance
var globalManager *ServiceManager
var managerOnce sync.Once

// GetServiceManager returns the global service manager instance
func GetServiceManager() *ServiceManager {
	managerOnce.Do(func() {
		globalManager = &ServiceManager{
			services:      make(map[int64]Service),
			healthChecker: NewHealthChecker(10 * time.Minute),
			initialized:   false,
		}
	})
	return globalManager
}

// Initialize initializes the service manager
func (m *ServiceManager) Initialize(ctx context.Context) error {
	if m.initialized {
		return nil
	}

	// Start health checker
	m.healthChecker.Start()

	// Start auto-restart daemon thread
	m.StartDaemon()

	// Load and register all enabled services
	services, err := model.GetEnabledServices()
	if err != nil {
		return fmt.Errorf("failed to load enabled services: %w", err)
	}

	for _, mcpService := range services {
		if err := m.RegisterService(ctx, mcpService); err != nil {
			log.Printf("Failed to register service %s (ID: %d): %v", mcpService.Name, mcpService.ID, err)
			// Continue registering other services
			continue
		}
	}

	m.initialized = true
	return nil
}

// Shutdown shuts down the service manager
func (m *ServiceManager) Shutdown(ctx context.Context) error {
	// Stop health checker
	m.healthChecker.Stop()

	// Stop all services
	m.mutex.Lock()
	defer m.mutex.Unlock()

	for _, service := range m.services {
		if service.IsRunning() {
			if err := service.Stop(ctx); err != nil {
				log.Printf("Error stopping service %s (ID: %d): %v", service.Name(), service.ID(), err)
				// Continue stopping other services
			}
		}
	}

	// Clear service list
	m.services = make(map[int64]Service)
	m.initialized = false

	return nil
}

// RegisterService registers a service to the manager
func (m *ServiceManager) RegisterService(ctx context.Context, mcpService *model.MCPService) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	// Check if service already exists
	if _, exists := m.services[mcpService.ID]; exists {
		return ErrServiceAlreadyExists
	}

	// Create service instance
	service, err := ServiceFactory(mcpService)
	if err != nil {
		return fmt.Errorf("failed to create service instance: %w", err)
	}

	// Register service
	m.services[mcpService.ID] = service

	// Register to health checker
	m.healthChecker.RegisterService(service)

	// If service is configured to be enabled by default, start it
	if mcpService.DefaultOn && mcpService.Enabled {
		if err := service.Start(ctx); err != nil {
			// Start failed, but keep registration
			log.Printf("Failed to start service %s (ID: %d): %v", mcpService.Name, mcpService.ID, err)
		}
	}

	return nil
}

// UnregisterService removes a service from the manager
func (m *ServiceManager) UnregisterService(ctx context.Context, serviceID int64) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	service, exists := m.services[serviceID]
	if !exists {
		return ErrServiceNotFound
	}

	// If service is running, stop it first
	if service.IsRunning() {
		if err := service.Stop(ctx); err != nil {
			return fmt.Errorf("failed to stop service: %w", err)
		}
	}

	// Remove from health checker
	m.healthChecker.UnregisterService(serviceID)

	// Remove from health status cache
	cacheManager := GetHealthCacheManager()
	cacheManager.DeleteServiceHealth(serviceID)

	// Remove from service list
	delete(m.services, serviceID)

	return nil
}

// GetService gets a service instance
func (m *ServiceManager) GetService(serviceID int64) (Service, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	service, exists := m.services[serviceID]
	if !exists {
		return nil, ErrServiceNotFound
	}

	return service, nil
}

// StartService starts a service
func (m *ServiceManager) StartService(ctx context.Context, serviceID int64) error {
	service, err := m.GetService(serviceID)
	if err != nil {
		return err
	}

	if service.IsRunning() {
		// Service is already running, no need to start again
		return nil
	}

	if err := service.Start(ctx); err != nil {
		return fmt.Errorf("failed to start service: %w", err)
	}

	return nil
}

// StopService stops a service
func (m *ServiceManager) StopService(ctx context.Context, serviceID int64) error {
	service, err := m.GetService(serviceID)
	if err != nil {
		return err
	}

	if !service.IsRunning() {
		// Service is already stopped, no need to stop again
		return nil
	}

	if err := service.Stop(ctx); err != nil {
		return fmt.Errorf("failed to stop service: %w", err)
	}

	return nil
}

// RestartService restarts a service
func (m *ServiceManager) RestartService(ctx context.Context, serviceID int64) error {
	service, err := m.GetService(serviceID)
	if err != nil {
		return err
	}

	// If service is running, stop it first
	if service.IsRunning() {
		if err := service.Stop(ctx); err != nil {
			return fmt.Errorf("failed to stop service during restart: %w", err)
		}
	}

	// Start service
	if err := service.Start(ctx); err != nil {
		return fmt.Errorf("failed to start service during restart: %w", err)
	}

	return nil
}

// GetServiceHealth gets service health status
func (m *ServiceManager) GetServiceHealth(serviceID int64) (*ServiceHealth, error) {
	return m.healthChecker.GetServiceHealth(serviceID)
}

// ForceCheckServiceHealth forces a health check for a service
func (m *ServiceManager) ForceCheckServiceHealth(serviceID int64) (*ServiceHealth, error) {
	return m.healthChecker.ForceCheckService(serviceID)
}

// UpdateServiceConfig updates service configuration
func (m *ServiceManager) UpdateServiceConfig(serviceID int64, config map[string]interface{}) error {
	service, err := m.GetService(serviceID)
	if err != nil {
		return err
	}

	return service.UpdateConfig(config)
}

// GetAllServices gets all services
func (m *ServiceManager) GetAllServices() []Service {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	services := make([]Service, 0, len(m.services))
	for _, service := range m.services {
		services = append(services, service)
	}

	return services
}

// GetServiceHealthJSON gets service health status as JSON string
func (m *ServiceManager) GetServiceHealthJSON(serviceID int64) (string, error) {
	health, err := m.GetServiceHealth(serviceID)
	if err != nil {
		return "", err
	}

	healthJSON, err := json.Marshal(health)
	if err != nil {
		return "", fmt.Errorf("failed to marshal health data: %w", err)
	}

	return string(healthJSON), nil
}

// UpdateMCPServiceHealth updates service health status in cache
func (m *ServiceManager) UpdateMCPServiceHealth(serviceID int64) error {
	health, err := m.GetServiceHealth(serviceID)
	if err != nil {
		return err
	}

	// Get global health status cache manager
	cacheManager := GetHealthCacheManager()

	// Store health status in cache
	cacheManager.SetServiceHealth(serviceID, health)

	return nil
}

// StartDaemon starts the daemon thread for auto-restarting stopped services
func (m *ServiceManager) StartDaemon() {
	go func() {
		ticker := time.NewTicker(600 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			m.mutex.RLock()
			services := make([]Service, 0, len(m.services))
			for _, service := range m.services {
				services = append(services, service)
			}
			m.mutex.RUnlock()

			for _, service := range services {
				// Check service status
				health, err := m.ForceCheckServiceHealth(service.ID())
				if err != nil {
					continue
				}

				// If service is stopped, try to restart
				if health.Status == StatusStopped {
					ctx := context.Background()
					if err := m.RestartService(ctx, service.ID()); err != nil {
						// Log error but continue processing other services
						log.Printf("Failed to auto-restart service %d: %v", service.ID(), err)
						continue
					}
					log.Printf("Auto-restarted stopped service: %s (ID: %d)", service.Name(), service.ID())
				}
			}
		}
	}()
}

// GetSSEServiceByName finds SSESvc instance by service name
func (m *ServiceManager) GetSSEServiceByName(serviceName string) (*SSESvc, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	for _, svc := range m.services {
		if svc.Name() == serviceName && svc.Type() == model.ServiceTypeSSE {
			if sseSvc, ok := svc.(*SSESvc); ok {
				return sseSvc, nil
			}
		}
	}
	return nil, ErrServiceNotFound
}

// SetService allows injecting mock Service (for testing only)
func (m *ServiceManager) SetService(serviceID int64, svc Service) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.services[serviceID] = svc
}
