import { inspectWorldEncounterMaterial } from '../../../application/WorldEncounterMaterialInspection.js';
import { createId } from '../../../core/createId.js';

// WorldEncounterCanvas methods: observer-local ("Discovered here") encounters, their inspection and commentary.
// Spread into the component's `methods`, so `this` is the component instance.
export const observerLocalEncounterMethods = {
    // The only writer of `observerLocalEncounters`. No-op without the store.
    refreshObserverLocalEncountersFromRegistry() {
        if (!this.observerLocalEncounterRegistry || typeof this.observerLocalEncounterRegistry.list !== 'function') {
            return;
        }
        this.observerLocalEncounters = this.observerLocalEncounterRegistry.list();
    },
    // The only writer of `selectedObserverLocalEncounter`: stores the marker's
    // `{ publicationId, contentHash }` and refreshes its inspection. Never touches
    // the primary or comparison selection. Malformed markers are ignored.
    selectObserverLocalEncounter(marker) {
        if (!marker || typeof marker.publicationId !== 'string' || typeof marker.contentHash !== 'string') {
            return;
        }
        this.selectedObserverLocalEncounter = { publicationId: marker.publicationId, contentHash: marker.contentHash };
        this.refreshObserverLocalEncounterInspection();
        // Fresh observer-local selections start with clean commentary state.
        this.observerLocalEncounterCommentaryOpen = false;
        this.observerLocalEncounterCommentaries = [];
        this.newObserverLocalEncounterCommentaryText = '';
        this.observerLocalEncounterCommentarySubmitting = false;
        this.observerLocalEncounterCommentaryError = null;
        this.pendingObserverLocalEncounterCommentaryDraft = null;
    },
    // The only writer of `observerLocalEncounterInspection`: like
    // refreshMaterialInspection(), but reading
    // `observerLocalEncounterResolvedSelection` and never supplying a lead (its
    // origin always names `materialSources.local`). Clears to null without a
    // resolved selection or `materialSources`.
    refreshObserverLocalEncounterInspection() {
        this.observerLocalEncounterInspectionRequestId += 1;
        const requestId = this.observerLocalEncounterInspectionRequestId;
        const resolvedSelection = this.observerLocalEncounterResolvedSelection;

        if (!resolvedSelection || !this.materialSources) {
            this.observerLocalEncounterInspection = null;
            return;
        }

        inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: this.materialSources,
            verifier: this.materialVerifier
        }).then((result) => {
            // Offered to admitToRepositoryDiscovery() on every resolution, outside the
            // stale-response guard: a resolution superseded for display was still a
            // genuine retrieval. That method's AVAILABLE + VERIFIED gate decides.
            this.admitToRepositoryDiscovery(result.loading, result.verification);
            // Discard a superseded response.
            if (requestId === this.observerLocalEncounterInspectionRequestId) {
                this.observerLocalEncounterInspection = result;
            }
        });
    },
    // Clears the observer-local selection and bumps its request counter so an
    // in-flight inspection can't resurrect it.
    dismissObserverLocalEncounterInspection() {
        this.selectedObserverLocalEncounter = null;
        this.observerLocalEncounterInspection = null;
        this.observerLocalEncounterInspectionRequestId += 1;
        this.observerLocalEncounterCommentaryOpen = false;
        this.observerLocalEncounterCommentaries = [];
        this.newObserverLocalEncounterCommentaryText = '';
        this.observerLocalEncounterCommentarySubmitting = false;
        this.observerLocalEncounterCommentaryError = null;
        this.pendingObserverLocalEncounterCommentaryDraft = null;
    },
    // Hands `openPublicationCommand` the resolved Publication, never a bare id or
    // a second lookup. No-op without the command or before the inspection is
    // actionable.
    openObserverLocalEncounterPublication() {
        const publication = this.observerLocalEncounterActionablePublication;
        if (!publication || !this.openPublicationCommand) {
            return;
        }
        this.openPublicationCommand(publication);
    },
    forkObserverLocalEncounterPublication() {
        const publication = this.observerLocalEncounterActionablePublication;
        if (!publication || !this.forkPublicationCommand) {
            return;
        }
        this.forkPublicationCommand(publication);
    },
    exploreObserverLocalEncounterPublication() {
        const publication = this.observerLocalEncounterActionablePublication;
        if (!publication || !this.explorePublicationCommand) {
            return;
        }
        this.explorePublicationCommand(publication);
    },
    toggleObserverLocalEncounterCommentary() {
        if (!this.getPublicationCommentariesCommand || !this.observerLocalEncounterCommentaryPublicationId) {
            return;
        }
        const opening = !this.observerLocalEncounterCommentaryOpen;
        this.observerLocalEncounterCommentaryOpen = opening;
        if (opening) {
            this.refreshObserverLocalEncounterCommentaries();
        }
    },
    refreshObserverLocalEncounterCommentaries() {
        if (!this.getPublicationCommentariesCommand || !this.observerLocalEncounterCommentaryPublicationId) {
            return;
        }
        try {
            const result = this.getPublicationCommentariesCommand(this.observerLocalEncounterCommentaryPublicationId);
            this.observerLocalEncounterCommentaries = Array.isArray(result) ? result : [];
            this.observerLocalEncounterCommentaryError = null;
        } catch (error) {
            this.observerLocalEncounterCommentaryError = 'Commentary could not be loaded.';
        }
    },
    submitObserverLocalEncounterCommentary() {
        const publicationId = this.observerLocalEncounterCommentaryPublicationId;
        const content = this.newObserverLocalEncounterCommentaryText.trim();
        if (!publicationId || !this.addPublicationCommentaryCommand || !content || this.observerLocalEncounterCommentarySubmitting) {
            return;
        }
        if (!this.pendingObserverLocalEncounterCommentaryDraft || this.pendingObserverLocalEncounterCommentaryDraft.content !== content) {
            this.pendingObserverLocalEncounterCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
        }
        const { commentaryId, createdAt } = this.pendingObserverLocalEncounterCommentaryDraft;
        this.observerLocalEncounterCommentarySubmitting = true;
        try {
            this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt });
            this.newObserverLocalEncounterCommentaryText = '';
            this.observerLocalEncounterCommentaryError = null;
            this.pendingObserverLocalEncounterCommentaryDraft = null;
            this.refreshObserverLocalEncounterCommentaries();
        } catch (error) {
            this.observerLocalEncounterCommentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
        } finally {
            this.observerLocalEncounterCommentarySubmitting = false;
        }
    },
};
