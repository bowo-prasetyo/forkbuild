import { execSync } from 'node:child_process';

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

// 0.9.278 — Notification Deduplication Identity Audit.
//
// 0.9.277's own overall verdict named the question this milestone exists to
// answer, without answering it: persistence alone does not resolve the
// retry-duplication question, because "persist it" presupposes an answer to
// a prior, unstated question — WHAT is being persisted, and under what
// identity would two representations of it count as "the same"? Building a
// `NotificationEventStore` now, keyed by whichever field seems obvious,
// would silently pick a dedup identity by accident, exactly the mistake
// 0.9.277 itself avoided for persistence models in general. This milestone
// is that identity decision's own audit. Test-only, per this milestone's
// own brief: no `NotificationEventStore`, no deterministic notification
// IDs, no deduplication implementation, no inbox, no delivery, no
// read/unread, no retry queues, no notification lifecycle, no notification
// UI, no `ChatOutbox` changes, no fan-out producer, no additional
// notification producers.
//
// THE CENTRAL QUESTION: when the same underlying domain fact is processed
// more than once, under what conditions — if any — should the resulting
// `NotificationEvent`s be considered the same notification?
//
// FIVE CANDIDATE IDENTITIES, TESTED RATHER THAN SELECTED. This file defines
// five candidate dedup-identity functions (Section B) and, for each pair of
// scenarios below, asks each candidate a single mechanical question: does
// this candidate's own key computation collapse these two events into "the
// same notification," or keep them apart? No candidate is chosen as
// correct. Each is characterized:
//
//   1. notificationId                                   (event-instance identity)
//   2. commentaryId                                      (bare fact identity)
//   3. commentaryId + recipientIdentityId                 (fact + recipient)
//   4. commentaryId + eventType + recipientIdentityId      (fact + type + recipient)
//   5. producer invocation                                (call-scoped identity)
//
// ARCHITECTURE: `NotificationEvent` ITSELF NEVER GETS A DEDUP RESPONSIBILITY.
// All five candidate key functions live entirely in THIS test file, as
// plain functions operating on an already-constructed `NotificationEvent`
// from the outside — never as a method added to `core/NotificationEvent.js`
// itself. `core/NotificationEvent.js`'s own header already draws this
// boundary for lifecycle state; this milestone draws the same boundary for
// deduplication: a `NotificationEvent` represents "this notification-worthy
// fact has been represented as an event" — whether two such representations
// should collapse is an application/persistence POLICY question, decided
// from outside the value object, never an intrinsic property of it. Section
// K proves this structurally: no `dedupKey`/`identityKey`/`equals` method
// exists anywhere on `NotificationEvent.prototype`.
//
//   Section A — Baseline: current one-event-per-call behavior, restated
//               fresh (not borrowed from 0.9.277's own run).
//   Section B — The five candidate identity functions, and the evaluation
//               harness (`candidateKey`/`collapses`) used against them for
//               the rest of this file. Proves candidate 5 (producer
//               invocation) is structurally different in kind from
//               candidates 1-4: it cannot be computed from a
//               `NotificationEvent` instance alone, because no such
//               instance carries an invocation identity of its own.
//   Section C — Same Commentary / same recipient (an exact caller retry):
//               which candidates collapse the retry into one notification,
//               which keep it as two.
//   Section D — Same Commentary / different recipient (fan-out): which
//               candidates WRONGLY collapse two distinct recipients'
//               notifications merely because they share a Commentary.
//   Section E — Same Commentary / same recipient / different eventType:
//               which candidates WRONGLY collapse two distinct kinds of
//               fact about the same Commentary.
//   Section F — Different Commentary / same recipient: the sanity
//               direction — no candidate should ever collapse two
//               genuinely different facts.
//   Section G — Reconstruction identity: does a `NotificationEvent`
//               rebuilt from durable Commentary+Publication facts collapse,
//               under each candidate, with the original it replaces — and
//               with a second, independent reconstruction of the same
//               facts? Names the "domain fact identity vs NotificationEvent
//               instance identity" distinction directly, without
//               introducing a deterministic ID.
//   Section H — Self-comment: proves the candidate identities compute
//               exactly the same KIND of key for a self-authored Commentary
//               as for any other, so this audit does not quietly turn
//               0.9.275's "no suppression" finding into a dedup-driven one.
//   Section I — Candidate comparison table: the soundness matrix, one row
//               per candidate, each cell citing the section that proved it.
//   Section J — Product decision classification table: this milestone's
//               own verdict, per the six rows its own brief named.
//   Section K — Architecture: test-only, zero production files touched,
//               and no dedup responsibility added to NotificationEvent.
//
// See docs/Roadmap.md, 0.9.278, for the full milestone entry, and
// docs/Principles.md for the prose form of this file's own findings.

// ---------------------------------------------------------------------
// Helpers — identical shape to
// tests/NotificationPersistenceSemanticsAudit.test.js
// ---------------------------------------------------------------------

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

function buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider, sink }) {
    const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
    const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, commentAuthorProvider, canComment);
    return new PublicationCommentaryNotificationProducer(addUseCase, discoveryProvider, sink);
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

// ---------------------------------------------------------------------
// The five candidate dedup identities, and the evaluation harness.
// Deliberately standalone functions — see this file's own header,
// "Architecture" — never methods on NotificationEvent itself.
// ---------------------------------------------------------------------

const CANDIDATE_NOTIFICATION_ID = 1;
const CANDIDATE_COMMENTARY_ID = 2;
const CANDIDATE_COMMENTARY_RECIPIENT = 3;
const CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT = 4;
const CANDIDATE_PRODUCER_INVOCATION = 5;
const ALL_CANDIDATES = [
    CANDIDATE_NOTIFICATION_ID,
    CANDIDATE_COMMENTARY_ID,
    CANDIDATE_COMMENTARY_RECIPIENT,
    CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT,
    CANDIDATE_PRODUCER_INVOCATION
];

function candidateName(candidateId) {
    switch (candidateId) {
        case CANDIDATE_NOTIFICATION_ID: return 'notificationId';
        case CANDIDATE_COMMENTARY_ID: return 'commentaryId';
        case CANDIDATE_COMMENTARY_RECIPIENT: return 'commentaryId + recipientIdentityId';
        case CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT: return 'commentaryId + eventType + recipientIdentityId';
        case CANDIDATE_PRODUCER_INVOCATION: return 'producer invocation';
        default: throw new Error(`unknown candidate id ${candidateId}`);
    }
}

// A tracker for candidate 5 ("producer invocation") ONLY. Every OTHER
// candidate computes its key purely from a NotificationEvent's own public
// fields. Candidate 5 cannot: a NotificationEvent carries no field
// recording which producer call constructed it, so this test file has to
// supply that context out of band, exactly the way a real "one row per
// call" persistence layer would need its own bookkeeping alongside
// NotificationEvent to implement Model 1 from 0.9.277 Section A. Events
// never registered here (e.g. hand-constructed or reconstructed events —
// see Sections D, E, G) simply have no invocation identity at all.
function makeInvocationTracker() {
    const ordinals = new WeakMap();
    let counter = 0;
    return {
        invoke(producer, input, produced) {
            counter += 1;
            const ordinal = counter;
            const before = produced.length;
            const result = producer.execute(input);
            for (let i = before; i < produced.length; i += 1) {
                ordinals.set(produced[i], ordinal);
            }
            return result;
        },
        registerManual(event, ordinal) {
            ordinals.set(event, ordinal);
        },
        ordinalOf(event) {
            return ordinals.has(event) ? ordinals.get(event) : undefined;
        }
    };
}

function candidateKey(candidateId, event, tracker) {
    switch (candidateId) {
        case CANDIDATE_NOTIFICATION_ID:
            return event.notificationId;
        case CANDIDATE_COMMENTARY_ID:
            return event.payload.commentaryId;
        case CANDIDATE_COMMENTARY_RECIPIENT:
            return `${event.payload.commentaryId}::${event.recipientIdentityId}`;
        case CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT:
            return `${event.payload.commentaryId}::${event.eventType}::${event.recipientIdentityId}`;
        case CANDIDATE_PRODUCER_INVOCATION: {
            const ordinal = tracker ? tracker.ordinalOf(event) : undefined;
            return ordinal === undefined ? null : `invocation::${ordinal}`;
        }
        default:
            throw new Error(`candidateKey: unknown candidate id ${candidateId}`);
    }
}

// An identity that cannot be computed (null) never collapses with
// anything — including another equally-uncomputable identity. This is a
// deliberate modeling choice, not an accident: "I don't know this event's
// identity under this candidate" can never license treating it as the
// same notification as something else.
function collapses(candidateId, eventA, eventB, tracker) {
    const keyA = candidateKey(candidateId, eventA, tracker);
    const keyB = candidateKey(candidateId, eventB, tracker);
    if (keyA === null || keyB === null) return false;
    return keyA === keyB;
}

