import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import NotificationHistoryPanel from '../ui/components/NotificationHistoryPanel.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer, PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { GetRecipientNotificationEventsUseCase } from '../application/GetRecipientNotificationEventsUseCase.js';
import { notificationDeduplicationIdentity } from '../core/NotificationDeduplicationPolicy.js';
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

// 0.9.285 — Wire Publication Commentary Notification Producer.
//
// 0.9.275 built a real PublicationCommentaryNotificationProducer.
// 0.9.276-0.9.282 audited it, exercised it against real infrastructure,
// and adopted a deduplication policy and a durable store for whatever it
// produces. 0.9.283/0.9.284 built the READ side — a recipient-scoped
// query and a Notification History panel — on top of that durable store.
// Every one of those milestones constructed the producer ITSELF, inside
// its own test file; none of them ever wired it into
// application/CreateWorldViewUseCase.js, the one real composition root
// every other Commentary/notification collaborator is already built
// through. This milestone closes exactly that gap — composition only:
//
//   AddPublicationCommentaryUseCase          (0.9.246, unmodified)
//        │  wrapped, not modified
//        ▼
//   PublicationCommentaryNotificationProducer (0.9.275, unmodified)
//        │  notificationSink = (event) => notificationEventStore.save(event)
//        ▼
//   NotificationEventStore                    (0.9.281, unmodified — the
//        │                                      SAME instance
//        │                                      GetRecipientNotificationEventsUseCase
//        │                                      already reads from)
//        ▼
//   WorldNavigationSession#addPublicationCommentary()  (unmodified — it
//        │                                                only ever calls
//        │                                                .execute() on
//        │                                                whatever it is
//        │                                                handed)
//        ▼
//   Notification History  (0.9.284's own panel, now showing REAL events)
//
// This file is the first test in this arc to exercise that whole chain
// through the REAL production composition root's own wiring shape — a
// real WorldNavigationSession built with the SAME decorated capability
// application/CreateWorldViewUseCase.js itself now constructs, never a
// producer built and used only as a side, test-only fixture the way
// tests/NotificationHistoryUILifecycle.test.js's own makeProducer() and
// tests/PostNotificationPersistenceProductReassessment.test.js's own
// buildWiredPipeline() both deliberately were (both predate this
// milestone, and both say so in their own headers).
//
//   Section A — Real composition: the production composition root itself
//               constructs the decorated capability.
//   Section B — Commentary, submitted through the real application path,
//               produces a durable notification.
//   Section C — Correct recipient: the publisher, never the commenter.
//   Section D — Recipient isolation across two Publications/publishers.
//   Section E — Notification History visibility: WorldView -> Notification
//               History -> GetRecipientNotificationEventsUseCase ->
//               NotificationEventStore, after a real Commentary.
//   Section F — Retry/deduplication: unchanged store semantics, no
//               producer-side deduplication added.
//   Section G — Event-type identity: existing notification policy stays
//               authoritative.
//   Section H — Self-comment: no suppression, no new special case.
//   Section I — Publication lookup miss: Commentary still succeeds.
//   Section J — Notification store failure: established semantics, no
//               rollback.
//   Section K — UI lifecycle: create Commentary -> open Notifications ->
//               refresh -> see the event.
//   Section L — No duplicate wiring: exactly one notification producer
//               in the active Commentary path.
//
// See docs/Roadmap.md, 0.9.285, for the full milestone entry.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
// Extracts one method's full source body (matching braces, not merely up
// to the first closing brace — a plain non-greedy regex would stop at the
// first nested `}`, e.g. an inner `if` block's own closing brace, well
// before the method's real end). `methodSignaturePattern` must itself end
// with the method's own opening brace (a literal `\{`) so the match's own
// last character IS that brace — never the first `{` found by scanning
// forward, which would instead land on an earlier destructuring brace in
// the method's own parameter list (e.g. `({ publicationId, content })`).
function extractMethodBody(source, methodSignaturePattern) {
    const match = source.match(methodSignaturePattern);
    if (!match) return null;
    const openBraceIndex = match.index + match[0].length - 1;
    if (source[openBraceIndex] !== '{') return null;
    let depth = 0;
    for (let i = openBraceIndex; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(match.index, i + 1);
        }
    }
    return null;
}

