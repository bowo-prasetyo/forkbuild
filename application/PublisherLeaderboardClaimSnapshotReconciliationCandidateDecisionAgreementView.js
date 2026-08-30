import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution } from './PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js';

// 0.8.156 — Reconciliation Candidate Decision Agreement Projection.
//
// 0.8.149 answered "which decision records exist on one replica's history
// but not the other's?" 0.8.155 grouped those SAME exclusive records by the
// candidate they concern. Neither one states the complementary fact this
// milestone exists to make observable: given two replicas' decision
// histories, which decision-history facts are SHARED by both replicas, and —
// separately — which candidates are represented on both, or only one, of
// them?
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory, targetHistory)
//     -> { sourceDecisionCount, targetDecisionCount,
//          sharedDecisionCount, sourceOnlyDecisionCount, targetOnlyDecisionCount,
//          sharedDecisions, sourceOnly, targetOnly,
//          distinctCandidateCount, sharedCandidateCount,
//          sourceOnlyCandidateCount, targetOnlyCandidateCount,
//          candidateAgreements: [{ candidate, sharedDecisionCount,
//                                   sourceOnlyDecisionCount, targetOnlyDecisionCount }],
//          sameHistory }
//
// 0.8.149 CANNOT BY ITSELF PRODUCE THE SHARED SET — THE ONE GAP THIS
// MILESTONE FILLS, WITHOUT REBUILDING A SECOND, INDEPENDENT DECISION-
// COMPARISON ENGINE. 0.8.149's own `describeXxx()` computes a multiset
// difference — `sourceOnly`/`targetOnly` — but deliberately exposes no
// intersection of its own (see that file's own header: "no ordering, no
// grouping, no statistics"). Rather than duplicate 0.8.149's whole
// comparison, this file calls 0.8.149's own `describeXxx()` exactly once to
// obtain `sourceOnly` (0.8.149's own array, unchanged), then derives the
// shared multiset by subtracting `sourceOnly` from the source's own
// genuine-filtered history — a multiset subtraction using the IDENTICAL
// decision identity 0.8.149 already established (`candidate` + `decision` +
// `decidedAt`, compared by exact structural content). Since
// `source = shared ⊎ sourceOnly` by construction (0.8.149's own
// `extractUnmatched()` already guarantees this), `source - sourceOnly`
// recovers exactly the matched multiset — no re-comparison against
// `targetHistory` is ever needed to compute it:
//
//   Source history ──┐
//                    ├─→ 0.8.149 decision-level difference ─→ sourceOnly, targetOnly
//   Target history ──┘
//                    │
//                    ▼
//   sharedDecisions = (genuine-filtered source) MINUS sourceOnly
//                     (multiset subtraction, decision identity)
//
// `sharedDecisions` therefore carries the SOURCE's OWN COPY of each matched
// record — an arbitrary but deterministic and documented choice (source and
// target each independently computed a structurally identical record; this
// file always reports source's own object, never target's, and never a
// reconstructed merge of the two).
//
// CANDIDATE PRESENCE IS COMPUTED INDEPENDENTLY OF DECISION-LEVEL
// AGREEMENT — THE FLAGSHIP ARCHITECTURAL PRINCIPLE THIS MILESTONE EXISTS TO
// HOLD. A candidate is represented on a replica if that replica's own FULL
// history (0.8.154's own `describeXxx()`, run once over the whole
// `sourceHistory` and once over the whole `targetHistory`, never over
// `sourceOnly`/`targetOnly`/`sharedDecisions` alone) names it in ANY
// decision, regardless of which decisions about it happen to be shared or
// exclusive. `sharedCandidateCount`/`sourceOnlyCandidateCount`/
// `targetOnlyCandidateCount`/`distinctCandidateCount` are computed purely
// from these two full candidate sets. Concretely: a candidate C1 that
// received `OBSERVE(C1,t1)` on both replicas (a SHARED decision) and also
// `DEFER(C1,t2)` on the source alone and `DEFER(C1,t4)` on the target alone
// (two EXCLUSIVE decisions) is counted once as a SHARED CANDIDATE — it is
// never "source-only" merely because it also carries a source-exclusive
// decision, and its exclusive decisions are never dropped or merged away;
// they remain visible in `candidateAgreements`' own per-candidate counts.
// This is precisely the distinction 0.8.149's own header already draws at
// the decision level ("decision history entry != reconciliation
// candidate"), held here again one layer up, between CANDIDATE identity and
// the AGREEMENT STATE of the decisions concerning it.
//
// `candidateAgreements` NAMES EVERY CANDIDATE REPRESENTED ON EITHER SIDE
// EXACTLY ONCE, CARRYING THREE INDEPENDENT COUNTS. For each candidate:
// `sharedDecisionCount` (from `sharedDecisions`, grouped by candidate via
// 0.8.154), `sourceOnlyDecisionCount` (from `sourceOnly`), and
// `targetOnlyDecisionCount` (from `targetOnly`) — each computed by running
// 0.8.154's own `describeXxx()` over that one already-computed decision
// array and reading its own per-candidate `decisionCount`, never
// recomputed by this file's own grouping logic. A candidate absent from one
// of the three arrays simply reads `0` for that count, never `null` or an
// absent field. Entries are ordered by first appearance scanning the
// source's own full candidate list (0.8.154's own first-appearance order
// over `sourceHistory`), followed by any candidates found only on the
// target's own full candidate list, in the target's own first-appearance
// order — this file performs no further re-sorting of its own.
//
// NO COMPARISON, RANKING, OR RECONCILIATION OF ANY KIND — THE IDENTICAL
// RESTRAINT 0.8.149'S AND 0.8.155'S OWN HEADERS ALREADY HOLD, HELD HERE
// AGAIN OVER THE AGREEMENT VIEW. A candidate carrying both a
// `sourceOnlyDecisionCount` and a `targetOnlyDecisionCount` is never
// described as "conflicting," and neither exclusive decision is ever said
// to supersede, correct, or invalidate the other, or the shared one. This
// file states three plain counts per candidate — nothing more.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over two plain,
// in-memory decision-history arrays (0.8.146's own shape) — it calls
// 0.8.149's own `describeXxx()` exactly once and 0.8.154's own
// `describeXxx()` exactly five times (over `sourceHistory`, `targetHistory`,
// `sharedDecisions`, `sourceOnly`, and `targetOnly`), touching no archive.
// `reconstructXxx()` below reads each side's own raw history directly via
// 0.8.150's own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// — the identical ONE archive-reading seam 0.8.149's own `reconstructXxx()`
// itself already uses — and then calls `describeXxx()` above; this file
// never touches `PublicationObservationArchive` itself, and never calls
// 0.8.149's own `reconstructXxx()` (which would read the identical archives
// a second time for no benefit, since this file already needs each side's
// raw history for the candidate-presence computation above, not merely
// 0.8.149's own difference result).
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, CONVERGED RESULT — NEVER THROWS.
// Both `sourceHistory` and `targetHistory` tolerate `null`, `undefined`, a
// non-array, or an array containing non-genuine entries exactly as 0.8.149
// and 0.8.154 already tolerate them. Two empty/malformed histories degrade
// to every count reading `0` and `sameHistory: true`.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// 0.8.149, 0.8.150's OWN ARCHIVE-READING SEAM, AND 0.8.154. This file
// imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifferenceView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`, or any
// other module naming a plan, a candidate-selection boundary, a divergence,
// a verification, a claim, or a snapshot — it trusts nothing about how
// either history was produced beyond 0.8.149's, 0.8.150's, and 0.8.154's own
// already-documented shapes. This file deliberately does NOT reuse 0.8.155
// — 0.8.155 exposes only already-exclusive decisions grouped by candidate,
// never the raw, genuine-filtered `sourceHistory`/`targetHistory` this
// file's own candidate-presence computation requires; depending on it would
// buy nothing while adding an extra layer of indirection.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of agreement or difference as a conflict,
//   inconsistency, correction, or need for resolution.** See "No
//   comparison, ranking, or reconciliation," above.
// - **Any export, import, application, or synchronization of the shared or
//   exclusive decisions found.** Every array/count here is a read-only fact
//   about the comparison; folding anything into either history remains
//   0.8.151's/0.8.152's own, already-answered, separately sized question.
// - **Deduplication of any kind.** `sharedDecisions`/`sourceOnly`/
//   `targetOnly` all preserve multiset multiplicity exactly as 0.8.149
//   already established — two independently recorded, byte-identical
//   decisions on each side count as one shared decision, never zero or two,
//   and a local duplicate within one side's own exclusive history is never
//   collapsed.
// - **Comparing, merging, or cross-referencing a candidate's own
//   `sourceOnlyDecisionCount` against its own `targetOnlyDecisionCount`.**
//   Both are reported side by side, as independent facts about the same
//   candidate, never combined into a single "disagreement score" or similar
//   derived value.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.** This file reads only
//   0.8.149's, 0.8.150's, and 0.8.154's own already-computed results.
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory = [], targetHistory = []) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
    return buildAgreement(sourceHistory, targetHistory, difference);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement()
