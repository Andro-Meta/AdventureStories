// localAIOrchestrator.js
// Revolutionary Local AI Multi-Agent Orchestrator
// Coordinates specialized agents with local AI for intelligent, parallel processing

import { gameState } from './state.js?cb=014';
import * as API from './api_new.js?cb=014';
import * as UI from './ui.js?cb=014';
import { generateId } from './utils.js?cb=014';

/**
 * Local AI Multi-Agent Orchestrator
 * Replaces the obsolete Gemma hyperthreading system with local AI coordination
 */
export class LocalAIOrchestrator {
    constructor() {
        // Agent registry and coordination
        this.registeredAgents = new Map();
        this.agentCapabilities = new Map();
        this.agentPerformance = new Map();
        this.activeRequests = new Map();
        
        // Coordination and synthesis
        this.requestQueue = [];
        this.resultCache = new Map();
        this.contextSharing = new Map();
        this.qualityMetrics = new Map();
        
        // Performance optimization
        this.parallelLimit = 3; // Max parallel agent executions
        this.cacheTimeout = 300000; // 5 minutes
        this.retryAttempts = 2;
        
        // Initialize agent registry
        this.initializeAgentRegistry();
        
        console.log('LocalAIOrchestrator: Initialized with intelligent multi-agent coordination');
    }

    /**
     * Initialize the registry of available agents and their capabilities
     */
    initializeAgentRegistry() {
        // Story and Narrative Agents
        this.registerAgent('story_continuity', {
            name: 'Story Continuity Agent',
            description: 'Maintains narrative coherence and memory',
            capabilities: ['narrative_memory', 'plot_threads', 'character_development', 'consequence_tracking'],
            priority: 'high',
            executionTime: 'medium',
            dependencies: [],
            module: './storyContinuity.js?cb=014',
            className: 'StoryContinuityAgent'
        });

        // Dynamic Content Agents
        this.registerAgent('dynamic_items', {
            name: 'Dynamic Item Registry',
            description: 'Generates contextual items and equipment',
            capabilities: ['item_generation', 'equipment_creation', 'loot_distribution', 'contextual_items'],
            priority: 'medium',
            executionTime: 'fast',
            dependencies: ['theme_intelligence'],
            module: './dynamicItems.js?cb=014',
            className: 'DynamicItemRegistry'
        });

        this.registerAgent('dynamic_encounters', {
            name: 'Dynamic Encounter Registry',
            description: 'Creates NPCs, puzzles, and encounters',
            capabilities: ['npc_generation', 'puzzle_creation', 'encounter_design', 'boss_battles'],
            priority: 'high',
            executionTime: 'medium',
            dependencies: ['theme_intelligence', 'story_continuity'],
            module: './dynamicEncounters.js?cb=014',
            className: 'DynamicEncounterRegistry'
        });

        this.registerAgent('dynamic_enemies', {
            name: 'Dynamic Enemy Registry',
            description: 'Generates contextual enemies and combat encounters',
            capabilities: ['enemy_generation', 'combat_design', 'difficulty_scaling', 'boss_creation'],
            priority: 'medium',
            executionTime: 'fast',
            dependencies: ['theme_intelligence'],
            module: './dynamicEnemies.js?cb=014',
            className: 'DynamicEnemyRegistry'
        });

        this.registerAgent('dynamic_locations', {
            name: 'Dynamic Location Registry',
            description: 'Creates environments and locations',
            capabilities: ['location_generation', 'environment_design', 'world_building', 'atmosphere_creation'],
            priority: 'medium',
            executionTime: 'medium',
            dependencies: ['theme_intelligence', 'story_continuity'],
            module: './dynamicLocations.js?cb=014',
            className: 'DynamicLocationRegistry'
        });

        // Intelligence and Analysis Agents
        this.registerAgent('theme_intelligence', {
            name: 'Theme Intelligence Engine',
            description: 'Provides deep contextual analysis',
            capabilities: ['theme_analysis', 'context_understanding', 'cultural_adaptation', 'tone_matching'],
            priority: 'high',
            executionTime: 'fast',
            dependencies: [],
            module: './themeIntelligence.js?cb=014',
            className: 'ThemeIntelligenceEngine'
        });

        this.registerAgent('adaptive_abilities', {
            name: 'Adaptive Abilities System',
            description: 'Universal spell and skill system',
            capabilities: ['spell_generation', 'skill_creation', 'ability_adaptation', 'power_scaling'],
            priority: 'medium',
            executionTime: 'fast',
            dependencies: ['theme_intelligence'],
            module: './adaptiveAbilities.js?cb=014',
            className: 'AdaptiveAbilities'
        });

        // Quest and Progress Agents
        this.registerAgent('quest_progress', {
            name: 'Quest Progress Manager',
            description: 'Tracks quest progression and milestones',
            capabilities: ['progress_tracking', 'milestone_detection', 'objective_management', 'completion_analysis'],
            priority: 'high',
            executionTime: 'fast',
            dependencies: [],
            module: './questProgress.js?cb=014',
            className: 'QuestProgressManager'
        });
    }

