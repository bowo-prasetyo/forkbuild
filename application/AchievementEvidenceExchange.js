import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';
import { PublisherPublicationAssociationRecord } from './PublisherPublicationAssociationRecord.js';
import { describeAchievementEvidenceFingerprint } from './AchievementEvidenceFingerprint.js';
import {
    AchievementEvidenceMergeOutcome,
    mergeAchievementEvidence
} from './AchievementEvidenceMerge.js';

// 0.8.118 — Portable Evidence Synchronization Exchange.
//
// 0.8.116 gave two replicas a fast way to learn THAT their evidence
// differs (compare two fingerprints). 0.8.117 gave a replica holding
// BOTH archives at once a way to learn EXACTLY what differs
// (`sourceOnly`/`targetOnly`, per collection). Neither ever moved a single
// fact anywhere — both are pure comparisons over archives a caller already
// holds side by side. This file is the missing step in between: the
// explicit, PORTABLE messages one replica sends and the other replies with
// when they do NOT already hold both archives — the shape 0.8.117's own
// header already named as its own "What's left":
//
//   "I have fingerprint X."
//           │
//           ▼
//   "You differ."
//           │
//           ▼
//   "Here are the evidence facts I lack."
//           │
//           ▼
//   mergeAchievementEvidence()
//           │
//           ▼
//   new fingerprint
//
// Concretely, three narrow responsibilities, each a thin wrapper over a
// milestone this codebase already built and never reimplemented here:
//
//   reconstructAchievementEvidenceExchangeRequest(archive)
//        — "here is the fingerprint I currently hold" (0.8.116, reused
//          unchanged, wearing a protocol envelope)
//   reconstructAchievementEvidenceExchangeResponse(request, targetArchive)
//        — "here is what you need, or nothing at all" (evidence shaped
//          exactly like 0.8.114's own export payload)
//   applyAchievementEvidenceExchange(archive, response)
//        — "fold that into my own archive" (0.8.115's own merge, called
//          once, unchanged)
//
//   Replica A                                  Replica B
//      │  reconstructAchievementEvidenceExchangeRequest(archiveA)         │
//      ├───────────────────────────────────────────────────────────────► │
//      │                    { protocolVersion, evidenceFingerprint }     │
//      │                                                                  │
//      │        reconstructAchievementEvidenceExchangeResponse(request,  │
//      │                                                        archiveB)│
//      │ ◄─────────────────────────────────────────────────────────────── │
//      │   { sameEvidence, evidence: { four evidence collections } }     │
//      │                                                                  │
//      │  applyAchievementEvidenceExchange(archiveA, response)           │
//      │        │                                                        │
//      │        ▼                                                        │
//      │  a NEW archiveA, holding archiveB's own facts too               │
//      │        │                                                        │
//      │        ▼  (a caller's own, separate, later step — see below)    │
//      │  reconstructAchievementEvents() / ...Statistics() / ...Ranking()│
//      │  / ...Leaderboard()                                             │
//
// "EXCHANGE," NEVER "NETWORKING." This file introduces no peer, no socket,
// no discovery mechanism, no WebRTC, no server, and no automatic
// synchronization of any kind — no polling, no background timer, no retry
// loop, no automatic HTTP call, no WebSocket connection. Every one of the
// three functions above runs exactly once, exactly when a caller
// explicitly calls it, and returns a plain, JSON-safe value — nothing here
// ever reaches for `fetch`, a socket, or a clock. `tests/
// AchievementEvidenceExchange.test.js`'s own flagship proves this codebase
// can already test its entire decentralized synchronization model inside
// ONE process, holding two independent `PublicationObservationArchive`
// instances side by side, and passing plain objects between them by hand
// — no infrastructure of any kind. A real transport (0.8.122, "Explicit
// Peer/Transport Boundary" — moving these exact three plain objects across
// an actual wire) is separately sized, later work, entirely untouched by
// this file.
//
// THE REQUEST CARRIES ALMOST NOTHING — NEVER THE REQUESTER'S OWN EVIDENCE,
// NEVER A COLLECTION-LEVEL FINGERPRINT, NEVER A CONCLUSION. A request is
// exactly:
//
//   { protocolVersion: 1, evidenceFingerprint: <64-char lowercase hex> }
//
// — the identical, unchanged whole-evidence-set fingerprint 0.8.116's own
// `reconstructAchievementEvidenceFingerprint()` already computes, wearing
// nothing but a protocol version number. It names no achievement, badge,
// statistic, rank, or leaderboard, and it does not even carry the
// requester's own PER-COLLECTION fingerprints (0.8.116's own
// `collectionFingerprints`) — a genuinely smaller, more informative
// request `describeAchievementEvidenceExchangeResponse()` could accept,
// deliberately left unbuilt here so the request stays the one, easiest
// value to state honestly: "this is what I currently hold, as one number."
//
// THE RESPONSE CARRIES THE RESPONDER'S ENTIRE EVIDENCE, NEVER A COMPUTED
// `sourceOnly`/`targetOnly` DIFFERENCE — A DELIBERATE DEPARTURE FROM
// 0.8.117'S OWN VOCABULARY, NOT AN OVERSIGHT. A fingerprint is a one-way
// digest: it tells the responder THAT the requester's evidence differs
// from its own, and nothing whatsoever about WHICH facts the requester is
// missing. Computing an exact, minimal difference the way 0.8.117 already
// can would require the requester to disclose its own evidence collections
// in the request — exactly what "the request carries almost nothing,"
// above, rules out — or a second negotiation round this milestone
// deliberately does not build (see "What's left," below). Rather than
// invent a request shape that leaks evidence to establish a diff, or a
// response shaped like 0.8.117's own `sourceOnly`/`targetOnly` (evidence
// framed as "what you personally lack" — a framing that requires knowing
// what the other side already has), this file's own response is simpler
// and more honest about what a one-fingerprint request can support: when
// fingerprints disagree, hand over the WHOLE evidence set, exactly the
// shape `exportAchievementEvidence()` already produces. This stays correct
// by construction, never merely approximately so — `mergeAchievementEvidence()`'s
// own identity rule (0.8.115) treats every fact the requester already
// holds as a silent no-op the instant it is merged back in, and adds every
// fact it does not — so a requester who applies this response ends up
// exactly caught up to the responder's own evidence: never more, never
// less, regardless of how much of the payload happened to be redundant on
// the requester's own side.
//
// THIS MAKES ONE EXCHANGE DELIBERATELY ONE-DIRECTIONAL — THE REQUESTER
// CATCHES UP TO THE RESPONDER; THE RESPONDER LEARNS NOTHING NEW. Calling
// `applyAchievementEvidenceExchange(archiveA, response)` folds B's
// evidence into A; it never hands anything back to B. Two replicas that
// want to fully converge — each learning what the OTHER one lacks — issue
// the identical exchange in both directions: A requests from B, and,
// independently, B requests from A. `tests/AchievementEvidenceExchange.test.js`'s
// own flagship does exactly this, and only after BOTH directions have
// applied does either replica's own fingerprint agree with the other's.
//
// "NOTHING TO EXCHANGE" IS AN EXPLICIT, WELL-FORMED RESULT, NEVER AN
// ERROR. When the responder's own fingerprint already equals the
// requester's stated `evidenceFingerprint`, `sameEvidence: true` and
// `evidence` is still the identical, valid, schema-shaped payload — every
// one of its four collections simply empty. `applyAchievementEvidenceExchange()`
// applied to that response is a genuine, documented no-op: `mergeAchievementEvidence()`
// itself already returns the EXACT SAME archive instance it was given when
// a payload names nothing new (0.8.115), and an empty-collections payload
// is the smallest possible instance of exactly that case. Two already-
// converged replicas can run this exchange as casually and safely as two
// that have never met.
//
// THE EXCHANGE TRANSPORTS EVIDENCE, NEVER CONCLUSIONS — THE SAME RESTRAINT
// EVERY FILE IN THIS FAMILY ALREADY HOLDS, HELD HERE ONE LAYER UP. Neither
// the request nor the response carries an achievement event, a badge, a
// statistic, a rank, or a leaderboard position — no `achievements`,
// `badges`, `statistics`, `ranking`, or `leaderboard` field anywhere, on
// either message. `evidence`'s own four collections are exactly
// `exportAchievementEvidence()`'s own shape (`schemaVersion` plus the
// identical four evidence collections 0.8.114 already named "the
// achievement evidence") — reused verbatim, never reinvented — so a
// genuine response can be handed straight to `importAchievementEvidence()`
// or `mergeAchievementEvidence()` without any further transformation. This
// file computes no achievement pipeline of any kind; recomputing events,
// statistics, ranking, or the leaderboard over the archive
// `applyAchievementEvidenceExchange()` returns is a caller's own, separate,
// explicit next step — grep this file and `application/AchievementEvent.js`,
// `PublisherAchievementStatisticsView.js`, `PublisherRankingPolicy.js`, and
// `PublisherLeaderboardView.js` are simply not imported here.
//
// EVERY STEP REUSES AN EXISTING PRIMITIVE UNCHANGED — THIS FILE INVENTS NO
// SECOND HASHING SCHEME, NO SECOND DEDUPLICATION RULE, AND NO SECOND
// VALIDATION PATH. The request's own `evidenceFingerprint` is exactly
// `describeAchievementEvidenceFingerprint()`'s own `fingerprint` output,
// called, never recomputed by a competing algorithm. `applyAchievementEvidenceExchange()`
// folds `response.evidence` in by calling `mergeAchievementEvidence()`
// itself — the identical structural-equality identity rule, the identical
// `IMPORTED` provenance stamp, and the identical append-only,
// immutable-instance discipline 0.8.115 already established, reused a
// second time rather than duplicated.
//
// MALFORMED INPUT IS AN EXPLICIT OUTCOME, NEVER A SILENT DEFAULT OR A
// THROWN ERROR. A `request` that is not exactly `{ protocolVersion,
// evidenceFingerprint }`, with the one supported `protocolVersion` and a
// genuine 64-character lowercase hex `evidenceFingerprint`, is
// `INVALID_REQUEST` — `describeAchievementEvidenceExchangeResponse()`
// returns that outcome and nothing else, never a best-effort guess. A
// `response` that is not a genuine `EVIDENCE_DESCRIBED` response —
// including a stray `INVALID_REQUEST` response handed to the wrong
// function by mistake — is `INVALID_RESPONSE` from
// `applyAchievementEvidenceExchange()`, which never touches the caller's
// own `archive` in that case.
//
// SYNCHRONOUS, PURE, NO STORAGE, NO NETWORK, NO CAPABILITY OF ANY KIND.
// None of these three functions reads a clock, touches storage, or
// performs any I/O. Calling any of them twice with byte-identical
// arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No peer, socket, discovery
// mechanism, WebRTC, server, or transport of any kind — see "Exchange,
// never networking," above. No automatic, periodic, or background
// synchronization — no polling, no timer, no retry loop; every exchange
// step runs only when a caller explicitly calls it. No minimal/exact
// evidence diff computed from a fingerprint alone — see "The response
// carries the responder's entire evidence," above, for why that would
// require the request to leak evidence or a second negotiation round this
// milestone does not build. No trust, authenticity, or "which replica is
// correct" determination — a fabricated evidence record exchanges exactly
// like a genuine one, for the identical reason 0.8.115's own merge and
// 0.8.117's own difference already hold no such concept. No achievement
// event, badge, statistic, rank, or leaderboard vocabulary of any kind —
// see "The exchange transports evidence, never conclusions," above. No
// signing, no public/private keys, no credential of any kind.
//
// WHAT'S LEFT, AND DELIBERATELY UNBUILT. This milestone proves evidence
// can be synchronized between two replicas using nothing but plain,
// portable JSON messages and the primitives this codebase already built —
// it never asks whether two replicas that have converged can prove their
// RESULTING leaderboard is reproducible without re-trusting either side's
// own arithmetic (0.8.119, "Reproducible Leaderboard Snapshot," and
// 0.8.120, "Reproducible Leaderboard Snapshot Verification"), never
// packages a publisher's own evidence plus derived views into one portable
// bundle (0.8.121), and never moves any of these three plain objects across
// an actual peer connection (0.8.122, "Explicit Peer/Transport Boundary").
export const AchievementEvidenceExchangeProtocolVersion = 1;

