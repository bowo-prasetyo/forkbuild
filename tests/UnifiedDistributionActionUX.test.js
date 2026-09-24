import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { sanitizeDistributionErrorMessage } from '../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { worldEncounterCanvasFiles, editorViewFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';

// UX-level distribution unification.
//
// A Wanderer previously had to click "Distribute Publication" and
// "Distribute Snapshot" separately to push the same held content out
// through both decentralized substrates. This adds one convenience
// action, distributeSelectedPublicationAndSnapshot()/
// distributeOwnPublicationAndSnapshot(), that fires both of the
// already-existing, already-independent actions from a single click.
//
// This is a UX change ONLY. The Signed Claim and Snapshot families stay
// two separate protocols underneath — see application/
// SnapshotDistributionCommand.js's own header, "no coupling to Signed
// Claim distribution," and application/snapshot/placement/PublicationSnapshotPlacementValidator.js's
// own header on why a Snapshot-side identity is never conflated with
// Publication authorship. The combined action never merges their
// results, never introduces an aggregate status, and never changes what
// either command is called with — it only saves a click.
//
// SEQUENTIAL, NEVER CONCURRENT. Both legs can end up signing through the
// SAME injected browser extension (most plausibly a NIP-07 Nostr
// provider used for both protocols' own announcement step). A real
// nos2x installation was observed hanging indefinitely — no approval
// popup shown at all, on either leg — when both signing flows were
// fired at once, well past either leg's own documented worst-case
// signing timeout (120s). Running the two legs one after another,
// exactly as if a Wanderer had clicked each button by hand in sequence,
// avoids ever presenting a browser extension with two concurrent
// signing requests.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function canvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        distributionCommand: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        selectedDiscoveryProvider: 'nostr',
        selectedDistributionStorage: 'ar',
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        remotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
        distributeSelectedPublication: WorldEncounterCanvas.methods.distributeSelectedPublication,
        distributeSelectedSnapshot: WorldEncounterCanvas.methods.distributeSelectedSnapshot,
        distributeSelectedPublicationAndSnapshot: WorldEncounterCanvas.methods.distributeSelectedPublicationAndSnapshot,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        publicationDistributionCommand: null,
        publicationDistributionExecuting: false,
        publicationDistributionError: null,
        publicationDistributionResult: null,
        publicationDistributionRequestId: 0,
        distributionDiscoveryProvider: 'nostr',
        distributionStorage: 'ar',
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        remotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
        distributeOwnPublication: OwnPublicationPanel.methods.distributeOwnPublication,
        distributeOwnSnapshot: OwnPublicationPanel.methods.distributeOwnSnapshot,
        distributeOwnPublicationAndSnapshot: OwnPublicationPanel.methods.distributeOwnPublicationAndSnapshot,
        ...overrides
    };
}

// A promise that resolves on the next macrotask, deep enough to drain
// every microtask hop in a multi-step .then() chain — used only to prove
// a leg has NOT yet started, never to wait out a leg that has.
function tick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await readSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function extractRange(source, startMarker, endMarker, label) {
    const start = source.indexOf(startMarker);
    if (start === -1) throw new Error(`${label || startMarker}: start marker not found`);
    const end = source.indexOf(endMarker, start);
    if (end === -1) throw new Error(`${label || startMarker}: end marker not found after start`);
    return source.slice(start, end);
}

