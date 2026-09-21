import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';

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
// Claim distribution," and application/PublicationSnapshotPlacementValidator.js's
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
        selectedMaterialStorage: 'ar',
        publicationRemotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        snapshotDistributionStorage: 'ar',
        remotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
        selectedSnapshotDiscoveryProvider: 'nostr',
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
        publicationDiscoveryProvider: 'nostr',
        publicationMaterialStorage: 'ar',
        publicationRemotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        snapshotDistributionStorage: 'ar',
        snapshotDiscoveryProvider: 'nostr',
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

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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
    // Section E — no new coupling, no aggregate status, no generic
    // fan-out API. The combined action is additive convenience only.
    // ---------------------------------------------------------------
    {
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');

        assert((canvasCode.match(/this\.distributionCommand\(/g) || []).length === 1,
            '13. WorldEncounterCanvas.js still calls distributionCommand from exactly one place');
        assert((canvasCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '14. WorldEncounterCanvas.js still calls snapshotDistributionCommand from exactly one place');
        assert((panelCode.match(/this\.publicationDistributionCommand\(/g) || []).length === 1,
            '15. OwnPublicationPanel.js still calls publicationDistributionCommand from exactly one place');
        assert((panelCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '16. OwnPublicationPanel.js still calls snapshotDistributionCommand from exactly one place');

        const forbidden = [/distributePublication\(publication,\s*targets\)/, /MULTI_SUCCESS|AGGREGATE_(SUCCESS|STATUS)/, /combinedDistributionResult/, /combinedDistributionError/, /Promise\.all(?:Settled)?\(/];
        for (const pattern of forbidden) {
            assert(!pattern.test(canvasCode), `17[${pattern}]. WorldEncounterCanvas.js carries no aggregate/fan-out/concurrent-launch vocabulary`);
            assert(!pattern.test(panelCode), `17[${pattern}]. OwnPublicationPanel.js carries no aggregate/fan-out/concurrent-launch vocabulary`);
        }

        console.log('✓ Section E: the combined action adds no aggregate status, no generic fan-out API, and no concurrent-launch (Promise.all) of the two legs');
    }

    console.log(`\n✅ All Unified Distribution Action UX tests passed (${assertionCount} assertions).`);
}

runTests().catch((error) => {
    console.error('UnifiedDistributionActionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
