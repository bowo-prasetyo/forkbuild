// 0.8.190 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Read Model.
//
// 0.8.189 answers, for two already-exported reports, "what candidates,
// decisions, and observations are shared, and what is exclusive to each
// document?" — in full structural detail, complete with the record arrays
// themselves. Nothing yet turns that detailed answer into the compact
// shape a summary UI would actually put on screen. This file is that
// hand-off, and nothing more — the identical role 0.8.177 already plays
// for 0.8.176, one layer up:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison)
//     -> { metadata: { comparisonState: { source, target, same },
//                      filter: { source, target, same } },
//          candidates:         { sourceOnlyCount, sharedCount, targetOnlyCount },
//          decisionEvidence:   { sourceOnlyCount, sharedCount, targetOnlyCount },
//          observationEvidence: { sourceOnlyCount, sharedCount, targetOnlyCount } }
//
//   comparison — 0.8.189's own already-computed result, taken directly:
//   `{ sourceComparisonState, targetComparisonState, sameComparisonState,
//      sourceFilter, targetFilter, sameFilter, candidates, decisionEvidence,
//      observationEvidence }`, each of the latter three shaped
//   `{ sourceCount, targetCount, sharedCount, sourceOnlyCount,
//      targetOnlyCount, shared, sourceOnly, targetOnly }`.
//
//   0.8.189 Evidence Export Comparison ──► 0.8.190 Comparison Read Model   ★ (THIS FILE)
//                                                  │
//                                                  ├── future summary UI
//                                                  ├── future comparison report
//                                                  └── future export
//
// THIS IS A READ MODEL, NOT A COMPARISON ENGINE. Every fact this file
// reports is 0.8.189's own fact, read verbatim off its own already-computed
// result and reshaped into a smaller, UI-facing vocabulary. No count is
// added, dropped, combined, or recomputed; no candidate, decision, or
// observation is re-inspected. See `docs/Principles.md`, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict" (0.8.57) — held here
// again, one layer above 0.8.189's own comparison.
//
// THIS FILE ACCEPTS 0.8.189'S OWN RESULT DIRECTLY — NEVER TWO EXPORTED
// DOCUMENTS. The dependency direction is deliberately explicit:
//
//   two exported documents -> 0.8.189 Evidence Export Comparison
//     -> 0.8.190 Comparison Read Model
//
// `describeXxx()` below takes 0.8.189's own already-computed `comparison`
// result as its one argument and performs a pure, structural transform of
// it. It never touches `sourceExport`/`targetExport` themselves, never
// re-derives `sameComparisonState`/`sameFilter`, and never re-partitions
// any evidence — that entire boundary remains 0.8.189's own. This prevents
// 0.8.190 from quietly becoming a second comparison engine, exactly the
// same discipline 0.8.177 already holds one layer below its own source,
// 0.8.176.
//
// THE OUTPUT IS DELIBERATELY SMALLER THAN 0.8.189'S OWN RESULT — THE ONE
// REASON THIS FILE EXISTS. `candidates`/`decisionEvidence`/
// `observationEvidence` below carry only `sourceOnlyCount`/`sharedCount`/
// `targetOnlyCount` — never `sourceCount`, `targetCount`, or the `shared`/
// `sourceOnly`/`targetOnly` record arrays themselves. A caller that needs
// the underlying candidate or evidence records already has 0.8.189's own
// result for that; this read model exists to answer only "what is the
// compact summary of this report comparison?" — never "which exact records
// differ?".
//
// CANDIDATE PRESENCE, DECISION EVIDENCE, AND OBSERVATION EVIDENCE STAY
// THREE INDEPENDENT DIMENSIONS — 0.8.189'S OWN FLAGSHIP DISTINCTION, HELD
// HERE AGAIN ONE LAYER UP. `candidates`, `decisionEvidence`, and
// `observationEvidence` below are three separately-reported count triples,
// never merged, never cross-checked, and never used to infer one another.
// A shared candidate can carry source-only decision evidence and
// target-only observation evidence at once; a source-only candidate can
// carry no decision evidence at all while still contributing target-only
// observation evidence (evidence records embed their own candidate and are
// pooled flat across every candidate by 0.8.189 — see 0.8.189's own
// header, "Evidence is compared flat"). This file never tries to
// reconcile those three facts against each other; it reports each exactly
// as 0.8.189 already computed it.
//
// METADATA IS GROUPED, NOT FLATTENED, AND STAYS INDEPENDENT OF EVIDENCE.
// `metadata.comparisonState` and `metadata.filter` each carry their own
// `source`/`target`/`same` triple, read verbatim off 0.8.189's own
// `sourceComparisonState`/`targetComparisonState`/`sameComparisonState`
// and `sourceFilter`/`targetFilter`/`sameFilter`. Grouping under `metadata`
// is a pure renaming/nesting for a UI's own convenience — the same five
// underlying facts 0.8.189 reports, in a shape a summary panel can render
// directly as two rows instead of six top-level fields. As in 0.8.189
// itself, neither `comparisonState` nor `filter` influences, or is
// influenced by, any of the three evidence-count triples below.
//
// NO `same` BOOLEAN ON ANY OF THE THREE COUNT SECTIONS. `metadata.
// comparisonState.same` and `metadata.filter.same` are forwarded because
// 0.8.189 already computed them as named facts about the export documents
// themselves (not about their evidence) — reused here, not invented. No
// analogous `sameCandidates`, `sameDecisionEvidence`, or
// `sameObservationEvidence` boolean is added to `candidates`/
// `decisionEvidence`/`observationEvidence`: 0.8.189 itself resisted
// collapsing evidence agreement into a boolean (see 0.8.189's own header,
// "The result never collapses into one boolean"), and a reader here can
// already tell whether two documents agree on a dimension by checking
// whether that dimension's own `sourceOnlyCount`/`targetOnlyCount` are
// both zero. Nothing in this milestone's own request names a consumer
// that needs the boolean restated; adding it without one would be
// interpretation this file has no business performing.
//
// EVERY COUNT ALWAYS AGREES WITH 0.8.189'S OWN COUNT FOR THE SAME
// DIMENSION. `candidates.sharedCount` is always exactly `comparison.
// candidates.sharedCount`; likewise for every other one of the nine
// counts below. This file performs no arithmetic of its own beyond the
// field-by-field copy — the identical restraint 0.8.177 already holds
// over 0.8.176's own counts.
//
// ROW/ORDER INFORMATION IS INTENTIONALLY DISCARDED. 0.8.189's own
// `shared`/`sourceOnly`/`targetOnly` arrays carry a relative order (see
// 0.8.189's own header, "Order preservation"); this file forwards none of
// those arrays, so no order survives into this read model at all — only
// the three counts per dimension. A caller who needs order already has
// 0.8.189's own result.
//
// NO MUTATION OF THE SUPPLIED `comparison`, AND NO MUTATION OF ANY VALUE
// IT HOLDS. Every object this file returns is newly frozen; nothing from
// `comparison` is referenced by mutable path — only primitive
// string/boolean/number values are read off it.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK.
// `describeXxx()` reads no clock, contacts no server, and mutates no
// argument. Calling it twice with byte-identical arguments returns a
// byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID READ MODEL — NEVER THROWS.
// A `comparison` that is `null`, `undefined`, or missing a genuine
// `candidates`/`decisionEvidence`/`observationEvidence` section on any
// dimension degrades that dimension to `{ sourceOnlyCount: 0, sharedCount:
// 0, targetOnlyCount: 0 }`, and a missing/malformed `sourceFilter`/
// `targetFilter` degrades `metadata.filter.source`/`target` to
// 0.8.189's own `{ evidenceKind: 'ALL', replicaRelation: 'ALL' }` default
// (the identical degrade-to-least-claimed default 0.8.186/0.8.188/0.8.189
// already use), while a missing/malformed `sourceComparisonState`/
// `targetComparisonState` degrades `metadata.comparisonState.source`/
// `target` to `'NO_PEER'` on the missing side — this file never throws
// regardless of what `comparison` is.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY ONE MODULE, 0.8.189,
// AND NOTHING ELSE. No import of `PublicationObservationArchive` or any
// archive-reading module, no import of 0.8.176/0.8.182/0.8.185/0.8.186/
// 0.8.188 (any live-archive or export/import projection), and no import of
// 0.8.183/0.8.184's own enums directly (0.8.189 already re-exports the
// values this file needs as plain strings on its own result — this file
// never needs the enum objects themselves, only the string values already
// sitting on `comparison`). There is deliberately no `reconstructXxx()` in
// this file: there is no archive pair, and no pair of exported documents,
// for this file itself to read — a caller who wants this read model
// starting from two raw exported documents calls 0.8.189's own
// `describeXxx()` first, then hands its result here.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **The `shared`/`sourceOnly`/`targetOnly` record arrays, on any of the
//   three dimensions.** See "The output is deliberately smaller," above.
// - **`sourceCount`/`targetCount` on any of the three dimensions.** Only
//   `sourceOnlyCount`/`sharedCount`/`targetOnlyCount` survive into this
//   read model; a caller needing raw per-side totals already has 0.8.189's
//   own result.
// - **`sameCandidates`/`sameDecisionEvidence`/`sameObservationEvidence`
//   booleans, or any other verdict flag.** See "No `same` boolean," above
//   — this milestone's own deliberate omission.
// - **A score, rank, winner, `correct`/`incorrect`, `valid`, `stale`,
//   `preferred`, `status`, or `confidence` field or vocabulary of any
//   kind.** Inherited unchanged from every layer beneath this one.
// - **Reconciling, merging, or explaining why the three dimensions
//   disagree.** See "Candidate presence, decision evidence, and
//   observation evidence stay three independent dimensions," above.
// - **Reading either exported document, either archive, or performing any
//   comparison of its own.** This file's one argument is always 0.8.189's
//   own already-computed result.
// - **Any markup, DOM nodes, or control-rendering technology choice.** This
//   file returns plain, frozen, JSON-safe data; a summary UI (if ever
//   built) is separate, later, UI-layer work.
const DEFAULT_SECTION = Object.freeze({ sourceOnlyCount: 0, sharedCount: 0, targetOnlyCount: 0 });

