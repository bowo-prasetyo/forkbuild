import { PeerSnapshotMaterializationOutcome } from '../../../application/snapshot/materialization/PeerSnapshotMaterializationOutcome.js';
import {
    describePeerMaterializationAttempt, describePeerMaterializationButtonLabel
} from '../../../application/snapshot/materialization/SnapshotPeerMaterializationView.js';
import { PEER_MATERIALIZATION_BADGE_CLASSES, PEER_POSSESSION_BADGE_CLASSES, shortId } from './presentation.js';
import { SnapshotPeerMaterializationUiState } from '../../../application/snapshot/materialization/SnapshotPeerMaterializationUiState.js';
import {
    appendSnapshotPeerPossessionObservationHistoryEntry, latestSnapshotPeerPossessionObservationsByPeer
} from '../../../application/snapshot/possession/SnapshotPeerPossessionObservationHistory.js';
import {
    describeSnapshotPeerPossessionComparison, describeSnapshotPeerPossessionStateLabel,
    describeSnapshotPeerPossessionObservationHistory
} from '../../../application/snapshot/possession/SnapshotPeerPossessionComparisonView.js';
import {
    createSnapshotMaterializationSourceSelection
} from '../../../application/snapshot/materialization/SnapshotMaterializationSourceSelection.js';
import { SnapshotMaterializationSourceKind } from '../../../application/snapshot/materialization/SnapshotMaterializationSourceKind.js';
import {
    describeSnapshotPeerPossessionObservationDetails
} from '../../../application/snapshot/possession/SnapshotPeerPossessionObservationDetailView.js';
import { t } from '../../i18n/i18n.js';

// Snapshot exchange with peers: asking one peer for a snapshot, asking the
// ticked connected peers whether they hold it ("Which peers have it?", with
// the answers of this visit), and materializing from a peer that said yes.
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

    // Every connected peer is ticked until the person unticks it, so the
    // list asked is always one they can see and change; a peer that
    // connects later starts ticked. Only the unticked ones are remembered.
    function isPeerPossessionPeerChecked(entry, connectionId) {
        return !entry.peerPossessionUncheckedPeerIds.includes(connectionId);
    }

    function togglePeerPossessionPeer(entry, connectionId) {
        const index = entry.peerPossessionUncheckedPeerIds.indexOf(connectionId);
        if (index === -1) {
            entry.peerPossessionUncheckedPeerIds.push(connectionId);
        } else {
            entry.peerPossessionUncheckedPeerIds.splice(index, 1);
        }
    }

    function selectedPeersForPossessionComparison(entry) {
        return retrievalPeers.value.filter((peer) => isPeerPossessionPeerChecked(entry, peer.connectionId));
    }

    // Every answer is appended to this visit's history; the list shows the
    // latest one per peer.
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

    function peerPossessionAskButtonLabel(entry) {
        if (entry.peerPossessionComparisonChecking) return t('publications.asking');
        return peerPossessionObservationHistoryView(entry).count > 0
            ? t('publications.askSelectedPeersAgain')
            : t('publications.askSelectedPeers');
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
        if (view.requesting) return t('publications.requesting');
        return view.state !== SnapshotPeerMaterializationUiState.IDLE
            ? t('publications.getSnapshotFromPeerAgain', { peer: peerLabel })
            : t('publications.getSnapshotFromPeer', { peer: peerLabel });
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
        if (!peerId) return t('publications.unknownPeer');
        const peer = retrievalPeers.value.find((candidate) => candidate.connectionId === peerId);
        if (peer) return peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : t('publications.unknownPeer'));
        return shortId(peerId);
    }

    return {
        selectedPeerForMaterialization, requestSnapshotFromPeer, peerMaterializationView,
        peerMaterializationBadgeClass, peerMaterializationButtonLabel,
        isPeerPossessionPeerChecked, togglePeerPossessionPeer, selectedPeersForPossessionComparison,
        checkSnapshotPossessionWithSelectedPeers, peerPossessionAskButtonLabel, peerPossessionComparisonView,
        peerPossessionComparisonRowBadgeClass, peerPossessionComparisonRowLabel, materializeFromComparisonPeer,
        comparisonPeerMaterializationView, comparisonPeerMaterializationBadgeClass,
        comparisonPeerMaterializationButtonLabel, peerPossessionObservationHistoryView,
        togglePeerPossessionComparisonHistory, peerPossessionObservationDetailsView,
        isPeerPossessionObservationHistoryEntryExpanded, togglePeerPossessionObservationHistoryEntry,
        peerPossessionRowLabel
    };
}
