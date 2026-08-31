import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js';

// 0.8.175 — Reconciliation Candidate Evidence Summary Projection.
//
// Two parallel historical branches have grown up since 0.8.144 first named
// a candidate: a DECISION branch (0.8.145 records a disposition against a
// candidate; 0.8.153 correlates decision history to candidate; 0.8.154
// narrates one candidate's own decision sequence), and an OBSERVATION
// branch (0.8.162 revalidates a decision against a later plan; 0.8.171
// correlates observation history to candidate; 0.8.172 narrates one
// candidate's own observation sequence). Nothing has yet answered the one
// question a reader eventually needs from BOTH branches AT ONCE: what
// historical evidence — of either kind — exists for one candidate? This
// file is that projection, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory)
//     -> { candidateCount, decisionCount, observationCount,
//          candidates: [{ candidate,
//                          decisionCount, decisions: [{ decision, decidedAt }],
//                          observationCount, observations: [{ decision, planIdentity,
//                                              candidatePresent, candidateType,
//                                              candidateMatchesPlan, observedAt }] }] }
//
// THE QUESTION IS "WHAT EVIDENCE IS AVAILABLE?" — NEVER "IS THE CANDIDATE
// GOOD, BAD, CURRENT, CORRECT, OR WINNING?" This file assembles
// already-established facts into a candidate-centric shape; it draws no
// conclusion from what it assembles. A candidate carrying two OBSERVE
// decisions and three PRESENT observations is reported exactly that way —
// nothing is said about whether the evidence agrees, whether it is
// sufficient, or what it implies should happen next. See
// `docs/Principles.md`, "A Candidate's Decision History Is A Narration, Not
// A State Machine" (0.8.154) — held here again over the UNION of both
// histories at once.
//
// A REVALIDATION OBSERVATION IS EVIDENCE ABOUT A DECISION, NEVER A
// REPLACEMENT FOR ONE — THE ARCHITECTURAL RULE THIS FILE EXISTS TO PRESERVE
// STRUCTURALLY, NOT JUST BY CONVENTION. This file therefore never derives
// one branch from the other. It calls 0.8.153's own decision-candidate
// correspondence over `decisionHistory`, and 0.8.171's own
// observation-candidate correspondence over `observationHistory`,
// INDEPENDENTLY — each branch is asked its own already-answered question,
// over its own history, exactly once — and only THEN combines the two
// already-computed results by the one key both branches already share:
// candidate identity.
//
//   decision history ────────► 0.8.153 (called exactly once)
//                                        │
//                                        └── candidate identity
//
//   observation history ─────► 0.8.171 (called exactly once)
//                                        │
//                                        └── candidate identity
//
//                    0.8.175 combines by candidate identity
//
// never:
//
//   observation history -> 0.8.175 derives decisions from observations
//   decision history     -> 0.8.175 derives observations from decisions
//
// Neither history is read by the other branch's own correspondence
// function, and neither branch's own history is used to invent, infer, or
// backfill an entry the OTHER branch's own history does not itself already
// contain. A candidate present in only one branch's history remains present
// in only that branch's own arrays on its combined entry — the other
// branch's own `decisionCount`/`observationCount` and list report zero and
// empty, never a fabricated or inferred entry.
//
// THIS MILESTONE MUST NOT CALL 0.8.144 OR 0.8.157 TO REDISCOVER THE
// CANDIDATE — THE IDENTICAL ARCHITECTURAL BOUNDARY 0.8.153'S AND 0.8.171'S
// OWN HEADERS ALREADY HOLD, INHERITED HERE FOR FREE BECAUSE THIS FILE NEVER
// READS A DECISION OR OBSERVATION RECORD DIRECTLY — IT READS ONLY 0.8.153'S
// AND 0.8.171'S OWN ALREADY-COMPUTED `candidate` FIELDS.
//
// CANDIDATE TYPES REMAIN CLOSED — THE IDENTICAL THREE-VALUE VOCABULARY
// 0.8.144, 0.8.153, AND 0.8.171 ESTABLISHED, UNCHANGED. `DIVERGENT_CORRESPONDENCE`,
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`, `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`
// are embedded in each combined entry's own `candidate` exactly as 0.8.153/
// 0.8.171 already carry them. No fourth "UNKNOWN"/"UNRESOLVED" category,
// and no candidate-shape normalization of any kind.
//
// `decisionCount`/`observationCount` AT THE TOP LEVEL COUNT STORED HISTORY
// ENTRIES — 0.8.153's own `decisionCount` and 0.8.171's own
// `observationCount`, forwarded unchanged. `candidateCount` counts
// CANDIDATES, the structural identity key below, each counted once no
// matter how many decisions or observations were ever recorded against it,
// and regardless of which branch (or both) actually recorded evidence for
// it. A candidate's own `decisionCount` plus every other candidate's own
// `decisionCount` always sums to the top-level `decisionCount`; likewise for
// `observationCount` — no evidence is duplicated or dropped while
// regrouping by candidate.
//
// CANDIDATE ORDER: FIRST APPEARANCE ACROSS THE DECISION HISTORY, THEN
// OBSERVATION-ONLY CANDIDATES IN THEIR OWN FIRST-APPEARANCE ORDER — NEVER
// RE-SORTED BY CANDIDATE TYPE, EVIDENCE COUNT, OR EITHER TIMESTAMP. The
// decision branch is scanned first, in 0.8.153's own correspondence order
// (which is `decisionHistory`'s own order, unchanged), establishing a group
// for each newly-seen candidate. The observation branch is then scanned, in
// 0.8.171's own correspondence order (`observationHistory`'s own order,
// unchanged); a candidate already grouped from the decision pass has its
// observations merged into its existing group, while a candidate seen only
// in the observation branch gets a new, OBSERVATION-ONLY group, appended
// after every decision-branch group, in THAT candidate's own
// first-appearance order within the observation branch. This is the one
// ordering fact the milestone's own flagship scenario exists to prove: a
// candidate with observation evidence and NO decision evidence at all
// (`C3`, below) still appears — this projection is not secretly
// "decision-driven."
//
// WITHIN ONE CANDIDATE'S OWN `decisions`/`observations` LISTS, HISTORY
// ORDER IS PRESERVED — NEITHER LIST IS RE-SORTED CHRONOLOGICALLY. This is a
// deliberate departure from 0.8.154's and 0.8.172's own per-candidate
// `decidedAt`/`observedAt` sort: those two files are TIMELINE projections,
// answering "in what order did this candidate's own evidence actually
// occur?" This file is an EVIDENCE-ASSEMBLY projection, answering only
// "what evidence exists?" — the two already-established, already-ordered
// timeline views remain the one place a caller goes for chronology; this
// file does not duplicate that computation or re-derive a second, competing
// ordering of the identical facts. `decisions`/`observations` here are
// therefore in 0.8.153's/0.8.171's own correspondence order, which is
// `decisionHistory`'s/`observationHistory`'s own order, unchanged.
//
// EACH `decisions` ENTRY IS `{ decision, decidedAt }`; EACH `observations`
// ENTRY IS `{ decision, planIdentity, candidatePresent, candidateType,
// candidateMatchesPlan, observedAt }` — 0.8.154's and 0.8.172's own entry
// shapes, reused unchanged. Candidate identity is stated once, on the
// combined entry itself; it is never repeated on every decision or
// observation within it.
//
// NO MUTATION OF ANY SUPPLIED OBJECT. `decisionHistory`, `observationHistory`,
// and every record within either are read only. Every object and array this
// file returns is newly frozen, referencing (never copying by mutation) the
// original embedded values.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS.
// `describeXxx()` takes both plain, in-memory history arrays directly and
// calls 0.8.153's own `describeXxx()` and 0.8.171's own `describeXxx()`,
// each exactly once. `reconstructXxx()` below takes one `archive` and calls
// 0.8.153's own `reconstructXxx()` and 0.8.171's own `reconstructXxx()`,
// each exactly once — the two seams that read the archive's own
// `reconciliationDecisionRecords` and `revalidationObservationRecords`
// collections, respectively — obtaining both already-computed
// correspondence results directly, without this file touching the archive
// itself.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. Either
// history may independently be `null`, `undefined`, a non-array, or an
// array containing non-genuine entries; 0.8.153 and 0.8.171 each already
// tolerate their own argument and perform their own exclusion, so this file
// never re-implements that check. Two entirely malformed/absent histories
// produce `candidateCount: 0`, `decisionCount: 0`, `observationCount: 0`,
// and an empty, frozen `candidates` array. One malformed history alongside
// one genuine history degrades only the malformed side to empty, exactly as
// 0.8.153/0.8.171 each already degrade in isolation.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY TWO MODULES, 0.8.153
// AND 0.8.171, AND NOTHING ELSE. No import from
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js` (0.8.144),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`
// (0.8.145), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`
// (0.8.146), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163), either history-timeline module, either candidate-evolution
// module (0.8.154, 0.8.172), or any plan/discovery/agreement/difference
// module in this family. Two imports, one describeXxx/reconstructXxx pair
// each — this file trusts nothing about how either history was produced
// beyond 0.8.153's and 0.8.171's own already-documented result shapes.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any judgment of whether a candidate is correct, current, valid,
//   stale, superseded, resolved, winning, or in need of resolution.** See
//   "The question is 'what evidence is available?'," above — the whole
//   point of this file.
// - **A score, rank, ordering by evidence weight, or any comparison between
//   two candidates' own evidence.** Explicitly out of scope for this
//   milestone; a later, separately sized question, if ever addressed at
//   all.
// - **Deriving one branch's evidence from the other's.** See "A
//   revalidation observation is evidence about a decision, never a
//   replacement for one," above.
// - **Re-deriving candidate identity from a plan, claim history, snapshot
//   list, or archive state.** See "This milestone must not call 0.8.144 or
//   0.8.157," above.
// - **A fourth "UNKNOWN"/"UNRESOLVED" candidate category.** See "Candidate
//   types remain closed," above.
// - **Chronological ordering of a candidate's own combined evidence, or any
//   interleaving of its decisions and observations by time.** That remains
//   0.8.154's and 0.8.172's own, already-answered, separately sized
//   question; see "Within one candidate's own lists, history order is
//   preserved," above.
// - **Deduplication of decisions or observations within a candidate's own
//   lists.** An identical decision or observation recorded twice remains
//   two entries, always — the identical restraint 0.8.154's and 0.8.172's
//   own headers already hold.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** This file inherits that boundary for free by never introducing
//   action vocabulary of its own.
// - **Persistence or synchronization of any kind.** Both histories are
//   in-memory arrays handed in and handed back, exactly like every other
//   projection in this family.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
// - **The Leaderboard UI itself, or any read model beyond this one
//   candidate-centric evidence assembly.** See this milestone's own
//   request — 0.8.175 is a bridge, not the destination.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory) {
    const decisionCorrespondence = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(decisionHistory);
    const observationCorrespondence = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(observationHistory);
    return buildEvidenceSummary(decisionCorrespondence, observationCorrespondence);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary()
// — see this file's own header, "The identical split," above. Calls
// 0.8.153's own `reconstructXxx()` and 0.8.171's own `reconstructXxx()`,
// each exactly once, obtaining both milestones' own correspondence results
// directly from `archive` without this file touching the archive itself. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// by way of the two reconstruction seams themselves, which in turn produce
// each branch's own empty correspondence result — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(archive) {
    const decisionCorrespondence = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(archive);
    const observationCorrespondence = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(archive);
    return buildEvidenceSummary(decisionCorrespondence, observationCorrespondence);
}

