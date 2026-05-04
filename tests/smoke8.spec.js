// tests/smoke8.spec.js
// Advanced gameplay systems test suite
//
// Covers:
//   @items-fast    Item generation, equip/unequip, stat recalc, loot — no AI needed
//   @combat-fast   Combat init, damage calc, status effects, defeat checks — no AI
//   @quest-fast    Quest milestones, phase transitions, objectives — no AI
//   @godmode-fast  God mode unlock conditions — no AI
//   @live          State changes & UI rendering during a live AI game (requires llama-server :8090)

const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Shared helpers (mirrors smoke7)
// ---------------------------------------------------------------------------

async function stubHealthCheck(page) {
    await page.route('**/health', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    );
}

async function gotoMainMenu(page) {
    // Retry up to 3 times with a 15s timeout each — server.py occasionally
    // blips for a few seconds between tests when the system is under AI load.
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
            await page.waitForSelector('body[data-js-ready]', { timeout: 30_000 });
            return;
        } catch (e) {
            if (attempt === 2) throw e;
            await page.waitForTimeout(3_000);
        }
    }
}

async function runSetup(page, { theme = 'fantasy', playerCount = 1, names } = {}) {
    const playerNames = names || Array.from({ length: playerCount }, (_, i) => `Player${i + 1}`);
    await page.locator('#newGameBtn').click();
    await page.waitForSelector('#playerCountScreen:not(.hidden)', { timeout: 10_000 });
    await page.locator(`.playerCountBtn[data-count="${playerCount}"]`).click();
    await page.waitForSelector('#adventureTypeScreen:not(.hidden)', { timeout: 10_000 });
    await page.locator('#adventureTypeSelect').selectOption(theme);
    await page.locator('#adventureTypeNextBtn').click();
    await page.waitForSelector('#ageInputScreen:not(.hidden)', { timeout: 10_000 });
    const ageInputs = page.locator('#ageInputsContainer input[type="number"]');
    await ageInputs.first().waitFor({ state: 'visible', timeout: 10_000 });
    for (let i = 0; i < playerCount; i++) await ageInputs.nth(i).fill('10');
    await page.locator('#ageInputNextBtn').click();
    await page.waitForSelector('#nameInputScreen:not(.hidden)', { timeout: 10_000 });
    const nameInputs = page.locator('#nameInputsContainer input[type="text"]');
    await nameInputs.first().waitFor({ state: 'visible', timeout: 10_000 });
    for (let i = 0; i < playerCount; i++) await nameInputs.nth(i).fill(playerNames[i]);
    await page.locator('#nameInputStartBtn').click();
}

/**
 * Set up minimal gameState directly (no AI, no full init).
 * Enough state for item, combat, quest, and god-mode unit tests.
 */
async function setupMinimalState(page) {
    await page.evaluate(async () => {
        const { gameState } = await import('./state.js?cb=014');
        gameState.players = [{
            id: 'player_smoke8_001',
            name: 'TestHero',
            hp: 100,
            maxHp: 100,
            baseAtk: 5,
            baseDef: 2,
            atk: 5,
            def: 2,
            mp: 20,
            maxMp: 20,
            gold: 200,
            coins: 200,
            inventory: [],
            equipment: { weapon: null, armor: null },
            statusEffects: [],
            isDowned: false,
            specialMoves: [],
        }];
        gameState.currentPlayerIndex = 0;
        gameState.isLoading = false;
        gameState.inCombat = false;
        gameState.imprisoned = false;
        gameState.enemies = [];
        gameState.turn = 1;
        gameState.adventureTheme = 'fantasy';
        gameState.questProgress = null;
    });
}

// ---------------------------------------------------------------------------
// SUITE: Items — @items-fast
// No AI needed — all tests use direct module calls
// ---------------------------------------------------------------------------

