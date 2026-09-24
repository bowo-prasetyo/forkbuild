import { publicationEvidenceView } from '../../../application/publication/evidence/PublicationEvidenceView.js';
import { createVerificationObservation } from '../../../application/anchoring/PublicationAnchorVerificationObservation.js';
import {
    deriveAnchorVerificationLifecycle, describeAnchorVerificationLifecycleNote
} from '../../../application/anchoring/PublicationAnchorVerificationLifecycleView.js';
import { publicationAnchorDetailView } from '../../../application/anchoring/PublicationAnchorDetailView.js';
import { describeAnchorKnowledge } from '../../../application/anchoring/PublicationAnchorKnowledgeView.js';
import { ExternalAnchorCreationOutcome } from '../../../application/anchoring/ExternalAnchorCreationOutcome.js';
import {
    describeEvidenceDiscoveryAttempt, describeDiscoveryButtonLabel
} from '../../../application/publication/evidence/PublicationEvidenceDiscoveryView.js';
import {
    DISCOVERY_BADGE_CLASSES, SYNCHRONIZATION_BADGE_CLASSES, CREATION_BADGE_CLASSES, humanizeAnchorType
} from './presentation.js';
import {
    describeSynchronizationAttempt, describeSynchronizationButtonLabel
} from '../../../application/publication/evidence/PublicationKnowledgeSynchronizationView.js';
import {
    describeCreationAttempt, describeCreationButtonLabel
} from '../../../application/anchoring/PublicationAnchorCreationView.js';
import { ExternalAnchorCreationUiState } from '../../../application/anchoring/ExternalAnchorCreationUiState.js';

