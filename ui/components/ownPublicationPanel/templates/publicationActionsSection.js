// Own Publication panel template: place, unpublish and distribute actions, Snapshot export,
// and the Publication's own Snapshot discovery and attribution results.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const publicationActionsSectionTemplate = `<!--
                Retracts the Publication from the catalog only; never a placement, the
                Document or distributed material.
            -->
            <button
                v-if="unpublishCommand"
                type="button"
                class="action-btn own-publication-unpublish-action"
                :disabled="!publication"
                @click="unpublishOwnPublication"
            >Unpublish</button>

            <!-- Opens WorldDistributionDialog, which holds every storage/substrate choice. -->
            <button
                v-if="snapshotDistributionCommand || publicationDistributionCommand"
                type="button"
                class="action-btn own-publication-distribution-trigger-action"
                :disabled="!publication"
                @click="distributionDialogOpen = true"
            >Distribute</button>

            <!-- The link friends can open on any device, once the Signed Claim is on Steem. -->
            <PublicationShareLink v-if="publication" :publication-id="publication.id" :title="publication.title" />

            <WorldDistributionDialog
                v-if="distributionDialogOpen"
                :can-distribute-publication="Boolean(publicationDistributionCommand)"
                :can-distribute-snapshot="Boolean(snapshotDistributionCommand)"
                :has-subject="Boolean(publication)"
                :publication-id="publication ? publication.id : null"
                :publication-title="publication ? publication.title : null"
                :distribution-executing="publicationDistributionExecuting"
                :distribution-error="publicationDistributionError"
                :distribution-result="publicationDistributionResult"
                v-model:storage="distributionStorage"
                v-model:discovery-provider="distributionDiscoveryProvider"
                :remote-pinning-draft="remotePinningDraft"
                :snapshot-distribution-storage-types="snapshotDistributionStorageTypes"
                :snapshot-distribution-executing="snapshotDistributionExecuting"
                :snapshot-distribution-error="snapshotDistributionError"
                :snapshot-distribution-result="snapshotDistributionResult"
                @close="distributionDialogOpen = false"
                @distribute-both="distributeOwnPublicationAndSnapshot"
                @distribute-publication="distributeOwnPublication"
                @distribute-snapshot="distributeOwnSnapshot"
            />

            <!-- Shows the exported package's identity facts only. Deliberately no file save, download, or copy-to-clipboard. -->
            <button
                v-if="exportSnapshotCommand"
                type="button"
                class="action-btn own-publication-export-action"
                :disabled="!publication || snapshotExportExecuting"
                @click="exportOwnSnapshot"
            >{{ snapshotExportExecuting ? 'Exporting…' : 'Export Snapshot' }}</button>

            <p v-if="snapshotExportError" class="own-publication-export-error">{{ snapshotExportError }}</p>
            <dl v-else-if="snapshotExportResult" class="own-publication-export-detail">
                <dt>Publication</dt>
                <dd>{{ snapshotExportResult.publicationId }}</dd>
                <dt>Content hash</dt>
                <dd>{{ snapshotExportResult.contentHash }}</dd>
            </dl>

            <!-- Checks whether this Publication's own contentHash resolves. -->
            <button
                v-if="discoverSnapshotCommand"
                type="button"
                class="action-btn own-publication-discovery-action"
                :disabled="!publication || !publication.contentReference || snapshotDiscoveryExecuting"
                @click="discoverOwnSnapshot"
            >{{ snapshotDiscoveryExecuting ? 'Checking…' : 'Check Snapshot Match' }}</button>

            <p v-if="snapshotDiscoveryError" class="own-publication-discovery-error">{{ snapshotDiscoveryError }}</p>
            <dl v-else-if="snapshotDiscoveryResult" class="own-publication-discovery-detail">
                <dt>Outcome</dt>
                <dd>{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}</dd>
                <template v-if="snapshotDiscoveryResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ snapshotDiscoveryResult.reason }}</dd>
                </template>
                <template v-if="snapshotDiscoveryResult.locator">
                    <dt>Locator</dt>
                    <dd>{{ snapshotDiscoveryResult.locator }}</dd>
                </template>
            </dl>

            <!-- "Confirmed to match" means two hashes correspond, never authorship or trust. -->
            <dl v-if="snapshotAttributionResult" class="own-publication-attribution-detail">
                <dt>Snapshot Attribution</dt>
                <dd>{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}</dd>
            </dl>`;
