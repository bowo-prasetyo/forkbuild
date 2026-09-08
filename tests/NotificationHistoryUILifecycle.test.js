import { readFile } from 'node:fs/promises';
import NotificationHistoryPanel from '../ui/components/NotificationHistoryPanel.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { GetRecipientNotificationEventsUseCase } from '../application/GetRecipientNotificationEventsUseCase.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.284 — Notification History UI Boundary.
//
// 0.9.283 built GetRecipientNotificationEventsUseCase — a real,
// authenticated query boundary over the current identity's own
// NotificationEvent history — but wired it to no UI at all. This
// milestone reaches ui/components/NotificationHistoryPanel.js (new), a
// read-only notification history surface, and wires
// WorldNavigationSession/CreateWorldViewUseCase as the one composition
// path between it and the use case, exactly the same shape 0.9.248
// already established for Publication Commentary
// (getPublicationCommentariesCommand/addPublicationCommentaryCommand).
//
// This file exercises the milestone's own named sections against REAL
// collaborators (LocalIdentityProvider, LocalDiscoveryProvider,
// LocalPublisherProvider, PublicationCommentaryStore,
// PublicationCommentaryNotificationProducer, NotificationEventStore, and
// GetRecipientNotificationEventsUseCase, all unmodified) wired through a
// REAL WorldNavigationSession — never a mock of the application layer —
// with only NotificationHistoryPanel.js's own methods invoked the same
// way every sibling UI test file in this codebase already invokes them:
// bound to a plain ctx object mirroring a Vue component instance, never
// a full Vue mount.
//
//   Section A — Authenticated loading.
//   Section B — Recipient isolation.
//   Section C — Empty state.
//   Section D — Multiple events, multiple event types.
//   Section E — Ordering.
//   Section F — Deduplicated history.
//   Section G — Restart.
//   Section H — Publication/commentary/notification identity, never confused.
//   Section I — Storage failure, never converted into an empty inbox.
//   Section J — Lifecycle isolation: opening/refreshing never mutates persistence.
//   Section K — Architectural boundary.
//
// See docs/Roadmap.md, 0.9.284, for the full milestone entry.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

// The real shared backend a Commentary notification travels through —
// mirrors tests/PublicationCommentaryUIIntegration.test.js's own
// makeBackend(), extended with the notification pipeline
// tests/PostNotificationPersistenceProductReassessment.test.js's own
// buildWiredPipeline() already exercises, but never reusing that file's
// helpers directly — this milestone's own fixtures, matching this
// milestone's own naming.
function makeSharedBackend() {
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisherProvider = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const commentaryStore = new PublicationCommentaryStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const notificationStorageProvider = new InMemoryStorageProvider();
    const notificationEventStore = new NotificationEventStore(notificationStorageProvider);
    return { storage, publisherProvider, discoveryProvider, commentaryStore, canCommentOnPublicationUseCase, notificationStorageProvider, notificationEventStore };
}

// A real PublicationCommentaryNotificationProducer, wrapping a real
// AddPublicationCommentaryUseCase authored by `commentAuthorProvider`,
// with its sink writing into the SAME shared notificationEventStore —
// the exact "a Commentary was created; tell the publisher" pipeline
// application/PublicationCommentaryNotificationProducer.js's own header
// describes. Never wired into WorldNavigationSession itself — 0.9.284
// deliberately does not wire the producer into any composition root
// (see docs/Roadmap.md's own 0.9.284 entry) — this helper exists only so
// this test file can produce a REAL NotificationEvent to read back.
function makeProducer(backend, commentAuthorProvider) {
    const addCommentaryUseCase = new AddPublicationCommentaryUseCase(backend.commentaryStore, commentAuthorProvider, backend.canCommentOnPublicationUseCase);
    return new PublicationCommentaryNotificationProducer(addCommentaryUseCase, backend.discoveryProvider, (event) => backend.notificationEventStore.save(event));
}

