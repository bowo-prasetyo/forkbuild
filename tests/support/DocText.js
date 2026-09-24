// Test-support only. Reads a developer document's text by its repo-relative
// path, e.g. readDoc('docs/Roadmap.md'), whether or not it has been split
// into parts.
//
// A split document lists its parts as Markdown links between a
// "<!-- parts:start" and a "<!-- parts:end -->" comment. readDoc() then
// returns the parts' text joined in that order, each without its own
// leading "# " title line, so a test sees one text however the document
// is divided. A document without that block is returned as it is.
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

const PARTS_BLOCK = /<!-- parts:start[\s\S]*?<!-- parts:end -->/;
const PART_LINK = /\]\(([^)#\s]+\.md)\)/g;
const PART_TITLE = /^# [^\n]*\n\n?/;

export async function readDoc(relativePath) {
    const url = new URL(relativePath, root);
    const text = await readFile(url, 'utf8');
    const block = text.match(PARTS_BLOCK);
    if (!block) return text;
    const partUrls = [...block[0].matchAll(PART_LINK)].map((m) => new URL(m[1], url));
    if (partUrls.length === 0) throw new Error(`${relativePath} has a parts block with no part links`);
    const parts = await Promise.all(partUrls.map((partUrl) => readFile(partUrl, 'utf8')));
    return parts.map((part) => part.replace(PART_TITLE, '')).join('');
}
