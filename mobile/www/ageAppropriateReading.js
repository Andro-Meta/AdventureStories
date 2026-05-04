/**
 * Age-Appropriate Reading System
 * Creates story content that matches real book page lengths and reading levels
 * Ensures engaging, properly-sized content for each age group
 */

import { gameState } from './state.js?cb=014';

/**
 * Reading level specifications based on actual children's and adult literature
 * Calibrated to real book page lengths and vocabulary complexity
 */
const READING_SPECIFICATIONS = {
    // Early Elementary (Ages 6-8) - Picture books transitioning to chapter books
    early_elementary: {
        ageRange: [6, 8],
        targetWordCount: { min: 150, max: 250 },
        sentenceLength: { min: 8, max: 15 },
        paragraphCount: { min: 2, max: 3 },
        vocabularyLevel: 'simple',
        readingTime: '2-3 minutes',
        bookComparison: 'Like a page from "Magic Tree House" or "Junie B. Jones"',
        characteristics: [
            'Short, clear sentences',
            'Familiar vocabulary with occasional new words',
            'Direct action and clear emotions',
            'Simple cause and effect relationships',
            'Descriptive but not overwhelming details'
        ]
    },
    
    // Late Elementary (Ages 9-12) - Chapter books and early middle grade
    late_elementary: {
        ageRange: [9, 12],
        targetWordCount: { min: 300, max: 450 },
        sentenceLength: { min: 12, max: 20 },
        paragraphCount: { min: 3, max: 4 },
        vocabularyLevel: 'intermediate',
        readingTime: '3-4 minutes',
        bookComparison: 'Like a page from "Harry Potter" early books or "Diary of a Wimpy Kid"',
        characteristics: [
            'More complex sentence structures',
            'Expanded vocabulary with context clues',
            'Character development and internal thoughts',
            'Multiple plot elements',
            'Rich but accessible descriptions'
        ]
    },
    
    // Middle School (Ages 13-15) - Young adult literature
    middle_school: {
        ageRange: [13, 15],
        targetWordCount: { min: 400, max: 600 },
        sentenceLength: { min: 15, max: 25 },
        paragraphCount: { min: 4, max: 5 },
        vocabularyLevel: 'advanced',
        readingTime: '4-5 minutes',
        bookComparison: 'Like a page from "Percy Jackson" or "The Hunger Games"',
        characteristics: [
            'Complex narrative structures',
            'Abstract concepts and themes',
            'Emotional depth and moral ambiguity',
            'Multiple perspectives and subplots',
            'Sophisticated vocabulary and metaphors'
        ]
    },
    
    // High School (Ages 16-17) - Advanced young adult
    high_school: {
        ageRange: [16, 17],
        targetWordCount: { min: 500, max: 750 },
        sentenceLength: { min: 18, max: 30 },
        paragraphCount: { min: 4, max: 6 },
        vocabularyLevel: 'sophisticated',
        readingTime: '5-6 minutes',
        bookComparison: 'Like a page from "The Book Thief" or "1984"',
        characteristics: [
            'Literary techniques and symbolism',
            'Complex character psychology',
            'Philosophical and ethical questions',
            'Nuanced social commentary',
            'Advanced vocabulary and concepts'
        ]
    },
    
    // Young Adult (Ages 18-25) - College level and contemporary fiction
    young_adult: {
        ageRange: [18, 25],
        targetWordCount: { min: 600, max: 900 },
        sentenceLength: { min: 20, max: 35 },
        paragraphCount: { min: 5, max: 7 },
        vocabularyLevel: 'college',
        readingTime: '6-7 minutes',
        bookComparison: 'Like a page from "The Night Circus" or "Ready Player One"',
        characteristics: [
            'Complex narrative techniques',
            'Mature themes and relationships',
            'Cultural and historical references',
            'Sophisticated world-building',
            'Literary quality prose'
        ]
    },
    
    // Adult (Ages 26-40) - Literary fiction and popular novels
    adult: {
        ageRange: [26, 40],
        targetWordCount: { min: 600, max: 900 },
        sentenceLength: { min: 22, max: 40 },
        paragraphCount: { min: 5, max: 7 },
        vocabularyLevel: 'professional',
        readingTime: '6-7 minutes',
        bookComparison: 'Like a page from "The Goldfinch" or "Gone Girl"',
        characteristics: [
            'Layered storytelling',
            'Psychological complexity',
            'Rich atmospheric details',
            'Multiple themes and motifs',
            'Professional-level vocabulary'
        ]
    },
    
    // Mature Adult (Ages 41+) - Literary fiction and complex narratives
    mature_adult: {
        ageRange: [41, 100],
        targetWordCount: { min: 600, max: 900 },
        sentenceLength: { min: 25, max: 45 },
        paragraphCount: { min: 5, max: 7 },
        vocabularyLevel: 'literary',
        readingTime: '6-7 minutes',
        bookComparison: 'Like a page from "The Night Circus" or "Circe"',
        characteristics: [
            'Literary sophistication',
            'Deep philosophical exploration',
            'Complex character studies',
            'Historical and cultural depth',
            'Masterful prose and imagery'
        ]
    }
};

