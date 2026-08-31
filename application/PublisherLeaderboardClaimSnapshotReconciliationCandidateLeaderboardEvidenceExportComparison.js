import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';
import {
    ReconciliationCandidateLeaderboardComparisonState
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';

// 0.8.189 — Reconciliation Candidate Leaderboard Evidence Export Comparison.
//
// 0.8.186 turned an on-screen, already-filtered evidence view into a
// portable JSON document; 0.8.188 gave a reader a way to bring one back and
// look at it again. Neither one answers a question that only comes up once
// TWO such documents exist — a report from last week, and a report from
// today; a report you exported, and one a peer emailed you:
//
//   "How do these two EXPORTED REPORTS differ?"
//
// That is a genuinely different question from every comparison this
// codebase has built so far. 0.8.181/0.8.183/0.8.176/0.8.149/0.8.166 all
// compare `sourceArchive` against `targetArchive` — two LIVE, append-only
// histories a replica actually holds. This file compares two PORTABLE
// DOCUMENTS — two already-frozen snapshots of whatever a filter and a
// comparison state once decided to put on screen. Neither document is an
// archive; neither is "live"; neither is more authoritative than the
// other. This file is the answer, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport)
//     -> { sourceComparisonState, targetComparisonState, sameComparisonState,
//          sourceFilter, targetFilter, sameFilter,
//          candidates: { sourceCount, targetCount, sharedCount, sourceOnlyCount, targetOnlyCount, shared, sourceOnly, targetOnly },
//          decisionEvidence: { ...identical six-field shape... },
//          observationEvidence: { ...identical six-field shape... } }
//
//   sourceExport / targetExport — two documents shaped exactly like 0.8.186's
//   own export result (or 0.8.188's own imported result — the two are
//   structurally identical): `{ comparisonState, filter, candidates: [{
//   candidate, decisionDetail, observationDetail }] }`. Either argument may
//   be a fresh export, an imported document, or anything shaped like one;
//   this file never cares which.
//
//   0.8.186 Evidence Export ──┐
//                             ├──► 0.8.189 Evidence Export Comparison   ★ (THIS FILE)
//   0.8.186 Evidence Export ──┘         (a second, independent document,
//        (or 0.8.188's own                whether freshly exported or
//         imported document)              brought back by 0.8.188)
//
// THIS FILE NEVER RE-VALIDATES A DOCUMENT'S SHAPE — 0.8.188 ALREADY OWNS
// THAT BOUNDARY. There is no `importXxx()` here, and no structural
// validation of `protocolVersion`/count-agrees-with-length/etc. — a caller
// who wants that assurance runs a document through 0.8.188's own
// `importXxx()` first, exactly the way this codebase already keeps
// "validate the envelope" and "read what the envelope says" as two
// separate concerns (0.8.188's own header, "a STRUCTURAL check, not a
// semantic one," held here one layer up again: this file trusts a
// document's shape completely, and reads it for content).
//
// A COMPARISON, NOT A RECONCILIATION — THE ONE RULE EVERYTHING ELSE HERE
// EXISTS TO PROTECT. `sourceExport` naming something `targetExport` does
// not is reported as EXACTLY ONE FACT: that item is exclusive to
// `sourceExport`. It is never reported, labeled, or implied to be correct,
// incorrect, stale, superseded, or something that should be synchronized
// onto the other document. Two exported reports disagreeing is expected,
// ordinary, and says nothing on its own about which replica's underlying
// archive is more complete, more current, or more trustworthy — it only
// ever says what each document, as exported, actually contains. See
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict (0.8.57)," held here again, one layer up from every prior
// comparison in this family.
//
// CANDIDATE PRESENCE IS NEVER CONFUSED WITH EVIDENCE AGREEMENT — THE
// FLAGSHIP DISTINCTION THIS MILESTONE EXISTS TO DRAW. A candidate can be
// `shared` (the identical candidate identity appears in both documents)
// while its own decision/observation evidence is entirely asymmetric
// between the two documents — one export narrowed by a filter the other
// wasn't, or produced from a peer comparison the other never had. This
// file computes `candidates` and `decisionEvidence`/`observationEvidence`
// as THREE COMPLETELY INDEPENDENT COMPARISONS, never one derived from
// another: a candidate's own presence in `candidates.shared` implies
// nothing whatsoever about whether any of its evidence records also
// appear in `decisionEvidence.shared`/`observationEvidence.shared`, and a
// record appearing in `decisionEvidence.shared` implies nothing about
// which document a NEIGHBORING record for the identical candidate landed
// in.
//
// EVIDENCE IS COMPARED FLAT, ACROSS EVERY CANDIDATE AT ONCE — NEVER
// GROUPED BY CANDIDATE, AND NEVER GROUPED BY THE EXPORTING DOCUMENT'S OWN
// shared/sourceOnly/targetOnly LABEL. Each document's own `candidates[].
// decisionDetail.shared/sourceOnly/targetOnly` records the relationship
// THAT DOCUMENT'S OWN comparison already established, between ITS OWN
// `sourceArchive` and `targetArchive`, at the moment it was produced —
// a fact belonging entirely to that one document's own history, carrying
// no meaning whatsoever for a comparison between two DIFFERENT documents.
// This file discards that label entirely: every decision record across
// every candidate in `sourceExport` (shared, source-only, and target-only
// alike) is pooled into one flat multiset, and the identical pooling
// happens for `targetExport`; the two pools are then compared by content.
// A record's own `candidate` field (already embedded on every decision
// record, and already surfaced onto every observation record by 0.8.182)
// still ties it back to a candidate — nothing about "which candidate this
// evidence concerns" is lost — it is simply never used to GROUP this
// file's own output, exactly the way `candidates`' own comparison below
// never groups by evidence.
//
// EVIDENCE IDENTITY IS THE EXISTING STRUCTURAL IDENTITY THE EXPORTED
// RECORDS ALREADY CARRY — NEVER A NEW IDENTITY SYSTEM. A decision record
// exported by 0.8.186 already carries its own complete content (`candidate`
// + `decision` + `decidedAt`, plus `decided`); an observation record
// already carries its own complete, already-surfaced content (`candidate`
// + `decision` + `planIdentity` + `candidatePresent` + `candidateType` +
// `candidateMatchesPlan` + `observedAt`). Two records are the SAME
// evidence only when the COMPLETE exported record is structurally
// identical — the identical "identity is exact structural equality" rule
// 0.8.117's own `AchievementEvidenceDifference.js`, 0.8.149's own
// `canonicalDecisionKey()`, and 0.8.166's own `canonicalObservationKey()`
// each already hold, applied here to a document's own already-exported
// record shape rather than re-deriving a narrower key. `candidateKey()`
// below is the identical `JSON.stringify(candidate)` key 0.8.147's/
// 0.8.153's/0.8.156's/0.8.171's/0.8.174's own `candidateKey()`/
// `candidateIdentityKey()` already use.
//
// MULTISET COMPARISON THROUGHOUT, NEVER A SET — THE IDENTICAL RESTRAINT
// 0.8.116/0.8.117/0.8.149/0.8.166 ALREADY HOLD, HELD HERE ACROSS ALL THREE
// COMPARISONS (candidates, decisions, observations). Two occurrences of an
// identical record in `sourceExport` against one occurrence in
// `targetExport` report exactly one occurrence as `shared` and exactly one
// as `sourceOnly` — never zero (a naive "does this exist somewhere in the
// other document?" check) and never two. See `partitionByIdentity()`
// below.
//
// METADATA STAYS INDEPENDENT OF EVIDENCE, ON PURPOSE. `sourceComparisonState`/
// `targetComparisonState`/`sameComparisonState` and `sourceFilter`/
// `targetFilter`/`sameFilter` are reported entirely separately from
// `candidates`/`decisionEvidence`/`observationEvidence`, and neither
// influences the other: two documents can carry byte-identical evidence
// while differing in `filter` (one exported `OBSERVATIONS`+`SOURCE_ONLY`,
// the other `OBSERVATIONS`+`TARGET_ONLY`, over the identical underlying
// records) or in `comparisonState` (`NO_PEER` vs `PEER_EMPTY`, the
// identical distinction 0.8.183/0.8.186/0.8.188 already keep alive through
// export and import) — this file preserves that disagreement rather than
// collapsing it, and never infers one field from another.
//
// THE RESULT NEVER COLLAPSES INTO ONE BOOLEAN. There is no top-level
// `same`, `identical`, or `matches` field anywhere in this file's own
// result — a reader who wants to know "are these the same?" has to look at
// `sameComparisonState`, `sameFilter`, and the three independent zero/
// nonzero `sourceOnlyCount`/`targetOnlyCount` pairs, exactly the layered
// answer this milestone's own request asked for, never one flag standing
// in for all of it.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK.
// `describeXxx()` reads no clock, contacts no server, and mutates neither
// argument. Calling it twice with byte-identical arguments returns a
// byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID COMPARISON — NEVER THROWS.
// A `sourceExport`/`targetExport` that is `null`, `undefined`, or missing a
// genuine `candidates` array is treated as an export with no candidates, a
// `filter` of `{ evidenceKind: 'ALL', replicaRelation: 'ALL' }`, and a
// `comparisonState` of `NO_PEER` — the identical degrade-to-least-claimed
// defaults 0.8.186's own `describeXxx()` already uses for the identical
// reason.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY TWO MODULES: 0.8.184
// (its frozen `evidenceKind`/`replicaRelation` enums, reused rather than
// redeclared) and 0.8.183 (its frozen `comparisonState` enum). It never
// imports `PublicationObservationArchive` or any archive-reading module,
// never imports 0.8.176/0.8.182/0.8.185 (any live-archive evidence
// projection), and never imports 0.8.186's own `describeXxx()`/
// `reconstructXxx()` or 0.8.188's own `importXxx()`/`describeXxx()` — this
// file takes two already-produced documents directly as arguments and
// performs no export or import of its own. There is deliberately no
// `reconstructXxx()` in this file: there is no archive pair to reconstruct
// from, and comparing two exported reports is never wired back into a
// live archive comparison.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reading either archive, or any live-archive comparison.** See
//   "Architectural boundary," above — this file's only inputs are two
//   already-exported documents.
// - **Reconciliation, synchronization, or merging of any kind.** See "A
//   comparison, not a reconciliation," above — `sourceOnly`/`targetOnly`
//   describe absence from one document, never a correction to apply.
// - **A score, rank, winner, `correct`/`incorrect`, `valid`, `stale`,
//   `preferred`, `status`, or `confidence` field or vocabulary of any
//   kind.** Inherited unchanged from every layer beneath this one.
// - **Grouping evidence by candidate, or candidates by evidence.** See
//   "Candidate presence is never confused with evidence agreement," above
//   — the three comparisons in this file's own result are independent by
//   construction.
// - **Deduplication of any kind, in either document, before or after
//   comparison.** See "Multiset comparison throughout," above.
// - **Importing, validating, or parsing raw JSON text.** That boundary
//   stays entirely 0.8.188's own; this file's two arguments are already
//   structured documents.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, JSON-safe data; a UI for comparing
//   two exported reports (if ever built) is separate, later, UI-layer
//   work — see this milestone's own request, "not yet in the leaderboard
//   UI."
const EMPTY_CANDIDATES = Object.freeze([]);

function isGenuineExport(value) {
    return Boolean(value) && typeof value === 'object' && Array.isArray(value.candidates);
}

function normalizeEvidenceKind(value) {
    return value === ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS
        || value === ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS
        ? value
        : ReconciliationCandidateLeaderboardEvidenceKind.ALL;
}

function normalizeReplicaRelation(value) {
    return value === ReconciliationCandidateLeaderboardReplicaRelation.SHARED
        || value === ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY
        || value === ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY
        ? value
        : ReconciliationCandidateLeaderboardReplicaRelation.ALL;
}

// normalizeFilter()/normalizeComparisonState() — duplicated from 0.8.186's
// own (non-exported) normalization, for the identical reason 0.8.186 itself
// duplicates 0.8.184's own: this file must apply the exact same
// degrade-to-least-claimed rule without importing a module that itself
// carries export/import vocabulary. Degrade-to-`'ALL'`/`'NO_PEER'` behavior
// is byte-identical to 0.8.186's/0.8.188's own.
function normalizeFilter(filter) {
    if (filter && typeof filter === 'object') {
        return Object.freeze({
            evidenceKind: normalizeEvidenceKind(filter.evidenceKind),
            replicaRelation: normalizeReplicaRelation(filter.replicaRelation)
        });
    }
    return Object.freeze({
        evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.ALL,
        replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.ALL
    });
}

function normalizeComparisonState(comparisonState) {
    return comparisonState === ReconciliationCandidateLeaderboardComparisonState.PEER_EMPTY
        || comparisonState === ReconciliationCandidateLeaderboardComparisonState.PEER_PRESENT
        ? comparisonState
        : ReconciliationCandidateLeaderboardComparisonState.NO_PEER;
}

// The complete structural identity key for a candidate object — the
// identical `JSON.stringify(candidate)` key 0.8.147's/0.8.153's/0.8.156's/
// 0.8.171's/0.8.174's own `candidateKey()`/`candidateIdentityKey()` already
// use, duplicated here rather than imported (see this file's own header,
// "Architectural boundary").
function candidateKey(candidate) {
    return JSON.stringify(candidate);
}

// A decision/observation record's own complete, already-exported content
// already IS its own identity — see this file's own header, "Evidence
// identity is the existing structural identity the exported records
// already carry." `JSON.stringify()` of the whole record is stable because
// every genuine exported record this file ever receives was produced by
// the identical fixed-field-order code path (0.8.182's own
// `buildDecisionDetail()`/`withSurfacedCandidate()`), mirroring 0.8.117's
// own `canonicalRecordKey()` reasoning one layer up.
function recordKey(record) {
    return JSON.stringify(record);
}

// The multiset (bag) partition of `sourceItems` against `targetItems`,
// preserving multiplicity throughout — see this file's own header,
// "Multiset comparison throughout." Returns `{ shared, sourceOnly,
// targetOnly }`: `shared`/`sourceOnly` are computed from `sourceItems`, in
// `sourceItems`' own order; `targetOnly` is computed from `targetItems`, in
// `targetItems`' own order. Each item on one side cancels out AT MOST ONE
// matching item (by `keyOf()`, never merely "exists somewhere") on the
// other side — `[A, A, B]` compared against `[A, B]` reports exactly one
// `A` as `sourceOnly`, never zero and never two.
function partitionByIdentity(sourceItems, targetItems, keyOf) {
    const targetRemaining = new Map();
    for (const item of targetItems) {
        const key = keyOf(item);
        targetRemaining.set(key, (targetRemaining.get(key) || 0) + 1);
    }

    const shared = [];
    const sourceOnly = [];
    for (const item of sourceItems) {
        const key = keyOf(item);
        const count = targetRemaining.get(key) || 0;
        if (count > 0) {
            targetRemaining.set(key, count - 1);
            shared.push(item);
        } else {
            sourceOnly.push(item);
        }
    }

    const sourceRemaining = new Map();
    for (const item of sourceItems) {
        const key = keyOf(item);
        sourceRemaining.set(key, (sourceRemaining.get(key) || 0) + 1);
    }

    const targetOnly = [];
    for (const item of targetItems) {
        const key = keyOf(item);
        const count = sourceRemaining.get(key) || 0;
        if (count > 0) {
            sourceRemaining.set(key, count - 1);
        } else {
            targetOnly.push(item);
        }
    }

    return { shared, sourceOnly, targetOnly };
}

function buildComparisonSection(sourceItems, targetItems, keyOf) {
    const { shared, sourceOnly, targetOnly } = partitionByIdentity(sourceItems, targetItems, keyOf);
    return Object.freeze({
        sourceCount: sourceItems.length,
        targetCount: targetItems.length,
        sharedCount: shared.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        shared: Object.freeze(shared),
        sourceOnly: Object.freeze(sourceOnly),
        targetOnly: Object.freeze(targetOnly)
    });
}

// Every decision (or observation) record across every candidate entry in
// `entries`, pooled into one flat array in the entries' own order, and
// within each entry, `shared` then `sourceOnly` then `targetOnly` — see
// this file's own header, "Evidence is compared flat." `detailKey` selects
// `decisionDetail` or `observationDetail`.
function flattenRecords(entries, detailKey) {
    const records = [];
    for (const entry of entries) {
        const detail = entry && entry[detailKey];
        if (!detail) continue;
        if (Array.isArray(detail.shared)) records.push(...detail.shared);
        if (Array.isArray(detail.sourceOnly)) records.push(...detail.sourceOnly);
        if (Array.isArray(detail.targetOnly)) records.push(...detail.targetOnly);
    }
    return records;
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison()
// — see this file's own header for the full contract. Never re-validates
// `sourceExport`/`targetExport`'s own structural shape (that boundary
// belongs entirely to 0.8.188); malformed/absent input on either side
// degrades to an empty export with `NO_PEER`/`ALL`/`ALL` defaults.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport) {
    const sourceEntries = isGenuineExport(sourceExport) ? sourceExport.candidates : EMPTY_CANDIDATES;
    const targetEntries = isGenuineExport(targetExport) ? targetExport.candidates : EMPTY_CANDIDATES;

    const sourceComparisonState = normalizeComparisonState(sourceExport && sourceExport.comparisonState);
    const targetComparisonState = normalizeComparisonState(targetExport && targetExport.comparisonState);

    const sourceFilter = normalizeFilter(sourceExport && sourceExport.filter);
    const targetFilter = normalizeFilter(targetExport && targetExport.filter);

    const sourceCandidates = sourceEntries.map((entry) => entry.candidate);
    const targetCandidates = targetEntries.map((entry) => entry.candidate);

    const sourceDecisionRecords = flattenRecords(sourceEntries, 'decisionDetail');
    const targetDecisionRecords = flattenRecords(targetEntries, 'decisionDetail');

    const sourceObservationRecords = flattenRecords(sourceEntries, 'observationDetail');
    const targetObservationRecords = flattenRecords(targetEntries, 'observationDetail');

    return Object.freeze({
        sourceComparisonState,
        targetComparisonState,
        sameComparisonState: sourceComparisonState === targetComparisonState,

        sourceFilter,
        targetFilter,
        sameFilter: sourceFilter.evidenceKind === targetFilter.evidenceKind && sourceFilter.replicaRelation === targetFilter.replicaRelation,

        candidates: buildComparisonSection(sourceCandidates, targetCandidates, candidateKey),
        decisionEvidence: buildComparisonSection(sourceDecisionRecords, targetDecisionRecords, recordKey),
        observationEvidence: buildComparisonSection(sourceObservationRecords, targetObservationRecords, recordKey)
    });
}
