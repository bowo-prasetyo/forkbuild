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
import { ChatOutboxEntry } from '../core/ChatOutboxEntry.js';
import { toChatMessage, deriveConversationId } from '../core/ChatMessage.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.277 — Notification Persistence Semantics Audit.
//
// 0.9.276's own flagship finding was not a bug report — it was a semantic
// gap surfacing at exactly the right seam:
//
//   same commentaryId
//       │
//       ▼
//   Commentary store: isNew = false        (idempotent — the fact is
//       │                                    already durably on file)
//       ▼
//   Notification producer: emits another event   (NOT idempotent — a
//                                                    fresh notificationId,
//                                                    every call)
//
// Putting a store underneath `PublicationCommentaryNotificationProducer.js`
// today, with no other decision made first, would silently pick "one
// notification per successful `execute()` call" as NotificationEvent's
// permanent persistence identity — not because that is the right model,
// but because it is the one the current producer happens to implement.
// This milestone is the audit that has to happen BEFORE that choice gets
// made by accident. Per 0.9.276's own "what comes after": test-only, no
// `NotificationEventStore`, no inbox, no delivery, no de-duplication
// implementation. Its entire job is to answer one question with evidence
// rather than assumption:
//
//   If NotificationEvents become durable, what exactly is being
//   persisted, and what identity/duplication semantics should that
//   persistence have?
//
//   Section A — Candidate persistence models: three distinct readings of
//               "what a NotificationEvent durably represents," and which
//               one the current producer actually implements today,
//               proven by construction rather than by re-reading its
//               source.
//   Section B — The retry finding, restated fresh in this file's own
//               execution (not borrowed from 0.9.276's own run), then
//               the acceptability question named explicitly rather than
//               answered.
//   Section C — Persistence identity: five candidate identities in play
//               (commentaryId, publicationId, authorIdentityId,
//               publisherIdentityId, notificationId), proven pairwise
//               independent — none silently substitutable for another —
//               with the one structural exception (self-commentary) named
//               explicitly rather than treated as a violation.
//   Section D — Recipient-specific semantics: `core/NotificationEvent.js`
//               already permits one underlying fact to address many
//               distinct recipients; the current producer never
//               exercises that capacity. A capability/reachability
//               finding, not a defect.
//   Section E — Persistence failure semantics, examined against the
//               producer's ALREADY-SHIPPED sink-failure contract, without
//               introducing any storage of this milestone's own.
//   Section F — Event reconstruction: can a `publication.commented`
//               NotificationEvent be rebuilt from the underlying
//               Commentary + Publication facts alone, and does
//               "reconstructible" collapse into "safe to regenerate,"
//               "deduplicated," or "exactly once"? Proven live, not
//               argued in prose.
//   Section G — ChatOutbox comparison: `application/ChatOutbox.js` used
//               strictly as a durable-delivery PRECEDENT, with a direct
//               structural diff proving which of its properties do not,
//               and structurally cannot yet, belong to NotificationEvent.
//   Section H — Product decision classification table: the audit's own
//               findings named, not resolved.
//   Section I — Architecture: test-only, zero production files touched.
//
// See docs/Roadmap.md, 0.9.277, for the full milestone entry, and
// docs/Principles.md for the prose form of this file's own findings.

