import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
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
import { PublicationPeerConnectionSync } from '../application/PublicationPeerConnectionSync.js';
import { CreatePublicationPeerExchangeUseCase } from '../application/CreatePublicationPeerExchangeUseCase.js';

// 0.9.342 — Automatic Peer Publication Connection Sync.
//
// 0.9.341's own boundary audit (test-only, no production change) proved
// a seam built entirely from application/PublicationPeerExchange.js#
// announce(), application/LocalPublicationCatalog.js#list(), and
// application/ConnectedPeerRegistry.js#onChange() closes a real, live-
// reproduced product gap: a peer who connects AFTER a Publication was
// already cataloged never received it. This file exercises the
// PRODUCTION seam — application/PublicationPeerConnectionSync.js,
// composed alongside application/PublicationPeerExchange.js by
// application/CreatePublicationPeerExchangeUseCase.js — against real,
// live, authenticated peer connections throughout.
//
// Sections (A-J), matching this milestone's own brief:
//   A — Existing peer connection regression.
//   B — FLAGSHIP: the late-joining peer.
//   C — Multiple Publications.
//   D — Existing Publication protocol (same announce() path).
//   E — No content transfer.
//   F — Identity preservation.
//   G — Reconnection.
//   H — Publication created after connection (the boundary: connection-
//       time sync is not a general catalog-watching subsystem).
//   I — Peer isolation.
//   J — Failure isolation.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

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

// A full replica: catalog + exchange + resolver + bus + peerExchange +
// (optionally) the production connectionSync under test, all real.
function makeReplica(registry, { withConnectionSync = false, verifier } = {}) {
    const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const exchange = new PublicationExchange(catalog, verifier);
    const resolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
    const bus = new PeerMessageBus();
    const peerExchange = new PublicationPeerExchange(exchange, bus, registry);
    const connectionSync = withConnectionSync ? new PublicationPeerConnectionSync(catalog, peerExchange, registry) : null;
    return {
        catalog, exchange, resolver, bus, peerExchange, connectionSync,
        dispose() {
            if (connectionSync) connectionSync.dispose();
            peerExchange.dispose();
        }
    };
}

