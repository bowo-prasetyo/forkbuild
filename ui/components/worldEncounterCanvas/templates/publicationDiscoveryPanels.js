// World Encounter canvas template: snapshot discovery for the selected publication and the
// publication discovery popup.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const publicationDiscoveryPanelsTemplate = `<!--
                Snapshot discovery/attribution: separate from Snapshot Distribution
                because they are different questions about the same Publication. Only
                with a discoverSnapshotCommand.
            -->
            <div v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && discoverSnapshotCommand" class="world-encounter-snapshot-discovery-panel">
                <h4 class="world-encounter-snapshot-discovery-title">Snapshot Discovery</h4>

                <!-- Disabled with nothing to discover or while a call is in flight. -->
                <button
                    type="button"
                    class="action-btn world-encounter-snapshot-discovery-action"
                    :disabled="!distributablePublication || snapshotDiscoveryExecuting"
                    @click="discoverSelectedSnapshot"
                >{{ snapshotDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshot' }}</button>

                <!--
                    Outcome rendered through SnapshotOutcomeInspectionView.js's label, not the
                    raw string.
                -->
                <p v-if="snapshotDiscoveryError" class="world-encounter-snapshot-discovery-error">{{ snapshotDiscoveryError }}</p>
                <dl v-else-if="snapshotDiscoveryResult" class="world-encounter-snapshot-discovery-detail">
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

                <!--
                    Attribution result, separate from discovery (see
                    application/snapshot/SnapshotPublicationAttribution.js). Rendered as "Confirmed to
                    match this Publication" rather than a bare "match": the identical wording
                    and narrow meaning (a content-hash correspondence, not authorship or
                    trust) as the Material/Verification panel (see docs/Principles.md).
                -->
                <dl v-if="snapshotAttributionResult" class="world-encounter-snapshot-attribution-detail">
                    <dt>Snapshot Attribution</dt>
                    <dd>{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}</dd>
                </dl>
            </div>

            <!-- Popup trigger, gated on discoveryCommand like the panel inside. -->
            <button
                v-if="discoveryCommand"
                type="button"
                class="action-btn world-encounter-publication-discovery-trigger"
                @click="publicationDiscoveryOpen = true"
            >Publication Discovery</button>

            <div
                v-if="publicationDiscoveryOpen"
                class="modal-overlay world-encounter-publication-discovery-overlay"
                @click.self="publicationDiscoveryOpen = false"
            >
                <div class="modal-panel world-encounter-publication-discovery-modal">
                    <h3>Publication Discovery</h3>

                    <!--
                        Independent of selectedEncounter: a discovered Publication is never a marker. Uses
                        the same Material/Verification classes as the selection panel.
                    -->
                    <div v-if="discoveryCommand" class="world-encounter-discovery-panel">
                        <h4 class="world-encounter-discovery-title">Discover Publication</h4>
                        <input v-model="discoveryObjectId" placeholder="Publication id" :disabled="discovering" />
                        <input v-model="discoveryTag" placeholder="Discovery tag" :disabled="discovering" />
                        <button
                            type="button"
                            class="action-btn world-encounter-discovery-action"
                            :disabled="discovering"
                            @click="discoverPublication"
                        >{{ discovering ? 'Discovering…' : 'Discover Publication' }}</button>

                        <p v-if="discoveryError" class="world-encounter-discovery-error">{{ discoveryError }}</p>
                        <template v-else-if="discoveryResult">
                            <!--
                                resolution.status (UNAVAILABLE/RESOLVED/AMBIGUOUS) stays raw: plain
                                technical tokens in their own existing vocabulary, with no humanizer to
                                route through.
                            -->
                            <dl class="world-encounter-discovery-detail">
                                <dt>Discovery</dt>
                                <dd>{{ discoveryResult.resolution.status }}</dd>
                            </dl>

                            <!--
                                Same status label methods as the selection panel, so this panel can never
                                state a stronger verification claim for the same fact.
                            -->
                            <template v-if="discoveryResult.inspection">
                                <h4 class="world-encounter-material-title">Material</h4>
                                <dl class="world-encounter-material-detail">
                                    <dt>Status</dt>
                                    <dd>{{ describeMaterialLoadStatusLabel(discoveryResult.inspection.loading.status) }}</dd>
                                </dl>

                                <!--
                                    Provenance computed by
                                    application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js
                                    and rendered verbatim.
                                -->
                                <dl v-if="discoveryResult.provenance" class="world-encounter-provenance-detail">
                                    <dt>Source</dt>
                                    <dd>{{ discoveryResult.provenance.origin }}</dd>
                                </dl>

                                <h4 class="world-encounter-verification-title">Verification</h4>
                                <dl class="world-encounter-verification-detail">
                                    <dt>Status</dt>
                                    <dd>{{ describeMaterialVerificationStatusLabel(discoveryResult.inspection.verification.status) }}</dd>
                                </dl>

                                <!-- Shown only when isDiscoveredPublicationSelectable. -->
                                <button
                                    v-if="isDiscoveredPublicationSelectable"
                                    type="button"
                                    class="action-btn world-encounter-discovery-selection-action"
                                    @click="selectDiscoveredPublication"
                                >Select Publication</button>
                            </template>
                        </template>
                    </div>

                    <!--
                        Shown for as long as a selection exists, whatever the panel above now
                        shows.
                    -->
                    <div v-if="selectedDiscoveredPublication" class="world-encounter-discovered-selection-panel">
                        <p class="world-encounter-discovered-selection-notice">Selected discovered publication.</p>
                    </div>

                    <button
                        type="button"
                        class="action-btn world-encounter-publication-discovery-close"
                        @click="publicationDiscoveryOpen = false"
                    >Close</button>
                </div>
            </div>`;
