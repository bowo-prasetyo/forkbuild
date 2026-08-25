import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { CreatePublicationSnapshotPlacementUseCase } from '../application/CreatePublicationSnapshotPlacementUseCase.js';
import { ImportPackageSnapshotPlacementsUseCase, PackagePlacementImportReason } from '../application/ImportPackageSnapshotPlacementsUseCase.js';
import { PlacementAcquisitionKind, isValidPlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import {
    createSnapshotPlacementKnowledgeRecord,
    snapshotPlacementKnowledgeRecordFromJSON,
    snapshotPlacementKnowledgeRecordToJSON
} from '../application/SnapshotPlacementKnowledgeRecord.js';
import { LocalPlacementKnowledgeStore } from '../application/LocalPlacementKnowledgeStore.js';
import { describePlacementKnowledge } from '../application/PublicationSnapshotPlacementKnowledgeView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
//
//   Section A: PlacementAcquisitionKind / SnapshotPlacementKnowledgeRecord
//              — the three-value vocabulary, record construction/
//              validation, immutability, and JSON round-trip.
//   Section B: LocalPlacementKnowledgeStore — record()/get()/has()/
//              list()/remove(), and FIRST-SEEN-WINS: a second record()
//              call for an already-known placementId, with a DIFFERENT
//              acquisitionKind, never overwrites the original.
//   Section C: PublicationSnapshotPlacementKnowledgeView#
//              describePlacementKnowledge() — known/unknown shapes, and
//              an explicit wording check that no acquisition label ever
//              names a peer or reads as a trust/availability signal.
//   Section D: Wiring — each of the three acquisition paths records the
//              acquisition kind it alone knows about:
//              CreatePublicationSnapshotPlacementUseCase -> LOCAL,
//              ImportPackageSnapshotPlacementsUseCase -> PACKAGE (both a
//              newly imported placement and a duplicate),
//              PublicationSnapshotPlacementPeerExchange -> PEER (both an
//              incoming ANNOUNCE and a RESPONSE placement). Every one of
//              the three collaborators also still works with NO
//              knowledgeStore supplied at all.
//   Section E: INVARIANT — first-seen-wins across every combination of
//              acquisition paths reaching the SAME placement id.
//   Section F: FLAGSHIP (restart) — Alice creates and signs Placement A;
//              Bob receives it via a live, real ANNOUNCE and records
//              PEER; Bob "restarts" (a fresh LocalPlacementKnowledgeStore
//              instance over the SAME underlying storage) and still
//              reports PEER; Bob then imports the IDENTICAL placement
//              from a Blueprint Package — his knowledge stays PEER, never
//              overwritten to PACKAGE.
//   Section G: FLAGSHIP (the milestone's own scenario) — Bob acquires
//              three DIFFERENT placements through three DIFFERENT
//              routes: P1 via peer exchange (PEER), P2 created locally
//              (LOCAL), P3 via package import (PACKAGE). The resulting
//              knowledge table matches exactly, while the placement
//              catalog itself stays completely independent of it.
//   Section H: INVARIANT — acquisition provenance never enters
//              derivePublicationSnapshotPlacementConvergence(): two
//              differently-acquired sets of placements that carry the
//              identical structural (publicationId/contentHash/storage/
//              locator) facts produce byte-identical convergence results,
//              regardless of which placement was learned which way.
//
// See docs/Principles.md, "Acquisition Provenance Is Not Placement Rank
// (0.8.24)."

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

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
    }
    attach(peer) { this.attached.add(peer.connectionId); }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload, meta = {}) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload, meta);
    }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
}

function stubPeer(connectionId, state) {
    return { connectionId, getLifecycleState: () => state };
}

