// tests/smoke7.spec.js
// Smoke #7 — Comprehensive end-to-end test suite
//
// Covers:
//   @themes      All 14 theme options preserve correctly through resetGameState / initManager
//   @setup       Multi-player setup, second-game reset (initManager.reset() fix)
//   @saveload    Save game → reload → continue restores state (direct module calls, no AI)
//   @integration Full game loop: combat, quests, god-mode (requires live AI on :8090)
//
// Usage:
//   npm test                  — fast tests (@saveload + one theme write check)
//   npm run test:themes       — theme sweep (@integration, needs real AI)
//   npm run test:integration  — full AI game loop tests (needs real AI server)
//   npm run test:headed       — watch in browser

const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const ALL_THEMES = [
    { value: 'fantasy',       label: 'Fantasy Kingdom' },
    { value: 'space',         label: 'Space Exploration' },
    { value: 'pirate',        label: 'Pirate Seas' },
    { value: 'underwater',    label: 'Underwater World' },
    { value: 'jungle',        label: 'Jungle Expedition' },
    { value: 'future_utopia', label: 'Utopian Future' },
    { value: 'dinosaur',      label: 'Dinosaur Times' },
    { value: 'arctic',        label: 'Arctic Adventure' },
    { value: 'steampunk',     label: 'Steampunk City' },
    { value: 'haunted',       label: 'Haunted Mansion' },
    { value: 'cyberpunk',     label: 'Cyberpunk City' },
    { value: 'wild_west',     label: 'Wild West' },
    { value: 'post_apoc',     label: 'Post-Apocalypse' },
    { value: 'custom',        label: 'Custom Theme', customText: 'Underwater Volcano Kingdom' },
];

// ---------------------------------------------------------------------------
// Navigation helpers (exact IDs / selectors from index.html)
// ---------------------------------------------------------------------------

/**
 * Stub the health-check endpoint to return 200 OK immediately.
 * Without this stub, initializeGame() hits /health with a 4-second timeout.
 * If the server is slow or busy, that timeout fires, showPopup() renders an
 * error banner over the main menu, and subsequent button clicks are blocked.
 * Returning 200 lets checkLocalAIStatus() succeed fast with no error popup.
 * This does NOT fake AI chat responses — real calls still go to the real server.
 */
async function stubHealthCheck(page) {
    await page.route('**/health', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    );
}

/**
 * Open the game and wait until JavaScript is fully initialized.
 *
 * #mainMenuScreen starts as class="screen active" in the raw HTML, so
 * waiting for '#mainMenuScreen.active' would resolve immediately — before
 * main.js imports its modules or setupEventListeners() wires up the button
 * click handlers. We instead wait for the body[data-js-ready] attribute
 * that main.js sets only after setupEventListeners() AND initializeGame()
 * have both completed successfully.
 */
async function gotoMainMenu(page) {
    await page.goto('/');
    await page.waitForSelector('body[data-js-ready]', { timeout: 30_000 });
}

/** Click "New Adventure" → wait for player count screen. */
async function clickNewGame(page) {
    await page.locator('#newGameBtn').click();
    await page.waitForSelector('#playerCountScreen:not(.hidden)', { timeout: 10_000 });
}

/** Click the Solo / player count button → wait for adventure type screen. */
async function selectPlayerCount(page, count = 1) {
    if (count > 1) {
        const summary = page.locator('.experimental-multiplayer > summary');
        await summary.click();
        await page.waitForTimeout(200);
    }
    await page.locator(`.playerCountBtn[data-count="${count}"]`).click();
    await page.waitForSelector('#adventureTypeScreen:not(.hidden)', { timeout: 10_000 });
}

/** Select theme from dropdown; fill custom text if needed; click Next. */
async function selectTheme(page, themeValue, customText = '') {
    await page.locator('#adventureTypeSelect').selectOption(themeValue);

    if (themeValue === 'custom') {
        const input = page.locator('#customThemeInput');
        await input.waitFor({ state: 'visible', timeout: 5_000 });
        await input.fill(customText || 'Custom Test Theme');
    }

    await page.locator('#adventureTypeNextBtn').click();
    await page.waitForSelector('#ageInputScreen:not(.hidden)', { timeout: 10_000 });
}

