// 0.8.191 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// View.
//
// 0.8.190 compacted 0.8.189's own detailed export comparison into a read
// model — nine counts plus five metadata facts, no record arrays. Nothing
// yet shapes that read model into what an actual comparison panel would put
// on screen. This file is that hand-off, and nothing more — the identical
// role 0.8.178 already plays for 0.8.177, one layer up in the sibling
// (single-export) leaderboard family:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel)
//     -> { isEmpty,
//          metadata: { comparisonState: { source, target, same },
//                      filter: { source, target, same } },
//          candidateSummary:    { sourceOnlyCount, sharedCount, targetOnlyCount },
//          decisionEvidence:    { sourceOnlyCount, sharedCount, targetOnlyCount },
//          observationEvidence: { sourceOnlyCount, sharedCount, targetOnlyCount } }
//
//   readModel — 0.8.190's own already-computed result, taken directly:
//   `{ metadata: { comparisonState, filter }, candidates, decisionEvidence,
//      observationEvidence }`, each of the latter three shaped
//   `{ sourceOnlyCount, sharedCount, targetOnlyCount }`.
//
//   0.8.189 Detailed Export Comparison
//                 │
//                 ▼
//   0.8.190 Compact Comparison Read Model
//                 │
//                 ▼
//   0.8.191 Comparison View   ★ (THIS FILE)
//                 │
//                 ▼
//              Browser
//
// A PRESENTATION PROJECTION, NOT ANOTHER COMPARISON ENGINE. Every fact this
// file reports is 0.8.190's own fact, read verbatim off its own
// already-computed result. No count is added, dropped, combined, or
// recomputed; no candidate, decision, or observation is re-inspected; no
// dimension is checked against another. This file's only work is renaming
// one field (`candidates` -> `candidateSummary`, page vocabulary distinct
// from domain vocabulary — the identical rename discipline 0.8.178 already
// applies to 0.8.177's own `candidates` -> `rows`) and deriving one
// structural flag (`isEmpty`).
//
// ZERO IMPORTS — THE ARCHITECTURAL POINT OF THIS FILE, THE IDENTICAL CHOICE
// 0.8.178 ALREADY MAKES ONE LAYER BELOW ITS OWN SOURCE, 0.8.177.
// `describeXxx()` below performs a pure, structural, duck-typed transform of
// whatever shape it is handed — it never imports 0.8.190's own module to
// validate that shape, exactly the way 0.8.178's own `describeXxx()`
// duck-typed `readModel.candidates` without importing 0.8.177. There is
// therefore nothing here for a caller to accidentally import that would
// open a path back into comparison logic, evidence partitioning, export
// reading, or any archive module. A caller that wants this view built from
// two real exported documents calls 0.8.189's own `describeXxx()`, then
// 0.8.190's own `describeXxx()`, and hands 0.8.190's result here. There is
// deliberately no `reconstructXxx()` in this file: there is no document
// pair, and no archive pair, for this file itself to read.
//
// THREE INDEPENDENT DIMENSIONS, EACH ITS OWN THREE-WAY COUNT — 0.8.189'S OWN
// FLAGSHIP DISTINCTION, HELD HERE AGAIN TWO LAYERS UP. `candidateSummary`,
// `decisionEvidence`, and `observationEvidence` below are three separately
// forwarded count triples, never merged, never cross-checked, and never used
// to infer one another:
//
//   | Dimension            | Source-only | Shared | Target-only |
//   | --------------------- | ----------: | -----: | ----------: |
//   | Candidates             |       count |  count |       count |
//   | Decision evidence      |       count |  count |       count |
//   | Observation evidence   |       count |  count |       count |
//
// `metadata.comparisonState` and `metadata.filter` are reported entirely
// separately again, exactly as 0.8.190 already keeps them independent of
// every count above.
//
// METADATA IS FORWARDED VERBATIM, NEVER TURNED INTO PROSE. `metadata.
// comparisonState.source`/`target`/`same` and `metadata.filter.source`/
// `target`/`same` are 0.8.190's own values, read off `readModel.metadata`
// unchanged. This file never renders "matching reports," "conflicting
// reports," or any other narrative label over those five facts — a reader
// sees the same `source`/`target`/`same` structure 0.8.189 and 0.8.190
// already established, one layer further toward the screen.
//
// `isEmpty` IS A STRUCTURAL FLAG, NEVER A MESSAGE. `isEmpty` is `true`
// exactly when every one of the nine counts across `candidateSummary`/
// `decisionEvidence`/`observationEvidence` is zero — the comparison has
// nothing on either side, on either document, in any dimension. It says
// nothing about `metadata` (two documents can carry a differing
// `comparisonState` or `filter` while every count is still zero — see
// 0.8.190's own Section F, `NO_PEER` vs `PEER_EMPTY`); it is a pure,
// derived convenience so a template can decide whether to render an
// empty-state block without re-deriving it from all nine counts itself.
// This file does not invent empty-state copy, an icon, or any other
// presentational content.
//
// CRITICAL ARCHITECTURAL RULE — THIS IS NOT A LEADERBOARD. No rank, score,
// winner, better/worse, correct/incorrect, conflict, stale, confidence, or
// recommendation vocabulary appears anywhere in this file or its result.
// Two documents disagreeing on a count is reported as exactly that — a
// count — never as a verdict about which document, or which replica's
// underlying archive, is more complete, more current, or more trustworthy.
// See docs/Principles.md, "The UI Displays Observations; It Does Not Turn
// Them Into A Verdict" (0.8.57) — held here again, one layer above 0.8.190's
// own read model, exactly as 0.8.190 itself already held it one layer above
// 0.8.189.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup, and
// mutates no argument. Calling it twice with byte-identical arguments
// returns a byte-identical result. Every object returned is newly frozen;
// nothing from `readModel` is referenced by mutable path — only primitive
// string/boolean/number values are read off it.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID VIEW — NEVER THROWS. A
// `readModel` that is `null`, `undefined`, or missing a genuine `metadata`/
// `candidates`/`decisionEvidence`/`observationEvidence` section degrades
// that section to `{ sourceOnlyCount: 0, sharedCount: 0, targetOnlyCount: 0
// }` (`candidateSummary` included) and `metadata` to `NO_PEER`/`NO_PEER` and
// `ALL`/`ALL` defaults — the identical degrade-to-least-claimed behavior
// 0.8.189/0.8.190 already use, duplicated here for the identical reason
// 0.8.189 itself duplicates 0.8.186's own normalization (see "Zero
// imports," above: this file must apply the same rule without importing a
// module that itself carries comparison vocabulary). A `readModel` this
// degraded is always `isEmpty: true`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A rank, score, winner, better/worse, correct/incorrect, conflict,
//   stale, confidence, or recommendation field or vocabulary of any kind.**
//   See "Critical architectural rule," above.
// - **The `shared`/`sourceOnly`/`targetOnly` record arrays, on any
//   dimension.** Never present on 0.8.190's own result; never reintroduced
//   here.
// - **`sourceCount`/`targetCount`, on any dimension.** 0.8.190 already
//   excludes them; this file forwards nothing 0.8.190 itself does not
//   already carry.
// - **Narrative prose over `metadata`** ("matching reports," "conflicting
//   reports," or any other label). See "Metadata is forwarded verbatim,"
//   above — `source`/`target`/`same` are preserved exactly.
// - **Reconciling, merging, or explaining why the three dimensions
//   disagree.** Inherited unchanged from 0.8.189/0.8.190.
// - **Reading either exported document, either archive, 0.8.189's own
//   `describeXxx()`, or 0.8.190's own `describeXxx()`.** This file's one
//   argument is always 0.8.190's own already-computed result — see "Zero
//   imports," above.
// - **Any markup, DOM nodes, or control-rendering technology choice.** This
//   file returns plain, frozen, JSON-safe data; a "Compare Evidence
//   Exports" panel/page (if ever built) is separate, later, UI-layer work.
// - **Persistence, synchronization, or automatic/periodic/background
//   computation of any kind.** This function runs only when a caller
//   explicitly calls it.