/**
 * Determines the appropriate reading specification for a given age
 * @param {number} age - The player's age
 * @returns {object} The reading specification object
 */
export function getReadingSpecification(age) {
    // Find the appropriate reading level
    for (const [level, spec] of Object.entries(READING_SPECIFICATIONS)) {
        if (age >= spec.ageRange[0] && age <= spec.ageRange[1]) {
            return { level, ...spec };
        }
    }
    
    // Default to adult if age is outside ranges
    return { level: 'adult', ...READING_SPECIFICATIONS.adult };
}

/**
 * Generates age-appropriate narrative length and complexity guidelines
 * @param {number} age - The player's age
 * @returns {object} Detailed guidelines for AI story generation
 */
export function generateNarrativeGuidelines(age) {
    const spec = getReadingSpecification(age);
    const log = window.displayVisualError || console.log;
    
    log(`Reading Level: ${spec.level} (Age ${age})`);
    log(`Target Length: ${spec.targetWordCount.min}-${spec.targetWordCount.max} words`);
    log(`Book Comparison: ${spec.bookComparison}`);
    
    return {
        wordCount: spec.targetWordCount,
        sentenceLength: spec.sentenceLength,
        paragraphCount: spec.paragraphCount,
        vocabularyLevel: spec.vocabularyLevel,
        readingTime: spec.readingTime,
        bookComparison: spec.bookComparison,
        characteristics: spec.characteristics,
        
        // Detailed AI instructions
        aiInstructions: generateAIInstructions(spec, age),
        
        // Content guidelines
        contentGuidelines: generateContentGuidelines(spec, age),
        
        // Style requirements
        styleRequirements: generateStyleRequirements(spec, age)
    };
}

/**
 * Generates specific AI instructions for narrative creation
 */
function generateAIInstructions(spec, age) {
    const instructions = {
        length: `Write EXACTLY ${spec.targetWordCount.min}-${spec.targetWordCount.max} words. This should feel like reading one page from a ${spec.bookComparison.toLowerCase()}.`,
        
        structure: `Organize into ${spec.paragraphCount.min}-${spec.paragraphCount.max} well-developed paragraphs. Each paragraph should advance the story meaningfully.`,
        
        sentences: `Use sentences averaging ${spec.sentenceLength.min}-${spec.sentenceLength.max} words. Vary sentence length for natural reading rhythm.`,
        
        pacing: `This should take approximately ${spec.readingTime} to read aloud at a comfortable pace for a ${age}-year-old.`
    };
    
    // Add age-specific instructions
    if (age <= 8) {
        instructions.special = `Focus on immediate action and clear emotions. Use simple but vivid descriptions that paint clear pictures.`;
    } else if (age <= 12) {
        instructions.special = `Balance action with character thoughts. Include some internal dialogue and emotional reactions.`;
    } else if (age <= 15) {
        instructions.special = `Develop complex emotions and motivations. Include subtle foreshadowing and deeper themes.`;
    } else if (age <= 17) {
        instructions.special = `Explore psychological depth and moral complexity. Use sophisticated literary techniques.`;
    } else if (age <= 25) {
        instructions.special = `Incorporate mature themes and cultural references. Use contemporary literary style.`;
    } else if (age <= 40) {
        instructions.special = `Layer multiple themes and create rich atmospheric details. Use professional-level prose.`;
    } else {
        instructions.special = `Create literary sophistication with deep philosophical exploration and masterful imagery.`;
    }
    
    return instructions;
}

/**
 * Generates content guidelines based on age and reading level
 */
function generateContentGuidelines(spec, age) {
    const guidelines = {
        themes: getAgeAppropriateThemes(age),
        vocabulary: getVocabularyGuidelines(spec.vocabularyLevel),
        complexity: getComplexityGuidelines(age),
        emotional_depth: getEmotionalDepthGuidelines(age)
    };
    
    return guidelines;
}

/**
 * Generates style requirements for different age groups
 */
