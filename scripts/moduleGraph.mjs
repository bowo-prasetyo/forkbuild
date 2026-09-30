// The modules a file reaches through static imports, as the browser loads
// them: relative paths, and bare specifiers through index.html's import map.
// import() is not followed; what it loads is fetched later, when it runs.
// Used by scripts/modulepreload.mjs and by the tests that check what the
// first page load contains.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Static `import ... from '...'`, side-effect `import '...'` and
// `export ... from '...'`, anchored to a statement position and limited to
// what an import clause can hold, so text that merely starts with the word
// is not mistaken for one; import() is left out on purpose. Matched in
// source order, so a file's imports come out in the order it lists them.
const STATIC_IMPORT_PATTERN = /^\s*(?:(?:import|export)\s[\w$\s{},*]*?\sfrom\s*['"]([^'"\n]+)['"]|import\s*['"]([^'"]+)['"])/gm;

export function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function staticImportSpecifiers(text) {
    return [...stripComments(text).matchAll(STATIC_IMPORT_PATTERN)].map((m) => m[1] || m[2]);
}

function readImportMap() {
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    return JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
}

function resolveSpecifier(specifier, fromFile, importMap) {
    if (specifier.startsWith('.')) return path.relative(ROOT, path.resolve(ROOT, path.dirname(fromFile), specifier)).split(path.sep).join('/');
    if (importMap[specifier]) return path.posix.normalize(importMap[specifier]);
    const prefix = Object.keys(importMap).find((key) => key.endsWith('/') && specifier.startsWith(key));
    if (prefix) return path.posix.normalize(importMap[prefix] + specifier.slice(prefix.length));
    throw new Error(`${fromFile} imports ${specifier}, which neither a relative path nor the import map resolves`);
}

// Repo-relative paths of the entries and every module they statically reach,
// breadth first: an entry, then what it imports, then what those import.
export function staticGraph(...entries) {
    const importMap = readImportMap();
    const reached = new Set();
    const queue = [...entries];
    while (queue.length > 0) {
        const file = queue.shift();
        if (reached.has(file)) continue;
        reached.add(file);
        for (const specifier of staticImportSpecifiers(readFileSync(path.join(ROOT, file), 'utf8'))) {
            queue.push(resolveSpecifier(specifier, file, importMap));
        }
    }
    return reached;
}
