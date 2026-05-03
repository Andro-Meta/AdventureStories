// storyContinuity.js
// Revolutionary Story Continuity AI Agent for Narrative Memory and Thread Weaving
// Creates coherent, memorable story experiences with long-term consequences

import { gameState, buildGameContextBlock } from './state.js?cb=014';
import { renderMemoryBlock } from './memoryRetriever.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';

/**
 * Story Continuity Agent - Maintains narrative coherence and memory
 * Creates ongoing plot threads, character development, and consequence tracking
 */
export class StoryContinuityAgent {
    constructor() {
        // Narrative memory storage
        this.storyMemory = new Map();              // storyId -> story element
        this.plotThreads = new Map();              // threadId -> plot thread data
        this.characterMemory = new Map();          // characterId -> character data
        this.consequenceChains = new Map();        // actionId -> consequence chain
        this.narrativeArcs = new Map();            // arcId -> story arc data
        
        // Story intelligence
        this.storyPatterns = new Map();            // theme -> successful story patterns
        this.emotionalBeats = new Map();           // emotion -> story beats
        this.conflictTypes = new Map();            // conflict -> resolution patterns
        this.mysteryElements = new Map();          // mystery -> clue patterns
        
        // Continuity tracking
        this.recentEvents = [];                    // Recent story events (sliding window)
        this.pendingCallbacks = new Map();         // eventId -> callback data
        this.unresolved = new Map();               // issueId -> unresolved story elements
        this.foreshadowing = new Map();            // elementId -> foreshadowing data
        
        // Quality control & learning
        this.storyQuality = new Map();             // storyId -> quality metrics
        this.playerEngagement = new Map();         // storyId -> engagement score
        this.narrativeImpact = new Map();          // storyId -> story impact
        this.coherenceScores = new Map();          // storyId -> coherence rating
        
        this.initializeStoryPatterns();
    }

    /**
     * Initialize story patterns and narrative structures
     */
    initializeStoryPatterns() {
        // Story arc patterns by theme
        this.storyPatterns.set('hero_journey', {
            stages: ['call_to_adventure', 'refusal', 'mentor', 'threshold', 'trials', 'revelation', 'transformation', 'return'],
            emotionalBeats: ['hope', 'fear', 'despair', 'triumph', 'wisdom'],
            conflicts: ['internal', 'external', 'philosophical'],
            resolutions: ['victory', 'sacrifice', 'understanding', 'growth']
        });

        this.storyPatterns.set('mystery', {
            stages: ['inciting_incident', 'investigation', 'clues', 'red_herrings', 'revelation', 'confrontation', 'resolution'],
            emotionalBeats: ['curiosity', 'confusion', 'suspicion', 'fear', 'understanding', 'justice'],
            conflicts: ['truth_vs_lies', 'justice_vs_corruption', 'past_vs_present'],
            resolutions: ['truth_revealed', 'justice_served', 'closure_found']
        });

        this.storyPatterns.set('romance', {
            stages: ['meeting', 'attraction', 'obstacle', 'separation', 'realization', 'reunion', 'commitment'],
            emotionalBeats: ['attraction', 'joy', 'conflict', 'heartbreak', 'hope', 'love'],
            conflicts: ['duty_vs_love', 'past_vs_future', 'self_vs_other'],
            resolutions: ['union', 'sacrifice', 'growth', 'understanding']
        });

        // Emotional beat patterns
        this.emotionalBeats.set('tension_building', {
            techniques: ['foreshadowing', 'escalation', 'time_pressure', 'stakes_raising'],
            pacing: 'gradual_increase',
            payoff: 'climactic_moment'
        });

        this.emotionalBeats.set('character_development', {
            techniques: ['internal_conflict', 'moral_choice', 'relationship_change', 'skill_growth'],
            pacing: 'steady_progression',
            payoff: 'character_transformation'
        });

        // Mystery element patterns
        this.mysteryElements.set('investigation', {
            clueTypes: ['physical_evidence', 'witness_testimony', 'hidden_documents', 'behavioral_patterns'],
            redHerrings: ['false_suspect', 'misleading_evidence', 'coincidence', 'misdirection'],
            revelationMethods: ['deduction', 'confession', 'discovery', 'confrontation']
        });
    }

