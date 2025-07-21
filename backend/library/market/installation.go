package market

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"toWers/backend/model"
	"sync"
	"time"
)

// InstallationStatus represents installation status
type InstallationStatus string

const (
	// StatusPending indicates waiting for installation
	StatusPending InstallationStatus = "pending"
	// StatusInstalling indicates installation in progress
	StatusInstalling InstallationStatus = "installing"
	// StatusCompleted indicates installation completed
	StatusCompleted InstallationStatus = "completed"
	// StatusFailed indicates installation failed
	StatusFailed InstallationStatus = "failed"
)

// InstallationTask represents an installation task
type InstallationTask struct {
	ServiceID        int64                 // Service ID
	UserID           int64                 // User ID, for creating user-specific configuration later
	PackageName      string                // Package name
	PackageManager   string                // Package manager
	Version          string                // Version
	Command          string                // Command
	Args             []string              // Arguments list
	EnvVars          map[string]string     // Environment variables
	Status           InstallationStatus    // Status
	StartTime        time.Time             // Start time
	EndTime          time.Time             // End time
	Output           string                // Output information
	Error            string                // Error information
	CompletionNotify chan InstallationTask // Completion notification
}

// InstallationManager manages installation tasks
type InstallationManager struct {
	tasks      map[int64]*InstallationTask // ServiceID -> Task
	tasksMutex sync.RWMutex
}

// Global installation manager
var (
	globalInstallationManager      *InstallationManager
	installationManagerInitialized bool
	installationManagerMutex       sync.Mutex
)

// GetInstallationManager gets the global installation manager
func GetInstallationManager() *InstallationManager {
	installationManagerMutex.Lock()
	defer installationManagerMutex.Unlock()

	if !installationManagerInitialized {
		globalInstallationManager = &InstallationManager{
			tasks: make(map[int64]*InstallationTask),
		}
		installationManagerInitialized = true
	}

	return globalInstallationManager
}

// GetTaskStatus gets task status
func (m *InstallationManager) GetTaskStatus(serviceID int64) (*InstallationTask, bool) {
	m.tasksMutex.RLock()
	defer m.tasksMutex.RUnlock()

	task, exists := m.tasks[serviceID]
	return task, exists
}

// SubmitTask submits an installation task
func (m *InstallationManager) SubmitTask(task InstallationTask) {
	m.tasksMutex.Lock()
	defer m.tasksMutex.Unlock()

	// If task is already running, don't submit duplicate
	if existingTask, exists := m.tasks[task.ServiceID]; exists &&
		(existingTask.Status == StatusPending || existingTask.Status == StatusInstalling) {
		log.Printf("[SubmitTask] Task already exists for ServiceID=%d with status=%s, skipping duplicate submission",
			task.ServiceID, existingTask.Status)
		return
	}

	// Initialize task status
	task.Status = StatusPending
	task.StartTime = time.Now()
	task.CompletionNotify = make(chan InstallationTask, 1)

	// Save task
	m.tasks[task.ServiceID] = &task

	// Start background installation task
	go m.runInstallationTask(&task)
}

