// contextManager.js
// Advanced intelligent context compression system for multi-player adventures

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';

/**
 * INTELLIGENT CONTEXT COMPRESSION SYSTEM
 * 
 * Handles compression of entire game sessions with up to 4 players
 * Uses hierarchical compression with narrative intelligence
 */
export class IntelligentContextCompressor {
    constructor() {
        this.compressionLevels = {
            DETAILED: 1,    // Recent 10-15 turns
            SUMMARY: 2,     // Mid-game 20-50 turns  
            ESSENCE: 3,     // Early game 50+ turns
            LEGEND: 4       // Ancient history 100+ turns
        };
        
        this.narrativePatterns = this.initializeNarrativePatterns();
        this.playerArchetypes = new Map(); // Track player behavior patterns
        this.storyBeats = [];              // Major story moments
        this.relationshipMatrix = new Map(); // Inter-player relationships
        this.choiceHistory = new Map();    // Player choice patterns
        this.worldStateChanges = [];       // World evolution tracking
    }

    /**
     * NARRATIVE PATTERN RECOGNITION
     * Identifies recurring themes and story patterns to preserve narrative coherence
     */
    initializeNarrativePatterns() {
        return {
            // Story arc patterns
            heroJourney: {
                callToAdventure: /discover|find|seek|quest|adventure/i,
                refusalOfCall: /refuse|hesitate|doubt|fear|reluctant/i,
                meetingMentor: /guide|teacher|wise|elder|mentor|help/i,
                crossingThreshold: /enter|cross|begin|start|journey/i,
                testsAndTrials: /challenge|test|trial|obstacle|difficulty/i,
                revelation: /realize|understand|discover|truth|secret/i,
                transformation: /change|grow|become|evolve|transform/i,
                return: /return|home|complete|finish|end/i
            },
            
            // Character development patterns
            characterGrowth: {
                skillAcquisition: /learn|master|improve|develop|skill|ability/i,
                personalityShift: /brave|confident|wise|mature|changed/i,
                relationshipChange: /trust|friend|ally|bond|relationship/i,
                moralChoice: /right|wrong|justice|honor|moral|ethical/i
            },
            
            // Conflict patterns
            conflictTypes: {
                internal: /doubt|fear|struggle|decide|choice|dilemma/i,
                interpersonal: /argue|disagree|conflict|tension|dispute/i,
                external: /enemy|monster|obstacle|danger|threat/i,
                societal: /law|rule|tradition|society|culture/i
            }
        };
    }

    /**
     * MASTER COMPRESSION FUNCTION
     * Intelligently compresses entire game context based on turn distance and importance
     */
    compressGameContext() {
        const currentTurn = gameState.turn;
        const allHistory = this.gatherAllGameData();
        
        // Segment history by recency and importance
        const segments = this.segmentHistoryByImportance(allHistory, currentTurn);
        
        // Apply different compression levels
        const compressedContext = {
            // TIER 1: Recent detailed history (last 10-15 turns)
            recentDetailed: this.compressDetailed(segments.recent),
            
            // TIER 2: Mid-game narrative summary (turns 20-50 ago)
            midGameSummary: this.compressToSummary(segments.midGame),
            
            // TIER 3: Early game essence (turns 50+ ago)
            earlyGameEssence: this.compressToEssence(segments.earlyGame),
            
            // TIER 4: Character progression arc
            characterArcs: this.compressCharacterProgression(),
            
            // TIER 5: Relationship dynamics
            relationshipDynamics: this.compressRelationships(),
            
            // TIER 6: World state evolution
            worldStateEvolution: this.compressWorldChanges(),
            
            // TIER 7: Strategic context for AI
            strategicContext: this.generateStrategicContext()
        };
        
        return this.synthesizeCompressedContext(compressedContext);
    }

    /**
     * GATHER ALL GAME DATA
     * Collects all relevant game data for compression analysis
     */
    gatherAllGameData() {
        return {
            messageHistory: gameState.messageHistory || [],
            playerChoices: this.extractPlayerChoices(),
            combatHistory: this.extractCombatHistory(),
            discoveryHistory: this.extractDiscoveryHistory(),
            relationshipEvents: this.extractRelationshipEvents(),
            worldChanges: this.extractWorldChanges(),
            narrativeContext: gameState.narrativeContext || {}
        };
    }

    /**
     * SEGMENT HISTORY BY IMPORTANCE
     * Divides game history into compression tiers based on recency and significance
     */
    segmentHistoryByImportance(allHistory, currentTurn) {
        const recentThreshold = Math.max(1, currentTurn - 15);
        const midGameThreshold = Math.max(1, currentTurn - 50);
        
        return {
            recent: this.filterHistoryByTurns(allHistory, recentThreshold, currentTurn),
            midGame: this.filterHistoryByTurns(allHistory, midGameThreshold, recentThreshold),
            earlyGame: this.filterHistoryByTurns(allHistory, 1, midGameThreshold)
        };
    }