// The real read-side composition this milestone actually adds:
// GetRecipientNotificationEventsUseCase, wired into a REAL
// WorldNavigationSession, exactly the shape
// application/CreateWorldViewUseCase.js wires in production — plus the
// IDENTICAL thin wrapper ui/views/WorldView.js's own
// getRecipientNotificationEventsCommand() is.
function makeReaderFor(recipientIdentityProvider, backend) {
    const getRecipientNotificationEventsUseCase = new GetRecipientNotificationEventsUseCase(backend.notificationEventStore, recipientIdentityProvider);
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider: backend.discoveryProvider,
        getRecipientNotificationEventsUseCase
    });
    const getRecipientNotificationEventsCommand = () => session.getRecipientNotificationEvents();
    return { session, getRecipientNotificationEventsCommand };
}

function panelCtx(overrides = {}) {
    return {
        getRecipientNotificationEventsCommand: null,
        notifications: [],
        notificationHistoryError: null,
        refreshNotificationHistory: NotificationHistoryPanel.methods.refreshNotificationHistory,
        notificationTitle: NotificationHistoryPanel.methods.notificationTitle,
        notificationDetails: NotificationHistoryPanel.methods.notificationDetails,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — Authenticated loading. The panel obtains notifications
    // through the application query boundary — WorldNavigationSession ->
    // GetRecipientNotificationEventsUseCase — never a hand-rolled filter.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section A World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: publication.id, content: 'nice work' });

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        assert(ctx.notifications.length === 1, '1. a persisted notification is obtained through the real query use case');
        assert(ctx.notifications[0].eventType === 'publication.commented', '2. the rendered notification carries the real, persisted eventType');
        assert(ctx.notificationHistoryError === null, '3. a successful load reports no error');

        console.log('✓ Section A: notifications are loaded through WorldNavigationSession -> GetRecipientNotificationEventsUseCase and rendered');
    }

    // ---------------------------------------------------------------
    // Section B — Recipient isolation. A notification belonging to
    // another identity never appears.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const carol = makeIdentity('Carol');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section B World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: publication.id, content: 'for alice only' });

        const aliceReader = makeReaderFor(alice, backend);
        const carolReader = makeReaderFor(carol, backend);
        const aliceCtx = panelCtx({ getRecipientNotificationEventsCommand: aliceReader.getRecipientNotificationEventsCommand });
        const carolCtx = panelCtx({ getRecipientNotificationEventsCommand: carolReader.getRecipientNotificationEventsCommand });
        aliceCtx.refreshNotificationHistory();
        carolCtx.refreshNotificationHistory();

        assert(aliceCtx.notifications.length === 1, '4. the addressed recipient sees her own notification');
        assert(carolCtx.notifications.length === 0, '5. a different identity sees none of it');
        assert(carolCtx.notificationHistoryError === null, '6. isolation is never reported as an error — it is a correct, empty result');

        console.log('✓ Section B: a notification addressed to one identity never appears for another, read through the same panel code');
    }

    // ---------------------------------------------------------------
    // Section C — Empty state. An authenticated recipient with no events
    // gets the expected empty representation, never an error.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);

        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        assert(Array.isArray(ctx.notifications) && ctx.notifications.length === 0, '7. an authenticated identity with no history resolves to an empty array');
        assert(ctx.notificationHistoryError === null, '8. an empty result is never reported as an error');

        const panelCode = await codeOnlySource('ui/components/NotificationHistoryPanel.js');
        assert(panelCode.includes('No notifications yet.'), '9. the template renders a dedicated empty-state message');

        console.log('✓ Section C: no notifications yet renders an intentional empty state, never an error');
    }

    // ---------------------------------------------------------------
    // Section D — Multiple events, multiple event types render
    // independently. A future eventType this panel has never seen still
    // renders legibly, without any per-producer knowledge hardcoded in.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const p1 = backend.publisherProvider.publish(makeDocument('Section D P1', 'alice'), alice);
        const p2 = backend.publisherProvider.publish(makeDocument('Section D P2', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: p1.id, content: 'first' });
        producer.execute({ publicationId: p2.id, content: 'second' });
        // A second, hypothetical eventType this codebase has no real
        // producer for yet — proving the panel renders generically,
        // never assuming "publication.commented" is the only shape.
        backend.notificationEventStore.save(new NotificationEvent({
            eventType: 'world.mentioned',
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { worldId: 'world-d1', mentionedBy: bob.getSigningIdentity().id }
        }));

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        assert(ctx.notifications.length === 3, '10. three independent notifications, across two event types, all render');
        const eventTypes = ctx.notifications.map((e) => e.eventType).sort();
        assert(eventTypes.join(',') === 'publication.commented,publication.commented,world.mentioned',
            '11. distinct event types survive independently, unmerged');

        const mentionEvent = ctx.notifications.find((e) => e.eventType === 'world.mentioned');
        assert(ctx.notificationTitle(mentionEvent) === 'World mentioned',
            '12. an eventType this panel has never seen before is still humanized generically ("world.mentioned" -> "World mentioned")');
        const details = ctx.notificationDetails(mentionEvent);
        assert(details.some((d) => d.value === 'world-d1') && details.some((d) => d.value === bob.getSigningIdentity().id),
            '13. that unknown eventType\'s payload fields still render, generically, with no producer-specific knowledge required');

        console.log('✓ Section D: multiple notifications, across multiple event types (including one this panel has no built-in knowledge of), each render independently');
    }

    // ---------------------------------------------------------------
    // Section E — Ordering. The UI preserves the application's returned
    // ordering; no UI-side sorting.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section E World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: publication.id, commentaryId: 'c-e1', content: 'first', createdAt: new Date('2024-01-01T00:00:00.000Z') });
        producer.execute({ publicationId: publication.id, commentaryId: 'c-e2', content: 'second', createdAt: new Date('2024-01-02T00:00:00.000Z') });
        producer.execute({ publicationId: publication.id, commentaryId: 'c-e3', content: 'third', createdAt: new Date('2024-01-03T00:00:00.000Z') });

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        const commentaryOrder = ctx.notifications.map((e) => e.payload.commentaryId).join(',');
        assert(commentaryOrder === 'c-e1,c-e2,c-e3', '14. results render in exactly the store\'s own save order, never re-sorted by the panel');

        const panelCode = await codeOnlySource('ui/components/NotificationHistoryPanel.js');
        assert(!/\.sort\(/.test(panelCode), '15. NotificationHistoryPanel.js contains no .sort() call of its own');

        console.log('✓ Section E: notification order is preserved exactly as returned, with no UI-side sorting');
    }

    // ---------------------------------------------------------------
    // Section F — Deduplicated history. Producer retries still appear
    // as one logical notification.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section F World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        const fixedInput = { publicationId: publication.id, commentaryId: 'retry-f', content: 'retried content', createdAt: new Date('2024-02-02T00:00:00.000Z') };
        producer.execute(fixedInput);
        producer.execute({ ...fixedInput });
        producer.execute({ ...fixedInput });

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        assert(ctx.notifications.length === 1, '16. three producer retries for the identical logical notification render as exactly one entry');

        console.log('✓ Section F: producer retries already collapsed by the store render as one logical notification, never duplicated in the UI');
    }

    // ---------------------------------------------------------------
    // Section G — Restart. A fresh UI/session instance reconstructs the
    // same durable history.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section G World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: publication.id, content: 'before restart' });

        const firstReader = makeReaderFor(alice, backend);
        const firstCtx = panelCtx({ getRecipientNotificationEventsCommand: firstReader.getRecipientNotificationEventsCommand });
        firstCtx.refreshNotificationHistory();
        assert(firstCtx.notifications.length === 1, '17. setup: one real notification exists before the simulated restart');

        // A brand-new NotificationEventStore, WorldNavigationSession, and
        // panel ctx — over the SAME underlying notificationStorageProvider
        // — simulating a fresh page load / session restart.
        const reloadedStore = new NotificationEventStore(backend.notificationStorageProvider);
        const reloadedUseCase = new GetRecipientNotificationEventsUseCase(reloadedStore, alice);
        const reloadedSession = new WorldNavigationSession({
            registry: { getDocument: () => null },
            loadPublicationDocumentUseCase: { execute: () => null },
            worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
            discoveryProvider: backend.discoveryProvider,
            getRecipientNotificationEventsUseCase: reloadedUseCase
        });
        const secondCtx = panelCtx({ getRecipientNotificationEventsCommand: () => reloadedSession.getRecipientNotificationEvents() });
        secondCtx.refreshNotificationHistory();

        assert(secondCtx.notifications.length === 1 && secondCtx.notifications[0].payload.publicationId === publication.id,
            '18. a fresh UI/session instance, over the same durable storage, reconstructs the identical notification history');

        console.log('✓ Section G: restart/reconstruction — a fresh UI and session pair reads back the same durable notification history');
    }

    // ---------------------------------------------------------------
    // Section H — Publication/commentary/notification identity. The UI
    // does not confuse notificationId, commentaryId, and publicationId.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section H World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        const { commentary } = producer.execute({ publicationId: publication.id, content: 'identity check' });

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        const event = ctx.notifications[0];
        assert(event.notificationId !== event.payload.commentaryId && event.notificationId !== event.payload.publicationId
            && event.payload.commentaryId !== event.payload.publicationId,
            '19. notificationId, commentaryId, and publicationId are three genuinely distinct values, never aliased to one another');
        assert(event.payload.publicationId === publication.id && event.payload.commentaryId === commentary.commentaryId,
            '20. the rendered payload carries the real publicationId/commentaryId this Commentary actually produced');

        const details = ctx.notificationDetails(event);
        const byLabel = Object.fromEntries(details.map((d) => [d.label, d.value]));
        assert(byLabel['Publication Id'] === publication.id, '21. the rendered "Publication" detail carries publicationId, never commentaryId or notificationId');
        assert(byLabel['Commentary Id'] === commentary.commentaryId, '22. the rendered "Commentary" detail carries commentaryId, never publicationId or notificationId');
        assert(!Object.values(byLabel).includes(event.notificationId), '23. notificationId itself (an envelope field, not a payload fact) is never rendered as one of the payload detail rows');

        console.log('✓ Section H: notificationId/commentaryId/publicationId stay three distinct, correctly-labeled facts — never confused');
    }

    // ---------------------------------------------------------------
    // Section I — Storage failure. Failure is represented as failure,
    // never silently converted into an empty inbox.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section I World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: publication.id, content: 'already here' });

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();
        assert(ctx.notifications.length === 1, '24. setup: one real notification is already loaded');

        // A failing command — mirrors GetRecipientNotificationEventsUseCase
        // throwing on a genuine storage read failure, or on an
        // unauthenticated identity — surfaced through the SAME command
        // shape the panel already calls.
        const failingCommand = () => { throw new Error('storage unavailable'); };
        const failingCtx = panelCtx({ ...ctx, getRecipientNotificationEventsCommand: failingCommand });
        failingCtx.refreshNotificationHistory();

        assert(failingCtx.notificationHistoryError !== null, '25. a failed read reports a distinct error state');
        assert(failingCtx.notificationHistoryError === 'storage unavailable', '26. the thrown error\'s own message is surfaced, not a generic substitute masking what happened');
        assert(failingCtx.notifications.length === 1 && failingCtx.notifications[0].payload.publicationId === publication.id,
            '27. a failed read leaves the previously-loaded notification history exactly as it was — never silently reset to []');

        // A fresh panel (never previously loaded) that fails is an empty
        // array PLUS an error, never confusable with Section C\'s own
        // "successfully empty" state — the two states are held apart by
        // notificationHistoryError, not by notifications.length alone.
        const freshFailingCtx = panelCtx({ getRecipientNotificationEventsCommand: failingCommand });
        freshFailingCtx.refreshNotificationHistory();
        assert(freshFailingCtx.notifications.length === 0 && freshFailingCtx.notificationHistoryError !== null,
            '28. a first-load failure is distinguishable from a genuine empty history: both start with notifications.length === 0, but only the failure sets notificationHistoryError');

        console.log('✓ Section I: a storage/authentication failure is surfaced as a distinct error state, never silently collapsed into "no notifications"');
    }

    // ---------------------------------------------------------------
    // Section J — Lifecycle isolation. Opening/closing/switching UI
    // surfaces does not mutate notification persistence.
    // ---------------------------------------------------------------
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section J World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        producer.execute({ publicationId: publication.id, content: 'untouched by viewing' });

        const beforeCount = backend.notificationEventStore.loadAll().length;
        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);

        // "Opening" the panel (mounted() calling refreshNotificationHistory()
        // once), refreshing it again explicitly, and constructing an
        // entirely new ctx to simulate closing and reopening — none of
        // this ever writes anything.
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();
        ctx.refreshNotificationHistory();
        const secondCtx = panelCtx({ getRecipientNotificationEventsCommand });
        secondCtx.refreshNotificationHistory();

        const afterCount = backend.notificationEventStore.loadAll().length;
        assert(beforeCount === afterCount, '29. opening, refreshing, and reopening the panel never changes the number of persisted notifications');
        assert(ctx.notifications.length === 1 && secondCtx.notifications.length === 1, '30. every open/reopen still observes the same one real notification');

        const panelCode = await codeOnlySource('ui/components/NotificationHistoryPanel.js');
        assert(!/\.save\(|\.remove\(/.test(panelCode), '31. NotificationHistoryPanel.js\'s own code never calls a store-shaped save()/remove() of any kind');

        console.log('✓ Section J: opening, refreshing, and reopening the notification history surface never mutates the underlying persisted history');
    }

    // ---------------------------------------------------------------
    // Section K — Architectural boundary.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/NotificationHistoryPanel.js');

        // K1. The panel imports nothing from storage/, core/NotificationEvent.js,
        // or application/GetRecipientNotificationEventsUseCase.js — only Vue.
        const panelRawImports = (await rawSource('ui/components/NotificationHistoryPanel.js')).match(/^import .*/gm) || [];
        assert(panelRawImports.length === 0, `32. ui/components/NotificationHistoryPanel.js imports nothing at all (found: ${JSON.stringify(panelRawImports)}) — it is a pure options object over injected props/data.`);

        // K2. No storage access, no NotificationEvent construction, no
        // deduplication logic, of any kind.
        assert(!/NotificationEventStore|\.loadAll\(|new NotificationEvent\(|notificationDeduplicationIdentity|classifyNotificationCollision/.test(panelCode),
            '33. the panel performs no storage access, constructs no NotificationEvent, and reimplements no deduplication logic.');

        // K3. No recipient determination — the panel takes zero arguments
        // when calling its own command; it never constructs or receives a
        // recipientIdentityId of any kind.
        assert(!/recipientIdentityId/.test(panelCode), '34. the panel never references recipientIdentityId — the injected command already answers "my own notifications" by construction.');
        assert(/getRecipientNotificationEventsCommand\(\)/.test(panelCode), '35. the injected command is called with zero arguments, exactly as GetRecipientNotificationEventsUseCase#execute() itself takes none.');

        // K4. No lifecycle/read-state vocabulary anywhere in the panel's
        // own code. The rendered template carries ONE deliberate
        // exception — user-facing prose that explicitly DISCLAIMS these
        // very states ("not an inbox... there is no read/unread state
        // here") — the opposite of implementing them; excluded from this
        // logic-vocabulary sweep the same way comments already are (0.9.286
        // audit finding: this check previously false-positived on that
        // exact disclaiming sentence, undetected since 0.9.284's own
        // commit — see docs/Roadmap.md, 0.9.286).
        const panelCodeWithoutTemplate = (() => {
            const templateStart = panelCode.indexOf('template: `');
            const templateEnd = panelCode.lastIndexOf('`');
            return (templateStart !== -1 && templateEnd > templateStart)
                ? panelCode.slice(0, templateStart) + panelCode.slice(templateEnd + 1)
                : panelCode;
        })();
        assert(!/\b(read|unread|seen|delivered|undelivered|acknowledg|pending|priority|trusted|preferred)\b/i.test(panelCodeWithoutTemplate),
            '36. NotificationHistoryPanel.js\'s own code (its rendered template\'s disclaiming prose excluded) contains no read/unread/seen/delivered/acknowledged/pending/priority/trusted/preferred vocabulary.');

        // K5. No polling/timer/live-channel machinery — load-on-open plus
        // an explicit refresh only.
        assert(!/setInterval|setTimeout|WebSocket|subscribe\(/.test(panelCode),
            '37. the panel contains no timer, polling, or subscription machinery — refresh happens on mount and on explicit user action only.');

        // K6. WorldView.js wires the command onto the panel, and its own
        // command forwards to WorldNavigationSession, never a use case
        // directly.
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes(':getRecipientNotificationEventsCommand="getRecipientNotificationEventsCommand"'),
            '38. WorldView.js wires getRecipientNotificationEventsCommand onto NotificationHistoryPanel.');
        assert(viewCode.includes('session.getRecipientNotificationEvents()'),
            '39. WorldView.js\'s own command forwards to WorldNavigationSession, never a use case directly.');

        // K7. WorldNavigationSession delegates to the unmodified use case.
        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        assert(sessionCode.includes('this._getRecipientNotificationEventsUseCase.execute()'),
            '40. WorldNavigationSession delegates reads to the unmodified GetRecipientNotificationEventsUseCase, with no arguments.');

        // K8. The composition root wires a real NotificationEventStore and
        // GetRecipientNotificationEventsUseCase, reusing the SAME
        // storageProvider/identityProvider every other local collaborator
        // already uses.
        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(compositionCode.includes('new NotificationEventStore(storageProvider)'),
            '41. the composition root reuses the SAME storageProvider every other local store already uses.');
        assert(compositionCode.includes('new GetRecipientNotificationEventsUseCase(notificationEventStore, identityProvider)'),
            '42. the composition root wires GetRecipientNotificationEventsUseCase against the real notificationEventStore/identityProvider.');

        // K9. GetRecipientNotificationEventsUseCase, NotificationEventStore,
        // NotificationEvent, NotificationDeduplicationPolicy, and
        // PublicationCommentaryNotificationProducer themselves remain
        // completely unmodified by this milestone.
        const { execSync } = await import('node:child_process');
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/GetRecipientNotificationEventsUseCase.js storage/NotificationEventStore.js core/NotificationEvent.js core/NotificationDeduplicationPolicy.js application/PublicationCommentaryNotificationProducer.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `43. no pre-existing production file this milestone depends on was modified. Found: ${gitDiffStat || '(none)'}.`);

        console.log('✓ Section K: architectural boundary confirmed — the panel imports nothing, performs no storage access, deduplication, or NotificationEvent construction, determines no recipient of its own, carries no lifecycle vocabulary, and has no polling/timer machinery; the wiring through WorldView.js -> WorldNavigationSession -> CreateWorldViewUseCase is the one composed path; and every pre-existing application/core/storage file this milestone depends on remains unmodified.');
    }

    console.log('\n✅ All NotificationHistoryUILifecycle tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
