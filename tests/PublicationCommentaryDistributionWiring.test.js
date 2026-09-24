
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { Publication } from '../publisher/Publication.js';

import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { CreatePublicationCommentaryUseCase } from '../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.620 — Wire Publication Commentary Peer Distribution.
//
// TYPE: production wiring. Closes exactly the gap 0.9.619's own Section
// B/C flagship finding measured: the distribution capability 0.9.618
// built (application/publication/commentary/PublicationCommentaryDistributionExchange.js +
// PublicationCommentaryDistributionPeerExchange.js) was fully correct
// but completely unreachable from the real, running application — no
// composition root existed, ui/main.js never constructed or wired one,
// and there was not one production `.announce()` call site for
// Commentary anywhere in ui/ or application/.
//
// WHAT THIS MILESTONE ADDS, AND ONLY THIS:
//
//   1. application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js
//      — a new composition root, mirroring application/
//      CreatePublicationAnchorPeerExchangeUseCase.js's own exact shape.
//      No new class inside it: PublicationCommentaryStore,
//      PublicationCommentaryDistributionExchange, and
//      PublicationCommentaryDistributionPeerExchange are all 0.9.618,
//      unmodified.
//   2. ui/main.js — constructs that composition root, riding the SAME
//      app-wide peerMessageBus/peerSessionManager.registry/identityProvider
//      every sibling capability already rides, and wraps the EXISTING
//      application/publication/commentary/CreatePublicationCommentaryUseCase.js's own
//      addPublicationCommentaryCommand with an ANNOUNCE side effect —
//      local creation first, announce second, never the reverse; a
//      distribution failure is swallowed and never turns local
//      Commentary creation into a network-dependent operation.
//
// NEITHER core/PublicationCommentary.js, storage/PublicationCommentaryStore.js,
// application/publication/commentary/PublicationCommentaryDistributionExchange.js,
// application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js, nor
// application/publication/commentary/CreatePublicationCommentaryUseCase.js is modified by this
// milestone — every one of the sections below either reads their source
// to prove that, or exercises them live, unmodified, through the new
// wiring.
//
//   Section A — the new composition root: constructs the intended,
//               EXISTING dependencies, nothing new invented.
//   Section B — ui/main.js source-level wiring: imports, constructs,
//               wraps, and still provides addPublicationCommentaryCommand
//               app-wide.
//   Section C — Creation -> announce, reproducing ui/main.js's own real
//               composition (not merely instantiating the exchange
//               directly).
//   Section D — shared store: the distribution peer exchange's own store
//               and createPublicationCommentaryCommand's own store read
//               back the identical persisted record — one underlying
//               source of truth, never two.
//   Section E — no-peer / distribution-failure graceful degradation:
//               local Commentary creation succeeds regardless.
//   Section F — THE FLAGSHIP: the real, wired composition delivers a
//               Commentary to an independent peer over a real,
//               authenticated transport.
//   Section G — signature: the delivered envelope really was signed by
//               the Commentary's own author and verified on arrival.
//   Section H — idempotence: repeated delivery through the real wiring
//               stays a no-op on the second arrival.
//   Section I — notification locality: local creation still produces
//               exactly one local NotificationEvent; the distributed
//               arrival on the peer produces none.
//   Section J — no authorization widening: distributing about a
//               publicationId the receiver has never heard of still
//               succeeds — no Publication existence/ownership check was
//               added at the distribution layer.
//   Section K — existing single-device regression: the wrapped command
//               still round-trips create -> read exactly as before.
//   Section L — verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// A directly-constructed, independent receiver — the SAME test double
// shape 0.9.618's own Section J and 0.9.619's own Sections D-I already
// use for "the other device." Receiving-side behavior did not change in
// 0.9.620 (arrival always runs through the same, unmodified
// PublicationCommentaryDistributionPeerExchange#_handleIncoming(),
// however it was constructed) — only whether the SENDING side, the real
// application, can ever reach it did.
function makeReceiver(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new PublicationCommentaryStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, verifier);
    return { storage, store, verifier, exchange };
}

