import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreementView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView.js';

// 0.8.176 — Reconciliation Candidate Evidence Agreement Projection.
//
// 0.8.175 combined a candidate's own decision evidence and observation
// evidence — over ONE replica — into a single candidate-centric summary.
// 0.8.156 and 0.8.174 each already answer, independently, "given two
// replicas, which DECISIONS (0.8.156) — or, separately, which OBSERVATIONS
// (0.8.174) — are shared versus exclusive, and which candidates carry them?"
// Neither one, nor 0.8.175, states the question a reader eventually needs
// from BOTH already-answered agreement views AT ONCE: given two replicas,
// what CANDIDATE EVIDENCE — of either kind — is shared, and what evidence
// exists exclusively on each side? This file is that projection, and
// nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
//       sourceDecisionHistory, targetDecisionHistory,
//       sourceObservationHistory, targetObservationHistory)
//     -> { candidateCount,
//          sourceDecisionCount, targetDecisionCount,
//          sourceObservationCount, targetObservationCount,
//          sharedDecisionCount, sourceOnlyDecisionCount, targetOnlyDecisionCount,
//          sharedObservationCount, sourceOnlyObservationCount, targetOnlyObservationCount,
//          candidates: [{ candidate,
//                          decisionAgreement: { sharedDecisionCount,
//                              sourceOnlyDecisionCount, targetOnlyDecisionCount,
//                              sharedDecisions, sourceOnly, targetOnly },
//                          observationAgreement: { sharedObservationCount,
//                              sourceOnlyObservationCount, targetOnlyObservationCount,
//                              sharedObservations, sourceOnly, targetOnly } }],
//          sameDecisionHistory, sameObservationHistory }
//
// THE QUESTION IS "WHAT EVIDENCE IS SHARED OR EXCLUSIVE?" — NEVER "IS THE
// CANDIDATE CONFLICTING, STALE, RESOLVED, CORRECT, OR INCORRECT?" This file
// reports exactly what 0.8.156 and 0.8.174 already established, regrouped
// by candidate; it draws no conclusion from what it reports. A candidate
// carrying shared decisions and exclusive observations is reported exactly
// that way — nothing is said about whether the two kinds of evidence agree
// with each other, whether either replica is right, or what should happen
// next. See `docs/Principles.md`, "A Candidate's Decision History Is A
// Narration, Not A State Machine" (0.8.154) — held here again over
// CROSS-REPLICA evidence agreement.
//
// DECISION AGREEMENT AND OBSERVATION AGREEMENT ARE NOT THE SAME THING — THE
// FLAGSHIP ARCHITECTURAL PRINCIPLE THIS MILESTONE EXISTS TO HOLD, AND THE
// REASON THE TWO DIMENSIONS ARE KEPT STRUCTURALLY SEPARATE ON EVERY
// CANDIDATE ENTRY RATHER THAN COLLAPSED INTO ONE COMBINED COUNT. A candidate
// can be a SHARED candidate at the decision level while its observation
// evidence is asymmetric or even entirely one-sided, and vice versa — see
// this milestone's own flagship scenario, below. `decisionAgreement` and
// `observationAgreement` are therefore always reported side by side, on the
// identical candidate entry, and never merged, averaged, or reconciled into
// a single per-candidate "agreement" verdict.
//
// THIS FILE CREATES NO SECOND COMPARISON ALGORITHM — IT COMPOSES TWO
// ALREADY-PROVEN AGREEMENT VIEWS, EACH CALLED EXACTLY ONCE. 0.8.156 already
// answers the decision-level question (which decisions are shared/exclusive,
// and which candidates carry them); 0.8.174 already answers the identical
// question one branch over, for observations. Rather than re-derive either
// comparison from raw history — which would risk a second, subtly different
// multiset-subtraction or candidate-presence algorithm drifting out of sync
// with 0.8.156's/0.8.174's own already-tested ones — this file calls each
// exactly once and assembles their own already-computed results by the one
// key both already share: candidate identity.
//
//   sourceDecisionHistory ──┐
//   targetDecisionHistory ──┴─→ 0.8.156 (called exactly once) ─→ decision evidence
//
//   sourceObservationHistory ──┐
//   targetObservationHistory ──┴─→ 0.8.174 (called exactly once) ─→ observation evidence
//
//                    0.8.176 assembles both by candidate identity
//
// never:
//
//   histories -> 0.8.176 re-derives its own shared/exclusive multiset
//   histories -> 0.8.176 re-derives its own candidate-presence sets
//
// This is the identical composition discipline 0.8.175 already holds one
// layer down (over ONE replica's own two branches); this file holds it again
// over TWO replicas' own already-computed AGREEMENT results.
//
// PER-CANDIDATE COUNTS ARE READ VERBATIM OFF 0.8.156'S AND 0.8.174'S OWN
// `candidateAgreements`, NEVER RECOMPUTED. `decisionAgreement.sharedDecisionCount`/
// `sourceOnlyDecisionCount`/`targetOnlyDecisionCount` are 0.8.156's own
// per-candidate counts, forwarded unchanged; `observationAgreement`'s three
// counts are 0.8.174's own per-candidate counts, forwarded unchanged. A
// candidate absent from one agreement view's own `candidateAgreements`
// (named by the other view alone) reads `0` for every count on that side,
// never `null` or an absent field — exactly 0.8.175's own restraint for a
// candidate absent from one evidence branch, held here again one layer up.
//
// PER-CANDIDATE EVIDENCE LISTS ARE A GROUPING OF 0.8.156'S/0.8.174'S OWN
// GLOBAL ARRAYS, NEVER A NEW COMPARISON. `sharedDecisions`/`sourceOnly`/
// `targetOnly` inside `decisionAgreement` are 0.8.156's own global
// `sharedDecisions`/`sourceOnly`/`targetOnly` arrays, filtered to the
// records naming this one candidate (read off each decision record's own
// already-embedded `candidate` field — never re-derived). `sharedObservations`/
// `sourceOnly`/`targetOnly` inside `observationAgreement` are 0.8.174's own
// identically-named global arrays, filtered the same way (read off each
// observation record's own already-embedded `decision.candidate` field,
// exactly as 0.8.171's/0.8.172's own correspondence already reads it). No
// record is copied, reshaped, or re-ordered — grouping preserves each
// global array's own relative order among the records naming that
// candidate. Every count above always agrees with its own filtered list's
// own `.length` — the two are never allowed to drift apart.
//
// FLAGSHIP SCENARIO — the one this milestone exists to make observable:
//
//   Alice (source)             Bob (target)
//   C1 decisions:    D1, D2    D1, D3
//   C1 observations: O1, O2    O1, O3
//
//   C2 decisions:    D4        D4
//   C2 observations: O4        (none)
//
//   C3 decisions:    (none)    D5
//   C3 observations: O5        O6   (O5, O6 both name D5's own candidate,
//                                    but differ in `observedAt`, so neither
//                                    is shared)
//
// C1: a SHARED candidate at BOTH grains, carrying a shared decision (D1) and
// a shared observation (O1), plus one exclusive decision AND one exclusive
// observation per side — the ordinary case, exactly 0.8.156's/0.8.174's own
// flagship shape, held on one candidate entry with both dimensions visible
// together. C2: a SHARED candidate at the DECISION level (both replicas
// decided about it identically) but, at the OBSERVATION level, a
// SOURCE-ONLY candidate — Bob recorded no observation of C2 at all, so C2 is
// entirely absent from Bob's own observation-candidate set. Shared decision
// evidence therefore does NOT imply shared, or even mutual, observation
// evidence. C3 is the mirror case: a TARGET-ONLY candidate at the DECISION
// level (only Bob ever decided about it) but a SHARED candidate at the
// OBSERVATION level with ZERO shared observations — both replicas hold an
// observation naming C3, yet the two observations themselves never match.
// No candidate above is ever called conflicting, stale, resolved, correct,
// or incorrect — three plain, independent facts are reported per candidate,
// nothing more.
//
// `sameDecisionHistory`/`sameObservationHistory` ARE KEPT INDEPENDENT, NEVER
// COMBINED INTO ONE FLAG. `sameDecisionHistory` is 0.8.156's own `sameHistory`,
// forwarded unchanged; `sameObservationHistory` is 0.8.174's own `sameHistory`,
// forwarded unchanged. Two replicas can hold byte-identical decision
// histories while their observation histories genuinely differ (or the
// reverse) — the flagship scenario above already forces both flags to read
// `false` simultaneously for unrelated reasons on each side, but a
// converged decision history alongside a divergent observation history (or
// vice versa) is exercised directly, in isolation, by this milestone's own
// test.
//
// CANDIDATE ORDER — 0.8.156'S OWN `candidateAgreements` ORDER FIRST, THEN
// ANY CANDIDATE NAMED ONLY BY 0.8.174'S OWN `candidateAgreements`, IN THAT
// VIEW'S OWN FIRST-APPEARANCE ORDER — never re-sorted by candidate type,
// evidence count, or agreement outcome. This is 0.8.175's own "decision
// branch first, then observation-only" ordering discipline, held here again
// one layer up over two already-ordered AGREEMENT results rather than two
// raw histories.
//
// NO MUTATION OF ANY SUPPLIED OBJECT, AND NO MUTATION OF EITHER
// ALREADY-COMPUTED AGREEMENT RESULT. Every array and record this file
// returns is newly frozen, referencing (never copying by mutation) the
// original decision/observation records 0.8.156's and 0.8.174's own results
// already hold.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS.
// `describeXxx()` takes all four plain, in-memory history arrays directly
// and calls 0.8.156's own `describeXxx()` and 0.8.174's own `describeXxx()`,
// each exactly once. `reconstructXxx()` below takes `sourceArchive`/
// `targetArchive` and calls 0.8.156's own `reconstructXxx()` and 0.8.174's
// own `reconstructXxx()`, each exactly once, over the identical two
// archives — the two seams that read each archive's own
// `reconciliationDecisionRecords` and `revalidationObservationRecords`
// collections, respectively — obtaining both already-computed agreement
// results directly, without this file touching either archive itself.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, CONVERGED RESULT — NEVER THROWS.
// Every one of the four history arguments (or both archives) may
// independently be `null`, `undefined`, a non-array, or an array containing
// non-genuine entries; 0.8.156 and 0.8.174 each already tolerate their own
// arguments and perform their own exclusion, so this file never
// re-implements that check. Four entirely malformed/absent histories
// produce `candidateCount: 0`, every count reading `0`, an empty, frozen
// `candidates` array, and `sameDecisionHistory`/`sameObservationHistory`
// both `true`.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY TWO MODULES, 0.8.156
// AND 0.8.174, AND NOTHING ELSE. No import from 0.8.144 (candidate
// selection), 0.8.149/0.8.166 (either raw history difference), 0.8.150/
// 0.8.167 (either archive-reading seam — 0.8.156's and 0.8.174's own
// `reconstructXxx()` already own those seams), 0.8.153/0.8.171 (either
// candidate correspondence), 0.8.154/0.8.172 (either candidate evolution),
// 0.8.155/0.8.173 (either exclusive-only difference), 0.8.175 (the
// single-replica evidence summary — a different composition, over one
// replica's own two branches, not two replicas' own agreement views), or
// any plan/discovery/verification module in this family. Two imports, one
// describeXxx/reconstructXxx pair each — this file trusts nothing about how
// either agreement result was produced beyond 0.8.156's and 0.8.174's own
// already-documented result shapes.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of agreement or difference as a conflict,
//   inconsistency, correction, or need for resolution.** See "The question
//   is 'what evidence is shared or exclusive?'," above.
// - **Merging, averaging, or reconciling `decisionAgreement` and
//   `observationAgreement` into one combined per-candidate verdict.** See
//   "Decision agreement and observation agreement are not the same thing,"
//   above — the whole point of this file.
// - **A score, rank, ordering by agreement weight, or any comparison
//   between two candidates' own agreement.** Explicitly out of scope; a
//   later, separately sized question, if ever addressed at all.
// - **Re-deriving the shared/exclusive multiset, or the candidate-presence
//   sets, from either raw history.** See "This file creates no second
//   comparison algorithm," above.
// - **Deduplication of any kind.** Every list this file returns preserves
//   0.8.156's/0.8.174's own multiset multiplicity exactly — grouping by
//   candidate never collapses two structurally identical records into one.
// - **Any export, import, application, or synchronization of the shared or
//   exclusive evidence found.** Every array/count here is a read-only fact
//   about the comparison.
// - **Persistence or synchronization of any kind.** All four histories (or
//   both archives) are handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
// - **The Leaderboard UI itself, or any read model beyond this one
//   candidate-centric agreement assembly.** This remains one more bridge,
//   not the destination.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(sourceDecisionHistory = [], targetDecisionHistory = [], sourceObservationHistory = [], targetObservationHistory = []) {
    const decisionAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceDecisionHistory, targetDecisionHistory);
    const observationAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceObservationHistory, targetObservationHistory);
    return buildEvidenceAgreement(decisionAgreement, observationAgreement);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement()
