import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { StorageProvider } from '../storage/StorageProvider.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { GetRecipientNotificationEventsUseCase } from '../application/GetRecipientNotificationEventsUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.283 — Recipient Notification Query Boundary.
//
// 0.9.282's own reassessment found `NotificationEvent`s durably persisted
// with recipient identity already embedded in every record, but no
// application-layer capability that answers "what notifications belong to
// the current identity." This file exercises
// application/GetRecipientNotificationEventsUseCase.js, the query
// boundary that closes exactly that gap:
//
//   Section A — Authenticated recipient: a notification addressed to the
//               current identity is returned.
//   Section B — Other recipient isolation: notifications addressed to a
//               different identity are excluded.
//   Section C — Multiple recipients: the same Commentary-shaped event
//               stream produces independent per-recipient results.
//   Section D — Empty history: an authenticated identity with no
//               notifications on file gets [].
//   Section E — Ordering: results preserve the store's own save order.
//   Section F — Deduplicated history: a retry that the store already
//               collapsed to one row surfaces as exactly one result here.
//   Section G — Event-type separation: different eventTypes addressed to
//               the same recipient both survive, as separate entries.
//   Section H — Reconstruction/restart: a fresh store/use-case pair
//               reads back the same recipient history.
//   Section I — Authentication failure: resolution failure happens before
//               the store is ever read, and throws.
//   Section J — Storage failure: a genuine store read failure propagates;
//               it is never converted into [].
//   Section K — Cross-recipient isolation via the real producer pipeline.
//   Section L — Architecture: no UI import, no delivery/lifecycle/dedup
//               vocabulary, no direct provider access, no arbitrary
//               recipient parameter, and no pre-existing file this
//               milestone depends on was modified.
//
// See docs/Roadmap.md, 0.9.283, for the full milestone entry.

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

class ReadFailingStore {
    loadAll() { throw new Error('simulated read failure'); }
}

const EVENT_TYPE = 'publication.commented';
const OTHER_EVENT_TYPE = 'publication.mentioned';

function makeEvent({
    notificationId,
    eventType = EVENT_TYPE,
    recipientIdentityId,
    createdAt = new Date('2024-01-01T00:00:00.000Z'),
    commentaryId = 'commentary-1',
    payload = {}
} = {}) {
    return new NotificationEvent({
        notificationId,
        eventType,
        recipientIdentityId,
        createdAt,
        payload: { commentaryId, ...payload }
    });
}

