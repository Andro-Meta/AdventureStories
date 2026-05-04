// memoryRetriever.js
// Phase 2 hybrid retrieval over arc summaries and entity memory.
//
// Replaces "blindly inject every summary + every entity into every system
// prompt" with SCORE-style hybrid retrieval (recency + TF-IDF relevance).
// At current campaign sizes this is mostly equivalent to the dump-it-all
// approach, but it scales: for 100-turn campaigns the system prompt stays
// roughly constant size, the model attends to relevant scenes instead of
// drowning in old ones, and we save tokens.
//
// Pure JavaScript — no embedder, no SQLite, no external deps. The cost is
// that TF-IDF over short summaries is brittle vs cosine over real
// embeddings; that's a Phase 2.5 upgrade when we can ship EmbeddingGemma.

import { gameState } from './state.js?cb=014';

// ---- Tokenizer + stop-words -------------------------------------------------
// Tiny stop-word list — enough that "the/a/of/and/to" don't dominate scores.
const STOP_WORDS = new Set([
    'the','a','an','and','or','but','of','to','in','on','at','for','with','by',
    'from','as','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','can',
    'i','you','he','she','it','we','they','him','her','them','his','hers','its','their','your',
    'this','that','these','those','here','there','what','which','who','whom',
    'when','where','why','how','all','any','some','no','not','than','then',
    'so','if','because','about','into','through','before','after','above','below',
    'just','also','very','too','only','more','most','one','two','out','up','down'
]);

function tokenize(text) {
    if (typeof text !== 'string') return [];
    return text
        .toLowerCase()
        .replace(/[^a-z0-9'\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function termFreq(tokens) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return tf;
}

// ---- TF-IDF over a corpus ---------------------------------------------------
function buildIdf(docs) {
    const N = docs.length || 1;
    const df = new Map();
    for (const d of docs) {
        const seen = new Set(d.tokens);
        for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    }
    const idf = new Map();
    for (const [t, dfCount] of df) {
        idf.set(t, Math.log((N + 1) / (dfCount + 1)) + 1);
    }
    return idf;
}

function tfidfVector(tf, idf) {
    const v = new Map();
    let norm = 0;
    for (const [t, count] of tf) {
        const w = count * (idf.get(t) || 0);
        v.set(t, w);
        norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    return { v, norm };
}

function cosineSim(a, b) {
    let dot = 0;
    const [smaller, larger] = a.v.size < b.v.size ? [a.v, b.v] : [b.v, a.v];
    for (const [t, wa] of smaller) {
        const wb = larger.get(t);
        if (wb !== undefined) dot += wa * wb;
    }
    return dot / (a.norm * b.norm);
}

/**
 * Score arc-memory summaries against the current scene query.
 * Returns up to topK entries, blending recency (last few summaries always
 * included) with relevance (TF-IDF similarity for older ones).
 *
 * @param {string} query - text to retrieve against (usually the current narrative)
 * @param {object} opts
 * @param {number} [opts.recencyK=3] - always include the K most-recent summaries
 * @param {number} [opts.relevanceK=3] - additional top-K by TF-IDF on the older pool
 * @returns {{turn:number, summary:string, generatedAt:number}[]}
 */
export function retrieveSummaries(query, opts = {}) {
    const recencyK = opts.recencyK ?? 3;
    const relevanceK = opts.relevanceK ?? 3;
    const summaries = gameState.arcMemory?.summaries || [];
    if (!summaries.length) return [];

    // Always include the tail (recency)
    const recent = summaries.slice(-recencyK);
    const olderPool = summaries.slice(0, Math.max(0, summaries.length - recencyK));
    if (olderPool.length === 0) return recent;

    // Score the older pool against the query
    const docs = olderPool.map(s => ({ ...s, tokens: tokenize(s.summary) }));
    const idf = buildIdf(docs);
    const queryVec = tfidfVector(termFreq(tokenize(query)), idf);
    const scored = docs
        .map(d => ({ s: d, score: cosineSim(tfidfVector(termFreq(d.tokens), idf), queryVec) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, relevanceK)
        .map(x => x.s);

    return [...scored, ...recent];
}

/**
 * Score entity-memory entries against the current scene query.
 * Always includes the K most-recently-seen entities per category, plus
 * any entity whose name literally appears in the query (always relevant).
 *
 * @param {string} query
 * @param {object} opts
 * @param {number} [opts.perCategoryK=5] - cap returned entities per category
 * @returns {{npcs:Array, locations:Array, items:Array}}
 */
export function retrieveEntities(query, opts = {}) {
    const perCategoryK = opts.perCategoryK ?? 5;
    const queryLower = (query || '').toLowerCase();
    const em = gameState.entityMemory || {};

    const scoreCategory = (bucket) => {
        if (!bucket) return [];
        const entries = Object.entries(bucket).map(([name, info]) => ({
            name,
            info,
            recency: info.lastSeenTurn || 0,
            mentioned: queryLower.includes(name.toLowerCase())
        }));
        // Mentioned-in-narrative always wins; then by recency.
        entries.sort((a, b) => {
            if (a.mentioned !== b.mentioned) return a.mentioned ? -1 : 1;
            return b.recency - a.recency;
        });
        return entries.slice(0, perCategoryK);
    };

    return {
        npcs: scoreCategory(em.npcs),
        locations: scoreCategory(em.locations),
        items: scoreCategory(em.items)
    };
}

/**
 * Render the retrieved memory bundle as the system-prompt block we used to
 * build inline in generateSystemPrompt(). Returns a plain string that
 * already contains the section headings and trailing newlines, or empty
 * string if nothing relevant.
 */
export function renderMemoryBlock(query) {
    const summaries = retrieveSummaries(query);
    const ents = retrieveEntities(query);

    let out = '';
    if (summaries.length > 0) {
        out += '\n\nADVENTURE MEMORY (recency-blended retrieval):\n';
        for (const s of summaries) {
            out += `- Turn ${s.turn}: ${s.summary}\n`;
        }
    }
    const renderEnts = (label, list) => {
        if (!list.length) return '';
        let s = `\n${label}:\n`;
        for (const e of list) s += `- ${e.name}: ${e.info.description}\n`;
        return s;
    };
    out += renderEnts('KNOWN NPCS', ents.npcs);
    out += renderEnts('KNOWN LOCATIONS', ents.locations);
    out += renderEnts('NOTABLE ITEMS', ents.items);
    return out;
}
