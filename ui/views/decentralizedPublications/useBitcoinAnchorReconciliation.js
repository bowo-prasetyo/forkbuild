import { inject } from 'vue';
import {
    appendBitcoinAnchorConfirmationObservationHistoryEntry
} from '../../../application/anchoring/bitcoin/BitcoinAnchorConfirmationObservationHistory.js';
import {
    describeBitcoinAnchorConfirmationObservationDetail,
    describeBitcoinAnchorConfirmationObservationHistoryDetails
} from '../../../application/anchoring/bitcoin/BitcoinAnchorConfirmationObservationHistoryDetailView.js';
import { describeBitcoinAnchorContentProof } from '../../../application/anchoring/bitcoin/BitcoinAnchorContentProofView.js';
import {
    BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES, BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES
} from './presentation.js';
import {
    describeBitcoinAnchorChainPlacementObservations
} from '../../../application/anchoring/bitcoin/BitcoinAnchorChainPlacementObservationView.js';
import { observeBitcoinAnchorChainPlacementChanges } from '../../../application/anchoring/bitcoin/BitcoinAnchorChainPlacementObserver.js';
import {
    describeBitcoinAnchorObservationConsistency
} from '../../../application/anchoring/bitcoin/BitcoinAnchorObservationConsistencyView.js';
import {
    analyzeBitcoinAnchorObservationConsistency
} from '../../../application/anchoring/bitcoin/BitcoinAnchorObservationConsistencyAnalyzer.js';
import { describeBitcoinAnchorObservationEvidence } from '../../../application/anchoring/bitcoin/BitcoinAnchorObservationEvidenceView.js';
import { composeBitcoinAnchorObservationEvidence } from '../../../application/anchoring/bitcoin/BitcoinAnchorObservationEvidence.js';

