import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { PeerDiscoverySource } from '../peer/PeerDiscoverySource.js';
import { LocalPeerDiscoveryProvider } from '../peer/LocalPeerDiscoveryProvider.js';
import { RendezvousPublication } from '../peer/RendezvousPublication.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';

// 0.2.65 — Distributed Peer Rendezvous.
//
// 0.2.64 answered "how does Alice search for Bob among candidates this
// device already imported?" — deliberately local, deliberately a
// bootstrap milestone (see peer/LocalPeerDiscoveryProvider.js's own
// header). This file proves the piece that was still missing: a REAL
// network — PUBLISH/LOOKUP/REMOVE (peer/RendezvousTransport.js, peer/
// LocalRendezvousNetwork.js) — behind the exact same peer/
// PeerDiscoveryProvider.js contract, plus a way to ask SEVERAL such
// networks at once without application/FindPeerUseCase.js ever having to
// change (peer/DiscoveryBootstrap.js).
//
// Central principle under test throughout: RENDEZVOUS DISTRIBUTES
// CANDIDATES; AUTHENTICATION ESTABLISHES IDENTITY. A malicious or merely
// mistaken rendezvous node can publish "Bob" pointing at anyone at all —
// this file proves that costs it nothing, because peer/
// PeerAuthenticationSession.js's handshake, gated by application/
// ConnectToPeerUseCase.js's 0.2.62 expectedIdentityId check, is still the
// only thing that ever gets to say "this really is Bob."

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

// A minimal, honestly-labeled stand-in for application/PeerSessionManager.js's
// own importCandidate()/discoverCandidates()/connectToDiscovered()/
// onIdentityMismatch() surface — the same shape tests/
// PeerIdentityDiscovery.test.js already established, here parameterized by
// whatever peer/PeerDiscoveryProvider `discoveryProvider` is (a bare peer/
// RendezvousDiscoveryProvider.js, or a peer/DiscoveryBootstrap.js fanning
// out to several).
function makeFakeSessionManager(connect, discoveryProvider) {
    return {
        importCandidate(invitationInput) {
            const invitation = invitationInput instanceof PeerInvitation ? invitationInput : PeerInvitation.fromJSON(invitationInput);
            return discoveryProvider.importInvitation(invitation);
        },
        async discoverCandidates(identityId) {
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
// 1. RendezvousPublication — never a credential, never longer-lived than
//    the invitation it wraps, unpublishable without an identityHint.
// ---------------------------------------------------------------------
{
    const now = new Date('2026-01-01T00:00:00Z');
    const invitation = PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob', ttlMs: 1000, now });

    // Requesting a LONGER rendezvous ttl than the invitation's own never
    // wins — a publication is only ever as fresh as the stricter of the
    // two.
    const publication = RendezvousPublication.create({ invitation, ttlMs: 60 * 60 * 1000, now });
    assert(publication.expiresAt.getTime() === invitation.expiresAt.getTime(), 'a publication never outlives the invitation it wraps, even when a longer ttl is requested');
    assert(publication.identityHint === 'did:key:bob' && publication.endpoint === 'bob-address', 'a publication carries exactly the identityHint/endpoint of the invitation it wraps, nothing more');
    assert(!('privateKey' in publication.toJSON()) && !('signature' in publication.toJSON()), 'a publication is never a credential — no private key material, no signature');

    let threw = false;
    try {
        RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'x', identityHint: null, now }), now });
    } catch (e) {
        threw = e.message.includes('identityHint');
    }
    assert(threw, 'an invitation with no identityHint cannot be published — nobody could ever look it up by identity');
    console.log('✓ RendezvousPublication: never a credential, never outlives its own invitation, unpublishable without an identityHint');
}

