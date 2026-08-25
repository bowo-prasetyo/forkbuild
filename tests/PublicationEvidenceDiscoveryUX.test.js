import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { LocalPublicationAnchorStore } from '../application/LocalPublicationAnchorStore.js';
import { RestorePublicationAnchorCatalogUseCase } from '../application/RestorePublicationAnchorCatalogUseCase.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PublicationAnchorDiscoveryCoordinator } from '../application/PublicationAnchorDiscoveryCoordinator.js';
import { PublicationEvidenceDiscoveryCoordinator } from '../application/PublicationEvidenceDiscoveryCoordinator.js';
import { describeEvidenceDiscoveryAttempt, describeDiscoveryButtonLabel } from '../application/PublicationEvidenceDiscoveryView.js';
import { PublicationEvidenceDiscoveryUiState } from '../application/PublicationEvidenceDiscoveryUiState.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import { deriveAnchorVerificationLifecycle } from '../application/PublicationAnchorVerificationLifecycleView.js';
import { AnchorVerificationLifecycleState } from '../application/AnchorVerificationLifecycleState.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
//
//   Section A: PublicationEvidenceDiscoveryCoordinator — constructor
//              requirements, peer selection is "every currently
//              AUTHENTICATED peer, in registry order" (never a ranking,
//              never a "best" peer), delegates to application/
//              PublicationAnchorDiscoveryCoordinator.js unchanged, and
//              newlyImportedCount/alreadyKnownCount are a plain tally of
//              that call's own isNew flags.
//   Section B: describeEvidenceDiscoveryAttempt()/
//              describeDiscoveryButtonLabel() — the five UI states,
//              worded so NO_NEW_EVIDENCE is never confused with "no
//              evidence exists" and UNAVAILABLE is never confused with
//              either.
//   Section C: INVARIANT — discovery never verifies. Three anchors with
//              different eventual proof outcomes (valid, unavailable,
//              invalid) are all discovered identically; a call-counting
//              spy proves ExternalAnchorVerifier is consulted zero times
//              by the discovery path.
//   Section D: INVARIANT — duplicate discovery. Discovering twice reports
//              0 new the second time, never grows the catalog, and never
//              resets receivedAt.
//   Section E: INVARIANT — verification history does not synchronize.
//              Alice's own local VALID observation for an anchor never
//              travels to Bob when Bob discovers that same anchor from
//              her; Bob's own session starts that anchor at NOT_VERIFIED,
//              exactly as if he had cataloged it any other way.
//   Section F: FLAGSHIP — Bob receives Anchor A directly from Alice,
//              restarts (A survives, per 0.8.15), discovers Anchor B from
//              Carol (B arrives), restarts again (A+B both survive) — the
//              persistence/discovery invariant this milestone's own
//              design names: no network synchronization is required
//              merely to recover already-known evidence.
//
// See docs/Principles.md, "Discovery Is Not Verification, And 'No New
// Evidence' Is Not 'No Evidence' (0.8.16)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

// A minimal stand-in for application/ConnectedPeerRegistry.js — exposes
// only list(), the one method PublicationEvidenceDiscoveryCoordinator
// actually calls.
class FakeRegistry {
    constructor(peers) { this._peers = peers; }
    list() { return this._peers; }
}

function fakePeer(id, lifecycleState) {
    return { id, getLifecycleState: () => lifecycleState };
}

// Mirrors tests/PublicationAnchorDiscoveryCoordinator.test.js's own
// RecordingAnchorPeerExchange exactly — a stand-in for application/
// PublicationAnchorPeerExchange.js whose requestAnchors() only ever
// "answers" (after a short delay) for a peer with a configured response.
class RecordingAnchorPeerExchange {
    constructor(responsesByPeerId = {}) {
        this.requested = [];
        this._listeners = new Set();
        this._responses = responsesByPeerId;
    }
    requestAnchors(peer, publicationId) {
        this.requested.push({ peer, publicationId });
        const results = this._responses[peer.id];
        if (results) {
            setTimeout(() => {
                for (const result of results) {
                    for (const callback of this._listeners) callback(result);
                }
            }, 5);
        }
    }
    onAnchorReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
}

function fakeAnchor(id, publicationId) {
    return { id, publicationId, toJSON() { return { id, publicationId }; } };
}

