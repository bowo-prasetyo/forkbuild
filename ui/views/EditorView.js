import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/CreateToolRegistryUseCase.js';
import { CreateDocumentManagerUseCase } from '../../application/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/CreatePersistenceUseCase.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/PaletteUseCase.js';
import { PreviewUseCase } from '../../application/PreviewUseCase.js';
import { EditorSession } from '../../application/EditorSession.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import { EditorEvent } from '../../core/events/EditorEvent.js';
import { EditorActionRegistry, createStandardActions } from '../../application/EditorActionRegistry.js';
import { EditorActionContext } from '../../application/EditorActionContext.js';
import { InputRouter } from '../../application/InputRouter.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';
import EditingSidebar from '../components/EditingSidebar.js';
import CommandPalette from '../components/CommandPalette.js';
import ActionFeedback from '../components/ActionFeedback.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { CopySelectionUseCase } from '../../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../../application/PasteClipboardUseCase.js';

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
    components: { Toolbar, Sidebar, EditingSidebar, CommandPalette, ActionFeedback },
    template: `
        <div class="editor-view">
            <Toolbar
                :document-manager="documentManager"
                :save-document-use-case="saveDocumentUseCase"
                :load-document-use-case="loadDocumentUseCase"
                :editor-session="editorSession"
                :publish-document-use-case="publishDocumentUseCase"
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
                    <Sidebar :palette-use-case="paletteUseCase" />
                    <EditingSidebar
                        :registry="actionRegistry"
                        :get-context="getActionContext"
                        :ui="actionUi"
                        :selection-count="selectionCount"
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
        </div>
    `,
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);

        const registry = new CreateBrickRegistryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        const toolRegistry = new CreateToolRegistryUseCase().execute();
        const documentManager = new CreateDocumentManagerUseCase().execute();
        const { saveDocumentUseCase, loadDocumentUseCase, forkDocumentUseCase } = new CreatePersistenceUseCase().execute();

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
		    pasteClipboardUseCase  // Pass use case
		});

        const activeTool = ref(editorContext.tool.activeTool);
        const selectionCount = ref(0);
        let unsubTool = null;
        let unsubSelection = null;

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

        const paletteOpen = ref(false);
        const actionUi = {
            togglePalette() {
                paletteOpen.value = !paletteOpen.value;
            },
            focusNumeric: null
        };
        const actionRegistry = new EditorActionRegistry(
            createStandardActions({ session: editorSession, feedback, ui: actionUi })
        );
        const getActionContext = () => EditorActionContext.capture({
            session: editorSession,
            selectionCount: selectionCount.value,
            paletteOpen: paletteOpen.value,
            activeTool: activeTool.value
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
                }
            );

            if (route.query.fork) {
                try {
			        let sourcePublication = null;
			        if (route.query.publication) {
			            sourcePublication = findPublicationUseCase.execute(route.query.publication);
			        }
			        const forkedDocument = forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication);
                    editorSession.openDocument(forkedDocument);
                } catch (err) {
                    alert(`Fork failed: ${err.message}`);
                }
                router.replace({ path: '/editor' });
            } else if (route.query.load) {
                try {
                    editorSession.loadDocument(route.query.load);
                } catch (err) {
                    alert(`Load failed: ${err.message}`);
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
            onPointerUp = (event) => {
                editorSession.onPointerUp(event);
            };
            window.addEventListener('pointerup', onPointerUp);

            onKeyDown = (event) => {
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
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            if (unsubTool) {
                unsubTool.unsubscribe();
            }
            if (unsubSelection) {
                unsubSelection.unsubscribe();
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
            activeTool,
            selectionCount,
            actionRegistry,
            getActionContext,
            actionUi,
            paletteOpen,
            closePalette,
            feedbackMessage,
            feedbackVisible,
            setTool,
            alignSelection,
            distributeSelection,
            applyNumericTransform,
            ToolId
        };
    }
};