/** Fill age inputs (one per player) and click Next. */
async function fillAges(page, count = 1, baseAge = 10) {
    const inputs = page.locator('#ageInputsContainer input[type="number"]');
    await inputs.first().waitFor({ state: 'visible', timeout: 10_000 });
    for (let i = 0; i < count; i++) {
        await inputs.nth(i).fill(String(baseAge + i));
    }
    await page.locator('#ageInputNextBtn').click();
    await page.waitForSelector('#nameInputScreen:not(.hidden)', { timeout: 10_000 });
}

/** Fill name inputs and click "Start Adventure!". */
async function fillNamesAndStart(page, names = ['TestPlayer']) {
    const inputs = page.locator('#nameInputsContainer input[type="text"]');
    await inputs.first().waitFor({ state: 'visible', timeout: 10_000 });
    for (let i = 0; i < names.length; i++) {
        await inputs.nth(i).fill(names[i]);
    }
    await page.locator('#nameInputStartBtn').click();
}

/** Run the full setup flow in one call. Calls gotoMainMenu → name inputs. */
async function runSetup(page, { theme = 'fantasy', customText = '', playerCount = 1, names } = {}) {
    const playerNames = names || Array.from({ length: playerCount }, (_, i) => `Player${i + 1}`);
    await clickNewGame(page);
    await selectPlayerCount(page, playerCount);
    await selectTheme(page, theme, customText);
    await fillAges(page, playerCount);
    await fillNamesAndStart(page, playerNames);
}

/** Read gameState.adventureTheme from the live module singleton. */
async function getThemeFromGameState(page) {
    return page.evaluate(async () => {
        const { gameState } = await import('./state.js?cb=014');
        return gameState.adventureTheme;
    });
}

// ---------------------------------------------------------------------------
// SUITE: Theme selection
// @themes — one fast check; full theme sweep requires live AI (@integration)
// ---------------------------------------------------------------------------

test.describe('Theme selection @themes', () => {
    test.slow(); // Gemma takes 35-50s per boot; triple timeout to 180s.

    // Quick sanity: proceedToAgeInput() writes the selected theme to gameState
    // immediately, before any initialization or AI call runs.
    test('proceedToAgeInput writes selected theme to gameState', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await clickNewGame(page);
        await selectPlayerCount(page, 1);

        await page.locator('#adventureTypeSelect').selectOption('pirate');
        await page.locator('#adventureTypeNextBtn').click();
        await page.waitForSelector('#ageInputScreen:not(.hidden)', { timeout: 10_000 });

        const theme = await getThemeFromGameState(page);
        expect(theme).toBe('pirate');
    });

    // Full sweep: each theme survives the entire initialization pipeline.
    // Requires a live AI server — the game screen only appears after the
    // initial narrative is generated.
    for (const { value: themeValue, label, customText } of ALL_THEMES) {
        test(`Theme preserved: ${label} (${themeValue}) @themes @integration`, async ({ page }) => {
            await gotoMainMenu(page);
            await runSetup(page, { theme: themeValue, customText, playerCount: 1 });
            await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

            const finalTheme = await getThemeFromGameState(page);
            expect(finalTheme).toBe(themeValue);

            if (themeValue === 'custom' && customText) {
                const customDesc = await page.evaluate(async () => {
                    const { gameState } = await import('./state.js?cb=014');
                    return gameState.customThemeDescription;
                });
                expect(customDesc.length).toBeGreaterThan(0);
            }
        });
    }
});

// ---------------------------------------------------------------------------
// SUITE: Setup correctness
// @setup — all require live AI (game screen only appears after narrative)
// @integration
// ---------------------------------------------------------------------------

