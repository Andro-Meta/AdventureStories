// Reading level of saved live stories (tools/live_test.mjs --turns N --tag X
// writes test-results/story_X.json). Per run: words per scene, words per
// sentence, Flesch-Kincaid grade, share of long (3+ syllable) words.
//   node tools/reading_level.mjs age6 age9 age13 age30
import fs from 'node:fs';
const { textLevel } = await import('../ageAppropriateReading.js');
const avg = (a, k) => a.reduce((n, x) => n + x[k], 0) / Math.max(1, a.length);
console.log('run        scenes  words/scene  words/sentence  FK grade  long words');
for (const tag of process.argv.slice(2)) {
  const story = JSON.parse(fs.readFileSync(`test-results/story_${tag}.json`, 'utf8'));
  const scenes = (story.log || []).filter(s => !s.startsWith('## ') && !s.startsWith('— ')).map(textLevel);
  console.log(`${tag.padEnd(10)} ${String(scenes.length).padStart(6)}  ${avg(scenes, 'words').toFixed(0).padStart(11)}  ${avg(scenes, 'wps').toFixed(1).padStart(14)}  ${avg(scenes, 'grade').toFixed(1).padStart(8)}  ${(100 * avg(scenes, 'long')).toFixed(0).padStart(9)}%`);
}
