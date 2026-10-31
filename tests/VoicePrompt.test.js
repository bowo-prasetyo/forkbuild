// ui/voice/voicePrompt.js, the words voice building could tell the speech
// model to expect, and scripts/compare-voice-prompts.mjs, which measured
// whether it should (docs/reviews/VoicePrompt-2026-10-30.md).
import { voicePrompt } from '../ui/voice/voicePrompt.js';
import { decide, decideGuards, editDistance, heardIn, signTest, units } from '../scripts/compare-voice-prompts.mjs';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

{
    await setAppLocale('en');
    const editor = voicePrompt('editor').split(', ');
    assert(editor.includes('roof') && editor.includes('red') && editor.includes('paint') && editor.includes('Undo'), '1. the Editor\'s prompt has its parts, colours, what to do and its actions');
    assert(editor.slice(-3).join() === 'paint,delete,select', '2. what to do comes last, where the model heeds it most');
    assert(new Set(editor.map((word) => word.toLowerCase())).size === editor.length, '3. no word twice');
    assert(!editor.includes('Voice'), '4. never Voice itself');
    const expanded = voicePrompt('editor', { expanded: true }).split(', ');
    assert(editor.every((word) => expanded.includes(word)) && expanded.includes('boulder') && expanded.length > editor.length, '5. expanded, every phrasing the app reads');
    const actions = [{ id: 'history.undo', label: 'Sparkle' }, { id: 'file.publish', label: 'Publish' }];
    assert(voicePrompt('editor', { actions }).startsWith('Sparkle') && !voicePrompt('editor', { actions }).includes('Publish'),
        '6. an action is in it by the name the Editor gives it, and only those voice may run');
    const world = voicePrompt('world', { places: [{ title: 'The Old Mill' }] });
    assert(world.endsWith('go to, The Old Mill') && world.includes('first person'), '7. World View\'s prompt has its commands and, last, the World\'s Locations');
    const apart = voicePrompt('editor', { apart: true }).split(', ');
    assert(apart.length < editor.length && apart.every((word) => editor.includes(word)), '8a. apart, a part of the prompt');
    assert(!apart.includes('everything') && !apart.includes('Select All') && apart.includes('roof') && apart.includes('Undo'),
        '8b. without the words for everything, keeping what nothing is spelled near');
    await setAppLocale('pt-BR');
    const portuguese = voicePrompt('editor', { apart: true }).split(', ');
    assert(voicePrompt('editor').includes('Desfazer') && !portuguese.includes('Desfazer') && !portuguese.includes('Refazer'),
        '8c. two words for different things spelled nearly alike, both left out');
    await setAppLocale('ja');
    assert(voicePrompt('editor').includes('屋根'), '8. in the chosen language');
    await setAppLocale('en');
}
console.log('✓ the prompt, made from what the app can act on');

{
    assert(units('Paint the roof, red!', 'en').join() === 'paint,the,roof,red' && units('屋根を赤く。', 'ja').join('') === '屋根を赤く', '9. words, or in Japanese and Korean characters, without punctuation');
    assert(editDistance(['a', 'b', 'c'], ['a', 'x', 'c', 'd']) === 2 && editDistance([], ['a']) === 1, '10. the fewest changes');
    const files = { 'a.json': [{ language: 'en', speaker: 's', id: 'x', transcript: 'a' }, { language: 'de', speaker: 's', id: 'x', transcript: 'a' }],
        'b.json': [{ language: 'en', speaker: 's', id: 'x', transcript: 'b' }] };
    const merged = heardIn('a.json+b.json', (file) => files[file]);
    assert(merged.length === 2 && merged.find((clip) => clip.language === 'en').transcript === 'b' && merged.find((clip) => clip.language === 'de').transcript === 'a',
        '11a. a+b: b\'s recordings in place of a\'s');
    assert(signTest(0, 0) === 1 && signTest(10, 0) < 0.01 && signTest(6, 4) > 0.5, '11. a sign test');
    const row = (language, expect, verdict, key, ms = 1000) => ({ language, expect, verdict, key, ms, edits: 0, length: 1 });
    const baseline = { rows: [row('en', 'x', 'nothing', 'a'), row('en', 'none', 'right', 'n'), ...Array.from({ length: 12 }, (_, i) => row('de', 'x', 'nothing', `d${i}`))] };
    const better = { rows: [row('en', 'x', 'right', 'a'), row('en', 'none', 'right', 'n'), ...Array.from({ length: 12 }, (_, i) => row('de', 'x', 'right', `d${i}`))] };
    assert(decide(baseline, better).use, '12. more commands right, nothing more done that must be undone: used');
    const activating = { rows: better.rows.map((each) => (each.key === 'n' ? { ...each, verdict: 'wrong' } : each)) };
    const verdict = decide(baseline, activating);
    assert(!verdict.use && verdict.rule === 1, '13. one more false activation in one language, and it isn\'t, however much better it hears');
    const slow = { rows: better.rows.map((each) => ({ ...each, ms: 2000 })) };
    assert(!decide(baseline, slow).use && decide(baseline, slow).rule === 2, '14. nor when a command takes much longer');
    const barely = { rows: baseline.rows.map((each) => (each.key === 'a' ? { ...each, verdict: 'right' } : each)) };
    assert(!decide(baseline, barely).use && decide(baseline, barely).rule === 3, '15. nor when what it fixes could be chance');
    const quieter = { rows: baseline.rows.map((each) => (each.key === 'n' ? each : each)) };
    assert(decideGuards(baseline, quieter).use, '16. guards that change nothing may stay');
    assert(!decideGuards(baseline, activating).use && decideGuards(baseline, activating).rule === 1, '17. guards that do more that must be undone, anywhere, may not');
    const losing = { rows: better.rows.map((each) => (each.language === 'de' ? { ...each, verdict: 'nothing' } : each)) };
    assert(!decideGuards(better, losing).use && decideGuards(better, losing).rule === 2, '18. nor guards that throw away more than one command in a hundred');
}
console.log('✓ the comparison and its rule');

console.log('✅ All voice prompt tests passed.');
