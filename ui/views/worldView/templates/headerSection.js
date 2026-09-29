// World view template: the title, byline, status and context lines, and the active document's
// actions. The Own Publication panel lives in ./publicationSection.js, lower in the panel.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const headerSectionTemplate = `<h2>{{ title }}</h2>
                <p v-if="author" class="world-view-byline">by {{ author }}</p>
                <p
                    v-if="activeDocumentInfo"
                    :class="['world-view-status', { 'world-view-status--published': activeDocumentInfo.status === 'published' }]"
                >
                    <span v-if="activeDocumentInfo.status === 'published'">🔒 Published</span>
                    <span v-else-if="activeDocumentInfo.parentDocumentId">
                        ✎ Editing fork<template v-if="parentTitle(activeDocumentInfo.parentDocumentId)"> — forked from {{ parentTitle(activeDocumentInfo.parentDocumentId) }}</template>
                    </span>
                    <span v-else>✎ {{ displayText(activeDocumentInfo.statusLabel) }}</span>
                </p>
                <!--
                    Camera focus and the active document are tracked separately (docs/
                    Principles.md, "Camera Focus, Active Document, and Selection Are Three
                    Different Things").
                -->
                <p class="world-view-context">
                    Camera: {{ focusedDocumentTitle || 'World' }} · Editing: {{ activeDocumentInfo ? title : 'None' }}
                </p>
                <div v-if="activeDocumentInfo && activeDocumentInfo.editable" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activeDocumentInfo.dirty"
                        @click="saveActiveDocument"
                    >Save</button>
                    <button class="action-btn action-btn--primary" @click="publishActiveDocument">Publish</button>
                    <button class="action-btn" @click="openMetadataEditor(activeDocumentInfo)">Edit Metadata</button>
                    <button
                        class="action-btn"
                        :disabled="!canUndo"
                        :title="undoLabel || 'Nothing to undo'"
                        @click="undoAction"
                    >Undo</button>
                    <button
                        class="action-btn"
                        :disabled="!canRedo"
                        :title="redoLabel || 'Nothing to redo'"
                        @click="redoAction"
                    >Redo</button>
                    <button
                        class="action-btn"
                        title="Inspect, preview, and restore this document's command history"
                        @click="openHistoryPanel"
                    >History</button>
                </div>`;