// Must match `application/AchievementEvidenceExport.js`'s own
// (unexported) `SCHEMA_VERSION` exactly, so `evidence` below is always a
// genuine, importable `exportAchievementEvidence()`-shaped payload.
// Deliberately duplicated here as a literal rather than imported — the
// identical "small, self-contained value, duplicated rather than coupling
// two unrelated files" discipline `application/AchievementEvidenceDifference.js`'s
// own `canonicalRecordKey()` and `application/AchievementEvidenceFingerprint.js`'s
// own SHA-256 already hold.
const EVIDENCE_SCHEMA_VERSION = 1;

// The four evidence collections this module reads, in the fixed order the
// entire achievement-evidence family already uses (0.8.114's own
// `TOP_LEVEL_FIELDS`, 0.8.115's own `collectionKeys`, 0.8.116's/0.8.117's
// own `EVIDENCE_COLLECTION_SPECS`) — deliberately duplicated here rather
// than imported, for the identical reason as `EVIDENCE_SCHEMA_VERSION`
// above.
const EVIDENCE_COLLECTION_SPECS = Object.freeze([
    Object.freeze({ key: 'bitcoinAnchorPublicationRecords', RecordClass: BitcoinAnchorPublicationRecord }),
    Object.freeze({ key: 'baseAnchorPublicationRecords', RecordClass: BaseAnchorPublicationRecord }),
    Object.freeze({ key: 'publicationReferenceRecords', RecordClass: PublicationReferenceRecord }),
    Object.freeze({ key: 'publisherPublicationAssociationRecords', RecordClass: PublisherPublicationAssociationRecord })
]);