// — see this file's own header, "The identical split," above. Reads each
// side's own raw history directly via 0.8.150's own reconstruction seam,
// then hands both to `describeXxx()` above — never calling 0.8.149's own
// `reconstructXxx()`, which would read the identical archives again for no
// benefit. An invalid/missing archive on either side degrades to
// `PublicationObservationArchive.empty()`'s own empty history on that side,
// by way of the reconstruction seam itself — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceArchive, targetArchive) {
    const sourceHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(sourceArchive);
    const targetHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceHistory, targetHistory);
}

// The one composition both entry points share — see this file's own
// header, "0.8.149 cannot by itself produce the shared set," and "candidate
// presence is computed independently of decision-level agreement," above.
function buildAgreement(sourceHistory, targetHistory, difference) {
    const source = (Array.isArray(sourceHistory) ? sourceHistory : []).filter(isGenuineDecision);
    const sharedDecisions = Object.freeze(extractShared(source, difference.sourceOnly));

    const sharedByCandidate = decisionCountByCandidate(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(sharedDecisions));
    const sourceOnlyByCandidate = decisionCountByCandidate(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(difference.sourceOnly));
    const targetOnlyByCandidate = decisionCountByCandidate(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(difference.targetOnly));

    const sourceEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(sourceHistory);
    const targetEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(targetHistory);
    const sourceCandidateKeys = new Set(sourceEvolution.candidateEvolutions.map((entry) => candidateKey(entry.candidate)));
    const targetCandidateKeys = new Set(targetEvolution.candidateEvolutions.map((entry) => candidateKey(entry.candidate)));

    let sharedCandidateCount = 0;
    let sourceOnlyCandidateCount = 0;
    for (const key of sourceCandidateKeys) {
        if (targetCandidateKeys.has(key)) sharedCandidateCount += 1;
        else sourceOnlyCandidateCount += 1;
    }
    let targetOnlyCandidateCount = 0;
    for (const key of targetCandidateKeys) {
        if (!sourceCandidateKeys.has(key)) targetOnlyCandidateCount += 1;
    }

    const candidateAgreements = [];
    const seenCandidateKeys = new Set();
    const appendCandidateAgreement = (candidate) => {
        const key = candidateKey(candidate);
        if (seenCandidateKeys.has(key)) return;
        seenCandidateKeys.add(key);
        candidateAgreements.push(Object.freeze({
            candidate,
            sharedDecisionCount: sharedByCandidate.get(key) || 0,
            sourceOnlyDecisionCount: sourceOnlyByCandidate.get(key) || 0,
            targetOnlyDecisionCount: targetOnlyByCandidate.get(key) || 0
        }));
    };
    for (const entry of sourceEvolution.candidateEvolutions) appendCandidateAgreement(entry.candidate);
    for (const entry of targetEvolution.candidateEvolutions) appendCandidateAgreement(entry.candidate);

    return Object.freeze({
        sourceDecisionCount: difference.sourceCount,
        targetDecisionCount: difference.targetCount,
        sharedDecisionCount: sharedDecisions.length,
        sourceOnlyDecisionCount: difference.sourceOnlyCount,
        targetOnlyDecisionCount: difference.targetOnlyCount,
        sharedDecisions,
        sourceOnly: difference.sourceOnly,
        targetOnly: difference.targetOnly,
        distinctCandidateCount: sharedCandidateCount + sourceOnlyCandidateCount + targetOnlyCandidateCount,
        sharedCandidateCount,
        sourceOnlyCandidateCount,
        targetOnlyCandidateCount,
        candidateAgreements: Object.freeze(candidateAgreements),
        sameHistory: difference.sameHistory
    });
}

