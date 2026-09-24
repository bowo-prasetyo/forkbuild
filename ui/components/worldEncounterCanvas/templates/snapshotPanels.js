// World Encounter canvas template: the snapshot content, comparison and content-comparison panels.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const snapshotPanelsTemplate = `<!--
                Gated like "Remove Snapshot from World", so it only appears for a resolved
                Snapshot selection. A button while closed, the content while open.
            -->
            <div v-if="selectedEncounterSnapshotInspection" class="world-snapshot-content-view-panel">
                <h4 class="world-snapshot-content-view-title">Snapshot Content</h4>

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
                    >View Snapshot</button>
                </template>

                <template v-else>
                    <dl v-if="selectedSnapshotContentView" class="world-snapshot-content-view-detail">
                        <dt>Publication ID</dt>
                        <dd>{{ selectedSnapshotContentView.publicationId }}</dd>
                        <dt>Content Hash</dt>
                        <dd>{{ selectedSnapshotContentView.contentHash || 'Unknown' }}</dd>
                        <dt>Title</dt>
                        <dd>{{ selectedSnapshotContentView.material.title }}</dd>
                        <dt>Author</dt>
                        <dd>{{ selectedSnapshotContentView.material.author }}</dd>
                        <dt>Published</dt>
                        <dd>{{ selectedSnapshotContentView.material.publishedAt ? selectedSnapshotContentView.material.publishedAt.toLocaleDateString() : 'Unknown' }}</dd>
                        <template v-if="selectedSnapshotContentView.material.contentReference">
                            <dt>Content Reference</dt>
                            <dd>{{ selectedSnapshotContentView.material.contentReference.hash }}</dd>
                        </template>
                        <dt>Position</dt>
                        <dd>{{ selectedSnapshotContentView.position.x }}, {{ selectedSnapshotContentView.position.y }}, {{ selectedSnapshotContentView.position.z }}</dd>
                    </dl>
                    <!-- Material can stop being AVAILABLE while the panel is open. -->
                    <p v-else class="world-snapshot-content-view-unavailable">
                        This Snapshot's content is no longer available.
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-view-close"
                        @click="closeSnapshotContentView"
                    >Close</button>
                </template>
            </div>

            <div v-if="selectedPublicationComparisonCandidate" class="world-snapshot-comparison-panel">
                <h4 class="world-snapshot-comparison-title">Compare</h4>

                <template v-if="!comparisonEncounter">
                    <button
                        type="button"
                        class="world-snapshot-comparison-arm"
                        :disabled="armedForComparisonSelection"
                        @click="armComparisonSelection"
                    >Compare with…</button>
                    <p v-if="armedForComparisonSelection" class="world-snapshot-comparison-hint">
                        Click another Publication marker to compare.
                    </p>
                </template>

                <template v-else>
                    <dl class="world-snapshot-comparison-detail">
                        <dt>Publication A</dt>
                        <dd>{{ selectedPublicationComparisonCandidate.publicationId }}</dd>
                        <dt>Publication B</dt>
                        <dd>{{ comparisonPublicationComparisonCandidate ? comparisonPublicationComparisonCandidate.publicationId : comparisonEncounter.objectId }}</dd>
                        <dt>Result</dt>
                        <dd class="world-snapshot-comparison-result">
                            <template v-if="!worldSnapshotComparisonResult">This comparison is no longer available.</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'SAME_CONTENT'">Same content</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'DIFFERENT_CONTENT'">Different content</template>
                            <template v-else>Content identity not yet known</template>
                        </dd>
                    </dl>
                    <button
                        type="button"
                        class="world-snapshot-comparison-clear"
                        @click="clearComparisonSelection"
                    >Clear comparison</button>
                </template>
            </div>

            <!--
                Appears once a comparison target is chosen; its button separately needs
                worldSnapshotContentComparisonView.
            -->
            <div v-if="comparisonEncounter" class="world-snapshot-content-comparison-panel">
                <h4 class="world-snapshot-content-comparison-title">Content Comparison</h4>

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
                    >View Content Comparison</button>
                </template>

                <template v-else>
                    <template v-if="worldSnapshotContentComparisonView">
                        <dl class="world-snapshot-content-comparison-result">
                            <dt>Content</dt>
                            <dd>
                                <template v-if="worldSnapshotContentComparisonView.contentComparison === 'SAME_CONTENT'">Same content</template>
                                <template v-else-if="worldSnapshotContentComparisonView.contentComparison === 'DIFFERENT_CONTENT'">Different content</template>
                                <template v-else>Content identity not yet known</template>
                            </dd>
                        </dl>
                        <div class="world-snapshot-content-comparison-materials">
                            <div class="world-snapshot-content-comparison-material">
                                <h5>Snapshot A</h5>
                                <dl>
                                    <dt>Publication ID</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.publicationId }}</dd>
                                    <dt>Title</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.title }}</dd>
                                    <dt>Author</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.author }}</dd>
                                    <dt>Position</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.position.x }}, {{ worldSnapshotContentComparisonView.aMaterial.position.y }}, {{ worldSnapshotContentComparisonView.aMaterial.position.z }}</dd>
                                </dl>
                            </div>
                            <div class="world-snapshot-content-comparison-material">
                                <h5>Snapshot B</h5>
                                <dl>
                                    <dt>Publication ID</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.publicationId }}</dd>
                                    <dt>Title</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.title }}</dd>
                                    <dt>Author</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.author }}</dd>
                                    <dt>Position</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.position.x }}, {{ worldSnapshotContentComparisonView.bMaterial.position.y }}, {{ worldSnapshotContentComparisonView.bMaterial.position.z }}</dd>
                                </dl>
                            </div>
                        </div>
                    </template>
                    <!-- Either side's material can stop being AVAILABLE while the panel is open. -->
                    <p v-else class="world-snapshot-content-comparison-unavailable">
                        This content comparison is no longer available.
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-close"
                        @click="closeContentComparisonView"
                    >Close</button>
                </template>
            </div>`;
