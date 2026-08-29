import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { reconstructPublisherLeaderboardClaimHistory } from './PublisherLeaderboardClaimHistoryView.js';

// 0.8.133 — Claim Evolution Projection.
//
// 0.8.132 answered "what do these claims have in common, or not, with one
// another?" — relationships AMONG claims, computed once, over the whole
// history at once, with no notion of a per-signer sequence. It deliberately
// left one question unanswered, naming it explicitly in its own "Deliberately
// excluded" list: "a temporal narration of how a signer's claims changed over
// successive snapshots." This file is that projection, and nothing more:
//
//   LeaderboardClaimHistory (0.8.123, UNCHANGED)
//          │
//          │  describePublisherLeaderboardClaimEvolution()  (THIS MILESTONE)
//          ▼
//   { signerCount, claimCount,
//     signerEvolutions: [{ signerIdentityId, claimCount,
//                           claims: [{ claimId, claimCreatedAt, receivedAt,
//                                      evidenceFingerprint, policyVersion,
//                                      snapshotFingerprint, origin }] }] }
//
// THE QUESTION IS "HOW DOES ONE SIGNER'S OWN SEQUENCE OF CLAIMS LOOK?" —
// NEVER "DID THAT SIGNER GET BETTER, WORSE, OR MORE TRUSTWORTHY?" This file
// holds 0.8.132's own boundary again, one layer over: grouping a signer's
// claims into a sequence is a structural fact about WHICH claims a signer
// made and in WHAT ORDER they were created, never a verdict about the
// signer or about whether a later claim is any kind of improvement over an
// earlier one. See `docs/Principles.md`, "An Achievement Describes An
// Attributable Fact, Not A Person's Worth (0.8.102)," held here again over a
// signer's own successive claims.
//
// "EVOLUTION" NAMES THE MILESTONE; IT NEVER NAMES A FIELD. Exactly as
// 0.8.132's own header holds for "agreement"/"divergence": the milestone
// title borrows the ordinary English word a reader reaches for first, but
// the word never appears in this file's own data model — grep it and
// "evolution" occurs only in this header comment, the exported function
// names (`describePublisherLeaderboardClaimEvolution()`,
// `reconstructPublisherLeaderboardClaimEvolution()`, and this file's own
// name), never as a key on any returned object. The result carries
// `signerEvolutions` (a per-signer list of claim SEQUENCES — a factual,
// structural word, never `signerImprovements`, `signerProgress`, or
// `signerTrajectories`) precisely so a reader can attach whichever verdict
// they like on top; this file supplies only the underlying sequence.
//
// CLAIM IDENTITY, NEVER RECEIPT IDENTITY, GOVERNS EVERY SEQUENCE — REUSING,
// NEVER RE-DERIVING, 0.8.128'S AND 0.8.132'S OWN DISTINCTION. `claimCount`
// at the top level counts RECEIPTS, exactly as 0.8.128's and 0.8.132's own
// `claimCount` already do — every stored `LeaderboardClaimRecord`, including
// every duplicate arrival of the identical claim (0.8.123's own
// multiplicity rule, UNCHANGED). But a signer's own claim SEQUENCE is built
// over DISTINCT CLAIMS, deduplicated by `claim.id` — the same claim received
// twice never appears twice in a `signerEvolutions` entry's own `claims`
// list, and never inflates that entry's own `claimCount`. The first receipt
// of each distinct claim id, in `history`'s own order, supplies that
// entry's fields (`claimCreatedAt`, `evidenceFingerprint`, `policyVersion`,
// `snapshotFingerprint`, `origin`) and its own `receivedAt`; every later
// receipt of the identical claim id contributes nothing further.
//
// GROUPED BY `signerIdentityId`, THEN ORDERED WITHIN EACH GROUP BY
// `claimCreatedAt` — NEVER BY `receivedAt`. See this file's own header, "Do
// Not Sort By `receivedAt` And Call That Evolution," below. `signerEvolutions`
// itself is ordered by each signer's own first appearance while scanning
// the distinct-claim list in `history`'s own order (oldest-received claim
// first) — the identical "first appearance, never sorted" discipline
// 0.8.128's and 0.8.132's own groupings already hold. Within one signer's
// own `claims` list, entries are ordered by `claimCreatedAt` ascending, with
// the claim's own first-receipt position in `history` as the tie-break for
// two claims that genuinely share one `claimCreatedAt` — the identical
// stable-tie-break shape 0.8.129's own timeline already uses, held here
// over a different primary key.
//
// DO NOT SORT BY `receivedAt` AND CALL THAT "EVOLUTION" — THE ONE DESIGN
// DECISION THIS MILESTONE EXISTS TO MAKE EXPLICIT. `receivedAt` is THIS
// REPLICA'S OWN clock, the moment this particular replica happened to learn
// of a claim (0.8.123/0.8.129, UNCHANGED) — it says nothing about the order
// in which the SIGNER produced their own successive claims, and two
// replicas can receive the identical set of a signer's claims in two
// genuinely different orders depending on how each one happened to
// synchronize. `claimCreatedAt` (`claim.createdAt`, 0.8.121, UNCHANGED) is
// the signer's OWN declared creation time — the one ordering key that
// describes the signer's own claim-making sequence rather than this
// replica's own reception history. Ordering `signerEvolutions[*].claims` by
// `claimCreatedAt` gives the projection a useful, honest meaning: THE
// SEQUENCE OF CLAIMS ACCORDING TO THE SIGNER'S OWN DECLARED CREATION TIME.
//
// BUT `claimCreatedAt` IS NOT A GLOBALLY AUTHORITATIVE CHRONOLOGY — IT COMES
// FROM THE SIGNER'S OWN, UNVERIFIED CLOCK. This file never claims
// `claimCreatedAt` ordering reflects true wall-clock order across different
// signers, or even reliably across one signer's own claims if that signer's
// clock ever moved backward — it reflects only what the signer's OWN
// signature declares. `receivedAt` is retained on every entry as separate,
// independent metadata (exactly as 0.8.129's own timeline retains both
// clocks side by side) precisely so a reader who wants THIS replica's own
// reception order can still recover it — from the SAME entries, without a
// second projection — while the ordering `signerEvolutions` itself commits
// to remains `claimCreatedAt`. A future milestone MAY expose both orderings
// explicitly as `creationOrder`/`receptionOrder`; this milestone does not,
// deliberately — see "Deliberately Excluded," below.
//
// EVIDENCE/SNAPSHOT CHANGE IS OBSERVED, NEVER INTERPRETED. A signer's
// successive claims can name genuinely different `evidenceFingerprint`,
// `policyVersion`, or `snapshotFingerprint` values — this file states
// exactly which values each successive claim names and draws no conclusion
// about whether the change represents improvement, regression, upgrade,
// downgrade, progress, maturity, or quality. This file carries no
// `improved`, `regressed`, `upgraded`, `downgraded`, `progress`, `maturity`,
// `quality`, `trust`, `confidence`, or `reputation` field, individually or
// combined, anywhere in its result or its own source. See 0.8.132's own
// header, "A Common Evidence Fingerprint Does Not Imply A Common Snapshot,"
// for the sibling restraint this milestone holds over a single signer's own
// sequence instead of a pairwise relationship.
//
// ARCHITECTURAL BOUNDARY: STRUCTURAL FACTS ABOUT ONE SIGNER'S OWN STORED
// CLAIMS, NEVER A VERIFICATION, TRUST, OR RANKING DETERMINATION OF ANY
// KIND — THE IDENTICAL BOUNDARY 0.8.127/0.8.128/0.8.129/0.8.132 ALREADY
// HOLD, HELD HERE AGAIN OVER PER-SIGNER SEQUENCE INSTEAD OF DIFFERENCE,
// COUNTS, CHRONOLOGY, OR RELATIONSHIP. This file imports nothing from
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardClaimVerificationView.js`, or
// `application/PublisherLeaderboardClaimVerificationHistoryView.js`
// (0.8.120/0.8.124/0.8.125) — grep it and none of that vocabulary appears.
// A signer's claim sequence is reported exactly as stored, full stop —
// never "this signer's claims got more reliable," and this file never
// consults either replica's own CURRENT evidence to decide whether any
// claim in the sequence still holds.
//
// NO SEMANTIC INTERPRETATION, NO SCORE, NO RANK. This file carries no
// `valid`, `verified`, `trusted`, `trust`, `confidence`, `score`, `rank`, or
// `reputation` field, individually or combined, anywhere in its result.
//
// `describePublisherLeaderboardClaimEvolution()`/
// `reconstructPublisherLeaderboardClaimEvolution()` — THE IDENTICAL SPLIT
// EVERY OTHER FILE IN THE CLAIM-HISTORY FAMILY ALREADY HOLDS.
// `describePublisherLeaderboardClaimEvolution()` is the pure computation,
// over one plain `LeaderboardClaimHistory` array.
// `reconstructPublisherLeaderboardClaimEvolution()` below pulls a replica's
// own stored `LeaderboardClaimHistory` straight out of an archive via
// `application/PublisherLeaderboardClaimHistoryView.js`'s own
// `reconstructPublisherLeaderboardClaimHistory()` (0.8.130, UNCHANGED), then
// hands it, unchanged, to the pure computation — word for word 0.8.132's
// own `reconstructPublisherLeaderboardClaimAgreement()` reasoning, held here
// again.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history or any record/claim it holds. Returns
// frozen objects and frozen arrays throughout. Calling either function
// twice with a byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `LeaderboardClaimRecord` instances are all tolerated exactly as
// 0.8.128's/0.8.132's own describe functions already tolerate their own
// history argument: non-`LeaderboardClaimRecord` entries are silently
// excluded, and an entirely malformed/absent history produces
// `signerCount`/`claimCount` at zero and an empty `signerEvolutions` array.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No verification, trust, or
// "which claim is currently valid" determination of any kind — see
// "Architectural Boundary," above. No improvement/regression/quality
// judgment of any kind — see "Evidence/Snapshot Change Is Observed, Never
// Interpreted," above. No `creationOrder`/`receptionOrder` dual-ordering
// exposure — see "Do Not Sort By `receivedAt`," above; a later
// timeline-comparison milestone, over the same underlying facts this file
// exposes, may add that. No cross-signer comparison of two signers' own
// sequences (e.g. "which snapshots did Alice and Bob both pass through") —
// that composes 0.8.132's own `sharedSnapshotGroups` with this file's own
// per-signer sequences, and is genuinely separate, later work. No
// "difference between two of a signer's own successive claims" (e.g. what
// exactly changed between claim A and claim B) — 0.8.134's own, separately
// sized, later question, over two whole SNAPSHOTS rather than one signer's
// claim metadata. No automatic, periodic, or background computation of any
// kind — this function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardClaimEvolution(history) {
    const records = (Array.isArray(history) ? history : []).filter((record) => record instanceof LeaderboardClaimRecord);

    const distinctClaimEntries = [];
    const seenClaimIds = new Set();
    for (const record of records) {
        const claimId = record.claim.id;
        if (seenClaimIds.has(claimId)) continue;
        seenClaimIds.add(claimId);
        distinctClaimEntries.push({ record, position: distinctClaimEntries.length });
    }

    const signerOrder = [];
    const entriesBySigner = new Map();
    for (const entry of distinctClaimEntries) {
        const signerIdentityId = entry.record.claim.signerIdentityId;
        let entries = entriesBySigner.get(signerIdentityId);
        if (!entries) {
            entries = [];
            entriesBySigner.set(signerIdentityId, entries);
            signerOrder.push(signerIdentityId);
        }
        entries.push(entry);
    }

    const signerEvolutions = signerOrder.map((signerIdentityId) => {
        const entries = entriesBySigner.get(signerIdentityId).slice();
        entries.sort((a, b) => {
            const createdAtDelta = a.record.claim.createdAt.getTime() - b.record.claim.createdAt.getTime();
            if (createdAtDelta !== 0) return createdAtDelta;
            return a.position - b.position;
        });

        const claims = entries.map(({ record }) => Object.freeze({
            claimId: record.claim.id,
            claimCreatedAt: record.claim.createdAt.toISOString(),
            receivedAt: record.receivedAt.toISOString(),
            evidenceFingerprint: record.claim.evidenceFingerprint,
            policyVersion: record.claim.policyVersion,
            snapshotFingerprint: record.claim.snapshotFingerprint,
            origin: record.origin
        }));

        return Object.freeze({
            signerIdentityId,
            claimCount: claims.length,
            claims: Object.freeze(claims)
        });
    });

    return Object.freeze({
        signerCount: signerEvolutions.length,
        claimCount: records.length,
        signerEvolutions: Object.freeze(signerEvolutions)
    });
}

// reconstructPublisherLeaderboardClaimEvolution() — this replica's own
// archive-reading entry point, mirroring every other `reconstructXxx()` in
// the claim-history family exactly: it pulls this replica's own stored
// `LeaderboardClaimHistory` straight out of `archive` via
// application/PublisherLeaderboardClaimHistoryView.js's own
// `reconstructPublisherLeaderboardClaimHistory()` (0.8.130, UNCHANGED),
// then hands it, unchanged, to the pure computation above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// (via that same function), never a throw.
export function reconstructPublisherLeaderboardClaimEvolution(archive) {
    return describePublisherLeaderboardClaimEvolution(reconstructPublisherLeaderboardClaimHistory(archive));
}