// Installs a Map-backed window.localStorage — the identical polyfill
// 0.9.619's own Section C already used to run the real, browser-facing
// composition roots under plain Node.
function installWindowLocalStorage() {
    const backing = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (backing.has(k) ? backing.get(k) : null),
            setItem: (k, v) => { backing.set(k, String(v)); },
            removeItem: (k) => { backing.delete(k); },
            key: (i) => Array.from(backing.keys())[i] ?? null,
            get length() { return backing.size; }
        }
    };
}

// Reproduces EXACTLY the composition ui/main.js itself now performs —
// see that file's own 0.9.620 section, immediately after
// ReconstructPublicationDiscoveryUseCase's own call. Returns the same
// two names ui/main.js app.provide()s: getPublicationCommentariesCommand
// (untouched) and addPublicationCommentaryCommand (now the
// distribution-wrapped command), plus the underlying peerExchange/store
// for assertion purposes a real caller never sees.
function composeRealAppSide(identityProvider, { peerMessageBus, connectedPeerRegistry }) {
    const { getPublicationCommentariesCommand, addPublicationCommentaryCommand: createPublicationCommentaryCommand } =
        new CreatePublicationCommentaryUseCase().execute(identityProvider);

    const { store: distributionStore, peerExchange: distributionPeerExchange } =
        new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
            identityProvider,
            peerMessageBus,
            connectedPeerRegistry
        });

    function addPublicationCommentaryCommand(input) {
        const result = createPublicationCommentaryCommand(input);
        try {
            distributionPeerExchange.announce(result.commentary);
        } catch {
            // best-effort — see ui/main.js's own 0.9.620 section
        }
        return result;
    }

    return { getPublicationCommentariesCommand, addPublicationCommentaryCommand, createPublicationCommentaryCommand, distributionStore, distributionPeerExchange };
}

