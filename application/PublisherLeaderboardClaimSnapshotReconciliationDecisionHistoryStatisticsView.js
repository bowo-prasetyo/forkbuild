// 0.8.147 — Reconciliation Decision History Statistics Projection.
//
// 0.8.146 answered "what durable decision records exist, and how are they
// looked up by claim, by snapshot, or by disposition?" and stopped there —
// an append-only collection plus three exact, order-preserving `findXxx()`
// lookups, deliberately excluding "decision counts, distinct-candidate
// counts, per-disposition counts, or any other aggregate/statistics
// projection" (see that file's own header, "Deliberately excluded," bullet
// three). This file is that projection, and nothing more — the
// decision-history analogue of
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js` (0.8.128),
// one subject over: where that file tallies a replica's own stored claim
// RECEIPTS, this file tallies a replica's own stored reconciliation
// DECISIONS (0.8.146's own, plain, ordered array of 0.8.145's own decision
// records):
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history)
//     -> { decisionCount, distinctCandidateCount, distinctClaimIdCount,
//          distinctSnapshotIndexCount, observeCount, deferCount,
//          dispositionCounts, candidateTypeCounts }
//
// THE QUESTION IS "WHAT MEASURABLE DECISIONS EXIST?" — NEVER "IS A DECISION
// CURRENT?", "HAS A CANDIDATE BEEN RESOLVED?", OR "DOES THE HISTORY STILL
// AGREE WITH THE PLAN?" THIS IS THE ONE BOUNDARY THIS WHOLE MILESTONE
// EXISTS TO HOLD. Every field below answers a plain, closed, factual
// question about the history a caller already holds — "how many," "how
// many distinct," "how many of each" — and none of them interprets
// `OBSERVE`/`DEFER`, determines whether a decision is still current, or
// compares any decision against a freshly computed plan. See
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s own
// header, "The question is 'what measurable facts exist?'," held here again
// over a decision history instead of a claim history.
//
// CANDIDATE IDENTITY IS THE COMPLETE STRUCTURAL CANDIDATE, NEVER `claimId`
// ALONE OR `snapshotIndex` ALONE — THE ONE DISTINCTION THIS MILESTONE
// EXISTS TO PRESERVE, INHERITED DIRECTLY FROM 0.8.144'S OWN THREE CANDIDATE
// SHAPES. A candidate's identity key is:
//
//   DIVERGENT_CORRESPONDENCE            -> type + claimId + snapshotIndex
//   CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT -> type + claimId
//   SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM -> type + snapshotIndex
//
// Two decision entries whose own `candidate.type` differs are always
// distinct candidates even when they happen to share a `claimId` or
// `snapshotIndex` value — the `type` tag is part of the identity key, never
// dropped. This is 0.8.144's own header, "Fields that don't exist are never
// invented," held here again over statistics instead of selection: a
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` candidate and a
// `DIVERGENT_CORRESPONDENCE` candidate that happen to name the same
// `claimId` are two different structural facts about the world, and
// counting them as "one candidate" would erase exactly the distinction
// 0.8.144 was built to hold.
//
// DECISION COUNT vs. DISTINCT CANDIDATE COUNT — REUSING 0.8.128'S OWN
// "RECEIPT IDENTITY IS NOT CLAIM IDENTITY" DISTINCTION ONE LAYER UP.
// `decisionCount` counts stored HISTORY ENTRIES — every element of
// `history`, exactly as `history.length` itself would, including every
// repeated recording of the identical candidate under the identical (or a
// different) disposition. `distinctCandidateCount` counts CANDIDATES — the
// structural identity key above, each counted once no matter how many
// decisions were ever recorded against it, and regardless of whether those
// decisions agree with one another. Concretely, given the worked example in
// this milestone's own request:
//
//   OBSERVE  B <-> S2
//   DEFER    B <-> S3
//   OBSERVE  B <-> S2   (identical candidate, identical disposition)
//   OBSERVE  C <-> none
//   DEFER    none <-> S4
//
//   decisionCount            = 5
//   distinctCandidateCount   = 4   (B<->S2, B<->S3, C, S4)
//   distinctClaimIdCount     = 2   (B, C)
//   distinctSnapshotIndexCount = 3 (S2, S3, S4)
//   observeCount              = 3
//   deferCount                = 2
//
// The repeated `OBSERVE B<->S2` remains two decisions for `decisionCount`
// and `observeCount`, while contributing only once to
// `distinctCandidateCount` — the identical entry, recorded twice, is one
// candidate that received a decision twice, never two candidates.
//
// CANDIDATE IDENTITY AND DECISION IDENTITY ARE SEPARATE CONCEPTS — THE
// SECOND DISTINCTION THIS MILESTONE EXISTS TO MAKE OBSERVABLE. Changing
// only the disposition recorded against an otherwise-identical candidate —
// `OBSERVE(B,S2)` followed later by `DEFER(B,S2)` — produces TWO history
// entries (`decisionCount = 2`) but only ONE distinct candidate
// (`distinctCandidateCount = 1`), with `observeCount = 1` and
// `deferCount = 1` both nonzero simultaneously. A single candidate can
// therefore appear in this result as having received more than one
// disposition over its own history — this file states that plainly, as a
// count, and draws no conclusion from it about which disposition is
// "correct" or "current."
//
// `distinctClaimIdCount`/`distinctSnapshotIndexCount` COUNT FIELD VALUES
// ACROSS ALL THREE CANDIDATE SHAPES, NEVER CANDIDATES. `distinctClaimIdCount`
// tallies every distinct `candidate.claimId` that appears on ANY entry
// carrying that field — `DIVERGENT_CORRESPONDENCE` and
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` entries alike, mirroring 0.8.146's
// own `findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId()`.
// `distinctSnapshotIndexCount` does the same for `candidate.snapshotIndex`
// across `DIVERGENT_CORRESPONDENCE` and `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`
// entries. A `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` entry contributes
// nothing to `distinctClaimIdCount` (it carries no `claimId` field at all —
// 0.8.144's own "fields that don't exist are never invented," unchanged),
// and symmetrically a `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` entry
// contributes nothing to `distinctSnapshotIndexCount`. These two counts can
// therefore each be smaller than, equal to, or larger than
// `distinctCandidateCount`, depending entirely on how many of each
// candidate shape the history holds — no fixed relationship between them is
// assumed or asserted anywhere in this file.
//
// `dispositionCounts`/`candidateTypeCounts` PRESERVE FIRST-APPEARANCE
// ORDER — NEVER ALPHABETICAL, NEVER SORTED BY COUNT. Mirroring
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s own
// `signerIdentityCounts` convention exactly: each lists only the values
// that actually occur in `history`, each entry's own `count` stating
// exactly how many stored decisions carry that value, ordered by when that
// value first appears while scanning `history` in its own existing order —
// oldest recorded first, never re-sorted by name or by count.
// `dispositionCounts` reuses 0.8.145's own two-value vocabulary
// (`'OBSERVE'`/`'DEFER'`) exactly; `observeCount`/`deferCount` are the
// identical two counts surfaced as their own named top-level fields for
// convenience, computed from the identical scan, never a second,
// independent tally that could disagree with `dispositionCounts`.
// `candidateTypeCounts` reuses 0.8.144's own three-value vocabulary
// (`'DIVERGENT_CORRESPONDENCE'`/`'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT'`/
// `'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM'`) exactly.
//
// `deferCount` MEANS EXACTLY "THE NUMBER OF STORED DECISIONS WHOSE OWN
// `decision` EQUALS `'DEFER'`" — NEVER "THE NUMBER OF UNRESOLVED
// RECONCILIATION PROBLEMS." This is the one semantic line this whole
// milestone exists to hold. A `DEFER` decision records that a caller looked
// at a candidate and explicitly postponed further action on it (0.8.145's
// own header, "A deliberately narrow decision vocabulary") — it says
// nothing about whether that candidate has since been superseded, whether
// another decision was later recorded against the identical candidate, or
// whether the candidate still appears in a freshly computed plan at all.
// `deferCount` is a plain tally over stored dispositions, exactly as
// `observeCount` is, and carries no more interpretive weight than counting
// how many stored claim receipts came from a particular signer.
//
// NO INTERPRETATION OF `OBSERVE`/`DEFER`, NO "RESOLVED"/"PENDING"/"STALE"
// STATE, NO PLAN RECONSTRUCTION, NO CORRESPONDENCE DISCOVERY, NO SIGNATURE
// VERIFICATION, NO SNAPSHOT RECONSTRUCTION, NO CURRENT-STATE COMPARISON, NO
// AUTOMATIC CANDIDATE SELECTION, NO EXECUTION OF ANY KIND. This file reads
// only the `candidate`/`decision` fields already embedded, by value, in
// each 0.8.145 decision record — it never calls 0.8.139 through 0.8.146 a
// second time, never re-derives a fingerprint or a plan, and never compares
// a decision against anything outside `history` itself.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics()`
// — THE IDENTICAL SPLIT `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s
// OWN 0.8.128/0.8.130 PAIR ALREADY HOLDS.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics()`
// is the pure computation, over one plain, in-memory decision-history array
// (0.8.146's own shape). `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics()`
// below is presently a thin boundary that reads no decision history from
// `archive` at all — `PublicationObservationArchive` does not yet hold a
// reconciliation decision history collection (0.8.146's decision history
// has not yet been integrated into the archive, exactly as that file's own
// header never mentions `PublicationObservationArchive` and imports nothing
// from it), so this function always computes over an empty history, the
// identical "degrades to empty, never throws" boundary every reconstruction
// function in this codebase already holds for a collection an archive does
// not yet carry. A future milestone that teaches `PublicationObservationArchive`
// to hold a reconciliation decision history can teach this one function to
// read it, without disturbing the pure computation above or any caller
// already using it directly — the identical promise
// `PublisherLeaderboardClaimHistoryStatisticsView.js`'s own header already
// made about 0.8.130, now kept the same way here.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history or any entry it holds. Returns frozen
// objects and frozen arrays throughout. Calling either function twice with
// a byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY STATISTICS RESULT — NEVER THROWS.
// `null`, `undefined`, a non-array, or an array containing entries that are
// not genuine `{ decided: true, candidate, decision, decidedAt }` records
// are all tolerated exactly as
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s
// own `appendXxx()`/`findXxx()` already tolerate malformed entries:
// non-genuine entries are silently excluded, and an entirely
// malformed/absent history produces every count at zero and every array
// empty.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY. This
// file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`, or any
// other module in this family — it trusts nothing about how `history` was
// produced beyond its own documented shape, and never calls 0.8.146,
// 0.8.145, or 0.8.144 to re-derive or double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Interpretation of `OBSERVE`/`DEFER` as "resolved," "pending,"
//   "stale," or any other state.** See "`deferCount` means exactly," above.
// - **A decision history timeline, or ordering-by-`decidedAt`.** Entries
//   are counted, never chronologically re-derived — that is 0.8.148's own,
//   separately sized, later question.
// - **Historical decision difference between two replicas' histories.**
//   That is 0.8.149's own, separately sized, later question.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.145's/0.8.146's own headers — this file inherits that
//   boundary for free by never introducing action vocabulary of its own.
// - **Plan reconstruction, correspondence discovery, or signature
//   verification.** This file reads only `history`'s own already-embedded
//   `candidate`/`decision` fields, never a freshly computed plan.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like
//   `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s
//   own `history` argument.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history) {
    const entries = (Array.isArray(history) ? history : []).filter(isGenuineDecision);

    const candidateKeys = new Set();
    const distinctClaimIds = new Set();
    const distinctSnapshotIndexes = new Set();
    const dispositionCounts = tallyFirstAppearance(entries, 'disposition', (entry) => entry.decision);
    const candidateTypeCounts = tallyFirstAppearance(entries, 'type', (entry) => entry.candidate.type);

    for (const entry of entries) {
        const { candidate } = entry;
        candidateKeys.add(candidateIdentityKey(candidate));
        if (typeof candidate.claimId === 'string' && candidate.claimId.length > 0) {
            distinctClaimIds.add(candidate.claimId);
        }
        if (typeof candidate.snapshotIndex === 'number' && Number.isInteger(candidate.snapshotIndex)) {
            distinctSnapshotIndexes.add(candidate.snapshotIndex);
        }
    }

    return Object.freeze({
        decisionCount: entries.length,
        distinctCandidateCount: candidateKeys.size,
        distinctClaimIdCount: distinctClaimIds.size,
        distinctSnapshotIndexCount: distinctSnapshotIndexes.size,
        observeCount: countFor(dispositionCounts, 'disposition', 'OBSERVE'),
        deferCount: countFor(dispositionCounts, 'disposition', 'DEFER'),
        dispositionCounts: Object.freeze(dispositionCounts),
        candidateTypeCounts: Object.freeze(candidateTypeCounts)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics()
// — see this file's own header, "The identical split," above.
// `PublicationObservationArchive` does not yet hold a reconciliation
// decision history collection, so this always computes over an empty
// history — a valid, all-zero statistics result, never a throw — regardless
// of what `archive` itself contains.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(archive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics([]);
}

// A genuine 0.8.145 decision record: `{ decided: true, candidate, decision,
// decidedAt }`, with `candidate` one of 0.8.144's own three shapes and
// `decision` one of 0.8.145's own two-value vocabulary. Anything else —
// including a genuine-looking `{ decided: false, ... }` outcome — is not
// counted, mirroring
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s own
// `appendXxx()` tolerance exactly.
function isGenuineDecision(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
    );
}

