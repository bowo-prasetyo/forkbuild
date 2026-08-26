import { describeSnapshotMaterializationSourceCounts, describeSnapshotMaterializationOutcomeCounts } from './SnapshotMaterializationHistory.js';

// 0.8.43 — Unified Snapshot Acquisition Outcome & Possession UX.
//
// application/PublicationSnapshotPossessionView.js (0.8.39) answers "does
// this replica possess valid bytes RIGHT NOW?" application/
// SnapshotMaterializationHistory.js (0.8.38, extended by this same
// milestone with `describeSnapshotMaterializationOutcomeCounts()`) answers
// "what explicit attempts happened, and how did each one end?" Until now,
// a caller wanting both facts side by side had to call each of them
// separately and hold the two results apart itself. This file is the
// smallest possible COMPOSITION of the two, sitting beside both rather
// than replacing either:
//
//   describePublicationSnapshotPossession()               (0.8.39, UNCHANGED)
//   describeSnapshotMaterializationSourceCounts()/
//   describeSnapshotMaterializationOutcomeCounts()   (0.8.38/0.8.43, UNCHANGED)
//              │
//              ▼
//   describePublicationSnapshotAcquisition()                   (THIS FILE)
//              │
//              ▼
//     { publicationId, contentHash,
//       possession: { state },
//       acquisition: { attemptCount, storedCount, alreadyAvailableCount,
//                       hashMismatchCount, sources: { package, placement, peer } } }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: this is DESCRIPTION, never
// EVALUATION. `possession.state` is reported EXACTLY as `possessionView` (a
// caller-supplied application/PublicationSnapshotPossessionView.js result)
// already holds it — this file never infers, corrects, or overrides
// current possession from whatever `materializationHistory` happens to
// narrate. A history showing a successful PEER "stored" entry alongside a
// `possessionView` reporting NOT_AVAILABLE is an entirely ordinary,
// non-contradictory result: the bytes could have been deleted since a
// prior session. A history showing only a rejected HASH_MISMATCH entry
// alongside a `possessionView` reporting AVAILABLE is equally ordinary: a
// later, unrecorded check, or a subsequent successful attempt this
// history's own caller never happened to record, could have replaced the
// bad bytes. Neither combination is corrected, flagged as inconsistent, or
// resolved by this function — see docs/Principles.md, "Current Snapshot
// Possession Is Independent Of How The Snapshot Was Acquired (0.8.43)" and
// "Acquisition History Explains Past Attempts; It Does Not Determine
// Present Possession (0.8.43)."
//
// NO SCORE, NO VERDICT, NO RANKING — the identical restraint every file
// this one composes already holds, extended to their combination.
// `acquisition` carries plain counts only: how many attempts were made,
// how many stored bytes, how many found bytes already present, how many
// were rejected, and how many attempts named each source. There is no
// `confidence`, `quality`, `reliability`, `bestSource`, `preferredSource`,
// or `successRate` anywhere in this file, and none should ever be added —
// a publication with one PACKAGE attempt and a publication with three PEER
// attempts are never compared against one another by this function; each
// is described entirely on its own terms.
//
// INTRODUCES NO NEW STATE MACHINE. This file computes nothing a caller
// could not already compute itself by calling application/
// PublicationSnapshotPossessionView.js and application/
// SnapshotMaterializationHistory.js separately and reading both results
// side by side — it exists only to save every caller from repeating that
// same, tiny composition by hand, and to give it one small, testable shape.
// It never reads a placement, a peer possession comparison, a catalog, or
// content/ContentStore.js itself — every fact it reports was already
// computed by its own caller.
//
// `possessionView`: application/PublicationSnapshotPossessionView.js#
// describePublicationSnapshotPossession()'s own result, or null/absent (no
// local availability check has ever completed — reported here as
// `possession.state: null`, the identical "not yet observed" meaning that
// file's own header already establishes, never "known to be missing").
// `materializationHistory`: an application/SnapshotMaterializationHistory.js
// -shaped array (or null/empty — no attempt has ever completed for this
// entry, this session). `publicationId`/`contentHash`: supplied by the
// caller directly, mirroring application/SnapshotPeerPossessionComparisonView.js#
// describeSnapshotPeerPossessionComparison()'s own two leading parameters
// — never derived from `possessionView`, which may itself be the "not yet
// observed" null-state shape and carry neither.
//
// Pure and stateless: no constructor, no injected dependency, no caching,
// no store, no network. Calling this twice with byte-identical arguments
// returns a byte-identical result.
export function describePublicationSnapshotAcquisition({
    publicationId = null,
    contentHash = null,
    possessionView = null,
    materializationHistory = []
} = {}) {
    const history = Array.isArray(materializationHistory) ? materializationHistory : [];
    const outcomeCounts = describeSnapshotMaterializationOutcomeCounts(history);
    const sourceCounts = describeSnapshotMaterializationSourceCounts(history);
    return Object.freeze({
        publicationId,
        contentHash,
        possession: Object.freeze({
            state: (possessionView && possessionView.possession) ? possessionView.possession.state : null
        }),
        acquisition: Object.freeze({
            attemptCount: history.length,
            storedCount: outcomeCounts.stored,
            alreadyAvailableCount: outcomeCounts.alreadyAvailable,
            hashMismatchCount: outcomeCounts.hashMismatch,
            sources: Object.freeze({ ...sourceCounts })
        })
    });
}