// runInstallationTask runs installation task
func (m *InstallationManager) runInstallationTask(task *InstallationTask) {
	// Update task status to installing
	m.tasksMutex.Lock()
	task.Status = StatusInstalling
	m.tasksMutex.Unlock()

	// Create context
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var err error
	var output string
	var serverInfo *MCPServerInfo

	switch task.PackageManager {
	case "npm":
		serverInfo, err = InstallNPMPackage(ctx, task.PackageName, task.Version, task.Command, task.Args, "", task.EnvVars)
		if err == nil && serverInfo != nil {
			output = fmt.Sprintf("NPM package %s initialized. Server: %s, Version: %s, Protocol: %s", task.PackageName, serverInfo.Name, serverInfo.Version, serverInfo.ProtocolVersion)
		} else if err == nil {
			output = fmt.Sprintf("NPM package %s installed, but no MCP server info obtained.", task.PackageName)
		} else {
			output = fmt.Sprintf("InstallNPMPackage error: %v", err)
		}
	case "pypi", "uv", "pip":
		serverInfo, err = InstallPyPIPackage(ctx, task.PackageName, task.Version, task.Command, task.Args, "", task.EnvVars)
		if err == nil && serverInfo != nil {
			output = fmt.Sprintf("PyPI package %s initialized. Server: %s, Version: %s, Protocol: %s", task.PackageName, serverInfo.Name, serverInfo.Version, serverInfo.ProtocolVersion)
		} else if err == nil {
			output = fmt.Sprintf("PyPI package %s installed, but no MCP server info obtained.", task.PackageName)
		} else {
			output = fmt.Sprintf("InstallPyPIPackage error: %v", err)
		}
	default:
		err = fmt.Errorf("unsupported package manager: %s", task.PackageManager)
		output = fmt.Sprintf("Unsupported package manager: %s", task.PackageManager)
	}

	// Update task status
	m.tasksMutex.Lock()
	task.EndTime = time.Now()
	task.Output = output

	if err != nil {
		task.Status = StatusFailed
		task.Error = err.Error()
		log.Printf("[InstallTask] Task failed: ServiceID=%d, Package=%s, Error=%v", task.ServiceID, task.PackageName, err)

		// New: Try to delete the pre-created service record due to this failed installation
		log.Printf("[InstallTask] Installation failed, attempting to delete pre-created service record: ServiceID=%d", task.ServiceID)
		if deleteErr := model.DeleteService(task.ServiceID); deleteErr != nil {
			log.Printf("[InstallTask] Failed to delete service record ServiceID=%d: %v. Original installation error: %v", task.ServiceID, deleteErr, err)
			// Note: Even if deletion fails, we should continue to report the original installation failure.
			// The deletion failure here is a secondary issue, the main issue is the installation failure.
		} else {
			log.Printf("[InstallTask] Successfully deleted service record created due to installation failure: ServiceID=%d", task.ServiceID)
		}
	} else {
		task.Status = StatusCompleted
		log.Printf("[InstallTask] Task completed: ServiceID=%d, Package=%s", task.ServiceID, task.PackageName)
		// Update service status in database
		go m.updateServiceStatus(task, serverInfo)
	}
	m.tasksMutex.Unlock()

	// Send completion notification
	task.CompletionNotify <- *task
}