// The exact makeIdentity(label) pattern
// tests/PublicationCommentaryAuthorship.test.js already uses: a real,
// authenticated LocalIdentityProvider, never a bespoke stand-in.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Authenticated recipient.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = alice.getSigningIdentity().id;
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        store.save(makeEvent({ notificationId: 'n-a1', recipientIdentityId: aliceId }));

        const useCase = new GetRecipientNotificationEventsUseCase(store, alice);
        const results = useCase.execute();

        assert(results.length === 1, 'A1. one notification addressed to the current identity is returned');
        assert(results[0].notificationId === 'n-a1', 'A2. the returned event is the one addressed to this identity');
        assert(results[0].recipientIdentityId === aliceId, 'A3. recipientIdentityId matches the authenticated identity');
    }

    // -------------------------------------------------------------
    // Section B — Other recipient isolation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceId = alice.getSigningIdentity().id;
        const bobId = bob.getSigningIdentity().id;
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        store.save(makeEvent({ notificationId: 'n-b1', recipientIdentityId: bobId }));

        const useCase = new GetRecipientNotificationEventsUseCase(store, alice);
        const results = useCase.execute();

        assert(results.length === 0, 'B1. a notification addressed to a different identity is excluded');
        assert(bobId !== aliceId, 'B2. sanity: the two identities are genuinely different');
    }

    // -------------------------------------------------------------
    // Section C — Multiple recipients.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceId = alice.getSigningIdentity().id;
        const bobId = bob.getSigningIdentity().id;
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        store.save(makeEvent({ notificationId: 'n-c1', recipientIdentityId: aliceId, commentaryId: 'commentary-shared' }));
        store.save(makeEvent({ notificationId: 'n-c2', recipientIdentityId: bobId, commentaryId: 'commentary-shared' }));

        const aliceResults = new GetRecipientNotificationEventsUseCase(store, alice).execute();
        const bobResults = new GetRecipientNotificationEventsUseCase(store, bob).execute();

        assert(aliceResults.length === 1 && aliceResults[0].notificationId === 'n-c1', 'C1. Alice sees only her own notification');
        assert(bobResults.length === 1 && bobResults[0].notificationId === 'n-c2', 'C2. Bob sees only his own notification');
    }

    // -------------------------------------------------------------
    // Section D — Empty history.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const store = new NotificationEventStore(new InMemoryStorageProvider());

        const results = new GetRecipientNotificationEventsUseCase(store, alice).execute();

        assert(Array.isArray(results), 'D1. an authenticated identity with no history gets an array');
        assert(results.length === 0, 'D2. that array is empty, never null/undefined/thrown');
    }

    // -------------------------------------------------------------
    // Section E — Ordering.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = alice.getSigningIdentity().id;
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        store.save(makeEvent({ notificationId: 'n-e1', recipientIdentityId: aliceId, commentaryId: 'c1' }));
        store.save(makeEvent({ notificationId: 'n-e2', recipientIdentityId: aliceId, commentaryId: 'c2' }));
        store.save(makeEvent({ notificationId: 'n-e3', recipientIdentityId: aliceId, commentaryId: 'c3' }));

        const results = new GetRecipientNotificationEventsUseCase(store, alice).execute();

        assert(results.map((e) => e.notificationId).join(',') === 'n-e1,n-e2,n-e3', 'E1. results preserve the store\'s own save order, never re-sorted');
    }

    // -------------------------------------------------------------
    // Section F — Deduplicated history.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = alice.getSigningIdentity().id;
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const createdAt = new Date('2024-01-01T00:00:00.000Z');

        // Two independently constructed events for the same logical
        // notification — different notificationId/object identity — the
        // exact producer-retry scenario 0.9.281 Section D already proved
        // the store collapses to one row.
        store.save(new NotificationEvent({ notificationId: 'n-f1', eventType: EVENT_TYPE, recipientIdentityId: aliceId, createdAt, payload: { commentaryId: 'commentary-retry' } }));
        store.save(new NotificationEvent({ notificationId: 'n-f2', eventType: EVENT_TYPE, recipientIdentityId: aliceId, createdAt, payload: { commentaryId: 'commentary-retry' } }));

        const results = new GetRecipientNotificationEventsUseCase(store, alice).execute();

        assert(results.length === 1, 'F1. a producer retry already collapsed by the store surfaces as exactly one notification');
        assert(results[0].notificationId === 'n-f1', 'F2. the surfaced record is the original on-file one, never the retry\'s own instance');
    }

    // -------------------------------------------------------------
    // Section G — Event-type separation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = alice.getSigningIdentity().id;
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        store.save(makeEvent({ notificationId: 'n-g1', recipientIdentityId: aliceId, eventType: EVENT_TYPE }));
        store.save(makeEvent({ notificationId: 'n-g2', recipientIdentityId: aliceId, eventType: OTHER_EVENT_TYPE }));

        const results = new GetRecipientNotificationEventsUseCase(store, alice).execute();

        assert(results.length === 2, 'G1. different event types addressed to the same recipient both survive');
        const eventTypes = results.map((e) => e.eventType).sort();
        assert(eventTypes[0] === EVENT_TYPE && eventTypes[1] === OTHER_EVENT_TYPE, 'G2. both distinct event types are present, unmerged');
    }

    // -------------------------------------------------------------
    // Section H — Reconstruction/restart.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const aliceId = alice.getSigningIdentity().id;
        const sharedProvider = new InMemoryStorageProvider();
        const firstStore = new NotificationEventStore(sharedProvider);
        firstStore.save(makeEvent({ notificationId: 'n-h1', recipientIdentityId: aliceId }));

        // A fresh store instance AND a fresh use-case instance, against
        // the same underlying provider — proving this reads durable
        // state, not one instance's own memory.
        const secondStore = new NotificationEventStore(sharedProvider);
        const secondUseCase = new GetRecipientNotificationEventsUseCase(secondStore, alice);
        const results = secondUseCase.execute();

        assert(results.length === 1 && results[0].notificationId === 'n-h1', 'H1. a fresh store/use-case pair retrieves the same recipient history across a restart boundary');
    }

    // -------------------------------------------------------------
    // Section I — Authentication failure.
    // -------------------------------------------------------------
    {
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const unauthenticatedProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        const useCase = new GetRecipientNotificationEventsUseCase(store, unauthenticatedProvider);

        let threw = false;
        try {
            useCase.execute();
        } catch (error) {
            threw = true;
            assert(error instanceof Error, 'I1. an unauthenticated call throws a plain Error');
        }
        assert(threw, 'I2. execute() throws when no identity is authenticated, rather than returning []');
    }

    // -------------------------------------------------------------
    // Section J — Storage failure.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const useCase = new GetRecipientNotificationEventsUseCase(new ReadFailingStore(), alice);

        let threw = false;
        try {
            useCase.execute();
        } catch (error) {
            threw = true;
            assert(error.message === 'simulated read failure', 'J1. a genuine store read failure propagates unmodified');
        }
        assert(threw, 'J2. a storage failure is never converted into an empty notification list — "no notifications" and "storage unavailable" stay distinct');
    }

    // -------------------------------------------------------------
    // Section K — Cross-recipient isolation via the real producer pipeline.
    // -------------------------------------------------------------
    {
        const { PublicationCommentaryStore } = await import('../storage/PublicationCommentaryStore.js');
        const { AddPublicationCommentaryUseCase } = await import('../application/AddPublicationCommentaryUseCase.js');
        const { CanCommentOnPublicationUseCase } = await import('../application/CanCommentOnPublicationUseCase.js');
        const { PublicationCommentaryNotificationProducer } = await import('../application/PublicationCommentaryNotificationProducer.js');

        const publisher = makeIdentity('Publisher');
        const publisherId = publisher.getSigningIdentity().id;
        const commenter = makeIdentity('Commenter');
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const alwaysAuthorized = new CanCommentOnPublicationUseCase({ findById: (id) => ({ id }) });
        const addCommentaryUseCase = new AddPublicationCommentaryUseCase(commentaryStore, commenter, alwaysAuthorized);
        const publication = { publicationId: 'pub-k1', publisherIdentity: { id: publisherId } };
        const discoveryProvider = { findById: (id) => (id === publication.publicationId ? publication : null) };
        const producer = new PublicationCommentaryNotificationProducer(addCommentaryUseCase, discoveryProvider, (event) => store.save(event));

        producer.execute({ publicationId: publication.publicationId, content: 'nice work' });

        const publisherResults = new GetRecipientNotificationEventsUseCase(store, publisher).execute();
        const commenterResults = new GetRecipientNotificationEventsUseCase(store, commenter).execute();

        assert(publisherResults.length === 1, 'K1. the Publication\'s own publisher receives the real producer\'s notification');
        assert(commenterResults.length === 0, 'K2. the comment\'s own author, who is not the recipient, sees nothing regardless of their own Commentary authorship');
    }

    // -------------------------------------------------------------
    // Section L — Architecture.
    // -------------------------------------------------------------
    {
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- core/NotificationEvent.js core/NotificationDeduplicationPolicy.js storage/NotificationEventStore.js application/PublicationCommentaryNotificationProducer.js identity/resolveSigningIdentityId.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `L1. no pre-existing production file this milestone depends on was modified. Found: ${gitDiffStat || '(none)'}.`);

        const useCaseSource = readFileSync(new URL('../application/GetRecipientNotificationEventsUseCase.js', import.meta.url), 'utf8');
        const codeOnly = useCaseSource
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('ui/'), 'L2. no UI import');
        assert(!/\bfetch\(|WebSocket|push/i.test(codeOnly), 'L3. no delivery logic');
        assert(!/\b(read|unread|seen)\b/i.test(codeOnly), 'L4. no read/unread state vocabulary');
        assert(!/\b(pending|delivered|dismissed|expired)\b/i.test(codeOnly), 'L5. no lifecycle state vocabulary');
        assert(!codeOnly.includes('classifyNotificationCollision') && !codeOnly.includes('notificationDeduplicationIdentity'), 'L6. no reimplementation of the deduplication policy');
        assert(!/new LocalStorageProvider|new LocalIdentityProvider/.test(codeOnly), 'L7. no direct provider construction — collaborators are injected, not instantiated');
        assert(!/execute\(\s*\{\s*recipientIdentityId/.test(codeOnly), 'L8. execute() accepts no caller-supplied recipientIdentityId parameter');
        assert(/resolveSigningIdentityId/.test(codeOnly), 'L9. recipient identity is resolved through the existing identity infrastructure, not reinvented');
    }

    console.log('\n✅ All GetRecipientNotificationEventsUseCase tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All GetRecipientNotificationEventsUseCase tests passed');
}).catch((error) => {
    console.error('\n✗ GetRecipientNotificationEventsUseCase tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
