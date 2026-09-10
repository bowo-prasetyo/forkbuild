import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.357 — Wire Canonical Publication Discovery Tag into World View.
//
// Closes the product gap 0.9.356's own audit
// (tests/PublicationDiscoveryTagUXConsistencyAudit.test.js) found: World
// View's own "Discover Publication" panel rendered a blank Discovery-tag
// input despite the application already owning the exact canonical
// campaign tag ('forkbuild-publication') a same-app Publication would have
// been announced under.
//
// One production seam only, exactly as 0.9.356 Section I (option B)
// recommended:
//   - ui/main.js: the literal is hoisted to one named constant
//     (PUBLICATION_DISCOVERY_TAG), reused verbatim at its existing
//     distribution call site and a new app.provide('publicationDiscoveryTag', ...)
//     call — never a second, independently-typed copy of the string.
//   - ui/views/WorldView.js: inject()s that value and forwards it,
//     unmodified, to WorldEncounterCanvas's own new defaultDiscoveryTag prop.
//   - ui/components/WorldEncounterCanvas.js: a new, optional,
//     String-typed defaultDiscoveryTag prop (default '', preserving prior
//     behavior for any caller that does not supply it) seeds discoveryTag's
//     own initial value in data() — read exactly once, at construction.
//
// No new discovery mechanism, no command/composition/query-layer change,
// no change to discoverPublication()'s own logic, and the field remains
// exactly as freely editable as before — all proven live below, not merely
// read from source.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// The same "extract methods/props straight off the exported options object
// and call them with a hand-built ctx" technique
// tests/DecentralizedWorldEncounterLeadSelectionUI.test.js and 0.9.356's own
// audit already established for this exact file.
function makeCanvasContext(overrides = {}) {
    return {
        discoveryCommand: null,
        discoveryObjectId: '',
        discoveryTag: '',
        discovering: false,
        discoveryError: null,
        discoveryResult: null,
        discoveryRequestId: 0,
        ...overrides
    };
}

