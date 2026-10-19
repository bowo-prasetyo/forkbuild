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

// A card's snippet: the plain text, cut at `maxChars` and ended with "…"
// when it runs past them. Empty for no description.
export function descriptionSnippet(text, maxChars = 160) {
    const plain = descriptionPlainText(text);
    if (plain.length <= maxChars) return plain;
    return plain.slice(0, maxChars).trim() + '…';
}

// The start of the description, for a narrow panel that links to the rest:
// its first blocks (at most `maxBlocks`, up to the next section's heading)
// within about `maxChars` characters of text, the block that
// runs past them cut at a word and ended with "…". `truncated` says whether
// anything was left out, so the panel offers the rest only when there is
// more to read.
export function previewDescription(text, { maxChars = 180, maxBlocks = 2 } = {}) {
    const blocks = parseDescription(text);
    const preview = [];
    let budget = maxChars;
    let counted = 0;
    let truncated = false;
    for (const block of blocks) {
        // A heading after the start begins the next section: the rest.
        if (counted === maxBlocks || budget <= 0 || (block.type === 'heading' && counted > 0)) {
            truncated = true;
            break;
        }
        const cut = trimBlock(block, budget);
        if (!cut) {
            truncated = true;
            break;
        }
        preview.push(cut.block);
        budget -= cut.used;
        if (block.type !== 'heading') counted += 1;
        if (cut.truncated) {
            truncated = true;
            break;
        }
    }
    while (preview.length > 1 && preview[preview.length - 1].type === 'heading') {
        preview.pop();
        truncated = true;
    }
    return { blocks: preview, truncated };
}

// Shorter than this, the end of a cut block isn't worth showing.
const MIN_CUT = 40;

const runsLength = (runs) => runs.reduce((sum, run) => sum + run.text.length, 0);

// The block within `budget` characters: { block, used, truncated }, or null
// when too little of it would fit to be worth showing.
function trimBlock(block, budget) {
    if (block.type === 'heading') {
        const used = runsLength(block.runs);
        return used <= budget ? { block, used, truncated: false } : null;
    }
    const parts = block.type === 'list' ? block.items : block.lines;
    const kept = [];
    let used = 0;
    let truncated = false;
    for (const runs of parts) {
        const length = runsLength(runs);
        if (used + length <= budget) {
            kept.push(runs);
            used += length;
            continue;
        }
        truncated = true;
        if (budget - used >= MIN_CUT) {
            kept.push(trimRuns(runs, budget - used));
            used = budget;
        }
        break;
    }
    if (kept.length === 0) return null;
    const trimmed = block.type === 'list' ? { type: 'list', items: kept } : { type: 'paragraph', lines: kept };
    return { block: trimmed, used, truncated };
}

// The runs cut to `budget` characters at the last space before it (or right
// at it, for one long word), ending with "…".
function trimRuns(runs, budget) {
    const kept = [];
    let left = budget;
    let midWord = false;
    for (const run of runs) {
        if (run.text.length <= left) {
            kept.push({ ...run });
            left -= run.text.length;
            continue;
        }
        midWord = !/\s/.test(run.text[left]);
        if (left > 0) kept.push({ ...run, text: run.text.slice(0, left) });
        break;
    }
    const last = kept[kept.length - 1];
    const space = midWord ? last.text.search(/\s\S*$/) : -1;
    if (space > 0) last.text = last.text.slice(0, space);
    last.text = `${last.text.trimEnd().replace(/[.,;:!?]+$/, '')}…`;
    return kept;
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