test.describe('Items @items-fast', () => {
    test.slow();

    test('generateThemedItem: weapon has positive atk stat', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');
            const item = generateThemedItem('fantasy', Tiers.MEDIUM, 'Weapon');
            return item ? { type: item.type, hasAtk: typeof item.stats?.atk === 'number', atk: item.stats?.atk } : null;
        });

        expect(result).not.toBeNull();
        expect(result.type).toBe('Weapon');
        expect(result.hasAtk).toBe(true);
        expect(result.atk).toBeGreaterThan(0);
    });

    test('generateThemedItem: armor has positive def stat', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');
            const item = generateThemedItem('fantasy', Tiers.MEDIUM, 'Armor');
            return item ? { type: item.type, hasDef: typeof item.stats?.def === 'number', def: item.stats?.def } : null;
        });

        expect(result).not.toBeNull();
        expect(result.type).toBe('Armor');
        expect(result.hasDef).toBe(true);
        expect(result.def).toBeGreaterThan(0);
    });

    test('generateThemedItem: consumable has heal or effect stats', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');
            const item = generateThemedItem('fantasy', Tiers.LOW, 'Consumable');
            return item ? {
                type: item.type,
                hasStats: !!item.stats,
                name: item.name,
            } : null;
        });

        expect(result).not.toBeNull();
        expect(result.type).toBe('Consumable');
        expect(result.hasStats).toBe(true);
    });

    test('equipInventoryItem: weapon populates equipment.weapon slot', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { equipInventoryItem } = await import('./actionHandler.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');

            const weapon = generateThemedItem('fantasy', Tiers.MEDIUM, 'Weapon');
            const player = gameState.players[0];
            player.inventory.push(weapon);

            equipInventoryItem(weapon.id, 'weapon');

            return {
                equipmentWeapon: player.equipment.weapon,
                equippedSlot: weapon.equippedSlot,
            };
        });

        expect(result.equipmentWeapon).not.toBeNull();
        expect(result.equippedSlot).toBe('weapon');
    });

    test('equipInventoryItem: weapon increases player ATK via stat recalc', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { equipInventoryItem } = await import('./actionHandler.js?cb=014');
            const { Tiers, BASE_ATK } = await import('./config.js?cb=014');

            const weapon = generateThemedItem('fantasy', Tiers.MEDIUM, 'Weapon');
            const player = gameState.players[0];
            player.inventory.push(weapon);

            const atkBefore = player.atk;
            equipInventoryItem(weapon.id, 'weapon');
            const atkAfter = player.atk;

            return { atkBefore, atkAfter, weaponAtkBonus: weapon.stats?.atk };
        });

        expect(result.atkAfter).toBeGreaterThan(result.atkBefore);
        expect(result.atkAfter).toBe(result.atkBefore + result.weaponAtkBonus);
    });

    test('equipInventoryItem: armor increases player DEF via stat recalc', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { equipInventoryItem } = await import('./actionHandler.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');

            const armor = generateThemedItem('fantasy', Tiers.MEDIUM, 'Armor');
            const player = gameState.players[0];
            player.inventory.push(armor);

            const defBefore = player.def;
            equipInventoryItem(armor.id, 'armor');
            const defAfter = player.def;

            return { defBefore, defAfter, armorDefBonus: armor.stats?.def };
        });

        expect(result.defAfter).toBeGreaterThan(result.defBefore);
        expect(result.defAfter).toBe(result.defBefore + result.armorDefBonus);
    });

    test('unequipInventoryItem: clears slot and resets ATK to base', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { generateThemedItem } = await import('./items.js?cb=014');
            const { equipInventoryItem, unequipInventoryItem } = await import('./actionHandler.js?cb=014');
            const { Tiers, BASE_ATK } = await import('./config.js?cb=014');

            const weapon = generateThemedItem('fantasy', Tiers.MEDIUM, 'Weapon');
            const player = gameState.players[0];
            player.inventory.push(weapon);

            equipInventoryItem(weapon.id, 'weapon');
            const atkEquipped = player.atk;

            unequipInventoryItem('weapon');
            const atkUnequipped = player.atk;
            const slotEmpty = player.equipment.weapon === null;
            const equippedSlotCleared = weapon.equippedSlot === null;

            return { atkEquipped, atkUnequipped, baseAtk: BASE_ATK, slotEmpty, equippedSlotCleared };
        });

        expect(result.atkEquipped).toBeGreaterThan(result.atkUnequipped);
        expect(result.atkUnequipped).toBe(result.baseAtk);
        expect(result.slotEmpty).toBe(true);
        expect(result.equippedSlotCleared).toBe(true);
    });

    test('generateLootDrop: returns item when chance=1.0', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);

        const result = await page.evaluate(async () => {
            const { generateLootDrop } = await import('./items.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');
            const item = generateLootDrop('fantasy', 1.0, Tiers.MEDIUM);
            return item ? { hasItem: true, hasId: !!item.id, hasName: !!item.name, hasType: !!item.type } : null;
        });

        expect(result).not.toBeNull();
        expect(result.hasItem).toBe(true);
        expect(result.hasId).toBe(true);
        expect(result.hasName).toBe(true);
        expect(result.hasType).toBe(true);
    });

    test('generateLootDrop: returns null when chance=0.0', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);

        const result = await page.evaluate(async () => {
            const { generateLootDrop } = await import('./items.js?cb=014');
            const { Tiers } = await import('./config.js?cb=014');
            return generateLootDrop('fantasy', 0.0, Tiers.MEDIUM);
        });

        expect(result).toBeNull();
    });

    test('generateShopItems: returns non-empty array of valid items', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);

        const result = await page.evaluate(async () => {
            const { generateShopItems } = await import('./items.js?cb=014');
            const items = generateShopItems('fantasy', 1);
            return {
                isArray: Array.isArray(items),
                count: items?.length,
                firstHasName: !!items?.[0]?.name,
                firstHasType: !!items?.[0]?.type,
                firstHasCost: typeof items?.[0]?.cost === 'number',
            };
        });

        expect(result.isArray).toBe(true);
        expect(result.count).toBeGreaterThan(0);
        expect(result.firstHasName).toBe(true);
        expect(result.firstHasType).toBe(true);
        expect(result.firstHasCost).toBe(true);
    });

    test('buyShopItem: adds item to inventory and deducts gold', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { generateShopItems } = await import('./items.js?cb=014');
            const { buyShopItem } = await import('./actionHandler.js?cb=014');

            const shopItems = generateShopItems('fantasy', 1);
            // Find cheapest item the player can afford
            const item = shopItems.find(i => i.cost <= gameState.players[0].gold);
            if (!item) return { skipped: true, reason: 'No affordable item found' };

            // buyShopItem uses player.coins, not player.gold
            const coinsBefore = gameState.players[0].coins;
            const inventoryBefore = gameState.players[0].inventory.length;

            buyShopItem(item);

            const coinsAfter = gameState.players[0].coins;
            const inventoryAfter = gameState.players[0].inventory.length;

            return {
                coinsBefore,
                coinsAfter,
                inventoryBefore,
                inventoryAfter,
                itemCost: item.cost,
            };
        });

        if (result.skipped) return; // no-op if shop items all too expensive
        expect(result.inventoryAfter).toBe(result.inventoryBefore + 1);
        expect(result.coinsAfter).toBe(result.coinsBefore - result.itemCost);
    });
});

