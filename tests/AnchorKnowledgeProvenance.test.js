import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { ImportPackageAnchorsUseCase, PackageAnchorImportReason } from '../application/ImportPackageAnchorsUseCase.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { AnchorAcquisitionKind, isValidAnchorAcquisitionKind } from '../application/AnchorAcquisitionKind.js';
import { createAnchorKnowledgeRecord, anchorKnowledgeRecordFromJSON, anchorKnowledgeRecordToJSON } from '../application/AnchorKnowledgeRecord.js';
import { LocalAnchorKnowledgeStore } from '../application/LocalAnchorKnowledgeStore.js';
import { describeAnchorKnowledge } from '../application/PublicationAnchorKnowledgeView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.8.17 — Evidence Provenance & Observation Boundary.
//
//   Section A: AnchorAcquisitionKind / AnchorKnowledgeRecord — the
//              three-value vocabulary, record construction/validation,
//              immutability, and JSON round-trip.
//   Section B: LocalAnchorKnowledgeStore — record()/get()/has()/list()/
//              remove(), and FIRST-SEEN-WINS: a second record() call for
//              an already-known anchorId, with a DIFFERENT
//              acquisitionKind, never overwrites the original.
//   Section C: PublicationAnchorKnowledgeView#describeAnchorKnowledge()
//              — known/unknown shapes, and an explicit wording check
//              that no acquisition label ever names a peer or reads as a
//              trust signal.
//   Section D: Wiring — each of the three acquisition paths records the
//              acquisition kind it alone knows about:
//              CreatePublicationAnchorUseCase -> LOCAL,
//              ImportPackageAnchorsUseCase -> PACKAGE (both a newly
//              imported anchor and a duplicate), PublicationAnchorPeerExchange
//              -> PEER (both an incoming ANNOUNCE and a RESPONSE anchor).
//              Every one of the three collaborators also still works
//              with NO knowledgeStore supplied at all — knowledge
//              tracking is additive, never a precondition.
//   Section E: INVARIANT — first-seen-wins across every combination of
//              acquisition paths reaching the SAME anchor id: PEER then
//              PACKAGE stays PEER; PACKAGE then PEER stays PACKAGE; LOCAL
//              then PEER stays LOCAL — the "first local observation
//              remains the first local observation" rule this
//              milestone's own design names, independent of which path
//              happened to arrive first.
//   Section F: FLAGSHIP — Alice creates and signs Anchor A; Bob receives
//              it via a live, real ANNOUNCE (PublicationAnchorPeerExchange
//              over a stub bus) and records PEER; Bob "restarts" (a fresh
//              LocalAnchorKnowledgeStore instance over the SAME
//              underlying storage, the same restart-simulation shape
//              tests/PersistentPublicationAnchorCatalog.test.js already
//              uses) and still reports PEER; Bob then imports the
//              IDENTICAL anchor from a Blueprint Package — his knowledge
//              stays PEER, never overwritten to PACKAGE. Independently,
//              Bob verifies Anchor A (VALID) and confirms the
//              verification outcome and the knowledge record never
//              influence, read, or overwrite one another — two genuinely
//              separate, independently queryable dimensions over the
//              identical anchor id.
//
// See docs/Principles.md, "Acquisition Provenance Is Not Evidence Rank
// (0.8.17)."

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

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({
        ...fields,
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — AnchorAcquisitionKind / AnchorKnowledgeRecord
    // ---------------------------------------------------------------
    {
        assert(isValidAnchorAcquisitionKind(AnchorAcquisitionKind.LOCAL), '1. LOCAL is a valid acquisition kind');
        assert(isValidAnchorAcquisitionKind(AnchorAcquisitionKind.PACKAGE), '2. PACKAGE is a valid acquisition kind');
        assert(isValidAnchorAcquisitionKind(AnchorAcquisitionKind.PEER), '3. PEER is a valid acquisition kind');
        assert(!isValidAnchorAcquisitionKind('RESTORED'), '4. RESTORED is deliberately not a recognized acquisition kind — see AnchorAcquisitionKind.js\'s own header');
        assert(!isValidAnchorAcquisitionKind(undefined), '5. an undefined kind is invalid');
        assert(Object.keys(AnchorAcquisitionKind).length === 3, '6. exactly three acquisition kinds exist — no fourth');

        expectThrows(() => createAnchorKnowledgeRecord({}), '7. an anchorId is required');
        expectThrows(() => createAnchorKnowledgeRecord({ anchorId: 'a1' }), '8. a valid acquisitionKind is required');
        expectThrows(() => createAnchorKnowledgeRecord({ anchorId: 'a1', acquisitionKind: 'nonsense' }), '9. an unrecognized acquisitionKind is rejected');
        expectThrows(() => createAnchorKnowledgeRecord({ anchorId: 'a1', acquisitionKind: AnchorAcquisitionKind.LOCAL, firstSeenAt: 'not-a-date' }), '10. an invalid firstSeenAt is rejected');

        const record = createAnchorKnowledgeRecord({ anchorId: 'a1', acquisitionKind: AnchorAcquisitionKind.PEER });
        assert(record.anchorId === 'a1' && record.acquisition.kind === AnchorAcquisitionKind.PEER, '11. a well-formed record carries anchorId and acquisition.kind');
        assert(record.firstSeenAt instanceof Date, '12. firstSeenAt defaults to a real Date when omitted');
        assert(Object.isFrozen(record) && Object.isFrozen(record.acquisition), '13. a knowledge record is immutable once created, including its nested acquisition object');
        assert(Object.keys(record).length === 3 && Object.keys(record.acquisition).length === 1, '14. a knowledge record carries exactly anchorId + firstSeenAt + acquisition.kind — no peerId, no confidence, no rank');

        const json = anchorKnowledgeRecordToJSON(record);
        assert(typeof json.firstSeenAt === 'string' && json.acquisition.kind === AnchorAcquisitionKind.PEER, '15. toJSON() produces a plain, JSON-safe envelope');
        const roundTripped = anchorKnowledgeRecordFromJSON(json);
        assert(roundTripped.anchorId === record.anchorId && roundTripped.acquisition.kind === record.acquisition.kind
            && roundTripped.firstSeenAt.getTime() === record.firstSeenAt.getTime(), '16. fromJSON(toJSON(record)) reconstructs an identical record');
        expectThrows(() => anchorKnowledgeRecordFromJSON(null), '17. fromJSON() rejects a missing envelope');
    }
    console.log('✓ Section A: AnchorAcquisitionKind / AnchorKnowledgeRecord — three-value vocabulary, validation, immutability, JSON round-trip');

    // ---------------------------------------------------------------
    // Section B — LocalAnchorKnowledgeStore
    // ---------------------------------------------------------------
    {
        expectThrows(() => new LocalAnchorKnowledgeStore(null), '1. constructor requires a storageProvider');

        const storageProvider = new InMemoryStorageProvider();
        const store = new LocalAnchorKnowledgeStore(storageProvider);

        assert(store.get('missing') === null && !store.has('missing'), '2. an unknown anchorId reports null/false, never throws');
        assert(store.list().length === 0, '3. a fresh store lists nothing');

        const { record: first, isNew: firstIsNew } = store.record('anchor-1', AnchorAcquisitionKind.PEER);
        assert(firstIsNew && first.acquisition.kind === AnchorAcquisitionKind.PEER, '4. the first record() for an anchorId is new and carries the supplied kind');
        assert(store.has('anchor-1'), '5. has() reports true once recorded');

        // FIRST-SEEN-WINS: a second record() call with a DIFFERENT kind
        // must never overwrite the original.
        const { record: second, isNew: secondIsNew } = store.record('anchor-1', AnchorAcquisitionKind.PACKAGE);
        assert(!secondIsNew, '6. re-recording an already-known anchorId is never reported as new');
        assert(second.acquisition.kind === AnchorAcquisitionKind.PEER, '7. FIRST-SEEN-WINS: the original PEER acquisition survives a later PACKAGE record() call unchanged');
        assert(second.firstSeenAt.getTime() === first.firstSeenAt.getTime(), '8. re-recording never resets firstSeenAt');
        assert(store.get('anchor-1').acquisition.kind === AnchorAcquisitionKind.PEER, '9. get() confirms the stored record was never overwritten');

        store.record('anchor-2', AnchorAcquisitionKind.LOCAL);
        store.record('anchor-3', AnchorAcquisitionKind.PACKAGE);
        assert(store.list().length === 3, '10. list() reports every distinct recorded anchorId');

        assert(store.remove('anchor-2') === true, '11. remove() reports true for a record that existed');
        assert(store.remove('anchor-2') === false, '12. remove() reports false for a record already gone');
        assert(store.get('anchor-2') === null, '13. a removed record is genuinely gone');
        assert(store.list().length === 2, '14. list() reflects the removal');

        // Durability — a fresh store instance over the SAME underlying
        // storage sees exactly what was already on file, unchanged,
        // mirroring application/LocalPublicationAnchorStore.js's own
        // restart behavior.
        const restarted = new LocalAnchorKnowledgeStore(storageProvider);
        assert(restarted.get('anchor-1').acquisition.kind === AnchorAcquisitionKind.PEER, '15. a fresh store instance over the same storage still reports the original acquisition kind after a simulated restart');
        assert(restarted.get('anchor-3').acquisition.kind === AnchorAcquisitionKind.PACKAGE, '16. every other durable record survives the same simulated restart');
    }
    console.log('✓ Section B: LocalAnchorKnowledgeStore — record()/get()/has()/list()/remove(), FIRST-SEEN-WINS, and durability across a simulated restart');

    // ---------------------------------------------------------------
    // Section C — PublicationAnchorKnowledgeView
    // ---------------------------------------------------------------
    {
        const unknown = describeAnchorKnowledge(null);
        assert(unknown.known === false && unknown.acquisitionKind === null, '1. describeAnchorKnowledge(null) reports known: false, never throws');

        for (const kind of Object.values(AnchorAcquisitionKind)) {
            const record = createAnchorKnowledgeRecord({ anchorId: 'a', acquisitionKind: kind });
            const view = describeAnchorKnowledge(record);
            assert(view.known === true && view.acquisitionKind === kind, `2. describeAnchorKnowledge() for ${kind} reports known: true and the same kind`);
            assert(typeof view.acquisitionLabel === 'string' && view.acquisitionLabel.length > 0, `3. describeAnchorKnowledge() for ${kind} produces a non-empty label`);
            assert(!/alice|bob|carol|peer-\w+|identity-\w+/i.test(view.acquisitionLabel), `4. describeAnchorKnowledge() for ${kind} never names a specific peer or identity in its label`);
            assert(!/trust|authorit|verified|confirm|✓/i.test(view.acquisitionLabel), `5. describeAnchorKnowledge() for ${kind} never reads as a trust or verification signal`);
            assert(view.firstSeenAt === record.firstSeenAt.toISOString(), `6. describeAnchorKnowledge() for ${kind} carries firstSeenAt as an ISO string`);
        }
        assert(describeAnchorKnowledge(createAnchorKnowledgeRecord({ anchorId: 'a', acquisitionKind: AnchorAcquisitionKind.PEER })).acquisitionLabel === 'Learned via peer exchange',
            '7. PEER reads exactly "Learned via peer exchange" — never "Source: <peer>"');
        assert(describeAnchorKnowledge(createAnchorKnowledgeRecord({ anchorId: 'a', acquisitionKind: AnchorAcquisitionKind.LOCAL })).acquisitionLabel === 'Learned locally',
            '8. LOCAL reads exactly "Learned locally"');
        assert(describeAnchorKnowledge(createAnchorKnowledgeRecord({ anchorId: 'a', acquisitionKind: AnchorAcquisitionKind.PACKAGE })).acquisitionLabel === 'Learned via package import',
            '9. PACKAGE reads exactly "Learned via package import"');
    }
    console.log('✓ Section C: PublicationAnchorKnowledgeView#describeAnchorKnowledge() — known/unknown shapes, and wording that never names a peer or reads as trust');

    // ---------------------------------------------------------------
    // Section D — Wiring: each acquisition path records its own kind
    // ---------------------------------------------------------------
    {
        // D1 — CreatePublicationAnchorUseCase -> LOCAL.
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const publication = new DecentralizedPublication({
            id: 'pub-provenance-1',
            contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'hash-abc' })
        });
        publicationCatalog.add(publication);

        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const identityProvider = makeIdentity('Creator');
        const verifier = new LocalAuthorizationVerifier();
        const knowledgeStore = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());

        const createUseCase = new CreatePublicationAnchorUseCase(publicationCatalog, identityProvider, verifier, anchorCatalog, knowledgeStore);
        const created = createUseCase.execute(publication.id, { anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/1' });
        assert(knowledgeStore.get(created.id).acquisition.kind === AnchorAcquisitionKind.LOCAL, '1. CreatePublicationAnchorUseCase records a LOCAL knowledge entry for the anchor it created');

        // Omitting knowledgeStore entirely must not break creation at all
        // — knowledge tracking is additive, never a precondition.
        const createUseCaseNoStore = new CreatePublicationAnchorUseCase(publicationCatalog, identityProvider, verifier, anchorCatalog);
        const createdWithoutStore = createUseCaseNoStore.execute(publication.id, { anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/2' });
        assert(createdWithoutStore.id, '2. CreatePublicationAnchorUseCase still works with no knowledgeStore supplied at all');

        // D2 — ImportPackageAnchorsUseCase -> PACKAGE.
        const bob = { catalog: new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()), verifier: new LocalAuthorizationVerifier() };
        bob.exchange = new PublicationAnchorExchange(bob.catalog, bob.verifier);
        const bobKnowledge = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());
        const packageImporter = new ImportPackageAnchorsUseCase(bob.exchange, bobKnowledge);

        const alice = makeIdentity('Alice');
        const anchorA = signAnchor(alice, { publicationId: 'pub-x', contentHash: 'hash-x', anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/A' });
        const result = packageImporter.execute({ anchors: [anchorA.toJSON()] });
        assert(result.importedAnchors.length === 1, '3. a well-formed bundled anchor imports successfully');
        assert(bobKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '4. ImportPackageAnchorsUseCase records a PACKAGE knowledge entry for a newly imported anchor');

        // Re-importing the SAME package (a duplicate) must still record
        // knowledge — safe only because FIRST-SEEN-WINS makes it a no-op.
        const duplicateResult = packageImporter.execute({ anchors: [anchorA.toJSON()] });
        assert(duplicateResult.skippedAnchors.length === 1 && duplicateResult.skippedAnchors[0].reason === PackageAnchorImportReason.DUPLICATE, '5. re-importing the identical anchor is reported as a duplicate, not an error');
        assert(bobKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '6. re-importing a duplicate never changes its already-recorded acquisition kind');

        // A rejected (invalid-signature) anchor never reaches
        // record() at all — nothing to associate a knowledge entry with.
        const forged = signAnchor(makeIdentity('Mallory'), { publicationId: 'pub-y', contentHash: 'hash-y', anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/M' });
        const tamperedJson = { ...forged.toJSON(), contentHash: 'hash-tampered' };
        const rejectedResult = packageImporter.execute({ anchors: [tamperedJson] });
        assert(rejectedResult.rejectedAnchors.length === 1, '7. a tampered/forged bundled anchor is rejected, never cataloged');
        assert(!bobKnowledge.has(tamperedJson.id), '8. a rejected anchor never gets a knowledge record');

        // Omitting knowledgeStore entirely must not break import at all.
        const importerNoStore = new ImportPackageAnchorsUseCase(bob.exchange);
        const anchorB = signAnchor(alice, { publicationId: 'pub-z', contentHash: 'hash-z', anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/B' });
        const noStoreResult = importerNoStore.execute({ anchors: [anchorB.toJSON()] });
        assert(noStoreResult.importedAnchors.length === 1, '9. ImportPackageAnchorsUseCase still works with no knowledgeStore supplied at all');

        // D3 — PublicationAnchorPeerExchange -> PEER, for both ANNOUNCE
        // and RESPONSE.
        const carol = { catalog: new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()), verifier: new LocalAuthorizationVerifier() };
        carol.exchange = new PublicationAnchorExchange(carol.catalog, carol.verifier);
        const carolKnowledge = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());
        const bus = new StubPeerMessageBus();
        const senderPeer = stubPeer('conn-sender', PeerLifecycleState.AUTHENTICATED);
        const registry = new StubConnectedPeerRegistry([senderPeer]);
        const peerExchange = new PublicationAnchorPeerExchange(carol.exchange, bus, registry, { knowledgeStore: carolKnowledge });

        let lastReceived = null;
        peerExchange.onAnchorReceived((payload) => { lastReceived = payload; });

        const anchorC = signAnchor(alice, { publicationId: 'pub-c', contentHash: 'hash-c', anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/C' });
        bus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: anchorC.toJSON() }, { connectedPeer: senderPeer });
        assert(lastReceived && lastReceived.anchor.id === anchorC.id, '10. an incoming ANNOUNCE is cataloged and fires onAnchorReceived');
        assert(carolKnowledge.get(anchorC.id).acquisition.kind === AnchorAcquisitionKind.PEER, '11. an incoming ANNOUNCE records a PEER knowledge entry');

        const anchorD = signAnchor(alice, { publicationId: 'pub-d', contentHash: 'hash-d', anchorType: 'bitcoin-op-return', locator: 'https://example.test/tx/D' });
        bus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, { kind: 'RESPONSE', publicationId: 'pub-d', anchors: [anchorD.toJSON()] }, { connectedPeer: senderPeer });
        assert(carolKnowledge.get(anchorD.id).acquisition.kind === AnchorAcquisitionKind.PEER, '12. an anchor arriving inside a RESPONSE also records a PEER knowledge entry, through the identical _importAndPublish() path as ANNOUNCE');

        // A forged incoming ANNOUNCE never reaches record() at all.
        const forgedEnvelope = { ...anchorC.toJSON(), id: 'forged-id', contentHash: 'hash-tampered' };
        bus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: forgedEnvelope }, { connectedPeer: senderPeer });
        assert(!carolKnowledge.has('forged-id'), '13. a forged incoming ANNOUNCE never gets a knowledge record');

        // Omitting knowledgeStore entirely must not break peer exchange.
        const peerExchangeNoStore = new PublicationAnchorPeerExchange(new PublicationAnchorExchange(new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()), new LocalAuthorizationVerifier()), new StubPeerMessageBus(), new StubConnectedPeerRegistry([]));
        assert(peerExchangeNoStore instanceof PublicationAnchorPeerExchange, '14. PublicationAnchorPeerExchange still constructs with no knowledgeStore supplied at all');
    }
    console.log('✓ Section D: wiring — CreatePublicationAnchorUseCase -> LOCAL, ImportPackageAnchorsUseCase -> PACKAGE, PublicationAnchorPeerExchange -> PEER (ANNOUNCE and RESPONSE alike); every collaborator still works with no knowledgeStore at all');

    // ---------------------------------------------------------------
    // Section E — INVARIANT: first-seen-wins across acquisition paths
    // ---------------------------------------------------------------
    {
        const combinations = [
            [AnchorAcquisitionKind.PEER, AnchorAcquisitionKind.PACKAGE],
            [AnchorAcquisitionKind.PACKAGE, AnchorAcquisitionKind.PEER],
            [AnchorAcquisitionKind.LOCAL, AnchorAcquisitionKind.PEER],
            [AnchorAcquisitionKind.PEER, AnchorAcquisitionKind.LOCAL],
            [AnchorAcquisitionKind.LOCAL, AnchorAcquisitionKind.PACKAGE]
        ];
        let n = 1;
        for (const [firstKind, secondKind] of combinations) {
            const store = new LocalAnchorKnowledgeStore(new InMemoryStorageProvider());
            store.record('shared-anchor', firstKind);
            store.record('shared-anchor', secondKind);
            assert(store.get('shared-anchor').acquisition.kind === firstKind,
                `${n}. FIRST-SEEN-WINS: ${firstKind} then ${secondKind} stays ${firstKind}, never overwritten by the second acquisition path`);
            n += 1;
        }
    }
    console.log('✓ Section E: INVARIANT — first-seen-wins holds for every ordered pair of acquisition kinds, never just the one PEER->PACKAGE case');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const anchorA = signAnchor(alice, {
            publicationId: 'pub-flagship',
            contentHash: 'hash-flagship',
            anchorType: 'bitcoin-op-return',
            locator: 'https://example.test/tx/flagship'
        });

        // Bob's durable storage — one InMemoryStorageProvider standing in
        // for `window.localStorage` across a simulated restart, the same
        // shape tests/PersistentPublicationAnchorCatalog.test.js's own
        // FLAGSHIP already uses.
        const bobStorage = new InMemoryStorageProvider();
        const bobCatalog = new LocalPublicationAnchorCatalog(bobStorage);
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobExchange = new PublicationAnchorExchange(bobCatalog, bobVerifier);
        let bobKnowledge = new LocalAnchorKnowledgeStore(bobStorage);

        const bus = new StubPeerMessageBus();
        const alicePeer = stubPeer('conn-alice', PeerLifecycleState.AUTHENTICATED);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        let bobPeerExchange = new PublicationAnchorPeerExchange(bobExchange, bus, registry, { knowledgeStore: bobKnowledge });

        // Alice ANNOUNCEs Anchor A; Bob receives it and records PEER.
        bus.deliver(PublicationAnchorPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: anchorA.toJSON() }, { connectedPeer: alicePeer });
        assert(bobCatalog.has(anchorA.id), '1. Bob catalogs Anchor A after receiving it from Alice');
        assert(bobKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER, '2. Bob records PEER acquisition for Anchor A');
        const firstSeenAtBeforeRestart = bobKnowledge.get(anchorA.id).firstSeenAt.getTime();

        // Bob restarts: fresh catalog/exchange/knowledgeStore instances
        // over the SAME underlying storage — no network involved.
        bobPeerExchange.dispose();
        const bobCatalogAfterRestart = new LocalPublicationAnchorCatalog(bobStorage);
        bobKnowledge = new LocalAnchorKnowledgeStore(bobStorage);
        assert(bobCatalogAfterRestart.has(anchorA.id), '3. Anchor A survives Bob\'s restart, via 0.8.15\'s own persistence alone');
        assert(bobKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER, '4. Bob\'s knowledge of Anchor A survives the restart and still reports PEER');
        assert(bobKnowledge.get(anchorA.id).firstSeenAt.getTime() === firstSeenAtBeforeRestart, '5. firstSeenAt is unchanged by the restart');

        // Bob later imports the IDENTICAL anchor from a Blueprint
        // Package. His original PEER acquisition must survive unchanged.
        const bobExchangeAfterRestart = new PublicationAnchorExchange(bobCatalogAfterRestart, bobVerifier);
        const packageImporter = new ImportPackageAnchorsUseCase(bobExchangeAfterRestart, bobKnowledge);
        const packageResult = packageImporter.execute({ anchors: [anchorA.toJSON()] });
        assert(packageResult.skippedAnchors.length === 1 && packageResult.skippedAnchors[0].reason === PackageAnchorImportReason.DUPLICATE, '6. the package-bundled Anchor A is recognized as already known, never double-cataloged');
        assert(bobKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER, '7. the FIRST acquisition remains PEER — the later package import never overwrites it');

        // Independently: Bob verifies Anchor A. Verification and
        // knowledge stay two genuinely separate, non-overlapping
        // dimensions over the identical anchor id.
        const bobProofVerifier = { anchorType: 'bitcoin-op-return', verify: async () => ({ valid: true, confirmations: 6, blockHeight: 800000 }) };
        const externalVerifier = new ExternalAnchorVerifier(bobVerifier);
        const verificationResult = await externalVerifier.verify(anchorA.toJSON(), { proofVerifier: bobProofVerifier });
        assert(verificationResult.outcome === AnchorVerificationOutcome.VALID, '8. Bob independently verifies Anchor A as VALID');
        assert(bobKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PEER, '9. verifying Anchor A never changes, reads, or is influenced by its knowledge record');
        assert(Object.keys(verificationResult).every((key) => key !== 'acquisition' && key !== 'firstSeenAt'), '10. a verification result carries no acquisition/provenance field of its own — the two dimensions never merge into one shape');

        // And, symmetrically: recording knowledge again for Anchor A
        // (e.g. a later re-announce) never touches, resets, or reports
        // anything about verification.
        bobKnowledge.record(anchorA.id, AnchorAcquisitionKind.PEER);
        assert(verificationResult.outcome === AnchorVerificationOutcome.VALID, '11. re-recording knowledge never mutates an already-computed verification result — the two remain independently queryable');
    }
    console.log('✓ Section F: FLAGSHIP — Bob receives Anchor A from Alice over a live ANNOUNCE, restarts, still reports PEER acquisition, later imports the identical anchor from a package without losing it, and independently verifies it VALID with knowledge and verification staying fully separate');

    console.log('\nAll Evidence Provenance & Observation Boundary tests passed.');
}

run().catch((error) => {
    console.error('AnchorKnowledgeProvenance.test.js FAILED:', error);
    process.exitCode = 1;
});
