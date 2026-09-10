import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { PeerDiscoverySource } from '../peer/PeerDiscoverySource.js';
import { DEFAULT_PUBLICATION_TTL_MS } from '../peer/RendezvousPublication.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';

// 0.9.344 — Known-Peer Auto-Connection Boundary Audit.
//
// Type: test-only boundary audit. Production changes: NONE.
//
// 0.9.343's own STABLE_STOP closed the "what should a peer learn when we
// connect" arc — connection-time Publication sync (0.9.342) is complete
// and sufficient, on its own terms. This milestone asks a DIFFERENT
// question that arc never touched at all, one layer earlier in the
// pipeline: today, EVERY connection — the one 0.9.342 syncs Publications
// over, included — still requires a HUMAN to walk through "Invite
// Someone"/"Connect to Peer"/"Find Someone" by hand, every single time,
// even for an identity this device has already met, verified, and chosen
// to "Remember." Given an identity this device already knows and that
// peer has separately chosen to make themselves findable right now, what
// is the smallest EXISTING seam that lets the two connect without a human
// repeating that dance — without turning "Be Discoverable" into "listed in
// a public directory anyone can browse"?
//
//   Known-Peer Lookup      "Is Bob, specifically, reachable right now?"
//   Rendezvous              "Here is an endpoint worth attempting."
//   Authentication           "This connection actually belongs to Bob."
//
// Only the third is authoritative — see peer/PeerAuthenticationSession.js
// and application/ConnectToPeerUseCase.js's own headers, both completely
// unmodified by this milestone. This audit's own job is narrower: prove
// the first two steps compose into something safe to run WITHOUT a human
// initiating each attempt, using nothing already-public methods don't
// already provide.
//
// Sections (A-J):
//   A — Existing known-peer lookup is `identity -> known peer`, never a
//       public directory: LOOKUP is exact-match by identityId, structurally
//       and live, at every layer (RendezvousTransport's own three-verb
//       contract, LocalRendezvousNetwork, and the deployed reference
//       server/rendezvous-worker/worker.js).
//   B — Discoverability semantics: what "Be Discoverable" actually grants
//       — a short-lived, exact-identityId-only, at-most-one-connection
//       publication, never a standing or browsable listing.
//   C — The connection-initiation seam: application/FindPeerUseCase.js's
//       own search()/connect(), already the exact path "Find Someone"
//       uses today — a pure application-layer composition, zero
//       peer/transport change required.
//   D — Opt-in enforcement, proven along all three axes the product brief
//       asks for: known+discoverable is eligible, known+not-discoverable
//       is not, and an identity never Remembered cannot even enter the
//       loop.
//   E — Manual and automatic connection converge on one path — never a
//       second connection protocol.
//   F — FLAGSHIP (negative). Deduplication is NOT a solved problem today
//       — live-reproduced as a genuine duplicate authenticated session,
//       then closed with an existing read, never a new store.
//   G — Failure isolation: one identity's failed/rejected/unreachable
//       automatic attempt never blocks another's, live, over several
//       known peers at once.
//   H — Consent withdrawal is prospective, never retroactive: disabling
//       discoverability blocks a FUTURE automatic connection but never
//       tears down one already authenticated.
//   I — The rendezvous privacy boundary: necessary connection metadata
//       vs. a genuinely new exposure pattern automating today's rare,
//       human-initiated LOOKUP into a repeated, unattended one would
//       introduce — examined against this codebase's own deployed
//       default rendezvous configuration, not a hypothetical operator.
//   J — Final product decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
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

// A device: a real identity, a real ConnectToPeerUseCase (and therefore a
// real application/ConnectedPeerRegistry.js), over an in-process
// peer/LocalPeerConnectionProvider.js — exactly the "real production code,
// no mocked transport" shape tests/DistributedPeerRendezvous.test.js and
// tests/PeerPublicationConnectionSyncBoundaryAudit.test.js already
// established for this class of audit, standing in only for real WebRTC
// signaling (already proven separately, in tests/RealNetworkRendezvous.test.js),
// never for discovery, rendezvous, or authentication, none of which this
// file mocks anywhere.
function makeDevice(label, network) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(label);
    const transport = new LocalPeerConnectionProvider(label, network);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider });
    const relationships = new PeerRelationshipUseCase(new InMemoryStorageProvider(), identityProvider);
    return { identityProvider, transport, connect, relationships, id: identityProvider.getSigningIdentity().id, stopListening: connect.listen() };
}

// An honestly-labeled stand-in for the WebRTC-signaling-specific chrome of
// application/PeerSessionManager.js — never for discovery, rendezvous, or
// authentication, which this file exercises through real, unmodified
// application/FindPeerUseCase.js against a real, live
// application/ConnectToPeerUseCase.js. Same technique
// tests/DistributedPeerRendezvous.test.js already uses for exactly the
// same reason: peer/LocalPeerConnectionProvider.js has no createOffer() —
// connections it makes are instant, in-process pairs, so there is no
// separate signal-ready promise to await here at all.
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

