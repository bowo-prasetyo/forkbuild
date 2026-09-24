import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../../application/CreateStructureRegistryUseCase.js';
import { CreatePersonalStructureLibraryUseCase } from '../../application/CreatePersonalStructureLibraryUseCase.js';
import { CreateLibraryUsageHistoryUseCase } from '../../application/CreateLibraryUsageHistoryUseCase.js';
import { LoadFailureReason } from '../../application/LoadFailureReason.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/CreateToolRegistryUseCase.js';
import { CreateDocumentManagerUseCase } from '../../application/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/CreatePersistenceUseCase.js';
import { AutosaveScheduler } from '../../application/AutosaveScheduler.js';
import { RecoveryObserver } from '../../application/RecoveryObserver.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/PaletteUseCase.js';
import { PreviewUseCase } from '../../application/PreviewUseCase.js';
import { StructurePreviewUseCase } from '../../application/StructurePreviewUseCase.js';
import { CompositionPreviewUseCase } from '../../application/CompositionPreviewUseCase.js';
import { CreateLibraryPreviewUseCase } from '../../application/CreateLibraryPreviewUseCase.js';
import { EditorSession } from '../../application/EditorSession.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import { EditorEvent } from '../../core/events/EditorEvent.js';
import { EditorActionRegistry, createStandardActions } from '../../application/EditorActionRegistry.js';
import { EditorActionContext } from '../../application/EditorActionContext.js';
import { InputRouter } from '../../application/InputRouter.js';
import Toolbar, { SAVE_FAILURE_MESSAGE } from '../components/Toolbar.js';
import BuildLibraryPanel from '../components/BuildLibraryPanel.js';
import EditingSidebar from '../components/EditingSidebar.js';
import StructureInstancePanel from '../components/StructureInstancePanel.js';
import SelectionInspector from '../components/SelectionInspector.js';
import CommandPalette from '../components/CommandPalette.js';
import KeyboardShortcutsOverlay from '../components/KeyboardShortcutsOverlay.js';
import ActionFeedback from '../components/ActionFeedback.js';
import RecoveryBanner from '../components/RecoveryBanner.js';
import TransformFeedback from '../components/TransformFeedback.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';
import { sanitizeDistributionErrorMessage } from '../../application/DistributionErrorMessageSanitizer.js';
import { IpfsRemotePublicationState } from '../../application/IpfsRemotePublicationState.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { CreateBlueprintAttributionUseCase } from '../../application/CreateBlueprintAttributionUseCase.js';
import { CreateBlueprintLineageUseCase } from '../../application/CreateBlueprintLineageUseCase.js';
import { CreateCommandRegistryUseCase } from '../../application/CreateCommandRegistryUseCase.js';
import { DocumentCommandPropagationUseCase } from '../../application/DocumentCommandPropagationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../../application/DocumentOperationRecoveryUseCase.js';
import { CopySelectionUseCase } from '../../application/CopySelectionUseCase.js';
import { RepeatSelectionUseCase } from '../../application/RepeatSelectionUseCase.js';
import { PasteClipboardUseCase } from '../../application/PasteClipboardUseCase.js';
import { UpdateDocumentMetadataUseCase } from '../../application/UpdateDocumentMetadataUseCase.js';
import { computeLifecycleStatus, describeLifecycleStatus } from '../../application/DocumentLifecycleStatus.js';
import DocumentInfoPanel from '../components/DocumentInfoPanel.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';
import CreateBlueprintDialog from '../components/CreateBlueprintDialog.js';
import StructureInfoPanel from '../components/StructureInfoPanel.js';
import ForkFailureDialog from '../components/ForkFailureDialog.js';
import EditorDistributionDialog from '../components/EditorDistributionDialog.js';
import { editorEntryContextFromQuery } from '../../core/EditorEntryContext.js';
import { deriveBlueprintFingerprint, describeBlueprintFingerprint } from '../../core/BlueprintFingerprint.js';
import { BLUEPRINT_ATTRIBUTION_KIND } from '../../core/BlueprintAttribution.js';
import { BLUEPRINT_LINEAGE_CLAIM_KIND } from '../../core/BlueprintLineageClaim.js';
import { compareBlueprintSimilarity, isPossibleLineageCandidate } from '../../core/BlueprintSimilarity.js';

// Editing shortcuts come from EditorActionRegistry, shared with the palette,
// the sidebar and the controls docs. Escape priority: text input > shortcuts
// overlay > palette > gizmo gesture > marquee > selection. Tool switching
// (1/2), Ctrl+S and '?' stay view-local: they are not editing actions.

const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

