import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../../application/CreateStructureRegistryUseCase.js';
import { CreatePersonalStructureLibraryUseCase } from '../../application/CreatePersonalStructureLibraryUseCase.js';
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
import CommandPalette from '../components/CommandPalette.js';
import ActionFeedback from '../components/ActionFeedback.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { CopySelectionUseCase } from '../../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../../application/PasteClipboardUseCase.js';
import { UpdateDocumentMetadataUseCase } from '../../application/UpdateDocumentMetadataUseCase.js';
import { computeLifecycleStatus, describeLifecycleStatus } from '../../application/DocumentLifecycleStatus.js';
import DocumentInfoPanel from '../components/DocumentInfoPanel.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';

// 0.1.50: the Editor's keyboard surface is consolidated. Editing
// shortcuts (undo/redo, delete, rotate, nudges, select all, copy/paste,
// command palette) come from the EditorActionRegistry — one source of
// truth shared with the palette, the sidebar, and the controls docs.
// Escape follows the explicit priority chain: text input > palette >
// gizmo gesture > selection. Tool switching (1/2) and Ctrl+S stay
// view-local: they are not editing actions.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

export default {
    name: 'EditorView',
    components: { Toolbar, BuildLibraryPanel, EditingSidebar, StructureInstancePanel, CommandPalette, ActionFeedback, DocumentInfoPanel, MetadataEditorDialog },
    template: `
        <div class="editor-view">
            <Toolbar
                :document-manager="documentManager"
                :save-document-use-case="saveDocumentUseCase"
                :load-document-use-case="loadDocumentUseCase"
                :editor-session="editorSession"
                :publish-document-use-case="publishDocumentUseCase"
                :feedback="feedback"
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
                    <p v-if="activeTool === ToolId.SELECT && selectedPlacementInfo" class="placement-hint">
                        Selected "{{ selectedPlacementInfo.title }}" — drag to move, R to rotate.
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
                    <BuildLibraryPanel
                        :palette-use-case="paletteUseCase"
                        :structure-groups="structureGroups"
                        :personal-structure-groups="personalStructureGroups"
                        :preview-service="libraryPreviewService"
                        @place="setTool(ToolId.PLACE)"
                        @fork="forkStructure"
                        @place-structure="copyStructureIntoDocument"
                        @rename-personal-structure="renamePersonalStructure"
                        @remove-personal-structure="removePersonalStructure"
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
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="documentInfo"
                @save="onSaveMetadata"
                @cancel="showMetadataEditor = false"
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

		const copySelectionUseCase = new CopySelectionUseCase(registry);
		const pasteClipboardUseCase = new PasteClipboardUseCase();
		
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
		function refreshPersonalStructureGroups() {
		    personalStructureGroups.value = personalStructureLibraryStore.groupByCategory();
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
		    feedback.show(`Renamed to "${name.trim()}"`);
		}

		function removePersonalStructure(structure) {
		    // Deleting from the library never touches a Document that
		    // already copied or forked this Structure's bricks — see
		    // application/LocalStructureLibraryStore.js's own header.
		    personalStructureLibraryStore.removeStructure(structure.id);
		    refreshPersonalStructureGroups();
		    feedback.show(`Removed "${structure.name}" from My Structures`);
		}

		function forkStructure(structure) {
		    const forked = editorSession.forkStructure(structure);
		    if (forked) {
		        feedback.show(`Forked "${structure.name}" — now editing your own copy`);
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
		    }
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
                feedback.show('Duplicated structure');
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

        function refreshDocumentInfo() {
            const document = documentManager.document;
            if (!document) {
                documentInfo.value = null;
                return;
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
            // 0.4.2 — Structure Extraction & Blueprint Creation. Minimal
            // metadata capture — the same window.prompt() chain
            // ui/components/GroupsPanel.js already uses for a group's
            // name — Name/Category/Description, nothing more.
            // Author/version/thumbnails belong to the Personal Blueprint
            // Library (0.4.3), not this milestone. Returns null (and
            // creates nothing) if the user cancels or leaves the name
            // blank.
            promptCreateStructure() {
                const name = prompt('Structure name:', '');
                if (name === null || !name.trim()) {
                    return null;
                }
                const category = prompt('Category:', 'uncategorized');
                if (category === null) {
                    return null;
                }
                const description = prompt('Description (optional):', '') || '';
                return { name: name.trim(), category: category.trim() || 'uncategorized', description };
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
                    editorSession.openDocument(forkedDocument);
                    // 0.2.21: the document id silently changing (0.1.24's
                    // fork mechanism) is exactly what the milestone design
                    // asked not to leave unexplained.
                    feedback.show(`Created your editable fork of "${forkedDocument.metadata.title}"`);
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
            structureGroups,
            personalStructureGroups,
            libraryPreviewService,
            forkStructure,
            copyStructureIntoDocument,
            renamePersonalStructure,
            removePersonalStructure,
            activeTool,
            activeStructureTitle,
            activeCompositionTitle,
            selectionCount,
            selectionIsStructurePlacement,
            selectedPlacementInfo,
            rotateSelectedPlacement,
            duplicateSelectedPlacement,
            deleteSelectedPlacement,
            editSelectedPlacementSource,
            applySelectedPlacementTransform,
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
