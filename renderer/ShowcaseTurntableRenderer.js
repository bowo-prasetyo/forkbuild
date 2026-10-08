import * as THREE from 'three';
import { BuildingRenderer } from './BuildingRenderer.js';
import { SceneManager } from './SceneManager.js';
import { Lights } from './Lights.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { computeThumbnailCamera } from '../core/PreviewCameraFraming.js';

// Matches renderer/Renderer.js's SKY_COLOR, so the showcase looks like the
// world the Editor and World View draw.
const SKY_COLOR = 0x87ceeb;
const GROUND_COLOR = 0x7da35a;
const FOV_DEGREES = 35;
const PADDING = 1.0;
// One turn every 40 seconds.
const RADIANS_PER_SECOND = (Math.PI * 2) / 40;
const START_AZIMUTH = Math.PI / 4;
const MAX_PIXEL_RATIO = 2;

// Home's 3D showcase: some bricks on a patch of grass, drawn into a canvas
// the caller places, with the camera turning slowly around them. Built from
// the same meshes (BuildingRenderer) and lights (Lights) as every other
// view, but with none of Renderer.js's controls, picking or terrain: nobody
// edits anything here. It owns one WebGL context, released by dispose().
//
// `reducedMotion` draws one still frame and never turns. While turning, it
// draws only on animation frames, which browsers pause for hidden tabs.
export class ShowcaseTurntableRenderer {
    constructor(registry, canvas, { reducedMotion = false } = {}) {
        this._registry = registry;
        this._canvas = canvas;
        this._reducedMotion = reducedMotion;
        this._buildingRenderer = new BuildingRenderer(registry);
        this._meshes = [];
        this._frame = null;
        this._lastTime = null;
        this._azimuth = START_AZIMUTH;
        this._orbit = null;

        this._webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this._webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
        this._sceneManager = new SceneManager();
        this._sceneManager.scene.background = new THREE.Color(SKY_COLOR);
        new Lights(this._sceneManager);
        this._camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 10000);
        this._ground = null;
    }

    show(bricks) {
        this._clear();
        for (const brick of bricks) {
            const { mesh } = this._buildingRenderer.renderBrick(brick);
            this._sceneManager.add(mesh);
            this._meshes.push(mesh);
        }
        if (bricks.length === 0) {
            this._orbit = null;
            return;
        }
        const bounds = SpatialBounds.fromBricks(bricks, this._registry);
        const framing = computeThumbnailCamera(bounds, { fovDegrees: FOV_DEGREES, padding: PADDING });
        const { center, size } = bounds;
        // Wide enough for every corner of the bricks' footprint, plus a margin.
        const groundRadius = Math.hypot(size.x, size.z) / 2 + 1.5;
        this._ground = new THREE.Mesh(
            new THREE.CircleGeometry(groundRadius, 48),
            new THREE.MeshStandardMaterial({ color: GROUND_COLOR })
        );
        this._ground.rotation.x = -Math.PI / 2;
        this._ground.position.set(center.x, bounds.min.y - 0.01, center.z);
        this._sceneManager.add(this._ground);

        const offset = {
            x: framing.position.x - framing.target.x,
            y: framing.position.y - framing.target.y,
            z: framing.position.z - framing.target.z
        };
        this._orbit = {
            target: framing.target,
            horizontal: Math.hypot(offset.x, offset.z),
            height: offset.y
        };
        this._camera.fov = framing.fovDegrees;
        this._draw();
    }

    start() {
        if (this._reducedMotion || this._frame !== null) {
            return;
        }
        const tick = (time) => {
            if (this._lastTime !== null) {
                this._azimuth += Math.min((time - this._lastTime) / 1000, 0.1) * RADIANS_PER_SECOND;
            }
            this._lastTime = time;
            this._draw();
            this._frame = requestAnimationFrame(tick);
        };
        this._frame = requestAnimationFrame(tick);
    }

    stop() {
        if (this._frame !== null) {
            cancelAnimationFrame(this._frame);
            this._frame = null;
        }
        this._lastTime = null;
    }

    // Matches the drawing buffer to the canvas's displayed size; call it
    // when that size changes.
    resize() {
        const width = this._canvas.clientWidth;
        const height = this._canvas.clientHeight;
        if (width === 0 || height === 0) {
            return;
        }
        this._webglRenderer.setSize(width, height, false);
        this._camera.aspect = width / height;
        this._draw();
    }

    dispose() {
        this.stop();
        this._clear();
        this._webglRenderer.dispose();
        this._webglRenderer.forceContextLoss();
    }

    _draw() {
        if (!this._orbit) {
            return;
        }
        const { target, horizontal, height } = this._orbit;
        this._camera.position.set(
            target.x + horizontal * Math.cos(this._azimuth),
            target.y + height,
            target.z + horizontal * Math.sin(this._azimuth)
        );
        this._camera.lookAt(target.x, target.y, target.z);
        this._camera.updateProjectionMatrix();
        this._webglRenderer.render(this._sceneManager.scene, this._camera);
    }

    _clear() {
        const meshes = this._ground ? [...this._meshes, this._ground] : this._meshes;
        for (const mesh of meshes) {
            this._sceneManager.scene.remove(mesh);
            mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => material.dispose());
        }
        this._meshes = [];
        this._ground = null;
    }
}
