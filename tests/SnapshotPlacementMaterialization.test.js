import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';

import { MaterializeSnapshotFromPlacementUseCase } from '../application/MaterializeSnapshotFromPlacementUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotPlacementMaterializationCoordinator } from '../application/SnapshotPlacementMaterializationCoordinator.js';
import { SnapshotPlacementMaterializationOutcome } from '../application/SnapshotPlacementMaterializationOutcome.js';
import { SnapshotPlacementMaterializationUiState } from '../application/SnapshotPlacementMaterializationUiState.js';
import {
    describePlacementMaterializationAttempt, describePlacementMaterializationButtonLabel
} from '../application/SnapshotPlacementMaterializationView.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
//
//   Section A: MaterializeSnapshotFromPlacementUseCase/
//              SnapshotPlacementMaterializationCoordinator constructor
//              validation, and materialize() as an unchanged, deliberately
//              thin pass-through to the use case's own execute().
//   Section B: describePlacementMaterializationAttempt()/
//              describePlacementMaterializationButtonLabel() pure view
//              functions over idle/materializing and every
//              SnapshotPlacementMaterializationOutcome value, including
//              the exact permitted sentences and the words this milestone
//              must never use.
//   Section C — FLAGSHIP: Alice's real Publication Center (application/
//              LocalPublicationCatalog.js + core/DecentralizedPublication.js
//              — the SAME model ui/views/DecentralizedPublicationsView.js
//              actually renders) creates an IPFS placement for a real
//              publication. Bob already knows both the publication and the
//              placement but does not possess the bytes; he clicks
//              "Materialize Snapshot" and obtains them (STORED,
//              publicationKnown), and a completely separate, unmodified
//              "Check Local Snapshot" now reports AVAILABLE — the exact
//              bridge this milestone exists to build between placement
//              resolution (0.8.20) and local content availability (0.8.33).
//              Materializing again reports ALREADY_AVAILABLE with the
//              bytes unchanged. The placement's own JSON is byte-identical
//              before and after — materializing observes and stores; it
//              never mutates the placement.
//   Section D: an IPFS outage maps CONTENT_UNAVAILABLE onto UNAVAILABLE
//              and stores nothing; no registered store maps
//              STORE_UNAVAILABLE onto the SAME UNAVAILABLE; a store
//              answering with the wrong bytes maps CONTENT_HASH_MISMATCH
//              onto HASH_MISMATCH and stores nothing; a tampered placement
//              (fails its own signature) maps INVALID_SIGNATURE onto
//              INVALID_PLACEMENT and stores nothing. No two of these ever
//              collapse into one another.
//
// See docs/Principles.md, "Placement Resolution Observes Present
// Availability; Materialization Turns It Into Possession (0.8.35)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = null;
    try { await promise; } catch (e) { threw = e; }
    assert(threw !== null, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// The identical fake Kubo HTTP RPC API tests/SnapshotPlacementCreationUX
// .test.js's own makeFakeIpfsNode() already established, extended with
// `outage`/`recover` exactly as tests/SnapshotPlacementLifecycle.test.js's
// own version already does.
function makeFakeIpfsNode(network = new Map()) {
    let down = false;

    async function fetchImpl(url, options) {
        if (down) throw new Error('simulated network outage: ipfs api unreachable');
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) {
                return new Response('not found', { status: 500 });
            }
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('unknown route', { status: 404 });
    }

    return { network, fetchImpl, outage() { down = true; }, recover() { down = false; } };
}

// Mirrors the real ui/main.js composition root exactly (and tests/
// SnapshotPlacementCreationUX.test.js's own makePublicationCenter()): a
// LocalPublicationCatalog, a real content/LocalContentStore.js for local
// bytes, the two 0.8.25 bridge adapters, and application/
// CreateSnapshotPlacementOrchestratorUseCase.js/application/
// CreateSnapshotPlacementResolutionCoordinatorUseCase.js wired together —
// never the older discovery/LocalDiscoveryProvider.js/`Publisher` world
// tests/SnapshotPlacementLifecycle.test.js exercises for a DIFFERENT
// (non-DecentralizedPublication) publishing pipeline.
function makePublicationCenter({ stores = [], identityProvider = makeIdentity('Alice') } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());

    const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);

    const { createExternalSnapshotPlacementUseCase } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider, contentResolver, placementCatalog, identityProvider, stores
    });
    const { coordinator: resolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog, stores
    });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, resolutionCoordinator, createExternalSnapshotPlacementUseCase
    };
}