// A minimal discoveryProvider stub — application/
// CreatePublicationSnapshotPlacementUseCase.js only ever calls
// `findById(publicationId)` and reads `.contentReference.hash` off the
// result; it never needs a real Structure/Blueprint publishing pipeline.
function stubDiscoveryProvider(publicationsById) {
    return { findById: (id) => publicationsById[id] || null };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PlacementAcquisitionKind / SnapshotPlacementKnowledgeRecord
    // ---------------------------------------------------------------
    {
        assert(isValidPlacementAcquisitionKind(PlacementAcquisitionKind.LOCAL), '1. LOCAL is a valid acquisition kind');
        assert(isValidPlacementAcquisitionKind(PlacementAcquisitionKind.PACKAGE), '2. PACKAGE is a valid acquisition kind');
        assert(isValidPlacementAcquisitionKind(PlacementAcquisitionKind.PEER), '3. PEER is a valid acquisition kind');
        assert(!isValidPlacementAcquisitionKind('RESTORED'), '4. RESTORED is deliberately not a recognized acquisition kind — see PlacementAcquisitionKind.js\'s own header');
        assert(!isValidPlacementAcquisitionKind(undefined), '5. an undefined kind is invalid');
        assert(Object.keys(PlacementAcquisitionKind).length === 3, '6. exactly three acquisition kinds exist — no fourth');

        expectThrows(() => createSnapshotPlacementKnowledgeRecord({}), '7. a placementId is required');
        expectThrows(() => createSnapshotPlacementKnowledgeRecord({ placementId: 'p1' }), '8. a valid acquisitionKind is required');
        expectThrows(() => createSnapshotPlacementKnowledgeRecord({ placementId: 'p1', acquisitionKind: 'nonsense' }), '9. an unrecognized acquisitionKind is rejected');
        expectThrows(() => createSnapshotPlacementKnowledgeRecord({ placementId: 'p1', acquisitionKind: PlacementAcquisitionKind.LOCAL, firstSeenAt: 'not-a-date' }), '10. an invalid firstSeenAt is rejected');

        const record = createSnapshotPlacementKnowledgeRecord({ placementId: 'p1', acquisitionKind: PlacementAcquisitionKind.PEER });
        assert(record.placementId === 'p1' && record.acquisition.kind === PlacementAcquisitionKind.PEER, '11. a well-formed record carries placementId and acquisition.kind');
        assert(record.firstSeenAt instanceof Date, '12. firstSeenAt defaults to a real Date when omitted');
        assert(Object.isFrozen(record) && Object.isFrozen(record.acquisition), '13. a knowledge record is immutable once created, including its nested acquisition object');
        assert(Object.keys(record).length === 3 && Object.keys(record.acquisition).length === 1, '14. a knowledge record carries exactly placementId + firstSeenAt + acquisition.kind — no peerId, no confidence, no rank');

        const json = snapshotPlacementKnowledgeRecordToJSON(record);
        assert(typeof json.firstSeenAt === 'string' && json.acquisition.kind === PlacementAcquisitionKind.PEER, '15. toJSON() produces a plain, JSON-safe envelope');
        const roundTripped = snapshotPlacementKnowledgeRecordFromJSON(json);
        assert(roundTripped.placementId === record.placementId && roundTripped.acquisition.kind === record.acquisition.kind
            && roundTripped.firstSeenAt.getTime() === record.firstSeenAt.getTime(), '16. fromJSON(toJSON(record)) reconstructs an identical record');
        expectThrows(() => snapshotPlacementKnowledgeRecordFromJSON(null), '17. fromJSON() rejects a missing envelope');
    }
    console.log('✓ Section A: PlacementAcquisitionKind / SnapshotPlacementKnowledgeRecord — three-value vocabulary, validation, immutability, JSON round-trip');

    // ---------------------------------------------------------------
    // Section B — LocalPlacementKnowledgeStore
    // ---------------------------------------------------------------
    {
        expectThrows(() => new LocalPlacementKnowledgeStore(null), '1. constructor requires a storageProvider');

        const storageProvider = new InMemoryStorageProvider();
        const store = new LocalPlacementKnowledgeStore(storageProvider);

        assert(store.get('missing') === null && !store.has('missing'), '2. an unknown placementId reports null/false, never throws');
        assert(store.list().length === 0, '3. a fresh store lists nothing');

        const { record: first, isNew: firstIsNew } = store.record('placement-1', PlacementAcquisitionKind.PEER);
        assert(firstIsNew && first.acquisition.kind === PlacementAcquisitionKind.PEER, '4. the first record() for a placementId is new and carries the supplied kind');
        assert(store.has('placement-1'), '5. has() reports true once recorded');

        // FIRST-SEEN-WINS: a second record() call with a DIFFERENT kind
        // must never overwrite the original.
        const { record: second, isNew: secondIsNew } = store.record('placement-1', PlacementAcquisitionKind.PACKAGE);
        assert(!secondIsNew, '6. re-recording an already-known placementId is never reported as new');
        assert(second.acquisition.kind === PlacementAcquisitionKind.PEER, '7. FIRST-SEEN-WINS: the original PEER acquisition survives a later PACKAGE record() call unchanged');
        assert(second.firstSeenAt.getTime() === first.firstSeenAt.getTime(), '8. re-recording never resets firstSeenAt');
        assert(store.get('placement-1').acquisition.kind === PlacementAcquisitionKind.PEER, '9. get() confirms the stored record was never overwritten');

        store.record('placement-2', PlacementAcquisitionKind.LOCAL);
        store.record('placement-3', PlacementAcquisitionKind.PACKAGE);
        assert(store.list().length === 3, '10. list() reports every distinct recorded placementId');

        assert(store.remove('placement-2') === true, '11. remove() reports true for a record that existed');
        assert(store.remove('placement-2') === false, '12. remove() reports false for a record already gone');
        assert(store.get('placement-2') === null, '13. a removed record is genuinely gone');
        assert(store.list().length === 2, '14. list() reflects the removal');

        // Durability — a fresh store instance over the SAME underlying
        // storage sees exactly what was already on file, unchanged.
        const restarted = new LocalPlacementKnowledgeStore(storageProvider);
        assert(restarted.get('placement-1').acquisition.kind === PlacementAcquisitionKind.PEER, '15. a fresh store instance over the same storage still reports the original acquisition kind after a simulated restart');
        assert(restarted.get('placement-3').acquisition.kind === PlacementAcquisitionKind.PACKAGE, '16. every other durable record survives the same simulated restart');
    }
    console.log('✓ Section B: LocalPlacementKnowledgeStore — record()/get()/has()/list()/remove(), FIRST-SEEN-WINS, and durability across a simulated restart');

    // ---------------------------------------------------------------
    // Section C — PublicationSnapshotPlacementKnowledgeView
    // ---------------------------------------------------------------
    {
        const unknown = describePlacementKnowledge(null);
        assert(unknown.known === false && unknown.acquisitionKind === null, '1. describePlacementKnowledge(null) reports known: false, never throws');

        for (const kind of Object.values(PlacementAcquisitionKind)) {
            const record = createSnapshotPlacementKnowledgeRecord({ placementId: 'p', acquisitionKind: kind });
            const view = describePlacementKnowledge(record);
            assert(view.known === true && view.acquisitionKind === kind, `2. describePlacementKnowledge() for ${kind} reports known: true and the same kind`);
            assert(typeof view.acquisitionLabel === 'string' && view.acquisitionLabel.length > 0, `3. describePlacementKnowledge() for ${kind} produces a non-empty label`);
            assert(!/alice|bob|carol|peer-\w+|identity-\w+/i.test(view.acquisitionLabel), `4. describePlacementKnowledge() for ${kind} never names a specific peer or identity in its label`);
            assert(!/trust|authorit|verified|confirm|reliab|rank|✓/i.test(view.acquisitionLabel), `5. describePlacementKnowledge() for ${kind} never reads as a trust or availability signal`);
            assert(view.firstSeenAt === record.firstSeenAt.toISOString(), `6. describePlacementKnowledge() for ${kind} carries firstSeenAt as an ISO string`);
        }
        assert(describePlacementKnowledge(createSnapshotPlacementKnowledgeRecord({ placementId: 'p', acquisitionKind: PlacementAcquisitionKind.PEER })).acquisitionLabel === 'Learned via peer exchange',
            '7. PEER reads exactly "Learned via peer exchange" — never "Source: <peer>"');
        assert(describePlacementKnowledge(createSnapshotPlacementKnowledgeRecord({ placementId: 'p', acquisitionKind: PlacementAcquisitionKind.LOCAL })).acquisitionLabel === 'Learned locally',
            '8. LOCAL reads exactly "Learned locally"');
        assert(describePlacementKnowledge(createSnapshotPlacementKnowledgeRecord({ placementId: 'p', acquisitionKind: PlacementAcquisitionKind.PACKAGE })).acquisitionLabel === 'Learned via package import',
            '9. PACKAGE reads exactly "Learned via package import"');
    }
    console.log('✓ Section C: PublicationSnapshotPlacementKnowledgeView#describePlacementKnowledge() — known/unknown shapes, and wording that never names a peer or reads as trust/availability');

    // ---------------------------------------------------------------
    // Section D — Wiring: each acquisition path records its own kind
    // ---------------------------------------------------------------
    {
        // D1 — CreatePublicationSnapshotPlacementUseCase -> LOCAL.
        const publication = { id: 'pub-provenance-1', contentReference: { hash: 'hash-abc' } };
        const discoveryProvider = stubDiscoveryProvider({ [publication.id]: publication });

        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const identityProvider = makeIdentity('Creator');
        const verifier = new LocalAuthorizationVerifier();
        const knowledgeStore = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());

        const createUseCase = new CreatePublicationSnapshotPlacementUseCase(discoveryProvider, identityProvider, verifier, placementCatalog, knowledgeStore);
        const created = createUseCase.execute(publication.id, { storage: 'ipfs', locator: 'ipfs://CID-1' });
        assert(knowledgeStore.get(created.id).acquisition.kind === PlacementAcquisitionKind.LOCAL, '1. CreatePublicationSnapshotPlacementUseCase records a LOCAL knowledge entry for the placement it created');

        // Omitting knowledgeStore entirely must not break creation at all
        // — knowledge tracking is additive, never a precondition.
        const createUseCaseNoStore = new CreatePublicationSnapshotPlacementUseCase(discoveryProvider, identityProvider, verifier, placementCatalog);
        const createdWithoutStore = createUseCaseNoStore.execute(publication.id, { storage: 'ipfs', locator: 'ipfs://CID-2' });
        assert(createdWithoutStore.id, '2. CreatePublicationSnapshotPlacementUseCase still works with no knowledgeStore supplied at all');

        // D2 — ImportPackageSnapshotPlacementsUseCase -> PACKAGE.
        const bob = { catalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), verifier: new LocalAuthorizationVerifier() };
        bob.exchange = new PublicationSnapshotPlacementExchange(bob.catalog, bob.verifier);
        const bobKnowledge = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
        const packageImporter = new ImportPackageSnapshotPlacementsUseCase(bob.exchange, bobKnowledge);

        const alice = makeIdentity('Alice');
        const placementA = signPlacement(alice, { publicationId: 'pub-x', contentHash: 'hash-x', storage: 'ipfs', locator: 'ipfs://CID-A' });
        const result = packageImporter.execute({ placements: [placementA.toJSON()] });
        assert(result.importedPlacements.length === 1, '3. a well-formed bundled placement imports successfully');
        assert(bobKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '4. ImportPackageSnapshotPlacementsUseCase records a PACKAGE knowledge entry for a newly imported placement');

        // Re-importing the SAME package (a duplicate) must still record
        // knowledge — safe only because FIRST-SEEN-WINS makes it a no-op.
        const duplicateResult = packageImporter.execute({ placements: [placementA.toJSON()] });
        assert(duplicateResult.skippedPlacements.length === 1 && duplicateResult.skippedPlacements[0].reason === PackagePlacementImportReason.DUPLICATE, '5. re-importing the identical placement is reported as a duplicate, not an error');
        assert(bobKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '6. re-importing a duplicate never changes its already-recorded acquisition kind');

        // A rejected (invalid-signature) placement never reaches
        // record() at all — nothing to associate a knowledge entry with.
        const forged = signPlacement(makeIdentity('Mallory'), { publicationId: 'pub-y', contentHash: 'hash-y', storage: 'ipfs', locator: 'ipfs://CID-M' });
        const tamperedJson = { ...forged.toJSON(), contentHash: 'hash-tampered' };
        const rejectedResult = packageImporter.execute({ placements: [tamperedJson] });
        assert(rejectedResult.rejectedPlacements.length === 1, '7. a tampered/forged bundled placement is rejected, never cataloged');
        assert(!bobKnowledge.has(tamperedJson.id), '8. a rejected placement never gets a knowledge record');

        // Omitting knowledgeStore entirely must not break import at all.
        const importerNoStore = new ImportPackageSnapshotPlacementsUseCase(bob.exchange);
        const placementB = signPlacement(alice, { publicationId: 'pub-z', contentHash: 'hash-z', storage: 'ipfs', locator: 'ipfs://CID-B' });
        const noStoreResult = importerNoStore.execute({ placements: [placementB.toJSON()] });
        assert(noStoreResult.importedPlacements.length === 1, '9. ImportPackageSnapshotPlacementsUseCase still works with no knowledgeStore supplied at all');

        // D3 — PublicationSnapshotPlacementPeerExchange -> PEER, for both
        // ANNOUNCE and RESPONSE.
        const carol = { catalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), verifier: new LocalAuthorizationVerifier() };
        carol.exchange = new PublicationSnapshotPlacementExchange(carol.catalog, carol.verifier);
        const carolKnowledge = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
        const bus = new StubPeerMessageBus();
        const senderPeer = stubPeer('conn-sender', PeerLifecycleState.AUTHENTICATED);
        const registry = new StubConnectedPeerRegistry([senderPeer]);
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(carol.exchange, bus, registry, { knowledgeStore: carolKnowledge });

        let lastReceived = null;
        peerExchange.onPlacementReceived((payload) => { lastReceived = payload; });

        const placementC = signPlacement(alice, { publicationId: 'pub-c', contentHash: 'hash-c', storage: 'ipfs', locator: 'ipfs://CID-C' });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: placementC.toJSON() }, { connectedPeer: senderPeer });
        assert(lastReceived && lastReceived.placement.id === placementC.id, '10. an incoming ANNOUNCE is cataloged and fires onPlacementReceived');
        assert(carolKnowledge.get(placementC.id).acquisition.kind === PlacementAcquisitionKind.PEER, '11. an incoming ANNOUNCE records a PEER knowledge entry');

        const placementD = signPlacement(alice, { publicationId: 'pub-d', contentHash: 'hash-d', storage: 'ipfs', locator: 'ipfs://CID-D' });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'RESPONSE', publicationId: 'pub-d', placements: [placementD.toJSON()] }, { connectedPeer: senderPeer });
        assert(carolKnowledge.get(placementD.id).acquisition.kind === PlacementAcquisitionKind.PEER, '12. a placement arriving inside a RESPONSE also records a PEER knowledge entry, through the identical _importAndPublish() path as ANNOUNCE');

        // A forged incoming ANNOUNCE never reaches record() at all.
        const forgedEnvelope = { ...placementC.toJSON(), id: 'forged-id', contentHash: 'hash-tampered' };
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: forgedEnvelope }, { connectedPeer: senderPeer });
        assert(!carolKnowledge.has('forged-id'), '13. a forged incoming ANNOUNCE never gets a knowledge record');

        // Omitting knowledgeStore entirely must not break peer exchange.
        const peerExchangeNoStore = new PublicationSnapshotPlacementPeerExchange(new PublicationSnapshotPlacementExchange(new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), new LocalAuthorizationVerifier()), new StubPeerMessageBus(), new StubConnectedPeerRegistry([]));
        assert(peerExchangeNoStore instanceof PublicationSnapshotPlacementPeerExchange, '14. PublicationSnapshotPlacementPeerExchange still constructs with no knowledgeStore supplied at all');
    }
    console.log('✓ Section D: wiring — CreatePublicationSnapshotPlacementUseCase -> LOCAL, ImportPackageSnapshotPlacementsUseCase -> PACKAGE, PublicationSnapshotPlacementPeerExchange -> PEER (ANNOUNCE and RESPONSE alike); every collaborator still works with no knowledgeStore at all');

    // ---------------------------------------------------------------
    // Section E — INVARIANT: first-seen-wins across acquisition paths
    // ---------------------------------------------------------------
    {
        const combinations = [
            [PlacementAcquisitionKind.PEER, PlacementAcquisitionKind.PACKAGE],
            [PlacementAcquisitionKind.PACKAGE, PlacementAcquisitionKind.PEER],
            [PlacementAcquisitionKind.LOCAL, PlacementAcquisitionKind.PEER],
            [PlacementAcquisitionKind.PEER, PlacementAcquisitionKind.LOCAL],
            [PlacementAcquisitionKind.LOCAL, PlacementAcquisitionKind.PACKAGE]
        ];
        let n = 1;
        for (const [firstKind, secondKind] of combinations) {
            const store = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
            store.record('shared-placement', firstKind);
            store.record('shared-placement', secondKind);
            assert(store.get('shared-placement').acquisition.kind === firstKind,
                `${n}. FIRST-SEEN-WINS: ${firstKind} then ${secondKind} stays ${firstKind}, never overwritten by the second acquisition path`);
            n += 1;
        }
    }
    console.log('✓ Section E: INVARIANT — first-seen-wins holds for every ordered pair of acquisition kinds, never just one example');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP (restart)
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const placementA = signPlacement(alice, {
            publicationId: 'pub-flagship',
            contentHash: 'hash-flagship',
            storage: 'ipfs',
            locator: 'ipfs://CID-flagship'
        });

        const bobStorage = new InMemoryStorageProvider();
        const bobCatalog = new LocalPublicationSnapshotPlacementCatalog(bobStorage);
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobExchange = new PublicationSnapshotPlacementExchange(bobCatalog, bobVerifier);
        let bobKnowledge = new LocalPlacementKnowledgeStore(bobStorage);

        const bus = new StubPeerMessageBus();
        const alicePeer = stubPeer('conn-alice', PeerLifecycleState.AUTHENTICATED);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        let bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, bus, registry, { knowledgeStore: bobKnowledge });

        // Alice ANNOUNCEs Placement A; Bob receives it and records PEER.
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: placementA.toJSON() }, { connectedPeer: alicePeer });
        assert(bobCatalog.has(placementA.id), '1. Bob catalogs Placement A after receiving it from Alice');
        assert(bobKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PEER, '2. Bob records PEER acquisition for Placement A');
        const firstSeenAtBeforeRestart = bobKnowledge.get(placementA.id).firstSeenAt.getTime();

        // Bob restarts: fresh catalog/exchange/knowledgeStore instances
        // over the SAME underlying storage — no network involved.
        bobPeerExchange.dispose();
        const bobCatalogAfterRestart = new LocalPublicationSnapshotPlacementCatalog(bobStorage);
        bobKnowledge = new LocalPlacementKnowledgeStore(bobStorage);
        assert(bobCatalogAfterRestart.has(placementA.id), '3. Placement A survives Bob\'s restart, via 0.8.21\'s own persistence alone');
        assert(bobKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PEER, '4. Bob\'s knowledge of Placement A survives the restart and still reports PEER');
        assert(bobKnowledge.get(placementA.id).firstSeenAt.getTime() === firstSeenAtBeforeRestart, '5. firstSeenAt is unchanged by the restart');

        // Bob later imports the IDENTICAL placement from a Blueprint
        // Package. His original PEER acquisition must survive unchanged.
        const bobExchangeAfterRestart = new PublicationSnapshotPlacementExchange(bobCatalogAfterRestart, bobVerifier);
        const packageImporter = new ImportPackageSnapshotPlacementsUseCase(bobExchangeAfterRestart, bobKnowledge);
        const packageResult = packageImporter.execute({ placements: [placementA.toJSON()] });
        assert(packageResult.skippedPlacements.length === 1 && packageResult.skippedPlacements[0].reason === PackagePlacementImportReason.DUPLICATE, '6. the package-bundled Placement A is recognized as already known, never double-cataloged');
        assert(bobKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PEER, '7. the FIRST acquisition remains PEER — the later package import never overwrites it');
    }
    console.log('✓ Section F: FLAGSHIP (restart) — Bob receives Placement A from Alice over a live ANNOUNCE, restarts, still reports PEER acquisition, and later imports the identical placement from a package without losing it');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: the milestone's own P1/P2/P3 scenario
    // ---------------------------------------------------------------
    {
        // Alice creates and signs P1.
        const alice = makeIdentity('Alice');
        const p1 = signPlacement(alice, { publicationId: 'pub-g', contentHash: 'hash-g', storage: 'ipfs', locator: 'ipfs://CID-A' });

        // Bob's replica.
        const bobStorage = new InMemoryStorageProvider();
        const bobCatalog = new LocalPublicationSnapshotPlacementCatalog(bobStorage);
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobExchange = new PublicationSnapshotPlacementExchange(bobCatalog, bobVerifier);
        let bobKnowledge = new LocalPlacementKnowledgeStore(bobStorage);

        const bus = new StubPeerMessageBus();
        const alicePeer = stubPeer('conn-alice', PeerLifecycleState.AUTHENTICATED);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        let bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, bus, registry, { knowledgeStore: bobKnowledge });

        // Bob receives P1 through peer exchange: P1 -> PEER.
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: p1.toJSON() }, { connectedPeer: alicePeer });
        assert(bobKnowledge.get(p1.id).acquisition.kind === PlacementAcquisitionKind.PEER, '1. Bob records P1 -> PEER');

        // Bob then receives the SAME P1 inside a Blueprint Package. The
        // knowledge record must REMAIN P1 -> PEER.
        const bobExchangeForPackage = new PublicationSnapshotPlacementExchange(bobCatalog, bobVerifier);
        const packageImporter = new ImportPackageSnapshotPlacementsUseCase(bobExchangeForPackage, bobKnowledge);
        packageImporter.execute({ placements: [p1.toJSON()] });
        assert(bobKnowledge.get(p1.id).acquisition.kind === PlacementAcquisitionKind.PEER, '2. P1 remains PEER after the identical placement arrives again via package import');

        // Bob restarts. It remains P1 -> PEER.
        bobPeerExchange.dispose();
        const bobCatalogAfterRestart = new LocalPublicationSnapshotPlacementCatalog(bobStorage);
        bobKnowledge = new LocalPlacementKnowledgeStore(bobStorage);
        assert(bobKnowledge.get(p1.id).acquisition.kind === PlacementAcquisitionKind.PEER, '3. P1 remains PEER after Bob restarts');

        // Bob then creates another placement himself: P2 -> LOCAL.
        const bobIdentity = makeIdentity('Bob');
        const publicationG2 = { id: 'pub-g2', contentReference: { hash: 'hash-g2' } };
        const discoveryProvider = stubDiscoveryProvider({ [publicationG2.id]: publicationG2 });
        const createUseCase = new CreatePublicationSnapshotPlacementUseCase(discoveryProvider, bobIdentity, bobVerifier, bobCatalogAfterRestart, bobKnowledge);
        const p2 = createUseCase.execute(publicationG2.id, { storage: 'ipfs', locator: 'ipfs://CID-B' });
        assert(bobKnowledge.get(p2.id).acquisition.kind === PlacementAcquisitionKind.LOCAL, '4. P2 (Bob\'s own creation) records LOCAL');

        // Finally, a third placement arrives through package import:
        // P3 -> PACKAGE.
        const p3 = signPlacement(alice, { publicationId: 'pub-g3', contentHash: 'hash-g3', storage: 'local', locator: 'local://snapshot-3' });
        const bobExchangeAfterRestart = new PublicationSnapshotPlacementExchange(bobCatalogAfterRestart, bobVerifier);
        const finalPackageImporter = new ImportPackageSnapshotPlacementsUseCase(bobExchangeAfterRestart, bobKnowledge);
        finalPackageImporter.execute({ placements: [p3.toJSON()] });
        assert(bobKnowledge.get(p3.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '5. P3 records PACKAGE');

        // The resulting knowledge table matches exactly.
        assert(bobKnowledge.get(p1.id).acquisition.kind === PlacementAcquisitionKind.PEER
            && bobKnowledge.get(p2.id).acquisition.kind === PlacementAcquisitionKind.LOCAL
            && bobKnowledge.get(p3.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE,
            '6. the resulting knowledge table is exactly P1->PEER, P2->LOCAL, P3->PACKAGE');

        // The placement catalog itself remains completely independent of
        // acquisition provenance — every one of the three placements is
        // cataloged identically, with no acquisition field anywhere on
        // the placement or the catalog entry.
        assert(bobCatalogAfterRestart.has(p1.id) && bobCatalogAfterRestart.has(p2.id) && bobCatalogAfterRestart.has(p3.id),
            '7. every one of P1/P2/P3 is cataloged, regardless of how it was learned');
        for (const placement of [bobCatalogAfterRestart.get(p1.id), bobCatalogAfterRestart.get(p2.id), bobCatalogAfterRestart.get(p3.id)]) {
            const json = placement.toJSON();
            assert(!('acquisition' in json) && !('acquisitionKind' in json), '8. a cataloged placement carries no acquisition field of its own — the catalog and the knowledge store remain two separate shapes');
        }
    }
    console.log('✓ Section G: FLAGSHIP — Bob acquires P1 (peer), P2 (local), and P3 (package), producing the exact P1->PEER/P2->LOCAL/P3->PACKAGE knowledge table while the placement catalog itself stays completely independent of it');

    // ---------------------------------------------------------------
    // Section H — INVARIANT: acquisition never enters convergence
    // ---------------------------------------------------------------
    {
        // Two structurally identical sets of three placements for the
        // same publicationId — P1/P2 claim hash AAA, P3 claims hash BBB
        // — differing ONLY in which acquisition kind each placement was
        // recorded under. The convergence result must be byte-identical
        // regardless of the acquisition assignment, because
        // derivePublicationSnapshotPlacementConvergence() has no
        // parameter capable of receiving acquisition data in the first
        // place — see application/PublicationSnapshotPlacementConvergence.js's
        // own header.
        const publicationId = 'pub-convergence-h';
        const placementsA = [
            { id: 'ph-1', publicationId, contentHash: 'hash-AAA', storage: 'ipfs', locator: 'ipfs://CID-AAA-1' },
            { id: 'ph-2', publicationId, contentHash: 'hash-AAA', storage: 'local', locator: 'local://AAA' },
            { id: 'ph-3', publicationId, contentHash: 'hash-BBB', storage: 'ipfs', locator: 'ipfs://CID-BBB' }
        ];
        // The identical set of placements, structurally — only the
        // acquisition assignment (tracked entirely OUTSIDE this array,
        // in separate LocalPlacementKnowledgeStore instances below)
        // differs between the two scenarios.
        const placementsB = placementsA.map((p) => ({ ...p }));

        const storeScenario1 = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
        storeScenario1.record('ph-1', PlacementAcquisitionKind.PEER);
        storeScenario1.record('ph-2', PlacementAcquisitionKind.LOCAL);
        storeScenario1.record('ph-3', PlacementAcquisitionKind.PACKAGE);

        const storeScenario2 = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());
        storeScenario2.record('ph-1', PlacementAcquisitionKind.LOCAL);
        storeScenario2.record('ph-2', PlacementAcquisitionKind.PACKAGE);
        storeScenario2.record('ph-3', PlacementAcquisitionKind.PEER);

        // Confirm the two knowledge stores genuinely disagree about
        // acquisition — otherwise this test would prove nothing.
        assert(storeScenario1.get('ph-1').acquisition.kind !== storeScenario2.get('ph-1').acquisition.kind
            && storeScenario1.get('ph-2').acquisition.kind !== storeScenario2.get('ph-2').acquisition.kind
            && storeScenario1.get('ph-3').acquisition.kind !== storeScenario2.get('ph-3').acquisition.kind,
            '1. the two scenarios genuinely assign different acquisition kinds to every placement');

        const convergence1 = derivePublicationSnapshotPlacementConvergence({ publicationId, placements: placementsA });
        const convergence2 = derivePublicationSnapshotPlacementConvergence({ publicationId, placements: placementsB });

        assert(JSON.stringify(convergence1) === JSON.stringify(convergence2),
            '2. derivePublicationSnapshotPlacementConvergence() produces a byte-identical result regardless of acquisition assignment — acquisition never enters AGREEMENT/CONFLICT, storage diversity, locator diversity, or content groups');
        assert(convergence1.contentBindingConflict === true, '3. sanity check: this scenario genuinely has a content-binding conflict (AAA vs BBB)');
        assert(convergence1.placementCount === 3 && convergence1.storageTypes.length === 2 && convergence1.locatorCount === 3,
            '4. sanity check: known placements/storage diversity/locator diversity are computed as expected, unaffected by acquisition');
        assert(Object.keys(convergence1).every((key) => key !== 'acquisition' && key !== 'acquisitionKind' && key !== 'knowledge'),
            '5. the convergence result carries no acquisition/provenance field of its own — the two dimensions never merge into one shape');
    }
    console.log('✓ Section H: INVARIANT — acquisition provenance never enters derivePublicationSnapshotPlacementConvergence(); two oppositely-acquired but structurally identical placement sets converge identically');

    console.log('\nAll Snapshot Placement Provenance & Observation Boundary tests passed.');
}

run().catch((error) => {
    console.error('PlacementKnowledgeProvenance.test.js FAILED:', error);
    process.exitCode = 1;
});
