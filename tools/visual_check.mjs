// Visual check at phone width: menus and an injected battle (no AI calls).
import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, deviceScaleFactor: 2 })).newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.goto('http://127.0.0.1:8399/'); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/1_main_menu.png` });
await p.click('#newGameBtn').catch(() => {}); await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/2_after_new.png` });
// Injected battle
await p.evaluate(async () => {
  const { gameState, createNewPlayer } = await import('/state.js');
  const UI = await import('/ui.js'); const Combat = await import('/combat.js');
  const h = createNewPlayer('Michael', 40); gameState.players = [h]; gameState.currentPlayerIndex = 0;
  h.specialMoves = [{ id: 'm1', name: 'Tidal Slash', cooldown: 3, currentCooldown: 0, mpCost: 5, description: 'A sweeping wave cut.' }];
  h.spellcasting = { knownSpells: [{ id: 's1', name: 'Fire Storm', mpCost: 6, effects: { damage: 20 }, description: 'Flames rain on every foe.' }, { id: 's2', name: 'Mending Light', mpCost: 6, effects: { healing: 20 }, description: 'Restores some health.' }], preparedSpells: [], maxSpellLevel: 1 };
  h.inventory.push({ id: 'pot', name: 'Healing Potion', type: 'Consumable', stats: { heal: 30 }, quantity: 2 });
  gameState.enemies = [{ id: 'enemy_a', name: 'Mountain Drake', hp: 18, maxHp: 25, atk: 8, def: 3, statusEffects: [], abilities: ['Basic Attack'] },
                       { id: 'enemy_b', name: 'Malakor', hp: 60, maxHp: 60, atk: 10, def: 4, isBoss: true, statusEffects: [], abilities: ['Crushing Blow'] }];
  gameState.adventureGoal = 'Pay off the debt before the moon wanes.'; gameState.turn = 12;
  gameState.currentNarrative = 'The drake circles while Malakor raises his staff.';
  Combat.initializeCombat(gameState.enemies);
  Combat.applyStatusEffect(h, 'Guarding', 2, {}, 't'); Combat.applyStatusEffect(gameState.enemies[1], 'Slow', 3, {}, 't');
  UI.showScreen('gameScreen'); UI.updateNarrative?.(gameState.currentNarrative); UI.renderPlayerCards(); UI.renderEnemyCards();
  UI.renderChoices([{ type: 'Attack', text: 'Strike the drake' }, { type: 'Special', text: 'Unleash Tidal Slash' }, { type: 'Item', text: 'Drink a potion' }, { type: 'Run', text: 'Flee' }]);
});
await p.waitForTimeout(600);
await p.evaluate(() => document.getElementById('choicesContainer')?.scrollIntoView({ block: 'center' }));
await p.screenshot({ path: `${OUT}/3_battle_choices.png` });
await p.evaluate(() => [...document.querySelectorAll('#choicesContainer .choice-btn')].find(b => b.dataset.actionType === 'Special')?.click());
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/4_special_picker.png` });
const cancel = await p.evaluate(() => { const c = document.querySelector('#battlePicker .bp-cancel')?.getBoundingClientRect(); return c ? { top: c.top, bottom: c.bottom, vh: innerHeight } : null; });
console.log('picker cancel', JSON.stringify(cancel));
console.log('buttons', await p.evaluate(() => [...document.querySelectorAll('#choicesContainer .choice-btn')].map(b => b.dataset.actionType).join(',')));
console.log('errors', JSON.stringify(errors));
await b.close();