    /**
     * Analyze current story state and generate continuity recommendations
     * @param {object} context - Current game context
     * @returns {Promise<object>} Story continuity analysis
     */
    async analyzeStoryContinuity(context = {}) {
        const log = window.displayVisualError || console.log;
        log(`Analyzing story continuity for ${context.theme || gameState.adventureTheme}`);

        try {
            // Build comprehensive story context
            const storyContext = {
                ...context,
                theme: context.theme || gameState.adventureTheme,
                currentNarrative: gameState.currentNarrative?.slice(-500),
                recentEvents: this.recentEvents.slice(-5),
                activePlotThreads: this.getActivePlotThreads(),
                unresolved: Array.from(this.unresolved.values()),
                pendingCallbacks: Array.from(this.pendingCallbacks.values()),
                characterStates: this.getCurrentCharacterStates(),
                turn: gameState.turn
            };

            // Analyze narrative gaps and opportunities
            const analysis = {
                continuityScore: this.calculateContinuityScore(storyContext),
                plotThreads: this.analyzePlotThreads(storyContext),
                characterArcs: this.analyzeCharacterArcs(storyContext),
                pendingResolutions: this.analyzePendingResolutions(storyContext),
                foreshadowingOpportunities: this.analyzeForeshadowingOpportunities(storyContext),
                emotionalPacing: this.analyzeEmotionalPacing(storyContext),
                thematicCoherence: this.analyzeThematicCoherence(storyContext),
                recommendations: []
            };

            // Generate specific recommendations
            analysis.recommendations = this.generateContinuityRecommendations(analysis, storyContext);

            log(`Story continuity analysis complete. Score: ${analysis.continuityScore.toFixed(2)}`);
            return analysis;

        } catch (error) {
            log(`Story continuity analysis failed: ${error.message}`);
            throw new Error(`Story continuity analysis failed: ${error.message}. The AI system must analyze story continuity correctly. Check local AI server and prompts.`);
        }
    }

    /**
     * Generate story continuation that maintains narrative coherence
     * @param {object} context - Current story context
     * @returns {Promise<object>} Story continuation data
     */
    async generateStoryContinuation(context = {}) {
        const log = window.displayVisualError || console.log;
        log(`Generating story continuation for current narrative`);

        try {
            // Analyze current story state
            const continuityAnalysis = await this.analyzeStoryContinuity(context);
            
            // Build AI prompt for story continuation
            const storyPrompt = this.buildStoryContinuationPrompt(context, continuityAnalysis);
            
            // Generate continuation using AI
            const aiResponse = await this.callStoryContinuityAgent(storyPrompt, 'story_continuation');
            const continuationData = this.parseStoryContinuationResponse(aiResponse, context, continuityAnalysis);
            
            // Create story continuation object
            const continuation = {
                id: generateId('story'),
                type: 'continuation',
                narrative: continuationData.narrative,
                plotAdvancement: continuationData.plotAdvancement,
                characterDevelopment: continuationData.characterDevelopment,
                
                // Continuity elements
                callbacks: continuationData.callbacks || [],
                foreshadowing: continuationData.foreshadowing || [],
                consequences: continuationData.consequences || [],
                
                // Thread management
                threadsAdvanced: continuationData.threadsAdvanced || [],
                threadsResolved: continuationData.threadsResolved || [],
                threadsIntroduced: continuationData.threadsIntroduced || [],
                
                // Quality metrics
                continuityScore: continuityAnalysis.continuityScore,
                emotionalImpact: continuationData.emotionalImpact || 'moderate',
                thematicRelevance: continuationData.thematicRelevance || 'high',
                
                // Context tracking
                createdAt: Date.now(),
                context: context,
                isDynamic: true
            };

            // Store and process the continuation
            this.storeStoryContinuation(continuation, context);
            
            log(`Generated story continuation: ${continuation.id}`);
            return continuation;

        } catch (error) {
            log(`Story continuation generation failed: ${error.message}`);
            throw new Error(`Story continuation generation failed: ${error.message}. The AI system must generate story continuations correctly. Check local AI server and prompts.`);
        }
    }

    /**
     * Track and remember story events for future reference
     * @param {object} event - Story event to remember
     */
    rememberStoryEvent(event) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Create memory entry
            const memoryEntry = {
                id: generateId('memory'),
                type: event.type || 'general',
                description: event.description,
                significance: event.significance || 'minor',
                characters: event.characters || [],
                location: event.location || gameState.currentLocation?.name,
                turn: gameState.turn,
                timestamp: Date.now(),
                tags: event.tags || [],
                emotionalTone: event.emotionalTone || 'neutral'
            };

