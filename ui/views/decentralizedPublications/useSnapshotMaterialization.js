import {
    describeLocalSnapshotContentAvailability, describeAvailabilityCheckButtonLabel
} from '../../../application/LocalSnapshotContentAvailabilityView.js';
import { LOCAL_SNAPSHOT_AVAILABILITY_BADGE_CLASSES, MATERIALIZATION_BADGE_CLASSES } from './presentation.js';
import { describePublicationSnapshotPossession } from '../../../application/PublicationSnapshotPossessionView.js';
import {
    describePublicationReplicaContentKnowledge
} from '../../../application/PublicationReplicaContentKnowledgeView.js';
import { describePublicationSnapshotAcquisition } from '../../../application/PublicationSnapshotAcquisitionView.js';
import {
    LocalSnapshotContentAvailabilityOutcome
} from '../../../application/LocalSnapshotContentAvailabilityOutcome.js';
import { SnapshotContentTransferOutcome } from '../../../application/SnapshotContentTransferOutcome.js';
import { createSnapshotMaterializationAttempt } from '../../../application/SnapshotMaterializationAttempt.js';
import { StoreSnapshotContentOutcome } from '../../../application/StoreSnapshotContentOutcome.js';
import { describeLocalSnapshotMaterializationSource } from '../../../application/SnapshotMaterializationView.js';
import {
    SnapshotPlacementMaterializationOutcome
} from '../../../application/SnapshotPlacementMaterializationOutcome.js';
import { PeerSnapshotMaterializationOutcome } from '../../../application/PeerSnapshotMaterializationOutcome.js';
import {
    appendSnapshotMaterializationHistoryEntry, describeSnapshotMaterializationSourceCounts
} from '../../../application/SnapshotMaterializationHistory.js';
import {
    describeSnapshotMaterializationHistoryDetails
} from '../../../application/SnapshotMaterializationHistoryDetailView.js';
import {
    describeMaterializationAttempt, describeMaterializationButtonLabel
} from '../../../application/SnapshotContentMaterializationView.js';

