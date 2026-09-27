// Own Publication panel template: Distribute, the More menu (Snapshot export and match check,
// Diagnostic Tools, Unpublish with a confirmation), the share link, and the results of those actions.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const publicationActionsSectionTemplate = `<!-- Distribute acts as the publisher: offered on the viewer's own Publication only. -->
            <template v-if="isOwnPublication">
                <!-- Opens WorldDistributionDialog, which holds every storage/substrate choice. -->
                <button
                    v-if="snapshotDistributionCommand || publicationDistributionCommand"
                    type="button"
                    class="action-btn own-publication-distribution-trigger-action"
                    :disabled="!publication"
                    @click="distributionDialogOpen = true"
                >Distribute</button>
            </template>

            <!-- The less frequent actions, one click away; still on the primary screen. -->
            <button
                v-if="hasMoreActions"
                type="button"
                class="action-btn own-publication-more-trigger"
                :aria-expanded="moreActionsOpen ? 'true' : 'false'"
                @click="moreActionsOpen = !moreActionsOpen"
            >More {{ moreActionsOpen ? '▴' : '▾' }}</button>

            <div v-if="moreActionsOpen" class="own-publication-more-actions">
                <!-- Shows the exported package's identity facts only. Deliberately no file save, download, or copy-to-clipboard. -->
                <button
                    v-if="exportSnapshotCommand"
                    type="button"
                    class="action-btn own-publication-export-action"
                    :disabled="!publication || snapshotExportExecuting"
                    @click="exportOwnSnapshot"
                >{{ snapshotExportExecuting ? 'Exporting…' : 'Export Snapshot' }}</button>

                <!-- Checks whether this Publication's own contentHash resolves. -->
                <button
                    v-if="discoverSnapshotCommand"
                    type="button"
                    class="action-btn own-publication-discovery-action"
                    :disabled="!publication || !publication.contentReference || snapshotDiscoveryExecuting"
                    @click="discoverOwnSnapshot"
                >{{ snapshotDiscoveryExecuting ? 'Checking…' : 'Check Snapshot Match' }}</button>

                <!-- Opens the manual diagnostic pipeline's popup (./diagnosticToolsSection.js). -->
                <button
                    v-if="discoverSnapshotCandidatesCommand || resolveSelectedSnapshotCommand || materializeSelectedSnapshotCommand"
                    type="button"
                    class="action-btn own-publication-diagnostic-trigger"
                    @click="diagnosticToolsOpen = true"
                >Diagnostic Tools</button>

                <!--
                    Retracts the Publication from the catalog only; never a placement, the
                    Document or distributed material. Acts as the publisher, so it is offered on
                    the viewer's own Publication only, and asks once before acting.
                -->
                <template v-if="isOwnPublication && unpublishCommand">
                    <button
                        v-if="!unpublishConfirming"
                        type="button"
                        class="action-btn own-publication-unpublish-request-action"
                        :disabled="!publication"
                        @click="unpublishConfirming = true"
                    >Unpublish…</button>
                    <div v-else class="own-publication-unpublish-confirm" role="alertdialog" aria-label="Confirm unpublish">
                        <p class="own-publication-unpublish-confirm-text">
                            Remove this World from the catalog? Its placements, the Document and any
                            distributed copies stay.
                        </p>
                        <button
                            type="button"
                            class="action-btn own-publication-unpublish-action"
                            :disabled="!publication"
                            @click="unpublishConfirming = false; unpublishOwnPublication()"
                        >Unpublish</button>
                        <button
                            type="button"
                            class="action-btn own-publication-unpublish-cancel-action"
                            @click="unpublishConfirming = false"
                        >Cancel</button>
                    </div>
                </template>
            </div>

            <!-- The link friends can open on any device, once the Signed Claim is on Steem. -->
            <PublicationShareLink v-if="publication" :publication-id="publication.id" :title="publication.title" />

            <WorldDistributionDialog
                v-if="distributionDialogOpen && isOwnPublication"
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

            <!-- Results stay here, outside the More menu, so closing it never hides one. -->
            <p v-if="snapshotExportError" class="own-publication-export-error">{{ snapshotExportError }}</p>
            <dl v-else-if="snapshotExportResult" class="own-publication-export-detail">
                <dt>Publication</dt>
                <dd>{{ snapshotExportResult.publicationId }}</dd>
                <dt>Content hash</dt>
                <dd>{{ snapshotExportResult.contentHash }}</dd>
            </dl>

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