async function grepCount(pattern, dirs, { excludeSuffix = null } = {}) {
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Wraps a real InMemoryStorageProvider but fails writes to one specific
// storage key only — used by Section J to fail the notification write
// SPECIFICALLY while the Commentary write, through the exact same shared
// storageProvider instance production wiring uses, keeps succeeding. The
// key itself is storage/NotificationEventStore.js's own
// NOTIFICATION_EVENT_STORE_KEY constant (not exported — reproduced here
// as a literal, exactly as tests/PostNotificationPersistenceProductReassessment.test.js
// Section D6 already does for the identical reason).
const NOTIFICATION_EVENT_STORE_KEY = 'notification-events:entries';
class PartiallyFailingStorageProvider extends StorageProvider {
    constructor(inner, failingKey) { super(); this._inner = inner; this._failingKey = failingKey; }
    save(name, data) {
        if (name === this._failingKey) {
            throw new Error('simulated notification storage failure');
        }
        return this._inner.save(name, data);
    }
    load(name) { return this._inner.load(name); }
    remove(name) { return this._inner.remove(name); }
    list() { return this._inner.list(); }
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

// A single shared storageProvider backs EVERY collaborator here — the
// SAME "one storageProvider, every local store built off it" shape
// application/CreateWorldViewUseCase.js's own execute() uses (never a
// separate notification-only storage provider, unlike
// tests/NotificationHistoryUILifecycle.test.js's own deliberately
// simpler fixture). This is the one new fixture shape this milestone's
// own test file adds: fidelity to the REAL composition root's own
// wiring, not merely a shape that happens to produce the same events.
function makeSharedInfrastructure(storageProvider = new InMemoryStorageProvider()) {
    const contentStore = new LocalContentStore(storageProvider);
    const publisherProvider = new LocalPublisherProvider(storageProvider, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
    const commentaryStore = new PublicationCommentaryStore(storageProvider);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const notificationEventStore = new NotificationEventStore(storageProvider);
    return { storageProvider, contentStore, publisherProvider, discoveryProvider, commentaryStore, canCommentOnPublicationUseCase, notificationEventStore };
}

// Builds the EXACT wiring shape application/CreateWorldViewUseCase.js's
// own execute() now builds for one identityProvider: a real
// AddPublicationCommentaryUseCase, decorated by a real
// PublicationCommentaryNotificationProducer whose sink writes into the
// SAME notificationEventStore GetRecipientNotificationEventsUseCase
// already reads from — then hands the DECORATED capability, never the
// raw use case, to a real WorldNavigationSession as its own
// addPublicationCommentaryUseCase collaborator. Optionally accepts a
// SEPARATE discoveryProvider for the producer's own lookup (Section I's
// deliberately constructed edge case only — every other section passes
// nothing, so the producer shares infra.discoveryProvider, exactly as
// production always does).
function buildSessionFor(identityProvider, infra, { producerDiscoveryProvider = infra.discoveryProvider } = {}) {
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        infra.commentaryStore,
        identityProvider,
        infra.canCommentOnPublicationUseCase
    );
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        producerDiscoveryProvider,
        (event) => infra.notificationEventStore.save(event)
    );
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(infra.commentaryStore);
    const getRecipientNotificationEventsUseCase = new GetRecipientNotificationEventsUseCase(infra.notificationEventStore, identityProvider);

    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider: infra.discoveryProvider,
        getPublicationCommentariesUseCase,
        addPublicationCommentaryUseCase: publicationCommentaryCapability,
        getRecipientNotificationEventsUseCase
    });

    // The IDENTICAL thin command wrappers ui/views/WorldView.js's own
    // addPublicationCommentaryCommand()/getPublicationCommentariesCommand()/
    // getRecipientNotificationEventsCommand() are — reproduced here for
    // the same reason every sibling UI test file's own helper already is.
    return {
        session,
        addPublicationCommentaryCommand: ({ publicationId, content }) => session.addPublicationCommentary({ publicationId, content }),
        getPublicationCommentariesCommand: (publicationId) => session.getPublicationCommentaries(publicationId),
        getRecipientNotificationEventsCommand: () => session.getRecipientNotificationEvents(),
        // Exposed only so a test can reach the composed capability's own
        // .execute() directly (accepting commentaryId), matching what
        // 0.9.276/0.9.282's own retry sections already exercised at the
        // producer level — WorldNavigationSession#addPublicationCommentary()
        // itself, unmodified, still only ever forwards {publicationId,
        // content}, exactly like the real addPublicationCommentaryCommand
        // above.
        publicationCommentaryCapability
    };
}

function commentaryPanelCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        viewerIdentityId: null,
        publicationCommentaries: [],
        newCommentaryText: '',
        publicationCommentarySubmitting: false,
        publicationCommentaryError: null,
        refreshPublicationCommentaries: OwnPublicationPanel.methods.refreshPublicationCommentaries,
        submitPublicationCommentary: OwnPublicationPanel.methods.submitPublicationCommentary,
        ...overrides
    };
}

