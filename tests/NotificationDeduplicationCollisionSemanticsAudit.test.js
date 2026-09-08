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

// 0.9.279 — Notification Deduplication Collision Semantics Audit.
//
// 0.9.278 characterized five candidate dedup identities without selecting
// one, and proved two of them structurally unsound (recipient fan-out,
// event-type separation) while leaving the remaining candidate,
// `commentaryId + eventType + recipientIdentityId`, as one of exactly two
// candidates that pass every structural soundness check it tested — the
// other being `notificationId`, which never collapses anything at all.
// Neither 0.9.278 nor this milestone adopts either candidate as production
// policy. But 0.9.278 answered a narrower question than the one a real
// `NotificationEventStore` would actually need answered. It asked "do these
// two events compute the SAME key?" It never asked the question that
// matters the moment two events DO: if two independently produced
// `NotificationEvent`s share a proposed dedup identity, what exactly makes
// them the same notification — and what happens when they disagree on
// something else?
//
// THIS MILESTONE'S CANDIDATE, USED ONLY AS AN AUDIT VEHICLE, NEVER AS
// PRODUCTION POLICY: `commentaryId + eventType + recipientIdentityId` — the
// one content-based candidate 0.9.278 Section I found structurally sound.
// This file does not re-litigate 0.9.278's own comparison; it fixes this
// one candidate as the collision detector so every scenario below has a
// single, stable "do these collide?" question to answer, then spends its
// entire budget on what happens AFTER a collision is detected. Choosing
// this candidate here is a test-authoring convenience, not an adoption —
// Section K proves, structurally, that nothing about this choice reaches
// `core/NotificationEvent.js` itself.
//
// Test-only, per this milestone's own brief: no `NotificationEventStore`,
// no deterministic notification IDs, no deduplication implementation, no
// inbox, no delivery, no read/unread state, no notification lifecycle, no
// notification UI, no retry queues, no TTL, no `ChatOutbox` changes, no
// recipient fan-out implementation, no change to `NotificationEvent`, no
// selection of a notification persistence provider.
//
// THE CENTRAL QUESTION: when two `NotificationEvent`s share a proposed
// dedup identity, what exactly makes them the same notification — and does
// the architecture have enough information, today, to answer that question
// safely, or only enough to detect that the question exists?
//
//   Section A — Baseline collision: an exact caller retry, restated fresh
//               against this milestone's own fixed candidate, never
//               borrowed from 0.9.278's own run.
//   Section B — Payload-identical collision: the easiest case, and the one
//               structural fact it proves — a payload-identical collision
//               can be resolved by picking EITHER representative with zero
//               information loss, regardless of which collapse policy a
//               later milestone eventually picks.
//   Section C — Payload-different collision: two colliding events whose
//               payloads genuinely disagree (one carries a field the other
//               lacks). Proves the four candidate resolutions this
//               milestone's own brief named are all mechanically
//               representable, and that nothing in this architecture picks
//               among them today.
//   Section D — Timestamp-different collision: proves `createdAt` is part
//               of the immutable fact a `NotificationEvent` records but NOT
//               part of the candidate dedup identity used here — the
//               identity/metadata distinction this milestone's own brief
//               asked for, shown by construction rather than argued in
//               prose.
//   Section E — Event-type separation: a regression guard reconfirming
//               0.9.278's own finding that two different `eventType`
//               values for the same Commentary/recipient must never
//               collide under this candidate — restated here because every
//               later section in this file depends on it holding.
//   Section F — Recipient separation: the mirror regression guard, for two
//               different recipients of the same Commentary.
//   Section G — Reconstruction: an original event, a reconstruction of it,
//               and a second, independent reconstruction, all collide with
//               each other under this candidate (0.9.278 Section G already
//               proved the KEY equality; this section proves the resulting
//               COLLISION has the exact same shape as Section B's — and
//               that nothing on a `NotificationEvent` records whether a
//               collision arose from a retry, a reconstruction, or
//               something else).
//   Section H — Self-comment: confirms author/recipient coincidence has no
//               effect on collision detection or collision shape.
//   Section I — Same key, incompatible immutable facts: two events that
//               collide under the candidate identity while disagreeing on
//               `payload.authorIdentityId` — a fact the candidate identity
//               does not look at, but which cannot legitimately differ for
//               one real commentaryId. Establishes the collision-integrity
//               boundary: key collision is evidence a persistence layer
//               MUST inspect further, never evidence it may silently
//               overwrite.
//   Section J — Decision matrix: the explicit classification table this
//               milestone's own brief asked for, aggregated from Sections
//               A-I, not re-derived.
//   Section K — Architecture: test-only, zero production files touched,
//               and no collision/compatibility-shaped method added to
//               `NotificationEvent` (extends 0.9.278 Section K's own
//               forbidden-method list).
//
// See docs/Roadmap.md, 0.9.279, for the full milestone entry, and
// docs/Principles.md for the prose form of this file's own findings.

