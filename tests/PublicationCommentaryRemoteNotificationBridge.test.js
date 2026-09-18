import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryRemoteNotificationBridge
} from '../application/PublicationCommentaryRemoteNotificationBridge.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { readFile } from 'node:fs/promises';

// 0.9.623 — Wire Remote Commentary Arrival into Local Notifications.
//
// Unit coverage for application/PublicationCommentaryRemoteNotificationBridge.js
// in isolation — the small adapter that turns
// PublicationCommentaryDistributionPeerExchange#onCommentaryReceived()'s
// own `{ commentary, isNew }` fact into the IDENTICAL `publication.commented`
// NotificationEvent shape PublicationCommentaryNotificationProducer.js
// (0.9.275) already produces for local creation. See tests/
// PublicationCommentaryRemoteNotificationWiring.test.js for the real,
// wired, cross-device production coverage this file's own header points
// to.
//
// The flagship scenario (Section A) exercises the bridge with a REAL
// LocalDiscoveryProvider and a REAL, authenticated LocalIdentityProvider —
// mirroring tests/PublicationCommentaryNotificationProducer.test.js's own
// "real infrastructure, fake sink" shape exactly. Only the notification
// sink is captured in memory.

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

function makePublication({ id, publisherProvider }) {
    const publication = new Publication({
        id,
        documentId: `doc-for-${id}`,
        title: `World ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const discoveryStorage = new InMemoryStorageProvider();
    discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
    return { publication, discoveryProvider: new LocalDiscoveryProvider(discoveryStorage) };
}

function makeCommentary({ publicationId, authorProvider, content = 'a remote commentary', commentaryId, createdAt }) {
    return new PublicationCommentary({
        commentaryId,
        publicationId,
        authorIdentityId: authorProvider.getSigningIdentity().id,
        content,
        createdAt
    });
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Flagship: a new remote arrival, received by the
    // Publication's own publisher, produces exactly one NotificationEvent
    // with the identical shape the local producer already uses.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // the publisher, receiving on this replica
        const bob = makeIdentity('Bob'); // the remote commentary's own author
        const { publication, discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });

        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (event) => produced.push(event));

        const commentary = makeCommentary({ publicationId: 'pub-1', authorProvider: bob, content: 'Beautiful world!' });
        bridge.handleCommentaryReceived({ commentary, isNew: true });

        assert(produced.length === 1, 'A1. exactly one NotificationEvent was produced for one new remote arrival');
        const event = produced[0];
        assert(event instanceof NotificationEvent, 'A2. the produced value is a real NotificationEvent instance');
        assert(event.eventType === PUBLICATION_COMMENTED_EVENT_TYPE, 'A3. eventType is "publication.commented" — the SAME constant the local producer uses, reused verbatim');
        assert(event.recipientIdentityId === publication.publisherIdentity.id, 'A4. the recipient is exactly the Publication\'s own publisherIdentity');
        assert(event.payload.commentaryId === commentary.commentaryId, 'A5. payload.commentaryId matches the received Commentary exactly');
        assert(event.payload.publicationId === commentary.publicationId, 'A6. payload.publicationId matches exactly');
        assert(event.payload.authorIdentityId === bob.getSigningIdentity().id, 'A7. payload.authorIdentityId is the remote author, not the receiving publisher');
        assert(event.createdAt.getTime() === commentary.createdAt.getTime(), 'A8. createdAt is copied from the Commentary\'s own fact timestamp, never processing time');

        console.log('✓ A: a new remote arrival, received by the Publication\'s own publisher, produces the identical NotificationEvent shape local creation already does.');
    }

    // -------------------------------------------------------------
    // Section B — isNew: false produces no notification (idempotent/
    // repeated delivery).
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (e) => produced.push(e));

        const commentary = makeCommentary({ publicationId: 'pub-1', authorProvider: bob });
        bridge.handleCommentaryReceived({ commentary, isNew: false });

        assert(produced.length === 0, 'B1. a re-announce of an already-known Commentary (isNew: false) produces no NotificationEvent');

        console.log('✓ B: repeated/idempotent delivery produces no additional notification — reuses onCommentaryReceived()\'s own already-authoritative isNew flag.');
    }

    // -------------------------------------------------------------
    // Section C — receiving replica is NOT the Publication's own
    // publisher: no notification, even though the arrival is genuinely new.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // publisher
        const bob = makeIdentity('Bob'); // commentary author
        const carol = makeIdentity('Carol'); // an unrelated replica that merely relayed/received the announce
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, carol, (e) => produced.push(e));

        const commentary = makeCommentary({ publicationId: 'pub-1', authorProvider: bob });
        bridge.handleCommentaryReceived({ commentary, isNew: true });

        assert(produced.length === 0, 'C1. a replica whose own identity is not the resolved Publication\'s publisher produces no NotificationEvent, even for a genuinely new arrival');

        console.log('✓ C: only the Publication\'s own publisher\'s replica ever produces a notification for a remote arrival — every other connected peer stays silent.');
    }

    // -------------------------------------------------------------
    // Section D — self-commentary semantics remain explicit (no
    // suppression) — mirrors PublicationCommentaryNotificationProducer.js's
    // own Section K exactly, at this file's own remote entry point.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // both the publisher AND, here, the remote commentary's own author
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (e) => produced.push(e));

        const commentary = makeCommentary({ publicationId: 'pub-1', authorProvider: alice, content: 'a remote replica syncing my own comment back to me' });
        bridge.handleCommentaryReceived({ commentary, isNew: true });

        assert(produced.length === 1, 'D1. a remote arrival authored by the same identity as the receiving publisher still produces a notification — no automatic suppression is invented');
        assert(produced[0].payload.authorIdentityId === produced[0].recipientIdentityId, 'D2. author and recipient are explicitly the same identity here, recorded, not hidden — same restraint as the local producer\'s own Section K');

        console.log('✓ D: self-commentary through the remote path is unconditional too, matching the local producer\'s own already-established restraint.');
    }

    // -------------------------------------------------------------
    // Section E — unknown Publication: no notification, never a thrown
    // error, mirroring PublicationCommentaryNotificationProducer.js's own
    // Section L exactly.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const emptyDiscovery = new LocalDiscoveryProvider(new InMemoryStorageProvider());
        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(emptyDiscovery, alice, (e) => produced.push(e));

        const commentary = makeCommentary({ publicationId: 'pub-never-discovered', authorProvider: bob });
        let threw = false;
        try {
            bridge.handleCommentaryReceived({ commentary, isNew: true });
        } catch {
            threw = true;
        }
        assert(!threw, 'E1. an unresolvable Publication never throws — the Commentary itself was already stored upstream, before this bridge is ever called');
        assert(produced.length === 0, 'E2. no NotificationEvent is produced when the Publication cannot be resolved locally');

        console.log('✓ E: an unknown/undiscovered Publication degrades to silence, never an error — no Publication-existence requirement is introduced.');
    }

    // -------------------------------------------------------------
    // Section F — no authenticated identity on the receiving replica: no
    // notification, never a thrown error (mirrors identity/
    // resolveSigningIdentityId.js's own "degrades to null" contract).
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const unauthenticatedProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        unauthenticatedProvider.createLocalIdentity('unauthenticated'); // created, never authenticated

        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, unauthenticatedProvider, (e) => produced.push(e));
        const commentary = makeCommentary({ publicationId: 'pub-1', authorProvider: bob });

        let threw = false;
        try {
            bridge.handleCommentaryReceived({ commentary, isNew: true });
        } catch {
            threw = true;
        }
        assert(!threw, 'F1. an unauthenticated receiving identity never throws');
        assert(produced.length === 0, 'F2. and produces no notification — it can never equal the resolved Publication\'s own publisherIdentity');

        console.log('✓ F: an unauthenticated receiving replica stays silent, never throws.');
    }

    // -------------------------------------------------------------
    // Section G — multiple arrivals, multiple Publications: isolation.
    // -------------------------------------------------------------
    {
        const alicePublisher = makeIdentity('AlicePublisher');
        const bobPublisher = makeIdentity('BobPublisher');
        const carolAuthor = makeIdentity('CarolAuthor');

        const { discoveryProvider: aliceDiscovery, publication: alicePub } = makePublication({ id: 'pub-alice', publisherProvider: alicePublisher });
        const { discoveryProvider: bobDiscovery, publication: bobPub } = makePublication({ id: 'pub-bob', publisherProvider: bobPublisher });

        const produced = [];
        const sink = (e) => produced.push(e);
        new PublicationCommentaryRemoteNotificationBridge(aliceDiscovery, alicePublisher, sink)
            .handleCommentaryReceived({ commentary: makeCommentary({ publicationId: 'pub-alice', authorProvider: carolAuthor, content: 'On Alice\'s World' }), isNew: true });
        new PublicationCommentaryRemoteNotificationBridge(bobDiscovery, bobPublisher, sink)
            .handleCommentaryReceived({ commentary: makeCommentary({ publicationId: 'pub-bob', authorProvider: carolAuthor, content: 'On Bob\'s World' }), isNew: true });

        assert(produced.length === 2, 'G1. two independent remote arrivals on two independent replicas each produce their own notification');
        assert(produced[0].recipientIdentityId === alicePub.publisherIdentity.id, 'G2. the first is addressed to Alice');
        assert(produced[1].recipientIdentityId === bobPub.publisherIdentity.id, 'G3. the second is addressed to Bob');
        assert(produced[0].notificationId !== produced[1].notificationId, 'G4. the two notifications have distinct ids');

        console.log('✓ G: independent Publications/replicas never cross-address each other\'s publisher.');
    }

    // -------------------------------------------------------------
    // Section H — payload contains only factual identifiers, matching
    // PublicationCommentaryNotificationProducer.js's own Section F exactly.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const produced = [];
        new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (e) => produced.push(e))
            .handleCommentaryReceived({ commentary: makeCommentary({ publicationId: 'pub-1', authorProvider: bob, content: 'No presentation fields here.' }), isNew: true });

        const payload = produced[0].payload;
        assert(Object.keys(payload).sort().join(',') === 'authorIdentityId,commentaryId,publicationId', 'H1. the payload has exactly three keys');
        assert(!('title' in payload) && !('message' in payload) && !('icon' in payload) && !('url' in payload), 'H2. no presentation field is ever added');

        console.log('✓ H: the remote-arrival payload is exactly as factual as the local one — no schema redesign.');
    }

    // -------------------------------------------------------------
    // Section I — notification sink failure propagates unmodified, never
    // swallowed — mirrors PublicationCommentaryNotificationProducer.js's
    // own Section J.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, () => { throw new Error('simulated sink failure'); });

        let threw = false;
        try {
            bridge.handleCommentaryReceived({ commentary: makeCommentary({ publicationId: 'pub-1', authorProvider: bob }), isNew: true });
        } catch (error) {
            threw = true;
            assert(error.message === 'simulated sink failure', 'I1. the sink\'s own failure propagates unmodified, never swallowed or wrapped');
        }
        assert(threw, 'I2. a sink failure is not silently absorbed by this bridge itself — isolating it is the CALLER\'s own responsibility, per this file\'s own header');

        console.log('✓ I: a notificationSink failure propagates unmodified out of this bridge — failure isolation is deliberately the caller\'s job, not this file\'s.');
    }

    // -------------------------------------------------------------
    // Section J — construction guards.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });

        let threw = false;
        try { new PublicationCommentaryRemoteNotificationBridge(null, alice, () => {}); } catch { threw = true; }
        assert(threw, 'J1. a missing discoveryProvider is rejected at construction');

        threw = false;
        try { new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, null, () => {}); } catch { threw = true; }
        assert(threw, 'J2. a missing identityProvider is rejected at construction');

        threw = false;
        try { new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, null); } catch { threw = true; }
        assert(threw, 'J3. a missing notificationSink is rejected at construction');

        threw = false;
        try { new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, 'not-a-function'); } catch { threw = true; }
        assert(threw, 'J4. a non-function notificationSink is rejected at construction');
    }

    // -------------------------------------------------------------
    // Section K — malformed handleCommentaryReceived() input degrades
    // silently, never throws.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const produced = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (e) => produced.push(e));

        let threw = false;
        try {
            bridge.handleCommentaryReceived({ commentary: null, isNew: true });
            bridge.handleCommentaryReceived({ isNew: true });
            bridge.handleCommentaryReceived();
        } catch {
            threw = true;
        }
        assert(!threw, 'K1. malformed/missing input never throws');
        assert(produced.length === 0, 'K2. and never produces a notification');

        console.log('✓ J-K: construction guards reject invalid collaborators; malformed call-time input degrades silently.');
    }

    // -------------------------------------------------------------
    // Section L — structural: reuses the local producer's own
    // construction verbatim (never a second `new NotificationEvent(...)`
    // call site), no distribution/wire vocabulary, no second event-type
    // vocabulary, no notification persistence dependency of its own.
    // -------------------------------------------------------------
    {
        const bridgeSource = codeOnlyLines(await rawSource('application/PublicationCommentaryRemoteNotificationBridge.js'));
        assert(bridgeSource.includes("import { buildPublicationCommentedNotificationEvent } from './PublicationCommentaryNotificationProducer.js';"),
            'L1. the bridge reuses the local producer\'s own already-exported construction function, verbatim');
        assert(!/new NotificationEvent\(/.test(bridgeSource),
            'L1b. this file never constructs a NotificationEvent directly — application/PublicationCommentaryNotificationProducer.js#buildPublicationCommentedNotificationEvent() remains the only construction site');
        assert(!/PUBLICATION_COMMENTARY_RECEIVED|'commentary.received'|"commentary.received"/.test(bridgeSource),
            'L2. no second, remote-specific event-type vocabulary is introduced');
        assert(!/PeerMessageBus|announce\(|importCommentaryEnvelope|exportCommentary/.test(bridgeSource),
            'L3. this file never touches the peer transport or envelope layer directly — it only reacts to the already-verified, already-decoded { commentary, isNew } fact its caller hands it');
        assert(!/NotificationEventStore|NotificationHistoryPanel/.test(bridgeSource),
            'L4. this file has no notification-persistence or UI opinion of its own — notificationSink stays a plain injected function, exactly like the local producer\'s own');
        assert(!/\bretry\b|\bretries\b|\bqueue\b/i.test(bridgeSource),
            'L5. no retry/queue vocabulary appears anywhere in this file\'s own code');

        const producerSource = codeOnlyLines(await rawSource('application/PublicationCommentaryNotificationProducer.js'));
        assert(producerSource.includes('export function buildPublicationCommentedNotificationEvent('),
            'L6. application/PublicationCommentaryNotificationProducer.js exports the construction function this bridge imports');
        assert((producerSource.match(/new NotificationEvent\(/g) || []).length === 1,
            'L7. application/PublicationCommentaryNotificationProducer.js itself still contains exactly one NotificationEvent construction site, used by both local execute() and this bridge');

        console.log('✓ L: structural boundaries hold — one shared construction function, no second notification vocabulary, no transport/persistence coupling.');
    }

    console.log('\n✅ All PublicationCommentaryRemoteNotificationBridge tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryRemoteNotificationBridge tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryRemoteNotificationBridge tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