    /**
     * Register a new agent with the orchestrator
     */
    registerAgent(agentId, config) {
        this.registeredAgents.set(agentId, config);
        this.agentCapabilities.set(agentId, config.capabilities);
        this.agentPerformance.set(agentId, {
            successRate: 1.0,
            averageTime: 1000,
            qualityScore: 1.0,
            lastUsed: 0,
            totalCalls: 0
        });
    }

    /**
     * Main orchestration method - coordinates multiple agents for complex requests
     */
    async orchestrateAgents(requestType, context, requiredCapabilities = []) {
        const log = window.displayVisualError || console.log;
        const requestId = generateId();
        // Hoisted out of the try so the catch block can reference it without
        // throwing ReferenceError that masks the real failure.
        // Phase 0 audit P1 #7.
        let agentPlan;

        log(`LocalAIOrchestrator: Starting orchestration for ${requestType} (ID: ${requestId})`);

        try {
            // Phase 1: Analyze request and select agents
            agentPlan = await this.createAgentPlan(requestType, context, requiredCapabilities);
            log(`LocalAIOrchestrator: Agent plan created - ${agentPlan.selectedAgents.length} agents selected`);
            
            // Phase 2: Execute agents in coordinated parallel batches
            const agentResults = await this.executeAgentPlan(agentPlan, requestId);
            log(`LocalAIOrchestrator: Agent execution completed - ${Object.keys(agentResults).length} results`);
            
            // Phase 3: Synthesize results into coherent response
            const synthesizedResult = await this.synthesizeResults(agentResults, agentPlan, context);
            log(`LocalAIOrchestrator: Result synthesis completed`);
            
            // Phase 4: Quality validation and optimization
            const finalResult = await this.validateAndOptimize(synthesizedResult, agentPlan, context);
            log(`LocalAIOrchestrator: Quality validation completed`);
            
            // Update performance metrics
            this.updateAgentMetrics(agentPlan.selectedAgents, true);
            
            return finalResult;
            
        } catch (error) {
            log(`LocalAIOrchestrator: Orchestration failed for ${requestType}: ${error.message}`);
            
            // Update performance metrics for failure
            if (agentPlan?.selectedAgents) {
                this.updateAgentMetrics(agentPlan.selectedAgents, false);
            }
            
            // Attempt graceful degradation
            return await this.handleOrchestrationFailure(requestType, context, error);
        }
    }

    /**
     * Phase 1: Create intelligent agent execution plan
     */
    async createAgentPlan(requestType, context, requiredCapabilities) {
        const log = window.displayVisualError || console.log;
        
        // Analyze request to determine needed capabilities
        const neededCapabilities = await this.analyzeRequestCapabilities(requestType, context, requiredCapabilities);
        log(`LocalAIOrchestrator: Identified needed capabilities: ${neededCapabilities.join(', ')}`);
        
        // Select optimal agents based on capabilities and performance
        const selectedAgents = this.selectOptimalAgents(neededCapabilities);
        log(`LocalAIOrchestrator: Selected agents: ${selectedAgents.map(a => a.id).join(', ')}`);
        
        // Create execution plan with dependencies and batching
        const executionPlan = this.createExecutionPlan(selectedAgents, context);
        
        return {
            requestType,
            context,
            neededCapabilities,
            selectedAgents,
            executionPlan,
            timestamp: Date.now()
        };
    }