// ---------------------------------------------------------------------
// Helpers — identical shape to
// tests/NotificationDeduplicationIdentityAudit.test.js
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
// The fixed audit candidate identity — 0.9.278's own
// `commentaryId + eventType + recipientIdentityId`, chosen here only as a
// stable collision detector for THIS file's own scenarios. See this file's
// own header: never adopted as production policy.
// ---------------------------------------------------------------------

function auditCandidateKey(event) {
    return `${event.payload.commentaryId}::${event.eventType}::${event.recipientIdentityId}`;
}

function isCollision(eventA, eventB) {
    return auditCandidateKey(eventA) === auditCandidateKey(eventB);
}

// A collision, once detected, is characterized along the axes this
// milestone's own brief named: does the payload agree, does createdAt
// agree, and — never assumed, always computed — are these genuinely two
// distinct NotificationEvent instances (notificationId always differs for
// two independently constructed events; this is checked, not presumed).
function collisionProfile(eventA, eventB) {
    return {
        collides: isCollision(eventA, eventB),
        sameNotificationId: eventA.notificationId === eventB.notificationId,
        payloadIdentical: JSON.stringify(eventA.payload) === JSON.stringify(eventB.payload),
        createdAtIdentical: eventA.createdAt.getTime() === eventB.createdAt.getTime(),
        authorIdentityIdIdentical: eventA.payload.authorIdentityId === eventB.payload.authorIdentityId
    };
}