// ---------------------------------------------------------------------
// 2. LocalRendezvousNetwork — at most one live publication per identity;
//    a fresh publish replaces the old one; REMOVE withdraws explicitly;
//    the network can go temporarily unavailable without losing data.
// ---------------------------------------------------------------------
{
    const network = new LocalRendezvousNetwork();
    const first = PeerInvitation.create({ endpoint: 'bob-v1', identityHint: 'did:key:bob' });
    const second = PeerInvitation.create({ endpoint: 'bob-v2', identityHint: 'did:key:bob' });

    await network.publish(RendezvousPublication.create({ invitation: first }));
    await network.publish(RendezvousPublication.create({ invitation: second }));
    const found = await network.lookup('did:key:bob');
    assert(found.length === 1, 'duplicate publications for the same identity never accumulate — the network holds "where reachable right now," never a history');
    assert(found[0].endpoint === 'bob-v2', 'the newer publication replaces the older one, regardless of endpoint');
    console.log('✓ LocalRendezvousNetwork: a fresh publication for the same identity replaces the old one, never duplicates it');
}
{
    const network = new LocalRendezvousNetwork();
    const publication = await network.publish(RendezvousPublication.create({ invitation: PeerInvitation.create({ endpoint: 'bob-v1', identityHint: 'did:key:bob' }) }));
    assert((await network.lookup('did:key:bob')).length === 1, 'setup: published and found');

    const removed = await network.remove(publication.publicationId);
    assert(removed === true, 'remove() reports that something was actually withdrawn');
    assert((await network.lookup('did:key:bob')).length === 0, 'a node explicitly disappearing (REMOVE) leaves nothing behind for LOOKUP to find');
    assert(await network.remove(publication.publicationId) === false, 'removing an already-removed publication is a no-op, not an error');
    console.log('✓ LocalRendezvousNetwork: REMOVE withdraws a publication for good — "no route right now," not an error');
}
{
    const network = new LocalRendezvousNetwork();
    const invitation = PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob', ttlMs: 30 });
    await network.publish(RendezvousPublication.create({ invitation, ttlMs: 30 }));
    await wait(60);
    assert((await network.lookup('did:key:bob')).length === 0, 'an expired publication is pruned lazily and never returned by LOOKUP');
    console.log('✓ LocalRendezvousNetwork: an expired publication is unusable, never merely stale-but-listed');
}
{
    const network = new LocalRendezvousNetwork();
    network.setAvailable(false);
    let threw = false;
    try { await network.lookup('did:key:bob'); } catch { threw = true; }
    assert(threw, 'a temporarily unavailable rendezvous network refuses operations outright, rather than silently answering "nothing here"');
    network.setAvailable(true);
    assert((await network.lookup('did:key:bob')).length === 0, 'once available again, ordinary lookups resume');
    console.log('✓ LocalRendezvousNetwork: unavailability is explicit and recoverable, never silently misreported as "nothing published"');
}

// ---------------------------------------------------------------------
// 3. RendezvousDiscoveryProvider — publish()/discover() is a REAL network
//    round trip; a lookup failure degrades to the local cache rather than
//    throwing; a malformed/malicious network entry is skipped, not fatal.
// ---------------------------------------------------------------------
{
    const network = new LocalRendezvousNetwork();
    const bob = new RendezvousDiscoveryProvider({ transport: network });
    const alice = new RendezvousDiscoveryProvider({ transport: network });

    assert((await alice.discover('did:key:bob')).length === 0, 'nobody has published anything for bob yet');
    await bob.publish(PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }));

    const found = await alice.discover('did:key:bob');
    assert(found.length === 1 && found[0].candidateEndpoint === 'bob-address', 'discover() is a REAL lookup against the transport, not merely a search over what THIS provider already imported');
    assert(found[0].source === PeerDiscoverySource.RENDEZVOUS_SERVICE, 'a network-discovered candidate is labeled with its own provenance, distinct from a manually imported INVITATION');
    console.log('✓ RendezvousDiscoveryProvider: publish() and discover() are a genuine PUBLISH/LOOKUP round trip over the transport');
}
{
    // Graceful degradation: a lookup failure never throws out of
    // discover() — it falls back to whatever this device already cached.
    const network = new LocalRendezvousNetwork();
    const bob = new RendezvousDiscoveryProvider({ transport: network });
    const alice = new RendezvousDiscoveryProvider({ transport: network });
    await bob.publish(PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }));
    await alice.discover('did:key:bob'); // primes alice's own local cache

    network.setAvailable(false);
    let threw = false;
    let result;
    try {
        result = await alice.discover('did:key:bob');
    } catch {
        threw = true;
    }
    assert(threw === false, 'a temporarily unreachable rendezvous network never makes discover() throw');
    assert(result.length === 1 && result[0].candidateEndpoint === 'bob-address', 'discover() falls back to the already-cached candidate while the network is unavailable');
    network.setAvailable(true);
    console.log('✓ RendezvousDiscoveryProvider: a lookup failure degrades to the local cache — the network is harder to find, never impossible to use what was already known');
}
{
    // A malformed/malicious entry from the network — exactly what a
    // broken or hostile rendezvous node could hand back for THIS
    // identity — is skipped, never crashes the whole lookup. Modeled as a
    // fake transport whose lookup() itself returns garbage, the same
    // "honestly-labeled fake standing in for a real network boundary"
    // technique this file's own makeFakeSessionManager() already uses —
    // never by reaching into a real LocalRendezvousNetwork's own internal
    // storage, which nothing in this codebase would ever actually do.
    const malformedTransport = {
        publish() { throw new Error('unused'); },
        lookup(identityId) { return identityId === 'did:key:bob' ? [{ garbage: 'not a real publication' }] : []; },
        remove() { return false; }
    };
    const alice = new RendezvousDiscoveryProvider({ transport: malformedTransport });

    let threw = false;
    let result;
    try {
        result = await alice.discover('did:key:bob');
    } catch {
        threw = true;
    }
    assert(threw === false, 'a malformed publication never crashes discover()');
    assert(result.length === 0, 'a malformed publication is simply skipped, never surfaced as a usable candidate');
    console.log('✓ RendezvousDiscoveryProvider: a malformed network entry is rejected silently, exactly like a stale one disappearing');
}
{
    // Malicious publication claiming Bob's identity outright.
    const network = new LocalRendezvousNetwork();
    const charlieNetworkNode = new RendezvousDiscoveryProvider({ transport: network });
    const alice = new RendezvousDiscoveryProvider({ transport: network });

    await charlieNetworkNode.publish(PeerInvitation.create({ endpoint: 'charlie-address', identityHint: 'did:key:bob' }));
    const found = await alice.discover('did:key:bob');
    assert(found.length === 1 && found[0].candidateEndpoint === 'charlie-address', 'a malicious publication claiming to be bob is discoverable under his identity — discovery never filters this out, by design');
    console.log('✓ RendezvousDiscoveryProvider: a malicious publication claiming someone else\'s identity is discoverable, exactly as untrusted as any other candidate (authentication is what catches it — see the flagship below)');
}
{
    // unpublish()/REMOVE — explicit withdrawal, distinct from natural
    // expiry.
    const network = new LocalRendezvousNetwork();
    const bob = new RendezvousDiscoveryProvider({ transport: network });
    const alice = new RendezvousDiscoveryProvider({ transport: network });
    await bob.publish(PeerInvitation.create({ endpoint: 'bob-address', identityHint: 'did:key:bob' }));
    assert((await alice.discover('did:key:bob')).length === 1, 'setup: published and found');

    assert(await bob.unpublish() === true, 'unpublish() with no argument withdraws this node\'s own last publication');
    const freshAlice = new RendezvousDiscoveryProvider({ transport: network });
    assert((await freshAlice.discover('did:key:bob')).length === 0, 'a freshly-asking device sees nothing published for bob once he has withdrawn');
    console.log('✓ RendezvousDiscoveryProvider: unpublish() withdraws this node\'s own publication from the network');
}