// — see this file's own header, "The identical split," above. Calls
// 0.8.156's own `reconstructXxx()` and 0.8.174's own `reconstructXxx()`,
// each exactly once, obtaining both milestones' own agreement results
// directly from `sourceArchive`/`targetArchive` without this file touching
// either archive itself. An invalid/missing archive on either side degrades
// to `PublicationObservationArchive.empty()`'s own empty history on that
// side, by way of the two reconstruction seams themselves — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(sourceArchive, targetArchive) {
    const decisionAgreement = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionAgreement(sourceArchive, targetArchive);
    const observationAgreement = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceArchive, targetArchive);
    return buildEvidenceAgreement(decisionAgreement, observationAgreement);
}

// The one assembly pass both entry points share, operating entirely over
// 0.8.156's own already-computed agreement result and 0.8.174's own
// already-computed agreement result — never re-reading either history or
// either archive. Orders candidates by 0.8.156's own `candidateAgreements`
// order first, then appends any candidate named only by 0.8.174's own
// `candidateAgreements`, in that view's own first-appearance order.
function buildEvidenceAgreement(decisionAgreement, observationAgreement) {
    const candidateOrder = [];
    const seenKeys = new Set();
    const candidateByKey = new Map();
    const decisionEntryByKey = new Map();
    const observationEntryByKey = new Map();

    function noteCandidate(key, candidate) {
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            candidateOrder.push(key);
            candidateByKey.set(key, candidate);
        }
    }

    for (const entry of decisionAgreement.candidateAgreements) {
        const key = candidateIdentityKey(entry.candidate);
        decisionEntryByKey.set(key, entry);
        noteCandidate(key, entry.candidate);
    }
    for (const entry of observationAgreement.candidateAgreements) {
        const key = candidateIdentityKey(entry.candidate);
        observationEntryByKey.set(key, entry);
        noteCandidate(key, entry.candidate);
    }

    const sharedDecisionsByCandidate = groupByCandidate(decisionAgreement.sharedDecisions, decisionCandidateOf);
    const sourceOnlyDecisionsByCandidate = groupByCandidate(decisionAgreement.sourceOnly, decisionCandidateOf);
    const targetOnlyDecisionsByCandidate = groupByCandidate(decisionAgreement.targetOnly, decisionCandidateOf);

    const sharedObservationsByCandidate = groupByCandidate(observationAgreement.sharedObservations, observationCandidateOf);
    const sourceOnlyObservationsByCandidate = groupByCandidate(observationAgreement.sourceOnly, observationCandidateOf);
    const targetOnlyObservationsByCandidate = groupByCandidate(observationAgreement.targetOnly, observationCandidateOf);

    const candidates = candidateOrder.map((key) => {
        const decisionEntry = decisionEntryByKey.get(key);
        const observationEntry = observationEntryByKey.get(key);
        return Object.freeze({
            candidate: candidateByKey.get(key),
            decisionAgreement: Object.freeze({
                sharedDecisionCount: decisionEntry ? decisionEntry.sharedDecisionCount : 0,
                sourceOnlyDecisionCount: decisionEntry ? decisionEntry.sourceOnlyDecisionCount : 0,
                targetOnlyDecisionCount: decisionEntry ? decisionEntry.targetOnlyDecisionCount : 0,
                sharedDecisions: Object.freeze(sharedDecisionsByCandidate.get(key) || []),
                sourceOnly: Object.freeze(sourceOnlyDecisionsByCandidate.get(key) || []),
                targetOnly: Object.freeze(targetOnlyDecisionsByCandidate.get(key) || [])
            }),
            observationAgreement: Object.freeze({
                sharedObservationCount: observationEntry ? observationEntry.sharedObservationCount : 0,
                sourceOnlyObservationCount: observationEntry ? observationEntry.sourceOnlyObservationCount : 0,
                targetOnlyObservationCount: observationEntry ? observationEntry.targetOnlyObservationCount : 0,
                sharedObservations: Object.freeze(sharedObservationsByCandidate.get(key) || []),
                sourceOnly: Object.freeze(sourceOnlyObservationsByCandidate.get(key) || []),
                targetOnly: Object.freeze(targetOnlyObservationsByCandidate.get(key) || [])
            })
        });
    });

    return Object.freeze({
        candidateCount: candidates.length,

        sourceDecisionCount: decisionAgreement.sourceDecisionCount,
        targetDecisionCount: decisionAgreement.targetDecisionCount,
        sourceObservationCount: observationAgreement.sourceObservationCount,
        targetObservationCount: observationAgreement.targetObservationCount,

        sharedDecisionCount: decisionAgreement.sharedDecisionCount,
        sourceOnlyDecisionCount: decisionAgreement.sourceOnlyDecisionCount,
        targetOnlyDecisionCount: decisionAgreement.targetOnlyDecisionCount,

        sharedObservationCount: observationAgreement.sharedObservationCount,
        sourceOnlyObservationCount: observationAgreement.sourceOnlyObservationCount,
        targetOnlyObservationCount: observationAgreement.targetOnlyObservationCount,

        candidates: Object.freeze(candidates),

        sameDecisionHistory: decisionAgreement.sameHistory,
        sameObservationHistory: observationAgreement.sameHistory
    });
}

