import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
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
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';
import GroupsPanel from '../components/GroupsPanel.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';

// TEMPORARY: '1'/'2' switch tools directly via EditorContext.setActiveTool.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };
const MARQUEE_THRESHOLD_PX = 6;

// EditorView stays intentionally dumb about the engine: it builds the
// collaborators EditorSession needs once, then only ever calls session
// methods and forwards raw DOM events. As of 0.1.45 it additionally
// owns the MARQUEE GESTURE — the Shift+drag rectangle and its overlay —
// because gesture tracking and overlay drawing are view concerns; the
// selection semantics themselves live in EditorSession.marqueeSelect(),
// and containment lives in the renderer (PickingService.pickInRectangle).
export default {
    name: 'EditorView',
    components: { Toolbar, Sidebar, GroupsPanel },
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
<GroupsPanel :editor-session="editorSession" :document-manager="documentManager" />
</div>
<div ref="viewport" class="viewport">
<div v-if="marquee" class="marquee-rect" :style="marqueeStyle"></div>
</div>
</div>
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
        // 0.1.45 — marquee gesture state (view-owned).
        const marquee = ref(null);
        let marqueeStart = null;
        let marqueeActive = false;
        let controlsDisabled = false;

        const marqueeStyle = computed(() => {
            if (!marquee.value) {
                return {};
            }
            return {
                left: `${marquee.value.left}px`,
                top: `${marquee.value.top}px`,
                width: `${marquee.value.width}px`,
                height: `${marquee.value.height}px`
            };
        });

        let unsubTool = null;

        function setTool(toolId) {
            editorContext.setActiveTool(toolId);
        }

        function updateMarquee(clientX, clientY) {
            const rect = viewport.value.getBoundingClientRect();
            marquee.value = {
                left: Math.min(marqueeStart.x, clientX) - rect.left,
                top: Math.min(marqueeStart.y, clientY) - rect.top,
                width: Math.abs(clientX - marqueeStart.x),
                height: Math.abs(clientY - marqueeStart.y)
            };
        }

        function endMarquee() {
            marquee.value = null;
            marqueeStart = null;
            marqueeActive = false;
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
                // Shift+drag in the Select tool starts a marquee instead
                // of a click — don't forward it to the tool layer.
                if (event.shiftKey && activeTool.value === ToolId.SELECT) {
                    marqueeStart = { x: event.clientX, y: event.clientY };
                    marqueeActive = false;
                    editorSession.setControlsEnabled(false);
                    controlsDisabled = true;
                    return;
                }
                editorSession.onPointerDown(event);
            };
            viewport.value.addEventListener('pointerdown', onPointerDown);

            onPointerMove = (event) => {
                if (marqueeStart) {
                    const dx = event.clientX - marqueeStart.x;
                    const dy = event.clientY - marqueeStart.y;
                    if (Math.sqrt(dx * dx + dy * dy) > MARQUEE_THRESHOLD_PX) {
                        marqueeActive = true;
                    }
                    if (marqueeActive) {
                        updateMarquee(event.clientX, event.clientY);
                        return;
                    }
                }
                editorSession.onPointerMove(event);
            };
            viewport.value.addEventListener('pointermove', onPointerMove);

            onPointerUp = (event) => {
                if (controlsDisabled) {
                    editorSession.setControlsEnabled(true);
                    controlsDisabled = false;
                }
                if (marqueeStart && marqueeActive) {
                    // Marquee -> replace selection; Ctrl/Cmd held -> add.
                    // Session state only: zero history entries.
                    editorSession.marqueeSelect(
                        { x0: marqueeStart.x, y0: marqueeStart.y, x1: event.clientX, y1: event.clientY },
                        { additive: event.ctrlKey || event.metaKey }
                    );
                    endMarquee();
                    return;
                }
                endMarquee();
            };
            viewport.value.addEventListener('pointerup', onPointerUp);

            onKeyDown = (event) => {
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
                // Select all (0.1.45) — session state, zero history entries.
                if (modifierPressed && event.key.toLowerCase() === 'a') {
                    event.preventDefault();
                    editorSession.selectAll();
                    return;
                }
                // Copy / Paste (0.1.43 parity) — copy is observation,
                // paste is one command through the session.
                if (modifierPressed && event.key.toLowerCase() === 'c') {
                    event.preventDefault();
                    editorSession.copySelection();
                    return;
                }
                if (modifierPressed && event.key.toLowerCase() === 'v') {
                    event.preventDefault();
                    editorSession.pasteClipboard();
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
            if (unsubTool) {
                unsubTool.unsubscribe();
            }
            window.removeEventListener('keydown', onKeyDown);
            viewport.value.removeEventListener('pointerup', onPointerUp);
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
            marquee,
            marqueeStyle,
            setTool,
            ToolId
        };
    }
};
