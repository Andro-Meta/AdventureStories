
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