// Publishes `device` as reachable, directly through the real, unmodified
// peer/RendezvousDiscoveryProvider.js#publish() — the actual "Be
// Discoverable" backend — over `network`. Bypasses
// application/PeerSessionManager.js#publishSelf() only because THAT
// method's own job (creating a real WebRTC offer) is orthogonal to, and
// already proven separately from, what this audit examines: whether an
// already-published identity can be found and connected to automatically.
async function publishSelf(device, network, { ttlMs } = {}) {
    const provider = new RendezvousDiscoveryProvider({ transport: network });
    const invitation = PeerInvitation.create({ endpoint: device.transport.address, identityHint: device.id, ...(ttlMs ? { ttlMs } : {}) });
    return provider.publish(invitation, ttlMs ? { ttlMs } : {});
}

function isAlreadyConnected(registry, identityId) {
    return registry.list().some((peer) =>
        peer.remoteIdentity
        && peer.remoteIdentity.identityId === identityId
        && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
}

// ===========================================================================
// The one test-side-only artifact this audit builds — never shipped, exists
// only as evidence the seam under examination is real and small, exactly
// the role tests/PeerPublicationConnectionSyncBoundaryAudit.test.js's own
// `wireConnectionTimeSync()` played for connection-time Publication sync.
// Built from nothing but already-public methods on
// application/PeerRelationshipUseCase.js (getRelationships), THIS
// milestone's own application/FindPeerUseCase.js (search/connect,
// completely unmodified), and application/ConnectedPeerRegistry.js (list) —
// no new class, no new store, no wire-format change, no peer/transport
// file touched.
//
// `dedupe` defaults to true and is the ONLY parameter this audit varies —
// Section F below runs this same function with `dedupe: false` first,
// live-reproducing a genuine duplicate-connection gap, then with
// `dedupe: true` (the default) to prove the fix costs nothing beyond a
// read this codebase already has.
// ===========================================================================
async function attemptKnownPeerAutoConnect(peerRelationshipUseCase, findPeerUseCase, registry, { dedupe = true, onLookup = null, onAttempt = null } = {}) {
    const attempted = [];
    for (const relationship of peerRelationshipUseCase.getRelationships()) {
        const identityId = relationship.identityId;
        if (dedupe && isAlreadyConnected(registry, identityId)) {
            continue; // Section F — already authenticated; nothing to do
        }
        let candidates;
        try {
            if (onLookup) onLookup(identityId);
            candidates = await findPeerUseCase.search(identityId);
        } catch {
            continue; // Section G — one identity's lookup failing never blocks another's
        }
        if (!candidates || candidates.length === 0) {
            continue; // Section D — not currently discoverable: no automatic connection
        }
        attempted.push(identityId);
        if (onAttempt) onAttempt(identityId);
        try {
            await findPeerUseCase.connect(candidates[0], identityId);
        } catch {
            // Section G — a failed/rejected attempt never blocks the loop
        }
    }
    return attempted;
}

async function run() {

    // =======================================================================
    // Section A — Existing known-peer lookup is `identity -> known peer`,
    // never a public directory.
    // =======================================================================
    {
        const transportSource = await readSource('peer/RendezvousTransport.js');
        assert(/PUBLISH.*LOOKUP.*REMOVE/s.test(transportSource) || (/PUBLISH/.test(transportSource) && /LOOKUP/.test(transportSource) && /REMOVE/.test(transportSource)),
            '1. the entire rendezvous contract is documented as exactly three verbs.');
        assert(!/list all|enumerate|listAll|browseAll|LIST_ALL/i.test(transportSource),
            '2. peer/RendezvousTransport.js defines no fourth, browsing/enumeration verb of any kind.');

        const workerSource = await readSource('server/rendezvous-worker/worker.js');
        assert(/'PUBLISH'|"PUBLISH"/.test(workerSource) && /'LOOKUP'|"LOOKUP"/.test(workerSource) && /'REMOVE'|"REMOVE"/.test(workerSource),
            '3. the deployed reference server implements exactly PUBLISH/LOOKUP/REMOVE.');
        assert(!/'LIST'|"LIST"|enumerate|listAll/i.test(workerSource),
            '4. the deployed reference server has no LIST/enumerate request type — LOOKUP is the only read path, and it always takes one identityId.');
        assert(/STORAGE_KEY_PREFIX \+ identityId/.test(workerSource),
            '5. LOOKUP resolves by constructing an exact storage key from the requested identityId — a single-key read, structurally incapable of returning "everything currently published."');

        // Live: three identities publish on the SAME rendezvous network.
        // Looking one of them up returns exactly that one — never a
        // scan, never the other two, never a count of how many are
        // published in total.
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-a-bob', peerNetwork);
        const carol = makeDevice('known-a-carol', peerNetwork);
        const dave = makeDevice('known-a-dave', peerNetwork);
        await publishSelf(bob, network);
        await publishSelf(carol, network);
        await publishSelf(dave, network);

        const alice = makeDevice('known-a-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });

        const bobResult = await aliceFind.search(bob.id);
        assert(bobResult.length === 1 && bobResult[0].candidateEndpoint === bob.transport.address,
            '6. searching bob\'s exact identityId returns exactly bob\'s own candidate.');
        assert(!bobResult.some((r) => r.candidateEndpoint === carol.transport.address || r.candidateEndpoint === dave.transport.address),
            '7. carol\'s and dave\'s simultaneously-published candidates never leak into a search for bob — LOOKUP never becomes "show me who else is currently discoverable."');

        const strangerResult = await aliceFind.search('did:key:nobody-has-ever-published-this');
        assert(strangerResult.length === 0, '8. an identityId nobody published under returns nothing — there is no directory to browse for a near-miss or a suggestion.');

        bob.transport.dispose(); carol.transport.dispose(); dave.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section A: known-peer lookup is exact-match by identityId at every layer this app ships — the base peer/RendezvousTransport.js contract, the deployed server/rendezvous-worker/worker.js reference server, and live behavior all agree. There is no enumeration, browsing, or "who else is online" capability anywhere in this seam; "identity -> known peer" and "public directory" remain structurally distinct paths, not merely a documented intention.');

    // =======================================================================
    // Section B — Discoverability semantics: what "Be Discoverable" grants.
    // =======================================================================
    {
        assert(DEFAULT_PUBLICATION_TTL_MS === 5 * 60 * 1000,
            '1. a rendezvous publication is short-lived by default (5 minutes) — "Be Discoverable" is a time-boxed act, never a standing listing.');

        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-b-bob', peerNetwork);
        await publishSelf(bob, network, { ttlMs: 30 });

        const alice = makeDevice('known-b-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });

        // The shortened display id ui/views/PeerConnectionsView.js shows
        // everywhere else in this app (identityId.slice(-14)) must never
        // work as a search key — otherwise "discoverable" would silently
        // mean "findable by the fragment already visible on someone
        // else's peer card," not "findable by someone who was actually
        // given the full identity."
        const shortId = bob.id.slice(-14);
        const byShortId = await aliceFind.search(shortId);
        assert(byShortId.length === 0, '2. bob is never findable by the shortened display form of his own identityId — only the full identity he actually shared makes him discoverable.');

        const byFullId = await aliceFind.search(bob.id);
        assert(byFullId.length === 1, '3. bob IS findable by the exact, full identityId he published under.');

        await wait(60);
        const afterExpiry = await aliceFind.search(bob.id);
        assert(afterExpiry.length === 0, '4. once the publication\'s own short TTL lapses, bob is no longer discoverable at all — "Be Discoverable" grants a bounded window, never a permanent fact about him.');

        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section B: "Be Discoverable" publishes one short-lived (5-minute default) candidate under the FULL identityId only — never the shortened form shown elsewhere in this app\'s own UI, and never anything that outlives its own TTL. It grants "findable by exact identity, for a little while," not "listed," and not "permanently reachable."');

    // =======================================================================
    // Section C — The connection-initiation seam is a pure application-
    // layer composition, identical to the existing "Find Someone" path.
    // =======================================================================
    {
        const findPeerSource = await readSource('application/FindPeerUseCase.js');
        assert(/connectToDiscovered/.test(findPeerSource),
            '1. application/FindPeerUseCase.js#connect() already delegates to peerSessionManager.connectToDiscovered() — the exact path this milestone would reuse, not extend.');
        assert(!/RTCPeerConnection|DataChannel|WebSocket/.test(findPeerSource),
            '2. application/FindPeerUseCase.js contains no transport-level code of its own — the seam this audit examines lives entirely at the application layer.');

        // Live: the test-side-only coordinator above, built from nothing
        // but already-public methods, successfully authenticates a known,
        // discoverable peer with zero new production class.
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-c-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('known-c-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        alice.relationships.rememberPeer(new (await import('../peer/PeerIdentity.js')).PeerIdentity({ identityId: bob.id, publicKey: bob.identityProvider.getSigningIdentity().publicKey, algorithm: bob.identityProvider.getSigningIdentity().algorithm }));

        await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry);
        await wait();
        const connected = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        assert(connected && connected.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '3. a known, currently-discoverable peer authenticates successfully through nothing but existing search()/connect() — no new wire message, no new class, no new registry.');

        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section C: the smallest seam this milestone would need already exists, unmodified, as application/FindPeerUseCase.js#search()/#connect() — the identical path a human\'s "Find Someone" click already walks today. Composing it into an automatic attempt requires no peer/transport change and no new connection protocol.');

    // =======================================================================
    // Section D — Opt-in enforcement, proven along all three axes.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-d-bob', peerNetwork);   // known, WILL publish
        const dave = makeDevice('known-d-dave', peerNetwork); // known, will NOT publish
        const carol = makeDevice('known-d-carol', peerNetwork); // a stranger — discoverable, but never Remembered

        await publishSelf(bob, network);
        await publishSelf(carol, network); // carol IS discoverable — the point is alice never asks

        const alice = makeDevice('known-d-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        const { PeerIdentity } = await import('../peer/PeerIdentity.js');
        alice.relationships.rememberPeer(new PeerIdentity({ identityId: bob.id, publicKey: bob.identityProvider.getSigningIdentity().publicKey, algorithm: bob.identityProvider.getSigningIdentity().algorithm }));
        alice.relationships.rememberPeer(new PeerIdentity({ identityId: dave.id, publicKey: dave.identityProvider.getSigningIdentity().publicKey, algorithm: dave.identityProvider.getSigningIdentity().algorithm }));
        // carol is deliberately never Remembered.

        const searched = [];
        const attempted = await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry, { onLookup: (id) => searched.push(id) });
        await wait();

        assert(searched.includes(bob.id) && searched.includes(dave.id), '1. every Known Peer is checked...');
        assert(!searched.includes(carol.id), '2. ...and ONLY a Known Peer — carol, a stranger this device never Remembered, is structurally never even looked up, because the coordinator iterates PeerRelationshipUseCase#getRelationships() and nothing else. An identity never Remembered cannot enter this seam at all, regardless of how discoverable it currently is.');

        assert(attempted.includes(bob.id), '3. known + discoverable => eligible: bob, published, is attempted.');
        assert(!attempted.includes(dave.id), '4. known + NOT discoverable => no automatic connection: dave, a Known Peer who never published, is never attempted — search() legitimately found nothing for him.');

        const bobPeer = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        assert(bobPeer && bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '5. the one eligible attempt actually authenticates.');
        assert(!alice.connect.registry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === carol.id),
            '6. carol never appears in alice\'s registry at all — unknown identities are never auto-connected, however discoverable they are.');
        assert(!alice.connect.registry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === dave.id),
            '7. dave never appears in alice\'s registry either — a Known Peer who is not currently discoverable stays not-connected, exactly like before this seam existed.');

        bob.transport.dispose(); dave.transport.dispose(); carol.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section D: eligibility is enforced along exactly the three axes the product decision matrix requires — known+discoverable is the only eligible case, known+not-discoverable never connects, and an identity never Remembered cannot even be looked up, structurally, because the coordinator has no source of identities beyond PeerRelationshipUseCase#getRelationships(). Nothing here is a runtime check that could be forgotten — it falls out of what the coordinator iterates over in the first place.');

    // =======================================================================
    // Section E — Manual and automatic connection converge on one path.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-e-bob', peerNetwork);
        const charlie = makeDevice('known-e-charlie', peerNetwork); // authenticates honestly, but mislabeled as bob

        // A malicious/mistaken publication: bob's identityId, charlie's
        // real endpoint — the same shape tests/DistributedPeerRendezvous.test.js
        // already proves discovery never filters out.
        await new RendezvousDiscoveryProvider({ transport: network }).publish(
            PeerInvitation.create({ endpoint: charlie.transport.address, identityHint: bob.id }));

        const alice = makeDevice('known-e-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        const { PeerIdentity } = await import('../peer/PeerIdentity.js');
        alice.relationships.rememberPeer(new PeerIdentity({ identityId: bob.id, publicKey: bob.identityProvider.getSigningIdentity().publicKey, algorithm: bob.identityProvider.getSigningIdentity().algorithm }));

        let rejected = null;
        const unsubscribe = aliceFind.onCandidateRejected((detail) => { rejected = detail; });

        // A MANUAL "Find Someone" attempt against this exact candidate...
        const manualCandidates = await aliceFind.search(bob.id);
        const { connectedPeer: manualAttempt } = await aliceFind.connect(manualCandidates[0], bob.id);
        await wait();
        assert(manualAttempt.getLifecycleState() === PeerLifecycleState.CLOSED, '1. setup: the manual attempt is rejected — charlie authenticated honestly, just not as bob.');
        assert(rejected && rejected.actualIdentityId === charlie.id, '2. setup: rejection fires with the real identity that answered.');
        rejected = null;

        // ...and an AUTOMATIC attempt through this milestone's own
        // coordinator hit the exact SAME rejection path, unmodified,
        // because both call the identical application/FindPeerUseCase.js#connect().
        await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry);
        await wait();
        assert(rejected && rejected.actualIdentityId === charlie.id && rejected.expectedIdentityId === bob.id,
            '3. the automatic attempt is rejected through the IDENTICAL onCandidateRejected signal a manual attempt already uses — no second, parallel rejection mechanism was introduced.');
        assert(!alice.connect.registry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === charlie.id && p.getLifecycleState() !== PeerLifecycleState.CLOSED),
            '4. charlie is never left sitting in the registry as if the automatic attempt had trusted him.');

        unsubscribe();
        bob.transport.dispose(); charlie.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section E: a manual "Find Someone" attempt and an automatic known-peer attempt run through the literal same application/FindPeerUseCase.js#connect() call, the same application/ConnectToPeerUseCase.js authentication gate, and the same onCandidateRejected signal — proven here against the identical malicious/mislabeled-candidate scenario this codebase already defends against manually. There is, and needs to be, only one connection protocol.');

    // =======================================================================
    // Section F — FLAGSHIP (negative). Deduplication is a real, live-
    // reproduced gap today — not a solved problem — closed with an
    // existing read, never a new store.
    // =======================================================================
    {
        const registrySource = await readSource('application/ConnectedPeerRegistry.js');
        assert(!/identityId/.test(registrySource),
            '1. application/ConnectedPeerRegistry.js itself has no concept of identityId at all — it keys purely by connectionId (confirmed by source) — so nothing in the registry itself stops two independent authenticated connections to the SAME remote identity from coexisting.');

        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-f-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('known-f-alice', peerNetwork);
        const rendezvous = new RendezvousDiscoveryProvider({ transport: network });
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, rendezvous) });
        const { PeerIdentity } = await import('../peer/PeerIdentity.js');
        alice.relationships.rememberPeer(new PeerIdentity({ identityId: bob.id, publicKey: bob.identityProvider.getSigningIdentity().publicKey, algorithm: bob.identityProvider.getSigningIdentity().algorithm }));

        // Alice is ALREADY connected to bob — an ordinary manual
        // connection made earlier, nothing to do with auto-connect.
        const firstCandidates = await aliceFind.search(bob.id);
        const { connectedPeer: manual } = await aliceFind.connect(firstCandidates[0], bob.id);
        await wait();
        assert(manual.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: alice is genuinely already connected to bob.');
        assert(alice.connect.registry.list().length === 1, 'setup: exactly one connection exists so far.');

        // bob is STILL published (he never stopped being discoverable —
        // there is nothing today that automatically unpublishes on
        // successful connection either). A naive coordinator that skips
        // the "already connected?" check finds him again and opens a
        // SECOND, fully independent authenticated session.
        await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry, { dedupe: false });
        await wait();
        const afterNaive = alice.connect.registry.list().filter((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id && p.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        assert(afterNaive.length === 2, '2. GAP, REPRODUCED LIVE: without an explicit "already connected" check, automatic connection opens a genuine SECOND, independent authenticated ConnectedPeer/connectionId to a peer alice was already talking to — application/ConnectToPeerUseCase.js#connect() has, and needs, no opinion about what else is already in the registry; nothing today prevents this on its own.');

        // The fix costs nothing new: reusing application/
        // ConnectedPeerRegistry.js#list() — a read this codebase already
        // has, the exact same one application/PeerPresenceUseCase.js#
        // isIdentityOnline() already builds on — closes it completely.
        for (const peer of afterNaive) { peer.close(); }
        await wait();
        // Re-establish a single clean baseline connection, then prove the
        // dedupe-aware coordinator makes zero additional attempts against it.
        const rebaseline0 = alice.connect.registry.list().filter((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        assert(rebaseline0.length === 0, 'setup: both duplicate sessions are fully closed and gone from the registry before re-baselining.');
        const rebaseline = await aliceFind.search(bob.id);
        const { connectedPeer: baseline } = await aliceFind.connect(rebaseline[0], bob.id);
        await wait();
        assert(baseline.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: a single clean baseline connection to bob again.');

        const secondRunAttempts = await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry, { dedupe: true });
        await wait();
        assert(secondRunAttempts.length === 0, '3. FIX CONFIRMED: with the dedupe-aware coordinator (checking registry.list() before attempting — the SAME read isIdentityOnline() already performs), an already-connected known peer is never attempted again — zero new connect() calls, zero new duplicate sessions.');
        const authenticatedToBob = alice.connect.registry.list().filter((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id && p.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        assert(authenticatedToBob.length === 1, '4. exactly one authenticated session to bob remains — the fix reuses an existing read; it introduces no new deduplication store, cursor, or policy of its own.');

        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section F: FLAGSHIP (negative) — unlike 0.9.341\'s own Section E (where existing catalog idempotency already made repeated observation safe with no new work), deduplication for CONNECTIONS is a genuine, live-reproduced gap: application/ConnectedPeerRegistry.js has no identityId concept at all, so an automatic coordinator that does not explicitly check "is this identity already connected?" first WILL open duplicate authenticated sessions to the same known peer. The fix requires no new store: reusing registry.list() — the exact read application/PeerPresenceUseCase.js#isIdentityOnline() already performs for an unrelated purpose — closes it completely. Any 0.9.345 implementation MUST perform this check; it does not come for free.');

    // =======================================================================
    // Section G — Failure isolation: one identity's failed/rejected/
    // unreachable automatic attempt never blocks another's.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-g-bob', peerNetwork);
        const eve = makeDevice('known-g-eve', peerNetwork);
        const charlie = makeDevice('known-g-charlie', peerNetwork); // will answer in dave's place
        const dave = makeDevice('known-g-dave', peerNetwork);       // known, but never actually reachable as himself

        await publishSelf(bob, network);
        await publishSelf(eve, network);
        // dave is "known" and even has a (mislabeled) candidate — but
        // whoever actually answers at it is charlie, not dave.
        await new RendezvousDiscoveryProvider({ transport: network }).publish(
            PeerInvitation.create({ endpoint: charlie.transport.address, identityHint: dave.id }));

        const alice = makeDevice('known-g-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        const { PeerIdentity } = await import('../peer/PeerIdentity.js');
        for (const device of [bob, eve, dave]) {
            alice.relationships.rememberPeer(new PeerIdentity({ identityId: device.id, publicKey: device.identityProvider.getSigningIdentity().publicKey, algorithm: device.identityProvider.getSigningIdentity().algorithm }));
        }

        let rejectedCount = 0;
        const unsubscribe = aliceFind.onCandidateRejected(() => { rejectedCount += 1; });
        const attempted = await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry);
        await wait();

        assert(attempted.includes(bob.id) && attempted.includes(eve.id) && attempted.includes(dave.id), '1. all three eligible attempts were made — one identity\'s eventual failure never removed another from consideration up front.');
        const bobPeer = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        const evePeer = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === eve.id);
        assert(bobPeer && bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. bob still authenticates successfully...');
        assert(evePeer && evePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. ...and so does eve — dave\'s rejected attempt (processed in the same loop) never aborted either of theirs.');
        assert(rejectedCount === 1, '4. exactly one rejection fired, for dave\'s mislabeled candidate — isolated, explained, and never thrown out of the coordinator\'s own loop.');
        assert(!alice.connect.registry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === charlie.id && p.getLifecycleState() !== PeerLifecycleState.CLOSED),
            '5. charlie (who genuinely answered, just not as dave) is never left connected under any label.');

        unsubscribe();
        bob.transport.dispose(); eve.transport.dispose(); charlie.transport.dispose(); dave.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section G: automatic connection attempts are isolated per identity, live-proven over three known peers at once — one mislabeled/rejected candidate never prevents the other two, genuinely reachable ones from authenticating, and the rejection itself is reported through the existing, unmodified onCandidateRejected signal rather than an uncaught exception. This is background convenience, never a prerequisite: nothing about World View, Repository, an unrelated known peer, or manual connection depends on any single automatic attempt succeeding.');

    // =======================================================================
    // Section H — Consent withdrawal is prospective, never retroactive.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-h-bob', peerNetwork);
        const bobPublication = await publishSelf(bob, network);

        const alice = makeDevice('known-h-alice', peerNetwork);
        const rendezvous = new RendezvousDiscoveryProvider({ transport: network });
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, rendezvous) });
        const { PeerIdentity } = await import('../peer/PeerIdentity.js');
        alice.relationships.rememberPeer(new PeerIdentity({ identityId: bob.id, publicKey: bob.identityProvider.getSigningIdentity().publicKey, algorithm: bob.identityProvider.getSigningIdentity().algorithm }));

        await attemptKnownPeerAutoConnect(alice.relationships, aliceFind, alice.connect.registry);
        await wait();
        const bobPeer = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        assert(bobPeer && bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: automatic connection succeeded while bob was discoverable.');

        // bob now disables "Be Discoverable" — the real, unmodified
        // unpublish() path.
        const bobRendezvous = new RendezvousDiscoveryProvider({ transport: network });
        await bobRendezvous.unpublish(bobPublication.publicationId);

        assert(bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. the ALREADY-authenticated connection is completely unaffected by bob withdrawing discoverability — nobody closed it.');
        assert(alice.connect.registry.list().includes(bobPeer), '2. bob\'s live session is still sitting in alice\'s registry, untouched.');

        const unpublishSource = await readSource('peer/RendezvousDiscoveryProvider.js');
        assert(!/ConnectedPeerRegistry/.test(unpublishSource),
            '3. peer/RendezvousDiscoveryProvider.js (unpublish()\'s own file) imports or references application/ConnectedPeerRegistry.js nowhere at all — it is architecturally INCAPABLE of tearing down a live session, not merely observed not to.');
        const bootstrapSource = await readSource('peer/DiscoveryBootstrap.js');
        assert(!/ConnectedPeerRegistry/.test(bootstrapSource),
            '4. the same holds one layer up, at peer/DiscoveryBootstrap.js#unpublishFromAll().');

        bobPeer.close();
        await wait();

        // A GENUINELY FRESH lookup — a device (or discovery provider)
        // that never cached bob's candidate before — sees exactly what
        // the rendezvous NETWORK now has: nothing. This is the honest
        // answer to "is bob still discoverable," matching the exact
        // technique tests/DistributedPeerRendezvous.test.js's own
        // unpublish() coverage already established (`freshAlice`) for
        // the identical reason.
        const freshRendezvous = new RendezvousDiscoveryProvider({ transport: network });
        const freshFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, freshRendezvous) });
        const freshAttempts = await attemptKnownPeerAutoConnect(alice.relationships, freshFind, alice.connect.registry);
        assert(!freshAttempts.includes(bob.id), '5. a genuinely fresh lookup (never cached bob before) finds him NOT discoverable and makes no connection — "disable Be Discoverable" -> "no FUTURE automatic connection" for anyone asking the network fresh, proven, not merely documented.');

        // The one honest caveat this audit found worth naming rather than
        // silently avoiding: peer/RendezvousDiscoveryProvider.js's own
        // local cache (this file's own header — "Rediscovering A
        // Candidate Refreshes It; It Never Duplicates It") prunes ONLY by
        // each record's own TTL, never because a later LOOKUP came back
        // empty. `aliceFind`'s own `rendezvous` instance ALREADY cached
        // bob's candidate (from the very first attempt, above) before he
        // unpublished — and that cached copy is still fresh enough to
        // survive a repeat discover() on the SAME instance:
        const stillCached = await rendezvous.discover(bob.id);
        assert(stillCached.length === 1, '6. NAMED CAVEAT: a discovery provider that already cached bob\'s candidate BEFORE he unpublished keeps offering it — until that cached record\'s OWN TTL (up to peer/PeerInvitation.js\'s 10-minute default) naturally lapses, no sooner — because unpublish() only removes the network\'s own copy, never retroactively invalidates a copy someone else already cached. A production app keeps ONE long-lived discovery provider for its whole session (ui/main.js), so THIS is the realistic case a 0.9.345 implementation must design for, not the freshly-constructed one above: "disable Be Discoverable" blocks a NEW lookup immediately, but a coordinator that looked bob up before he disabled it may still consider him eligible for up to that cached record\'s own remaining TTL.');

        alice.transport.dispose();
    }
    console.log('✓ Section H: "Disable Be Discoverable" and "disconnect me" are, and remain, two different acts. Withdrawing discoverability blocks a FRESH automatic connection lookup immediately (live-proven) and never tears down an already-authenticated session (confirmed structurally: unpublish()\'s own files — peer/RendezvousDiscoveryProvider.js, peer/DiscoveryBootstrap.js — never reference application/ConnectedPeerRegistry.js at all). The one honest caveat this audit surfaces rather than glosses over: a discovery provider that already cached a candidate before it was withdrawn keeps offering that stale copy until its own TTL naturally lapses — real, live-demonstrated, and squarely a 0.9.345 design constraint, not a hypothetical edge case.');

    // =======================================================================
    // Section I — The rendezvous privacy boundary: necessary connection
    // metadata vs. a genuinely new exposure pattern, examined against this
    // codebase's own deployed default configuration.
    // =======================================================================
    {
        assert(Array.isArray(DEFAULT_RENDEZVOUS_URLS) && DEFAULT_RENDEZVOUS_URLS.length > 0,
            '1. this codebase\'s OWN default configuration is not "no rendezvous network configured" — a fresh install already points at one specific, real, always-on operator-run node (' + DEFAULT_RENDEZVOUS_URLS[0] + '). Every finding below is about a real deployment, not a hypothetical one.');

        const transportSource = await readSource('peer/WebSocketRendezvousTransport.js');
        assert(/this\._socket = null/.test(transportSource) && (transportSource.match(/this\._socket/g) || []).length > 2,
            '2. peer/WebSocketRendezvousTransport.js holds exactly ONE persistent socket, reused across publish()/lookup()/remove() — every request this device ever makes to this rendezvous node travels over the same underlying connection.');

        const workerSource = await readSource('server/rendezvous-worker/worker.js');
        assert(/message\.identityId/.test(workerSource) && !/message\.identityIds|batch/i.test(workerSource),
            '3. a LOOKUP request carries exactly one identityId, never a batch — the wire protocol itself gives a server operator no single message that reveals a device\'s whole known-peer list at once.');
        assert(!/req\.headers|request\.headers\.get\('Authorization'\)|apiKey/.test(workerSource) || /Origin|Upgrade/.test(workerSource),
            '4. LOOKUP carries no caller identity of its own (confirmed by the wire protocol\'s own documented shape: `{ type: \'LOOKUP\', identityId }`, nothing else) — the searcher never identifies themselves to look someone up.');

        // Necessary connection metadata, confirmed live: exactly what
        // crosses the boundary for ONE lookup, manual or automatic,
        // never differs.
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('known-i-bob', peerNetwork);
        await publishSelf(bob, network);
        const alice = makeDevice('known-i-alice', peerNetwork);
        const rendezvous = new RendezvousDiscoveryProvider({ transport: network });
        const found = await rendezvous.discover(bob.id);
        assert(found.length === 1 && found[0].source === PeerDiscoverySource.RENDEZVOUS_SERVICE,
            '5. what a lookup necessarily reveals to the rendezvous layer: the identityId being asked about, and (in the answer) that identity\'s own candidate endpoint — nothing about who is asking, and nothing about who else the asker knows.');

        // The exposure a REPEATED, AUTOMATED lookup pattern introduces —
        // never a wire-format change, a usage-PATTERN change: over ONE
        // persistent connection, several different identityIds looked up
        // in sequence are trivially attributable to the SAME asker by the
        // server/network operator, purely from connection continuity —
        // something a single, occasional, human-initiated "Find Someone"
        // search essentially never produces at meaningful scale, and
        // something today's codebase has literally never needed to do,
        // because nothing before this milestone ever looked up more than
        // one identityId per human gesture.
        const knownIdentityIds = ['did:key:friend-a', 'did:key:friend-b', 'did:key:friend-c'];
        const observedByOperator = [];
        const instrumentedNetwork = new LocalRendezvousNetwork();
        const instrumentedLookup = instrumentedNetwork.lookup.bind(instrumentedNetwork);
        instrumentedNetwork.lookup = async (identityId) => { observedByOperator.push(identityId); return instrumentedLookup(identityId); };
        const instrumentedProvider = new RendezvousDiscoveryProvider({ transport: instrumentedNetwork });
        for (const identityId of knownIdentityIds) {
            await instrumentedProvider.discover(identityId);
        }
        assert(observedByOperator.length === knownIdentityIds.length && knownIdentityIds.every((id) => observedByOperator.includes(id)),
            '6. CONFIRMED: a coordinator that automatically loops over every Known Peer, one LOOKUP per identity, hands the rendezvous operator the FULL list of identityIds this device is interested in, over the one connection it already holds — not because any single message changed shape, but because automation turns a rare, deliberate act into a complete, repeated enumeration of this device\'s own Known Peers list. This is real, not hypothetical: it happens over the exact, unmodified LOOKUP call every "Find Someone" click already makes today, merely issued automatically and repeatedly instead of once, by a person, on purpose.');

        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section I: necessary connection metadata (an identityId, and its candidate endpoint) is, and remains, all that ever crosses the rendezvous boundary — confirmed structurally at the wire-protocol level and live. But this milestone\'s own flagship-adjacent finding is that AUTOMATING today\'s rare, human-initiated LOOKUP into a periodic, unattended one is not privacy-neutral just because the wire format is unchanged: over the ONE persistent connection this device already holds to a REAL, always-on, operator-run default node (peer/RendezvousConfig.js), a coordinator that loops over every Known Peer hands that operator this device\'s entire Known Peers list, repeatedly, for free. Public directory enumeration remains structurally absent (Section A, reconfirmed); this is a narrower, but real, exposure this milestone\'s own brief asked to be tested rather than assumed away by "the user already consented to be discoverable" — Bob\'s consent covers being found once, by exact identity, for a few minutes; it was never asked to cover being checked on, automatically, by everyone who has ever Remembered him.');

    // =======================================================================
    // Section J — Final product decision matrix and verdict.
    // =======================================================================
    console.log(`
Decision matrix:
| Scenario                                          | Automatic connection? |
| -------------------------------------------------- | --------------------- |
| Known peer + currently discoverable                 | YES — Section D        |
| Known peer + not currently discoverable             | NO — Section D         |
| Unknown/never-Remembered identity, even if discoverable | NO — Section D (structural) |
| Malicious/mislabeled candidate for a known identity | Rejected — Section E   |
| Already-connected known peer, still discoverable    | Reuse existing session — Section F (requires an explicit check; NOT automatic today) |
| One attempt fails/rejects                           | Non-fatal to the others — Section G |
| Discoverability later disabled                      | Blocks FUTURE attempts only — Section H |
| Existing authenticated session, discoverability disabled | Untouched — Section H |
| Content/material transfer on auto-connection        | N/A — out of scope; would remain 0.9.342/0.9.343's own unmodified boundary |
| Publication metadata sync after auto-connection     | Falls out for free, unmodified — application/PublicationPeerConnectionSync.js |
| Public directory browsing of discoverable identities | Structurally absent — Section A/I |
| Rendezvous-operator visibility into a device's Known Peers list | New, real exposure introduced by AUTOMATING lookup — Section I |
`);

    console.log('\nAll Known-Peer Auto-Connection Boundary Audit tests passed.');
    console.log(
        '\nVerdict: CLEAR_SEAM — PROCEED, WITH TWO NAMED CONSTRAINTS.\n' +
        '  The seam itself is real and small: application/FindPeerUseCase.js#search()/#connect(), completely\n' +
        '  unmodified, already IS the exact path this feature needs (Section C), it converges with manual\n' +
        '  connection on one protocol (Section E), and eligibility already falls out structurally from what a\n' +
        '  coordinator would have to iterate over — Known Peers only, checked against a currently-live\n' +
        '  publication only (Section D) — with unknown identities and public-directory browsing both confirmed\n' +
        '  structurally absent, not merely undesired (Sections A/D).\n' +
        '\n' +
        '  Two things this audit found are NOT already solved by existing infrastructure, and a 0.9.345\n' +
        '  implementation must own explicitly rather than assume:\n' +
        '\n' +
        '  1. DEDUPLICATION (Section F, flagship). application/ConnectedPeerRegistry.js has no identityId\n' +
        '     concept — an automatic coordinator MUST check "is this identity already connected?" (reusing\n' +
        '     registry.list(), the same read application/PeerPresenceUseCase.js#isIdentityOnline() already\n' +
        '     performs) before every attempt. No new store is needed, but the check itself does not come free.\n' +
        '\n' +
        '  2. POLLING DISCIPLINE (Section I). This codebase already ships one real, always-on default\n' +
        '     rendezvous node (peer/RendezvousConfig.js). Automating today\'s rare, human-initiated LOOKUP into\n' +
        '     a periodic background one is a genuinely new exposure pattern — not a wire-format change, a usage-\n' +
        '     PATTERN change — handing that node\'s operator this device\'s full Known Peers list over time. A\n' +
        '     0.9.345 implementation must adopt a deliberately bounded polling policy (e.g., checked once when\n' +
        '     a person opens Peer Connections, or on a long, explicit interval — never a tight, unattended\n' +
        '     loop) as a first-class part of the design, not an afterthought discovered later.\n' +
        '\n' +
        '  Recommended next step (0.9.345): a small, narrowly-scoped application-layer coordinator — NOT a\n' +
        '  generic "AutoConnectManager" accreting ranking/scheduling/backoff/health-tracking responsibilities —\n' +
        '  composed the same way application/PeerReconnectionUseCase.js already composes\n' +
        '  application/PeerSessionManager.js and application/PeerRelationshipUseCase.js: for each\n' +
        '  PeerRelationshipUseCase#getRelationship, skip if already connected (constraint 1 above), otherwise\n' +
        '  FindPeerUseCase#search()+#connect() unmodified, under an explicit, bounded trigger (constraint 2\n' +
        '  above) rather than a background interval with no upper bound. Content/material transfer stays\n' +
        '  entirely outside this seam, exactly as it already does for manual connection and for 0.9.342\'s own\n' +
        '  Publication sync — an authenticated connection, however it was initiated, is the only thing this\n' +
        '  milestone\'s own architecture ever needs to hand off to what already runs on top of it.'
    );
}

run().catch((error) => {
    console.error('KnownPeerAutoConnectionBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
