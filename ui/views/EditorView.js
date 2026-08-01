import { CreateEventBusUseCase } from '../../application/CreateEventBusUseCase.js';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateDemoWorldUseCase } from '../../application/CreateDemoWorldUseCase.js';
import { RenderWorldUseCase } from '../../application/RenderWorldUseCase.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
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
                <Sidebar />
                <div ref="viewport" class="viewport"></div>
            </div>
        </div>
    `,
    mounted() {
        const eventBus = new CreateEventBusUseCase().execute();
        const registry = new CreateBrickRegistryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);

        // Wire rendering first, so it's already subscribed before the world
        // gets populated below — the demo brick appears through the exact
        // same BuildingAdded event pipeline as everything placed after it.
        this._session = new RenderWorldUseCase().execute(
            this.$refs.viewport,
            eventBus,
            registry,
            editorContext.eventBus
        );
        this._world = new CreateDemoWorldUseCase().execute(eventBus);

        // Click brick -> select it. Click empty space -> clear selection.
        // Click the already-selected brick -> stays selected (select() is
        // idempotent here; there's no toggle-to-deselect behavior yet).
        this._onViewportClick = (event) => {
            const result = this._session.pick(event.clientX, event.clientY);
            if (result) {
                selectionUseCase.select(result.brickId, result.buildingId);
            } else {
                selectionUseCase.clear();
            }
        };
        this.$refs.viewport.addEventListener('click', this._onViewportClick);

        // Escape clears selection. Unlike CameraController's Home-reset
        // (a renderer-internal concern bound inside renderer/), "what's
        // selected" is editor state, so this shortcut is wired here at the
        // UI/application boundary instead.
        this._onKeyDown = (event) => {
            if (event.key === CLEAR_SELECTION_KEY) {
                selectionUseCase.clear();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this._onKeyDown);
        this.$refs.viewport.removeEventListener('click', this._onViewportClick);
        this._session.dispose();
    }
};
