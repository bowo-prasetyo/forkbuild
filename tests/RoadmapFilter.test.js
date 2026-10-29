import { readDoc } from './support/DocText.js';
import { assert } from './support/Assert.js';

// Every roadmap entry from "The filter's answers, checked" (2026-10-29) on
// answers the filter's four questions (docs/Pillars.md, "The filter"), each
// after its label in a numbered list, as docs/Roadmap.md's "Adding an entry"
// says. Entries before it are left as they were written.

const FIRST_CHECKED = "The filter's answers, checked";
const ANSWERS = Object.freeze([
    Object.freeze({ number: 1, label: 'Pillar' }),
    Object.freeze({ number: 2, label: 'First ten minutes' }),
    Object.freeze({ number: 3, label: 'Building first' }),
    Object.freeze({ number: 4, label: 'Counts' })
]);

// The roadmap's entries, in order: { title, body }.
function roadmapEntries(text) {
    const entries = [];
    const heading = /^## (.+)$/gm;
    const found = [...text.matchAll(heading)];
    found.forEach((match, i) => {
        const end = i + 1 < found.length ? found[i + 1].index : text.length;
        entries.push({ title: match[1].trim(), body: text.slice(match.index + match[0].length, end) });
    });
    return entries;
}

// The labels an entry's body leaves out or leaves empty, in order.
export function missingAnswers(body) {
    return ANSWERS.filter(({ number, label }) => {
        const line = new RegExp(`^${number}\\. \\*\\*${label}:\\*\\* *(\\S.*)?$`, 'm').exec(body);
        return !line || !line[1];
    }).map(({ label }) => label);
}

// The check itself, on made-up entries.
{
    const full = [
        '**The filter.**',
        '1. **Pillar:** building feels joyful; a row in one stroke.',
        '2. **First ten minutes:** no harder.',
        '3. **Building first:** yes, it is building.',
        '4. **Counts:** none yet.'
    ].join('\n');
    assert(missingAnswers(full).length === 0, 'four answers, each after its label, pass');
    assert(missingAnswers(full.replace('4. **Counts:** none yet.', '')).join() === 'Counts', 'a missing answer is named');
    assert(missingAnswers(full.replace(' none yet.', '')).join() === 'Counts', 'so is a label with nothing after it');
    assert(missingAnswers('Pillar served: building. Counts: none.').join() === 'Pillar,First ten minutes,Building first,Counts',
        'an answer written in passing, without the list, is not one');
    console.log('✓ the four answers are found by their labels');
}

// The roadmap's entries from the first checked one on.
{
    const entries = roadmapEntries(await readDoc('docs/Roadmap.md'));
    const first = entries.findIndex((entry) => entry.title.startsWith(FIRST_CHECKED));
    assert(first >= 0, `the roadmap has the entry "${FIRST_CHECKED}" the check starts at`);
    const checked = entries.slice(first);
    const failing = checked
        .map((entry) => ({ title: entry.title, missing: missingAnswers(entry.body) }))
        .filter((entry) => entry.missing.length > 0);
    assert(failing.length === 0,
        `roadmap entries without the filter's four answers (docs/Roadmap.md, "Adding an entry"):\n${failing.map((entry) => `  ${entry.title}: ${entry.missing.join(', ')}`).join('\n')}`);
    console.log(`✓ ${checked.length} roadmap entr${checked.length === 1 ? 'y answers' : 'ies answer'} the filter's four questions`);
}
