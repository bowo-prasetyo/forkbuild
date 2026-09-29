// World Encounter canvas template: the snapshot content, comparison and content-comparison panels.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const snapshotPanelsTemplate = `<!--
                Gated like "Remove Snapshot from World", so it only appears for a resolved
                Snapshot selection. A button while closed, the content while open.
            -->
            <div v-if="selectedEncounterSnapshotInspection" class="world-snapshot-content-view-panel">
                <h4 class="world-snapshot-content-view-title">{{ t('worldEncounterCanvas.snapshotContent') }}</h4>

                <template v-if="!snapshotContentViewOpen">
                    <!--
                        Only enabled when selectedSnapshotContentView exists. Opens the view
                        only; never discovers, resolves or mutates the registry.
                    -->
                    <button
                        type="button"
                        class="world-snapshot-content-view-action"
                        :disabled="!selectedSnapshotContentView"
                        @click="openSnapshotContentView"
                    >{{ t('worldEncounterCanvas.viewSnapshot') }}</button>
                </template>

                <template v-else>
                    <dl v-if="selectedSnapshotContentView" class="world-snapshot-content-view-detail">
                        <dt>{{ t('worldEncounterCanvas.publicationId2') }}</dt>
                        <dd>{{ selectedSnapshotContentView.publicationId }}</dd>
                        <dt>{{ t('worldEncounterCanvas.contentHash') }}</dt>
                        <dd>{{ selectedSnapshotContentView.contentHash || t('worldEncounterCanvas.unknown') }}</dd>
                        <dt>{{ t('worldEncounterCanvas.title') }}</dt>
                        <dd>{{ selectedSnapshotContentView.material.title }}</dd>
                        <dt>{{ t('worldEncounterCanvas.author') }}</dt>
                        <dd>{{ selectedSnapshotContentView.material.author }}</dd>
                        <dt>{{ t('worldEncounterCanvas.published') }}</dt>
                        <dd>{{ selectedSnapshotContentView.material.publishedAt ? formatDate(selectedSnapshotContentView.material.publishedAt) : t('worldEncounterCanvas.unknown') }}</dd>
                        <template v-if="selectedSnapshotContentView.material.contentReference">
                            <dt>{{ t('worldEncounterCanvas.contentReference') }}</dt>
                            <dd>{{ selectedSnapshotContentView.material.contentReference.hash }}</dd>
                        </template>
                        <dt>{{ t('worldEncounterCanvas.position') }}</dt>
                        <dd>{{ selectedSnapshotContentView.position.x }}, {{ selectedSnapshotContentView.position.y }}, {{ selectedSnapshotContentView.position.z }}</dd>
                    </dl>
                    <!-- Material can stop being AVAILABLE while the panel is open. -->
                    <p v-else class="world-snapshot-content-view-unavailable">
                        {{ t('worldEncounterCanvas.thisSnapshotSContentIs') }}
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-view-close"
                        @click="closeSnapshotContentView"
                    >{{ t('worldEncounterCanvas.close') }}</button>
                </template>
            </div>

            <div v-if="selectedPublicationComparisonCandidate" class="world-snapshot-comparison-panel">
                <h4 class="world-snapshot-comparison-title">{{ t('worldEncounterCanvas.compare') }}</h4>

                <template v-if="!comparisonEncounter">
                    <button
                        type="button"
                        class="world-snapshot-comparison-arm"
                        :disabled="armedForComparisonSelection"
                        @click="armComparisonSelection"
                    >{{ t('worldEncounterCanvas.compareWith') }}</button>
                    <p v-if="armedForComparisonSelection" class="world-snapshot-comparison-hint">
                        {{ t('worldEncounterCanvas.clickAnotherPublicationMarkerTo') }}
                    </p>
                </template>

                <template v-else>
                    <dl class="world-snapshot-comparison-detail">
                        <dt>{{ t('worldEncounterCanvas.publicationA') }}</dt>
                        <dd>{{ selectedPublicationComparisonCandidate.publicationId }}</dd>
                        <dt>{{ t('worldEncounterCanvas.publicationB') }}</dt>
                        <dd>{{ comparisonPublicationComparisonCandidate ? comparisonPublicationComparisonCandidate.publicationId : comparisonEncounter.objectId }}</dd>
                        <dt>{{ t('worldEncounterCanvas.result') }}</dt>
                        <dd class="world-snapshot-comparison-result">
                            <template v-if="!worldSnapshotComparisonResult">{{ t('worldEncounterCanvas.thisComparisonIsNoLonger') }}</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'SAME_CONTENT'">{{ t('worldEncounterCanvas.sameContent') }}</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'DIFFERENT_CONTENT'">{{ t('worldEncounterCanvas.differentContent') }}</template>
                            <template v-else>{{ t('worldEncounterCanvas.contentIdentityNotYetKnown') }}</template>
                        </dd>
                    </dl>
                    <button
                        type="button"
                        class="world-snapshot-comparison-clear"
                        @click="clearComparisonSelection"
                    >{{ t('worldEncounterCanvas.clearComparison') }}</button>
                </template>
            </div>

            <!--
                Appears once a comparison target is chosen; its button separately needs
                worldSnapshotContentComparisonView.
            -->
            <div v-if="comparisonEncounter" class="world-snapshot-content-comparison-panel">
                <h4 class="world-snapshot-content-comparison-title">{{ t('worldEncounterCanvas.contentComparison') }}</h4>

                <template v-if="!contentComparisonViewOpen">
                    <!--
                        Only enabled when both sides' material is AVAILABLE. Never mutates the
                        registry.
                    -->
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-action"
                        :disabled="!worldSnapshotContentComparisonView"
                        @click="openContentComparisonView"
                    >{{ t('worldEncounterCanvas.viewContentComparison') }}</button>
                </template>

                <template v-else>
                    <template v-if="worldSnapshotContentComparisonView">
                        <dl class="world-snapshot-content-comparison-result">
                            <dt>{{ t('worldEncounterCanvas.content') }}</dt>
                            <dd>
                                <template v-if="worldSnapshotContentComparisonView.contentComparison === 'SAME_CONTENT'">{{ t('worldEncounterCanvas.sameContent') }}</template>
                                <template v-else-if="worldSnapshotContentComparisonView.contentComparison === 'DIFFERENT_CONTENT'">{{ t('worldEncounterCanvas.differentContent') }}</template>
                                <template v-else>{{ t('worldEncounterCanvas.contentIdentityNotYetKnown') }}</template>
                            </dd>
                        </dl>
                        <div class="world-snapshot-content-comparison-materials">
                            <div class="world-snapshot-content-comparison-material">
                                <h5>{{ t('worldEncounterCanvas.snapshotA') }}</h5>
                                <dl>
                                    <dt>{{ t('worldEncounterCanvas.publicationId2') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.publicationId }}</dd>
                                    <dt>{{ t('worldEncounterCanvas.title') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.title }}</dd>
                                    <dt>{{ t('worldEncounterCanvas.author') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.author }}</dd>
                                    <dt>{{ t('worldEncounterCanvas.position') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.position.x }}, {{ worldSnapshotContentComparisonView.aMaterial.position.y }}, {{ worldSnapshotContentComparisonView.aMaterial.position.z }}</dd>
                                </dl>
                            </div>
                            <div class="world-snapshot-content-comparison-material">
                                <h5>{{ t('worldEncounterCanvas.snapshotB') }}</h5>
                                <dl>
                                    <dt>{{ t('worldEncounterCanvas.publicationId2') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.publicationId }}</dd>
                                    <dt>{{ t('worldEncounterCanvas.title') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.title }}</dd>
                                    <dt>{{ t('worldEncounterCanvas.author') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.author }}</dd>
                                    <dt>{{ t('worldEncounterCanvas.position') }}</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.position.x }}, {{ worldSnapshotContentComparisonView.bMaterial.position.y }}, {{ worldSnapshotContentComparisonView.bMaterial.position.z }}</dd>
                                </dl>
                            </div>
                        </div>
                    </template>
                    <!-- Either side's material can stop being AVAILABLE while the panel is open. -->
                    <p v-else class="world-snapshot-content-comparison-unavailable">
                        {{ t('worldEncounterCanvas.thisContentComparisonIsNo') }}
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-close"
                        @click="closeContentComparisonView"
                    >{{ t('worldEncounterCanvas.close') }}</button>
                </template>
            </div>`;
