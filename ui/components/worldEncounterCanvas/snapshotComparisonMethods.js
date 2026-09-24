import { describeWorldEncounterSelectionOutcomeFromRegistry } from '../../../application/WorldEncounterSelectionOutcome.js';
import { inspectWorldEncounterMaterial } from '../../../application/WorldEncounterMaterialInspection.js';
import { resolvedEncounterSelectionsEqual } from './selectionOutcomeMethods.js';

// WorldEncounterCanvas methods: snapshot content views and comparison selection.
// Spread into the component's `methods`, so `this` is the component instance.
export const snapshotComparisonMethods = {
    // Only opens when a real Content View exists for the current selection, so
    // it can never show material that wasn't loaded. Never loads anything.
    openSnapshotContentView() {
        if (!this.selectedSnapshotContentView) {
            return;
        }
        this.snapshotContentViewOpen = true;
    },
    closeSnapshotContentView() {
        this.snapshotContentViewOpen = false;
    },
    // Only opens when a real content comparison exists for the current pair.
    openContentComparisonView() {
        if (!this.worldSnapshotContentComparisonView) {
            return;
        }
        this.contentComparisonViewOpen = true;
    },
    closeContentComparisonView() {
        this.contentComparisonViewOpen = false;
    },
    // Only arms when the primary selection is a real comparison candidate.
    // selectEncounter()'s armed branch and selectComparisonEncounter() disarm
    // it.
    armComparisonSelection() {
        if (!this.selectedPublicationComparisonCandidate) {
            return;
        }
        this.armedForComparisonSelection = true;
    },
    // The only writer of `comparisonEncounter`: stores `{ kind, objectId }`
    // verbatim, reached only through selectEncounter()'s armed branch.
    selectComparisonEncounter(encounter) {
        this.armedForComparisonSelection = false;
        this.comparisonEncounter = encounter;
        // A new pairing never reopens a panel that described the old one.
        this.contentComparisonViewOpen = false;
        this.refreshComparisonSelectionOutcome();
    },
    // The only writer of `comparisonSelectionOutcome`, mirroring
    // refreshSelectionOutcome() for the comparison target, including reloading
    // its material only on a genuine change.
    refreshComparisonSelectionOutcome() {
        const previousComparisonResolvedSelection = this.comparisonResolvedSelection;

        if (!this.comparisonEncounter || !this.registry) {
            this.comparisonSelectionOutcome = null;
        } else {
            this.comparisonSelectionOutcome = describeWorldEncounterSelectionOutcomeFromRegistry({
                selectedEncounter: this.comparisonEncounter,
                registry: this.registry
            });
        }
        // A genuine change clears `comparisonMaterialInspection` first, so the old
        // target's material never shows under the new identity.
        if (!resolvedEncounterSelectionsEqual(previousComparisonResolvedSelection, this.comparisonResolvedSelection)) {
            this.comparisonMaterialInspection = null;
            this.refreshComparisonMaterialInspection();
        }
    },
    // Like refreshMaterialInspection() for the comparison target, but never
    // with a lead. Clears to null without a resolved target or
    // `materialSources`. Resolutions are offered to
    // admitToRepositoryDiscovery() with the same VERIFIED gate.
    refreshComparisonMaterialInspection() {
        this.comparisonMaterialInspectionRequestId += 1;
        const requestId = this.comparisonMaterialInspectionRequestId;
        const resolvedSelection = this.comparisonResolvedSelection;

        if (!resolvedSelection || !this.materialSources) {
            this.comparisonMaterialInspection = null;
            return;
        }

        inspectWorldEncounterMaterial({
            resolvedSelection,
            resolvedLead: null,
            materialSources: this.materialSources,
            verifier: this.materialVerifier
        }).then((result) => {
            this.admitToRepositoryDiscovery(result.loading, result.verification);
            // Discard a superseded response.
            if (requestId === this.comparisonMaterialInspectionRequestId) {
                this.comparisonMaterialInspection = result;
            }
        });
    },
    // The Wanderer's explicit reset: clears the comparison target, its outcome
    // and material inspection (invalidating in-flight requests), disarms, and
    // closes the Content Comparison panel. Never called automatically.
    clearComparisonSelection() {
        this.armedForComparisonSelection = false;
        this.comparisonEncounter = null;
        this.comparisonSelectionOutcome = null;
        this.comparisonMaterialInspection = null;
        this.comparisonMaterialInspectionRequestId += 1;
        this.contentComparisonViewOpen = false;
    },
};
