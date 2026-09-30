// index.html's <link rel="modulepreload"> hints list exactly the modules the
// first load needs (scripts/modulepreload.mjs): one left out is found an
// import at a time again, and one too many (a page, a service group) loads
// with the app again. They come after the import map, which the browser must
// read before it fetches any module.
import { readFileSync } from 'node:fs';
import { assert } from './support/Assert.js';
import { firstLoadModules, modulePreloadDifferences, preloadedModules } from '../scripts/modulepreload.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

{
    const differences = modulePreloadDifferences(html);
    assert(differences.length === 0,
        `index.html's module preload hints match the first load (run node scripts/modulepreload.mjs):\n  ${differences.slice(0, 20).join('\n  ')}`);
    console.log(`✓ index.html preloads the ${preloadedModules(html).length} modules of the first load`);
}

// The list is the real first load, not an empty or partial one.
{
    const modules = firstLoadModules();
    for (const file of ['ui/boot.js', 'ui/main.js', 'storage/openBrowserStorage.js', 'ui/App.js', 'vendor/vue/dist/vue.esm-browser.prod.js']) {
        assert(modules.includes(file), `${file} is preloaded`);
    }
    assert(modules[0] === 'ui/boot.js', 'the page\'s entry point is asked for first');
    const later = modules.filter((file) => (file.startsWith('ui/views/') && file !== 'ui/views/HomeView.js')
        || file.startsWith('vendor/three/') || file === 'ui/main/composeAnchoring.js');
    assert(later.length === 0, `modules loaded when first needed are not preloaded:\n  ${later.join('\n  ')}`);
    console.log('✓ the hints start with ui/boot.js and leave out pages, Three.js and service groups');
}

// A change to the imports shows up as a difference.
{
    const stale = html.replace('    <link rel="modulepreload" href="ui/App.js">\n', '')
        .replace('<!-- modulepreload:end -->', '<link rel="modulepreload" href="ui/views/EditorView.js">\n    <!-- modulepreload:end -->');
    const differences = modulePreloadDifferences(stale);
    assert(differences.includes('missing: ui/App.js') && differences.includes('not in the first load: ui/views/EditorView.js'),
        `a missing and an extra hint are both reported (found ${JSON.stringify(differences)})`);
    console.log('✓ a missing or extra hint is reported');
}

// After the import map, inside <head>.
{
    const importMap = html.indexOf('<script type="importmap">');
    const firstHint = html.indexOf('<link rel="modulepreload"');
    const headEnd = html.indexOf('</head>');
    assert(importMap >= 0 && importMap < firstHint && firstHint < headEnd, 'the hints are in <head>, after the import map');
    console.log('✓ the hints come after the import map');
}

console.log('\n✅ All ModulePreload tests passed.');