const EXCHANGE_REQUEST_FIELDS = Object.freeze(['protocolVersion', 'evidenceFingerprint']);

// The pure computation behind a request: reuses `describeAchievementEvidenceFingerprint()`
// unchanged and wraps it in the smallest possible protocol envelope. See
// this file's own header, "The request carries almost nothing."
export function describeAchievementEvidenceExchangeRequest(
    bitcoinAnchorPublicationRecords = [],
    baseAnchorPublicationRecords = [],
    publicationReferenceRecords = [],
    publisherPublicationAssociationRecords = []
) {
    const { fingerprint } = describeAchievementEvidenceFingerprint(
        bitcoinAnchorPublicationRecords, baseAnchorPublicationRecords,
        publicationReferenceRecords, publisherPublicationAssociationRecords
    );
    return Object.freeze({
        protocolVersion: AchievementEvidenceExchangeProtocolVersion,
        evidenceFingerprint: fingerprint
    });
}

// reconstructAchievementEvidenceExchangeRequest() — the ONE, thin,
// archive-reading entry point, mirroring `reconstructAchievementEvidenceFingerprint()`
// exactly. An invalid/missing archive degrades to `PublicationObservationArchive.empty()`
// — never an error.
export function reconstructAchievementEvidenceExchangeRequest(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describeAchievementEvidenceExchangeRequest(
        safeArchive.bitcoinAnchorPublicationRecords, safeArchive.baseAnchorPublicationRecords,
        safeArchive.publicationReferenceRecords, safeArchive.publisherPublicationAssociationRecords
    );
}

