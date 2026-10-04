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
                >{{ t('ownPublicationPanel.distribute') }}</button>
            </template>

            <!-- The less frequent actions, one click away; still on the primary screen. -->
            <button
                v-if="hasMoreActions"
                type="button"
                class="action-btn own-publication-more-trigger"
                :aria-expanded="moreActionsOpen ? 'true' : 'false'"
                @click="moreActionsOpen = !moreActionsOpen"
            >{{ t('ownPublicationPanel.more') }} {{ moreActionsOpen ? '▴' : '▾' }}</button>

            <div v-if="moreActionsOpen" class="own-publication-more-actions">
                <!-- Shows the exported package's identity facts only. Deliberately no file save, download, or copy-to-clipboard. -->
                <button
                    v-if="exportSnapshotCommand"
                    type="button"
                    class="action-btn own-publication-export-action"
                    :disabled="!publication || snapshotExportExecuting"
                    @click="exportOwnSnapshot"
                >{{ snapshotExportExecuting ? t('ownPublicationPanel.exporting') : t('ownPublicationPanel.exportSnapshot') }}</button>

                <!-- Checks whether this Publication's own contentHash resolves. -->
                <button
                    v-if="discoverSnapshotCommand"
                    type="button"
                    class="action-btn own-publication-discovery-action"
                    :disabled="!publication || !publication.contentReference || snapshotDiscoveryExecuting"
                    @click="discoverOwnSnapshot"
                >{{ snapshotDiscoveryExecuting ? t('ownPublicationPanel.checking') : t('ownPublicationPanel.checkSnapshotMatch') }}</button>

                <!-- Opens the manual diagnostic pipeline's popup (./diagnosticToolsSection.js). -->
                <button
                    v-if="discoverSnapshotCandidatesCommand || resolveSelectedSnapshotCommand || materializeSelectedSnapshotCommand"
                    type="button"
                    class="action-btn own-publication-diagnostic-trigger"
                    @click="diagnosticToolsOpen = true"
                >{{ t('ownPublicationPanel.diagnosticTools') }}</button>

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
                    >{{ t('ownPublicationPanel.unpublish') }}</button>
                    <div v-else class="own-publication-unpublish-confirm" role="alertdialog" :aria-label="t('ownPublicationPanel.confirmUnpublish')">
                        <p class="own-publication-unpublish-confirm-text">
                            {{ t('ownPublicationPanel.removeThisWorldFromThe') }}
                        </p>
                        <button
                            type="button"
                            class="action-btn own-publication-unpublish-action"
                            :disabled="!publication"
                            @click="unpublishConfirming = false; unpublishOwnPublication()"
                        >{{ t('ownPublicationPanel.unpublish2') }}</button>
                        <button
                            type="button"
                            class="action-btn own-publication-unpublish-cancel-action"
                            @click="unpublishConfirming = false"
                        >{{ t('ownPublicationPanel.cancel') }}</button>
                    </div>
                </template>
            </div>

            <!-- The link friends can open on any device, once the Signed Claim is on Steem or Blurt. -->
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
                <dt>{{ t('ownPublicationPanel.publication') }}</dt>
                <dd>{{ snapshotExportResult.publicationId }}</dd>
                <dt>{{ t('ownPublicationPanel.contentHash') }}</dt>
                <dd>{{ snapshotExportResult.contentHash }}</dd>
            </dl>

            <p v-if="snapshotDiscoveryError" class="own-publication-discovery-error">{{ snapshotDiscoveryError }}</p>
            <dl v-else-if="snapshotDiscoveryResult" class="own-publication-discovery-detail">
                <dt>{{ t('ownPublicationPanel.outcome') }}</dt>
                <dd>{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}</dd>
                <template v-if="snapshotDiscoveryResult.reason">
                    <dt>{{ t('ownPublicationPanel.reason') }}</dt>
                    <dd>{{ snapshotDiscoveryResult.reason }}</dd>
                </template>
                <template v-if="snapshotDiscoveryResult.locator">
                    <dt>{{ t('ownPublicationPanel.locator') }}</dt>
                    <dd>{{ snapshotDiscoveryResult.locator }}</dd>
                </template>
            </dl>

            <!-- "Confirmed to match" means two hashes correspond, never authorship or trust. -->
            <dl v-if="snapshotAttributionResult" class="own-publication-attribution-detail">
                <dt>{{ t('ownPublicationPanel.snapshotAttribution') }}</dt>
                <dd>{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}</dd>
            </dl>`;