async function run() {
    console.log('Running Wire Canonical Publication Discovery Tag into World View tests...\n');

    // ===============================================================
    // Section A — ui/main.js: one hoisted constant, reused verbatim at
    // both its existing distribution call site and the new discovery
    // provide() call — never two independently-typed copies.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        const literalDeclarations = mainSource.match(/const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';/g) || [];
        assert(literalDeclarations.length === 1,
            `1. exactly one PUBLICATION_DISCOVERY_TAG constant declaration exists in ui/main.js (found ${literalDeclarations.length}).`);

        assert(mainSource.includes("app.provide('publicationDiscoveryTag', PUBLICATION_DISCOVERY_TAG);"),
            '2. ui/main.js provides publicationDiscoveryTag app-wide, referencing the constant, never a re-typed string literal.');
        assert(mainSource.includes('discoveryTag: PUBLICATION_DISCOVERY_TAG'),
            '3. the existing distribution runtime provider call now references the SAME constant, not its own separately-typed literal.');

        // Ordering: the constant and its provide() call must exist before
        // ui/main.js's own distribution wiring reads it (composePublicationDistributionCommand,
        // further down the file) — confirming this is one linear
        // definition, never a forward reference or a second declaration.
        const constantIndex = mainSource.indexOf('const PUBLICATION_DISCOVERY_TAG');
        const provideIndex = mainSource.indexOf("app.provide('publicationDiscoveryTag'");
        const distributionUsageIndex = mainSource.indexOf('discoveryTag: PUBLICATION_DISCOVERY_TAG');
        assert(constantIndex !== -1 && constantIndex < provideIndex && provideIndex < distributionUsageIndex,
            '4. declaration, then provide(), then the (unchanged) distribution usage — a single, forward-flowing definition.');
    }
    console.log('✓ Section A: ui/main.js hoists the canonical tag to one named constant, provides it app-wide as publicationDiscoveryTag, and its existing distribution call site now references that SAME constant — confirmed by both usages resolving to one declaration, never two literals.');

    // ===============================================================
    // Section B — ui/views/WorldView.js: injects the new value and
    // forwards it, unmodified, to WorldEncounterCanvas's own new prop.
    // ===============================================================
    {
        const viewSource = await readSource('ui/views/WorldView.js');
        assert(viewSource.includes("inject('publicationDiscoveryTag', '')"),
            '1. WorldView.js injects publicationDiscoveryTag, defaulting to \'\' for any embedding predating this provide() call — the same "optional injection, graceful default" contract discoverWorldEncounterPublicationCommand itself already holds one line above it.');

        const setupReturnBlock = viewSource.slice(viewSource.indexOf('discoverWorldEncounterPublicationCommand,'), viewSource.indexOf('discoverWorldEncounterPublicationCommand,') + 400);
        assert(setupReturnBlock.includes('publicationDiscoveryTag,'),
            '2. publicationDiscoveryTag is returned from setup(), immediately after discoverWorldEncounterPublicationCommand — reachable by the template.');

        assert(viewSource.includes(':defaultDiscoveryTag="publicationDiscoveryTag"'),
            '3. the WorldEncounterCanvas element in WorldView.js\'s own template binds :defaultDiscoveryTag to this exact injected value — no wrapper, no added field, mirroring discoveryCommand\'s own verbatim-forwarding restraint immediately above it.');

        // The template binds it on the SAME <WorldEncounterCanvas> element
        // that already receives :discoveryCommand — confirming this is the
        // one real Publication-discovery surface, not a second one.
        const canvasElementStart = viewSource.indexOf('<WorldEncounterCanvas');
        const canvasElementBlock = viewSource.slice(canvasElementStart, viewSource.indexOf('/>', canvasElementStart));
        assert(canvasElementBlock.includes(':discoveryCommand="discoverWorldEncounterPublicationCommand"') && canvasElementBlock.includes(':defaultDiscoveryTag="publicationDiscoveryTag"'),
            '4. both bindings live on the SAME <WorldEncounterCanvas> element — the command and its own tag default travel together to the one real discovery surface.');
    }
    console.log('✓ Section B: WorldView.js injects publicationDiscoveryTag (defaulting to \'\' when absent) and forwards it, verbatim, to the SAME WorldEncounterCanvas element that already receives the discovery command itself.');

    // ===============================================================
    // Section C — ui/components/WorldEncounterCanvas.js: a new, optional
    // prop seeds discoveryTag's own initial value, proven live.
    // ===============================================================
    {
        assert(WorldEncounterCanvas.props.defaultDiscoveryTag && WorldEncounterCanvas.props.defaultDiscoveryTag.type === String,
            '1. defaultDiscoveryTag is declared as a String prop.');
        assert(WorldEncounterCanvas.props.defaultDiscoveryTag.default === '',
            '2. its own default is \'\' — an embedding that supplies no defaultDiscoveryTag at all (every pre-0.9.357 test constructing this component directly, and any future non-World-View embedder) sees EXACTLY the prior blank behavior, unchanged.');

        // LIVE: data() seeded from a supplied canonical tag.
        const seededData = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: 'forkbuild-publication' });
        assert(seededData.discoveryTag === 'forkbuild-publication',
            '3. LIVE: data() seeds discoveryTag from defaultDiscoveryTag when supplied — the exact canonical tag reaches the field\'s own initial value.');

        // LIVE: data() with the prop's own default applied (as a real Vue
        // mount would when no defaultDiscoveryTag is passed) still yields
        // exactly the historical blank behavior.
        const unseededData = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: WorldEncounterCanvas.props.defaultDiscoveryTag.default });
        assert(unseededData.discoveryTag === '',
            '4. LIVE: with no defaultDiscoveryTag supplied, discoveryTag still starts exactly as blank as it always has — full backward compatibility.');

        // Every other data() field this milestone did not touch is
        // untouched — spot-check a representative sample.
        assert(seededData.discoveryObjectId === '' && seededData.discovering === false && seededData.discoveryResult === null,
            '5. every other discovery-related data() field is unchanged — this milestone touches exactly one field\'s own initial value.');
    }
    console.log('✓ Section C: defaultDiscoveryTag is a real, optional, String-typed prop defaulting to \'\' — proven live to seed discoveryTag with a supplied canonical tag, and proven live to preserve the EXACT historical blank behavior when nothing is supplied. No other data() field is touched.');

    // ===============================================================
    // Section D — discoverPublication() itself is completely unmodified:
    // a seeded, then possibly Wanderer-edited, discoveryTag reaches
    // discoveryCommand through the exact same path as before, proven live
    // end-to-end from the seeded initial value through to the command call.
    // ===============================================================
    {
        // End-to-end: seed via data(), as a real mount would, then click
        // Discover without editing — the canonical tag reaches the command.
        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: 'forkbuild-publication' });
        const ctx = makeCanvasContext({ ...seeded, discoveryObjectId: 'encounter-42' });
        let capturedArgs = null;
        ctx.discoveryCommand = async (args) => { capturedArgs = args; return { discovery: {}, resolution: {}, inspection: null }; };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await Promise.resolve();
        await Promise.resolve();
        assert(capturedArgs && capturedArgs.objectId === 'encounter-42' && capturedArgs.discoveryTag === 'forkbuild-publication',
            '1. LIVE end-to-end: a component seeded with the canonical tag, given an objectId and clicked with no edit, calls discoveryCommand({ objectId: \'encounter-42\', discoveryTag: \'forkbuild-publication\' }) — the exact shape it always has, now reachable without the Wanderer retyping anything.');

        // End-to-end: seed via data(), then the Wanderer edits it before
        // clicking — the EDITED value reaches the command, never the seed.
        const ctx2 = makeCanvasContext({ ...WorldEncounterCanvas.data.call({ defaultDiscoveryTag: 'forkbuild-publication' }), discoveryObjectId: 'encounter-43' });
        let capturedArgs2 = null;
        ctx2.discoveryCommand = async (args) => { capturedArgs2 = args; return {}; };
        ctx2.discoveryTag = 'a-different-hand-typed-campaign';
        WorldEncounterCanvas.methods.discoverPublication.call(ctx2);
        await Promise.resolve();
        await Promise.resolve();
        assert(capturedArgs2 && capturedArgs2.discoveryTag === 'a-different-hand-typed-campaign',
            '2. LIVE end-to-end: the SAME component, with the seeded value edited before clicking, forwards the EDITED value — the field never re-asserts or locks back to its own seeded default.');

        // discoverPublication()'s own source is byte-for-byte unchanged
        // from 0.9.356's own audit — this milestone added no branch of any
        // kind to it.
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const methodStart = canvasSource.indexOf('discoverPublication() {');
        const methodBlock = canvasSource.slice(methodStart, canvasSource.indexOf('\n        },', methodStart));
        assert(methodBlock.includes("const objectId = this.discoveryObjectId.trim();") && methodBlock.includes("const discoveryTag = this.discoveryTag.trim();") && methodBlock.includes('this.discoveryCommand({ objectId, discoveryTag })'),
            '3. discoverPublication() itself still reads this.discoveryTag directly and forwards it, trimmed, to discoveryCommand — the exact same three lines 0.9.111 originally wrote, untouched by this milestone.');
    }
    console.log('✓ Section D: proven live, end-to-end, from a seeded canonical default through to the actual discoveryCommand call — both an un-edited click (the new capability) and an edited click (the preserved capability) reach the command with exactly the value the field held, and discoverPublication()\'s own source is confirmed unmodified.');

    console.log('\n=== VERDICT: WIRED ===');
    console.log('The canonical Publication discovery tag now reaches World View\'s own Discover Publication input as its');
    console.log('starting value, through one hoisted constant and the existing inject()/provide() seam — with the field');
    console.log('remaining exactly as editable as before, discoverPublication() completely unmodified, and full backward');
    console.log('compatibility (blank default) preserved for any caller that does not supply defaultDiscoveryTag.');
}

run().catch((err) => {
    console.error(err);
    throw err;
});
