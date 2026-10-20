import { descriptionPlainText, parseDescription, previewDescription } from '../core/document/DescriptionMarkup.js';
import { assert } from './support/Assert.js';

// Runs as [text, 'b' | 'i' | 'bi' | ''] pairs, for comparing.
const runs = (list) => list.map((run) => [run.text, `${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}`]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Blocks: paragraphs (a line break between their lines), headings and
// bullet lists, separated by blank lines or by starting another kind.
{
    const blocks = parseDescription('Intro line\nsecond line\n\n## Materials\n- **Plinth:** stone\n* Posts\n\nAfter\r\n### Roof');
    assert(same(blocks.map((block) => block.type), ['paragraph', 'heading', 'list', 'paragraph', 'heading']), `the blocks (got ${blocks.map((block) => block.type)})`);
    assert(blocks[0].lines.length === 2 && runs(blocks[0].lines[1])[0][0] === 'second line', 'a paragraph keeps its lines');
    assert(runs(blocks[1].runs)[0][0] === 'Materials', 'a heading\'s text, without its marks');
    assert(same(runs(blocks[2].items[0]), [['Plinth:', 'b'], [' stone', '']]) && runs(blocks[2].items[1])[0][0] === 'Posts', 'list items, "-" or "*"');
    assert(same(parseDescription('#hashtag\n-dash\n####   too deep\n## ').map((block) => block.type), ['paragraph']), 'a mark without its space, a fourth "#" or an empty heading is text');
    assert(same(parseDescription('   \n\n'), []) && same(parseDescription(null), []), 'nothing to show');
    console.log('✓ blocks');
}

// Bold and italic open before a non-space and close after one, on the same
// line, and nest; a lone or spaced marker is text, and "\" escapes one.
{
    const line = (text) => runs(parseDescription(text)[0].lines[0]);
    assert(same(line('A **bold** and *it* word'), [['A ', ''], ['bold', 'b'], [' and ', ''], ['it', 'i'], [' word', '']]), 'bold and italic');
    assert(same(line('**bold *both* bold**'), [['bold ', 'b'], ['both', 'bi'], [' bold', 'b']]), 'italic inside bold');
    assert(same(line('*it **both** it*'), [['it ', 'i'], ['both', 'bi'], [' it', 'i']]), 'bold inside italic');
    assert(same(line('2 * 3 * 4 and ** x **'), [['2 * 3 * 4 and ** x **', '']]), 'markers next to spaces are text');
    assert(same(line('**unclosed and *also'), [['**unclosed and *also', '']]), 'markers without their partner are text');
    assert(same(line('\\*not italic\\* \\# \\- \\\\'), [['*not italic* # - \\', '']]), 'escaped marks are the characters');
    assert(same(line('<b>x</b> [a](https://e.example) @bob'), [['<b>x</b> [a](https://e.example) @bob', '']]), 'HTML, links and mentions are plain text here');
    console.log('✓ bold and italic');
}

// For snippets: the words, without the formatting, on one line.
{
    assert(descriptionPlainText('Intro\n\n## Materials\n- **Plinth:** stone\n- *Posts*') === 'Intro Materials Plinth: stone · Posts', `the words (got ${descriptionPlainText('Intro\n\n## Materials\n- **Plinth:** stone\n- *Posts*')})`);
    assert(descriptionPlainText('A plain description.') === 'A plain description.' && descriptionPlainText(undefined) === '', 'a plain description is unchanged');
    console.log('✓ plain text');
}

// For a narrow panel: the start of the description, and whether there's more.
{
    const textOf = (blocks) => blocks.map((block) => {
        if (block.type === 'heading') return `#${block.runs.map((run) => run.text).join('')}`;
        const parts = block.type === 'list' ? block.items : block.lines;
        return parts.map((runs) => runs.map((run) => run.text).join('')).join('|');
    });
    const short = previewDescription('A small hut.\n\n- one\n- two');
    assert(!short.truncated && same(textOf(short.blocks), ['A small hut.', 'one|two']), 'a short description is shown whole');

    const third = previewDescription('One.\n\nTwo.\n\nThree.');
    assert(third.truncated && same(textOf(third.blocks), ['One.', 'Two.']), 'two blocks at most, then "more"');

    const headed = previewDescription('## History\nBuilt for the challenge.\n\n## Materials\n- stone');
    assert(headed.truncated && same(textOf(headed.blocks), ['#History', 'Built for the challenge.']), `a heading leads the start; the next section's heading ends it (got ${textOf(headed.blocks)})`);

    const words = 'word '.repeat(80).trim();
    const long = previewDescription(`**Bold start** ${words}`);
    const lastRun = long.blocks[0].lines[0].at(-1).text;
    assert(long.truncated && lastRun.endsWith('word…') && !lastRun.endsWith(' …'), `a long paragraph is cut at a word, with "…" (got …${lastRun.slice(-12)})`);
    assert(long.blocks[0].lines[0][0].bold && runsLength(long.blocks[0].lines[0]) <= 181, 'within the budget, its formatting kept');
    const sentence = previewDescription(`${'Some words here. '.repeat(20)}`).blocks[0].lines[0][0].text;
    assert(sentence.endsWith('here…') || sentence.endsWith('words…') || sentence.endsWith('Some…'), `no stop left before "…" (got …${sentence.slice(-10)})`);
    assert(parseDescription(`**Bold start** ${words}`)[0].lines[0].at(-1).text === ` ${words}`, 'the parsed description itself is untouched');

    const list = previewDescription(`Intro.\n\n${Array.from({ length: 30 }, (_, i) => `- item number ${i}`).join('\n')}`, { maxChars: 120 });
    assert(list.truncated && list.blocks[1].type === 'list' && list.blocks[1].items.length < 30, 'a long list shows its first items');

    assert(same(textOf(previewDescription('## Only a heading').blocks), ['#Only a heading']), 'a heading alone is shown');
    assert(same(previewDescription(''), { blocks: [], truncated: false }), 'nothing to show');
    console.log('✓ preview');
}

function runsLength(runs) {
    return runs.reduce((sum, run) => sum + run.text.length, 0);
}