function notificationPanelCtx(overrides = {}) {
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

async function runTests() {
    console.log('Running Publication Commentary Notification Runtime Integration tests...\n');

    // ===============================================================
    // Section A — Real composition, plus the architectural boundary this
    // milestone's own brief asks for explicitly: the producer is
    // connected AT THE COMPOSITION ROOT, never inside
    // AddPublicationCommentaryUseCase, NotificationEvent,
    // NotificationEventStore, or WorldView/WorldNavigationSession.
    // ===============================================================
    {
        const composition = await rawSource('application/CreateWorldViewUseCase.js');
        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');

        // A1. The composition root imports and constructs the real
        // producer, wrapping the SAME addPublicationCommentaryUseCase
        // instance it already builds — never a second, parallel
        // AddPublicationCommentaryUseCase.
        assert(composition.includes("import { PublicationCommentaryNotificationProducer } from './PublicationCommentaryNotificationProducer.js';"),
            'A1a. application/CreateWorldViewUseCase.js now imports PublicationCommentaryNotificationProducer.');
        assert(/new PublicationCommentaryNotificationProducer\(\s*addPublicationCommentaryUseCase,\s*discoveryProvider,/.test(compositionCode),
            'A1b. The composition root constructs PublicationCommentaryNotificationProducer wrapping the exact addPublicationCommentaryUseCase/discoveryProvider it already built — no second instance of either.');

        // A2. The sink writes into the SAME notificationEventStore
        // GetRecipientNotificationEventsUseCase already reads from — one
        // store instance, backing both directions, never two.
        assert(/\(notificationEvent\)\s*=>\s*notificationEventStore\.save\(notificationEvent\)/.test(compositionCode),
            'A2a. The notificationSink is a plain call to notificationEventStore.save() — never a NotificationInbox/NotificationDelivery/NotificationCenter of any kind.');
        const storeConstructions = (compositionCode.match(/new NotificationEventStore\(/g) || []).length;
        assert(storeConstructions === 1,
            `A2b. Exactly one NotificationEventStore is constructed in the composition root (found ${storeConstructions}) — the read path (GetRecipientNotificationEventsUseCase) and the write path (the producer's own sink) share the identical instance.`);

        // A3. The DECORATED capability — never the raw
        // addPublicationCommentaryUseCase — is what WorldNavigationSession
        // actually receives as its own addPublicationCommentaryUseCase
        // collaborator. This is the composition-only invariant this
        // milestone's own brief states explicitly.
        assert(/addPublicationCommentaryUseCase:\s*publicationCommentaryCapability/.test(compositionCode),
            'A3. WorldNavigationSession is constructed with addPublicationCommentaryUseCase: publicationCommentaryCapability — the decorated capability, not the bare use case.');
        assert(composition.includes('new AddPublicationCommentaryUseCase('),
            'A3b. The bare AddPublicationCommentaryUseCase is still constructed (and wrapped) — this milestone never deletes or bypasses it.');

        // A4. AddPublicationCommentaryUseCase.js itself never becomes
        // notification-aware — the domain boundary 0.9.275 already
        // established, reconfirmed here as this milestone's own
        // architectural invariant, not merely inherited.
        const addUseCaseCode = await codeOnlySource('application/AddPublicationCommentaryUseCase.js');
        assert(!/Notification/i.test(addUseCaseCode),
            'A4. application/AddPublicationCommentaryUseCase.js\'s own CODE still contains no Notification vocabulary of any kind.');

        // A5. NotificationEvent and NotificationEventStore know nothing
        // of Commentary, or of the producer that wraps it — the
        // dependency direction runs application -> core/storage, never
        // the reverse.
        const notificationEventCode = await codeOnlySource('core/NotificationEvent.js');
        const notificationStoreCode = await codeOnlySource('storage/NotificationEventStore.js');
        assert(!/Commentary|PublicationCommentaryNotificationProducer/i.test(notificationEventCode),
            'A5a. core/NotificationEvent.js\'s own CODE references neither Commentary nor the producer that constructs one.');
        assert(!/Commentary|PublicationCommentaryNotificationProducer/i.test(notificationStoreCode),
            'A5b. storage/NotificationEventStore.js\'s own CODE references neither Commentary nor the producer — it persists whatever NotificationEvent it is handed, agnostic to what produced it.');

        // A6. WorldView.js — the one real UI caller of
        // addPublicationCommentaryCommand — carries no notification
        // vocabulary of its own for the WRITE path; it forwards to
        // WorldNavigationSession exactly as it always has, unaware the
        // object behind that call is now decorated.
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes('function addPublicationCommentaryCommand({ publicationId, content }) {') &&
            worldViewCode.includes('return session.addPublicationCommentary({ publicationId, content });'),
            'A6. ui/views/WorldView.js\'s own addPublicationCommentaryCommand still forwards exactly {publicationId, content} to session.addPublicationCommentary() — unmodified by this milestone.');

        // A7. WorldNavigationSession.js itself is unmodified — it already
        // only ever calls .execute() on whatever it is handed, so it has
        // no idea, and no need to know, that its own
        // addPublicationCommentaryUseCase collaborator now also produces
        // a notification.
        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        assert(!/PublicationCommentaryNotificationProducer/.test(sessionCode),
            'A7. application/WorldNavigationSession.js never imports or references PublicationCommentaryNotificationProducer.');
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/AddPublicationCommentaryUseCase.js application/WorldNavigationSession.js core/NotificationEvent.js core/NotificationDeduplicationPolicy.js storage/NotificationEventStore.js application/PublicationCommentaryNotificationProducer.js application/GetRecipientNotificationEventsUseCase.js ui/views/WorldView.js ui/components/NotificationHistoryPanel.js ui/components/OwnPublicationPanel.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `A8. None of the pre-existing domain/application/UI files this milestone depends on carry an uncommitted diff. Found: ${gitDiffStat || '(none)'}.`);

        console.log('✓ A: application/CreateWorldViewUseCase.js — the one real composition root — now constructs a real PublicationCommentaryNotificationProducer wrapping the exact AddPublicationCommentaryUseCase/discoveryProvider it already built, sinks into the exact same NotificationEventStore instance the read side already uses, and hands the DECORATED capability — never the raw use case — to WorldNavigationSession. AddPublicationCommentaryUseCase.js, NotificationEvent.js, NotificationEventStore.js, WorldNavigationSession.js, and WorldView.js all remain unaware the producer exists — the dependency direction runs core/storage <- application <- composition root <- UI, never the reverse, exactly as this milestone\'s own brief requires.');
    }

    // ===============================================================
    // Section B — Commentary, submitted through the real application
    // path (the exact command WorldView.js/OwnPublicationPanel.js use),
    // produces exactly one Commentary, one NotificationEvent, and one
    // durable notification for the publisher.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice'); // publisher
        const bob = makeIdentity('Bob'); // commenter
        const publication = infra.publisherProvider.publish(makeDocument('Section B World', 'alice'), alice);

        const bobSession = buildSessionFor(bob, infra);
        const { commentary, isNew } = bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Nice world!' });
        assert(isNew === true, 'B1. the real command reports a genuinely new Commentary.');

        assert(infra.commentaryStore.loadAll().length === 1, 'B2. exactly one Commentary is durably on file.');
        assert(infra.notificationEventStore.loadAll().length === 1, 'B3. exactly one NotificationEvent is durably on file.');

        const aliceSession = buildSessionFor(alice, infra);
        const aliceNotifications = aliceSession.getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 1, 'B4. the publisher\'s own recipient-scoped query sees exactly one notification.');
        assert(aliceNotifications[0].payload.commentaryId === commentary.commentaryId, 'B5. the notification references the exact Commentary that was just created.');

        console.log('✓ B: one Commentary, submitted through the real application command, produces exactly one durable Commentary and exactly one durable NotificationEvent, addressed to the publisher.');
    }

    // ===============================================================
    // Section C — Correct recipient. The publisher receives it; the
    // commenter does not receive it merely because they authored it.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice'); // publisher
        const bob = makeIdentity('Bob'); // commenter
        const publication = infra.publisherProvider.publish(makeDocument('Section C World', 'alice'), alice);

        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Great work' });

        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        const bobNotifications = buildSessionFor(bob, infra).getRecipientNotificationEventsCommand();

        assert(aliceNotifications.length === 1 && aliceNotifications[0].recipientIdentityId === alice.getSigningIdentity().id,
            'C1. the publisher (Alice) receives the one real notification.');
        assert(bobNotifications.length === 0,
            'C2. the commenter (Bob) receives no notification of his own comment — authoring a Commentary never makes you its own recipient.');

        console.log('✓ C: the notification is addressed to the Publication\'s publisher, never to the commenter who authored it.');
    }

    // ===============================================================
    // Section D — Recipient isolation across two Publications/publishers,
    // with multiple Commentaries, remain isolated.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const carol = makeIdentity('Carol');
        const bob = makeIdentity('Bob');
        const dave = makeIdentity('Dave');
        const alicePub = infra.publisherProvider.publish(makeDocument('Section D Alice World', 'alice'), alice);
        const carolPub = infra.publisherProvider.publish(makeDocument('Section D Carol World', 'carol'), carol);

        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: alicePub.id, content: 'Bob on Alice' });
        buildSessionFor(dave, infra).addPublicationCommentaryCommand({ publicationId: alicePub.id, content: 'Dave on Alice too' });
        buildSessionFor(dave, infra).addPublicationCommentaryCommand({ publicationId: carolPub.id, content: 'Dave on Carol' });

        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        const carolNotifications = buildSessionFor(carol, infra).getRecipientNotificationEventsCommand();

        assert(aliceNotifications.length === 2, 'D1. Alice received both notifications from the two different commenters on her own Publication.');
        assert(aliceNotifications.every((e) => e.payload.publicationId === alicePub.id), 'D2. every one of Alice\'s notifications concerns her own Publication.');
        assert(carolNotifications.length === 1 && carolNotifications[0].payload.publicationId === carolPub.id,
            'D3. Carol received exactly the one notification for her own Publication.');
        assert(!aliceNotifications.some((e) => e.recipientIdentityId === carol.getSigningIdentity().id),
            'D4a. Alice never observes a notification addressed to Carol.');
        assert(!carolNotifications.some((e) => e.recipientIdentityId === alice.getSigningIdentity().id),
            'D4b. Carol never observes a notification addressed to Alice.');
        assert(infra.notificationEventStore.loadAll().length === 3, 'D5. three real notifications total, all correctly isolated by recipient.');

        console.log('✓ D: two Publications, two publishers, three Commentaries — every notification lands with exactly the right recipient, with no cross-Publication leakage.');
    }

    // ===============================================================
    // Section E — Notification History visibility. After Commentary
    // creation, the SAME real chain the UI walks — WorldView ->
    // Notification History -> GetRecipientNotificationEventsUseCase ->
    // NotificationEventStore — shows the newly persisted event. This is
    // the first true vertical end-to-end notification test in this arc.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Section E World', 'alice'), alice);

        // The commenter's own session — a different "browser tab" than
        // the publisher's, sharing the same durable backend, exactly the
        // way two real, differently-authenticated replicas would.
        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Vertical E2E' });

        // The publisher's own Notification History surface: a real
        // NotificationHistoryPanel ctx, wired to the real
        // getRecipientNotificationEventsCommand a real WorldView.js would
        // wire it to.
        const aliceSession = buildSessionFor(alice, infra);
        const ctx = notificationPanelCtx({ getRecipientNotificationEventsCommand: aliceSession.getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory();

        assert(ctx.notifications.length === 1, 'E1. Notification History shows exactly the one real notification the real Commentary just produced.');
        assert(ctx.notifications[0].eventType === PUBLICATION_COMMENTED_EVENT_TYPE, 'E2. the rendered event carries the real, policy-defined eventType.');
        assert(ctx.notifications[0].payload.publicationId === publication.id, 'E3. the rendered event\'s payload references the real Publication that was actually commented on.');
        assert(ctx.notificationHistoryError === null, 'E4. a successful vertical read reports no error.');

        console.log('✓ E: WorldView -> Notification History -> GetRecipientNotificationEventsUseCase -> NotificationEventStore shows the newly persisted event — a real Commentary, submitted through the real application command, is now visible end to end through the real UI-facing read path.');
    }

    // ===============================================================
    // Section F — Retry/deduplication. The store's own established
    // deduplication semantics govern retries; no producer-side
    // deduplication is added by this milestone.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Section F World', 'alice'), alice);

        // WorldNavigationSession#addPublicationCommentary() itself only
        // ever forwards {publicationId, content} (A6/A7 above) — it never
        // accepted commentaryId, before or after this milestone. Exercising
        // a retry with a FIXED commentaryId therefore calls the composed
        // capability's own .execute() directly, exactly the same boundary
        // 0.9.276/0.9.282's own retry sections already exercised at the
        // producer level — this is the real, composed capability
        // WorldNavigationSession delegates to, not a bypass of it.
        const bobSession = buildSessionFor(bob, infra);
        const fixedInput = { publicationId: publication.id, commentaryId: 'retry-0-9-285', content: 'retried content', createdAt: new Date('2024-05-05T00:00:00.000Z') };
        const first = bobSession.publicationCommentaryCapability.execute(fixedInput);
        const retry = bobSession.publicationCommentaryCapability.execute({ ...fixedInput });
        assert(first.isNew === true, 'F1. the first submission is a genuinely new Commentary.');
        assert(retry.isNew === false, 'F2. the retry is correctly reported idempotent by the wrapped use case, unmodified.');

        assert(infra.notificationEventStore.loadAll().length === 1, 'F3. the durable notification history contains exactly one row for this Commentary, regardless of the retry.');

        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 1, 'F4. the publisher\'s own Notification History still shows exactly one notification after the retry — never two.');

        // A THIRD retry, for good measure — the store's own ceiling holds
        // regardless of how many times the same logical Commentary is
        // resubmitted.
        bobSession.publicationCommentaryCapability.execute({ ...fixedInput });
        assert(infra.notificationEventStore.loadAll().length === 1, 'F5. a third retry still does not grow the durable notification history.');

        console.log('✓ F: repeated processing of the same Commentary (same commentaryId) continues to collapse onto exactly one durable notification, entirely through NotificationEventStore\'s own established deduplication semantics — no producer-side deduplication was added to reach this result.');
    }

    // ===============================================================
    // Section G — Event-type identity. The existing notification policy
    // (eventType + deduplication identity) remains authoritative — this
    // milestone introduces no new identity or event-type vocabulary.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Section G World', 'alice'), alice);

        const { commentary } = buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Identity check' });
        const persisted = infra.notificationEventStore.loadAll()[0];

        assert(persisted.eventType === 'publication.commented' && persisted.eventType === PUBLICATION_COMMENTED_EVENT_TYPE,
            'G1. the persisted event still carries the exact, unmodified event type 0.9.275 defined.');

        // An independently constructed NotificationEvent describing the
        // SAME logical Commentary (never saved) still resolves to the
        // SAME deduplication identity as the one this real run actually
        // persisted — the existing policy, never a new one, is what a
        // future retry (Section F) is actually collapsed against.
        const independentlyConstructed = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { publicationId: publication.id, commentaryId: commentary.commentaryId, authorIdentityId: bob.getSigningIdentity().id }
        });
        assert(notificationDeduplicationIdentity(persisted) === notificationDeduplicationIdentity(independentlyConstructed),
            'G2. the real, composed pipeline\'s own persisted event shares its deduplication identity with an independently constructed NotificationEvent describing the same Commentary — core/NotificationDeduplicationPolicy.js remains the one, unmodified authority.');

        console.log('✓ G: eventType and deduplication identity are exactly what 0.9.275/0.9.280 already established — this milestone introduces no new notification vocabulary of its own.');
    }

    // ===============================================================
    // Section H — Self-comment. The publisher commenting on their own
    // Publication still produces a notification — no suppression, no new
    // special case introduced at the composition layer.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const publication = infra.publisherProvider.publish(makeDocument('Section H World', 'alice'), alice);

        const aliceSession = buildSessionFor(alice, infra);
        const { isNew } = aliceSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Commenting on my own world' });
        assert(isNew === true, 'H1. self-commentary is still accepted as a genuinely new Commentary.');

        const aliceNotifications = aliceSession.getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 1, 'H2. the self-comment still produces exactly one notification, addressed to Alice herself — unconditionally, exactly as PublicationCommentaryNotificationProducer\'s own header documents.');
        assert(aliceNotifications[0].payload.authorIdentityId === alice.getSigningIdentity().id
            && aliceNotifications[0].recipientIdentityId === alice.getSigningIdentity().id,
            'H3. author and recipient are the SAME identity for a self-comment — no suppression rule was introduced by this milestone\'s own composition change.');

        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(!/authorIdentityId\s*!==?\s*.*publisherIdentity|self-?comment/i.test(compositionCode),
            'H4. the composition root itself contains no self-comment suppression logic of any kind.');

        console.log('✓ H: self-commentary still produces a notification addressed to the commenting publisher — no new special case appears at the composition layer.');
    }

    // ===============================================================
    // Section I — Publication lookup miss. Commentary remains successful;
    // notification absence is preserved, never turned into a Commentary
    // failure. Deliberately constructed (as this producer's own tests
    // already do): the discoveryProvider used for the producer's own
    // lookup does not see the Publication, while the one used for
    // authorization does — never reachable when both share one instance,
    // as every other section here (and production itself) does.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Section I World', 'alice'), alice);
        const emptyDiscoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());

        const bobSession = buildSessionFor(bob, infra, { producerDiscoveryProvider: emptyDiscoveryProvider });
        const { commentary, isNew } = bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Publication vanished from the producer\'s own view' });

        assert(isNew === true, 'I1. the Commentary itself still succeeds — a missing Publication from the producer\'s own lookup never fails an already-authorized, already-persisted Commentary.');
        assert(infra.commentaryStore.loadAll().some((c) => c.commentaryId === commentary.commentaryId), 'I2. the Commentary is durably on file.');
        assert(infra.notificationEventStore.loadAll().length === 0, 'I3. no notification is produced when the producer\'s own Publication lookup misses.');

        console.log('✓ I: a Publication lookup miss (from the producer\'s own discoveryProvider specifically) leaves Commentary creation completely successful and simply produces no notification — never a thrown error, never a placeholder recipient.');
    }

    // ===============================================================
    // Section J — Notification storage failure. Commentary persists;
    // notification persistence fails; the resulting semantics are
    // "Commentary persisted + notification persistence failed," never
    // atomicity — no transaction or rollback is introduced to hide this.
    // ===============================================================
    {
        const sharedStorage = new InMemoryStorageProvider();
        const failingStorage = new PartiallyFailingStorageProvider(sharedStorage, NOTIFICATION_EVENT_STORE_KEY);
        const infra = makeSharedInfrastructure(failingStorage);
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Section J World', 'alice'), alice);

        const bobSession = buildSessionFor(bob, infra);
        let threw = false;
        let thrownMessage = null;
        try {
            bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Sink will fail' });
        } catch (error) {
            threw = true;
            thrownMessage = error.message;
        }

        assert(threw, 'J1. a genuine notification storage failure propagates out of the real, composed capability — never silently swallowed.');
        assert(thrownMessage === 'simulated notification storage failure', 'J2. the storage provider\'s own failure message propagates unmodified, never wrapped or replaced.');

        // J3. THE COMMENTARY ITSELF IS ALREADY DURABLY PERSISTED — read it
        // back through a fresh PublicationCommentaryStore instance over
        // the SAME underlying (non-failing, for the commentary key)
        // sharedStorage, simulating a restart, exactly the discipline
        // tests/PostNotificationPersistenceProductReassessment.test.js
        // Section E already established for the notification side.
        const reloadedCommentaryStore = new PublicationCommentaryStore(sharedStorage);
        const persistedCommentaries = reloadedCommentaryStore.loadAll();
        assert(persistedCommentaries.length === 1 && persistedCommentaries[0].content === 'Sink will fail',
            'J3. the Commentary persisted BEFORE the notification sink ran is still durably on file, completely untouched by the later notification storage failure.');

        // J4. No transaction/rollback vocabulary was introduced anywhere
        // in the composition root to paper over this.
        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(!/rollback|transaction|\.undo\(|compensat/i.test(compositionCode),
            'J4. application/CreateWorldViewUseCase.js contains no rollback/transaction/compensation vocabulary — the Commentary write and the notification write remain two separate, non-atomic operations, exactly as this milestone\'s own brief requires.');

        console.log('✓ J: a genuine notification storage failure propagates unmodified out of the real, composed capability, exactly as PublicationCommentaryNotificationProducer.js\'s own header already documents — and the Commentary persisted BEFORE that failure remains durably on file. "Commentary persisted + notification persistence failed" is the honest, non-atomic outcome; no transaction or rollback was introduced to hide it.');
    }

    // ===============================================================
    // Section K — UI lifecycle. Create Commentary -> open Notifications
    // -> refresh -> see the event, through the two REAL panels this
    // codebase already ships (OwnPublicationPanel.js, 0.9.248;
    // NotificationHistoryPanel.js, 0.9.284), wired to the SAME real,
    // composed session this milestone's own composition change now
    // builds.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Section K World', 'alice'), alice);

        // Bob opens the Publication's Commentary section and submits a
        // real comment through the real command.
        const bobSession = buildSessionFor(bob, infra);
        const commentaryCtx = commentaryPanelCtx({
            publication,
            getPublicationCommentariesCommand: bobSession.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: bobSession.addPublicationCommentaryCommand,
            viewerIdentityId: bob.getSigningIdentity().id
        });
        commentaryCtx.newCommentaryText = 'Lifecycle check';
        commentaryCtx.submitPublicationCommentary();
        assert(commentaryCtx.publicationCommentaries.length === 1 && commentaryCtx.publicationCommentaryError === null,
            'K1. the Commentary panel shows the newly created Commentary through the real, unmodified UI flow.');

        // Alice — the publisher, a different real session over the same
        // durable backend — opens her own Notification History panel and
        // refreshes it.
        const aliceSession = buildSessionFor(alice, infra);
        const notificationCtx = notificationPanelCtx({ getRecipientNotificationEventsCommand: aliceSession.getRecipientNotificationEventsCommand });
        notificationCtx.refreshNotificationHistory();

        assert(notificationCtx.notifications.length === 1, 'K2. after opening Notification History and refreshing, the publisher sees exactly the one real notification the Commentary just produced.');
        assert(notificationCtx.notifications[0].eventType === PUBLICATION_COMMENTED_EVENT_TYPE, 'K3. the visible notification carries the real eventType.');
        const details = notificationCtx.notificationDetails(notificationCtx.notifications[0]);
        const byLabel = Object.fromEntries(details.map((d) => [d.label, d.value]));
        assert(byLabel['Publication Id'] === publication.id, 'K4. the rendered detail carries the real Publication that was commented on.');

        console.log('✓ K: create Commentary (OwnPublicationPanel) -> open Notifications (NotificationHistoryPanel) -> refresh -> see the event — the complete UI lifecycle this milestone finally makes possible, exercised end to end through the two real, unmodified panels this codebase already ships.');
    }

    // ===============================================================
    // Section L — No duplicate wiring. Exactly one notification producer
    // in the active Commentary path. Store deduplication should make
    // retries safe (Section F) — it should never be relied on to conceal
    // an accidental SECOND, differently-wired producer.
    // ===============================================================
    {
        // L1. Exactly one live construction site for the producer class,
        // anywhere in application/ or ui/ — the composition root, and
        // nowhere else.
        const producerConstructionSites = await grepCount('new PublicationCommentaryNotificationProducer(', ['application', 'ui'], { excludeSuffix: 'PublicationCommentaryNotificationProducer\\.js' });
        assert(producerConstructionSites === 1,
            `L1. Exactly one production file constructs a PublicationCommentaryNotificationProducer (found ${producerConstructionSites}) — application/CreateWorldViewUseCase.js, and no other application/ui file.`);

        // L2. WorldNavigationSession's own addPublicationCommentary()
        // calls its injected use case's .execute() exactly once — never
        // twice, never once for a raw path and once more for a
        // notification-aware path. A second call site would be a second,
        // independent production trigger that store-side deduplication
        // (Section F) could silently mask by identity, never by catching
        // the double call itself.
        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        const addCommentaryMethodBody = extractMethodBody(sessionCode, /addPublicationCommentary\(\{ publicationId, content \}\) \{/);
        assert(addCommentaryMethodBody, 'L2a. WorldNavigationSession#addPublicationCommentary() still exists in its own, single, recognizable shape.');
        const executeCallsInMethod = (addCommentaryMethodBody.match(/\.execute\(/g) || []).length;
        assert(executeCallsInMethod === 1,
            `L2b. WorldNavigationSession#addPublicationCommentary() calls .execute() exactly once per invocation (found ${executeCallsInMethod}) — one call, on whatever single capability it was constructed with.`);

        // L3. The composition root wires exactly one NotificationEventStore
        // instance (re-verified from Section A2b here as this section's
        // own explicit "no duplicate wiring" claim, not merely inherited)
        // — a second, independently constructed store instance sharing
        // the same underlying storageProvider could silently duplicate
        // history without either one, alone, ever showing two rows.
        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        const storeConstructions = (compositionCode.match(/new NotificationEventStore\(/g) || []).length;
        assert(storeConstructions === 1, `L3. Exactly one NotificationEventStore is constructed in the composition root (found ${storeConstructions}).`);

        // L4. A live, semantic demonstration of exactly the danger this
        // section's own brief names: TWO independently constructed
        // producers, from two SEPARATE AddPublicationCommentaryUseCase
        // instances (never the real composition shape — a deliberately
        // constructed negative case), each reacting to their OWN
        // Commentary submission for the SAME publicationId/content pair,
        // produce TWO real, distinct commentaryIds and therefore TWO
        // real, distinct notifications — proving deduplication collapses
        // retries of the IDENTICAL logical Commentary (Section F) but
        // does nothing to hide two genuinely different production
        // events. This is the concrete reason "exactly one producer,
        // wired once" (L1-L3) matters architecturally, not merely as a
        // style preference.
        {
            const infra = makeSharedInfrastructure();
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const publication = infra.publisherProvider.publish(makeDocument('Section L World', 'alice'), alice);
            const firstProducerSession = buildSessionFor(bob, infra);
            const secondProducerSession = buildSessionFor(bob, infra);

            firstProducerSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Only ever submitted once' });
            // A SECOND, independently-wired producer reacting to a
            // SEPARATE, genuinely new Commentary submission — never a
            // retry of the same commentaryId — is exactly what an
            // accidental double-wiring at the composition root would
            // look like from the store's own vantage point.
            secondProducerSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Only ever submitted once' });

            assert(infra.commentaryStore.loadAll().length === 2, 'L4a. two genuinely separate Commentary submissions (this test\'s own deliberately duplicated wiring) produce two real, distinct Commentaries.');
            assert(infra.notificationEventStore.loadAll().length === 2,
                'L4b. and therefore two real, distinct notifications — store deduplication (identity: commentaryId + eventType + recipientIdentityId) does NOT collapse two DIFFERENT commentaryIds, confirming it would never conceal an accidental second producer with a different logical identity, only ever a true retry of the SAME one (Section F).');
        }

        console.log('✓ L: exactly one notification producer is wired into the active Commentary path (L1), WorldNavigationSession calls into it exactly once per Commentary submission (L2), exactly one NotificationEventStore instance backs both directions (L3), and a deliberately constructed double-wiring negative case confirms store-side deduplication would never conceal such a mistake — it only ever collapses genuine retries of the identical logical Commentary, never two independently produced ones (L4).');
    }

    console.log('\n✅ All PublicationCommentaryNotificationRuntimeIntegration tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentaryNotificationRuntimeIntegration tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentaryNotificationRuntimeIntegration tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