    /**
     * Analyze request to determine what capabilities are needed
     */
    async analyzeRequestCapabilities(requestType, context, requiredCapabilities) {
        const capabilities = new Set(requiredCapabilities);
        
        // Add capabilities based on request type
        switch (requestType) {
            case 'story_generation':
                capabilities.add('narrative_memory');
                capabilities.add('plot_threads');
                capabilities.add('theme_analysis');
                if (context.includeEncounters) capabilities.add('encounter_design');
                if (context.includeItems) capabilities.add('item_generation');
                break;
                
            case 'encounter_creation':
                capabilities.add('encounter_design');
                capabilities.add('npc_generation');
                capabilities.add('theme_analysis');
                capabilities.add('narrative_memory');
                break;
                
            case 'item_generation':
                capabilities.add('item_generation');
                capabilities.add('contextual_items');
                capabilities.add('theme_analysis');
                break;
                
            case 'location_creation':
                capabilities.add('location_generation');
                capabilities.add('environment_design');
                capabilities.add('theme_analysis');
                capabilities.add('narrative_memory');
                break;
                
            case 'combat_encounter':
                capabilities.add('enemy_generation');
                capabilities.add('combat_design');
                capabilities.add('difficulty_scaling');
                capabilities.add('theme_analysis');
                break;
                
            case 'quest_progression':
                capabilities.add('progress_tracking');
                capabilities.add('milestone_detection');
                capabilities.add('narrative_memory');
                break;
                
            case 'comprehensive_response':
                // Use all available capabilities for complex requests
                capabilities.add('narrative_memory');
                capabilities.add('theme_analysis');
                capabilities.add('encounter_design');
                capabilities.add('item_generation');
                capabilities.add('progress_tracking');
                break;
        }
        
        // Add contextual capabilities
        if (context.needsAbilities) capabilities.add('spell_generation');
        if (context.needsEnemies) capabilities.add('enemy_generation');
        if (context.needsLocations) capabilities.add('location_generation');
        if (context.trackProgress) capabilities.add('progress_tracking');
        
        return Array.from(capabilities);
    }

    /**
     * Select optimal agents based on capabilities and performance
     */
    selectOptimalAgents(neededCapabilities) {
        const selectedAgents = [];
        const coveredCapabilities = new Set();
        
        // Sort agents by performance and priority
        const availableAgents = Array.from(this.registeredAgents.entries())
            .map(([id, config]) => ({
                id,
                config,
                performance: this.agentPerformance.get(id),
                score: this.calculateAgentScore(id, neededCapabilities)
            }))
            .sort((a, b) => b.score - a.score);
        
        // Select agents to cover all needed capabilities
        for (const agent of availableAgents) {
            const agentCapabilities = this.agentCapabilities.get(agent.id);
            const newCapabilities = agentCapabilities.filter(cap => 
                neededCapabilities.includes(cap) && !coveredCapabilities.has(cap)
            );
            
            if (newCapabilities.length > 0) {
                selectedAgents.push(agent);
                newCapabilities.forEach(cap => coveredCapabilities.add(cap));
                
                // Stop if all capabilities are covered
                if (coveredCapabilities.size >= neededCapabilities.length) {
                    break;
                }
            }
        }
        
        return selectedAgents;
    }

    /**
     * Calculate agent selection score based on performance and relevance
     */
    calculateAgentScore(agentId, neededCapabilities) {
        const config = this.registeredAgents.get(agentId);
        const performance = this.agentPerformance.get(agentId);
        const capabilities = this.agentCapabilities.get(agentId);
        
        // Relevance score (how many needed capabilities this agent provides)
        const relevanceScore = capabilities.filter(cap => neededCapabilities.includes(cap)).length / neededCapabilities.length;
        
        // Performance score
        const performanceScore = (performance.successRate * 0.4) + 
                               (performance.qualityScore * 0.4) + 
                               (Math.min(1.0, 1000 / performance.averageTime) * 0.2);
        
        // Priority score
        const priorityScore = config.priority === 'high' ? 1.0 : config.priority === 'medium' ? 0.7 : 0.4;
        
        return (relevanceScore * 0.5) + (performanceScore * 0.3) + (priorityScore * 0.2);
    }

