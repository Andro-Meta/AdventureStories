// schemas.js
// JSON Schemas for AI structured output. Tier 2 of the overhaul plan.
//
// These schemas describe the exact shape of AI responses for game-state-relevant
// generation calls (currently: choice generation). They are sent to the inference
// backend as a top-level `json_schema` extension field (llama.cpp native),
// alongside the OpenAI-compatible `response_format: { type: "json_object" }`,
// so the model is constrained to valid JSON regardless of how the user phrases
// the prompt. Fallback regex parsers in aiHandler.js handle backends that ignore
// the schema (notably the legacy MiniCPM Python server, which has no grammar
// support — the schema acts as a strong prompt hint there).

export const EXPLORATION_CHOICE_TYPES = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];
export const COMBAT_CHOICE_TYPES = ['Attack', 'Special', 'Item', 'Run'];

// =============================================================================
// PHASE 1: Narrative state-diff schema.
// =============================================================================
// Replaces the "narrator writes prose, engine never updates state" anti-pattern
// the live test of Phase 0 surfaced (story invents inventory, choices don't drive
// consequences, combat never starts). Now the narrator returns BOTH prose AND
// a structured patch describing the consequences. engine.js validates and
// applies — the LLM never directly mutates gameState.
//
// Kept GBNF-friendly: shallow object, enum for op, optional value (any type).
// The PATH allowlist + per-path type checks live in engine.js, NOT in the JSON
// Schema, because llama.cpp's grammar converter struggles with conditional
// validation. This is the Story2Game / G-KMS pattern — schema-loose, semantic
// validation in deterministic JS.

export const NARRATIVE_DIFF_OPS = ['add', 'remove', 'replace'];

export const narrativeTurnSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['narration', 'diff'],
    properties: {
        narration: {
            type: 'string',
            minLength: 1,
            maxLength: 4000
        },
        diff: {
            type: 'object',
            additionalProperties: false,
            required: ['ops'],
            properties: {
                ops: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['op', 'path'],
                        properties: {
                            op: { type: 'string', enum: NARRATIVE_DIFF_OPS },
                            path: { type: 'string', minLength: 1, maxLength: 200 },
                            value: {} // any JSON value, validated in engine.js
                        }
                    }
                }
            }
        }
    }
};

/**
 * Lightly normalize a parsed narrative-turn payload. Engine-level path/value
 * validation happens in engine.applyDiff(). Throws on missing fields.
 */
export function validateNarrativeTurnPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Narrative turn payload is not an object');
    }
    const narration = typeof payload.narration === 'string' ? payload.narration.trim() : '';
    if (!narration) throw new Error('Narrative turn payload missing narration');

    const diff = payload.diff && typeof payload.diff === 'object' ? payload.diff : { ops: [] };
    const opsRaw = Array.isArray(diff.ops) ? diff.ops : [];
    const ops = opsRaw
        .filter(o => o && typeof o.op === 'string' && typeof o.path === 'string')
        .map(o => ({ op: o.op, path: o.path, value: o.value }));

    return { narration, diff: { ops } };
}

/**
 * Schema for exploration-mode choice generation.
 * Requires exactly 5 choices, one of each exploration type. The "exactly one
 * of each" rule is verified post-parse in aiHandler.js — JSON Schema can't
 * express that uniquely-by-property-value constraint cleanly across enum items.
 */
export const explorationChoicesSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['choices'],
    properties: {
        choices: {
            type: 'array',
            minItems: 5,
            maxItems: 5,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'text'],
                properties: {
                    type: {
                        type: 'string',
                        enum: EXPLORATION_CHOICE_TYPES
                    },
                    text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 240
                    }
                }
            }
        }
    }
};

