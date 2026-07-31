import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateDemoWorldUseCase } from '../../application/CreateDemoWorldUseCase.js';
import { RenderWorldUseCase } from '../../application/RenderWorldUseCase.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// EditorView is intentionally dumb: it never imports core/ or renderer/
// directly. It asks application/ use cases to do the work and only keeps
// the handle they return, so it knows what to clean up on unmount. A future
// desktop client could reuse these same use cases without Vue at all.
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
        const registry = new CreateBrickRegistryUseCase().execute();
        const world = new CreateDemoWorldUseCase().execute();
        this._session = new RenderWorldUseCase().execute(this.$refs.viewport, world, registry);
    },
    beforeUnmount() {
        this._session.dispose();
    }
};
