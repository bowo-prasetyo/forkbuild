import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../application/AutoConnectKnownPeersUseCase.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationPeerConnectionSync } from '../application/PublicationPeerConnectionSync.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';

// 0.9.345 — Automatic Known-Peer Connection.
//
// 0.9.344's own boundary audit proved the seam — application/
// FindPeerUseCase.js#search()/#connect(), checked against application/
// PeerRelationshipUseCase.js#getRelationships() and application/
// ConnectedPeerRegistry.js#list() — using a test-side-only coordinator
// function it never shipped. This file exercises the PRODUCTION class that
// replaces it, application/AutoConnectKnownPeersUseCase.js, over real, live
// rendezvous/discovery/authentication, never a mocked transport.
//
// Sections (A-J):
//   A — FLAGSHIP: a known, already-discoverable peer connects automatically
//       the moment this class starts observing an existing relationship.
//   B — Remembering a peer AFTER this class is already running triggers an
//       automatic attempt through onRelationshipsChanged, not construction.
//   C — Known + not currently discoverable: no automatic connection.
//   D — Unknown identity is never even looked up.
//   E — Duplicate connection prevention: an already-connected known peer is
//       never attempted again.
//   F — Failure isolation: one identity's rejected/mislabeled candidate
//       never blocks another's automatic connection.
//   G — Discoverability withdrawal is prospective, never retroactive.
//   H — Publication metadata sync falls out for free, unmodified, after an
//       automatic connection — no separate coupling between the two.
//   I — Rapid, back-to-back relationship changes coalesce into one pass —
//       never two overlapping passes racing a duplicate connection.
//   J — dispose() stops future automatic attempts.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

// Same device shape tests/KnownPeerAutoConnectionBoundaryAudit.test.js
// already established: a real identity, a real ConnectToPeerUseCase (and
// therefore a real application/ConnectedPeerRegistry.js), over an
// in-process peer/LocalPeerConnectionProvider.js standing in only for real
// WebRTC signaling — never for discovery, rendezvous, or authentication.
function makeDevice(label, network) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(label);
    const transport = new LocalPeerConnectionProvider(label, network);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider });
    const relationships = new PeerRelationshipUseCase(new InMemoryStorageProvider(), identityProvider);
    return { identityProvider, transport, connect, relationships, id: identityProvider.getSigningIdentity().id, stopListening: connect.listen() };
}

// Same honestly-labeled stand-in for application/PeerSessionManager.js's
// WebRTC-signaling-specific chrome the boundary audit already uses — real
// discovery, rendezvous, and authentication throughout.
function makeFakeSessionManager(connect, discoveryProvider) {
    return {
        importCandidate(invitationInput) {
            const invitation = invitationInput instanceof PeerInvitation ? invitationInput : PeerInvitation.fromJSON(invitationInput);
            return discoveryProvider.importInvitation(invitation);
        },
        async discoverCandidates(identityId) { return discoveryProvider.discover(identityId); },
        async connectToDiscovered(record, { expectedIdentityId } = {}) {
            const connectedPeer = connect.connect(record, { expectedIdentityId });
            return { connectedPeer, reply: 'fake-reply' };
        },
        onIdentityMismatch(callback) { return connect.onIdentityMismatch(callback); }
    };
}

async function publishSelf(device, network, { ttlMs } = {}) {
    const provider = new RendezvousDiscoveryProvider({ transport: network });
    const invitation = PeerInvitation.create({ endpoint: device.transport.address, identityHint: device.id, ...(ttlMs ? { ttlMs } : {}) });
    return provider.publish(invitation, ttlMs ? { ttlMs } : {});
}

function remember(alice, device) {
    return alice.relationships.rememberPeer(new PeerIdentity({
        identityId: device.id,
        publicKey: device.identityProvider.getSigningIdentity().publicKey,
        algorithm: device.identityProvider.getSigningIdentity().algorithm
    }));
}

