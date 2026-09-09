import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';

// 0.9.341 — Peer Publication Connection-Sync Boundary Audit.
//
// Type: test-only boundary audit. Production changes: NONE.
//
// 0.9.340 closed the Federated Repository Publication arc (0.9.330-0.9.339)
// with a STABLE_STOP verdict, and drew one deliberate line while doing it:
// *proactive* decentralized search — Repository itself reaching into Nostr
// or a peer with no prior lead — remains an excluded, separate, future
// problem (0.9.330 Section H). This milestone is not that. It asks a
// narrower, product-adjacent question 0.9.340 never examined at all: when
// two replicas that already know how to gossip a Publication (0.7.3)
// simply CONNECT, does either one learn what the other already holds — or
// does today's peer architecture require a human to explicitly click
// "Publish to Network" again, after the fact, for every peer who happens
// to already be online at that exact moment?
//
//   Peer synchronization answers "What should a peer learn when we connect?"
//   Indexing answers "How can I find publications from peers who are not
//   currently connected?"
//
// The first is this milestone's own question, answerable entirely inside
// the existing peer architecture. The second is 0.9.340's own excluded
// territory, untouched here. This file gathers evidence for the first
// question only, against real, unmodified production code, and changes no
// production file to do it.
//
// Sections (A-J):
//   A — Existing peer connection lifecycle: the exact connection-
//       established seam application/PublicationPeerExchange.js already
//       subscribes to, and what it does — and does not — do with it today.
//   B — Existing publication exchange capability: the live wire already
//       carries a complete DecentralizedPublication envelope, unmodified,
//       under the SAME protocol a connection-time announce would reuse.
//   C — Metadata-only boundary: connection-time sharing never implies
//       content/material transfer, structurally and live.
//   D — FLAGSHIP: the late-joining peer journey. Reproduces, live, that
//       today's architecture does NOT deliver an already-published
//       Publication to a peer who connects afterward — then closes that
//       exact gap with the smallest possible seam, wired test-side only,
//       using nothing but existing public methods.
//   E — Reconnection / repeated observation: proves the existing
//       catalog-level idempotency already makes repeated connection-time
//       observation safe, with no new deduplication policy required.
//   F — Multiple Publications: one connection exchanges several
//       Publications' metadata without ever fetching any of their content.
//   G — Publication identity: every envelope field survives a
//       connection-time round trip unchanged; documentId/title/author/
//       license are traced to where they actually live — resolution, not
//       the envelope — reconfirming Discovery Is Not Resolution (0.7.2).
//   H — Notification boundary: whether an unambiguous awareness-worthy
//       event already exists for connection-time sync, checked against
//       this codebase's own NotificationEvent boundary criteria (0.9.274).
//   I — Repository convergence: the connection-sync seam feeds
//       Repository's existing discovery/composite chain with zero
//       Repository-specific peer logic.
//   J — Offline / indexing boundary: an architectural invariant — a peer
//       that never connects is never reached by this seam, live-proven,
//       marking the exact edge where a future indexing layer would begin.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — a
// minimal in-memory shim, installed ONLY when no window already exists (a
// real browser test run never hits this branch). Same posture as
// tests/FederatedRepositoryProductReassessment.test.js.
if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

