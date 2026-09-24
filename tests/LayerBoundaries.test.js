// Layer boundaries: the import rules docs/Architecture.md describes for
// core/ and renderer/, checked against every file's real import
// statements. A test fails only when a file actually imports across a
// boundary, never because of how code or comments are worded.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './support/Assert.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const RULES = [
    { layer: 'core', forbiddenDirs: ['application', 'renderer', 'ui'], forbiddenPackages: ['three', 'vue', 'vue-router'] },
    { layer: 'renderer', forbiddenDirs: ['application', 'ui'], forbiddenPackages: ['vue', 'vue-router'] }
];

// Static `import ... from '...'`, side-effect `import '...'`,
// `export ... from '...'` and dynamic `import('...')`, each anchored to
// a statement position so specifiers quoted in comments or strings are
// not mistaken for imports.
const IMPORT_PATTERNS = [
    /^\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
];

function jsFiles(dir) {
    return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return jsFiles(rel);
        return entry.name.endsWith('.js') ? [rel] : [];
    });
}

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function importSpecifiers(text) {
    const code = stripComments(text);
    return IMPORT_PATTERNS.flatMap((pattern) => [...code.matchAll(pattern)].map((m) => m[1]));
}

function violationsFor({ layer, forbiddenDirs, forbiddenPackages }) {
    const violations = [];
    for (const file of jsFiles(layer)) {
        for (const specifier of importSpecifiers(readFileSync(path.join(ROOT, file), 'utf8'))) {
            if (specifier.startsWith('.')) {
                const target = path.relative(ROOT, path.resolve(ROOT, path.dirname(file), specifier)).split(path.sep)[0];
                if (forbiddenDirs.includes(target)) violations.push(`${file} imports ${specifier}`);
            } else {
                const pkg = specifier.split('/')[0];
                if (forbiddenPackages.includes(pkg)) violations.push(`${file} imports ${specifier}`);
            }
        }
    }
    return violations;
}

// The scanner itself: real imports are found, commented-out ones are not.
{
    const sample = [
        "import { A } from '../application/A.js';",
        "export { B } from './B.js';",
        "import './side-effect.js';",
        "const c = await import('../ui/C.js');",
        "// import { D } from '../ui/D.js';",
        "/* import { E } from '../ui/E.js'; */"
    ].join('\n');
    const found = importSpecifiers(sample);
    assert(JSON.stringify(found) === JSON.stringify(['../application/A.js', './B.js', './side-effect.js', '../ui/C.js']),
        `the scanner finds exactly the four real imports (found ${JSON.stringify(found)})`);
}

for (const rule of RULES) {
    const violations = violationsFor(rule);
    assert(violations.length === 0,
        `${rule.layer}/ must not import from ${[...rule.forbiddenDirs.map((d) => `${d}/`), ...rule.forbiddenPackages].join(', ')}:\n  ${violations.join('\n  ')}`);
    console.log(`✓ ${rule.layer}/ respects its import boundary`);
}

console.log('\n✅ All LayerBoundaries tests passed.');
