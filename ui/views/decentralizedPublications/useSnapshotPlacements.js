import { snapshotPlacementView } from '../../../application/SnapshotPlacementView.js';
import {
    derivePublicationSnapshotPlacementConvergence
} from '../../../application/PublicationSnapshotPlacementConvergence.js';
import {
    publicationSnapshotPlacementConvergenceView
} from '../../../application/PublicationSnapshotPlacementConvergenceView.js';
import { createResolutionObservation } from '../../../application/SnapshotPlacementResolutionObservation.js';
import {
    deriveSnapshotPlacementLifecycle, describeSnapshotPlacementLifecycleNote
} from '../../../application/SnapshotPlacementLifecycleView.js';
import {
    PLACEMENT_BADGE_CLASSES, PLACEMENT_MATERIALIZATION_BADGE_CLASSES, PLACEMENT_CREATION_BADGE_CLASSES,
    humanizeStorageType
} from './presentation.js';
import {
    SnapshotPlacementMaterializationOutcome
} from '../../../application/SnapshotPlacementMaterializationOutcome.js';
import {
    describePlacementMaterializationAttempt, describePlacementMaterializationButtonLabel
} from '../../../application/SnapshotPlacementMaterializationView.js';
import {
    SnapshotPlacementMaterializationUiState
} from '../../../application/SnapshotPlacementMaterializationUiState.js';
import { publicationSnapshotPlacementDetailView } from '../../../application/PublicationSnapshotPlacementDetailView.js';
import { describePlacementKnowledge } from '../../../application/PublicationSnapshotPlacementKnowledgeView.js';
import { SnapshotPlacementCreationOutcome } from '../../../application/SnapshotPlacementCreationOutcome.js';
import {
    describeCreationAttempt as describePlacementCreationAttempt,
    describeCreationButtonLabel as describePlacementCreationButtonLabel
} from '../../../application/SnapshotPlacementCreationView.js';
import { SnapshotPlacementCreationUiState } from '../../../application/SnapshotPlacementCreationUiState.js';