/**
 * Schema for the bundled arc-memory + entity-extraction call (Tier 3).
 *
 * One LLM round-trip produces:
 *   - `summary`: 1-2 sentences capturing WHO did WHAT and the lasting consequence
 *   - `newNpcs`, `newLocations`, `newItems`: arrays of {name, description} for
 *     anything notable that surfaced in the window. Either side may be empty
 *     if nothing significant happened in that category.
 *
 * The summary feeds gameState.arcMemory.summaries; the entity arrays merge
 * into gameState.entityMemory keyed by name. validateArcMemoryPayload below
 * enforces the shape post-parse so the schema can stay friendly to llama.cpp's
 * grammar converter (no min/max/strict).
 */
export const arcMemorySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['summary'],
    properties: {
        summary: {
            type: 'string',
            minLength: 1,
            maxLength: 400
        },
        newNpcs: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'description'],
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', minLength: 1, maxLength: 200 }
                }
            }
        },
        newLocations: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'description'],
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', minLength: 1, maxLength: 200 }
                }
            }
        },
        newItems: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'description'],
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', minLength: 1, maxLength: 200 }
                }
            }
        }
    }
};

/**
 * Validate (and lightly normalize) the parsed arc-memory payload.
 * Tolerant: missing entity arrays default to []. Returns
 * `{ summary, newNpcs, newLocations, newItems }`.
 */
export function validateArcMemoryPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Arc-memory payload is not an object');
    }
    const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
    if (!summary) throw new Error('Arc-memory payload missing summary');

    const normEntities = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(e => e && typeof e.name === 'string' && typeof e.description === 'string')
            .map(e => ({ name: e.name.trim(), description: e.description.trim() }))
            .filter(e => e.name && e.description);
    };

    return {
        summary,
        newNpcs: normEntities(payload.newNpcs),
        newLocations: normEntities(payload.newLocations),
        newItems: normEntities(payload.newItems)
    };
}

/**
 * Schema for combat-mode choice generation.
 * Requires exactly 4 choices, one of each combat type.
 */
export const combatChoicesSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['choices'],
    properties: {
        choices: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'text'],
                properties: {
                    type: {
                        type: 'string',
                        enum: COMBAT_CHOICE_TYPES
                    },
                    text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 240
                    }
                }
            }
        }
    }
};

/**
 * Returns the appropriate choice schema for the current game mode.
 */
export function getChoiceSchema(inCombat) {
    return inCombat ? combatChoicesSchema : explorationChoicesSchema;
}

/**
 * Validates a parsed choice payload against schema rules and returns
 * a normalized array of {type, text} entries — or throws if invalid.
 *
 * The "exactly one of each type" rule lives here, not in the schema, so
 * we can give targeted error messages for missing/duplicate types.
 */
export function validateChoicesPayload(payload, inCombat) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Choice payload is not an object');
    }
    const choices = payload.choices;
    if (!Array.isArray(choices)) {
        throw new Error('Choice payload missing "choices" array');
    }

    const validTypes = inCombat ? COMBAT_CHOICE_TYPES : EXPLORATION_CHOICE_TYPES;
    const expectedCount = validTypes.length;

    if (choices.length !== expectedCount) {
        throw new Error(`Expected ${expectedCount} choices, got ${choices.length}`);
    }

    const normalized = [];
    const seen = new Set();
    for (const c of choices) {
        if (!c || typeof c.type !== 'string' || typeof c.text !== 'string') {
            throw new Error('Choice entry missing string type or text');
        }
        const text = c.text.trim();
        if (!text) {
            throw new Error(`Empty choice text for type ${c.type}`);
        }
        if (!validTypes.includes(c.type)) {
            throw new Error(`Invalid choice type "${c.type}" — allowed: ${validTypes.join(', ')}`);
        }
        if (seen.has(c.type)) {
            throw new Error(`Duplicate choice type "${c.type}" — exactly one of each required`);
        }
        seen.add(c.type);
        normalized.push({ type: c.type, text });
    }

    const missing = validTypes.filter(t => !seen.has(t));
    if (missing.length) {
        throw new Error(`Missing choice types: ${missing.join(', ')}`);
    }

    return normalized;
}
