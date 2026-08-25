import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { SnapshotPlacementLifecycleState } from '../application/SnapshotPlacementLifecycleState.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';
import {
    deriveSnapshotPlacementLifecycle, describeSnapshotPlacementLifecycleNote
} from '../application/SnapshotPlacementLifecycleView.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';

// 0.8.26 — Snapshot Placement Lifecycle & Stale Availability Semantics.
//
//   Section A: FLAGSHIP — the SAME placement, resolved three times as a
//              real fake IPFS network's own state changes underneath it
//              (available -> outage -> recovered). The derived lifecycle
//              tracks every transition honestly, including the one this
//              milestone was built for: UNAVAILABLE after an earlier
//              RESOLVED reads as "currently unavailable," with a note
//              that it was resolved successfully earlier — never as
//              "invalid" or "corrupted." core/PublicationSnapshotPlacement
//              .js#toJSON() is asserted byte-identical after all three
//              calls.
//   Section B: a store answering with the WRONG bytes (HASH_MISMATCH) is
//              its own permanent state, never confused with UNAVAILABLE,
//              and — unlike UNAVAILABLE — never earns the soft
//              "previously resolved" note even after an earlier
//              successful resolution.
//   Section C: STORE_UNAVAILABLE (no store registered at all) and
//              CONTENT_UNAVAILABLE (a store registered, but the network
//              behind it is down) derive the IDENTICAL UNAVAILABLE
//              lifecycle state — the coarser lifecycle question this
//              milestone answers deliberately does not distinguish them,
//              even though the unchanged per-attempt resolutionLabel
//              still does.
//   Section D: multiple independent placements each derive their own
//              lifecycle from their own observations alone — never
//              ranked, never influencing one another.
//   Section E: local observation isolation — two independently
//              constructed resolvers (standing in for two replicas)
//              resolve the SAME placement under DIFFERENT external
//              conditions and reach different, non-shared results;
//              neither touches the placement or a shared catalog.
//   Section F: application/SnapshotPlacementLifecycleView.js and
//              application/SnapshotPlacementResolutionObservation.js
//              exercised directly as pure functions, covering every
//              application/SnapshotPlacementResolutionOutcome.js value.
//
// See docs/Principles.md, "A Resolution Result Describes Whether Bytes
// Can Be Retrieved Now; It Does Not Rewrite The Placement Claim
// (0.8.26)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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

function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

function publishLocally(title) {
    const storage = new InMemoryStorageProvider();
    const alice = makeIdentity('alice');
    const publisher = new LocalPublisherProvider(storage);
    const doc = createTestDocument(title);
    const publication = publisher.publish(doc, alice);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const contentResolver = new LocalContentResolver(publisher);
    return { alice, publication, discoveryProvider, contentResolver };
}

// The identical fake Kubo HTTP RPC API tests/DecentralizedSnapshotPlacement
// .test.js's own makeFakeIpfsNode() already established, extended here
// with `outage`/`recover` to simulate the IPFS node itself becoming
// unreachable — the identical technique tests/PublicationAnchorLifecycle
// .test.js's own makeFakeBitcoinNetwork() already uses for an explorer —
// without ever touching content it already stored.
function makeFakeIpfsNode(network) {
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

    return {
        fetchImpl,
        outage() { down = true; },
        recover() { down = false; }
    };
}