// Local snapshot content for one entry: checking availability, importing a
// snapshot package, and the materialization history and source counts.
export function useSnapshotMaterialization({
    catalog, localSnapshotContentAvailabilityUseCase, snapshotContentMaterializationCoordinator
}) {
    // Explicit "Check Local Snapshot" only. Each check replaces the
    // previous one.
    async function checkLocalSnapshotAvailability(entry) {
        if (!localSnapshotContentAvailabilityUseCase) return;
        entry.localSnapshotAvailability = { checking: true };
        entry.localSnapshotAvailability = await localSnapshotContentAvailabilityUseCase.execute(entry.publication);
    }

    function localSnapshotAvailabilityView(entry) {
        return describeLocalSnapshotContentAvailability(entry.localSnapshotAvailability);
    }

    function localSnapshotAvailabilityBadgeClass(entry) {
        const outcome = localSnapshotAvailabilityView(entry).outcome;
        return outcome ? (LOCAL_SNAPSHOT_AVAILABILITY_BADGE_CLASSES[outcome] || null) : null;
    }

    function localSnapshotAvailabilityButtonLabel(entry) {
        const view = localSnapshotAvailabilityView(entry);
        return describeAvailabilityCheckButtonLabel({ checking: view.checking, checked: view.checked });
    }

    // state is null until "Check Local Snapshot" has run.
    function currentPossessionView(entry) {
        return describePublicationSnapshotPossession(entry.localSnapshotAvailability);
    }

    // Only whether this replica knows the envelope and holds valid bytes;
    // evidence and placement counts stay on the Decentralization card.
    function replicaContentKnowledgeView(entry) {
        return describePublicationReplicaContentKnowledge({
            publicationId: entry.publication.id,
            hasPublication: catalog.has(entry.publication.id),
            possession: currentPossessionView(entry)
        });
    }

    function snapshotAcquisitionView(entry) {
        return describePublicationSnapshotAcquisition({
            publicationId: entry.publication.id,
            contentHash: entry.publication.contentReference.hash,
            possessionView: currentPossessionView(entry),
            materializationHistory: entry.materializationHistory
        });
    }

    // null when nothing was recorded, so the summary shows nothing rather
    // than "0 attempts".
    function snapshotAcquisitionOutcomeCountsSentence(entry) {
        const acquisition = snapshotAcquisitionView(entry).acquisition;
        if (acquisition.attemptCount === 0) return null;
        const parts = [`${acquisition.attemptCount} attempt${acquisition.attemptCount === 1 ? '' : 's'}`];
        if (acquisition.storedCount > 0) parts.push(`${acquisition.storedCount} stored`);
        if (acquisition.alreadyAvailableCount > 0) parts.push(`${acquisition.alreadyAvailableCount} already available`);
        if (acquisition.hashMismatchCount > 0) parts.push(`${acquisition.hashMismatchCount} hash mismatch`);
        return parts.join(' · ');
    }

    // True only after a completed check reported no valid bytes; the page
    // never nudges toward a source before that.
    function snapshotAcquisitionNeedsSourceHint(entry) {
        const state = snapshotAcquisitionView(entry).possession.state;
        return state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE
            || state === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH;
    }

    // Only loads the chosen file into the text box; nothing is imported
    // until "Import Snapshot".
    function onMaterializationFileChosen(entry, event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { entry.materializationImportText = String(reader.result || ''); };
        reader.readAsText(file);
    }

    // JSON.parse and the import are guarded separately; bad JSON and an
    // invalid package both show as UNAVAILABLE.
    async function importSnapshotContent(entry) {
        if (!snapshotContentMaterializationCoordinator) return;
        let pkg;
        try {
            pkg = JSON.parse(entry.materializationImportText);
        } catch {
            entry.materializationAttempt = {
                importing: false, outcome: null, error: 'That is not valid JSON — choose a file, or paste the contents, of an exported Publication Snapshot Transfer Package.'
            };
            return;
        }
        entry.materializationAttempt = { importing: true };
        try {
            const result = await snapshotContentMaterializationCoordinator.import(pkg);
            entry.materializationAttempt = {
                importing: false, error: null,
                outcome: result.outcome, contentReference: result.contentReference,
                publicationId: result.publicationId, publicationKnown: result.publicationKnown
            };
            recordMaterializationSource(entry, result.source, result.outcome === SnapshotContentTransferOutcome.STORED
                || result.outcome === SnapshotContentTransferOutcome.ALREADY_STORED, result.contentReference, result.publicationId);
            recordMaterializationHistoryEntry(entry, {
                sourceKind: result.source.kind,
                outcome: mapPackageOutcomeToStoreOutcome(result.outcome),
                publicationId: result.publicationId,
                contentHash: pkg.contentHash,
                contentReference: result.contentReference
            });
        } catch (error) {
            entry.materializationAttempt = {
                importing: false, outcome: null,
                error: error.message.replace(/^PublicationSnapshotTransferPackage:\s*/, '')
            };
        }
    }

    // Updated only when bytes were actually stored, so "Source: …" names
    // the last action that succeeded. STORED and ALREADY_AVAILABLE both
    // count.
    function recordMaterializationSource(entry, source, stored, contentReference, publicationId) {
        if (!stored || !source) return;
        entry.lastMaterializationAttempt = createSnapshotMaterializationAttempt({
            sourceKind: source.kind,
            outcome: StoreSnapshotContentOutcome.STORED,
            contentReference,
            publicationId,
            contentHash: contentReference ? contentReference.hash : null
        });
    }

    function localSnapshotMaterializationSourceView(entry) {
        return describeLocalSnapshotMaterializationSource(entry.lastMaterializationAttempt);
    }

    // Map each action's outcome onto StoreSnapshotContentOutcome. null
    // means the store was never reached (resolution or transport failed),
    // so no history entry is written for it.
    function mapPackageOutcomeToStoreOutcome(outcome) {
        switch (outcome) {
            case SnapshotContentTransferOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
            case SnapshotContentTransferOutcome.ALREADY_STORED: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
            case SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
            default: return null;
        }
    }

    function mapPlacementOutcomeToStoreOutcome(outcome) {
        switch (outcome) {
            case SnapshotPlacementMaterializationOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
            case SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
            case SnapshotPlacementMaterializationOutcome.HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
            default: return null;
        }
    }

    function mapPeerOutcomeToStoreOutcome(outcome) {
        switch (outcome) {
            case PeerSnapshotMaterializationOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
            case PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
            case PeerSnapshotMaterializationOutcome.HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
            default: return null;
        }
    }

    // Appends every attempt that reached the store, including a
    // HASH_MISMATCH; null outcomes are skipped.
    function recordMaterializationHistoryEntry(entry, { sourceKind, outcome, publicationId, contentHash, contentReference }) {
        if (!sourceKind || !outcome) return;
        const attempt = createSnapshotMaterializationAttempt({ sourceKind, outcome, contentReference, publicationId, contentHash });
        entry.materializationHistory = appendSnapshotMaterializationHistoryEntry(entry.materializationHistory, attempt);
    }

    function materializationHistoryDetailsView(entry) {
        return describeSnapshotMaterializationHistoryDetails(entry.materializationHistory);
    }

    function isMaterializationHistoryEntryExpanded(entry, index) {
        return Boolean(entry.materializationHistoryEntryExpanded[index]);
    }

    function toggleMaterializationHistoryEntry(entry, index) {
        entry.materializationHistoryEntryExpanded[index] = !entry.materializationHistoryEntryExpanded[index];
    }

    // A tally, never a ranking.
    function materializationSourceCountsSentence(entry) {
        const counts = describeSnapshotMaterializationSourceCounts(entry.materializationHistory);
        const parts = [];
        if (counts.package > 0) parts.push(`${counts.package} via transfer package`);
        if (counts.placement > 0) parts.push(`${counts.placement} via placement`);
        if (counts.peer > 0) parts.push(`${counts.peer} via peer`);
        if (!parts.length) return null;
        return parts.join(' · ');
    }

    function toggleMaterializationHistory(entry) {
        entry.materializationHistoryExpanded = !entry.materializationHistoryExpanded;
    }

    function materializationView(entry) {
        return describeMaterializationAttempt(entry.materializationAttempt);
    }

    function materializationBadgeClass(entry) {
        const state = materializationView(entry).state;
        return MATERIALIZATION_BADGE_CLASSES[state] || null;
    }

    function materializationButtonLabel(entry) {
        return describeMaterializationButtonLabel({ importing: materializationView(entry).importing });
    }

    return {
        checkLocalSnapshotAvailability, localSnapshotAvailabilityView, localSnapshotAvailabilityBadgeClass,
        localSnapshotAvailabilityButtonLabel, currentPossessionView, replicaContentKnowledgeView,
        snapshotAcquisitionView, snapshotAcquisitionOutcomeCountsSentence, snapshotAcquisitionNeedsSourceHint,
        onMaterializationFileChosen, importSnapshotContent, recordMaterializationSource,
        localSnapshotMaterializationSourceView, mapPackageOutcomeToStoreOutcome,
        mapPlacementOutcomeToStoreOutcome, mapPeerOutcomeToStoreOutcome, recordMaterializationHistoryEntry,
        materializationHistoryDetailsView, isMaterializationHistoryEntryExpanded,
        toggleMaterializationHistoryEntry, materializationSourceCountsSentence, toggleMaterializationHistory,
        materializationView, materializationBadgeClass, materializationButtonLabel
    };
}
