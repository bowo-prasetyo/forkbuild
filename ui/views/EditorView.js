import { ref, onMounted, onBeforeUnmount } from 'vue';
import { CreateEventBusUseCase } from '../../application/CreateEventBusUseCase.js';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateDemoWorldUseCase } from '../../application/CreateDemoWorldUseCase.js';
import { RenderWorldUseCase } from '../../application/RenderWorldUseCase.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/PaletteUseCase.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

const CLEAR_SELECTION_KEY = 'Escape';

// EditorView is intentionally dumb: it never imports core/ or renderer/
// directly. It asks application/ use cases to do the work and only keeps
// the handles they return, so it knows what to clean up on unmount.
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

        let session = null;
        let onViewportClick = null;
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
            new CreateDemoWorldUseCase().execute(eventBus);

            // Click brick -> select it. Click empty space -> clear
            // selection. Click the already-selected brick -> stays
            // selected (select() is idempotent; no toggle-off yet).
            onViewportClick = (event) => {
                const result = session.pick(event.clientX, event.clientY);
                if (result) {
                    selectionUseCase.select(result.brickId, result.buildingId);
                } else {
                    selectionUseCase.clear();
                }
            };
            viewport.value.addEventListener('click', onViewportClick);

            // Escape clears selection. Unlike CameraController's Home-reset
            // (a renderer-internal concern), "what's selected" is editor
            // state, so this shortcut is wired here at the UI/application
            // boundary instead.
            onKeyDown = (event) => {
                if (event.key === CLEAR_SELECTION_KEY) {
                    selectionUseCase.clear();
                }
            };
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('keydown', onKeyDown);
            viewport.value.removeEventListener('click', onViewportClick);
            session.dispose();
        });

        return { viewport, paletteUseCase };
    }
};