function authenticatedTo(registry, identityId) {
    return registry.list().filter((peer) =>
        peer.remoteIdentity && peer.remoteIdentity.identityId === identityId && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
}

async function run() {
    console.log('Running Automatic Known-Peer Connection tests...\n');

    // =======================================================================
    // Section A — FLAGSHIP: a known, already-discoverable peer connects
    // automatically the moment this class starts observing the relationship.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-a-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('auto-a-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        // Alice already knew Bob BEFORE this class was ever constructed —
        // the "application starts already knowing a friend" case.
        remember(alice, bob);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1,
            '1. FLAGSHIP: with zero human gesture beyond "Remember Bob" (already done) and "Be Discoverable" (already done, by Bob), the two authenticate automatically the instant this class starts observing the relationship.');

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section A: a known, already-discoverable peer authenticates automatically at construction time — no human "Find Someone"/"Connect to Peer" gesture required.');

    // =======================================================================
    // Section B — Remembering a peer AFTER this class is already running
    // triggers an automatic attempt through onRelationshipsChanged.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-b-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('auto-b-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0, 'setup: nothing to connect to yet — alice has no Known Peers.');

        // NOW alice performs "Remember Bob" — a real, ordinary relationship
        // event, not a special auto-connect gesture.
        remember(alice, bob);
        await wait();

        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1,
            '1. remembering an already-discoverable peer, with this class already running, triggers an automatic connection through the SAME onRelationshipsChanged() signal this codebase already fires for UI reactivity — no new event, no polling interval.');

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section B: an automatic attempt is triggered by a real relationship-list change (onRelationshipsChanged), never by a background timer.');

    // =======================================================================
    // Section C — Known + not currently discoverable: no automatic
    // connection.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const dave = makeDevice('auto-c-dave', peerNetwork); // known, never publishes

        const alice = makeDevice('auto-c-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, dave);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        assert(authenticatedTo(alice.connect.registry, dave.id).length === 0,
            '1. a Known Peer who never published themselves as discoverable is never automatically connected — search() legitimately finds nothing for him.');

        autoConnect.dispose();
        dave.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section C: a Known Peer who is not currently discoverable stays not-connected — automatic connection never "tries anyway."');

    // =======================================================================
    // Section D — Unknown identity is never even looked up.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const carol = makeDevice('auto-d-carol', peerNetwork); // a stranger, discoverable, never Remembered
        await publishSelf(carol, network);

        const alice = makeDevice('auto-d-alice', peerNetwork);
        const rendezvous = new RendezvousDiscoveryProvider({ transport: network });
        const originalDiscover = rendezvous.discover.bind(rendezvous);
        const lookedUp = [];
        rendezvous.discover = async (identityId) => { lookedUp.push(identityId); return originalDiscover(identityId); };
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, rendezvous) });

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        assert(lookedUp.length === 0, '1. carol is never looked up at all — this class has no source of identities beyond PeerRelationshipUseCase#getRelationships(), and alice never Remembered carol.');
        assert(authenticatedTo(alice.connect.registry, carol.id).length === 0, '2. carol is never connected, however discoverable she currently is.');

        autoConnect.dispose();
        carol.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section D: an identity never Remembered cannot enter this seam at all, regardless of how discoverable it currently is.');

    // =======================================================================
    // Section E — Duplicate connection prevention.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-e-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('auto-e-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        // Alice is ALREADY connected to bob — an ordinary manual connection
        // made before this class ever ran, nothing to do with auto-connect.
        const manualCandidates = await aliceFind.search(bob.id);
        const { connectedPeer: manual } = await aliceFind.connect(manualCandidates[0], bob.id);
        await wait();
        assert(manual.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: alice is genuinely already connected to bob.');
        assert(alice.connect.registry.list().length === 1, 'setup: exactly one connection exists so far.');

        // bob is STILL published — nothing today automatically unpublishes
        // on a successful connection. The production coordinator must not
        // open a second, independent authenticated session.
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        const authenticated = authenticatedTo(alice.connect.registry, bob.id);
        assert(authenticated.length === 1, '1. exactly one authenticated session to bob exists after this class runs — no duplicate connection was opened for an already-connected known peer.');
        assert(authenticated[0] === manual, '2. it is the SAME connection that already existed — reused, not replaced.');

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section E: an already-connected known peer is never attempted again — application/ConnectedPeerRegistry.js#list() is checked before every attempt, exactly as 0.9.344 Section F requires.');

    // =======================================================================
    // Section F — Failure isolation: one identity's rejected/mislabeled
    // candidate never blocks another's automatic connection.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-f-bob', peerNetwork);
        const eve = makeDevice('auto-f-eve', peerNetwork);
        const charlie = makeDevice('auto-f-charlie', peerNetwork); // answers honestly, mislabeled as dave
        const dave = makeDevice('auto-f-dave', peerNetwork);

        await publishSelf(bob, network);
        await publishSelf(eve, network);
        await new RendezvousDiscoveryProvider({ transport: network }).publish(
            PeerInvitation.create({ endpoint: charlie.transport.address, identityHint: dave.id }));

        const alice = makeDevice('auto-f-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        for (const device of [bob, eve, dave]) remember(alice, device);

        let rejectedCount = 0;
        const unsubscribe = aliceFind.onCandidateRejected(() => { rejectedCount += 1; });

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1, '1. bob still authenticates successfully...');
        assert(authenticatedTo(alice.connect.registry, eve.id).length === 1, '2. ...and so does eve — dave\'s rejected attempt never aborted either of theirs.');
        assert(rejectedCount === 1, '3. exactly one rejection fired, for dave\'s mislabeled candidate, through the SAME onCandidateRejected signal a manual "Find Someone" attempt already uses.');
        assert(alice.connect.registry.list().every((p) => !(p.remoteIdentity && p.remoteIdentity.identityId === charlie.id && p.getLifecycleState() !== PeerLifecycleState.CLOSED)),
            '4. charlie (who genuinely answered, just not as dave) is never left connected under any label.');

        unsubscribe();
        autoConnect.dispose();
        bob.transport.dispose(); eve.transport.dispose(); charlie.transport.dispose(); dave.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section F: automatic connection attempts are isolated per identity — one mislabeled/rejected candidate never prevents the other genuinely reachable ones from authenticating.');

    // =======================================================================
    // Section G — Discoverability withdrawal is prospective, never
    // retroactive.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-g-bob', peerNetwork);
        const carol = makeDevice('auto-g-carol', peerNetwork); // remembered later, unrelated to bob
        const bobPublication = await publishSelf(bob, network);

        const alice = makeDevice('auto-g-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        const bobPeer = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        assert(bobPeer && bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: automatic connection succeeded while bob was discoverable.');

        // bob withdraws "Be Discoverable" — the real, unmodified unpublish()
        // path, over a FRESH discovery provider so no stale local cache
        // masks the withdrawal (see 0.9.344 Section H's own named caveat).
        await new RendezvousDiscoveryProvider({ transport: network }).unpublish(bobPublication.publicationId);

        assert(bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. the ALREADY-authenticated connection is completely unaffected by bob withdrawing discoverability.');

        // A later, unrelated relationship change fires a fresh pass — bob
        // must neither be dropped NOR duplicated by it.
        remember(alice, carol);
        await wait();

        assert(bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. bob\'s live session survives an unrelated later pass untouched.');
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1, '3. still exactly one authenticated session to bob — no duplicate was opened even though he is no longer discoverable at all.');

        autoConnect.dispose();
        bob.transport.dispose(); carol.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section G: "disable Be Discoverable" and "disconnect me" remain two different acts — withdrawal blocks future automatic connection attempts but never tears down, duplicates, or otherwise disturbs an already-authenticated session.');

    // =======================================================================
    // Section H — Publication metadata sync falls out for free, unmodified,
    // after an automatic connection.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-h-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('auto-h-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        const verifier = new LocalAuthorizationVerifier();
        const aliceBus = new PeerMessageBus();
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, alice.connect.registry);
        const aliceSync = new PublicationPeerConnectionSync(aliceCatalog, alicePeerExchange, alice.connect.registry);

        const bobBus = new PeerMessageBus();
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bob.connect.registry);

        // Alice already cataloged a publication BEFORE any connection to
        // bob existed — the connection-time sync flagship shape.
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const documentContentReference = new ContentReference({ hash: 'docHash-auto-h', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256 });
        let publication = new Publication({
            documentId: 'auto-h-doc', title: 'Published Before Auto-Connect', author: 'auto-h-alice', providerId: 'local',
            contentHash: documentContentReference.hash, schemaVersion: 3, license: new License({ id: LicenseId.CC0_1_0 }),
            contentReference: documentContentReference, publisherIdentity: alice.identityProvider.getSigningIdentity().toJSON(), signature: null
        });
        publication = publication.withSignature(alice.identityProvider.signCanonical(publication.getSigningDescriptor()));
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice.identityProvider });
        aliceCatalog.add(envelope);

        // No manual "Find Someone", no explicit announce() call — only the
        // production auto-connect coordinator runs.
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1, 'setup: the automatic connection itself succeeded.');
        assert(bobCatalog.has(envelope.id),
            '1. bob automatically receives alice\'s already-cataloged publication the moment the automatic connection authenticates — application/PublicationPeerConnectionSync.js needed no change at all to react to a connection it did not initiate.');

        aliceSync.dispose(); alicePeerExchange.dispose(); bobPeerExchange.dispose();
        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section H: Publication metadata sync composes with automatic connection for free — PublicationPeerConnectionSync reacts to any newly AUTHENTICATED peer regardless of how the connection was initiated, with no new coupling introduced by this milestone.');

    // =======================================================================
    // Section I — Rapid, back-to-back relationship changes coalesce into
    // one pass, never two overlapping passes racing a duplicate connection.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-i-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('auto-i-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });

        // Two relationship-changed events fired back-to-back, synchronously,
        // before the first pass they trigger has any chance to finish —
        // remember() immediately followed by updateAlias() on the same
        // identity, exactly the shape a UI "Remember, then immediately
        // rename" gesture produces.
        const relationship = remember(alice, bob);
        alice.relationships.updateAlias(relationship.identityId, 'Bob (renamed immediately)');
        await wait();

        const authenticated = authenticatedTo(alice.connect.registry, bob.id);
        assert(authenticated.length === 1, '1. exactly one authenticated session exists — two rapid, overlapping triggers never raced each other into opening a duplicate connection.');

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section I: back-to-back relationship-changed events coalesce into a bounded number of passes — never two overlapping passes that could each independently decide the same identity is not yet connected.');

    // =======================================================================
    // Section J — dispose() stops future automatic attempts.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('auto-j-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('auto-j-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0, 'setup: nothing known yet, nothing connected.');

        autoConnect.dispose();
        remember(alice, bob);
        await wait();

        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0,
            '1. after dispose(), a new relationship no longer triggers any automatic connection attempt at all.');

        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section J: dispose() fully stops future automatic attempts — this class leaves nothing running once torn down.');

    console.log('\nAll Automatic Known-Peer Connection tests passed.');
}

run().catch((error) => {
    console.error('AutoConnectKnownPeers.test.js FAILED:', error);
    process.exitCode = 1;
});
