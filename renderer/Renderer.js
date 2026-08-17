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

        // 0.2.36 — a generic per-frame hook, deliberately NOT
        // avatar-specific (Renderer "owns the visualization pipeline
        // only" per this file's own header): any collaborator that
        // needs real elapsed time each frame (today: AvatarVisual's
        // gait clock, AvatarMovementController's simulation tick)
        // registers here instead of Renderer knowing anything about
        // avatars, movement, or presence.
        this._frameListeners = new Set();
        this._animationLoop = new AnimationLoop((deltaSeconds) => this._renderFrame(deltaSeconds));

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    get scene() {
        return this._sceneManager.scene;
    }

    get camera() {
        return this._cameraController.camera;
    }

    get cameraController() {
        return this._cameraController;
    }

    get domElement() {
        return this._webglRenderer.domElement;
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

    // Registers `callback(deltaSeconds)` to run once per render frame,
    // real elapsed seconds since the previous frame. Returns an
    // unsubscribe function, the same shape every EventBus subscription
    // in this codebase already returns.
    addFrameListener(callback) {
        this._frameListeners.add(callback);
        return () => this._frameListeners.delete(callback);
    }

    start() {
        this._animationLoop.start();
    }

    stop() {
        this._animationLoop.stop();
    }

    dispose() {
        this.stop();
        this._frameListeners.clear();
        window.removeEventListener('resize', this._onResize);
        this._cameraController.dispose();
        this._container.removeChild(this._webglRenderer.domElement);
        this._webglRenderer.dispose();
    }

    _renderFrame(deltaSeconds) {
        this._cameraController.update();
        for (const listener of this._frameListeners) {
            listener(deltaSeconds);
        }
        this._webglRenderer.render(this._sceneManager.scene, this._cameraController.camera);
    }

    _onResize() {
        const width = this._container.clientWidth;
        const height = this._container.clientHeight;
        this._cameraController.setAspect(width / height);
        this._webglRenderer.setSize(width, height);
    }
}
