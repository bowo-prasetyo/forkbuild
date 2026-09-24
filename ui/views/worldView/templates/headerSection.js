// World view template: the title, context line, document and placement actions, and the
// Own Publication panel.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const headerSectionTemplate = `<h2>{{ title }}</h2>
                <p
                    v-if="activeDocumentInfo"
                    :class="['world-view-status', { 'world-view-status--published': activeDocumentInfo.status === 'published' }]"
                >
                    <span v-if="activeDocumentInfo.status === 'published'">🔒 Published</span>
                    <span v-else-if="activeDocumentInfo.parentDocumentId">
                        ✎ Editing fork<template v-if="parentTitle(activeDocumentInfo.parentDocumentId)"> — forked from {{ parentTitle(activeDocumentInfo.parentDocumentId) }}</template>
                    </span>
                    <span v-else>✎ {{ activeDocumentInfo.statusLabel }}</span>
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
                </div>
                <div v-if="activePlacementInfo" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activePlacementInfo.movable"
                        @click="openPlacementEditor(activePlacementInfo)"
                    >Move Placement</button>
                </div>
                <p v-if="author">by {{ author }}</p>
                <!--
                    Mounted beside Save/Publish rather than inside World Encounters, so
                    distributing your own Snapshot never depends on primary mode, a peer or
                    Encounters. The commands are this view's thin wrappers, shared with
                    WorldEncounterCanvas where they overlap.
                -->
                <OwnPublicationPanel
                    v-if="cameraPosition"
                    :publication="ownPublication"
                    :unpublishCommand="unpublishOwnPublication"
                    :placePublicationCommand="placeOwnPublication"
                    :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                    :snapshotDistributionStorageTypes="snapshotDistributionStorageTypes"
                    :defaultContentDistributionProvider="defaultContentDistributionProvider"
                    :publicationDistributionCommand="distributeWorldEncounterPublication"
                    :defaultDiscoveryDistributionProvider="defaultAnnouncementDiscoveryProvider"
                    :discoverSnapshotCommand="discoverOwnSnapshot"
                    :exportSnapshotCommand="exportOwnSnapshot"
                    :discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"
                    :worldDiscoverySourceRegistry="worldDiscoverySourceRegistry"
                    :resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"
                    :materializeSelectedSnapshotCommand="materializeSelectedSnapshotCommand"
                    :placementInfo="activePlacementInfo"
                    :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                    :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                    :viewerIdentityId="myIdentityId"
                    :getPublicationPlacementsCommand="getPublicationPlacementsCommand"
                    :discoverSnapshotCandidatesWithOutcomeCommand="discoverSnapshotCandidatesWithOutcomeCommand"
                />`;
