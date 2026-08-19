import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { PeerDiscoveryRecord } from '../peer/PeerDiscoveryRecord.js';
import { LocalPeerDiscoveryProvider } from '../peer/LocalPeerDiscoveryProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';

// 0.2.64 — Decentralized Peer Discovery.
//
// "How does Alice find Bob in the first place, without turning discovery
// itself into an authority?" This file proves the three pieces 0.2.64
// adds on top of 0.2.50's already-existing (but purely out-of-band,
// import-and-connect-in-one-step) rendezvous layer:
//
//   peer/PeerDiscoveryRecord.js/LocalPeerDiscoveryProvider.js — a
//   candidate now carries its own freshness (expiresAt/isExpired), is
//   deduplicated on re-import, and can be searched BY IDENTITY
//   (discover(identityId)) among whatever this device has already
//   imported — never a live network lookup, see that provider's own
//   header on why 0.2.64 is deliberately a bootstrap milestone.
//
//   application/FindPeerUseCase.js — composes that search with a REAL
//   connection attempt, always expecting the searched-for identityId
//   regardless of what the candidate's own (untrusted) identityHint
//   claims — reusing 0.2.62's `expectedIdentityId` guard for a peer this
//   device has never met at all, not just for reconnecting to a known
//   one.
//
// Built over peer/LocalPeerConnectionProvider.js, the same real,
// in-process, bidirectional transport tests/PeerConnectionResilience.test.js
// already trusts for this purpose. application/PeerSessionManager.js's own
// real-WebRTC connectToDiscovered()/importCandidate()/discoverCandidates()
// plumbing is exercised in-browser via tests/PeerConnectionsUI.test.js's
// own established split (WebRTC has no Node runtime in this environment);
// this file instead stands in a minimal, honestly-labeled fake
// PeerSessionManager over the SAME real ConnectToPeerUseCase/
// LocalPeerDiscoveryProvider pair, so application/FindPeerUseCase.js's own
// real logic runs against genuine authentication, not a mock pretending to
// authenticate.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 30) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDevice(label, network) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(label);
    const transport = new LocalPeerConnectionProvider(label, network);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider: provider });
    return { storage, identityProvider: provider, transport, connect, id: provider.getSigningIdentity().id };
}

// A minimal, honestly-labeled stand-in for application/
// PeerSessionManager.js's own importCandidate()/discoverCandidates()/
// connectToDiscovered()/onIdentityMismatch() surface — the only four
// methods application/FindPeerUseCase.js ever calls on it. Backed by a
// REAL peer/LocalPeerDiscoveryProvider.js and a REAL
// application/ConnectToPeerUseCase.js over peer/LocalPeerConnectionProvider.js
// — see this file's own header on why this stands in only for the
// WebRTC-specific two-step signal relay, never for discovery or
// authentication themselves.
function makeFakeSessionManager(connect, discoveryProvider = new LocalPeerDiscoveryProvider()) {
    return {
        importCandidate(invitationInput) {
            const invitation = invitationInput instanceof PeerInvitation ? invitationInput : PeerInvitation.fromJSON(invitationInput);
            return discoveryProvider.importInvitation(invitation);
        },
        discoverCandidates(identityId) {
            return discoveryProvider.discover(identityId);
        },
        async connectToDiscovered(record, { expectedIdentityId } = {}) {
            const connectedPeer = connect.connect(record, { expectedIdentityId });
            return { connectedPeer, reply: 'fake-reply' };
        },
        onIdentityMismatch(callback) {
            return connect.onIdentityMismatch(callback);
        },
        discoveryProvider
    };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. PeerDiscoveryRecord freshness — a record expires independently of
//    the invitation that produced it, checked lazily, never on a timer.
// ---------------------------------------------------------------------
{
    const now = new Date('2026-01-01T00:00:00Z');
    const record = new PeerDiscoveryRecord({ candidateEndpoint: 'x', source: 'INVITATION', discoveredAt: now, expiresAt: new Date(now.getTime() + 1000) });
    assert(!record.isExpired(new Date(now.getTime() + 500)), 'not yet expired well within its own ttl');
    assert(record.isExpired(new Date(now.getTime() + 1000)), 'expired once past its own expiresAt');

    const defaulted = new PeerDiscoveryRecord({ candidateEndpoint: 'x', source: 'INVITATION', discoveredAt: now });
    assert(!defaulted.isExpired(new Date(now.getTime() + 1000)), 'a record given no explicit expiresAt still gets a real, finite default ttl');
    console.log('✓ PeerDiscoveryRecord: freshness is explicit, lazily checked, and defaults to a finite ttl');
}

// ---------------------------------------------------------------------
// 2. LocalPeerDiscoveryProvider — expired candidates are unusable, never
//    merely "less preferred"; re-importing the same candidate refreshes
//    it rather than duplicating it; discover() finds nothing that was
//    never imported.
// ---------------------------------------------------------------------
{
    const provider = new LocalPeerDiscoveryProvider();
    const invitation = PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob', ttlMs: 30 });

    provider.importInvitation(invitation);
    assert(provider.discover('did:key:bob').length === 1, 'setup: freshly imported, discoverable by identity');
    assert(provider.discover('did:key:someone-else').length === 0, 'discover() never returns a candidate for an identity nobody imported anything for');

    // Bob changes networks — this ONE candidate goes stale. Nothing about
    // the identity or any relationship is affected; there is simply
    // nothing left worth attempting.
    await wait(60);
    assert(provider.list().length === 0, 'list() lazily prunes the expired candidate on read');
    assert(provider.discover('did:key:bob').length === 0, 'discover() never returns an expired candidate — unusable, not merely stale-but-listed');
    console.log('✓ LocalPeerDiscoveryProvider: an expired candidate is pruned lazily and never returned as usable');
}
{
    const provider = new LocalPeerDiscoveryProvider();
    const first = provider.importInvitation(PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }));
    const second = provider.importInvitation(PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }));
    assert(provider.list().length === 1, 'rediscovering the exact same candidate refreshes it, never duplicates it');
    assert(second.peerDiscoveryId === first.peerDiscoveryId, 'the refreshed record keeps its own identity across the refresh');

    provider.importInvitation(PeerInvitation.create({ endpoint: 'charlie-address', identityHint: 'did:key:bob' }));
    assert(provider.list().length === 2, 'a genuinely different endpoint claiming the same identity is a SEPARATE candidate, never silently merged');
    console.log('✓ LocalPeerDiscoveryProvider: rediscovering a candidate refreshes it; a different endpoint is never merged into it');
}