function generateStyleRequirements(spec, age) {
    const baseRequirements = {
        characteristics: spec.characteristics,
        avoid: getAgeInappropriateElements(age),
        emphasize: getAgeAppropriateEmphasis(age)
    };
    
    return baseRequirements;
}

/**
 * Gets age-appropriate themes and content focus
 */
function getAgeAppropriateThemes(age) {
    if (age <= 8) {
        return ['friendship', 'discovery', 'overcoming fears', 'helping others', 'simple moral choices'];
    } else if (age <= 12) {
        return ['adventure', 'personal growth', 'loyalty', 'courage', 'problem-solving', 'family bonds'];
    } else if (age <= 15) {
        return ['identity', 'belonging', 'justice', 'moral ambiguity', 'coming of age', 'responsibility'];
    } else if (age <= 17) {
        return ['self-discovery', 'social issues', 'complex relationships', 'ethical dilemmas', 'philosophical questions'];
    } else if (age <= 25) {
        return ['career and purpose', 'complex relationships', 'social commentary', 'personal freedom', 'cultural identity'];
    } else if (age <= 40) {
        return ['life purpose', 'family dynamics', 'professional challenges', 'social responsibility', 'personal legacy'];
    } else {
        return ['wisdom and experience', 'generational perspective', 'life reflection', 'philosophical depth', 'existential themes'];
    }
}

/**
 * Gets vocabulary complexity guidelines
 */
function getVocabularyGuidelines(level) {
    const guidelines = {
        simple: {
            description: 'Elementary vocabulary with occasional challenging words',
            wordComplexity: 'Mostly 1-2 syllable words, some 3-syllable words with context',
            newWordsPerPage: '2-3 new vocabulary words maximum',
            contextClues: 'Always provide clear context for new words'
        },
        intermediate: {
            description: 'Expanded vocabulary appropriate for middle elementary',
            wordComplexity: '1-3 syllable words, occasional 4-syllable words',
            newWordsPerPage: '4-5 new vocabulary words',
            contextClues: 'Provide context clues and natural definitions'
        },
        advanced: {
            description: 'Sophisticated vocabulary for young adults',
            wordComplexity: 'Complex words and technical terms when appropriate',
            newWordsPerPage: '5-7 challenging vocabulary words',
            contextClues: 'Context should support meaning inference'
        },
        sophisticated: {
            description: 'Advanced vocabulary with literary terms',
            wordComplexity: 'Academic and literary vocabulary',
            newWordsPerPage: '6-8 advanced terms',
            contextClues: 'Expect reader to infer from context'
        },
        college: {
            description: 'College-level vocabulary and concepts',
            wordComplexity: 'Professional and academic terminology',
            newWordsPerPage: '7-10 sophisticated terms',
            contextClues: 'Minimal explicit context needed'
        },
        professional: {
            description: 'Professional and specialized vocabulary',
            wordComplexity: 'Complex technical and professional terms',
            newWordsPerPage: '8-12 professional terms',
            contextClues: 'Assume advanced vocabulary knowledge'
        },
        literary: {
            description: 'Literary and artistic vocabulary',
            wordComplexity: 'Sophisticated literary and cultural terms',
            newWordsPerPage: '10-15 literary terms',
            contextClues: 'Rich literary context and allusion'
        }
    };
    
    return guidelines[level] || guidelines.intermediate;
}

/**
 * Gets complexity guidelines for narrative structure
 */
function getComplexityGuidelines(age) {
    if (age <= 8) {
        return {
            plotElements: 'Single main plot with clear cause and effect',
            timeStructure: 'Linear chronological progression',
            perspectives: 'Single viewpoint character',
            subplots: 'None or very simple side elements'
        };
    } else if (age <= 12) {
        return {
            plotElements: 'Main plot with minor complications',
            timeStructure: 'Mostly linear with simple flashbacks',
            perspectives: 'Single viewpoint with occasional other perspectives',
            subplots: 'Simple subplots that support main story'
        };
    } else if (age <= 15) {
        return {
            plotElements: 'Complex plot with multiple complications',
            timeStructure: 'Non-linear elements and flashbacks',
            perspectives: 'Multiple viewpoints and perspectives',
            subplots: 'Meaningful subplots that enhance themes'
        };
    } else if (age <= 17) {
        return {
            plotElements: 'Sophisticated plot with layered conflicts',
            timeStructure: 'Complex time structures and narrative techniques',
            perspectives: 'Multiple complex viewpoints',
            subplots: 'Interwoven subplots with thematic significance'
        };
    } else if (age <= 25) {
        return {
            plotElements: 'Multi-layered plots with social commentary',
            timeStructure: 'Advanced narrative techniques',
            perspectives: 'Complex character studies',
            subplots: 'Multiple interwoven storylines'
        };
    } else if (age <= 40) {
        return {
            plotElements: 'Sophisticated literary plots',
            timeStructure: 'Masterful narrative construction',
            perspectives: 'Deep psychological exploration',
            subplots: 'Rich thematic development'
        };
    } else {
        return {
            plotElements: 'Literary masterpiece complexity',
            timeStructure: 'Innovative narrative techniques',
            perspectives: 'Profound character depth',
            subplots: 'Philosophical and existential layers'
        };
    }
}

