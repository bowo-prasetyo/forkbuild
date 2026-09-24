import { sha256Hex } from '../../core/Sha256.js';

// 0.8.160 — Explicit Reconciliation Plan Identity Projection.
//
// 0.8.157 through 0.8.159 all pass an explicitly supplied `plan` (0.8.143's
// own result) through, unchanged, as one argument among several, and every
// one of their own headers repeats the identical caveat: "possibly the
// very same plan, possibly a different one entirely." A caller who wants
// to know WHICH plan produced a given `candidateMatchesPlan` fact has had
// no durable, comparable way to say so — only the plan OBJECT itself,
// which is neither small nor stable enough to log, store, or hand to a
// peer as a fact on its own. This file answers exactly that one missing
// question, and nothing else:
//
//   plan
//   (0.8.143's own result, EXPLICITLY SUPPLIED)
//        │
//        ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity()
//        │
//        ▼
//   { algorithm: 'SHA-256', planFingerprint: <64-char lowercase hex>,
//     candidateCount }
//
// "WHICH PLAN" IS NEVER "WHICH PLAN IS RIGHT" — THE ONE ARCHITECTURAL LINE
// THIS MILESTONE EXISTS TO HOLD. This file computes a structural identity
// for the plan it is handed. It does not compare that plan against any
// other, does not say whether the plan is complete, current, or correct,
// and does not rank, prefer, or validate anything about it. Two calls with
// two different plans producing two different `planFingerprint` values
// says only "these are two different plan artifacts" — never "one is
// better," "one is newer," or "one supersedes the other." That reading —
// history against explicit plan, revalidation fact — already belongs to
// 0.8.157/0.8.158/0.8.159; this file adds a fourth, independent identity,
// never a verdict about the other three.
//
// IDENTITY IS SCOPED TO EXACTLY THE THREE CANDIDATE LISTS 0.8.144 ITSELF
// ALREADY READS — NEVER THE PLAN'S OWN SUMMARY STATISTICS. 0.8.143's own
// result carries `claimCount`, `distinctClaimIdCount`, `snapshotCount`,
// and `correspondenceCount` alongside `divergentCorrespondences`,
// `claimsWithoutCorrespondence`, and `snapshotsWithoutCorrespondence` — but
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidate()`
// (0.8.144, UNCHANGED, NOT IMPORTED HERE — see "Architectural boundary,"
// below) never reads the four summary counts when it decides whether a
// selection names a genuine candidate; it reads only the three lists. This
// file reuses that exact surface, unchanged, as "the existing plan
// semantics" this milestone was asked to defer to: `planFingerprint`
// identifies a plan by precisely the content that can make a candidate
// present or absent, and by nothing else. Two plans that name the
// identical candidates, reached from claim histories or snapshot sequences
// of different sizes, fingerprint identically — because from a candidate's
// point of view, they ARE the identical plan.
//
// ORDER IS PRESERVED, NEVER CANONICALIZED — 0.8.143'S OWN ORDERING IS
// ALREADY MEANINGFUL, NOT AN ARBITRARY INGESTION ARTIFACT. 0.8.143's own
// header states its ordering plainly: `divergentCorrespondences` preserves
// first-appearance-in-`claimHistory`-then-supplied-`snapshots`-position;
// `claimsWithoutCorrespondence` is ordered by first appearance in
// `claimHistory`; `snapshotsWithoutCorrespondence` is ordered by ascending
// `snapshotIndex`. None of that is incidental — it is a deterministic
// function of POSITION within the caller's own supplied claim history and
// snapshot sequence, carried through by 0.8.142's own single pass. Sorting
// it away before fingerprinting (the way 0.8.116's own multi-replica
// evidence fingerprint deliberately DOES sort, for a genuinely
// order-independent multiset — see that file's own header) would erase
// exactly the positional information 0.8.143 went out of its way to keep.
// This file therefore does the opposite of 0.8.116 on purpose: `plan`'s
// three lists are fingerprinted in the order they arrive, unchanged — a
// plan whose candidates are identical but differently ordered is treated
// as a genuinely different plan artifact, because 0.8.143's own ordering
// already carries meaning this file has no license to discard.
//
// DUPLICATE CANDIDATES ARE NEVER COLLAPSED — A DIRECT CONSEQUENCE OF
// FINGERPRINTING THE SUPPLIED LISTS AS-IS, NOT A SEPARATE RULE THIS FILE
// ADDS. This file performs no deduplication pass of its own: a
// `claimsWithoutCorrespondence` array holding the same `claimId` twice
// fingerprints differently than one holding it once, purely because the
// two arrays are not the same bytes. Whether such a plan is itself
// well-formed is a question for whatever produced it (0.8.143 itself never
// produces one, per its own "first-received record" restraint) — this
// file does not decide that; it reports whatever structural content it was
// actually handed, exactly once, as one fingerprint.
//
// EVERY LIST ENTRY IS EMBEDDED EXACTLY AS SUPPLIED — NEVER REBUILT, NEVER
// FIELD-FILTERED, NEVER RE-ORDERED FIELD BY FIELD. This file does not
// inspect `claimId`, `snapshotIndex`, `divergence.*`, `association.*`, or
// `verification.*` on any entry — it does not know, and does not need to
// know, which fields make one candidate distinct from another; that
// question belongs to 0.8.144 alone (see "Architectural boundary," below).
// Each entry is handed to `JSON.stringify()` exactly as it stands. A
// genuine 0.8.143 plan already builds every entry in one fixed field order
// (0.8.142's/0.8.143's own construction, unchanged by this file), so this
// needs no field-order normalization of its own for genuine plans; a
// hand-built or malformed entry serializes in whatever key order it
// happens to carry — this file interprets none of it, either way.
//
// A MALFORMED OR ABSENT `plan`, OR A MALFORMED LIST WITHIN ONE, DEGRADES
// EXACTLY LIKE 0.8.144'S OWN TOLERANCE — NEVER A SECOND VALIDATION LAYER.
// 0.8.144's own header states it plainly: "a `plan` that does not carry a
// genuine array in the relevant list position... degrades to zero
// candidates for that type, exactly like an empty list — never a thrown
// error." This file applies the identical rule, independently, to each of
// the three lists: a non-object `plan`, or a `plan` whose
// `divergentCorrespondences`/`claimsWithoutCorrespondence`/
// `snapshotsWithoutCorrespondence` is missing or not a genuine array,
// treats that list as `[]` — never a fabricated entry, never a thrown
// error. A completely malformed `plan` therefore produces the exact same
// `planFingerprint` as a genuine, empty 0.8.143 plan: both name zero
// candidates, and this file's own identity depends on candidates alone.
//
// `candidateCount` IS THE SUM OF THE THREE NORMALIZED LISTS' OWN LENGTHS —
// NEVER A COUNT READ OFF THE SUPPLIED `plan` ITSELF. 0.8.143's own
// `divergentCorrespondenceCount`/`claimsWithoutCorrespondenceCount`/
// `snapshotsWithoutCorrespondenceCount` are trusted nowhere in this file;
// `candidateCount` is always recomputed from the identical normalized
// lists `planFingerprint` is itself computed from, so the two fields can
// never disagree about how many candidates the fingerprint actually
// covers, even when a hand-built or malformed `plan` carries count fields
// that do not match its own list lengths.
//
// THE FINGERPRINT PRIMITIVE IS THE ONE THIS CODEBASE ALREADY ESTABLISHED —
// NEVER A COMPETING SCHEME. `{ algorithm: 'SHA-256', fingerprint: <64-char
// lowercase hex> }` is application/publication/observationArchive/PublicationObservationArchiveFingerprint.js's
// (0.8.84), application/achievement/AchievementEvidenceFingerprint.js's (0.8.116), and
// application/leaderboard/PublisherLeaderboardSnapshotFingerprint.js's (0.8.121) own
// established shape, reused here a fourth time under a name this file's
// own result carries as `planFingerprint`, and hashed with the same
// synchronous core/Sha256.js those three files use. The
// canonicalization step — `JSON.stringify()` over a normalized shape built
// in one fixed field order — mirrors 0.8.121's own choice for a snapshot,
// which likewise has exactly one well-defined shape: this file builds that
// one normalized shape itself (see `normalizePlanForIdentity()` below),
// rather than trusting the supplied `plan` object's own key insertion
// order at the top level.
//
// NO PLAN CLASS, NO PERSISTENCE, NO RECONSTRUCTXXX() ENTRY POINT — THE
// PLAN REMAINS EXACTLY WHAT 0.8.143 ALREADY MADE IT. This file adds no new
// type for `plan`, changes nothing about how 0.8.143 produces one, and
// introduces no durable store of plan identities. 0.8.143's own header
// already establishes that a plan is a derived, in-memory artifact the
// archive never persists — this file's own identity is computed fresh
// every time, exactly like the fingerprint files it reuses the shape of,
// and ships with no `reconstructXxx()` for the identical reason 0.8.157's
// own header already gives one layer over: there is no archive-stored plan
// to reconstruct an identity from.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. Reads no clock, touches
// no network, no storage, no verifier, and mutates neither `plan` nor
// anything inside it. Calling this function twice with equivalent
// arguments — even reached by two entirely independent code paths —
// returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS BUT core/Sha256.js. This file imports
// nothing from `application/claimSnapshotReconciliation/ReconciliationCandidate.js`
// (0.8.144's own candidate-selection boundary), `application/
// application/claimSnapshotReconciliation/PlanView.js` (0.8.143
// itself), `application/claimSnapshotReconciliation/decision/Decision.js`,
// any decision-history module, any revalidation module, any verification
// or correspondence module, or any archive module — it performs no
// candidate SELECTION of its own (it never asks "does this ONE candidate
// exist," only "what does the WHOLE plan structurally contain"), no
// verification, and reads no archive. It trusts nothing about how `plan`
// was produced beyond the three list fields its own name already
// documents.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Comparing two plan identities.** A caller already has everything
//   needed with `===` over two `planFingerprint` values; a dedicated
//   comparison entry point, if one earns its keep, is separately sized
//   later work, mirroring 0.8.116's own identical restraint.
// - **Any candidate-level selection or matching.** This file never asks
//   whether one particular candidate exists in `plan` — that is 0.8.144's
//   own, already-built question. It fingerprints the plan's candidate
//   surface as a whole.
// - **Combining this identity with a decision or a revalidation fact.**
//   Producing `{ decision, planFingerprint, candidateMatchesPlan, ... }`
//   together is 0.8.161's own, separately sized, later question, per this
//   milestone's own request.
// - **A plan class, a persistence layer, or a `reconstructXxx()` entry
//   point.** See "No plan class," above.
// - **Trust/reputation judgments, staleness, correctness, severity, or
//   confidence about the plan.** See "'Which plan' is never 'which plan is
//   right,'" above.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export const PublisherLeaderboardClaimSnapshotReconciliationPlanIdentityAlgorithm = 'SHA-256';

export function describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan) {
    const normalized = normalizePlanForIdentity(plan);

    return Object.freeze({
        algorithm: PublisherLeaderboardClaimSnapshotReconciliationPlanIdentityAlgorithm,
        planFingerprint: sha256Hex(JSON.stringify(normalized)),
        candidateCount: (
            normalized.divergentCorrespondences.length
            + normalized.claimsWithoutCorrespondence.length
            + normalized.snapshotsWithoutCorrespondence.length
        )
    });
}

// The one normalized shape this file ever fingerprints — a fixed field
// order (`divergentCorrespondences`, `claimsWithoutCorrespondence`,
// `snapshotsWithoutCorrespondence`, 0.8.143's own field order, unchanged),
// each list defaulted to `[]` exactly like 0.8.144's own tolerance when the
// supplied `plan` does not carry a genuine array in that position. See this
// file's own header, "A malformed or absent plan... degrades exactly like
// 0.8.144's own tolerance."
function normalizePlanForIdentity(plan) {
    const source = (plan !== null && typeof plan === 'object') ? plan : {};
    return {
        divergentCorrespondences: Array.isArray(source.divergentCorrespondences) ? source.divergentCorrespondences : [],
        claimsWithoutCorrespondence: Array.isArray(source.claimsWithoutCorrespondence) ? source.claimsWithoutCorrespondence : [],
        snapshotsWithoutCorrespondence: Array.isArray(source.snapshotsWithoutCorrespondence) ? source.snapshotsWithoutCorrespondence : []
    };
}