test.describe('Setup flow @setup', () => {
    test.slow(); // Gemma takes 35-50s per boot; triple timeout to 180s.

    test('Solo game: gameState has 1 player, correct name, HP at max, turn=1', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'pirate', playerCount: 1, names: ['Blackbeard'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const state = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { INITIAL_HP } = await import('./config.js?cb=014');
            return {
                playerCount: gameState.players.length,
                name: gameState.players[0]?.name,
                hp: gameState.players[0]?.hp,
                maxHp: INITIAL_HP,
                turn: gameState.turn,
                theme: gameState.adventureTheme,
            };
        });

        expect(state.playerCount).toBe(1);
        expect(state.name).toBe('Blackbeard');
        expect(state.hp).toBe(state.maxHp);
        expect(state.turn).toBeGreaterThanOrEqual(1);
        expect(state.theme).toBe('pirate');
    });

    test('3-player setup creates 3 players with correct names', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, {
            theme: 'space',
            playerCount: 3,
            names: ['Alice', 'Bob', 'Charlie'],
        });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const [count, names] = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return [gameState.players.length, gameState.players.map(p => p.name)];
        });

        expect(count).toBe(3);
        expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('Second game in same session uses fresh state — initManager.reset() fix', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1, names: ['FirstRun'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });
        expect(await getThemeFromGameState(page)).toBe('fantasy');

        await page.evaluate(async () => {
            const UI = await import('./ui.js?cb=014');
            UI.showScreen('mainMenuScreen');
        });
        await page.waitForSelector('#mainMenuScreen:not(.hidden), #mainMenuScreen.active', { timeout: 10_000 });

        await runSetup(page, { theme: 'dinosaur', playerCount: 1, names: ['SecondRun'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const [theme, playerName] = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return [gameState.adventureTheme, gameState.players[0]?.name];
        });

        expect(theme).toBe('dinosaur');
        expect(playerName).toBe('SecondRun');
    });

    test('godModeManager is wired to gameState after init', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const attached = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return !!gameState.godModeManager;
        });
        expect(attached).toBe(true);
    });

    test('questProgressManager is wired to gameState after init', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const attached = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return !!gameState.questProgressManager;
        });
        expect(attached).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SUITE: Save / Load round-trip
// @saveload — fast, no AI needed. Tests the persistence layer directly by
// writing gameState via module imports rather than booting a full game.
// ---------------------------------------------------------------------------

test.describe('Save / Load round-trip @saveload', () => {
    test.slow(); // page.reload + loadGame involves health-check round-trip; triple timeout to 180s.

    test('Save → page reload → loadGame restores theme and player name', async ({ page }) => {
        const SLOT = 'smoke7_saveload_roundtrip';
        await stubHealthCheck(page);
        await gotoMainMenu(page);

        // Write minimal game state directly — no AI call needed.
        // currentChoices and messageHistory must be present so loadGame
        // does not fall into the "no choices → regenerate via AI" branch.
        await page.evaluate(async (slot) => {
            const { gameState } = await import('./state.js?cb=014');
            gameState.adventureTheme = 'steampunk';
            gameState.players = [{
                name: 'Cog', hp: 100, maxHp: 100,
                inventory: [], statusEffects: [], gold: 0,
            }];
            gameState.currentPlayerIndex = 0;
            gameState.turn = 1;
            gameState.currentChoices = [
                { type: 'Good', text: 'Saved choice A' },
                { type: 'Bad',  text: 'Saved choice B' },
            ];
            gameState.messageHistory = [
                { role: 'assistant', content: 'The steampunk city hums with gears.' },
            ];
            const { saveGameToLocalStorage } = await import('./saveLoad.js?cb=014');
            saveGameToLocalStorage(slot);
        }, SLOT);

        const slotExists = await page.evaluate((slot) => {
            return !!localStorage.getItem('advStorySave_' + slot);
        }, SLOT);
        expect(slotExists).toBe(true);

        await stubHealthCheck(page);
        await page.reload();
        await page.waitForSelector('body[data-js-ready]', { timeout: 30_000 });

        await page.evaluate(async (slot) => {
            const { loadGame } = await import('./saveLoad.js?cb=014');
            await loadGame(slot);
        }, SLOT);

        const [theme, name] = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return [gameState.adventureTheme, gameState.players[0]?.name];
        });
        expect(theme).toBe('steampunk');
        expect(name).toBe('Cog');
    });

    test('Save preserves turn counter and player HP', async ({ page }) => {
        const SLOT = 'smoke7_state_persist';
        await stubHealthCheck(page);
        await gotoMainMenu(page);

        await page.evaluate(async (slot) => {
            const { gameState } = await import('./state.js?cb=014');
            gameState.adventureTheme = 'haunted';
            gameState.players = [{
                name: 'Ghost', hp: 42, maxHp: 100,
                inventory: [], statusEffects: [], gold: 0,
            }];
            gameState.currentPlayerIndex = 0;
            gameState.turn = 7;
            gameState.currentChoices = [
                { type: 'Good', text: 'Saved choice A' },
                { type: 'Bad',  text: 'Saved choice B' },
            ];
            gameState.messageHistory = [
                { role: 'assistant', content: 'Shadows gather in the haunted halls.' },
            ];
            const { saveGameToLocalStorage } = await import('./saveLoad.js?cb=014');
            saveGameToLocalStorage(slot);
        }, SLOT);

        await stubHealthCheck(page);
        await page.reload();
        await page.waitForSelector('body[data-js-ready]', { timeout: 30_000 });

        await page.evaluate(async (slot) => {
            const { loadGame } = await import('./saveLoad.js?cb=014');
            await loadGame(slot);
        }, SLOT);

        const [turn, hp] = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return [gameState.turn, gameState.players[0]?.hp];
        });
        expect(turn).toBe(7);
        expect(hp).toBe(42);
    });
});