function isGenuineComparison(value) {
    return Boolean(value) && typeof value === 'object';
}

function sectionOf(comparison, key) {
    const section = isGenuineComparison(comparison) ? comparison[key] : undefined;
    if (!section || typeof section !== 'object') return DEFAULT_SECTION;
    return Object.freeze({
        sourceOnlyCount: Number.isFinite(section.sourceOnlyCount) ? section.sourceOnlyCount : 0,
        sharedCount: Number.isFinite(section.sharedCount) ? section.sharedCount : 0,
        targetOnlyCount: Number.isFinite(section.targetOnlyCount) ? section.targetOnlyCount : 0
    });
}

function comparisonStateOf(comparison) {
    const source = isGenuineComparison(comparison) && comparison.sourceComparisonState ? comparison.sourceComparisonState : 'NO_PEER';
    const target = isGenuineComparison(comparison) && comparison.targetComparisonState ? comparison.targetComparisonState : 'NO_PEER';
    const same = isGenuineComparison(comparison) && typeof comparison.sameComparisonState === 'boolean'
        ? comparison.sameComparisonState
        : source === target;
    return Object.freeze({ source, target, same });
}

const DEFAULT_FILTER = Object.freeze({ evidenceKind: 'ALL', replicaRelation: 'ALL' });