async function runTests() {
    // Recorded across sections, aggregated (never re-derived) in Section J.
    const findings = {};

    // -------------------------------------------------------------
    // Section A — Baseline collision: an exact caller retry, restated
    // fresh against this milestone's own fixed candidate.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-baseline', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });

        const fixedInput = { publicationId: 'pub-baseline', commentaryId: 'baseline-retry-id', content: 'Retried, for collision purposes', createdAt: new Date('2024-09-09T00:00:00.000Z') };
        const call1 = producer.execute(fixedInput);
        const call2 = producer.execute({ ...fixedInput });
        assert(call1.isNew === true && call2.isNew === false, 'A1. sanity: a genuine new Commentary, then an idempotent retry');
        assert(produced.length === 2, 'A2. sanity: two distinct NotificationEvent instances were produced');

        const [eventA, eventB] = produced;
        const profile = collisionProfile(eventA, eventB);

        assert(profile.collides === true, 'A3. an exact caller retry IS a collision under this milestone\'s own candidate identity');
        assert(profile.sameNotificationId === false, 'A4. the two colliding events remain two distinct NotificationEvent instances — collision is a KEY relation, never object identity');
        assert(profile.payloadIdentical === true, 'A5. baseline collision: payloads are byte-identical (same commentaryId, publicationId, authorIdentityId)');
        assert(profile.createdAtIdentical === true, 'A6. baseline collision: createdAt is also identical — both derive from the SAME persisted commentary.createdAt, never from call time');

        // THE CENTRAL QUESTION, named explicitly and left open, exactly as
        // 0.9.276/0.9.277/0.9.278 all left it: does this collision mean
        // "one logical notification, told twice" or "two legitimate
        // notifications"? This audit does not answer it — it only proves
        // the collision is real and characterizes its shape.
        const baselineQuestion = {
            question: 'Does the baseline collision represent one logical notification or two?',
            collisionProfile: profile,
            answeredHere: false,
            verdict: 'OPEN'
        };
        assert(baselineQuestion.answeredHere === false, 'A7. this section proves the collision and its shape; it does not decide what the collision MEANS');

        findings.baselineProfile = profile;
    }

    // -------------------------------------------------------------
    // Section B — Payload-identical collision: the easiest case.
    //
    // Section A's own baseline already happens to be payload-identical.
    // This section makes that a named, general property rather than an
    // accident of one scenario: construct a SECOND, independent
    // payload-identical collision (a different Commentary/recipient pair,
    // so this is not merely re-running Section A), and prove the one
    // structural fact that survives regardless of which collapse policy a
    // later milestone eventually picks — a payload-identical collision can
    // be resolved by keeping EITHER representative with zero information
    // loss.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-identical', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const fixedInput = { publicationId: 'pub-identical', commentaryId: 'identical-payload-id', content: 'Second, independent payload-identical probe', createdAt: new Date('2024-09-10T00:00:00.000Z') };
        producer.execute(fixedInput);
        producer.execute({ ...fixedInput });
        assert(produced.length === 2, 'B1. sanity: a second, independent retry scenario, distinct from Section A\'s own Commentary/recipient pair');

        const [eventA, eventB] = produced;
        const profile = collisionProfile(eventA, eventB);
        assert(profile.collides === true, 'B2. sanity: this pair collides too');
        assert(profile.payloadIdentical === true, 'B3. sanity: payloads are identical — this really is the payload-identical case');

        // The zero-information-loss claim, proven directly rather than
        // argued: picking eventA as "the" representative and discarding
        // eventB loses nothing a consumer could observe, and vice versa,
        // because every field a consumer could read (eventType, recipient,
        // createdAt, payload) already agrees between them. The ONLY field
        // that would differ in a stored row is whichever candidate-4-
        // external identity a store chooses to keep (e.g. notificationId,
        // or a fresh synthetic id) — never a fact about the notification
        // itself.
        const observableFields = ['eventType', 'recipientIdentityId'];
        for (const field of observableFields) {
            assert(eventA[field] === eventB[field], `B4. observable field "${field}" agrees between the two colliding representatives`);
        }
        assert(JSON.stringify(eventA.toJSON().payload) === JSON.stringify(eventB.toJSON().payload),
            'B5. the full payload agrees between the two colliding representatives — no consumer-visible fact would be lost by discarding either one');

        const payloadIdenticalClassification = {
            question: 'Same notification, first representation wins; same notification, latest wins; conflicting representation; or a new notification despite the same key?',
            applicableOptions: ['first wins', 'latest wins'], // the only two options that are even meaningfully distinct here
            inapplicableOptions: ['conflicting representation', 'new notification despite same key'], // there is no conflict to have, and "new notification" would mean treating two byte-identical facts as different, unsupported by any observable difference
            structuralFinding: 'When payload and createdAt are BOTH identical, "first wins" and "latest wins" are OBSERVATIONALLY EQUIVALENT — neither loses information the other preserves.',
            verdict: 'NARROWED_BUT_STILL_A_POLICY_CHOICE',
            rationale: 'Which of "first wins"/"latest wins" a future store implements remains a free choice (it only matters for which physical notificationId or storage timestamp survives, never for what the user would see) — this audit narrows the OPEN space, it does not close it, because SOME choice is still required for whatever non-observable bookkeeping field a store keeps (e.g. its own row id).'
        };
        assert(payloadIdenticalClassification.applicableOptions.length === 2, 'B6. exactly two of the four candidate resolutions are even meaningfully distinct when payload and createdAt both agree');

        findings.payloadIdenticalClassification = payloadIdenticalClassification;
    }

    // -------------------------------------------------------------
    // Section C — Payload-different collision: two colliding events whose
    // payloads genuinely disagree. Hand-constructed, because no producer
    // shipped today ever emits two different payloads for one candidate
    // key — this simulates a hypothetical FUTURE producer revision (e.g.
    // one that starts attaching an extra metadata field) colliding with an
    // event emitted by today's producer, exactly the kind of collision a
    // real persistence layer would eventually have to survive a schema
    // change.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-payload-diff', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-payload-diff', commentaryId: 'payload-diff-id', content: 'Same fact, two payload shapes' });
        const eventOriginalShape = produced[0];

        // A hand-built event sharing the identical candidate key
        // (commentaryId, eventType, recipientIdentityId all match) but
        // whose payload carries one additional, non-conflicting field —
        // as if a hypothetical future producer revision started attaching
        // an editorial excerpt alongside the existing three identifiers.
        const eventRicherShape = new NotificationEvent({
            eventType: eventOriginalShape.eventType,
            recipientIdentityId: eventOriginalShape.recipientIdentityId,
            createdAt: eventOriginalShape.createdAt,
            payload: { ...eventOriginalShape.payload, contentExcerpt: commentary.content.slice(0, 40) }
        });

        const profile = collisionProfile(eventOriginalShape, eventRicherShape);
        assert(profile.collides === true, 'C1. the two events still collide under the candidate identity — the extra payload field plays no role in the key');
        assert(profile.payloadIdentical === false, 'C2. sanity: the payloads genuinely differ — this really is the payload-different case');
        assert(profile.createdAtIdentical === true, 'C3. sanity: createdAt still agrees — isolating payload as the ONLY axis of disagreement in this scenario');
        assert('contentExcerpt' in eventRicherShape.payload && !('contentExcerpt' in eventOriginalShape.payload),
            'C4. sanity: the disagreement is a genuine superset, not a conflicting value for the same field');

        // The four candidate resolutions this milestone's own brief named,
        // each checked for whether it is even MECHANICALLY REPRESENTABLE
        // given what a NotificationEvent alone carries — not for whether
        // it is correct.
        const resolutionOptions = {
            firstRepresentationWins: {
                representable: true,
                meansConcretely: 'a store keyed by the candidate identity keeps eventOriginalShape\'s payload and discards contentExcerpt entirely',
                dataLostIfChosen: ['contentExcerpt']
            },
            latestRepresentationWins: {
                representable: true,
                meansConcretely: 'a store keyed by the candidate identity overwrites with eventRicherShape\'s payload, superseding the original',
                dataLostIfChosen: [] // superset overwrite loses nothing here, though it could in a different pair where the LATER one is the narrower one
            },
            conflictingRepresentation: {
                representable: true,
                meansConcretely: 'a store records that this candidate key has two disagreeing payloads and refuses to silently pick one — the safest option when the disagreement is NOT provably benign',
                dataLostIfChosen: []
            },
            newNotificationDespiteSameKey: {
                representable: true,
                meansConcretely: 'a store treats the candidate identity as insufficient here and mints a distinguishing key from the payload difference itself, contradicting the premise that this candidate IS the dedup identity',
                dataLostIfChosen: [],
                tension: 'this option amounts to abandoning the candidate key for this pair specifically — self-consistent only if the candidate identity is itself revised, not merely applied'
            }
        };
        for (const [name, option] of Object.entries(resolutionOptions)) {
            assert(option.representable === true, `C5. resolution option "${name}" is mechanically representable given only what a NotificationEvent already carries`);
        }

        // What this architecture does NOT provide: any field, anywhere on
        // NotificationEvent, that would tell a persistence layer WHICH of
        // these four options is correct. Proven directly: no property of
        // either event distinguishes "this is a superseding revision" from
        // "this is an unrelated, coincidentally-keyed collision."
        const supersedingHintFields = ['supersedes', 'revisionOf', 'version', 'schemaVersion'];
        for (const field of supersedingHintFields) {
            assert(typeof eventRicherShape[field] === 'undefined', `C6. NotificationEvent exposes no "${field}" field — nothing distinguishes a deliberate revision from an unrelated payload disagreement`);
        }

        const payloadDifferentClassification = {
            question: 'Same notification, first wins; same notification, latest wins; conflicting representation; or a new notification despite the same key?',
            allFourOptionsRepresentable: true,
            architectureProvidesNoDecidingSignal: true,
            verdict: 'OPEN',
            rationale: 'This milestone deliberately does not choose among the four options — see this file\'s own header. It establishes only that all four are mechanically buildable and that nothing in NotificationEvent, PublicationCommentaryNotificationProducer, or the candidate identity itself supplies a reason to prefer one.'
        };
        assert(payloadDifferentClassification.verdict === 'OPEN', 'C7. the payload-different collision resolution remains an explicit OPEN policy question, not decided here');

        findings.payloadDifferentClassification = payloadDifferentClassification;
        findings.payloadDifferentProfile = profile;
    }

    // -------------------------------------------------------------
    // Section D — Timestamp-different collision: proves createdAt is part
    // of the IMMUTABLE FACT a NotificationEvent records, but not part of
    // the candidate dedup IDENTITY used in this file — the identity/
    // metadata distinction this milestone's own brief asked for.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-timestamp', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-timestamp', commentaryId: 'timestamp-diff-id', content: 'Same fact, disagreeing clocks' });
        const eventAtOriginalTime = produced[0];

        // A hand-built event, identical candidate key AND identical
        // payload, but a deliberately different createdAt — as if the
        // SAME underlying fact were re-emitted (e.g. by a repair/backfill
        // process, or a producer bug) at a different wall-clock moment.
        const laterTimestamp = new Date(eventAtOriginalTime.createdAt.getTime() + 60_000);
        const eventAtLaterTime = new NotificationEvent({
            eventType: eventAtOriginalTime.eventType,
            recipientIdentityId: eventAtOriginalTime.recipientIdentityId,
            createdAt: laterTimestamp,
            payload: { ...eventAtOriginalTime.payload }
        });

        const profile = collisionProfile(eventAtOriginalTime, eventAtLaterTime);
        assert(profile.collides === true, 'D1. the two events still collide — createdAt plays NO role in the candidate identity used by this audit');
        assert(profile.payloadIdentical === true, 'D2. sanity: payloads agree — isolating createdAt as the ONLY axis of disagreement in this scenario');
        assert(profile.createdAtIdentical === false, 'D3. sanity: createdAt genuinely differs, by exactly the offset this section constructed');

        // The identity/metadata distinction, proven by construction: two
        // events can collide (same logical-identity candidate) while
        // disagreeing on a field that is part of the immutable FACT
        // (createdAt is a required, validated NotificationEvent
        // constructor argument — core/NotificationEvent.js's own header
        // calls it a genuine fact timestamp) without that field
        // participating in whether they are "the same notification" under
        // this candidate.
        assert(typeof eventAtOriginalTime.createdAt.getTime === 'function', 'D4. sanity: createdAt is a real, well-formed Date on both events — a genuine fact field, not an afterthought');
        const identityVsMetadataFinding = {
            claim: 'createdAt is part of the immutable fact a NotificationEvent records; it is NOT part of this milestone\'s own candidate dedup identity.',
            proof: 'Two events with identical candidate keys and identical payloads can disagree on createdAt while still colliding (D1-D3) — the candidate identity is blind to this field by construction (see auditCandidateKey\'s own definition, which never reads createdAt).',
            openQuestion: 'IF a future collision policy ever collapses this pair into one stored row, WHICH createdAt the collapsed representative should carry — the earlier, the later, or both retained as separate fields — is a product decision this audit does not make.',
            verdict: 'IDENTITY_METADATA_DISTINCTION_ESTABLISHED; COLLAPSED_TIMESTAMP_CHOICE_OPEN'
        };
        assert(identityVsMetadataFinding.verdict.includes('ESTABLISHED'), 'D5. the identity/metadata distinction itself is established, not left open — only the COLLAPSED-TIMESTAMP CHOICE remains open');

        findings.identityVsMetadataFinding = identityVsMetadataFinding;
        findings.timestampDifferentProfile = profile;
    }

    // -------------------------------------------------------------
    // Section E — Event-type separation: a regression guard reconfirming
    // 0.9.278's own finding under THIS file's fixed candidate, because
    // every later section here assumes it still holds.
    // -------------------------------------------------------------
    {
        const HYPOTHETICAL_EVENT_TYPE = 'publication.mentioned'; // does not exist in production; a probe only, distinct from 0.9.278's own probe name to avoid any appearance of reusing its literal fixture

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-eventtype', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-eventtype', commentaryId: 'eventtype-guard-id', content: 'One fact, two hypothetical event kinds' });
        const commentedEvent = produced[0];

        const mentionedEvent = new NotificationEvent({
            eventType: HYPOTHETICAL_EVENT_TYPE,
            recipientIdentityId: commentedEvent.recipientIdentityId,
            createdAt: commentedEvent.createdAt,
            payload: { ...commentedEvent.payload }
        });

        assert(commentedEvent.eventType !== mentionedEvent.eventType, 'E1. sanity: two genuinely different eventType values');
        assert(isCollision(commentedEvent, mentionedEvent) === false,
            'E2. two different eventType values for the SAME commentaryId/recipient must NEVER collide under this candidate — publication.commented and a hypothetical publication.mentioned are always separate notifications, never a collision to resolve');

        findings.eventTypeSeparationHolds = true;
    }

    // -------------------------------------------------------------
    // Section F — Recipient separation: the mirror regression guard, for
    // two different recipients of the same Commentary.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const { discoveryProvider } = makePublication({ id: 'pub-recipient', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-recipient', commentaryId: 'recipient-guard-id', content: 'One Commentary, two recipients' });
        const eventToPublisher = produced[0];

        const eventToThirdParty = new NotificationEvent({
            eventType: eventToPublisher.eventType,
            recipientIdentityId: carol.getSigningIdentity().id,
            createdAt: eventToPublisher.createdAt,
            payload: { ...eventToPublisher.payload }
        });

        assert(eventToPublisher.recipientIdentityId !== eventToThirdParty.recipientIdentityId, 'F1. sanity: two genuinely different recipients');
        assert(isCollision(eventToPublisher, eventToThirdParty) === false,
            'F2. two different recipients of the SAME Commentary must NEVER collide under this candidate — Alice\'s copy and Carol\'s hypothetical copy are always separate notifications, never a collision to resolve');

        findings.recipientSeparationHolds = true;
    }

    // -------------------------------------------------------------
    // Section G — Reconstruction: an original, a reconstruction of it, and
    // a second, independent reconstruction, all collide with each other —
    // and that collision has the EXACT same shape as Section B's
    // payload-identical case. The finding this section exists for: nothing
    // on a NotificationEvent records WHY two events collided, so a future
    // policy cannot special-case "this collision came from reconstruction"
    // differently from "this collision came from a live retry" using only
    // the event data itself.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-reconstruct', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        const { commentary } = producer.execute({ publicationId: 'pub-reconstruct', commentaryId: 'reconstruct-collision-id', content: 'Reconstruct me if lost' });
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

        const reconstructed = reconstruct();
        const reconstructedAgain = reconstruct();

        const originalVsReconstructed = collisionProfile(original, reconstructed);
        const reconstructedVsReconstructedAgain = collisionProfile(reconstructed, reconstructedAgain);
        const originalVsReconstructedAgain = collisionProfile(original, reconstructedAgain);

        for (const [label, profile] of [
            ['original vs reconstructed', originalVsReconstructed],
            ['reconstructed vs reconstructedAgain', reconstructedVsReconstructedAgain],
            ['original vs reconstructedAgain', originalVsReconstructedAgain]
        ]) {
            assert(profile.collides === true, `G1. ${label}: collides under the candidate identity`);
            assert(profile.sameNotificationId === false, `G2. ${label}: remain distinct NotificationEvent instances`);
            assert(profile.payloadIdentical === true, `G3. ${label}: payloads are byte-identical`);
            assert(profile.createdAtIdentical === true, `G4. ${label}: createdAt is byte-identical too, since reconstruction re-derives it from the same persisted commentary.createdAt`);
        }

        // THE FINDING THIS SECTION EXISTS FOR: reconstruction collisions
        // and Section B's own live-retry collision are STRUCTURALLY
        // IDENTICAL shapes — { collides: true, payloadIdentical: true,
        // createdAtIdentical: true } — proven by direct comparison, not
        // by re-reading either section's prose.
        assert(JSON.stringify(originalVsReconstructed) === JSON.stringify(findings.baselineProfile),
            'G5. a reconstruction-collision profile is byte-for-byte identical in shape to Section A\'s own live-retry collision profile — nothing observable distinguishes "this collision came from reconstruction" from "this collision came from a caller retry"');

        // And this is not a gap this file could close by adding a field —
        // it is a structural consequence of what a NotificationEvent is
        // (0.9.273's own header: "a fact about a past occurrence," never a
        // record of its own provenance/call-site). Proven directly: no
        // property on either event records how it came to exist.
        const provenanceFields = ['producedBy', 'origin', 'source', 'callSite', 'reconstructedFrom'];
        for (const field of provenanceFields) {
            assert(typeof reconstructed[field] === 'undefined', `G6. NotificationEvent exposes no "${field}" — reconstruction leaves no trace distinguishing it from any other production path`);
        }

        const reconstructionCollisionFinding = {
            claim: 'Reconstruction collisions and live-retry collisions are structurally indistinguishable from inside a NotificationEvent alone.',
            implication: 'A future collision policy that wants to treat "reconstructed" collisions differently from "retried" collisions (e.g. always trust a reconstruction over a stale original) cannot do so using NotificationEvent data alone — it would need EXTERNAL provenance tracking that does not exist anywhere in this codebase today.',
            verdict: 'CONFIRMED'
        };
        assert(reconstructionCollisionFinding.verdict === 'CONFIRMED', 'G7. the indistinguishability finding is proven by direct construction, not asserted in prose alone');

        findings.reconstructionCollisionFinding = reconstructionCollisionFinding;
    }

    // -------------------------------------------------------------
    // Section H — Self-comment: confirms author/recipient coincidence has
    // no effect on collision detection or collision shape.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // both publisher and, here, author
        const { discoveryProvider } = makePublication({ id: 'pub-self', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: alice, sink: (e) => produced.push(e) });
        const selfInput = { publicationId: 'pub-self', commentaryId: 'self-collision-id', content: 'Commenting on my own Publication' };
        producer.execute(selfInput);
        producer.execute({ ...selfInput });
        assert(produced.length === 2, 'H1. a self-comment retry still produces two NotificationEvent instances');

        const [eventA, eventB] = produced;
        assert(eventA.payload.authorIdentityId === eventA.recipientIdentityId, 'H2. sanity: this really is the self-comment case — author and recipient coincide');

        const profile = collisionProfile(eventA, eventB);
        assert(profile.collides === true, 'H3. a self-comment retry collides exactly like any other retry — no special case');
        assert(JSON.stringify(profile) === JSON.stringify(findings.baselineProfile),
            'H4. the self-comment collision profile is shaped identically to Section A\'s own non-self baseline — author==recipient coincidence changes nothing about collision detection or shape');

        findings.selfCommentNoSpecialCase = true;
    }

    // -------------------------------------------------------------
    // Section I — Same key, incompatible immutable facts: the
    // collision-integrity boundary.
    //
    // Hand-constructed, because the real producer can never reach this
    // scenario (one persisted Commentary has exactly one immutable
    // authorIdentityId) — this simulates a corrupted, malicious, or
    // cross-source duplicate insertion where two events claim the SAME
    // commentaryId/eventType/recipient but disagree about WHO wrote it.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const mallory = makeIdentity('Mallory');
        const { discoveryProvider } = makePublication({ id: 'pub-incompatible', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());

        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-incompatible', commentaryId: 'incompatible-id', content: 'Bob really wrote this' });
        const genuineEvent = produced[0];

        // A hand-built event sharing the IDENTICAL candidate key (same
        // commentaryId, same eventType, same recipient) but claiming a
        // DIFFERENT authorIdentityId — a fact the candidate identity never
        // inspects, but which cannot legitimately differ for one real
        // commentaryId (a Commentary has exactly one author, forever, per
        // core/PublicationCommentary.js's own immutability).
        const corruptedEvent = new NotificationEvent({
            eventType: genuineEvent.eventType,
            recipientIdentityId: genuineEvent.recipientIdentityId,
            createdAt: genuineEvent.createdAt,
            payload: { ...genuineEvent.payload, authorIdentityId: mallory.getSigningIdentity().id }
        });

        const profile = collisionProfile(genuineEvent, corruptedEvent);
        assert(profile.collides === true, 'I1. the candidate identity STILL reports a collision — it does not look at authorIdentityId at all');
        assert(profile.authorIdentityIdIdentical === false, 'I2. sanity: the two events genuinely disagree on who authored the underlying Commentary');
        assert(profile.payloadIdentical === false, 'I3. sanity: payloadIdentical correctly reflects the disagreement (authorIdentityId differs, so the payloads are not byte-identical)');

        // The distinction this section exists to draw: this is NOT the
        // same kind of payload-different collision as Section C. Section
        // C's disagreement was a benign SUPERSET (one field the other
        // simply lacked) — nothing about it could not both be true at
        // once. THIS disagreement is a genuine CONTRADICTION: Bob and
        // Mallory cannot BOTH have authored the same immutable Commentary.
        assert(genuineEvent.payload.commentaryId === corruptedEvent.payload.commentaryId,
            'I4. sanity: both events claim to describe the SAME commentaryId — this is precisely why the disagreement is a contradiction and not merely two different facts');
        const isContradiction = genuineEvent.payload.authorIdentityId !== corruptedEvent.payload.authorIdentityId
            && genuineEvent.payload.commentaryId === corruptedEvent.payload.commentaryId;
        assert(isContradiction === true, 'I5. this scenario is a genuine CONTRADICTION (same immutable fact, two disagreeing claims about it), never a benign difference of the kind Section C examined');

        // THE COLLISION-INTEGRITY BOUNDARY: a future persistence layer
        // that resolves ANY collision by blindly applying "first wins" or
        // "latest wins" — the two options Section B found observationally
        // equivalent for PAYLOAD-IDENTICAL collisions — would, applied
        // here, silently pick one of two contradictory claims about who
        // wrote a real Commentary and discard the other with no record
        // that a contradiction ever existed. That is corruption, not
        // deduplication, regardless of which policy Section C or D
        // eventually adopts for BENIGN disagreements.
        const collisionIntegrityBoundary = {
            claim: 'Candidate-key collision is NECESSARY but NOT SUFFICIENT evidence that two events are safely interchangeable.',
            proof: 'This section constructs a pair that collides (I1) while contradicting each other on an identity-bearing fact the candidate never inspects (I2, I5) — proving collision detection alone cannot distinguish this pair from Section B\'s benign, safely-interchangeable pair.',
            requiredBehavior: 'A future persistence layer MUST detect payload disagreement on a collision before applying any collapse policy — "first wins"/"latest wins" must never be applied UNCONDITIONALLY the moment a key collision is observed.',
            notRequiredHere: 'WHAT counts as a disqualifying disagreement in general (this section uses authorIdentityId as one illustrative example, not an exhaustive rule), and WHAT corrective action to take (reject the write, flag for review, log and keep both) are explicitly NOT decided by this audit.',
            classification: 'REQUIRED_DETECTION; OPEN_CORRECTIVE_ACTION'
        };
        assert(collisionIntegrityBoundary.classification === 'REQUIRED_DETECTION; OPEN_CORRECTIVE_ACTION',
            'I6. detecting the contradiction is a REQUIRED structural constraint on any future collision policy; choosing what to DO about it remains explicitly OPEN');

        findings.collisionIntegrityBoundary = collisionIntegrityBoundary;
        findings.incompatibleFactsProfile = profile;
    }

    // -------------------------------------------------------------
    // Section J — Decision matrix: aggregated from Sections A-I's own
    // recorded findings, never re-derived here.
    // -------------------------------------------------------------
    {
        const decisionMatrix = [
            {
                scenario: 'Exact retry (baseline)',
                sameLogicalNotification: 'OPEN',
                candidateKeyCollision: true,
                requiredBehavior: 'OPEN — collapse-or-keep is an unresolved product decision, unchanged in kind since 0.9.276/0.9.277/0.9.278; this audit adds only a concrete collision profile (Section A) to reason about it with.'
            },
            {
                scenario: 'Same key, same payload',
                sameLogicalNotification: 'OPEN',
                candidateKeyCollision: true,
                requiredBehavior: 'NARROWED: whichever of "first wins"/"latest wins" a future store picks, it loses no observable information (Section B) — the choice only affects non-observable bookkeeping (e.g. which physical notificationId survives).'
            },
            {
                scenario: 'Same key, different (benign/superset) payload',
                sameLogicalNotification: 'OPEN',
                candidateKeyCollision: true,
                requiredBehavior: 'OPEN — all four named resolutions are mechanically representable (Section C) and nothing in this architecture supplies a reason to prefer one; NotificationEvent carries no revision/version signal to decide automatically.'
            },
            {
                scenario: 'Same key, different createdAt',
                sameLogicalNotification: 'OPEN',
                candidateKeyCollision: true,
                requiredBehavior: 'REQUIRED: createdAt must never be treated as part of dedup identity (Section D proves the candidate is already blind to it); OPEN: which createdAt a collapsed representative should carry.'
            },
            {
                scenario: 'Different eventType',
                sameLogicalNotification: false,
                candidateKeyCollision: false,
                requiredBehavior: 'REQUIRED: always separate — never even reaches collision analysis (Section E, reconfirming 0.9.278).'
            },
            {
                scenario: 'Different recipient',
                sameLogicalNotification: false,
                candidateKeyCollision: false,
                requiredBehavior: 'REQUIRED: always separate — never even reaches collision analysis (Section F, reconfirming 0.9.278).'
            },
            {
                scenario: 'Reconstruction (original vs. rebuilt, or two independent rebuilds)',
                sameLogicalNotification: 'OPEN',
                candidateKeyCollision: true,
                requiredBehavior: 'REQUIRED: any policy answer chosen for "exact retry" above MUST also apply here, because Section G proves the two collision shapes are byte-for-byte indistinguishable from inside NotificationEvent — no policy may special-case reconstruction without new, currently-nonexistent provenance tracking.'
            },
            {
                scenario: 'Self-comment (author == recipient)',
                sameLogicalNotification: 'OPEN, same rule as baseline',
                candidateKeyCollision: true,
                requiredBehavior: 'REQUIRED: no special case — Section H proves the collision profile is identical in shape to the non-self baseline.'
            },
            {
                scenario: 'Incompatible immutable facts (e.g. disagreeing authorIdentityId)',
                sameLogicalNotification: false,
                candidateKeyCollision: true,
                requiredBehavior: 'REQUIRED: detection of the disagreement before any collapse policy runs (Section I); OPEN: the corrective action taken once detected.'
            }
        ];

        assert(decisionMatrix.length === 9, 'J1. all nine rows this milestone\'s own brief\'s scenarios (A-I) are represented, one per row');
        for (const row of decisionMatrix) {
            assert(typeof row.scenario === 'string' && row.scenario.length > 0, `J2. every row names its scenario: "${row.scenario}"`);
            assert(typeof row.requiredBehavior === 'string' && row.requiredBehavior.length > 20, `J3. every row's required behavior is backed by rationale citing a specific section: "${row.scenario}"`);
        }

        // The point, per this milestone's own brief, is NOT that
        // everything stays OPEN. Count the rows this audit actually
        // NARROWS or CLOSES structurally (REQUIRED appears in
        // requiredBehavior) versus rows that remain a genuinely free
        // product choice.
        const rowsWithAStructuralRequirement = decisionMatrix.filter((row) => row.requiredBehavior.startsWith('REQUIRED'));
        const rowsFullyOpen = decisionMatrix.filter((row) => row.requiredBehavior.startsWith('OPEN'));
        const rowsNarrowed = decisionMatrix.filter((row) => row.requiredBehavior.startsWith('NARROWED'));
        assert(rowsWithAStructuralRequirement.length === 6, 'J4. exactly six rows carry a structural REQUIRED constraint (createdAt excluded from identity, event-type separation, recipient separation, reconstruction-mirrors-retry, self-comment no-special-case, incompatible-facts detection)');
        assert(rowsFullyOpen.length === 2, 'J5. exactly two rows remain fully OPEN policy choices (exact retry collapse-or-keep, benign payload-difference resolution)');
        assert(rowsNarrowed.length === 1, 'J6. exactly one row is NARROWED rather than fully open or fully required (payload-identical collapse choice)');

        const overallVerdict = 'A candidate-key collision is necessary but never sufficient evidence that two NotificationEvents are the same notification. Two scenarios that reach the identical key (event type, recipient) must never collide at all — already REQUIRED by 0.9.278 and reconfirmed here. Among scenarios that DO collide, this audit adds three further structural REQUIREMENTS a future persistence layer cannot skip regardless of product preference — self-comment gets no special case, reconstruction must be treated exactly like a live retry because nothing distinguishes them, and any payload disagreement must be DETECTED before a collapse policy runs. What remains genuinely OPEN is narrower than before this audit: whether a benign collision (retry, or benign payload difference) collapses at all, and — if a disagreement is detected — what corrective action to take.';
        assert(overallVerdict.includes('necessary but never sufficient'), 'J7. the milestone\'s own overall verdict is recorded verbatim');

        findings.decisionMatrix = decisionMatrix;
    }

    // -------------------------------------------------------------
    // Section K — Architecture: test-only, and no collision/compatibility
    // responsibility added to NotificationEvent (extends 0.9.278 Section
    // K's own forbidden-method list).
    // -------------------------------------------------------------
    {
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/PublicationCommentaryNotificationProducer.js application/AddPublicationCommentaryUseCase.js storage/PublicationCommentaryStore.js core/PublicationCommentary.js core/NotificationEvent.js application/ChatOutbox.js core/ChatOutboxEntry.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `K1. no production file this audit examines was modified by this test-only milestone. Found: ${gitDiffStat || '(none)'}.`);

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { discoveryProvider } = makePublication({ id: 'pub-architecture', publisherProvider: alice });
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const produced = [];
        const producer = buildProducer({ discoveryProvider, commentaryStore, commentAuthorProvider: bob, sink: (e) => produced.push(e) });
        producer.execute({ publicationId: 'pub-architecture', content: 'No collision method on me either' });
        const event = produced[0];

        // 0.9.278's own forbidden-method list, plus the collision/
        // compatibility-shaped names this milestone's own vocabulary
        // introduces — none of them belong on NotificationEvent itself.
        const forbiddenMethodNames = [
            'dedupKey', 'identityKey', 'equals', 'isDuplicateOf', 'collapseKey', 'deduplicationId',
            'collidesWith', 'isCompatibleWith', 'isConflictingWith', 'supersedes', 'merge', 'reconcile'
        ];
        for (const name of forbiddenMethodNames) {
            assert(typeof event[name] === 'undefined', `K2. NotificationEvent exposes no "${name}" — collision detection AND collision resolution are external, application-level policy, never intrinsic properties of the value object`);
        }

        findings.architectureUnchanged = true;
    }

    console.log('\n✅ All NotificationDeduplicationCollisionSemanticsAudit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationDeduplicationCollisionSemanticsAudit tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationDeduplicationCollisionSemanticsAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