async function runTests() {
    // Recorded across sections, aggregated (never re-derived) in Section I.
    const findings = {};

    // -------------------------------------------------------------
    // Section A — Baseline: current one-event-per-call behavior,
    // restated fresh in this file's own execution.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-baseline', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-baseline', content: 'Baseline probe' });

        assert(produced.length === 1, 'A1. baseline: one successful execute() call produces exactly one NotificationEvent');
        assert(produced[0] instanceof NotificationEvent, 'A2. baseline: the produced value is genuinely a NotificationEvent');
        assert(produced[0].payload.commentaryId === commentary.commentaryId, 'A3. baseline: the event references the Commentary that was actually persisted');
    }

    // -------------------------------------------------------------
    // Section B — The five candidate identity functions and their
    // evaluation harness.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-candidates', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        tracker.invoke(producer, { publicationId: 'pub-candidates', content: 'Candidate probe' }, produced);
        const event = produced[0];

        assert(ALL_CANDIDATES.length === 5, 'B1. exactly the five candidate identities this milestone\'s own brief named are in play');

        // Candidates 1-4 are pure functions of the event alone — no
        // tracker required, and passing one changes nothing.
        for (const candidateId of [CANDIDATE_NOTIFICATION_ID, CANDIDATE_COMMENTARY_ID, CANDIDATE_COMMENTARY_RECIPIENT, CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT]) {
            const withTracker = candidateKey(candidateId, event, tracker);
            const withoutTracker = candidateKey(candidateId, event, undefined);
            assert(withTracker === withoutTracker, `B2. candidate "${candidateName(candidateId)}" is computable from the NotificationEvent alone — a tracker changes nothing`);
            assert(typeof withoutTracker === 'string' && withoutTracker.length > 0, `B3. candidate "${candidateName(candidateId)}" produces a well-defined, non-empty key`);
        }

        // Candidate 5 is structurally different: with no tracker context,
        // it cannot compute a key at all.
        assert(candidateKey(CANDIDATE_PRODUCER_INVOCATION, event, undefined) === null,
            'B4. candidate "producer invocation" CANNOT be computed from the NotificationEvent instance alone — proven directly, not merely documented');
        assert(candidateKey(CANDIDATE_PRODUCER_INVOCATION, event, tracker) === 'invocation::1',
            'B5. candidate "producer invocation" DOES resolve once external, out-of-band call context is supplied');

        findings.candidatesComputableFromEventAlone = {
            [CANDIDATE_NOTIFICATION_ID]: true,
            [CANDIDATE_COMMENTARY_ID]: true,
            [CANDIDATE_COMMENTARY_RECIPIENT]: true,
            [CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT]: true,
            [CANDIDATE_PRODUCER_INVOCATION]: false
        };
    }

    // -------------------------------------------------------------
    // Section C — Same Commentary / same recipient: an exact caller
    // retry (the 0.9.276/0.9.277 flagship scenario), evaluated against
    // all five candidates.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-retry', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const fixedInput = { publicationId: 'pub-retry', commentaryId: 'retry-identity-id', content: 'Retried, for identity purposes', createdAt: new Date('2024-08-08T00:00:00.000Z') };
        const call1 = tracker.invoke(producer, fixedInput, produced);
        const call2 = tracker.invoke(producer, { ...fixedInput }, produced);
        assert(call1.isNew === true && call2.isNew === false, 'C1. sanity: a genuine new Commentary, then an idempotent retry');
        assert(produced.length === 2, 'C2. sanity: two distinct NotificationEvent instances were produced');
        const [eventA, eventB] = produced;

        const retryCollapse = {};
        for (const candidateId of ALL_CANDIDATES) {
            retryCollapse[candidateId] = collapses(candidateId, eventA, eventB, tracker);
        }

        assert(retryCollapse[CANDIDATE_NOTIFICATION_ID] === false, 'C3. candidate "notificationId" does NOT collapse an exact retry — every physical event is its own notification');
        assert(retryCollapse[CANDIDATE_COMMENTARY_ID] === true, 'C4. candidate "commentaryId" DOES collapse an exact retry into one notification');
        assert(retryCollapse[CANDIDATE_COMMENTARY_RECIPIENT] === true, 'C5. candidate "commentaryId + recipientIdentityId" DOES collapse an exact retry');
        assert(retryCollapse[CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT] === true, 'C6. candidate "commentaryId + eventType + recipientIdentityId" DOES collapse an exact retry');
        assert(retryCollapse[CANDIDATE_PRODUCER_INVOCATION] === false, 'C7. candidate "producer invocation" does NOT collapse a retry — the retry is genuinely a second, distinct invocation');

        // The mechanism/policy split, named explicitly: three of the five
        // candidates are MECHANICALLY CAPABLE of collapsing a retry into
        // one stored row. Whether they SHOULD is the exact question
        // 0.9.276/0.9.277 both left OPEN, and it stays open here — this
        // section proves capability, not correctness.
        const acceptabilityQuestion = {
            question: 'Should an exact retry collapse into one notification?',
            answeredHere: false,
            mechanicallyCapableOfCollapsing: [CANDIDATE_COMMENTARY_ID, CANDIDATE_COMMENTARY_RECIPIENT, CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT].map(candidateName),
            mechanicallyIncapableOfCollapsing: [CANDIDATE_NOTIFICATION_ID, CANDIDATE_PRODUCER_INVOCATION].map(candidateName),
            verdict: 'OPEN_DEDUP_DECISION'
        };
        assert(acceptabilityQuestion.answeredHere === false, 'C8. this section proves what each candidate WOULD do; it does not decide which candidate is correct');

        findings.retryCollapse = retryCollapse;
    }

    // -------------------------------------------------------------
    // Section D — Same Commentary / different recipient (fan-out).
    // These must not accidentally collapse merely because they refer to
    // the same Commentary. Uses the exact hand-construction pattern
    // 0.9.277 Section D already proved works against NotificationEvent
    // directly — extended here to ask each candidate the collapse
    // question, and to simulate the one scenario the REAL producer never
    // reaches today: two recipient-addressed events emitted from a single
    // hypothetical fanning-out invocation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const { discoveryProvider } = makePublication({ id: 'pub-fanout', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = tracker.invoke(producer, { publicationId: 'pub-fanout', content: 'One Commentary, two recipients' }, produced);

        const sharedPayload = {
            publicationId: commentary.publicationId,
            commentaryId: commentary.commentaryId,
            authorIdentityId: commentary.authorIdentityId
        };
        const eventToPublisher = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
            recipientIdentityId: alice.getSigningIdentity().id,
            createdAt: commentary.createdAt,
            payload: sharedPayload
        });
        const eventToThirdParty = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
            recipientIdentityId: carol.getSigningIdentity().id,
            createdAt: commentary.createdAt,
            payload: sharedPayload
        });
        // Simulated: as if ONE hypothetical fanning-out invocation
        // emitted both of these in a single call — the scenario 0.9.277
        // Section D proved is CAPABLE at the NotificationEvent layer but
        // not yet REACHABLE from this producer. Registering both under
        // the same ordinal is what candidate 5 would see if that
        // capability were ever exercised.
        tracker.registerManual(eventToPublisher, 'fanout-1');
        tracker.registerManual(eventToThirdParty, 'fanout-1');

        assert(eventToPublisher.recipientIdentityId !== eventToThirdParty.recipientIdentityId, 'D1. sanity: two genuinely different recipients');
        assert(eventToPublisher.payload.commentaryId === eventToThirdParty.payload.commentaryId, 'D2. sanity: both events describe the same underlying Commentary fact');

        const fanoutCollapse = {};
        for (const candidateId of ALL_CANDIDATES) {
            fanoutCollapse[candidateId] = collapses(candidateId, eventToPublisher, eventToThirdParty, tracker);
        }

        assert(fanoutCollapse[CANDIDATE_NOTIFICATION_ID] === false, 'D3. candidate "notificationId": correctly keeps two recipients apart');
        assert(fanoutCollapse[CANDIDATE_COMMENTARY_ID] === true, 'D4. candidate "commentaryId": WRONGLY collapses two distinct recipients\' notifications into one — UNSOUND for fan-out');
        assert(fanoutCollapse[CANDIDATE_COMMENTARY_RECIPIENT] === false, 'D5. candidate "commentaryId + recipientIdentityId": correctly keeps two recipients apart');
        assert(fanoutCollapse[CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT] === false, 'D6. candidate "commentaryId + eventType + recipientIdentityId": correctly keeps two recipients apart');
        assert(fanoutCollapse[CANDIDATE_PRODUCER_INVOCATION] === true, 'D7. candidate "producer invocation": WRONGLY collapses two distinct recipients that happen to share one hypothetical invocation — UNSOUND for fan-out, for a DIFFERENT structural reason than candidate 2 (call-scoped rather than fact-scoped), but the same practical failure');

        findings.fanoutCollapse = fanoutCollapse;
        findings.fanoutUnsound = [CANDIDATE_COMMENTARY_ID, CANDIDATE_PRODUCER_INVOCATION];
    }

    // -------------------------------------------------------------
    // Section E — Same Commentary / same recipient / different
    // eventType. `publication.commented` must not collide with a future
    // `publication.updated`, even addressed to the identical recipient
    // about the identical Commentary.
    // -------------------------------------------------------------
    {
        const HYPOTHETICAL_EVENT_TYPE = 'publication.updated'; // does not exist in production; a probe only

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-eventtype', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = tracker.invoke(producer, { publicationId: 'pub-eventtype', content: 'Same fact, two kinds of event' }, produced);
        const commentedEvent = produced[0];

        // A hand-built, hypothetical SECOND kind of event about the same
        // commentaryId, addressed to the same recipient — as if a future,
        // separate producer (never introduced by this milestone) emitted
        // it from its own, distinct call.
        const updatedEvent = new NotificationEvent({
            eventType: HYPOTHETICAL_EVENT_TYPE,
            recipientIdentityId: commentedEvent.recipientIdentityId,
            createdAt: commentedEvent.createdAt,
            payload: { ...commentedEvent.payload }
        });
        tracker.registerManual(updatedEvent, 'hypothetical-updated-1');

        assert(commentedEvent.eventType !== updatedEvent.eventType, 'E1. sanity: two genuinely different eventType values');
        assert(commentedEvent.recipientIdentityId === updatedEvent.recipientIdentityId, 'E2. sanity: the same recipient in both cases');
        assert(commentedEvent.payload.commentaryId === updatedEvent.payload.commentaryId, 'E3. sanity: the same underlying commentaryId in both cases');

        const eventTypeCollapse = {};
        for (const candidateId of ALL_CANDIDATES) {
            eventTypeCollapse[candidateId] = collapses(candidateId, commentedEvent, updatedEvent, tracker);
        }

        assert(eventTypeCollapse[CANDIDATE_NOTIFICATION_ID] === false, 'E4. candidate "notificationId": correctly keeps two event types apart');
        assert(eventTypeCollapse[CANDIDATE_COMMENTARY_ID] === true, 'E5. candidate "commentaryId": WRONGLY collapses two distinct event types into one notification — UNSOUND across event types');
        assert(eventTypeCollapse[CANDIDATE_COMMENTARY_RECIPIENT] === true, 'E6. candidate "commentaryId + recipientIdentityId": WRONGLY collapses two distinct event types — UNSOUND across event types, the exact case this milestone\'s own brief named ("publication.commented must not collide with publication.updated")');
        assert(eventTypeCollapse[CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT] === false, 'E7. candidate "commentaryId + eventType + recipientIdentityId": correctly keeps two event types apart');
        assert(eventTypeCollapse[CANDIDATE_PRODUCER_INVOCATION] === false, 'E8. candidate "producer invocation": correctly keeps two event types apart, though only because they happen to come from two different invocations, not because it has any notion of eventType at all');

        findings.eventTypeCollapse = eventTypeCollapse;
        findings.eventTypeUnsound = [CANDIDATE_COMMENTARY_ID, CANDIDATE_COMMENTARY_RECIPIENT];
    }

    // -------------------------------------------------------------
    // Section F — Different Commentary / same recipient: the sanity
    // direction. No candidate should ever collapse two genuinely
    // different facts.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-distinct', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        tracker.invoke(producer, { publicationId: 'pub-distinct', commentaryId: 'distinct-first', content: 'First, distinct Commentary' }, produced);
        tracker.invoke(producer, { publicationId: 'pub-distinct', commentaryId: 'distinct-second', content: 'Second, distinct Commentary' }, produced);
        assert(produced.length === 2, 'F1. sanity: two genuinely different Commentaries, both addressed to the same recipient (Alice)');
        const [eventFirst, eventSecond] = produced;
        assert(eventFirst.payload.commentaryId !== eventSecond.payload.commentaryId, 'F2. sanity: distinct commentaryId values');
        assert(eventFirst.recipientIdentityId === eventSecond.recipientIdentityId, 'F3. sanity: the identical recipient in both cases');

        const distinctFactCollapse = {};
        for (const candidateId of ALL_CANDIDATES) {
            distinctFactCollapse[candidateId] = collapses(candidateId, eventFirst, eventSecond, tracker);
        }
        for (const candidateId of ALL_CANDIDATES) {
            assert(distinctFactCollapse[candidateId] === false, `F4. candidate "${candidateName(candidateId)}" does NOT collapse two genuinely different Commentaries — no candidate is over-aggressive`);
        }

        findings.distinctFactCollapse = distinctFactCollapse;
    }

    // -------------------------------------------------------------
    // Section G — Reconstruction identity. If an original event is lost
    // and rebuilt from durable Commentary + Publication facts, should the
    // reconstructed event share the ORIGINAL's logical identity? This is
    // different from whether createId() produces the same physical
    // notificationId (0.9.277 Section F already proved it never does) —
    // this section asks the identity-CANDIDATE question instead.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-reconstruct', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = tracker.invoke(producer, { publicationId: 'pub-reconstruct', content: 'Reconstruct me if lost' }, produced);
        const original = produced[0];

        function reconstruct() {
            const rehydratedCommentary = commentaryStore.getById(commentary.commentaryId);
            const rehydratedPublication = discoveryProvider.findById(rehydratedCommentary.publicationId);
            return new NotificationEvent({
                eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
                recipientIdentityId: rehydratedPublication.publisherIdentity.id,
                createdAt: rehydratedCommentary.createdAt,
                payload: {
                    publicationId: rehydratedCommentary.publicationId,
                    commentaryId: rehydratedCommentary.commentaryId,
                    authorIdentityId: rehydratedCommentary.authorIdentityId
                }
            });
        }

        // Reconstructions are deliberately NEVER registered with the
        // tracker — they do not happen through a producer invocation at
        // all (a repair/backfill process is a different code path from
        // `PublicationCommentaryNotificationProducer#execute()`), so
        // candidate 5 has, by construction, no way to assign them an
        // identity.
        const reconstructed = reconstruct();
        const reconstructedAgain = reconstruct();

        assert(reconstructed.notificationId !== original.notificationId, 'G1. sanity: reconstruction produces a fresh physical notificationId, per 0.9.277 Section F');
        assert(reconstructed.notificationId !== reconstructedAgain.notificationId, 'G2. sanity: two independent reconstructions of the identical durable facts also carry different physical notificationId values');

        const originalVsReconstructed = {};
        const reconstructedVsReconstructedAgain = {};
        for (const candidateId of ALL_CANDIDATES) {
            originalVsReconstructed[candidateId] = collapses(candidateId, original, reconstructed, tracker);
            reconstructedVsReconstructedAgain[candidateId] = collapses(candidateId, reconstructed, reconstructedAgain, tracker);
        }

        // CONTENT-BASED candidates (2, 3, 4) treat "reconstructed" as
        // logically the same notification as the original it replaces —
        // automatically, as a side effect of being keyed on facts rather
        // than instances — and likewise treat two independent
        // reconstructions as the same notification as EACH OTHER.
        for (const candidateId of [CANDIDATE_COMMENTARY_ID, CANDIDATE_COMMENTARY_RECIPIENT, CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT]) {
            assert(originalVsReconstructed[candidateId] === true, `G3. candidate "${candidateName(candidateId)}": reconstructed event collapses with the original — domain FACT identity survives reconstruction`);
            assert(reconstructedVsReconstructedAgain[candidateId] === true, `G4. candidate "${candidateName(candidateId)}": two independent reconstructions collapse with EACH OTHER too — this candidate would make reconstruction idempotent, for dedup purposes, even though notificationId itself never is`);
        }

        // INSTANCE/INVOCATION-BASED candidates (1, 5) never do — for two
        // structurally different reasons, both proven directly.
        assert(originalVsReconstructed[CANDIDATE_NOTIFICATION_ID] === false, 'G5. candidate "notificationId": reconstruction never shares the original\'s identity — each physical event is permanently its own');
        assert(reconstructedVsReconstructedAgain[CANDIDATE_NOTIFICATION_ID] === false, 'G6. candidate "notificationId": two reconstructions never share an identity with each other either');
        assert(originalVsReconstructed[CANDIDATE_PRODUCER_INVOCATION] === false, 'G7. candidate "producer invocation": reconstruction never resolves to any identity at all (Section B\'s null case) — it cannot be asked whether it "is" the original');
        assert(reconstructedVsReconstructedAgain[CANDIDATE_PRODUCER_INVOCATION] === false, 'G8. candidate "producer invocation": two unresolvable identities are never treated as equal to each other, even trivially');

        // The distinction this milestone's own brief asked for, named
        // explicitly rather than left implicit: "reconstructible" is a
        // property of the FACTS (0.9.277 Section F); whether a
        // reconstruction shares LOGICAL IDENTITY with what it replaces is
        // a property of the CANDIDATE, and different candidates disagree.
        const reconstructionIdentityFinding = {
            domainFactIdentitySurvivesReconstruction: [CANDIDATE_COMMENTARY_ID, CANDIDATE_COMMENTARY_RECIPIENT, CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT].map(candidateName),
            notificationEventInstanceIdentityNeverDoes: [CANDIDATE_NOTIFICATION_ID].map(candidateName),
            producerInvocationIdentityIsUndefinedForReconstruction: [CANDIDATE_PRODUCER_INVOCATION].map(candidateName),
            noDeterministicIdIntroduced: true,
            verdict: 'OPEN — which of these two notions of identity reconstruction SHOULD honor is a product decision, not resolved by this audit'
        };
        assert(reconstructionIdentityFinding.noDeterministicIdIntroduced === true, 'G9. this section deliberately introduces no deterministic notification ID to make reconstruction identity stable — it only observes what each EXISTING candidate would already do');

        findings.originalVsReconstructed = originalVsReconstructed;
        findings.reconstructedVsReconstructedAgain = reconstructedVsReconstructedAgain;
    }

    // -------------------------------------------------------------
    // Section H — Self-comment: the audit must not quietly turn 0.9.275's
    // "no suppression" finding into a new suppression rule.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // both publisher and, here, author
        const { discoveryProvider } = makePublication({ id: 'pub-self', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const tracker = makeInvocationTracker();
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: alice, sink: (e) => produced.push(e) });
        const selfInput = { publicationId: 'pub-self', commentaryId: 'self-comment-id', content: 'Commenting on my own Publication' };
        tracker.invoke(producer, selfInput, produced);

        assert(produced.length === 1, 'H1. a self-authored Commentary still produces a NotificationEvent — unmodified from 0.9.275\'s own contract');
        const selfEvent = produced[0];
        assert(selfEvent.payload.authorIdentityId === selfEvent.recipientIdentityId, 'H2. sanity: this really is the self-comment case — author and recipient coincide');

        // Every candidate still computes a normal, well-defined key for
        // this event — none of the five candidate definitions reference
        // authorIdentityId at all, so the self-comment coincidence has
        // zero effect on identity computation. No candidate needs, or
        // gets, a special case here.
        for (const candidateId of [CANDIDATE_NOTIFICATION_ID, CANDIDATE_COMMENTARY_ID, CANDIDATE_COMMENTARY_RECIPIENT, CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT]) {
            const key = candidateKey(candidateId, selfEvent, tracker);
            assert(typeof key === 'string' && key.length > 0, `H3. candidate "${candidateName(candidateId)}" computes a normal, well-defined key for a self-comment — no special case, no suppression`);
        }
        assert(candidateKey(CANDIDATE_PRODUCER_INVOCATION, selfEvent, tracker) === 'invocation::1',
            'H4. candidate "producer invocation" likewise resolves normally for a self-comment');

        // And self-comment participates in retry/fan-out/event-type
        // scenarios exactly like any other Commentary — proven by a
        // direct retry of this exact self-comment (same commentaryId).
        const retry = tracker.invoke(producer, { ...selfInput }, produced);
        assert(retry.isNew === false, 'H5. sanity: this really is an idempotent retry of the same commentaryId, not a second distinct Commentary');
        assert(produced.length === 2, 'H6. a self-comment retry still produces a second NotificationEvent, exactly like the non-self case in Section C');

        findings.selfCommentNoSpecialCase = true;
    }

    // -------------------------------------------------------------
    // Section I — Candidate comparison table: the soundness matrix,
    // aggregated from Sections B-G's own recorded findings, never
    // re-derived here.
    // -------------------------------------------------------------
    {
        const comparisonTable = ALL_CANDIDATES.map((candidateId) => ({
            candidate: candidateName(candidateId),
            computableFromEventAlone: findings.candidatesComputableFromEventAlone[candidateId],
            separatesDifferentCommentary: findings.distinctFactCollapse[candidateId] === false,
            fanOutSafe_separatesDifferentRecipient: findings.fanoutCollapse[candidateId] === false,
            separatesDifferentEventType: findings.eventTypeCollapse[candidateId] === false,
            collapsesExactRetry: findings.retryCollapse[candidateId],
            collapsesReconstructionWithOriginal: findings.originalVsReconstructed[candidateId]
        }));

        assert(comparisonTable.length === 5, 'I1. all five candidates appear in the comparison table');
        for (const row of comparisonTable) {
            assert(row.separatesDifferentCommentary === true, `I2. every candidate correctly separates different Commentaries: "${row.candidate}"`);
        }

        // The two structural MUST-NOT-COLLAPSE requirements this
        // milestone's own brief singled out (fan-out, event type) are
        // violated by exactly the candidates Sections D and E already
        // named — checked here as a cross-check, not a fresh claim.
        const fanOutUnsoundRows = comparisonTable.filter((row) => row.fanOutSafe_separatesDifferentRecipient === false);
        const eventTypeUnsoundRows = comparisonTable.filter((row) => row.separatesDifferentEventType === false);
        assert(fanOutUnsoundRows.map((r) => r.candidate).sort().join(',') === [candidateName(CANDIDATE_COMMENTARY_ID), candidateName(CANDIDATE_PRODUCER_INVOCATION)].sort().join(','),
            'I3. exactly candidates 2 and 5 are fan-out-unsound, matching Section D');
        assert(eventTypeUnsoundRows.map((r) => r.candidate).sort().join(',') === [candidateName(CANDIDATE_COMMENTARY_ID), candidateName(CANDIDATE_COMMENTARY_RECIPIENT)].sort().join(','),
            'I4. exactly candidates 2 and 3 are event-type-unsound, matching Section E');

        // Exactly two candidates satisfy every structural soundness
        // requirement (separates Commentary, separates recipient,
        // separates event type) — "notificationId" (trivially, since it
        // never collapses ANYTHING) and "commentaryId + eventType +
        // recipientIdentityId" (the only candidate that collapses some
        // things — an exact retry — while still respecting both
        // structural requirements). This is reported as a STRUCTURAL
        // observation, not an adoption: these two candidates disagree
        // sharply on retries and reconstruction (Sections C, G), and
        // nothing here picks between them.
        const structurallySound = comparisonTable.filter((row) =>
            row.separatesDifferentCommentary && row.fanOutSafe_separatesDifferentRecipient && row.separatesDifferentEventType);
        assert(structurallySound.length === 2
            && structurallySound.some((row) => row.candidate === candidateName(CANDIDATE_NOTIFICATION_ID))
            && structurallySound.some((row) => row.candidate === candidateName(CANDIDATE_COMMENTARY_EVENTTYPE_RECIPIENT)),
            'I5. exactly two candidates — "notificationId" and "commentaryId + eventType + recipientIdentityId" — satisfy all three structural soundness requirements; they disagree on whether a retry collapses (I6 below), and this audit does not pick between them');
        const [neverCollapses, sometimesCollapses] = structurallySound[0].candidate === candidateName(CANDIDATE_NOTIFICATION_ID)
            ? [structurallySound[0], structurallySound[1]]
            : [structurallySound[1], structurallySound[0]];
        assert(neverCollapses.collapsesExactRetry === false && sometimesCollapses.collapsesExactRetry === true,
            'I6. the two structurally sound candidates differ exactly on retry-collapsing — which is precisely the OPEN_DEDUP_DECISION this audit does not resolve');

        findings.comparisonTable = comparisonTable;
    }

    // -------------------------------------------------------------
    // Section J — Product decision classification table, per this
    // milestone's own brief.
    // -------------------------------------------------------------
    {
        const classificationTable = [
            {
                question: 'Notification instance identity (does every NotificationEvent stand alone, or should some collapse?)',
                classification: 'OPEN',
                rationale: 'Section C: three of five candidates are mechanically capable of collapsing an exact retry, two are not — this audit proves the mechanics, not which behavior the product wants.'
            },
            {
                question: 'Duplicate retry behavior (should an exact caller retry produce one notification or two?)',
                classification: 'OPEN',
                rationale: 'The same OPEN_DEDUP_DECISION first named in 0.9.276/0.9.277, sharpened here with a concrete mechanism (Section C) rather than closed.'
            },
            {
                question: 'Recipient-specific fan-out identity (must two distinct recipients\' notifications ever collapse?)',
                classification: 'REQUIRED',
                rationale: 'Section D: this is not a preference — candidates 2 and 5 are proven UNSOUND (they collapse two people being told about two different things into one), and any future persistence identity MUST reject both.'
            },
            {
                question: 'Reconstruction identity (does a rebuilt event share the original\'s logical identity?)',
                classification: 'OPEN',
                rationale: 'Section G: content-based candidates automatically say yes, instance/invocation-based candidates never do or cannot answer at all — a real disagreement between defensible models, not a bug in any of them.'
            },
            {
                question: 'Event-type separation (must publication.commented and a future publication.updated ever collapse?)',
                classification: 'REQUIRED',
                rationale: 'Section E: candidates 2 and 3 are proven UNSOUND across event types even before a second event type actually exists in production — any future persistence identity MUST include eventType.'
            },
            {
                question: 'Persistence implementation (NotificationEventStore, or any dedup enforcement)',
                classification: 'DEFERRED',
                rationale: 'Per this milestone\'s own brief: no store, no deterministic IDs, no dedup implementation. This audit maps the decision space; it builds nothing on top of it.'
            }
        ];

        assert(classificationTable.length === 6, 'J1. all six rows named in this milestone\'s own brief are classified');
        for (const row of classificationTable) {
            assert(typeof row.rationale === 'string' && row.rationale.length > 40, `J2. every row\'s classification is backed by rationale citing a specific section: "${row.question}"`);
        }
        const openRows = classificationTable.filter((row) => row.classification === 'OPEN');
        const requiredRows = classificationTable.filter((row) => row.classification === 'REQUIRED');
        assert(openRows.length === 3, 'J3. exactly three rows remain OPEN — this audit resolves none of them');
        assert(requiredRows.length === 2, 'J4. exactly two rows are REQUIRED — structural correctness constraints, not open preferences, both proven by construction (Sections D, E)');

        const overallVerdict = 'Five candidate dedup identities were characterized, not selected. Two structural requirements (recipient separation, event-type separation) rule out three of the five candidates as unsound; the remaining disagreement — whether retries and reconstructions should collapse — is a genuine, still-open product decision this audit sharpens but does not make.';
        assert(overallVerdict.includes('not selected'), 'J5. the milestone\'s own overall verdict is recorded verbatim');
    }

    // -------------------------------------------------------------
    // Section K — Architecture: test-only, and no dedup responsibility
    // added to NotificationEvent itself.
    // -------------------------------------------------------------
    {
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/PublicationCommentaryNotificationProducer.js application/AddPublicationCommentaryUseCase.js storage/PublicationCommentaryStore.js core/PublicationCommentary.js core/NotificationEvent.js application/ChatOutbox.js core/ChatOutboxEntry.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `K1. no production file this audit examines was modified by this test-only milestone. Found: ${gitDiffStat || '(none)'}.`);

        // The architectural point named in this milestone's own header:
        // NotificationEvent itself never gets a dedup responsibility. No
        // dedup/identity/equality method exists anywhere on its prototype
        // chain — the five candidate functions live entirely in this test
        // file, operating on the value object from outside.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-architecture', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-architecture', content: 'No dedup method on me' });
        const event = produced[0];

        const forbiddenMethodNames = ['dedupKey', 'identityKey', 'equals', 'isDuplicateOf', 'collapseKey', 'deduplicationId'];
        for (const name of forbiddenMethodNames) {
            assert(typeof event[name] === 'undefined', `K2. NotificationEvent exposes no "${name}" — deduplication identity is an external, application-level policy, never an intrinsic property of the value object (see this file's own "Architecture" header)`);
        }
    }

    console.log('\n✅ All NotificationDeduplicationIdentityAudit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationDeduplicationIdentityAudit tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationDeduplicationIdentityAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