    /**
     * Create execution plan with dependency resolution and batching
     */
    createExecutionPlan(selectedAgents, context) {
        const plan = {
            batches: [],
            dependencies: new Map(),
            sharedContext: this.buildSharedContext(context)
        };
        
        // Build dependency graph
        const dependencyGraph = new Map();
        selectedAgents.forEach(agent => {
            dependencyGraph.set(agent.id, agent.config.dependencies || []);
        });
        
        // Resolve dependencies and create execution batches
        const processed = new Set();
        let currentBatch = [];
        
        while (processed.size < selectedAgents.length) {
            const readyAgents = selectedAgents.filter(agent => 
                !processed.has(agent.id) && 
                agent.config.dependencies.every(dep => processed.has(dep))
            );
            
            if (readyAgents.length === 0) {
                // Break dependency cycles by processing remaining agents
                const remainingAgents = selectedAgents.filter(agent => !processed.has(agent.id));
                currentBatch.push(...remainingAgents);
                remainingAgents.forEach(agent => processed.add(agent.id));
            } else {
                currentBatch.push(...readyAgents);
                readyAgents.forEach(agent => processed.add(agent.id));
            }
            
            // Create batch when we hit parallel limit or no more ready agents
            if (currentBatch.length >= this.parallelLimit || readyAgents.length === 0) {
                if (currentBatch.length > 0) {
                    plan.batches.push([...currentBatch]);
                    currentBatch = [];
                }
            }
        }
        
        return plan;
    }

    /**
     * Build shared context for agent coordination
     */
    buildSharedContext(context) {
        return {
            gameState: {
                theme: gameState.adventureTheme,
                customTheme: gameState.customThemeDescription,
                turn: gameState.turn,
                goal: gameState.adventureGoal,
                inCombat: gameState.inCombat,
                currentLocation: gameState.currentLocation,
                players: gameState.players?.map(p => ({
                    name: p.name,
                    level: p.level,
                    class: p.class,
                    hp: p.hp,
                    maxHp: p.maxHp
                })) || []
            },
            narrative: {
                current: gameState.currentNarrative?.slice(-500) || '',
                recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || []
            },
            quest: gameState.questProgress ? {
                phase: gameState.questProgress.currentPhase,
                percentage: gameState.questProgress.completionPercentage,
                objectives: gameState.questProgress.currentObjectives,
                milestones: gameState.questProgress.milestones?.slice(-3) || []
            } : null,
            context: context || {},
            timestamp: Date.now()
        };
    }

    /**
     * Phase 2: Execute agent plan in coordinated batches
     */
    async executeAgentPlan(agentPlan, requestId) {
        const log = window.displayVisualError || console.log;
        const results = {};
        
        // Show loading indicator
        UI.showLoading(true, 'Coordinating AI agents...');
        
        try {
            // Execute batches sequentially, agents within batches in parallel
            for (let batchIndex = 0; batchIndex < agentPlan.executionPlan.batches.length; batchIndex++) {
                const batch = agentPlan.executionPlan.batches[batchIndex];
                log(`LocalAIOrchestrator: Executing batch ${batchIndex + 1}/${agentPlan.executionPlan.batches.length} with ${batch.length} agents`);
                
                // Execute agents in current batch in parallel
                const batchPromises = batch.map(agent => 
                    this.executeAgent(agent, agentPlan, results, requestId)
                );
                
                const batchResults = await Promise.allSettled(batchPromises);
                
                // Process batch results
                batchResults.forEach((result, index) => {
                    const agent = batch[index];
                    if (result.status === 'fulfilled' && result.value) {
                        results[agent.id] = result.value;
                        log(`LocalAIOrchestrator: Agent ${agent.id} completed successfully`);
                    } else {
                        log(`LocalAIOrchestrator: Agent ${agent.id} failed: ${result.reason?.message || 'No result returned'}`);
                        results[agent.id] = { 
                            error: result.reason?.message || 'Agent returned no result', 
                            fallback: true,
                            agentId: agent.id,
                            result: `Agent ${agent.id} processing completed with basic response.`
                        };
                    }
                });
                
                // Update shared context with results from this batch
                agentPlan.executionPlan.sharedContext.previousResults = { ...results };
            }
            
            return results;
            
        } finally {
            UI.showLoading(false);
        }
    }

    /**
     * Execute individual agent with local AI
     */
    async executeAgent(agent, agentPlan, previousResults, requestId) {
        const log = window.displayVisualError || console.log;
        const startTime = Date.now();
        
        try {
            // Build agent-specific prompt with shared context
            const agentPrompt = this.buildAgentPrompt(agent, agentPlan, previousResults);
            
            // Execute agent with local AI
            const response = await API.getAIResponse([
                { role: 'system', content: agentPrompt.systemPrompt },
                { role: 'user', content: agentPrompt.userPrompt }
            ], {
                temperature: 0.8,
                max_tokens: 1000,
                agent_id: agent.id,
                request_id: requestId
            });
            
            // Parse and validate agent response
            const parsedResult = this.parseAgentResponse(agent, response);
            
            // Update performance metrics
            const executionTime = Date.now() - startTime;
            this.updateAgentPerformance(agent.id, executionTime, true, parsedResult.quality || 0.8);
            
            return parsedResult;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.updateAgentPerformance(agent.id, executionTime, false, 0);
            throw error;
        }
    }

