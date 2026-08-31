// 0.8.193 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Detail View.
//
// 0.8.190/0.8.191 compacted 0.8.189's own detailed export comparison down to
// nine counts plus five metadata facts — enough for a summary panel, but on
// purpose nothing past a count survives that hand-off (see 0.8.190's own
// header, "The output is deliberately smaller"). A reader who sees
//
//   Observation evidence
//   Source-only: 2   Shared: 4   Target-only: 1
//
// and asks "which observations are those?" has had no answer anywhere in
// the export-comparison family until now. This file is that answer, and
// nothing more — the identical role 0.8.182 already plays for 0.8.176, one
// layer up in the sibling (live-archive) leaderboard family:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison)
//     -> { metadata: { comparisonState: { source, target, same },
//                      filter: { source, target, same } },
//          candidates:          { shared, sourceOnly, targetOnly },
//          decisionEvidence:    { shared, sourceOnly, targetOnly },
//          observationEvidence: { shared, sourceOnly, targetOnly } }
//
//   comparison — 0.8.189's own already-computed result, taken directly:
//   `{ sourceComparisonState, targetComparisonState, sameComparisonState,
//      sourceFilter, targetFilter, sameFilter, candidates, decisionEvidence,
//      observationEvidence }`, each of the latter three shaped
//   `{ sourceCount, targetCount, sharedCount, sourceOnlyCount,
//      targetOnlyCount, shared, sourceOnly, targetOnly }`.
//
// THIS FILE READS 0.8.189'S OWN RESULT DIRECTLY — THE IDENTICAL SOURCE THE
// COUNTS PATH ALREADY READS, NEVER THE READ MODEL OR THE VIEW THAT SIT
// BETWEEN THEM. The whole point of this milestone is the same invariant
// 0.8.182's own header names explicitly: THE NUMBER DISPLAYED IN THE
// SUMMARY AND THE RECORDS DISPLAYED IN THE DETAIL VIEW ORIGINATE FROM THE
// SAME DOMAIN RESULT, so no arithmetic is ever needed to reconcile them.
//
//   0.8.189 Detailed Export Comparison
//             │
//             ├── counts ──────────► 0.8.190 ─► 0.8.191 ─► summary UI
//             │
//             └── record arrays ─────────────────────────► 0.8.193 (THIS FILE) ─► detail view
//
// This file NEVER consumes 0.8.190's own read model or 0.8.191's own view —
// consuming either would mean reconstructing records from counts, which is
// impossible by construction (0.8.190 deliberately discarded them) and
// exactly the mistake this milestone's own request warns against ("0.8.193
// should consume the detailed 0.8.189 result, not attempt to reconstruct
// the comparison from 0.8.190" — preserving the information-loss boundary
// 0.8.190 intentionally introduced).
//
// THIS FILE CREATES NO SECOND COMPARISON ALGORITHM — IT REUSES 0.8.189'S OWN
// ALREADY-COMPUTED `shared`/`sourceOnly`/`targetOnly` ARRAYS VERBATIM.
// `candidates.shared` is always exactly `comparison.candidates.shared`,
// referenced (never copied, re-partitioned, or reordered); the same holds
// for every other one of the nine arrays below. Nothing here re-derives
// identity, re-runs multiset partitioning, or re-inspects a single
// candidate/decision/observation record's own content — that entire
// boundary remains 0.8.189's own.
//
// THIS FILE READS 0.8.189'S OWN EXISTING STRUCTURAL RECORD IDENTITY —
// NEVER A NEW OR NORMALIZED ONE. Every record this file forwards is
// 0.8.189's own already-identified record; two records that look similar
// but differ in `candidateMatchesPlan`, `observedAt`, or any other field
// 0.8.189 itself already treats as distinguishing remain two separate
// entries here, exactly as 0.8.189 itself already reports them. See
// 0.8.189's own header, "Evidence identity is the existing structural
// identity the exported records already carry" — held here again, one
// layer up, with no normalization added or removed.
//
// EVIDENCE STAYS FLAT — NEVER REGROUPED BY CANDIDATE. `decisionEvidence`
// and `observationEvidence` below are 0.8.189's own flat, cross-candidate
// arrays, forwarded exactly as pooled — not one record is regrouped under
// its own candidate's own entry. This is a deliberate divergence from
// 0.8.182's own per-candidate grouping one layer below: 0.8.189 already
// discarded per-candidate evidence grouping when it flattened every export's
// own `candidates[].decisionDetail`/`observationDetail` into one pool (see
// 0.8.189's own header, "Evidence is compared flat, across every candidate
// at once") and there is no concrete requirement driving this file to
// reintroduce it. A reader who wants "which candidate does this evidence
// concern" already has it — every decision record still carries its own
// `candidate` field, and every observation record still carries the
// `candidate` field 0.8.182 already surfaced onto it — this file simply
// never uses that field to GROUP its own output.
//
// CANDIDATE PRESENCE, DECISION EVIDENCE, AND OBSERVATION EVIDENCE STAY
// THREE INDEPENDENT SECTIONS — 0.8.189'S OWN FLAGSHIP DISTINCTION, HELD
// HERE AGAIN ONE LAYER UP, NOW OVER RECORDS RATHER THAN COUNTS. A candidate
// can appear in `candidates.shared` while every one of its own decision
// records lands in `decisionEvidence.sourceOnly` and every one of its own
// observation records lands in `observationEvidence.targetOnly` — this file
// never cross-checks one section against another, and never infers a
// candidate's own evidence membership from its own presence membership, or
// the reverse.
//
// METADATA IS GROUPED, NOT FLATTENED, AND STAYS INDEPENDENT OF EVIDENCE —
// THE IDENTICAL SHAPE 0.8.190/0.8.191 ALREADY ESTABLISH ONE LAYER BELOW.
// `metadata.comparisonState` and `metadata.filter` each carry their own
// `source`/`target`/`same` triple, read verbatim off 0.8.189's own
// `sourceComparisonState`/`targetComparisonState`/`sameComparisonState` and
// `sourceFilter`/`targetFilter`/`sameFilter`. As in 0.8.189/0.8.190/0.8.191,
// neither `comparisonState` nor `filter` influences, or is influenced by,
// any of the three evidence sections below.
//
// NO COUNTS ON THIS FILE'S OWN RESULT — THE MIRROR IMAGE OF 0.8.190'S OWN
// RESTRAINT. `candidates`/`decisionEvidence`/`observationEvidence` below
// carry only `shared`/`sourceOnly`/`targetOnly` arrays — no `sharedCount`,
// `sourceOnlyCount`, `targetOnlyCount`, `sourceCount`, or `targetCount`
// field anywhere in this file's own result. A caller that needs the counts
// already has 0.8.190's own read model for that; this file exists to answer
// only "which exact records account for those counts?" — never to restate
// the counts themselves. A caller wanting both reads 0.8.189's own result
// once and hands it to both this file and 0.8.190, exactly as the diagram
// above shows.
//
// RECORD ORDER IS PRESERVED — NEVER RE-SORTED, NEVER RE-GROUPED. Every
// array this file returns is 0.8.189's own array, in 0.8.189's own order —
// the order 0.8.189 itself already establishes (source export order for
// `shared`/`sourceOnly`, target export order for `targetOnly` — see
// 0.8.189's own header, "Order preservation," and its own
// `partitionByIdentity()`). This file appends no record, drops no record,
// deduplicates nothing, and reorders nothing.
//
// NO RECORD IS EVER FABRICATED FROM A COUNT. This file never looks at
// `comparison.candidates.sharedCount` (or any other count 0.8.189 also
// happens to carry) to decide how many placeholder records to synthesize —
// every record in every array below is a reference to a record 0.8.189
// itself already produced, reached here only by forwarding 0.8.189's own
// `shared`/`sourceOnly`/`targetOnly` arrays unchanged.
//
// NO MUTATION OF THE SUPPLIED `comparison`, AND NO MUTATION OF ANYTHING IT
// HOLDS. Every object this file allocates and freezes is new; the record
// arrays themselves are 0.8.189's own already-frozen arrays, referenced
// (never copied) since this file adds, removes, and reorders nothing within
// them.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup, and
// mutates no argument. Calling it twice with byte-identical arguments
// returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID DETAIL VIEW — NEVER THROWS. A
// `comparison` that is `null`, `undefined`, or missing a genuine
// `candidates`/`decisionEvidence`/`observationEvidence` section on any
// dimension degrades that dimension to `{ shared: [], sourceOnly: [],
// targetOnly: [] }`, and a missing/malformed `sourceFilter`/`targetFilter`
// degrades `metadata.filter.source`/`target` to 0.8.189's own `{
// evidenceKind: 'ALL', replicaRelation: 'ALL' }` default, while a
// missing/malformed `sourceComparisonState`/`targetComparisonState`
// degrades `metadata.comparisonState.source`/`target` to `'NO_PEER'` on the
// missing side — the identical degrade-to-least-claimed behavior
// 0.8.189/0.8.190/0.8.191 already use, duplicated here for the identical
// reason 0.8.191 itself duplicates 0.8.189's own normalization: this file
// must apply the same rule without importing a module that itself carries
// comparison vocabulary (see "Architectural boundary," below).
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. `describeXxx()` below
// performs a pure, structural, duck-typed transform of whatever shape it is
// handed — it never imports 0.8.189's own module to validate that shape,
// exactly the way 0.8.191's own `describeXxx()` duck-typed `readModel`
// without importing 0.8.190. There is therefore nothing here for a caller
// to accidentally import that would open a path back into comparison
// logic, evidence partitioning, export reading, import reading, or any
// archive module. A caller that wants this detail view built from two real
// exported documents calls 0.8.189's own `describeXxx()` and hands its
// result here directly. There is deliberately no `reconstructXxx()` in
// this file: there is no archive pair, and no pair of exported documents,
// for this file itself to read.
//
// CRITICAL ARCHITECTURAL RULE — THIS IS NOT A LEADERBOARD, AND NOT A
// SYNCHRONIZATION MECHANISM. No rank, score, winner, better/worse,
// correct/incorrect, conflict, stale, confidence, or recommendation
// vocabulary appears anywhere in this file or its result, and this file
// performs no transport of any record from one document toward the other.
// A record's presence in `sourceOnly` or `targetOnly` is reported as
// exactly that fact, never a correction to apply — see 0.8.189's own
// header, "A comparison, not a reconciliation," held here again, two
// layers up.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Regrouping evidence by candidate.** See "Evidence stays flat," above
//   — no concrete requirement drives that change, and 0.8.189 itself
//   already made the flat-pooling choice this file preserves.
// - **Any count field (`sharedCount`, `sourceOnlyCount`, `targetOnlyCount`,
//   `sourceCount`, `targetCount`) on any section.** See "No counts on this
//   file's own result," above — a caller needing counts already has
//   0.8.190's own read model.
// - **Consuming 0.8.190's own read model or 0.8.191's own view.** See "This
//   file reads 0.8.189's own result directly," above — the entire point of
//   this milestone is preserving the information-loss boundary 0.8.190
//   intentionally introduced, never routing around it from the other side.
// - **A rank, score, winner, better/worse, correct/incorrect, conflict,
//   stale, confidence, or recommendation field or vocabulary of any kind.**
//   Inherited unchanged from every layer beneath this one.
// - **Deduplication, merging, or collapsing of any two records that "look
//   similar."** See "Record order is preserved," above — inherited
//   unchanged from 0.8.189/0.8.182.
// - **Synchronization, transport, or "apply this difference" vocabulary of
//   any kind.** See "Critical architectural rule," above.
// - **Reading either exported document, either archive, 0.8.188's own
//   `importXxx()`, or 0.8.189's own `describeXxx()`.** This file's one
//   argument is always 0.8.189's own already-computed result — see
//   "Architectural boundary," above.
// - **Any markup, DOM nodes, or control-rendering technology choice.** This
//   file returns plain, frozen, JSON-safe data; an "Inspect records"
//   expansion UI (if ever built) is separate, later, UI-layer work.
// - **Persistence, or automatic/periodic/background computation of any
//   kind.** This function runs only when a caller explicitly calls it.