// A full, forkable Publication — the SAME `PUBLICATION_CONTENT_KIND`
// content kind 0.9.331-0.9.340 already proved travels through the
// decentralized resolution pipeline unmodified, so this audit's own
// findings connect directly to Repository, not to a synthetic stand-in
// content kind no real journey ever uses.
function makePublication({ documentId, title, author, license = new License({ id: LicenseId.CC0_1_0 }) }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256
    });
    let publication = new Publication({
        documentId,
        title,
        author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// The exact production admission gate ui/views/DecentralizedPublicationsView.js
// runs — reproduced test-side, the same posture 0.9.337-0.9.340's own
// flagship tests already establish is faithful to production.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

// ===================================================================
// Section D's own proposed seam, reproduced HERE, TEST-SIDE ONLY.
//
// This function is not, and must never be mistaken for, a production
// change — it lives in this test file alone, and this milestone adds it
// to no production file. It exists to answer Section D's own question
// concretely: is there a seam small enough to close the late-joining-peer
// gap using ONLY methods application/PublicationPeerExchange.js,
// application/LocalPublicationCatalog.js, and application/
// ConnectedPeerRegistry.js already expose, with no wire-format change, no
// new message kind, and no new class?
//
// Policy, deliberately the simplest one that needs no new primitive:
// whenever application/ConnectedPeerRegistry.js's own onChange reports a
// peer reaching AUTHENTICATED for the first time, re-announce this
// replica's ENTIRE catalog to every currently authenticated peer — the
// exact same broadcast application/PublicationPeerExchange.js#announce()
// already performs for a freshly published Publication, called once per
// already-cataloged entry instead of once for a new one. Re-announcing to
// peers who already hold an entry is never a new concern this seam has to
// solve: Section E below reconfirms application/LocalPublicationCatalog.js's
// own add()/isNew idempotency already makes that free.
//
// `syncedConnectionIds` exists only so a peer whose lifecycle state
// changes for an unrelated reason (e.g. CONNECTING, or an already-synced
// peer's registry entry changing shape) is never re-processed — it is
// bookkeeping for THIS test-side reproduction, not a new production
// concept; a real implementation could equally track this differently
// (or not at all, given re-announcement is already harmless).
function wireConnectionTimeSync(catalog, peerExchange, connectedPeerRegistry) {
    const syncedConnectionIds = new Set();
    const announceCatalogTo = () => {
        for (const publication of catalog.list()) {
            peerExchange.announce(publication);
        }
    };
    const unsubscribe = connectedPeerRegistry.onChange((peers) => {
        const newlyAuthenticated = peers.filter((peer) =>
            peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && !syncedConnectionIds.has(peer.connectionId));
        if (newlyAuthenticated.length === 0) {
            return;
        }
        for (const peer of newlyAuthenticated) {
            syncedConnectionIds.add(peer.connectionId);
        }
        announceCatalogTo();
    });
    return unsubscribe;
}

// A minimal, real, two-party live connection — reused by every section
// below that needs one. Returns everything a caller needs to dispose it
// again. Two independent identities/catalogs/buses per party, exactly
// the shape 0.7.3's own flagship and every Federated Repository audit
// since have used.
async function connectTwoPeers(aliceLabel, bobLabel, networkLabelPrefix) {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity(aliceLabel);
    const bob = makeIdentity(bobLabel);

    const aliceTransport = new LocalPeerConnectionProvider(`${networkLabelPrefix}-alice`, network);
    const bobTransport = new LocalPeerConnectionProvider(`${networkLabelPrefix}-bob`, network);
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopListening = aliceConnect.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: `${networkLabelPrefix}-alice` });
    await wait(20);
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: a real, live, authenticated peer connection.');

    return {
        network, alice, bob, aliceTransport, bobTransport, aliceConnect, bobConnect, bobConnectedPeer, stopListening,
        dispose() {
            stopListening();
            aliceTransport.dispose();
            bobTransport.dispose();
        }
    };
}

