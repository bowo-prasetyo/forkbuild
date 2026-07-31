import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { CameraController } from './CameraController.js';
import { Lights } from './Lights.js';
import { GridHelper } from './GridHelper.js';
import { AnimationLoop } from './AnimationLoop.js';

const SKY_COLOR = 0x87ceeb;

// Renderer owns the visualization pipeline only: scene, camera, lights, grid,
// and the render loop. It never owns game state (bricks, buildings, worlds).
// Callers hand it THREE.Object3D instances via add()/remove() — everything
// about what those objects represent lives in core/ and world/, not here.
export class Renderer {
    constructor(container) {
        this._container = container;

        this._webglRenderer = new THREE.WebGLRenderer({ antialias: true });
        this._webglRenderer.setPixelRatio(window.devicePixelRatio || 1);
        this._webglRenderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this._webglRenderer.domElement);

        this._sceneManager = new SceneManager();
        this._sceneManager.scene.background = new THREE.Color(SKY_COLOR);

        this._cameraController = new CameraController(
            this._webglRenderer.domElement,
            container.clientWidth / container.clientHeight
        );

        this._lights = new Lights(this._sceneManager);
        this._grid = new GridHelper(this._sceneManager);

        this._animationLoop = new AnimationLoop(() => this._renderFrame());

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    get scene() {
        return this._sceneManager.scene;
    }

    get camera() {
        return this._cameraController.camera;
    }

    add(object) {
        this._sceneManager.add(object);
    }

    remove(object) {
        this._sceneManager.remove(object);
    }

    resetCameraView() {
        this._cameraController.resetView();
    }

    start() {
        this._animationLoop.start();
    }

    stop() {
        this._animationLoop.stop();
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);
        this._cameraController.dispose();
        this._container.removeChild(this._webglRenderer.domElement);
        this._webglRenderer.dispose();
    }

    _renderFrame() {
        this._cameraController.update();
        this._webglRenderer.render(this._sceneManager.scene, this._cameraController.camera);
    }

    _onResize() {
        const width = this._container.clientWidth;
        const height = this._container.clientHeight;
        this._cameraController.setAspect(width / height);
        this._webglRenderer.setSize(width, height);
    }
}
