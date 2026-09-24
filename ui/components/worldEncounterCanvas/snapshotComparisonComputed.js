import { describeWorldEncounterInspection } from '../../../application/worldEncounter/WorldEncounterInspection.js';
import { WorldEncounterSelectionOutcomeStatus } from '../../../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import { describeWorldEncounterPresentation } from '../../../application/worldEncounter/WorldEncounterPresentation.js';
import { describeWorldSnapshotInspection } from '../../../application/snapshot/WorldSnapshotInspection.js';
import { describeWorldEncounterComparisonCandidate } from '../../../application/worldEncounter/WorldEncounterComparisonCandidate.js';
import { compareSnapshotWorldPublications } from '../../../application/snapshot/WorldSnapshotComparison.js';
import { describeWorldSnapshotContentView } from '../../../application/snapshot/materialization/WorldSnapshotContentView.js';
import { describeWorldSnapshotContentComparisonView } from '../../../application/snapshot/materialization/WorldSnapshotContentComparisonView.js';

// WorldEncounterCanvas computed properties: the comparison encounter, its
// candidates, and the snapshot content and content-comparison views.
// Spread into the component's `computed`, so `this` is the component instance.
export const snapshotComparisonComputed = {
    // Like resolvedEncounterSelection for the comparison target, but an
    // AMBIGUOUS comparison target never resolves (deliberately excluded: no
    // second "Choose Source" panel for it).
    comparisonResolvedSelection() {
        if (!this.comparisonSelectionOutcome) {
            return null;
        }
        if (this.comparisonSelectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED) {
            return this.comparisonSelectionOutcome.resolvedSelection;
        }
        return null;
    },
    comparisonEncounterInspection() {
        return describeWorldEncounterInspection({ selectedEncounter: this.comparisonEncounter, view: this.effectiveView });
    },
    comparisonEncounterPresentation() {
        return describeWorldEncounterPresentation({
            inspection: this.comparisonEncounterInspection,
            resolvedSelection: this.comparisonResolvedSelection
        });
    },
    // "Publication A": the primary selection's comparison candidate (see
    // application/worldEncounter/WorldEncounterComparisonCandidate.js); null unless it is a
    // resolved PUBLICATION.
    selectedPublicationComparisonCandidate() {
        return describeWorldEncounterComparisonCandidate({
            presentation: this.selectedEncounterPresentation,
            resolvedSelection: this.resolvedEncounterSelection
        });
    },
    // "Publication B": the comparison target's candidate.
    comparisonPublicationComparisonCandidate() {
        return describeWorldEncounterComparisonCandidate({
            presentation: this.comparisonEncounterPresentation,
            resolvedSelection: this.comparisonResolvedSelection
        });
    },
    // compareSnapshotWorldPublications() over both candidates, recomputed on
    // every read; null until a comparison target is explicitly chosen.
    worldSnapshotComparisonResult() {
        if (!this.comparisonEncounter) {
            return null;
        }
        return compareSnapshotWorldPublications(
            this.selectedPublicationComparisonCandidate,
            this.comparisonPublicationComparisonCandidate
        );
    },
    // Content View for a Snapshot-sourced selection whose material is AVAILABLE
    // (see application/snapshot/materialization/WorldSnapshotContentView.js), recomputed on every read.
    selectedSnapshotContentView() {
        return describeWorldSnapshotContentView({
            inspection: this.selectedEncounterSnapshotInspection,
            materialInspection: this.materialInspection
        });
    },
    comparisonEncounterSnapshotInspection() {
        return describeWorldSnapshotInspection({
            presentation: this.comparisonEncounterPresentation,
            resolvedSelection: this.comparisonResolvedSelection
        });
    },
    // The comparison target's Content View, under the same conditions.
    comparisonSnapshotContentView() {
        return describeWorldSnapshotContentView({
            inspection: this.comparisonEncounterSnapshotInspection,
            materialInspection: this.comparisonMaterialInspection
        });
    },
    // Side-by-side view data from the comparison fact and both Content Views
    // (see application/snapshot/materialization/WorldSnapshotContentComparisonView.js), recomputed on
    // every read.
    worldSnapshotContentComparisonView() {
        return describeWorldSnapshotContentComparisonView({
            comparisonResult: this.worldSnapshotComparisonResult,
            contentViewA: this.selectedSnapshotContentView,
            contentViewB: this.comparisonSnapshotContentView
        });
    }
};
