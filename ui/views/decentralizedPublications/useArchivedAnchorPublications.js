import { ref, reactive } from 'vue';
import { describeBitcoinAnchorObservationArchive } from '../../../application/anchoring/bitcoin/BitcoinAnchorObservationArchiveView.js';
import { reconstructBitcoinAnchorDurableEvidence } from '../../../application/anchoring/bitcoin/BitcoinAnchorDurableEvidenceView.js';
import {
    describeBitcoinAnchorPublicationRecordHistory
} from '../../../application/anchoring/bitcoin/BitcoinAnchorPublicationRecordHistoryView.js';
import { inspectBitcoinAnchorPublication } from '../../../application/anchoring/bitcoin/BitcoinAnchorPublicationInspectionView.js';
import {
    reconstructBitcoinAnchorPublicationLifecycleTimeline, BitcoinAnchorPublicationLifecycleTimelineEntryKind
} from '../../../application/anchoring/bitcoin/BitcoinAnchorPublicationLifecycleTimelineView.js';
import {
    describeBaseAnchorPublicationRecordHistory
} from '../../../application/anchoring/base/BaseAnchorPublicationRecordHistoryView.js';
import {
    reconstructBaseAnchorPublicationLifecycleTimeline, BaseAnchorPublicationLifecycleTimelineEntryKind
} from '../../../application/anchoring/base/BaseAnchorPublicationLifecycleTimelineView.js';