    /**
     * Build specialized prompt for each agent
     */
    buildAgentPrompt(agent, agentPlan, previousResults) {
        const sharedContext = agentPlan.executionPlan.sharedContext;
        const agentConfig = agent.config;
        
        const systemPrompt = `You are the ${agentConfig.name}, a specialized AI agent in a multi-agent system.

AGENT ROLE: ${agentConfig.description}
CAPABILITIES: ${agentConfig.capabilities.join(', ')}
REQUEST TYPE: ${agentPlan.requestType}

SHARED CONTEXT:
- Theme: ${sharedContext.gameState.theme}
- Turn: ${sharedContext.gameState.turn}
- Goal: ${sharedContext.gameState.goal}
- Players: ${sharedContext.gameState.players.map(p => p.name).join(', ')}
- Current Situation: ${sharedContext.gameState.inCombat ? 'Combat' : 'Exploration'}

PREVIOUS AGENT RESULTS:
${Object.entries(previousResults).map(([agentId, result]) => 
    `- ${agentId}: ${typeof result === 'object' ? JSON.stringify(result).slice(0, 200) : result.slice(0, 200)}`
).join('\n')}

INSTRUCTIONS:
1. Focus ONLY on your specialized capabilities
2. Build upon previous agent results when relevant
3. Provide structured, parseable output
4. Include quality indicators and confidence scores
5. Be concise but comprehensive within your domain

OUTPUT FORMAT:
Provide your response as a JSON object with:
{
    "result": "your specialized output",
    "confidence": 0.0-1.0,
    "quality_indicators": ["indicator1", "indicator2"],
    "context_used": ["context1", "context2"],
    "recommendations": "suggestions for other agents"
}`;

        const userPrompt = `Execute your specialized function for this request:

CONTEXT: ${JSON.stringify(sharedContext.context, null, 2)}

NARRATIVE CONTEXT: ${sharedContext.narrative.current}

${sharedContext.quest ? `QUEST CONTEXT: Phase ${sharedContext.quest.phase} (${sharedContext.quest.percentage}% complete)` : ''}

Generate your specialized response now.`;

        return { systemPrompt, userPrompt };
    }

    /**
     * Parse and validate agent response
     */
    parseAgentResponse(agent, response) {
        try {
            // Try to parse as JSON first
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    agentId: agent.id,
                    result: parsed.result || response,
                    confidence: parsed.confidence || 0.7,
                    quality: parsed.confidence || 0.7,
                    qualityIndicators: parsed.quality_indicators || [],
                    contextUsed: parsed.context_used || [],
                    recommendations: parsed.recommendations || '',
                    rawResponse: response,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            // Fallback to plain text parsing
        }
        
        // Fallback: treat as plain text response
        return {
            agentId: agent.id,
            result: response,
            confidence: 0.6,
            quality: 0.6,
            qualityIndicators: ['plain_text_response'],
            contextUsed: [],
            recommendations: '',
            rawResponse: response,
            timestamp: Date.now()
        };
    }

    /**
     * Phase 3: Synthesize agent results into coherent response
     */
    async synthesizeResults(agentResults, agentPlan, context) {
        const log = window.displayVisualError || console.log;
        log('LocalAIOrchestrator: Synthesizing agent results...');
        
        // Build synthesis prompt
        const synthesisPrompt = this.buildSynthesisPrompt(agentResults, agentPlan, context);
        
        try {
            // Use local AI to synthesize results
            const synthesizedResponse = await API.getAIResponse([
                { role: 'system', content: synthesisPrompt.systemPrompt },
                { role: 'user', content: synthesisPrompt.userPrompt }
            ], {
                temperature: 0.7,
                max_tokens: 1500,
                operation: 'synthesis'
            });
            
            return {
                synthesizedResult: synthesizedResponse,
                agentContributions: Object.keys(agentResults),
                confidenceScore: this.calculateOverallConfidence(agentResults),
                qualityScore: this.calculateOverallQuality(agentResults),
                timestamp: Date.now()
            };
            
        } catch (error) {
            log(`LocalAIOrchestrator: Synthesis failed, using fallback combination: ${error.message}`);
            return this.fallbackSynthesis(agentResults, agentPlan, context);
        }
    }

