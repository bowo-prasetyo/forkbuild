import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { observeBitcoinAnchorChainPlacementChanges } from './BitcoinAnchorChainPlacementObserver.js';
import { analyzeBitcoinAnchorObservationConsistency } from './BitcoinAnchorObservationConsistencyAnalyzer.js';

// 0.8.79 — Durable Bitcoin Anchor Evidence Restoration & Historical
// Inspection.
//
// application/PublicationObservationArchive.js (0.8.75) holds Bitcoin
// facts for however many distinct anchors a person's own session has ever
// broadcast, confirmed, or content-proofed — but nothing in that class, or
// in application/PublicationObservationArchiveView.js's own cross-domain
// timeline, ever answers "which anchors does this archive actually hold,
// and how much does it hold for each one?" This file is that one factual
// index:
//
//   describeBitcoinAnchorObservationArchive(archive)
//     -> { anchorCount, anchors: [{ anchorId,
//            broadcastObservationCount, confirmationObservationCount,
//            contentProofObservationCount, chainPlacementComparisonCount,
//            consistencyFindingCount }, ...] }
//
// COUNTS ARE DESCRIPTIVE, NOT COMPLETENESS INDICATORS. Exactly the
// restraint application/BitcoinAnchorObservationEvidenceView.js's own
// header already holds for one anchor's own evidence bundle, held here
// again for a whole archive's own index: a `confirmationObservationCount`
// of 5 is not narrated as "well observed," and a `broadcastObservationCount`
// of 0 is not narrated as a gap or a warning. There is no `health`,
// `confidence`, `status`, `risk`, `reliability`, `valid`, `trusted`, or
// `canonical` field anywhere in this file's output.
//
// `chainPlacementComparisonCount`/`consistencyFindingCount` are COUNTS OF
// COMPARISONS AND FINDINGS, never a second copy of the underlying
// confirmation observations, and never persisted anywhere themselves — see
// application/PublicationObservationArchive.js's own header, "No
// Persistence Of Derived Observations." They are produced by calling
// application/BitcoinAnchorChainPlacementObserver.js#observeBitcoinAnchorChainPlacementChanges()
// (0.8.76) and application/BitcoinAnchorObservationConsistencyAnalyzer.js#
// analyzeBitcoinAnchorObservationConsistency() (0.8.77) fresh, on every
// call, over exactly the durable confirmation history this archive already
// holds for that one anchor — the identical "derived on read, never
// stored" discipline application/BitcoinAnchorDurableEvidenceView.js's own
// header holds one file over, for one anchor's own full evidence bundle
// rather than this file's own per-anchor counts.
//
// ANCHOR IDENTITY IS anchorId, NEVER contentHash OR txid. The anchors this
// function lists are exactly the distinct `anchorId` values the archive's
// own `bitcoinBroadcastRecords`, `bitcoinConfirmationObservationsByAnchorId`,
// and `bitcoinContentProofObservationsByAnchorId` already use as their own
// identity — never grouped, merged, or deduplicated by any other field.
// Two anchors sharing an identical `contentHash` (see application/
// BitcoinAnchorObservationEvidence.js's own flagship scenario) still
// appear here as two, entirely separate rows.
//
// A NON-ARCHIVE INPUT NEVER THROWS. Mirrors application/
// PublicationObservationArchiveView.js's own "malformed input degrades to
// empty" restraint exactly: anything that is not a genuine
// `PublicationObservationArchive` instance is treated as
// `PublicationObservationArchive.empty()`, producing `{ anchorCount: 0,
// anchors: [] }`.
//
// PURE AND STATELESS. No constructor, no network access, no storage access
// of its own, no history of its own. Calling this twice with the
// byte-identical archive returns a byte-identical result.
export function describeBitcoinAnchorObservationArchive(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    const anchors = collectAnchorIds(safeArchive).map((anchorId) => describeOneAnchor(safeArchive, anchorId));

    return Object.freeze({ anchorCount: anchors.length, anchors: Object.freeze(anchors) });
}

// Every distinct `anchorId` the archive holds ANY Bitcoin fact for, in
// first-seen order across broadcast records, then confirmation
// observations, then content-proof observations — a stable, deterministic
// order, never a re-sort by count or recency.
function collectAnchorIds(archive) {
    const seen = new Set();
    const anchorIds = [];
    function collect(ids) {
        for (const anchorId of ids) {
            if (!seen.has(anchorId)) {
                seen.add(anchorId);
                anchorIds.push(anchorId);
            }
        }
    }
    collect(archive.bitcoinBroadcastRecords.map((record) => record.anchorId));
    collect(Object.keys(archive.bitcoinConfirmationObservationsByAnchorId));
    collect(Object.keys(archive.bitcoinContentProofObservationsByAnchorId));
    return anchorIds;
}

function describeOneAnchor(archive, anchorId) {
    const confirmationObservations = archive.bitcoinConfirmationObservationsByAnchorId[anchorId] || [];
    const contentProofObservations = archive.bitcoinContentProofObservationsByAnchorId[anchorId] || [];
    const broadcastObservationCount = archive.bitcoinBroadcastRecords
        .filter((record) => record.anchorId === anchorId).length;

    return Object.freeze({
        anchorId,
        broadcastObservationCount,
        confirmationObservationCount: confirmationObservations.length,
        contentProofObservationCount: contentProofObservations.length,
        chainPlacementComparisonCount: observeBitcoinAnchorChainPlacementChanges(confirmationObservations).count,
        consistencyFindingCount: analyzeBitcoinAnchorObservationConsistency(confirmationObservations).count
    });
}