// A pair of live, authenticated replicas over application/
// PeerMessageBus.js/peer/LocalPeerConnectionProvider.js — sets up
// everything Section C-F need: a real catalog, exchange, peer exchange,
// anchor discovery coordinator, and the new evidence discovery
// coordinator this milestone adds, wired to `connect.registry` exactly
// as ui/main.js wires `peerSessionManager.registry`.
function makeReplica(label, endpoint, network, storageProvider = new InMemoryStorageProvider()) {
    const identityProvider = makeIdentity(label);
    const catalog = new LocalPublicationAnchorCatalog(storageProvider);
    const authVerifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationAnchorExchange(catalog, authVerifier);
    const transport = new LocalPeerConnectionProvider(endpoint, network);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider });
    const stopListening = connect.listen();
    const bus = new PeerMessageBus();
    const peerExchange = new PublicationAnchorPeerExchange(exchange, bus, connect.registry);
    const anchorDiscoveryCoordinator = new PublicationAnchorDiscoveryCoordinator(peerExchange);
    const evidenceDiscoveryCoordinator = new PublicationEvidenceDiscoveryCoordinator(anchorDiscoveryCoordinator, connect.registry);
    return { identityProvider, storageProvider, catalog, authVerifier, exchange, transport, connect, stopListening, bus, peerExchange, anchorDiscoveryCoordinator, evidenceDiscoveryCoordinator };
}

