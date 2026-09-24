import { inspectWorldEncounterMaterial } from '../../../application/WorldEncounterMaterialInspection.js';
import { sanitizeDistributionErrorMessage } from '../../../application/DistributionErrorMessageSanitizer.js';
import { Publication } from '../../../publisher/Publication.js';
import { resolveSnapshotPublicationAttribution } from '../../../application/SnapshotPublicationAttribution.js';
import { unregisterMaterializedSnapshotWorldSource } from '../../../application/MaterializedSnapshotWorldDiscoveryBridge.js';

// WorldEncounterCanvas methods: material inspection, repository admission and distribution.
// Spread into the component's `methods`, so `this` is the component instance.
export const materialAndDistributionMethods = {
    // The only caller of `.add()` on the discovery provider, mirroring
    // ui/views/DecentralizedPublicationsView.js's admitToRepositoryDiscovery().
    // Admits only an AVAILABLE load whose material is a real
    // `publisher/Publication.js` instance (so never an avatar or a decentralized
    // envelope, which is never hydrated: no `Publication.fromJSON()`) AND whose
    // verification is VERIFIED. AVAILABLE alone only means retrieval succeeded
    // (see application/DecentralizedWorldEncounterMaterialSource.js); VERIFIED
    // means the composed WorldEncounterMaterialIdentityVerifier and
    // WorldEncounterMaterialSignatureVerifier both confirmed it, matching the
    // sibling's `view.resolved` gate. REJECTED and UNVERIFIABLE are excluded (see
    // docs/Principles.md, "Known Evidence Is Not Verified Evidence, And Verified
    // Evidence Is Not Authority").
    //
    // Without a provider this is a no-op: admission is additive to World rendering, never a
    // precondition for it. Called on every resolution from all three inspection
    // paths, outside their stale-response guards. Repeated resolutions call
    // `.add()` again, as DecentralizedPublicationsView.js does;
    // discovery/DecentralizedPublicationDiscoveryProvider.js keeps no id index.
    //
    // The same check gates the durable `publicationAdmissionLog`. Either sink
    // works without the other, and each has its own try/catch.
    admitToRepositoryDiscovery(loading, verification) {
        const eligible = loading
            && loading.status === 'AVAILABLE'
            && loading.material instanceof Publication
            && verification
            && verification.status === 'VERIFIED';
        if (!eligible) {
            return;
        }
        if (this.decentralizedPublicationDiscoveryProvider) {
            try {
                this.decentralizedPublicationDiscoveryProvider.add(loading.material);
            } catch {
                // An admission failure must never turn a successful resolution into a failed
                // one: this runs before the caller writes its inspection, so an uncaught
                // throw would skip that write.
            }
        }
        if (this.publicationAdmissionLog) {
            try {
                this.publicationAdmissionLog.add(loading.material);
            } catch {
                // Same isolation for the durable log.
            }
        }
    },
    // The only writer of `materialInspection` and the only caller of
    // inspectWorldEncounterMaterial() for the primary selection. Clears to null
    // without a resolved selection or `materialSources`. Forwards `resolvedLead`
    // when there is one. Every resolution is also offered to
    // admitToRepositoryDiscovery(); rendering is unaffected either way.
    refreshMaterialInspection() {
        this.materialInspectionRequestId += 1;
        const requestId = this.materialInspectionRequestId;
        const resolvedSelection = this.resolvedEncounterSelection;

        if (!resolvedSelection || !this.materialSources) {
            this.materialInspection = null;
            return;
        }

        inspectWorldEncounterMaterial({
            resolvedSelection,
            resolvedLead: this.resolvedLead,
            materialSources: this.materialSources,
            verifier: this.materialVerifier
        }).then((result) => {
            this.admitToRepositoryDiscovery(result.loading, result.verification);
            // Discard a superseded response.
            if (requestId === this.materialInspectionRequestId) {
                this.materialInspection = result;
            }
        });
    },
    // The only writer of `distributionLifecycle` and the only reader/subscriber
    // of `distributionLifecycleStore`. Observes only; never builds a lifecycle or
    // executes a distribution. Unsubscribes the previous selection first. Clears
    // to null unless a PUBLICATION is selected and a store was supplied.
    refreshDistributionLifecycle() {
        this.stopSubscription('unsubscribeDistributionLifecycle');

        if (!this.selectedEncounter || this.selectedEncounter.kind !== 'PUBLICATION' || !this.distributionLifecycleStore) {
            this.distributionLifecycle = null;
            return;
        }

        const publicationId = this.selectedEncounter.objectId;
        this.distributionLifecycle = this.distributionLifecycleStore.get(publicationId);
        this.unsubscribeDistributionLifecycle = this.distributionLifecycleStore.subscribe(publicationId, (_publicationId, lifecycle) => {
            this.distributionLifecycle = lifecycle;
        });
    },
    // The shared "call the stored unsubscribe, then clear the field" idiom for
    // the three subscriptions (two mount-scoped, one per selection). `fieldName`
    // names a `data()` field holding an unsubscribe function or null.
    stopSubscription(fieldName) {
        if (typeof this[fieldName] === 'function') {
            this[fieldName]();
        }
        this[fieldName] = null;
    },
    // The only caller of `distributionCommand`. No-op without a publication or
    // command, or while a call is in flight. Passes `selectedDiscoveryProvider`
    // as given. `Promise.resolve().then(...)` turns a
    // synchronous throw into the same plain notice as a rejection. The resolved
    // value is never inspected; results arrive through the lifecycle
    // subscription.
    distributeSelectedPublication() {
        const publication = this.distributablePublication;
        if (!publication || !this.distributionCommand || this.distributionExecuting) {
            return;
        }

        this.distributionExecuting = true;
        this.distributionError = null;
        this.distributionRequestId += 1;
        const requestId = this.distributionRequestId;

        return Promise.resolve()
            .then(() => this.distributionCommand(
                publication,
                this.selectedDiscoveryProvider,
                this.selectedDistributionStorage,
                this.selectedDistributionStorage === 'remote-pinning' ? this.remotePinningDraft : undefined
            ))
            .catch((error) => {
                if (requestId === this.distributionRequestId) {
                    console.error('Publication distribution failed:', error);
                    this.distributionError = sanitizeDistributionErrorMessage(error)
                        || 'Distribution could not be completed.';
                }
            })
            .then(() => {
                if (requestId === this.distributionRequestId) {
                    this.distributionExecuting = false;
                }
            });
    },
    // The only caller of `snapshotDistributionCommand`; like
    // distributeSelectedPublication(), but the resolved result is stored.
    distributeSelectedSnapshot() {
        const publication = this.distributablePublication;
        if (!publication || !this.snapshotDistributionCommand || this.snapshotDistributionExecuting) {
            return;
        }

        this.snapshotDistributionExecuting = true;
        this.snapshotDistributionError = null;
        this.snapshotDistributionRequestId += 1;
        const requestId = this.snapshotDistributionRequestId;

        const storage = this.selectedDistributionStorage;
        const remotePinningConfiguration = storage === 'remote-pinning' ? {
            endpoint: this.remotePinningDraft.endpoint,
            credential: this.remotePinningDraft.credential || null,
            requestField: this.remotePinningDraft.requestField || null,
            responseField: this.remotePinningDraft.responseField || null
        } : undefined;

        return Promise.resolve()
            .then(() => this.snapshotDistributionCommand(publication, storage, remotePinningConfiguration, this.selectedDiscoveryProvider))
            .then((result) => {
                if (requestId === this.snapshotDistributionRequestId) {
                    this.snapshotDistributionResult = result;
                }
            })
            .catch((error) => {
                if (requestId === this.snapshotDistributionRequestId) {
                    console.error('Snapshot distribution failed:', error);
                    this.snapshotDistributionError = sanitizeDistributionErrorMessage(error)
                        || 'Snapshot distribution could not be completed.';
                }
            })
            .then(() => {
                if (requestId === this.snapshotDistributionRequestId) {
                    this.snapshotDistributionExecuting = false;
                }
            });
    },
    // UX-level convenience only: fires the two already-independent
    // actions above from one click. Each keeps its own protocol, its
    // own executing/error/result state, and its own outcome display —
    // this never introduces a combined result or an aggregate status,
    // and a failure in one never stops or hides the other. Run
    // SEQUENTIALLY, never concurrently: both legs can end up signing
    // through the SAME injected browser extension (e.g. a NIP-07
    // provider used for both Nostr announcements), and firing two
    // signing requests at once is a real-world extension failure mode
    // (no popup ever shown, no response ever received) rather than a
    // race either leg's own code can detect or recover from — see
    // arweave/ArweaveInjectedProviderSigner.js's/nostr/
    // NostrInjectedProviderPublisher.js's own "MV3 background service
    // worker recycled mid-request" note.
    distributeSelectedPublicationAndSnapshot() {
        return Promise.resolve(this.distributeSelectedPublication())
            .then(() => this.distributeSelectedSnapshot());
    },
    // The only caller of `discoverSnapshotCommand`; a resolved result is turned
    // into an attribution with resolveSnapshotPublicationAttribution() under
    // the same request guard.
    discoverSelectedSnapshot() {
        const publication = this.distributablePublication;
        if (!publication || !this.discoverSnapshotCommand || this.snapshotDiscoveryExecuting) {
            return;
        }

        this.snapshotDiscoveryExecuting = true;
        this.snapshotDiscoveryError = null;
        this.snapshotDiscoveryRequestId += 1;
        const requestId = this.snapshotDiscoveryRequestId;

        Promise.resolve()
            .then(() => this.discoverSnapshotCommand(publication))
            .then((result) => {
                if (requestId === this.snapshotDiscoveryRequestId) {
                    this.snapshotDiscoveryResult = result;
                    this.snapshotAttributionResult = resolveSnapshotPublicationAttribution(publication, result);
                }
            })
            .catch((error) => {
                if (requestId === this.snapshotDiscoveryRequestId) {
                    console.error('Snapshot discovery failed:', error);
                    this.snapshotDiscoveryError = sanitizeDistributionErrorMessage(error)
                        || 'Snapshot discovery could not be completed.';
                }
            })
            .then(() => {
                if (requestId === this.snapshotDiscoveryRequestId) {
                    this.snapshotDiscoveryExecuting = false;
                }
            });
    },
    // Removes the selected Snapshot's World source via
    // unregisterMaterializedSnapshotWorldSource(), the explicit undo of
    // registerMaterializedSnapshotWorldSource(). Reads contentHash/publicationId
    // from `selectedEncounterSnapshotInspection`, so it only applies to a
    // resolved SNAPSHOT selection, and requires a `registry`. Nothing else is
    // deleted or fetched; downstream state re-derives from the registry
    // notification.
    unregisterSelectedSnapshot() {
        const inspection = this.selectedEncounterSnapshotInspection;
        if (!inspection || !this.registry) {
            return;
        }
        unregisterMaterializedSnapshotWorldSource(this.registry, inspection.contentHash, inspection.publicationId);
    },
};
