import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/CreateToolRegistryUseCase.js';
import { CreateDocumentManagerUseCase } from '../../application/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/CreatePersistenceUseCase.js';
import { CreateIdentityProviderUseCase } from '../../application/CreateIdentityProviderUseCase.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/PaletteUseCase.js';
import { PreviewUseCase } from '../../application/PreviewUseCase.js';
import { EditorSession } from '../../application/EditorSession.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import { EditorEvent } from '../../core/events/EditorEvent.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';
import TransformFeedback from '../components/TransformFeedback.js';
import AlignmentPanel from '../components/AlignmentPanel.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';

// TEMPORARY: '1'/'2' switch tools directly via EditorContext.setActiveTool.
// Ctrl/Cmd+S/Z/Y are companions to real Toolbar actions. All of these
// stay here rather than moving into EditorSession/InputDispatcher:
// they're global, tool-independent decisions that don't go to a tool.
//
// 0.1.46: while a gizmo gesture is active it owns the keyboard too;
// pointerup is forwarded on window so a release outside the viewport
// still commits cleanly.
//
// 0.1.47: the view hosts the transient TransformFeedback overlay, fed
// by the gesture feedback blob on EditorSession.onPointerMove's return.
//
// 0.1.48: the sidebar hosts the AlignmentPanel whenever 2+ bricks are
// selected in the Select tool. The view tracks the selection count via
// SELECTION_CHANGED and forwards align/distribute clicks to
// EditorSession — it decides neither the geometry nor the commands.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

export default {
    name: 'EditorView',
    components: { Toolbar, Sidebar, TransformFeedback, AlignmentPanel },
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
                    <AlignmentPanel
                        v-if="selectionCount >= 2 && activeTool === ToolId.SELECT"
                        :selection-count="selectionCount"
                        :align="alignSelection"
                        :distribute="distributeSelection"
                    />
                </div>
                <div :style="{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }">
                    <div ref="viewport" class="viewport"></div>
                    <TransformFeedback :feedback="transformFeedback" />
                </div>
            </div>
        </div>
    `,
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);

        // Constructed here (before mount) rather than in onMounted(),
        // since Sidebar/BrickPalette/Toolbar need these as required props
        // for their very first render.
        const registry = new CreateBrickRegistryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        const toolRegistry = new CreateToolRegistryUseCase().execute();
        const documentManager = new CreateDocumentManagerUseCase().execute();
        const { saveDocumentUseCase, loadDocumentUseCase, forkDocumentUseCase } = new CreatePersistenceUseCase().execute();

        // Shared identity instance — same login state across all views
        const identityUseCase = inject('identityUseCase');
        const identityProvider = identityUseCase.provider;
        const { publishDocumentUseCase } = new CreatePublisherUseCase().execute(identityProvider);

        const editorSession = new EditorSession({
            registry,
            editorContext,
            toolRegistry,
            documentManager,
            selectionUseCase,
            previewUseCase,
            loadDocumentUseCase,
            identityProvider
        });

        const activeTool = ref(editorContext.tool.activeTool);
        const transformFeedback = ref(null);
        const selectionCount = ref(0);
        const subscriptions = [];

        function setTool(toolId) {
            editorContext.setActiveTool(toolId);
        }

        function alignSelection(mode) {
            editorSession.alignSelection(mode);
        }

        function distributeSelection(axis) {
            editorSession.distributeSelection(axis);
        }

        let onPointerDown = null;
        let onPointerMove = null;
        let onPointerUp = null;
        let onKeyDown = null;

        onMounted(() => {
            // ALWAYS initialize the renderer first so _container is set.
            editorSession.start(viewport.value);

            subscriptions.push(
                editorContext.eventBus.subscribe(
                    EditorEvent.TOOL_CHANGED,
                    ({ activeTool: t }) => {
                        activeTool.value = t;
                    }
                ),
                editorContext.eventBus.subscribe(
                    EditorEvent.SELECTION_CHANGED,
                    ({ selection }) => {
                        selectionCount.value = selection.items.length;
                    }
                )
            );

            if (route.query.fork) {
                try {
                    const forkedDocument = forkDocumentUseCase.execute(route.query.fork, identityProvider);
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
                const result = editorSession.onPointerMove(event);
                if (result && result.consumed) {
                    transformFeedback.value = result.feedback || null;
                }
            };
            viewport.value.addEventListener('pointermove', onPointerMove);
            // Window-level so a gizmo drag released outside the viewport
            // still commits instead of leaving the gesture stuck.
            onPointerUp = (event) => {
                editorSession.onPointerUp(event);
                transformFeedback.value = null;
            };
            window.addEventListener('pointerup', onPointerUp);

            onKeyDown = (event) => {
                // An active gizmo gesture owns the keyboard: route it
                // straight to the session (Escape cancels) and skip
                // every global shortcut.
                if (editorSession.isGestureActive()) {
                    editorSession.onKeyDown(event);
                    transformFeedback.value = null;
                    return;
                }
                const shortcutTool = TOOL_SHORTCUTS[event.key];
                if (shortcutTool) {
                    editorContext.setActiveTool(shortcutTool);
                    return;
                }
                const modifierPressed = event.ctrlKey || event.metaKey;
                if (modifierPressed && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    saveDocumentUseCase.execute(documentManager);
                    return;
                }
                if (modifierPressed && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                    if (editorSession.commandHistory.canUndo()) {
                        editorSession.commandHistory.undo();
                    }
                    return;
                }
                if (modifierPressed && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                    if (editorSession.commandHistory.canRedo()) {
                        editorSession.commandHistory.redo();
                    }
                    return;
                }
                editorSession.onKeyDown(event);
            };
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            for (const subscription of subscriptions) {
                subscription.unsubscribe();
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
            transformFeedback,
            selectionCount,
            setTool,
            alignSelection,
            distributeSelection,
            ToolId
        };
    }
};