function disposeReplica(replica) {
    replica.peerExchange.dispose();
    replica.stopListening();
    replica.transport.dispose();
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PublicationEvidenceDiscoveryCoordinator
    // ---------------------------------------------------------------
    {
        const stubDiscoveryCoordinator = { discoverFromPeers: async () => ({ attemptedPeers: [], discovered: [] }) };
        const stubRegistry = new FakeRegistry([]);

        expectThrows(() => new PublicationEvidenceDiscoveryCoordinator(null, stubRegistry),
            '1. constructor requires an anchor discovery coordinator');
        expectThrows(() => new PublicationEvidenceDiscoveryCoordinator({}, stubRegistry),
            '2. constructor requires a discoveryFromPeers()-shaped coordinator');
        expectThrows(() => new PublicationEvidenceDiscoveryCoordinator(stubDiscoveryCoordinator, null),
            '3. constructor requires a connected peer registry');
        expectThrows(() => new PublicationEvidenceDiscoveryCoordinator(stubDiscoveryCoordinator, {}),
            '4. constructor requires a registry with list()');

        const coordinator = new PublicationEvidenceDiscoveryCoordinator(stubDiscoveryCoordinator, stubRegistry);
        await expectRejects(coordinator.discover(null), '5. discover() rejects a missing publicationId');

        // Peer selection: every AUTHENTICATED peer, in registry order —
        // never a CONNECTING/CONNECTED-but-not-yet-authenticated one, and
        // never reordered.
        const authA = fakePeer('auth-a', PeerLifecycleState.AUTHENTICATED);
        const notYet = fakePeer('connecting', PeerLifecycleState.CONNECTING);
        const authB = fakePeer('auth-b', PeerLifecycleState.AUTHENTICATED);
        const recordingExchange = new RecordingAnchorPeerExchange({
            'auth-a': [{ anchor: fakeAnchor('anchor-a', 'pub-select'), isNew: true }],
            'auth-b': [{ anchor: fakeAnchor('anchor-b', 'pub-select'), isNew: false }]
        });
        const realDiscoveryCoordinator = new PublicationAnchorDiscoveryCoordinator(recordingExchange);
        const registry = new FakeRegistry([authA, notYet, authB]);
        const selectingCoordinator = new PublicationEvidenceDiscoveryCoordinator(realDiscoveryCoordinator, registry);

        const result = await selectingCoordinator.discover('pub-select', { timeoutMs: 40 });
        assert(recordingExchange.requested.length === 2, '6. only the two AUTHENTICATED peers were ever asked');
        assert(recordingExchange.requested[0].peer === authA && recordingExchange.requested[1].peer === authB,
            '7. asked in registry order, the CONNECTING peer silently skipped, never reordered');
        assert(result.publicationId === 'pub-select', '8. the result echoes the requested publicationId');
        assert(result.attemptedPeers.length === 2 && result.attemptedPeers[0] === authA && result.attemptedPeers[1] === authB,
            '9. attemptedPeers is passed straight through from the underlying coordinator');
        assert(result.discovered.length === 2, '10. discovered is passed straight through, unfiltered, unranked');

        // newlyImportedCount/alreadyKnownCount are a plain tally of
        // isNew, nothing more — never a ranking, never a "best" anchor.
        assert(result.newlyImportedCount === 1, '11. newlyImportedCount tallies exactly the isNew:true entries');
        assert(result.alreadyKnownCount === 1, '12. alreadyKnownCount tallies exactly the isNew:false entries');

        // Zero authenticated peers resolves cleanly — never an error,
        // the identical "zero connected peers is never an error"
        // restraint every sibling peer-facing class already applies.
        const emptyRegistry = new FakeRegistry([fakePeer('only-connecting', PeerLifecycleState.CONNECTING)]);
        const emptyCoordinator = new PublicationEvidenceDiscoveryCoordinator(realDiscoveryCoordinator, emptyRegistry);
        const emptyResult = await emptyCoordinator.discover('pub-select', { timeoutMs: 20 });
        assert(emptyResult.attemptedPeers.length === 0, '13. no AUTHENTICATED peer -> attemptedPeers is empty, no throw');
        assert(emptyResult.newlyImportedCount === 0 && emptyResult.alreadyKnownCount === 0,
            '14. no AUTHENTICATED peer -> both tallies are zero');
    }
    console.log('✓ Section A: PublicationEvidenceDiscoveryCoordinator picks every currently AUTHENTICATED peer in registry order, delegates unchanged to PublicationAnchorDiscoveryCoordinator, and tallies newly-imported/already-known from isNew alone');

    // ---------------------------------------------------------------
    // Section B — UI state derivation
    // ---------------------------------------------------------------
    {
        const idle = describeEvidenceDiscoveryAttempt(null);
        assert(idle.state === PublicationEvidenceDiscoveryUiState.IDLE, '1. no attempt -> IDLE');
        assert(idle.message === null, '2. IDLE carries no message');

        const discovering = describeEvidenceDiscoveryAttempt({ discovering: true });
        assert(discovering.state === PublicationEvidenceDiscoveryUiState.DISCOVERING, '3. in flight -> DISCOVERING');

        const errored = describeEvidenceDiscoveryAttempt({ discovering: false, error: 'boom' });
        assert(errored.state === PublicationEvidenceDiscoveryUiState.UNAVAILABLE, '4. a thrown error -> UNAVAILABLE');
        assert(errored.message.toLowerCase().includes('could not complete'), '5. UNAVAILABLE (error) is worded as an operational failure');

        const noPeers = describeEvidenceDiscoveryAttempt({
            discovering: false, result: { attemptedPeers: [], discovered: [], newlyImportedCount: 0, alreadyKnownCount: 0 }
        });
        assert(noPeers.state === PublicationEvidenceDiscoveryUiState.UNAVAILABLE, '6. zero attempted peers -> UNAVAILABLE');
        assert(!noPeers.message.toLowerCase().includes('no evidence'), '7. UNAVAILABLE (no peers) never says "no evidence"');

        const discovered = describeEvidenceDiscoveryAttempt({
            discovering: false,
            result: { attemptedPeers: [{ id: 'p' }], discovered: [{ isNew: true }], newlyImportedCount: 1, alreadyKnownCount: 0 }
        });
        assert(discovered.state === PublicationEvidenceDiscoveryUiState.DISCOVERED, '8. at least one new anchor -> DISCOVERED');
        assert(discovered.message.includes('1 new evidence claim'), '9. DISCOVERED reports the exact count');

        const noNew = describeEvidenceDiscoveryAttempt({
            discovering: false,
            result: { attemptedPeers: [{ id: 'p' }], discovered: [{ isNew: false }], newlyImportedCount: 0, alreadyKnownCount: 1 }
        });
        assert(noNew.state === PublicationEvidenceDiscoveryUiState.NO_NEW_EVIDENCE, '10. peers answered, nothing new -> NO_NEW_EVIDENCE');
        // THE CENTRAL WORDING RULE: "no new evidence claims discovered"
        // is never conflated with "no evidence exists."
        const noNewWords = noNew.message.toLowerCase();
        assert(noNewWords.includes('no new evidence'), '11. NO_NEW_EVIDENCE explicitly says "no NEW evidence"');
        assert(!noNewWords.includes('no evidence exists') && !noNewWords.includes('does not exist'),
            '12. NO_NEW_EVIDENCE never claims evidence does not exist — an authority-like conclusion this milestone forbids');
        assert(noNew.state !== errored.state && noNew.state !== noPeers.state,
            '13. NO_NEW_EVIDENCE and UNAVAILABLE are structurally distinct states, never merged');

        assert(describeDiscoveryButtonLabel({}) === 'Discover from Peers', '14. default button label');
        assert(describeDiscoveryButtonLabel({ discovering: true }) === 'Asking Peers…', '15. in-flight button label');
        assert(describeDiscoveryButtonLabel({ hasDiscovered: true }) === 'Discover Again', '16. after any completed attempt, the label invites another one');
    }
    console.log('✓ Section B: describeEvidenceDiscoveryAttempt() derives five structurally distinct states, and NO_NEW_EVIDENCE is worded so it can never be mistaken for "no evidence exists"');

    // ---------------------------------------------------------------
    // Section C — INVARIANT: discovery never verifies
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeReplica('Alice-C', 'alice-noverify', network);
        const bob = makeReplica('Bob-C', 'bob-noverify', network);
        const bobToAlice = bob.connect.connect({ candidateEndpoint: 'alice-noverify' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');

        // Three anchors whose EVENTUAL proof outcomes would differ wildly
        // (valid/unavailable/invalid) if anyone ever asked — discovery
        // never asks, so all three are cataloged identically as CLAIMS.
        const validAnchor = signAnchor(alice.identityProvider, {
            publicationId: 'pub-noverify', contentHash: 'hash-noverify', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/valid', proof: { txid: 'valid' }
        });
        const unavailableAnchor = signAnchor(alice.identityProvider, {
            publicationId: 'pub-noverify', contentHash: 'hash-noverify', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/unavailable', proof: { txid: 'unavailable' }
        });
        const invalidAnchor = signAnchor(alice.identityProvider, {
            publicationId: 'pub-noverify', contentHash: 'hash-noverify', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/invalid', proof: { txid: 'invalid' }
        });
        for (const anchor of [validAnchor, unavailableAnchor, invalidAnchor]) {
            alice.catalog.add(anchor);
        }

        let verifyCalls = 0;
        const originalVerify = ExternalAnchorVerifier.prototype.verify;
        ExternalAnchorVerifier.prototype.verify = function spy(...args) {
            verifyCalls += 1;
            return originalVerify.apply(this, args);
        };
        let result;
        try {
            result = await bob.evidenceDiscoveryCoordinator.discover('pub-noverify', { timeoutMs: 200 });
        } finally {
            ExternalAnchorVerifier.prototype.verify = originalVerify;
        }

        assert(verifyCalls === 0, '2. INVARIANT: discover() never once calls ExternalAnchorVerifier, even for bitcoin-op-return anchors with real-looking proofs');
        assert(result.newlyImportedCount === 3, '3. all three anchors are discovered as CLAIMS, regardless of what their proof would eventually show');
        assert(bob.catalog.has(validAnchor.id) && bob.catalog.has(unavailableAnchor.id) && bob.catalog.has(invalidAnchor.id),
            '4. the resulting catalog contains all three validly-signed claims regardless of external proof state');

        disposeReplica(alice);
        disposeReplica(bob);
    }
    console.log('✓ Section C: INVARIANT — discovery never calls ExternalAnchorVerifier; the resulting catalog holds every validly signed claim regardless of what its external proof would show');

    // ---------------------------------------------------------------
    // Section D — INVARIANT: duplicate discovery
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeReplica('Alice-D', 'alice-dup', network);
        const bob = makeReplica('Bob-D', 'bob-dup', network);
        const bobToAlice = bob.connect.connect({ candidateEndpoint: 'alice-dup' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');

        const anchor = signAnchor(alice.identityProvider, {
            publicationId: 'pub-dup', contentHash: 'hash-dup', anchorType: 'local-test', locator: 'local://ledger/dup'
        });
        alice.catalog.add(anchor);

        const first = await bob.evidenceDiscoveryCoordinator.discover('pub-dup', { timeoutMs: 200 });
        assert(first.newlyImportedCount === 1 && first.alreadyKnownCount === 0, '2. first discovery: exactly one new anchor');
        const receivedAtAfterFirst = bob.catalog.getReceivedAt(anchor.id);
        assert(bob.catalog.findByPublicationId('pub-dup').length === 1, '3. catalog holds exactly one entry after the first discovery');

        await wait(10);
        const second = await bob.evidenceDiscoveryCoordinator.discover('pub-dup', { timeoutMs: 200 });
        assert(second.newlyImportedCount === 0 && second.alreadyKnownCount === 1, '4. second discovery: zero new, one confirmed already-known');
        assert(bob.catalog.findByPublicationId('pub-dup').length === 1, '5. discovering again never creates a second copy');
        assert(bob.catalog.getReceivedAt(anchor.id) === receivedAtAfterFirst, '6. re-discovery never resets receivedAt — same anchor id, same persisted claim, same receivedAt');

        disposeReplica(alice);
        disposeReplica(bob);
    }
    console.log('✓ Section D: INVARIANT — discovering the same anchor twice never grows the catalog and never resets receivedAt, regardless of how many times a peer announces it');

    // ---------------------------------------------------------------
    // Section E — INVARIANT: verification history does not synchronize
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeReplica('Alice-E', 'alice-noshare', network);
        const bob = makeReplica('Bob-E', 'bob-noshare', network);
        const bobToAlice = bob.connect.connect({ candidateEndpoint: 'alice-noshare' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');

        const anchor = signAnchor(alice.identityProvider, {
            publicationId: 'pub-noshare', contentHash: 'hash-noshare', anchorType: 'local-test', locator: 'local://ledger/noshare'
        });
        alice.catalog.add(anchor);

        // Alice, independently, verified this SAME anchor VALID in her
        // own session — purely local, ephemeral state application/
        // PublicationAnchorVerificationObservation.js's own header
        // already says is "NEVER PERSISTED, NEVER SHARED."
        const aliceHistory = [createVerificationObservation({ anchorId: anchor.id, outcome: AnchorVerificationOutcome.VALID })];
        assert(deriveAnchorVerificationLifecycle(aliceHistory).state === AnchorVerificationLifecycleState.VERIFIED,
            '2. setup: Alice\'s own session reads this anchor as VERIFIED');

        const result = await bob.evidenceDiscoveryCoordinator.discover('pub-noshare', { timeoutMs: 200 });
        assert(result.newlyImportedCount === 1, '3. Bob discovers Alice\'s anchor');
        const bobAnchor = bob.catalog.get(anchor.id);

        // Bob's own, brand-new session verification history — nothing
        // discovery ever populates.
        const bobHistory = [];
        assert(deriveAnchorVerificationLifecycle(bobHistory).state === AnchorVerificationLifecycleState.NOT_VERIFIED,
            '4. Bob\'s own session reads the discovered anchor as NOT_VERIFIED — Alice\'s VALID observation never arrived');

        // The wire envelope/catalog record itself carries no trace of
        // ANY verification outcome — never a field to lose in the first
        // place, exactly application/
        // PublicationAnchorVerificationObservation.js's own 0.8.12
        // restraint, now proven across a peer boundary rather than
        // merely a restart.
        const bobAnchorJson = bobAnchor.toJSON();
        assert(bobAnchorJson.verified === undefined && bobAnchorJson.verificationOutcome === undefined,
            '5. the discovered anchor record itself never carries a verification flag or outcome');
        assert(JSON.stringify(bobAnchorJson) === JSON.stringify(anchor.toJSON()),
            '6. Bob\'s discovered copy is byte-identical to Alice\'s original — nothing about her own verification was appended');

        disposeReplica(alice);
        disposeReplica(bob);
    }
    console.log('✓ Section E: INVARIANT — Alice\'s own VALID observation for an anchor never travels to Bob when he discovers that same anchor from her; only the PublicationAnchor claim propagates, never any VerificationObservation');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: persistence + discovery coexist
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeReplica('Alice-F', 'alice-flagship', network);
        const carol = makeReplica('Carol-F', 'carol-flagship', network);

        const anchorA = signAnchor(alice.identityProvider, {
            publicationId: 'pub-flagship-sync', contentHash: 'hash-flagship-sync', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/flagship-a'
        });
        const anchorB = signAnchor(alice.identityProvider, {
            publicationId: 'pub-flagship-sync', contentHash: 'hash-flagship-sync', anchorType: 'other-ledger', locator: 'other://chain/flagship-b'
        });
        alice.catalog.add(anchorA);
        alice.catalog.add(anchorB);
        assert(alice.catalog.findByPublicationId('pub-flagship-sync').length === 2, '1. setup: Alice knows both A and B');

        // Carol independently already knows B (e.g. from some earlier
        // exchange this test does not model) — Alice will never be asked
        // for it below, so if it later appears in Bob's catalog, it can
        // only have come from Carol.
        carol.catalog.add(anchorB);

        // --- Bob, process #1: receives Anchor A directly from Alice
        // (ordinary live ANNOUNCE-shaped exchange, never a discovery
        // call). ---
        const bobDisk = new InMemoryStorageProvider();
        let bobCatalog = new LocalPublicationAnchorCatalog(bobDisk);
        let bobAuthVerifier = new LocalAuthorizationVerifier();
        let bobExchange = new PublicationAnchorExchange(bobCatalog, bobAuthVerifier);
        const { isNew: aIsNew } = bobExchange.importAnchor(anchorA.toJSON());
        assert(aIsNew === true, '2. Bob receives Anchor A directly from Alice, in process #1');
        assert(bobCatalog.has(anchorA.id) && !bobCatalog.has(anchorB.id), '3. Bob knows only A so far — never received B');

        // --- "Bob restarts." Persistence alone (0.8.15) recovers A —
        // no network involved. ---
        let bobStore = new LocalPublicationAnchorStore(bobDisk);
        let restoreResult = new RestorePublicationAnchorCatalogUseCase(bobStore, bobAuthVerifier).execute();
        assert(restoreResult.restoredAnchors.length === 1 && restoreResult.restoredAnchors[0].id === anchorA.id,
            '4. restart #1: Anchor A survives through persistence alone');
        bobCatalog = new LocalPublicationAnchorCatalog(bobDisk);
        bobExchange = new PublicationAnchorExchange(bobCatalog, bobAuthVerifier);
        assert(bobCatalog.has(anchorA.id) && !bobCatalog.has(anchorB.id),
            '5. after restart #1, Bob still knows only A — restarting never itself synchronizes anything from a peer');

        // --- Bob, process #2 (post-restart): connects to Carol and
        // explicitly discovers from her. ---
        const bobBus = new PeerMessageBus();
        const bobTransport = new LocalPeerConnectionProvider('bob-flagship', network);
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: makeIdentity('Bob-F') });
        const stopBobListening = bobConnect.listen();
        const bobToCarol = bobConnect.connect({ candidateEndpoint: 'carol-flagship' });
        await wait(20);
        assert(bobToCarol.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '6. setup: Bob<->Carol authenticates');

        const bobPeerExchange = new PublicationAnchorPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const bobAnchorDiscoveryCoordinator = new PublicationAnchorDiscoveryCoordinator(bobPeerExchange);
        const bobEvidenceDiscoveryCoordinator = new PublicationEvidenceDiscoveryCoordinator(bobAnchorDiscoveryCoordinator, bobConnect.registry);

        const discoverResult = await bobEvidenceDiscoveryCoordinator.discover('pub-flagship-sync', { timeoutMs: 200 });
        assert(discoverResult.newlyImportedCount === 1, '7. Bob discovers exactly one new anchor from Carol');
        assert(bobCatalog.has(anchorA.id) && bobCatalog.has(anchorB.id),
            '8. Bob\'s persistent catalog now contains A (survived restart) AND B (arrived via explicit discovery from Carol)');
        assert(bobCatalog.findByPublicationId('pub-flagship-sync').length === 2, '9. exactly two entries — no duplication');

        bobPeerExchange.dispose();
        stopBobListening();
        bobTransport.dispose();

        // --- "Bob restarts again." Both A and B now survive through
        // persistence alone — proving discovery's result was itself
        // durably cataloged, not merely held in an in-memory session. ---
        bobStore = new LocalPublicationAnchorStore(bobDisk);
        const bobAuthVerifier2 = new LocalAuthorizationVerifier();
        restoreResult = new RestorePublicationAnchorCatalogUseCase(bobStore, bobAuthVerifier2).execute();
        assert(restoreResult.restoredAnchors.length === 2, '10. restart #2: BOTH previously-known and newly-discovered anchors restore');
        assert(restoreResult.rejectedAnchors.length === 0, '11. restart #2: nothing is rejected — both anchors were genuinely signed by Alice');
        const bobCatalog2 = new LocalPublicationAnchorCatalog(bobDisk);
        assert(bobCatalog2.has(anchorA.id) && bobCatalog2.has(anchorB.id),
            '12. after restart #2, A + B both survive — no network synchronization was required merely to recover already-known evidence');
        assert(bobCatalog2.findByPublicationId('pub-flagship-sync').length === 2, '13. exactly two entries survive the second restart, still unranked');

        disposeReplica(alice);
        disposeReplica(carol);
    }
    console.log('✓ Section F: FLAGSHIP — Bob receives A directly, restarts (A survives via persistence alone), discovers B explicitly from Carol, and restarts again (A+B both survive) — persistence and discovery are proven genuinely separate, composable mechanisms');

    console.log('\nAll Publication Evidence Discovery UX tests passed.');
}

run().catch((error) => {
    console.error('PublicationEvidenceDiscoveryUX.test.js FAILED:', error);
    process.exitCode = 1;
});
