// battle.js - classic RPG battle layer (think Final Fantasy's Fight / Magic /
// Item / Run menus) on top of the story fight:
//  - command pickers: Item lists your real items, Special lists your moves,
//    spells and Power Strike, Attack lets you pick the target when there are
//    several foes. The choice text still comes from the storyteller.
//  - experience and levels: every defeated foe gives XP to the whole party;
//    a level-up raises max HP/MP, attack, defense and heals a little.
import { gameState } from './state.js';
import { gainXp } from './progression.js';
import { getCurrentThemeAdaptation } from './adaptiveAbilities.js';

/**
 * Area spells hit everyone on the other side (or heal the whole party):
 * targeting area/multiple/party, or a name/description that says so
 * ("Fire Storm", "a nova that scorches every foe").
 */
export function isAreaSpell(spell) {
    if (spell?.targeting === 'self' || spell?.targeting === 'ally') return false;
    if (['area', 'multiple', 'party', 'battlefield'].includes(spell?.targeting)) return true;
    const text = `${spell?.name || ''} ${spell?.description || ''} ${spell?.effect || ''}`;
    return /\b(all (foes|enemies|allies)|every (foe|enemy|ally)|everyone|whole party|area|storm|nova|blizzard|quake|earthquake|rain of|meteor|shockwave|wave of|burst|explosion|chain lightning)\b/i.test(text);
}

// ---------------------------------------------------------------- XP / levels
export { xpForLevel } from './progression.js'; // 100, 150, 200... per level (totals 100/250/450/700)

/** Raise one hero's level by n with the normal per-level gains (god mode, wishes). */
export function levelUp(p, n = 1) {
    for (let i = 0; i < n && (p.level || 1) < 999; i++) {
        p.level = (p.level || 1) + 1;
        p.maxHp = (p.maxHp || 100) + 10;
        p.maxMp = (p.maxMp || 20) + 4;
        p.baseAtk = (p.baseAtk ?? p.atk ?? 5) + 1;
        p.baseDef = (p.baseDef ?? p.def ?? 2) + (p.level % 2 === 0 ? 1 : 0);
        p.hp = Math.min(p.maxHp, (p.hp || 0) + Math.round(p.maxHp * 0.25));
        p.mp = Math.min(p.maxMp, (p.mp || 0) + 4);
        // Every 2 levels unlock the next spell level (nothing raised it, so
        // level-2 reward spells could never be cast).
        if (p.spellcasting) p.spellcasting.maxSpellLevel = Math.max(p.spellcasting.maxSpellLevel || 1, Math.min(9, Math.ceil(p.level / 2)));
    }
}

/** Give the party XP for a defeated foe; returns each hero's share and the level-up messages. */
export function awardXp(enemy) {
    // Foes are scaled up for bigger parties (engine: 15+10/hero HP, bosses
    // 40+20/hero), so the XP pot scales too: it is what the foe would give a
    // solo hero, times the party size, split between those still standing.
    // Each hero levels at the solo pace whatever the party size.
    const party = Math.max(1, (gameState.players || []).filter(Boolean).length);
    const hpScale = enemy?.isBoss ? (40 + 20 * party) / 60 : (15 + 10 * party) / 25;
    const soloHp = (enemy?.maxHp || 20) / hpScale;
    const soloXp = Math.max(8, Math.round(soloHp * 0.9)) * (enemy?.isBoss ? 3 : 1); // a 25-HP foe: 22 XP
    const standing = (gameState.players || []).filter(p => p && !p.isDowned);
    const xp = Math.max(1, Math.ceil(soloXp * party / Math.max(1, standing.length)));
    const ups = [];
    for (const p of standing) {
        const n = gainXp(p, xp, levelUp); // also gives a stat point per level
        for (let i = n - 1; i >= 0; i--) ups.push(`${p.name} reached level ${p.level - i}! Choose a stat to raise.`);
    }
    return { xp, ups };
}

