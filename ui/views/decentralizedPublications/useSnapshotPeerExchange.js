import { PeerSnapshotMaterializationOutcome } from '../../../application/PeerSnapshotMaterializationOutcome.js';
import {
    describePeerMaterializationAttempt, describePeerMaterializationButtonLabel
} from '../../../application/SnapshotPeerMaterializationView.js';
import { PEER_MATERIALIZATION_BADGE_CLASSES, PEER_POSSESSION_BADGE_CLASSES, shortId } from './presentation.js';
import { SnapshotPeerMaterializationUiState } from '../../../application/SnapshotPeerMaterializationUiState.js';
import {
    describePeerPossessionAttempt, describePeerPossessionButtonLabel
} from '../../../application/SnapshotPeerPossessionView.js';
import { SnapshotPeerPossessionUiState } from '../../../application/SnapshotPeerPossessionUiState.js';
import {
    appendSnapshotPeerPossessionObservationHistoryEntry, latestSnapshotPeerPossessionObservationsByPeer
} from '../../../application/SnapshotPeerPossessionObservationHistory.js';
import {
    describeSnapshotPeerPossessionComparison, describeSnapshotPeerPossessionStateLabel,
    describeSnapshotPeerPossessionObservationHistory
} from '../../../application/SnapshotPeerPossessionComparisonView.js';
import {
    createSnapshotMaterializationSourceSelection
} from '../../../application/SnapshotMaterializationSourceSelection.js';
import { SnapshotMaterializationSourceKind } from '../../../application/SnapshotMaterializationSourceKind.js';
import {
    describeSnapshotPeerPossessionObservationDetails
} from '../../../application/SnapshotPeerPossessionObservationDetailView.js';