/**
 * Gets emotional depth appropriate for age group
 */
function getEmotionalDepthGuidelines(age) {
    if (age <= 8) {
        return {
            emotions: 'Basic emotions clearly expressed',
            relationships: 'Simple friendships and family bonds',
            conflicts: 'Clear right and wrong choices',
            resolution: 'Positive, hopeful endings'
        };
    } else if (age <= 12) {
        return {
            emotions: 'More complex emotional states',
            relationships: 'Developing friendships and loyalty',
            conflicts: 'Some moral ambiguity',
            resolution: 'Growth and learning outcomes'
        };
    } else if (age <= 15) {
        return {
            emotions: 'Complex emotional development',
            relationships: 'Romantic interests and social dynamics',
            conflicts: 'Moral dilemmas and difficult choices',
            resolution: 'Bittersweet but meaningful endings'
        };
    } else if (age <= 17) {
        return {
            emotions: 'Deep psychological exploration',
            relationships: 'Complex romantic and social relationships',
            conflicts: 'Ethical and philosophical dilemmas',
            resolution: 'Thought-provoking conclusions'
        };
    } else if (age <= 25) {
        return {
            emotions: 'Mature emotional complexity',
            relationships: 'Adult relationships and responsibilities',
            conflicts: 'Real-world moral complexity',
            resolution: 'Realistic, nuanced outcomes'
        };
    } else if (age <= 40) {
        return {
            emotions: 'Professional and personal depth',
            relationships: 'Family, career, and social responsibilities',
            conflicts: 'Life-changing decisions and consequences',
            resolution: 'Mature, reflective conclusions'
        };
    } else {
        return {
            emotions: 'Wisdom and life experience depth',
            relationships: 'Generational and legacy perspectives',
            conflicts: 'Existential and philosophical challenges',
            resolution: 'Profound, contemplative endings'
        };
    }
}

/**
 * Gets elements to avoid for different age groups
 */
function getAgeInappropriateElements(age) {
    if (age <= 8) {
        return ['complex metaphors', 'abstract concepts', 'dark themes', 'violence', 'death without context'];
    } else if (age <= 12) {
        return ['graphic violence', 'mature romantic content', 'complex political themes', 'existential dread'];
    } else if (age <= 15) {
        return ['explicit content', 'graphic violence', 'adult themes without context'];
    } else if (age <= 17) {
        return ['explicit sexual content', 'gratuitous violence', 'adult themes without purpose'];
    } else {
        return ['gratuitous content without narrative purpose'];
    }
}

/**
 * Gets elements to emphasize for different age groups
 */
function getAgeAppropriateEmphasis(age) {
    if (age <= 8) {
        return ['vivid imagery', 'clear action', 'emotional reactions', 'sensory details'];
    } else if (age <= 12) {
        return ['character development', 'adventure elements', 'problem-solving', 'friendship'];
    } else if (age <= 15) {
        return ['identity themes', 'moral choices', 'personal growth', 'social dynamics'];
    } else if (age <= 17) {
        return ['philosophical questions', 'complex characters', 'social issues', 'personal freedom'];
    } else if (age <= 25) {
        return ['cultural references', 'career themes', 'complex relationships', 'social commentary'];
    } else if (age <= 40) {
        return ['professional depth', 'family dynamics', 'social responsibility', 'personal legacy'];
    } else {
        return ['wisdom themes', 'generational perspective', 'philosophical depth', 'life reflection'];
    }
}

/**
 * Builds the complete AI prompt with age-appropriate reading specifications
 * @param {number} age - The player's age
 * @param {string} basePrompt - The base story prompt
 * @returns {string} Enhanced prompt with reading specifications
 */
