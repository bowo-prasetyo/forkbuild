// 0.9.280 — Notification Deduplication Policy Boundary.
//
// 0.9.278 characterized five candidate dedup identities without adopting
// one. 0.9.279 fixed the strongest surviving candidate as an audit-only
// collision detector and proved a key collision is necessary but never
// sufficient evidence that two `NotificationEvent`s are the same
// notification. Neither milestone wrote any of it down as something a
// real caller could actually use — both were test-only, by their own
// brief. This file is that missing seam: the first production
// consumer of either audit's findings, and deliberately nothing more.
//
//   NotificationEvent            = immutable fact
//   NotificationDeduplicationPolicy = external decision about equivalence
//   (a future) NotificationEventStore = persistence mechanism
//
// This ordering matters. The identity and collision questions 0.9.278/
// 0.9.279 raised are DECISIONS ABOUT `NotificationEvent`s, made from
// OUTSIDE the fact they describe — never a capability of the fact
// itself. Putting this logic on `NotificationEvent` (a `dedupKey()`, an
// `equals()`) would make the eventual store's schema and this policy's
// semantics the same thing by accident. Keeping it here, a plain module
// with no state and no configuration, means a future
// `NotificationEventStore` consumes this policy rather than
// reimplementing or absorbing it.
//
// THE ADOPTED IDENTITY, for the current Commentary producer only
// (`application/PublicationCommentaryNotificationProducer.js`):
// `commentaryId + eventType + recipientIdentityId` — 0.9.278 Section I's
// own surviving content-based candidate. Deliberately excluded from it,
// per 0.9.278/0.9.279's own findings:
//
//   notificationId       — never collapses anything by construction
//                           (0.9.278 Section C); including it would make
//                           this policy indistinguishable from raw
//                           object identity.
//   createdAt             — a genuine, required fact field (0.9.273's own
//                           header), but the candidate identity is blind
//                           to it by construction (0.9.279 Section D) —
//                           two events can legitimately disagree on WHEN
//                           without disagreeing on WHAT.
//   payload (as a whole)  — only `payload.commentaryId` participates in
//                           identity; every other payload field (e.g.
//                           `authorIdentityId`) is a fact ABOUT the
//                           notification, inspected below for conflict,
//                           never used to compute WHICH notification this
//                           is.
//   producer invocation   — structurally impossible to include: no
//                           `NotificationEvent` field records which
//                           producer call constructed it (0.9.278 Section
//                           B), so two independent invocations of the
//                           SAME fact are never distinguished from one
//                           reconstruction of it. This formally retires
//                           0.9.278's own fifth candidate.
//
// COLLISION HANDLING: INSPECT, NEVER OVERWRITE. A shared identity is
// evidence a persistence layer MUST inspect further, never evidence it
// may blindly apply "first wins" or "latest wins" — 0.9.279 Section I's
// own collision-integrity boundary, made executable here as
// `classifyNotificationCollision()`'s three-way result instead of a
// caller-supplied boolean:
//
//   NO_MATCH — different logical notifications. Either the identity
//              differs outright, or nothing here even claims to compare
//              them.
//   MATCH    — same logical identity, and every payload field the two
//              events share agrees. This includes the payload-identical
//              case (0.9.279 Section B) AND the benign-superset case
//              (0.9.279 Section C, e.g. a future producer revision
//              attaching an extra field) — both were left OPEN by
//              0.9.279 itself; this milestone now DECIDES that a shared
//              identity with no shared-field disagreement is safe to
//              treat as one notification, closing exactly that gap and
//              no other.
//   CONFLICT — same logical identity, but the two events disagree on a
//              payload field they both carry (0.9.279 Section I, e.g.
//              two different claimed `authorIdentityId` values for one
//              immutable Commentary). This is a contradiction, not a
//              duplicate, and this policy never resolves it — it only
//              refuses to call it a MATCH. What a persistence layer does
//              upon seeing CONFLICT (reject, flag, log-and-keep-both)
//              stays exactly as OPEN as 0.9.279 left it.
//
// SELF-COMMENT GETS NO SPECIAL CASE, exactly as 0.9.279 Section H already
// proved for its own audit candidate: `recipientIdentityId` is read the
// same way whether or not it equals the Commentary's own
// `authorIdentityId`. Nothing in this file even asks the question.
//
// PURE AND DEPENDENCY-FREE, like `core/NotificationEvent.js` itself: no
// imports, no `Date`/`Math.random`/`createId`, no storage or provider of
// any kind, no mutation of either argument. Every function here is a
// referentially transparent computation over the two `NotificationEvent`
// arguments it is given — see this file's own purity checks in
// `tests/NotificationDeduplicationPolicy.test.js`, Section K.
//
// DELIBERATELY EXCLUDED FROM THIS MILESTONE, per its own brief:
// `NotificationEventStore`, deterministic `notificationId`, an inbox,
// delivery, read/unread state, notification lifecycle, TTL, retry
// queues, fan-out implementation, `ChatOutbox` reuse, UI, and any change
// to `NotificationEvent` itself or to
// `PublicationCommentaryNotificationProducer`. This file answers "are
// these the same notification, and can I trust that answer" — nothing
// about what happens next.
export const NotificationCollisionOutcome = Object.freeze({
    NO_MATCH: 'NO_MATCH',
    MATCH: 'MATCH',
    CONFLICT: 'CONFLICT'
});