export const AchievementEvidenceExchangeResponseOutcome = Object.freeze({
    EVIDENCE_DESCRIBED: 'evidence-described',
    INVALID_REQUEST: 'invalid-request'
});

// The pure computation behind a response. `request` must be exactly the
// shape `describeAchievementEvidenceExchangeRequest()` produces; anything
// else is `INVALID_REQUEST`, with no other field. Otherwise returns a
// frozen:
//
//   {
//       outcome: 'evidence-described',
//       protocolVersion: 1,
//       requesterFingerprint: <request.evidenceFingerprint, echoed>,
//       responderFingerprint: <this side's own fingerprint, 0.8.116>,
//       sameEvidence: <boolean>,
//       evidence: {
//           schemaVersion: 1,
//           bitcoinAnchorPublicationRecords: [...],
//           baseAnchorPublicationRecords: [...],
//           publicationReferenceRecords: [...],
//           publisherPublicationAssociationRecords: [...]
//       }
//   }
//
// When `sameEvidence` is true, every one of `evidence`'s own four
// collections is empty — see this file's own header, "'Nothing to
// exchange' is an explicit, well-formed result." When false, `evidence`
// carries this side's ENTIRE evidence set — see this file's own header,
// "The response carries the responder's entire evidence." Never throws.
// Never mutates any input. Reads no clock, no storage, no network.
export function describeAchievementEvidenceExchangeResponse(
    request,
    targetBitcoinAnchorPublicationRecords = [],
    targetBaseAnchorPublicationRecords = [],
    targetPublicationReferenceRecords = [],
    targetPublisherPublicationAssociationRecords = []
) {
    if (!isValidExchangeRequest(request)) {
        return Object.freeze({ outcome: AchievementEvidenceExchangeResponseOutcome.INVALID_REQUEST });
    }

    const { fingerprint: responderFingerprint } = describeAchievementEvidenceFingerprint(
        targetBitcoinAnchorPublicationRecords, targetBaseAnchorPublicationRecords,
        targetPublicationReferenceRecords, targetPublisherPublicationAssociationRecords
    );
    const requesterFingerprint = request.evidenceFingerprint;
    const sameEvidence = requesterFingerprint === responderFingerprint;

    const evidence = sameEvidence
        ? emptyEvidencePayload()
        : buildEvidencePayload(
              targetBitcoinAnchorPublicationRecords, targetBaseAnchorPublicationRecords,
              targetPublicationReferenceRecords, targetPublisherPublicationAssociationRecords
          );

    return Object.freeze({
        outcome: AchievementEvidenceExchangeResponseOutcome.EVIDENCE_DESCRIBED,
        protocolVersion: AchievementEvidenceExchangeProtocolVersion,
        requesterFingerprint,
        responderFingerprint,
        sameEvidence,
        evidence
    });
}

