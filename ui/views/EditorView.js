import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../../application/CreateStructureRegistryUseCase.js';
import { CreatePersonalStructureLibraryUseCase } from '../../application/CreatePersonalStructureLibraryUseCase.js';
import { CreateLibraryUsageHistoryUseCase } from '../../application/CreateLibraryUsageHistoryUseCase.js';
import { ForkStructureUseCase } from '../../application/ForkStructureUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../../application/CopyStructureIntoDocumentUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/CreateToolRegistryUseCase.js';
import { CreateDocumentManagerUseCase } from '../../application/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/CreatePersistenceUseCase.js';
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
import Toolbar from '../components/Toolbar.js';
import BuildLibraryPanel from '../components/BuildLibraryPanel.js';
import EditingSidebar from '../components/EditingSidebar.js';
import StructureInstancePanel from '../components/StructureInstancePanel.js';
import SelectionInspector from '../components/SelectionInspector.js';
import CommandPalette from '../components/CommandPalette.js';
import KeyboardShortcutsOverlay from '../components/KeyboardShortcutsOverlay.js';
import ActionFeedback from '../components/ActionFeedback.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { CreateBlueprintAttributionUseCase } from '../../application/CreateBlueprintAttributionUseCase.js';
import { CopySelectionUseCase } from '../../application/CopySelectionUseCase.js';
import { RepeatSelectionUseCase } from '../../application/RepeatSelectionUseCase.js';
import { PasteClipboardUseCase } from '../../application/PasteClipboardUseCase.js';
import { UpdateDocumentMetadataUseCase } from '../../application/UpdateDocumentMetadataUseCase.js';
import { computeLifecycleStatus, describeLifecycleStatus } from '../../application/DocumentLifecycleStatus.js';
import DocumentInfoPanel from '../components/DocumentInfoPanel.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';
import CreateBlueprintDialog from '../components/CreateBlueprintDialog.js';
import StructureInfoPanel from '../components/StructureInfoPanel.js';
import { editorEntryContextFromQuery } from '../../core/EditorEntryContext.js';

// 0.1.50: the Editor's keyboard surface is consolidated. Editing
// shortcuts (undo/redo, delete, rotate, nudges, select all, copy/paste,
// command palette) come from the EditorActionRegistry — one source of
// truth shared with the palette, the sidebar, and the controls docs.
// Escape follows the explicit priority chain: text input > shortcuts
// overlay > palette > gizmo gesture > selection. Tool switching (1/2),
// Ctrl+S, and (0.6.2) '?' for the Keyboard Shortcuts overlay stay
// view-local: they are not editing actions.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