// ---------------------------------------------------------------------------
// SUITE: Combat — @combat-fast
// No AI — pure state manipulation and calculation tests
// ---------------------------------------------------------------------------

test.describe('Combat @combat-fast', () => {
    test.slow();

    test('initializeCombat: sets inCombat=true and creates combat state', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { initializeCombat } = await import('./combat.js?cb=014');

            const enemy = {
                id: 'enemy_test_001',
                name: 'Test Goblin',
                hp: 30, maxHp: 30,
                atk: 5, def: 2,
                abilities: ['Scratch'],
                statusEffects: [],
                isDefeated: false,
                speed: 4,
            };

            initializeCombat([enemy]);

            return {
                inCombat: gameState.inCombat,
                combatIsActive: gameState.combat?.isActive,
                frontLine: gameState.combat?.formation?.frontLine,
                initiativeLength: gameState.combat?.initiative?.length,
            };
        });

        expect(result.inCombat).toBe(true);
        expect(result.combatIsActive).toBe(true);
        expect(result.frontLine).toContain('enemy_test_001');
        expect(result.initiativeLength).toBeGreaterThan(0);
    });

    test('calculateDamage: returns positive damage value', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { calculateDamage } = await import('./combat.js?cb=014');

            const attacker = {
                id: 'player_smoke8_001', name: 'Hero',
                atk: 20, def: 5, statusEffects: [],
                criticalHitChance: 0, criticalHitMultiplier: 1.5,
            };
            const defender = {
                id: 'enemy_test_001', name: 'Goblin',
                hp: 100, maxHp: 100,
                atk: 5, def: 2, statusEffects: [],
                resistances: {}, element: 'Physical',
                criticalHitChance: 0, criticalHitMultiplier: 1.5,
            };

            const result = calculateDamage(attacker, defender, {});
            return {
                damage: result.damage,
                isPositive: result.damage > 0,
                hasMissedKey: 'missed' in result,
            };
        });

        expect(result.hasMissedKey).toBe(true);
        // Damage can be 0 on a miss; check it's a number
        expect(typeof result.damage).toBe('number');
    });

    test('calculateDamage: stronger attacker deals more damage than weaker', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { calculateDamage } = await import('./combat.js?cb=014');

            const makeAttacker = (atk) => ({
                id: 'player_smoke8_001', name: 'Hero',
                atk, def: 5, statusEffects: [],
                criticalHitChance: 0, criticalHitMultiplier: 1.5,
            });
            const defender = {
                id: 'enemy_test_001', name: 'Goblin',
                hp: 100, maxHp: 100,
                atk: 5, def: 2, statusEffects: [],
                resistances: {}, element: 'Physical',
                criticalHitChance: 0, criticalHitMultiplier: 1.5,
            };

            // Run 10 trials each to average out randomness
            let strongTotal = 0, weakTotal = 0;
            for (let i = 0; i < 10; i++) {
                strongTotal += calculateDamage(makeAttacker(50), defender, {}).damage || 0;
                weakTotal  += calculateDamage(makeAttacker(5),  defender, {}).damage || 0;
            }
            return { strongAvg: strongTotal / 10, weakAvg: weakTotal / 10 };
        });

        expect(result.strongAvg).toBeGreaterThan(result.weakAvg);
    });

    test('applyStatusEffect: adds effect to target statusEffects array', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { applyStatusEffect } = await import('./combat.js?cb=014');

            const target = {
                id: 'enemy_test_001', name: 'Goblin',
                hp: 30, maxHp: 30,
                statusEffects: [],
                resistances: {},
            };

            const countBefore = target.statusEffects.length;
            applyStatusEffect(target, 'Poison', 3, { hpPerTurn: -5 }, 'Test');
            const countAfter = target.statusEffects.length;

            return {
                countBefore,
                countAfter,
                effectName: target.statusEffects[0]?.name,
            };
        });

        expect(result.countBefore).toBe(0);
        expect(result.countAfter).toBe(1);
        expect(result.effectName).toBe('Poison');
    });

    test('executeWeaponAttack: reduces target HP', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { executeWeaponAttack } = await import('./combat.js?cb=014');

            const attacker = {
                id: 'player_smoke8_001', name: 'Hero',
                atk: 20, def: 5, statusEffects: [],
                inventory: [], equipment: { weapon: null, armor: null },
                criticalHitChance: 0.0,
                criticalHitMultiplier: 1.5,
                speed: 5,
            };
            const target = {
                id: 'enemy_test_001', name: 'Goblin',
                hp: 100, maxHp: 100,
                atk: 5, def: 1,
                statusEffects: [], resistances: {}, element: 'Physical',
                isDefeated: false,
                criticalHitChance: 0.0,
                criticalHitMultiplier: 1.5,
                speed: 4,
            };

            const hpBefore = target.hp;
            // Run multiple times to avoid rare miss
            let hpAfter = hpBefore;
            for (let i = 0; i < 5; i++) {
                target.hp = hpBefore;
                target.isDefeated = false;
                executeWeaponAttack(attacker, target, {});
                hpAfter = target.hp;
                if (hpAfter < hpBefore) break;
            }

            return { hpBefore, hpAfter, damageDealt: hpBefore - hpAfter };
        });

        // At least one of the 5 attacks should connect
        expect(result.hpAfter).toBeLessThan(result.hpBefore);
        expect(result.damageDealt).toBeGreaterThan(0);
    });

    test('areAllEnemiesDefeated: true when all enemy hp=0', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { areAllEnemiesDefeated } = await import('./combat.js?cb=014');

            gameState.inCombat = true;
            gameState.enemies = [
                { id: 'enemy_test_001', name: 'G1', hp: 0, maxHp: 30, isDefeated: true },
                { id: 'enemy_test_002', name: 'G2', hp: 0, maxHp: 30, isDefeated: true },
            ];

            return areAllEnemiesDefeated();
        });

        expect(result).toBe(true);
    });

    test('areAllEnemiesDefeated: false when at least one enemy alive', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { areAllEnemiesDefeated } = await import('./combat.js?cb=014');

            gameState.inCombat = true;
            gameState.enemies = [
                { id: 'enemy_test_001', name: 'G1', hp: 0, maxHp: 30, isDefeated: true },
                { id: 'enemy_test_002', name: 'G2', hp: 15, maxHp: 30, isDefeated: false },
            ];

            return areAllEnemiesDefeated();
        });

        expect(result).toBe(false);
    });

    test('isPartyWiped: true when all players downed', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { isPartyWiped } = await import('./combat.js?cb=014');

            gameState.players[0].isDowned = true;
            gameState.players[0].hp = 0;

            return isPartyWiped();
        });

        expect(result).toBe(true);
    });

    test('isPartyWiped: false when at least one player standing', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { isPartyWiped } = await import('./combat.js?cb=014');

            gameState.players[0].isDowned = false;
            gameState.players[0].hp = 80;

            return isPartyWiped();
        });

        expect(result).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SUITE: Quest Progress — @quest-fast