// Per-anchor Bitcoin reconciliation: an explicit re-read of an anchor's chain
// placement and content proof, plus the confirmation history, chain placement
// comparison, observation consistency and evidence views built on it.
export function useBitcoinAnchorReconciliation({
    archiveBitcoinConfirmationObservation, archiveBitcoinContentProofObservation
}) {
    // The only place this page asks the Bitcoin network about an anchor's
    // confirmation or content proof (see reconcileBitcoinAnchor()).
    const bitcoinAnchorProofReconciliationView = inject('bitcoinAnchorProofReconciliationView', null);

    // The only call to reconcile(), on an explicit click. One click asks
    // both questions (confirmation and content proof) because reconcile()
    // answers them together. The result replaces the current
    // reconciliation, and its confirmation is appended to the history, both
    // from the same result so the two views can't disagree.
    async function reconcileBitcoinAnchor(entry, anchorView) {
        if (!bitcoinAnchorProofReconciliationView) return;
        const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
        if (!anchor) return;
        entry.bitcoinAnchorReconciliations[anchorView.anchorId] = { reconciling: true, error: null };
        try {
            const result = await bitcoinAnchorProofReconciliationView.reconcile(anchor);
            entry.bitcoinAnchorReconciliations[anchorView.anchorId] = { reconciling: false, error: null, ...result };
            const history = entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || [];
            entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] =
                appendBitcoinAnchorConfirmationObservationHistoryEntry(history, result.transaction.confirmation);
            // Both facts are also archived durably, content proof included,
            // even though content proof keeps no in-memory history.
            archiveBitcoinConfirmationObservation(anchorView.anchorId, result.transaction.confirmation);
            if (result.contentProof) {
                archiveBitcoinContentProofObservation(anchorView.anchorId, result.contentProof);
            }
        } catch (error) {
            entry.bitcoinAnchorReconciliations[anchorView.anchorId] = { reconciling: false, error: error.message };
        }
    }

    // Derived from the current reconciliation. Confirmation and content
    // proof stay two sibling fields, never combined into one verdict.
    function bitcoinAnchorReconciliationView(entry, anchorView) {
        const state = entry.bitcoinAnchorReconciliations[anchorView.anchorId];
        if (!state) return { reconciling: false, error: null, confirmation: null, contentProof: null };
        return {
            reconciling: Boolean(state.reconciling),
            error: state.error || null,
            confirmation: state.transaction ? describeBitcoinAnchorConfirmationObservationDetail(state.transaction.confirmation) : null,
            contentProof: state.contentProof ? describeBitcoinAnchorContentProof(state.contentProof) : null
        };
    }

    function bitcoinAnchorConfirmationBadgeClass(entry, anchorView) {
        const confirmation = bitcoinAnchorReconciliationView(entry, anchorView).confirmation;
        return confirmation ? (BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES[confirmation.state] || null) : null;
    }

    function bitcoinAnchorContentProofBadgeClass(entry, anchorView) {
        const contentProof = bitcoinAnchorReconciliationView(entry, anchorView).contentProof;
        return contentProof ? (BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES[contentProof.state] || null) : null;
    }

    function bitcoinAnchorReconcileButtonLabel(entry, anchorView) {
        const view = bitcoinAnchorReconciliationView(entry, anchorView);
        if (view.reconciling) return 'Reconciling…';
        return view.confirmation ? 'Reconcile Again' : 'Reconcile';
    }

    function bitcoinAnchorConfirmationHistoryView(entry, anchorView) {
        return describeBitcoinAnchorConfirmationObservationHistoryDetails(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []);
    }

    function toggleBitcoinAnchorConfirmationHistory(entry, anchorView) {
        entry.bitcoinAnchorConfirmationHistoryExpanded[anchorView.anchorId] = !entry.bitcoinAnchorConfirmationHistoryExpanded[anchorView.anchorId];
    }

    function isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView) {
        return Boolean(entry.bitcoinAnchorConfirmationHistoryExpanded[anchorView.anchorId]);
    }

    function toggleBitcoinAnchorConfirmationHistoryEntry(entry, anchorView, index) {
        const bucket = entry.bitcoinAnchorConfirmationHistoryEntryExpanded[anchorView.anchorId]
            || (entry.bitcoinAnchorConfirmationHistoryEntryExpanded[anchorView.anchorId] = {});
        bucket[index] = !bucket[index];
    }

    function isBitcoinAnchorConfirmationHistoryEntryExpanded(entry, anchorView, index) {
        const bucket = entry.bitcoinAnchorConfirmationHistoryEntryExpanded[anchorView.anchorId];
        return Boolean(bucket && bucket[index]);
    }

    // Comparison, consistency and evidence below are pure and synchronous,
    // derived from the recorded confirmation history (no network access);
    // their buttons only toggle visibility.
    function bitcoinAnchorChainPlacementComparisonView(entry, anchorView) {
        const history = entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || [];
        return describeBitcoinAnchorChainPlacementObservations(observeBitcoinAnchorChainPlacementChanges(history));
    }

    function toggleBitcoinAnchorChainPlacementComparison(entry, anchorView) {
        entry.bitcoinAnchorChainPlacementComparisonExpanded[anchorView.anchorId] =
            !entry.bitcoinAnchorChainPlacementComparisonExpanded[anchorView.anchorId];
    }

    function isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView) {
        return Boolean(entry.bitcoinAnchorChainPlacementComparisonExpanded[anchorView.anchorId]);
    }

    function bitcoinAnchorObservationConsistencyView(entry, anchorView) {
        const history = entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || [];
        return describeBitcoinAnchorObservationConsistency(analyzeBitcoinAnchorObservationConsistency(history));
    }

    function toggleBitcoinAnchorObservationConsistency(entry, anchorView) {
        entry.bitcoinAnchorObservationConsistencyExpanded[anchorView.anchorId] =
            !entry.bitcoinAnchorObservationConsistencyExpanded[anchorView.anchorId];
    }

    function isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView) {
        return Boolean(entry.bitcoinAnchorObservationConsistencyExpanded[anchorView.anchorId]);
    }

    // Keyed only by anchorId, never by contentHash or txid. A discovered
    // anchor contributes no broadcast observations: this replica never
    // broadcast it.
    function bitcoinAnchorObservationEvidenceView(entry, anchorView) {
        const anchorId = anchorView.anchorId;
        const history = entry.bitcoinAnchorConfirmationHistories[anchorId] || [];
        const reconciliation = entry.bitcoinAnchorReconciliations[anchorId];
        const contentProofObservations = (reconciliation && reconciliation.contentProof) ? [reconciliation.contentProof] : [];

        return describeBitcoinAnchorObservationEvidence(composeBitcoinAnchorObservationEvidence({
            anchorId,
            broadcastObservations: [],
            confirmationObservations: history,
            contentProofObservations,
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
        }));
    }

    function toggleBitcoinAnchorObservationEvidence(entry, anchorView) {
        entry.bitcoinAnchorObservationEvidenceExpanded[anchorView.anchorId] =
            !entry.bitcoinAnchorObservationEvidenceExpanded[anchorView.anchorId];
    }

    function isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView) {
        return Boolean(entry.bitcoinAnchorObservationEvidenceExpanded[anchorView.anchorId]);
    }

    return {
        bitcoinAnchorProofReconciliationView, reconcileBitcoinAnchor, bitcoinAnchorReconciliationView,
        bitcoinAnchorConfirmationBadgeClass, bitcoinAnchorContentProofBadgeClass,
        bitcoinAnchorReconcileButtonLabel, bitcoinAnchorConfirmationHistoryView,
        toggleBitcoinAnchorConfirmationHistory, isBitcoinAnchorConfirmationHistoryExpanded,
        toggleBitcoinAnchorConfirmationHistoryEntry, isBitcoinAnchorConfirmationHistoryEntryExpanded,
        bitcoinAnchorChainPlacementComparisonView, toggleBitcoinAnchorChainPlacementComparison,
        isBitcoinAnchorChainPlacementComparisonExpanded, bitcoinAnchorObservationConsistencyView,
        toggleBitcoinAnchorObservationConsistency, isBitcoinAnchorObservationConsistencyExpanded,
        bitcoinAnchorObservationEvidenceView, toggleBitcoinAnchorObservationEvidence,
        isBitcoinAnchorObservationEvidenceExpanded
    };
}