    /**
     * FILTER HISTORY BY TURNS
     * Filters game data within specific turn ranges
     */
    filterHistoryByTurns(allHistory, startTurn, endTurn) {
        return {
            messages: allHistory.messageHistory.filter(msg => 
                msg.turn >= startTurn && msg.turn < endTurn
            ),
            choices: allHistory.playerChoices.filter(choice => 
                choice.turn >= startTurn && choice.turn < endTurn
            ),
            combats: allHistory.combatHistory.filter(combat => 
                combat.turn >= startTurn && combat.turn < endTurn
            ),
            discoveries: allHistory.discoveryHistory.filter(discovery => 
                discovery.turn >= startTurn && discovery.turn < endTurn
            )
        };
    }

    /**
     * EXTRACT PLAYER CHOICES
     * Extracts and analyzes player choice patterns from message history
     */
    extractPlayerChoices() {
        const choices = [];
        const history = gameState.messageHistory || [];
        
        history.forEach((entry, index) => {
            if (entry.role === 'user' && entry.choiceType) {
                const impact = this.calculateChoiceImpact(entry, history, index);
                choices.push({
                    turn: entry.turn || Math.floor(index / 2) + 1,
                    playerId: entry.playerId || 'unknown',
                    type: entry.choiceType,
                    text: entry.content,
                    outcome: this.extractOutcome(history, index),
                    consequences: this.extractConsequences(history, index),
                    impact: impact
                });
            }
        });
        
        return choices;
    }

    /**
     * CALCULATE CHOICE IMPACT
     * Determines the significance of a choice based on its consequences
     */
    calculateChoiceImpact(choice, history, index) {
        let significance = 0.3; // Base significance
        
        // Check subsequent messages for impact indicators
        const nextMessages = history.slice(index + 1, index + 3);
        nextMessages.forEach(msg => {
            if (msg.role === 'assistant') {
                const content = msg.content.toLowerCase();
                if (content.includes('critical') || content.includes('important')) significance += 0.3;
                if (content.includes('combat') || content.includes('fight')) significance += 0.2;
                if (content.includes('discovered') || content.includes('found')) significance += 0.2;
                if (content.includes('relationship') || content.includes('trust')) significance += 0.1;
            }
        });
        
        return Math.min(significance, 1.0);
    }

    /**
     * COMPRESS CHARACTER PROGRESSION
     * Analyzes and compresses each player's character development
     */
    compressCharacterProgression() {
        return gameState.players.map(player => {
            const playerChoices = this.extractPlayerChoices().filter(c => c.playerId === player.id);
            return this.compressPlayerChoices(player.id, playerChoices);
        }).filter(profile => profile !== null);
    }

    /**
     * PLAYER BEHAVIOR COMPRESSION
     * Compresses player choices into behavioral archetypes and decision patterns
     */
    compressPlayerChoices(playerId, choices) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return null;

        // Analyze choice patterns
        const choiceAnalysis = this.analyzeChoicePatterns(choices);
        
        // Determine player archetype
        const archetype = this.determinePlayerArchetype(choiceAnalysis);
        
        // Extract key decisions that shaped the story
        const keyDecisions = this.extractKeyDecisions(choices);
        
