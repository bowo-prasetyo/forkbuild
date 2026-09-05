import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { PublicationMaterialProvenanceOrigin } from '../application/PublicationMaterialProvenance.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.113 — World View Discovered Publication Selection.
//
// 0.9.111 let a Wanderer discover, resolve, load, and verify a decentralized
// Publication; 0.9.112 let them see where it came from. Neither let them
// actually pick it as "the Publication I want to work with next" —
// `discoveryResult` stayed a read-only snapshot of the most recent search.
// This milestone adds exactly that one interaction fact:
// `selectDiscoveredPublication()`, the only writer of a new
// `selectedDiscoveredPublication` field, storing `discoveryResult` itself,
// verbatim, once a Wanderer explicitly clicks "Select Publication" on a
// VERIFIED result.
//
//   Section A: discovery selection — discover → RESOLVED → VERIFIED →
//              select → selectedDiscoveredPublication set to the exact
//              discoveryResult reference
//   Section B: local independence — selecting a discovered Publication
//              never alters selectedEncounter/materialInspection
//   Section C: provenance preservation — the selected discovered
//              Publication continues to report DECENTRALIZED
//   Section D: rejected material — a REJECTED discoveryResult can never
//              become a selected Publication, even on a direct call
//   Section E: stale discovery response — a superseded, late-resolving
//              discoveryCommand call can never become the selection
//   Section F: no hidden persistence — a fresh component context always
//              starts with no selection, never restored from anywhere
//   Section G: architectural regression — WorldEncounterCanvas.js

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-select-1',
        documentId: 'doc-select-1',
        title: 'A Publication Selectable From Discovery',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-SELECT', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

function graphqlSearchFetch(idsByTag) {
    return async (url, options) => {
        const body = JSON.parse(options.body);
        const match = /values: \["([^"]+)"\]/.exec(body.query);
        const tag = match ? match[1] : null;
        const ids = idsByTag[tag] || [];
        return new Response(JSON.stringify({
            data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } }
        }), { status: 200 });
    };
}

function gatewayRetrievalFetch(materialByTxId) {
    return async (url) => {
        const txId = url.split('/').pop();
        const material = materialByTxId[txId];
        if (!material) {
            return new Response('', { status: 404 });
        }
        return new Response(JSON.stringify(material), { status: 200 });
    };
}

function realDiscoveryCommand({ idsByTag, materialByTxId, publications }) {
    const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
        arweaveFetchImpl: graphqlSearchFetch(idsByTag)
    });
    const { verifier } = composeWorldEncounterMaterialVerifier();
    const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: services,
        arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch(materialByTxId) },
        verifier
    });
    return composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider: { list: () => publications } });
}

function canvasCtx(overrides = {}) {
    return {
        selectedEncounter: null,
        materialInspection: null,
        discoveryCommand: null,
        discoveryObjectId: '',
        discoveryTag: '',
        discovering: false,
        discoveryError: null,
        discoveryResult: null,
        discoveryRequestId: 0,
        selectedDiscoveredPublication: null,
        discoverPublication: WorldEncounterCanvas.methods.discoverPublication,
        selectDiscoveredPublication: WorldEncounterCanvas.methods.selectDiscoveredPublication,
        ...overrides
    };
}

