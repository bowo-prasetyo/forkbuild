// A build's description may use a small part of Markdown, so a long one
// reads well: blank lines between paragraphs, "## " headings, "- " (or "* ")
// bullet lists, **bold** and *italic*. Nothing else is markup: links,
// images, HTML and the rest of Markdown stay plain text wherever the
// description is shown. A description without any of it reads exactly as
// before. "\*", "\#", "\-" and "\\" write the character itself.
//
// parseDescription(text) returns its blocks:
//   { type: 'paragraph', lines: [runs, …] }   (a line break between lines)
//   { type: 'heading', runs }
//   { type: 'list', items: [runs, …] }
// where runs are [{ text, bold, italic }, …], each run's text plain.

const HEADING = /^#{1,3}[ \t]+(.*)$/;
const LIST_ITEM = /^[-*][ \t]+(.*)$/;
const ESCAPABLE = new Set(['*', '#', '-', '\\']);

export function parseDescription(text) {
    if (typeof text !== 'string') return [];
    const blocks = [];
    let paragraph = null;
    let list = null;
    for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
        const line = rawLine.trim();
        if (line === '') {
            paragraph = null;
            list = null;
            continue;
        }
        const heading = HEADING.exec(line);
        const item = LIST_ITEM.exec(line);
        if (heading && heading[1].trim() !== '') {
            paragraph = null;
            list = null;
            blocks.push({ type: 'heading', runs: parseInline(heading[1].trim()) });
        } else if (item && item[1].trim() !== '') {
            paragraph = null;
            if (!list) {
                list = { type: 'list', items: [] };
                blocks.push(list);
            }
            list.items.push(parseInline(item[1].trim()));
        } else {
            list = null;
            if (!paragraph) {
                paragraph = { type: 'paragraph', lines: [] };
                blocks.push(paragraph);
            }
            paragraph.lines.push(parseInline(line));
        }
    }
    return blocks;
}

// The description as one line of plain text, for snippets and previews:
// the words without the markup.
export function descriptionPlainText(text) {
    const runsText = (runs) => runs.map((run) => run.text).join('');
    return parseDescription(text).map((block) => {
        if (block.type === 'heading') return runsText(block.runs);
        if (block.type === 'list') return block.items.map(runsText).join(' · ');
        return block.lines.map(runsText).join(' ');
    }).join(' ').replace(/\s+/g, ' ').trim();
}

// **bold** and *italic*, each opening right before a non-space and closing
// right after one, on the same line; *italic* may sit inside **bold** and
// the other way round. A marker without its partner is plain text.
function parseInline(line) {
    const runs = [];
    const push = (text, bold, italic) => {
        if (text === '') return;
        const last = runs[runs.length - 1];
        if (last && last.bold === bold && last.italic === italic) last.text += text;
        else runs.push({ text, bold, italic });
    };
    walk(line, false, false, push);
    return runs;
}

function walk(text, bold, italic, push) {
    let plain = '';
    let i = 0;
    while (i < text.length) {
        const character = text[i];
        if (character === '\\' && ESCAPABLE.has(text[i + 1])) {
            plain += text[i + 1];
            i += 2;
            continue;
        }
        if (character === '*') {
            const marker = !bold && text.startsWith('**', i) ? '**' : (!italic ? '*' : null);
            const close = marker ? closingMarker(text, i + marker.length, marker) : -1;
            if (close !== -1) {
                push(plain, bold, italic);
                plain = '';
                walk(text.slice(i + marker.length, close), bold || marker === '**', italic || marker === '*', push);
                i = close + marker.length;
                continue;
            }
        }
        plain += character;
        i += 1;
    }
    push(plain, bold, italic);
}

// Where the marker that opened at `start` closes, or -1: the next marker,
// not escaped, with no space just inside either end and something between.
// A single "*" never closes on half of a "**".
function closingMarker(text, start, marker) {
    if (start >= text.length || /\s/.test(text[start])) return -1;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '\\' && ESCAPABLE.has(text[i + 1])) {
            i += 1;
            continue;
        }
        if (!text.startsWith(marker, i)) continue;
        if (marker === '*' && text[i + 1] === '*') {
            const inner = closingMarker(text, i + 2, '**');
            if (inner !== -1) {
                i = inner + 1;
                continue;
            }
        }
        if (i > start && !/\s/.test(text[i - 1])) return i;
    }
    return -1;
}