// ------------------------------------------------------------ command pickers
/** Options for a battle command, or null when the command needs no picker. */
export function battleOptions(type, hero) {
    if (!hero) return null;
    const foes = (gameState.enemies || []).filter(e => e && !e.isDefeated && e.hp > 0);
    if (type === 'Attack') {
        if (foes.length < 2) return null;
        return foes.map(e => ({ label: e.name, detail: `${e.hp}/${e.maxHp} HP${e.isBoss ? ' · boss' : ''}`, type: 'Attack', text: `Attack ${e.name}` }));
    }
    if (type === 'Item') {
        const items = (hero.inventory || []).filter(i => i?.type === 'Consumable' && (i.quantity == null || i.quantity > 0) && !i.stats?.revive);
        if (!items.length) return [{ label: 'Catch your breath', detail: 'No usable items: recover a little HP', type: 'Item', text: 'Catch a breath' }];
        return items.map(i => ({ label: `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`, detail: itemDetail(i), type: 'Item', text: `Use ${i.name}` }));
    }
    if (type === 'Defend') return null; // no picker: a fixed command
    if (type === 'Special') {
        const round = gameState.combat?.round || 0;
        const opts = (hero.specialMoves || []).map(m => {
            const cd = m.currentCooldown || 0;
            const noMp = (m.mpCost || 0) > (hero.mp || 0);
            return { label: m.name, detail: cd > 0 ? `ready in ${cd}` : `${m.mpCost ? m.mpCost + ' MP · ' : ''}${m.description || 'special move'}`.slice(0, 70), type: 'Special', text: `Use ${m.name}`, disabled: cd > 0 || noMp };
        });
        for (const s of hero.spellcasting?.knownSpells || []) {
            const cost = s.mpCost || 0;
            const area = isAreaSpell(s) ? (s.effects?.healing > 0 && !(s.effects?.damage > 0) ? 'whole party · ' : 'hits all foes · ') : '';
            const kind = abilityKind();
            opts.push({ label: `${s.name} (${kind})`, detail: `${cost} MP · ${area}${s.description || s.effect || ''}`.slice(0, 80), type: 'Spell', text: `Cast ${s.name}`, disabled: (hero.mp || 0) < cost });
        }
        const winded = round - (hero.lastPowerStrikeRound ?? -99) < 2;
        opts.push({ label: 'Power Strike', detail: winded ? 'winded: a normal hit this round' : 'heavy blow, every other round', type: 'Special', text: 'Power Strike' });
        return opts;
    }
    return null;
}

/** What this world calls an ability, for menu labels: spell / ritual / tech / skill. */
function abilityKind() {
    const n = getCurrentThemeAdaptation().abilityName || '';
    return /ritual/i.test(n) ? 'ritual' : /tech|cyber/i.test(n) ? 'tech' : /skill/i.test(n) ? 'skill' : 'spell';
}

function itemDetail(i) {
    const s = i.stats || {};
    const bits = [];
    if (s.heal) bits.push(`heals ${s.heal}`);
    if (s.healPercent) bits.push(`heals ${Math.round(s.healPercent * 100)}%`);
    if (s.throwStatus) bits.push(`throw: ${s.throwStatus}`);
    if (s.applyStatus) bits.push(`gives ${[].concat(s.applyStatus).join(', ')}`);
    if (s.cure) bits.push(`cures ${s.cure}`);
    return bits.join(' · ') || (i.effect || '').slice(0, 60);
}

/**
 * Show a bottom-sheet picker; resolves to the chosen option or null (cancel).
 * Plain DOM, no dependencies; one at a time.
 */
export function pickBattleOption(title, options) {
    document.getElementById('battlePicker')?.remove();
    return new Promise(resolve => {
        const sheet = document.createElement('div');
        sheet.id = 'battlePicker';
        sheet.innerHTML = `<div class="bp-panel" role="dialog" aria-label="${title}"><div class="bp-title"></div><div class="bp-list"></div><button class="bp-cancel btn-secondary">Cancel</button></div>`;
        sheet.querySelector('.bp-title').textContent = title;
        const list = sheet.querySelector('.bp-list');
        for (const o of options) {
            const b = document.createElement('button');
            b.className = 'bp-option';
            b.disabled = !!o.disabled;
            const l = document.createElement('span'); l.className = 'bp-label'; l.textContent = o.label;
            const d = document.createElement('span'); d.className = 'bp-detail'; d.textContent = o.detail || '';
            b.append(l, d);
            b.addEventListener('click', () => { sheet.remove(); resolve(o); });
            list.appendChild(b);
        }
        const cancel = () => { sheet.remove(); resolve(null); };
        sheet.querySelector('.bp-cancel').addEventListener('click', cancel);
        sheet.addEventListener('click', (e) => { if (e.target === sheet) cancel(); });
        document.body.appendChild(sheet);
    });
}
