import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { findBitcoinAnchorPublicationRecordByAnchorId } from './BitcoinAnchorPublicationRecordHistory.js';
import { describeBitcoinAnchorPublicationRecordHistoryEntry } from './BitcoinAnchorPublicationRecordHistoryView.js';
import { reconstructBitcoinAnchorDurableEvidence } from './BitcoinAnchorDurableEvidenceView.js';

// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
//
// The ONE place this milestone joins a durable publication IDENTITY back
// to its own subsequently recorded OBSERVATIONS — never merging the two,
// only placing one next to the other under a single, explicit `anchorId`:
//
//   PublicationObservationArchive
//        │
//        ├──► bitcoinAnchorPublicationRecords          (0.8.80, identity)
//        │        │  findBitcoinAnchorPublicationRecordByAnchorId()
//        │        ▼
//        │    the ONE record for anchorId
//        │
//        └──► reconstructBitcoinAnchorDurableEvidence()  (0.8.79, unchanged)
//                 ▼
//             the SAME evidence bundle a live session would show
//
//   inspectBitcoinAnchorPublication(archive, anchorId)
//     -> { record: { anchorId, contentHash, txid, network, createdAt },
//          evidence: { anchorId, broadcastObservations, confirmationObservations,
//            contentProofObservations, chainPlacementObservations,
//            consistencyFindings } }
//     -> null when no publication record exists for `anchorId`
//
// A PUBLICATION HIERARCHY, NEVER A MERGE. `record` and `evidence` sit as
// two separate keys on the object this function returns — the identical
// restraint held one layer down by every collection application/
// PublicationObservationArchive.js itself keeps separately (see that
// file's own header, "Preserves The Distinction Between Publication
// Facts..."). This function computes no combined `status`, `confidence`,
// `health`, `trusted`, `valid`, `canonical`, or `reliable` field over the
// two — evidence remains subordinate to identity, never becoming a second
// version of it.
//
// NO RECORD, NO INSPECTION. Unlike application/
// BitcoinAnchorDurableEvidenceView.js's own `reconstructBitcoinAnchorDurableEvidence()`,
// which reconstructs evidence for ANY `anchorId` an archive happens to
// hold Bitcoin facts for, this function refuses to describe an anchor
// this replica never actually minted a publication identity for — it
// returns `null` rather than composing an "evidence bundle" for an
// identity that was never named. A malformed/missing/non-string
// `anchorId`, or an `archive` that is not a genuine
// `PublicationObservationArchive` instance, degrades identically to
// `null`/empty, mirroring every other reader in this milestone.
//
// RESTORING A FACT IS NOT OBSERVING IT AGAIN — held here once more, one
// layer up. This function performs no network access of any kind; it
// only reads `archive` and calls two already-pure, already-tested
// functions.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// caching, no mutation of `archive` or anything inside it. Calling this
// twice with byte-identical arguments returns a byte-identical result.
export function inspectBitcoinAnchorPublication(archive, anchorId) {
    if (typeof anchorId !== 'string' || !anchorId) return null;
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    const record = findBitcoinAnchorPublicationRecordByAnchorId(safeArchive.bitcoinAnchorPublicationRecords, anchorId);
    if (!record) return null;

    return Object.freeze({
        record: describeBitcoinAnchorPublicationRecordHistoryEntry(record),
        evidence: reconstructBitcoinAnchorDurableEvidence(safeArchive, anchorId)
    });
}
