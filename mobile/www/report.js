/**
 * Report a scene (Google Play AI-generated content policy: players must be able to
 * report or flag offensive AI content without leaving the app). A report:
 * - is kept on the device (adv.reports) for the parents' / developer's review,
 * - is sent to the storyteller with every later turn of this game as content to
 *   avoid (gameState.contentReports, saved with the game): the in-app moderation,
 * - can optionally be emailed to the developer (the report is complete without it).
 */
import { gameState } from './state.js';

export const REASONS = ['Hurtful or hateful', 'Sexual or romantic', 'Too violent or scary', 'Not right for my age', 'Something else'];
const CONTACT = 'Andro.Meta.Official@gmail.com';
const KEEP = 20;

/** Record a report for the scene on screen; returns it. */
export function recordReport(reason, note = '') {
    const scene = String(gameState.currentNarrative || '').trim().slice(-600);
    const r = { at: new Date().toISOString(), reason: REASONS.includes(reason) ? reason : 'Something else', note: String(note || '').trim().slice(0, 300), scene, gameId: gameState.gameId || null };
    try {
        const all = JSON.parse(localStorage.getItem('adv.reports') || '[]');
        localStorage.setItem('adv.reports', JSON.stringify([...all, r].slice(-KEEP)));
    } catch (_) {}
    gameState.contentReports = [...(gameState.contentReports || []), { reason: r.reason, note: r.note, excerpt: scene.slice(-200) }].slice(-3);
    return r;
}

/** The prompt line for the storyteller (empty when nothing was reported). */
export function reportsPromptLine() {
    const list = gameState.contentReports || [];
    if (!list.length) return '';
    return `THE PLAYERS REPORTED THESE SCENES AS NOT OK. Never write anything like them again, and keep well inside the content policy:\n${list.map((r, i) => `${i + 1}. ${r.reason}${r.note ? ` ("${r.note}")` : ''}: ...${r.excerpt}`).join('\n')}`;
}

/** A mailto link carrying the report (optional, opened only if the player taps it). */
export function emailLink(r) {
    const body = `Reason: ${r.reason}\nNote: ${r.note || '-'}\nWhen: ${r.at}\n\nScene:\n${r.scene}`;
    return `mailto:${CONTACT}?subject=${encodeURIComponent('Talewright Adventures: reported scene')}&body=${encodeURIComponent(body)}`;
}

/** Open the report sheet (plain DOM, like the battle picker). */
export function openReport() {
    document.getElementById('reportSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'reportSheet';
    sheet.className = 'modal';
    sheet.innerHTML = `<div class="modal-content card report-sheet" role="dialog" aria-labelledby="reportTitle">
        <h3 id="reportTitle">⚑ Report this scene</h3>
        <p class="api-key-hint">What was wrong with it? The storyteller will steer clear of it for the rest of this game.</p>
        <div class="report-reasons" role="radiogroup"></div>
        <textarea class="report-note" maxlength="300" placeholder="Anything to add? (optional)"></textarea>
        <div class="button-container"><button class="report-send primary" disabled>Report</button><button class="report-cancel btn-secondary">Cancel</button></div>
    </div>`;
    const reasons = sheet.querySelector('.report-reasons');
    let pick = null;
    for (const r of REASONS) {
        const b = document.createElement('button');
        b.className = 'report-reason btn-secondary';
        b.textContent = r;
        b.setAttribute('role', 'radio');
        b.onclick = () => { pick = r; reasons.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b))); sheet.querySelector('.report-send').disabled = false; };
        reasons.appendChild(b);
    }
    sheet.querySelector('.report-cancel').onclick = () => sheet.remove();
    sheet.querySelector('.report-send').onclick = () => {
        const r = recordReport(pick, sheet.querySelector('.report-note').value);
        sheet.querySelector('.modal-content').innerHTML = `<h3>Thank you</h3>
            <p>Reported. The storyteller won't write anything like that again in this game.</p>
            <p class="api-key-hint">You can also send it to us so we can improve the game.</p>
            <div class="button-container"><a class="button report-email btn-secondary" href="${emailLink(r)}">✉️ Email it to us</a><button class="report-done primary">Done</button></div>`;
        sheet.querySelector('.report-done').onclick = () => sheet.remove();
    };
    document.body.appendChild(sheet);
}
