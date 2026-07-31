import { Renderer } from '../renderer/Renderer.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// EditorView stays thin on purpose: it never touches Three.js directly.
// It hands the viewport element to Renderer and lets renderer/ own every
// scene/camera/lighting concern. If Vue is ever swapped out, nothing in
// renderer/ has to change.
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
        this._renderer = new Renderer(this.$refs.viewport);
        this._renderer.addDiagnosticCube();
        this._renderer.start();
    },
    beforeUnmount() {
        this._renderer.dispose();
    }
};
