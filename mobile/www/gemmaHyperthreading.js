// gemmaHyperthreading.js (legacy filename; class is LocalAIHyperthreading)
// Compatibility stub used by ~13 dynamic-* / domain modules. Methods route
// to either localAIOrchestrator (processSpecialists) or directly to a
// single AI call (processWithHyperthreading, processCombatScenario,
// processSingleAgent). Kept under its old name to avoid a 13-import refactor.

import { gameState } from './state.js?cb=014';
import { localAIOrchestrator } from './localAIOrchestrator.js?cb=014';

/**
 * Compatibility stub for Local AI Hyperthreading (formerly Gemma)
 * Redirects all calls to the new Local AI Orchestrator
 */
export class LocalAIHyperthreading {
    constructor() {
        console.log('LocalAIHyperthreading: Compatibility stub loaded - using localAIOrchestrator.js for multi-agent coordination');
        this.isStub = true;
    }

    /**
     * Process specialists - redirects to Local AI Orchestrator
     */
    async processSpecialists(contextAnalysis) {
        console.log('LocalAIHyperthreading: Redirecting to Local AI Orchestrator...');
        
        try {
            // Convert old context format to new orchestrator format
            const requestType = this.convertRequestType(contextAnalysis.situationType);
            const context = this.convertContext(contextAnalysis);
            
            // Use the new orchestrator
            const result = await localAIOrchestrator.orchestrateAgents(requestType, context);
            
            // Convert result back to expected format
            return this.convertResult(result, contextAnalysis.situationType);
            
        } catch (error) {
            console.log(`GemmaHyperthreading stub: Orchestration failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process single agent - simplified processing
     */
    async processSingleAgent(prompt) {
        console.log('LocalAIHyperthreading: Using simplified single agent processing...');

        try {
            // Simple API call for basic requests
            const API = await import('./api_new.js?cb=014');
            return await API.getAIResponse([
                { role: 'system', content: 'You are a helpful AI assistant for an adventure game.' },
                { role: 'user', content: prompt }
            ]);
        } catch (error) {
            console.log(`GemmaHyperthreading stub: Single agent processing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Type-tagged single AI call. Used by characterDevelopment, dynamicChoices,
     * difficultyAdaptation, dynamicSpells, worldEvolution. Returns the raw text response.
     */
    async processWithHyperthreading(prompt, requestType = 'general') {
        const API = await import('./api_new.js?cb=014');
        return await API.getAIResponse([
            { role: 'system', content: `You are an AI specialist handling ${requestType} for an adventure game. Respond concisely and stay on-topic.` },
            { role: 'user', content: prompt }
        ]);
    }

    /**
     * Combat-flavored single AI call. Used by combat.js for enemy turn reasoning.
     */
    async processCombatScenario(prompt, scenarioType = 'enemy_turn') {
        const API = await import('./api_new.js?cb=014');
        return await API.getAIResponse([
            { role: 'system', content: `You are a tactical combat AI handling ${scenarioType}. Respond with a single decisive action.` },
            { role: 'user', content: prompt }
        ]);
    }

    /**
     * Availability flag - true while a local AI client is reachable.
     * Used as a guard by dynamicSpells.js before calling processWithHyperthreading.
     */
    isAvailable() {
        return true;
    }

    /**
     * Convert old request types to new orchestrator format
     */
    convertRequestType(situationType) {
        const typeMap = {
            'item_generation': 'item_generation',
            'encounter_generation': 'encounter_creation',
            'story_continuity': 'story_generation',
            'location_generation': 'location_creation',
            'enemy_generation': 'combat_encounter',
            'spell_generation': 'comprehensive_response'
        };
        
        return typeMap[situationType] || 'story_generation';
    }

    /**
     * Convert old context format to new format
     */
    convertContext(contextAnalysis) {
        const context = {
            originalContextAnalysis: contextAnalysis
        };
        
        // Extract specific context based on situation type
        if (contextAnalysis.itemContext) {
            context.tier = contextAnalysis.itemContext.tier;
            context.type = contextAnalysis.itemContext.type;
            context.includeItems = true;
        }
        
        if (contextAnalysis.encounterContext) {
            context.generationType = contextAnalysis.encounterContext.generationType;
            context.includeEncounters = true;
        }
        
        if (contextAnalysis.storyContext) {
            context.includeStory = true;
        }
        
        return context;
    }

    /**
     * Convert orchestrator result back to expected format
     */
    convertResult(orchestratorResult, situationType) {
        const result = {};
        
        // Map results based on situation type
        switch (situationType) {
            case 'item_generation':
                result.items = orchestratorResult.result;
                break;
            case 'encounter_generation':
                result.encounters = orchestratorResult.result;
                break;
            case 'story_continuity':
                result.story = orchestratorResult.result;
                break;
            case 'location_generation':
                result.locations = orchestratorResult.result;
                break;
            case 'enemy_generation':
                result.enemies = orchestratorResult.result;
                break;
            default:
                result.response = orchestratorResult.result;
        }
        
        return result;
    }

    /**
     * Get status - compatibility method
     */
    getStatus() {
        return {
            isStub: true,
            message: 'Compatibility stub - using Local AI Orchestrator',
            orchestratorStatus: localAIOrchestrator.getStatus()
        };
    }

    /**
     * Reset - compatibility method
     */
    reset() {
        console.log('GemmaHyperthreading stub: Reset called - delegating to orchestrator');
        localAIOrchestrator.reset();
    }
}

// Create and export global instance for compatibility
export const localAIHT = new LocalAIHyperthreading();
export const gemmaHT = localAIHT; // Legacy alias for compatibility

// Export compatibility functions
export function initializeLocalAIHyperthreading() {
    console.log('LocalAIHyperthreading: Compatibility initialization - Local AI Orchestrator is handling multi-agent coordination');
}

export function getLocalAIStatus() {
    return localAIHT.getStatus();
}

// Legacy compatibility functions
export function initializeGemmaHyperthreading() {
    return initializeLocalAIHyperthreading();
}

export function getGemmaStatus() {
    return getLocalAIStatus();
}