export default {
    name: 'EditorView',
    components: { Toolbar, BuildLibraryPanel, EditingSidebar, StructureInstancePanel, SelectionInspector, CommandPalette, KeyboardShortcutsOverlay, ActionFeedback, DocumentInfoPanel, MetadataEditorDialog, CreateBlueprintDialog, StructureInfoPanel },
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
            />
            <div class="editor-body">
                <div class="sidebar">
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
                    <!-- 0.6.2 — the old "Selected X — drag to move, R to
                         rotate" placement-hint paragraph that used to sit
                         here was a second copy of the exact same line
                         StructureInstancePanel's own hint already shows
                         below — removed as a duplicate, not a
                         regression; see this milestone's Roadmap entry. -->
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
                        :selection-count="selectionCount"
                        :summary="selectionSummary"
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
                    />
                </div>
                <div :style="{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }">
                    <div ref="viewport" class="viewport"></div>
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
            <StructureInfoPanel
                v-if="inspectedStructure"
                :structure="inspectedStructure"
                :registry="brickRegistry"
                :source="inspectedStructureSource"
                :attribution="inspectedStructureAttribution"
                @place="placeInspectedStructure"
                @export="exportInspectedStructure"
                @claim-authorship="claimAuthorship"
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
        // 0.4.3 — Personal Blueprint Library.
        const { personalStructureLibraryStore } = new CreatePersonalStructureLibraryUseCase().execute();
        // 0.6.4 — Blueprint Discovery, Search & Library Organization.
        const { libraryUsageHistoryStore } = new CreateLibraryUsageHistoryUseCase().execute();
        const forkStructureUseCase = new ForkStructureUseCase();
        const copyStructureIntoDocumentUseCase = new CopyStructureIntoDocumentUseCase();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        // 0.2.90 — Structure Placement & World Instances.
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        // 0.4.1 — Interactive Structure Composition UX.
        const compositionPreviewUseCase = new CompositionPreviewUseCase(editorContext);
        const { libraryPreviewService } = new CreateLibraryPreviewUseCase().execute(registry);
        const toolRegistry = new CreateToolRegistryUseCase().execute();
        const documentManager = new CreateDocumentManagerUseCase().execute();
        const { saveDocumentUseCase, loadDocumentUseCase, forkDocumentUseCase, structureDocumentResolver } = new CreatePersistenceUseCase().execute();

        const identityUseCase = inject('identityUseCase');
        const identityProvider = identityUseCase.provider;
        const { publishDocumentUseCase } = new CreatePublisherUseCase().execute(identityProvider);
        const { findPublicationUseCase } = new CreateDiscoveryUseCase().execute();
        // 0.6.5 — Blueprint Identity & Attribution.
        const { blueprintAttributionUseCase } = new CreateBlueprintAttributionUseCase().execute(identityProvider);

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
		    copySelectionUseCase,  // Pass use case
		    pasteClipboardUseCase,  // Pass use case
		    // 0.4.9 — Alignment, Snapping & Repetition.
		    repeatSelectionUseCase,
		    forkStructureUseCase,
		    copyStructureIntoDocumentUseCase,
		    // 0.2.90 — Structure Placement & World Instances.
		    structureResolver: structureDocumentResolver,
		    structurePreviewUseCase,
		    // 0.4.1 — Interactive Structure Composition UX.
		    compositionPreviewUseCase,
		    // 0.4.3 — Personal Blueprint Library.
		    personalStructureLibraryStore
		});

		// 0.2.81 — Forkable Structure Library, grouped per 0.2.84
		// (Building Library & Palette UX) via
		// core/StructureRegistry.js#groupByCategory(). The registry's
		// contents never change at runtime (same reasoning as
		// paletteUseCase's own brick definitions), so this is read
		// once, not subscribed to.
		const structureGroups = ref(structureRegistry.groupByCategory());

		// 0.4.3 — Personal Blueprint Library. Unlike structureGroups
		// above, this DOES change at runtime — saving a newly extracted
		// Structure, renaming one, or removing one — so it's refreshed
		// explicitly after each of those, rather than read once.
		const personalStructureGroups = ref(personalStructureLibraryStore.groupByCategory());
		// 0.6.4 — Blueprint Discovery, Search & Library Organization.
		// Consulted only by core/sortStructures.js's 'recent' sort key —
		// see application/LocalStructureLibraryStore.js#getSavedAtById()'s
		// own header. Refreshed alongside personalStructureGroups
		// whenever the personal library changes (below).
		const personalSavedAtById = ref(personalStructureLibraryStore.getSavedAtById());
		function refreshPersonalStructureGroups() {
		    personalStructureGroups.value = personalStructureLibraryStore.groupByCategory();
		    personalSavedAtById.value = personalStructureLibraryStore.getSavedAtById();
		}

		// 0.6.4 — Blueprint Discovery, Search & Library Organization.
		// Resolves application/LibraryUsageHistoryStore.js's own bare ids
		// against whichever library still recognizes each one — a
		// structure that was removed, or a personal one that was renamed
		// (renaming preserves its id, so this still finds it) since it
		// was last used, either resolves to the current entry or, if
		// truly gone, is silently dropped, per that store's own header.
		// This is the ONE place that decides "built-in or personal" for
		// a recent id — ui/components/BuildLibraryPanel.js never reaches
		// into either library itself.
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

		// Reachable two ways: directly ("Remove"/"Rename" on a My
		// Structures entry) and indirectly (actionUi.onPersonalLibraryChanged,
		// called by EditorActionRegistry right after
		// structure.createFromSelection saves a brand-new Structure —
		// see application/EditorActionRegistry.js's own 0.4.3 comment).
		function renamePersonalStructure(structure) {
		    const name = prompt('Rename structure:', structure.name);
		    if (name === null || !name.trim()) {
		        return;
		    }
		    personalStructureLibraryStore.updateStructureMetadata(structure.id, { name: name.trim() });
		    refreshPersonalStructureGroups();
		    refreshRecentStructures(); // 0.6.4 — Recent shows the renamed name too, not a stale one
		    feedback.show(`Renamed to "${name.trim()}"`);
		}

		function removePersonalStructure(structure) {
		    // Deleting from the library never touches a Document that
		    // already copied or forked this Structure's bricks — see
		    // application/LocalStructureLibraryStore.js's own header.
		    personalStructureLibraryStore.removeStructure(structure.id);
		    refreshPersonalStructureGroups();
		    refreshRecentStructures(); // 0.6.4 — a removed Structure disappears from Recent too
		    feedback.show(`Removed "${structure.name}" from My Structures`);
		}

		function forkStructure(structure) {
		    const forked = editorSession.forkStructure(structure);
		    if (forked) {
		        feedback.show(`Forked "${structure.name}" — now editing your own copy`);
		    }
		}

		// 0.6.3 — Blueprint Authoring & Versioning UX. The Structure-fork
		// counterpart to forkStructure() immediately above — see
		// application/ForkStructureToLibraryUseCase.js's own header on
		// the distinction: forkStructure() opens a new DOCUMENT; this
		// adds a new personal STRUCTURE, with no Document involved.
		// Reachable only from a built-in card's "⋮" menu (see
		// ui/components/BuildLibraryPanel.js) — forking a personal
		// Structure into the SAME personal library isn't a workflow this
		// milestone's design conversation asked for.
		function forkStructureToLibrary(structure) {
		    const forked = editorSession.forkStructureToPersonalLibrary(structure);
		    if (forked) {
		        refreshPersonalStructureGroups();
		        feedback.show(`"${forked.name}" added to My Structures`);
		    }
		}

		// 0.4.6 — Blueprint Sharing & Exchange. Builds the portable
		// package via editorSession.exportBlueprint() (pure — see that
		// method's own header) and triggers an immediate browser
		// download, the same `data:application/json` + <a download>
		// shape ui/views/IdentityManagementView.js's own portable-
		// identity export already established — deliberately no
		// intermediate modal, since (unlike an identity export) there is
		// no passphrase to collect first.
		//
		// 0.6.3 — renamed from exportPersonalStructure(): a built-in
		// card's "⋮" menu now offers Export Blueprint too (see
		// ExportBlueprintUseCase's own header — it was always generic
		// over any Structure; only the UI previously withheld the
		// button). The wire event name from BuildLibraryPanel stays
		// 'export-personal-structure' unchanged — only this handler's
		// own name follows what it actually does now.
		function exportStructure(structure) {
		    let pkg;
		    try {
		        pkg = editorSession.exportBlueprint(structure);
		    } catch (e) {
		        feedback.show(e.message);
		        return;
		    }
		    if (!pkg) {
		        return;
		    }
		    const json = JSON.stringify(pkg, null, 2);
		    const slug = structure.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'structure';
		    const link = document.createElement('a');
		    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
		    link.download = `forkbuild-blueprint-${slug}.json`;
		    link.click();
		    feedback.show(`Exported "${structure.name}" as a blueprint`);
		}

		// 0.4.6 — Blueprint Sharing & Exchange. `rawText` is whatever
		// BuildLibraryPanel's hidden file input read off disk — untrusted
		// input, so JSON.parse and editorSession.importBlueprint() (which
		// runs application/BlueprintImportValidator.js before
		// constructing anything — see that use case's own header) are
		// each wrapped separately, mirroring
		// IdentityManagementView.js#confirmImport()'s own two-stage
		// "is this even JSON" / "is this a valid package" error handling.
		function importBlueprint(rawText) {
		    let pkg;
		    try {
		        pkg = JSON.parse(rawText);
		    } catch (e) {
		        feedback.show('That is not valid JSON — choose a file exported with "Export Blueprint."');
		        return;
		    }
		    try {
		        const structure = editorSession.importBlueprint(pkg);
		        if (structure) {
		            refreshPersonalStructureGroups();
		            feedback.show(`Imported "${structure.name}" into My Structures`);
		        }
		    } catch (e) {
		        feedback.show(e.message.replace(/^(BlueprintImport|BlueprintPackage):\s*/, ''));
		    }
		}

		// 0.4.1 — Interactive Structure Composition UX. "Copy Into
		// Document" enters an interactive ghost-preview mode
		// (StructureCompositionTool) instead of copying immediately —
		// the actual insertion still only ever happens through the SAME
		// EditorSession#copyStructureIntoDocument()
		// -> CopyStructureIntoDocumentUseCase path 0.4.0 established,
		// just triggered by the tool's own click-to-commit rather than
		// this handler. See docs/Roadmap.md, 0.4.1.
		//
		// 0.4.5 — Unified Build Placement. This function is the SAME
		// entry point BuildLibraryPanel's structure card now calls on a
		// plain click (emits 'place-structure'), exactly the way
		// selectBrick()/setTool(ToolId.PLACE) is what a brick's click
		// calls — the name stays copyStructureIntoDocument() (the
		// mutation semantics EditorSession#beginStructureComposition()
		// still describes never changed), only the UI-facing verb the
		// user sees does. See docs/Principles.md, "Buildable Things
		// Share One Placement Experience."
		function copyStructureIntoDocument(structure) {
		    const started = editorSession.beginStructureComposition(structure);
		    if (started) {
		        feedback.show(`Placing "${structure.name}" — click to place, R to rotate, Esc to cancel`);
		        // 0.6.4 — Blueprint Discovery, Search & Library Organization.
		        // Recorded at Place-intent (starting composition), not at
		        // the later ground click that actually commits it — the
		        // same moment selectBrick() already treats as "this is the
		        // one the user picked." A cancelled placement (Esc) still
		        // counts; see application/LibraryUsageHistoryStore.js's own
		        // header on why a stale/optimistic entry is harmless.
		        libraryUsageHistoryStore.recordUse(structure.id);
		        refreshRecentStructures();
		    }
		}

		// 0.6.3 — Blueprint Authoring & Versioning UX. Which built-in or
		// personal Structure ui/components/StructureInfoPanel.js is
		// currently showing — null when closed. `inspectedStructureSource`
		// ('built-in' | 'personal') is derived here, once, at open time —
		// the panel itself never reaches into either library to answer a
		// question its host already knows the answer to (see that
		// component's own header).
		const inspectedStructure = ref(null);
		const inspectedStructureSource = ref('built-in');
		// 0.6.5 — Blueprint Identity & Attribution. `{ fingerprint,
		// attributions, mine }`, refreshed every time the panel opens (and
		// again right after claimAuthorship() below) — never cached
		// against the structure's own id, since the whole point of a
		// fingerprint is that it stays valid across a fresh Structure
		// instance with a fresh id.
		const inspectedStructureAttribution = ref(null);
		function inspectStructure(structure) {
		    inspectedStructure.value = structure;
		    inspectedStructureSource.value = personalStructureLibraryStore.hasStructure(structure.id) ? 'personal' : 'built-in';
		    inspectedStructureAttribution.value = blueprintAttributionUseCase.summarize(structure);
		}
		// The panel's own Place/Export buttons delegate straight to the
		// SAME copyStructureIntoDocument()/exportStructure() every card's
		// primary click and "⋮" menu already use — Inspect never becomes
		// a second way to do either, only a second way to REACH them.
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
		// 0.6.5 — Blueprint Identity & Attribution. Publishes a signed
		// BlueprintAttribution for whatever the Info panel is currently
		// showing, then re-summarizes so the panel immediately reflects
		// "You" as author without needing to be closed and reopened —
		// the same "the surface stays visually up to date the instant
		// this fires" posture 0.4.3's own onPersonalLibraryChanged()
		// already established for a saved Structure.
		function claimAuthorship() {
		    const structure = inspectedStructure.value;
		    if (!structure) {
		        return;
		    }
		    try {
		        blueprintAttributionUseCase.publish(structure);
		        inspectedStructureAttribution.value = blueprintAttributionUseCase.summarize(structure);
		        feedback.show(`You are now credited as an author of "${structure.name}"`);
		    } catch (e) {
		        feedback.show(e.message.replace(/^BlueprintAttributionUseCase:\s*/, ''));
		    }
		}

		// 0.6.3 — Blueprint Authoring & Versioning UX. Replaces the 0.4.2
		// window.prompt() chain with ui/components/CreateBlueprintDialog.js
		// — see application/EditorActionRegistry.js's own 0.6.3 comment
		// on why opening it is as far as that action's execute() itself
		// goes; the rest of the 0.4.2/0.4.3 chain
		// (createStructureFromSelection -> saveStructureToPersonalLibrary)
		// runs here instead, once the user actually submits the form.
		const showCreateBlueprintDialog = ref(false);
		// A throwaway Structure (placeholder metadata, real bricks) built
		// once at open time purely so the dialog has something to show a
		// preview of before any name is typed — see that component's own
		// header on why re-extracting with the REAL metadata on Create is
		// correct rather than reusing this one.
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
        // 0.2.90 — Structure Placement & World Instances: mirrors
        // activeTool's own ref+subscription shape one rung up, so the
        // placement hint can name what's being placed.
        const activeStructureTitle = ref(editorContext.activeStructure.title);
        // 0.4.1 — Interactive Structure Composition UX: mirrors
        // activeStructureTitle's own ref+subscription shape, so the
        // placement hint can name what's being composed.
        const activeCompositionTitle = ref(
            editorContext.activeComposition.structure ? editorContext.activeComposition.structure.name : null
        );
        // 0.2.91 — World Instance Editing & Placement Management: mirrors
        // selectionCount's own ref+subscription shape, so the sidebar's
        // registry-gated actions (selection.duplicate) and the
        // "Selected House Instance" panel can react to a placement
        // selection the same way everything else here reacts to
        // SELECTION_CHANGED.
        const selectionIsStructurePlacement = ref(false);
        const selectedPlacementInfo = ref(null);
        // 0.6.2 — Editor UX Consolidation: the brick-selection
        // counterpart to selectedPlacementInfo above, backing
        // SelectionInspector — see
        // application/EditorSession.js#getSelectionSummary()'s own
        // header. Mirrors selectedPlacementInfo's exact refresh shape:
        // set on SELECTION_CHANGED, and re-read after any pointer-up/
        // key-down that could have moved the SAME still-selected bricks
        // (see refreshSelectionSummary() below).
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

        // ------------------ 0.2.91 structure instance manipulation ------

        // 0.2.92 — World Instance Transform UX. selectedPlacementInfo only
        // ever refreshes automatically on SELECTION_CHANGED (see the
        // subscription below) — moving/rotating the SAME still-selected
        // placement (a keyboard nudge, a gizmo drag, Rotate, Apply) never
        // fires that event. Now that the panel shows LIVE X/Z/Rotation
        // numbers (0.2.91's panel only showed static title text, so this
        // staleness was invisible before), every one of those paths calls
        // this afterward so the inspector never shows a stale number.
        function refreshSelectedPlacementInfo() {
            if (editorContext.selection.isStructurePlacementSelection) {
                selectedPlacementInfo.value = editorSession.getSelectedPlacementInfo();
            }
        }

        // 0.6.2 — refreshSelectionSummary()'s own reason for existing is
        // identical to refreshSelectedPlacementInfo() just above: a
        // nudge/rotate/apply on the SAME still-selected bricks changes
        // their bounds without ever firing SELECTION_CHANGED, so
        // SelectionInspector's live position readout would otherwise go
        // stale the instant it started showing one.
        function refreshSelectionSummary() {
            if (!editorContext.selection.isEmpty && !editorContext.selection.isStructurePlacementSelection) {
                selectionSummary.value = editorSession.getSelectionSummary();
            }
        }

        // 0.6.2 — Editor UX Consolidation. RepeatPanel/EditingSidebar's
        // own host callback — parallels alignSelection()/
        // distributeSelection() immediately below: parse/UI concerns
        // stay in the panel, this is nothing but the routing hop into
        // EditorSession#repeatSelection() plus feedback.
        function repeatSelection(options) {
            const repeated = editorSession.repeatSelection(options);
            feedback.show(repeated
                ? `Repeated ${options.count} ${options.count === 1 ? 'copy' : 'copies'}`
                : 'Repeat blocked — check the count/offset, or that the copies fit');
            refreshSelectionSummary();
        }

        function rotateSelectedPlacement(deltaRotation) {
            editorSession.rotateSelection(deltaRotation);
            refreshSelectedPlacementInfo();
        }

        // The numeric inspector's Apply — see
        // application/EditorSession.js#applyPlacementTransform() for why
        // this is exactly Move/RotateStructurePlacementCommand under the
        // hood, never a third mutation path.
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
                // 0.6.2 — "what happens next," the same posture
                // application/EditorActionRegistry.js#selection.duplicate
                // now uses for a brick selection's own Duplicate.
                feedback.show('Copy created — R to rotate, drag to move');
            }
        }

        function deleteSelectedPlacement() {
            if (editorSession.deleteSelection()) {
                feedback.show('Deleted structure instance');
            }
        }

        // "Edit Source Document" — deliberately never mutates the
        // instance; it opens the referenced Document through the exact
        // same loadDocument() path Toolbar's Load button already uses.
        // See docs/Roadmap.md, 0.2.91: "do not offer 'Edit Bricks' as an
        // instance mutation... instead, Instance -> Edit Source Document."
        function editSelectedPlacementSource() {
            const info = selectedPlacementInfo.value;
            if (!info) {
                return;
            }
            editorSession.editStructurePlacementSource(info.documentId);
            feedback.show(`Editing "${info.title}"`);
        }

        // ------------------------- 0.1.50 action surface ----------------

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

        // ------------------------- 0.2.21 document lifecycle ------------
        // Document Info panel + Document Properties editor. The Editor's
        // document is always mutable/editable (there is no fork-on-edit
        // gate here — that is a World View concern, 0.2.20) so `editable`
        // stays true; status only ever distinguishes Draft/Saved.

        const updateDocumentMetadataUseCase = new UpdateDocumentMetadataUseCase();
        const documentInfo = ref(null);
        const showMetadataEditor = ref(false);
        let unsubDocumentState = null;

        // 0.6.1 — World ↔ Editor Continuity & Return Navigation. The
        // EditorEntryContext (core/EditorEntryContext.js) a fork arrived
        // with, kept alive for the life of THIS open document only —
        // unlike every 0.6.0 consumption of it (frameCameraOn()/
        // selectAll(), applied once and discarded), Toolbar's own "←
        // Back to World"/"Save & Return to World" buttons need it to
        // stay readable for as long as the fork they describe is what's
        // actually open. `arrivalDocumentId` is that fork's own
        // world.id, captured once right after openDocument() — see
        // refreshDocumentInfo() below, which clears both the moment the
        // OPEN document stops being the one this context describes (a
        // later Load/New/place-a-different-document), so the header
        // never claims "Editing a copy of X" about a document that
        // isn't X's fork anymore. Never persisted, never read by
        // anything outside this view — exactly the ephemeral,
        // navigation-only posture core/EditorEntryContext.js's own
        // header already establishes.
        const entryContext = ref(null);
        let arrivalDocumentId = null;

        function refreshDocumentInfo() {
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

        // Toolbar's own "← Back to World"/"Save & Return to World" —
        // see core/EditorEntryContext.js's own 0.6.1 header for why
        // `returnWorldId` is never `route.query.fork`/`sourceDocumentId`,
        // and `focusLocationId` doubles as exactly the id
        // ui/views/WorldView.js#getFocusContextForLocation() needs to
        // reopen the same WorldFocusPanel on arrival. A no-op without a
        // known return address (a fork reached some OTHER way than
        // "Edit a Copy" — e.g. a bare Publication Catalog fork — simply
        // has nowhere this button can send the viewer back to).
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
            focusNumeric: null,
            // 0.6.3 — Blueprint Authoring & Versioning UX. Supersedes the
            // 0.4.2 window.prompt() chain (Name/Category/Description as
            // three separate native prompts) with
            // ui/components/CreateBlueprintDialog.js. Builds a throwaway
            // preview Structure (placeholder metadata, the CURRENT
            // selection's real bricks) so the dialog has something to
            // show before any name is typed; see that component's own
            // header on why Create re-extracts with the real metadata
            // rather than reusing this one. See
            // application/EditorActionRegistry.js's own 0.6.3 comment on
            // why opening the dialog is as far as this hook goes — the
            // rest of the 0.4.2/0.4.3 chain runs from the dialog's own
            // 'create' handler (this file's own onCreateBlueprint()).
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
            },
            // 0.4.3 — Personal Blueprint Library. Called by
            // EditorActionRegistry right after structure.createFromSelection
            // successfully saves a newly extracted Structure into
            // personalStructureLibraryStore, so "My Structures" reflects
            // it immediately — see this file's own refreshPersonalStructureGroups().
            onPersonalLibraryChanged() {
                refreshPersonalStructureGroups();
            }
        };
        const actionRegistry = new EditorActionRegistry(
            createStandardActions({ session: editorSession, feedback, ui: actionUi })
        );
        const getActionContext = () => EditorActionContext.capture({
            session: editorSession,
            selectionCount: selectionCount.value,
            paletteOpen: paletteOpen.value,
            activeTool: activeTool.value,
            selectionIsStructurePlacement: selectionIsStructurePlacement.value
        });
        function closePalette() {
            paletteOpen.value = false;
        }

        let onPointerDown = null;
        let onPointerMove = null;
        let onPointerUp = null;
        let onKeyDown = null;

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

            if (route.query.fork) {
                try {
			        let sourcePublication = null;
			        if (route.query.publication) {
			            sourcePublication = findPublicationUseCase.execute(route.query.publication);
			        }
			        const forkedDocument = forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication);
                    // 0.6.0 — Context-Preserving Fork-to-Edit. Decodes
                    // whatever EditorEntryContext World View's "Edit a
                    // Copy" attached to this same navigation (see
                    // core/EditorEntryContext.js's own header on the
                    // query-param channel) and hands it to
                    // openDocument(), which frames the camera and, for a
                    // STRUCTURE, selects the fork's own bricks — the one
                    // place this context is ever consumed; it is
                    // discarded the instant this block finishes, never
                    // stored anywhere.
                    // Named `decodedEntryContext` here, distinct from
                    // the top-level `entryContext` ref (0.6.1) it feeds
                    // — this local is the ONE-TIME decode result;
                    // `entryContext.value` below is what stays live for
                    // Toolbar's own header/"← Back to World" for as long
                    // as this fork is the open document (see that ref's
                    // own header, just above refreshDocumentInfo()).
                    const decodedEntryContext = editorEntryContextFromQuery(route.query, route.query.fork);
                    editorSession.openDocument(forkedDocument, decodedEntryContext);
                    // 0.6.1 — set AFTER openDocument() succeeds, so a
                    // fork that throws (caught below) never leaves a
                    // stale entryContext describing a document that was
                    // never actually opened.
                    entryContext.value = decodedEntryContext;
                    arrivalDocumentId = decodedEntryContext ? forkedDocument.world.id : null;
                    // 0.2.21: the document id silently changing (0.1.24's
                    // fork mechanism) is exactly what the milestone design
                    // asked not to leave unexplained. 0.6.0 — when the
                    // fork carries a title (it was reached through "Edit
                    // a Copy," not every fork is), name what was actually
                    // being looked at rather than the generic message —
                    // this is the transient "Editing a copy of ___"
                    // arrival indicator, ephemeral UI only (see
                    // `feedback.show()`'s own 2.5s auto-hide below), never
                    // persisted anywhere.
                    feedback.show(decodedEntryContext && decodedEntryContext.title
                        ? `Editing a copy of "${decodedEntryContext.title}"`
                        : `Created your editable fork of "${forkedDocument.metadata.title}"`);
                } catch (err) {
                    feedback.show(`Fork failed: ${err.message}`);
                }
                router.replace({ path: '/editor' });
            } else if (route.query.load) {
                try {
                    editorSession.loadDocument(route.query.load);
                } catch (err) {
                    feedback.show(`Load failed: ${err.message}`);
                }
                router.replace({ path: '/editor' });
            }

            onPointerDown = (event) => {
                editorSession.onPointerDown(event);
            };
            viewport.value.addEventListener('pointerdown', onPointerDown);
            onPointerMove = (event) => {
                editorSession.onPointerMove(event);
            };
            viewport.value.addEventListener('pointermove', onPointerMove);
            // 0.2.92 — refreshSelectedPlacementInfo() runs after EVERY
            // pointer-up/key-down, not just the ones that obviously moved
            // something: a gizmo drag commits inside
            // editorSession.onPointerUp() itself (SelectionTool's own
            // click-drag does too), and a keyboard nudge/rotate/delete
            // commits inside editorSession.onKeyDown() — neither surfaces
            // back through a return value or SELECTION_CHANGED. The
            // refresh is cheap and a no-op unless a placement is
            // currently selected (see its own definition above).
            onPointerUp = (event) => {
                editorSession.onPointerUp(event);
                refreshSelectedPlacementInfo();
                refreshSelectionSummary();
            };
            window.addEventListener('pointerup', onPointerUp);

            const handleKeyDown = (event) => {
                // 1. Text inputs own their keys; Escape blurs them.
                if (InputRouter.isTextInputTarget(event.target)) {
                    if (event.key === 'Escape') {
                        event.target.blur();
                    }
                    return;
                }
                // 1.5. An open Keyboard Shortcuts overlay owns the
                // keyboard next — same "the topmost open surface wins"
                // priority the palette already had, just one layer
                // earlier so `?`/Escape close it before anything below
                // (tool shortcuts, the registry) ever sees the key.
                if (shortcutsOpen.value) {
                    if (event.key === 'Escape' || event.key === '?') {
                        event.preventDefault();
                        shortcutsOpen.value = false;
                    }
                    return;
                }
                // 2. An open palette owns the keyboard.
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
                // 3. An active gizmo gesture owns the keyboard (Escape
                //    cancels it inside the session).
                if (editorSession.isGestureActive()) {
                    editorSession.onKeyDown(event);
                    return;
                }
                // 4. View-local, non-action shortcuts.
                const shortcutTool = TOOL_SHORTCUTS[event.key];
                if (shortcutTool && !event.ctrlKey && !event.metaKey) {
                    editorContext.setActiveTool(shortcutTool);
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    saveDocumentUseCase.execute(documentManager);
                    return;
                }
                // 4.1 — Editor UX Consolidation: '?' opens the Keyboard
                // Shortcuts overlay. Placed after tool-switching/Save
                // (neither uses '?') and before placement's own Rotate/
                // Escape carve-outs below, so '?' never reaches those —
                // it isn't a shortcut either mode defines.
                if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    shortcutsOpen.value = true;
                    return;
                }
                // 4.5. Placement mode keeps its own Rotate (0.2.87) —
                // 'R'/'Shift+R' already name Rotate Clockwise/Counter-
                // Clockwise in the registry (transform.rotateClockwise/
                // CounterClockwise), but those are disabled while
                // placing (editingAllowed() checks ctx.placementMode) —
                // and step 5's matchShortcut() resolves a key to its
                // bound action by KEY ALONE, oblivious to enabled(), so
                // letting this fall through unchanged would silently
                // swallow the keystroke on a disabled action rather than
                // ever reaching PlacementTool. Routed to the tool
                // directly instead, exactly like WorldView's identical
                // carve-out for the same reason.
                if ((activeTool.value === ToolId.PLACE || activeTool.value === ToolId.PLACE_STRUCTURE
                        || activeTool.value === ToolId.COMPOSE_STRUCTURE)
                    && event.key.toLowerCase() === 'r') {
                    editorSession.onKeyDown(event);
                    return;
                }
                // 4.6. COMPOSE_STRUCTURE's own Escape-to-cancel
                // (StructureCompositionTool#onKeyDown()) needs the exact
                // same carve-out as 4.5's Rotate, for the exact same
                // reason: step 5's matchShortcut() resolves Escape to
                // 'selection.clear' by KEY ALONE and returns immediately
                // once ANY action matches the key — regardless of
                // whether actionRegistry.execute() actually did
                // anything (it's disabled here: no selection is active
                // while composing) — so Escape would never reach the
                // tool without this carve-out. Neither PLACE nor
                // PLACE_STRUCTURE need this: neither tool implements an
                // Escape handler of its own.
                if (activeTool.value === ToolId.COMPOSE_STRUCTURE && event.key === 'Escape') {
                    editorSession.onKeyDown(event);
                    return;
                }
                // 5. Registry-driven editing shortcuts.
                const action = InputRouter.matchShortcut(event, actionRegistry);
                if (action) {
                    if (actionRegistry.execute(action.id, getActionContext())) {
                        event.preventDefault();
                    }
                    return;
                }
                // 6. Everything else falls through to tools.
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
            if (feedbackTimer) {
                clearTimeout(feedbackTimer);
            }
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerup', onPointerUp);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            editorSession.dispose();
        });

        return {
            viewport,
            paletteUseCase,
            documentManager,
            saveDocumentUseCase,
            loadDocumentUseCase,
            editorSession,
            publishDocumentUseCase,
            entryContext,
            backToWorld,
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
            importBlueprint,
            brickRegistry: registry,
            inspectStructure,
            inspectedStructure,
            inspectedStructureSource,
            inspectedStructureAttribution,
            placeInspectedStructure,
            exportInspectedStructure,
            claimAuthorship,
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
            duplicateSelectedPlacement,
            deleteSelectedPlacement,
            editSelectedPlacementSource,
            applySelectedPlacementTransform,
            repeatSelection,
            actionRegistry,
            getActionContext,
            actionUi,
            paletteOpen,
            closePalette,
            feedback,
            feedbackMessage,
            feedbackVisible,
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
