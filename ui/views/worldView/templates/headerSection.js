// World view template: the title, byline, status and context lines, and the active document's
// actions. The Own Publication panel lives in ./publicationSection.js, lower in the panel.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const headerSectionTemplate = `<h2>{{ title }}</h2>
                <p v-if="author" class="world-view-byline">{{ t('worldLocationBrowser.by', { author }) }}</p>
                <p
                    v-if="activeDocumentInfo"
                    :class="['world-view-status', { 'world-view-status--published': activeDocumentInfo.status === 'published' }]"
                >
                    <span v-if="activeDocumentInfo.status === 'published'">{{ t('worldView.published') }}</span>
                    <span v-else-if="activeDocumentInfo.parentDocumentId">
                        {{ t('worldView.editingFork') }}<template v-if="parentTitle(activeDocumentInfo.parentDocumentId)"> {{ t('worldView.forkedFrom', { title: parentTitle(activeDocumentInfo.parentDocumentId) }) }}</template>
                    </span>
                    <span v-else>✎ {{ displayText(activeDocumentInfo.statusLabel) }}</span>
                </p>
                <!--
                    Camera focus and the active document are tracked separately (docs/
                    Principles.md, "Camera Focus, Active Document, and Selection Are Three
                    Different Things").
                -->
                <p class="world-view-context">
                    {{ t('worldView.cameraAndEditing', { camera: focusedDocumentTitle || t('worldView.world2'), editing: activeDocumentInfo ? title : t('worldView.none') }) }}
                </p>
                <div v-if="activeDocumentInfo && activeDocumentInfo.editable" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activeDocumentInfo.dirty"
                        @click="saveActiveDocument"
                    >{{ t('worldView.save') }}</button>
                    <button class="action-btn action-btn--primary" @click="publishActiveDocument">{{ t('worldView.publish') }}</button>
                    <button class="action-btn" @click="openMetadataEditor(activeDocumentInfo)">{{ t('worldView.editMetadata') }}</button>
                    <button
                        class="action-btn"
                        :disabled="!canUndo"
                        :title="undoLabel ? displayText(undoLabel) : t('worldView.nothingToUndo')"
                        @click="undoAction"
                    >{{ t('worldView.undo') }}</button>
                    <button
                        class="action-btn"
                        :disabled="!canRedo"
                        :title="redoLabel ? displayText(redoLabel) : t('worldView.nothingToRedo')"
                        @click="redoAction"
                    >{{ t('worldView.redo') }}</button>
                    <button
                        class="action-btn"
                        :title="t('worldView.inspectPreviewAndRestoreThis')"
                        @click="openHistoryPanel"
                    >{{ t('worldView.history') }}</button>
                </div>`;