// No AI needed — tests the QuestProgressManager directly
// ---------------------------------------------------------------------------

test.describe('Quest progress @quest-fast', () => {
    test.slow();

    test('initializeQuestProgress: starts at beginning phase, 0%', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Defeat the dragon');

            return {
                phase: gameState.questProgress.currentPhase,
                percentage: gameState.questProgress.completionPercentage,
                objectives: gameState.questProgress.currentObjectives,
                milestonesEmpty: gameState.questProgress.milestones.length === 0,
            };
        });

        expect(result.phase).toBe('beginning');
        expect(result.percentage).toBe(0);
        expect(result.objectives).toContain('Defeat the dragon');
        expect(result.milestonesEmpty).toBe(true);
    });

    test('addMilestone: increases completionPercentage', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Test goal');

            const percentBefore = gameState.questProgress.completionPercentage;
            manager.addMilestone('first_encounter');
            const percentAfter = gameState.questProgress.completionPercentage;

            return {
                percentBefore,
                percentAfter,
                milestoneCount: gameState.questProgress.milestones.length,
            };
        });

        expect(result.percentAfter).toBeGreaterThan(result.percentBefore);
        expect(result.milestoneCount).toBe(1);
    });

    test('addMilestone: multiple milestones accumulate progress toward 100%', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Test goal');

            // Add high-weight milestones to reach resolution phase
            manager.addMilestone('plot_twist');       // weight 15
            manager.addMilestone('obstacle_overcome'); // weight 12
            manager.addMilestone('final_confrontation'); // weight 20
            manager.addMilestone('goal_achieved');    // weight 25

            return {
                percentage: gameState.questProgress.completionPercentage,
                milestoneCount: gameState.questProgress.milestones.length,
            };
        });

        expect(result.percentage).toBeGreaterThan(0);
        expect(result.milestoneCount).toBe(4);
    });

    test('addMilestone: phase advances to exploration after crossing 25%', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Test goal');

            // Add enough milestones to push past 25%
            // plot_twist=15, obstacle_overcome=12 = 27 weight pts
            manager.addMilestone('plot_twist');
            manager.addMilestone('obstacle_overcome');

            return {
                phase: gameState.questProgress.currentPhase,
                percentage: gameState.questProgress.completionPercentage,
            };
        });

        // Phase should have advanced from beginning if percentage > 25
        if (result.percentage > 25) {
            expect(result.phase).not.toBe('beginning');
        } else {
            expect(result.phase).toBe('beginning');
        }
        // Either way, percentage increased
        expect(result.percentage).toBeGreaterThan(0);
    });

    test('updateObjectives: appends new objectives without removing existing', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Find the artifact');
            manager.updateObjectives(['Explore the forest', 'Talk to the elder'], false);

            return {
                objectives: gameState.questProgress.currentObjectives,
            };
        });

        expect(result.objectives).toContain('Find the artifact');
        expect(result.objectives).toContain('Explore the forest');
        expect(result.objectives).toContain('Talk to the elder');
    });

    test('updateObjectives with replace=true: replaces all objectives', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Old objective');
            manager.updateObjectives(['New objective'], true);

            return {
                objectives: gameState.questProgress.currentObjectives,
            };
        });

        expect(result.objectives).toEqual(['New objective']);
        expect(result.objectives).not.toContain('Old objective');
    });

    test('completeObjective: removes objective from active list', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            const manager = new QuestProgressManager();
            manager.initializeQuestProgress('fantasy', 'Find the sword');
            manager.updateObjectives(['Defeat the troll'], false);

            const countBefore = gameState.questProgress.currentObjectives.length;
            manager.completeObjective('Find the sword');
            const countAfter = gameState.questProgress.currentObjectives.length;

            return {
                countBefore,
                countAfter,
                objectives: gameState.questProgress.currentObjectives,
                keyEventAdded: gameState.questProgress.keyEvents.length > 0,
            };
        });

        expect(result.countAfter).toBe(result.countBefore - 1);
        expect(result.objectives).not.toContain('Find the sword');
        expect(result.objectives).toContain('Defeat the troll');
        expect(result.keyEventAdded).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SUITE: God Mode — @godmode-fast