function normalizedFilter(filter) {
    if (!filter || typeof filter !== 'object') return DEFAULT_FILTER;
    return Object.freeze({
        evidenceKind: filter.evidenceKind || 'ALL',
        replicaRelation: filter.replicaRelation || 'ALL'
    });
}

function filterOf(comparison) {
    const source = isGenuineComparison(comparison) ? normalizedFilter(comparison.sourceFilter) : DEFAULT_FILTER;
    const target = isGenuineComparison(comparison) ? normalizedFilter(comparison.targetFilter) : DEFAULT_FILTER;
    const same = isGenuineComparison(comparison) && typeof comparison.sameFilter === 'boolean'
        ? comparison.sameFilter
        : (source.evidenceKind === target.evidenceKind && source.replicaRelation === target.replicaRelation);
    return Object.freeze({ source, target, same });
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel()
// — see this file's own header for the full contract. Never re-computes
// any of 0.8.189's own counts or metadata facts; malformed/absent input
// degrades to an empty, `NO_PEER`/`ALL/ALL` read model, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison) {
    return Object.freeze({
        metadata: Object.freeze({
            comparisonState: comparisonStateOf(comparison),
            filter: filterOf(comparison)
        }),
        candidates: sectionOf(comparison, 'candidates'),
        decisionEvidence: sectionOf(comparison, 'decisionEvidence'),
        observationEvidence: sectionOf(comparison, 'observationEvidence')
    });
}