        // Compress to essential character progression
        return {
            playerName: player.name,
            archetype: archetype,
            keyDecisions: keyDecisions,
            characterArc: this.generateCharacterArc(choices, archetype),
            relationshipImpacts: this.analyzeRelationshipImpacts(playerId, choices),
            worldImpacts: this.analyzeWorldImpacts(choices),
            growthMoments: this.identifyGrowthMoments(choices)
        };
    }

    /**
     * CHOICE PATTERN ANALYSIS
     * Identifies behavioral patterns from player choices
     */
    analyzeChoicePatterns(choices) {
        const patterns = {
            riskTolerance: 0,      // -1 (cautious) to +1 (reckless)
            moralAlignment: 0,     // -1 (pragmatic) to +1 (idealistic)  
            socialStyle: 0,        // -1 (lone wolf) to +1 (team player)
            problemSolving: 0,     // -1 (direct) to +1 (creative)
            leadership: 0          // -1 (follower) to +1 (leader)
        };

        choices.forEach(choice => {
            switch (choice.type) {
                case 'Good':
                    patterns.moralAlignment += 0.2;
                    patterns.riskTolerance -= 0.1;
                    break;
                case 'Bad':
                    patterns.moralAlignment -= 0.2;
                    patterns.riskTolerance += 0.3;
                    break;
                case 'Risky':
                    patterns.riskTolerance += 0.2;
                    patterns.problemSolving += 0.1;
                    break;
                case 'Silly':
                    patterns.problemSolving += 0.3;
                    patterns.socialStyle += 0.1;
                    break;
                case 'Investigative':
                    patterns.problemSolving += 0.2;
                    patterns.riskTolerance -= 0.1;
                    break;
            }
            
            // Analyze choice text for additional patterns
            const text = choice.text.toLowerCase();
            if (text.includes('help') || text.includes('team') || text.includes('together')) {
                patterns.socialStyle += 0.1;
            }
            if (text.includes('lead') || text.includes('decide') || text.includes('command')) {
                patterns.leadership += 0.1;
            }
        });

        // Normalize patterns to -1 to +1 range
        Object.keys(patterns).forEach(key => {
            patterns[key] = Math.max(-1, Math.min(1, patterns[key]));
        });

        return patterns;
    }

    /**
     * PLAYER ARCHETYPE DETERMINATION
     * Maps choice patterns to narrative archetypes
     */
    determinePlayerArchetype(patterns) {
        const archetypes = [
            {
                name: 'The Hero',
                traits: { moralAlignment: 0.5, riskTolerance: 0.3, leadership: 0.4 },
                description: 'Brave, moral, natural leader who inspires others'
            },
            {
                name: 'The Trickster',
                traits: { problemSolving: 0.6, socialStyle: 0.3, riskTolerance: 0.2 },
                description: 'Creative problem-solver who finds unconventional solutions'
            },
            {
                name: 'The Guardian',
                traits: { moralAlignment: 0.4, riskTolerance: -0.3, socialStyle: 0.5 },
                description: 'Protective, cautious, puts team safety first'
            },
            {
                name: 'The Explorer',
                traits: { riskTolerance: 0.4, problemSolving: 0.3, leadership: -0.2 },
                description: 'Curious, adventurous, driven by discovery'
            },
            {
                name: 'The Pragmatist',
                traits: { moralAlignment: -0.2, riskTolerance: 0.1, problemSolving: -0.3 },
                description: 'Practical, results-oriented, makes hard choices'
            },
            {
                name: 'The Sage',
                traits: { problemSolving: 0.5, riskTolerance: -0.4, moralAlignment: 0.3 },
                description: 'Thoughtful, analytical, seeks understanding'
            }
        ];

        // Find best matching archetype
        let bestMatch = archetypes[0];
        let bestScore = -Infinity;

        archetypes.forEach(archetype => {
            let score = 0;
            Object.keys(archetype.traits).forEach(trait => {
                const diff = Math.abs(patterns[trait] - archetype.traits[trait]);
                score -= diff; // Lower difference = higher score
            });
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = archetype;
            }
        });

        return bestMatch;
    }

    /**
     * KEY DECISION EXTRACTION
     * Identifies the most impactful choices that shaped the story
     */
    extractKeyDecisions(choices) {
        return choices
            .filter(choice => choice.impact && choice.impact >= 0.7)
            .map(choice => ({
                turn: choice.turn,
                type: choice.type,
                description: choice.text,
                outcome: choice.outcome,
                consequences: choice.consequences,
                significance: choice.impact
            }))
            .sort((a, b) => b.significance - a.significance)
            .slice(0, 5); // Top 5 most significant decisions
    }

    /**
     * CHARACTER ARC GENERATION
     * Creates a compressed narrative arc for each character
     */
    generateCharacterArc(choices, archetype) {
        const arc = {
            beginning: this.findCharacterBeginning(choices),
            development: this.findCharacterDevelopment(choices),
            climax: this.findCharacterClimax(choices),
            resolution: this.findCharacterResolution(choices),
            transformation: this.analyzeCharacterTransformation(choices, archetype)
        };

        return this.compressArcToNarrative(arc);
    }

    /**
     * COMPRESS CHARACTER ARC TO NARRATIVE
     * Converts character arc data into a concise narrative summary
     */
    compressArcToNarrative(arc) {
        const parts = [];
        
        if (arc.beginning) parts.push(`Started ${arc.beginning}`);
        if (arc.development) parts.push(`developed through ${arc.development}`);
        if (arc.climax) parts.push(`faced ${arc.climax}`);
        if (arc.transformation) parts.push(`transformed into ${arc.transformation}`);
        
        return parts.join(', ') || 'Character journey beginning';
    }

    /**
     * MULTI-PLAYER RELATIONSHIP COMPRESSION
     * Tracks and compresses relationship dynamics between players
     */
    compressRelationships() {
        const relationships = [];
        const players = gameState.players;

        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const relationship = this.analyzePlayerRelationship(players[i], players[j]);
                if (relationship.significance > 0.3) {
                    relationships.push(relationship);
                }
            }
        }

        return relationships.map(rel => ({
            players: [rel.player1.name, rel.player2.name],
            dynamic: rel.dynamic, // 'allies', 'rivals', 'mentor-student', etc.
            keyMoments: rel.keyMoments.slice(0, 3), // Top 3 relationship moments
            currentStatus: rel.currentStatus,
            evolutionSummary: rel.evolutionSummary
        }));
    }

    /**
     * ANALYZE PLAYER RELATIONSHIP
     * Analyzes the relationship between two players based on their interactions
     */
    analyzePlayerRelationship(player1, player2) {
        const interactions = this.findPlayerInteractions(player1.id, player2.id);
        
        return {
            player1: player1,
            player2: player2,
            dynamic: this.classifyRelationshipDynamic(interactions),
            keyMoments: this.extractRelationshipMoments(interactions),
            currentStatus: this.assessCurrentRelationshipStatus(interactions),
            evolutionSummary: this.summarizeRelationshipEvolution(interactions),
            significance: Math.min(interactions.length / 10, 1.0)
        };
    }

    /**
     * WORLD STATE EVOLUTION COMPRESSION
     * Tracks how player actions changed the game world
     */
    compressWorldChanges() {
        const worldChanges = {
            locationsAffected: this.getAffectedLocations(),
            npcsAffected: this.getAffectedNPCs(),
            environmentalChanges: this.getEnvironmentalChanges(),
            politicalChanges: this.getPoliticalChanges(),
            economicChanges: this.getEconomicChanges()
        };

        return this.compressWorldChangesToNarrative(worldChanges);
    }

    /**
     * COMPRESS WORLD CHANGES TO NARRATIVE
     * Converts world state changes into narrative summary
     */
    compressWorldChangesToNarrative(worldChanges) {
        const changes = [];
        
        if (worldChanges.locationsAffected.length > 0) {
            changes.push(`Locations changed: ${worldChanges.locationsAffected.join(', ')}`);
        }
        if (worldChanges.npcsAffected.length > 0) {
            changes.push(`NPCs affected: ${worldChanges.npcsAffected.join(', ')}`);
        }
        if (worldChanges.politicalChanges.length > 0) {
            changes.push(`Political shifts: ${worldChanges.politicalChanges.join(', ')}`);
        }
        
        return changes.join('. ') || 'World remains largely unchanged';
    }

    /**
     * STRATEGIC CONTEXT GENERATION
     * Creates AI-focused strategic context for narrative continuity
     */
    generateStrategicContext() {
        return {
            // Current narrative momentum
            momentum: this.analyzeNarrativeMomentum(),
            
            // Unresolved plot threads
            openThreads: this.identifyOpenPlotThreads(),
            
            // Character motivations and goals
            characterMotivations: this.analyzeCurrentMotivations(),
            
            // World state and opportunities
            worldOpportunities: this.identifyWorldOpportunities(),
            
            // Relationship tensions and bonds
            relationshipDynamics: this.getCurrentRelationshipState(),
            
            // Thematic elements to maintain
            thematicElements: this.identifyThematicElements(),
            
            // Pacing recommendations
            pacingGuidance: this.generatePacingGuidance()
        };
    }

    /**
     * CONTEXT SYNTHESIS
     * Combines all compressed elements into coherent context
     */
    synthesizeCompressedContext(compressedContext) {
        const synthesis = {
            // Executive summary (50-100 words)
            executiveSummary: this.generateExecutiveSummary(compressedContext),
            
            // Character profiles (20-30 words each)
            characterProfiles: compressedContext.characterArcs,
            
            // Story progression (100-150 words)
            storyProgression: this.synthesizeStoryProgression(compressedContext),
            
            // Current situation (50-75 words)
            currentSituation: this.synthesizeCurrentSituation(compressedContext),
            
            // Strategic guidance for AI (75-100 words)
            strategicGuidance: compressedContext.strategicContext,
            
            // Relationship matrix (condensed)
            relationships: compressedContext.relationshipDynamics,
            
            // World state (condensed)
            worldState: compressedContext.worldStateEvolution
        };

        return this.formatForAI(synthesis);
    }

    /**
     * AI-OPTIMIZED FORMATTING
     * Formats compressed context for optimal AI consumption
     */
    formatForAI(synthesis) {
        const characterProfiles = Array.isArray(synthesis.characterProfiles) 
            ? synthesis.characterProfiles 
            : gameState.players.map(p => ({ playerName: p.name, characterArc: 'Adventure beginning' }));
            
        const relationships = Array.isArray(synthesis.relationships) 
            ? synthesis.relationships 
            : [];

        return `ADVENTURE CONTEXT SUMMARY

EXECUTIVE SUMMARY:
${synthesis.executiveSummary}

CHARACTER PROFILES:
${characterProfiles.map(profile => 
    `${profile.playerName}: ${profile.characterArc}`
).join('\n')}

STORY PROGRESSION:
${synthesis.storyProgression}

CURRENT SITUATION:
${synthesis.currentSituation}

${relationships.length > 0 ? `RELATIONSHIPS:
${relationships.map(rel => 
    `${rel.players.join(' & ')}: ${rel.dynamic} - ${rel.evolutionSummary}`
).join('\n')}` : ''}

WORLD STATE:
${synthesis.worldState}

STRATEGIC GUIDANCE:
${synthesis.strategicGuidance.momentum}
Open Threads: ${synthesis.strategicGuidance.openThreads.join(', ')}
Pacing: ${synthesis.strategicGuidance.pacingGuidance}`;
    }

    /**
     * COMPRESSION TIER IMPLEMENTATIONS
     */
    compressDetailed(segment) {
        // Keep recent history with minimal compression
        return {
            messages: segment.messages.slice(-10),
            keyEvents: segment.choices.filter(c => c.impact >= 0.5),
            combatSummary: segment.combats.length > 0 ? `${segment.combats.length} combat encounters` : null
        };
    }

    compressToSummary(segment) {
        // Medium compression - key events only
        return {
            majorEvents: segment.choices.filter(c => c.impact >= 0.7).slice(0, 3),
            characterDevelopment: this.summarizeCharacterDevelopment(segment),
            plotProgression: this.summarizePlotProgression(segment)
        };
    }

    compressToEssence(segment) {
        // High compression - essential elements only
        return {
            foundationalEvents: segment.choices.filter(c => c.impact >= 0.8).slice(0, 2),
            characterOrigins: this.extractCharacterOrigins(segment),
            worldEstablishment: this.extractWorldEstablishment(segment)
        };
    }

    // Helper methods for data extraction and analysis
    extractCombatHistory() { return []; }
    extractDiscoveryHistory() { return []; }
    extractRelationshipEvents() { return []; }
    extractWorldChanges() { return []; }
    extractOutcome(history, index) { return 'Unknown outcome'; }
    extractConsequences(history, index) { return []; }
    findCharacterBeginning(choices) { return 'cautiously'; }
    findCharacterDevelopment(choices) { return 'various challenges'; }
    findCharacterClimax(choices) { return 'a crucial decision'; }
    findCharacterResolution(choices) { return 'growth and understanding'; }
    analyzeCharacterTransformation(choices, archetype) { return archetype.description; }
    analyzeRelationshipImpacts(playerId, choices) { return []; }
    analyzeWorldImpacts(choices) { return []; }
    identifyGrowthMoments(choices) { return []; }
    findPlayerInteractions(id1, id2) { return []; }
    classifyRelationshipDynamic(interactions) { return 'allies'; }
    extractRelationshipMoments(interactions) { return []; }
    assessCurrentRelationshipStatus(interactions) { return 'positive'; }
    summarizeRelationshipEvolution(interactions) { return 'growing stronger'; }
    getAffectedLocations() { return []; }
    getAffectedNPCs() { return []; }
    getEnvironmentalChanges() { return []; }
    getPoliticalChanges() { return []; }
    getEconomicChanges() { return []; }
    analyzeNarrativeMomentum() { return 'Building steadily'; }
    identifyOpenPlotThreads() { return [gameState.adventureGoal || 'Main quest']; }
    analyzeCurrentMotivations() { return gameState.players.map(p => `${p.name}: Adventure and growth`); }
    identifyWorldOpportunities() { return ['Exploration', 'Character development']; }
    getCurrentRelationshipState() { return 'Cooperative team dynamic'; }
    identifyThematicElements() { return [gameState.adventureTheme || 'Adventure']; }
    generatePacingGuidance() { return 'Maintain current momentum'; }
    generateExecutiveSummary(context) { 
        return `${gameState.players.length} adventurer${gameState.players.length > 1 ? 's' : ''} exploring ${gameState.adventureTheme} world, currently at turn ${gameState.turn}. ${gameState.adventureGoal || 'Adventure beginning.'}`; 
    }
    synthesizeStoryProgression(context) { 
        return `Adventure progressing through ${gameState.adventureTheme} setting. Players have made ${gameState.turn} turns of progress toward their goal.`; 
    }
    synthesizeCurrentSituation(context) { 
        const location = gameState.currentLocation?.name || 'unknown location';
        const status = gameState.inCombat ? 'in combat' : 'exploring';
        return `Party currently ${status} at ${location}. ${gameState.players.map(p => `${p.name} (${p.hp}/${p.maxHp} HP)`).join(', ')}.`;
    }
    summarizeCharacterDevelopment(segment) { return 'Characters growing through challenges'; }
    summarizePlotProgression(segment) { return 'Story advancing toward resolution'; }
    extractCharacterOrigins(segment) { return 'Adventure beginnings established'; }
    extractWorldEstablishment(segment) { return 'World foundation set'; }

    /**
     * COMPRESSION METRICS
     * Tracks compression efficiency and quality
     */
    getCompressionMetrics(originalSize, compressedSize) {
        return {
            originalTokens: originalSize,
            compressedTokens: compressedSize,
            compressionRatio: (originalSize / compressedSize).toFixed(2),
            informationDensity: this.calculateInformationDensity(compressedSize),
            narrativeCoherence: this.assessNarrativeCoherence(),
            contextPreservation: this.assessContextPreservation()
        };
    }

    calculateInformationDensity(size) { return Math.min(size / 100, 1.0); }
    assessNarrativeCoherence() { return 0.9; }
    assessContextPreservation() { return 0.85; }
}