// reconstructAchievementEvidenceExchangeResponse() — the ONE, thin,
// archive-reading entry point, mirroring `reconstructAchievementEvidenceDifference()`'s
// own "one side reads an archive" shape. An invalid/missing `targetArchive`
// degrades to `PublicationObservationArchive.empty()` — never an error.
export function reconstructAchievementEvidenceExchangeResponse(request, targetArchive) {
    const safeArchive = targetArchive instanceof PublicationObservationArchive ? targetArchive : PublicationObservationArchive.empty();
    return describeAchievementEvidenceExchangeResponse(
        request,
        safeArchive.bitcoinAnchorPublicationRecords, safeArchive.baseAnchorPublicationRecords,
        safeArchive.publicationReferenceRecords, safeArchive.publisherPublicationAssociationRecords
    );
}

export const AchievementEvidenceExchangeApplyOutcome = Object.freeze({
    APPLIED: 'applied',
    INVALID_RESPONSE: 'invalid-response'
});

// `archive` must be a real `PublicationObservationArchive` instance —
// mirrors `mergeAchievementEvidence()`'s own identical, duck-typing-free
// contract. `response` must be a genuine `EVIDENCE_DESCRIBED` response
// (from this file's own `describeAchievementEvidenceExchangeResponse()`/
// `reconstructAchievementEvidenceExchangeResponse()`) — anything else,
// including a well-formed `INVALID_REQUEST` response handed here by
// mistake, is `INVALID_RESPONSE`. Returns a frozen `{ outcome, archive }`:
//
//   APPLIED           — `archive` is exactly what `mergeAchievementEvidence(archive, response.evidence)`
//                        itself would return: a NEW archive holding the
//                        union of both sides' evidence, or, when
//                        `response.evidence` named nothing new (including
//                        the empty "nothing to exchange" payload), the
//                        EXACT SAME instance the caller passed in.
//   INVALID_RESPONSE  — `archive` is `null`. `archive` the caller passed
//                        in is never touched.
//
// This file computes no merge logic of its own — see this file's own
// header, "Every step reuses an existing primitive unchanged."
export function applyAchievementEvidenceExchange(archive, response) {
    if (!(archive instanceof PublicationObservationArchive)) {
        throw new Error('applyAchievementEvidenceExchange() requires a PublicationObservationArchive as archive');
    }
    if (!isPlainObject(response) || response.outcome !== AchievementEvidenceExchangeResponseOutcome.EVIDENCE_DESCRIBED) {
        return Object.freeze({ outcome: AchievementEvidenceExchangeApplyOutcome.INVALID_RESPONSE, archive: null });
    }

    const mergeResult = mergeAchievementEvidence(archive, response.evidence);
    if (mergeResult.outcome !== AchievementEvidenceMergeOutcome.MERGED) {
        return Object.freeze({ outcome: AchievementEvidenceExchangeApplyOutcome.INVALID_RESPONSE, archive: null });
    }

    return Object.freeze({ outcome: AchievementEvidenceExchangeApplyOutcome.APPLIED, archive: mergeResult.archive });
}

