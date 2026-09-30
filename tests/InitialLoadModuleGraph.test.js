// What the browser downloads before the app first renders: every module
// ui/main.js reaches through static imports (index.html's import map
// resolves the bare ones). Pages other than Home and the thumbnail renderer
// are imported with import() when first needed (ui/router/index.js,
// application/editor/CreatePreviewUseCase.js); a static import of one of
// them puts its whole graph back into the first load, about half the app
// for the pages and Three.js for the renderer.
import { assert } from './support/Assert.js';
import { staticGraph, staticImportSpecifiers } from './support/StaticImportGraph.js';

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

// Services only some pages use are built in service groups that load with
// those pages (ui/main.js, ui/serviceGroups.js); a static import of one of
// their modules puts it back into the first load.
const serviceGroupModules = [
    'ui/main/composeAnchoring.js',
    'ui/main/composePublicationDistribution.js',
    'ui/main/composeSnapshotDiscovery.js',
    'application/publication/OpenPublicationLink.js',
    'application/ipfs/CreateIpfsRemotePublicationCoordinatorUseCase.js',
    'storage/LocalStoragePublicationObservationArchive.js',
    'audio/WebAudioSoundscapeProvider.js'
];
const eagerGroups = serviceGroupModules.filter((file) => initialLoad.has(file));
assert(eagerGroups.length === 0, `service-group modules load with the pages that use them, not with the app; statically reached:\n  ${eagerGroups.join('\n  ')}`);
console.log('✓ no service group\'s modules are in the first load');

console.log('\n✅ All InitialLoadModuleGraph tests passed.');