            // Store in memory
            this.storyMemory.set(memoryEntry.id, memoryEntry);
            
            // Add to recent events (sliding window)
            this.recentEvents.push(memoryEntry);
            if (this.recentEvents.length > 20) {
                this.recentEvents.shift(); // Remove oldest
            }

            // Check for plot thread implications
            this.checkPlotThreadImplications(memoryEntry);
            
            // Check for character development implications
            this.checkCharacterDevelopmentImplications(memoryEntry);
            
            // Check for consequence chain triggers
            this.checkConsequenceChainTriggers(memoryEntry);

            log(`Remembered story event: ${memoryEntry.type} - ${memoryEntry.description.slice(0, 50)}...`);

        } catch (error) {
            log(`Failed to remember story event: ${error.message}`);
        }
    }

    /**
     * Create or advance plot threads
     * @param {object} threadData - Plot thread information
     * @returns {string} Thread ID
     */
    createPlotThread(threadData) {
        const log = window.displayVisualError || console.log;
        
        try {
            const thread = {
                id: generateId('thread'),
                title: threadData.title,
                type: threadData.type || 'mystery',
                status: 'active',
                
                // Thread progression
                stages: threadData.stages || [],
                currentStage: 0,
                progression: 0, // 0-1 completion
                
                // Story elements
                characters: threadData.characters || [],
                locations: threadData.locations || [],
                conflicts: threadData.conflicts || [],
                stakes: threadData.stakes || 'personal',
                
                // Continuity tracking
                introducedAt: gameState.turn,
                lastAdvanced: gameState.turn,
                resolutionTarget: threadData.resolutionTarget || null,
                
                // Quality metrics
                playerEngagement: 0.5, // Initial neutral
                narrativeImpact: threadData.narrativeImpact || 'moderate',
                
                createdAt: Date.now()
            };

            this.plotThreads.set(thread.id, thread);
            log(`Created plot thread: ${thread.title}`);
            
            return thread.id;

        } catch (error) {
            log(`Failed to create plot thread: ${error.message}`);
            return null;
        }
    }

    /**
     * Advance a plot thread based on story events
     * @param {string} threadId - Thread to advance
     * @param {object} advancement - How to advance the thread
     */
    advancePlotThread(threadId, advancement) {
        const log = window.displayVisualError || console.log;
        
        try {
            const thread = this.plotThreads.get(threadId);
            if (!thread) {
                log(`Plot thread not found: ${threadId}`);
                return;
            }

            // Update progression
            thread.progression = Math.min(thread.progression + (advancement.progressAmount || 0.1), 1.0);
            thread.lastAdvanced = gameState.turn;
            
            // Advance stage if needed
            if (advancement.stageAdvancement && thread.currentStage < thread.stages.length - 1) {
                thread.currentStage++;
                log(`Advanced plot thread "${thread.title}" to stage ${thread.currentStage}`);
            }

            // Add new story elements
            if (advancement.newCharacters) {
                thread.characters.push(...advancement.newCharacters);
            }
            if (advancement.newConflicts) {
                thread.conflicts.push(...advancement.newConflicts);
            }

            // Check for resolution
            if (thread.progression >= 1.0 || advancement.resolve) {
                thread.status = 'resolved';
                thread.resolvedAt = gameState.turn;
                log(`Resolved plot thread: ${thread.title}`);
            }

            // Update engagement based on player actions
            if (advancement.playerEngagement !== undefined) {
                thread.playerEngagement = Math.max(0, Math.min(1, advancement.playerEngagement));
            }

        } catch (error) {
            log(`Failed to advance plot thread: ${error.message}`);
        }
    }

    /**
     * Generate callbacks to previous story events
     * @param {object} context - Current context
     * @returns {Array} Potential callbacks
     */
    generateStoryCallbacks(context = {}) {
        const callbacks = [];
        
        try {
            // Look for unresolved elements that could be referenced
            for (const [id, element] of this.unresolved) {
                if (this.shouldCreateCallback(element, context)) {
                    callbacks.push({
                        type: 'callback',
                        originalEvent: element,
                        callbackType: this.determineCallbackType(element, context),
                        significance: element.significance || 'minor',
                        turnsAgo: gameState.turn - element.turn
                    });
                }
            }

            // Look for character development opportunities
            for (const [id, character] of this.characterMemory) {
                if (this.shouldCreateCharacterCallback(character, context)) {
                    callbacks.push({
                        type: 'character_callback',
                        character: character,
                        callbackType: 'character_growth',
                        significance: 'moderate'
                    });
                }
            }

            // Sort by significance and recency
            callbacks.sort((a, b) => {
                const significanceOrder = { 'critical': 3, 'major': 2, 'moderate': 1, 'minor': 0 };
                return significanceOrder[b.significance] - significanceOrder[a.significance];
            });

            return callbacks.slice(0, 3); // Return top 3 callbacks

        } catch (error) {
            return [];
        }
    }

    // Helper methods
    calculateContinuityScore(context) {
        let score = 0.5; // Base score
        
        // Recent event coherence
        if (this.recentEvents.length > 0) {
            score += 0.1;
        }
        
        // Active plot threads
        const activeThreads = this.getActivePlotThreads();
        if (activeThreads.length > 0) {
            score += 0.2;
        }
        
        // Character consistency
        if (this.characterMemory.size > 0) {
            score += 0.1;
        }
        
        // Unresolved elements (good for continuity)
        if (this.unresolved.size > 0) {
            score += 0.1;
        }
        
        return Math.min(score, 1.0);
    }

    getActivePlotThreads() {
        return Array.from(this.plotThreads.values()).filter(thread => thread.status === 'active');
    }

    /**
     * Get story memory data for UI display
     * @returns {object} Story memory data
     */
    getStoryMemory() {
        try {
            // Compile story data for UI display
            const storyData = {
                plotThreads: this.getPlotThreadsForUI(),
                keyEvents: this.getRecentKeyEvents(),
                relationships: this.getKeyRelationships()
            };
            
            return storyData;
        } catch (error) {
            console.log(`StoryContinuity: Failed to get story memory: ${error.message}`);
            return {};
        }
    }

    /**
     * Get plot threads formatted for UI display
     * @returns {object} Plot threads for UI
     */
    getPlotThreadsForUI() {
        const threads = {};
        let threadCount = 0;
        
        // Ensure plotThreads is initialized
        if (!this.plotThreads || typeof this.plotThreads.entries !== 'function') {
            console.log('StoryContinuity: plotThreads not properly initialized, creating new Map');
            this.plotThreads = new Map();
            return threads;
        }
        
        // Convert plot threads map to display format
        try {
            for (const [threadId, thread] of this.plotThreads.entries()) {
                if (threadCount >= 5) break; // Limit to 5 threads for UI
                
                threads[threadId] = {
                    title: thread.title || `Thread ${threadCount + 1}`,
                    description: thread.description || 'A mysterious plot unfolds...',
                    status: thread.status || 'active',
                    significance: thread.significance || 0.5,
                    lastUpdate: thread.lastUpdate || Date.now()
                };
                threadCount++;
            }
        } catch (error) {
            console.log(`StoryContinuity: Error processing plot threads: ${error.message}`);
        }
        
        return threads;
    }

    /**
     * Get recent key events for display
     * @returns {array} Recent key events
     */
    getRecentKeyEvents() {
        const events = [];
        
        // Ensure narrativeMemory is initialized
        if (!this.narrativeMemory || typeof this.narrativeMemory.entries !== 'function') {
            console.log('StoryContinuity: narrativeMemory not properly initialized, creating new Map');
            this.narrativeMemory = new Map();
            return events;
        }
        
        // Get events from narrative memory
        for (const [eventId, event] of this.narrativeMemory.entries()) {
            if (events.length >= 10) break; // Limit to 10 events
            
            if (event.significance > 0.3) { // Only show significant events
                events.push({
                    id: eventId,
                    description: event.description || event.summary || 'Something significant happened...',
                    significance: event.significance || 0.5,
                    timestamp: event.timestamp || Date.now(),
                    turn: event.turn || 0
                });
            }
        }
        
        // Sort by significance and recency
        return events.sort((a, b) => {
            const scoreA = a.significance * 0.7 + (a.timestamp / Date.now()) * 0.3;
            const scoreB = b.significance * 0.7 + (b.timestamp / Date.now()) * 0.3;
            return scoreB - scoreA;
        }).slice(0, 5);
    }

    /**
     * Get key relationships for display
     * @returns {object} Key relationships
     */
    getKeyRelationships() {
        const relationships = {};
        let relationshipCount = 0;
        
        // Ensure characterRelationships is initialized
        if (!this.characterRelationships || typeof this.characterRelationships.entries !== 'function') {
            console.log('StoryContinuity: characterRelationships not properly initialized, creating new Map');
            this.characterRelationships = new Map();
            return relationships;
        }
        
        // Get relationships from character relationships map
        for (const [characterId, relationship] of this.characterRelationships.entries()) {
            if (relationshipCount >= 5) break; // Limit to 5 relationships
            
            // Only show relationships with significant trust levels
            if (Math.abs((relationship.trust || 0.5) - 0.5) > 0.2) {
                relationships[characterId] = {
                    name: relationship.name || characterId,
                    trust: relationship.trust || 0.5,
                    significance: relationship.significance || 0.5,
                    lastInteraction: relationship.lastInteraction || Date.now()
                };
                relationshipCount++;
            }
        }
        
        return relationships;
    }

    getCurrentCharacterStates() {
        return Array.from(this.characterMemory.values()).map(char => ({
            name: char.name,
            relationship: char.relationship || 'neutral',
            lastSeen: char.lastSeen || 'unknown',
            significance: char.significance || 'minor'
        }));
    }

    analyzePlotThreads(context) {
        const activeThreads = this.getActivePlotThreads();
        return {
            count: activeThreads.length,
            needsAdvancement: activeThreads.filter(t => gameState.turn - t.lastAdvanced > 5).length,
            nearResolution: activeThreads.filter(t => t.progression > 0.8).length,
            stagnant: activeThreads.filter(t => gameState.turn - t.lastAdvanced > 10).length
        };
    }

    analyzeCharacterArcs(context) {
        const characters = Array.from(this.characterMemory.values());
        return {
            count: characters.length,
            needsDevelopment: characters.filter(c => !c.recentDevelopment).length,
            hasConflicts: characters.filter(c => c.conflicts && c.conflicts.length > 0).length,
            relationships: characters.filter(c => c.relationship && c.relationship !== 'neutral').length
        };
    }

    analyzePendingResolutions(context) {
        return {
            count: this.unresolved.size,
            overdue: Array.from(this.unresolved.values()).filter(u => gameState.turn - u.turn > 15).length,
            critical: Array.from(this.unresolved.values()).filter(u => u.significance === 'critical').length
        };
    }

    analyzeForeshadowingOpportunities(context) {
        return {
            available: this.foreshadowing.size,
            ready: Array.from(this.foreshadowing.values()).filter(f => gameState.turn - f.plantedAt > 5).length
        };
    }

    analyzeEmotionalPacing(context) {
        const recentEmotions = this.recentEvents.slice(-5).map(e => e.emotionalTone || 'neutral');
        const emotionCounts = {};
        recentEmotions.forEach(emotion => {
            emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        });
        
        return {
            dominant: Object.keys(emotionCounts).reduce((a, b) => emotionCounts[a] > emotionCounts[b] ? a : b, 'neutral'),
            variety: Object.keys(emotionCounts).length,
            needsVariation: Object.keys(emotionCounts).length < 3
        };
    }

    analyzeThematicCoherence(context) {
        const theme = context.theme || gameState.adventureTheme;
        const themeElements = this.recentEvents.filter(e => e.tags && e.tags.includes(theme)).length;
        
        return {
            themePresence: themeElements / Math.max(this.recentEvents.length, 1),
            coherent: themeElements > this.recentEvents.length * 0.6
        };
    }

    generateContinuityRecommendations(analysis, context) {
        const recommendations = [];
        
        if (analysis.continuityScore < 0.6) {
            recommendations.push({
                type: 'improve_continuity',
                priority: 'high',
                suggestion: 'Reference previous events or characters to improve narrative flow'
            });
        }
        
        if (analysis.plotThreads.needsAdvancement > 0) {
            recommendations.push({
                type: 'advance_plots',
                priority: 'medium',
                suggestion: `Advance ${analysis.plotThreads.needsAdvancement} stagnant plot threads`
            });
        }
        
        if (analysis.emotionalPacing.needsVariation) {
            recommendations.push({
                type: 'emotional_variety',
                priority: 'medium',
                suggestion: 'Introduce different emotional tones for better pacing'
            });
        }
        
        return recommendations;
    }

    // Additional helper methods would continue here...
    buildStoryContinuationPrompt(context, analysis) {
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        const gameCtx = buildGameContextBlock();
        const memoryQuery = (gameState.currentNarrative || '') + ' ' + (gameState.currentLocation?.name || '');
        const memoryBlock = renderMemoryBlock(memoryQuery);

        return `${gameCtx}
${memoryBlock ? memoryBlock + '\n' : ''}Create a story continuation that maintains narrative coherence and advances the plot meaningfully.

CONTINUITY ANALYSIS:
- Continuity Score: ${analysis.continuityScore.toFixed(2)}
- Active Plot Threads: ${analysis.plotThreads.count}
- Unresolved Elements: ${analysis.pendingResolutions.count}
- Character Arcs: ${analysis.characterArcs.count}

STORY REQUIREMENTS:
- Reference the Known NPCs and Story Flags listed in the game state above — do NOT invent contradicting facts
- Advance or reference active plot threads; resolve them only if narratively earned
- Develop character relationships consistent with Recent Events above
- Create meaningful consequences for past actions
- Plant seeds for future story developments

Create a continuation that feels natural and connected. Respond with ONLY a JSON object:
{
    "narrative": "Rich story continuation that flows naturally from previous events",
    "plotAdvancement": "How this advances existing plot threads",
    "characterDevelopment": "Character growth or relationship changes",
    "callbacks": ["Reference to previous event 1", "Reference to previous event 2"],
    "foreshadowing": ["Hint about future event 1", "Hint about future event 2"],
    "consequences": ["Result of previous choice 1", "Result of previous choice 2"],
    "threadsAdvanced": ["thread_id_1", "thread_id_2"],
    "threadsResolved": ["resolved_thread_id"],
    "threadsIntroduced": ["new_thread_title"],
    "emotionalImpact": "low|moderate|high|dramatic",
    "thematicRelevance": "low|moderate|high|perfect"
}`;
    }

    async callStoryContinuityAgent(prompt, generationType) {
        try {
            const API = await import('./api_new.js?cb=014');
            const messages = [
                { role: 'system', content: 'You are a game data generator. Return only valid JSON matching the requested schema. No prose.' },
                { role: 'user', content: prompt }
            ];
            return await API.getAIResponseJSON(messages, { type: 'object' }, { max_tokens: 600, temperature: 0.7 });
        } catch (error) {
            throw new Error(`Story continuity agent failed: ${error.message}`);
        }
    }

    parseStoryContinuationResponse(response, context, analysis) {
        try {
            if (response && typeof response === 'object') return response;
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            throw new Error(`Story continuation data parsing failed: ${error.message}. The AI must return valid JSON data for story continuations.`);
        }
    }

    storeStoryContinuation(continuation, context) {
        // Store the continuation
        this.storyMemory.set(continuation.id, continuation);
        
        // Process plot thread updates
        continuation.threadsAdvanced.forEach(threadId => {
            this.advancePlotThread(threadId, { progressAmount: 0.1 });
        });
        
        // Create new plot threads
        continuation.threadsIntroduced.forEach(threadTitle => {
            this.createPlotThread({ title: threadTitle, type: 'mystery' });
        });
        
        // Store foreshadowing elements
        continuation.foreshadowing.forEach(element => {
            const foreshadowId = generateId('foreshadow');
            this.foreshadowing.set(foreshadowId, {
                id: foreshadowId,
                element: element,
                plantedAt: gameState.turn,
                context: context
            });
        });
    }

    // REMOVED: generateFallbackAnalysis() - Fallback function that masked AI failures
    // REMOVED: generateFallbackContinuation() - Fallback function that masked AI failures  
    // REMOVED: generateFallbackContinuationData() - Fallback function that masked AI failures

    // Additional functionality methods
    checkPlotThreadImplications(memoryEntry) {
        if (!memoryEntry || !gameState.narrativeContext?.plotThreads) return;
        
        const plotThreads = gameState.narrativeContext.plotThreads;
        const eventKeywords = memoryEntry.description.toLowerCase();
        
        // Check if this event affects any active plot threads
        plotThreads.forEach(thread => {
            if (thread.status === 'active' && thread.keywords) {
                const hasRelevantKeywords = thread.keywords.some(keyword => 
                    eventKeywords.includes(keyword.toLowerCase())
                );
                
                if (hasRelevantKeywords) {
                    thread.lastUpdate = gameState.turn;
                    thread.relevantEvents = thread.relevantEvents || [];
                    thread.relevantEvents.push({
                        turn: gameState.turn,
                        event: memoryEntry.description,
                        significance: memoryEntry.significance
                    });
                    
                    // Update thread progress
                    thread.progress = Math.min((thread.progress || 0) + (memoryEntry.significance * 0.1), 1.0);
                }
            }
        });
    }

    checkCharacterDevelopmentImplications(memoryEntry) {
        if (!memoryEntry || !gameState.players) return;
        
        const eventText = memoryEntry.description.toLowerCase();
        
        // Check for character development triggers
        gameState.players.forEach(player => {
            let developmentTrigger = null;
            
            if (eventText.includes('brave') || eventText.includes('courageous')) {
                developmentTrigger = { trait: 'courage', change: 0.1 };
            } else if (eventText.includes('wise') || eventText.includes('clever')) {
                developmentTrigger = { trait: 'wisdom', change: 0.1 };
            } else if (eventText.includes('kind') || eventText.includes('compassionate')) {
                developmentTrigger = { trait: 'compassion', change: 0.1 };
            } else if (eventText.includes('betrayal') || eventText.includes('deceive')) {
                developmentTrigger = { trait: 'trust', change: -0.1 };
            }
            
            if (developmentTrigger) {
                if (!player.characterDevelopment) {
                    player.characterDevelopment = {};
                }
                
                const currentValue = player.characterDevelopment[developmentTrigger.trait] || 0;
                player.characterDevelopment[developmentTrigger.trait] = 
                    Math.max(-1, Math.min(1, currentValue + developmentTrigger.change));
                
                // Record the development event
                if (!player.developmentHistory) {
                    player.developmentHistory = [];
                }
                
                player.developmentHistory.push({
                    turn: gameState.turn,
                    trait: developmentTrigger.trait,
                    change: developmentTrigger.change,
                    trigger: memoryEntry.description,
                    significance: memoryEntry.significance
                });
            }
        });
    }

    checkConsequenceChainTriggers(memoryEntry) {
        // Implementation would check if this event triggers consequence chains
    }

    shouldCreateCallback(element, context) {
        // Implementation would determine if a callback should be created
        return Math.random() < 0.3; // 30% chance for now
    }

    determineCallbackType(element, context) {
        const types = ['consequence', 'reference', 'development', 'resolution'];
        return getRandomElement(types);
    }

    shouldCreateCharacterCallback(character, context) {
        // Implementation would determine if character callback is appropriate
        return Math.random() < 0.2; // 20% chance for now
    }
}