// The executable form of this policy's own domain decisions — queried
// directly rather than only asserted in this file's own header, so
// `tests/NotificationDeduplicationPolicy.test.js` Section A can verify
// the descriptor against `classifyNotificationCollision()`'s actual
// behavior instead of trusting prose.
const DESCRIPTOR = Object.freeze({
    identityDimensions: Object.freeze(['commentaryId', 'eventType', 'recipientIdentityId']),
    notificationIdParticipatesInIdentity: false,
    createdAtParticipatesInIdentity: false,
    payloadParticipatesInIdentity: false,
    producerInvocationParticipatesInIdentity: false,
    collisionHandling: 'INSPECT_FOR_CONFLICT',
    reconstructionIsStable: true,
    recipientFanOutIsSeparated: true,
    eventTypeIsSeparated: true,
    selfCommentIsSpecialCased: false
});

export function describeNotificationDeduplicationPolicy() {
    return {
        ...DESCRIPTOR,
        identityDimensions: [...DESCRIPTOR.identityDimensions]
    };
}

// The adopted logical identity for the current Commentary producer:
// `commentaryId + eventType + recipientIdentityId`. `eventType` and
// `recipientIdentityId` are read directly off the `NotificationEvent`;
// `commentaryId` is read from `payload` — the one payload field this
// policy elevates to identity, per this file's own header.
export function notificationDeduplicationIdentity(event) {
    return `${event.payload.commentaryId}::${event.eventType}::${event.recipientIdentityId}`;
}

export function haveSameNotificationDeduplicationIdentity(eventA, eventB) {
    return notificationDeduplicationIdentity(eventA) === notificationDeduplicationIdentity(eventB);
}

// The three-way collision classification this milestone exists to make
// executable. A shared identity with no shared-field payload
// disagreement is MATCH; a shared identity with one is CONFLICT; no
// shared identity at all is NO_MATCH. Never mutates either argument,
// never picks a "winner" between them.
export function classifyNotificationCollision(eventA, eventB) {
    if (!haveSameNotificationDeduplicationIdentity(eventA, eventB)) {
        return NotificationCollisionOutcome.NO_MATCH;
    }
    return payloadsAgreeOnSharedFields(eventA.payload, eventB.payload)
        ? NotificationCollisionOutcome.MATCH
        : NotificationCollisionOutcome.CONFLICT;
}

// Compatible means: every field the two payloads BOTH carry agrees. A
// field present in only one payload (0.9.279 Section C's own benign
// superset) is never, by itself, a disagreement — only a value that
// differs for the SAME key is.
function payloadsAgreeOnSharedFields(payloadA, payloadB) {
    for (const key of Object.keys(payloadA)) {
        if (key in payloadB && !deepValuesAreEqual(payloadA[key], payloadB[key])) {
            return false;
        }
    }
    return true;
}

function deepValuesAreEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
