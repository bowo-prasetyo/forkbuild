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
import { InputDispatcher } from '../../application/InputDispatcher.js';
import { ToolManager } from '../../application/ToolManager.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// TEMPORARY: '1'/'2' switch tools directly via EditorContext.setActiveTool,
// and Ctrl/Cmd+Z / Ctrl/Cmd+Y (or +Shift+Z) drive CommandHistory directly.
// No real Toolbar UI or Edit menu exists yet — this is the same kind of
// lightweight, honest verification mechanism used throughout this build
// (the diagnostic cube, the console.log pick handler) rather than a real
// feature. Replace with actual Toolbar/menu buttons calling the same
// editorContext.setActiveTool()/commandHistory.undo()/.redo() when that
// UI is built. These stay here rather than moving into InputDispatcher:
// undo/redo and tool-switching are global, tool-independent decisions,
// not something that gets normalized-and-forwarded to whichever tool
// happens to be active — InputDispatcher's job stops at "what happened,
// pre-picked," not "what should the editor do about it globally."
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

// EditorView is intentionally dumb: it never imports core/ or renderer/
// directly, and — as of 0.1.18 — no longer even normalizes DOM events
// itself. It hands raw browser events straight to InputDispatcher, which
// normalizes and picks before forwarding to ToolManager. EditorView's
// only remaining input-related job is the temporary global shortcuts
// above, which fall outside "route input to the active tool" entirely.
export default {
    name: 'EditorView',
    components: { Toolbar, Sidebar },
    template: `
        <div class="editor-view">
            <Toolbar />
            <div class="editor-body">
                <Sidebar :palette-use-case="paletteUseCase" />
                <div ref="viewport" class="viewport"></div>
            </div>
        </div>
    `,
    setup() {
        const viewport = ref(null);

        // Constructed here (before mount) rather than in onMounted(), since
        // Sidebar/BrickPalette need paletteUseCase for their very first
        // render — waiting until onMounted() would leave them without a
        // required prop for one frame.
        const eventBus = new CreateEventBusUseCase().execute();
        const registry = new CreateBrickRegistryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        const toolRegistry = new CreateToolRegistryUseCase().execute();

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
            const commandHistory = new CommandHistory({ world });
            const documentManager = new CreateDocumentManagerUseCase().execute(world);
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

        return { viewport, paletteUseCase };
    }
};