function isGenuineSection(value) {
    return Boolean(value) && typeof value === 'object';
}

const EMPTY_RECORDS = Object.freeze({
    shared: Object.freeze([]),
    sourceOnly: Object.freeze([]),
    targetOnly: Object.freeze([])
});

function recordsOf(comparison, key) {
    const section = isGenuineSection(comparison) ? comparison[key] : undefined;
    if (!isGenuineSection(section)) return EMPTY_RECORDS;
    return Object.freeze({
        shared: Array.isArray(section.shared) ? section.shared : EMPTY_RECORDS.shared,
        sourceOnly: Array.isArray(section.sourceOnly) ? section.sourceOnly : EMPTY_RECORDS.sourceOnly,
        targetOnly: Array.isArray(section.targetOnly) ? section.targetOnly : EMPTY_RECORDS.targetOnly
    });
}

const DEFAULT_COMPARISON_STATE = Object.freeze({ source: 'NO_PEER', target: 'NO_PEER', same: true });

function comparisonStateOf(comparison) {
    if (!isGenuineSection(comparison)) return DEFAULT_COMPARISON_STATE;
    const source = comparison.sourceComparisonState ? comparison.sourceComparisonState : 'NO_PEER';
    const target = comparison.targetComparisonState ? comparison.targetComparisonState : 'NO_PEER';
    const same = typeof comparison.sameComparisonState === 'boolean' ? comparison.sameComparisonState : source === target;
    return Object.freeze({ source, target, same });
}

