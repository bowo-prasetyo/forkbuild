import { execSync } from 'node:child_process';

import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { Publication } from '../publisher/Publication.js';

import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { CreatePublicationCommentaryUseCase } from '../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.623 — Wire Remote Commentary Arrival into Local Notifications.
//
// TYPE: production wiring. Closes exactly the gap 0.9.622's own Section E
// flagship finding measured: application/
// PublicationCommentaryDistributionPeerExchange.js#onCommentaryReceived()
// (0.9.618) and application/publication/commentary/PublicationCommentaryNotificationProducer.js
// (0.9.275) both already existed, correct and unmodified, but nothing in
// ui/main.js — the one composition root that constructs the peer exchange
// at all — ever subscribed the one to feed the other. Local Commentary
// creation kept the product's own promise ("every successful commentary
// produces a notification"); a remote arrival produced silence.
//
// WHAT THIS MILESTONE ADDS, AND ONLY THIS:
//
//   1. application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js — a
//      new, small adapter: `onCommentaryReceived()`'s own `{ commentary,
//      isNew }` fact in, a `publication.commented` NotificationEvent out
//      (gated on isNew and on this replica's own identity being the
//      resolved Publication's own publisher), reusing
//      buildPublicationCommentedNotificationEvent() straight from
//      PublicationCommentaryNotificationProducer.js — never a second
//      notification vocabulary, and never a second `new
//      NotificationEvent(...)` construction site.
//   2. application/publication/commentary/PublicationCommentaryNotificationProducer.js — its own
//      `execute()` construction of a `publication.commented`
//      NotificationEvent is extracted, UNCHANGED IN BEHAVIOR, into a
//      plain, side-effect-free exported function
//      (`buildPublicationCommentedNotificationEvent()`) so the new bridge
//      can reuse it verbatim rather than re-typing it — see that file's
//      own 0.9.623 section.
//   3. ui/main.js — constructs the new bridge (fresh LocalDiscoveryProvider/
//      NotificationEventStore over the SAME window.localStorage keys every
//      other composition here already reads/writes, the SAME app-wide
//      identityProvider) and subscribes it to the EXISTING
//      publicationCommentaryDistributionPeerExchange.onCommentaryReceived(),
//      wrapped in the identical best-effort try/catch idiom
//      addPublicationCommentaryCommand already uses around announce().
//
// NEITHER core/NotificationEvent.js, storage/NotificationEventStore.js,
// application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js,
// application/publication/commentary/PublicationCommentaryDistributionExchange.js, nor
// application/publication/commentary/CreatePublicationCommentaryUseCase.js is modified by this
// milestone. application/publication/commentary/PublicationCommentaryNotificationProducer.js IS
// modified (item 2, above) — a pure extraction, zero behavior change,
// reconfirmed unchanged by tests/PublicationCommentaryNotificationProducer.test.js's
// own full, unmodified suite (re-run live in Section A).
//
//   Section A — entry-state reconfirmation: 0.9.620's own wiring suite,
//               the local producer's own unmodified-behavior suite, and
//               this milestone's own new unit coverage, re-run live.
//   Section B — ui/main.js source-level wiring.
//   Section C — bridge construction guard: the composition root imports
//               and wires exactly the new bridge, no fourth new class.
//   Section D — THE FLAGSHIP: a Commentary created through the real,
//               wired sending composition arrives, over a real
//               authenticated peer connection, at an independent
//               receiving application composition that IS the
//               Publication's own publisher — and produces exactly one
//               local NotificationEvent there.
//   Section E — local creation still produces exactly one notification
//               (on the creating device) — no duplication introduced by
//               this milestone.
//   Section F — a receiving replica that is NOT the Publication's own
//               publisher receives and stores the Commentary but produces
//               zero notifications.
//   Section G — idempotent/repeated delivery produces no additional
//               notification.
//   Section H — a rejected (tampered/forged) envelope never reaches
//               onCommentaryReceived() at all, so produces zero
//               notifications — the signature boundary 0.9.618 already
//               established is untouched.
//   Section I — unknown Publication on the receiving replica: the
//               Commentary is still stored, no notification is produced,
//               and no Publication-existence requirement was introduced.
//   Section J — NotificationEvent itself never travels the network —
//               reconfirms 0.9.617/0.9.618's own "notification stays
//               downstream and local" boundary, unchanged by this
//               milestone.
//   Section K — production-change scope guard.
//   Section L — verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