// The one combining pass both entry points share, operating entirely over
// 0.8.153's own `correspondences` array and 0.8.171's own `correspondences`
// array — never re-reading either history or the archive itself. Groups the
// decision branch first (establishing first-appearance order), then merges
// the observation branch in, appending any observation-only candidate after
// every decision-branch candidate, in the observation branch's own
// first-appearance order.
function buildEvidenceSummary(decisionCorrespondence, observationCorrespondence) {
    const candidateOrder = [];
    const groupsByCandidateKey = new Map();

    function groupFor(candidate) {
        const key = candidateIdentityKey(candidate);
        let group = groupsByCandidateKey.get(key);
        if (!group) {
            group = { candidate, decisions: [], observations: [] };
            groupsByCandidateKey.set(key, group);
            candidateOrder.push(key);
        }
        return group;
    }

    for (const entry of decisionCorrespondence.correspondences) {
        groupFor(entry.candidate).decisions.push(Object.freeze({
            decision: entry.decision,
            decidedAt: entry.decidedAt
        }));
    }

    for (const entry of observationCorrespondence.correspondences) {
        groupFor(entry.candidate).observations.push(Object.freeze({
            decision: entry.decision,
            planIdentity: entry.planIdentity,
            candidatePresent: entry.candidatePresent,
            candidateType: entry.candidateType,
            candidateMatchesPlan: entry.candidateMatchesPlan,
            observedAt: entry.observedAt
        }));
    }

    const candidates = candidateOrder.map((key) => {
        const group = groupsByCandidateKey.get(key);
        return Object.freeze({
            candidate: group.candidate,
            decisionCount: group.decisions.length,
            decisions: Object.freeze(group.decisions),
            observationCount: group.observations.length,
            observations: Object.freeze(group.observations)
        });
    });

    return Object.freeze({
        candidateCount: candidates.length,
        decisionCount: decisionCorrespondence.decisionCount,
        observationCount: observationCorrespondence.observationCount,
        candidates: Object.freeze(candidates)
    });
}

// The complete structural candidate identity key — 0.8.147's/0.8.153's/
// 0.8.171's own key, reused unchanged. `type` is always part of the key;
// `claimId`/`snapshotIndex` are included only when 0.8.144's own shape for
// that `type` actually carries them.
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
