import {
    PublicationObservationTimelineEntryKind, PublicationObservationTimelineDomain
} from '../../../application/publication/observationArchive/PublicationObservationTimelineView.js';
import { describePublicationArchiveTimeline } from '../../../application/publication/observationArchive/PublicationArchiveTimeline.js';
import {
    IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES, BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES,
    BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES, BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES,
    BASE_TRANSACTION_INCLUSION_BADGE_CLASSES
} from './presentation.js';

// One entry's History: its IPFS, Bitcoin and Base observations merged into a
// single read-only timeline, read from the Publication Observation Archive,
// so it shows what earlier visits recorded too. Every observation this page
// makes is archived as it happens, so this visit's are already in it.
export function useCrossDomainObservationTimeline({ publicationObservationArchive }) {
    // The Bitcoin anchors this device knows for the publication, discovered
    // or made here; the archive's own records add the ones made here.
    function crossDomainPublicationObservationTimelineView(entry) {
        const bitcoinAnchorIds = (entry.evidence && Array.isArray(entry.evidence.anchors) ? entry.evidence.anchors : [])
            .filter((anchorView) => anchorView.anchorType === 'bitcoin-op-return')
            .map((anchorView) => anchorView.anchorId);
        return describePublicationArchiveTimeline(publicationObservationArchive.value, {
            contentHash: entry.publication.contentReference.hash,
            bitcoinAnchorIds
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
