import { ref, computed, onMounted, onBeforeUnmount, inject, watch } from 'vue';
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
import NewDocumentDialog from '../components/NewDocumentDialog.js';
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
import DescriptionReaderSheet from '../components/DescriptionReaderSheet.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';
import CreateBlueprintDialog from '../components/CreateBlueprintDialog.js';
import StructureInfoPanel from '../components/StructureInfoPanel.js';
import ForkFailureDialog from '../components/ForkFailureDialog.js';
import EditorDistributionDialog from '../components/EditorDistributionDialog.js';
import PublicationShareLink from '../components/PublicationShareLink.js';
import ProtectIdentityNote from '../components/ProtectIdentityNote.js';
import FirstBuildGuide from '../components/FirstBuildGuide.js';
import StarterJobCard from '../components/StarterJobCard.js';
import { EDITOR_ACTIVITY } from '../../core/app/EditorSoundCues.js';
import { FIRST_EDIT_BRICK_ID, starterCardStage as stageOfStarterCard, starterJobById, starterJobProgress, starterStepGuide, unfinishedStructure } from '../../core/challenge/StarterJob.js';
import { worldBricks } from '../../core/building/PlacedBricks.js';
import BuildPlotBanner from '../components/BuildPlotBanner.js';
import { useBuildPlot } from './editorView/useBuildPlot.js';
import { useFirstBuildGuide } from './editorView/useFirstBuildGuide.js';
import { useWalkInside } from './editorView/useWalkInside.js';
import { useBuildTogether } from './editorView/useBuildTogether.js';
import BuildTogetherStrip from '../components/walkTogether/BuildTogetherStrip.js';
import { BuildTogetherSession } from '../../application/buildTogether/BuildTogetherSession.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import WalkTogetherDialog from '../components/walkTogether/WalkTogetherDialog.js';
import LoginModal from '../components/LoginModal.js';
import { editorEntryContextFromQuery } from '../../core/document/EditorEntryContext.js';
import { usePostPublishDistribution } from './editorView/usePostPublishDistribution.js';
import { useBuildNoteSend } from './editorView/useBuildNoteSend.js';
import { useSelectionActions } from './editorView/useSelectionActions.js';
import { useStructureLibrary } from './editorView/useStructureLibrary.js';
import { useBlueprintExchange } from './editorView/useBlueprintExchange.js';
import { ExportAllDocumentsUseCase, ImportDocumentBundleUseCase } from '../../application/document/DocumentBundle.js';
import { ExportDocumentUseCase } from '../../application/document/ExportDocumentUseCase.js';
import { ImportDocumentUseCase } from '../../application/document/ImportDocumentUseCase.js';
import { useStructureInspection } from './editorView/useStructureInspection.js';
import { useSoundControls } from '../composables/useSoundControls.js';
import SoundControl from '../components/SoundControl.js';
import { displayText, errorText, t } from '../i18n/i18n.js';
import { buildDescriptionText } from '../i18n/buildDescriptionText.js';
import VoicePanel from '../components/VoicePanel.js';
import { useVoiceCommands } from '../voice/useVoiceCommands.js';
import { actionSaid } from '../../core/voice/Transcript.js';
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { descriptionSuggestion, titleSuggestions } from '../i18n/buildSuggestionText.js';
import { plainCommandVocabulary } from '../i18n/plainCommandWords.js';
import { interpretPlainCommand } from '../../core/building/PlainCommand.js';
import { brickPart } from '../../core/catalog/BuildDescription.js';
import { VILLAGE_PALETTE } from '../../core/building/VillagePalette.js';
import { remixParentPublication } from '../../core/publication/RemixLineage.js';
import { BuildDescriber } from '../../application/publication/BuildDescriber.js';
import { libraryItemName } from '../i18n/libraryText.js';
import { FEATURED_STRUCTURE_IDS, featuredStructures, findStarterStructure } from '../../application/home/FeaturedBuilds.js';
import { challengeAt, challengeById, challengeIdeaStructureIds, isChallengeOpen, isRemixChallenge, withChallengeTag } from '../../core/challenge/BuildChallenge.js';
import { BUILD_TAG_MAX_COUNT } from '../../core/document/BuildTags.js';
import { challengeLastDayText, challengeThemeBrief, challengeThemeTitle, challengeTimeText } from '../components/challenge/challengeText.js';
import ModelExportDialog from '../components/modelExport/ModelExportDialog.js';
import { downloadBuildModel } from '../components/modelExport/downloadBuildModel.js';
import { describeLicense } from '../../application/document/LicenseLabels.js';
import { worldBrickCount } from '../../core/catalog/BuilderStamps.js';

// Editing shortcuts come from EditorActionRegistry, shared with the palette,
// the sidebar and the controls docs. Escape priority: text input > shortcuts
// overlay > palette > gizmo gesture > marquee > selection. Tool switching
// (1/2), Ctrl+S and '?' stay view-local: they are not editing actions.

const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

const PLACING_TOOLS = new Set([ToolId.PLACE, ToolId.PLACE_STRUCTURE, ToolId.COMPOSE_STRUCTURE]);