// updateServiceStatus updates service status
func (m *InstallationManager) updateServiceStatus(task *InstallationTask, serverInfo *MCPServerInfo) {
	serviceToUpdate, err := model.GetServiceByID(task.ServiceID)
	if err != nil {
		log.Printf("[InstallationManager] Failed to get service (ID: %d) for status update: %v", task.ServiceID, err)
		return
	}

	// Apply installation-specific updates to serviceToUpdate
	if serviceToUpdate.Command == "" && serviceToUpdate.PackageManager != "" {
		log.Printf("[InstallationManager] Service %s (ID: %d) has empty Command, attempting to set based on PackageManager: %s", serviceToUpdate.Name, serviceToUpdate.ID, serviceToUpdate.PackageManager)
		switch serviceToUpdate.PackageManager {
		case "npm":
			serviceToUpdate.Command = "npx"
			if serviceToUpdate.ArgsJSON == "" {
				args := []string{"-y", serviceToUpdate.SourcePackageName}
				argsJSON, err := json.Marshal(args)
				if err != nil {
					log.Printf("[InstallationManager] Error marshaling args for npm package %s: %v", serviceToUpdate.SourcePackageName, err)
				} else {
					serviceToUpdate.ArgsJSON = string(argsJSON)
					log.Printf("[InstallationManager] Set ArgsJSON for service %s: %s", serviceToUpdate.Name, serviceToUpdate.ArgsJSON)
				}
			}
			log.Printf("[InstallationManager] Set Command for service %s: %s", serviceToUpdate.Name, serviceToUpdate.Command)
		case "pypi", "uv", "pip":
			serviceToUpdate.Command = "uvx"
			if serviceToUpdate.ArgsJSON == "" {
				args := []string{"--from", serviceToUpdate.SourcePackageName, serviceToUpdate.SourcePackageName}
				argsJSON, err := json.Marshal(args)
				if err != nil {
					log.Printf("[InstallationManager] Error marshaling args for python package %s: %v", serviceToUpdate.SourcePackageName, err)
				} else {
					serviceToUpdate.ArgsJSON = string(argsJSON)
					log.Printf("[InstallationManager] Set ArgsJSON for service %s: %s", serviceToUpdate.Name, serviceToUpdate.ArgsJSON)
				}
			}
			log.Printf("[InstallationManager] Set Command for service %s: %s", serviceToUpdate.Name, serviceToUpdate.Command)
		default:
			log.Printf("[InstallationManager] Warning: Unknown package manager %s for service %s, Command field will remain empty", serviceToUpdate.PackageManager, serviceToUpdate.Name)
		}
	}

	serviceToUpdate.Enabled = true
	serviceToUpdate.HealthStatus = "healthy"

	if task.Version != "" {
		serviceToUpdate.InstalledVersion = task.Version
	}

	if serverInfo != nil {
		healthDetails := map[string]interface{}{
			"mcpServer": serverInfo,
			"lastCheck": time.Now().Format(time.RFC3339),
			"status":    "healthy",
			"message":   fmt.Sprintf("Package %s (v%s) initialized. Server: %s, Protocol: %s", task.PackageName, task.Version, serverInfo.Name, serverInfo.ProtocolVersion),
		}

		healthDetailsJSON, err := json.Marshal(healthDetails)
		if err != nil {
			log.Printf("[InstallationManager] Failed to marshal health details for service ID %d: %v", task.ServiceID, err)
		} else {
			serviceToUpdate.HealthDetails = string(healthDetailsJSON)
		}

		serviceToUpdate.LastHealthCheck = time.Now()
	} else {
		healthDetails := map[string]interface{}{
			"lastCheck": time.Now().Format(time.RFC3339),
			"status":    "healthy",
			"message":   fmt.Sprintf("Package %s (v%s) installed successfully. No MCP server info obtained.", task.PackageName, task.Version),
		}

		healthDetailsJSON, err := json.Marshal(healthDetails)
		if err != nil {
			log.Printf("[InstallationManager] Failed to marshal basic health details for service ID %d: %v", task.ServiceID, err)
		} else {
			serviceToUpdate.HealthDetails = string(healthDetailsJSON)
		}

		serviceToUpdate.LastHealthCheck = time.Now()
	}

	// Re-check service status before final DB update and client initialization
	currentDBService, queryErr := model.GetServiceByID(task.ServiceID)
	if queryErr == nil && (currentDBService.Deleted || !currentDBService.Enabled) {
		log.Printf("[InstallationManager] Service ID %d (Name: %s) has been uninstalled or disabled. Skipping final DB update and client initialization for completed installation task.", task.ServiceID, currentDBService.Name)
		return // Do not proceed if service has been deleted or disabled
	}
	if queryErr != nil {
		log.Printf("[InstallationManager] Failed to re-query service (ID: %d) before final update: %v. Proceeding with caution.", task.ServiceID, queryErr)
		// Decide if to proceed or return. For now, let's log and proceed if re-query fails, as primary fetch was successful.
		// However, if the original serviceToUpdate was already established, this path might be less critical unless an error here implies DB connectivity issues.
	}

	if err := model.UpdateService(serviceToUpdate); err != nil {
		log.Printf("[InstallationManager] Failed to update MCPService status in DB (ID: %d): %v", task.ServiceID, err)
		// Continue to attempt UserConfig saving if applicable, as DB update failure might be transient
	}

	// Ensure DefaultEnvsJSON is properly set after installation (fallback logic)
	if len(task.EnvVars) > 0 && serviceToUpdate.DefaultEnvsJSON == "" {
		defaultEnvsJSON, err := json.Marshal(task.EnvVars)
		if err != nil {
			log.Printf("[InstallationManager] Error marshaling default envs for service %s: %v", serviceToUpdate.Name, err)
		} else {
			serviceToUpdate.DefaultEnvsJSON = string(defaultEnvsJSON)
			log.Printf("[InstallationManager] Set DefaultEnvsJSON for service %s: %s", serviceToUpdate.Name, serviceToUpdate.DefaultEnvsJSON)
		}
	}

	// Note: No longer save UserConfig during installation, as installation env vars are service default config
	// UserConfig is only saved when user needs personal configuration

	// Service registration and client initialization are now handled by proxy.ServiceManager
	// Will be automatically registered to ServiceManager when service is enabled
	log.Printf("[InstallationManager] Service %s (ID: %d) will be managed by ServiceManager when enabled", serviceToUpdate.Name, serviceToUpdate.ID)

	log.Printf("[InstallationManager] Service processing completed for ID: %d, Name: %s", serviceToUpdate.ID, serviceToUpdate.Name)
}

// CleanupTask cleans up task
func (m *InstallationManager) CleanupTask(serviceID int64) {
	m.tasksMutex.Lock()
	defer m.tasksMutex.Unlock()

	delete(m.tasks, serviceID)
}

// GetAllTasks gets all tasks
func (m *InstallationManager) GetAllTasks() []InstallationTask {
	m.tasksMutex.RLock()
	defer m.tasksMutex.RUnlock()

	tasks := make([]InstallationTask, 0, len(m.tasks))
	for _, task := range m.tasks {
		tasks = append(tasks, *task)
	}

	return tasks
}
