// Test-support only. The modules a file reaches through static imports, as
// the browser loads them: relative paths, and bare specifiers through
// index.html's import map. import() is not followed; what it loads is
// fetched later, when it runs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Static `import ... from '...'`, side-effect `import '...'` and
// `export ... from '...'`, anchored to a statement position and limited to
// what an import clause can hold, so text that merely starts with the word
// is not mistaken for one; import() is left out on purpose.
const STATIC_IMPORT_PATTERNS = [
    /^\s*(?:import|export)\s[\w$\s{},*]*?\sfrom\s*['"]([^'"\n]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm
];

export function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function staticImportSpecifiers(text) {
    const code = stripComments(text);
    return STATIC_IMPORT_PATTERNS.flatMap((pattern) => [...code.matchAll(pattern)].map((m) => m[1]));
}

const importMap = JSON.parse(
    readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]
).imports;

function resolveSpecifier(specifier, fromFile) {
    if (specifier.startsWith('.')) return path.relative(ROOT, path.resolve(ROOT, path.dirname(fromFile), specifier));
    if (importMap[specifier]) return path.normalize(importMap[specifier]);
    const prefix = Object.keys(importMap).find((key) => key.endsWith('/') && specifier.startsWith(key));
    if (prefix) return path.normalize(importMap[prefix] + specifier.slice(prefix.length));
    throw new Error(`${fromFile} imports ${specifier}, which neither a relative path nor the import map resolves`);
}

// Repo-relative paths of `entry` and every module it statically reaches.
export function staticGraph(entry) {
    const reached = new Set();
    const pending = [entry];
    while (pending.length > 0) {
        const file = pending.pop();
        if (reached.has(file)) continue;
        reached.add(file);
        for (const specifier of staticImportSpecifiers(readFileSync(path.join(ROOT, file), 'utf8'))) {
            pending.push(resolveSpecifier(specifier, file));
        }
    }
    return reached;
}