// ---------------------------------------------------------------------
// 3. FindPeerUseCase — malformed/missing input is refused before any
//    connection is ever attempted.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice3', network);
    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect) });

    let threw = false;
    try { await findPeerUseCase.search(''); } catch (e) { threw = e.message.includes('identityId is required'); }
    assert(threw, 'searching with no identityId is refused');

    threw = false;
    try { await findPeerUseCase.connect(new PeerDiscoveryRecord({ candidateEndpoint: 'x', source: 'INVITATION' }), ''); } catch (e) { threw = e.message.includes('identityId is required'); }
    assert(threw, 'connecting with no identityId to expect is refused — there would be nothing to verify against');

    assert((await findPeerUseCase.search('did:key:nobody-imported-anything-for-this')).length === 0, 'searching for an identity nothing was ever imported for returns no candidates, never throws');
    console.log('✓ FindPeerUseCase: malformed/missing input is refused before any connection attempt');
}

// ---------------------------------------------------------------------
// 4. FLAGSHIP, part 1 — a genuine candidate for Bob authenticates as
//    Bob: "candidate found" becomes "authenticated," never assumed
//    before that.
// ---------------------------------------------------------------------
let flagship;
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice4', network);
    const bob = makeDevice('Bob4', network);
    const stopBobListening = bob.connect.listen();

    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect) });

    const genuineInvitation = PeerInvitation.create({ endpoint: bob.transport.address, identityHint: bob.id });
    findPeerUseCase.importCandidate(genuineInvitation);

    const candidates = await findPeerUseCase.search(bob.id);
    assert(candidates.length === 1, "searching bob's identityId finds exactly the one candidate imported for him");
    assert(candidates[0].identityHint === bob.id, 'setup: the candidate claims to be bob');

    // Before connecting, this is a CANDIDATE, nothing else — no
    // connection, no proof, no relationship.
    const storage = new InMemoryStorageProvider();
    const relationships = new PeerRelationshipUseCase(storage, alice.identityProvider);
    assert(relationships.getRelationship(bob.id) === null, "a bare, unconnected candidate never becomes a relationship");

    const { connectedPeer } = await findPeerUseCase.connect(candidates[0], bob.id);
    await wait();
    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the real handshake completes');
    assert(connectedPeer.remoteIdentity && connectedPeer.remoteIdentity.identityId === bob.id, "the PROVEN identity is genuinely bob — not merely the candidate's own claim");

    // Discovery still never creates a relationship on its own — see
    // application/PeerRelationshipUseCase.js's own header, unchanged by
    // 0.2.64. Remembering stays a deliberate, separate act.
    assert(relationships.getRelationship(bob.id) === null, "even a SUCCESSFUL discovery-led connection never auto-creates a PeerRelationship");
    const remembered = relationships.rememberPeer(connectedPeer.remoteIdentity);
    console.log('✓ FLAGSHIP part 1: a genuine candidate for bob connects, authenticates as bob, and still requires an explicit Remember to become a relationship');

    flagship = { network, alice, bob, stopBobListening, connectedPeer, relationships, remembered, findPeerUseCase, storage };
}

