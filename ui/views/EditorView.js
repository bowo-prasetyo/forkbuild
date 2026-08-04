import { ref, onMounted, onBeforeUnmount } from 'vue';
import { CreateEventBusUseCase } from '../../application/CreateEventBusUseCase.js';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateDemoWorldUseCase } from '../../application/CreateDemoWorldUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/CreateToolRegistryUseCase.js';
import { RenderWorldUseCase } from '../../application/RenderWorldUseCase.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/PaletteUseCase.js';
import { PreviewUseCase } from '../../application/PreviewUseCase.js';
import { CommandHistory } from '../../application/CommandHistory.js';
import { CreateDocumentManagerUseCase } from '../../application/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/CreatePersistenceUseCase.js';
import { InputDispatcher } from '../../application/InputDispatcher.js';
import { ToolManager } from '../../application/ToolManager.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// TEMPORARY: '1'/'2' switch tools directly via EditorContext.setActiveTool,
// and Ctrl/Cmd+Z / Ctrl/Cmd+Y (or +Shift+Z) drive CommandHistory directly.
// No tool-switching UI or Edit menu exists yet — this is the same kind of
// lightweight, honest verification mechanism used throughout this build
// (the diagnostic cube, the console.log pick handler) rather than a real
// feature. Ctrl/Cmd+S, added in 0.1.20B, is different: it's a companion
// to a REAL Save button that now exists in Toolbar, not a stand-in for a
// missing one — a standard save shortcut is expected UX, not scaffolding.
// All of these stay here rather than moving into InputDispatcher: they're
// global, tool-independent decisions, not something that gets normalized-
// and-forwarded to whichever tool happens to be active.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

// EditorView is intentionally dumb: it never imports core/, renderer/, or
// storage/ directly, and — as of 0.1.18 — no longer even normalizes DOM
// events itself. It hands raw browser events straight to InputDispatcher,
// which normalizes and picks before forwarding to ToolManager.
export default {
    name: 'EditorView',
    components: { Toolbar, Sidebar },
    template: `
        <div class="editor-view">
            <Toolbar
                :document-manager="documentManager"
                :save-document-use-case="saveDocumentUseCase"
                :load-document-use-case="loadDocumentUseCase"
            />
            <div class="editor-body">
                <Sidebar :palette-use-case="paletteUseCase" />
                <div ref="viewport" class="viewport"></div>
            </div>
        </div>
    `,
    setup() {
        const viewport = ref(null);

        // Constructed here (before mount) rather than in onMounted(), since
        // Sidebar/BrickPalette/Toolbar need these as required props for
        // their very first render — waiting until onMounted() would leave
        // them without one for a frame. documentManager starts out wrapping
        // an empty placeholder Document (CreateDocumentManagerUseCase's
        // default) and gets pointed at the real World via attachWorld()
        // once CreateDemoWorldUseCase has run, inside onMounted().
        const eventBus = new CreateEventBusUseCase().execute();
        const registry = new CreateBrickRegistryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        const toolRegistry = new CreateToolRegistryUseCase().execute();
        const createDocumentManagerUseCase = new CreateDocumentManagerUseCase();
        const documentManager = createDocumentManagerUseCase.execute();
        const { saveDocumentUseCase, loadDocumentUseCase } = new CreatePersistenceUseCase().execute();

        let session = null;
        let toolManager = null;
        let inputDispatcher = null;
        let untrackDirtyState = null;
        let onPointerDown = null;
        let onPointerMove = null;
        let onKeyDown = null;

        onMounted(() => {
            // Wire rendering first, so it's already subscribed before the
            // world gets populated below — the demo brick appears through
            // the exact same BuildingAdded event pipeline as everything
            // placed after it.
            session = new RenderWorldUseCase().execute(
                viewport.value,
                eventBus,
                registry,
                editorContext.eventBus
            );
            const world = new CreateDemoWorldUseCase().execute(eventBus);
            createDocumentManagerUseCase.attachWorld(documentManager, world);
            const commandHistory = new CommandHistory({ world });
            untrackDirtyState = documentManager.trackCommandHistory(commandHistory);

            // ToolContext: a plain, explicit bag of what tools are allowed
            // to touch. No pick/pickGround anymore — as of 0.1.18,
            // InputDispatcher does picking once per event and hands tools
            // the result directly, so tools never call PickingService
            // themselves. No raw Three.js/Renderer reference either, and
            // no raw editorContext writes (selectionUseCase/previewUseCase
            // are the entry points for those) — tools stay bound by the
            // same discipline as ui/ itself. Tools execute commands
            // through commandHistory rather than calling command.execute()
            // directly, so a tool never needs to know whether undo/redo
            // exists.
            const toolContext = {
                world,
                editorContext,
                selectionUseCase,
                previewUseCase,
                commandHistory
            };
            toolManager = new ToolManager(toolRegistry, toolContext, editorContext);
            toolManager.start();

            inputDispatcher = new InputDispatcher(
                toolManager,
                (screenX, screenY) => session.pick(screenX, screenY),
                (screenX, screenY) => session.pickGround(screenX, screenY)
            );

            onPointerDown = (event) => inputDispatcher.dispatchPointerDown(event);
            viewport.value.addEventListener('pointerdown', onPointerDown);

            onPointerMove = (event) => inputDispatcher.dispatchPointerMove(event);
            viewport.value.addEventListener('pointermove', onPointerMove);

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
                if (modifierPressed && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                    if (commandHistory.canUndo()) {
                        commandHistory.undo();
                    }
                    return;
                }
                if (modifierPressed && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                    if (commandHistory.canRedo()) {
                        commandHistory.redo();
                    }
                    return;
                }

                inputDispatcher.dispatchKeyDown(event);
            };
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('keydown', onKeyDown);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            untrackDirtyState();
            toolManager.stop();
            session.dispose();
        });

        return { viewport, paletteUseCase, documentManager, saveDocumentUseCase, loadDocumentUseCase };
    }
};
