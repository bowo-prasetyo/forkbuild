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
import { ToolManager } from '../../application/ToolManager.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// TEMPORARY: '1'/'2' switch tools directly via EditorContext.setActiveTool.
// No real Toolbar UI exists yet to click "Select"/"Place" — this is the
// same kind of lightweight, honest verification mechanism used throughout
// this build (the diagnostic cube, the console.log pick handler) rather
// than a real feature. Replace with actual Toolbar buttons calling the
// same editorContext.setActiveTool() when that UI is built.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

// EditorView is intentionally dumb: it never imports core/ or renderer/
// directly, and contains no selection/placement LOGIC — it just
// normalizes raw DOM events into plain pointer/key objects and forwards
// them to ToolManager. What happens on a click or a mouse move depends
// entirely on which tool is active; EditorView doesn't know or care.
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

            // ToolContext: a plain, explicit bag of what tools are allowed
            // to touch. No raw Three.js/Renderer reference (pick/pickGround
            // are the narrow capabilities instead) and no raw editorContext
            // writes (selectionUseCase/previewUseCase are the entry points
            // for those) — tools stay bound by the same discipline as ui/
            // itself. Tools execute commands through commandHistory rather
            // than calling command.execute() directly, so a tool never
            // needs to know whether undo/redo exists.
            const toolContext = {
                world,
                editorContext,
                pick: (screenX, screenY) => session.pick(screenX, screenY),
                pickGround: (screenX, screenY) => session.pickGround(screenX, screenY),
                selectionUseCase,
                previewUseCase,
                commandHistory
            };
            toolManager = new ToolManager(toolRegistry, toolContext, editorContext);
            toolManager.start();

            onPointerDown = (event) => {
                toolManager.onPointerDown({
                    screenX: event.clientX,
                    screenY: event.clientY,
                    button: event.button
                });
            };
            viewport.value.addEventListener('pointerdown', onPointerDown);

            onPointerMove = (event) => {
                toolManager.onPointerMove({
                    screenX: event.clientX,
                    screenY: event.clientY
                });
            };
            viewport.value.addEventListener('pointermove', onPointerMove);

            onKeyDown = (event) => {
                const shortcutTool = TOOL_SHORTCUTS[event.key];
                if (shortcutTool) {
                    editorContext.setActiveTool(shortcutTool);
                    return;
                }
                toolManager.onKeyDown({ key: event.key });
            };
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('keydown', onKeyDown);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            toolManager.stop();
            session.dispose();
        });

        return { viewport, paletteUseCase };
    }
};