// ---------------------------------------------------------------------
// 5. SECURITY FLAGSHIP, part 2 — discovery claims "Bob," but the
//    candidate's endpoint actually belongs to Charlie. Charlie
//    authenticates completely honestly, as himself. The connection is
//    rejected, closed on both ends, and bob's already-remembered
//    relationship is left completely untouched.
// ---------------------------------------------------------------------
{
    const { network, alice, bob, relationships, remembered } = flagship;
    const charlie = makeDevice('Charlie4', network);
    const stopCharlieListening = charlie.connect.listen();

    const findPeerUseCase = flagship.findPeerUseCase;

    // A discovery record that CLAIMS to be bob but whose endpoint is
    // really charlie's — exactly the shape a malicious or merely stale
    // discovery provider could hand back (see peer/
    // PeerDiscoveryProvider.js's own header: a source is never trusted
    // more than another).
    const forgedInvitation = PeerInvitation.create({ endpoint: charlie.transport.address, identityHint: bob.id });
    findPeerUseCase.importCandidate(forgedInvitation);

    const candidates = await findPeerUseCase.search(bob.id);
    assert(candidates.some((r) => r.candidateEndpoint === charlie.transport.address), 'setup: the forged candidate is discoverable under bob\'s own identityId');

    let rejected = null;
    const unsubscribe = findPeerUseCase.onCandidateRejected((detail) => { rejected = detail; });

    const target = candidates.find((r) => r.candidateEndpoint === charlie.transport.address);
    const { connectedPeer } = await findPeerUseCase.connect(target, bob.id);
    await wait();

    assert(rejected !== null, 'the mismatch is reported — never silently swallowed');
    assert(rejected.expectedIdentityId === bob.id, 'the rejection names who this device actually searched for');
    assert(rejected.actualIdentityId === charlie.id, 'the rejection reports who genuinely authenticated instead — charlie, honestly, just not who was expected');
    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.CLOSED, "alice's own side sees the connection closed, never left AUTHENTICATED under the wrong name");
    assert(!alice.connect.registry.list().some((p) => p.connectionId === connectedPeer.connectionId), "the rejected connection never lingers in alice's registry where it could be mistaken for bob");
    assert(charlie.connect.registry.list().length === 0, "charlie's own honest, unrelated side also sees the connection close, not linger");

    // The one existing relationship this device actually has with bob
    // (remembered in part 1, over a GENUINE connection) is completely
    // untouched by this rejected attempt.
    const stillBob = relationships.getRelationship(bob.id);
    assert(stillBob !== null, "bob's remembered relationship still exists");
    assert(stillBob.identityId === bob.id && stillBob.publicKey === remembered.publicKey, "still genuinely bob's own key — never overwritten with charlie's");
    assert(stillBob.lastAuthenticatedAt.getTime() === remembered.lastAuthenticatedAt.getTime(), "lastAuthenticatedAt is untouched — this rejected attempt was never treated as a fresh proof of bob");

    // And charlie himself was never mistakenly remembered as bob, nor at
    // all — discovery claiming "this is bob" never taught this device
    // anything durable about charlie either.
    assert(relationships.getRelationship(charlie.id) === null, "charlie is never remembered under his own identity either — nothing here ever called rememberPeer for him");

    unsubscribe();
    stopCharlieListening();
    console.log('✓ SECURITY FLAGSHIP: a discovery candidate claiming to be bob, whose endpoint actually answers as charlie, is rejected and closed on both ends — bob\'s existing relationship is left completely untouched, and charlie is never mistakenly remembered as anyone');
}

// ---------------------------------------------------------------------
// 6. onCandidateRejected never fires for a mismatch this class didn't
//    start — the same "don't attribute someone else's mismatch to
//    yourself" discipline application/PeerReconnectionUseCase.js already
//    established for its own onReconnectRejected.
// ---------------------------------------------------------------------
{
    const { network, bob } = flagship;
    const dora = makeDevice('Dora4', network);
    const stopDoraListening = dora.connect.listen();
    const eve = makeDevice('Eve4', network);

    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(eve.connect) });
    let fired = false;
    findPeerUseCase.onCandidateRejected(() => { fired = true; });

    // A mismatch that happens on eve's OWN connect use case, but never
    // through findPeerUseCase.connect() at all.
    const peer = eve.connect.connect({ candidateEndpoint: dora.transport.address }, { expectedIdentityId: bob.id });
    await wait();
    assert(peer.getLifecycleState() === PeerLifecycleState.CLOSED, 'setup: this unrelated mismatch really did happen');
    assert(fired === false, 'FindPeerUseCase never reports a mismatch it did not itself start via connect()');

    stopDoraListening();
    console.log('✓ onCandidateRejected only ever fires for a mismatch FindPeerUseCase itself started');
}

flagship.stopBobListening();
flagship.alice.transport.dispose();
flagship.bob.transport.dispose();
flagship.findPeerUseCase.dispose();

console.log('\nAll peer identity discovery tests passed.');
}

await runTests();