// EditorView.js imports 'vue' at module top level, so this repo's plain
// `node tests/*.test.js` runner cannot import it directly — the SAME
// constraint tests/EditorViewPostPublishDistributionAction.test.js's own
// buildHarness() already documents. This harness uses the identical
// technique (marker-to-marker extraction of the REAL, CURRENT 0.9.377/
// 0.9.450/0.9.502/0.9.671 post-publish distribution block, never hand-
// retyped, executed via `new Function(...)` against fake `ref`/`inject`
// implementations), but ALSO wires `snapshotDistributionCommand`/
// `publicationContentStore` — the two collaborators
// `EditorViewPostPublishDistributionAction.test.js`'s own harness leaves
// unwired (leaving canDistributeSnapshot permanently false there) —
// because this file's own Section F needs BOTH legs reachable to prove
// the SAME sequential contract Sections A/D already prove for
// WorldEncounterCanvas/OwnPublicationPanel.
function buildEditorViewHarness(editorViewSource, {
    multiRelayNostrPublicationDistributionCommand = null,
    publicationDistributionCommand = null,
    snapshotDistributionCommand = null,
    publicationContentStore = null,
    snapshotDistributionAvailableStorageTypes = null
} = {}) {
    const blockSource = extractRange(
        editorViewSource,
        "const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);",
        '\n    return {',
        '0.9.377/0.9.450/0.9.502/0.9.671 post-publish distribution block'
    );

    function ref(initial) { return { value: initial }; }
    const injected = {
        multiRelayNostrPublicationDistributionCommand,
        publicationDistributionCommand,
        snapshotDistributionCommand,
        publicationContentStore,
        snapshotDistributionAvailableStorageTypes
    };
    function inject(key, fallback) {
        return Object.prototype.hasOwnProperty.call(injected, key) && injected[key] !== null
            ? injected[key]
            : fallback;
    }

    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'inject', 'ref', 'sanitizeDistributionErrorMessage',
        `${blockSource}\nreturn {
            publishedPublication,
            distributionExecuting,
            distributionError,
            distributionResult,
            snapshotDistributionExecuting,
            snapshotDistributionError,
            snapshotDistributionResult,
            onDocumentPublished,
            distributePublishedDocument,
            distributePublishedSnapshot,
            distributePublishedDocumentAndSnapshot,
            selectedDistributionStorage,
            selectedDiscoveryProvider,
            remotePinningDraft,
            snapshotDistributionStorageTypes
        };`
    );
    return factory(inject, ref, sanitizeDistributionErrorMessage);
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — WorldEncounterCanvas: the combined click runs the two
    // legs SEQUENTIALLY (Publication, then Snapshot) — the Snapshot leg
    // never starts while the Publication leg is still in flight, and
    // both still reach their own independent, correct result.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-a', documentId: 'doc-a', contentReference: { hash: 'pub-unify-a-hash' } });
        const order = [];
        let resolvePublication;

        const ctx = canvasCtx({
            distributionCommand: (pub) => {
                order.push('publication-start');
                return new Promise((resolve) => { resolvePublication = () => { order.push('publication-end'); resolve({ publication: pub, material: null, discovery: null }); }; });
            },
            snapshotDistributionCommand: (pub) => {
                order.push('snapshot-start');
                return Promise.resolve({ contentReference: { hash: 'h', uri: 'u' }, announcement: null });
            }
        });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        const combined = ctx.distributeSelectedPublicationAndSnapshot();
        assert(ctx.distributionExecuting === true, '1. the Publication leg starts synchronously');

        await tick();
        assert(order.join(',') === 'publication-start', '2. the Snapshot leg has NOT started yet — it never fires while the Publication leg is still awaiting its own (here: unresolved) command');
        assert(ctx.snapshotDistributionExecuting === false, '3. snapshotDistributionExecuting confirms the Snapshot leg is genuinely idle, not merely un-observed');

        resolvePublication();
        await combined;

        assert(order.join(',') === 'publication-start,publication-end,snapshot-start',
            '4. the Snapshot leg starts only after the Publication leg has fully settled — never concurrently with it');
        assert(ctx.distributionExecuting === false && ctx.snapshotDistributionExecuting === false,
            '5. both legs return to idle once the full sequence completes');
        assert(ctx.snapshotDistributionResult.contentReference.hash === 'h',
            '6. the Snapshot leg still stores its own resolved result exactly as distributeSelectedSnapshot() alone already would');

        console.log('✓ Section A: WorldEncounterCanvas — the combined action runs Publication then Snapshot strictly in sequence, never concurrently');
    }

    // ---------------------------------------------------------------
    // Section B — WorldEncounterCanvas: sequencing never turns into
    // shared fate. A rejection on the first leg still lets the second
    // leg run (and succeed) right afterward.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-b', documentId: 'doc-b', contentReference: { hash: 'pub-unify-b-hash' } });
        let snapshotCalls = 0;
        const ctx = canvasCtx({
            distributionCommand: () => Promise.reject(new Error('material storage rejected the upload')),
            snapshotDistributionCommand: () => { snapshotCalls += 1; return Promise.resolve({ contentReference: { hash: 'ok-hash', uri: 'ok-uri' }, announcement: { id: 'evt-1' } }); }
        });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        await ctx.distributeSelectedPublicationAndSnapshot();

        assert(typeof ctx.distributionError === 'string' && ctx.distributionError.length > 0,
            '7. the failing Publication leg reports its own honest failure');
        assert(snapshotCalls === 1 && ctx.snapshotDistributionError === null && ctx.snapshotDistributionResult.contentReference.hash === 'ok-hash',
            '8. the Publication leg\'s rejection never skips, cancels, or taints the Snapshot leg that runs after it');

        console.log('✓ Section B: WorldEncounterCanvas — a failure on the first leg never blocks, skips, or hides the second leg\'s own independent outcome');
    }

    // ---------------------------------------------------------------
    // Section C — WorldEncounterCanvas: a second combined click while
    // the first is still mid-sequence never starts an overlapping call
    // for whichever leg is currently in flight.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-c', documentId: 'doc-c', contentReference: { hash: 'pub-unify-c-hash' } });
        let publicationCalls = 0;
        let resolvePublication;
        const ctx = canvasCtx({
            distributionCommand: () => { publicationCalls += 1; return new Promise((resolve) => { resolvePublication = resolve; }); },
            snapshotDistributionCommand: () => Promise.resolve({ contentReference: { hash: 'h2', uri: 'u2' }, announcement: null })
        });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        const first = ctx.distributeSelectedPublicationAndSnapshot();
        ctx.distributeSelectedPublicationAndSnapshot();
        await tick();
        assert(publicationCalls === 1, '9. a second combined click while the Publication leg is still in flight never starts a second, overlapping call');

        resolvePublication({ publication, material: null, discovery: null });
        await first;

        console.log('✓ Section C: WorldEncounterCanvas — the combined action never overlaps a leg that is already in flight, the identical restraint each individual action already holds');
    }

    // ---------------------------------------------------------------
    // Section D — OwnPublicationPanel: the identical sequential
    // contract, one surface over ("My Publication," never World
    // Encounters) — Snapshot first, then Publication, matching this
    // panel's own template order.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-d', documentId: 'doc-d', contentReference: { hash: 'pub-unify-d-hash' } });
        const order = [];

        const ctx = panelCtx({
            publication,
            snapshotDistributionCommand: () => { order.push('snapshot'); return Promise.resolve({ contentReference: { hash: 'h3', uri: 'u3' }, announcement: null }); },
            publicationDistributionCommand: () => { order.push('publication'); return Promise.resolve({ publication, material: { uri: 'mat-uri' }, discovery: { id: 'evt-2' } }); }
        });

        await ctx.distributeOwnPublicationAndSnapshot();

        assert(order.join(',') === 'snapshot,publication', '10. OwnPublicationPanel — the two legs run strictly in sequence, Snapshot then Publication, never concurrently');
        assert(ctx.publicationDistributionResult[0].material.uri === 'mat-uri' && ctx.snapshotDistributionResult.contentReference.hash === 'h3',
            '11. OwnPublicationPanel — each leg still stores its own independent result, unmodified by being triggered together (publicationDistributionResult is normalized to a one-element array — see OwnPublicationPanel.js\'s own normalizeDistributionResultForDisplay())');
        assert(ctx.publicationDistributionExecuting === false && ctx.snapshotDistributionExecuting === false,
            '12. OwnPublicationPanel — both legs return to idle once the full sequence completes');

        console.log('✓ Section D: OwnPublicationPanel — the identical one-click, sequential-legs contract holds for "My Publication" too');
    }

    // ---------------------------------------------------------------
    // Section F — EditorView: the identical sequential contract, one
    // more surface over ("Publication published successfully" post-
    // publish overlay) — Snapshot first, then Publication, matching this
    // view's own template order (the Snapshot section renders above the
    // Publication section, byte-for-byte the same visual order
    // OwnPublicationPanel.js's own Section D already holds).
    // ---------------------------------------------------------------
    {
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const publication = new Publication({ id: 'pub-unify-f', documentId: 'doc-f', contentReference: { hash: 'pub-unify-f-hash' } });
        const order = [];

        const harness = buildEditorViewHarness(editorViewSource, {
            snapshotDistributionCommand: () => { order.push('snapshot'); return Promise.resolve({ contentReference: { hash: 'h4', uri: 'u4' }, announcement: null }); },
            multiRelayNostrPublicationDistributionCommand: () => { order.push('publication'); return Promise.resolve([{ publication: { kind: 'PUBLICATION', objectId: publication.id }, material: { uri: 'mat-uri-2' }, discovery: { id: 'evt-3' } }]); },
            publicationContentStore: { get: () => 'snapshot-bytes' }
        });
        harness.onDocumentPublished(publication);

        await harness.distributePublishedDocumentAndSnapshot();

        assert(order.join(',') === 'snapshot,publication', '18. EditorView — the two legs run strictly in sequence, Snapshot then Publication, never concurrently');
        assert(harness.distributionResult.value[0].material.uri === 'mat-uri-2' && harness.snapshotDistributionResult.value.contentReference.hash === 'h4',
            '19. EditorView — each leg still stores its own independent result, unmodified by being triggered together');
        assert(harness.distributionExecuting.value === false && harness.snapshotDistributionExecuting.value === false,
            '20. EditorView — both legs return to idle once the full sequence completes');

        console.log('✓ Section F: EditorView — the identical one-click, sequential-legs contract holds for the post-publish "Distribute now"/"Distribute Snapshot" pair too');
    }

    // ---------------------------------------------------------------
    // Section G — EditorView: a rejection on the first leg never blocks,
    // skips, or hides the second leg's own independent outcome — the
    // identical restraint Section B already proves for
    // WorldEncounterCanvas.
    // ---------------------------------------------------------------
    {
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const publication = new Publication({ id: 'pub-unify-g', documentId: 'doc-g', contentReference: { hash: 'pub-unify-g-hash' } });
        let publicationCalls = 0;

        const harness = buildEditorViewHarness(editorViewSource, {
            snapshotDistributionCommand: () => Promise.reject(new Error('material storage rejected the upload')),
            multiRelayNostrPublicationDistributionCommand: () => { publicationCalls += 1; return Promise.resolve([{ publication: { kind: 'PUBLICATION', objectId: publication.id }, material: null, discovery: { id: 'evt-4' } }]); },
            publicationContentStore: { get: () => 'snapshot-bytes' }
        });
        harness.onDocumentPublished(publication);

        await harness.distributePublishedDocumentAndSnapshot();

        assert(typeof harness.snapshotDistributionError.value === 'string' && harness.snapshotDistributionError.value.length > 0,
            '21. EditorView — the failing Snapshot leg reports its own honest failure');
        assert(publicationCalls === 1 && harness.distributionError.value === null && harness.distributionResult.value[0].discovery.id === 'evt-4',
            '22. EditorView — the Snapshot leg\'s rejection never skips, cancels, or taints the Publication leg that runs after it');

        console.log('✓ Section G: EditorView — a failure on the first leg never blocks, skips, or hides the second leg\'s own independent outcome');
    }

    // ---------------------------------------------------------------
    // Section H — One Shared Distribution Settings Block. Every surface
    // now holds ONE Storage choice, ONE Announcement/Discovery choice, and
    // ONE Remote Pinning draft; both legs of the combined action (and each
    // leg on its own) read that same choice, never a second, separately-
    // seeded copy.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-h', documentId: 'doc-h', contentReference: { hash: 'pub-unify-h-hash' } });
        const draft = { endpoint: 'https://pin.example/upload', credential: 'tok', requestField: '', responseField: '' };
        const calls = {};

        const canvas = canvasCtx({
            selectedDiscoveryProvider: 'arweave',
            selectedDistributionStorage: 'remote-pinning',
            remotePinningDraft: draft,
            distributionCommand: (pub, discoveryProvider, storage, pinning) => { calls.canvasPublication = { discoveryProvider, storage, pinning }; return Promise.resolve(null); },
            snapshotDistributionCommand: (pub, storage, pinning, discoveryProvider) => { calls.canvasSnapshot = { discoveryProvider, storage, pinning }; return Promise.resolve({ contentReference: { hash: 'h', uri: 'u' }, announcement: null }); }
        });
        canvas.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        canvas.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };
        await canvas.distributeSelectedPublicationAndSnapshot();

        assert(calls.canvasPublication.discoveryProvider === 'arweave' && calls.canvasSnapshot.discoveryProvider === 'arweave',
            '25. WorldEncounterCanvas — both legs forward the SAME shared Announcement/Discovery choice');
        assert(calls.canvasPublication.storage === 'remote-pinning' && calls.canvasSnapshot.storage === 'remote-pinning',
            '26. WorldEncounterCanvas — both legs forward the SAME shared Storage choice');
        assert(calls.canvasPublication.pinning.endpoint === draft.endpoint && calls.canvasSnapshot.pinning.endpoint === draft.endpoint,
            '27. WorldEncounterCanvas — both legs read the SAME Remote Pinning draft, entered once');

        const panel = panelCtx({
            publication,
            distributionDiscoveryProvider: 'arweave',
            distributionStorage: 'ipfs',
            publicationDistributionCommand: (pub, discoveryProvider, storage) => { calls.panelPublication = { discoveryProvider, storage }; return Promise.resolve(null); },
            snapshotDistributionCommand: (pub, storage, pinning, discoveryProvider) => { calls.panelSnapshot = { discoveryProvider, storage }; return Promise.resolve({ contentReference: { hash: 'h', uri: 'u' }, announcement: null }); }
        });
        await panel.distributeOwnPublicationAndSnapshot();

        assert(calls.panelPublication.discoveryProvider === 'arweave' && calls.panelSnapshot.discoveryProvider === 'arweave'
            && calls.panelPublication.storage === 'ipfs' && calls.panelSnapshot.storage === 'ipfs',
            '28. OwnPublicationPanel — both legs forward the SAME shared Storage and Announcement/Discovery choice');

        // The shared Storage default: Snapshot-capable surfaces pick from
        // the Snapshot registry's own list (plus Remote Pinning), so a
        // default the Snapshot leg could not honor is never pre-selected;
        // Publication-only surfaces keep all three Material storages.
        const storageGetter = OwnPublicationPanel.computed.distributionStorage.get;
        const panelDefault = (overrides) => storageGetter.call({ distributionStorageChoice: null, snapshotDistributionStorageTypes: ['ar'], defaultContentDistributionProvider: null, snapshotDistributionCommand: () => {}, ...overrides });
        assert(panelDefault({ defaultContentDistributionProvider: 'ipfs' }) === 'ar',
            '29. a saved IPFS preference is not pre-selected while the Snapshot registry lacks IPFS — falls back to the registry\'s first storage');
        assert(panelDefault({ defaultContentDistributionProvider: 'ipfs', snapshotDistributionCommand: null }) === 'ipfs',
            '30. Publication-only, a saved IPFS preference IS honored — all three Material storages stay eligible');
        assert(panelDefault({ defaultContentDistributionProvider: 'remote-pinning' }) === 'remote-pinning' && panelDefault({ distributionStorageChoice: 'ar', defaultContentDistributionProvider: 'remote-pinning' }) === 'ar',
            '31. Remote Pinning stays an eligible saved default, and an explicit pick always wins');

        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const harness = buildEditorViewHarness(editorViewSource, {
            snapshotDistributionCommand: (bytes, storage, placement, creation, discoveryProvider) => { calls.editorSnapshot = { discoveryProvider, storage }; return Promise.resolve({ contentReference: { hash: 'h5', uri: 'u5' }, announcement: null }); },
            publicationDistributionCommand: (args) => { calls.editorPublication = { discoveryProvider: args.discoveryProvider, storage: args.materialStorage }; return Promise.resolve(null); },
            publicationContentStore: { get: () => 'snapshot-bytes' },
            snapshotDistributionAvailableStorageTypes: () => ['ar', 'ipfs']
        });
        assert(harness.selectedDistributionStorage.value === 'ar' && harness.snapshotDistributionStorageTypes.join(',') === 'ar,ipfs',
            '32. EditorView — one shared Storage choice, defaulting to the Snapshot registry\'s first storage, fed by the SAME injected registry list WorldView reads');
        harness.selectedDistributionStorage.value = 'ipfs';
        harness.selectedDiscoveryProvider.value = 'arweave';
        harness.onDocumentPublished(publication);
        await harness.distributePublishedDocumentAndSnapshot();

        assert(calls.editorSnapshot.storage === 'ipfs' && calls.editorPublication.storage === 'ipfs'
            && calls.editorSnapshot.discoveryProvider === 'arweave' && calls.editorPublication.discoveryProvider === 'arweave',
            '33. EditorView — both legs forward the SAME shared Storage and Announcement/Discovery choice');

        console.log('✓ Section H: one shared Storage / Announcement / Remote Pinning setting feeds both legs, on all three surfaces');
    }

    // ---------------------------------------------------------------
    // Section E — no new coupling, no aggregate status, no generic
    // fan-out API. The combined action is additive convenience only.
    // ---------------------------------------------------------------
    {
        const canvasCode = (await Promise.all(worldEncounterCanvasFiles().map((file) => codeOnlySource(file)))).join('\n');
        const panelCode = (await Promise.all(ownPublicationPanelFiles().map((file) => codeOnlySource(file)))).join('\n');
        const editorCode = (await Promise.all(editorViewFiles().map((file) => codeOnlySource(file)))).join('\n');

        assert((canvasCode.match(/this\.distributionCommand\(/g) || []).length === 1,
            '13. WorldEncounterCanvas.js still calls distributionCommand from exactly one place');
        assert((canvasCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '14. WorldEncounterCanvas.js still calls snapshotDistributionCommand from exactly one place');
        assert((panelCode.match(/this\.publicationDistributionCommand\(/g) || []).length === 1,
            '15. OwnPublicationPanel.js still calls publicationDistributionCommand from exactly one place');
        assert((panelCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '16. OwnPublicationPanel.js still calls snapshotDistributionCommand from exactly one place');
        assert((editorCode.match(/\(\) => distributeEditorPublication\(/g) || []).length === 1,
            '23. EditorView.js still calls distributeEditorPublication from exactly one place');
        assert((editorCode.match(/\(\) => distributeEditorSnapshot\(/g) || []).length === 1,
            '24. EditorView.js still calls distributeEditorSnapshot from exactly one place');

        const forbidden = [/distributePublication\(publication,\s*targets\)/, /MULTI_SUCCESS|AGGREGATE_(SUCCESS|STATUS)/, /combinedDistributionResult/, /combinedDistributionError/, /Promise\.all(?:Settled)?\(/];
        for (const pattern of forbidden) {
            assert(!pattern.test(canvasCode), `17[${pattern}]. WorldEncounterCanvas.js carries no aggregate/fan-out/concurrent-launch vocabulary`);
            assert(!pattern.test(panelCode), `17[${pattern}]. OwnPublicationPanel.js carries no aggregate/fan-out/concurrent-launch vocabulary`);
            assert(!pattern.test(editorCode), `17[${pattern}]. EditorView.js carries no aggregate/fan-out/concurrent-launch vocabulary`);
        }

        console.log('✓ Section E: the combined action adds no aggregate status, no generic fan-out API, and no concurrent-launch (Promise.all) of the two legs, on any of the three surfaces');
    }

    console.log(`\n✅ All Unified Distribution Action UX tests passed (${assertionCount} assertions).`);
}

runTests().catch((error) => {
    console.error('UnifiedDistributionActionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