async function run() {
    // ===============================================================
    // Section A — the new composition root.
    // ===============================================================
    {
        const source = codeOnly(await rawSource('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'));
        assert(source.includes('PublicationCommentaryStore') && source.includes('PublicationCommentaryDistributionExchange') && source.includes('PublicationCommentaryDistributionPeerExchange'),
            n('the new composition root imports and composes the three EXISTING, 0.9.618/0.9.243 classes — no fourth, new class'));
        assert(!/DistributedPublicationCommentaryStore|CommentarySyncService|CommentaryReplicationService|CommentaryNetworkManager|CommentaryBroadcastManager/.test(source),
            n('none of the explicitly-excluded new-abstraction names appear anywhere in the new composition root\'s own source'));

        const identityProvider = makeIdentity('composition-a');
        const bus = new PeerMessageBus();
        class FakeRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const { store, exchange, peerExchange, verifier } = new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
            identityProvider, peerMessageBus: bus, connectedPeerRegistry: new FakeRegistry()
        });
        assert(store instanceof PublicationCommentaryStore, n('returns a real PublicationCommentaryStore instance'));
        assert(exchange instanceof PublicationCommentaryDistributionExchange, n('returns a real PublicationCommentaryDistributionExchange instance, wired to that SAME store'));
        assert(peerExchange instanceof PublicationCommentaryDistributionPeerExchange, n('returns a real PublicationCommentaryDistributionPeerExchange instance, wired to that SAME exchange'));
        assert(verifier instanceof LocalAuthorizationVerifier, n('returns the EXISTING, unmodified LocalAuthorizationVerifier — no new verification class'));
        peerExchange.dispose();

        console.log('✓ A: the new composition root composes exactly the three existing 0.9.618/0.9.243 classes, live-constructed, no new abstraction.');
    }

    // ===============================================================
    // Section B — ui/main.js source-level wiring.
    // ===============================================================
    {
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        assert(mainSource.includes("import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';"),
            n('ui/main.js imports the new composition root'));
        assert(mainSource.includes('new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({') &&
               /identityProvider,\s*\n\s*peerMessageBus,\s*\n\s*connectedPeerRegistry: peerSessionManager\.registry/.test(mainSource),
            n('ui/main.js constructs it with the SAME app-wide identityProvider/peerMessageBus/peerSessionManager.registry every sibling capability already rides — never a second identity or transport'));
        assert(mainSource.includes("new CreatePublicationCommentaryUseCase().execute(identityProvider)"),
            n('the EXISTING commentary creation composition is still constructed the exact same way — this milestone changes no argument to it'));
        assert(mainSource.includes('function addPublicationCommentaryCommand(input) {') &&
               mainSource.includes('publicationCommentaryDistributionPeerExchange.announce(result.commentary)'),
            n('ui/main.js now defines addPublicationCommentaryCommand as a wrapper that announces the just-created commentary'));
        assert(mainSource.includes("app.provide('addPublicationCommentaryCommand', addPublicationCommentaryCommand)"),
            n('addPublicationCommentaryCommand is still provided app-wide under the identical name — every existing consumer (PublicationCard.js) needs no change'));

        console.log('✓ B: ui/main.js really does construct the new composition root and wrap the existing command — verified at the source level, not merely narrated.');
    }

    installWindowLocalStorage();

    // A real, discoverable Publication — CanCommentOnPublicationUseCase's
    // own policy (0.9.246, unmodified) requires publicationId to
    // actually resolve. Seeded through the SAME window.localStorage key
    // application/publication/commentary/CreatePublicationCommentaryUseCase.js's own internal
    // LocalDiscoveryProvider reads — the identical setup 0.9.619's own
    // Section C already used.
    const publisherProvider = makeIdentity('wiring-publisher');
    const publication = new Publication({
        id: 'pub-wiring-620',
        documentId: 'doc-wiring-620',
        title: 'Wiring Milestone World',
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    new LocalStorageProvider().save('forkbuild-publications', [publication.toJSON()]);

    const authorProvider = makeIdentity('wiring-author');

    // ===============================================================
    // Section C — Creation -> announce, through the REAL, reproduced
    // ui/main.js composition (never the exchange instantiated directly).
    // ===============================================================
    {
        const bus = new PeerMessageBus();
        class EmptyRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = composeRealAppSide(authorProvider, { peerMessageBus: bus, connectedPeerRegistry: new EmptyRegistry() });

        let announced = null;
        const originalAnnounce = app.distributionPeerExchange.announce.bind(app.distributionPeerExchange);
        app.distributionPeerExchange.announce = (commentary) => { announced = commentary; return originalAnnounce(commentary); };

        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'created through the real, wired app composition' });
        assert(commentary instanceof PublicationCommentary, n('the real, wired composition still creates a genuine PublicationCommentary'));
        assert(announced !== null && announced.commentaryId === commentary.commentaryId,
            n('THE CLOSED GAP: creating a commentary through the real, wired composition now DOES cause the distribution peer exchange\'s own announce() to fire, with the exact commentary just created — the capability 0.9.619 proved unreachable'));

        app.distributionPeerExchange.dispose();
        console.log('✓ C: creating a Commentary through the real, reproduced ui/main.js composition triggers a real announce() call — no longer merely a directly-instantiated exchange.');
    }

    // ===============================================================
    // Section D — shared store: one underlying source of truth.
    // ===============================================================
    {
        const bus = new PeerMessageBus();
        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = composeRealAppSide(authorProvider, { peerMessageBus: bus, connectedPeerRegistry: new NoPeerRegistry() });

        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'shared-store invariant' });

        // The commentary was saved ONLY through createPublicationCommentaryCommand's
        // own internal store (never through distributionStore.save() —
        // announce() never writes locally, only signs and sends). Yet
        // distributionStore.getById() already finds it: both stores are
        // separately-constructed PublicationCommentaryStore instances
        // over the SAME underlying window.localStorage keys — see
        // storage/PublicationCommentaryStore.js's own header, "never
        // mutates... always re-reads through the injected
        // StorageProvider" — never two divergent in-memory copies.
        const throughDistributionStore = app.distributionStore.getById(commentary.commentaryId);
        assert(throughDistributionStore !== null, n('the distribution peer exchange\'s own store already contains a commentary this milestone never wrote to it directly'));
        assert(throughDistributionStore.content === commentary.content && throughDistributionStore.authorIdentityId === commentary.authorIdentityId,
            n('and every field matches exactly — one persisted record, read back through two independently-constructed store instances, never a divergent second in-memory copy the receiving side could silently miss'));

        app.distributionPeerExchange.dispose();
        console.log('✓ D: the distribution peer exchange and createPublicationCommentaryCommand ultimately operate on the same underlying PublicationCommentaryStore records — the invariant this milestone was built to protect.');
    }

    // ===============================================================
    // Section E — no-peer / distribution-failure graceful degradation.
    // ===============================================================
    {
        const bus = new PeerMessageBus();
        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = composeRealAppSide(authorProvider, { peerMessageBus: bus, connectedPeerRegistry: new NoPeerRegistry() });

        const { commentary, isNew } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'zero connected peers' });
        assert(commentary instanceof PublicationCommentary && isNew === true,
            n('with ZERO connected peers, local Commentary creation still succeeds and persists — the network is an additional path, never the persistence authority'));

        // Force announce() itself to throw, simulating a distribution
        // failure unrelated to peer count (a signing error, a transport
        // fault) — creation must still succeed.
        app.distributionPeerExchange.announce = () => { throw new Error('simulated distribution failure'); };
        let threw = false;
        let result;
        try {
            result = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'distribution throws, creation must not' });
        } catch { threw = true; }
        assert(!threw && result && result.commentary instanceof PublicationCommentary,
            n('even when announce() itself throws, addPublicationCommentaryCommand does not propagate that failure — local creation remains successful and is returned to the caller unchanged'));
        assert(app.getPublicationCommentariesCommand(publication.id).some((c) => c.commentaryId === result.commentary.commentaryId),
            n('and the commentary really is durably persisted locally despite the simulated distribution failure — readable back through the SAME command a caller already uses'));

        console.log('✓ E: peer distribution never turns local Commentary creation into a network-dependent operation — zero peers and an announce() failure both leave local creation fully successful.');
    }

    // ===============================================================
    // Section F — THE FLAGSHIP: the real, wired composition delivers a
    // Commentary to an independent peer over a real, authenticated
    // transport.
    // ===============================================================
    let deviceAStore, deviceBExchange, deviceBStorage, flagshipCommentary;
    {
        const network = new LocalPeerNetwork();
        const alice = authorProvider; // "Device A" IS the real application's own identity.
        const bob = makeIdentity('wiring-device-b');

        const aliceTransport = new LocalPeerConnectionProvider('alice-wiring-620', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-wiring-620', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-wiring-620' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: Device B authenticates to the real application (Device A) over a real transport'));

        // DEVICE A — the REAL, wired application composition, exactly as
        // ui/main.js constructs it — riding the real aliceConnect.registry
        // (standing in for peerSessionManager.registry).
        const app = composeRealAppSide(alice, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry });
        deviceAStore = app.distributionStore;

        // DEVICE B — an independent receiver, per this file's own
        // makeReceiver() (the same shape 0.9.618/0.9.619 already use for
        // "the other device") — proving delivery reaches a genuinely
        // separate replica, never merely a second binding onto the
        // sender's own store.
        const { storage: bobStorage, store: bobStore, exchange: bobExchange } = makeReceiver(bob);
        deviceBExchange = bobExchange;
        deviceBStorage = bobStorage;
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationCommentaryDistributionPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const bobReceived = [];
        bobPeerExchange.onCommentaryReceived((result) => bobReceived.push(result));

        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'created through the real, wired app; delivered to an independent device' });
        flagshipCommentary = commentary;
        await wait(30);

        const onDeviceB = bobStore.getById(commentary.commentaryId);
        assert(onDeviceB !== null, n('THE FLAGSHIP: a Commentary created through the real, running, wired application composition arrives, unprompted, in an independent device\'s own store — over a real, authenticated peer connection'));
        assert(onDeviceB.commentaryId === commentary.commentaryId && onDeviceB.authorIdentityId === commentary.authorIdentityId && onDeviceB.content === commentary.content,
            n('every field arrived intact: commentaryId, authorIdentityId, and content all match the original'));
        assert(bobReceived.length === 1 && bobReceived[0].isNew === true, n('the receiver\'s own onCommentaryReceived fired exactly once, reporting a genuinely new arrival'));

        stopAliceListening();
        stopBobListening();
        app.distributionPeerExchange.dispose();
        bobPeerExchange.dispose();

        console.log('✓ F: FLAGSHIP — the real, wired ui/main.js-shaped composition delivers a Commentary to an independent device over a real, authenticated peer connection. The gap 0.9.619 measured is closed.');
    }

    // ===============================================================
    // Section G — signature: the delivered envelope really was signed
    // by the commentary's own author, and a tampered one is rejected,
    // even through the real, wired composition.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const receiverIdentity = makeIdentity('wiring-signature-receiver');
        const senderTransport = new LocalPeerConnectionProvider('sender-sig-620', network);
        const receiverTransport = new LocalPeerConnectionProvider('receiver-sig-620', network);
        const senderConnect = new ConnectToPeerUseCase({ peerConnectionProvider: senderTransport, identityProvider: authorProvider });
        const stopSenderListening = senderConnect.listen();
        const receiverConnect = new ConnectToPeerUseCase({ peerConnectionProvider: receiverTransport, identityProvider: receiverIdentity });
        const stopReceiverListening = receiverConnect.listen();
        const receiverToSender = receiverConnect.connect({ candidateEndpoint: 'sender-sig-620' });
        await wait(20);
        assert(receiverToSender.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection for the signature check'));

        const bus = new PeerMessageBus();
        const app = composeRealAppSide(authorProvider, { peerMessageBus: bus, connectedPeerRegistry: senderConnect.registry });

        let sentEnvelope = null;
        const originalSend = bus.send.bind(bus);
        bus.send = (peer, protocol, message) => { sentEnvelope = message && message.envelope; return originalSend(peer, protocol, message); };

        app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'signature check' });
        assert(sentEnvelope && sentEnvelope.signature && typeof sentEnvelope.signature.signature === 'string' && sentEnvelope.signature.signature.length > 0,
            n('the envelope actually placed on the wire by the real, wired composition carries a real, non-empty signature — never announced unsigned'));

        const { exchange: receiverExchange } = makeReceiver(receiverIdentity);
        const tampered = JSON.parse(JSON.stringify(sentEnvelope));
        tampered.content = 'tampered after signing';
        let threw = false;
        try { receiverExchange.importCommentaryEnvelope(tampered); } catch { threw = true; }
        assert(threw, n('a receiver independently verifies the signature — a tampered payload from the real, wired sender is rejected, not merely trusted because it arrived'));

        stopSenderListening();
        stopReceiverListening();
        app.distributionPeerExchange.dispose();
        console.log('✓ G: the real, wired composition signs every envelope it announces, and tampering is independently caught on arrival.');
    }

    // ===============================================================
    // Section H — idempotence through the real wiring.
    // ===============================================================
    {
        assert(deviceAStore !== undefined && deviceBExchange !== undefined && flagshipCommentary !== undefined, n('setup: Section F\'s own device pair and delivered commentary are reused'));
        const commentary = flagshipCommentary;
        assert(deviceAStore.getById(commentary.commentaryId) !== null, n('setup: the flagship commentary really is still on Device A\'s own store'));

        // Re-signs the SAME already-delivered commentary for export again
        // — re-exporting requires the ORIGINAL author's own identity,
        // which authorProvider (Device A) still is.
        const signed = new PublicationCommentaryDistributionExchange(deviceAStore, authorProvider, new LocalAuthorizationVerifier()).exportCommentary(commentary);

        const first = deviceBExchange.importCommentaryEnvelope(signed);
        const second = deviceBExchange.importCommentaryEnvelope(signed);
        assert(first.isNew === false, n('this exact commentary already arrived once (Section F\'s own live delivery) — re-importing it through the real exchange reports isNew: false, never a duplicate'));
        assert(second.isNew === false, n('a further repeated delivery stays exactly as idempotent — the existing store\'s own commentaryId identity, reused, never reinvented'));

        console.log('✓ H: repeated delivery through the real, wired composition remains idempotent — the existing store-level dedup, unmodified, is authoritative.');
    }

    // ===============================================================
    // Section I — notification locality.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisher2 = makeIdentity('wiring-notif-publisher');
        const author2 = makeIdentity('wiring-notif-author');
        const publication2 = new Publication({
            id: 'pub-wiring-620-notif',
            documentId: 'doc-wiring-620-notif',
            title: 'Notification Locality World',
            author: 'author',
            publisherIdentity: publisher2.getSigningIdentity().toJSON()
        });
        new LocalStorageProvider().save('forkbuild-publications', [publication2.toJSON()]);

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = composeRealAppSide(author2, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });
        app.addPublicationCommentaryCommand({ publicationId: publication2.id, content: 'local creation should notify the publisher' });

        const localNotifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(localNotifications.length === 1, n('the SENDER\'s own local creation, through the real wired command, still produces exactly one local NotificationEvent — 0.9.275\'s own producer, unmodified and unaffected by this milestone'));

        // Now a REMOTE arrival, over a live connection, on an independent
        // receiver — never touches that receiver's own NotificationEventStore.
        const network = new LocalPeerNetwork();
        const receiverIdentity = makeIdentity('wiring-notif-receiver');
        const senderTransport = new LocalPeerConnectionProvider('sender-notif-620', network);
        const receiverTransport = new LocalPeerConnectionProvider('receiver-notif-620', network);
        const senderConnect = new ConnectToPeerUseCase({ peerConnectionProvider: senderTransport, identityProvider: author2 });
        const stopSender = senderConnect.listen();
        const receiverConnect = new ConnectToPeerUseCase({ peerConnectionProvider: receiverTransport, identityProvider: receiverIdentity });
        const stopReceiver = receiverConnect.listen();
        const receiverToSender = receiverConnect.connect({ candidateEndpoint: 'sender-notif-620' });
        await wait(20);
        assert(receiverToSender.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: independent receiver authenticates over a real transport'));

        // A second real, wired app-side composition for author2 — this
        // time riding the LIVE, authenticated senderConnect.registry
        // (standing in for peerSessionManager.registry) rather than the
        // no-peer stub above, so its own addPublicationCommentaryCommand
        // genuinely announces over the real transport. Same underlying
        // window.localStorage as `app` above (same identity, same
        // publication2) — see Section D on why two independently
        // constructed compositions share one persisted source of truth.
        const liveApp = composeRealAppSide(author2, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: senderConnect.registry });
        const { storage: receiverStorage, exchange: receiverExchange } = makeReceiver(receiverIdentity);
        const receiverBus = new PeerMessageBus();
        const receiverPeerExchange = new PublicationCommentaryDistributionPeerExchange(receiverExchange, receiverBus, receiverConnect.registry);

        const { commentary } = liveApp.addPublicationCommentaryCommand({ publicationId: publication2.id, content: 'remote arrival must not notify' });
        await wait(30);

        assert(receiverExchange._store.getById(commentary.commentaryId) !== null, n('setup: the independent receiver really did receive it, live'));
        const receiverNotifications = new NotificationEventStore(receiverStorage).loadAll();
        assert(receiverNotifications.length === 0, n('the RECEIVING device\'s own NotificationEventStore stays at zero — a distributed arrival never crosses into notification production; that stays local and downstream, exactly as 0.9.617/0.9.618/0.9.619 already established, now reconfirmed through the real production wiring'));

        stopSender();
        stopReceiver();
        liveApp.distributionPeerExchange.dispose();
        receiverPeerExchange.dispose();
        app.distributionPeerExchange.dispose();

        console.log('✓ I: notification stays local to the creating device and downstream of local creation only — a live, real-wiring distributed arrival produces zero NotificationEvents on the receiver.');
    }

    // ===============================================================
    // Section J — no authorization widening: distribution never gains
    // Publication existence/ownership knowledge the receiver lacks.
    // ===============================================================
    {
        const receiver = makeReceiver(makeIdentity('wiring-unknown-pub-receiver'));
        const commentary = new PublicationCommentary({
            publicationId: 'pub-the-receiver-has-never-heard-of',
            authorIdentityId: authorProvider.getSigningIdentity().id,
            content: 'about a publication only the sender knows'
        });
        const signed = new PublicationCommentaryDistributionExchange(new PublicationCommentaryStore(new InMemoryStorageProvider()), authorProvider, new LocalAuthorizationVerifier())
            .exportCommentary(commentary);
        const { isNew } = receiver.exchange.importCommentaryEnvelope(signed);
        assert(isNew === true, n('a Commentary about a publicationId the receiving device has never heard of is still accepted — the distribution layer never checks Publication existence, ownership, or discoverability, exactly as application/publication/commentary/PublicationCommentaryDistributionExchange.js\'s own 0.9.618 header already documents, now reconfirmed unchanged by this milestone\'s wiring'));

        const useCaseSource = codeOnly(await rawSource('application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'));
        assert(!/CanCommentOnPublicationUseCase|DiscoveryProvider|discoveryProvider/.test(useCaseSource),
            n('the new composition root itself never imports or mentions any Publication discovery/authorization collaborator — it cannot widen a check it never touches'));

        console.log('✓ J: this milestone\'s wiring introduces no Publication authorization, discovery, or mutation check of any kind — the distribution layer\'s own pre-existing boundary is unchanged.');
    }

    // ===============================================================
    // Section K — existing single-device regression.
    // ===============================================================
    {
        // Section I's own installWindowLocalStorage() reset window.localStorage
        // to a fresh, empty backing Map — re-seed the original Publication
        // this section's own commentary is about.
        new LocalStorageProvider().save('forkbuild-publications', [publication.toJSON()]);

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = composeRealAppSide(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });
        const { commentary } = app.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'ordinary single-device regression' });
        const readBack = app.getPublicationCommentariesCommand(publication.id);
        assert(readBack.some((c) => c.commentaryId === commentary.commentaryId),
            n('the ordinary, single-device create -> read workflow through the now-wrapped addPublicationCommentaryCommand still works exactly as it did before this milestone'));
        app.distributionPeerExchange.dispose();

        console.log('✓ K: existing single-device Commentary behavior is a complete regression pass under the new wiring.');
    }

    // ===============================================================
    // Section L — verdict.
    // ===============================================================
    {
        console.log(
            '\n0.9.620 verdict: PRODUCTION_WIRING_GAP (0.9.619) -> CLOSED. application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js '
            + 'composes the three existing 0.9.618/0.9.243 classes (Section A); ui/main.js constructs it on the app-wide peerMessageBus/registry/identityProvider '
            + 'and wraps the existing addPublicationCommentaryCommand with an announce side effect, still provided under the identical name (Section B); creating '
            + 'a Commentary through that real, reproduced composition now genuinely calls announce() (Section C) against the SAME underlying store '
            + 'createPublicationCommentaryCommand itself writes to (Section D); local creation stays fully successful with zero peers or a thrown announce() '
            + '(Section E); the real, wired composition delivers a Commentary to an independent, live, authenticated peer end to end (Section F, FLAGSHIP), '
            + 'signed and independently verified (Section G), idempotently on repeat delivery (Section H), with notification staying local to the creating '
            + 'device only (Section I) and no Publication authorization/discovery check newly introduced (Section J) — and the existing single-device workflow '
            + 'is unregressed (Section K). RECOMMENDATION: a later, separately-scoped 0.9.621 application distribution closure audit, per this milestone\'s own '
            + 'originating brief, to reconfirm the full arc against the real running application one more time before any ARC_CLOSED verdict.'
        );
        console.log(`✅ All Publication Commentary Distribution Wiring tests passed (${assertionCount} assertions).`);
    }
}

await run();