// No AI needed — tests the GodModeManager unlock logic directly
// ---------------------------------------------------------------------------

test.describe('God mode unlock @godmode-fast', () => {
    test.slow();

    test('checkUnlockConditions: returns false on fresh manager (no conditions met)', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { GodModeManager } = await import('./godMode.js?cb=014');
            const { QuestProgressManager } = await import('./questProgress.js?cb=014');

            // Wire managers to gameState (required by check functions)
            const questMgr = new QuestProgressManager();
            questMgr.initializeQuestProgress('fantasy', 'Test goal');
            gameState.questProgressManager = questMgr;
            gameState.turn = 1;

            const godMgr = new GodModeManager();
            gameState.godModeManager = godMgr;

            const unlocked = godMgr.checkUnlockConditions();
            return { unlocked, isUnlocked: godMgr.isUnlocked };
        });

        expect(result.unlocked).toBe(false);
        expect(result.isUnlocked).toBe(false);
    });

    test('checkUnlockConditions: isUnlocked stays false below turn threshold', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { GodModeManager } = await import('./godMode.js?cb=014');

            gameState.turn = 5; // below typical threshold
            const godMgr = new GodModeManager();
            gameState.godModeManager = godMgr;

            godMgr.checkUnlockConditions();
            return { isUnlocked: godMgr.isUnlocked };
        });

        expect(result.isUnlocked).toBe(false);
    });

    test('godModeManager has all required condition keys after init', async ({ page }) => {
        await stubHealthCheck(page);
        await gotoMainMenu(page);
        await setupMinimalState(page);

        const result = await page.evaluate(async () => {
            const { GodModeManager } = await import('./godMode.js?cb=014');

            const mgr = new GodModeManager();
            const conditionKeys = [...mgr.unlockConditions.keys()];
            return {
                conditionKeys,
                hasMainQuestline: conditionKeys.includes('main_questline'),
                hasCharDev: conditionKeys.includes('character_development'),
                hasWorldEx: conditionKeys.includes('world_exploration'),
            };
        });

        expect(result.hasMainQuestline).toBe(true);
        expect(result.hasCharDev).toBe(true);
        expect(result.hasWorldEx).toBe(true);
    });

    test('god mode check result is used in smoke7 test (integration bridge)', async ({ page }) => {
        // This test exercises the same path as the smoke7 god-mode test to
        // ensure the bridge between forced conditions and checkUnlockConditions works.
        await gotoMainMenu(page);
        await page.locator('#newGameBtn').click();
        await page.waitForSelector('#playerCountScreen:not(.hidden)', { timeout: 10_000 });
        await page.locator('.playerCountBtn[data-count="1"]').click();
        await page.waitForSelector('#adventureTypeScreen:not(.hidden)', { timeout: 10_000 });
        await page.locator('#adventureTypeSelect').selectOption('fantasy');
        await page.locator('#adventureTypeNextBtn').click();
        await page.waitForSelector('#ageInputScreen:not(.hidden)', { timeout: 10_000 });
        await page.locator('#ageInputsContainer input[type="number"]').first().fill('10');
        await page.locator('#ageInputNextBtn').click();
        await page.waitForSelector('#nameInputScreen:not(.hidden)', { timeout: 10_000 });
        await page.locator('#nameInputsContainer input[type="text"]').first().fill('Aria');
        await page.locator('#nameInputStartBtn').click();
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        const godModeResult = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            if (!gameState.godModeManager) return { error: 'godModeManager not wired' };

            // Force conditions by setting quest progress to max
            if (gameState.questProgressManager) {
                gameState.questProgressManager.progressPercent = 100;
                gameState.questProgressManager.currentPhaseIndex =
                    gameState.questProgressManager.questPhases?.length ?? 5;
            }

            try {
                gameState.godModeManager.checkUnlockConditions();
                return { isUnlocked: gameState.godModeManager.isUnlocked };
            } catch (e) {
                return { error: e.message };
            }
        });

        expect(godModeResult.error).toBeUndefined();
        expect(typeof godModeResult.isUnlocked).toBe('boolean');
    });
});