// Snapshot placements for one entry: loading known placements, resolving,
// inspecting, creating and materializing them. Resolving never materializes;
// each runs only on an explicit click.
export function useSnapshotPlacements({
    mapPlacementOutcomeToStoreOutcome, placementCreationCoordinator, placementKnowledgeStore,
    placementResolutionCoordinator, placementViewRegistry, preferredPlacementCreationCoordinator,
    recomputeDecentralization, recomputeReplicaKnowledgeDetail, recordMaterializationHistoryEntry,
    recordMaterializationSource, snapshotPlacementMaterializationCoordinator
}) {
    // Discovery only: a local catalog read that never resolves.
    function loadPlacements(entry) {
        if (!placementResolutionCoordinator) return;
        entry.placements = placementResolutionCoordinator.discover(entry.publication.id);
        entry.placementsView = snapshotPlacementView(entry.placements, entry.resolutions);
        recomputePlacementConvergence(entry);
        recomputeReplicaKnowledgeDetail(entry);
    }

    // Called from loadPlacements() only. Placement convergence takes no
    // resolution input, so resolving a placement can never change it.
    function recomputePlacementConvergence(entry) {
        entry.placementConvergence = derivePublicationSnapshotPlacementConvergence({
            publicationId: entry.publication.id,
            placements: entry.placements
        });
        entry.placementConvergenceView = publicationSnapshotPlacementConvergenceView(entry.placementConvergence);
        recomputeDecentralization(entry);
    }

    function togglePlacements(entry) {
        entry.placementsExpanded = !entry.placementsExpanded;
    }

    // Resolves exactly one placement, on an explicit click.
    async function resolvePlacement(entry, placementView) {
        const placement = entry.placements.find((candidate) => candidate.id === placementView.placementId);
        if (!placement || !placementResolutionCoordinator) return;
        entry.resolutions[placement.id] = { checking: true };
        entry.placementsView = snapshotPlacementView(entry.placements, entry.resolutions);
        const result = await placementResolutionCoordinator.resolve(placement);
        entry.resolutions[placement.id] = { outcome: result.outcome, reason: result.reason };
        entry.placementsView = snapshotPlacementView(entry.placements, entry.resolutions);
        // Append, never replace: see resolutionHistory.
        const history = entry.resolutionHistory[placement.id] || (entry.resolutionHistory[placement.id] = []);
        history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
        // After the history push, so resolutionState reflects this attempt.
        recomputeReplicaKnowledgeDetail(entry);
    }

    // An extra sentence beside the badge, shown only when a placement that
    // resolved earlier this session now comes back UNAVAILABLE.
    function placementLifecycleNote(entry, placementView) {
        const lifecycle = deriveSnapshotPlacementLifecycle(entry.resolutionHistory[placementView.placementId]);
        return describeSnapshotPlacementLifecycleNote(lifecycle);
    }

    function placementBadgeClass(placementView) {
        if (placementView.checking) return 'peer-badge--pending';
        if (!placementView.resolved) return 'peer-badge--unchecked';
        return PLACEMENT_BADGE_CLASSES[placementView.resolutionOutcome] || 'peer-badge--unchecked';
    }

    // Like resolvePlacement(), but a successful attempt writes the bytes
    // into this replica's ContentStore. Only on an explicit click.
    async function materializePlacement(entry, placementView) {
        const placement = entry.placements.find((candidate) => candidate.id === placementView.placementId);
        if (!placement || !snapshotPlacementMaterializationCoordinator) return;
        entry.materializations[placement.id] = { materializing: true };
        try {
            const result = await snapshotPlacementMaterializationCoordinator.materialize(placement);
            entry.materializations[placement.id] = {
                materializing: false, error: null,
                outcome: result.outcome, reason: result.reason, contentReference: result.contentReference,
                placementId: result.placementId, publicationId: result.publicationId, publicationKnown: result.publicationKnown
            };
            recordMaterializationSource(entry, result.source, result.outcome === SnapshotPlacementMaterializationOutcome.STORED
                || result.outcome === SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE, result.contentReference, result.publicationId);
            recordMaterializationHistoryEntry(entry, {
                sourceKind: result.source.kind,
                outcome: mapPlacementOutcomeToStoreOutcome(result.outcome),
                publicationId: result.publicationId,
                contentHash: result.contentHash,
                contentReference: result.contentReference
            });
        } catch (error) {
            entry.materializations[placement.id] = { materializing: false, outcome: null, error: error.message };
        }
    }

    function placementMaterializationView(entry, placementView) {
        return describePlacementMaterializationAttempt(entry.materializations[placementView.placementId]);
    }

    function placementMaterializationBadgeClass(entry, placementView) {
        const state = placementMaterializationView(entry, placementView).state;
        return PLACEMENT_MATERIALIZATION_BADGE_CLASSES[state] || null;
    }

    function placementMaterializationButtonLabel(entry, placementView) {
        const view = placementMaterializationView(entry, placementView);
        return describePlacementMaterializationButtonLabel({
            materializing: view.materializing,
            materialized: view.state !== SnapshotPlacementMaterializationUiState.IDLE
        });
    }

    // Pure and synchronous: reads the placement detail and the optional
    // storage-specific view, and changes no entry state.
    function togglePlacementInspect(entry, placementView) {
        const state = entry.placementInspections[placementView.placementId]
            || (entry.placementInspections[placementView.placementId] = { expanded: false, detail: null, typeSpecific: null, knowledge: null });
        state.expanded = !state.expanded;
        if (state.expanded && !state.detail) {
            const placement = entry.placements.find((candidate) => candidate.id === placementView.placementId);
            if (!placement) return;
            state.detail = publicationSnapshotPlacementDetailView(placement);
            state.typeSpecific = (placementViewRegistry && placementViewRegistry.has(placement.storage))
                ? placementViewRegistry.get(placement.storage).describe(placement)
                : null;
            // Local, synchronous read; no network access.
            state.knowledge = placementKnowledgeStore
                ? describePlacementKnowledge(placementKnowledgeStore.get(placement.id))
                : null;
        }
    }

    function placementInspectionExpanded(entry, placementView) {
        const state = entry.placementInspections[placementView.placementId];
        return Boolean(state && state.expanded);
    }

    function placementInspectionDetail(entry, placementView) {
        const state = entry.placementInspections[placementView.placementId];
        return state ? state.detail : null;
    }

    function placementInspectionTypeSpecific(entry, placementView) {
        const state = entry.placementInspections[placementView.placementId];
        return state ? state.typeSpecific : null;
    }

    function placementInspectionKnowledge(entry, placementView) {
        const state = entry.placementInspections[placementView.placementId];
        return state ? state.knowledge : null;
    }

    // Only on an explicit click for one storage type; never on open or
    // refresh. A thrown error (create() never catches) is turned into a
    // display state here.
    async function createPlacement(entry, storage) {
        if (!placementCreationCoordinator) return;
        entry.placementCreationAttempts[storage] = { creating: true, outcome: null, placement: null, reason: null, error: null };
        try {
            const result = await placementCreationCoordinator.create(entry.publication.id, storage);
            entry.placementCreationAttempts[storage] = {
                creating: false, outcome: result.outcome, placement: result.placement, reason: result.reason, error: null
            };
            // Re-discover (a local read, not a resolution) so the new
            // placement appears in the list.
            loadPlacements(entry);
            if (result.outcome === SnapshotPlacementCreationOutcome.CREATED) {
                entry.placementsExpanded = true;
            }
        } catch (error) {
            entry.placementCreationAttempts[storage] = { creating: false, outcome: null, placement: null, reason: null, error: error.message };
        }
    }

    function placementCreationView(entry, storage) {
        return describePlacementCreationAttempt(entry.placementCreationAttempts[storage]);
    }

    function placementCreationBadgeClass(entry, storage) {
        const state = placementCreationView(entry, storage).state;
        return PLACEMENT_CREATION_BADGE_CLASSES[state] || null;
    }

    function placementCreationButtonLabel(entry, storage) {
        const view = placementCreationView(entry, storage);
        const hasExisting = entry.placements.some((placement) => placement.storage === storage);
        return describePlacementCreationButtonLabel(humanizeStorageType(storage), { creating: view.state === SnapshotPlacementCreationUiState.CREATING, hasExisting });
    }

    // The "Use Preferred Provider" counterpart of createPlacement().
    // Deliberately passes no storage, which is what makes create() resolve
    // the saved Content preference; this function never picks a storage
    // itself. A thrown error (not signed in, no local content) is shown,
    // not thrown.
    async function createPreferredPlacement(entry) {
        if (!preferredPlacementCreationCoordinator) return;
        entry.preferredPlacementCreationAttempt = { creating: true, outcome: null, placement: null, reason: null, error: null, preference: null };
        try {
            const result = await preferredPlacementCreationCoordinator.create(entry.publication.id);
            entry.preferredPlacementCreationAttempt = {
                creating: false, outcome: result.outcome, placement: result.placement, reason: result.reason, error: null,
                preference: result.preference || null
            };
            // Re-discover so the new placement appears in the list.
            loadPlacements(entry);
            if (result.outcome === SnapshotPlacementCreationOutcome.CREATED) {
                entry.placementsExpanded = true;
            }
        } catch (error) {
            entry.preferredPlacementCreationAttempt = { creating: false, outcome: null, placement: null, reason: null, error: error.message, preference: null };
        }
    }

    function preferredPlacementCreationView(entry) {
        return describePlacementCreationAttempt(entry.preferredPlacementCreationAttempt);
    }

    function preferredPlacementCreationBadgeClass(entry) {
        const state = preferredPlacementCreationView(entry).state;
        return PLACEMENT_CREATION_BADGE_CLASSES[state] || null;
    }

    // Storage-agnostic: which storage was used is only known from the
    // result.
    function preferredPlacementCreationButtonLabel(entry) {
        return preferredPlacementCreationView(entry).state === SnapshotPlacementCreationUiState.CREATING ? 'Creating…' : 'Use Preferred Provider';
    }

    return {
        loadPlacements, recomputePlacementConvergence, togglePlacements, resolvePlacement,
        placementLifecycleNote, placementBadgeClass, materializePlacement, placementMaterializationView,
        placementMaterializationBadgeClass, placementMaterializationButtonLabel, togglePlacementInspect,
        placementInspectionExpanded, placementInspectionDetail, placementInspectionTypeSpecific,
        placementInspectionKnowledge, createPlacement, placementCreationView, placementCreationBadgeClass,
        placementCreationButtonLabel, createPreferredPlacement, preferredPlacementCreationView,
        preferredPlacementCreationBadgeClass, preferredPlacementCreationButtonLabel
    };
}