export function buildAgeAppropriatePrompt(age, basePrompt) {
    const guidelines = generateNarrativeGuidelines(age);
    const spec = getReadingSpecification(age);
    
    const enhancedPrompt = `${basePrompt}

AGE-APPROPRIATE READING SPECIFICATIONS (Age ${age} - ${spec.level.replace('_', ' ').toUpperCase()}):

READING LEVEL TARGET: ${spec.bookComparison}
TARGET LENGTH: ${guidelines.wordCount.min}-${guidelines.wordCount.max} words (${guidelines.readingTime} reading time)
STRUCTURE: ${guidelines.paragraphCount.min}-${guidelines.paragraphCount.max} paragraphs

WRITING STYLE REQUIREMENTS:
${guidelines.characteristics.map(char => `- ${char}`).join('\n')}

LENGTH SPECIFICATIONS:
${guidelines.aiInstructions.length}
${guidelines.aiInstructions.structure}
${guidelines.aiInstructions.sentences}
${guidelines.aiInstructions.pacing}

CONTENT GUIDELINES:
- Vocabulary Level: ${guidelines.contentGuidelines.vocabulary.description}
- Word Complexity: ${guidelines.contentGuidelines.vocabulary.wordComplexity}
- New Vocabulary: ${guidelines.contentGuidelines.vocabulary.newWordsPerPage}
- Context Clues: ${guidelines.contentGuidelines.vocabulary.contextClues}

NARRATIVE COMPLEXITY:
- Plot Elements: ${guidelines.contentGuidelines.complexity.plotElements}
- Time Structure: ${guidelines.contentGuidelines.complexity.timeStructure}
- Perspectives: ${guidelines.contentGuidelines.complexity.perspectives}
- Subplots: ${guidelines.contentGuidelines.complexity.subplots}

EMOTIONAL DEPTH:
- Emotions: ${guidelines.contentGuidelines.emotional_depth.emotions}
- Relationships: ${guidelines.contentGuidelines.emotional_depth.relationships}
- Conflicts: ${guidelines.contentGuidelines.emotional_depth.conflicts}
- Resolution: ${guidelines.contentGuidelines.emotional_depth.resolution}

THEMES TO EMPHASIZE: ${guidelines.contentGuidelines.themes.join(', ')}
ELEMENTS TO EMPHASIZE: ${guidelines.styleRequirements.emphasize.join(', ')}
ELEMENTS TO AVOID: ${guidelines.styleRequirements.avoid.join(', ')}

SPECIAL INSTRUCTIONS: ${guidelines.aiInstructions.special}

CRITICAL: This should read like an engaging page from a book that a ${age}-year-old would actually want to read. Make it feel like they're turning the page of their favorite book!`;

    return enhancedPrompt;
}

/**
 * Validates that generated content meets age-appropriate specifications
 * @param {string} content - The generated story content
 * @param {number} age - The target age
 * @returns {object} Validation results and suggestions
 */
export function validateContentLength(content, age) {
    const spec = getReadingSpecification(age);
    const wordCount = content.split(/\s+/).length;
    const paragraphCount = content.split(/\n\s*\n/).length;
    
    const validation = {
        wordCount: {
            actual: wordCount,
            target: spec.targetWordCount,
            isValid: wordCount >= spec.targetWordCount.min && wordCount <= spec.targetWordCount.max
        },
        paragraphCount: {
            actual: paragraphCount,
            target: spec.paragraphCount,
            isValid: paragraphCount >= spec.paragraphCount.min && paragraphCount <= spec.paragraphCount.max
        },
        overallValid: false
    };
    
    validation.overallValid = validation.wordCount.isValid && validation.paragraphCount.isValid;
    
    if (!validation.overallValid) {
        validation.suggestions = [];
        
        if (!validation.wordCount.isValid) {
            if (wordCount < spec.targetWordCount.min) {
                validation.suggestions.push(`Content is too short (${wordCount} words). Add ${spec.targetWordCount.min - wordCount} more words to reach minimum length.`);
            } else {
                validation.suggestions.push(`Content is too long (${wordCount} words). Remove ${wordCount - spec.targetWordCount.max} words to stay within limit.`);
            }
        }
        
        if (!validation.paragraphCount.isValid) {
            if (paragraphCount < spec.paragraphCount.min) {
                validation.suggestions.push(`Too few paragraphs (${paragraphCount}). Break content into ${spec.paragraphCount.min} paragraphs.`);
            } else {
                validation.suggestions.push(`Too many paragraphs (${paragraphCount}). Combine into ${spec.paragraphCount.max} paragraphs.`);
            }
        }
    }
    
    return validation;
}

// Export reading specifications for use by other modules
export { READING_SPECIFICATIONS };