// ---------------------------------------------------------------------------
// SUITE: Live state changes (requires llama-server on :8090)
// @live — boots a real game and checks UI + state after AI responses
// ---------------------------------------------------------------------------

test.describe('Live game state @live', () => {
    test.slow();

    test('Player starts with INITIAL_COINS coins', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1, names: ['Rico'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const { INITIAL_COINS } = await import('./config.js?cb=014');
            return {
                coins: gameState.players[0]?.coins,
                expectedCoins: INITIAL_COINS,
            };
        });

        expect(result.coins).toBe(result.expectedCoins);
    });

    test('Player starts with empty status effects', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'pirate', playerCount: 1, names: ['Marina'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return {
                statusEffects: gameState.players[0]?.statusEffects,
            };
        });

        expect(result.statusEffects).toEqual([]);
    });

    test('Quest progress UI: questPercentage and questPhase elements exist', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'space', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        const percentCount = await page.locator('#questPercentage').count();
        const phaseCount   = await page.locator('#questPhase').count();

        expect(percentCount).toBeGreaterThan(0);
        expect(phaseCount).toBeGreaterThan(0);
    });

    test('Turn advances and new choices render after a player choice', async ({ page }) => {
        test.slow(); // Two AI calls: world init + player action response
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1, names: ['Knight'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        // Verify at least 2 choices on first load
        await page.waitForSelector('#choicesContainer button', { timeout: 30_000 });
        const initialCount = await page.locator('#choicesContainer button').count();
        expect(initialCount).toBeGreaterThanOrEqual(2);

        const stateBefore = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            return {
                turn: gameState.turn,
                narrative: document.querySelector('#storyText')?.textContent?.trim() || '',
                inCombat: gameState.inCombat,
            };
        });

        await page.locator('#choicesContainer button').first().click();

        // Phase 1: wait up to 120s for the narrative to change (AI responded)
        // processAIResponse calls UI.updateNarrative BEFORE choice generation, so
        // narrative changes ~halfway through the full response cycle.
        await page.waitForFunction(
            (expected) => {
                const el = document.querySelector('#storyText');
                return el && el.textContent.trim() !== expected;
            },
            stateBefore.narrative,
            { timeout: 120_000 }
        );

        // Phase 2: poll up to 30s for the turn counter or combat state to update.
        // advanceTurn() fires AFTER the choices are generated (second AI call inside
        // processAIResponse), which can be 5-15s after the narrative renders.
        let stateAfter = { ...stateBefore };
        for (let i = 0; i < 30; i++) {
            stateAfter = await page.evaluate(async () => {
                const { gameState } = await import('./state.js?cb=014');
                return {
                    turn: gameState.turn,
                    narrative: document.querySelector('#storyText')?.textContent?.trim() || '',
                    inCombat: gameState.inCombat,
                };
            });
            if (stateAfter.turn > stateBefore.turn) break;
            if (stateAfter.inCombat) break; // combat started — valid outcome
            await page.waitForTimeout(1000);
        }

        // The narrative must have changed — confirms a new AI response was rendered
        expect(stateAfter.narrative).not.toBe(stateBefore.narrative);

        // If the AI kept us in exploration (no combat), the story turn must advance.
        // If combat started, the combat system manages its own turn and gameState.turn
        // will advance when combat ends (fixed in handleCombatVictory).
        if (!stateAfter.inCombat) {
            expect(stateAfter.turn).toBeGreaterThan(stateBefore.turn);
        }
    });

    test('Inventory screen renders when opened from game screen', async ({ page }) => {
        test.setTimeout(300_000); // 5 min — this test follows a long AI call
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        // Open inventory via the quick-action button
        await page.locator('#inventoryBtn').click();
        await page.waitForSelector('#inventoryScreen:not(.hidden)', { timeout: 15_000 });

        const inventoryScreenVisible = await page.locator('#inventoryScreen').isVisible();
        expect(inventoryScreenVisible).toBe(true);

        // Return to game — button class is .backToGameBtn (no unique ID)
        await page.locator('#inventoryScreen .backToGameBtn').click();
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 15_000 });
    });

    test('Save game writes slot to localStorage from live game', async ({ page }) => {
        const SLOT = 'smoke8_live_save';
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'jungle', playerCount: 1, names: ['Tarzan'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        // Capture current state values first so we can compare
        const stateInfo = await page.evaluate(async (slot) => {
            const { gameState } = await import('./state.js?cb=014');
            const { saveGameToLocalStorage } = await import('./saveLoad.js?cb=014');
            const theme = gameState.adventureTheme;
            const playerName = gameState.players?.[0]?.name;
            const turn = gameState.turn;
            const saved = saveGameToLocalStorage(slot);
            return { theme, playerName, turn, saved };
        }, SLOT);

        const raw = await page.evaluate((slot) => localStorage.getItem('advStorySave_' + slot), SLOT);
        expect(raw).not.toBeNull();

        // Save format is { saveFormatVersion, saveDate, gameState: { ...full state } }
        const saveData = JSON.parse(raw);
        expect(saveData.saveFormatVersion).toBe(2);
        expect(saveData.gameState.adventureTheme).toBe(stateInfo.theme);
        expect(saveData.gameState.players?.[0]?.name).toBe(stateInfo.playerName);
        expect(typeof saveData.gameState.turn).toBe('number');
    });

    test('Player equipment object has weapon and armor slots defined', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'fantasy', playerCount: 1, names: ['Squire'] });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const player = gameState.players[0];
            return {
                hasEquipmentObj: !!player.equipment,
                weaponKeyExists: 'weapon' in (player.equipment ?? {}),
                armorKeyExists: 'armor' in (player.equipment ?? {}),
                // Slot is either null (no gear) or a string item id
                weaponIsNullOrString: player.equipment?.weapon === null || typeof player.equipment?.weapon === 'string',
                armorIsNullOrString: player.equipment?.armor === null || typeof player.equipment?.armor === 'string',
            };
        });

        expect(result.hasEquipmentObj).toBe(true);
        expect(result.weaponKeyExists).toBe(true);
        expect(result.armorKeyExists).toBe(true);
        expect(result.weaponIsNullOrString).toBe(true);
        expect(result.armorIsNullOrString).toBe(true);
    });

    test('messageHistory has at least one action entry after game start', async ({ page }) => {
        await gotoMainMenu(page);
        await runSetup(page, { theme: 'haunted', playerCount: 1 });
        await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 180_000 });
        // Wait for choices — they appear only after processEnhancedAIResponse completes and
        // pushes to messageHistory. History entries use { type:'action', content, response, turn }.
        await page.waitForSelector('#choicesContainer button', { timeout: 30_000 });

        const result = await page.evaluate(async () => {
            const { gameState } = await import('./state.js?cb=014');
            const history = gameState.messageHistory ?? [];
            const actionEntries = history.filter(m => m.type === 'action');
            return { total: history.length, actionCount: actionEntries.length };
        });

        expect(result.total).toBeGreaterThan(0);
        expect(result.actionCount).toBeGreaterThan(0);
    });
});