    /**
     * Build synthesis prompt to combine agent results
     */
    buildSynthesisPrompt(agentResults, agentPlan, context) {
        const systemPrompt = `You are the Master Synthesizer in a multi-agent AI system. Your role is to combine the outputs of specialized agents into a single, coherent, high-quality response.

REQUEST TYPE: ${agentPlan.requestType}
AGENTS INVOLVED: ${Object.keys(agentResults).join(', ')}

SYNTHESIS GUIDELINES:
1. Combine agent outputs into a seamless, coherent response
2. Resolve any conflicts between agent outputs intelligently
3. Maintain the strengths of each agent's contribution
4. Ensure the final result serves the original request
5. Preserve important details while avoiding redundancy
6. Maintain narrative flow and consistency

AGENT RESULTS TO SYNTHESIZE:
${Object.entries(agentResults).map(([agentId, result]) => `
=== ${agentId.toUpperCase()} ===
Result: ${typeof result.result === 'object' ? JSON.stringify(result.result) : result.result}
Confidence: ${result.confidence}
Quality Indicators: ${result.qualityIndicators?.join(', ') || 'none'}
Recommendations: ${result.recommendations || 'none'}
`).join('\n')}

OUTPUT REQUIREMENTS:
- Create a unified, coherent response
- Integrate all valuable agent contributions
- Maintain high quality and consistency
- Ensure the response directly addresses the original request`;

        const userPrompt = `Synthesize the agent results into a single, high-quality response for: ${agentPlan.requestType}

Original Context: ${JSON.stringify(context, null, 2)}

Create the best possible unified response now.`;

        return { systemPrompt, userPrompt };
    }

    /**
     * Calculate overall confidence from agent results
     */
    calculateOverallConfidence(agentResults) {
        const confidenceScores = Object.values(agentResults)
            .filter(result => !result.error)
            .map(result => result.confidence || 0.5);
        
        if (confidenceScores.length === 0) return 0.3;
        
        // Weighted average with bias toward higher confidence
        const average = confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
        const maxScore = Math.max(...confidenceScores);
        
        return (average * 0.7) + (maxScore * 0.3);
    }

    /**
     * Calculate overall quality from agent results
     */
    calculateOverallQuality(agentResults) {
        const qualityScores = Object.values(agentResults)
            .filter(result => !result.error)
            .map(result => result.quality || 0.5);
        
        if (qualityScores.length === 0) return 0.3;
        
        return qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    }

    /**
     * Fallback synthesis when AI synthesis fails
     */
    fallbackSynthesis(agentResults, agentPlan, context) {
        const log = window.displayVisualError || console.log;
        log('LocalAIOrchestrator: Using fallback synthesis method');
        
        // Simple concatenation with priority ordering
        const priorityOrder = ['story_continuity', 'dynamic_encounters', 'dynamic_items', 'theme_intelligence'];
        const sortedResults = Object.entries(agentResults)
            .filter(([_, result]) => !result.error)
            .sort(([a], [b]) => {
                const aIndex = priorityOrder.indexOf(a);
                const bIndex = priorityOrder.indexOf(b);
                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
            });
        
        const combinedResult = sortedResults
            .map(([agentId, result]) => `${result.result}`)
            .join('\n\n');
        
        return {
            synthesizedResult: combinedResult,
            agentContributions: Object.keys(agentResults),
            confidenceScore: this.calculateOverallConfidence(agentResults),
            qualityScore: this.calculateOverallQuality(agentResults),
            fallbackUsed: true,
            timestamp: Date.now()
        };
    }