function isGenuineSection(value) {
    return Boolean(value) && typeof value === 'object';
}

const EMPTY_SECTION = Object.freeze({ sourceOnlyCount: 0, sharedCount: 0, targetOnlyCount: 0 });

function sectionOf(readModel, key) {
    const section = isGenuineSection(readModel) ? readModel[key] : undefined;
    if (!isGenuineSection(section)) return EMPTY_SECTION;
    return Object.freeze({
        sourceOnlyCount: Number.isFinite(section.sourceOnlyCount) ? section.sourceOnlyCount : 0,
        sharedCount: Number.isFinite(section.sharedCount) ? section.sharedCount : 0,
        targetOnlyCount: Number.isFinite(section.targetOnlyCount) ? section.targetOnlyCount : 0
    });
}

function isSectionEmpty(section) {
    return section.sourceOnlyCount === 0 && section.sharedCount === 0 && section.targetOnlyCount === 0;
}

const DEFAULT_COMPARISON_STATE = Object.freeze({ source: 'NO_PEER', target: 'NO_PEER', same: true });

function comparisonStateOf(metadata) {
    const raw = isGenuineSection(metadata) ? metadata.comparisonState : undefined;
    if (!isGenuineSection(raw)) return DEFAULT_COMPARISON_STATE;
    const source = raw.source ? raw.source : 'NO_PEER';
    const target = raw.target ? raw.target : 'NO_PEER';
    const same = typeof raw.same === 'boolean' ? raw.same : source === target;
    return Object.freeze({ source, target, same });
}

const DEFAULT_FILTER_SIDE = Object.freeze({ evidenceKind: 'ALL', replicaRelation: 'ALL' });

function filterSideOf(side) {
    if (!isGenuineSection(side)) return DEFAULT_FILTER_SIDE;
    return Object.freeze({
        evidenceKind: side.evidenceKind || 'ALL',
        replicaRelation: side.replicaRelation || 'ALL'
    });
}

function filterOf(metadata) {
    const raw = isGenuineSection(metadata) ? metadata.filter : undefined;
    const source = filterSideOf(isGenuineSection(raw) ? raw.source : undefined);
    const target = filterSideOf(isGenuineSection(raw) ? raw.target : undefined);
    const same = isGenuineSection(raw) && typeof raw.same === 'boolean'
        ? raw.same
        : (source.evidenceKind === target.evidenceKind && source.replicaRelation === target.replicaRelation);
    return Object.freeze({ source, target, same });
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView()
// — see this file's own header for the full contract. Never re-computes any
// of 0.8.190's own counts or metadata facts; malformed/absent input
// degrades to an empty, `NO_PEER`/`ALL`/`ALL` view, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel) {
    const metadata = isGenuineSection(readModel) ? readModel.metadata : undefined;

    const candidateSummary = sectionOf(readModel, 'candidates');
    const decisionEvidence = sectionOf(readModel, 'decisionEvidence');
    const observationEvidence = sectionOf(readModel, 'observationEvidence');

    return Object.freeze({
        isEmpty: isSectionEmpty(candidateSummary) && isSectionEmpty(decisionEvidence) && isSectionEmpty(observationEvidence),
        metadata: Object.freeze({
            comparisonState: comparisonStateOf(metadata),
            filter: filterOf(metadata)
        }),
        candidateSummary,
        decisionEvidence,
        observationEvidence
    });
}
