// loadingManager.js
// Intelligent loading system with proper hierarchy and status indicators

import { gameState } from './state.js?cb=014';

/**
 * Loading Manager for Adventure Stories
 * Manages loading states, dependencies, and visual indicators
 */
export class LoadingManager {
    constructor() {
        this.loadingStates = new Map();
        this.dependencies = new Map();
        this.loadingQueue = [];
        this.activeLoads = new Set();
        this.maxConcurrentLoads = 3;
        this.loadingElement = null;
        this.statusElement = null;
        
        this.initializeUI();
    }

    /**
     * Initialize loading UI elements
     */
    initializeUI() {
        // Create loading overlay if it doesn't exist
        if (!document.getElementById('loadingOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay hidden';
            overlay.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-title">Adventure Stories</div>
                    <div class="loading-status" id="loadingStatus">Initializing...</div>
                    <div class="loading-progress">
                        <div class="loading-progress-bar" id="loadingProgressBar"></div>
                    </div>
                    <div class="loading-details" id="loadingDetails"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        this.loadingElement = document.getElementById('loadingOverlay');
        this.statusElement = document.getElementById('loadingStatus');
        this.progressBar = document.getElementById('loadingProgressBar');
        this.detailsElement = document.getElementById('loadingDetails');
    }

    /**
     * Show loading screen with status
     */
    showLoading(message = 'Loading...') {
        if (this.loadingElement) {
            this.loadingElement.classList.remove('hidden');
            this.updateStatus(message);
        }
    }

    /**
     * Hide loading screen
     */
    hideLoading() {
        if (this.loadingElement) {
            this.loadingElement.classList.add('hidden');
        }
    }

    /**
     * Update loading status message
     */
    updateStatus(message, details = '') {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
        if (this.detailsElement && details) {
            this.detailsElement.textContent = details;
        }
        
        const log = window.displayVisualError || console.log;
        log(`Loading: ${message}${details ? ' - ' + details : ''}`);
    }

    /**
     * Update progress bar
     */
    updateProgress(percentage) {
        if (this.progressBar) {
            this.progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        }
    }

    /**
     * Register a loading task with dependencies
     */
    registerTask(taskId, taskName, dependencies = [], priority = 0) {
        this.loadingStates.set(taskId, {
            id: taskId,
            name: taskName,
            status: 'pending',
            dependencies: dependencies,
            priority: priority,
            startTime: null,
            endTime: null,
            error: null
        });
        
        this.dependencies.set(taskId, dependencies);
        return taskId;
    }

    /**
     * Start a loading task
     */
    async startTask(taskId, taskFunction) {
        const task = this.loadingStates.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not registered`);
        }

        // Check dependencies
        const unmetDependencies = this.getUnmetDependencies(taskId);
        if (unmetDependencies.length > 0) {
            throw new Error(`Task ${taskId} has unmet dependencies: ${unmetDependencies.join(', ')}`);
        }

        // Wait for available slot if needed
        while (this.activeLoads.size >= this.maxConcurrentLoads) {
            await this.waitForSlot();
        }

        task.status = 'loading';
        task.startTime = Date.now();
        this.activeLoads.add(taskId);
        
        this.updateStatus(`Loading ${task.name}...`);
        this.updateProgressFromTasks();

        try {
            const result = await taskFunction();
            
            task.status = 'completed';
            task.endTime = Date.now();
            task.result = result;
            
            this.activeLoads.delete(taskId);
            this.updateProgressFromTasks();
            
            return result;
            
        } catch (error) {
            task.status = 'error';
            task.endTime = Date.now();
            task.error = error;
            
            this.activeLoads.delete(taskId);
            this.updateProgressFromTasks();
            
            throw error;
        }
    }

    /**
     * Get unmet dependencies for a task
     */
    getUnmetDependencies(taskId) {
        const dependencies = this.dependencies.get(taskId) || [];
        return dependencies.filter(depId => {
            const depTask = this.loadingStates.get(depId);
            return !depTask || depTask.status !== 'completed';
        });
    }

    /**
     * Wait for an available loading slot
     */
    async waitForSlot() {
        return new Promise(resolve => {
            const checkSlot = () => {
                if (this.activeLoads.size < this.maxConcurrentLoads) {
                    resolve();
                } else {
                    setTimeout(checkSlot, 100);
                }
            };
            checkSlot();
        });
    }

    /**
     * Update progress based on completed tasks
     */
    updateProgressFromTasks() {
        const totalTasks = this.loadingStates.size;
        const completedTasks = Array.from(this.loadingStates.values())
            .filter(task => task.status === 'completed').length;
        
        const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        this.updateProgress(percentage);
    }

    /**
     * Get loading statistics
     */
    getStats() {
        const tasks = Array.from(this.loadingStates.values());
        return {
            total: tasks.length,
            completed: tasks.filter(t => t.status === 'completed').length,
            loading: tasks.filter(t => t.status === 'loading').length,
            pending: tasks.filter(t => t.status === 'pending').length,
            errors: tasks.filter(t => t.status === 'error').length
        };
    }

    /**
     * Check if all critical systems are loaded
     */
    areSystemsReady() {
        const criticalSystems = [
            'api_keys',
            'game_state',
            'dynamic_items',
            'dynamic_spells',
            'dynamic_encounters',
            'dynamic_enemies',
            'dynamic_locations'
        ];
        
        return criticalSystems.every(systemId => {
            const task = this.loadingStates.get(systemId);
            return task && task.status === 'completed';
        });
    }

    /**
     * Reset loading manager
     */
    reset() {
        this.loadingStates.clear();
        this.dependencies.clear();
        this.loadingQueue = [];
        this.activeLoads.clear();
        this.hideLoading();
    }
}

// Global loading manager instance
export const loadingManager = new LoadingManager();

/**
 * Convenience function to wrap async operations with loading
 */
export async function withLoading(taskId, taskName, taskFunction, dependencies = []) {
    loadingManager.registerTask(taskId, taskName, dependencies);
    return await loadingManager.startTask(taskId, taskFunction);
}