    /**
     * Phase 4: Quality validation and optimization
     */
    async validateAndOptimize(synthesizedResult, agentPlan, context) {
        const log = window.displayVisualError || console.log;
        
        // Quality checks
        const qualityChecks = {
            coherence: this.checkCoherence(synthesizedResult.synthesizedResult),
            completeness: this.checkCompleteness(synthesizedResult.synthesizedResult, agentPlan.requestType),
            relevance: this.checkRelevance(synthesizedResult.synthesizedResult, context),
            consistency: this.checkConsistency(synthesizedResult.synthesizedResult, agentPlan.executionPlan.sharedContext)
        };
        
        const overallQuality = Object.values(qualityChecks).reduce((sum, score) => sum + score, 0) / 4;
        
        log(`LocalAIOrchestrator: Quality validation - Overall: ${overallQuality.toFixed(2)}, Coherence: ${qualityChecks.coherence.toFixed(2)}, Completeness: ${qualityChecks.completeness.toFixed(2)}`);
        
        // Apply optimizations if needed
        let optimizedResult = synthesizedResult.synthesizedResult;
        if (overallQuality < 0.7) {
            log('LocalAIOrchestrator: Applying quality optimizations...');
            optimizedResult = await this.applyQualityOptimizations(synthesizedResult, qualityChecks, context);
        }
        
        return {
            result: optimizedResult,
            metadata: {
                agentContributions: synthesizedResult.agentContributions,
                confidenceScore: synthesizedResult.confidenceScore,
                qualityScore: Math.max(synthesizedResult.qualityScore, overallQuality),
                qualityChecks,
                optimizationsApplied: overallQuality < 0.7,
                processingTime: Date.now() - agentPlan.timestamp,
                timestamp: Date.now()
            }
        };
    }

    /**
     * Quality check methods
     */
    checkCoherence(text) {
        // Simple coherence check based on text structure and flow
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length < 2) return 0.5;
        
        // Check for narrative flow indicators
        const flowIndicators = ['then', 'next', 'suddenly', 'meanwhile', 'however', 'therefore', 'as a result'];
        const hasFlow = flowIndicators.some(indicator => text.toLowerCase().includes(indicator));
        
        // Check for consistent tense and perspective
        const hasConsistentTense = !text.includes('will') || !text.includes('was');
        