// Groups one of 0.8.156's/0.8.174's own already-computed global evidence
// arrays (`sharedDecisions`/`sourceOnly`/`targetOnly`, or their observation
// counterparts) by candidate identity, preserving each candidate's own
// relative order within the original array. `candidateOf` reads the
// candidate already embedded on each record — `decisionCandidateOf()` for a
// 0.8.145 decision record, `observationCandidateOf()` for a 0.8.162
// observation record — never re-deriving it.
function groupByCandidate(records, candidateOf) {
    const map = new Map();
    for (const record of records) {
        const key = candidateIdentityKey(candidateOf(record));
        const list = map.get(key);
        if (list) list.push(record);
        else map.set(key, [record]);
    }
    return map;
}

// A 0.8.145 decision record already carries its own candidate directly, on
// `candidate` — exactly as 0.8.156's own `candidateKey()` already reads it.
function decisionCandidateOf(record) {
    return record.candidate;
}

// A 0.8.162 observation record carries its candidate one level down, on its
// own embedded decision — `observation.decision.candidate` — exactly as
// 0.8.171's own correspondence, and 0.8.174's own candidate grouping,
// already read it.
function observationCandidateOf(record) {
    return record.decision.candidate;
}

// The complete structural candidate identity key — 0.8.147's/0.8.153's/
// 0.8.156's/0.8.171's/0.8.174's own key, reused unchanged. `type` is always
// part of the key; `claimId`/`snapshotIndex` are included only when 0.8.144's
// own shape for that `type` actually carries them.
function candidateIdentityKey(candidate) {
    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return `DIVERGENT_CORRESPONDENCE:${candidate.claimId}:${candidate.snapshotIndex}`;
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT:${candidate.claimId}`;
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM:${candidate.snapshotIndex}`;
    }
    return `UNKNOWN:${JSON.stringify(candidate)}`;
}