// Places `publication`'s own locally stored snapshot onto a fresh IPFS
// store backed by `node`, through the SAME production pipeline 0.8.18-
// 0.8.25 already established (application/
// CreateSnapshotPlacementOrchestratorUseCase.js) — never a hand-signed
// placement, so this test exercises the exact envelope/signature/store
// path a real replica would.
async function placeOnFakeIpfs({ discoveryProvider, contentResolver, publicationId, identityProvider, node }) {
    const ipfsStore = new IpfsContentStore({ fetchImpl: node.fetchImpl });
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider, contentResolver, placementCatalog, identityProvider, stores: [ipfsStore]
    });
    const creationResult = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publicationId, 'ipfs');
    return { placement: creationResult.placement, placementCatalog, ipfsStore };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the same placement, resolved as the external
    // world changes underneath it
    // ---------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Flagship Snapshot');
        const network = new Map();
        const node = makeFakeIpfsNode(network);
        const { placement, placementCatalog, ipfsStore } = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node
        });
        const originalJson = JSON.stringify(placement.toJSON());

        const { coordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog, stores: [ipfsStore]
        });
        const history = [];

        async function checkOnce() {
            const result = await coordinator.resolve(placement);
            history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
            return result;
        }

        // T1 — the network is up; the placed bytes are exactly what was published.
        let result = await checkOnce();
        assert(result.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '1. a reachable store serving the correct bytes reports RESOLVED');
        let lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.RESOLVED, '2. lifecycle state is RESOLVED');
        assert(lifecycle.everResolved === true, '3. everResolved flips true the moment a RESOLVED observation is recorded');
        assert(describeSnapshotPlacementLifecycleNote(lifecycle) === null, '4. no note while the CURRENT state is already RESOLVED');

        // T2 — the IPFS node itself goes down. The placement and the
        // content it names are completely unchanged; only this replica's
        // ability to currently reach the storage backend changed.
        node.outage();
        result = await checkOnce();
        assert(result.outcome === SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE, '5. an unreachable IPFS node reports CONTENT_UNAVAILABLE, never CONTENT_HASH_MISMATCH');
        lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.UNAVAILABLE, '6. lifecycle state is UNAVAILABLE');
        assert(lifecycle.everResolved === true, '7. everResolved STAYS true — an earlier RESOLVED observation is never erased by a later UNAVAILABLE one');
        const note = describeSnapshotPlacementLifecycleNote(lifecycle);
        assert(typeof note === 'string' && /resolved successfully earlier/.test(note) && !/invalid|corrupt|removed|lost/i.test(note),
            '8. THE CENTRAL CASE: previously-RESOLVED-now-UNAVAILABLE gets an honest "resolved earlier, unavailable now" note, never language implying the claim itself is wrong');

        // T3 — the node recovers. The SAME unchanged placement resolves again.
        node.recover();
        result = await checkOnce();
        assert(result.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '9. once the node is reachable again, the SAME placement resolves again');
        lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.RESOLVED, '10. lifecycle state returns to RESOLVED');
        assert(lifecycle.observationCount === 3, '11. all three attempts are preserved in the observation history');

        assert(JSON.stringify(placement.toJSON()) === originalJson,
            '12. FLAGSHIP INVARIANT: placement.toJSON() is byte-identical after three resolutions under different external conditions — resolving is an observation, never a mutation of the placement');
    }
    console.log('✓ Section A: the same placement, resolved as the external world changes underneath it — UNAVAILABLE after RESOLVED never reads as invalid, and the placement itself never changes');

    // ---------------------------------------------------------------
    // Section B — HASH_MISMATCH is its own permanent state, never
    // softened by an earlier successful resolution
    // ---------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Tampered Snapshot');
        const network = new Map();
        const node = makeFakeIpfsNode(network);
        const { placement, placementCatalog, ipfsStore } = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node
        });
        const cid = placement.locator.slice('ipfs://'.length);

        const { coordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog, stores: [ipfsStore]
        });
        const history = [];

        let result = await coordinator.resolve(placement);
        history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
        assert(result.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '13. the placement resolves correctly before any tampering');

        // The store now serves DIFFERENT bytes at the SAME locator — a
        // definite integrity problem, structurally different from
        // "cannot presently be reached." The placement itself is never
        // touched — only what the fake network's `network.get(cid)` now
        // hands back.
        network.set(cid, 'these are not the bytes that were placed');
        result = await coordinator.resolve(placement);
        history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
        assert(result.outcome === SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH, '14. a store answering with the wrong bytes reports CONTENT_HASH_MISMATCH');

        const lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.HASH_MISMATCH, '15. lifecycle state is HASH_MISMATCH, a state UNAVAILABLE never reaches');
        assert(lifecycle.everResolved === true, '16. everResolved stays true — this placement WAS resolved correctly earlier in this session');
        assert(describeSnapshotPlacementLifecycleNote(lifecycle) === null,
            '17. THE CENTRAL CASE: HASH_MISMATCH never gets the soft "resolved earlier" note, even though an earlier attempt truly did resolve — a wrong-bytes finding is never softened');
    }
    console.log('✓ Section B: a store answering with the wrong bytes is HASH_MISMATCH, permanently distinct from UNAVAILABLE, and never earns the soft "resolved earlier" note even after a genuine earlier success');

    // ---------------------------------------------------------------
    // Section C — STORE_UNAVAILABLE and CONTENT_UNAVAILABLE derive the
    // IDENTICAL lifecycle state
    // ---------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Store Comes And Goes');
        const network = new Map();
        const node = makeFakeIpfsNode(network);
        const { placement, placementCatalog, ipfsStore } = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node
        });
        const history = [];

        // T1 — this replica has no store registered for `ipfs` at all yet.
        const { coordinator: coordinatorNoStore } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog, stores: []
        });
        let result = await coordinatorNoStore.resolve(placement);
        history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
        assert(result.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE, '18. no registered store reports STORE_UNAVAILABLE');
        let lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.UNAVAILABLE, '19. STORE_UNAVAILABLE derives the SAME UNAVAILABLE lifecycle state CONTENT_UNAVAILABLE will derive below');
        assert(lifecycle.everResolved === false, '20. everResolved is false — this placement has never been independently resolved yet');
        assert(describeSnapshotPlacementLifecycleNote(lifecycle) === null, '21. no "resolved earlier" note before any RESOLVED observation exists');

        // T2 — a store gets registered, and now resolves successfully.
        const { coordinator: coordinatorWithStore } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog, stores: [ipfsStore]
        });
        result = await coordinatorWithStore.resolve(placement);
        history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
        assert(result.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '22. once a store is registered, the SAME placement resolves');
        lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.RESOLVED && lifecycle.everResolved === true, '23. lifecycle flips to RESOLVED');

        // T3 — the store is consulted, but the node behind it is down —
        // CONTENT_UNAVAILABLE this time, a DIFFERENT outcome than T1's
        // STORE_UNAVAILABLE, yet it derives the IDENTICAL lifecycle state.
        node.outage();
        result = await coordinatorWithStore.resolve(placement);
        history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
        assert(result.outcome === SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE, '24. a registered store that cannot presently reach its backend reports CONTENT_UNAVAILABLE');
        lifecycle = deriveSnapshotPlacementLifecycle(history);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.UNAVAILABLE,
            '25. CONTENT_UNAVAILABLE derives the SAME UNAVAILABLE lifecycle state STORE_UNAVAILABLE derived at T1 — the two outcomes stay distinguishable in resolutionLabel, but not in lifecycle state');
        assert(lifecycle.everResolved === true, '26. everResolved stays true from T2\'s genuine success');
        const note = describeSnapshotPlacementLifecycleNote(lifecycle);
        assert(typeof note === 'string' && /resolved successfully earlier/.test(note), '27. the note now appears, because T2 really did resolve');
        node.recover();
    }
    console.log('✓ Section C: STORE_UNAVAILABLE (no store registered) and CONTENT_UNAVAILABLE (a store registered, but unreachable) derive the identical UNAVAILABLE lifecycle state and the identical note behavior');

    // ---------------------------------------------------------------
    // Section D — multiple independent placements, never ranked
    // ---------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Independent Placements');

        const networkResolved = new Map();
        const nodeResolved = makeFakeIpfsNode(networkResolved);
        const placementResolved = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node: nodeResolved
        });
        const { coordinator: resolvedCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: placementResolved.placementCatalog, stores: [placementResolved.ipfsStore]
        });

        const networkUnavailable = new Map();
        const nodeUnavailable = makeFakeIpfsNode(networkUnavailable);
        const placementUnavailable = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node: nodeUnavailable
        });
        nodeUnavailable.outage();
        const { coordinator: unavailableCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: placementUnavailable.placementCatalog, stores: [placementUnavailable.ipfsStore]
        });

        const networkTampered = new Map();
        const nodeTampered = makeFakeIpfsNode(networkTampered);
        const placementTampered = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node: nodeTampered
        });
        const { coordinator: tamperedCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: placementTampered.placementCatalog, stores: [placementTampered.ipfsStore]
        });

        const resolvedResult = await resolvedCoordinator.resolve(placementResolved.placement);
        const unavailableResult = await unavailableCoordinator.resolve(placementUnavailable.placement);
        // Tamper AFTER the placement itself was created (so creation
        // could actually put() valid bytes), then resolve.
        const tamperedCid = placementTampered.placement.locator.slice('ipfs://'.length);
        networkTampered.set(tamperedCid, 'wrong bytes entirely');
        const tamperedResult = await tamperedCoordinator.resolve(placementTampered.placement);

        const histories = {
            [placementResolved.placement.id]: [createResolutionObservation({ placementId: placementResolved.placement.id, outcome: resolvedResult.outcome, reason: resolvedResult.reason })],
            [placementUnavailable.placement.id]: [createResolutionObservation({ placementId: placementUnavailable.placement.id, outcome: unavailableResult.outcome, reason: unavailableResult.reason })],
            [placementTampered.placement.id]: [createResolutionObservation({ placementId: placementTampered.placement.id, outcome: tamperedResult.outcome, reason: tamperedResult.reason })]
        };

        const lifecycleResolved = deriveSnapshotPlacementLifecycle(histories[placementResolved.placement.id]);
        const lifecycleUnavailable = deriveSnapshotPlacementLifecycle(histories[placementUnavailable.placement.id]);
        const lifecycleTampered = deriveSnapshotPlacementLifecycle(histories[placementTampered.placement.id]);

        assert(lifecycleResolved.state === SnapshotPlacementLifecycleState.RESOLVED, '28. placement A (reachable, correct) derives RESOLVED');
        assert(lifecycleUnavailable.state === SnapshotPlacementLifecycleState.UNAVAILABLE, '29. placement B (unreachable) derives UNAVAILABLE');
        assert(lifecycleTampered.state === SnapshotPlacementLifecycleState.HASH_MISMATCH, '30. placement C (reachable, wrong bytes) derives HASH_MISMATCH');
        // Each derivation reads only its OWN placement's observation
        // array — there is no shared/aggregate state anywhere in this
        // call chain that could let one placement's outcome influence
        // another's.
        assert(lifecycleResolved.observationCount === 1 && lifecycleUnavailable.observationCount === 1 && lifecycleTampered.observationCount === 1,
            '31. three independent, equally-sized histories — nothing merged, nothing ranked');
    }
    console.log('✓ Section D: three independent placements for one publication each derive their own lifecycle from their own observations alone — never ranked, never influencing one another');

    // ---------------------------------------------------------------
    // Section E — local observation isolation between replicas
    // ---------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Isolated Replicas');
        const network = new Map();
        const node = makeFakeIpfsNode(network);
        const { placement: alicePlacement, placementCatalog: alicePlacementCatalog } = await placeOnFakeIpfs({
            discoveryProvider, contentResolver, publicationId: publication.id, identityProvider: alice, node
        });
        const beforeIds = alicePlacementCatalog.list().map((p) => p.id);

        // Bob's own replica: a completely separate catalog holding the
        // byte-identical placement, and his own IpfsContentStore pointed
        // at the SAME shared network (content is really there).
        const bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        new AddPublicationSnapshotPlacementUseCase(bobPlacementCatalog).execute(alicePlacement.toJSON());
        const bobIpfs = new IpfsContentStore({ fetchImpl: node.fetchImpl });
        const { coordinator: bobCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: bobPlacementCatalog, stores: [bobIpfs]
        });

        // Carol's own, completely separate replica — her own IpfsContentStore
        // is pointed at a DIFFERENT, never-populated fake network, so
        // every lookup 404s. Never wired to Bob's or Alice's in any way.
        const carolPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        new AddPublicationSnapshotPlacementUseCase(carolPlacementCatalog).execute(alicePlacement.toJSON());
        const carolNode = makeFakeIpfsNode(new Map());
        const carolIpfs = new IpfsContentStore({ fetchImpl: carolNode.fetchImpl });
        const { coordinator: carolCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: carolPlacementCatalog, stores: [carolIpfs]
        });

        const bobResult = await bobCoordinator.resolve(alicePlacement);
        const carolResult = await carolCoordinator.resolve(alicePlacement);

        assert(bobResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '32. Bob, whose store points at the network holding the real bytes, observes RESOLVED');
        assert(carolResult.outcome === SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE, '33. Carol, whose store points at an empty network, independently observes CONTENT_UNAVAILABLE');

        const bobHistory = [createResolutionObservation({ placementId: alicePlacement.id, outcome: bobResult.outcome, reason: bobResult.reason })];
        const carolHistory = [createResolutionObservation({ placementId: alicePlacement.id, outcome: carolResult.outcome, reason: carolResult.reason })];
        assert(deriveSnapshotPlacementLifecycle(bobHistory).state === SnapshotPlacementLifecycleState.RESOLVED, '34. Bob\'s own derived lifecycle is RESOLVED');
        assert(deriveSnapshotPlacementLifecycle(carolHistory).state === SnapshotPlacementLifecycleState.UNAVAILABLE, '35. Carol\'s own derived lifecycle is UNAVAILABLE — completely unaffected by Bob\'s result');

        // Neither observation ever reached Alice's own shared catalog or
        // the placement itself — both stayed exactly what they were
        // before either replica resolved anything.
        const afterIds = alicePlacementCatalog.list().map((p) => p.id);
        assert(JSON.stringify(beforeIds) === JSON.stringify(afterIds), '36. Alice\'s shared catalog is completely unaffected by either replica\'s local resolution');
    }
    console.log('✓ Section E: two independent resolvers observe the same placement under different external conditions and reach different, non-shared results — neither the placement nor a shared catalog is ever touched');

    // ---------------------------------------------------------------
    // Section F — pure unit coverage of the lifecycle derivation itself
    // ---------------------------------------------------------------
    {
        let lifecycle = deriveSnapshotPlacementLifecycle([]);
        assert(lifecycle.state === SnapshotPlacementLifecycleState.NOT_RESOLVED && lifecycle.everResolved === false && lifecycle.observationCount === 0,
            '37. no observations at all derives NOT_RESOLVED');
        assert(describeSnapshotPlacementLifecycleNote(lifecycle) === null, '38. NOT_RESOLVED never gets a note');
        assert(deriveSnapshotPlacementLifecycle(undefined).state === SnapshotPlacementLifecycleState.NOT_RESOLVED, '39. an undefined observation list is treated as none, never throws');

        const obsFor = (outcome) => [createResolutionObservation({ placementId: 'placement-1', outcome, reason: null })];
        assert(deriveSnapshotPlacementLifecycle(obsFor(SnapshotPlacementResolutionOutcome.RESOLVED)).state === SnapshotPlacementLifecycleState.RESOLVED, '40. RESOLVED -> RESOLVED');
        assert(deriveSnapshotPlacementLifecycle(obsFor(SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH)).state === SnapshotPlacementLifecycleState.HASH_MISMATCH, '41. CONTENT_HASH_MISMATCH -> HASH_MISMATCH');
        assert(deriveSnapshotPlacementLifecycle(obsFor(SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE)).state === SnapshotPlacementLifecycleState.UNAVAILABLE, '42. STORE_UNAVAILABLE -> UNAVAILABLE');
        assert(deriveSnapshotPlacementLifecycle(obsFor(SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE)).state === SnapshotPlacementLifecycleState.UNAVAILABLE, '43. CONTENT_UNAVAILABLE -> UNAVAILABLE');
        for (const outcome of [SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE, SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE]) {
            assert(deriveSnapshotPlacementLifecycle(obsFor(outcome)).state === SnapshotPlacementLifecycleState.INVALID_PLACEMENT, `44. ${outcome} -> INVALID_PLACEMENT`);
        }

        // The note appears ONLY for the exact CURRENT=UNAVAILABLE +
        // everResolved=true combination — asserted directly against a
        // hand-built history, independent of any real resolver.
        const upDownUp = [
            createResolutionObservation({ placementId: 'a', outcome: SnapshotPlacementResolutionOutcome.RESOLVED }),
            createResolutionObservation({ placementId: 'a', outcome: SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE }),
            createResolutionObservation({ placementId: 'a', outcome: SnapshotPlacementResolutionOutcome.RESOLVED })
        ];
        const finalLifecycle = deriveSnapshotPlacementLifecycle(upDownUp);
        assert(finalLifecycle.state === SnapshotPlacementLifecycleState.RESOLVED && describeSnapshotPlacementLifecycleNote(finalLifecycle) === null,
            '45. once re-resolved, the note disappears again — it only ever describes the CURRENT observation, never the whole history at once');

        // HASH_MISMATCH never gets the note, even directly after a RESOLVED.
        const resolvedThenMismatch = [
            createResolutionObservation({ placementId: 'a', outcome: SnapshotPlacementResolutionOutcome.RESOLVED }),
            createResolutionObservation({ placementId: 'a', outcome: SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH })
        ];
        assert(describeSnapshotPlacementLifecycleNote(deriveSnapshotPlacementLifecycle(resolvedThenMismatch)) === null,
            '46. HASH_MISMATCH never gets the "resolved earlier" note, even directly after a RESOLVED observation');

        // createResolutionObservation() itself: validation and shape.
        expectThrows(() => createResolutionObservation({ outcome: SnapshotPlacementResolutionOutcome.RESOLVED }), '47. a placementId is required');
        expectThrows(() => createResolutionObservation({ placementId: 'a' }), '48. an outcome is required');
        const observation = createResolutionObservation({ placementId: 'a', outcome: SnapshotPlacementResolutionOutcome.RESOLVED });
        assert(observation.reason === null, '49. reason defaults to null when omitted');
        assert(observation.observedAt instanceof Date, '50. observedAt defaults to a real Date when omitted');
        assert(Object.isFrozen(observation), '51. a resolution observation is immutable once created');
    }
    console.log('✓ Section F: application/SnapshotPlacementLifecycleView.js and application/SnapshotPlacementResolutionObservation.js exercised directly as pure functions, covering every SnapshotPlacementResolutionOutcome value');

    console.log('\nAll Snapshot Placement Lifecycle & Stale Availability Semantics tests passed.');
}

run().catch((error) => {
    console.error('SnapshotPlacementLifecycle.test.js FAILED:', error);
    process.exitCode = 1;
});