// Reads one already-computed 0.8.154 evolution result into a `candidateKey
// -> decisionCount` lookup, used to answer "how many of THIS decision array
// concern candidate C?" without this file re-grouping anything itself.
function decisionCountByCandidate(evolution) {
    const map = new Map();
    for (const entry of evolution.candidateEvolutions) {
        map.set(candidateKey(entry.candidate), entry.decisionCount);
    }
    return map;
}

// The multiset subtraction `from - remove`, preserving multiplicity —
// mirroring 0.8.149's own `extractUnmatched()` exactly, inverted: instead of
// returning the elements of `from` that have NO counterpart in `remove`,
// this returns the elements of `from` that DO. Since 0.8.149 already
// guarantees `from = result ⊎ remove` when `remove` is `from`'s own
// `sourceOnly`, this recovers exactly the matched (shared) multiset without
// ever re-reading `targetHistory`.
function extractShared(from, remove) {
    const remaining = new Map();
    for (const record of remove) {
        const key = canonicalDecisionKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const shared = [];
    for (const record of from) {
        const key = canonicalDecisionKey(record);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
        } else {
            shared.push(record);
        }
    }
    return shared;
}

// The complete structural identity key for a candidate object — `type` plus
// whichever of `claimId`/`snapshotIndex` 0.8.144's own shape for that type
// actually carries. `JSON.stringify()` of the whole candidate object already
// captures this faithfully (mirroring 0.8.149's own `canonicalDecisionKey()`
// reasoning: a genuine candidate is already a plain object with no methods
// of its own, so its complete structural content already IS its own key) —
// no separate type-prefixed key construction is needed.
function candidateKey(candidate) {
    return JSON.stringify(candidate);
}

// The one, uniform decision identity 0.8.149 already established — exact
// structural equality of `candidate` + `decision` + `decidedAt` — reused
// unchanged (never imported, since 0.8.149 keeps it private; duplicating it
// here is the identical discipline 0.8.154's own `candidateIdentityKey()`
// already holds for 0.8.147's/0.8.153's own candidate key).
function canonicalDecisionKey(record) {
    return JSON.stringify({ candidate: record.candidate, decision: record.decision, decidedAt: record.decidedAt });
}

// A genuine 0.8.145 decision record — duplicated from 0.8.149's own private
// `isGenuineDecision()` for the identical reason `canonicalDecisionKey()`
// is duplicated, above: this file's own multiset subtraction must filter
// `sourceHistory` by the EXACT same rule 0.8.149 already applied internally
// to produce `difference.sourceOnly`/`difference.sourceCount`, or the two
// multisets would not line up.
function isGenuineDecision(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
        && typeof entry.decidedAt === 'string'
    );
}