// Snapshot exchange with peers: asking one peer for a snapshot, checking
// whether one or several peers hold it (with a comparison and its history),
// and materializing from a peer chosen in that comparison.
export function useSnapshotPeerExchange({
    mapPeerOutcomeToStoreOutcome, recordMaterializationHistoryEntry, recordMaterializationSource,
    retrievalPeers, snapshotMaterializationSelectionCoordinator, snapshotPeerMaterializationCoordinator,
    snapshotPeerPossessionCoordinator
}) {
    // Asks exactly the one authenticated peer the person picked, on an
    // explicit click; never picks, ranks or falls back to another peer.
    function selectedPeerForMaterialization(entry) {
        return retrievalPeers.value.find((peer) => peer.connectionId === entry.peerMaterializationSelectedPeerId) || null;
    }

    async function requestSnapshotFromPeer(entry) {
        const peer = selectedPeerForMaterialization(entry);
        if (!peer || !snapshotPeerMaterializationCoordinator) return;
        entry.peerMaterializationAttempt = { requesting: true };
        try {
            const result = await snapshotPeerMaterializationCoordinator.materialize({
                peer, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
            });
            entry.peerMaterializationAttempt = {
                requesting: false, error: null,
                outcome: result.outcome, reason: result.reason, contentReference: result.contentReference,
                publicationId: result.publicationId, contentHash: result.contentHash, publicationKnown: result.publicationKnown
            };
            recordMaterializationSource(entry, result.source, result.outcome === PeerSnapshotMaterializationOutcome.STORED
                || result.outcome === PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE, result.contentReference, result.publicationId);
            recordMaterializationHistoryEntry(entry, {
                sourceKind: result.source.kind,
                outcome: mapPeerOutcomeToStoreOutcome(result.outcome),
                publicationId: result.publicationId,
                contentHash: result.contentHash,
                contentReference: result.contentReference
            });
        } catch (error) {
            entry.peerMaterializationAttempt = { requesting: false, outcome: null, error: error.message };
        }
    }

    function peerMaterializationView(entry) {
        return describePeerMaterializationAttempt(entry.peerMaterializationAttempt);
    }

    function peerMaterializationBadgeClass(entry) {
        const state = peerMaterializationView(entry).state;
        return PEER_MATERIALIZATION_BADGE_CLASSES[state] || null;
    }

    function peerMaterializationButtonLabel(entry) {
        const view = peerMaterializationView(entry);
        return describePeerMaterializationButtonLabel({
            requesting: view.requesting,
            materialized: view.state !== SnapshotPeerMaterializationUiState.IDLE
        });
    }

    // Only asks whether the picked peer has the bytes, on an explicit
    // click. An observation never becomes a materialization.
    function selectedPeerForPossessionCheck(entry) {
        return retrievalPeers.value.find((peer) => peer.connectionId === entry.peerPossessionSelectedPeerId) || null;
    }

    async function checkSnapshotPossessionWithPeer(entry) {
        const peer = selectedPeerForPossessionCheck(entry);
        if (!peer || !snapshotPeerPossessionCoordinator) return;
        entry.peerPossessionAttempt = { checking: true };
        try {
            const observation = await snapshotPeerPossessionCoordinator.observe({
                peer, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
            });
            entry.peerPossessionAttempt = {
                checking: false, error: null,
                peerId: observation.peerId, state: observation.state,
                publicationId: observation.publicationId, contentHash: observation.contentHash, observedAt: observation.observedAt
            };
        } catch (error) {
            entry.peerPossessionAttempt = { checking: false, state: null, error: error.message };
        }
    }

    function peerPossessionView(entry) {
        return describePeerPossessionAttempt(entry.peerPossessionAttempt);
    }

    function peerPossessionBadgeClass(entry) {
        const state = peerPossessionView(entry).state;
        return PEER_POSSESSION_BADGE_CLASSES[state] || null;
    }

    function peerPossessionButtonLabel(entry) {
        const view = peerPossessionView(entry);
        return describePeerPossessionButtonLabel({
            checking: view.checking,
            checked: view.state !== SnapshotPeerPossessionUiState.IDLE
        });
    }

    // Checkbox selection only. A peer that disconnects before the click is
    // dropped from the list asked.
    function togglePeerPossessionCompareSelection(entry, connectionId) {
        const index = entry.peerPossessionCompareSelectedPeerIds.indexOf(connectionId);
        if (index === -1) {
            entry.peerPossessionCompareSelectedPeerIds.push(connectionId);
        } else {
            entry.peerPossessionCompareSelectedPeerIds.splice(index, 1);
        }
    }

    function selectedPeersForPossessionComparison(entry) {
        return retrievalPeers.value.filter((peer) => entry.peerPossessionCompareSelectedPeerIds.includes(peer.connectionId));
    }

    // Answers are appended to the history, unlike the single-peer check,
    // which replaces its result.
    async function checkSnapshotPossessionWithSelectedPeers(entry) {
        const peers = selectedPeersForPossessionComparison(entry);
        if (peers.length === 0 || !snapshotPeerPossessionCoordinator) return;
        entry.peerPossessionComparisonChecking = true;
        try {
            const observations = await snapshotPeerPossessionCoordinator.observePeers({
                peers, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
            });
            let history = entry.peerPossessionObservationHistory;
            for (const observation of observations) {
                history = appendSnapshotPeerPossessionObservationHistoryEntry(history, observation);
            }
            entry.peerPossessionObservationHistory = history;
        } finally {
            entry.peerPossessionComparisonChecking = false;
        }
    }

    // Derived from the latest answer per peer, never cached.
    function peerPossessionComparisonView(entry) {
        const latest = latestSnapshotPeerPossessionObservationsByPeer(entry.peerPossessionObservationHistory, {
            publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
        });
        return describeSnapshotPeerPossessionComparison(entry.publication.id, entry.publication.contentReference.hash, latest);
    }

    function peerPossessionComparisonRowBadgeClass(peerRow) {
        return PEER_POSSESSION_BADGE_CLASSES[peerRow.state] || null;
    }

    function peerPossessionComparisonRowLabel(peerRow) {
        return describeSnapshotPeerPossessionStateLabel(peerRow.state);
    }

    // Turns one comparison row into an explicit "Get Snapshot from <peer>"
    // for exactly that peer, through the same peer materialization path.
    // The row's possession observation stays what it said; this attempt is
    // a new, separate fact.
    async function materializeFromComparisonPeer(entry, peerId) {
        const peer = retrievalPeers.value.find((candidate) => candidate.connectionId === peerId);
        if (!peer || !snapshotMaterializationSelectionCoordinator) return;
        entry.peerPossessionComparisonMaterializations[peerId] = { requesting: true };
        try {
            const selection = createSnapshotMaterializationSourceSelection({
                kind: SnapshotMaterializationSourceKind.PEER,
                peer, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
            });
            const result = await snapshotMaterializationSelectionCoordinator.materialize(selection);
            entry.peerPossessionComparisonMaterializations[peerId] = {
                requesting: false, error: null,
                outcome: result.outcome, reason: result.reason, contentReference: result.contentReference,
                publicationId: result.publicationId, contentHash: result.contentHash, publicationKnown: result.publicationKnown
            };
            recordMaterializationSource(entry, result.source, result.outcome === PeerSnapshotMaterializationOutcome.STORED
                || result.outcome === PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE, result.contentReference, result.publicationId);
            recordMaterializationHistoryEntry(entry, {
                sourceKind: result.source.kind,
                outcome: mapPeerOutcomeToStoreOutcome(result.outcome),
                publicationId: result.publicationId,
                contentHash: result.contentHash,
                contentReference: result.contentReference
            });
        } catch (error) {
            entry.peerPossessionComparisonMaterializations[peerId] = { requesting: false, outcome: null, error: error.message };
        }
    }

    function comparisonPeerMaterializationView(entry, peerId) {
        return describePeerMaterializationAttempt(entry.peerPossessionComparisonMaterializations[peerId]);
    }

    function comparisonPeerMaterializationBadgeClass(entry, peerId) {
        const state = comparisonPeerMaterializationView(entry, peerId).state;
        return PEER_MATERIALIZATION_BADGE_CLASSES[state] || null;
    }

    function comparisonPeerMaterializationButtonLabel(entry, peerRow) {
        const view = comparisonPeerMaterializationView(entry, peerRow.peerId);
        const peerLabel = peerPossessionRowLabel(peerRow.peerId);
        if (view.requesting) return 'Requesting…';
        return view.state !== SnapshotPeerMaterializationUiState.IDLE
            ? `Get Snapshot from ${peerLabel} Again`
            : `Get Snapshot from ${peerLabel}`;
    }

    // Every recorded observation, including repeat checks, separate from
    // the latest-per-peer comparison.
    function peerPossessionObservationHistoryView(entry) {
        return describeSnapshotPeerPossessionObservationHistory(entry.peerPossessionObservationHistory);
    }

    function togglePeerPossessionComparisonHistory(entry) {
        entry.peerPossessionComparisonHistoryExpanded = !entry.peerPossessionComparisonHistoryExpanded;
    }

    function peerPossessionObservationDetailsView(entry) {
        return describeSnapshotPeerPossessionObservationDetails(entry.peerPossessionObservationHistory);
    }

    function isPeerPossessionObservationHistoryEntryExpanded(entry, index) {
        return Boolean(entry.peerPossessionObservationHistoryEntryExpanded[index]);
    }

    function togglePeerPossessionObservationHistoryEntry(entry, index) {
        entry.peerPossessionObservationHistoryEntryExpanded[index] = !entry.peerPossessionObservationHistoryEntryExpanded[index];
    }

    // A peer that has since disconnected still shows by shortId; "Unknown
    // peer" is only for a null peerId.
    function peerPossessionRowLabel(peerId) {
        if (!peerId) return 'Unknown peer';
        const peer = retrievalPeers.value.find((candidate) => candidate.connectionId === peerId);
        if (peer) return peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer');
        return shortId(peerId);
    }

    return {
        selectedPeerForMaterialization, requestSnapshotFromPeer, peerMaterializationView,
        peerMaterializationBadgeClass, peerMaterializationButtonLabel, selectedPeerForPossessionCheck,
        checkSnapshotPossessionWithPeer, peerPossessionView, peerPossessionBadgeClass,
        peerPossessionButtonLabel, togglePeerPossessionCompareSelection, selectedPeersForPossessionComparison,
        checkSnapshotPossessionWithSelectedPeers, peerPossessionComparisonView,
        peerPossessionComparisonRowBadgeClass, peerPossessionComparisonRowLabel, materializeFromComparisonPeer,
        comparisonPeerMaterializationView, comparisonPeerMaterializationBadgeClass,
        comparisonPeerMaterializationButtonLabel, peerPossessionObservationHistoryView,
        togglePeerPossessionComparisonHistory, peerPossessionObservationDetailsView,
        isPeerPossessionObservationHistoryEntryExpanded, togglePeerPossessionObservationHistoryEntry,
        peerPossessionRowLabel
    };
}
