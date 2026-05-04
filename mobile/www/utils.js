// utils.js
// General utility functions used across multiple modules.

/**
 * Generates a simple unique enough ID string using timestamp and random chars.
 * Ensures prefix is clean.
 * @param {string} [prefix='id'] - Optional prefix for the ID. Should be alphanumeric.
 * @returns {string} A generated ID string (e.g., 'player_kx5yqza_abc123').
 */
export function generateId(prefix = 'id') {
    // (Unchanged)
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '') || 'id';
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 9);
    return `${cleanPrefix}_${timestamp}_${randomPart}`;
}

/**
 * Clamps a number between a minimum and maximum value (inclusive).
 * @param {number} value - The value to clamp.
 * @param {number} min - The minimum allowed value.
 * @param {number} max - The maximum allowed value.
 * @returns {number} The clamped value. Returns NaN if inputs are not numbers.
 */
export function clamp(value, min, max) {
    // (Unchanged)
    const log = window.displayVisualError || console.warn;
    if (typeof value !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
        log(`Utils Clamp Warning: Non-numeric input provided. Value: ${value}, Min: ${min}, Max: ${max}`);
        return NaN;
    }
    if (min > max) {
        log(`Utils Clamp Warning: Min (${min}) is greater than Max (${max}). Swapping them.`);
        [min, max] = [max, min];
    }
    return Math.max(min, Math.min(value, max));
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * Handles cases where max < min.
 * @param {number} min - The minimum possible value.
 * @param {number} max - The maximum possible value.
 * @returns {number} A random integer within the range. Returns NaN if inputs non-numeric.
 */
export function getRandomInt(min, max) {
     // (Unchanged)
     const log = window.displayVisualError || console.warn;
     if (typeof min !== 'number' || typeof max !== 'number') {
        log(`Utils getRandomInt Warning: Non-numeric input provided. Min: ${min}, Max: ${max}`);
        return NaN;
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    if (min > max) {
        [min, max] = [max, min];
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from an array.
 * Returns null if the array is empty, null, or not an array.
 * @template T
 * @param {T[]} array - The array to select from.
 * @returns {T | null} A random element from the array, or null.
 */
export function getRandomElement(array) {
    // (Unchanged)
    if (!Array.isArray(array) || array.length === 0) {
        return null;
    }
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffles an array in place using the Fisher-Yates (Durstenfeld) algorithm.
 * Handles non-array input gracefully.
 * @template T
 * @param {T[]} array - The array to shuffle.
 * @returns {T[]} The shuffled array (mutated directly), or the original input if not an array.
 */
export function shuffleArray(array) {
    // (Unchanged)
    const log = window.displayVisualError || console.warn;
    if (!Array.isArray(array)) {
        log("Utils shuffleArray Warning: Called with non-array input.");
        return array;
    }
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Basic HTML sanitizer to prevent simple XSS by escaping < > & ".
 * Use a dedicated library like DOMPurify for robust production security.
 * @param {*} text - The input value to sanitize. Converts non-strings to strings.
 * @returns {string} Sanitized text. Returns empty string if input is null/undefined.
 */
export function sanitizeText(text) {
    // (Unchanged)
    if (text === null || text === undefined) {
        return '';
    }
    const str = String(text);
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
}

/**
 * Debounces a function, ensuring it's only called after a certain delay
 * since the last time it was invoked. Useful for input events.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @param {boolean} [immediate=false] - Trigger the function on the leading edge instead of the trailing edge.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait, immediate = false) {
    // (Unchanged)
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}