// ---------------------------------------------------------------------
// 4. DiscoveryBootstrap — fans out to several providers, tolerates one
//    of them failing, merges without collapsing genuinely different
//    candidates, and keeps importInvitation() manual/local.
// ---------------------------------------------------------------------
{
    const local = new LocalPeerDiscoveryProvider();
    const nodeA = new LocalRendezvousNetwork();
    const nodeB = new LocalRendezvousNetwork();
    const rendezvousA = new RendezvousDiscoveryProvider({ transport: nodeA });
    const rendezvousB = new RendezvousDiscoveryProvider({ transport: nodeB });
    const bootstrap = new DiscoveryBootstrap({ localProvider: local, bootstrapProviders: [rendezvousA, rendezvousB] });

    // Manual/out-of-band import always lands on the local provider.
    bootstrap.importInvitation(PeerInvitation.create({ endpoint: 'manual-address', identityHint: 'did:key:bob' }));
    assert(local.discover('did:key:bob').length === 1, 'importInvitation() always goes to the local provider, never a bootstrap one');

    // Two DIFFERENT rendezvous nodes each publish something for bob.
    await new RendezvousDiscoveryProvider({ transport: nodeA }).publish(PeerInvitation.create({ endpoint: 'via-node-a', identityHint: 'did:key:bob' }));
    await new RendezvousDiscoveryProvider({ transport: nodeB }).publish(PeerInvitation.create({ endpoint: 'via-node-b', identityHint: 'did:key:bob' }));

    const found = await bootstrap.discover('did:key:bob');
    const endpoints = found.map((r) => r.candidateEndpoint).sort();
    assert(endpoints.length === 3, 'discover() merges the manual candidate AND one candidate from each configured bootstrap provider — none silently collapsed');
    assert(endpoints.includes('manual-address') && endpoints.includes('via-node-a') && endpoints.includes('via-node-b'), 'every distinct source\'s candidate survives the merge');
    console.log('✓ DiscoveryBootstrap: fans out to the local provider and every configured bootstrap provider, merging without collapsing distinct candidates');
}
{
    // One misbehaving bootstrap provider never blocks the others.
    const rendezvous = new RendezvousDiscoveryProvider({ transport: new LocalRendezvousNetwork() });
    const brokenProvider = {
        discover() { throw new Error('simulated: this bootstrap node is unreachable'); },
        list() { return []; },
        importInvitation() { throw new Error('unused'); },
        forget() {},
        onDiscovered() { return () => {}; }
    };
    const bootstrap = new DiscoveryBootstrap({ bootstrapProviders: [rendezvous, brokenProvider] });
    await rendezvous.publish(PeerInvitation.create({ endpoint: 'good-node-address', identityHint: 'did:key:bob' }));

    let threw = false;
    let found;
    try {
        found = await bootstrap.discover('did:key:bob');
    } catch {
        threw = true;
    }
    assert(threw === false, 'a throwing bootstrap provider never fails the whole discover() call');
    assert(found.length === 1 && found[0].candidateEndpoint === 'good-node-address', 'the healthy bootstrap provider\'s candidate still comes through');
    console.log('✓ DiscoveryBootstrap: an unreachable/misbehaving bootstrap provider degrades the result, never breaks the search');
}
{
    // publishToAll() and add/removeBootstrapProvider().
    const rendezvousA = new RendezvousDiscoveryProvider({ transport: new LocalRendezvousNetwork() });
    const rendezvousB = new RendezvousDiscoveryProvider({ transport: new LocalRendezvousNetwork() });
    const bootstrap = new DiscoveryBootstrap({ bootstrapProviders: [rendezvousA] });
    bootstrap.addBootstrapProvider(rendezvousB);
    bootstrap.addBootstrapProvider(rendezvousB); // idempotent — never double-wires the same provider

    const invitation = PeerInvitation.create({ endpoint: 'alice-address', identityHint: 'did:key:alice' });
    const published = await bootstrap.publishToAll(invitation);
    assert(published.length === 2, 'publishToAll() publishes to every configured bootstrap provider that supports publish()');
    assert(bootstrap.bootstrapProviders.length === 2 && bootstrap.bootstrapProviders.includes(rendezvousA) && bootstrap.bootstrapProviders.includes(rendezvousB), 'bootstrapProviders() exposes exactly what was actually configured');

    bootstrap.removeBootstrapProvider(rendezvousA);
    assert(bootstrap.bootstrapProviders.length === 1 && bootstrap.bootstrapProviders[0] === rendezvousB, 'removeBootstrapProvider() actually stops asking that provider');
    console.log('✓ DiscoveryBootstrap: publishToAll() reaches every configured provider; add/removeBootstrapProvider() manage the set cleanly');
}

