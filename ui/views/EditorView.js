import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../../application/editor/CreateStructureRegistryUseCase.js';
import { CreatePersonalStructureLibraryUseCase } from '../../application/editor/CreatePersonalStructureLibraryUseCase.js';
import { CreateLibraryUsageHistoryUseCase } from '../../application/editor/CreateLibraryUsageHistoryUseCase.js';
import { LoadFailureReason } from '../../application/document/LoadFailureReason.js';
import { CreateEditorContextUseCase } from '../../application/editor/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/editor/CreateToolRegistryUseCase.js';
import { CreateDocumentManagerUseCase } from '../../application/document/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/document/CreatePersistenceUseCase.js';
import { AutosaveScheduler } from '../../application/document/AutosaveScheduler.js';
import { RecoveryObserver } from '../../application/document/RecoveryObserver.js';
import { SelectionUseCase } from '../../application/editor/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/editor/PaletteUseCase.js';
import { PreviewUseCase } from '../../application/editor/PreviewUseCase.js';
import { StructurePreviewUseCase } from '../../application/editor/StructurePreviewUseCase.js';
import { CompositionPreviewUseCase } from '../../application/editor/CompositionPreviewUseCase.js';
import { CreateLibraryPreviewUseCase } from '../../application/editor/CreateLibraryPreviewUseCase.js';
import { EditorSession } from '../../application/editor/EditorSession.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import { EditorEvent } from '../../core/events/EditorEvent.js';
import { EditorActionRegistry, createStandardActions } from '../../application/editor/EditorActionRegistry.js';
import { EditorActionContext } from '../../application/editor/EditorActionContext.js';
import { InputRouter } from '../../application/editor/InputRouter.js';
import Toolbar from '../components/Toolbar.js';
import { saveFailureMessage, autosaveFailureMessage } from '../components/saveFailureMessages.js';
import { saveDocument } from '../components/saveDocument.js';
import BuildLibraryPanel from '../components/BuildLibraryPanel.js';
import EditingSidebar from '../components/EditingSidebar.js';
import StructureInstancePanel from '../components/StructureInstancePanel.js';
import CommandPalette from '../components/CommandPalette.js';
import KeyboardShortcutsOverlay from '../components/KeyboardShortcutsOverlay.js';
import ActionFeedback from '../components/ActionFeedback.js';
import RecoveryBanner from '../components/RecoveryBanner.js';
import TransformFeedback from '../components/TransformFeedback.js';
import EditorTouchActionBar from '../components/EditorTouchActionBar.js';
import { useMediaQuery, COMPACT_LAYOUT_QUERY, TOUCH_INPUT_QUERY } from '../composables/useMediaQuery.js';
import { CreatePublisherUseCase } from '../../application/publisher/CreatePublisherUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { CreateBlueprintAttributionUseCase } from '../../application/blueprint/CreateBlueprintAttributionUseCase.js';
import { CreateBlueprintLineageUseCase } from '../../application/blueprint/CreateBlueprintLineageUseCase.js';
import { CreateCommandRegistryUseCase } from '../../application/editor/CreateCommandRegistryUseCase.js';
import { DocumentCommandPropagationUseCase } from '../../application/document/DocumentCommandPropagationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../../application/document/DocumentOperationRecoveryUseCase.js';
import { CopySelectionUseCase } from '../../application/editor/CopySelectionUseCase.js';
import { RepeatSelectionUseCase } from '../../application/editor/RepeatSelectionUseCase.js';
import { PasteClipboardUseCase } from '../../application/editor/PasteClipboardUseCase.js';
import { UpdateDocumentMetadataUseCase } from '../../application/document/UpdateDocumentMetadataUseCase.js';
import { computeLifecycleStatus, describeLifecycleStatus } from '../../application/document/DocumentLifecycleStatus.js';
import DocumentInfoPanel from '../components/DocumentInfoPanel.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';
import CreateBlueprintDialog from '../components/CreateBlueprintDialog.js';
import StructureInfoPanel from '../components/StructureInfoPanel.js';
import ForkFailureDialog from '../components/ForkFailureDialog.js';
import EditorDistributionDialog from '../components/EditorDistributionDialog.js';
import { editorEntryContextFromQuery } from '../../core/EditorEntryContext.js';
import { usePostPublishDistribution } from './editorView/usePostPublishDistribution.js';
import { useSelectionActions } from './editorView/useSelectionActions.js';
import { useStructureLibrary } from './editorView/useStructureLibrary.js';
import { useBlueprintExchange } from './editorView/useBlueprintExchange.js';
import { ExportAllDocumentsUseCase, ImportDocumentBundleUseCase } from '../../application/document/DocumentBundle.js';
import { useStructureInspection } from './editorView/useStructureInspection.js';
import { useSoundControls } from '../composables/useSoundControls.js';
import SoundControl from '../components/SoundControl.js';
import { displayText, errorText, t } from '../i18n/i18n.js';

// Editing shortcuts come from EditorActionRegistry, shared with the palette,
// the sidebar and the controls docs. Escape priority: text input > shortcuts
// overlay > palette > gizmo gesture > marquee > selection. Tool switching
// (1/2), Ctrl+S and '?' stay view-local: they are not editing actions.

const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

const PLACING_TOOLS = new Set([ToolId.PLACE, ToolId.PLACE_STRUCTURE, ToolId.COMPOSE_STRUCTURE]);

