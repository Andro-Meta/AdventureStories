// ui_solo.mjs - after a 2-player setup, does choosing Solo still show extra hero inputs?
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(2500);
const run = async (n) => { await p.click('#newGameBtn'); await p.click(`.playerCountBtn[data-count="${n}"]`); await p.click('#adventureTypeNextBtn');
  const ages = await p.$$eval('#ageInputsContainer input', e => e.length); await p.$$eval('#ageInputsContainer input', e => e.forEach(i => i.value = 10)); await p.click('#ageInputNextBtn');
  const names = await p.$$eval('#nameInputsContainer input', e => e.map(i => i.value)); return { n, ages, names }; };
console.log(JSON.stringify(await run(3)));
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(2500);
console.log(JSON.stringify(await run(1)));
await b.close();
