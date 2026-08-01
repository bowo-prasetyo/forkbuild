import { CreateEventBusUseCase } from '../../application/CreateEventBusUseCase.js';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateDemoWorldUseCase } from '../../application/CreateDemoWorldUseCase.js';
import { RenderWorldUseCase } from '../../application/RenderWorldUseCase.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// EditorView is intentionally dumb: it never imports core/ or renderer/
// directly. It asks application/ use cases to do the work and only keeps
// the handle they return, so it knows what to clean up on unmount.
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

        // Wire rendering first, so it's already subscribed before the world
        // gets populated below — the demo brick appears through the exact
        // same BuildingAdded event pipeline as everything placed after it.
        this._session = new RenderWorldUseCase().execute(this.$refs.viewport, eventBus, registry);
        this._world = new CreateDemoWorldUseCase().execute(eventBus);

        // TEMPORARY: proves PickingService works end to end. Picking itself
        // has no concept of "selected" — only "what's under the cursor
        // right now" — so this just logs the answer. Once SelectionService
        // exists (0.1.10) this click handler moves there and starts
        // actually doing something with the result (highlighting, etc).
        this._onViewportClick = (event) => {
            const result = this._session.pick(event.clientX, event.clientY);
            console.log('picked:', result);
        };
        this.$refs.viewport.addEventListener('click', this._onViewportClick);
    },
    beforeUnmount() {
        this.$refs.viewport.removeEventListener('click', this._onViewportClick);
        this._session.dispose();
    }
};