function buildEvidencePayload(bitcoinAnchorPublicationRecords, baseAnchorPublicationRecords, publicationReferenceRecords, publisherPublicationAssociationRecords) {
    const inputsByKey = {
        bitcoinAnchorPublicationRecords, baseAnchorPublicationRecords,
        publicationReferenceRecords, publisherPublicationAssociationRecords
    };
    const payload = { schemaVersion: EVIDENCE_SCHEMA_VERSION };
    for (const { key, RecordClass } of EVIDENCE_COLLECTION_SPECS) {
        payload[key] = toJSONArray(inputsByKey[key], RecordClass);
    }
    return Object.freeze(payload);
}

function emptyEvidencePayload() {
    const payload = { schemaVersion: EVIDENCE_SCHEMA_VERSION };
    for (const { key } of EVIDENCE_COLLECTION_SPECS) {
        payload[key] = Object.freeze([]);
    }
    return Object.freeze(payload);
}

// Malformed/absent `records`, or an entry that is not a genuine instance
// of `RecordClass`, is tolerated exactly like every other entry point in
// this codebase's achievement family: the offending entries are silently
// excluded, never thrown on.
function toJSONArray(records, RecordClass) {
    const list = Array.isArray(records) ? records : [];
    return Object.freeze(list.filter((record) => record instanceof RecordClass).map((record) => record.toJSON()));
}

// A request is valid only when it is EXACTLY `{ protocolVersion,
// evidenceFingerprint }` — the one supported `protocolVersion`, and a
// genuine 64-character lowercase hex `evidenceFingerprint`, the identical
// shape `describeAchievementEvidenceFingerprint()`'s own `fingerprint`
// field always takes. No extra field, no missing field.
function isValidExchangeRequest(request) {
    return isPlainObject(request)
        && hasOnlyKeys(request, EXCHANGE_REQUEST_FIELDS)
        && EXCHANGE_REQUEST_FIELDS.every((key) => key in request)
        && request.protocolVersion === AchievementEvidenceExchangeProtocolVersion
        && isFingerprintHex(request.evidenceFingerprint);
}

function isFingerprintHex(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
}