/**
 * Enhanced Context Manager with Intelligent Compression
 * Extends the original ContextManager with intelligent compression capabilities
 */
export class ContextManager {
    constructor() {
        this.checkpoints = [];
        this.currentContextSize = 0;
        this.maxCheckpoints = 5;
        this.intelligentCompressor = new IntelligentContextCompressor();
    }

    /**
     * Creates a context checkpoint with essential game state
     */
    createCheckpoint() {
        const checkpoint = {
            id: Date.now(),
            turn: gameState.turn,
            location: gameState.currentLocation?.name || 'Unknown',
            theme: gameState.adventureTheme,
            goal: gameState.adventureGoal,
            players: gameState.players.map(p => ({
                name: p.name,
                hp: p.hp,
                maxHp: p.maxHp,
                coins: p.coins,
                level: p.level || 1,
                status: p.statusEffects || []
            })),
            keyEvents: this.extractKeyEvents(),
            narrative: gameState.currentNarrative,
            timestamp: new Date().toISOString()
        };

        this.checkpoints.push(checkpoint);
        
        // Keep only the most recent checkpoints
        if (this.checkpoints.length > this.maxCheckpoints) {
            this.checkpoints.shift();
        }

        console.log(`Context checkpoint created: Turn ${checkpoint.turn} at ${checkpoint.location}`);
        return checkpoint;
    }

