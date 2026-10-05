import { descriptionPlainText, parseDescription } from '../core/DescriptionMarkup.js';
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
