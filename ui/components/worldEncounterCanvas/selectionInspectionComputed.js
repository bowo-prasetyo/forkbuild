import { describeWorldEncounterInspection } from '../../../application/worldEncounter/WorldEncounterInspection.js';
import { WorldEncounterSelectionOutcomeStatus } from '../../../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import { Publication } from '../../../publisher/Publication.js';
import { DecentralizedWorldEncounterLeadSelectionOutcomeStatus } from '../../../application/worldEncounter/DecentralizedWorldEncounterLeadSelection.js';
import { describeWorldEncounterPresentation } from '../../../application/worldEncounter/WorldEncounterPresentation.js';
import { describeWorldSnapshotInspection } from '../../../application/snapshot/WorldSnapshotInspection.js';
import { materializedSnapshotWorldOrigin } from '../../../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';

// `Publication` is needed for one check only: `loading.status === 'AVAILABLE'
// && loading.material instanceof Publication`, the same admission gate
// ui/views/DecentralizedPublicationsView.js's admitToRepositoryDiscovery()
// uses. 'AVAILABLE' is compared as a literal
// (WorldEncounterMaterialLoadStatus.AVAILABLE) so this file never imports
// application/worldEncounter/WorldEncounterMaterialLoading.js: it reacts only to
// inspectWorldEncounterMaterial()'s result.