async function publishLocally(publicationResolver, publicationCatalog, identityProvider, content) {
    const publication = await publicationResolver.publish({ content, contentKind: 'forkbuild.structure', identityProvider });
    publicationCatalog.add(publication);
    return publication;
}

// Builds a fresh "replica" that knows a placement (received it some other
// way — a peer, a package, a QR code) and, separately, knows the
// publication itself — but has never touched its OWN local content store
// for either. The exact starting condition this milestone's own
// "Materialize Snapshot" exists to close.
function makeReplica({ placement, node, knowsPublication = null }) {
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    new AddPublicationSnapshotPlacementUseCase(placementCatalog).execute(placement.toJSON());
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    if (knowsPublication) {
        publicationCatalog.add(knowsPublication);
    }
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());
    const ipfsStore = new IpfsContentStore({ apiUrl: 'http://bob-node.test:5001', fetchImpl: node.fetchImpl });
    const { coordinator: resolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog, stores: [ipfsStore]
    });
    const materializeUseCase = new MaterializeSnapshotFromPlacementUseCase(resolutionCoordinator, new StoreSnapshotContentUseCase(contentStore), publicationCatalog);
    const materializationCoordinator = new SnapshotPlacementMaterializationCoordinator(materializeUseCase);
    return { placementCatalog, publicationCatalog, contentStore, ipfsStore, resolutionCoordinator, materializeUseCase, materializationCoordinator };
}