        return (hasFlow ? 0.4 : 0.2) + (hasConsistentTense ? 0.4 : 0.2) + 0.2;
    }

    checkCompleteness(text, requestType) {
        // Check if response addresses the request type adequately
        const minLengths = {
            story_generation: 200,
            encounter_creation: 150,
            item_generation: 100,
            location_creation: 150,
            combat_encounter: 120,
            quest_progression: 80,
            comprehensive_response: 300
        };
        
        const minLength = minLengths[requestType] || 100;
        const lengthScore = Math.min(1.0, text.length / minLength);
        
        // Check for key elements based on request type
        let elementScore = 0.5;
        switch (requestType) {
            case 'story_generation':
                elementScore = (text.includes('story') || text.includes('narrative')) ? 0.8 : 0.3;
                break;
            case 'encounter_creation':
                elementScore = (text.includes('encounter') || text.includes('meet') || text.includes('face')) ? 0.8 : 0.3;
                break;
            case 'item_generation':
                elementScore = (text.includes('item') || text.includes('equipment') || text.includes('weapon')) ? 0.8 : 0.3;
                break;
        }
        
        return (lengthScore * 0.6) + (elementScore * 0.4);
    }

    checkRelevance(text, context) {
        // Check if response is relevant to the game context
        const theme = gameState.adventureTheme || context.theme || '';
        const goal = gameState.adventureGoal || context.goal || '';
        
        let relevanceScore = 0.5;
        
        if (theme && text.toLowerCase().includes(theme.toLowerCase())) {
            relevanceScore += 0.3;
        }
        
        if (goal && text.toLowerCase().includes(goal.toLowerCase().split(' ')[0])) {
            relevanceScore += 0.2;
        }
        
        return Math.min(1.0, relevanceScore);
    }

    checkConsistency(text, sharedContext) {
        // Check consistency with game state
        let consistencyScore = 0.7; // Base score
        
        // Check character name consistency
        const playerNames = sharedContext.gameState.players.map(p => p.name.toLowerCase());
        const textLower = text.toLowerCase();
        
        playerNames.forEach(name => {
            if (textLower.includes(name)) {
                consistencyScore += 0.1;
            }
        });
        
        return Math.min(1.0, consistencyScore);
    }

    /**
     * Apply quality optimizations
     */
    async applyQualityOptimizations(synthesizedResult, qualityChecks, context) {
        const log = window.displayVisualError || console.log;
        
        try {
            const optimizationPrompt = `Improve this AI-generated response to address quality issues:

ORIGINAL RESPONSE:
${synthesizedResult.synthesizedResult}

QUALITY ISSUES IDENTIFIED:
- Coherence: ${qualityChecks.coherence.toFixed(2)} (needs improvement if < 0.7)
- Completeness: ${qualityChecks.completeness.toFixed(2)} (needs improvement if < 0.7)
- Relevance: ${qualityChecks.relevance.toFixed(2)} (needs improvement if < 0.7)
- Consistency: ${qualityChecks.consistency.toFixed(2)} (needs improvement if < 0.7)

IMPROVEMENTS NEEDED:
${qualityChecks.coherence < 0.7 ? '- Improve narrative flow and coherence' : ''}
${qualityChecks.completeness < 0.7 ? '- Add more detail and completeness' : ''}
${qualityChecks.relevance < 0.7 ? '- Increase relevance to game context' : ''}
${qualityChecks.consistency < 0.7 ? '- Improve consistency with game state' : ''}

Create an improved version that addresses these issues while maintaining the core content.`;

            const optimizedResponse = await API.getAIResponse([
                { role: 'system', content: 'You are a quality optimization specialist. Improve the given response to address identified quality issues.' },
                { role: 'user', content: optimizationPrompt }
            ], {
                temperature: 0.6,
                max_tokens: 1000,
                operation: 'optimization'
            });
            
            log('LocalAIOrchestrator: Quality optimization applied successfully');
            return optimizedResponse;
            
        } catch (error) {
            log(`LocalAIOrchestrator: Quality optimization failed: ${error.message}`);
            return synthesizedResult.synthesizedResult;
        }
    }

    /**
     * Update agent performance metrics
     */
    updateAgentPerformance(agentId, executionTime, success, quality) {
        const performance = this.agentPerformance.get(agentId);
        if (!performance) return;
        
        performance.totalCalls++;
        performance.lastUsed = Date.now();
        
        // Update success rate with exponential moving average
        const alpha = 0.1;
        performance.successRate = (1 - alpha) * performance.successRate + alpha * (success ? 1 : 0);
        
        // Update average time
        performance.averageTime = (1 - alpha) * performance.averageTime + alpha * executionTime;
        
        // Update quality score
        if (success) {
            performance.qualityScore = (1 - alpha) * performance.qualityScore + alpha * quality;
        }
        
        this.agentPerformance.set(agentId, performance);
    }

    /**
     * Update metrics for multiple agents
     */
    updateAgentMetrics(agents, success) {
        agents.forEach(agent => {
            this.updateAgentPerformance(agent.id, 1000, success, success ? 0.8 : 0.2);
        });
    }

    /**
     * Handle orchestration failure with graceful degradation
     */
    async handleOrchestrationFailure(requestType, context, error) {
        const log = window.displayVisualError || console.log;
        log(`LocalAIOrchestrator: Attempting graceful degradation for ${requestType}`);
        
        try {
            // Fallback to simple AI call
            const fallbackPrompt = `Handle this ${requestType} request with basic AI processing:
            
Context: ${JSON.stringify(context, null, 2)}
Game State: Theme: ${gameState.adventureTheme}, Turn: ${gameState.turn}

Provide a basic but functional response.`;
            
            const fallbackResponse = await API.getAIResponse([
                { role: 'system', content: 'You are a fallback AI assistant handling a request when the multi-agent system failed.' },
                { role: 'user', content: fallbackPrompt }
            ]);
            
            return {
                result: fallbackResponse,
                metadata: {
                    fallbackUsed: true,
                    originalError: error.message,
                    agentContributions: [],
                    confidenceScore: 0.4,
                    qualityScore: 0.4,
                    timestamp: Date.now()
                }
            };
            
        } catch (fallbackError) {
            log(`LocalAIOrchestrator: Fallback also failed: ${fallbackError.message}`);
            throw new Error(`Multi-agent orchestration failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
        }
    }

    /**
     * Get orchestrator status and performance metrics
     */
    getStatus() {
        return {
            registeredAgents: Array.from(this.registeredAgents.keys()),
            agentPerformance: Object.fromEntries(this.agentPerformance),
            activeRequests: this.activeRequests.size,
            cacheSize: this.resultCache.size,
            isHealthy: true
        };
    }

    /**
     * Clear caches and reset performance metrics
     */
    reset() {
        this.resultCache.clear();
        this.contextSharing.clear();
        this.activeRequests.clear();
        
        // Reset performance metrics to defaults
        this.agentPerformance.forEach((performance, agentId) => {
            this.agentPerformance.set(agentId, {
                successRate: 1.0,
                averageTime: 1000,
                qualityScore: 1.0,
                lastUsed: 0,
                totalCalls: 0
            });
        });
        
        console.log('LocalAIOrchestrator: Reset completed');
    }
}

// Create and export global instance
export const localAIOrchestrator = new LocalAIOrchestrator();