function slugify(text, fallback) {
    return (text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

// Downloads `data` as pretty-printed JSON, with no intermediate modal.
function downloadJson(filename, data) {
    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    link.download = filename;
    link.click();
}

export default {
    name: 'EditorView',
    components: { Toolbar, BuildLibraryPanel, EditingSidebar, StructureInstancePanel, SelectionInspector, CommandPalette, KeyboardShortcutsOverlay, ActionFeedback, RecoveryBanner, DocumentInfoPanel, MetadataEditorDialog, CreateBlueprintDialog, StructureInfoPanel, TransformFeedback, ForkFailureDialog, EditorDistributionDialog },
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
                @back-to-world="backToWorld"
                @open-shortcuts="shortcutsOpen = true"
                @published="onDocumentPublished"
                @export-document="exportDocument"
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
                    <span class="editor-post-publish-message">Publication published successfully.</span>

                    <!-- Opens EditorDistributionDialog, which holds every storage/substrate choice. -->
                    <button
                        v-if="canDistributeSnapshot || canDistributePublication"
                        type="button"
                        class="action-btn action-btn--primary editor-post-publish-distribute-trigger"
                        @click="distributionDialogOpen = true"
                    >Distribute</button>
                    <button
                        type="button"
                        class="action-btn action-btn--secondary editor-post-publish-dismiss-btn"
                        @click="dismissPublishAction"
                    >Dismiss</button>
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
                    @close="distributionDialogOpen = false"
                    @distribute-both="distributePublishedDocumentAndSnapshot"
                    @distribute-publication="distributePublishedDocument"
                    @distribute-snapshot="distributePublishedSnapshot"
                    @view-in-repository="viewDistributedPublicationInRepository"
                />
            </div>
            <div class="editor-body">
                <div class="sidebar">
                  <div class="sidebar-scroll">
                    <div class="tool-switcher">
                        <button
                            :class="['tool-btn', { 'tool-btn--active': activeTool === ToolId.SELECT }]"
                            @click="setTool(ToolId.SELECT)"
                        >
                            Select
                        </button>
                        <button
                            :class="['tool-btn', { 'tool-btn--active': activeTool === ToolId.PLACE }]"
                            @click="setTool(ToolId.PLACE)"
                        >
                            Place
                        </button>
                    </div>
                    <p v-if="activeTool === ToolId.PLACE" class="placement-hint">
                        Hover the ground, R to rotate, click to place.
                    </p>
                    <p v-if="activeTool === ToolId.PLACE_STRUCTURE" class="placement-hint">
                        Placing "{{ activeStructureTitle }}" — hover the ground, R to rotate, click to place.
                    </p>
                    <p v-if="activeTool === ToolId.COMPOSE_STRUCTURE" class="placement-hint">
                        Placing "{{ activeCompositionTitle }}" — hover the ground, R to rotate, click to place, Esc to cancel.
                    </p>
                    <DocumentInfoPanel :info="documentInfo" @edit-metadata="showMetadataEditor = true" />
                    <StructureInstancePanel
                        v-if="selectedPlacementInfo"
                        :info="selectedPlacementInfo"
                        @rotate="rotateSelectedPlacement"
                        @duplicate="duplicateSelectedPlacement"
                        @delete="deleteSelectedPlacement"
                        @edit-source="editSelectedPlacementSource"
                        @apply-transform="applySelectedPlacementTransform"
                    />
                    <SelectionInspector
                        v-if="selectionSummary"
                        :registry="actionRegistry"
                        :get-context="getActionContext"
                        :summary="selectionSummary"
                        :recolor="recolorSelection"
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
                        @inspect-structure="inspectStructure"
                        @fork-to-library="forkStructureToLibrary"
                    />
                    <EditingSidebar
                        :registry="actionRegistry"
                        :get-context="getActionContext"
                        :ui="actionUi"
                        :selection-count="selectionCount"
                        :is-structure-placement-selection="selectionIsStructurePlacement"
                        :apply-numeric="applyNumericTransform"
                        :align="alignSelection"
                        :distribute="distributeSelection"
                        :repeat="repeatSelection"
                        :select-group="selectGroup"
                    />
                  </div>
                </div>
                <div :style="{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }">
                    <div ref="viewport" class="viewport"></div>
                    <div
                        v-if="marqueeRect"
                        class="marquee-rect"
                        :style="{ left: marqueeRect.left + 'px', top: marqueeRect.top + 'px', width: marqueeRect.width + 'px', height: marqueeRect.height + 'px' }"
                    ></div>
                    <TransformFeedback :feedback="transformFeedback" />
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
                @claim-lineage="claimLineage"
                @export-lineage-claim="exportBlueprintLineageClaim"
                @close="inspectedStructure = null"
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
            saveDocumentUseCase, loadDocumentUseCase, forkDocumentUseCase, structureDocumentResolver,
            autosaveDocumentUseCase, recoverDocumentUseCase, discardRecoveryUseCase, checkRecoveryUseCase
        } = new CreatePersistenceUseCase().execute();

        // Watches this view's documentManager; started and stopped with the view so an
        // unmounted Editor never autosaves.
        const autosaveScheduler = new AutosaveScheduler(autosaveDocumentUseCase, documentManager);
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

		// Built-in structures never change at runtime, so this is read once.
		const structureGroups = ref(structureRegistry.groupByCategory());

		// Changes at runtime, so it is refreshed after save, rename or remove.
		const personalStructureGroups = ref(personalStructureLibraryStore.groupByCategory());
		// Used only by the 'recent' sort; refreshed with the personal library.
		const personalSavedAtById = ref(personalStructureLibraryStore.getSavedAtById());
		function refreshPersonalStructureGroups() {
		    personalStructureGroups.value = personalStructureLibraryStore.groupByCategory();
		    personalSavedAtById.value = personalStructureLibraryStore.getSavedAtById();
		}

		// Resolves recent ids against whichever library still has them (renames keep
		// their id); ids that are gone are dropped. The one place that decides
		// built-in vs. personal for a recent id.
		function resolveRecentStructures() {
		    const ids = libraryUsageHistoryStore.listRecent(5);
		    const resolved = [];
		    for (const id of ids) {
		        const personal = personalStructureLibraryStore.getStructure(id);
		        if (personal) {
		            resolved.push({ structure: personal, source: 'personal' });
		            continue;
		        }
		        const builtIn = structureRegistry.get(id);
		        if (builtIn) {
		            resolved.push({ structure: builtIn, source: 'built-in' });
		        }
		    }
		    return resolved;
		}
		const recentStructures = ref(resolveRecentStructures());
		function refreshRecentStructures() {
		    recentStructures.value = resolveRecentStructures();
		}

		function renamePersonalStructure(structure) {
		    const name = prompt('Rename structure:', structure.name);
		    if (name === null || !name.trim()) {
		        return;
		    }
		    personalStructureLibraryStore.updateStructureMetadata(structure.id, { name: name.trim() });
		    refreshPersonalStructureGroups();
		    refreshRecentStructures();
		    feedback.show(`Renamed to "${name.trim()}"`);
		}

		function removePersonalStructure(structure) {
		    // Removing from the library never touches documents that already used it.
		    personalStructureLibraryStore.removeStructure(structure.id);
		    refreshPersonalStructureGroups();
		    refreshRecentStructures();
		    feedback.show(`Removed "${structure.name}" from My Structures`);
		}

		function forkStructure(structure) {
		    const forked = editorSession.forkStructure(structure);
		    if (forked) {
		        feedback.show(`Forked "${structure.name}" — now editing your own copy`);
		    }
		}

		// Forks a built-in Structure into a new personal Structure (forkStructure()
		// opens a new Document instead).
		function forkStructureToLibrary(structure) {
		    const forked = editorSession.forkStructureToPersonalLibrary(structure);
		    if (forked) {
		        refreshPersonalStructureGroups();
		        feedback.show(`"${forked.name}" added to My Structures`);
		    }
		}

		// Exports the blueprint as a download, bundling the attributions and lineage
		// claims this replica has for it. The BuildLibraryPanel event is still named
		// 'export-personal-structure'.
		function exportStructure(structure) {
		    let pkg;
		    try {
		        const { attributions } = blueprintAttributionUseCase.summarize(structure);
		        const lineageClaims = blueprintLineageUseCase.claimsForBlueprint(structure);
		        pkg = editorSession.exportBlueprint(structure, attributions, lineageClaims);
		    } catch (e) {
		        feedback.show(e.message);
		        return;
		    }
		    if (!pkg) {
		        return;
		    }
		    downloadJson(`forkbuild-blueprint-${slugify(structure.name, 'structure')}.json`, pkg);
		    feedback.show(`Exported "${structure.name}" as a blueprint`);
		}

		// Filename follows the `forkbuild-<kind>-<slug>.json` convention.
		function exportDocument() {
			let json;
			try {
				json = editorSession.exportDocument();
			} catch (e) {
				feedback.show(e.message);
				return;
			}
			if (!json) {
				return;
			}
			const title = documentManager.document.metadata.title || '';
			downloadJson(`forkbuild-document-${slugify(title, 'document')}.json`, json);
			feedback.show(`Exported "${title || 'document'}"`);
		}

		// `rawText` is untrusted. JSON parse errors and invalid documents are reported
		// separately; either leaves the open document and storage untouched. On
		// success the imported document opens like a fork.
		function importDocument(rawText) {
			let json;
			try {
				json = JSON.parse(rawText);
			} catch (e) {
				feedback.show('That is not valid JSON — choose a file exported with "Export."');
				return;
			}
			try {
				const imported = editorSession.importDocument(json);
				if (!imported) {
					return;
				}
				feedback.show(`Imported "${imported.metadata.title || 'document'}"`);
			} catch (e) {
				feedback.show(e.message.replace(/^DocumentSerializer:\s*/, ''));
			}
		}

		// Exports one attribution on its own; only reachable when `attribution.mine`
		// exists.
		function exportBlueprintAttribution(attribution) {
		    let pkg;
		    try {
		        pkg = editorSession.exportBlueprintAttribution(attribution);
		    } catch (e) {
		        feedback.show(e.message);
		        return;
		    }
		    if (!pkg) {
		        return;
		    }
		    downloadJson(`forkbuild-blueprint-attribution-${slugify(describeBlueprintFingerprint(attribution.fingerprint), 'attribution')}.json`, pkg);
		    feedback.show('Exported your attribution');
		}

		// `rawText` is untrusted, parsed and validated in two separate steps. It may be
		// a blueprint package or a bare attribution or lineage claim; `pkg.kind`
		// decides which path runs.
		function importBlueprint(rawText) {
		    let pkg;
		    try {
		        pkg = JSON.parse(rawText);
		    } catch (e) {
		        feedback.show('That is not valid JSON — choose a file exported with "Export Blueprint."');
		        return;
		    }
		    if (pkg && pkg.kind === BLUEPRINT_ATTRIBUTION_KIND) {
		        importBareBlueprintAttribution(pkg);
		        return;
		    }
		    if (pkg && pkg.kind === BLUEPRINT_LINEAGE_CLAIM_KIND) {
		        importBareBlueprintLineageClaim(pkg);
		        return;
		    }
		    try {
		        const structure = editorSession.importBlueprint(pkg);
		        if (structure) {
		            refreshPersonalStructureGroups();
		            const attributionSummary = importBundledBlueprintAttributions(pkg, structure);
		            const lineageSummary = importBundledBlueprintLineageClaims(pkg, structure);
		            feedback.show(`Imported "${structure.name}" into My Structures${attributionSummary}${lineageSummary}`);
		        }
		    } catch (e) {
		        feedback.show(e.message.replace(/^(BlueprintImport|BlueprintPackage):\s*/, ''));
		    }
		}

		// Each bundled attribution is cross-checked against the locally derived
		// fingerprint, never the one the package claims. A bad attribution never undoes
		// the successful blueprint import. Returns a feedback suffix or ''.
		function importBundledBlueprintAttributions(pkg, structure) {
		    if (!Array.isArray(pkg.attributions) || pkg.attributions.length === 0 || !blueprintAttributionExchange) {
		        return '';
		    }
		    let imported = 0;
		    for (const attributionJSON of pkg.attributions) {
		        try {
		            const result = editorSession.importBlueprintAttribution(attributionJSON, structure);
		            if (result && result.isNew) {
		                imported += 1;
		            }
		        } catch (e) {
		            console.warn('Skipped an attribution bundled with this blueprint:', e.message);
		        }
		    }
		    return imported > 0 ? ` with ${imported} attributed ${imported === 1 ? 'author' : 'authors'}` : '';
		}

		// A bare attribution has no local Structure to cross-check against; it is still
		// a legitimate, unconfirmed import. It never touches the personal library.
		function importBareBlueprintAttribution(pkg) {
		    if (!blueprintAttributionExchange) {
		        feedback.show('Blueprint attribution exchange is not available');
		        return;
		    }
		    try {
		        const { attribution, isNew } = editorSession.importBlueprintAttribution(pkg);
		        if (!isNew) {
		            feedback.show('That attribution was already known — nothing changed');
		            return;
		        }
		        feedback.show(`Imported an attribution for ${describeBlueprintFingerprint(attribution.fingerprint)}`);
		    } catch (e) {
		        feedback.show(e.message.replace(/^BlueprintAttributionExchange:\s*/, ''));
		    }
		}

		function exportBlueprintLineageClaim(claim) {
		    let pkg;
		    try {
		        pkg = editorSession.exportBlueprintLineageClaim(claim);
		    } catch (e) {
		        feedback.show(e.message);
		        return;
		    }
		    if (!pkg) {
		        return;
		    }
		    const fingerprints = `${describeBlueprintFingerprint(claim.sourceFingerprint)}-to-${describeBlueprintFingerprint(claim.derivedFingerprint)}`;
		    downloadJson(`forkbuild-blueprint-lineage-${slugify(fingerprints, 'lineage-claim')}.json`, pkg);
		    feedback.show('Exported your lineage claim');
		}

		// A bundled claim's structure may be its source or derived design; the matching
		// fingerprint decides which cross-check runs.
		function importBundledBlueprintLineageClaims(pkg, structure) {
		    if (!Array.isArray(pkg.lineageClaims) || pkg.lineageClaims.length === 0 || !blueprintLineageExchange) {
		        return '';
		    }
		    const structureFingerprint = deriveBlueprintFingerprint(structure);
		    let imported = 0;
		    for (const claimJSON of pkg.lineageClaims) {
		        try {
		            const options = claimJSON.derivedFingerprint === structureFingerprint
		                ? { derivedStructure: structure }
		                : { sourceStructure: structure };
		            const result = editorSession.importBlueprintLineageClaim(claimJSON, options);
		            if (result && result.isNew) {
		                imported += 1;
		            }
		        } catch (e) {
		            console.warn('Skipped a lineage claim bundled with this blueprint:', e.message);
		        }
		    }
		    return imported > 0 ? ` with ${imported} lineage ${imported === 1 ? 'claim' : 'claims'}` : '';
		}

		function importBareBlueprintLineageClaim(pkg) {
		    if (!blueprintLineageExchange) {
		        feedback.show('Blueprint lineage exchange is not available');
		        return;
		    }
		    try {
		        const { claim, isNew } = editorSession.importBlueprintLineageClaim(pkg);
		        if (!isNew) {
		            feedback.show('That lineage claim was already known — nothing changed');
		            return;
		        }
		        feedback.show(`Imported a lineage claim: ${describeBlueprintFingerprint(claim.derivedFingerprint)} derived from ${describeBlueprintFingerprint(claim.sourceFingerprint)}`);
		    } catch (e) {
		        feedback.show(e.message.replace(/^BlueprintLineageExchange:\s*/, ''));
		    }
		}

		// Enters the interactive preview mode; the copy happens when the tool commits.
		// Also the entry point for a structure card's plain click (docs/Principles.md,
		// "Buildable Things Share One Placement Experience").
		function copyStructureIntoDocument(structure) {
		    const started = editorSession.beginStructureComposition(structure);
		    if (started) {
		        feedback.show(`Placing "${structure.name}" — click to place, R to rotate, Esc to cancel`);
		        // Recorded on place intent, even if later cancelled; a stale entry is harmless.
		        libraryUsageHistoryStore.recordUse(structure.id);
		        refreshRecentStructures();
		    }
		}

		// The source ('built-in' | 'personal') is derived here, so the panel never
		// reaches into the libraries.
		const inspectedStructure = ref(null);
		const inspectedStructureSource = ref('built-in');
		// Recomputed each time the panel opens: fingerprints stay valid across new
		// Structure instances with new ids.
		const inspectedStructureAttribution = ref(null);
		const inspectedStructureLineage = ref(null);
		// Unsigned evidence only, never persisted and never a claim. Most similar first.
		const inspectedStructureSimilarityCandidates = ref([]);
		// Built-in plus personal designs, excluding the inspected one and any already
		// named as a source by a lineage claim.
		function computeSimilarityCandidates(structure, lineage) {
		    const alreadyClaimed = new Set((lineage && lineage.derivedFrom || []).map((claim) => claim.sourceFingerprint));
		    const known = [...structureRegistry.getAll(), ...personalStructureLibraryStore.listStructures()];
		    const candidates = [];
		    for (const candidate of known) {
		        if (candidate.id === structure.id) {
		            continue;
		        }
		        const evidence = compareBlueprintSimilarity(candidate, structure);
		        if (!isPossibleLineageCandidate(evidence) || alreadyClaimed.has(evidence.sourceFingerprint)) {
		            continue;
		        }
		        candidates.push({ structure: candidate, evidence });
		    }
		    candidates.sort((a, b) => b.evidence.similarity - a.evidence.similarity);
		    return candidates.slice(0, 3);
		}
		function inspectStructure(structure) {
		    inspectedStructure.value = structure;
		    inspectedStructureSource.value = personalStructureLibraryStore.hasStructure(structure.id) ? 'personal' : 'built-in';
		    inspectedStructureAttribution.value = blueprintAttributionUseCase.communityView(structure);
		    inspectedStructureLineage.value = blueprintLineageUseCase.lineageView(structure);
		    inspectedStructureSimilarityCandidates.value = computeSimilarityCandidates(structure, inspectedStructureLineage.value);
		}
		// Inspect only offers another way to reach Place/Export, never another way to
		// do them.
		function placeInspectedStructure() {
		    const structure = inspectedStructure.value;
		    inspectedStructure.value = null;
		    copyStructureIntoDocument(structure);
		}
		function exportInspectedStructure() {
		    const structure = inspectedStructure.value;
		    inspectedStructure.value = null;
		    exportStructure(structure);
		}
		// Refreshes the attribution afterwards so the panel shows "You" immediately.
		function claimAuthorship() {
		    const structure = inspectedStructure.value;
		    if (!structure) {
		        return;
		    }
		    try {
		        blueprintAttributionUseCase.publish(structure);
		        inspectedStructureAttribution.value = blueprintAttributionUseCase.communityView(structure);
		        feedback.show(`You are now credited as an author of "${structure.name}"`);
		    } catch (e) {
		        feedback.show(e.message.replace(/^BlueprintAttributionUseCase:\s*/, ''));
		    }
		}

		function exportInspectedAttribution() {
		    const attribution = inspectedStructureAttribution.value && inspectedStructureAttribution.value.mine;
		    if (!attribution) {
		        return;
		    }
		    exportBlueprintAttribution(attribution);
		}

		// Wraps the signed attribution in a signed DecentralizedPublication, catalogs
		// it and announces it to connected peers. No peers is not an error: it stays
		// cataloged. Announcing again is always a deliberate act.
		async function publishInspectedAttributionToNetwork() {
		    const attribution = inspectedStructureAttribution.value && inspectedStructureAttribution.value.mine;
		    if (!attribution) {
		        return;
		    }
		    try {
		        const publication = await publicationResolver.publish({
		            content: attribution,
		            contentKind: BLUEPRINT_ATTRIBUTION_KIND,
		            identityProvider
		        });
		        publicationCatalog.add(publication);
		        const peerCount = publicationPeerExchange.announce(publication);
		        feedback.show(peerCount > 0
		            ? `Published to the network — announced to ${peerCount} connected ${peerCount === 1 ? 'peer' : 'peers'}.`
		            : 'Published to the network — cataloged locally; no peers are connected to announce to right now.');
		    } catch (e) {
		        feedback.show(e.message.replace(/^PublicationResolver:\s*/, ''));
		    }
		}

		// Publishes a lineage claim for a candidate a person chose. The similarity
		// score is never consulted here: it is evidence for a person, never a
		// threshold.
		function claimLineage(sourceStructure) {
		    const structure = inspectedStructure.value;
		    if (!structure) {
		        return;
		    }
		    try {
		        blueprintLineageUseCase.publish(structure, sourceStructure);
		        inspectedStructureLineage.value = blueprintLineageUseCase.lineageView(structure);
		        inspectedStructureSimilarityCandidates.value = computeSimilarityCandidates(structure, inspectedStructureLineage.value);
		        feedback.show(`Recorded "${structure.name}" as derived from "${sourceStructure.name}"`);
		    } catch (e) {
		        feedback.show(e.message.replace(/^BlueprintLineageUseCase:\s*/, ''));
		    }
		}

		const showCreateBlueprintDialog = ref(false);
		// Placeholder metadata so the dialog can preview before a name is typed.
		const createBlueprintPreview = ref(null);
		function closeCreateBlueprintDialog() {
		    showCreateBlueprintDialog.value = false;
		    createBlueprintPreview.value = null;
		}
		function onCreateBlueprint({ name, category, description }) {
		    const structure = editorSession.createStructureFromSelection({ name, category, description });
		    closeCreateBlueprintDialog();
		    if (!structure) {
		        feedback.show('Nothing to create — select bricks first');
		        return;
		    }
		    const saved = editorSession.saveStructureToPersonalLibrary(structure);
		    if (saved) {
		        refreshPersonalStructureGroups();
		    }
		    feedback.show(saved ? `"${structure.name}" created in My Structures` : `Created "${structure.name}"`);
		}

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

        // ------------------ structure instance manipulation ------

        // Moving or rotating the same selected placement fires no SELECTION_CHANGED,
        // so every such path calls this to keep the inspector's numbers live.
        function refreshSelectedPlacementInfo() {
            if (editorContext.selection.isStructurePlacementSelection) {
                selectedPlacementInfo.value = editorSession.getSelectedPlacementInfo();
            }
        }

        // Same reason, for brick selections.
        function refreshSelectionSummary() {
            if (!editorContext.selection.isEmpty && !editorContext.selection.isStructurePlacementSelection) {
                selectionSummary.value = editorSession.getSelectionSummary();
            }
        }

        function repeatSelection(options) {
            const repeated = editorSession.repeatSelection(options);
            feedback.show(repeated
                ? `Repeated ${options.count} ${options.count === 1 ? 'copy' : 'copies'}`
                : 'Repeat blocked — check the count/offset, or that the copies fit');
            refreshSelectionSummary();
        }

        // Group actions read EditorSession's selected group, which only this sets.
        // selectGroup() runs no command, so documentVersion is bumped to make the
        // sidebar notice.
        function selectGroup(groupId) {
            editorSession.selectGroup(groupId);
            documentVersion.value++;
        }

        function rotateSelectedPlacement(deltaRotation) {
            editorSession.rotateSelection(deltaRotation);
            refreshSelectedPlacementInfo();
        }

        function applySelectedPlacementTransform(payload) {
            const result = editorSession.applyPlacementTransform(payload);
            refreshSelectedPlacementInfo();
            if (result.blocked) {
                feedback.show('That position is occupied — X/Z left unchanged');
            } else if (result.moved || result.rotated) {
                feedback.show('Updated instance transform');
            }
        }

        function duplicateSelectedPlacement() {
            const newId = editorSession.duplicateSelection();
            if (newId) {
                feedback.show('Copy created — R to rotate, drag to move');
            }
        }

        function deleteSelectedPlacement() {
            if (editorSession.deleteSelection()) {
                feedback.show('Deleted structure instance');
            }
        }

        // Called directly by the color swatch: picking a color is a live widget, not a
        // no-argument command.
        function recolorSelection(color) {
            if (editorSession.recolorSelection(color)) {
                feedback.show('Recolored selection');
            }
        }

        // Opens the referenced Document; never mutates the instance.
        function editSelectedPlacementSource() {
            const info = selectedPlacementInfo.value;
            if (!info) {
                return;
            }
            editorSession.editStructurePlacementSource(info.documentId);
            feedback.show(`Editing "${info.title}"`);
        }

        // ------------------------- action surface ----------------

        const feedbackMessage = ref('');
        const feedbackVisible = ref(false);
        let feedbackTimer = null;
        const feedback = {
            show(message) {
                feedbackMessage.value = message;
                feedbackVisible.value = true;
                if (feedbackTimer) {
                    clearTimeout(feedbackTimer);
                }
                feedbackTimer = setTimeout(() => {
                    feedbackVisible.value = false;
                }, 2500);
            }
        };

        // ------------------- post-publish distribution ----------
        // Toolbar forwards the exact just-published Publication; nothing here looks up
        // "the latest Publication". ActionFeedback stays passive: this view owns the
        // action.
        const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);

        // Nostr goes to the multi-relay command, Arweave to the single-relay one, as in
        // WorldView.
        const publicationDistributionCommand = inject('publicationDistributionCommand', null);

        // Snapshot distribution sends the Publication's material bytes, separately
        // from announcing the Publication. Remote Pinning never goes through
        // snapshotDistributionCommand.
        const snapshotDistributionCommand = inject('snapshotDistributionCommand', null);
        const publicationContentStore = inject('publicationContentStore', null);
        const ipfsRemotePublicationCoordinator = inject('ipfsRemotePublicationCoordinator', null);
        const resolveSnapshotDiscoveryPublisher = inject('resolveSnapshotDiscoveryPublisher', null);

        // Substrate choice shared by both actions: page-local, never persisted.
        // Opens on the saved preference, else 'nostr'.
        const defaultAnnouncementDiscoveryProvider = inject('defaultAnnouncementDiscoveryProvider', 'nostr');
        const selectedDiscoveryProvider = ref(defaultAnnouncementDiscoveryProvider);

        // One Storage choice shared by both actions: page-local, never persisted. When
        // Snapshot distribution is available the options are the registered storages
        // plus 'remote-pinning', otherwise the Material storages. Opens on the saved
        // Content preference when eligible, then the first registered storage, then
        // 'ar'.
        const defaultContentDistributionProvider = inject('defaultContentDistributionProvider', null);
        const snapshotDistributionAvailableStorageTypesCommand = inject('snapshotDistributionAvailableStorageTypes', null);
        const snapshotDistributionStorageTypes = snapshotDistributionAvailableStorageTypesCommand
            ? snapshotDistributionAvailableStorageTypesCommand()
            : ['ar', 'ipfs'];
        // Never persisted; discarded on reload.
        const remotePinningDraft = ref({ endpoint: '', credential: '', requestField: '', responseField: '' });

        // A plain boolean: the injected commands never change after mount.
        const canDistributePublication = Boolean(multiRelayNostrPublicationDistributionCommand || publicationDistributionCommand);

        // publicationContentStore is required either way: it turns "which Publication"
        // into "which bytes".
        const canDistributeSnapshot = Boolean(
            publicationContentStore
            && (snapshotDistributionCommand || (ipfsRemotePublicationCoordinator && resolveSnapshotDiscoveryPublisher))
        );

        const distributionStorageEligible = canDistributeSnapshot
            ? [...snapshotDistributionStorageTypes, 'remote-pinning']
            : ['ar', 'ipfs', 'remote-pinning'];
        const selectedDistributionStorage = ref(
            distributionStorageEligible.includes(defaultContentDistributionProvider)
                ? defaultContentDistributionProvider
                : ((canDistributeSnapshot && snapshotDistributionStorageTypes[0]) || 'ar')
        );

        // (publication, discoveryProvider) -> Promise. Adds serializedMaterial to the
        // request. 'arweave' uses the single-relay command; anything else the
        // multi-relay Nostr command, which resolves one result per relay.
        function distributeEditorPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {
            const remotePinningProviderOptions = materialStorage === 'remote-pinning' && remotePinningConfiguration
                ? {
                    endpoint: remotePinningConfiguration.endpoint,
                    credential: remotePinningConfiguration.credential || null,
                    ...(remotePinningConfiguration.requestField ? { fileFieldName: remotePinningConfiguration.requestField } : {}),
                    ...(remotePinningConfiguration.responseField ? { cidField: remotePinningConfiguration.responseField } : {})
                }
                : undefined;

            if (discoveryProvider === 'arweave') {
                if (!publicationDistributionCommand) {
                    return Promise.reject(new Error('Publication distribution is not available.'));
                }
                return publicationDistributionCommand({
                    publication,
                    serializedMaterial: JSON.stringify(publication.toJSON()),
                    discoveryProvider,
                    materialStorage,
                    remotePinningProviderOptions
                });
            }
            if (!multiRelayNostrPublicationDistributionCommand) {
                return Promise.reject(new Error('Publication distribution is not available.'));
            }
            return multiRelayNostrPublicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON()),
                materialStorage,
                remotePinningProviderOptions
            });
        }

        // Sends the Publication's raw snapshot bytes. Like WorldView's version, but
        // with no placement here, claimedPosition and publicationId stay undefined.
        function distributeEditorSnapshot(publication, storage, remotePinningConfiguration, discoveryProvider) {
            if (!publicationContentStore || !publication.contentReference) {
                return Promise.reject(new Error('Snapshot distribution is not available.'));
            }
            const snapshotBytes = publicationContentStore.get(publication.contentReference);
            if (snapshotBytes === null || snapshotBytes === undefined) {
                return Promise.reject(new Error('Snapshot distribution is not available.'));
            }
            if (storage === 'remote-pinning') {
                if (!ipfsRemotePublicationCoordinator) {
                    return Promise.reject(new Error('Snapshot distribution is not available.'));
                }
                return ipfsRemotePublicationCoordinator.publish({ bytes: snapshotBytes, configuration: remotePinningConfiguration })
                    .then((outcome) => {
                        if (outcome.state !== IpfsRemotePublicationState.PUBLISHED) {
                            throw new Error(outcome.reason || 'Remote IPFS publish failed.');
                        }
                        const contentReference = { hash: outcome.contentHash, uri: outcome.locator, storage: 'ipfs' };
                        const discoveryPublisher = resolveSnapshotDiscoveryPublisher ? resolveSnapshotDiscoveryPublisher(discoveryProvider) : null;
                        if (!discoveryPublisher) {
                            return { contentReference, announcement: null, announcementError: 'Snapshot distribution is not available.' };
                        }
                        return discoveryPublisher.publish({ contentHash: outcome.contentHash, locator: outcome.locator, storage: 'ipfs' })
                            .then((announcement) => ({ contentReference, announcement }))
                            .catch((error) => {
                                // The content is already pinned, so an announcement failure surfaces as
                                // announcementError rather than failing the whole attempt.
                                console.error('Snapshot Nostr announcement failed:', error);
                                return {
                                    contentReference,
                                    announcement: null,
                                    announcementError: sanitizeDistributionErrorMessage(error) || 'Announcement could not be completed.'
                                };
                            });
                    });
            }
            if (!snapshotDistributionCommand) {
                return Promise.reject(new Error('Snapshot distribution is not available.'));
            }
            return snapshotDistributionCommand(snapshotBytes, storage, undefined, undefined, discoveryProvider);
        }

        // Replaced by each successful publish: "Publish A, Publish B, click" must
        // distribute B.
        const publishedPublication = ref(null);
        // Ephemeral only: no persistence, retry queue or history.
        const distributionExecuting = ref(false);
        const distributionError = ref(null);
        const distributionResult = ref(null);

        // Separate state for Snapshot distribution.
        const snapshotDistributionExecuting = ref(false);
        const snapshotDistributionError = ref(null);
        const snapshotDistributionResult = ref(null);
        const distributionRequestIds = { publication: 0, snapshot: 0 };

        // Reset with the rest of this state so a stale dialog never carries over.
        const distributionDialogOpen = ref(false);

        // The only writer of publishedPublication. Publishing never distributes on its
        // own; distribution needs a later explicit click.
        function onDocumentPublished(publication) {
            publishedPublication.value = publication;
            resetDistributionState();
        }

        function dismissPublishAction() {
            publishedPublication.value = null;
            resetDistributionState();
        }

        // Also bumps both request ids so in-flight attempts cannot write stale results.
        function resetDistributionState() {
            distributionExecuting.value = false;
            distributionError.value = null;
            distributionResult.value = null;
            distributionRequestIds.publication += 1;
            snapshotDistributionExecuting.value = false;
            snapshotDistributionError.value = null;
            snapshotDistributionResult.value = null;
            distributionRequestIds.snapshot += 1;
            distributionDialogOpen.value = false;
        }

        // The Arweave branch returns one result, the Nostr branch an array; store both
        // as arrays for display.
        function normalizeDistributionResultForDisplay(result) {
            if (Array.isArray(result)) {
                return result;
            }
            return result ? [result] : null;
        }

        // Shared executing/error/result state machine. Only the latest attempt of a
        // `family` may write its outcome. Full errors go to the console; the UI shows
        // sanitized text or `fallbackMessage`.
        function runDistribution(family, state, attempt, { logLabel, fallbackMessage, toDisplay = (result) => result }) {
            state.executing.value = true;
            state.error.value = null;
            distributionRequestIds[family] += 1;
            const requestId = distributionRequestIds[family];
            const isCurrent = () => requestId === distributionRequestIds[family];
            return Promise.resolve()
                .then(attempt)
                .then((result) => {
                    if (isCurrent()) {
                        state.result.value = toDisplay(result);
                    }
                })
                .catch((error) => {
                    if (isCurrent()) {
                        console.error(`${logLabel} failed:`, error);
                        state.error.value = sanitizeDistributionErrorMessage(error) || fallbackMessage;
                    }
                })
                .then(() => {
                    if (isCurrent()) {
                        state.executing.value = false;
                    }
                });
        }

        function selectedRemotePinningConfiguration() {
            return selectedDistributionStorage.value === 'remote-pinning' ? remotePinningDraft.value : undefined;
        }

        // No-op without a published Publication, a usable command, or while busy.
        function distributePublishedDocument() {
            const publication = publishedPublication.value;
            if (!publication || !canDistributePublication || distributionExecuting.value) {
                return;
            }
            return runDistribution(
                'publication',
                { executing: distributionExecuting, error: distributionError, result: distributionResult },
                () => distributeEditorPublication(
                    publication,
                    selectedDiscoveryProvider.value,
                    selectedDistributionStorage.value,
                    selectedRemotePinningConfiguration()
                ),
                {
                    logLabel: 'Publication distribution',
                    fallbackMessage: 'Publication distribution could not be completed.',
                    toDisplay: normalizeDistributionResultForDisplay
                }
            );
        }

        function distributePublishedSnapshot() {
            const publication = publishedPublication.value;
            if (!publication || !canDistributeSnapshot || snapshotDistributionExecuting.value) {
                return;
            }
            return runDistribution(
                'snapshot',
                { executing: snapshotDistributionExecuting, error: snapshotDistributionError, result: snapshotDistributionResult },
                () => distributeEditorSnapshot(
                    publication,
                    selectedDistributionStorage.value,
                    selectedRemotePinningConfiguration(),
                    selectedDiscoveryProvider.value
                ),
                {
                    logLabel: 'Snapshot distribution',
                    fallbackMessage: 'Snapshot distribution could not be completed.'
                }
            );
        }

        // Runs both actions from one click, each keeping its own state and result.
        // Sequential, never concurrent: both may sign through the same extension, and
        // two simultaneous signing requests can silently hang it. Snapshot first,
        // matching the template order.
        function distributePublishedDocumentAndSnapshot() {
            return Promise.resolve(distributePublishedSnapshot())
                .then(() => distributePublishedDocument());
        }

        // Navigates to /world/:documentId using the documentId already held; never a
        // catalog lookup. Without one it does nothing.
        function viewDistributedPublicationInRepository() {
            const publication = publishedPublication.value;
            if (!publication || !publication.documentId) {
                return;
            }
            router.push({ path: `/world/${publication.documentId}` });
        }

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
                feedback.show('Recovered unsaved changes from a previous session');
            } catch (e) {
                // A corrupt checkpoint never takes down the Editor or the open document.
                feedback.show(`Recovery failed: ${e.message}`);
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
                feedback.show('Discarded the recovered checkpoint');
            } catch (e) {
                feedback.show(`Discard failed: ${e.message}`);
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

        function onSaveMetadata({ title, description, license }) {
            updateDocumentMetadataUseCase.execute(documentManager, { title, description, license });
            showMetadataEditor.value = false;
            feedback.show('Updated document properties');
        }

        const paletteOpen = ref(false);
        const actionUi = {
            togglePalette() {
                paletteOpen.value = !paletteOpen.value;
            },
            // The registry cannot collect a name itself; null means Cancel.
            promptRenameGroup(currentName = '') {
                return prompt('New group name:', currentName || '');
            },
            focusNumeric: null,
            // Opens CreateBlueprintDialog with a preview Structure built from the current
            // selection; the dialog's 'create' handler does the rest.
            openCreateBlueprintDialog() {
                let preview = null;
                try {
                    preview = editorSession.createStructureFromSelection({ name: 'Untitled Blueprint', category: 'uncategorized', description: '' });
                } catch (e) {
                    feedback.show(e.message);
                    return;
                }
                if (!preview) {
                    feedback.show('Nothing to create — select bricks first');
                    return;
                }
                createBlueprintPreview.value = preview;
                showCreateBlueprintDialog.value = true;
            }
        };
        const actionRegistry = new EditorActionRegistry(
            createStandardActions({ session: editorSession, feedback, ui: actionUi })
        );
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

        let onPointerDown = null;
        let onPointerMove = null;
        let onPointerUp = null;
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

        onMounted(() => {
            editorSession.start(viewport.value);

            unsubTool = editorContext.eventBus.subscribe(
                EditorEvent.TOOL_CHANGED,
                ({ activeTool: t }) => {
                    activeTool.value = t;
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
                        ? `Editing a copy of "${decodedEntryContext.title}"`
                        : `Created your editable fork of "${forkedDocument.metadata.title}"`);
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
                    feedback.show(err.reason === LoadFailureReason.MATERIAL_UNAVAILABLE
                        ? "This Publication's material is currently unavailable."
                        : 'This document could not be opened.');
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
                const shortcutTool = TOOL_SHORTCUTS[event.key];
                if (shortcutTool && !event.ctrlKey && !event.metaKey) {
                    editorContext.setActiveTool(shortcutTool);
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    try {
                        saveDocumentUseCase.execute(documentManager);
                    } catch (error) {
                        console.error('Save failed:', error);
                        feedback.show(SAVE_FAILURE_MESSAGE);
                    }
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
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
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
            viewport,
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
            exportInspectedStructure,
            claimAuthorship,
            exportInspectedAttribution,
            publishInspectedAttributionToNetwork,
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