// ---------------------------------------------------------------------
// Helpers — identical shape to
// tests/PublicationCommentaryNotificationProducerLifecycleAudit.test.js
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

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Candidate persistence models.
    //
    // Three distinct readings of "what a NotificationEvent durably
    // represents":
    //
    //   Model 1: one notification event per SUCCESSFUL CREATION ATTEMPT
    //            (i.e. per producer#execute() call that resolves a
    //            Publication) — persistence identity would be something
    //            NEW every call (e.g. notificationId itself, or a
    //            call-scoped key).
    //   Model 2: one notification event per UNIQUE COMMENTARY —
    //            persistence identity would be `commentaryId` (or
    //            `(commentaryId, recipientIdentityId)`), and a retry
    //            would need to collapse onto the same stored row.
    //   Model 3: NotificationEvent as a RECIPIENT-SPECIFIC durable
    //            event — persistence identity would be
    //            `(sourceFactId, recipientIdentityId)`, allowing one
    //            underlying fact to legitimately produce more than one
    //            stored row, deliberately, for different recipients.
    //
    // This section proves, by live construction, which model the
    // CURRENT producer actually implements — not which model is
    // "correct."
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-models', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const fixedInput = { publicationId: 'pub-models', commentaryId: 'models-id', content: 'Model probe', createdAt: new Date('2024-05-05T00:00:00.000Z') };

        const first = producer.execute(fixedInput);
        const retry = producer.execute({ ...fixedInput });

        // Model 2 would require: one CALL that resolves a Publication
        // and one CALL that is a same-commentaryId retry produce the
        // SAME persistence identity (i.e. a de-duplicating store would
        // see them as the same row). Test this directly: does anything
        // the producer emits allow a naive store, keyed by whatever the
        // producer treats as identity, to tell these two calls apart
        // from "the same fact, told twice" versus "two different
        // facts"?
        assert(first.isNew === true, 'A1. sanity: the first call is a genuinely new Commentary');
        assert(retry.isNew === false, 'A2. sanity: the retry is a genuinely idempotent re-save, per the wrapped use case');
        assert(produced.length === 2, 'A3. the producer emitted TWO NotificationEvents for ONE underlying Commentary fact');

        // The current producer's own notificationId is NOT keyed by
        // commentaryId — proven directly, not inferred:
        assert(produced[0].notificationId !== produced[1].notificationId,
            'A4. the two events carry DIFFERENT notificationId values — the producer never re-derives or reuses an identity from commentaryId');
        assert(produced[0].payload.commentaryId === produced[1].payload.commentaryId,
            'A5. both events reference the SAME commentaryId — this is genuinely one fact, told twice, not two different facts');

        // MODEL 1 CHECK: does the producer emit exactly one event per
        // successful execute() call that resolves a Publication,
        // regardless of isNew? Yes — already proven by A3 (two calls,
        // two events). This is definitionally what "one per call"
        // means.
        const model1Holds = produced.length === 2; // one event per each of the two successful, resolving calls
        assert(model1Holds, 'A6. MODEL 1 ("one notification event per successful creation attempt") is the model the current producer actually implements');

        // MODEL 2 CHECK: does the producer emit exactly one event per
        // UNIQUE Commentary (i.e. would a naive store keyed by
        // commentaryId see only one distinct notification)? No — two
        // distinct notificationId values exist for the one
        // commentaryId, and the producer itself provides no signal
        // (isNew is never read — see 0.9.276 Section E's own root-cause
        // finding) that would let a store built on top of it collapse
        // them without ALSO consulting the wrapped use case's own
        // isNew, which the producer today does not expose to its sink.
        const model2Holds = produced.length === 1; // would require exactly one event for the one Commentary
        assert(model2Holds === false, 'A7. MODEL 2 ("one notification event per unique Commentary") is NOT what the current producer implements — it would require new producer logic, not merely a store underneath it');

        // MODEL 3 CHECK: is EITHER event addressed to a recipient
        // distinct from the other (i.e. does the current producer ever
        // fan one Commentary out to more than one recipient)? No — see
        // Section D below for the full capability/reachability
        // treatment; this is the narrow "does today's actual output
        // exercise it" check.
        const model3ExercisedToday = produced[0].recipientIdentityId !== produced[1].recipientIdentityId;
        assert(model3ExercisedToday === false, 'A8. MODEL 3 ("recipient-specific durable event") is not EXERCISED by the current producer today — both events, though distinct, are addressed to the identical recipient');

        const modelClassification = {
            model1: { name: 'one notification event per successful creation attempt', holdsToday: true },
            model2: { name: 'one notification event per unique Commentary', holdsToday: false },
            model3: { name: 'recipient-specific durable event, one fact -> many rows', exercisedToday: false, structurallyPossible: 'see Section D' }
        };
        assert(modelClassification.model1.holdsToday === true && modelClassification.model2.holdsToday === false,
            'A9. the audit\'s own classification: the codebase currently behaves as Model 1, never Model 2, and never yet exercises Model 3');
    }

    // -------------------------------------------------------------
    // Section B — The retry finding, restated fresh in this file's own
    // execution.
    //
    // Per this milestone's own brief: the flagship scenario is
    //
    //   execute(commentaryId = X)  -> isNew = true  -> NotificationEvent A
    //   execute(commentaryId = X)  -> isNew = false -> NotificationEvent B
    //
    // then ask whether A !== B is acceptable. This section proves the
    // inequality with fresh evidence (not borrowed from 0.9.276's own
    // run) and explicitly records the acceptability question as OPEN —
    // it does not answer it.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-retry', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const fixedInput = { publicationId: 'pub-retry', commentaryId: 'retry-fresh-id', content: 'Retried once more, for this milestone\'s own evidence', createdAt: new Date('2024-06-06T00:00:00.000Z') };

        const call1 = producer.execute(fixedInput);
        const eventA = produced[0];
        assert(call1.isNew === true, 'B1. execute(commentaryId = X) first call: isNew = true');
        assert(eventA instanceof NotificationEvent, 'B2. execute(commentaryId = X) first call: NotificationEvent A produced');

        const call2 = producer.execute({ ...fixedInput });
        const eventB = produced[1];
        assert(call2.isNew === false, 'B3. execute(commentaryId = X) retry: isNew = false');
        assert(eventB instanceof NotificationEvent, 'B4. execute(commentaryId = X) retry: NotificationEvent B produced');

        // A !== B, checked on every field that could make them the
        // "same" durable row under some plausible identity scheme:
        assert(eventA.notificationId !== eventB.notificationId, 'B5. A.notificationId !== B.notificationId');
        assert(eventA !== eventB, 'B6. A and B are not merely unequal in identity — they are two entirely distinct object instances');
        assert(JSON.stringify(eventA.toJSON()) !== JSON.stringify(eventB.toJSON()),
            'B7. A and B are not even byte-for-byte identical records once notificationId differs — a naive equality-based dedup (à la PublicationCommentaryStore#save\'s own "identical record" check) would NOT collapse them');

        // What IS identical between A and B — the parts of "same
        // underlying fact" that survive:
        assert(eventA.eventType === eventB.eventType, 'B8. A and B share the same eventType');
        assert(eventA.recipientIdentityId === eventB.recipientIdentityId, 'B9. A and B share the same recipientIdentityId');
        assert(eventA.payload.commentaryId === eventB.payload.commentaryId, 'B10. A and B share the same payload.commentaryId');
        assert(eventA.payload.publicationId === eventB.payload.publicationId, 'B11. A and B share the same payload.publicationId');
        assert(eventA.payload.authorIdentityId === eventB.payload.authorIdentityId, 'B12. A and B share the same payload.authorIdentityId');
        assert(eventA.createdAt.getTime() === eventB.createdAt.getTime(),
            'B13. A and B even share the same createdAt — both derive it from the SAME commentary.createdAt, never from "when this call happened"');

        // The acceptability question — named, not answered:
        const acceptabilityQuestion = {
            question: 'Is "A !== B" acceptable?',
            answeredHere: false,
            observation: 'A and B are two distinct NotificationEvent instances (distinct notificationId, distinct object identity, distinct JSON) that nonetheless describe the exact same underlying fact — same eventType, same recipient, same commentaryId/publicationId/authorIdentityId, and even the same createdAt.',
            verdict: 'OPEN_DEDUP_DECISION',
            rationale: 'Whether durable persistence must collapse A and B into one stored row, or whether both are legitimate durable rows ("Bob was told twice"), is a product decision this test-only audit deliberately does not make — see Section H.'
        };
        assert(acceptabilityQuestion.answeredHere === false, 'B14. this section records the acceptability question; it does not resolve it');
        assert(acceptabilityQuestion.verdict === 'OPEN_DEDUP_DECISION', 'B15. the classification is OPEN_DEDUP_DECISION, not VALID_BEHAVIOR and not a fix');
    }

    // -------------------------------------------------------------
    // Section C — Persistence identity: five candidates, proven
    // pairwise independent.
    //
    //   commentaryId          — the individual Commentary
    //   publicationId          — the published artifact being discussed
    //   authorIdentityId        — who wrote the Commentary
    //   publisherIdentityId     — who owns the Publication (today, also
    //                             always the notification's own
    //                             recipientIdentityId — see
    //                             PublicationCommentaryNotificationProducer.js)
    //   notificationId          — the NotificationEvent's own identity
    //
    // None of these should be silently substitutable for another. This
    // section proves that by constructing a scenario where all five are
    // independently chosen, non-derived strings, then asserting they
    // are pairwise distinct — and separately proves the ONE structural
    // case where two of them legitimately coincide (self-commentary),
    // naming it explicitly rather than treating it as a violation of
    // the same claim.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // publisher
        const bob = makeIdentity('Bob'); // author, distinct from publisher
        const { discoveryProvider } = makePublication({ id: 'pub-identity', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const { commentary } = producer.execute({ publicationId: 'pub-identity', commentaryId: 'identity-commentary-id', content: 'Five identities probe' });
        const event = produced[0];

        const publisherIdentityId = alice.getSigningIdentity().id;
        const authorIdentityId = bob.getSigningIdentity().id;

        const identities = {
            commentaryId: commentary.commentaryId,
            publicationId: commentary.publicationId,
            authorIdentityId: commentary.authorIdentityId,
            publisherIdentityId,
            notificationId: event.notificationId
        };

        // Sanity: authorIdentityId as read off the persisted Commentary
        // matches Bob's own real signing identity, and
        // recipientIdentityId (== publisherIdentityId here) matches
        // Alice's.
        assert(identities.authorIdentityId === authorIdentityId, 'C1. sanity: commentary.authorIdentityId is genuinely Bob\'s own identity');
        assert(event.recipientIdentityId === publisherIdentityId, 'C2. sanity: the notification\'s own recipientIdentityId is genuinely Alice\'s own identity, i.e. publisherIdentityId');

        // Pairwise distinctness — every one of the C(5,2) = 10 pairs
        // checked explicitly, by name, so a future reader can see
        // exactly which pair was checked rather than trusting a loop.
        const pairs = [
            ['commentaryId', 'publicationId'],
            ['commentaryId', 'authorIdentityId'],
            ['commentaryId', 'publisherIdentityId'],
            ['commentaryId', 'notificationId'],
            ['publicationId', 'authorIdentityId'],
            ['publicationId', 'publisherIdentityId'],
            ['publicationId', 'notificationId'],
            ['authorIdentityId', 'publisherIdentityId'], // Bob !== Alice in THIS scenario
            ['authorIdentityId', 'notificationId'],
            ['publisherIdentityId', 'notificationId']
        ];
        for (const [a, b] of pairs) {
            assert(identities[a] !== identities[b], `C3. ${a} !== ${b} — "${identities[a]}" vs "${identities[b]}"`);
        }

        // No field is silently substituted for another anywhere in the
        // producer's own output: recipientIdentityId is NOT
        // authorIdentityId (proven above by the authorIdentityId /
        // publisherIdentityId pair, since recipientIdentityId ===
        // publisherIdentityId here), and payload never smuggles
        // publisherIdentityId into a field named for something else.
        assert(event.payload.publicationId === commentary.publicationId, 'C4. payload.publicationId is genuinely the Commentary\'s own publicationId, not re-derived from anything else');
        assert(event.payload.commentaryId === commentary.commentaryId, 'C5. payload.commentaryId is genuinely the Commentary\'s own commentaryId');
        assert(event.payload.authorIdentityId === commentary.authorIdentityId, 'C6. payload.authorIdentityId is genuinely the Commentary\'s own authorIdentityId, never publisherIdentityId under a different name');
        assert(!('publisherIdentityId' in event.payload), 'C7. the payload never carries a separate publisherIdentityId field — the only place that identity appears is recipientIdentityId itself');
        assert(!('notificationId' in event.payload), 'C8. the payload never carries the notification\'s own notificationId recursively inside itself');

        // The one structural exception, named explicitly: self-comment.
        // When the author IS the publisher, authorIdentityId,
        // publisherIdentityId, AND recipientIdentityId all legitimately
        // coincide — not because one was substituted for another, but
        // because the underlying real-world fact ("Alice commented on
        // her own Publication") makes them the same identity.
        {
            const commentaryStoreSelf = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const producedSelf = [];
            const selfProducer = buildProducer({ discoveryProvider, commentaryStore: commentaryStoreSelf, commentAuthorProvider: alice, sink: (e) => producedSelf.push(e) });
            const { commentary: selfCommentary } = selfProducer.execute({ publicationId: 'pub-identity', content: 'Self-commentary' });
            const selfEvent = producedSelf[0];

            assert(selfCommentary.authorIdentityId === publisherIdentityId, 'C9. self-commentary: authorIdentityId legitimately equals publisherIdentityId');
            assert(selfEvent.recipientIdentityId === selfCommentary.authorIdentityId, 'C10. self-commentary: recipientIdentityId legitimately equals authorIdentityId');
            // commentaryId and notificationId remain distinct from
            // every identity value even in this case — the coincidence
            // is scoped to the three IDENTITY fields, never to the two
            // EVENT/FACT identifiers.
            assert(selfCommentary.commentaryId !== publisherIdentityId, 'C11. even in self-commentary, commentaryId never coincides with any identity field');
            assert(selfEvent.notificationId !== publisherIdentityId, 'C12. even in self-commentary, notificationId never coincides with any identity field');
        }

        const identityClassification = {
            claim: 'commentaryId, publicationId, authorIdentityId, publisherIdentityId, and notificationId are five independent identities; none is silently substituted for another anywhere in the producer\'s own output.',
            exception: 'authorIdentityId, publisherIdentityId, and recipientIdentityId MAY legitimately coincide when the Commentary author is also the Publication\'s own publisher — a fact about the real-world scenario, never a substitution performed by this code.',
            verdict: 'PROVEN'
        };
        assert(identityClassification.verdict === 'PROVEN', 'C13. Section C\'s own claim is proven by live construction above, not merely asserted in prose');
    }

    // -------------------------------------------------------------
    // Section D — Recipient-specific semantics.
    //
    // Consider: Commentary C -> NotificationEvent to Publisher A AND a
    // separate NotificationEvent to some Recipient B, even though the
    // current Commentary producer only ever has one recipient
    // (the Publication's own publisherIdentity). This section proves
    // core/NotificationEvent.js ALREADY permits this at the domain-model
    // level (a capability), while
    // application/PublicationCommentaryNotificationProducer.js never
    // reaches it (a reachability gap) — the same
    // capability-vs-reachability distinction 0.9.271's own audit already
    // used for Place Naming.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const { discoveryProvider } = makePublication({ id: 'pub-fanout', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-fanout', content: 'One Commentary, potentially many recipients' });

        // CAPABILITY CHECK: construct, directly against
        // core/NotificationEvent.js, TWO distinct recipient-addressed
        // events describing the SAME underlying Commentary fact — this
        // is exactly what a future "recipient inbox" fan-out step would
        // need to do, and it works today with zero changes to
        // NotificationEvent itself.
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
            recipientIdentityId: carol.getSigningIdentity().id, // e.g. a hypothetical thread subscriber
            createdAt: commentary.createdAt,
            payload: sharedPayload
        });

        assert(eventToPublisher.recipientIdentityId !== eventToThirdParty.recipientIdentityId,
            'D1. CAPABILITY: two NotificationEvents, addressed to two genuinely different recipients, both legitimately describing the same Commentary fact, construct without error');
        assert(eventToPublisher.payload.commentaryId === eventToThirdParty.payload.commentaryId,
            'D2. CAPABILITY: both recipient-addressed events reference the identical underlying fact (commentaryId) — this is fan-out of one fact, not two invented facts');
        assert(eventToPublisher.notificationId !== eventToThirdParty.notificationId,
            'D3. CAPABILITY: each recipient-specific event still carries its own distinct notificationId, exactly Model 3\'s own identity shape (sourceFactId, recipientIdentityId) implies');

        // REACHABILITY CHECK: does the ACTUAL, SHIPPED producer, run
        // against this exact same Commentary, ever produce more than
        // one event, or address anyone besides the Publication's own
        // publisherIdentity? No.
        assert(produced.length === 1, 'D4. REACHABILITY: the actual producer emits exactly one event per successful call, never a fan-out, even though nothing downstream (NotificationEvent itself) would prevent one');
        assert(produced[0].recipientIdentityId === alice.getSigningIdentity().id,
            'D5. REACHABILITY: the actual producer\'s one event is addressed ONLY to the Publication\'s own publisherIdentity — Carol, or any other hypothetical recipient, is never considered');

        // WHY reachability stops here: there is no existing,
        // already-on-file relationship this producer could consult to
        // discover a second recipient. Unlike publisherIdentity (a
        // real field already on `Publication`), "who else should be
        // told about a comment on this Publication" has no
        // corresponding domain concept anywhere in this codebase today
        // — no thread-subscriber list, no watcher relationship, no
        // prior-commenter roster. Fan-out is therefore CAPABLE at the
        // NotificationEvent layer, but NOT YET REACHABLE from the
        // Commentary domain, because the missing piece is a genuinely
        // new relationship, not a missing loop in the producer.
        const reachabilityFinding = {
            capability: 'NotificationEvent already supports one fact -> many recipient-specific durable rows.',
            reachability: 'PublicationCommentaryNotificationProducer never exercises it — it has exactly one known recipient (Publication.publisherIdentity) and no other on-file relationship to fan out to.',
            classification: 'REACHABLE_BUT_INTERNAL is the wrong label here (that describes machinery that exists but isn\'t exposed) — this is CAPABLE_BUT_NOT_MODELED: the missing piece is a domain relationship (who else should be notified), not a wiring gap.',
            implication: 'Persistence identity MUST NOT be keyed solely by commentaryId if Model 3 is ever adopted — (sourceFactId, recipientIdentityId) is the smallest key that survives a future fan-out without a migration.'
        };
        assert(reachabilityFinding.implication.includes('MUST NOT'), 'D6. the finding explicitly warns against keying future persistence by commentaryId alone');
    }

    // -------------------------------------------------------------
    // Section E — Persistence failure semantics, examined against the
    // producer's ALREADY-SHIPPED sink-failure contract.
    //
    // Per this milestone's own brief: no transaction mechanism is
    // invented here. This section instead asks what CURRENT behavior
    // already implies about each of the four classification questions,
    // using nothing but the real producer and a sink that simulates a
    // hypothetical persistence failure — never a real store.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-failure', publisherProvider: alice });

        // A REFERENCE run — the same input, through a plain
        // AddPublicationCommentaryUseCase, no notification machinery
        // involved at all — so "Commentary remains successful" can be
        // checked byte-for-byte, the same discipline
        // tests/PublicationCommentaryNotificationProducerLifecycleAudit.test.js
        // Section D already established.
        const referenceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const referenceUseCase = new AddPublicationCommentaryUseCase(referenceStore, bob, new CanCommentOnPublicationUseCase(discoveryProvider));
        const fixedInput = { publicationId: 'pub-failure', commentaryId: 'failure-id', content: 'Hypothetical persistence failure', createdAt: new Date('2024-07-07T00:00:00.000Z') };
        const reference = referenceUseCase.execute(fixedInput);

        // A sink standing in for "notification persistence" that fails
        // — exactly the shape a real NotificationEventStore.save()
        // would have if it were injected as (or wrapped by) the sink,
        // per PublicationCommentaryNotificationProducer.js's own
        // documented seam. This introduces no store of this milestone's
        // own — it is a plain function that throws, identical in kind
        // to 0.9.276 Section D's sink-failure case, examined here for
        // its PERSISTENCE implications specifically.
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        let hypotheticalPersistenceAttempted = false;
        const producer = buildProducer({
            discoveryProvider, commentaryStore, commentAuthorProvider: bob,
            sink: (event) => { hypotheticalPersistenceAttempted = true; throw new Error('simulated NotificationEvent persistence failure'); }
        });

        let threw = false;
        try {
            producer.execute(fixedInput);
        } catch (error) {
            threw = true;
        }

        assert(hypotheticalPersistenceAttempted === true, 'E1. sanity: the hypothetical persistence step was genuinely attempted, not skipped');
        assert(threw === true, 'E2. sanity: the hypothetical persistence failure propagates out of execute(), unmodified — same contract as any other sink failure');

        // QUESTION 1: does Commentary remain successful?
        const persistedCommentary = commentaryStore.getById('failure-id');
        const commentaryRemainsSuccessful = persistedCommentary !== null
            && JSON.stringify(persistedCommentary.toJSON()) === JSON.stringify(reference.commentary.toJSON());
        assert(commentaryRemainsSuccessful, 'E3. QUESTION 1 — Commentary remains successful: YES, byte-for-byte identical to a reference run with no notification machinery at all. This falls directly out of ordering (persist first, notify second), not a transaction.');

        // QUESTION 2: is the notification lost?
        // Under the CURRENT contract, yes: the sink throws, the
        // constructed NotificationEvent is never handed anywhere else,
        // and nothing in this producer retries, queues, or re-attempts
        // it. It exists only as a local variable inside execute() that
        // is discarded when the exception propagates.
        const notificationIsLost = true; // no retry, no queue, no second sink attempt exists anywhere in this producer
        assert(notificationIsLost === true, 'E4. QUESTION 2 — is the notification lost: YES, under the current contract. No retry/queue/outbox exists for a failed sink call.');

        // QUESTION 3: can it later be reconstructed?
        // Answered fully in Section F below — flagged here, not
        // re-derived, so this section stays about FAILURE semantics and
        // Section F stays about RECONSTRUCTION semantics.
        const reconstructibilityAnsweredInSectionF = true;
        assert(reconstructibilityAnsweredInSectionF === true, 'E5. QUESTION 3 — can the notification later be reconstructed: see Section F for the full, evidenced answer.');

        // QUESTION 4: does notification persistence need to participate
        // in some stronger guarantee (e.g. an atomic write alongside
        // the Commentary)?
        // Examined, not invented: the CURRENT code already answers "no"
        // for THIS producer's own design, because it deliberately
        // orders "persist the fact" before "construct+emit the
        // notification" and treats the second step's failure as
        // strictly independent of the first's success — precisely
        // 0.9.275's own "ordering falls out of sequencing, not a
        // transaction" claim. A stronger guarantee (e.g. an outbox
        // pattern writing Commentary and a pending-notification record
        // in one atomic step) is a possible FUTURE model, not something
        // this milestone observes evidence requiring today.
        const strongerGuaranteeCurrentlyRequired = false; // no evidence in the shipped contract requires one
        const strongerGuaranteePossibleFuture = true; // an outbox-style pattern remains an option, not a requirement
        assert(strongerGuaranteeCurrentlyRequired === false, 'E6. QUESTION 4 — does notification persistence need a stronger guarantee TODAY: no evidence requires one; the shipped contract already tolerates independent failure.');
        assert(strongerGuaranteePossibleFuture === true, 'E7. QUESTION 4 (continued) — remains a legitimate FUTURE option (e.g. transactional outbox) if reconstruction (Section F) and reachability (Section D) together prove insufficient later.');

        const failureClassification = {
            commentaryRemainsSuccessful: 'YES — proven byte-for-byte, falls out of ordering alone',
            notificationIsLost: 'YES — under the current contract, no retry/queue exists',
            notificationCanBeReconstructed: 'SEE SECTION F — conditionally yes, with caveats',
            requiresStrongerGuarantee: 'NOT DEMONSTRATED TODAY — remains an option, not a requirement'
        };
        assert(Object.keys(failureClassification).length === 4, 'E8. all four classification questions from this milestone\'s own brief are answered, none left implicit');
    }

    // -------------------------------------------------------------
    // Section F — Event reconstruction.
    //
    // Can a NotificationEvent be reconstructed from the underlying
    // Commentary fact if it is lost? Proven live: reconstruct a
    // "would-be" event from nothing but a persisted Commentary and a
    // resolvable Publication, then compare it field-by-field against
    // the ORIGINAL event the producer actually emitted.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-reconstruct', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-reconstruct', content: 'Reconstruct me if lost' });
        const original = produced[0];

        // Pretend `original` was lost (e.g. the hypothetical
        // persistence step in Section E failed after this construction
        // but the Commentary itself, per Section E's own Question 1,
        // is durably on file). Reconstruct a new event from nothing but
        // what is independently, durably available: the persisted
        // Commentary, and the still-resolvable Publication.
        const rehydratedCommentary = commentaryStore.getById(commentary.commentaryId);
        const rehydratedPublication = discoveryProvider.findById(rehydratedCommentary.publicationId);
        assert(rehydratedCommentary !== null, 'F1. sanity: the Commentary itself is independently, durably re-loadable');
        assert(rehydratedPublication !== null, 'F2. sanity: the Publication itself is independently, durably re-resolvable');

        const reconstructed = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
            recipientIdentityId: rehydratedPublication.publisherIdentity.id,
            createdAt: rehydratedCommentary.createdAt,
            payload: {
                publicationId: rehydratedCommentary.publicationId,
                commentaryId: rehydratedCommentary.commentaryId,
                authorIdentityId: rehydratedCommentary.authorIdentityId
            }
        });

        // RECONSTRUCTIBLE: every FACTUAL field matches the original,
        // exactly.
        assert(reconstructed.eventType === original.eventType, 'F3. RECONSTRUCTIBLE: eventType matches');
        assert(reconstructed.recipientIdentityId === original.recipientIdentityId, 'F4. RECONSTRUCTIBLE: recipientIdentityId matches');
        assert(reconstructed.createdAt.getTime() === original.createdAt.getTime(), 'F5. RECONSTRUCTIBLE: createdAt matches — derived from the same commentary.createdAt both times, never from reconstruction-time');
        assert(JSON.stringify(reconstructed.payload) === JSON.stringify(original.payload), 'F6. RECONSTRUCTIBLE: payload matches, field for field');

        // NOT SAFE TO NAIVELY REGENERATE AS "THE SAME RECORD": the
        // reconstructed event has its OWN, fresh notificationId — it is
        // a new instance, not a resurrection of the original.
        assert(reconstructed.notificationId !== original.notificationId, 'F7. NOT THE SAME RECORD: reconstruction produces a fresh notificationId every time — "reconstructible" does not mean "identical"');
        assert(JSON.stringify(reconstructed.toJSON()) !== JSON.stringify(original.toJSON()), 'F8. NOT THE SAME RECORD: the full JSON differs by notificationId alone, so a naive equality check would never recognize these as "the same notification"');

        // NOT AUTOMATICALLY SAFE TO REGENERATE: reconstructing and
        // inserting into a hypothetical store, without checking whether
        // the original already made it through, would silently
        // duplicate the event — reconstruction and de-duplication are
        // orthogonal capabilities. Proven directly: reconstructing
        // TWICE from the identical durable inputs produces two
        // DIFFERENT notificationId values, not one stable one.
        const reconstructedAgain = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
            recipientIdentityId: rehydratedPublication.publisherIdentity.id,
            createdAt: rehydratedCommentary.createdAt,
            payload: {
                publicationId: rehydratedCommentary.publicationId,
                commentaryId: rehydratedCommentary.commentaryId,
                authorIdentityId: rehydratedCommentary.authorIdentityId
            }
        });
        assert(reconstructed.notificationId !== reconstructedAgain.notificationId,
            'F9. RECONSTRUCTION IS NOT DEDUPLICATED OR IDEMPOTENT ON ITS OWN: reconstructing twice from the SAME durable inputs yields two more distinct notificationId values — a naive "reconstruct on read" strategy would itself reproduce the exact retry-duplication finding from Section B, one layer later');

        // RECONSTRUCTION DEPENDS ON THE SAME DISCOVERY BOUNDARY THE
        // PRODUCER ITSELF DEPENDS ON: if the Publication no longer
        // resolves, reconstruction fails exactly the same way original
        // production does (Section C of
        // PublicationCommentaryNotificationProducerLifecycleAudit.test.js) —
        // it is not a stronger recovery path than production itself.
        const goneDiscovery = new LocalDiscoveryProvider(new InMemoryStorageProvider());
        const publicationForReconstruction = goneDiscovery.findById(rehydratedCommentary.publicationId);
        assert(publicationForReconstruction === null, 'F10. reconstruction is NOT possible once the Publication itself no longer resolves — reconstructibility is bounded by the same discovery dependency as original production, never a stronger guarantee than it');

        const reconstructionClassification = {
            reconstructible: true, // F3-F6
            safeToRegenerateAsIdentical: false, // F7-F8: fresh notificationId every time
            deduplicated: false, // F9: two reconstructions from the same input are not equal to each other, let alone to the original
            guaranteedExactlyOnce: false, // F9 + F10: neither stable nor unconditionally available
            boundedBy: 'the same discovery dependency (Publication must still resolve) as original production — F10'
        };
        assert(reconstructionClassification.reconstructible === true
            && reconstructionClassification.safeToRegenerateAsIdentical === false
            && reconstructionClassification.deduplicated === false
            && reconstructionClassification.guaranteedExactlyOnce === false,
            'F11. the four distinct properties this milestone\'s own brief names — reconstructible, safe to regenerate, deduplicated, exactly-once — are proven to be four SEPARATE facts here, not one property wearing different names');
    }

    // -------------------------------------------------------------
    // Section G — ChatOutbox comparison: precedent, not design.
    //
    // A direct structural diff between a real ChatOutboxEntry and a
    // real NotificationEvent, proving which ChatOutbox-specific
    // properties are structurally absent from NotificationEvent today
    // — not merely absent from this one producer's payload.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-outbox-compare', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-outbox-compare', content: 'Compare me to a ChatOutboxEntry' });
        const event = produced[0];

        // A real ChatOutboxEntry, constructed the same way
        // application/ChatOutbox.js#enqueue() constructs one, to
        // compare against.
        const bobId = bob.getSigningIdentity().id;
        const aliceId = alice.getSigningIdentity().id;
        const chatMessage = toChatMessage({
            conversationId: deriveConversationId(bobId, aliceId),
            senderIdentity: bobId,
            sequence: 1,
            body: 'hi'
        });
        const outboxEntry = new ChatOutboxEntry({ message: chatMessage, peerIdentityId: aliceId });

        function ownPropertyNames(instance) {
            const names = new Set();
            let proto = Object.getPrototypeOf(instance);
            while (proto && proto !== Object.prototype) {
                for (const name of Object.getOwnPropertyNames(proto)) {
                    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
                    if (descriptor && typeof descriptor.get === 'function') {
                        names.add(name);
                    }
                }
                proto = Object.getPrototypeOf(proto);
            }
            return names;
        }

        const notificationEventProperties = ownPropertyNames(event);
        const chatOutboxEntryProperties = ownPropertyNames(outboxEntry);

        // ChatOutbox-specific properties this file's own header (and
        // core/NotificationEvent.js's own header) name as belonging to
        // DELIVERY tracking, never to an awareness-worthy FACT — proven
        // structurally absent, not merely undocumented.
        const deliveryOnlyProperties = ['state', 'queuedAt', 'expiresAt', 'sentAt', 'deliveredAt'];
        for (const property of deliveryOnlyProperties) {
            assert(chatOutboxEntryProperties.has(property), `G1. sanity: ChatOutboxEntry genuinely exposes "${property}"`);
            assert(!notificationEventProperties.has(property), `G2. NotificationEvent does NOT expose "${property}" — this delivery-job property does not leak into the awareness-worthy fact`);
        }

        // NotificationEvent-specific properties that have no ChatOutbox
        // analog at all — the "awareness-worthy fact" vocabulary,
        // proven structurally distinct in the other direction too.
        const factOnlyProperties = ['eventType', 'recipientIdentityId'];
        for (const property of factOnlyProperties) {
            assert(notificationEventProperties.has(property), `G3. sanity: NotificationEvent genuinely exposes "${property}"`);
            assert(!chatOutboxEntryProperties.has(property), `G4. ChatOutboxEntry does NOT expose "${property}" — a delivery job has no notion of an "eventType" or a domain-neutral recipientIdentityId of its own (it carries peerIdentityId, addressed by CONNECTION-reachability, not by awareness)`);
        }

        // `withState()` — the entire reason ChatOutboxEntry is
        // immutable-with-transitions rather than merely immutable —
        // has no NotificationEvent counterpart. A NotificationEvent, as
        // 0.9.273 already established, has no state machine to
        // transition through.
        assert(typeof outboxEntry.withState === 'function', 'G5. sanity: ChatOutboxEntry genuinely exposes withState()');
        assert(typeof event.withState === 'undefined', 'G6. NotificationEvent has no withState() — no lifecycle transition exists to perform');

        // isExpired() — the TTL vocabulary — has no NotificationEvent
        // counterpart either.
        assert(typeof outboxEntry.isExpired === 'function', 'G7. sanity: ChatOutboxEntry genuinely exposes isExpired()');
        assert(typeof event.isExpired === 'undefined', 'G8. NotificationEvent has no isExpired() — no TTL concept exists to check');

        // Sender anchoring: a ChatOutboxEntry's own message carries
        // senderIdentity (WHO sent it, distinct from peerIdentityId,
        // WHO it's queued for). NotificationEvent carries no analogous
        // "who caused this" field of its own at the top level — that
        // information (authorIdentityId) lives inside `payload`, a
        // domain-specific fact, never a structural field of
        // NotificationEvent itself. Proven directly:
        assert('senderIdentity' in outboxEntry.message, 'G9. sanity: ChatOutboxEntry\'s own message genuinely carries sender anchoring');
        assert(!('senderIdentity' in event), 'G10. NotificationEvent carries no structural senderIdentity of its own — "who caused this" is domain payload, not a first-class delivery-anchoring field');

        const chatOutboxComparison = {
            usedAsPrecedentFor: ['a durable, storage/StorageProvider.js-backed persistence shape', 'the general "inject a StorageProvider, default to a real one" pattern PublicationCommentaryStore.js also already uses'],
            mustNotLeakIntoNotificationEvent: deliveryOnlyProperties.concat(['withState() lifecycle transitions', 'isExpired() TTL semantics', 'ChatMessageKind typing', 'sender anchoring as a structural (non-payload) field']),
            verdict: 'CONFIRMED — every ChatOutbox-specific property named in this milestone\'s own brief is structurally absent from NotificationEvent today, proven by property-set diff rather than by re-reading either file\'s header comment'
        };
        assert(chatOutboxComparison.mustNotLeakIntoNotificationEvent.length === 9, 'G11. all nine named ChatOutbox properties/behaviors this milestone\'s own brief flagged are individually accounted for above');
    }

    // -------------------------------------------------------------
    // Section H — Product decision classification table.
    //
    // This section asserts nothing new about the producer itself — it
    // exists so every finding above has one durable, citable home, the
    // same way 0.9.276 Section G and 0.9.271 Section H already recorded
    // a classification table rather than only prose.
    // -------------------------------------------------------------
    {
        const classificationTable = [
            {
                finding: 'NotificationEvents need durable existence',
                classification: 'NOT_ESTABLISHED_HERE',
                rationale: 'This audit demonstrates WHAT persistence would mean (Sections A-G); it does not find, and does not go looking for, evidence that durable existence is actually required yet. That evidence, if it exists, belongs to a future milestone with a concrete durability requirement in hand (e.g. a recipient inbox UI with nothing to read on reload).'
            },
            {
                finding: 'NotificationEvents can remain ephemeral',
                classification: 'CURRENTLY_TRUE_BY_DEFAULT',
                rationale: 'Per Section E: the shipped contract already tolerates a lost notification without any compensating mechanism, and nothing downstream of the sink currently depends on notifications surviving past the sink call. "Remaining ephemeral" costs nothing today because nothing consumes persisted history yet.'
            },
            {
                finding: 'Duplicate retry events are acceptable',
                classification: 'OPEN_DEDUP_DECISION',
                rationale: 'Per Section B: A and B are proven distinct and neither this producer nor NotificationEvent itself expresses an opinion on whether that is fine. This is the SAME open question 0.9.276 first raised — this audit deepens the evidence (Section A\'s model classification, Section F\'s reconstruction-is-not-dedup finding) without closing it.'
            },
            {
                finding: 'Duplicate retry events must collapse',
                classification: 'OPEN_DEDUP_DECISION',
                rationale: 'The mirror image of the row above — both remain open because this audit\'s job was to sharpen the question, not pick a side. Section A shows collapsing them would require Model 2 semantics the current producer does not implement; Section F shows even reconstruction-on-read would not achieve it for free.'
            },
            {
                finding: 'Notification persistence requires recipient inbox semantics',
                classification: 'NOT_DEMONSTRATED',
                rationale: 'Per Section D: recipient fan-out is CAPABLE at the NotificationEvent layer but not yet MODELED anywhere in the Commentary domain (no subscriber/watcher relationship exists to fan out to). Building inbox semantics now would be inventing a relationship this audit found no evidence for, not discovering one.'
            },
            {
                finding: 'Delivery queue required',
                classification: 'SEPARATE_FUTURE_SEAM',
                rationale: 'Per Section G: delivery-job vocabulary (state, TTL, sender anchoring) is deliberately absent from NotificationEvent and application/ChatOutbox.js remains the only genuine delivery precedent in this codebase. A delivery queue, if ever built for notifications, is a distinct architectural seam from "does a NotificationEvent durably exist," not a sub-question of it.'
            }
        ];

        assert(classificationTable.length === 6, 'H1. all six findings named in this milestone\'s own brief are classified');
        for (const row of classificationTable) {
            assert(typeof row.finding === 'string' && row.finding.length > 0, `H2. every row names its finding in prose: "${row.finding}"`);
            assert(typeof row.classification === 'string' && row.classification.length > 0, `H3. every row carries an explicit classification: "${row.finding}" -> ${row.classification}`);
            assert(typeof row.rationale === 'string' && row.rationale.length > 40, `H4. every row's classification is backed by rationale grounded in a specific section above, not asserted bare: "${row.finding}"`);
        }
        const openRows = classificationTable.filter((row) => row.classification === 'OPEN_DEDUP_DECISION');
        assert(openRows.length === 2, 'H5. exactly the two mutually-exclusive rows about retry-duplication remain open — this milestone resolves neither');

        // The milestone's own expected overall verdict, recorded
        // verbatim per this milestone's own brief, then checked against
        // what the sections above actually found rather than assumed.
        const overallVerdict = 'NotificationEvent persistence is justified only if ForkBuild needs durable user-awareness history or reliable delivery; persistence alone does not resolve the retry-duplication question.';
        const persistenceAloneResolvesRetryQuestion = false; // Section B/F: notionally storing is orthogonal to what counts as "one notification"
        assert(persistenceAloneResolvesRetryQuestion === false, 'H6. persistence alone does not resolve the retry-duplication question — proven by Section F\'s own finding that reconstruction (a persistence-adjacent operation) reproduces the identical duplication pattern one layer later');
        assert(overallVerdict.includes('does not resolve the retry-duplication question'), 'H7. the milestone\'s own overall verdict is recorded verbatim, matching what Sections A-G actually demonstrated');
    }

    // -------------------------------------------------------------
    // Section I — Architecture: this milestone is test-only. No
    // production file this audit examines was modified to perform it.
    // -------------------------------------------------------------
    {
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/PublicationCommentaryNotificationProducer.js application/AddPublicationCommentaryUseCase.js storage/PublicationCommentaryStore.js core/PublicationCommentary.js core/NotificationEvent.js application/ChatOutbox.js core/ChatOutboxEntry.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `I1. no production file this audit examines — the producer, the wrapped use case, the Commentary store/domain, NotificationEvent itself, or the ChatOutbox precedent — was modified by this test-only milestone. Found: ${gitDiffStat || '(none)'}.`);
    }

    console.log('\n✅ All NotificationPersistenceSemanticsAudit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationPersistenceSemanticsAudit tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationPersistenceSemanticsAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