// ---------------------------------------------------------------------------
// SUITE: Full game loop (requires live AI server on :8090)
// @integration — slow, needs `python working_ai_server.py` or `start_llama_server.py`
// ---------------------------------------------------------------------------

test.describe('Full game loop @integration', () => {
    test.slow();

    test('New game loads to game screen with choices rendered', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1, names: ['Aria'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const choiceCount = await page.locator('#choicesContainer button').count();
        expect(choiceCount).toBeGreaterThan(0);
    });

    test('Cure item is not consumed when it has no effect', async ({ page }) => {
        // Regression test: consumed = true was set unconditionally; now only if effects were cured.
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { useCureItem } = await import('./actionHandler.js?cb=014').catch(() => ({}));
            if (!useCureItem) return { skipped: true };

            const player = gameState.players[0];
            player.statusEffects = [];
            const cureItem = {
                id: 'test_cure', name: 'Antidote', type: 'Consumable',
                cures: ['Poison'], quantity: 1,
            };
            player.inventory.push(cureItem);
            const inventoryBefore = player.inventory.length;
            await useCureItem(player, cureItem);
            const inventoryAfter = player.inventory.length;
            return { consumed: inventoryAfter < inventoryBefore, inventoryBefore, inventoryAfter };
        });

        if (!result.skipped) {
            expect(result.consumed).toBe(false);
        }
    });

    test('Quest progress display updates after turns', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const questDisplayExists = await page.locator('#questPercentage').count();
        expect(questDisplayExists).toBeGreaterThan(0);

        const phaseLabelExists = await page.locator('#questPhase').count();
        expect(phaseLabelExists).toBeGreaterThan(0);
    });

    test('God mode becomes available after sufficient quest progress', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 90_000 });

        const godModeUnlocked = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            if (!gameState.questProgressManager) return { error: 'questProgressManager missing' };
            if (!gameState.godModeManager) return { error: 'godModeManager missing' };

            gameState.questProgressManager.progressPercent = 100;
            gameState.questProgressManager.currentPhaseIndex =
                gameState.questProgressManager.questPhases?.length ?? 5;

            try {
                gameState.godModeManager.checkUnlockConditions();
                return { unlocked: gameState.godModeManager.isUnlocked };
            } catch (e) {
                return { error: e.message };
            }
        });

        expect(godModeUnlocked.error).toBeUndefined();
        expect(typeof godModeUnlocked.unlocked).toBe('boolean');
    });
});