// Initialize the story continuity system
export const storyContinuityAgent = new StoryContinuityAgent();

/**
 * Main entry point for story continuity analysis
 * @param {object} context - Current game context
 * @returns {Promise<object>} Story continuity analysis
 */
export async function analyzeStoryContinuity(context = {}) {
    const agent = gameState.storyContinuityAgent || storyContinuityAgent;
    return await agent.analyzeStoryContinuity(context);
}

/**
 * Generate story continuation with narrative memory
 * @param {object} context - Current story context
 * @returns {Promise<object>} Story continuation
 */
export async function generateStoryContinuation(context = {}) {
    const agent = gameState.storyContinuityAgent || storyContinuityAgent;
    return await agent.generateStoryContinuation(context);
}

/**
 * Remember a story event for future reference
 * @param {object} event - Story event to remember
 */
export function rememberStoryEvent(event) {
    const agent = gameState.storyContinuityAgent || storyContinuityAgent;
    agent.rememberStoryEvent(event);
}

/**
 * Create a new plot thread
 * @param {object} threadData - Plot thread information
 * @returns {string} Thread ID
 */
export function createPlotThread(threadData) {
    const agent = gameState.storyContinuityAgent || storyContinuityAgent;
    return agent.createPlotThread(threadData);
}

/**
 * Advance an existing plot thread
 * @param {string} threadId - Thread to advance
 * @param {object} advancement - How to advance the thread
 */
export function advancePlotThread(threadId, advancement) {
    const agent = gameState.storyContinuityAgent || storyContinuityAgent;
    agent.advancePlotThread(threadId, advancement);
}