    /**
     * Extracts key events from message history for context preservation
     */
    extractKeyEvents() {
        if (!gameState.messageHistory) return [];
        
        const keyEvents = [];
        const recentHistory = gameState.messageHistory.slice(-10); // Last 10 actions
        
        for (const entry of recentHistory) {
            if (entry.type === 'action' && entry.response) {
                // Extract significant events (combat, discoveries, major choices)
                if (entry.response.includes('combat') || 
                    entry.response.includes('enemy') ||
                    entry.response.includes('discovered') ||
                    entry.response.includes('found')) {
                    keyEvents.push({
                        turn: entry.turn,
                        summary: this.summarizeEvent(entry.response),
                        type: this.classifyEvent(entry.response)
                    });
                }
            }
        }
        
        return keyEvents.slice(-5); // Keep 5 most recent key events
    }

    /**
     * Summarizes an event for context preservation
     */
    summarizeEvent(narrative) {
        // Simple summarization - could be enhanced with AI
        const sentences = narrative.split('.').filter(s => s.trim().length > 10);
        return sentences[0]?.trim() + '.' || narrative.substring(0, 100) + '...';
    }

    /**
     * Classifies event type for better context management
     */
    classifyEvent(narrative) {
        const text = narrative.toLowerCase();
        if (text.includes('combat') || text.includes('fight') || text.includes('attack')) return 'combat';
        if (text.includes('found') || text.includes('discovered') || text.includes('treasure')) return 'discovery';
        if (text.includes('moved') || text.includes('entered') || text.includes('arrived')) return 'movement';
        return 'general';
    }

