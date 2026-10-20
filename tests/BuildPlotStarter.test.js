import { useBuildPlot } from '../ui/views/editorView/useBuildPlot.js';
import { plotQuery } from '../core/world/BuildPlot.js';
import { mountComponent, ref } from './support/MinimalVueCompositionApiShim.js';
import { assert } from './support/Assert.js';

// A resident's Build there (core/world/ResidentWish.js) opens the Editor on a plot
// link that also names a ready-made structure: the new build for that spot
// starts as a copy of it. Build here's own link, naming none, still starts
// empty.

function editor() {
    const saved = [];
    const store = {
        save: (plot) => { saved.push(plot); },
        forBuild: (id) => saved.find((plot) => plot.buildDocumentId === id) || null,
        remove: () => {}
    };
    const documentManager = { document: null };
    const calls = [];
    const editorSession = {
        newDocument: () => { calls.push('new'); documentManager.document = { world: { id: 'empty-build' } }; },
        forkStructure: (structure) => { calls.push(`fork:${structure.id}`); documentManager.document = { world: { id: 'copy-build' } }; return true; },
        frameDocument: () => { calls.push('frame'); }
    };
    const shown = [];
    const plot = mountComponent({
        setup: () => useBuildPlot({ documentManager, documentVersion: ref(0), router: null, feedback: { show: (text) => shown.push(text) } })
    }, { buildPlotStore: store });
    return { plot, saved, calls, editorSession };
}

const query = plotQuery({ worldDocumentId: 'home-world', worldTitle: 'Home Village', position: { x: 12, y: 0, z: -4 } });

{
    const { plot, saved, calls, editorSession } = editor();
    assert(plot.startBuildPlot(query, editorSession, { structure: { id: 'village:bridge' } }) === true, 'a plot link with a structure starts a build');
    assert(calls.join() === 'fork:village:bridge,frame', `...as a copy of that structure, framed (got ${calls.join()})`);
    assert(saved.length === 1 && saved[0].buildDocumentId === 'copy-build' && saved[0].worldDocumentId === 'home-world'
        && saved[0].position.x === 12 && saved[0].position.z === -4, '...remembered for that spot, so publishing stands it there');
    console.log('✓ Build there starts the new build from the ready-made structure, on the plot');
}

{
    const { plot, saved, calls, editorSession } = editor();
    assert(plot.startBuildPlot(query, editorSession) === true && calls.join() === 'new', 'Build here\'s own link still starts empty');
    assert(saved[0].buildDocumentId === 'empty-build', '...on the plot');
    const failing = editor();
    failing.editorSession.forkStructure = () => false;
    failing.plot.startBuildPlot(query, failing.editorSession, { structure: { id: 'village:bridge' } });
    assert(failing.calls.join() === 'new', 'a structure that can\'t be copied leaves an empty build on the plot');
    assert(plot.startBuildPlot({ plot: 'home-world' }, editorSession, { structure: { id: 'village:bridge' } }) === false, 'no spot, no build');
    console.log('✓ without a structure, or when it can\'t be copied, the plot starts empty');
}
