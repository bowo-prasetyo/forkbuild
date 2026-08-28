import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { observeBitcoinAnchorChainPlacementChanges } from './BitcoinAnchorChainPlacementObserver.js';
import { analyzeBitcoinAnchorObservationConsistency } from './BitcoinAnchorObservationConsistencyAnalyzer.js';
import { composeBitcoinAnchorObservationEvidence } from './BitcoinAnchorObservationEvidence.js';
import { describeBitcoinAnchorObservationEvidence } from './BitcoinAnchorObservationEvidenceView.js';

// 0.8.79 — Durable Bitcoin Anchor Evidence Restoration & Historical
// Inspection.
//
// application/PublicationObservationArchive.js (0.8.75) holds one anchor's
// durable Bitcoin facts scattered across three separately-keyed
// collections — `bitcoinBroadcastRecords`, `bitcoinConfirmationObservationsByAnchorId`,
// `bitcoinContentProofObservationsByAnchorId`. This file is the ONE place
// that pulls one anchor's own slice back out of all three and reconstructs
// exactly the bundle application/BitcoinAnchorObservationEvidence.js (0.8.78)
// already knows how to build from a live, in-memory session — so a person
// re-opening this page after a reload sees the SAME evidence a live
// session would have shown, never a reduced or reshaped version of it:
//
//   PublicationObservationArchive (restored, 0.8.75)
//        │
//        │  scoped to one explicit anchorId
//        ▼
//   broadcastObservations / confirmationObservations / contentProofObservations
//        │
//        ├──► observeBitcoinAnchorChainPlacementChanges()   (0.8.76, unchanged)
//        ├──► analyzeBitcoinAnchorObservationConsistency()   (0.8.77, unchanged)
//        └──► composeBitcoinAnchorObservationEvidence()      (0.8.78, unchanged)
//                    │
//                    ▼
//        describeBitcoinAnchorObservationEvidence()          (0.8.78, unchanged)
//
// NO NEW ANALYSIS LOGIC. Every fact this file's own
// `reconstructBitcoinAnchorDurableEvidence()` returns comes from calling
// four already-independently-tested functions, unchanged, in the exact
// composition 0.8.78's own UI wiring already used for a live session (see
// ui/views/DecentralizedPublicationsView.js's own `bitcoinAnchorObservationEvidenceView()`).
// This file adds no new state comparison, no new consistency rule, and no
// combined `status`, `confidence`, `health`, `trusted`, `valid`,
// `canonical`, or `reliable` field of any kind — it only decides WHICH
// already-recorded facts belong to one `anchorId`, a decision application/
// PublicationObservationArchive.js's own storage shape already makes for
// confirmation and content-proof observations (they are already keyed by
// `anchorId`) and this file makes identically for broadcast records (an
// explicit `record.anchorId === anchorId` filter over the archive's own
// flat `bitcoinBroadcastRecords` array — never a filter by `txid` or
// `contentHash`).
//
// RESTORING A FACT IS NOT OBSERVING IT AGAIN. This function never queries
// Bitcoin, Esplora, or any other network source — it only reads whatever
// `archive` it is handed, exactly like every function it calls already
// does. Calling it twice with byte-identical arguments returns a
// byte-identical result; opening or closing a "Historical Bitcoin Anchor
// Evidence" disclosure built on top of it performs zero network
// operations, the identical restraint application/
// PublicationObservationArchiveView.js's own header already holds for the
// cross-domain timeline, one domain over.
//
// A NON-ARCHIVE OR MISSING anchorId NEVER THROWS. Mirrors application/
// PublicationObservationArchiveView.js's own "malformed input degrades to
// empty" restraint for `archive`, and application/
// BitcoinAnchorObservationEvidenceView.js's own "describing nothing
// returns null, never throws" restraint for a missing `anchorId` — this
// function returns `null` rather than composing evidence for an anchor
// identity that was never actually named.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// caching, no mutation of `archive` or anything inside it.
export function reconstructBitcoinAnchorDurableEvidence(archive, anchorId) {
    if (typeof anchorId !== 'string' || !anchorId) return null;
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    const broadcastObservations = safeArchive.bitcoinBroadcastRecords
        .filter((record) => record.anchorId === anchorId);
    const confirmationObservations = safeArchive.bitcoinConfirmationObservationsByAnchorId[anchorId] || [];
    const contentProofObservations = safeArchive.bitcoinContentProofObservationsByAnchorId[anchorId] || [];

    const evidence = composeBitcoinAnchorObservationEvidence({
        anchorId,
        broadcastObservations,
        confirmationObservations,
        contentProofObservations,
        chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(confirmationObservations),
        consistencyFindings: analyzeBitcoinAnchorObservationConsistency(confirmationObservations)
    });

    return describeBitcoinAnchorObservationEvidence(evidence);
}