export default {
    name: 'EditorView',
    components: { Toolbar, BuildLibraryPanel, EditingSidebar, StructureInstancePanel, CommandPalette, KeyboardShortcutsOverlay, NewDocumentDialog, ActionFeedback, RecoveryBanner, DocumentInfoPanel, DescriptionReaderSheet, MetadataEditorDialog, CreateBlueprintDialog, StructureInfoPanel, TransformFeedback, ForkFailureDialog, EditorDistributionDialog, PublicationShareLink, ProtectIdentityNote, FirstBuildGuide, StarterJobCard, BuildPlotBanner, EditorTouchActionBar, SoundControl, ModelExportDialog, WalkTogetherDialog, LoginModal, BuildTogetherStrip, VoicePanel },
    template: `
        <div class="editor-view">
            <h1 class="visually-hidden">{{ documentInfo ? t('editor.heading', { title: displayText(documentInfo.title) }) : t('app.nav.editor') }}</h1>
            <Toolbar
                ref="toolbar"
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
                @published="onPublished"
                @saved="onDocumentSaved"
                @export-document="exportDocument"
                @export-model="modelExportOpen = true"
                @export-all-documents="exportAllDocuments"
                @import-document="importDocument"
                @new-document="openNewDocumentDialog"
            />
            <RecoveryBanner
                :status="recoveryStatus"
                @recover="recoverDocument"
                @discard="discardRecovery"
            />
            <BuildPlotBanner
                v-if="buildPlot"
                :plot="buildPlot"
                :published="buildPlotPublished"
                @visit="visitBuildPlot"
                @forget="forgetBuildPlot"
            />
            <!--
                What Publish did, for the just-published Publication: sent where this
                device sends each build, or kept here until the person chooses where it
                goes (ui/views/editorView/usePostPublishDistribution.js). Sits at the top
                so it is not hidden below the viewport.
            -->
            <div v-if="publishedPublication || distributionError || (distributionResult && distributionResult.length) || snapshotDistributionError || snapshotDistributionResult" class="editor-post-publish-overlay">
                <div v-if="publishedPublication" class="editor-post-publish-action">
                    <span class="editor-post-publish-message" role="status">
                        <template v-if="sendStatus === 'sending'">{{ t('editor.publishedSending', { network: sendDestinationName }) }}</template>
                        <template v-else-if="sendStatus === 'sent'">{{ t('editor.publishedSent', { network: sendDestinationName }) }}</template>
                        <template v-else-if="sendStatus === 'failed'">{{ t('editor.publishedSendFailed', { network: sendDestinationName, error: sendError }) }}</template>
                        <template v-else-if="noteStatus === 'sending'">{{ t('editor.publishedFinding') }}</template>
                        <template v-else-if="noteStatus === 'sent'">{{ t('editor.publishedFound') }}</template>
                        <template v-else-if="noteStatus === 'failed'">{{ t('editor.publishedFindFailed') }}</template>
                        <template v-else-if="noteStatus === 'too-large'">{{ t('editor.publishedTooLargeToFind') }}</template>
                        <template v-else-if="noteStatus === 'unsigned'">{{ t('editor.publishedUnsignedNotFound') }}</template>
                        <template v-else-if="noteStatus === 'link'">{{ t('editor.publishedLinkOnly') }}</template>
                        <template v-else-if="noteStatus === 'kept-to-links'">{{ t('editor.keptToLinks') }}</template>
                        <template v-else>{{ t('editor.published') }}</template>
                    </span>

                    <!-- Walk inside it, first: World View, standing at the build's door. -->
                    <router-link
                        v-if="walkInside"
                        :to="walkInside.route"
                        class="action-btn action-btn--primary editor-post-publish-walk"
                    >{{ walkInside.hasDoor ? t('editor.walkInside') : t('editor.walkAround') }}</router-link>
                    <!-- Sent to everyone as a build note (ui/views/editorView/useBuildNoteSend.js). -->
                    <button
                        v-if="sendStatus === 'local' && noteStatus === 'failed'"
                        type="button"
                        class="action-btn action-btn--primary editor-post-publish-note-retry"
                        @click="retryNote"
                    >{{ t('editor.tryAgain') }}</button>
                    <button
                        v-if="sendStatus === 'local' && noteStatus === 'link'"
                        type="button"
                        class="action-btn action-btn--secondary editor-post-publish-let-everyone"
                        @click="letEveryoneFind"
                    >{{ t('editor.letEveryoneFind') }}</button>
                    <button
                        v-if="sendStatus === 'local' && noteStatus === 'sent'"
                        type="button"
                        class="action-btn action-btn--secondary editor-post-publish-keep-to-links"
                        @click="keepToLinks"
                    >{{ t('editor.keepToLinks') }}</button>

                    <button
                        v-if="sendStatus === 'failed' && canDistributeSnapshot && canDistributePublication"
                        type="button"
                        class="action-btn action-btn--primary editor-post-publish-retry"
                        @click="distributePublishedDocumentAndSnapshot"
                    >{{ t('editor.tryAgain') }}</button>
                    <!-- Opens EditorDistributionDialog, which holds every storage/substrate choice. -->
                    <button
                        v-if="canDistributeSnapshot || canDistributePublication"
                        type="button"
                        :class="['action-btn', sendStatus === 'local' && !noteStatus ? 'action-btn--primary' : 'action-btn--secondary', 'editor-post-publish-distribute-trigger']"
                        :disabled="sendStatus === 'sending'"
                        @click="distributionDialogOpen = true"
                    >{{ sendStatus !== 'local' ? t('editor.changeWhereItGoes') : (noteStatus ? t('editor.moreNetworks') : t('editor.distribute')) }}</button>
                    <button
                        type="button"
                        class="action-btn action-btn--secondary editor-post-publish-dismiss-btn"
                        @click="dismissPublishAction"
                    >{{ t('editor.dismiss') }}</button>
                </div>
                <!-- Share it straight away: a small build travels inside the link. -->
                <PublicationShareLink
                    v-if="publishedPublication"
                    class="editor-post-publish-share"
                    :publication-id="publishedPublication.id"
                    :title="publishedPublication.title"
                    :publication="publishedPublication"
                    compact
                    @shared="firstBuildShared"
                />
                <ProtectIdentityNote v-if="publishedPublication && protectNoteDue" class="editor-post-publish-protect" />

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
                    :for-publish="true"
                    :rememberable="canRemember"
                    :remember="rememberChoice"
                    @update:remember="setRememberChoice"
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
                    <!-- What a ready-made build asks of its builder (core/challenge/StarterJob.js); over the 3D view on a phone. -->
                    <StarterJobCard v-if="starterCardStage && !compactLayout" :stage="starterCardStage" :step="starterStep" @pick="pickStarterJobBrick" @publish="publishFromStarterCard" @hide="hideStarterCard" />
                    <DocumentInfoPanel
                        compact
                        :expanded="documentInfoExpanded"
                        :info="documentInfo"
                        @toggle="toggleDocumentInfo"
                        @edit-metadata="showMetadataEditor = true"
                        @read-description="descriptionReaderOpen = true"
                    />
                    <!-- Build with me: a link that lets friends build this with you, live. -->
                    <button
                        v-if="buildAvailable && buildRole !== 'guest'"
                        type="button"
                        class="action-btn editor-build-together"
                        :title="t('buildTogether.buttonHint')"
                        @click="openBuildDialog"
                    >{{ t('buildTogether.button') }}</button>
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
                        :pinned-structures="pinnedStructures"
                        :pinned-title="pinnedTitle"
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
                    <!-- Read more's whole description, beside the sidebar as in World View. -->
                    <DescriptionReaderSheet
                        v-if="descriptionReaderOpen && documentInfo && documentInfo.description"
                        class="description-reader-sheet--editor"
                        :info="documentInfo"
                        @close="descriptionReaderOpen = false"
                        @edit-metadata="showMetadataEditor = true"
                    />
                    <!-- Describe the Build (I): what the build is made of, until closed. -->
                    <div v-if="buildDescriptionNote" class="editor-build-description">
                        <p>{{ buildDescriptionNote }}</p>
                        <button type="button" class="action-btn" @click="buildDescriptionNote = ''">{{ t('buildDescription.close') }}</button>
                    </div>
                    <p class="visually-hidden" aria-live="polite">{{ buildDescriptionNote }}</p>
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
                        :placing-tilts="activeTool === ToolId.PLACE"
                        :can-place="placementGhost"
                        @run="runTouchAction"
                        @rotate-placement="rotateTouchPlacement"
                        @tilt-placement="tiltTouchPlacement"
                        @place="confirmTouchPlacement"
                        @cancel-placement="cancelTouchPlacement"
                        @toggle-multi-select="toggleTouchMultiSelect"
                        @toggle-box-select="toggleTouchBoxSelect"
                    />
                    <div
                        v-if="marqueeRect"
                        class="marquee-rect"
                        :style="{ left: marqueeRect.left + 'px', top: marqueeRect.top + 'px', width: marqueeRect.width + 'px', height: marqueeRect.height + 'px' }"
                    ></div>
                    <TransformFeedback :feedback="transformFeedback" />
                    <div class="editor-view-tools">
                        <!-- See inside: the build cut away above its ground floor. -->
                        <button
                            type="button"
                            :class="['action-btn', 'editor-see-inside', { 'action-btn--active': seeInside }]"
                            :aria-pressed="seeInside ? 'true' : 'false'"
                            :title="t('editor.seeInsideHint')"
                            @click="toggleSeeInside"
                        >{{ seeInside ? t('editor.seeInsideOff') : t('editor.seeInside') }}</button>
                        <!-- Voice building (V): say a command. -->
                        <button
                            type="button"
                            :class="['action-btn', 'editor-voice-button', { 'action-btn--active': voice.step === 'listening' }]"
                            :aria-pressed="voice.step === 'listening' ? 'true' : 'false'"
                            :title="t('editorAction.ui.voice.description')"
                            :aria-label="t('editorAction.ui.voice')"
                            @click="toggleVoice"
                        >🎤 {{ voice.step === 'listening' ? t('voice.stop') : t('voice.button') }}</button>
                        <!-- On a phone or a touch screen, Sound folds into one button here
                             rather than floating over the build. -->
                        <SoundControl
                            v-if="soundAvailable && (compactLayout || touchInput)"
                            compact
                            :muted="soundMuted"
                            :volume="soundVolume"
                            :music="soundMusic"
                            @toggle="toggleSound"
                            @volume="setSoundVolume"
                            @toggle-music="toggleSoundMusic"
                        />
                    </div>
                    <VoicePanel
                        :voice="voice"
                        @turn-on="turnOnVoice"
                        @turn-off="turnOffVoice"
                        @remove="removeVoiceModel"
                        @toggle="toggleVoice"
                        @ask-guide="askGuideAbout"
                        @close="closeVoice"
                    />
                    <!-- Who is building this with you, each in their own colour. -->
                    <BuildTogetherStrip
                        v-if="buildRole"
                        :role="buildRole"
                        :title="buildStripTitle"
                        :people="coBuilders"
                        :sharing="buildSharing"
                        @link="openBuildDialog"
                        @stop="stopBuild"
                        @leave="leaveBuild"
                    />
                    <StarterJobCard v-if="starterCardStage && compactLayout" floating :stage="starterCardStage" :step="starterStep" @pick="pickStarterJobBrick" @publish="publishFromStarterCard" @hide="hideStarterCard" />
                    <FirstBuildGuide
                        v-if="firstBuildVisible"
                        :progress="firstBuildProgress"
                        :walk-route="walkInside ? walkInside.route : null"
                        :quiet="starterCardStage === 'job'"
                        @dismiss="dismissFirstBuildGuide"
                        @celebrated="finishFirstBuildGuide"
                    />
                    <SoundControl
                        v-if="soundAvailable && !(compactLayout || touchInput)"
                        :muted="soundMuted"
                        :volume="soundVolume"
                        :music="soundMusic"
                        @toggle="toggleSound"
                        @volume="setSoundVolume"
                        @toggle-music="toggleSoundMusic"
                    />
                </div>
            </div>
            <CommandPalette
                v-if="paletteOpen"
                :registry="actionRegistry"
                :get-context="getActionContext"
                :plan="planPlainCommand"
                @close="closePalette"
            />
            <ActionFeedback :message="feedbackMessage" :visible="feedbackVisible" />
            <WalkTogetherDialog
                v-if="showBuildDialog"
                kind="build"
                :state="buildState"
                :link="buildLink"
                :available="buildAvailable"
                :needs-publish="buildNeedsOwner"
                @retry="startBuild"
                @stop="stopBuild"
                @close="closeBuildDialog"
            />
            <LoginModal v-if="signInToBuild" purpose="build" @signed-in="buildSignedIn" @close="signInToBuild = false" />
            <ModelExportDialog
                v-if="modelExportOpen"
                @choose="exportModel"
                @cancel="modelExportOpen = false"
            />
            <NewDocumentDialog
                v-if="newDocumentDialog"
                :structures="newDocumentDialog.structures"
                :preview-service="libraryPreviewService"
                :unsaved-title="newDocumentDialog.unsavedTitle"
                :challenge="newDocumentDialog.challenge"
                @choose-challenge="startFromChallenge"
                @choose-empty="startEmptyDocument"
                @choose-structure="startFromStructure"
                @cancel="newDocumentDialog = null"
            />
            <KeyboardShortcutsOverlay
                v-if="shortcutsOpen"
                :registry="actionRegistry"
                @close="shortcutsOpen = false"
            />
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="documentInfo"
                :suggest="suggestForBuild"
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
        const toolbar = ref(null);

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
            autosaveDocumentUseCase, recoverDocumentUseCase, discardRecoveryUseCase, checkRecoveryUseCase,
            findUnsavedWorkUseCase
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
        // A build started with Build here is published onto its plot.
        const { publishDocumentUseCase } = new CreatePublisherUseCase().execute(identityProvider, {
            buildPlotStore: inject('buildPlotStore', null),
            foundPublications: inject('decentralizedPublicationDiscoveryProvider', null)
        });
        // Fork/load lookups also search Repository-admitted decentralized publications.
        const decentralizedDiscoveryProviderForLookup = inject('decentralizedPublicationDiscoveryProvider', null);
        const { findPublicationUseCase, discoveryProvider: lookupDiscoveryProvider } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: decentralizedDiscoveryProviderForLookup
        });
        const { blueprintAttributionUseCase, blueprintAttributionExchange } = new CreateBlueprintAttributionUseCase().execute(identityProvider);
        const { blueprintLineageUseCase, blueprintLineageExchange } = new CreateBlueprintLineageUseCase().execute(identityProvider);
        const publicationResolver = inject('publicationResolver');
        const publicationCatalog = inject('publicationCatalog');
        const funnelEventCounter = inject('funnelEventCounter', null);
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
                isBlocked,
                // Build with me: the host lets the friends who joined edit this
                // build, and passes each one's edits on to the others.
                resolveWorldEditGrant: (documentId, identityId) => Boolean(buildTogetherSession && buildTogetherSession.allows(documentId, identityId)),
                shouldRelay: (documentId, command, authorIdentityId) => Boolean(buildTogetherSession && buildTogetherSession.isHosting(documentId))
                    && editorSession.acceptsSharedStep(command, authorIdentityId)
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

        // The bricks each build started with, to count the builder's own at publish.
        const readyMadeBricks = inject('readyMadeBricksStore', null);
        // The builds this identity helped make with friends (Build with me).
        const helpedBuildsStore = inject('helpedBuildsStore', null);
        // The identity this device acts for: its own, or the one it is an
        // authorized device of. Credits and the builds you helped make go by it.
        function ownBuilderIdentityId() {
            try {
                return deviceAuthorizationUseCase?.resolveOwnSocialIdentity()?.identityId || resolveSigningIdentityId(identityProvider);
            } catch {
                return resolveSigningIdentityId(identityProvider);
            }
        }
        const editorSession = new EditorSession({
            registry,
            editorContext,
            toolRegistry,
            documentManager,
            selectionUseCase,
            previewUseCase,
            loadDocumentUseCase,
            identityProvider,
            exportDocumentUseCase: new ExportDocumentUseCase(undefined, { identityProvider }),
            importDocumentUseCase: new ImportDocumentUseCase(undefined, undefined, { identityProvider, ownIdentityIds: () => [ownBuilderIdentityId()] }),
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
            documentOperationRecovery,
            readyMadeBricks,
            isReadyMadeStructure: (id) => structureRegistry.has(id) && !personalStructureLibraryStore.getStructure(id)
        });

        // Build with me (application/buildTogether/): this build, edited live
        // with friends who joined through its link. Needs the peer stack the
        // command protocol rides on.
        const buildTogetherSession = documentCommandPropagation
            ? new BuildTogetherSession({
                peerMessageBus,
                connectedPeerRegistry: peerSessionManager.registry,
                resolveConnectionIdentity: (connectedPeer) => deviceAuthorizationUseCase.resolveConnectionIdentity(connectedPeer),
                // This device's key, and the identity it acts for, which credits name.
                ownIdentityIds: () => [resolveSigningIdentityId(identityProvider), ownBuilderIdentityId()].filter(Boolean),
                editor: {
                    openDocument: () => documentManager.document,
                    appliedOperationIds: () => editorSession.appliedOperationIds(),
                    openShared: (document, operationIds) => editorSession.openSharedDocument(document, operationIds),
                    // Someone joined: Undo starts again from here, said only to
                    // one already building with others who loses steps by it.
                    resetUndo: ({ name } = {}) => {
                        const sharing = editorSession.sharedEditing;
                        if (editorSession.resetSharedUndo() && sharing) feedback.show(t('buildTogether.undoReset', { name: name || t('walkTogether.someone') }));
                    },
                    adoptCredits: (builtWith) => {
                        const document = documentManager.document;
                        if (!document || !document.metadata.adoptBuiltWith(builtWith)) return false;
                        documentManager.markDirty();
                        return true;
                    },
                    notedHelped: (helped) => {
                        const own = ownBuilderIdentityId();
                        if (helpedBuildsStore && own) helpedBuildsStore.note(own, helped);
                    },
                    creditBuilder: (builder) => {
                        const document = documentManager.document;
                        if (!document || !document.metadata.creditBuilder(builder)) return false;
                        documentManager.markDirty();
                        feedback.show(t('builtWith.credited', { name: builder.name || t('builtWith.someone') }));
                        return true;
                    }
                }
            })
            : null;
        // Each friend whose edit this build accepts is credited on it
        // (core/catalog/BuiltWith.js), and so on its Publication.
        const unsubscribeBuildCredits = buildTogetherSession
            ? documentCommandPropagation.onOperationReceived((documentId, command, authorIdentityId) => buildTogetherSession.noteEdit(documentId, authorIdentityId))
            : null;

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
        // New's choices while its dialog is open: the ready-made builds, and the
        // open document's title when closing it would lose unsaved changes.
        const newDocumentDialog = ref(null);

        // Download as a 3D model (ModelExportDialog): the open build, with the
        // structures placed in it, credited to its author under its license.
        const modelExportOpen = ref(false);
        function exportModel(format) {
            modelExportOpen.value = false;
            const document = documentManager.document;
            if (!document) return;
            const metadata = document.metadata;
            const license = metadata.license;
            try {
                const { fileName, missingPlacements } = downloadBuildModel({
                    format,
                    world: document.world,
                    resolveWorld: (documentId) => structureDocumentResolver.resolve(documentId),
                    registry,
                    metadata: {
                        title: displayText(metadata.title),
                        author: metadata.author || '',
                        license: displayText(describeLicense(license?.id)),
                        remixedFrom: metadata.parentDocumentId ? (license?.attribution?.title || '') : ''
                    }
                });
                feedback.show(missingPlacements
                    ? t('modelExport.downloadedMissing', { file: fileName, count: missingPlacements })
                    : t('modelExport.downloaded', { file: fileName }));
            } catch (err) {
                feedback.show(errorText(err));
            }
        }
        function openNewDocumentDialog() {
            const { document, state } = documentManager;
            const now = Date.now();
            const challenge = challengeAt(now);
            newDocumentDialog.value = {
                structures: featuredStructures(structureRegistry, FEATURED_STRUCTURE_IDS),
                unsavedTitle: document && state.dirty ? document.metadata.title : null,
                challenge: challenge && !isRemixChallenge(challenge) && isChallengeOpen(challenge, now)
                    ? { id: challenge.id, title: challengeThemeTitle(challenge), brief: challengeThemeBrief(challenge), time: challengeTimeText(challenge, now) }
                    : null
            };
        }
        // Tags the open document for a running challenge (core/challenge/BuildChallenge.js),
        // which is how a build enters it once published. False for a week
        // that isn't running.
        function joinChallenge(challenge) {
            const document = documentManager.document;
            if (!document || !challenge || !isChallengeOpen(challenge, Date.now())) return false;
            updateDocumentMetadataUseCase.execute(documentManager, {
                tags: withChallengeTag(document.metadata.tags, challenge, BUILD_TAG_MAX_COUNT)
            });
            funnelEventCounter?.joinedChallenge();
            feedback.show(t('challenge.joined', {
                theme: challengeThemeTitle(challenge), tag: challenge.tag, end: challengeLastDayText(challenge)
            }));
            return true;
        }
        // Joining a themed week: an empty plot of the builder's own, named after
        // the theme and tagged for the week, with the theme's structures pinned at
        // the top of the Build Library's Structures. Dropping one in is the
        // builder's choice, and counts as ready-made (core/building/PlacedBricks.js).
        const challengePins = ref(null);
        function startChallengePlot(challenge) {
            if (!challenge || isRemixChallenge(challenge) || !isChallengeOpen(challenge, Date.now())) return false;
            editorSession.newDocument();
            const theme = challengeThemeTitle(challenge);
            updateDocumentMetadataUseCase.execute(documentManager, { title: theme });
            joinChallenge(challenge);
            challengePins.value = {
                worldId: documentManager.document?.world.id ?? null,
                title: t('challenge.pinnedTitle', { theme }),
                structures: challengeIdeaStructureIds(challenge)
                    .map((id) => findStarterStructure(structureRegistry, id))
                    .filter(Boolean)
            };
            return true;
        }
        // Pinned for as long as the challenge's plot is the open build.
        const pinnedStructures = computed(() => {
            void documentVersion.value;
            const pins = challengePins.value;
            return pins && documentManager.document?.world.id === pins.worldId ? pins.structures : [];
        });
        const pinnedTitle = computed(() => challengePins.value?.title ?? '');
        // A build opened from something ready-made (core/challenge/StarterJob.js), with
        // the job Home's main button left to do or none, for as long as it is
        // the open build: its card, until it is published or hidden. A job is a
        // chain of steps; `structure` is the finished one it was taken from
        // (where the roof and the chimney go), `startBricks` what it opened
        // with (what isn't the builder's own).
        const starterJob = ref(null);
        // Any edit, undo or redo may finish (or unfinish) a step.
        const starterJobEdits = ref(0);
        let unwatchStarterJob = null;
        function startStarterJob(job, structure) {
            const startBricks = job ? unfinishedStructure(job, structure)?.bricks ?? [] : [];
            starterJob.value = { job, structure, startBricks, worldId: documentManager.document?.world.id ?? null, published: false, hidden: false };
            unwatchStarterJob?.();
            unwatchStarterJob = editorSession.onCommandActivity(() => { starterJobEdits.value++; });
        }
        const starterJobShown = computed(() => {
            void documentVersion.value;
            return Boolean(starterJob.value) && documentManager.document?.world.id === starterJob.value.worldId;
        });
        const starterJobState = computed(() => {
            void documentVersion.value;
            void starterJobEdits.value;
            const job = starterJob.value?.job;
            if (!job) return null;
            return starterJobProgress(job, worldBricks(documentManager.document?.world), (id) => registry.get(id), starterJob.value.startBricks);
        });
        const starterJobDone = computed(() => Boolean(starterJobState.value?.done));
        // The step the card shows: which, its place in the chain, how many in.
        const starterStep = computed(() => {
            const state = starterJobState.value;
            if (!state || state.done) return null;
            const { placed, needed } = state.steps[state.currentIndex];
            return { id: state.current.id, index: state.currentIndex, total: state.steps.length, placed, needed };
        });
        // Where the current step's next brick goes, while the job is open.
        const starterGuide = computed(() => {
            void starterJobEdits.value;
            const state = starterJobState.value;
            if (!starterJobShown.value || !state || state.done) return null;
            return starterStepGuide(starterJob.value.job, state.current, starterJob.value.structure, worldBricks(documentManager.document?.world));
        });
        const starterCardStage = computed(() => {
            void starterJobEdits.value;
            if (!starterJobShown.value) return null;
            let placedCount = 0;
            try {
                placedCount = readyMadeBricks ? readyMadeBricks.placedCount(documentManager.document?.world) : 0;
            } catch {
                placedCount = 0;
            }
            const { job, published, hidden } = starterJob.value;
            return stageOfStarterCard({ job, jobDone: starterJobDone.value, placedCount, published, hidden });
        });
        function hideStarterCard() {
            if (starterJob.value) starterJob.value = { ...starterJob.value, hidden: true };
        }
        // The same Publish as the toolbar's, with its questions.
        function publishFromStarterCard() {
            toolbar.value?.requestPublish();
        }
        function pickStarterJobBrick() {
            if (!starterJob.value) return;
            const step = starterJobState.value?.current;
            if (!step) {
                editorContext.setActiveBrick(FIRST_EDIT_BRICK_ID);
                setTool(ToolId.PLACE);
                return;
            }
            editorContext.setActiveBrick(step.brickId);
            if (step.color !== undefined) editorContext.setActiveBrickColor(step.color);
            // The roof, the chimney and the path's next stone go to their
            // places wherever on the house the pointer is (starterGuide).
            editorContext.setPlacementGuide(starterGuide.value);
            setTool(ToolId.PLACE);
        }
        // A copy just opened from ?fork=: its bricks are someone else's, not its
        // builder's (core/building/PlacedBricks.js), and a remix week's entry (its
        // challenge page's Remix) is tagged for the week.
        function afterForkOpened() {
            editorSession.noteReadyMadeStart();
            const remixWeek = typeof route.query.challenge === 'string' ? challengeById(route.query.challenge) : null;
            if (remixWeek) joinChallenge(remixWeek);
        }
        function startFromChallenge(challengeId) {
            newDocumentDialog.value = null;
            startChallengePlot(challengeById(challengeId));
        }
        function startEmptyDocument() {
            newDocumentDialog.value = null;
            editorSession.newDocument();
        }
        function startFromStructure(structure) {
            newDocumentDialog.value = null;
            if (editorSession.forkStructure(structure)) {
                editorSession.frameDocument();
                startStarterJob(null, structure);
                feedback.show(t('editor.startedFromBuild', { name: libraryItemName(structure) }));
            }
        }
        let unsubTool = null;
        let unsubSelection = null;
        let unsubPlacementBlocked = null;
        let unsubPlacementGhost = [];
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
        // "Saved". `message` is text or a message descriptor (core/app/Message.js).
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

        const buildTogether = useBuildTogether({
            session: buildTogetherSession,
            editorSession,
            editorContext,
            documentManager,
            identityProvider,
            feedback
        });

        const {
            canDistributePublication, canDistributeSnapshot, dismissPublishAction, distributePublishedDocument,
            distributePublishedDocumentAndSnapshot, distributePublishedSnapshot, distributionDialogOpen,
            distributionError, distributionExecuting, distributionResult, onDocumentPublished, publishedPublication,
            remotePinningDraft, selectedDiscoveryProvider, selectedDistributionStorage, snapshotDistributionError,
            snapshotDistributionExecuting, snapshotDistributionResult, snapshotDistributionStorageTypes,
            viewDistributedPublicationInRepository,
            canRemember, rememberChoice, setRememberChoice, sendStatus, sendDestinationName, sendError
        } = usePostPublishDistribution({
            router,
            rememberDestination: true
        });

        // Sending each published build to everyone, when this device's builder chose so.
        const { noteStatus, onPublishedForNotes, retryNote, letEveryoneFind, keepToLinks } = useBuildNoteSend();

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
            editorSession, feedback, libraryUsageHistoryStore, personalStructureLibraryStore, structureRegistry,
            // Read when a structure is picked, after touchInput below is set.
            isTouch: () => touchInput.value
        });

        const {
            exportAllDocuments, exportAllStructures, exportBlueprintAttribution, exportBlueprintLineageClaim, exportDocument,
            exportStructure, importBlueprint, importDocument
        } = useBlueprintExchange({
            blueprintAttributionExchange, blueprintAttributionUseCase, blueprintLineageExchange,
            blueprintLineageUseCase, documentManager, editorSession, feedback, refreshPersonalStructureGroups,
            personalStructureLibraryStore,
            exportAllDocumentsUseCase: new ExportAllDocumentsUseCase(documentStorage, undefined, { identityProvider }),
            importDocumentBundleUseCase: new ImportDocumentBundleUseCase(documentStorage, { identityProvider, ownIdentityIds: () => [ownBuilderIdentityId()] }),
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
        // The panel folded to its title or unfolded into World View's full
        // About this build, as this device last left it.
        const editorBuildInfoStore = inject('editorBuildInfoStore', null);
        const documentInfoExpanded = ref(editorBuildInfoStore ? editorBuildInfoStore.isExpanded() : false);
        function toggleDocumentInfo() {
            const next = !documentInfoExpanded.value;
            documentInfoExpanded.value = editorBuildInfoStore ? editorBuildInfoStore.setExpanded(next) : next;
            if (!next) descriptionReaderOpen.value = false;
        }
        // Read more's sheet (DescriptionReaderSheet); it closes when another
        // build opens, so it never reopens on its own.
        const descriptionReaderOpen = ref(false);
        watch(() => documentInfo.value && documentInfo.value.documentId, () => { descriptionReaderOpen.value = false; });
        // Bumped on every document state change and read by getActionContext() so Vue
        // tracks it: otherwise the sidebar's groups and undo/redo would stay cached
        // when a group is created.
        const documentVersion = ref(0);
        // See inside (finding 2 of docs/reviews/CreativeDirection-2026-10-12b.md):
        // the build cut away above its ground floor, so its rooms show from the
        // Editor's camera. Kept fitted to the build as it changes.
        const seeInside = ref(false);
        function toggleSeeInside() {
            seeInside.value = editorSession.setSeeInside(!seeInside.value);
        }
        watch(documentVersion, () => { if (seeInside.value) editorSession.refreshSeeInside(); });
        const unwatchSeeInside = editorSession.onCommandActivity(() => { if (seeInside.value) editorSession.refreshSeeInside(); });
        // A visit that edited, once a page load (core/app/VisitorCount.js,
        // EDITOR_EDIT): the visitor's own edit, an undo or redo not one.
        const unwatchFirstEdit = funnelEventCounter
            ? editorSession.onCommandActivity((activity) => { if (activity === EDITOR_ACTIVITY.EXECUTED) funnelEventCounter.editedInEditor(); })
            : null;
        // Each step's brick to its place; done, or another build opened, and
        // bricks go wherever they are put.
        watch(starterGuide, (guide) => editorContext.setPlacementGuide(guide));
        const { buildPlot, buildPlotPublished, startBuildPlot, onBuildPlotPublished, forgetBuildPlot, visitBuildPlot } = useBuildPlot({
            documentManager, documentVersion, router, feedback
        });
        const { walkInside, walkInsidePublished } = useWalkInside({ documentManager, registry, documentVersion });
        // The passphrase reminder (ProtectIdentityNote) waits for a second
        // publish when the identity was made during this visit, as a first
        // publish's quick start makes one: that publish's moment is one
        // celebration, not three bars (docs/reviews/CreativeDirection-2026-10-12b.md,
        // finding 6).
        function currentIdentityId() {
            try {
                const session = identityUseCase.currentSession();
                return session && session.isAuthenticated ? session.identityId : null;
            } catch {
                return null;
            }
        }
        const identityAtStart = currentIdentityId();
        let publishesThisVisit = 0;
        const protectNoteDue = ref(false);
        function onPublished(publication) {
            publishesThisVisit += 1;
            const identityId = currentIdentityId();
            protectNoteDue.value = publishesThisVisit > 1 || (identityId !== null && identityId === identityAtStart);
            const publishedWorld = documentManager.document?.world;
            funnelEventCounter?.publishedBuild(publication, worldBrickCount(publishedWorld), readyMadeBricks?.placedCount(publishedWorld));
            onDocumentPublished(publication);
            onPublishedForNotes(publication);
            onBuildPlotPublished(publication);
            walkInsidePublished(publication);
            if (starterJob.value && starterJob.value.worldId === publishedWorld?.id) {
                starterJob.value = { ...starterJob.value, published: true };
            }
        }
        let unsubDocumentState = null;

        // The EditorEntryContext a fork arrived with, kept for as long as that fork is
        // the open document (for "Back to World"). Cleared as soon as another document
        // opens; never persisted.
        const entryContext = ref(null);
        let arrivalDocumentId = null;
        // Set on unmount, so a fork that finishes late opens nothing.
        let unmounted = false;

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

        // A built-in structure's name in the chosen language, for "Remixed
        // from …"; null for one this registry doesn't hold (a personal
        // blueprint), which the panel shows by a short id instead.
        function structureName(structureId) {
            return structureId && structureRegistry.has(structureId) ? libraryItemName(structureRegistry.get(structureId)) : null;
        }

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
                documentId: document.world.id,
                title: document.metadata.title || 'Untitled',
                description: document.metadata.description || '',
                tags: document.metadata.tags,
                author: document.metadata.author,
                authorIdentityId: document.metadata.authorIdentityId || null,
                builtWith: document.metadata.builtWith,
                license: document.metadata.license,
                placementPolicy: document.metadata.placementPolicy,
                parentDocumentId: document.metadata.parentDocumentId,
                parentStructureId: document.metadata.parentStructureId,
                parentStructureName: structureName(document.metadata.parentStructureId),
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
        // recoverDocument() so a failure never leaves a stale banner. Discarding
        // another build's work offers the next, if any.
        function discardRecovery() {
            if (!recoveryStatus.value) {
                return;
            }
            const { documentId, otherBuild } = recoveryStatus.value;
            try {
                discardRecoveryUseCase.execute(documentId);
                recoveryObserver.clear();
                feedback.show(t('editor.discarded'));
            } catch (e) {
                feedback.show(t('editor.discardFailed', { error: errorText(e) }));
                return;
            }
            if (otherBuild) offerUnsavedWork();
        }

        // Every visit starts a new document, so work left unsaved when the page
        // closed belongs to a build that isn't open: offered here, on the same
        // banner, rather than only when that build is opened again.
        function offerUnsavedWork() {
            try {
                const status = findUnsavedWorkUseCase.execute({ excludeDocumentId: documentManager.document?.world.id ?? null });
                if (status) recoveryObserver.offer(status);
            } catch (e) {
                // Recovery is a courtesy on top of editing, never a gate in front of it.
                console.error('Recovery: could not look for unsaved work', e);
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

        function onSaveMetadata({ title, description, tags, license, placementPolicy }) {
            updateDocumentMetadataUseCase.execute(documentManager, { title, description, tags, license, placementPolicy });
            showMetadataEditor.value = false;
            feedback.show(t('editor.propertiesUpdated'));
        }

        const firstBuildGuide = useFirstBuildGuide({
            registry,
            editorSession,
            isExperienced: () => loadDocumentUseCase.listSavedDocuments().length > 0
        });

        const paletteOpen = ref(false);
        // Describe the Build's text, shown and read out until closed.
        const buildDescriber = inject('buildDescriber', null) || new BuildDescriber();
        const buildDescriptionNote = ref('');
        // The build's remix origin, for suggestions: what it changed from the
        // structure or published build it was copied from, and that one's title.
        const contentStore = inject('publicationContentStore', null);
        async function remixOrigin(document, bricks) {
            const metadata = document?.metadata;
            const structure = metadata?.parentStructureId ? structureRegistry.get(metadata.parentStructureId) : null;
            if (structure) {
                return { changes: await buildDescriber.remixChanges(structure.bricks, bricks), parentTitle: libraryItemName(structure) };
            }
            const parentDocumentId = metadata?.parentDocumentId;
            if (!parentDocumentId) return { changes: null, parentTitle: null };
            let parents = [];
            try {
                parents = lookupDiscoveryProvider.findByDocumentId(parentDocumentId) || [];
            } catch {
                parents = [];
            }
            const remix = { parentDocumentId, publishedAt: new Date().toISOString() };
            const parent = remixParentPublication(remix, parents);
            const credited = metadata?.license?.attribution?.sourceDocumentId === parentDocumentId ? metadata.license.attribution.title : null;
            return {
                changes: parent ? await buildDescriber.remixChangesOf(remix, bricks, { parentPublications: parents, contentStore }) : null,
                parentTitle: parent?.title || credited || null
            };
        }
        // Build Properties' Suggest: titles and a description from the bricks.
        async function suggestForBuild(currentTitle = '') {
            const document = documentManager.document;
            const bricks = worldBricks(document?.world);
            const facts = await buildDescriber.describe(bricks);
            const { changes, parentTitle } = await remixOrigin(document, bricks);
            return {
                titles: titleSuggestions({ facts, changes, parentTitle, currentTitle }),
                description: descriptionSuggestion({ facts, changes, parentTitle })
            };
        }

        // A request in plain words in the command palette
        // (core/building/PlainCommand.js): what it would do, as a row the
        // palette shows first, or null when it isn't one.
        const plainVocabulary = plainCommandVocabulary();
        function planPlainCommand(query) {
            const plan = interpretPlainCommand(query, plainVocabulary);
            if (!plan) return guideQuestion(query);
            const { target } = plan;
            const predicate = target.kind === 'part'
                ? (brick) => brickPart(brick.definitionId, registry.get(brick.definitionId)) === target.part
                : (target.kind === 'everything' ? () => true : null);
            const count = predicate ? editorSession.bricksWhere(predicate).length : selectionCount.value;
            const things = target.kind === 'part'
                ? t(`buildDescription.part.${target.part}`, { count })
                : t(target.kind === 'everything' ? 'plainCommand.everything' : 'plainCommand.selected', { count });
            return {
                label: t(`plainCommand.${plan.intent}`, { things, colour: plan.colour ? t(`villagePalette.${plan.colour}`) : '' }),
                enabled: count > 0,
                reason: count > 0 ? null : t(target.kind === 'selection' ? 'plainCommand.nothingSelected' : 'plainCommand.nothingFound'),
                run: () => runPlainCommand(plan, predicate)
            };
        }
        // A question (ending in "?"), or words no action matches, can be asked
        // of the user guide on the Help page.
        function guideQuestion(query) {
            const text = String(query || '').trim();
            if (text.length < 3) return null;
            if (!/[?？]$/.test(text) && actionRegistry.findMatching(text, t).length > 0) return null;
            return {
                heading: t('help.title'),
                label: t('help.askGuide', { question: text }),
                enabled: true,
                reason: null,
                run: () => router.push({ path: '/help', query: { q: text } })
            };
        }
        function runPlainCommand(plan, predicate) {
            if (predicate && editorSession.selectWhere(predicate) === 0) return;
            if (plan.intent === 'paint') {
                const swatch = VILLAGE_PALETTE.find(({ id }) => id === plan.colour);
                if (swatch && !editorSession.recolorSelection(swatch.color)) feedback.show(t('plainCommand.cannotPaint'));
            } else if (plan.intent === 'delete') {
                editorSession.deleteSelection();
            }
            documentVersion.value++;
        }

        // Voice building: what was said, done as the palette would do it.
        function actOnVoice(text) {
            const plan = planPlainCommand(text);
            if (plan && !plan.heading) {
                if (!plan.enabled) return { kind: 'disabled', label: plan.label, reason: plan.reason };
                plan.run();
                return { kind: 'done', label: plan.label };
            }
            // By its name, by the phrasings World View hears for undo and
            // redo, or by what it sounds like ("and do that" is Undo).
            const action = actionSaid(text, actionRegistry.getAll().filter(({ id }) => id !== 'ui.voice'), {
                toText: t,
                aliases: {
                    'history.undo': splitWordList(t('worldVoice.words.undo')),
                    'history.redo': splitWordList(t('worldVoice.words.redo'))
                }
            });
            if (action) {
                const context = getActionContext();
                if (!action.enabled(context)) {
                    return { kind: 'disabled', label: t(action.label), reason: displayText(action.disabledReason?.(context)) || '' };
                }
                actionRegistry.execute(action.id, context);
                return { kind: 'done', label: t(action.label) };
            }
            return plan ? { kind: 'question' } : { kind: 'unknown' };
        }
        const voiceCommands = useVoiceCommands({ act: actOnVoice });
        function askGuideAbout(question) {
            voiceCommands.closeVoice();
            router.push({ path: '/help', query: { q: question } });
        }

        const actionUi = {
            toggleVoice: () => voiceCommands.toggleVoice(),
            async describeBuild() {
                buildDescriptionNote.value = '';
                try {
                    const facts = await buildDescriber.describe(worldBricks(documentManager.document?.world));
                    buildDescriptionNote.value = buildDescriptionText(facts);
                } catch (error) {
                    feedback.show(errorText(error));
                }
            },
            togglePalette() {
                paletteOpen.value = !paletteOpen.value;
            },
            showFirstBuildGuide() {
                firstBuildGuide.showFirstBuildGuide();
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
        // The T key while placing: lays the piece about to be placed on its next side.
        function tiltTouchPlacement() {
            editorSession.onKeyDown({ key: 't' });
            feedback.show(t('editor.touchTilted'));
        }
        // Whether the piece being placed shows its ghost: the touch bar's Place
        // has something to put down. Kept by the preview events (onMounted).
        const placementGhost = ref(false);
        function refreshPlacementGhost() {
            placementGhost.value = editorSession.hasPlacementGhost();
        }
        function confirmTouchPlacement() {
            editorSession.confirmPlacement();
            refreshSelectedPlacementInfo();
        }
        function cancelTouchPlacement() {
            editorSession.cancelPlacement();
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
            soundAvailable, soundMuted, soundVolume, soundMusic, startSound, stopSound, toggleSound, setSoundVolume, toggleSoundMusic, onSoundKeyDown, sound
        } = useSoundControls(() => (typeof createEditorSound === 'function' ? createEditorSound({ editorSession }) : null));

        function onDocumentSaved() {
            firstBuildGuide.firstBuildSaved();
            const service = sound();
            if (service) {
                service.saved();
            }
        }

        onMounted(() => {
            editorSession.start(viewport.value);
            startSound();
            // A click on a blocked spot (the ghost tinted red) is said here and
            // heard through the sound service, so it isn't taken for a missed click.
            unsubPlacementBlocked = editorSession.onPlacementBlocked(() => {
                feedback.show(t(touchInput.value ? 'editor.touchPlacementBlocked' : 'editor.placementBlocked'));
            });
            unsubPlacementGhost = [
                EditorEvent.TOOL_CHANGED, EditorEvent.PREVIEW_CHANGED,
                EditorEvent.STRUCTURE_PREVIEW_CHANGED, EditorEvent.COMPOSITION_PREVIEW_CHANGED
            ].map((event) => editorContext.eventBus.subscribe(event, refreshPlacementGhost));
            firstBuildGuide.followFirstBuildEdits();
            // The Editor opened, whichever way in (core/app/VisitorCount.js, EDITOR_OPEN).
            funnelEventCounter?.openedEditor();

            unsubTool = editorContext.eventBus.subscribe(
                EditorEvent.TOOL_CHANGED,
                ({ activeTool: t }) => {
                    activeTool.value = t;
                    // Picking something to place closes the drawer, so the tap that places
                    // it can reach the scene.
                    if (compactLayout.value && PLACING_TOOLS.has(t)) {
                        sidebarOpen.value = false;
                    }
                    // Box selects; while placing, the touch bar hides it, so it
                    // can't be left on to hold the camera still.
                    if (PLACING_TOOLS.has(t) && touchBoxSelect.value) {
                        touchBoxSelect.value = false;
                        editorSession.setTouchBoxSelect(false);
                        if (editorSession.cancelMarquee()) updateMarqueeRect();
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

            // Opening something on purpose (a link, a ready-made build, a plot)
            // isn't the moment to bring back other work.
            const opensSomething = ['together', 'fork', 'load', 'plot', 'challenge', 'start']
                .some((key) => route.query[key]);
            if (!opensSomething) offerUnsavedWork();

            if (route.query.together) {
                // A Build with me link: the friend's build, asked of their Editor.
                buildTogether.joinFromRoute(route.query);
                router.replace({ path: '/editor' });
            } else if (route.query.fork) {
                const sourceDocumentId = route.query.fork;
                // Decoded before the try because both outcomes need it: openDocument() on
                // success and the return address on failure.
                const decodedEntryContext = editorEntryContextFromQuery(route.query, sourceDocumentId);
                let sourcePublication = null;
                const openFork = (forkedDocument) => {
                    editorSession.openDocument(forkedDocument, decodedEntryContext);
                    afterForkOpened();
                    // A copy made on a shared link's screen has no spot to look at,
                    // so it is seen whole, as a ready-made build is.
                    if (decodedEntryContext && !decodedEntryContext.focusPosition) editorSession.frameDocument();
                    funnelEventCounter?.forked(sourceDocumentId);
                    // Set only after openDocument() succeeds.
                    entryContext.value = decodedEntryContext;
                    arrivalDocumentId = decodedEntryContext ? forkedDocument.world.id : null;
                    // Transient arrival message, naming what was being looked at when known.
                    feedback.show(decodedEntryContext && decodedEntryContext.title
                        ? t('editor.editingCopy', { title: decodedEntryContext.title })
                        : t('editor.forkCreated', { title: forkedDocument.metadata.title }));
                };
                try {
                    if (route.query.publication) {
                        sourcePublication = findPublicationUseCase.execute(route.query.publication);
                    }
                    openFork(forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication));
                } catch (err) {
                    // A failed fork shows a dialog with the reason and a way back to where the
                    // viewer came from, instead of a transient toast.
                    const showForkFailure = (err) => {
                        forkFailure.value = {
                            reason: err.reason || null,
                            returnWorldId: (decodedEntryContext && decodedEntryContext.returnWorldId) || sourceDocumentId,
                            focusLocationId: (decodedEntryContext && decodedEntryContext.focusLocationId) || null
                        };
                    };
                    if (forkDocumentUseCase.isWaitingForStorage(err)) {
                        // Someone else's published build, still on disk: forked once loaded.
                        forkDocumentUseCase.executeWhenLoaded(sourceDocumentId, identityProvider, sourcePublication).then(
                            (forkedDocument) => { if (!unmounted) openFork(forkedDocument); },
                            (loadError) => { if (!unmounted) showForkFailure(loadError); }
                        );
                    } else {
                        showForkFailure(err);
                    }
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
            } else if (route.query.plot) {
                // Build here from World View: a new build for that spot, started from
                // a ready-made structure when the link names one (a resident's Build there).
                const structure = typeof route.query.start === 'string' ? findStarterStructure(structureRegistry, route.query.start) : null;
                if (!startBuildPlot(route.query, editorSession, { structure })) feedback.show(t('buildPlot.invalid'));
                router.replace({ path: '/editor' });
            } else if (route.query.challenge && !route.query.start) {
                // Join from Home or the challenge page: the week's empty plot.
                if (!startChallengePlot(challengeById(String(route.query.challenge)))) feedback.show(t('challenge.cannotJoin'));
                router.replace({ path: '/editor' });
            } else if (route.query.start) {
                // A ready-made build from Home: a built-in structure, opened as a new
                // document of the visitor's own, the fork the Build Library makes.
                const structure = findStarterStructure(structureRegistry, route.query.start);
                // Joining a week's challenge (the challenge page, Home) also tags the copy.
                const challenge = typeof route.query.challenge === 'string' ? challengeById(route.query.challenge) : null;
                // Home's main button: the House with its job left to do (core/challenge/StarterJob.js).
                const job = starterJobById(route.query.job);
                const unfinished = job ? unfinishedStructure(job, structure) : null;
                if (structure && editorSession.forkStructure(unfinished || structure)) {
                    editorSession.frameDocument();
                    funnelEventCounter?.openedStarter();
                    startStarterJob(unfinished ? job : null, structure);
                    // With a job, its card is the one tutor: no toast repeats it.
                    if (!unfinished && !joinChallenge(challenge)) {
                        feedback.show(t('editor.startedFromBuild', { name: libraryItemName(structure) }));
                    }
                } else {
                    feedback.show(t('editor.starterNotFound'));
                }
                router.replace({ path: '/editor' });
            }

            onPointerDown = (event) => {
                editorSession.onPointerDown(event);
                updateMarqueeRect();
            };
            viewport.value.addEventListener('pointerdown', onPointerDown);
            onPointerMove = (event) => {
                buildTogether.notePointer(event);
                const result = editorSession.onPointerMove(event);
                // Only a consumed result carries feedback; a plain hover must not blank it.
                if (result) {
                    transformFeedback.value = result.feedback || null;
                }
                updateMarqueeRect();
            };
            viewport.value.addEventListener('pointermove', onPointerMove);
            viewport.value.addEventListener('pointerleave', buildTogether.notePointerLeft);
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
                // New's dialog owns the keyboard while it is open; it closes itself on Escape.
                if (newDocumentDialog.value) {
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
                // 4.55. And Tilt (T) for the brick about to be placed.
                if (activeTool.value === ToolId.PLACE && event.key.toLowerCase() === 't') {
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
            unwatchStarterJob?.();
            unwatchSeeInside?.();
            unwatchFirstEdit?.();
            unmounted = true;
            if (unsubTool) {
                unsubTool.unsubscribe();
            }
            unsubPlacementBlocked?.();
            unsubPlacementGhost.forEach((subscription) => subscription.unsubscribe());
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
            viewport.value.removeEventListener('pointerleave', buildTogether.notePointerLeft);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            stopSound();
            editorSession.dispose();
            // Created per mount, so dispose it to avoid leaking bus subscriptions.
            if (unsubscribeBuildCredits) unsubscribeBuildCredits();
            if (documentCommandPropagation) {
                documentCommandPropagation.dispose();
            }
            if (documentOperationRecovery) {
                documentOperationRecovery.dispose();
            }
        });

        return {
            t,
            displayText,
            buildDescriptionNote,
            ...voiceCommands,
            askGuideAbout,
            suggestForBuild,
            planPlainCommand,
            ...buildTogether,
            soundAvailable,
            soundMuted,
            soundVolume,
            soundMusic,
            toggleSound,
            setSoundVolume,
            toggleSoundMusic,
            onDocumentSaved,
            viewport,
            touchInput,
            compactLayout,
            sidebarOpen,
            touchMultiSelect,
            toggleTouchMultiSelect,
            touchBoxSelect,
            toggleTouchBoxSelect,
            runTouchAction,
            rotateTouchPlacement, tiltTouchPlacement,
            placementGhost, confirmTouchPlacement, cancelTouchPlacement,
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
            modelExportOpen, exportModel,
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
            newDocumentDialog, openNewDocumentDialog, startEmptyDocument, startFromStructure, startFromChallenge,
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
            onPublished, protectNoteDue, seeInside, toggleSeeInside, buildPlot, buildPlotPublished, forgetBuildPlot, visitBuildPlot,
            ...firstBuildGuide,
            pinnedStructures, pinnedTitle, starterCardStage, starterStep, pickStarterJobBrick, publishFromStarterCard, hideStarterCard, toolbar,
            walkInside,
            distributePublishedDocument,
            distributePublishedDocumentAndSnapshot,
            canRemember, rememberChoice, setRememberChoice, sendStatus, sendDestinationName, sendError,
            noteStatus, retryNote, letEveryoneFind, keepToLinks,
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
            documentInfoExpanded,
            toggleDocumentInfo,
            descriptionReaderOpen,
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
