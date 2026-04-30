// inputCache.js
// Handles caching and restoring user inputs across browser sessions

const CACHE_KEYS = {
    PLAYER_AGES: 'adventure_stories_player_ages',
    PLAYER_NAMES: 'adventure_stories_player_names',
    ADVENTURE_THEME: 'adventure_stories_theme',
    CUSTOM_THEME: 'adventure_stories_custom_theme'
};

/**
 * Save player ages to localStorage
 * @param {number[]} ages - Array of player ages
 */
export function savePlayerAges(ages) {
    try {
        localStorage.setItem(CACHE_KEYS.PLAYER_AGES, JSON.stringify(ages));
    } catch (error) {
        console.warn('Failed to save player ages to cache:', error);
    }
}

/**
 * Load player ages from localStorage
 * @returns {number[]} Array of cached ages, or empty array if none found
 */
export function loadPlayerAges() {
    try {
        const cached = localStorage.getItem(CACHE_KEYS.PLAYER_AGES);
        return cached ? JSON.parse(cached) : [];
    } catch (error) {
        console.warn('Failed to load player ages from cache:', error);
        return [];
    }
}

/**
 * Save player names to localStorage
 * @param {string[]} names - Array of player names
 */
export function savePlayerNames(names) {
    try {
        localStorage.setItem(CACHE_KEYS.PLAYER_NAMES, JSON.stringify(names));
    } catch (error) {
        console.warn('Failed to save player names to cache:', error);
    }
}

/**
 * Load player names from localStorage
 * @returns {string[]} Array of cached names, or empty array if none found
 */
export function loadPlayerNames() {
    try {
        const cached = localStorage.getItem(CACHE_KEYS.PLAYER_NAMES);
        return cached ? JSON.parse(cached) : [];
    } catch (error) {
        console.warn('Failed to load player names from cache:', error);
        return [];
    }
}

/**
 * Save adventure theme to localStorage
 * @param {string} theme - Selected theme
 * @param {string} customDescription - Custom theme description if applicable
 */
export function saveAdventureTheme(theme, customDescription = '') {
    try {
        localStorage.setItem(CACHE_KEYS.ADVENTURE_THEME, theme);
        if (customDescription) {
            localStorage.setItem(CACHE_KEYS.CUSTOM_THEME, customDescription);
        }
    } catch (error) {
        console.warn('Failed to save adventure theme to cache:', error);
    }
}

/**
 * Load adventure theme from localStorage
 * @returns {object} Object with theme and customDescription
 */
export function loadAdventureTheme() {
    try {
        const theme = localStorage.getItem(CACHE_KEYS.ADVENTURE_THEME) || 'fantasy';
        const customDescription = localStorage.getItem(CACHE_KEYS.CUSTOM_THEME) || '';
        return { theme, customDescription };
    } catch (error) {
        console.warn('Failed to load adventure theme from cache:', error);
        return { theme: 'fantasy', customDescription: '' };
    }
}

/**
 * Clear all cached inputs
 */
export function clearInputCache() {
    try {
        Object.values(CACHE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    } catch (error) {
        console.warn('Failed to clear input cache:', error);
    }
}
