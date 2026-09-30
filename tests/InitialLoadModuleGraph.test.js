// What the browser downloads before the app first renders: every module
// ui/main.js reaches through static imports (index.html's import map
// resolves the bare ones). Pages other than Home and the thumbnail renderer
// are imported with import() when first needed (ui/router/index.js,
// application/editor/CreatePreviewUseCase.js); a static import of one of
// them puts its whole graph back into the first load, about half the app
// for the pages and Three.js for the renderer.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './support/Assert.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Static `import ... from '...'`, side-effect `import '...'` and
// `export ... from '...'`, anchored to a statement position and limited to
// what an import clause can hold, so text that merely starts with the word
// is not mistaken for one; import() is left out on purpose.
const STATIC_IMPORT_PATTERNS = [
    /^\s*(?:import|export)\s[\w$\s{},*]*?\sfrom\s*['"]([^'"\n]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm
];

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function staticImportSpecifiers(text) {
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

function staticGraph(entry) {
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

// The scanner itself: static imports are found, import() and comments are not.
{
    const sample = [
        "import { A } from '../application/A.js';",
        "export { B } from './B.js';",
        "import './side-effect.js';",
        "const C = () => import('../views/C.js');",
        "// import D from '../views/D.js';"
    ].join('\n');
    const found = staticImportSpecifiers(sample);
    assert(JSON.stringify(found) === JSON.stringify(['../application/A.js', './B.js', './side-effect.js']),
        `the scanner finds exactly the three static imports (found ${JSON.stringify(found)})`);
}

const initialLoad = staticGraph('ui/main.js');

// The walk really covers the app shell, so an empty result can't pass.
for (const file of ['ui/App.js', 'ui/router/index.js', 'ui/views/HomeView.js', 'vendor/vue/dist/vue.esm-browser.prod.js']) {
    assert(initialLoad.has(file), `${file} is part of the first load`);
}
console.log(`✓ the first load reaches the app shell (${initialLoad.size} modules)`);

const eagerPages = [...initialLoad].filter((file) => file.startsWith('ui/views/') && file !== 'ui/views/HomeView.js');
assert(eagerPages.length === 0,
    `pages other than Home load when first opened, not with the app; statically reached:\n  ${eagerPages.join('\n  ')}`);
console.log('✓ no page but Home is in the first load');

const eagerThree = [...initialLoad].filter((file) => file.startsWith('vendor/three/'));
assert(eagerThree.length === 0, `Three.js loads with the first page that draws in 3D, not with the app; statically reached:\n  ${eagerThree.join('\n  ')}`);
console.log('✓ Three.js is not in the first load');

console.log('\n✅ All InitialLoadModuleGraph tests passed.');
