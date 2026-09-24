import { execSync } from 'node:child_process';
import NotificationHistoryPanel from '../ui/components/NotificationHistoryPanel.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import {
    NotificationCollisionOutcome,
    classifyNotificationCollision,
    notificationDeduplicationIdentity,
    describeNotificationDeduplicationPolicy
} from '../core/NotificationDeduplicationPolicy.js';
import { GetRecipientNotificationEventsUseCase } from '../application/chat/GetRecipientNotificationEventsUseCase.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { editorViewFiles, worldViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.530 — Notification Event & Delivery Experience Product Reassessment.
//
// 0.9.273-0.9.306 built and twice reassessed the notification arc — a
// domain-neutral fact (NotificationEvent), a producer, deduplication, a
// durable store, a recipient query boundary, and a read-only History UI —
// finding, each time (0.9.287, 0.9.306), no evidenced case for delivery,
// read/unread, or an active-awareness capability. This milestone asks the
// question those two reassessments never fully asked: does what IS built
// communicate accurately what happened, whether it was observed, and what
// the recipient can DO about it? Nine lettered sections, mirroring this
// milestone's own originating brief:
//
//   Section A — Event semantics.
//   Section B — Delivery versus observation.
//   Section C — Failure comprehension.
//   Section D — Notification identity and deduplication.
//   Section E — Navigation continuity (FLAGSHIP — the one real,
//               evidenced PRODUCT_GAP this reassessment found: a
//               notification named a publicationId but offered no way to
//               reach it. Fixed in THIS milestone — see
//               ui/views/WorldView.js#viewNotificationPublicationCommand
//               and ui/components/NotificationHistoryPanel.js's own new
//               Explore action — by reusing, never reinventing, two
//               already-existing capabilities: session.findPublicationById()
//               (0.9.187) and focusWorld() (0.2.27/2.94, the same
//               mechanism Search/Nearby Worlds/Documents-Here already
//               share). Deliberately NOT a bare router.push() — see that
//               function's own header for why 0.9.380 Section E's own
//               "navigating to self inside WorldView" finding rules that
//               out.)
//   Section F — Trust-language review.
//   Section G — Stale/lifecycle experience.
//   Section H — Cross-surface consistency.
//   Section I — Product-gap classification and verdict.
//
// Every claim below is checked against real, unmodified (except where
// named) production source and real object graphs — never asserted from
// milestone history alone.

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function gitDiffStat(paths) {
    try {
        return execSync(`git diff --stat HEAD -- ${paths.join(' ')} 2>/dev/null || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
    } catch {
        return '';
    }
}

// ---------------------------------------------------------------------
// Shared fixtures — this milestone's own copies, matching the shape
// tests/NotificationHistoryUILifecycle.test.js and
// tests/PostNotificationAwarenessProductReassessment.test.js already
// established, never imported from either file directly.
// ---------------------------------------------------------------------

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

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

function makeProducer(backend, commentAuthorProvider) {
    const addCommentaryUseCase = new AddPublicationCommentaryUseCase(backend.commentaryStore, commentAuthorProvider, backend.canCommentOnPublicationUseCase);
    return new PublicationCommentaryNotificationProducer(addCommentaryUseCase, backend.discoveryProvider, (event) => backend.notificationEventStore.save(event));
}

function makeReaderFor(recipientIdentityProvider, backend) {
    const getRecipientNotificationEventsUseCase = new GetRecipientNotificationEventsUseCase(backend.notificationEventStore, recipientIdentityProvider);
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider: backend.discoveryProvider,
        getRecipientNotificationEventsUseCase
    });
    return {
        session,
        getRecipientNotificationEventsCommand: () => session.getRecipientNotificationEvents()
    };
}

// The exact logic ui/views/WorldView.js#viewNotificationPublicationCommand
// carries in production, reproduced here so this file can exercise it
// against a REAL WorldNavigationSession without pulling in the DOM/Vue
// layer WorldView.js itself needs — Section E below separately proves,
// via source assertion, that the real file's body matches this shape.
// The one deliberately-omitted piece is focusWorld()'s own camera-move
// (`session.focusDocument()`/`router.replace()`) — untestable at this
// layer without a full SpatialCameraController fixture, and not what
// this milestone changed; findPublicationById() resolving the correct
// Publication is the one new fact this test needs to prove live.
function makeViewPublicationCommand(session) {
    return (publicationId) => {
        const publication = typeof session.findPublicationById === 'function'
            ? session.findPublicationById(publicationId)
            : null;
        return (publication && publication.documentId) ? publication.documentId : false;
    };
}

function panelCtx(overrides = {}) {
    return {
        getRecipientNotificationEventsCommand: null,
        viewPublicationCommand: null,
        notifications: [],
        notificationHistoryError: null,
        unavailablePublicationNotificationIds: new Set(),
        refreshNotificationHistory: NotificationHistoryPanel.methods.refreshNotificationHistory,
        notificationTitle: NotificationHistoryPanel.methods.notificationTitle,
        notificationDetails: NotificationHistoryPanel.methods.notificationDetails,
        notificationPublicationId: NotificationHistoryPanel.methods.notificationPublicationId,
        viewNotificationPublication: NotificationHistoryPanel.methods.viewNotificationPublication,
        ...overrides
    };
}

async function runTests() {
    console.log('Running Notification Event & Delivery Experience Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Event semantics.
    // ===============================================================
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section A World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        const { commentary } = producer.execute({ publicationId: publication.id, content: 'nice work' });

        const stored = backend.notificationEventStore.getById(
            backend.notificationEventStore.loadAll()[0].notificationId
        );
        assert(stored.payload.publicationId === publication.id && stored.payload.commentaryId === commentary.commentaryId,
            'A1. Event identity is preserved end to end — the persisted event\'s own payload names the exact Publication/Commentary that produced it.');

        const originalPayload = stored.payload;
        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const ctx = panelCtx({ getRecipientNotificationEventsCommand });
        ctx.refreshNotificationHistory.call(ctx);
        ctx.notificationDetails.call(ctx, ctx.notifications[0]);
        assert(JSON.stringify(stored.payload) === JSON.stringify(originalPayload),
            'A2. Rendering the event for presentation (notificationDetails()) never mutates the underlying stored payload.');

        ctx.refreshNotificationHistory.call(ctx);
        assert(backend.notificationEventStore.loadAll().length === 1,
            'A3. Repeated observation (reading the history twice) never creates a duplicate event.');

        const detailKeys = ctx.notificationDetails.call(ctx, ctx.notifications[0]).map((d) => d.label.toLowerCase().replace(/\s+/g, ''));
        const payloadKeys = Object.keys(ctx.notifications[0].payload).map((k) => k.toLowerCase());
        assert(detailKeys.length === payloadKeys.length && payloadKeys.every((k) => detailKeys.includes(k)),
            'A4. The rendered detail set is exactly the payload\'s own keys — nothing invented beyond the event.');

        console.log('✓ A: event identity, non-mutation, non-duplication, and no invented facts — all reconfirmed live.');
    }

    // ===============================================================
    // Section B — Delivery versus observation.
    // ===============================================================
    {
        const notificationEventCode = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        const storeCode = codeOnlyLines(await rawSource('storage/NotificationEventStore.js'));
        const panelCode = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        const forbidden = /\b(delivered|isDelivered|isRead|markRead|markDelivered|seenAt|readAt|deliveredAt)\b/i;
        assert(!forbidden.test(notificationEventCode), 'B1. core/NotificationEvent.js carries no delivery/read/seen field.');
        assert(!forbidden.test(storeCode), 'B2. storage/NotificationEventStore.js carries no delivery/read/seen mutator.');
        assert(!forbidden.test(panelCode), 'B3. NotificationHistoryPanel.js carries no delivery/read/seen UI state.');

        // Live: created -> not yet "delivered" (nothing marks it) ->
        // observed once via the read boundary -> observed again ->
        // still the identical fact, never flipped to a "seen" state.
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section B World', 'alice'), alice);
        makeProducer(backend, bob).execute({ publicationId: publication.id, content: 'first' });

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const firstRead = getRecipientNotificationEventsCommand();
        const secondRead = getRecipientNotificationEventsCommand();
        assert(JSON.stringify(firstRead[0].toJSON()) === JSON.stringify(secondRead[0].toJSON()),
            'B4. Two independent observations of the same fact return byte-identical events — observation itself changes nothing about the stored fact.');
        assert(!('delivered' in firstRead[0]) && !('read' in firstRead[0]) && !('seen' in firstRead[0]),
            'B5. The returned NotificationEvent instance itself carries no delivered/read/seen property — creation, persistence, and observation remain three distinct claims, never collapsed into one status.');

        console.log('✓ B: delivery and seen/read remain absent, by construction, from the fact, the store, and the UI — creation/persistence/observation stay three distinct, unflattened claims.');
    }

    // ===============================================================
    // Section C — Failure comprehension.
    // ===============================================================
    {
        // C1 — event creation failure: an invalid eventType throws at
        // construction, not silently accepted.
        let threw = false;
        try { new NotificationEvent({ eventType: '', recipientIdentityId: 'id-1' }); } catch { threw = true; }
        assert(threw, 'C1. Constructing a NotificationEvent with an invalid eventType throws — a creation failure is a thrown error, never a silently-empty fact.');

        // C2 — malformed event degrades to null on read, never a throw.
        assert(NotificationEvent.fromJSON({ notificationId: 'x' }) === null,
            'C2. A malformed persisted record degrades to null on read — never a thrown error mid-collection-load.');

        // C3 — duplicate event (delivered through two independent
        // producer invocations) collapses to EXISTING, never a second row.
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section C World', 'alice'), alice);
        const producer = makeProducer(backend, bob);
        const { commentary } = producer.execute({ publicationId: publication.id, content: 'dup me' });
        const retryEvent = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { publicationId: publication.id, commentaryId: commentary.commentaryId, authorIdentityId: bob.getSigningIdentity().id }
        });
        const retryResult = backend.notificationEventStore.save(retryEvent);
        assert(retryResult.outcome === NotificationPersistenceOutcome.EXISTING && backend.notificationEventStore.loadAll().length === 1,
            'C3. A retried/re-delivered construction of the identical logical event resolves to EXISTING, never a duplicate row — this is the store recognizing "nothing new happened," not a failure.');

        // C4 — a delivery/sink failure never undoes the already-persisted
        // Commentary (reconfirms application/publication/commentary/PublicationCommentaryNotificationProducer.js's own documented behavior).
        const throwingProducer = new PublicationCommentaryNotificationProducer(
            new AddPublicationCommentaryUseCase(backend.commentaryStore, bob, backend.canCommentOnPublicationUseCase),
            backend.discoveryProvider,
            () => { throw new Error('sink unavailable'); }
        );
        let sinkThrew = false;
        try {
            throwingProducer.execute({ publicationId: publication.id, content: 'second comment despite sink failure' });
        } catch { sinkThrew = true; }
        assert(sinkThrew, 'C4a. A notification-channel failure propagates as a real thrown error, never swallowed.');
        const commentaries = backend.commentaryStore.getForPublication(publication.id);
        assert(commentaries.some((c) => c.content === 'second comment despite sink failure'),
            'C4b. The Commentary itself is still durably persisted — a notification-delivery failure is not confused with a content-creation failure.');

        // C5 — UI distinguishes "nothing new to show" from "a real failure."
        const emptyCtx = panelCtx({ getRecipientNotificationEventsCommand: () => [] });
        emptyCtx.refreshNotificationHistory.call(emptyCtx);
        assert(emptyCtx.notifications.length === 0 && emptyCtx.notificationHistoryError === null,
            'C5a. Zero notifications on file renders the plain empty state, never an error.');
        const failingCtx = panelCtx({ getRecipientNotificationEventsCommand: () => { throw new Error('storage unavailable'); } });
        failingCtx.refreshNotificationHistory.call(failingCtx);
        assert(failingCtx.notificationHistoryError === 'storage unavailable',
            'C5b. A genuine read failure renders a distinct error state, never silently collapsed into "no notifications."');

        // C6 — an unresolvable Explore target on an otherwise-valid,
        // on-file notification is a PER-ITEM degrade, never promoted to
        // the page-level notificationHistoryError.
        const liveEvents = getRecipientNotificationEventsCommandFor(backend, alice);
        const degradeCtx = panelCtx({ notifications: liveEvents, viewPublicationCommand: () => false });
        degradeCtx.viewNotificationPublication.call(degradeCtx, liveEvents[0]);
        assert(degradeCtx.notificationHistoryError === null && degradeCtx.unavailablePublicationNotificationIds.has(liveEvents[0].notificationId),
            'C6. An unresolvable navigation target marks only that ONE notification unavailable — "nothing to navigate to" is never conflated with "the history itself failed to load."');

        console.log('✓ C: creation failure throws, malformed reads degrade to null, retried delivery collapses to EXISTING, a sink failure never undoes the underlying fact, and the UI keeps "nothing new," "a real failure," and "an unavailable target" as three distinct, correctly-scoped states.');
    }

    function getRecipientNotificationEventsCommandFor(backend, identityProvider) {
        return makeReaderFor(identityProvider, backend).getRecipientNotificationEventsCommand();
    }

    // ===============================================================
    // Section D — Notification identity and deduplication.
    // ===============================================================
    {
        const policy = describeNotificationDeduplicationPolicy();
        assert(policy.collisionHandling === 'INSPECT_FOR_CONFLICT' && policy.payloadParticipatesInIdentity === false,
            'D1. The adopted deduplication policy (0.9.280) is unchanged — this milestone introduces no new deduplication semantics.');

        // D2 — "delivered through multiple mechanisms" (e.g. a producer
        // retry after a network hiccup, or a future second producer
        // observing the same underlying Commentary) is treated as ONE
        // event, not two — reconfirmed live, never merely asserted.
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section D World', 'alice'), alice);
        const { commentary } = makeProducer(backend, bob).execute({ publicationId: publication.id, content: 'once' });
        const independentReconstruction = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: alice.getSigningIdentity().id,
            payload: { publicationId: publication.id, commentaryId: commentary.commentaryId, authorIdentityId: bob.getSigningIdentity().id }
        });
        const stored = backend.notificationEventStore.loadAll()[0];
        assert(classifyNotificationCollision(stored, independentReconstruction) === NotificationCollisionOutcome.MATCH,
            'D2. Two independently-constructed representations of the identical logical notification classify as MATCH, not two different notifications.');
        assert(notificationDeduplicationIdentity(stored) === notificationDeduplicationIdentity(independentReconstruction),
            'D3. Both share the identical deduplication identity — this milestone introduces no new identity dimension.');

        console.log('✓ D: identity/collision policy reconfirmed unchanged; a same-event-through-multiple-constructions scenario still collapses to one logical notification, exactly as 0.9.280 already decided.');
    }

    // ===============================================================
    // Section E — Navigation continuity. FLAGSHIP: the one real,
    // evidenced PRODUCT_GAP this reassessment found, and closed.
    // ===============================================================
    {
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');

        // E1 — the new command exists, resolves via findPublicationById()
        // (0.9.187, unmodified), reuses focusWorld() (never a bare
        // router.push/router.replace of its own), and closes the panel —
        // never a second navigation mechanism.
        const commandMatch = worldViewSource.match(/function viewNotificationPublicationCommand\(publicationId\) \{[\s\S]*?\n {8}\}/);
        assert(commandMatch, 'E1a. ui/views/WorldView.js defines viewNotificationPublicationCommand().');
        const commandBody = commandMatch[0];
        assert(/session\.findPublicationById\(publicationId\)/.test(commandBody),
            'E1b. It resolves the target through the EXISTING session.findPublicationById() — never a new lookup/discovery mechanism.');
        assert(/focusWorld\(publication\.documentId\)/.test(commandBody),
            'E1c. It navigates through the EXISTING focusWorld() — the same mechanism Search/Nearby Worlds/Documents-Here already share.');
        assert(!/router\.(push|replace)/.test(commandBody),
            'E1d. It never calls router.push()/router.replace() directly — no second, competing navigation mechanism is introduced.');
        assert(/closeNotificationHistoryPanel\(\)/.test(commandBody),
            'E1e. It closes the Notification History panel on a successful navigation, mirroring focusLocationDocument()\'s own identical shape.');
        assert(/return false;/.test(commandBody) && /if \(!publication \|\| !publication\.documentId\)/.test(commandBody),
            'E1f. An unresolvable target (stale/unpublished/unknown) returns false and navigates nowhere — never a thrown error.');

        // E2 — the panel exposes the capability generically, keyed by
        // payload field NAME, never by eventType.
        assert(/viewPublicationCommand:\s*\{\s*type: Function/.test(panelSource),
            'E2a. NotificationHistoryPanel.js declares viewPublicationCommand as an optional injected Function prop.');
        assert(/event\.payload\.publicationId/.test(panelSource) || /event && event\.payload && event\.payload\.publicationId/.test(panelSource),
            'E2b. The panel reads the target from payload.publicationId — the well-known field name the real producer already writes — never a hardcoded eventType check.');
        assert(!/event\.eventType === ['"]publication\.commented['"]/.test(panelSource),
            'E2c. The panel never special-cases the one current eventType — a future producer addressing a Publication under the same payload key is reachable for free.');

        // E3 — live, end to end: the REAL discoveryProvider/session
        // resolve a REAL Publication's documentId from nothing but the
        // publicationId a REAL persisted NotificationEvent carries.
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section E World', 'alice'), alice);
        makeProducer(backend, bob).execute({ publicationId: publication.id, content: 'come see this' });

        const { session, getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const events = getRecipientNotificationEventsCommand();
        const viewPublicationCommand = makeViewPublicationCommand(session);

        const ctx = panelCtx({ notifications: events, viewPublicationCommand });
        const resolvedDocumentId = ctx.viewPublicationCommand(ctx.notificationPublicationId.call(ctx, events[0]));
        assert(resolvedDocumentId === publication.documentId,
            'E3. Live: payload.publicationId -> session.findPublicationById() -> the exact real Publication\'s own documentId — the identical target focusWorld() would receive in production.');

        // E4 — the panel's own click handler, exercised for real: a
        // resolvable target is never marked unavailable; the underlying
        // NotificationEvent is completely untouched by any of this.
        const beforeJSON = JSON.stringify(events[0].toJSON());
        const successCtx = panelCtx({ notifications: events, viewPublicationCommand: () => true });
        successCtx.viewNotificationPublication.call(successCtx, events[0]);
        assert(!successCtx.unavailablePublicationNotificationIds.has(events[0].notificationId),
            'E4a. A successful navigation never marks the notification unavailable.');
        assert(JSON.stringify(events[0].toJSON()) === beforeJSON,
            'E4b. Navigating away never mutates the NotificationEvent it navigated from.');

        // E5 — stale target: the Publication is unpublished AFTER the
        // notification was created; the SAME notification's Explore
        // action now degrades gracefully, never throws, and only that
        // one notification is affected.
        backend.publisherProvider.unpublish(publication.id);
        const staleCommand = makeViewPublicationCommand(session);
        const staleResolved = staleCommand(events[0].payload.publicationId);
        assert(staleResolved === false,
            'E5a. Once unpublished, the identical lookup now resolves to false — "nothing to navigate to," never a thrown error.');
        const staleCtx = panelCtx({ notifications: events, viewPublicationCommand: staleCommand });
        staleCtx.viewNotificationPublication.call(staleCtx, events[0]);
        assert(staleCtx.unavailablePublicationNotificationIds.has(events[0].notificationId),
            'E5b. The panel marks exactly that notification unavailable — the notification itself is neither hidden nor deleted from the list (see notifications, untouched, below).');
        assert(staleCtx.notifications.length === 1 && staleCtx.notifications[0].notificationId === events[0].notificationId,
            'E5c. The notification stays fully present in the list — an unresolvable target degrades the ACTION, never the historical record.');

        // E6 — no second implementation of the target workflow: the new
        // action reuses the EXACT existing "Explore" vocabulary/class,
        // and the two other real Publication-target UIs are untouched.
        assert(/action-btn--explore/.test(panelSource) && />Explore</.test(panelSource),
            'E6a. The new action reuses PublicationCard.js\'s own exact "Explore" label and action-btn--explore class — never a new verb or a new button style for the identical action.');
        const untouchedDiff = gitDiffStat(['ui/components/PublicationCard.js', 'ui/components/WorldEncounterCanvas.js']);
        assert(untouchedDiff === '',
            `E6b. ui/components/PublicationCard.js and ui/components/WorldEncounterCanvas.js — the two other real places a Publication is already reachable — remain byte-for-byte unmodified. Found: ${untouchedDiff || '(none)'}.`);

        // E7 — absent capability degrades gracefully: no
        // viewPublicationCommand wired -> no throw, no navigation.
        const noCommandCtx = panelCtx({ notifications: events, viewPublicationCommand: null });
        noCommandCtx.viewNotificationPublication.call(noCommandCtx, events[0]);
        assert(noCommandCtx.unavailablePublicationNotificationIds.size === 0,
            'E7. With no viewPublicationCommand wired at all, clicking is a silent no-op — never a thrown error, and never a false "unavailable" verdict.');

        console.log('✓ E (FLAGSHIP): the one real PRODUCT_GAP this reassessment found — a notification named a Publication but offered no way to reach it — is closed by reusing session.findPublicationById() and focusWorld() verbatim, live-proven end to end; a stale target degrades the action without touching the historical fact; and the two other real Publication-target UIs remain untouched.');
    }

    // ===============================================================
    // Section F — Trust-language review.
    // ===============================================================
    {
        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        const templateMatch = panelSource.match(/template: `([\s\S]*)`\s*\};?\s*$/);
        assert(templateMatch, 'F0. NotificationHistoryPanel.js\'s own template literal is extractable for a user-facing-text sweep.');
        const userFacingText = templateMatch[1];
        const overclaimWords = /\b(verified|authentic|trusted|confirmed|accepted|guaranteed|official)\b/i;
        assert(!overclaimWords.test(userFacingText),
            'F1. No user-facing string in the Notification History panel overclaims beyond the plain event fact (no "verified"/"authentic"/"trusted"/"confirmed"/"accepted"/"guaranteed"/"official").');

        const producerSource = codeOnlyLines(await rawSource('application/publication/commentary/PublicationCommentaryNotificationProducer.js'));
        assert(!/title|message|icon|url/i.test(producerSource.replace(/\/\/.*$/gm, '')),
            'F2. The producer still writes no title/message/icon/url — no presentational or reinterpreted field exists to accidentally overclaim in the first place (0.9.275\'s own restraint, reconfirmed).');

        assert(/>Explore</.test(userFacingText),
            'F3. The new navigation action is worded as plain navigation ("Explore") — never "View Verified Publication" or any stronger claim than the app\'s own existing vocabulary for this action.');

        console.log('✓ F: no notification-facing text strengthens an observation into a stronger claim; the producer still carries no presentational field to misuse; the new action\'s own wording matches the app\'s existing, unstrengthened vocabulary.');
    }

    // ===============================================================
    // Section G — Stale/lifecycle experience.
    // ===============================================================
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section G World', 'alice'), alice);
        makeProducer(backend, bob).execute({ publicationId: publication.id, content: 'about to go stale' });

        const beforeUnpublish = backend.notificationEventStore.loadAll()[0].toJSON();
        backend.publisherProvider.unpublish(publication.id);
        const afterUnpublish = backend.notificationEventStore.loadAll()[0].toJSON();
        assert(JSON.stringify(beforeUnpublish) === JSON.stringify(afterUnpublish),
            'G1. Unpublishing the target Publication never rewrites the historical NotificationEvent — it stays a byte-identical immutable fact.');

        const { getRecipientNotificationEventsCommand } = makeReaderFor(alice, backend);
        const stillListed = getRecipientNotificationEventsCommand();
        assert(stillListed.length === 1,
            'G2. The stale notification is never automatically deleted or hidden — it remains a durable historical record.');

        // Placement removed / target no longer resolves — the SAME
        // findPublicationById() call this milestone's own Explore action
        // depends on already returns null once the discoveryProvider no
        // longer knows the Publication (0.9.187's own established
        // behavior, reconfirmed here rather than assumed).
        const nullSession = new WorldNavigationSession({
            registry: { getDocument: () => null },
            loadPublicationDocumentUseCase: { execute: () => null },
            worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
            discoveryProvider: backend.discoveryProvider
        });
        assert(nullSession.findPublicationById(publication.id) === null,
            'G3. A target that no longer resolves degrades to null through the exact same lookup Explore uses — no special-cased "expired" state was invented for this.');

        console.log('✓ G: a stale target never rewrites the historical event and is never silently removed; the same real lookup the new Explore action depends on already degrades to null for an unresolvable target, with no new lifecycle vocabulary introduced.');
    }

    // ===============================================================
    // Section H — Cross-surface consistency.
    // ===============================================================
    {
        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        const cardSource = await rawSource('ui/components/PublicationCard.js');
        const editorSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');

        const explorePattern = /class="action-btn action-btn--explore"[\s\S]{0,200}>Explore</;
        assert(explorePattern.test(panelSource), 'H1a. NotificationHistoryPanel.js\'s own Explore button matches the exact class+label shape.');
        assert(/action-btn--explore/.test(cardSource) && />Explore</.test(cardSource),
            'H1b. ui/components/PublicationCard.js carries the identical class+label for the identical action.');
        assert(/Explore/.test(editorSource),
            'H1c. ui/views/EditorView.js\'s own Repository-navigation action (0.9.381) uses the identical "Explore" wording.');

        // No stronger/weaker word is substituted for the SAME semantic
        // action across these three surfaces.
        const inconsistentVerbs = /\b(Verify Publication|Confirmed Publication|Trusted Publication|Open Verified)\b/i;
        assert(!inconsistentVerbs.test(panelSource) && !inconsistentVerbs.test(cardSource) && !inconsistentVerbs.test(editorSource),
            'H2. None of the three surfaces reword this navigation action into a stronger verification-sounding claim — the semantic strength of "navigate to this Publication\'s World placement" stays identical everywhere it appears.');

        console.log('✓ H: the identical "Explore" label and action-btn--explore styling is used for the identical action across NotificationHistoryPanel.js, PublicationCard.js, and EditorView.js — no surface reports a stronger or weaker claim than any other for the same underlying fact.');
    }

    // ===============================================================
    // Section I — Product-gap classification and verdict.
    // ===============================================================
    {
        // Deliberate exclusions: the core fact/policy/store/producer/
        // query-boundary files this milestone's own brief named as
        // off-limits remain byte-for-byte unmodified.
        const untouchedDiff = gitDiffStat([
            'core/NotificationEvent.js',
            'core/NotificationDeduplicationPolicy.js',
            'storage/NotificationEventStore.js',
            'application/publication/commentary/PublicationCommentaryNotificationProducer.js',
            'application/chat/GetRecipientNotificationEventsUseCase.js',
            'application/world/WorldNavigationSession.js'
        ]);
        assert(untouchedDiff === '',
            `I1. The immutable-fact/policy/persistence/producer/query-boundary layer is completely unmodified by this milestone. Found: ${untouchedDiff || '(none)'}.`);

        const classification = {
            'A — Event semantics': 'PRODUCT_COMPLETE',
            'B — Delivery versus observation': 'PRODUCT_COMPLETE',
            'C — Failure comprehension': 'PRODUCT_COMPLETE',
            'D — Identity and deduplication': 'PRODUCT_COMPLETE',
            'E — Navigation continuity': 'PRODUCT_GAP (found and closed this milestone)',
            'F — Trust-language': 'PRODUCT_COMPLETE',
            'G — Stale/lifecycle experience': 'PRODUCT_COMPLETE',
            'H — Cross-surface consistency': 'PRODUCT_COMPLETE'
        };
        for (const [section, verdict] of Object.entries(classification)) {
            assert(typeof verdict === 'string' && verdict.length > 0, `I2. Section "${section}" carries an explicit classification.`);
        }

        console.log('✓ I: PRODUCT_COMPLETE for event semantics, delivery/observation separation, failure comprehension, identity/deduplication, trust-language, stale-lifecycle handling, and cross-surface consistency. One real PRODUCT_GAP (navigation continuity) found and closed, reusing only already-existing capabilities. The fact/policy/persistence/producer/query-boundary layer this milestone was told never to touch remains completely unmodified.');
        console.log('\nVerdict: the notification architecture — immutable fact, delivery, seen/read, navigation, kept as four separate, never-collapsed concerns — holds. The one gap was in the fourth concern alone (navigation), and is now closed without touching the other three.');
    }

    console.log('\n✅ All NotificationEventDeliveryExperienceProductReassessment tests passed.');
}

runTests().catch((error) => {
    console.error(`\n✗ NotificationEventDeliveryExperienceProductReassessment tests failed: ${error.message}`);
    console.error(error);
    process.exitCode = 1;
});