// Read-only views over anchors recorded in the publication observation archive:
// historical Bitcoin anchors, and Bitcoin/Base anchor publication records with
// their lifecycle timelines. Disclosure state only; nothing here writes.
export function useArchivedAnchorPublications({
    publicationObservationArchive
}) {
    // Per-anchor view of Bitcoin evidence reconstructed entirely from
    // already-persisted facts; chain placement and consistency are derived
    // fresh on every read. No network access.
    const historicalBitcoinAnchorsExpanded = ref(false);
    const historicalBitcoinAnchorEntryExpanded = reactive({});

    function toggleHistoricalBitcoinAnchors() {
        historicalBitcoinAnchorsExpanded.value = !historicalBitcoinAnchorsExpanded.value;
    }

    function historicalBitcoinAnchorArchiveView() {
        return describeBitcoinAnchorObservationArchive(publicationObservationArchive.value);
    }

    function toggleHistoricalBitcoinAnchorEntry(anchorId) {
        historicalBitcoinAnchorEntryExpanded[anchorId] = !historicalBitcoinAnchorEntryExpanded[anchorId];
    }

    function isHistoricalBitcoinAnchorEntryExpanded(anchorId) {
        return Boolean(historicalBitcoinAnchorEntryExpanded[anchorId]);
    }

    function historicalBitcoinAnchorEvidenceView(anchorId) {
        return reconstructBitcoinAnchorDurableEvidence(publicationObservationArchive.value, anchorId);
    }

    // A different index from the evidence list above: only anchors this
    // replica minted a publication identity for.
    const bitcoinAnchorPublicationsExpanded = ref(false);
    const bitcoinAnchorPublicationInspectionExpanded = reactive({});

    function toggleBitcoinAnchorPublications() {
        bitcoinAnchorPublicationsExpanded.value = !bitcoinAnchorPublicationsExpanded.value;
    }

    function bitcoinAnchorPublicationRecordHistoryView() {
        return describeBitcoinAnchorPublicationRecordHistory(publicationObservationArchive.value.bitcoinAnchorPublicationRecords);
    }

    function toggleBitcoinAnchorPublicationInspection(anchorId) {
        bitcoinAnchorPublicationInspectionExpanded[anchorId] = !bitcoinAnchorPublicationInspectionExpanded[anchorId];
    }

    function isBitcoinAnchorPublicationInspectionExpanded(anchorId) {
        return Boolean(bitcoinAnchorPublicationInspectionExpanded[anchorId]);
    }

    function bitcoinAnchorPublicationInspectionView(anchorId) {
        return inspectBitcoinAnchorPublication(publicationObservationArchive.value, anchorId);
    }

    // A chronological view of the same facts "Inspect Observations" groups
    // by category; neither is more authoritative. No network access.
    const bitcoinAnchorPublicationLifecycleExpanded = reactive({});

    function toggleBitcoinAnchorPublicationLifecycle(anchorId) {
        bitcoinAnchorPublicationLifecycleExpanded[anchorId] = !bitcoinAnchorPublicationLifecycleExpanded[anchorId];
    }

    function isBitcoinAnchorPublicationLifecycleExpanded(anchorId) {
        return Boolean(bitcoinAnchorPublicationLifecycleExpanded[anchorId]);
    }

    function bitcoinAnchorPublicationLifecycleTimelineView(anchorId) {
        return reconstructBitcoinAnchorPublicationLifecycleTimeline(publicationObservationArchive.value, anchorId);
    }

    function bitcoinAnchorPublicationLifecycleEntryDetail(item) {
        switch (item.kind) {
            case BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION:
                return `Content hash ${item.contentHash} — txid ${item.txid} — ${item.network}`;
            case BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST:
                return item.stateLabel + (item.txid ? ` — txid ${item.txid}` : '');
            case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION:
                return item.stateLabel + (item.blockHeight != null ? ` — block height ${item.blockHeight}` : '');
            case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF:
                return item.stateLabel;
            case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CHAIN_PLACEMENT:
                return item.outcomeLabel;
            case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONSISTENCY:
                return item.stateLabel;
            default:
                return '';
        }
    }

    // Only txids this replica minted a Base publication identity for.
    const baseAnchorPublicationsExpanded = ref(false);

    function toggleBaseAnchorPublications() {
        baseAnchorPublicationsExpanded.value = !baseAnchorPublicationsExpanded.value;
    }

    function baseAnchorPublicationRecordHistoryView() {
        return describeBaseAnchorPublicationRecordHistory(publicationObservationArchive.value.baseAnchorPublicationRecords);
    }

    // Keyed by txid. Base's timeline has no BROADCAST stage (see
    // application/anchoring/base/BaseAnchorPublicationLifecycleTimelineView.js).
    const baseAnchorPublicationLifecycleExpanded = reactive({});

    function toggleBaseAnchorPublicationLifecycle(txid) {
        baseAnchorPublicationLifecycleExpanded[txid] = !baseAnchorPublicationLifecycleExpanded[txid];
    }

    function isBaseAnchorPublicationLifecycleExpanded(txid) {
        return Boolean(baseAnchorPublicationLifecycleExpanded[txid]);
    }

    function baseAnchorPublicationLifecycleTimelineView(txid) {
        return reconstructBaseAnchorPublicationLifecycleTimeline(publicationObservationArchive.value, txid);
    }

    function baseAnchorPublicationLifecycleEntryDetail(item) {
        switch (item.kind) {
            case BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION:
                return `Content hash ${item.contentHash} — txid ${item.txid} — ${item.network}`;
            case BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION:
                return item.stateLabel + (item.blockNumber != null ? ` — block ${item.blockNumber.toLocaleString()}` : '');
            default:
                return '';
        }
    }

    return {
        historicalBitcoinAnchorsExpanded, historicalBitcoinAnchorEntryExpanded, toggleHistoricalBitcoinAnchors,
        historicalBitcoinAnchorArchiveView, toggleHistoricalBitcoinAnchorEntry,
        isHistoricalBitcoinAnchorEntryExpanded, historicalBitcoinAnchorEvidenceView,
        bitcoinAnchorPublicationsExpanded, bitcoinAnchorPublicationInspectionExpanded,
        toggleBitcoinAnchorPublications, bitcoinAnchorPublicationRecordHistoryView,
        toggleBitcoinAnchorPublicationInspection, isBitcoinAnchorPublicationInspectionExpanded,
        bitcoinAnchorPublicationInspectionView, bitcoinAnchorPublicationLifecycleExpanded,
        toggleBitcoinAnchorPublicationLifecycle, isBitcoinAnchorPublicationLifecycleExpanded,
        bitcoinAnchorPublicationLifecycleTimelineView, bitcoinAnchorPublicationLifecycleEntryDetail,
        baseAnchorPublicationsExpanded, toggleBaseAnchorPublications, baseAnchorPublicationRecordHistoryView,
        baseAnchorPublicationLifecycleExpanded, toggleBaseAnchorPublicationLifecycle,
        isBaseAnchorPublicationLifecycleExpanded, baseAnchorPublicationLifecycleTimelineView,
        baseAnchorPublicationLifecycleEntryDetail
    };
}