const DEFAULT_FILTER_SIDE = Object.freeze({ evidenceKind: 'ALL', replicaRelation: 'ALL' });

function filterSideOf(filter) {
    if (!isGenuineSection(filter)) return DEFAULT_FILTER_SIDE;
    return Object.freeze({
        evidenceKind: filter.evidenceKind || 'ALL',
        replicaRelation: filter.replicaRelation || 'ALL'
    });
}

function filterOf(comparison) {
    if (!isGenuineSection(comparison)) {
        return Object.freeze({ source: DEFAULT_FILTER_SIDE, target: DEFAULT_FILTER_SIDE, same: true });
    }
    const source = filterSideOf(comparison.sourceFilter);
    const target = filterSideOf(comparison.targetFilter);
    const same = typeof comparison.sameFilter === 'boolean'
        ? comparison.sameFilter
        : (source.evidenceKind === target.evidenceKind && source.replicaRelation === target.replicaRelation);
    return Object.freeze({ source, target, same });
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail()
// — see this file's own header for the full contract. Never re-computes or
// re-partitions any of 0.8.189's own record arrays; malformed/absent input
// degrades to an empty, `NO_PEER`/`ALL`/`ALL` detail view, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison) {
    return Object.freeze({
        metadata: Object.freeze({
            comparisonState: comparisonStateOf(comparison),
            filter: filterOf(comparison)
        }),
        candidates: recordsOf(comparison, 'candidates'),
        decisionEvidence: recordsOf(comparison, 'decisionEvidence'),
        observationEvidence: recordsOf(comparison, 'observationEvidence')
    });
}
