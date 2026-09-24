// Test-support only. Reads a repository file's text by its repo-relative
// path, e.g. readSource('ui/main.js').
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

export async function readSource(relativePath) {
    return readFile(new URL(relativePath, root), 'utf8');
}