// The component's own computed properties are plain functions of `this` —
// called the same way WorldEncounterCanvasUI.test.js/WorldViewDecentralized...
// already call `materialProvenance` in isolation.
function withComputed(ctx) {
    Object.defineProperty(ctx, 'isDiscoveredPublicationSelectable', {
        get: WorldEncounterCanvas.computed.isDiscoveredPublicationSelectable
    });
    return ctx;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — discovery selection.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'select-alice');
        const publication = buildSignedPublication(alice);

        const ctx = withComputed(canvasCtx({
            discoveryCommand: realDiscoveryCommand({
                idsByTag: { 'forkbuild-select-tag': ['TX-SELECT'] },
                materialByTxId: { 'TX-SELECT': publication.toJSON() },
                publications: [publication]
            }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-select-tag'
        }));

        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '1. discovery resolves RESOLVED end to end');
        assert(ctx.discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '2. the resolved material verifies VERIFIED — a precondition for selection');
        assert(ctx.isDiscoveredPublicationSelectable === true,
            '3. a RESOLVED + VERIFIED discoveryResult is selectable');
        assert(ctx.selectedDiscoveredPublication === null,
            '4. discovering alone never selects anything — selection is a separate, explicit act');

        ctx.selectDiscoveredPublication();

        assert(ctx.selectedDiscoveredPublication !== null,
            '5. clicking "Select Publication" actually selects it');
        assert(ctx.selectedDiscoveredPublication === ctx.discoveryResult,
            '6. selectedDiscoveredPublication is the exact same discoveryResult reference, never a reshaped copy');

        console.log('✓ Section A: discover → RESOLVED → VERIFIED → select → selectedDiscoveredPublication holds the exact discoveryResult reference');
    }

    // ---------------------------------------------------------------
    // Section B — local independence.
    // ---------------------------------------------------------------
    {
        const localSelection = Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-local-untouched' });
        const localInspection = Object.freeze({
            loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: { id: 'pub-local-untouched' } },
            verification: { status: WorldEncounterMaterialVerificationStatus.VERIFIED }
        });

        const storage = new InMemoryStorageProvider();
        const bob = buildRealSigner(storage, 'select-bob');
        const publication = buildSignedPublication(bob, { id: 'pub-select-b', contentReference: { hash: 'h-b', uri: 'ar://TX-SELECT-B', storage: 'ar' } });

        const ctx = withComputed(canvasCtx({
            selectedEncounter: localSelection,
            materialInspection: localInspection,
            discoveryCommand: realDiscoveryCommand({
                idsByTag: { 'forkbuild-select-b': ['TX-SELECT-B'] },
                materialByTxId: { 'TX-SELECT-B': publication.toJSON() },
                publications: [publication]
            }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-select-b'
        }));

        ctx.discoverPublication();
        await flushMicrotasks();
        ctx.selectDiscoveredPublication();

        assert(ctx.selectedDiscoveredPublication !== null, '7. the discovered Publication was actually selected');
        assert(ctx.selectedEncounter === localSelection,
            '8. selecting a discovered Publication never alters selectedEncounter — the exact same reference, untouched');
        assert(ctx.materialInspection === localInspection,
            '9. selecting a discovered Publication never alters materialInspection — the exact same reference, untouched');

        console.log('✓ Section B: selecting a discovered Publication never alters selectedEncounter/materialInspection');
    }

    // ---------------------------------------------------------------
    // Section C — provenance preservation.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const carol = buildRealSigner(storage, 'select-carol');
        const publication = buildSignedPublication(carol, { id: 'pub-select-c', contentReference: { hash: 'h-c', uri: 'ar://TX-SELECT-C', storage: 'ar' } });

        const ctx = withComputed(canvasCtx({
            discoveryCommand: realDiscoveryCommand({
                idsByTag: { 'forkbuild-select-c': ['TX-SELECT-C'] },
                materialByTxId: { 'TX-SELECT-C': publication.toJSON() },
                publications: [publication]
            }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-select-c'
        }));

        ctx.discoverPublication();
        await flushMicrotasks();
        ctx.selectDiscoveredPublication();

        assert(ctx.selectedDiscoveredPublication.provenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED,
            '10. the selected discovered Publication continues to report DECENTRALIZED provenance');

        console.log('✓ Section C: the selected discovered Publication continues to report DECENTRALIZED');
    }

    // ---------------------------------------------------------------
    // Section D — rejected material can never become a selected Publication.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const dave = buildRealSigner(storage, 'select-dave');
        const publication = buildSignedPublication(dave, { id: 'pub-select-d', contentReference: { hash: 'h-d', uri: 'ar://TX-SELECT-D', storage: 'ar' } });
        const tamperedMaterial = { ...publication.toJSON(), title: 'Tampered After Signing' };

        const ctx = withComputed(canvasCtx({
            discoveryCommand: realDiscoveryCommand({
                idsByTag: { 'forkbuild-select-d': ['TX-SELECT-D'] },
                materialByTxId: { 'TX-SELECT-D': tamperedMaterial },
                publications: [publication]
            }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-select-d'
        }));

        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '11. resolution still succeeds — resolution and verification are separate questions');
        assert(ctx.discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '12. tampered material is actively REJECTED');
        assert(ctx.isDiscoveredPublicationSelectable === false,
            '13. a REJECTED discoveryResult is never reported selectable');

        ctx.selectDiscoveredPublication();

        assert(ctx.selectedDiscoveredPublication === null,
            '14. calling selectDiscoveredPublication() directly on a REJECTED result is a no-op — never selectable regardless of UI gating');

        console.log('✓ Section D: a REJECTED discovered result can never become a selected Publication');
    }

    // ---------------------------------------------------------------
    // Section E — a stale discovery response can never become the selection.
    //
    // Mirrors tests/WorldViewDecentralizedPublicationRetrievalIntegration.test.js's
    // own Section H exactly: `discoverPublication()` itself refuses to
    // start a second, overlapping call while one is in flight (the
    // `discovering` guard), so a "superseded by a newer request" race is
    // simulated the same way that suite already does — bumping
    // `discoveryRequestId` the same way a fresh call's own guard would.
    // ---------------------------------------------------------------
    {
        let resolveFirst;
        const staleResult = { discovery: {}, resolution: { status: 'RESOLVED' }, inspection: { loading: { status: 'AVAILABLE' }, verification: { status: 'VERIFIED' } }, provenance: { origin: 'DECENTRALIZED' } };
        const freshResult = { discovery: {}, resolution: { status: 'RESOLVED' }, inspection: { loading: { status: 'AVAILABLE' }, verification: { status: 'VERIFIED' } }, provenance: { origin: 'DECENTRALIZED' } };

        const ctx = withComputed(canvasCtx({
            discoveryCommand: () => new Promise((resolve) => { resolveFirst = resolve; }),
            discoveryObjectId: 'pub-select-e',
            discoveryTag: 'forkbuild-select-e'
        }));

        // A first, slow request is in flight.
        ctx.discoverPublication();
        assert(ctx.discovering === true, '15. the in-flight request is actually pending');
        await Promise.resolve();
        await Promise.resolve();

        // A newer request supersedes it — its own result is already
        // current — before the slow one ever resolves.
        ctx.discoveryRequestId += 1;
        ctx.discoveryResult = freshResult;

        // The stale first request finally resolves.
        resolveFirst(staleResult);
        await flushMicrotasks();

        assert(ctx.discoveryResult === freshResult,
            '16. the stale first response never overwrites the fresher discoveryResult, even after it resolves late');

        ctx.selectDiscoveredPublication();

        assert(ctx.selectedDiscoveredPublication === freshResult,
            '17. selecting after a stale/fresh race selects the fresh result, never the discarded stale one');
        assert(ctx.selectedDiscoveredPublication !== staleResult,
            '18. the stale result was never, at any point, capable of becoming the selection');

        console.log('✓ Section E: a stale, superseded discovery response can never become the selected Publication');
    }

    // ---------------------------------------------------------------
    // Section F — no hidden persistence.
    // ---------------------------------------------------------------
    {
        assert(WorldEncounterCanvas.data().selectedDiscoveredPublication === null,
            '19. a fresh component data() always starts with no selected discovered Publication — never restored from anywhere');

        // Simulating "reload": a brand-new context, even though a previous
        // one (Section A) already made a real selection, starts clean.
        const freshCtx = withComputed(canvasCtx());
        assert(freshCtx.selectedDiscoveredPublication === null,
            '20. a new mount never inherits a previous mount\'s own selection');

        console.log('✓ Section F: no hidden persistence — a fresh mount never restores a discovered-publication selection');
    }

    // ---------------------------------------------------------------
    // Section G — architectural regression: WorldEncounterCanvas.js.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        const applicationImportLines = codeOnly.split('\n').filter((line) => line.includes("from '../../application/"));
        assert(applicationImportLines.length === 10,
            '21. WorldEncounterCanvas.js still imports exactly ten application/ modules as of 0.9.177 — 0.9.113 introduced no new application-layer command, per its own "no application-layer command" restraint; the eighth is 0.9.144\'s own SnapshotPublicationAttribution.js, the ninth 0.9.176\'s own WorldEncounterPresentation.js, the tenth 0.9.177\'s own WorldSnapshotInspection.js');

        assert(codeOnly.includes('selectedDiscoveredPublication') && codeOnly.includes('selectDiscoveredPublication') && codeOnly.includes('isDiscoveredPublicationSelectable'),
            '22. the new field/method/computed are actually present');
        assert((codeOnly.match(/this\.selectedDiscoveredPublication\s*=/g) || []).length === 1,
            '23. selectedDiscoveredPublication is written from exactly one place');

        const selectMethodMatch = /selectDiscoveredPublication\(\)\s*\{([\s\S]*?)\n {8}\}/.exec(codeOnly);
        assert(selectMethodMatch, '24. selectDiscoveredPublication() method body is present and matched by this regression\'s own extraction');
        const selectMethodBody = selectMethodMatch[1];
        assert(!selectMethodBody.includes('distributionCommand('),
            '25. selectDiscoveredPublication() never calls distributionCommand — selection never triggers distribution');
        assert(!selectMethodBody.includes('discoveryCommand('),
            '26. selectDiscoveredPublication() never calls discoveryCommand — selecting never re-runs discovery');
        assert(!selectMethodBody.includes('inspectWorldEncounterMaterial('),
            '27. selectDiscoveredPublication() never calls inspectWorldEncounterMaterial() — no second inspection');
        assert(!selectMethodBody.includes('this.selectedEncounter') && !selectMethodBody.includes('this.materialInspection'),
            '28. selectDiscoveredPublication() never reads or writes selectedEncounter/materialInspection');

        const selectEncounterMethodMatch = /selectEncounter\(encounter\)\s*\{([\s\S]*?)\n {8}\},/.exec(codeOnly);
        assert(selectEncounterMethodMatch, '29. selectEncounter() method body is present and matched by this regression\'s own extraction');
        assert(!selectEncounterMethodMatch[1].includes('selectedDiscoveredPublication'),
            '30. selectEncounter() itself never resets or otherwise touches selectedDiscoveredPublication — the two selections stay fully independent');

        console.log('✓ Section G: WorldEncounterCanvas.js adds selection as plain page-local state, with no new application import and no cross-writes into selectedEncounter/materialInspection');
    }

    console.log('\n✅ All World View Discovered Publication Selection tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