// ---------------------------------------------------------------------
// 5. FLAGSHIP — Alice looks up "bob" across a bootstrap of two rendezvous
//    nodes plus her own local pool. She sees a stale candidate (silently
//    pruned), a malformed candidate (silently skipped), a malicious
//    candidate claiming to be bob but really charlie, and bob's own
//    genuine candidate — and only authentication, never discovery,
//    decides which one is really him.
//
//        Alice
//         │
//         │ lookup bob
//         ▼
//    DiscoveryBootstrap
//         │
//         ├── local pool  → candidate 1: stale        (pruned)
//         ├── node C      → candidate 2: malformed     (skipped)
//         ├── node A      → candidate 3: charlie       (rejected on connect)
//         └── node B      → candidate 4: bob           (authenticates ✓)
// ---------------------------------------------------------------------
{
    const peerNetwork = new LocalPeerNetwork();
    const alice = makeDevice('AliceRV', peerNetwork);
    const bob = makeDevice('BobRV', peerNetwork);
    const charlie = makeDevice('CharlieRV', peerNetwork);
    const stopBobListening = bob.connect.listen();
    const stopCharlieListening = charlie.connect.listen();

    const localPool = new LocalPeerDiscoveryProvider();
    const nodeA = new LocalRendezvousNetwork();
    const nodeB = new LocalRendezvousNetwork();
    // Node C is a real network peer that happens to be broken/hostile —
    // its LOOKUP hands back garbage for bob's identity specifically. A
    // fake transport, not a real LocalRendezvousNetwork poked from the
    // outside — see this file's own malformed-entry test above.
    const nodeC = {
        publish() { throw new Error('unused'); },
        lookup(identityId) { return identityId === bob.id ? [{ garbage: 'not a real publication' }] : []; },
        remove() { return false; }
    };
    const bootstrap = new DiscoveryBootstrap({
        localProvider: localPool,
        bootstrapProviders: [
            new RendezvousDiscoveryProvider({ transport: nodeA }),
            new RendezvousDiscoveryProvider({ transport: nodeB }),
            new RendezvousDiscoveryProvider({ transport: nodeC })
        ]
    });

    // Candidate 1: stale — imported locally with a ttl so short it is
    // already expired by the time Alice searches.
    localPool.importInvitation(PeerInvitation.create({ endpoint: 'stale-address', identityHint: bob.id, ttlMs: 10 }));

    // Candidate 2: malformed — node C, above — needs no setup here.

    // Candidate 3: charlie, mislabeled as bob, published to node A —
    // exactly the shape a malicious or merely mistaken rendezvous node
    // could hand back (see peer/RendezvousTransport.js's own header: a
    // transport never verifies who is entitled to publish under a given
    // identityId).
    await new RendezvousDiscoveryProvider({ transport: nodeA }).publish(PeerInvitation.create({ endpoint: charlie.transport.address, identityHint: bob.id }));

    // Candidate 4: bob himself, genuinely reachable via node B — a
    // completely independent rendezvous node from A, so his own genuine
    // publication is never at risk of being overwritten by charlie's.
    await new RendezvousDiscoveryProvider({ transport: nodeB }).publish(PeerInvitation.create({ endpoint: bob.transport.address, identityHint: bob.id }));

    await wait(20); // let candidate 1's short ttl actually lapse

    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, bootstrap) });
    const candidates = await findPeerUseCase.search(bob.id);
    const endpoints = candidates.map((c) => c.candidateEndpoint);
    assert(!endpoints.includes('stale-address'), 'the stale candidate is pruned — silently absent, never surfaced as an error');
    assert(endpoints.length === 2, 'exactly the two GENUINE (if not necessarily honest) candidates survive: charlie-mislabeled-as-bob and bob himself; the malformed entry never became a candidate at all');
    assert(endpoints.includes(charlie.transport.address) && endpoints.includes(bob.transport.address), 'both surviving candidates are present');

    const storage = new InMemoryStorageProvider();
    const relationships = new PeerRelationshipUseCase(storage, alice.identityProvider);
    assert(relationships.getRelationship(bob.id) === null, 'no relationship exists yet — every candidate so far is still just a candidate');

    // Alice tries the mislabeled candidate first — charlie authenticates
    // completely honestly, as himself, and is rejected for not being bob.
    let rejected = null;
    const unsubscribeRejected = findPeerUseCase.onCandidateRejected((detail) => { rejected = detail; });
    const charlieCandidate = candidates.find((c) => c.candidateEndpoint === charlie.transport.address);
    const { connectedPeer: charlieAttempt } = await findPeerUseCase.connect(charlieCandidate, bob.id);
    await wait();
    assert(rejected !== null && rejected.actualIdentityId === charlie.id && rejected.expectedIdentityId === bob.id, 'the malicious/mislabeled candidate is rejected — charlie authenticated honestly, just not as bob');
    assert(charlieAttempt.getLifecycleState() === PeerLifecycleState.CLOSED, 'the rejected connection is closed, never left sitting around as if it were bob');
    assert(relationships.getRelationship(bob.id) === null, 'the rejected attempt never created or touched any relationship with bob');
    assert(relationships.getRelationship(charlie.id) === null, 'charlie is never mistakenly remembered under his own identity either');

    // Alice tries bob's genuine candidate next — it authenticates as bob.
    const bobCandidate = candidates.find((c) => c.candidateEndpoint === bob.transport.address);
    const { connectedPeer: bobAttempt } = await findPeerUseCase.connect(bobCandidate, bob.id);
    await wait();
    assert(bobAttempt.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'bob\'s genuine candidate authenticates successfully');
    assert(bobAttempt.remoteIdentity.identityId === bob.id, 'the proven identity is genuinely bob');
    relationships.rememberPeer(bobAttempt.remoteIdentity);
    assert(relationships.getRelationship(bob.id) !== null, 'only the AUTHENTICATED connection, explicitly remembered, ever becomes a relationship');

    unsubscribeRejected();
    stopBobListening();
    stopCharlieListening();
    alice.transport.dispose();
    bob.transport.dispose();
    charlie.transport.dispose();
    findPeerUseCase.dispose();
    console.log('✓ FLAGSHIP: across a bootstrap of two rendezvous nodes plus a local pool, a stale candidate is pruned, a malformed one is skipped, a malicious one authenticates honestly as itself and is rejected, and only bob\'s genuine candidate ever becomes a remembered relationship');
}

console.log('\nAll distributed peer rendezvous tests passed.');
}

await runTests();
