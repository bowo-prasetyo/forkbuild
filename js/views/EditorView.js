import * as THREE from 'three';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';

// NOTE: The scene setup in this file is a temporary smoke test proving the
// Three.js CDN import works end-to-end inside the Vue skeleton. It will be
// removed and replaced by js/renderer/* in Step 3 (Implement the renderer).
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
        this._initTemporaryScene();
    },
    beforeUnmount() {
        cancelAnimationFrame(this._animationId);
        window.removeEventListener('resize', this._onResize);
        if (this._renderer) {
            this.$refs.viewport.removeChild(this._renderer.domElement);
            this._renderer.dispose();
        }
    },
    methods: {
        _initTemporaryScene() {
            const container = this.$refs.viewport;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e1e1e);

            const camera = new THREE.PerspectiveCamera(
                60,
                container.clientWidth / container.clientHeight,
                0.1,
                1000
            );
            camera.position.set(2, 2, 3);
            camera.lookAt(0, 0, 0);

            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            container.appendChild(renderer.domElement);

            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(3, 5, 2);
            scene.add(light);
            scene.add(new THREE.AmbientLight(0x404040));

            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x4caf7d });
            const cube = new THREE.Mesh(geometry, material);
            scene.add(cube);

            const animate = () => {
                cube.rotation.x += 0.01;
                cube.rotation.y += 0.013;
                renderer.render(scene, camera);
                this._animationId = requestAnimationFrame(animate);
            };
            animate();

            this._onResize = () => {
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            };
            window.addEventListener('resize', this._onResize);

            this._renderer = renderer;
            this._scene = scene;
            this._camera = camera;
        }
    }
};
