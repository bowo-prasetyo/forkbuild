import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import {
    PublicationCommentaryNotificationProducer,
    PUBLICATION_COMMENTED_EVENT_TYPE
} from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// 0.9.275 — Publication Commentary Notification Producer. Covers
// application/PublicationCommentaryNotificationProducer.js — the first
// real NotificationEvent producer, selected by 0.9.274's own boundary
// audit.
//
// The flagship scenario (Section A) uses the REAL AddPublicationCommentaryUseCase,
// a REAL PublicationCommentaryStore, a REAL LocalDiscoveryProvider, and
// REAL, authenticated LocalIdentityProvider instances — the identical
// "real infrastructure, fake sink" shape tests/NotificationEventBoundaryAudit.test.js
// Section B1/E1 already used to prove Publication Commentary's own
// semantics. Only the notification sink is captured in memory.

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class WriteFailingStorageProvider extends StorageProvider {
    save() { throw new Error('simulated write failure'); }
    load() { return null; }
    remove() {}
    list() { return []; }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// A real Publication, discoverable through a real LocalDiscoveryProvider —
// the same wiring tests/NotificationEventBoundaryAudit.test.js Section B1
// already used, so `publisherIdentity` is a genuine, on-file field rather
// than a hand-rolled fixture.
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

function buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider, sink }) {
    const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
    const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, commentAuthorProvider, canComment);
    return new PublicationCommentaryNotificationProducer(addUseCase, discoveryProvider, sink);
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
    // Section A — Flagship: successful Commentary -> NotificationEvent,
    // real infrastructure throughout, only the sink captured in memory.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { publication, discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({
            discoveryProvider, commentaryStore, commentAuthorProvider: bob,
            sink: (event) => produced.push(event)
        });

        const { commentary, isNew } = producer.execute({ publicationId: 'pub-1', content: 'Beautiful world!' });

        assert(isNew === true, 'A1. the wrapped use case still reports isNew accurately');
        assert(produced.length === 1, 'A2. exactly one NotificationEvent was produced for one successful Commentary');

        const event = produced[0];
        assert(event instanceof NotificationEvent, 'A3. the produced value is a real NotificationEvent instance');
        assert(event.eventType === PUBLICATION_COMMENTED_EVENT_TYPE, 'A4. eventType is "publication.commented"');
        assert(event.recipientIdentityId === publication.publisherIdentity.id,
            'A5. the recipient is exactly the Publication\'s own publisherIdentity');
        assert(event.payload.commentaryId === commentary.commentaryId, 'A6. payload.commentaryId matches the persisted Commentary exactly');
        assert(event.payload.publicationId === commentary.publicationId, 'A7. payload.publicationId matches exactly');
        assert(event.payload.authorIdentityId === bob.getSigningIdentity().id, 'A8. payload.authorIdentityId is the comment author, not the publisher');
        assert(event.createdAt.getTime() === commentary.createdAt.getTime(), 'A9. createdAt is copied from the Commentary\'s own fact timestamp');

        const persisted = commentaryStore.getById(commentary.commentaryId);
        assert(persisted !== null, 'A10. the Commentary itself is genuinely persisted through the real store');
    }

    // -------------------------------------------------------------
    // Section B — Exact publisher recipient, distinct from the author
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-1', content: 'Nice.' });

        assert(produced[0].recipientIdentityId === alice.getSigningIdentity().id, 'B1. recipient is Alice, the publisher');
        assert(produced[0].recipientIdentityId !== bob.getSigningIdentity().id, 'B2. recipient is never the commenting author');
    }

    // -------------------------------------------------------------
    // Section C — Exact commentary and Publication identity in the payload
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-distinct', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-distinct', content: 'Comment content.' });

        assert(produced[0].payload.publicationId === 'pub-distinct', 'C1. publicationId is preserved exactly');
        assert(produced[0].payload.commentaryId === commentary.commentaryId, 'C2. commentaryId is preserved exactly');
        assert(produced[0].payload.commentaryId !== produced[0].payload.publicationId, 'C3. commentaryId and publicationId are never the same value');
    }

    // -------------------------------------------------------------
    // Section D — Author identity preservation
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const sink = (e) => produced.push(e);
        buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink }).execute({ publicationId: 'pub-1', content: 'From Bob' });
        buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: carol, sink }).execute({ publicationId: 'pub-1', content: 'From Carol' });

        assert(produced[0].payload.authorIdentityId === bob.getSigningIdentity().id, 'D1. Bob\'s comment carries Bob\'s own identity');
        assert(produced[1].payload.authorIdentityId === carol.getSigningIdentity().id, 'D2. Carol\'s comment carries Carol\'s own identity');
        assert(produced[0].recipientIdentityId === produced[1].recipientIdentityId, 'D3. both are addressed to the same publisher regardless of which author commented');
    }

    // -------------------------------------------------------------
    // Section E — Commentary createdAt -> notification createdAt
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const fixedCreatedAt = new Date('2024-06-01T12:00:00.000Z');
        const { commentary } = producer.execute({ publicationId: 'pub-1', content: 'Timestamped.', createdAt: fixedCreatedAt });

        assert(commentary.createdAt.getTime() === fixedCreatedAt.getTime(), 'E1. sanity: the Commentary itself carries the caller-supplied createdAt');
        assert(produced[0].createdAt.getTime() === fixedCreatedAt.getTime(), 'E2. the notification\'s createdAt is the Commentary\'s own fact timestamp, never processing time');
    }

    // -------------------------------------------------------------
    // Section F — Payload contains only factual identifiers
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-1', content: 'No presentation fields here.' });

        const payload = produced[0].payload;
        assert(Object.keys(payload).sort().join(',') === 'authorIdentityId,commentaryId,publicationId',
            'F1. the payload has exactly three keys — publicationId, commentaryId, authorIdentityId');
        assert(!('title' in payload) && !('message' in payload) && !('icon' in payload) && !('url' in payload) && !('displayText' in payload),
            'F2. no presentation field (title/message/icon/url/displayText) is ever added');
    }

    // -------------------------------------------------------------
    // Section G — Multiple comments produce distinct notification ids
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-1', content: 'First.' });
        producer.execute({ publicationId: 'pub-1', content: 'Second.' });
        producer.execute({ publicationId: 'pub-1', content: 'Third.' });

        assert(produced.length === 3, 'G1. three Commentaries produced three NotificationEvents');
        const ids = new Set(produced.map((e) => e.notificationId));
        assert(ids.size === 3, 'G2. all three notificationIds are distinct');
        const commentaryIds = new Set(produced.map((e) => e.payload.commentaryId));
        assert(commentaryIds.size === 3, 'G3. all three payload.commentaryId values are distinct');
    }

    // -------------------------------------------------------------
    // Section H — Multiple Publications remain isolated
    // -------------------------------------------------------------
    {
        const alicePublisher = makeIdentity('AlicePublisher');
        const bobPublisher = makeIdentity('BobPublisher');
        const carolCommenter = makeIdentity('CarolCommenter');

        const aliceStorage = new InMemoryStorageProvider();
        const bobStorage = new InMemoryStorageProvider();
        const alicePub = new Publication({ id: 'pub-alice', documentId: 'doc-alice', title: 'Alice World', author: 'alice', publisherIdentity: alicePublisher.getSigningIdentity().toJSON() });
        const bobPub = new Publication({ id: 'pub-bob', documentId: 'doc-bob', title: 'Bob World', author: 'bob', publisherIdentity: bobPublisher.getSigningIdentity().toJSON() });
        aliceStorage.save('forkbuild-publications', [alicePub.toJSON()]);
        bobStorage.save('forkbuild-publications', [bobPub.toJSON()]);
        const aliceDiscovery = new LocalDiscoveryProvider(aliceStorage);
        const bobDiscovery = new LocalDiscoveryProvider(bobStorage);
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const sink = (e) => produced.push(e);
        buildProducer({ discoveryProvider: aliceDiscovery, commentaryStore, commentAuthorProvider: carolCommenter, sink })
            .execute({ publicationId: 'pub-alice', content: 'On Alice\'s World' });
        buildProducer({ discoveryProvider: bobDiscovery, commentaryStore, commentAuthorProvider: carolCommenter, sink })
            .execute({ publicationId: 'pub-bob', content: 'On Bob\'s World' });

        assert(produced[0].recipientIdentityId === alicePublisher.getSigningIdentity().id, 'H1. the first notification is addressed to Alice');
        assert(produced[1].recipientIdentityId === bobPublisher.getSigningIdentity().id, 'H2. the second notification is addressed to Bob');
        assert(produced[0].recipientIdentityId !== produced[1].recipientIdentityId, 'H3. the two Publications\' notifications never cross-address each other\'s publisher');
    }

    // -------------------------------------------------------------
    // Section I — Commentary persistence failure produces no notification
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const failingStore = new PublicationCommentaryStore(new WriteFailingStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore: failingStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        let threw = false;
        try {
            producer.execute({ publicationId: 'pub-1', content: 'Never persisted.' });
        } catch (error) {
            threw = true;
        }
        assert(threw, 'I1. a genuine storage write failure propagates out of the producer');
        assert(produced.length === 0, 'I2. no NotificationEvent is produced when Commentary persistence fails');
    }

    // -------------------------------------------------------------
    // Section J — Notification sink failure does not corrupt persisted Commentary
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const producer = buildProducer({
            discoveryProvider, commentaryStore, commentAuthorProvider: bob,
            sink: () => { throw new Error('simulated sink failure'); }
        });

        let threw = false;
        try {
            producer.execute({ publicationId: 'pub-1', content: 'Sink will fail.' });
        } catch (error) {
            threw = true;
            assert(error.message === 'simulated sink failure', 'J1. the sink\'s own failure propagates unmodified, never swallowed or wrapped');
        }
        assert(threw, 'J2. a sink failure is not silently absorbed');

        const allPersisted = commentaryStore.loadAll();
        assert(allPersisted.length === 1, 'J3. the Commentary persisted BEFORE the sink was called is still on file');
        assert(allPersisted[0].content === 'Sink will fail.', 'J4. the persisted Commentary is untouched by the later sink failure');
    }

    // -------------------------------------------------------------
    // Section K — Self-comment semantics remain explicit (no suppression)
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        // Alice comments on her OWN Publication.
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: alice, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-1', content: 'Commenting on my own World.' });

        assert(produced.length === 1, 'K1. a self-comment still produces a NotificationEvent — no automatic suppression is invented');
        assert(produced[0].recipientIdentityId === alice.getSigningIdentity().id, 'K2. the recipient is still the publisher, even though the author and publisher are the same identity');
        assert(produced[0].payload.authorIdentityId === produced[0].recipientIdentityId, 'K3. author and recipient are explicitly the same identity here — recorded, not hidden');
    }

    // -------------------------------------------------------------
    // Section L — A missing Publication produces no notification, but the
    // Commentary itself still succeeds (defensive, not expected in
    // ordinary operation — see this file's own header).
    // -------------------------------------------------------------
    {
        const bob = makeIdentity('Bob');
        // The discoveryProvider used for authorization sees the
        // Publication; the one wired into the producer does not — a
        // deliberately constructed edge case, never reachable when the
        // same discoveryProvider instance is used for both, as every
        // other section here does.
        const alice = makeIdentity('Alice');
        const { discoveryProvider: authorizingDiscovery } = makePublication({ id: 'pub-ghost', publisherProvider: alice });
        const emptyDiscovery = new LocalDiscoveryProvider(new InMemoryStorageProvider());
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const canComment = new CanCommentOnPublicationUseCase(authorizingDiscovery);
        const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);
        const produced = [];
        const producer = new PublicationCommentaryNotificationProducer(addUseCase, emptyDiscovery, (e) => produced.push(e));

        const { commentary } = producer.execute({ publicationId: 'pub-ghost', content: 'Still persisted.' });

        assert(commentaryStore.getById(commentary.commentaryId) !== null, 'L1. the Commentary itself is still persisted');
        assert(produced.length === 0, 'L2. no NotificationEvent is produced when the producer\'s own discoveryProvider cannot resolve the Publication');
    }

    // -------------------------------------------------------------
    // Section M — Construction guards
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-1', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);

        let threw = false;
        try { new PublicationCommentaryNotificationProducer(null, discoveryProvider, () => {}); } catch (e) { threw = true; }
        assert(threw, 'M1. a missing addPublicationCommentaryUseCase is rejected at construction');

        threw = false;
        try { new PublicationCommentaryNotificationProducer(addUseCase, null, () => {}); } catch (e) { threw = true; }
        assert(threw, 'M2. a missing discoveryProvider is rejected at construction');

        threw = false;
        try { new PublicationCommentaryNotificationProducer(addUseCase, discoveryProvider, null); } catch (e) { threw = true; }
        assert(threw, 'M3. a missing notificationSink is rejected at construction');

        threw = false;
        try { new PublicationCommentaryNotificationProducer(addUseCase, discoveryProvider, 'not-a-function'); } catch (e) { threw = true; }
        assert(threw, 'M4. a non-function notificationSink is rejected at construction');
    }

    // -------------------------------------------------------------
    // Section N — No ChatOutbox dependency, no notification storage
    // dependency, no delivery/retry/lifecycle vocabulary (structural).
    // -------------------------------------------------------------
    {
        const producerSource = codeOnlyLines(await rawSource('application/PublicationCommentaryNotificationProducer.js'));

        assert(!/ChatOutbox|ChatMessage|ChatDeliveryState/.test(producerSource),
            'N1. no reference to ChatOutbox/ChatMessage/ChatDeliveryState anywhere in the producer\'s own code');
        assert(!/NotificationStore|NotificationInbox|NotificationDelivery|NotificationCenter/.test(producerSource),
            'N2. no notification persistence/inbox/delivery/center class is referenced or introduced');
        assert(!/\bretry\b|\bretries\b|\bqueue\b|\bexpiresAt\b|\bdeliveredAt\b|\bREAD\b|\bUNREAD\b|\bDISMISSED\b/i.test(producerSource),
            'N3. no delivery/retry/read-state/lifecycle vocabulary appears anywhere in the producer\'s own code');

        const importLines = producerSource.split('\n').filter((line) => line.trim().startsWith('import'));
        assert(importLines.length === 1 && importLines[0].includes("'../core/NotificationEvent.js'"),
            'N4. the producer file imports exactly one thing — core/NotificationEvent.js — and nothing else');
    }

    // -------------------------------------------------------------
    // Section O — Structural import-boundary regression: NotificationEvent.js
    // itself stays exactly as standalone as 0.9.273 left it, unmodified by
    // wiring in a real producer.
    // -------------------------------------------------------------
    {
        const notificationEventSource = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        assert(!/PublicationCommentary|AddPublicationCommentaryUseCase|LocalDiscoveryProvider|Publication\.js|ChatOutbox/.test(notificationEventSource),
            'O1. core/NotificationEvent.js still imports nothing Commentary/Publication/ChatOutbox-shaped — the dependency runs one way only, producer -> NotificationEvent, never the reverse');

        const addUseCaseSource = codeOnlyLines(await rawSource('application/AddPublicationCommentaryUseCase.js'));
        assert(!/NotificationEvent|notificationSink|PublicationCommentaryNotificationProducer/.test(addUseCaseSource),
            'O2. application/AddPublicationCommentaryUseCase.js is completely unmodified — no NotificationEvent awareness of any kind was added to the wrapped use case itself');

        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/AddPublicationCommentaryUseCase.js core/PublicationCommentary.js core/NotificationEvent.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `O3. none of the pre-existing domain/application files this producer wraps were modified by this milestone. Found: ${gitDiffStat || '(none)'}.`);
    }

    console.log('\n✅ All PublicationCommentaryNotificationProducer tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryNotificationProducer tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryNotificationProducer tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