// Mirrors ui/views/DecentralizedPublicationsView.js#materializePlacement()
// exactly — the coordinator itself never catches a thrown error (see its
// own header), so the caller wraps it, exactly as the offline-package
// path's own clickImportSnapshot() already does one axis over.
async function clickMaterialize(coordinator, placement) {
    try {
        const result = await coordinator.materialize(placement);
        return {
            materializing: false, error: null,
            outcome: result.outcome, reason: result.reason, contentReference: result.contentReference,
            placementId: result.placementId, publicationId: result.publicationId, publicationKnown: result.publicationKnown
        };
    } catch (error) {
        return { materializing: false, outcome: null, error: error.message };
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — constructor validation and thin pass-through behavior
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new MaterializeSnapshotFromPlacementUseCase(null, {}, {}); } catch (e) { threw = true; }
        assert(threw, '1. use case constructor requires a resolution coordinator');
        threw = false;
        try { new MaterializeSnapshotFromPlacementUseCase({ resolve: () => {} }, null, {}); } catch (e) { threw = true; }
        assert(threw, '2. use case constructor requires a StoreSnapshotContentUseCase');
        threw = false;
        try { new MaterializeSnapshotFromPlacementUseCase({ resolve: () => {} }, { execute: () => {} }, null); } catch (e) { threw = true; }
        assert(threw, '3. use case constructor requires a publication catalog');

        threw = false;
        try { new SnapshotPlacementMaterializationCoordinator(null); } catch (e) { threw = true; }
        assert(threw, '4. coordinator constructor requires a MaterializeSnapshotFromPlacementUseCase');
        threw = false;
        try { new SnapshotPlacementMaterializationCoordinator({}); } catch (e) { threw = true; }
        assert(threw, '5. coordinator constructor requires an object shaped like the use case (an execute() method)');

        assert(typeof new SnapshotPlacementMaterializationCoordinator({ execute: () => {} }).materialize === 'function',
            '6. materialize() is the coordinator\'s one public action');

        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { section: 'A' });
        const creationResult = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        const placement = creationResult.placement;

        // execute()/materialize() reject a non-placement argument as a
        // caller contract violation — never silently treated as "nothing
        // to do".
        const bob = makeReplica({ placement, node: net, knowsPublication: publication });
        await expectRejects(bob.materializationCoordinator.materialize(null), '7. materialize(null) throws straight through, uncaught');
        await expectRejects(bob.materializationCoordinator.materialize({ notAPlacement: true }), '8. materialize() with a non-placement object throws straight through, uncaught');

        // materialize() forwards to the underlying use case's own
        // execute(), returning its result completely unchanged.
        const directResult = await bob.materializeUseCase.execute(placement);
        const carol = makeReplica({ placement, node: net, knowsPublication: publication });
        const coordinatorResult = await carol.materializationCoordinator.materialize(placement);
        assert(coordinatorResult.outcome === directResult.outcome
            && coordinatorResult.placementId === directResult.placementId
            && coordinatorResult.contentReference.hash === directResult.contentReference.hash,
            '9. materialize() returns exactly what the underlying use case returns, unchanged');
    }
    console.log('✓ Section A: constructor validation, uncaught contract violations, and unchanged pass-through behavior');

    // ---------------------------------------------------------------
    // Section B — pure view functions
    // ---------------------------------------------------------------
    {
        const idle = describePlacementMaterializationAttempt(null);
        assert(idle.state === SnapshotPlacementMaterializationUiState.IDLE && idle.materializing === false && idle.label === null,
            '1. idle (never attempted) reports IDLE with no label/message');

        const materializing = describePlacementMaterializationAttempt({ materializing: true });
        assert(materializing.state === SnapshotPlacementMaterializationUiState.MATERIALIZING && materializing.label === 'Materializing…',
            '2. an in-flight materialization reports MATERIALIZING');

        const stored = describePlacementMaterializationAttempt({ outcome: SnapshotPlacementMaterializationOutcome.STORED, publicationKnown: true, placementId: 'pl', publicationId: 'p', contentReference: { hash: 'h' } });
        assert(stored.state === SnapshotPlacementMaterializationUiState.STORED, '3. STORED + known reports STORED');
        assert(stored.message === 'Snapshot was materialized from this placement and matches its own claimed content hash.',
            '4. the exact, deliberately unhedged sentence this milestone permits for a known publication');

        const storedUnknown = describePlacementMaterializationAttempt({ outcome: SnapshotPlacementMaterializationOutcome.STORED, publicationKnown: false, placementId: 'pl', publicationId: 'p', contentReference: { hash: 'h' } });
        assert(storedUnknown.message === 'Snapshot materialized from this placement. The publication is not currently known locally.',
            '5. the distinct sentence this milestone requires when the publication is not cataloged — publicationKnown never gates the outcome');

        const already = describePlacementMaterializationAttempt({ outcome: SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE, publicationKnown: true });
        assert(already.state === SnapshotPlacementMaterializationUiState.ALREADY_AVAILABLE, '6. ALREADY_AVAILABLE reports ALREADY_AVAILABLE');
        assert(already.message === 'The snapshot is already present locally.', '7. the exact "already available" sentence');

        const unavailable = describePlacementMaterializationAttempt({ outcome: SnapshotPlacementMaterializationOutcome.UNAVAILABLE, reason: 'the referenced content is not available from this content store' });
        assert(unavailable.state === SnapshotPlacementMaterializationUiState.UNAVAILABLE, '8. UNAVAILABLE reports UNAVAILABLE');

        const hashMismatch = describePlacementMaterializationAttempt({ outcome: SnapshotPlacementMaterializationOutcome.HASH_MISMATCH });
        assert(hashMismatch.state === SnapshotPlacementMaterializationUiState.HASH_MISMATCH, '9. HASH_MISMATCH reports HASH_MISMATCH');
        assert(hashMismatch.contentReference === null, '10. a hash-mismatched attempt reports no contentReference');

        const invalidPlacement = describePlacementMaterializationAttempt({ outcome: SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT, reason: 'signature does not verify' });
        assert(invalidPlacement.state === SnapshotPlacementMaterializationUiState.INVALID_PLACEMENT, '11. INVALID_PLACEMENT reports INVALID_PLACEMENT');

        const localError = describePlacementMaterializationAttempt({ error: 'a contract violation message' });
        assert(localError.state === SnapshotPlacementMaterializationUiState.UNAVAILABLE, '12. a local error shares UNAVAILABLE\'s UI state');
        assert(localError.message === 'a contract violation message', '13. the specific local error message is preserved, never replaced with a generic one');

        // No two of IDLE/MATERIALIZING/STORED/ALREADY_AVAILABLE/
        // UNAVAILABLE/HASH_MISMATCH/INVALID_PLACEMENT ever collapse onto
        // the same UI state.
        const states = [idle, materializing, stored, already, unavailable, hashMismatch, invalidPlacement].map((v) => v.state);
        assert(new Set(states).size === 7, '14. all seven UI states are genuinely distinct');

        assert(describePlacementMaterializationButtonLabel({}) === 'Materialize Snapshot', '15. idle button label');
        assert(describePlacementMaterializationButtonLabel({ materializing: true }) === 'Materializing…', '16. in-flight button label');
        assert(describePlacementMaterializationButtonLabel({ materialized: true }) === 'Materialize Again',
            '17. once an attempt has completed, the button reads "Materialize Again" — mirroring "Resolve Snapshot"/"Resolve Again"');

        const forbiddenWords = ['verified', 'trusted', 'authentic', 'permanent', 'canonical'];
        const allMessages = [stored, storedUnknown, already].map((v) => v.message.toLowerCase());
        for (const word of forbiddenWords) {
            for (const message of allMessages) {
                assert(!message.includes(word), `18. no permitted success message ever uses the word "${word}" (checked: "${message}")`);
            }
        }
    }
    console.log('✓ Section B: pure view functions over every outcome plus idle/materializing, exact sentences, and the forbidden-words check');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { flagship: 'placement-materialization' });
        const creationResult = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        const placement = creationResult.placement;
        const originalPlacementJson = JSON.stringify(placement.toJSON());

        // --- Bob: knows the placement (received it some other way) and,
        // separately, knows the publication itself — but has never
        // touched a content store for either. ---
        const bob = makeReplica({ placement, node: net, knowsPublication: publication });
        assert((await bob.contentStore.has(publication.contentReference)) === false, '1. Bob does not yet possess the snapshot bytes');

        const idleView = describePlacementMaterializationAttempt(null);
        assert(idleView.state === SnapshotPlacementMaterializationUiState.IDLE, '2. before any click, the derived view reports IDLE');

        // Bob clicks "Materialize Snapshot".
        const firstAttempt = await clickMaterialize(bob.materializationCoordinator, placement);
        assert(firstAttempt.error === null && firstAttempt.outcome === SnapshotPlacementMaterializationOutcome.STORED, '3. a healthy materialization produces STORED');
        assert(firstAttempt.publicationKnown === true, '4. Bob already knows the publication, reported as a plain observation');
        const firstView = describePlacementMaterializationAttempt(firstAttempt);
        assert(firstView.state === SnapshotPlacementMaterializationUiState.STORED, '5. the derived view reports STORED');
        assert(firstView.message === 'Snapshot was materialized from this placement and matches its own claimed content hash.',
            '6. the exact, unhedged sentence for a known publication');

        assert((await bob.contentStore.get(publication.contentReference)) !== null, '7. Bob now genuinely possesses bytes for the publication\'s own contentReference');
        assert(publication.contentReference.verify(await bob.contentStore.get(publication.contentReference)),
            '8. the bytes Bob now possesses actually verify against the publication\'s own claimed hash');

        // An explicit, separate "Check Local Snapshot" click now reports
        // AVAILABLE — the exact bridge this milestone exists to build:
        // 0.8.20's own placement resolution feeding 0.8.33's own
        // inspection, with 0.8.35's own materialization step in between.
        const availabilityUseCase = new CheckLocalSnapshotContentAvailabilityUseCase(bob.contentStore);
        const availability = await availabilityUseCase.execute(bob.publicationCatalog.get(publication.id));
        assert(availability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '9. "Check Local Snapshot" now reports AVAILABLE — materializing from a placement is what connects 0.8.20\'s own resolution to 0.8.33\'s own inspection');

        // Bob clicks "Materialize Snapshot" again on the SAME placement.
        const secondAttempt = await clickMaterialize(bob.materializationCoordinator, placement);
        assert(secondAttempt.outcome === SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE, '10. materializing again reports ALREADY_AVAILABLE, never an error');
        const secondView = describePlacementMaterializationAttempt(secondAttempt);
        assert(secondView.state === SnapshotPlacementMaterializationUiState.ALREADY_AVAILABLE, '11. the derived view reports ALREADY_AVAILABLE');
        assert((await bob.contentStore.get(publication.contentReference)) !== null, '12. the bytes remain present after the duplicate materialization');

        // FLAGSHIP INVARIANT: the placement itself never changed, across
        // two full materialization attempts.
        assert(JSON.stringify(placement.toJSON()) === originalPlacementJson,
            '13. FLAGSHIP INVARIANT: placement.toJSON() is byte-identical after two materialization attempts — materializing observes and stores; it never mutates the placement claim');
    }
    console.log('✓ Section C: FLAGSHIP — Bob materializes bytes from a known placement he never possessed, the local-availability bridge lights up, re-materializing is idempotent, and the placement itself never changes');

    // ---------------------------------------------------------------
    // Section D — failure modes never collapse into one another
    // ---------------------------------------------------------------
    {
        // D1 — UNAVAILABLE: the IPFS node behind the placement is down.
        {
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
            const { publicationCatalog, publicationResolver, identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });
            const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { section: 'D1' });
            const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            net.outage();
            const bob = makeReplica({ placement, node: net, knowsPublication: publication });
            const attempt = await clickMaterialize(bob.materializationCoordinator, placement);
            assert(attempt.outcome === SnapshotPlacementMaterializationOutcome.UNAVAILABLE,
                '1. CONTENT_UNAVAILABLE (an unreachable IPFS node) maps onto SnapshotPlacementMaterializationOutcome.UNAVAILABLE');
            assert(describePlacementMaterializationAttempt(attempt).state === SnapshotPlacementMaterializationUiState.UNAVAILABLE,
                '2. the derived view reports UNAVAILABLE');
            assert((await bob.contentStore.has(publication.contentReference)) === false, '3. nothing was stored for an unavailable placement');
        }

        // D2 — UNAVAILABLE: no store registered at all for this storage.
        {
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
            const { publicationCatalog, publicationResolver, identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });
            const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { section: 'D2' });
            const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');

            const bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            new AddPublicationSnapshotPlacementUseCase(bobPlacementCatalog).execute(placement.toJSON());
            const bobPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
            bobPublicationCatalog.add(publication);
            const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
            // No stores registered at all — STORE_UNAVAILABLE.
            const { coordinator: resolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
                placementCatalog: bobPlacementCatalog, stores: []
            });
            const materializeUseCase = new MaterializeSnapshotFromPlacementUseCase(resolutionCoordinator, new StoreSnapshotContentUseCase(bobContentStore), bobPublicationCatalog);
            const coordinator = new SnapshotPlacementMaterializationCoordinator(materializeUseCase);
            const attempt = await clickMaterialize(coordinator, placement);
            assert(attempt.outcome === SnapshotPlacementMaterializationOutcome.UNAVAILABLE,
                '4. STORE_UNAVAILABLE (no store registered) ALSO maps onto SnapshotPlacementMaterializationOutcome.UNAVAILABLE — the coarser question this milestone answers deliberately does not distinguish the two');
            assert((await bobContentStore.has(publication.contentReference)) === false, '5. nothing was stored with no store registered');
        }

        // D3 — HASH_MISMATCH: the store answers with the wrong bytes.
        {
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
            const { publicationCatalog, publicationResolver, identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });
            const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { section: 'D3' });
            const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            const cid = placement.locator.slice('ipfs://'.length);
            net.network.set(cid, 'these are not the bytes that were placed');
            const bob = makeReplica({ placement, node: net, knowsPublication: publication });
            const attempt = await clickMaterialize(bob.materializationCoordinator, placement);
            assert(attempt.outcome === SnapshotPlacementMaterializationOutcome.HASH_MISMATCH,
                '6. CONTENT_HASH_MISMATCH maps onto SnapshotPlacementMaterializationOutcome.HASH_MISMATCH');
            assert(describePlacementMaterializationAttempt(attempt).state === SnapshotPlacementMaterializationUiState.HASH_MISMATCH,
                '7. the derived view reports HASH_MISMATCH, never UNAVAILABLE');
            assert((await bob.contentStore.has(publication.contentReference)) === false, '8. nothing was stored for a hash-mismatched placement');
        }

        // D4 — INVALID_PLACEMENT: the placement itself fails its own signature.
        {
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
            const { publicationCatalog, publicationResolver, identityProvider, createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });
            const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { section: 'D4' });
            const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            const tamperedPlacement = PublicationSnapshotPlacement.fromJSON({ ...placement.toJSON(), locator: 'ipfs://someone-elses-cid' });
            const bob = makeReplica({ placement: tamperedPlacement, node: net, knowsPublication: publication });
            const attempt = await clickMaterialize(bob.materializationCoordinator, tamperedPlacement);
            assert(attempt.outcome === SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT,
                '9. INVALID_SIGNATURE (a tampered field) maps onto SnapshotPlacementMaterializationOutcome.INVALID_PLACEMENT');
            assert(describePlacementMaterializationAttempt(attempt).state === SnapshotPlacementMaterializationUiState.INVALID_PLACEMENT,
                '10. the derived view reports INVALID_PLACEMENT');
            assert((await bob.contentStore.has(publication.contentReference)) === false, '11. nothing was stored for an invalid placement');
        }

        // No two of UNAVAILABLE/HASH_MISMATCH/INVALID_PLACEMENT collapse
        // into one another — confirmed structurally: the underlying
        // resolution outcomes this milestone maps from are themselves
        // genuinely distinct.
        assert(SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE !== SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH
            && SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH !== SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE,
            '12. INVARIANT: the underlying resolution outcomes this milestone maps from are themselves genuinely distinct');
    }
    console.log('✓ Section D: an IPFS outage, a missing store, tampered bytes, and a tampered placement each land in their own distinct, honest outcome — and none of them store anything');

    console.log('\n✅ All SnapshotPlacementMaterialization tests passed');
}

run().catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