async function run() {
    console.log('Running Peer Publication Connection-Sync Boundary Audit tests...\n');

    // ===============================================================
    // Section A — Existing peer connection lifecycle: the exact
    // connection-established seam, and what it does today.
    // ===============================================================
    {
        // 1. Structural: application/PublicationPeerExchange.js's own
        // constructor already subscribes to connectedPeerRegistry.onChange
        // — but only ever to attach the message bus, never to announce.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        const onChangeCallback = peerExchangeSource.match(/this\._unsubscribeRegistry = this\._registry\.onChange\(\(peers\) => \{([\s\S]*?)\}\);/);
        assert(onChangeCallback, '1. PublicationPeerExchange subscribes to connectedPeerRegistry.onChange() — the connection-established seam already exists.');
        assert(onChangeCallback[1].includes('this._bus.attach(peer)'), '2. the onChange body attaches the bus to every peer it reports.');
        assert(!/announce/i.test(onChangeCallback[1]), '3. the onChange body never announces anything — bus attachment and publication announcement are, today, two completely separate acts.');

        // 4. Live: reconfirm the connection-established seam actually
        // fires exactly this way against a REAL, live authenticated peer
        // (not a stub) with a publication already cataloged BEFORE the
        // connection exists.
        const session = await connectTwoPeers('alice-a', 'bob-a', 'sect-a');
        const verifier = new LocalAuthorizationVerifier();
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'sect-a-1', title: 'Section A Publication', author: 'alice-a' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);

        // The connection was already live BEFORE alicePeerExchange even
        // existed — proving the gap is not "the exchange missed a change
        // event," but that no code anywhere calls announce() on connect.
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);

        await wait(20);
        assert(bobCatalog.has(envelope.id) === false,
            '5. today, constructing PublicationPeerExchange against an already-live connection never delivers a publication that was cataloged before it existed — connecting alone announces nothing.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section A: application/PublicationPeerExchange.js already subscribes to the connection-established seam (connectedPeerRegistry.onChange) — but today uses it ONLY to attach the message bus, never to announce. This is the smallest existing hook a connection-time sync would extend, live-reconfirmed against a real authenticated connection.');

    // ===============================================================
    // Section B — Existing publication exchange capability: the wire
    // already carries a complete envelope, unmodified.
    // ===============================================================
    {
        // 1. Structural: the ANNOUNCE wrapper never inspects or strips
        // any field of the envelope it carries.
        const protocolSource = await readSource('application/PublicationPeerProtocol.js');
        assert(protocolSource.includes('return { kind: PublicationPeerMessageKind.ANNOUNCE, envelope };'),
            '1. toPublicationAnnounceMessage() wraps the envelope whole, unmodified — no field is added, removed, or renamed for the wire.');

        // 2. Live: every field DecentralizedPublication.toJSON() produces
        // survives an announce/receive round trip byte for byte.
        const session = await connectTwoPeers('alice-b', 'bob-b', 'sect-b');
        const verifier = new LocalAuthorizationVerifier();
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);

        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'sect-b-1', title: 'Section B Publication', author: 'alice-b' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);
        alicePeerExchange.announce(envelope);
        await wait(20);

        assert(bobCatalog.has(envelope.id), '2. the envelope was received and cataloged.');
        const received = bobCatalog.get(envelope.id);
        assert(JSON.stringify(received.toJSON()) === JSON.stringify(envelope.toJSON()),
            '3. every field of the received envelope — kind, schemaVersion, id, contentKind, contentSchemaVersion, contentReference, publisherIdentity, publishedAt, signature — is byte-for-byte identical to what Alice published. No wire-format change is needed to carry a complete Publication metadata envelope.');

        // 4. The SAME protocol string a manual, explicit "Publish to
        // Network" announce already uses today (EditorView.js) is the one
        // a connection-time announce would reuse — no second, parallel
        // protocol is needed.
        assert(PublicationPeerExchange.DEFAULT_PROTOCOL === 'forkbuild:publication',
            '4. connection-time sync would multiplex over the identical, already-namespaced protocol every manual announce already uses.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section B: application/PublicationPeerExchange.js can already carry a complete DecentralizedPublication envelope end to end with zero wire-format change. A connection-time announce is a new CALLER of announce(), never a new protocol, message kind, or class.');

    // ===============================================================
    // Section C — Metadata-only boundary: connection-time sharing
    // never implies content/material transfer.
    // ===============================================================
    {
        // 1. Structural: neither the exchange nor the protocol file
        // imports anything content/resolution-shaped.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        const protocolSource = await readSource('application/PublicationPeerProtocol.js');
        for (const source of [peerExchangeSource, protocolSource]) {
            assert(!/import .*PublicationResolver/.test(source), '1. no import of PublicationResolver.js.');
            assert(!/import .*ContentStore/.test(source), '2. no import of any ContentStore.');
            assert(!/import .*PeerContentExchange/.test(source), '3. no import of PeerContentExchange.js (the actual content-transfer transport, 0.7.4).');
        }

        // 4. Live: a peer-delivered publication resolves to
        // CONTENT_UNAVAILABLE the instant it arrives — the exchange
        // itself never fetched, and never attempted to fetch, any bytes.
        const session = await connectTwoPeers('alice-c', 'bob-c', 'sect-c');
        const verifier = new LocalAuthorizationVerifier();
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);
        const bobContentStorage = new InMemoryStorageProvider();
        const bobResolver = new PublicationResolver(new LocalContentStore(bobContentStorage), verifier);

        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'sect-c-1', title: 'Section C Publication', author: 'alice-c' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);
        alicePeerExchange.announce(envelope);
        await wait(20);

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(bobCatalog.get(envelope.id), { coordinator, kindPlugins });
        assert(view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '4. the received publication resolves to CONTENT_UNAVAILABLE — receiving its metadata over the wire never made its content available.');
        assert(bobContentStorage.list().length === 0, '5. Bob\'s own content store was never touched by the exchange itself.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section C: connection-time publication metadata exchange has no content/material transfer component, structurally (no resolver/content-store import) and live (a received publication is CONTENT_UNAVAILABLE the instant it arrives). "Connection sync" cannot quietly become bulk replication — retrieving actual bytes stays application/PublicationResolver.js\'s and application/PeerContentExchange.js\'s own, entirely separate, explicit job.');

    // ===============================================================
    // Section D — FLAGSHIP: the late-joining peer journey.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();

        // --- Part 1: reproduce today's real gap, live. -----------------
        const session1 = await connectTwoPeers('alice-d1', 'bob-d1', 'sect-d1');
        const aliceCatalog1 = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange1 = new PublicationExchange(aliceCatalog1, verifier);
        const aliceResolver1 = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);

        // Alice publishes and catalogs — while Bob is not connected at all.
        const publication1 = makePublication({ documentId: 'late-joiner-1', title: 'Published While Bob Was Offline', author: 'alice-d1' }, session1.alice);
        const envelope1 = await aliceResolver1.publish({ content: publication1, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session1.alice });
        aliceCatalog1.add(envelope1);

        // Bob connects AFTER that — connectTwoPeers() itself performs the
        // live connection+authentication, exactly the "Bob comes online
        // later" moment this scenario is about.
        const aliceBus1 = new PeerMessageBus();
        const alicePeerExchange1 = new PublicationPeerExchange(aliceExchange1, aliceBus1, session1.aliceConnect.registry);
        const bobCatalog1 = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange1 = new PublicationExchange(bobCatalog1, verifier);
        const bobBus1 = new PeerMessageBus();
        const bobPeerExchange1 = new PublicationPeerExchange(bobExchange1, bobBus1, session1.bobConnect.registry);
        await wait(20);

        assert(bobCatalog1.has(envelope1.id) === false,
            '1. TODAY: Bob connecting to Alice after she already published does NOT deliver her existing catalog to him. This is the real, live, reproduced product gap — not a hypothetical one.');

        alicePeerExchange1.dispose();
        bobPeerExchange1.dispose();
        session1.dispose();

        // --- Part 2: close the exact same gap with the smallest seam,
        // wired TEST-SIDE ONLY (see wireConnectionTimeSync()'s own header
        // above — no production file is touched by this milestone). -----
        const session2 = await connectTwoPeers('alice-d2', 'bob-d2', 'sect-d2');
        const aliceCatalog2 = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange2 = new PublicationExchange(aliceCatalog2, verifier);
        const aliceResolver2 = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication2 = makePublication({ documentId: 'late-joiner-2', title: 'Published While Bob Was Offline (Synced)', author: 'alice-d2' }, session2.alice);
        const envelope2 = await aliceResolver2.publish({ content: publication2, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session2.alice });
        aliceCatalog2.add(envelope2);

        const aliceBus2 = new PeerMessageBus();
        const alicePeerExchange2 = new PublicationPeerExchange(aliceExchange2, aliceBus2, session2.aliceConnect.registry);
        const bobCatalog2 = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange2 = new PublicationExchange(bobCatalog2, verifier);
        const bobBus2 = new PeerMessageBus();
        const bobPeerExchange2 = new PublicationPeerExchange(bobExchange2, bobBus2, session2.bobConnect.registry);

        // The ONLY difference from Part 1: Alice's side additionally runs
        // the connection-time sync seam. No new class, no new message
        // kind, no change to PublicationPeerExchange/PublicationExchange/
        // LocalPublicationCatalog/ConnectedPeerRegistry themselves.
        const unwireSync = wireConnectionTimeSync(aliceCatalog2, alicePeerExchange2, session2.aliceConnect.registry);

        // But the connection already authenticated BEFORE this seam was
        // wired (connectTwoPeers() already completed the handshake) —
        // so re-fire it the one way production code genuinely would: a
        // fresh connection. Bob disconnects and reconnects, reproducing
        // "Bob comes online" against a replica that now runs the seam.
        session2.bobConnectedPeer.close();
        await wait(20);
        const bobReconnectedPeer = session2.bobConnect.connect({ candidateEndpoint: 'sect-d2-alice' });
        await wait(20);
        assert(bobReconnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. Bob reconnects and authenticates again.');

        assert(bobCatalog2.has(envelope2.id),
            '3. WITH the connection-time sync seam wired — and using nothing but catalog.list()/peerExchange.announce()/connectedPeerRegistry.onChange, all already public — Bob now receives Alice\'s already-published catalog automatically on connecting. The gap Part 1 reproduced closes with no new wire format and no new class.');
        const receivedView = bobCatalog2.get(envelope2.id);
        assert(receivedView.contentReference.hash === envelope2.contentReference.hash,
            '4. the delivered envelope is the genuine one, not a placeholder — same content reference.');

        unwireSync();
        alicePeerExchange2.dispose();
        bobPeerExchange2.dispose();
        session2.dispose();

        // --- Part 3: publishing AFTER a peer is already connected still
        // works unmodified — the seam is additive, not a replacement for
        // the existing explicit "Publish to Network" announce() call. ---
        const session3 = await connectTwoPeers('alice-d3', 'bob-d3', 'sect-d3');
        const aliceCatalog3 = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange3 = new PublicationExchange(aliceCatalog3, verifier);
        const aliceResolver3 = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const aliceBus3 = new PeerMessageBus();
        const alicePeerExchange3 = new PublicationPeerExchange(aliceExchange3, aliceBus3, session3.aliceConnect.registry);
        const bobCatalog3 = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange3 = new PublicationExchange(bobCatalog3, verifier);
        const bobBus3 = new PeerMessageBus();
        const bobPeerExchange3 = new PublicationPeerExchange(bobExchange3, bobBus3, session3.bobConnect.registry);
        wireConnectionTimeSync(aliceCatalog3, alicePeerExchange3, session3.aliceConnect.registry);

        const publication3 = makePublication({ documentId: 'late-joiner-3', title: 'Published After Bob Was Already Connected', author: 'alice-d3' }, session3.alice);
        const envelope3 = await aliceResolver3.publish({ content: publication3, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session3.alice });
        aliceCatalog3.add(envelope3);
        alicePeerExchange3.announce(envelope3);
        await wait(20);
        assert(bobCatalog3.has(envelope3.id), '5. publishing to an already-connected peer is unaffected by the seam — the existing explicit announce() path keeps working exactly as it always has.');

        alicePeerExchange3.dispose();
        bobPeerExchange3.dispose();
        session3.dispose();
    }
    console.log('✓ Section D: FLAGSHIP. The late-joining-peer gap is real, live-reproduced, and closes with a seam small enough to build entirely from application/PublicationPeerExchange.js#announce(), application/LocalPublicationCatalog.js#list(), and application/ConnectedPeerRegistry.js#onChange() — all already public, all unmodified. No new wire format, no new message kind, no new domain class is required. Publishing to an already-connected peer keeps working exactly as it does today.');

    // ===============================================================
    // Section E — Reconnection / repeated observation.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-e', 'bob-e', 'sect-e');
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);
        wireConnectionTimeSync(aliceCatalog, alicePeerExchange, session.aliceConnect.registry);

        const received = [];
        bobPeerExchange.onPublicationReceived((result) => received.push(result));

        const publication = makePublication({ documentId: 'reconnect-1', title: 'Reconnection Publication', author: 'alice-e' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);
        alicePeerExchange.announce(envelope);
        await wait(20);
        assert(received.length === 1 && received[0].isNew === true, '1. first observation: isNew is true.');

        // Disconnect, then reconnect — a brand-new connectionId on both
        // sides (application/ConnectedPeerRegistry.js's own header: a
        // reconnect is an entirely new connection with no memory of the
        // old one), which re-triggers the connection-time sync seam.
        session.bobConnectedPeer.close();
        await wait(20);
        assert(bobCatalog.has(envelope.id), '2. disconnecting never evicts an already-cataloged entry — the catalog outlives the connection that fed it, exactly as application/LocalPublicationCatalog.js\'s own header requires.');

        const reconnectedPeer = session.bobConnect.connect({ candidateEndpoint: 'sect-e-alice' });
        await wait(20);
        assert(reconnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. Bob reconnects and re-authenticates.');
        assert(reconnectedPeer.connectionId !== session.bobConnectedPeer.connectionId, '4. the reconnect is a genuinely new connectionId, not the stale one.');

        assert(received.length === 2 && received[1].isNew === false,
            '5. the SAME publication, re-announced on reconnect, fires onPublicationReceived a second time — but with isNew: false. application/LocalPublicationCatalog.js#add() already made repeated observation harmless; this seam invents no new deduplication policy of its own.');
        assert(bobCatalog.list().length === 1, '6. the catalog still holds exactly one entry — reconnecting never duplicates it.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section E: reconnecting to the same peer re-triggers connection-time sync (a genuinely new connectionId), and re-observing an already-known publication is safe purely because application/LocalPublicationCatalog.js#add() already is — isNew: false, no duplicate entry, no new dedup policy required anywhere in this seam.');

    // ===============================================================
    // Section F — Multiple Publications.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-f', 'bob-f', 'sect-f');
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const sharedContentStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);

        const envelopes = [];
        for (let i = 1; i <= 3; i += 1) {
            const publication = makePublication({ documentId: `multi-${i}`, title: `Multi Publication ${i}`, author: 'alice-f' }, session.alice);
            const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
            aliceCatalog.add(envelope);
            envelopes.push(envelope);
        }

        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);
        const bobContentStorage = new InMemoryStorageProvider();
        const bobResolver = new PublicationResolver(new LocalContentStore(bobContentStorage), verifier);
        wireConnectionTimeSync(aliceCatalog, alicePeerExchange, session.aliceConnect.registry);

        // Trigger the seam the same way Section D Part 2 did: a fresh
        // connection.
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'sect-f-alice' });
        await wait(20);

        assert(envelopes.every((e) => bobCatalog.has(e.id)), '1. all three publications are delivered over the ONE connection.');
        assert(bobCatalog.list().length === 3, '2. exactly three catalog entries — no duplication.');

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(bobResolver);
        for (const envelope of envelopes) {
            const view = await resolvePublicationView(bobCatalog.get(envelope.id), { coordinator, kindPlugins });
            assert(view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, `3. ${envelope.id} still resolves to CONTENT_UNAVAILABLE.`);
        }
        assert(bobContentStorage.list().length === 0, '4. exchanging multiple publications\' metadata over one connection never fetched any of their content — bulk metadata exchange never becomes bulk content replication.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section F: one connection can carry several Publications\' metadata without any of it turning into content transfer — the metadata/content boundary (Section C) holds regardless of how many Publications one connection exchanges.');

    // ===============================================================
    // Section G — Publication identity.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-g', 'bob-g', 'sect-g');
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);
        const bobResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        wireConnectionTimeSync(aliceCatalog, alicePeerExchange, session.aliceConnect.registry);

        const publication = makePublication({ documentId: 'identity-1', title: 'Identity Publication', author: 'alice-g' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'sect-g-alice' });
        await wait(20);

        const receivedEnvelope = bobCatalog.get(envelope.id);
        assert(receivedEnvelope, '1. the envelope was delivered.');
        // 2. Envelope-level identity — the fields the WIRE actually
        // carries at connection-sync time — all present and unchanged.
        const json = receivedEnvelope.toJSON();
        for (const field of ['kind', 'schemaVersion', 'id', 'contentKind', 'contentSchemaVersion', 'contentReference', 'publisherIdentity', 'publishedAt', 'signature']) {
            assert(Object.prototype.hasOwnProperty.call(json, field) && json[field] !== undefined,
                `2. envelope field "${field}" survives connection-time sync.`);
        }
        assert(json.contentReference.hash === envelope.contentReference.hash, '3. contentReference.hash is preserved exactly.');
        assert(json.signature.signature === envelope.signature.toJSON().signature, '4. the signature itself is preserved exactly — a tampered copy would fail Section B\'s own PublicationExchange#importPublication() verification, never silently pass through with different bytes.');

        // 5. documentId/title/author/license — the fields a Repository
        // listing actually shows — do NOT live on the envelope at all
        // (confirmed by their absence from Section G2's own field list
        // above); they only exist once RESOLUTION decodes the wrapped
        // Publication. Connection-time sync moves the envelope; it
        // cannot, by construction, promise a documentId or title before
        // that separate resolution step runs — reconfirming "Discovery
        // Is Not Resolution" (0.7.2) one layer further out, at the
        // connection boundary itself.
        assert(!Object.prototype.hasOwnProperty.call(json, 'documentId'), '5. documentId is not an envelope field — it exists only once the wrapped Publication is resolved.');
        assert(!Object.prototype.hasOwnProperty.call(json, 'title'), '5b. title is likewise not an envelope field.');

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(receivedEnvelope, { coordinator, kindPlugins });
        assert(view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '6. before resolution genuinely completes (Bob\'s own content store never received Alice\'s bytes), documentId/title/author/license remain unknown to Bob — exactly the CONTENT_UNAVAILABLE boundary Section C already established.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section G: every envelope-level identity field (id, contentKind, contentReference, publisherIdentity, publishedAt, signature, kind, schemaVersion) survives connection-time sync unchanged. documentId/title/author/license are NOT envelope fields at all — they belong to the wrapped Publication and only become known through a separate, later resolution step, reconfirming Discovery Is Not Resolution at the connection-sync boundary specifically.');

    // ===============================================================
    // Section H — Notification boundary.
    // ===============================================================
    {
        // 1. onPublicationReceived already fires with { publication,
        // isNew } — Section E already proved isNew IS the "new-to-this-
        // peer" distinguishing signal, unmodified since 0.7.3.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        assert(peerExchangeSource.includes("this._eventBus.publish(PUBLICATION_RECEIVED_EVENT, result);"),
            '1. onPublicationReceived already fires an event carrying { publication, isNew } for every successfully cataloged announce — this is not a new fact this milestone has to invent.');

        // 2. Apply this codebase's own NotificationEvent boundary
        // criterion (0.9.274 Section B): does a recipient IDENTITY,
        // distinct from the actor, exist without inventing a new
        // relationship? Every existing candidate that cleared that bar
        // (Publication Commentary -> the Publication's own
        // publisherIdentity; Friend Relationship -> the request's own
        // target identity) addresses a DIFFERENT real-world identity than
        // whoever acted. "A publication arrived from a peer" has no such
        // second identity: the only party who could ever be told is THIS
        // replica's own currently signed-in identity — the same identity
        // that is about to look at its own, local
        // application/LocalPublicationCatalog.js a moment later anyway.
        const commentaryProducerSource = await readSource('application/PublicationCommentaryNotificationProducer.js');
        assert(commentaryProducerSource.includes('publication.publisherIdentity.id'),
            '2. the one existing NotificationEvent producer in this codebase addresses a DIFFERENT identity (the Publication\'s publisher) than the identity that acted (the commentary\'s author) — a genuine cross-identity fact.');
        assert(!/recipientIdentityId:\s*.*(this\._identityProvider|localIdentity|self)/i.test(commentaryProducerSource),
            '2b. no existing producer ever addresses "this replica\'s own identity" as a NotificationEvent recipient — every established use is cross-identity.');

        // 3. The existing, already-used mechanism for a purely local,
        // immediate, "something just happened here" fact is the plain UI
        // feedback layer — not NotificationEvent. application/
        // PublicationPeerExchange.js#announce() already feeds exactly
        // that layer today (EditorView.js's own feedback.show() after a
        // manual announce), and ui/views/DecentralizedPublicationsView.js
        // already reacts to onPublicationReceived by refreshing its own
        // list — live, locally, with no NotificationEvent involved.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(editorViewSource.includes('const peerCount = publicationPeerExchange.announce(publication);') && editorViewSource.includes('feedback.show('),
            '3. the existing local-feedback mechanism (feedback.show) is already how this codebase surfaces a peer-exchange fact to the person at the keyboard, distinct from NotificationEvent entirely.');
        const decentralizedViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(decentralizedViewSource.includes('publicationPeerExchange.onPublicationReceived(() => refreshList())'),
            '3b. onPublicationReceived already has a real, live UI consumer today — a page refresh, not a notification.');

        // 4. Conclusion, per this milestone's own instruction: do not
        // build a producer. "A publication was received from a peer" is
        // a genuine local-awareness fact, but it fails the SAME
        // recipient-distinctness test 0.9.274 already used to accept two
        // other candidates and implicitly reject any "notify myself"
        // shape — NotificationEvent's own header (0.9.273) models a fact
        // "for whom," addressed to an identity elsewhere, not a device
        // telling its own current user about its own local state. Should
        // connection-time sync ever need a visible signal beyond the
        // existing feedback/refresh mechanisms it already has, extending
        // THOSE (a toast, a badge, a live list refresh) is the narrower
        // next step — not a NotificationEvent producer built on a
        // recipient concept that does not yet exist for this candidate.
        console.log('    (H4) Classification: not yet a NotificationEvent candidate — no recipient identity distinct from the local replica\'s own current identity exists without inventing one. No producer is built by this milestone.');
    }
    console.log('✓ Section H: application/PublicationPeerExchange.js#onPublicationReceived() already distinguishes "new to this peer" (isNew) from a repeat observation, unmodified since 0.7.3 — that mechanical question was never the gap. Applying this codebase\'s own NotificationEvent boundary criterion (0.9.274), "a publication arrived from a peer" has no recipient identity distinct from the local replica\'s own current identity without inventing one — it does not yet qualify as a NotificationEvent candidate. The existing local feedback/list-refresh mechanisms already cover this fact; no producer is built here, matching this milestone\'s own brief.');

    // ===============================================================
    // Section I — Repository convergence.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-i', 'bob-i', 'sect-i');
        const sharedContentStorage = new InMemoryStorageProvider();
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);
        wireConnectionTimeSync(aliceCatalog, alicePeerExchange, session.aliceConnect.registry);

        const publication = makePublication({ documentId: 'convergence-1', title: 'Connection-Synced Convergence Atlas', author: 'alice-i' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);

        // Bob was NOT connected when Alice published — reconnect,
        // exactly Section D's own late-joiner shape, to prove the
        // seam feeds Repository just as well as a manual announce did
        // in 0.9.340's own flagship.
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'sect-i-alice' });
        await wait(20);
        assert(bobCatalog.has(envelope.id), '1. the connection-time seam delivered the publication.');

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(bobCatalog.get(envelope.id), { coordinator, kindPlugins });
        assert(view.resolved === true && view.content instanceof Publication, `2. it resolves into a genuine Publication (${view.reason}).`);

        const sharedProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, sharedProvider);
        assert(sharedProvider.list().length === 1, '3. admitted into the discovery accumulator.');

        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: sharedProvider });
        const result = searchPublicationsUseCase.execute({ text: 'connection-synced convergence atlas' });
        assert(result.items.length === 1 && result.items[0] === view.content,
            '4. Repository\'s own real, unmodified search finds it — application/CreateDiscoveryUseCase.js, discovery/CompositeDiscoveryProvider.js, application/SearchPublicationsUseCase.js are all completely untouched by this milestone.');

        const createDiscoverySource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(!/peer|connectedPeerRegistry|PublicationPeerExchange/i.test(createDiscoverySource),
            '5. Repository\'s own composition root has, and needs, zero peer-specific or connection-sync-specific code — the entire seam lives upstream of discovery, exactly where 0.9.335-0.9.339 already drew that line.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section I: a publication delivered by connection-time sync converges into Repository search through the exact, unmodified 0.9.335-0.9.339 chain (accumulator -> composite -> CreateDiscoveryUseCase -> SearchPublicationsUseCase), with zero Repository-specific peer or sync logic — reconfirming this seam is purely upstream plumbing, never a Repository concern.');

    // ===============================================================
    // Section J — Offline / indexing boundary: an architectural
    // invariant, live-proven.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();

        // Alice and Carol are never connected to each other at all —
        // no LocalPeerConnectionProvider pairing, no shared network.
        const alice = makeIdentity('alice-j');
        const carol = makeIdentity('carol-j');
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const aliceBus = new PeerMessageBus();
        // An empty, real ConnectedPeerRegistry — genuinely no peers,
        // never a stub standing in for "nobody connected."
        const aliceConnectUseCase = new ConnectToPeerUseCase({
            peerConnectionProvider: new LocalPeerConnectionProvider('sect-j-alice', new LocalPeerNetwork()),
            identityProvider: alice
        });
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnectUseCase.registry);
        wireConnectionTimeSync(aliceCatalog, alicePeerExchange, aliceConnectUseCase.registry);

        const publication = makePublication({ documentId: 'offline-1', title: 'Never Reaches An Unconnected Peer', author: 'alice-j' }, alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        aliceCatalog.add(envelope);
        await wait(20);

        // Carol's own, entirely separate replica — never wired to
        // Alice's network in any way.
        const carolCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        assert(carolCatalog.has(envelope.id) === false,
            '1. a peer that never connects at all is never reached by connection-time sync, no matter how long Alice\'s replica runs or how many other publications she catalogs.');
        assert(aliceCatalog.list().length === 1, '2. Alice\'s own catalog is completely unaffected by Carol\'s absence — publishing/cataloging never depends on who might eventually connect.');

        // 3. Structural: no Nostr/network-wide broadcast, relay, or
        // global index concept was introduced anywhere by this seam.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        assert(!/nostr|relay|globalIndex|broadcastToNetwork/i.test(peerExchangeSource),
            '3. no global/network-wide propagation concept exists in application/PublicationPeerExchange.js — this seam only ever reaches a DIRECTLY, LIVE-connected peer.');

        alicePeerExchange.dispose();
        aliceConnectUseCase.registry.dispose();
    }
    console.log('✓ Section J: connection-time sync is bounded, structurally and live, to peers that are DIRECTLY and CURRENTLY connected — a peer that never connects is never reached, regardless of how much this replica has published. This is the exact edge named in this milestone\'s own brief: reaching a peer who is not currently connected remains a future, separate indexing/discovery-network layer\'s job, never something this seam quietly grows into.');

    console.log('\nAll Peer Publication Connection-Sync Boundary Audit tests passed.');
    console.log(
        '\nVerdict: CLEAR_SEAM — PROCEED.\n' +
        '  A real, live-reproduced product gap (Section D Part 1) closes with a seam built entirely from\n' +
        '  already-public methods on application/PublicationPeerExchange.js, application/LocalPublicationCatalog.js,\n' +
        '  and application/ConnectedPeerRegistry.js (Section D Part 2) — no wire-format change (Section B), no\n' +
        '  content-transfer risk (Sections C/F), no new deduplication policy (Section E), full field preservation\n' +
        '  (Section G), and zero required Repository change (Section I). The one candidate this audit found NOT\n' +
        '  ready is a NotificationEvent producer (Section H) — deferred, not built, exactly as this milestone\'s\n' +
        '  own brief asked. The offline/indexing boundary (Section J) is confirmed as a genuine architectural\n' +
        '  edge, not something this seam should ever try to cross.\n' +
        '  Recommended next step (0.9.342): wire this seam into production — the smallest change is a new,\n' +
        '  small decorator composed alongside application/CreatePublicationPeerExchangeUseCase.js (the same\n' +
        '  "wrap, do not modify" shape application/PublicationCommentaryNotificationProducer.js already\n' +
        '  established one domain over), reusing catalog.list()/peerExchange.announce()/registry.onChange()\n' +
        '  unchanged. 0.9.343 (a notification boundary for this fact) is explicitly NOT recommended next —\n' +
        '  Section H found no evidenced recipient concept to build it on yet.'
    );
}

run().catch((error) => {
    console.error('PeerPublicationConnectionSyncBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
