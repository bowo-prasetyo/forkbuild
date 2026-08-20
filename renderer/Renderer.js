import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { CameraController } from './CameraController.js';
import { Lights } from './Lights.js';
import { GridHelper } from './GridHelper.js';
import { AnimationLoop } from './AnimationLoop.js';
import { TerrainStreamingController } from './TerrainStreamingController.js';
import { buildTerrainTileMesh } from './TerrainTileMesh.js';
import { buildNaturalFeatureTileMesh } from './NaturalFeatureTileMesh.js';
import { buildWaterTileMesh } from './WaterTileMesh.js';
import { terrainHeightAt as computeTerrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

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

        // 0.2.76 — World Ground & Terrain Foundation. Lives alongside
        // GridHelper rather than replacing it: GridHelper stays the
        // Editor's precise, origin-relative snapping reference,
        // completely unchanged; terrain is the new, camera-following
        // SOLID ground underneath both Editor and World View — see
        // docs/Roadmap.md, 0.2.76, and core/TerrainHeightField.js's own
        // header. terrainHeightAt() below is the ONE shared query point
        // every ground-placement site in this codebase reads from
        // (renderer/WorldRenderer.js for buildings,
        // application/RenderWorldViewUseCase.js for avatars) — never a
        // second, independently-computed terrain function anywhere else.
        this._terrainStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildTerrainTileMesh(tx, tz, DEFAULT_WORLD_SEED)
        );
        this._terrainStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

        // 0.2.88 — Deterministic World Ecology. A SECOND, independent
        // instance of the exact same TerrainStreamingController class
        // just used for ground above — never a new streaming/tiling
        // system of its own. Vegetation shares the ground's tile grid and
        // load/unload orchestration entirely by construction (same
        // TERRAIN_TILE_SIZE, same DEFAULT_STREAMING_RADIUS default), and
        // differs only in what tileFactory builds: trees instead of
        // colored ground. See core/NaturalFeatureField.js's own header
        // for why natural features are recomputed per tile, never
        // persisted, and renderer/NaturalFeatureTileMesh.js's own header
        // for the trunk/canopy instancing this factory produces.
        this._vegetationStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildNaturalFeatureTileMesh(tx, tz, DEFAULT_WORLD_SEED)
        );
        this._vegetationStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

        // 0.2.89 — World Water & Hydrology Foundation. A THIRD instance
        // of the exact same TerrainStreamingController class, following
        // the identical precedent 0.2.88 set for vegetation just above —
        // never a new streaming system, never a WaterStreamingController.
        // Water shares the ground's tile grid and load/unload
        // orchestration by construction, differing only in what its
        // tileFactory builds: a flat lake plane (renderer/WaterTileMesh.js)
        // instead of colored ground or trees. Rivers need no streamed
        // geometry of their own — they are a ground-color tint
        // core/Hydrology.js#hydrologyGroundColorAt() already layers into
        // the SAME terrain tile mesh above, so they load and unload with
        // the ground exactly like every other ground-color treatment
        // already does.
        this._waterStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildWaterTileMesh(tx, tz, DEFAULT_WORLD_SEED)
        );
        this._waterStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

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

    // 0.2.76 — deterministic ground elevation at world (x, z). A thin
    // pass-through to core/TerrainHeightField.js's own pure function
    // with this renderer's fixed DEFAULT_WORLD_SEED — see that file's
    // header for why one shared seed, and docs/Principles.md, "Terrain
    // Elevation Is A Rendering-Time Offset, Never A Presence Or
    // Placement Fact," for how callers are expected to use the result.
    terrainHeightAt(x, z) {
        return computeTerrainHeightAt(DEFAULT_WORLD_SEED, x, z);
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
        this._terrainStreaming.dispose();
        this._vegetationStreaming.dispose();
        this._waterStreaming.dispose();
        window.removeEventListener('resize', this._onResize);
        this._cameraController.dispose();
        this._container.removeChild(this._webglRenderer.domElement);
        this._webglRenderer.dispose();
    }

    _renderFrame(deltaSeconds) {
        this._cameraController.update();
        this._terrainStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        this._vegetationStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        this._waterStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
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