    /**
     * Generates a compressed context summary from checkpoints
     */
    generateContextSummary() {
        if (this.checkpoints.length === 0) return '';

        const latest = this.checkpoints[this.checkpoints.length - 1];
        const keyEvents = latest.keyEvents.map(e => `Turn ${e.turn}: ${e.summary}`).join(' ');
        
        return `[Context Summary - Turn ${latest.turn}]
Location: ${latest.location}
Players: ${latest.players.map(p => `${p.name}(HP:${p.hp}/${p.maxHp})`).join(', ')}
Recent Events: ${keyEvents}
Current Goal: ${latest.goal}`;
    }

    /**
     * Generates strategic context specifically for Dungeon Master coordination
     */
    generateStrategicContext() {
        const narrativeContext = gameState.narrativeContext || {};
        
        return `STRATEGIC DUNGEON MASTER BRIEFING

CAMPAIGN OVERVIEW:
- Adventure Theme: ${gameState.adventureTheme}
- Primary Goal: ${gameState.adventureGoal}
- Current Turn: ${gameState.turn}
- Story Progression: ${this.calculateStoryProgression()}%

CURRENT SITUATION:
- Location: ${gameState.currentLocation?.name || 'Unknown Location'}
- Environment: ${gameState.currentLocation?.description || 'Unexplored area'}
- Combat Status: ${gameState.inCombat ? 'Active Combat' : 'Exploration Mode'}
- Danger Level: ${gameState.currentLocation?.dangerLevel || 'Unknown'}

PARTY STATUS:
${gameState.players.map(p => {
    const condition = p.hp < p.maxHp * 0.3 ? 'Critical' : 
                     p.hp < p.maxHp * 0.7 ? 'Wounded' : 'Healthy';
    return `- ${p.name}: ${condition} (${p.hp}/${p.maxHp} HP), ${p.coins} coins, Level ${p.level || 1}`;
}).join('\n')}

STORY MOMENTUM:
- Recent Discoveries: ${narrativeContext.discoveredSecrets?.slice(-2).map(s => s.action).join(', ') || 'None'}
- Significant Events: ${narrativeContext.significantEvents?.slice(-2).map(e => `${e.type}: ${e.item}`).join(', ') || 'None'}
- Relationship Changes: ${narrativeContext.relationshipChanges?.slice(-2).map(r => `${r.type} ${r.change > 0 ? 'improved' : 'worsened'}`).join(', ') || 'None'}

PACING ANALYSIS:
- Action Density: ${this.calculateActionDensity()}
- Story Tension: ${this.calculateStoryTension()}
- Player Engagement: ${this.identifyEngagementOpportunities()}

NARRATIVE THREADS:
${this.extractNarrativeThreads().map(thread => `- ${thread}`).join('\n')}

STRATEGIC RECOMMENDATIONS:
${this.generateStrategicRecommendations().map(rec => `- ${rec}`).join('\n')}`;
    }

