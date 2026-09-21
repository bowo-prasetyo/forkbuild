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

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function flushMicrotasks() {
    return new Promise((resolve) => setTimeout(resolve, 0));
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

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — WorldEncounterCanvas: one click reaches both commands,
    // exactly once each, with the SAME selected Publication.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-a', documentId: 'doc-a', contentReference: { hash: 'pub-unify-a-hash' } });
        let publicationCalls = 0;
        let snapshotCalls = 0;
        let receivedByPublicationCommand = null;
        let receivedBySnapshotCommand = null;

        const ctx = canvasCtx({
            distributionCommand: (pub) => { publicationCalls += 1; receivedByPublicationCommand = pub; return Promise.resolve({ publication: pub, material: null, discovery: null }); },
            snapshotDistributionCommand: (pub) => { snapshotCalls += 1; receivedBySnapshotCommand = pub; return Promise.resolve({ contentReference: { hash: 'h', uri: 'u' }, announcement: null }); }
        });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        ctx.distributeSelectedPublicationAndSnapshot();
        assert(ctx.distributionExecuting === true, '1. the Publication leg enters executing state synchronously');
        assert(ctx.snapshotDistributionExecuting === true, '2. the Snapshot leg enters executing state synchronously');

        await flushMicrotasks();

        assert(publicationCalls === 1, '3. distributionCommand was called exactly once');
        assert(snapshotCalls === 1, '4. snapshotDistributionCommand was called exactly once');
        assert(receivedByPublicationCommand === publication && receivedBySnapshotCommand === publication,
            '5. both commands received the exact same selected Publication object');
        assert(ctx.distributionExecuting === false && ctx.snapshotDistributionExecuting === false,
            '6. both legs return to idle once their own command resolves');
        assert(ctx.snapshotDistributionResult.contentReference.hash === 'h',
            '7. the Snapshot leg still stores its own resolved result exactly as distributeSelectedSnapshot() alone already would');

        console.log('✓ Section A: WorldEncounterCanvas — one click reaches both already-independent commands, exactly once each, with the same Publication');
    }

    // ---------------------------------------------------------------
    // Section B — WorldEncounterCanvas: the two legs never share fate.
    // A rejection on one side never blocks, cancels, or hides the other.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-b', documentId: 'doc-b', contentReference: { hash: 'pub-unify-b-hash' } });
        const ctx = canvasCtx({
            distributionCommand: () => Promise.reject(new Error('material storage rejected the upload')),
            snapshotDistributionCommand: () => Promise.resolve({ contentReference: { hash: 'ok-hash', uri: 'ok-uri' }, announcement: { id: 'evt-1' } })
        });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        ctx.distributeSelectedPublicationAndSnapshot();
        await flushMicrotasks();

        assert(typeof ctx.distributionError === 'string' && ctx.distributionError.length > 0,
            '8. the failing Publication leg reports its own honest failure');
        assert(ctx.snapshotDistributionError === null && ctx.snapshotDistributionResult.contentReference.hash === 'ok-hash',
            '9. the succeeding Snapshot leg is completely unaffected by the other leg\'s rejection — no shared fate, no cross-cancellation');

        console.log('✓ Section B: WorldEncounterCanvas — a failure on one leg never blocks or hides the other\'s independent outcome');
    }

    // ---------------------------------------------------------------
    // Section C — WorldEncounterCanvas: while either leg is already
    // in flight, the combined click is a no-op for that leg — mirrors
    // each individual action's own existing re-entrancy guard exactly.
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

        ctx.distributeSelectedPublicationAndSnapshot();
        ctx.distributeSelectedPublicationAndSnapshot();
        await flushMicrotasks();
        assert(publicationCalls === 1, '10. a second combined click while the Publication leg is still in flight never starts a second, overlapping call');

        resolvePublication({ publication, material: null, discovery: null });
        await flushMicrotasks();

        console.log('✓ Section C: WorldEncounterCanvas — the combined action never overlaps a leg that is already in flight, the identical restraint each individual action already holds');
    }

    // ---------------------------------------------------------------
    // Section D — OwnPublicationPanel: the identical contract, one
    // surface over ("My Publication," never World Encounters).
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-unify-d', documentId: 'doc-d', contentReference: { hash: 'pub-unify-d-hash' } });
        let publicationCalls = 0;
        let snapshotCalls = 0;

        const ctx = panelCtx({
            publication,
            publicationDistributionCommand: () => { publicationCalls += 1; return Promise.resolve({ publication, material: { uri: 'mat-uri' }, discovery: { id: 'evt-2' } }); },
            snapshotDistributionCommand: () => { snapshotCalls += 1; return Promise.resolve({ contentReference: { hash: 'h3', uri: 'u3' }, announcement: null }); }
        });

        ctx.distributeOwnPublicationAndSnapshot();
        assert(ctx.publicationDistributionExecuting === true && ctx.snapshotDistributionExecuting === true,
            '11. OwnPublicationPanel — both legs enter executing state synchronously on one click');

        await flushMicrotasks();

        assert(publicationCalls === 1 && snapshotCalls === 1, '12. OwnPublicationPanel — both commands were called exactly once');
        assert(ctx.publicationDistributionResult.material.uri === 'mat-uri' && ctx.snapshotDistributionResult.contentReference.hash === 'h3',
            '13. OwnPublicationPanel — each leg still stores its own independent result, unmodified by being triggered together');

        console.log('✓ Section D: OwnPublicationPanel — the identical one-click, two-independent-legs contract holds for "My Publication" too');
    }

    // ---------------------------------------------------------------
    // Section E — no new coupling, no aggregate status, no generic
    // fan-out API. The combined action is additive convenience only.
    // ---------------------------------------------------------------
    {
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');

        assert((canvasCode.match(/this\.distributionCommand\(/g) || []).length === 1,
            '14. WorldEncounterCanvas.js still calls distributionCommand from exactly one place');
        assert((canvasCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '15. WorldEncounterCanvas.js still calls snapshotDistributionCommand from exactly one place');
        assert((panelCode.match(/this\.publicationDistributionCommand\(/g) || []).length === 1,
            '16. OwnPublicationPanel.js still calls publicationDistributionCommand from exactly one place');
        assert((panelCode.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '17. OwnPublicationPanel.js still calls snapshotDistributionCommand from exactly one place');

        const forbidden = [/distributePublication\(publication,\s*targets\)/, /MULTI_SUCCESS|AGGREGATE_(SUCCESS|STATUS)/, /combinedDistributionResult/, /combinedDistributionError/];
        for (const pattern of forbidden) {
            assert(!pattern.test(canvasCode), `18[${pattern}]. WorldEncounterCanvas.js carries no aggregate/fan-out vocabulary`);
            assert(!pattern.test(panelCode), `18[${pattern}]. OwnPublicationPanel.js carries no aggregate/fan-out vocabulary`);
        }

        console.log('✓ Section E: the combined action adds no aggregate status and no generic fan-out API — each protocol\'s own call site, and own result field, stays exactly as it already was');
    }

    console.log(`\n✅ All Unified Distribution Action UX tests passed (${assertionCount} assertions).`);
}

runTests().catch((error) => {
    console.error('UnifiedDistributionActionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