// The complete structural candidate identity key — see this file's own
// header, "Candidate identity is the complete structural candidate,"
// above. `type` is always part of the key; `claimId`/`snapshotIndex` are
// included only when 0.8.144's own shape for that `type` carries them, so a
// candidate lacking a field is never coerced into matching one that
// legitimately carries `undefined`.
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

// The one, uniform first-appearance tally this file uses for both count
// maps — every stored decision in `entries` (never deduplicated) tallied by
// whatever string `keyOf()` extracts, in the order each distinct value is
// first seen while scanning `entries` in its own existing order.
// `fieldName` names the property on each returned entry
// (`disposition`/`type`), alongside its own `count`.
function tallyFirstAppearance(entries, fieldName, keyOf) {
    const tallied = [];
    const entryByValue = new Map();
    for (const entry of entries) {
        const value = keyOf(entry);
        if (typeof value !== 'string' || value.length === 0) continue;
        const existingEntry = entryByValue.get(value);
        if (existingEntry) {
            existingEntry.count += 1;
        } else {
            const tallyEntry = { [fieldName]: value, count: 1 };
            entryByValue.set(value, tallyEntry);
            tallied.push(tallyEntry);
        }
    }
    return tallied.map((entry) => Object.freeze(entry));
}

// Looks up one tally entry's own `count` by its own field value — 0 when
// that value never occurs in `counts` at all.
function countFor(counts, fieldName, value) {
    const found = counts.find((entry) => entry[fieldName] === value);
    return found ? found.count : 0;
}