// External anchor evidence for one entry: verifying and inspecting known
// anchors, creating new ones, and discovering/synchronizing anchors with peers.
// Creating or discovering an anchor never verifies it.
export function useAnchorEvidence({
    anchorKnowledgeStore, creationCoordinator, evidenceCoordinator, evidenceDiscoveryCoordinator,
    evidenceViewRegistry, knowledgeSynchronizationCoordinator, loadEvidence, loadPlacements,
    preferredAnchorCreationCoordinator, recomputeConvergence, recomputeReplicaKnowledgeDetail
}) {
    // Verifies exactly one anchor, on an explicit click, against this
    // entry's own publicationId/contentHash, so an anchor for another
    // publication is reported as CONTENT_MISMATCH.
    async function verifyAnchor(entry, anchorView) {
        const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
        if (!anchor || !evidenceCoordinator) return;
        entry.verifications[anchor.id] = { checking: true };
        entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
        const result = await evidenceCoordinator.verify(anchor, {
            expectedContentHash: entry.publication.contentReference.hash,
            expectedPublicationId: entry.publication.id
        });
        entry.verifications[anchor.id] = { outcome: result.outcome, reason: result.reason };
        entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
        recomputeConvergence(entry);
        // Append, never replace: see verificationHistory.
        const history = entry.verificationHistory[anchor.id] || (entry.verificationHistory[anchor.id] = []);
        history.push(createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason }));
        // After the history push, so verificationState reflects this
        // attempt.
        recomputeReplicaKnowledgeDetail(entry);
    }

    // An extra sentence beside the badge, shown only when an anchor that
    // verified earlier this session now comes back PROOF_UNAVAILABLE.
    function lifecycleNote(entry, anchorView) {
        const lifecycle = deriveAnchorVerificationLifecycle(entry.verificationHistory[anchorView.anchorId]);
        return describeAnchorVerificationLifecycleNote(lifecycle);
    }

    // Pure and synchronous: reads the anchor detail and the optional
    // anchorType-specific view, and changes no entry state. Closing keeps
    // the computed detail cached; a cataloged anchor never changes in
    // place.
    function toggleInspect(entry, anchorView) {
        const state = entry.inspections[anchorView.anchorId]
            || (entry.inspections[anchorView.anchorId] = { expanded: false, detail: null, typeSpecific: null, knowledge: null });
        state.expanded = !state.expanded;
        if (state.expanded && !state.detail) {
            const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
            if (!anchor) return;
            state.detail = publicationAnchorDetailView(anchor);
            state.typeSpecific = (evidenceViewRegistry && evidenceViewRegistry.has(anchor.anchorType))
                ? evidenceViewRegistry.get(anchor.anchorType).describe(anchor)
                : null;
            // Local, synchronous read; no network access.
            state.knowledge = anchorKnowledgeStore
                ? describeAnchorKnowledge(anchorKnowledgeStore.get(anchor.id))
                : null;
        }
    }

    function inspectionExpanded(entry, anchorView) {
        const state = entry.inspections[anchorView.anchorId];
        return Boolean(state && state.expanded);
    }

    function inspectionDetail(entry, anchorView) {
        const state = entry.inspections[anchorView.anchorId];
        return state ? state.detail : null;
    }

    function inspectionTypeSpecific(entry, anchorView) {
        const state = entry.inspections[anchorView.anchorId];
        return state ? state.typeSpecific : null;
    }

    function inspectionKnowledge(entry, anchorView) {
        const state = entry.inspections[anchorView.anchorId];
        return state ? state.knowledge : null;
    }

    // Only on an explicit click for one anchorType; never on open or
    // refresh. A thrown error (create() never catches) is turned into a
    // display state here.
    async function createAnchor(entry, anchorType) {
        if (!creationCoordinator) return;
        entry.creationAttempts[anchorType] = { creating: true, outcome: null, anchor: null, reason: null, error: null };
        try {
            const result = await creationCoordinator.create(entry.publication.id, anchorType);
            entry.creationAttempts[anchorType] = {
                creating: false, outcome: result.outcome, anchor: result.anchor, reason: result.reason, error: null
            };
            // Re-discover (a local read, never a verification) so the new
            // anchor appears in the list.
            loadEvidence(entry);
            if (result.outcome === ExternalAnchorCreationOutcome.CREATED) {
                entry.evidenceExpanded = true;
            }
        } catch (error) {
            entry.creationAttempts[anchorType] = { creating: false, outcome: null, anchor: null, reason: null, error: error.message };
        }
    }

    // Only on an explicit click. Discovered anchors are already cataloged
    // (after signature checks) when discover() resolves, so loadEvidence()
    // is just a local re-read, never a verification. A thrown error becomes
    // UNAVAILABLE.
    async function discoverFromPeers(entry) {
        if (!evidenceDiscoveryCoordinator) return;
        entry.discoveryAttempt = { discovering: true, result: null, error: null };
        try {
            const result = await evidenceDiscoveryCoordinator.discover(entry.publication.id);
            entry.discoveryAttempt = { discovering: false, result, error: null };
            loadEvidence(entry);
            if (result.newlyImportedCount > 0) {
                entry.evidenceExpanded = true;
            }
        } catch (error) {
            entry.discoveryAttempt = { discovering: false, result: null, error: error.message };
        }
    }

    function discoveryView(entry) {
        return describeEvidenceDiscoveryAttempt(entry.discoveryAttempt);
    }

    function discoveryBadgeClass(entry) {
        const state = discoveryView(entry).state;
        return DISCOVERY_BADGE_CLASSES[state] || null;
    }

    function discoveryButtonLabel(entry) {
        const discovering = Boolean(entry.discoveryAttempt && entry.discoveryAttempt.discovering);
        const hasDiscovered = Boolean(entry.discoveryAttempt && !discovering);
        return describeDiscoveryButtonLabel({ discovering, hasDiscovered });
    }

    // One explicit click asks every authenticated peer about anchors and
    // placements together; afterwards both local catalogs are re-read.
    async function synchronizeWithPeers(entry) {
        if (!knowledgeSynchronizationCoordinator) return;
        entry.synchronizationAttempt = { synchronizing: true, result: null, error: null };
        try {
            const result = await knowledgeSynchronizationCoordinator.synchronize(entry.publication.id);
            entry.synchronizationAttempt = { synchronizing: false, result, error: null };
            loadEvidence(entry);
            loadPlacements(entry);
            if (result.anchors.newlyImportedCount > 0) {
                entry.evidenceExpanded = true;
            }
            if (result.placements.newlyImportedCount > 0) {
                entry.placementsExpanded = true;
            }
        } catch (error) {
            entry.synchronizationAttempt = { synchronizing: false, result: null, error: error.message };
        }
    }

    function synchronizationView(entry) {
        return describeSynchronizationAttempt(entry.synchronizationAttempt);
    }

    function synchronizationBadgeClass(entry) {
        const state = synchronizationView(entry).state;
        return SYNCHRONIZATION_BADGE_CLASSES[state] || null;
    }

    function synchronizationButtonLabel(entry) {
        const synchronizing = Boolean(entry.synchronizationAttempt && entry.synchronizationAttempt.synchronizing);
        const hasSynchronized = Boolean(entry.synchronizationAttempt && !synchronizing);
        return describeSynchronizationButtonLabel({ synchronizing, hasSynchronized });
    }

    function creationView(entry, anchorType) {
        return describeCreationAttempt(entry.creationAttempts[anchorType]);
    }

    function creationBadgeClass(entry, anchorType) {
        const state = creationView(entry, anchorType).state;
        return CREATION_BADGE_CLASSES[state] || null;
    }

    function creationButtonLabel(entry, anchorType) {
        const view = creationView(entry, anchorType);
        const hasExisting = entry.evidenceAnchors.some((anchor) => anchor.anchorType === anchorType);
        return describeCreationButtonLabel(humanizeAnchorType(anchorType), { creating: view.state === ExternalAnchorCreationUiState.CREATING, hasExisting });
    }

    // The "Use Preferred Provider" counterpart of createAnchor().
    // Deliberately passes no anchorType, which is what makes create()
    // resolve the saved PROOF_AND_ANCHORING preference; this function never
    // picks an anchorType itself. A thrown error (not signed in, no
    // publisher) is shown, not thrown.
    async function createPreferredAnchor(entry) {
        if (!preferredAnchorCreationCoordinator) return;
        entry.preferredAnchorCreationAttempt = { creating: true, outcome: null, anchor: null, reason: null, error: null, preference: null };
        try {
            const result = await preferredAnchorCreationCoordinator.create(entry.publication.id);
            entry.preferredAnchorCreationAttempt = {
                creating: false, outcome: result.outcome, anchor: result.anchor, reason: result.reason, error: null,
                preference: result.preference || null
            };
            // Re-discover so the new anchor appears in the list.
            loadEvidence(entry);
            if (result.outcome === ExternalAnchorCreationOutcome.CREATED) {
                entry.evidenceExpanded = true;
            }
        } catch (error) {
            entry.preferredAnchorCreationAttempt = { creating: false, outcome: null, anchor: null, reason: null, error: error.message, preference: null };
        }
    }

    function preferredCreationView(entry) {
        return describeCreationAttempt(entry.preferredAnchorCreationAttempt);
    }

    function preferredCreationBadgeClass(entry) {
        const state = preferredCreationView(entry).state;
        return CREATION_BADGE_CLASSES[state] || null;
    }

    // anchorType-agnostic: which type was used is only known from the
    // result.
    function preferredCreationButtonLabel(entry) {
        return preferredCreationView(entry).state === ExternalAnchorCreationUiState.CREATING ? 'Creating…' : 'Use Preferred Provider';
    }

    return {
        verifyAnchor, lifecycleNote, toggleInspect, inspectionExpanded, inspectionDetail,
        inspectionTypeSpecific, inspectionKnowledge, createAnchor, discoverFromPeers, discoveryView,
        discoveryBadgeClass, discoveryButtonLabel, synchronizeWithPeers, synchronizationView,
        synchronizationBadgeClass, synchronizationButtonLabel, creationView, creationBadgeClass,
        creationButtonLabel, createPreferredAnchor, preferredCreationView, preferredCreationBadgeClass,
        preferredCreationButtonLabel
    };
}