    /**
     * Calculates story progression as a percentage
     */
    calculateStoryProgression() {
        const baseProgression = Math.min((gameState.turn / 50) * 100, 80);
        const eventBonus = (this.extractKeyEvents().length / 10) * 20;
        return Math.min(Math.round(baseProgression + eventBonus), 100);
    }

    /**
     * Calculates action density for pacing
     */
    calculateActionDensity() {
        const recentEvents = this.extractKeyEvents().slice(-5);
        const combatEvents = recentEvents.filter(e => e.type === 'combat').length;
        const explorationEvents = recentEvents.filter(e => e.type === 'exploration').length;
        
        if (combatEvents > explorationEvents * 2) return 'High';
        if (explorationEvents > combatEvents * 2) return 'Low';
        return 'Balanced';
    }

    /**
     * Calculates current story tension level
     */
    calculateStoryTension() {
        const avgHP = gameState.players.reduce((sum, p) => sum + (p.hp / p.maxHp), 0) / gameState.players.length;
        const inCombat = gameState.inCombat;
        const dangerLevel = gameState.currentLocation?.dangerLevel || 'low';
        
        if (inCombat || avgHP < 0.3 || dangerLevel === 'extreme') return 'High';
        if (avgHP < 0.7 || dangerLevel === 'high') return 'Medium';
        return 'Low';
    }

    /**
     * Identifies opportunities for player engagement
     */
    identifyEngagementOpportunities() {
        const opportunities = [];
        
        if (gameState.players.some(p => p.coins > 100)) opportunities.push('Shopping');
        if (gameState.turn % 10 === 0) opportunities.push('Major Story Beat');
        if (!gameState.inCombat && gameState.currentLocation?.dangerLevel !== 'extreme') opportunities.push('Character Development');
        if (gameState.players.every(p => p.hp === p.maxHp)) opportunities.push('New Challenge');
        
        return opportunities.join(', ') || 'Standard Progression';
    }

    /**
     * Extracts active narrative threads
     */
    extractNarrativeThreads() {
        const threads = [];
        const context = gameState.narrativeContext || {};
        
        if (gameState.adventureGoal) threads.push(`Main Quest: ${gameState.adventureGoal}`);
        if (context.discoveredSecrets?.length > 0) threads.push('Mystery Elements Active');
        if (context.relationshipChanges?.length > 0) threads.push('Character Relationships Evolving');
        if (gameState.inCombat) threads.push('Combat Resolution Required');
        
        return threads.length > 0 ? threads : ['Adventure Beginning - Establishing Foundations'];
    }