function wait(ms = 30) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function runGuardLive(relativeTestFile) {
    try {
        const stdout = execSync(`node ${relativeTestFile}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        return { passed: true, stdout };
    } catch (error) {
        return { passed: false, stdout: `${error.stdout || ''}${error.stderr || ''}` };
    }
}

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

function seedPublication(id, publisherProvider) {
    const publication = new Publication({
        id,
        documentId: `doc-${id}`,
        title: `World for ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const storageProvider = new LocalStorageProvider();
    const existing = storageProvider.load('forkbuild-publications') || [];
    storageProvider.save('forkbuild-publications', [...existing, publication.toJSON()]);
    return publication;
}

// Reproduces EXACTLY the composition ui/main.js itself now performs for
// Commentary: 0.9.289's own read/write commands, 0.9.620's own
// distribution-announce wrapper, and THIS milestone's own
// onCommentaryReceived -> PublicationCommentaryRemoteNotificationBridge
// subscription — the identical reproduction method 0.9.619/0.9.620/
// 0.9.621/0.9.622 already established, since ui/main.js itself boots a
// full Vue app/DOM and cannot be imported directly under plain Node.
function bootApplication(identityProvider, { peerMessageBus, connectedPeerRegistry }) {
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

    // 0.9.623's own wiring, reproduced exactly as ui/main.js now performs
    // it, right after the block above.
    const remoteNotificationBridge = new PublicationCommentaryRemoteNotificationBridge(
        new LocalDiscoveryProvider(new LocalStorageProvider()),
        identityProvider,
        (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
    );
    const unsubscribeRemoteNotificationBridge = distributionPeerExchange.onCommentaryReceived((result) => {
        try {
            remoteNotificationBridge.handleCommentaryReceived(result);
        } catch {
            // best-effort — see ui/main.js's own 0.9.623 section
        }
    });

    return {
        getPublicationCommentariesCommand, addPublicationCommentaryCommand, createPublicationCommentaryCommand,
        distributionStore, distributionPeerExchange, remoteNotificationBridge, unsubscribeRemoteNotificationBridge
    };
}

async function run() {
    // ===============================================================
    // Section A — entry-state reconfirmation.
    //
    // Deliberately does NOT re-execute tests/PublicationCommentaryApplicationDistributionClosureAudit.test.js
    // (0.9.621) or tests/PostCommentaryDistributionProductReassessment.test.js
    // (0.9.622) live here, unlike those two test-only audits' own precedent
    // of re-executing their OWN predecessors: both carry a "no production
    // file is modified" guard scoped to `git diff --name-only HEAD`, which
    // is meaningful for a test-only audit committed on top of an already-
    // committed predecessor, but is structurally incompatible with THIS
    // milestone (a production wiring change, exactly like 0.9.620's own
    // type) being re-verified before its own commit lands — the same
    // reason tests/PublicationCommentaryDistributionWiring.test.js (0.9.620)
    // itself never re-executes any predecessor's own guarded audit file
    // live. This section instead re-runs only the two suites with no such
    // self-guard: 0.9.620's own wiring suite, the local producer's own
    // full unmodified-behavior suite (0.9.275), and this milestone's own
    // new unit suite.
    // ===============================================================
    {
        const wiringSuite = runGuardLive('tests/PublicationCommentaryDistributionWiring.test.js');
        assert(wiringSuite.passed && /All Publication Commentary Distribution Wiring tests passed/.test(wiringSuite.stdout),
            n('0.9.620\'s own wiring suite, re-executed live, still exits 0 and prints its own passing verdict'));

        const producerSuite = runGuardLive('tests/PublicationCommentaryNotificationProducer.test.js');
        assert(producerSuite.passed && /All PublicationCommentaryNotificationProducer tests passed/.test(producerSuite.stdout),
            n('0.9.275\'s own full producer test suite, re-executed live against the extracted-but-behaviorally-unchanged source, still exits 0'));

        const bridgeUnit = runGuardLive('tests/PublicationCommentaryRemoteNotificationBridge.test.js');
        assert(bridgeUnit.passed && /All PublicationCommentaryRemoteNotificationBridge tests passed/.test(bridgeUnit.stdout),
            n('this milestone\'s own new unit suite for the bridge in isolation, re-executed live, exits 0'));

        console.log('✓ A: 0.9.620\'s own wiring suite, 0.9.275\'s own producer suite (reconfirming the extraction is behavior-preserving), and this milestone\'s own new unit coverage, reconfirmed live, right now, against current source.');
    }

    // ===============================================================
    // Section B — ui/main.js source-level wiring.
    // ===============================================================
    {
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        assert(mainSource.includes("import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';"),
            n('ui/main.js imports the new bridge'));
        assert(mainSource.includes("import { NotificationEventStore } from '../storage/NotificationEventStore.js';"),
            n('ui/main.js imports NotificationEventStore, needed to construct the bridge\'s own notificationSink'));
        assert(mainSource.includes('new PublicationCommentaryRemoteNotificationBridge(') &&
               mainSource.includes('new LocalDiscoveryProvider(new LocalStorageProvider())') &&
               mainSource.includes('(notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)'),
            n('ui/main.js constructs the bridge with a fresh LocalDiscoveryProvider/NotificationEventStore pair (same underlying window.localStorage keys every other composition already uses) and a notificationSink identical in shape to CreatePublicationCommentaryUseCase.js\'s own'));
        assert(mainSource.includes('publicationCommentaryDistributionPeerExchange.onCommentaryReceived((result) => {') &&
               mainSource.includes('publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result)'),
            n('ui/main.js subscribes the bridge to the EXISTING publicationCommentaryDistributionPeerExchange\'s own onCommentaryReceived()'));
        assert(mainSource.includes("function addPublicationCommentaryCommand(input) {"),
            n('addPublicationCommentaryCommand itself is unchanged in shape — this milestone adds a new, separate subscription, never modifies the existing local-creation command'));

        console.log('✓ B: ui/main.js really does construct the new bridge and subscribe it to the existing onCommentaryReceived() — verified at the source level.');
    }

    // ===============================================================
    // Section C — bridge construction guard.
    // ===============================================================
    {
        const bridgeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js'));
        assert(!/NotificationInbox|NotificationDelivery|NotificationCenter|CommentaryNotificationSyncService/.test(bridgeSource),
            n('no new notification-infrastructure abstraction appears anywhere in the new bridge\'s own source'));

        const alice = makeIdentity('construction-guard-alice');
        const bus = new PeerMessageBus();
        class FakeRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const { store, peerExchange, distributionStore, remoteNotificationBridge, unsubscribeRemoteNotificationBridge } =
            (() => {
                const { store, peerExchange } = new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
                    identityProvider: alice, peerMessageBus: bus, connectedPeerRegistry: new FakeRegistry()
                });
                const remoteNotificationBridge = new PublicationCommentaryRemoteNotificationBridge(
                    new LocalDiscoveryProvider(new LocalStorageProvider()), alice, () => {}
                );
                const unsubscribeRemoteNotificationBridge = peerExchange.onCommentaryReceived((result) => remoteNotificationBridge.handleCommentaryReceived(result));
                return { store, peerExchange, distributionStore: store, remoteNotificationBridge, unsubscribeRemoteNotificationBridge };
            })();
        assert(store instanceof PublicationCommentaryStore, n('the pre-existing distribution composition root is untouched by this milestone'));
        assert(remoteNotificationBridge instanceof PublicationCommentaryRemoteNotificationBridge, n('the new bridge really is constructed'));
        assert(typeof unsubscribeRemoteNotificationBridge === 'function', n('onCommentaryReceived() still returns an unsubscribe function, reused unmodified by this milestone\'s own subscription'));
        unsubscribeRemoteNotificationBridge();
        peerExchange.dispose();

        console.log('✓ C: the new bridge composes cleanly onto the pre-existing, unmodified distribution composition root — no new abstraction.');
    }

    installWindowLocalStorage();
    const publisherProvider = makeIdentity('wiring-publisher-623');
    const publication = new Publication({
        id: 'pub-remote-notif-623',
        documentId: 'doc-remote-notif-623',
        title: 'Remote Notification Milestone World',
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    new LocalStorageProvider().save('forkbuild-publications', [publication.toJSON()]);
    const authorProvider = makeIdentity('wiring-author-623');

    // ===============================================================
    // Section D — THE FLAGSHIP: real, live, cross-device delivery ends in
    // exactly one local NotificationEvent on the Publication's own
    // publisher's own device.
    // ===============================================================
    let devicePublisherNotifications;
    {
        const network = new LocalPeerNetwork();
        const senderTransport = new LocalPeerConnectionProvider('sender-623', network);
        const receiverTransport = new LocalPeerConnectionProvider('receiver-publisher-623', network);
        const senderConnect = new ConnectToPeerUseCase({ peerConnectionProvider: senderTransport, identityProvider: authorProvider });
        const stopSender = senderConnect.listen();
        const receiverConnect = new ConnectToPeerUseCase({ peerConnectionProvider: receiverTransport, identityProvider: publisherProvider });
        const stopReceiver = receiverConnect.listen();
        const receiverToSender = receiverConnect.connect({ candidateEndpoint: 'sender-623' });
        await wait(20);
        assert(receiverToSender.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: the receiving device (the Publication\'s own publisher) authenticates to the sending device over a real transport'));

        // The SENDER — a real, wired application composition for the
        // commentary's own author, riding the live senderConnect.registry.
        const senderApp = bootApplication(authorProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: senderConnect.registry });

        // The RECEIVER — a SEPARATE real, wired application composition
        // for the Publication's own publisher, riding the live
        // receiverConnect.registry, over the SAME window.localStorage this
        // test's own installWindowLocalStorage() just installed. Two
        // independently-constructed bootApplication() calls sharing one
        // underlying storage backing simulates two devices sharing nothing
        // but the (real, live) network — the identical shape 0.9.620's own
        // Section F/0.9.622's own helpers already establish for "the same
        // replica, receiving," applied here across a real transport for
        // the very first time in this arc.
        const receiverApp = bootApplication(publisherProvider, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: receiverConnect.registry });

        const { commentary } = senderApp.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'delivered live to the publisher\'s own device' });
        await wait(40);

        assert(receiverApp.distributionStore.getById(commentary.commentaryId) !== null,
            n('setup: the Commentary really did arrive on the receiving (publisher\'s) device, over a real authenticated peer connection'));

        devicePublisherNotifications = new NotificationEventStore(new LocalStorageProvider()).loadAll()
            .filter((e) => e.recipientIdentityId === publisherProvider.getSigningIdentity().id && e.payload.commentaryId === commentary.commentaryId);
        assert(devicePublisherNotifications.length === 1,
            n('THE FLAGSHIP: exactly one local NotificationEvent now exists, addressed to the Publication\'s own publisher, for a Commentary that arrived entirely over the network — the gap 0.9.622 measured is closed'));
        const event = devicePublisherNotifications[0];
        assert(event.eventType === PUBLICATION_COMMENTED_EVENT_TYPE, n('and it carries the SAME publication.commented event type local creation already uses'));
        assert(event.payload.publicationId === commentary.publicationId && event.payload.authorIdentityId === commentary.authorIdentityId,
            n('with the correct publicationId and the REMOTE author\'s own identity, not the publisher\'s'));

        stopSender();
        stopReceiver();
        senderApp.unsubscribeRemoteNotificationBridge();
        receiverApp.unsubscribeRemoteNotificationBridge();
        senderApp.distributionPeerExchange.dispose();
        receiverApp.distributionPeerExchange.dispose();

        console.log('✓ D: FLAGSHIP — a Commentary created on one real, wired device produces exactly one local NotificationEvent on the Publication\'s own publisher\'s independent, real, wired receiving device.');
    }

    // ===============================================================
    // Section E — local creation still produces exactly one notification
    // — no duplication introduced by this milestone.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisher2 = makeIdentity('no-dup-publisher-623');
        const publication2 = seedPublication('pub-no-dup-623', publisher2);

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        // The creating device IS the publisher here — the one case where,
        // pre-0.9.623, only the local producer ever fired. This section
        // confirms it still fires exactly once, never twice (once from
        // local creation, and again from this milestone's own new
        // subscription, which never observes local creation at all — see
        // application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js's
        // own onCommentaryReceived() contract: it fires only for INCOMING
        // ANNOUNCE messages, never for announce() calls this same replica
        // itself makes).
        const app = bootApplication(publisher2, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });
        app.addPublicationCommentaryCommand({ publicationId: publication2.id, content: 'local creation, same device is the publisher' });

        const notifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(notifications.length === 1, n('local creation, even when the creating device is itself the Publication\'s own publisher, still produces exactly ONE NotificationEvent — this milestone\'s own new subscription never double-fires for a locally-created Commentary'));

        app.unsubscribeRemoteNotificationBridge();
        app.distributionPeerExchange.dispose();
        console.log('✓ E: no duplicate notification for local creation — Device A = 1, never 2.');
    }

    // ===============================================================
    // Section F — a receiving replica that is NOT the Publication's own
    // publisher stores the Commentary but produces zero notifications.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisher3 = makeIdentity('not-publisher-publisher-623');
        const publication3 = seedPublication('pub-not-publisher-623', publisher3);
        const remoteAuthor3 = makeIdentity('not-publisher-author-623');
        const thirdPartyReceiver = makeIdentity('not-publisher-thirdparty-623'); // neither author nor publisher

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = bootApplication(thirdPartyReceiver, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });

        // Deliver directly into this replica's own distribution store,
        // exactly as a live ANNOUNCE already would (0.9.622's own
        // deliverRemoteCommentary() helper, reproduced here) — this
        // section is about the notification gate, not the transport,
        // which Section D above already proves works live.
        const remoteExchange = new PublicationCommentaryDistributionExchange(
            new PublicationCommentaryStore(new InMemoryStorageProvider()), remoteAuthor3, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: publication3.id,
            authorIdentityId: remoteAuthor3.getSigningIdentity().id,
            content: 'a third party merely relaying this, never the publisher'
        });
        const envelope = remoteExchange.exportCommentary(commentary);
        const importer = new PublicationCommentaryDistributionExchange(app.distributionStore, remoteAuthor3, new LocalAuthorizationVerifier());
        const { isNew } = importer.importCommentaryEnvelope(envelope);
        app.remoteNotificationBridge.handleCommentaryReceived({ commentary, isNew });

        assert(app.distributionStore.getById(commentary.commentaryId) !== null, n('the Commentary really is stored on this third-party replica'));
        const notifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(notifications.length === 0, n('but zero NotificationEvents are produced — this replica\'s own identity is neither the Commentary\'s author nor the resolved Publication\'s own publisher'));

        app.unsubscribeRemoteNotificationBridge();
        app.distributionPeerExchange.dispose();
        console.log('✓ F: a non-publisher replica stores an arriving Commentary but never notifies — only the Publication\'s own publisher\'s replica does.');
    }

    // ===============================================================
    // Section G — idempotent/repeated delivery produces no additional
    // notification.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisher4 = makeIdentity('idempotent-publisher-623');
        const publication4 = seedPublication('pub-idempotent-623', publisher4);
        const remoteAuthor4 = makeIdentity('idempotent-author-623');

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = bootApplication(publisher4, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });

        const remoteExchange = new PublicationCommentaryDistributionExchange(
            new PublicationCommentaryStore(new InMemoryStorageProvider()), remoteAuthor4, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: publication4.id,
            authorIdentityId: remoteAuthor4.getSigningIdentity().id,
            content: 'delivered, then re-delivered'
        });
        const envelope = remoteExchange.exportCommentary(commentary);
        const importer = new PublicationCommentaryDistributionExchange(app.distributionStore, remoteAuthor4, new LocalAuthorizationVerifier());

        const first = importer.importCommentaryEnvelope(envelope);
        app.remoteNotificationBridge.handleCommentaryReceived(first);
        const second = importer.importCommentaryEnvelope(envelope);
        app.remoteNotificationBridge.handleCommentaryReceived(second);
        const third = importer.importCommentaryEnvelope(envelope);
        app.remoteNotificationBridge.handleCommentaryReceived(third);

        assert(first.isNew === true && second.isNew === false && third.isNew === false, n('setup: the underlying store\'s own dedup reports isNew accurately across repeated delivery'));
        const notifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(notifications.length === 1, n('repeated delivery of the identical envelope produces exactly ONE NotificationEvent total, never one per delivery'));

        app.unsubscribeRemoteNotificationBridge();
        app.distributionPeerExchange.dispose();
        console.log('✓ G: repeated network delivery stays idempotent at the notification layer too, reusing the store\'s own already-authoritative isNew.');
    }

    // ===============================================================
    // Section H — a rejected (tampered) envelope never reaches
    // onCommentaryReceived() at all, so never produces a notification.
    // ===============================================================
    {
        installWindowLocalStorage();
        const publisher5 = makeIdentity('rejected-publisher-623');
        const publication5 = seedPublication('pub-rejected-623', publisher5);
        const remoteAuthor5 = makeIdentity('rejected-author-623');
        const forger5 = makeIdentity('rejected-forger-623');

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = bootApplication(publisher5, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });

        // Tampered content after signing.
        {
            const remoteExchange = new PublicationCommentaryDistributionExchange(
                new PublicationCommentaryStore(new InMemoryStorageProvider()), remoteAuthor5, new LocalAuthorizationVerifier()
            );
            const commentary = new PublicationCommentary({ publicationId: publication5.id, authorIdentityId: remoteAuthor5.getSigningIdentity().id, content: 'original' });
            const envelope = remoteExchange.exportCommentary(commentary);
            const tampered = JSON.parse(JSON.stringify(envelope));
            tampered.content = 'tampered after signing';
            const importer = new PublicationCommentaryDistributionExchange(app.distributionStore, remoteAuthor5, new LocalAuthorizationVerifier());
            let threw = false;
            try { importer.importCommentaryEnvelope(tampered); } catch { threw = true; }
            assert(threw, n('setup: a tampered envelope is rejected by the exchange itself, exactly as 0.9.618 already established'));
        }

        // Forged signer: a commentary claiming to be authored by
        // remoteAuthor5 but actually signed by forger5.
        {
            const forgerExchange = new PublicationCommentaryDistributionExchange(
                new PublicationCommentaryStore(new InMemoryStorageProvider()), forger5, new LocalAuthorizationVerifier()
            );
            const forged = new PublicationCommentary({ publicationId: publication5.id, authorIdentityId: remoteAuthor5.getSigningIdentity().id, content: 'forged' });
            let threw = false;
            try { forgerExchange.exportCommentary(forged); } catch { threw = true; }
            assert(threw, n('setup: signing a Commentary under an identity that is not the signer\'s own is rejected at export time, exactly as 0.9.618 already established'));
        }

        const notifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(notifications.length === 0, n('neither the tampered nor the forged attempt ever reached onCommentaryReceived(), so neither ever reached this milestone\'s own bridge — zero notifications, matching zero stored Commentaries'));

        app.unsubscribeRemoteNotificationBridge();
        app.distributionPeerExchange.dispose();
        console.log('✓ H: rejected envelopes (tampered content, forged signer) never reach this milestone\'s own notification wiring — the pre-existing signature boundary is the only gate that matters here.');
    }

    // ===============================================================
    // Section I — unknown Publication on the receiving replica.
    // ===============================================================
    {
        installWindowLocalStorage();
        const someIdentity = makeIdentity('orphan-receiver-623');
        const remoteAuthor6 = makeIdentity('orphan-author-623');

        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const app = bootApplication(someIdentity, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new NoPeerRegistry() });

        const remoteExchange = new PublicationCommentaryDistributionExchange(
            new PublicationCommentaryStore(new InMemoryStorageProvider()), remoteAuthor6, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: 'pub-never-discovered-anywhere-623',
            authorIdentityId: remoteAuthor6.getSigningIdentity().id,
            content: 'about a Publication nobody here has discovered'
        });
        const envelope = remoteExchange.exportCommentary(commentary);
        const importer = new PublicationCommentaryDistributionExchange(app.distributionStore, remoteAuthor6, new LocalAuthorizationVerifier());
        const { isNew } = importer.importCommentaryEnvelope(envelope);

        let threw = false;
        try {
            app.remoteNotificationBridge.handleCommentaryReceived({ commentary, isNew });
        } catch {
            threw = true;
        }
        assert(!threw, n('an unresolvable Publication on the receiving replica never throws from this milestone\'s own wiring'));
        assert(app.distributionStore.getById(commentary.commentaryId) !== null, n('the Commentary itself is still stored, exactly as 0.9.622\'s own Section B already established'));
        const notifications = new NotificationEventStore(new LocalStorageProvider()).loadAll();
        assert(notifications.length === 0, n('no notification is produced — no Publication-existence/synchronization requirement was introduced by this milestone'));

        app.unsubscribeRemoteNotificationBridge();
        app.distributionPeerExchange.dispose();
        console.log('✓ I: an unknown Publication degrades to silent, error-free non-notification, matching 0.9.622\'s own established boundary.');
    }

    // ===============================================================
    // Section J — NotificationEvent itself never travels the network.
    // ===============================================================
    {
        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        const exchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionExchange.js'));
        const bridgeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js'));
        assert(!/NotificationEvent/.test(peerExchangeSource) && !/NotificationEvent/.test(exchangeSource),
            n('neither the peer transport layer nor the signing/verification layer imports or mentions NotificationEvent at all — unchanged by this milestone'));
        assert(!/PeerMessageBus|\.send\(|\.attach\(|\.subscribe\(/.test(bridgeSource),
            n('the new bridge itself never touches a peer transport primitive — it is reached only through the caller-supplied { commentary, isNew } fact, never by sending or receiving anything over the wire itself'));

        const notificationSendSites = grepFiles('NotificationEvent', ['peer']);
        assert(notificationSendSites.length === 0, n('no file under peer/ (the transport layer) mentions NotificationEvent anywhere in this codebase'));

        console.log('✓ J: NotificationEvent construction stays entirely local and downstream of verified receipt — never becomes, or touches, a distributed payload.');
    }

    // ===============================================================
    // Section K — production-change scope guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        const changedFiles = changedNonTestFiles ? changedNonTestFiles.split('\n') : [];
        const allowed = new Set([
            'application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js',
            'application/publication/commentary/PublicationCommentaryNotificationProducer.js',
            'ui/main.js'
        ]);
        const unexpected = changedFiles.filter((f) => !allowed.has(f));
        assert(unexpected.length === 0, n(`only the intended new bridge file and ui/main.js are modified — unexpected: ${unexpected.join(', ') || 'none'}`));

        console.log('✓ K: production changes are confined to exactly the new bridge file and its ui/main.js wiring.');
    }

    // ===============================================================
    // Section L — verdict.
    // ===============================================================
    {
        console.log(
            '\n0.9.623 verdict: CONCRETE_PRODUCT_GAP (0.9.622, Section E) -> CLOSED. application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js '
            + 'connects the already-built onCommentaryReceived() (0.9.618) to the already-built publication.commented NotificationEvent shape '
            + '(0.9.275), gated on isNew and on this replica\'s own identity being the resolved Publication\'s own publisher (Sections C, D, F); '
            + 'ui/main.js subscribes it alongside the existing distribution wiring (Section B); a real, live, cross-device delivery now produces '
            + 'exactly one local NotificationEvent on the publisher\'s own independent device (Section D, FLAGSHIP); local creation still produces '
            + 'exactly one notification, never two (Section E); a non-publisher replica stores but never notifies (Section F); repeated delivery '
            + 'stays idempotent at the notification layer (Section G); rejected envelopes never reach this wiring at all (Section H); an unknown '
            + 'Publication degrades to silence, never an error, with no Publication-sync requirement introduced (Section I); NotificationEvent '
            + 'itself still never crosses the network (Section J, reconfirming 0.9.617/0.9.618 unchanged); and production changes are confined to '
            + 'exactly the new bridge and its ui/main.js wiring (Section K). RECOMMENDATION: a follow-up closure audit (0.9.624) to reconfirm this '
            + 'result against the real running application one more time; if no further Commentary-notification gap survives, stop Commentary '
            + 'notification work and move to another product area, per 0.9.622\'s own stated plan.'
        );
        console.log(`✅ All Publication Commentary Remote Notification Wiring tests passed (${assertionCount} assertions).`);
    }
}

await run();