export default {
    name: 'EditorView',
    components: { Toolbar, BuildLibraryPanel, EditingSidebar, StructureInstancePanel, CommandPalette, KeyboardShortcutsOverlay, ActionFeedback, RecoveryBanner, DocumentInfoPanel, MetadataEditorDialog, CreateBlueprintDialog, StructureInfoPanel, TransformFeedback, ForkFailureDialog, EditorDistributionDialog, EditorTouchActionBar, SoundControl },
    template: `
        <div class="editor-view">
            <Toolbar
                :document-manager="documentManager"
                :save-document-use-case="saveDocumentUseCase"
                :load-document-use-case="loadDocumentUseCase"
                :editor-session="editorSession"
                :publish-document-use-case="publishDocumentUseCase"
                :feedback="feedback"
                :entry-context="entryContext"
                :saved-documents-revision="savedDocumentsRevision"
                @back-to-world="backToWorld"
                @open-shortcuts="shortcutsOpen = true"
                @published="onDocumentPublished"
                @saved="onDocumentSaved"
                @export-document="exportDocument"
                @export-all-documents="exportAllDocuments"
                @import-document="importDocument"
            />
            <RecoveryBanner
                :status="recoveryStatus"
                @recover="recoverDocument"
                @discard="discardRecovery"
            />
            <!--
                Post-publish distribution action, shown only for the just-published
                Publication. Sits at the top so it is not hidden below the viewport.
            -->
            <div v-if="publishedPublication || distributionError || (distributionResult && distributionResult.length) || snapshotDistributionError || snapshotDistributionResult" class="editor-post-publish-overlay">
                <div v-if="publishedPublication" class="editor-post-publish-action">
                    <span class="editor-post-publish-message">{{ t('editor.published') }}</span>

                    <!-- Opens EditorDistributionDialog, which holds every storage/substrate choice. -->
                    <button
                        v-if="canDistributeSnapshot || canDistributePublication"
                        type="button"
                        class="action-btn action-btn--primary editor-post-publish-distribute-trigger"
                        @click="distributionDialogOpen = true"
                    >{{ t('editor.distribute') }}</button>
                    <button
                        type="button"
                        class="action-btn action-btn--secondary editor-post-publish-dismiss-btn"
                        @click="dismissPublishAction"
                    >{{ t('editor.dismiss') }}</button>
                </div>

                <EditorDistributionDialog
                    v-if="distributionDialogOpen"
                    :can-distribute-snapshot="canDistributeSnapshot"
                    :can-distribute-publication="canDistributePublication"
                    :snapshot-distribution-executing="snapshotDistributionExecuting"
                    :snapshot-distribution-error="snapshotDistributionError"
                    :snapshot-distribution-result="snapshotDistributionResult"
                    :distribution-executing="distributionExecuting"
                    :distribution-error="distributionError"
                    :distribution-result="distributionResult"
                    v-model:storage="selectedDistributionStorage"
                    v-model:discovery-provider="selectedDiscoveryProvider"
                    :remote-pinning-draft="remotePinningDraft"
                    :snapshot-distribution-storage-types="snapshotDistributionStorageTypes"
                    :document-id="publishedPublication ? publishedPublication.documentId : null"
                    :publication-id="publishedPublication ? publishedPublication.id : null"
                    :publication-title="publishedPublication ? publishedPublication.title : null"
                    @close="distributionDialogOpen = false"
                    @distribute-both="distributePublishedDocumentAndSnapshot"
                    @distribute-publication="distributePublishedDocument"
                    @distribute-snapshot="distributePublishedSnapshot"
                    @view-in-repository="viewDistributedPublicationInRepository"
                />
            </div>
            <div :class="['editor-body', { 'editor-body--sidebar-open': sidebarOpen }]">
                <div class="sidebar">
                  <div class="sidebar-scroll">
                    <div class="tool-switcher tool-switcher--editor" role="group" :aria-label="t('editor.tool')">
                        <button
                            :class="['tool-btn', { 'tool-btn--active': activeTool === ToolId.SELECT }]"
                            :aria-pressed="activeTool === ToolId.SELECT ? 'true' : 'false'"
                            @click="setTool(ToolId.SELECT)"
                        >
                            {{ t('editor.select') }}
                        </button>
                        <button
                            :class="['tool-btn', { 'tool-btn--active': PLACING_TOOLS.has(activeTool) }]"
                            :aria-pressed="PLACING_TOOLS.has(activeTool) ? 'true' : 'false'"
                            @click="setTool(ToolId.PLACE)"
                        >
                            {{ t('editor.place') }}
                        </button>
                    </div>
                    <template v-if="touchInput">
                        <p v-if="activeTool === ToolId.PLACE" class="placement-hint">
                            {{ t('editor.touchPlaceHint') }}
                        </p>
                        <p v-if="activeTool === ToolId.PLACE_STRUCTURE || activeTool === ToolId.COMPOSE_STRUCTURE" class="placement-hint">
                            {{ t('editor.touchPlacingHint', { title: activeTool === ToolId.PLACE_STRUCTURE ? activeStructureTitle : activeCompositionTitle }) }}
                        </p>
                    </template>
                    <template v-else>
                    <p v-if="activeTool === ToolId.PLACE" class="placement-hint">
                        {{ t('editor.placeHint') }}
                    </p>
                    <p v-if="activeTool === ToolId.PLACE_STRUCTURE" class="placement-hint">
                        {{ t('editor.placingHint', { title: activeStructureTitle }) }}
                    </p>
                    <p v-if="activeTool === ToolId.COMPOSE_STRUCTURE" class="placement-hint">
                        {{ t('editor.composingHint', { title: activeCompositionTitle }) }}
                    </p>
                    </template>
                    <DocumentInfoPanel compact :info="documentInfo" @edit-metadata="showMetadataEditor = true" />
                    <StructureInstancePanel
                        v-if="selectedPlacementInfo"
                        :info="selectedPlacementInfo"
                        @rotate="rotateSelectedPlacement"
                        @duplicate="duplicateSelectedPlacement"
                        @delete="deleteSelectedPlacement"
                        @edit-source="editSelectedPlacementSource"
                        @apply-transform="applySelectedPlacementTransform"
                    />
                    <EditingSidebar
                        :registry="actionRegistry"
                        :get-context="getActionContext"
                        :ui="actionUi"
                        :selection-count="selectionCount"
                        :is-structure-placement-selection="selectionIsStructurePlacement"
                        :selection-summary="selectionSummary"
                        :recolor="recolorSelection"
                        :apply-numeric="applyNumericTransform"
                        :align="alignSelection"
                        :distribute="distributeSelection"
                        :repeat="repeatSelection"
                        :select-group="selectGroup"
                    />
                    <BuildLibraryPanel
                        :palette-use-case="paletteUseCase"
                        :structure-groups="structureGroups"
                        :personal-structure-groups="personalStructureGroups"
                        :registry="brickRegistry"
                        :personal-saved-at-by-id="personalSavedAtById"
                        :recent-structures="recentStructures"
                        :preview-service="libraryPreviewService"
                        @place="setTool(ToolId.PLACE)"
                        @fork="forkStructure"
                        @place-structure="copyStructureIntoDocument"
                        @rename-personal-structure="renamePersonalStructure"
                        @remove-personal-structure="removePersonalStructure"
                        @export-personal-structure="exportStructure"
                        @import-blueprint="importBlueprint"
                        @export-all-personal-structures="exportAllStructures"
                        @inspect-structure="inspectStructure"
                        @fork-to-library="forkStructureToLibrary"
                    />
                  </div>
                </div>
                <div :style="{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }">
                    <div ref="viewport" class="viewport"></div>
                    <!-- Shown only on phone-width screens (css/main/touch-and-compact.css). -->
                    <button
                        type="button"
                        class="action-btn editor-sidebar-toggle"
                        :aria-expanded="sidebarOpen ? 'true' : 'false'"
                        @click="sidebarOpen = !sidebarOpen"
                    >{{ sidebarOpen ? t('editor.hideTools') : t('editor.tools') }}</button>
                    <EditorTouchActionBar
                        v-if="touchInput"
                        :registry="actionRegistry"
                        :get-context="getActionContext"
                        :multi-select="touchMultiSelect"
                        :box-select="touchBoxSelect"
                        :placing="PLACING_TOOLS.has(activeTool)"
                        @run="runTouchAction"
                        @rotate-placement="rotateTouchPlacement"
                        @toggle-multi-select="toggleTouchMultiSelect"
                        @toggle-box-select="toggleTouchBoxSelect"
                    />
                    <div
                        v-if="marqueeRect"
                        class="marquee-rect"
                        :style="{ left: marqueeRect.left + 'px', top: marqueeRect.top + 'px', width: marqueeRect.width + 'px', height: marqueeRect.height + 'px' }"
                    ></div>
                    <TransformFeedback :feedback="transformFeedback" />
                    <SoundControl
                        v-if="soundAvailable"
                        :muted="soundMuted"
                        :volume="soundVolume"
                        @toggle="toggleSound"
                        @volume="setSoundVolume"
                    />
                </div>
            </div>
            <CommandPalette
                v-if="paletteOpen"
                :registry="actionRegistry"
                :get-context="getActionContext"
                @close="closePalette"
            />
            <ActionFeedback :message="feedbackMessage" :visible="feedbackVisible" />
            <KeyboardShortcutsOverlay
                v-if="shortcutsOpen"
                :registry="actionRegistry"
                @close="shortcutsOpen = false"
            />
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="documentInfo"
                @save="onSaveMetadata"
                @cancel="showMetadataEditor = false"
            />
            <CreateBlueprintDialog
                v-if="showCreateBlueprintDialog"
                :preview="createBlueprintPreview"
                :preview-service="libraryPreviewService"
                @create="onCreateBlueprint"
                @cancel="closeCreateBlueprintDialog"
            />
            <ForkFailureDialog
                v-if="forkFailure"
                :reason="forkFailure.reason"
                @back="backFromForkFailure"
            />
            <StructureInfoPanel
                v-if="inspectedStructure"
                :structure="inspectedStructure"
                :registry="brickRegistry"
                :source="inspectedStructureSource"
                :attribution="inspectedStructureAttribution"
                :lineage="inspectedStructureLineage"
                :similarity-candidates="inspectedStructureSimilarityCandidates"
                @place="placeInspectedStructure"
                @export="exportInspectedStructure"
                @claim-authorship="claimAuthorship"
                @export-attribution="exportInspectedAttribution"
                @publish-attribution="publishInspectedAttributionToNetwork"
                :attribution-published="Boolean(publishedAttribution) && canDistributeAttribution"
                @distribute-attribution="attributionDistributionDialogOpen = true"
                @dismiss-distribute-attribution="dismissAttributionDistribution"
                @resign-attribution="resignInspectedAttribution"
                @claim-lineage="claimLineage"
                @export-lineage-claim="exportBlueprintLineageClaim"
                @close="closeStructureInspection"
            />
            <!-- After StructureInfoPanel, so it opens on top of it. Signed Claim only:
                 an attribution has no Snapshot. -->
            <EditorDistributionDialog
                v-if="attributionDistributionDialogOpen"
                :can-distribute-publication="canDistributeAttribution"
                :distribution-executing="attributionDistributionExecuting"
                :distribution-error="attributionDistributionError"
                :distribution-result="attributionDistributionResult"
                v-model:storage="selectedAttributionDistributionStorage"
                v-model:discovery-provider="selectedAttributionDiscoveryProvider"
                :remote-pinning-draft="attributionRemotePinningDraft"
                :publication-id="publishedAttribution ? publishedAttribution.id : null"
                @close="attributionDistributionDialogOpen = false"
                @distribute-publication="distributePublishedAttribution"
            />
        </div>
    `,
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);

        const registry = new CreateBrickRegistryUseCase().execute();
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const { personalStructureLibraryStore } = new CreatePersonalStructureLibraryUseCase().execute();
        const { libraryUsageHistoryStore } = new CreateLibraryUsageHistoryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
        const { libraryPreviewService } = new CreateLibraryPreviewUseCase().execute(registry);
        const toolRegistry = new CreateToolRegistryUseCase().execute();
        const documentManager = new CreateDocumentManagerUseCase().execute();
        const {
            storageProvider: documentStorage,
            saveDocumentUseCase, loadDocumentUseCase, forkDocumentUseCase, structureDocumentResolver,
            autosaveDocumentUseCase, recoverDocumentUseCase, discardRecoveryUseCase, checkRecoveryUseCase
        } = new CreatePersistenceUseCase().execute();
        // Bumped when documents are saved without opening one, so the
        // Toolbar's Recent list reads them again.
        const savedDocumentsRevision = ref(0);

        // Watches this view's documentManager; started and stopped with the view so an
        // unmounted Editor never autosaves.
        // A failed checkpoint (usually a full browser storage) is reported
        // once, not after every edit, until a save succeeds again.
        let autosaveFailureReported = false;
        const autosaveScheduler = new AutosaveScheduler(autosaveDocumentUseCase, documentManager, {
            onError: (error) => {
                console.error('Autosave: could not write a recovery checkpoint', error);
                if (!autosaveFailureReported) {
                    autosaveFailureReported = true;
                    feedback.show(autosaveFailureMessage(error), { durationMs: 10000 });
                }
            }
        });
        documentManager.onStateChanged((state) => {
            if (!state.dirty) autosaveFailureReported = false;
        });
        // Probes recovery once per open document (never per edit) and drives
        // RecoveryBanner.
        const recoveryStatus = ref(null);
        const recoveryObserver = new RecoveryObserver(checkRecoveryUseCase, documentManager, {
            onChange: (status) => { recoveryStatus.value = status; }
        });

        const identityUseCase = inject('identityUseCase');
        const identityProvider = identityUseCase.provider;
        const { publishDocumentUseCase } = new CreatePublisherUseCase().execute(identityProvider);
        // Fork/load lookups also search Repository-admitted decentralized publications.
        const decentralizedDiscoveryProviderForLookup = inject('decentralizedPublicationDiscoveryProvider', null);
        const { findPublicationUseCase } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: decentralizedDiscoveryProviderForLookup
        });
        const { blueprintAttributionUseCase, blueprintAttributionExchange } = new CreateBlueprintAttributionUseCase().execute(identityProvider);
        const { blueprintLineageUseCase, blueprintLineageExchange } = new CreateBlueprintLineageUseCase().execute(identityProvider);
        const publicationResolver = inject('publicationResolver');
        const publicationCatalog = inject('publicationCatalog');
        const publicationPeerExchange = inject('publicationPeerExchange');

        // Uses the app-wide peer stack. Without one, propagation is null and the
        // Editor stays purely local.
        const peerMessageBus = inject('peerMessageBus', null);
        const peerSessionManager = inject('peerSessionManager', null);
        const deviceAuthorizationUseCase = inject('deviceAuthorizationUseCase', null);
        const peerBlockUseCase = inject('peerBlockUseCase', null);
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const isBlocked = peerBlockUseCase
            ? (peerIdentityId) => peerBlockUseCase.isBlocked(peerIdentityId)
            : null;
        const documentCommandPropagation = (identityProvider && peerMessageBus && peerSessionManager && deviceAuthorizationUseCase)
            ? new DocumentCommandPropagationUseCase({
                peerMessageBus,
                connectedPeerRegistry: peerSessionManager.registry,
                deviceAuthorization: deviceAuthorizationUseCase,
                identityProvider,
                commandRegistry,
                // The Editor has one open document, so this only asks "is it the open one".
                resolveDocument: (documentId) => (
                    documentManager.document && documentManager.document.world.id === documentId
                        ? documentManager.document
                        : null
                ),
                isBlocked
            })
            : null;
        // Needs document propagation, whose trust chain it reuses. Without it, causal
        // gaps are still observed but never requested.
        const documentOperationRecovery = (documentCommandPropagation && identityProvider && peerMessageBus && peerSessionManager)
            ? new DocumentOperationRecoveryUseCase({
                peerMessageBus,
                connectedPeerRegistry: peerSessionManager.registry,
                documentCommandPropagation,
                identityProvider
            })
            : null;

        const copySelectionUseCase = new CopySelectionUseCase(registry);
        const pasteClipboardUseCase = new PasteClipboardUseCase();
        const repeatSelectionUseCase = new RepeatSelectionUseCase(registry);

        const editorSession = new EditorSession({
            registry,
            editorContext,
            toolRegistry,
            documentManager,
            selectionUseCase,
            previewUseCase,
            loadDocumentUseCase,
            identityProvider,
            copySelectionUseCase,
            pasteClipboardUseCase,
            repeatSelectionUseCase,
            structureResolver: structureDocumentResolver,
            structurePreviewUseCase,
            compositionPreviewUseCase,
            personalStructureLibraryStore,
            blueprintAttributionExchange,
            blueprintLineageExchange,
            documentCommandPropagation,
            documentOperationRecovery
        });

        const activeTool = ref(editorContext.tool.activeTool);
        const selectionCount = ref(0);
        const activeStructureTitle = ref(editorContext.activeStructure.title);
        const activeCompositionTitle = ref(
            editorContext.activeComposition.structure ? editorContext.activeComposition.structure.name : null
        );
        const selectionIsStructurePlacement = ref(false);
        const selectedPlacementInfo = ref(null);
        // Refreshed on selection change and after any pointer-up/key-down that may
        // have moved the same selection.
        const selectionSummary = ref(null);
        const shortcutsOpen = ref(false);
        let unsubTool = null;
        let unsubSelection = null;
        let unsubActiveStructure = null;
        let unsubActiveComposition = null;

        function setTool(toolId) {
            editorContext.setActiveTool(toolId);
        }

        function alignSelection(mode) {
            editorSession.alignSelection(mode);
        }

        function distributeSelection(axis) {
            editorSession.distributeSelection(axis);
        }

        function applyNumericTransform(intent, options) {
            editorSession.applyNumericTransform(intent, options);
        }

        // ------------------------- action surface ----------------

        const feedbackMessage = ref('');
        const feedbackVisible = ref(false);
        let feedbackTimer = null;
        // Failures that ask the user to act stay up longer than a routine
        // "Saved". `message` is text or a message descriptor (core/Message.js).
        const feedback = {
            show(message, { durationMs = 2500 } = {}) {
                feedbackMessage.value = displayText(message);
                feedbackVisible.value = true;
                if (feedbackTimer) {
                    clearTimeout(feedbackTimer);
                }
                feedbackTimer = setTimeout(() => {
                    feedbackVisible.value = false;
                }, durationMs);
            }
        };

        const {
            canDistributePublication, canDistributeSnapshot, dismissPublishAction, distributePublishedDocument,
            distributePublishedDocumentAndSnapshot, distributePublishedSnapshot, distributionDialogOpen,
            distributionError, distributionExecuting, distributionResult, onDocumentPublished, publishedPublication,
            remotePinningDraft, selectedDiscoveryProvider, selectedDistributionStorage, snapshotDistributionError,
            snapshotDistributionExecuting, snapshotDistributionResult, snapshotDistributionStorageTypes,
            viewDistributedPublicationInRepository
        } = usePostPublishDistribution({
            router
        });

        // A second, independent offer for an authorship claim published from the
        // structure panel; it never touches the World's own offer above.
        const attributionDistribution = usePostPublishDistribution({ router, includeSnapshot: false });
        const {
            canDistributePublication: canDistributeAttribution, dismissPublishAction: dismissAttributionDistribution,
            distributePublishedDocument: distributePublishedAttribution,
            distributionDialogOpen: attributionDistributionDialogOpen, distributionError: attributionDistributionError,
            distributionExecuting: attributionDistributionExecuting, distributionResult: attributionDistributionResult,
            publishedPublication: publishedAttribution, remotePinningDraft: attributionRemotePinningDraft,
            selectedDiscoveryProvider: selectedAttributionDiscoveryProvider,
            selectedDistributionStorage: selectedAttributionDistributionStorage
        } = attributionDistribution;

        const {
            closeCreateBlueprintDialog, copyStructureIntoDocument, createBlueprintPreview, forkStructure,
            forkStructureToLibrary, onCreateBlueprint, personalSavedAtById, personalStructureGroups, recentStructures,
            refreshPersonalStructureGroups, removePersonalStructure, renamePersonalStructure,
            showCreateBlueprintDialog, structureGroups
        } = useStructureLibrary({
            editorSession, feedback, libraryUsageHistoryStore, personalStructureLibraryStore, structureRegistry
        });

        const {
            exportAllDocuments, exportAllStructures, exportBlueprintAttribution, exportBlueprintLineageClaim, exportDocument,
            exportStructure, importBlueprint, importDocument
        } = useBlueprintExchange({
            blueprintAttributionExchange, blueprintAttributionUseCase, blueprintLineageExchange,
            blueprintLineageUseCase, documentManager, editorSession, feedback, refreshPersonalStructureGroups,
            personalStructureLibraryStore,
            exportAllDocumentsUseCase: new ExportAllDocumentsUseCase(documentStorage),
            importDocumentBundleUseCase: new ImportDocumentBundleUseCase(documentStorage),
            onSavedDocumentsChanged: () => { savedDocumentsRevision.value++; }
        });

        const {
            claimAuthorship, claimLineage, closeStructureInspection, exportInspectedAttribution, exportInspectedStructure, inspectStructure,
            inspectedStructure, inspectedStructureAttribution, inspectedStructureLineage,
            inspectedStructureSimilarityCandidates, inspectedStructureSource, placeInspectedStructure,
            publishInspectedAttributionToNetwork, resignInspectedAttribution
        } = useStructureInspection({
            attributionDistribution, blueprintAttributionUseCase, blueprintLineageUseCase, copyStructureIntoDocument,
            exportBlueprintAttribution, exportStructure, feedback, identityProvider, personalStructureLibraryStore,
            publicationCatalog, publicationPeerExchange, publicationResolver, structureRegistry
        });

        // ------------------------- document lifecycle ------------
        // The Editor's document is always editable (fork-on-edit is a World View
        // concern), so status only ever distinguishes Draft/Saved.

        const updateDocumentMetadataUseCase = new UpdateDocumentMetadataUseCase();
        const documentInfo = ref(null);
        const showMetadataEditor = ref(false);
        // Bumped on every document state change and read by getActionContext() so Vue
        // tracks it: otherwise the sidebar's groups and undo/redo would stay cached
        // when a group is created.
        const documentVersion = ref(0);
        let unsubDocumentState = null;

        // The EditorEntryContext a fork arrived with, kept for as long as that fork is
        // the open document (for "Back to World"). Cleared as soon as another document
        // opens; never persisted.
        const entryContext = ref(null);
        let arrivalDocumentId = null;

        // Set only when a fork fails: `{ reason, returnWorldId, focusLocationId }`.
        // Cleared when the dialog closes.
        const forkFailure = ref(null);

        const {
            applySelectedPlacementTransform, deleteSelectedPlacement, duplicateSelectedPlacement,
            editSelectedPlacementSource, recolorSelection, refreshSelectedPlacementInfo, refreshSelectionSummary,
            repeatSelection, rotateSelectedPlacement, selectGroup
        } = useSelectionActions({
            documentVersion, editorContext, editorSession, feedback, selectedPlacementInfo, selectionSummary
        });

        function refreshDocumentInfo() {
            documentVersion.value++;
            const document = documentManager.document;
            if (!document) {
                documentInfo.value = null;
                entryContext.value = null;
                arrivalDocumentId = null;
                return;
            }
            if (entryContext.value && document.world.id !== arrivalDocumentId) {
                entryContext.value = null;
                arrivalDocumentId = null;
            }
            const state = documentManager.state;
            const status = computeLifecycleStatus({ hasBeenSaved: !!state.lastSaved, isPublished: false });
            documentInfo.value = {
                title: document.metadata.title || 'Untitled',
                description: document.metadata.description || '',
                author: document.metadata.author,
                license: document.metadata.license,
                placementPolicy: document.metadata.placementPolicy,
                parentDocumentId: document.metadata.parentDocumentId,
                parentStructureId: document.metadata.parentStructureId,
                status,
                statusLabel: describeLifecycleStatus(status, { dirty: state.dirty }),
                dirty: state.dirty,
                editable: true,
                editabilityNotice: null
            };
        }

        // Opens the recovered checkpoint through openDocument() (keeping its world.id)
        // and marks it dirty: recovered content is not the saved state.
        function recoverDocument() {
            if (!recoveryStatus.value) {
                return;
            }
            const documentId = recoveryStatus.value.documentId;
            try {
                const { document: recovered } = recoverDocumentUseCase.execute(documentId);
                editorSession.openDocument(recovered);
                documentManager.markDirty();
                recoveryObserver.clear();
                feedback.show(t('editor.recovered'));
            } catch (e) {
                // A corrupt checkpoint never takes down the Editor or the open document.
                feedback.show(t('editor.recoveryFailed', { error: errorText(e) }));
            }
        }

        // Discards the checkpoint without touching the open document. Wrapped like
        // recoverDocument() so a failure never leaves a stale banner.
        function discardRecovery() {
            if (!recoveryStatus.value) {
                return;
            }
            const documentId = recoveryStatus.value.documentId;
            try {
                discardRecoveryUseCase.execute(documentId);
                recoveryObserver.clear();
                feedback.show(t('editor.discarded'));
            } catch (e) {
                feedback.show(t('editor.discardFailed', { error: errorText(e) }));
            }
        }

        // Returns via the entry context's return address. No-op for forks reached
        // another way.
        function backToWorld() {
            const context = entryContext.value;
            if (!context || !context.returnWorldId) {
                return;
            }
            router.push({
                path: `/world/${context.returnWorldId}`,
                query: context.focusLocationId ? { returnLocation: context.focusLocationId } : {}
            });
        }

        // The failure dialog's way out, via the same `/world/<id>` route.
        function backFromForkFailure() {
            const failure = forkFailure.value;
            forkFailure.value = null;
            if (!failure || !failure.returnWorldId) {
                return;
            }
            router.push({
                path: `/world/${failure.returnWorldId}`,
                query: failure.focusLocationId ? { returnLocation: failure.focusLocationId } : {}
            });
        }

        function onSaveMetadata({ title, description, license, placementPolicy }) {
            updateDocumentMetadataUseCase.execute(documentManager, { title, description, license, placementPolicy });
            showMetadataEditor.value = false;
            feedback.show(t('editor.propertiesUpdated'));
        }

        const paletteOpen = ref(false);
        const actionUi = {
            togglePalette() {
                paletteOpen.value = !paletteOpen.value;
            },
            // The registry cannot collect a name itself; null means Cancel.
            promptRenameGroup(currentName = '') {
                return prompt(t('editor.groupNamePrompt'), currentName || '');
            },
            focusNumeric: null,
            // Opens CreateBlueprintDialog with a preview Structure built from the current
            // selection; the dialog's 'create' handler does the rest.
            openCreateBlueprintDialog() {
                let preview = null;
                try {
                    preview = editorSession.createStructureFromSelection({ name: t('editor.untitledBlueprint'), category: 'uncategorized', description: '' });
                } catch (e) {
                    feedback.show(errorText(e));
                    return;
                }
                if (!preview) {
                    feedback.show(t('editor.nothingToCreate'));
                    return;
                }
                createBlueprintPreview.value = preview;
                showCreateBlueprintDialog.value = true;
            }
        };
        const actionRegistry = new EditorActionRegistry(
            createStandardActions({ session: editorSession, feedback, ui: actionUi })
        );
        // Copy changes the clipboard but not the document, so without this the
        // sidebar would keep showing Paste as unavailable.
        actionRegistry.onExecute(() => {
            documentVersion.value++;
        });
        const getActionContext = () => {
            // Read only so computeds built on this track documentVersion too.
            void documentVersion.value;
            return EditorActionContext.capture({
                session: editorSession,
                selectionCount: selectionCount.value,
                paletteOpen: paletteOpen.value,
                activeTool: activeTool.value,
                selectionIsStructurePlacement: selectionIsStructurePlacement.value
            });
        };
        function closePalette() {
            paletteOpen.value = false;
        }

        // Touch screens get EditorTouchActionBar. On a phone-width screen the sidebar
        // is a drawer over the viewport, closed at first so the scene fills the screen.
        const touchInput = useMediaQuery(TOUCH_INPUT_QUERY);
        const compactLayout = useMediaQuery(COMPACT_LAYOUT_QUERY);
        const sidebarOpen = ref(!compactLayout.value);
        const touchMultiSelect = ref(false);
        function toggleTouchMultiSelect() {
            touchMultiSelect.value = !touchMultiSelect.value;
            editorSession.setTouchMultiSelect(touchMultiSelect.value);
        }
        // While on, a one-finger drag draws a selection box and the camera stays still.
        const touchBoxSelect = ref(false);
        function toggleTouchBoxSelect() {
            touchBoxSelect.value = !touchBoxSelect.value;
            editorSession.setTouchBoxSelect(touchBoxSelect.value);
            if (!touchBoxSelect.value && editorSession.cancelMarquee()) {
                updateMarqueeRect();
            }
            feedback.show(t(touchBoxSelect.value ? 'editor.boxOn' : 'editor.boxOff'));
        }
        function runTouchAction(id) {
            actionRegistry.execute(id, getActionContext());
            refreshSelectedPlacementInfo();
            refreshSelectionSummary();
        }
        // The R key while placing: turns the piece about to be placed. Touch shows
        // no preview before the tap, so say that it turned.
        function rotateTouchPlacement() {
            editorSession.onKeyDown({ key: 'r' });
            feedback.show(t('editor.touchRotated'));
        }

        let onPointerDown = null;
        let onPointerMove = null;
        let onPointerUp = null;
        let onPointerCancel = null;
        let onKeyDown = null;

        // In CSS pixels relative to the viewport container, recomputed from the
        // session's client-space corners.
        const marqueeRect = ref(null);
        function updateMarqueeRect() {
            const rect = editorSession.getMarqueeRect();
            if (!rect || !viewport.value) {
                marqueeRect.value = null;
                return;
            }
            const bounds = viewport.value.getBoundingClientRect();
            marqueeRect.value = {
                left: Math.min(rect.x0, rect.x1) - bounds.left,
                top: Math.min(rect.y0, rect.y1) - bounds.top,
                width: Math.abs(rect.x1 - rect.x0),
                height: Math.abs(rect.y1 - rect.y0)
            };
        }

        // Only ever set from what EditorSession's pointer handlers return: no local
        // transform math.
        const transformFeedback = ref(null);
        function clearTransformFeedback() {
            transformFeedback.value = null;
        }

        // A short sound for each edit, with World View's mute and volume.
        const createEditorSound = inject('createEditorSound', null);
        const {
            soundAvailable, soundMuted, soundVolume, startSound, stopSound, toggleSound, setSoundVolume, onSoundKeyDown, sound
        } = useSoundControls(() => (typeof createEditorSound === 'function' ? createEditorSound({ editorSession }) : null));

        function onDocumentSaved() {
            const service = sound();
            if (service) {
                service.saved();
            }
        }

        onMounted(() => {
            editorSession.start(viewport.value);
            startSound();

            unsubTool = editorContext.eventBus.subscribe(
                EditorEvent.TOOL_CHANGED,
                ({ activeTool: t }) => {
                    activeTool.value = t;
                    // Picking something to place closes the drawer, so the tap that places
                    // it can reach the scene.
                    if (compactLayout.value && PLACING_TOOLS.has(t)) {
                        sidebarOpen.value = false;
                    }
                }
            );
            unsubSelection = editorContext.eventBus.subscribe(
                EditorEvent.SELECTION_CHANGED,
                ({ selection }) => {
                    // Every document switch clears the selection first, so this guarantees no
                    // overlay carries over to a new document.
                    clearTransformFeedback();
                    selectionCount.value = selection.items.length;
                    selectionIsStructurePlacement.value = !!selection.isStructurePlacementSelection;
                    selectedPlacementInfo.value = selection.isStructurePlacementSelection
                        ? editorSession.getSelectedPlacementInfo()
                        : null;
                    selectionSummary.value = (!selection.isEmpty && !selection.isStructurePlacementSelection)
                        ? editorSession.getSelectionSummary()
                        : null;
                }
            );
            unsubActiveStructure = editorContext.eventBus.subscribe(
                EditorEvent.ACTIVE_STRUCTURE_CHANGED,
                ({ title }) => {
                    activeStructureTitle.value = title;
                }
            );
            unsubActiveComposition = editorContext.eventBus.subscribe(
                EditorEvent.ACTIVE_COMPOSITION_CHANGED,
                ({ structure }) => {
                    activeCompositionTitle.value = structure ? structure.name : null;
                }
            );

            refreshDocumentInfo();
            unsubDocumentState = documentManager.onStateChanged(refreshDocumentInfo);

            // Started after editorSession.start() so the first probe checks the real
            // document.
            autosaveScheduler.start();
            recoveryObserver.start();

            if (route.query.fork) {
                const sourceDocumentId = route.query.fork;
                // Decoded before the try because both outcomes need it: openDocument() on
                // success and the return address on failure.
                const decodedEntryContext = editorEntryContextFromQuery(route.query, sourceDocumentId);
                try {
                    let sourcePublication = null;
                    if (route.query.publication) {
                        sourcePublication = findPublicationUseCase.execute(route.query.publication);
                    }
                    const forkedDocument = forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication);
                    editorSession.openDocument(forkedDocument, decodedEntryContext);
                    // Set only after openDocument() succeeds.
                    entryContext.value = decodedEntryContext;
                    arrivalDocumentId = decodedEntryContext ? forkedDocument.world.id : null;
                    // Transient arrival message, naming what was being looked at when known.
                    feedback.show(decodedEntryContext && decodedEntryContext.title
                        ? t('editor.editingCopy', { title: decodedEntryContext.title })
                        : t('editor.forkCreated', { title: forkedDocument.metadata.title }));
                } catch (err) {
                    // A failed fork shows a dialog with the reason and a way back to where the
                    // viewer came from, instead of a transient toast.
                    forkFailure.value = {
                        reason: err.reason || null,
                        returnWorldId: (decodedEntryContext && decodedEntryContext.returnWorldId) || sourceDocumentId,
                        focusLocationId: (decodedEntryContext && decodedEntryContext.focusLocationId) || null
                    };
                }
                router.replace({ path: '/editor' });
            } else if (route.query.load) {
                try {
                    editorSession.loadDocument(route.query.load);
                } catch (err) {
                    // Never shows the raw error message (it leaked class names and storage ids);
                    // branches on err.reason, with a safe fallback.
                    feedback.show(t(err.reason === LoadFailureReason.MATERIAL_UNAVAILABLE
                        ? 'editor.materialUnavailable'
                        : 'editor.couldNotOpen'));
                }
                router.replace({ path: '/editor' });
            }

            onPointerDown = (event) => {
                editorSession.onPointerDown(event);
                updateMarqueeRect();
            };
            viewport.value.addEventListener('pointerdown', onPointerDown);
            onPointerMove = (event) => {
                const result = editorSession.onPointerMove(event);
                // Only a consumed result carries feedback; a plain hover must not blank it.
                if (result) {
                    transformFeedback.value = result.feedback || null;
                }
                updateMarqueeRect();
            };
            viewport.value.addEventListener('pointermove', onPointerMove);
            // Runs after every pointer-up/key-down: commits there surface through neither
            // a return value nor SELECTION_CHANGED. Cheap and a no-op without a placement
            // selected.
            onPointerUp = (event) => {
                const result = editorSession.onPointerUp(event);
                if (result) {
                    transformFeedback.value = result.feedback || null;
                }
                updateMarqueeRect();
                refreshSelectedPlacementInfo();
                refreshSelectionSummary();
            };
            window.addEventListener('pointerup', onPointerUp);
            onPointerCancel = (event) => {
                editorSession.onPointerCancel(event);
                updateMarqueeRect();
            };
            window.addEventListener('pointercancel', onPointerCancel);

            const handleKeyDown = (event) => {
                if (InputRouter.isTextInputTarget(event.target)) {
                    if (event.key === 'Escape') {
                        event.target.blur();
                    }
                    return;
                }
                // 1.5. An open Keyboard Shortcuts overlay owns the keyboard next, so `?`/Escape
                // close it first.
                if (shortcutsOpen.value) {
                    if (event.key === 'Escape' || event.key === '?') {
                        event.preventDefault();
                        shortcutsOpen.value = false;
                    }
                    return;
                }
                if (paletteOpen.value) {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        paletteOpen.value = false;
                    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                        event.preventDefault();
                        paletteOpen.value = false;
                    }
                    return;
                }
                if (editorSession.isGestureActive()) {
                    editorSession.onKeyDown(event);
                    // A cancelled gesture never reaches onPointerUp(), so clear the overlay here.
                    if (!editorSession.isGestureActive()) {
                        clearTransformFeedback();
                    }
                    return;
                }
                // 3.5. An in-flight marquee owns Escape next: cancel it without clearing the
                // existing selection.
                if (editorSession.isMarqueeActive() && event.key === 'Escape') {
                    event.preventDefault();
                    editorSession.cancelMarquee();
                    updateMarqueeRect();
                    return;
                }
                // 3.8. M turns sound off or on.
                if (onSoundKeyDown(event)) {
                    return;
                }
                const shortcutTool = TOOL_SHORTCUTS[event.key];
                if (shortcutTool && !event.ctrlKey && !event.metaKey) {
                    editorContext.setActiveTool(shortcutTool);
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    saveDocument(saveDocumentUseCase, documentManager).then(onDocumentSaved, (error) => {
                        console.error('Save failed:', error);
                        feedback.show(saveFailureMessage(error), { durationMs: 10000 });
                    });
                    return;
                }
                // 4.1. '?' opens the Keyboard Shortcuts overlay.
                if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    shortcutsOpen.value = true;
                    return;
                }
                // 4.5. Placement mode handles Rotate itself: matchShortcut() matches by key
                // alone, even for disabled actions, so R would otherwise be swallowed.
                if ((activeTool.value === ToolId.PLACE || activeTool.value === ToolId.PLACE_STRUCTURE
                        || activeTool.value === ToolId.COMPOSE_STRUCTURE)
                    && event.key.toLowerCase() === 'r') {
                    editorSession.onKeyDown(event);
                    return;
                }
                // 4.6. Same for COMPOSE_STRUCTURE's Escape, which would otherwise match the
                // disabled 'selection.clear'.
                if (activeTool.value === ToolId.COMPOSE_STRUCTURE && event.key === 'Escape') {
                    editorSession.onKeyDown(event);
                    return;
                }
                const action = InputRouter.matchShortcut(event, actionRegistry);
                if (action) {
                    if (actionRegistry.execute(action.id, getActionContext())) {
                        event.preventDefault();
                    }
                    return;
                }
                editorSession.onKeyDown(event);
            };
            onKeyDown = (event) => {
                handleKeyDown(event);
                refreshSelectedPlacementInfo();
                refreshSelectionSummary();
            };
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            if (unsubTool) {
                unsubTool.unsubscribe();
            }
            if (unsubSelection) {
                unsubSelection.unsubscribe();
            }
            if (unsubActiveStructure) {
                unsubActiveStructure.unsubscribe();
            }
            if (unsubActiveComposition) {
                unsubActiveComposition.unsubscribe();
            }
            if (unsubDocumentState) {
                unsubDocumentState();
            }
            // Flush a pending autosave: stop() cancels rather than flushes, so the most
            // recent edits would be lost. Caught so the rest of this cleanup always runs.
            // A failed flush leaves the document dirty, and never blocks navigation.
            try {
                autosaveScheduler.flush();
            } catch (e) {
                console.error('Editor exit: failed to flush the pending autosave checkpoint', e);
            }
            autosaveScheduler.stop();
            recoveryObserver.stop();
            if (feedbackTimer) {
                clearTimeout(feedbackTimer);
            }
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            stopSound();
            editorSession.dispose();
            // Created per mount, so dispose it to avoid leaking bus subscriptions.
            if (documentCommandPropagation) {
                documentCommandPropagation.dispose();
            }
            if (documentOperationRecovery) {
                documentOperationRecovery.dispose();
            }
        });

        return {
            t,
            soundAvailable,
            soundMuted,
            soundVolume,
            toggleSound,
            setSoundVolume,
            onDocumentSaved,
            viewport,
            touchInput,
            sidebarOpen,
            touchMultiSelect,
            toggleTouchMultiSelect,
            touchBoxSelect,
            toggleTouchBoxSelect,
            runTouchAction,
            rotateTouchPlacement,
            PLACING_TOOLS,
            marqueeRect,
            transformFeedback,
            paletteUseCase,
            documentManager,
            saveDocumentUseCase,
            loadDocumentUseCase,
            editorSession,
            publishDocumentUseCase,
            entryContext,
            recoveryStatus,
            recoverDocument,
            discardRecovery,
            backToWorld,
            forkFailure,
            backFromForkFailure,
            structureGroups,
            personalStructureGroups,
            personalSavedAtById,
            recentStructures,
            libraryPreviewService,
            forkStructure,
            forkStructureToLibrary,
            copyStructureIntoDocument,
            renamePersonalStructure,
            removePersonalStructure,
            exportStructure,
            exportDocument,
            exportAllDocuments,
            exportAllStructures,
            savedDocumentsRevision,
            importDocument,
            importBlueprint,
            brickRegistry: registry,
            inspectStructure,
            inspectedStructure,
            inspectedStructureSource,
            inspectedStructureAttribution,
            inspectedStructureLineage,
            inspectedStructureSimilarityCandidates,
            placeInspectedStructure,
            closeStructureInspection,
            exportInspectedStructure,
            claimAuthorship,
            exportInspectedAttribution,
            publishInspectedAttributionToNetwork,
            resignInspectedAttribution,
            claimLineage,
            exportBlueprintLineageClaim,
            showCreateBlueprintDialog,
            createBlueprintPreview,
            onCreateBlueprint,
            closeCreateBlueprintDialog,
            activeTool,
            activeStructureTitle,
            activeCompositionTitle,
            selectionCount,
            selectionIsStructurePlacement,
            selectedPlacementInfo,
            selectionSummary,
            shortcutsOpen,
            rotateSelectedPlacement,
            recolorSelection,
            duplicateSelectedPlacement,
            deleteSelectedPlacement,
            editSelectedPlacementSource,
            applySelectedPlacementTransform,
            repeatSelection,
            selectGroup,
            actionRegistry,
            getActionContext,
            actionUi,
            paletteOpen,
            closePalette,
            feedback,
            feedbackMessage,
            feedbackVisible,
            canDistributePublication,
            selectedDiscoveryProvider,
            selectedDistributionStorage,
            snapshotDistributionStorageTypes,
            remotePinningDraft,
            canDistributeSnapshot,
            snapshotDistributionExecuting,
            snapshotDistributionError,
            snapshotDistributionResult,
            distributePublishedSnapshot,
            distributionDialogOpen,
            publishedPublication,
            distributionExecuting,
            distributionError,
            distributionResult,
            onDocumentPublished,
            distributePublishedDocument,
            distributePublishedDocumentAndSnapshot,
            dismissPublishAction,
            viewDistributedPublicationInRepository,
            canDistributeAttribution,
            dismissAttributionDistribution,
            distributePublishedAttribution,
            attributionDistributionDialogOpen,
            attributionDistributionError,
            attributionDistributionExecuting,
            attributionDistributionResult,
            publishedAttribution,
            attributionRemotePinningDraft,
            selectedAttributionDiscoveryProvider,
            selectedAttributionDistributionStorage,
            documentInfo,
            showMetadataEditor,
            onSaveMetadata,
            setTool,
            alignSelection,
            distributeSelection,
            applyNumericTransform,
            ToolId
        };
    }
};