// WorldEncounterCanvas computed properties: what the selected encounter (or
// observer-local encounter) resolves to, its inspection and presentation,
// its snapshot inspection and its decentralized lead.
// Spread into the component's `computed`, so `this` is the component instance.
export const selectionInspectionComputed = {
    // describeWorldEncounterInspection() over the current selection; null with no
    // selection or when the object has left the World.
    selectedEncounterInspection() {
        return describeWorldEncounterInspection({ selectedEncounter: this.selectedEncounter, view: this.effectiveView });
    },
    // `publisherIdentity` rendered verbatim, never one cherry-picked field.
    selectedEncounterInspectionPublisherIdentityLabel() {
        if (!this.selectedEncounterInspection || this.selectedEncounterInspection.kind !== 'PUBLICATION') {
            return '';
        }
        const publisherIdentity = this.selectedEncounterInspection.publisherIdentity;
        return publisherIdentity ? JSON.stringify(publisherIdentity) : '';
    },
    // The resolved `{ kind, objectId, origin }`: automatic when RESOLVED, or the
    // Wanderer's choice when AMBIGUOUS, re-checked against the current
    // candidates on every read.
    resolvedEncounterSelection() {
        if (!this.selectionOutcome) {
            return null;
        }
        if (this.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED) {
            return this.selectionOutcome.resolvedSelection;
        }
        if (this.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS && this.resolvedSelectionChoice) {
            const choice = this.resolvedSelectionChoice;
            const stillOffered = this.selectionOutcome.candidates.some((candidate) => (
                candidate.kind === choice.kind && candidate.objectId === choice.objectId && candidate.origin === choice.origin
            ));
            return stillOffered ? choice : null;
        }
        return null;
    },
    // `{ kind: 'PUBLICATION', objectId: publicationId, origin }` for the
    // selected observer-local encounter, with `origin` from
    // materializedSnapshotWorldOrigin() (application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js).
    // Never routed through the registry's candidate search, which would report
    // UNAVAILABLE. Null without a selection or when the pair fails validation.
    observerLocalEncounterResolvedSelection() {
        if (!this.selectedObserverLocalEncounter) {
            return null;
        }
        const origin = materializedSnapshotWorldOrigin(
            this.selectedObserverLocalEncounter.contentHash,
            this.selectedObserverLocalEncounter.publicationId
        );
        if (!origin) {
            return null;
        }
        return Object.freeze({
            kind: 'PUBLICATION',
            objectId: this.selectedObserverLocalEncounter.publicationId,
            origin
        });
    },
    // The one gate for Open/Fork/Explore: the resolved Publication from
    // `observerLocalEncounterInspection.loading.material`, only after an
    // AVAILABLE load of a real Publication and a VERIFIED signature (the same
    // condition admitToRepositoryDiscovery() uses; this getter never calls it).
    // Null while loading or when unavailable, unverifiable or rejected, and
    // never a bare publicationId, which lacks the documentId a route needs.
    observerLocalEncounterActionablePublication() {
        if (!this.observerLocalEncounterInspection) {
            return null;
        }
        const { loading, verification } = this.observerLocalEncounterInspection;
        if (!loading || loading.status !== 'AVAILABLE' || !(loading.material instanceof Publication)) {
            return null;
        }
        if (!verification || verification.status !== 'VERIFIED') {
            return null;
        }
        return loading.material;
    },
    // The publicationId commentary uses for the observer-local selection.
    // Independent of material inspection: a core/ObserverLocalPublicationEncounter.js
    // already carries a complete publicationId, which is all the commentary
    // commands need (like PublicationCard.js's `this.publication.id`).
    observerLocalEncounterCommentaryPublicationId() {
        return this.selectedObserverLocalEncounter ? this.selectedObserverLocalEncounter.publicationId : null;
    },
    // Which source family (LOCAL, PEER or SNAPSHOT) backs the selection, joined
    // from the inspection and resolved selection (see
    // application/worldEncounter/WorldEncounterPresentation.js). Null when nothing is
    // inspectable.
    selectedEncounterPresentation() {
        return describeWorldEncounterPresentation({
            inspection: this.selectedEncounterInspection,
            resolvedSelection: this.resolvedEncounterSelection
        });
    },
    // Friendly label for the source family; 'Unresolved' when there is no
    // single resolved source yet.
    selectedEncounterPresentationSourceLabel() {
        const sourceFamily = this.selectedEncounterPresentation ? this.selectedEncounterPresentation.sourceFamily : null;
        if (sourceFamily === 'LOCAL') return 'Local';
        if (sourceFamily === 'PEER') return 'Peer';
        if (sourceFamily === 'SNAPSHOT') return 'Snapshot';
        return 'Unresolved';
    },
    // Snapshot detail for a resolved, SNAPSHOT-sourced PUBLICATION selection
    // (see application/snapshot/WorldSnapshotInspection.js); a publisher's claimed
    // position and the Snapshot's locator/storage don't reach this boundary.
    selectedEncounterSnapshotInspection() {
        return describeWorldSnapshotInspection({
            presentation: this.selectedEncounterPresentation,
            resolvedSelection: this.resolvedEncounterSelection
        });
    },
    // The resolved decentralized lead, if any, forwarded to
    // inspectWorldEncounterMaterial(). Mirrors resolvedEncounterSelection.
    resolvedLead() {
        if (!this.decentralizedLeadOutcome) {
            return null;
        }
        if (this.decentralizedLeadOutcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.RESOLVED) {
            return this.decentralizedLeadOutcome.resolvedLead;
        }
        if (this.decentralizedLeadOutcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.AMBIGUOUS && this.resolvedLeadChoice) {
            const choice = this.resolvedLeadChoice;
            const stillOffered = this.decentralizedLeadOutcome.candidates.some((candidate) => (
                candidate.origin === choice.origin && candidate.discoveryTag === choice.discoveryTag && candidate.uri === choice.uri
            ));
            return stillOffered ? choice : null;
        }
        return null;
    },
    // The publicationId commentary uses for the primary selection: the
    // encounter's own objectId, only while it is a live PUBLICATION encounter.
    // Never waits on material loading or verification.
    encounterCommentaryPublicationId() {
        if (!this.selectedEncounter || !this.selectedEncounterInspection || this.selectedEncounterInspection.kind !== 'PUBLICATION') {
            return null;
        }
        return this.selectedEncounter.objectId;
    }
};
