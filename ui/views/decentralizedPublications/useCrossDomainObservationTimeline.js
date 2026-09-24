import {
    describePublicationObservationTimeline, PublicationObservationTimelineEntryKind,
    PublicationObservationTimelineDomain
} from '../../../application/publication/observationArchive/PublicationObservationTimelineView.js';
import {
    IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES, BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES,
    BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES, BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES,
    BASE_TRANSACTION_INCLUSION_BADGE_CLASSES
} from './presentation.js';

// One entry's observations across IPFS, Bitcoin and Base, merged into a
// single read-only timeline.
export function useCrossDomainObservationTimeline({
    bitcoinAnchorBroadcastConfirmationHistory, bitcoinAnchorBroadcastOutcome, bitcoinAnchorBroadcastedAt,
    bitcoinAnchorFinalizedTransaction, bitcoinAnchorTransactionReview
}) {
    // Reads only what's in memory. A discovered Bitcoin anchor contributes
    // its confirmation history and current content proof, never a broadcast
    // entry (this replica never broadcast it). The session's own wizard
    // broadcast, if made for this publication, is included with its
    // confirmations, keyed by txid. recordIndex is always null for Bitcoin
    // facts: which IPFS record an anchor belongs to is not tracked and
    // never guessed from a shared contentHash.
    function crossDomainPublicationObservationTimelineView(entry) {
        const discoveredAnchors = (entry.evidence && Array.isArray(entry.evidence.anchors) ? entry.evidence.anchors : [])
            .filter((anchorView) => anchorView.anchorType === 'bitcoin-op-return')
            .map((anchorView) => ({
                recordIndex: null,
                anchorId: anchorView.anchorId,
                txid: null,
                broadcastedAt: null,
                broadcast: null
            }));

        const confirmationHistoriesByAnchorId = { ...entry.bitcoinAnchorConfirmationHistories };
        const proofObservationsByAnchorId = {};
        discoveredAnchors.forEach((anchor) => {
            const reconciliation = entry.bitcoinAnchorReconciliations[anchor.anchorId];
            proofObservationsByAnchorId[anchor.anchorId] = (reconciliation && reconciliation.contentProof) ? [reconciliation.contentProof] : [];
        });

        const anchors = discoveredAnchors;
        const bound = bitcoinAnchorFinalizedTransaction.value;
        if (bound && bitcoinAnchorTransactionReview.publicationId === entry.publication.id) {
            anchors.push({
                recordIndex: null,
                anchorId: bound.txid,
                txid: bound.txid,
                broadcastedAt: bitcoinAnchorBroadcastedAt.value,
                broadcast: bitcoinAnchorBroadcastOutcome.value
            });
            confirmationHistoriesByAnchorId[bound.txid] = bitcoinAnchorBroadcastConfirmationHistory.value;
            proofObservationsByAnchorId[bound.txid] = [];
        }

        return describePublicationObservationTimeline({
            ipfs: {
                publicationRecords: entry.ipfsPublicationRecordHistory,
                verificationHistoriesByRecordIndex: entry.ipfsPublicationVerificationHistoriesByRecordIndex
            },
            bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
        });
    }

    function toggleCrossDomainPublicationObservationTimeline(entry) {
        entry.crossDomainPublicationObservationTimelineExpanded = !entry.crossDomainPublicationObservationTimelineExpanded;
    }

    function crossDomainPublicationObservationTimelineEntryBadgeClass(item) {
        switch (item.kind) {
            case PublicationObservationTimelineEntryKind.IPFS_CONTENT_VERIFICATION:
                return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
            case PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST:
                return BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES[item.state] || 'peer-badge--pending';
            case PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION:
                return BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
            case PublicationObservationTimelineEntryKind.BITCOIN_CONTENT_PROOF:
                return BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES[item.state] || 'peer-badge--pending';
            case PublicationObservationTimelineEntryKind.BASE_TRANSACTION_INCLUSION:
                return BASE_TRANSACTION_INCLUSION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
            default:
                return 'peer-badge--pending';
        }
    }

    function crossDomainPublicationObservationTimelineEntryDomainLabel(item) {
        if (item.domain === PublicationObservationTimelineDomain.BITCOIN) return 'Bitcoin';
        if (item.domain === PublicationObservationTimelineDomain.BASE) return 'Base';
        return 'IPFS';
    }

    return {
        crossDomainPublicationObservationTimelineView, toggleCrossDomainPublicationObservationTimeline,
        crossDomainPublicationObservationTimelineEntryBadgeClass,
        crossDomainPublicationObservationTimelineEntryDomainLabel
    };
}