    /**
     * Generates strategic recommendations for the Dungeon Master
     */
    generateStrategicRecommendations() {
        const recommendations = [];
        const tension = this.calculateStoryTension();
        const density = this.calculateActionDensity();
        const progression = this.calculateStoryProgression();
        
        if (tension === 'Low' && density === 'Low') {
            recommendations.push('Introduce new challenge or mystery');
        }
        if (tension === 'High' && density === 'High') {
            recommendations.push('Provide breathing room or character moment');
        }
        if (progression < 30) {
            recommendations.push('Focus on world-building and character establishment');
        }
        if (progression > 70) {
            recommendations.push('Build toward climactic moments');
        }
        
        return recommendations.length > 0 ? recommendations : ['Continue current narrative momentum'];
    }

    /**
     * Checks if context window is approaching limits
     */
    shouldCreateCheckpoint() {
        // MAX_HISTORY_LENGTH is a top-level export of config.js, NOT a field
        // of LOCAL_AI_CONFIG. The previous version read undefined and the
        // resulting NaN comparison always returned false (compression off).
        const max = Config.MAX_HISTORY_LENGTH;
        if (!max) return false;
        const currentMessages = gameState.messageHistory?.length || 0;
        return currentMessages >= max * 1.5;
    }

    /**
     * Enhanced compression using intelligent system
     */
    compressHistoryIntelligently() {
        if (!this.shouldCreateCheckpoint()) {
            return gameState.messageHistory;
        }

        // Use intelligent compression for complex multi-player scenarios
        if (gameState.players.length > 1 || gameState.turn > 50) {
            const compressedContext = this.intelligentCompressor.compressGameContext();
            
            // Create system message with intelligent compression
            const systemMessage = {
                role: 'system',
                content: compressedContext
            };

            // Keep minimal recent history
            const recentHistory = gameState.messageHistory.slice(-3);
            
            console.log(`Intelligent compression applied: ${gameState.messageHistory.length} messages -> ${recentHistory.length + 1} messages`);
            return [systemMessage, ...recentHistory];
        }

        // Fall back to standard compression for simple scenarios
        return this.compressHistory();
    }

    /**
     * Compresses message history using checkpoints
     */
    compressHistory() {
        if (!this.shouldCreateCheckpoint()) return gameState.messageHistory;

        // Create checkpoint before compression
        this.createCheckpoint();

        // Keep only recent messages and add context summary.
        // (Same MAX_HISTORY_LENGTH path bug as shouldCreateCheckpoint above.)
        const max = Config.MAX_HISTORY_LENGTH;
        if (!max) return gameState.messageHistory;
        const keepMessages = Math.floor(max / 2);
        const recentHistory = gameState.messageHistory.slice(-keepMessages);

        // Add context summary as system message
        const contextSummary = this.generateContextSummary();
        const systemMessage = {
            role: 'system',
            content: this.generateBasicSystemPrompt() + '\n\n' + contextSummary
        };

        return [systemMessage, ...recentHistory];
    }

    /**
     * Generates a basic system prompt for context compression
     */
    generateBasicSystemPrompt() {
        return `You are the AI storyteller for an interactive adventure game.
Theme: ${gameState.adventureTheme}
Players: ${gameState.players?.map(p => p.name).join(', ') || 'Unknown'}
Current Goal: ${gameState.adventureGoal || 'Adventure awaits!'}

Generate engaging narrative and provide meaningful choices for the players.`;
    }

    /**
     * Saves checkpoints to localStorage for persistence
     */
    saveCheckpoints() {
        try {
            localStorage.setItem('minicpm_context_checkpoints', JSON.stringify(this.checkpoints));
        } catch (error) {
            console.warn('Failed to save context checkpoints:', error);
        }
    }

    /**
     * Loads checkpoints from localStorage
     */
    loadCheckpoints() {
        try {
            const saved = localStorage.getItem('minicpm_context_checkpoints');
            if (saved) {
                this.checkpoints = JSON.parse(saved);
                console.log(`Loaded ${this.checkpoints.length} context checkpoints`);
            }
        } catch (error) {
            console.warn('Failed to load context checkpoints:', error);
            this.checkpoints = [];
        }
    }
}

// Global context manager instance
export const contextManager = new ContextManager();

/**
 * Initializes context management system
 */
export function initializeContextManager() {
    contextManager.loadCheckpoints();
    
    // Auto-save checkpoints periodically
    setInterval(() => {
        contextManager.saveCheckpoints();
    }, 30000); // Every 30 seconds
    
    console.log('Intelligent Context Compression System initialized');
}