async function run() {
    console.log('Running Publication Peer Connection Sync tests...\n');

    // ===============================================================
    // Section A — Existing peer connection regression.
    // ===============================================================
    {
        // Through the REAL production composition root, not the raw
        // classes — proves 0.9.342's wiring into application/
        // CreatePublicationPeerExchangeUseCase.js does not disturb any
        // existing, already-authenticated peer connection behavior.
        const session = await connectTwoPeers('alice-a', 'bob-a', 'unit-a');
        const verifier = new LocalAuthorizationVerifier();
        const aliceBus = new PeerMessageBus();
        const { catalog: aliceCatalog, exchange: aliceExchange, peerExchange: alicePeerExchange, connectionSync: aliceSync } =
            new CreatePublicationPeerExchangeUseCase().execute({ peerMessageBus: aliceBus, connectedPeerRegistry: session.aliceConnect.registry });
        assert(aliceSync instanceof PublicationPeerConnectionSync, '1. CreatePublicationPeerExchangeUseCase now also returns a connectionSync.');

        const bobBus = new PeerMessageBus();
        const { catalog: bobCatalog, peerExchange: bobPeerExchange } =
            new CreatePublicationPeerExchangeUseCase().execute({ peerMessageBus: bobBus, connectedPeerRegistry: session.bobConnect.registry });

        // Existing, already-proven journey: publish, catalog, explicitly
        // announce to an already-connected peer — must still work exactly
        // as it did before this milestone.
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'regress-1', title: 'Regression Publication', author: 'alice-a' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(envelope);
        const peerCount = alicePeerExchange.announce(envelope);
        await wait(20);

        assert(peerCount === 1, '2. announce() still reports exactly one authenticated peer.');
        assert(bobCatalog.has(envelope.id), '3. the existing explicit announce() path still delivers to an already-connected peer, unmodified.');

        aliceSync.dispose();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section A: existing, already-authenticated peer connection behavior — including the composition root and the pre-existing explicit announce() path — remains intact with PublicationPeerConnectionSync wired in.');

    // ===============================================================
    // Section B — FLAGSHIP: the late-joining peer.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-b', 'bob-b', 'unit-b');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });

        // Alice publishes and catalogs BEFORE this connection even
        // existed — matches this milestone's own flagship shape: "A
        // publishes P; B is offline; B connects to A."
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'late-joiner', title: 'Published While Bob Was Offline', author: 'alice-b' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);

        // Re-fire the connection-established event the real way: Bob
        // disconnects and reconnects — connectTwoPeers() already
        // authenticated once, before Alice's connectionSync was wired.
        session.bobConnectedPeer.close();
        await wait(20);
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'unit-b-alice' });
        await wait(20);
        assert(reconnected.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. Bob (re)connects and authenticates.');

        assert(bob.catalog.has(envelope.id),
            '2. Alice automatically announces her existing catalog the moment Bob authenticates — no explicit "Publish to Network" call was made after Bob connected. This is 0.9.341\'s own flagship gap, now closed in production.');
        assert(bob.catalog.get(envelope.id).contentReference.hash === envelope.contentReference.hash, '3. the delivered envelope is genuine, not a placeholder.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section B: FLAGSHIP. A late-joining peer automatically receives a publication that was already cataloged before the connection existed — the exact 0.9.341 failing journey now passes in production.');

    // ===============================================================
    // Section C — Multiple Publications.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-c', 'bob-c', 'unit-c');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);

        const envelopes = [];
        for (let i = 1; i <= 3; i += 1) {
            const publication = makePublication({ documentId: `multi-${i}`, title: `Multi Publication ${i}`, author: 'alice-c' }, session.alice);
            const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
            alice.catalog.add(envelope);
            envelopes.push(envelope);
        }

        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'unit-c-alice' });
        await wait(20);

        assert(envelopes.every((e) => bob.catalog.has(e.id)), '1. Bob receives all three Publications\' metadata representations.');
        assert(bob.catalog.list().length === 3, '2. exactly three catalog entries, no duplication.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section C: if Alice has P1, P2, P3 cataloged, Bob receives all three metadata representations on connect.');

    // ===============================================================
    // Section D — Existing Publication protocol (the same announce()
    // path, never a second message mechanism).
    // ===============================================================
    {
        const connectionSyncSource = await readSource('application/PublicationPeerConnectionSync.js');
        assert(!/this\._bus\b|peerMessageBus\.send|new PeerMessageBus/.test(connectionSyncSource),
            '1. PublicationPeerConnectionSync never touches a PeerMessageBus directly — it has no transport of its own.');
        assert(connectionSyncSource.includes('this._peerExchange.announce('),
            '2. the only way this class ever moves a publication is by calling the existing PublicationPeerExchange#announce().');

        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-d', 'bob-d', 'unit-d');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });

        // Spy on the REAL announce() method — connection-time sync must
        // call the exact same function a manual "Publish to Network"
        // click already calls, never a parallel path.
        let announceCallCount = 0;
        const originalAnnounce = alice.peerExchange.announce.bind(alice.peerExchange);
        alice.peerExchange.announce = (publication) => {
            announceCallCount += 1;
            return originalAnnounce(publication);
        };

        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'protocol-1', title: 'Protocol Publication', author: 'alice-d' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);

        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'unit-d-alice' });
        await wait(20);

        assert(announceCallCount === 1, '3. connection-time sync drove the catalog to production through PublicationPeerExchange#announce() itself, exactly once for the one cataloged entry.');
        assert(bob.catalog.has(envelope.id), '4. and the publication genuinely arrived through that same call.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section D: connection sync uses the SAME announce() path as a manual publish — structurally (no bus/transport of its own) and behaviorally (announce() spied and confirmed called). No second message mechanism exists.');

    // ===============================================================
    // Section E — No content transfer.
    // ===============================================================
    {
        const connectionSyncSource = await readSource('application/PublicationPeerConnectionSync.js');
        assert(!/import .*PublicationResolver/.test(connectionSyncSource), '1. no import of PublicationResolver.js.');
        assert(!/import .*ContentStore/.test(connectionSyncSource), '2. no import of any ContentStore.');
        assert(!/import .*PeerContentExchange/.test(connectionSyncSource), '3. no import of PeerContentExchange.js.');

        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-e', 'bob-e', 'unit-e');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });
        const bobContentStorage = new InMemoryStorageProvider();
        const bobResolver = new PublicationResolver(new LocalContentStore(bobContentStorage), verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);

        const publication = makePublication({ documentId: 'nocontent-1', title: 'No Content Transfer', author: 'alice-e' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'unit-e-alice' });
        await wait(20);

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(bob.catalog.get(envelope.id), { coordinator, kindPlugins });
        assert(view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, '4. the received publication resolves to CONTENT_UNAVAILABLE.');
        assert(bobContentStorage.list().length === 0, '5. connection sync never invoked document/material acquisition.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section E: connection synchronization never invokes document/material acquisition — structurally (no resolver/content-store import in the new class) and live (CONTENT_UNAVAILABLE, empty content store).');

    // ===============================================================
    // Section F — Identity preservation.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-f', 'bob-f', 'unit-f');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);

        const publication = makePublication({ documentId: 'identity-1', title: 'Identity Publication', author: 'alice-f' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'unit-f-alice' });
        await wait(20);

        const received = bob.catalog.get(envelope.id);
        assert(received, '1. the envelope was delivered.');
        assert(JSON.stringify(received.toJSON()) === JSON.stringify(envelope.toJSON()),
            '2. every existing field survives the automatic announcement unchanged — byte-for-byte identical to what Alice published.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section F: every Publication\'s existing identity and metadata survive automatic connection-time announcement unchanged.');

    // ===============================================================
    // Section G — Reconnection.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-g', 'bob-g', 'unit-g');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);

        const received = [];
        bob.peerExchange.onPublicationReceived((result) => received.push(result));

        const publication = makePublication({ documentId: 'reconnect-1', title: 'Reconnection Publication', author: 'alice-g' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);

        // connect -> announcements
        session.bobConnectedPeer.close();
        await wait(20);
        const firstReconnect = session.bobConnect.connect({ candidateEndpoint: 'unit-g-alice' });
        await wait(20);
        assert(bob.catalog.has(envelope.id), '1. first connect delivers the publication.');
        assert(received.length === 1 && received[0].isNew === true, '2. first observation: isNew is true.');

        // disconnect
        firstReconnect.close();
        await wait(20);
        assert(bob.catalog.has(envelope.id), '3. disconnecting never evicts an already-cataloged entry.');

        // connect -> announcements, again
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'unit-g-alice' });
        await wait(20);
        assert(reconnected.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '4. Bob reconnects and re-authenticates.');
        assert(received.length === 2 && received[1].isNew === false,
            '5. repeated connection sync doesn\'t corrupt the catalog — the same publication re-observes as isNew: false, using whatever existing reception semantics already provide, no new deduplication policy.');
        assert(bob.catalog.list().length === 1, '6. still exactly one catalog entry after connect/disconnect/connect.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section G: connect -> announcements, disconnect, connect -> announcements again — repeated connection synchronization never corrupts the catalog.');

    // ===============================================================
    // Section H — Publication created after connection: the boundary.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-h', 'bob-h', 'unit-h');
        const alice = makeReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeReplica(session.bobConnect.registry, { verifier });
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);

        // Bob is ALREADY connected — the automatic catalog announcement
        // for whatever existed at connection time has already happened
        // (nothing existed, so nothing was sent).
        assert(bob.catalog.list().length === 0, '1. nothing to announce yet at connection time.');

        // A new Publication is created AFTER the connection — cataloged,
        // but the existing "Publish to Network" announce() lifecycle is
        // deliberately NOT invoked here.
        const publication = makePublication({ documentId: 'after-connect-1', title: 'Created After Connection', author: 'alice-h' }, session.alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);
        await wait(20);

        assert(bob.catalog.has(envelope.id) === false,
            '2. cataloging a new Publication after connection does NOT, by itself, announce it — connection-time sync is not a general catalog-watching subsystem; it only acts at the moment a peer authenticates.');

        // The existing, unmodified explicit announce() lifecycle still
        // delivers it, exactly as it always has.
        alice.peerExchange.announce(envelope);
        await wait(20);
        assert(bob.catalog.has(envelope.id), '3. the existing publication announcement lifecycle (explicit announce()) still sends it, unmodified.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section H: a Publication created after connection is not automatically synchronized by connection-time sync alone — only the existing, unmodified announce() lifecycle sends it. No new general synchronization subsystem was introduced.');

    // ===============================================================
    // Section I — Peer isolation.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const networkAB = new LocalPeerNetwork();
        const networkAC = new LocalPeerNetwork();
        const alice = makeIdentity('alice-i');
        const bob = makeIdentity('bob-i');
        const carol = makeIdentity('carol-i');

        const aliceTransportForBob = new LocalPeerConnectionProvider('unit-i-alice-b', networkAB);
        const bobTransport = new LocalPeerConnectionProvider('unit-i-bob', networkAB);
        const aliceTransportForCarol = new LocalPeerConnectionProvider('unit-i-alice-c', networkAC);
        const carolTransport = new LocalPeerConnectionProvider('unit-i-carol', networkAC);

        // Alice runs ONE registry/catalog/connectionSync shared across
        // both connections — the realistic shape (a single replica with
        // two peers), so isolation is actually tested against a shared
        // connectionSync instance, not two separate ones.
        const aliceConnectForBob = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransportForBob, identityProvider: alice });
        const stopListeningForBob = aliceConnectForBob.listen();
        const aliceConnectForCarol = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransportForCarol, identityProvider: alice, registry: aliceConnectForBob.registry });
        const stopListeningForCarol = aliceConnectForCarol.listen();

        const aliceReplica = makeReplica(aliceConnectForBob.registry, { withConnectionSync: true, verifier });
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const publication = makePublication({ documentId: 'isolation-1', title: 'Isolation Publication', author: 'alice-i' }, alice);
        const envelope = await aliceResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        aliceReplica.catalog.add(envelope);

        // Bob's own bus/peerExchange must exist BEFORE his connection
        // authenticates — otherwise Alice's connection-time announce
        // arrives on a wire nobody on Bob's side is listening to yet,
        // the same ordering every other section's helpers already rely
        // on (see connectTwoPeers()/makeReplica() above).
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobReplica = makeReplica(bobConnect.registry, { verifier });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'unit-i-alice-b' });
        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. Bob connects to Alice.');
        assert(bobReplica.catalog.has(envelope.id), '2. Bob receives Alice\'s catalog independently.');

        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolReplica = makeReplica(carolConnect.registry, { verifier });
        const carolConnectedPeer = carolConnect.connect({ candidateEndpoint: 'unit-i-alice-c' });
        await wait(20);
        assert(carolConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. Carol connects to Alice — a second, independent peer.');
        assert(carolReplica.catalog.has(envelope.id), '4. Carol also receives Alice\'s catalog independently.');

        // No cross-peer state leaked: Bob and Carol never learned about
        // each other, and Bob's own catalog is unaffected by Carol
        // connecting afterward.
        assert(bobReplica.catalog.list().length === 1, '5. Bob\'s catalog is unaffected by Carol connecting afterward — no cross-peer leakage.');
        assert(carolReplica.catalog.list().length === 1, '6. Carol\'s catalog holds exactly Alice\'s publication, nothing peer-specific to Bob.');

        aliceReplica.dispose(); bobReplica.dispose(); carolReplica.dispose();
        stopListeningForBob(); stopListeningForCarol();
        aliceTransportForBob.dispose(); bobTransport.dispose();
        aliceTransportForCarol.dispose(); carolTransport.dispose();
    }
    console.log('✓ Section I: with A connected to both B and C, A\'s catalog is independently announced to each newly connected peer, and no cross-peer state leaks between them.');

    // ===============================================================
    // Section J — Failure isolation.
    // ===============================================================
    {
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-j', 'bob-j', 'unit-j');
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, session.aliceConnect.registry);

        // Two Publications: one whose announce() call will be made to
        // fail, one that must still be delivered regardless.
        const failingPublication = makePublication({ documentId: 'failing-1', title: 'Failing Publication', author: 'alice-j' }, session.alice);
        const failingEnvelope = await aliceResolver.publish({ content: failingPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(failingEnvelope);
        const okPublication = makePublication({ documentId: 'ok-1', title: 'Unaffected Publication', author: 'alice-j' }, session.alice);
        const okEnvelope = await aliceResolver.publish({ content: okPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(okEnvelope);

        // A thin wrapper that fails for exactly one publication id —
        // constructed to prove PublicationPeerConnectionSync's OWN
        // resilience, independent of what actually causes a real
        // transport failure.
        const flakyPeerExchange = {
            announce(publication) {
                if (publication.id === failingEnvelope.id) {
                    throw new Error('simulated announce failure');
                }
                return alicePeerExchange.announce(publication);
            },
            onPublicationReceived: (cb) => alicePeerExchange.onPublicationReceived(cb)
        };
        const aliceSync = new PublicationPeerConnectionSync(aliceCatalog, flakyPeerExchange, session.aliceConnect.registry);

        // A second, unrelated listener on the SAME registry, registered
        // AFTER aliceSync — proves a throw inside aliceSync's own
        // onChange callback never cancels a sibling listener queued
        // behind it (see application/ConnectedPeerRegistry.js#
        // _publishChange()'s own plain synchronous for-loop).
        let siblingListenerFired = 0;
        session.aliceConnect.registry.onChange(() => { siblingListenerFired += 1; });

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, session.bobConnect.registry);

        session.bobConnectedPeer.close();
        await wait(20);
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'unit-j-alice' });
        await wait(20);

        assert(reconnected.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. the connection itself survives a failing announce — reconnecting still authenticates.');
        assert(bobCatalog.has(okEnvelope.id), '2. the OTHER publication is still delivered despite the failing one.');
        assert(bobCatalog.has(failingEnvelope.id) === false, '3. the failing publication itself is, correctly, never delivered.');
        assert(aliceCatalog.list().length === 2, '4. Alice\'s own local catalog is completely unaffected by the failure.');
        assert(siblingListenerFired > 0, '5. a sibling ConnectedPeerRegistry listener registered after aliceSync still fired — the failure never escaped aliceSync\'s own onChange callback.');

        // Unrelated publication operations keep working.
        const anotherPublication = makePublication({ documentId: 'unrelated-1', title: 'Unrelated Operation', author: 'alice-j' }, session.alice);
        const anotherEnvelope = await aliceResolver.publish({ content: anotherPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        aliceCatalog.add(anotherEnvelope);
        assert(aliceCatalog.has(anotherEnvelope.id), '6. an unrelated publication operation (cataloging a new one) keeps working after the failure.');

        aliceSync.dispose();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        session.dispose();
    }
    console.log('✓ Section J: a failure announcing one publication to one peer never breaks the connection, other publications, the local catalog, unrelated publication operations, or a sibling ConnectedPeerRegistry listener.');

    console.log('\nAll Publication Peer Connection Sync tests passed.');
}

run().catch((error) => {
    console.error('PublicationPeerConnectionSync.test.js FAILED:', error);
    process.exitCode = 1;
});
