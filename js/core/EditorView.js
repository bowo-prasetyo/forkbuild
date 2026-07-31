import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// EditorView stays thin: it never touches Three.js directly. It builds a
// World (pure data, from core/) and hands both the viewport element and the
// world to the rendering layer. Renderer owns the scene/camera/lights/loop;
// WorldRenderer owns turning World data into meshes. EditorView owns neither.
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
        this._worldRenderer = new WorldRenderer(this._renderer);

        this._world = this._createDemoWorld();
        this._worldRenderer.render(this._world);

        this._renderer.start();
    },
    beforeUnmount() {
        this._renderer.dispose();
    },
    methods: {
        // TEMPORARY bootstrap data proving World -> WorldRenderer -> Renderer
        // wiring works end to end. Once storage/ (Step 7) or the publisher
        // (Step 8) exist, worlds will be loaded from there instead of built
        // here by hand.
        _createDemoWorld() {
            const world = new World();

            const building = new Building({ id: 'demo-building', creator: 'local' });
            building.addBrick(new Brick({
                id: 'demo-brick-1',
                type: 'core:cube',
                position: new Position(0, 0.5, 0)
            }));

            world.addBuilding(building);
            return world;
        }
    }
};
