import { resolveSavedProviderDefault } from '../../../application/settings/SavedProviderDefaultChoice.js';
import { PublicationDistributionState } from '../../../application/publication/distribution/PublicationDistributionLifecycle.js';
import { describePublicationMaterialProvenanceFromInspection } from '../../../application/publication/distribution/PublicationMaterialProvenance.js';

// WorldEncounterCanvas computed properties: the distribution storage choice,
// material and discovery state, the distributable publication, provenance,
// and whether a discovered publication can be selected.
// Spread into the component's `computed`, so `this` is the component instance.
export const distributionComputed = {
    // The one Arweave/IPFS/Remote-Pinning choice both distribution actions use,
    // mirroring OwnPublicationPanel.js's `distributionStorage`. With Snapshot
    // distribution available it is limited to `snapshotDistributionStorageTypes`
    // plus 'remote-pinning'; otherwise all three, defaulting to 'ar'. The saved
    // Content preference wins when eligible.
    selectedDistributionStorage: {
        get() {
            const eligible = this.snapshotDistributionCommand
                ? [...this.snapshotDistributionStorageTypes, 'remote-pinning']
                : ['ar', 'ipfs', 'remote-pinning'];
            return this.selectedDistributionStorageChoice
                || resolveSavedProviderDefault(this.defaultContentDistributionProvider, eligible, null)
                || (this.snapshotDistributionCommand ? this.snapshotDistributionStorageTypes[0] : null)
                || 'ar';
        },
        set(value) {
            this.selectedDistributionStorageChoice = value;
        }
    },
    // ABSENT until the lifecycle says otherwise; no new vocabulary.
    distributionMaterialState() {
        return this.distributionLifecycle ? this.distributionLifecycle.material.state : PublicationDistributionState.ABSENT;
    },
    // Material and discovery state stay independent, never one verdict.
    distributionDiscoveryState() {
        return this.distributionLifecycle ? this.distributionLifecycle.discovery.state : PublicationDistributionState.ABSENT;
    },
    // One entry per Announcement/Discovery substrate actually used, from
    // `getDiscoveryObservations()` when the store has it. Reads
    // `distributionLifecycle` only so it re-evaluates on the existing
    // subscription notification after each distribution result.
    discoveryObservations() {
        if (!this.distributionLifecycle || !this.selectedEncounter || !this.distributionLifecycleStore
            || typeof this.distributionLifecycleStore.getDiscoveryObservations !== 'function') {
            return [];
        }
        return this.distributionLifecycleStore.getDiscoveryObservations(this.selectedEncounter.objectId);
    },
    // The loaded Publication for the current selection, only when material
    // inspection loaded one AVAILABLE; never a guess or a second load.
    distributablePublication() {
        if (!this.selectedEncounter || this.selectedEncounter.kind !== 'PUBLICATION') {
            return null;
        }
        if (!this.materialInspection || !this.materialInspection.loading) {
            return null;
        }
        // A literal rather than an imported enum; see the note at the top of the
        // file.
        if (this.materialInspection.loading.status !== 'AVAILABLE') {
            return null;
        }
        return this.materialInspection.loading.material || null;
    },
    // The Material panel's "Source" fact, derived from `materialInspection`; null
    // without material.
    materialProvenance() {
        return describePublicationMaterialProvenanceFromInspection(this.materialInspection);
    },
    // Only a VERIFIED discovery result is selectable.
    isDiscoveredPublicationSelectable() {
        return !!(
            this.discoveryResult &&
            this.discoveryResult.inspection &&
            this.discoveryResult.inspection.verification.status === 'VERIFIED'
        );
    }
};
