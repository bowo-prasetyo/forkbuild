import * as THREE from 'three';
import { BuildingRenderer } from './BuildingRenderer.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { computeThumbnailCamera } from '../core/PreviewCameraFraming.js';

// Matches renderer/Renderer.js's own SKY_COLOR (not imported — that
// constant is private to Renderer.js) so a thumbnail reads as a small
// window into the same world a live viewport shows, not a
// differently-lit one-off render.
const SKY_COLOR = 0x87ceeb;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 200;
const DEFAULT_FOV = 40;

// 0.2.32 — the ONE-SHOT, offscreen counterpart to the interactive
// Renderer/WorldRenderer pair. Deliberately NOT built on Renderer.js:
// that class exists to drive a live, continuously-rendered,
// mouse-controlled viewport appended to the DOM (OrbitControls,
// animation loop, window resize listener) — a thumbnail needs none of
// that, just one still frame on a canvas nobody ever sees. What IS
// reused is the actual brick -> mesh construction
// (BuildingRenderer/BrickRenderer/ThreeBrickFactory) — the exact same
// meshes a real viewport would build for the same document, so a
// thumbnail is a genuine (if differently framed and lit) picture of
// the content, not a separate visual language invented for this
// purpose.
//
// The WebGLRenderer/canvas/scene here are created ONCE, in the
// constructor, and REUSED for every renderDocument() call —
// deliberately, not an oversight. Creating a fresh WebGLRenderer per
// thumbnail would mean a fresh WebGL context per thumbnail, and
// browsers cap how many can exist at once (commonly around 16 per
// page); a catalog of even a few dozen publications would exhaust
// that budget almost immediately, breaking every OTHER WebGL surface
// on the page (including the live World View, if open elsewhere) in
// the process. Only the scene's CONTENTS (the meshes built for each
// call's document) are torn down and disposed between renders — see
// _clearMeshes.
export class DocumentThumbnailRenderer {
    constructor(registry, { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
        this._registry = registry;
        this._buildingRenderer = new BuildingRenderer(registry);
        this._meshes = [];

        // Deliberately never appended to document.body (or anywhere
        // else) — this canvas is a pixel buffer this class reads from
        // via toDataURL(), never a thing anyone looks at directly.
        this._canvas = document.createElement('canvas');
        this._webglRenderer = new THREE.WebGLRenderer({
            canvas: this._canvas,
            antialias: true,
            // Required for toDataURL() to reliably read back the frame
            // just rendered — without this, the browser is free to
            // clear the drawing buffer as soon as compositing finishes,
            // and a read immediately after render() can come back blank.
            preserveDrawingBuffer: true
        });
        this._webglRenderer.setSize(width, height, false);

        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(SKY_COLOR);
        this._scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(10, 15, 8);
        this._scene.add(directional);

        this._camera = new THREE.PerspectiveCamera(DEFAULT_FOV, width / height, 0.1, 10000);
    }

    // Renders `document` and returns a `data:` URL (PNG). Synchronous
    // — a single WebGL frame doesn't need to be awaited — but this is
    // still real, non-trivial main-thread work, so callers (see
    // application/PreviewService.js) should only invoke this from an
    // idle-scheduled queue, never back-to-back in a tight loop.
    renderDocument(document) {
        const bricks = [];
        for (const building of document.world.getBuildings()) {
            bricks.push(...building.getBricks());
        }
        return this.renderBricks(bricks);
    }

    // 0.2.84 (Building Library & Palette UX) — the same one-shot render
    // pipeline, for a flat list of core/Brick.js instances that don't
    // belong to a Document/World at all: a Structure's own `bricks`, or
    // a single synthetic Brick standing in for one BrickDefinition. Both
    // a Build Library brick/structure thumbnail and a Document thumbnail
    // are, underneath, "some bricks, framed and rendered" — this method
    // is that shared operation; renderDocument() is now a two-line
    // adapter over it, not a second implementation.
    renderBricks(bricks) {
        this._clearMeshes();

        for (const brick of bricks) {
            const { mesh } = this._buildingRenderer.renderBrick(brick);
            this._scene.add(mesh);
            this._meshes.push(mesh);
        }

        // The framing decision — position, target, field of view —
        // comes ENTIRELY from core/PreviewCameraFraming.js's pure
        // function; this class only ever applies whatever that
        // function decided, it never makes a framing choice of its own.
        const bounds = SpatialBounds.fromBricks(bricks, this._registry);
        const framing = computeThumbnailCamera(bounds);
        this._camera.fov = framing.fovDegrees;
        this._camera.position.set(framing.position.x, framing.position.y, framing.position.z);
        this._camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
        this._camera.updateProjectionMatrix();

        this._webglRenderer.render(this._scene, this._camera);
        return this._canvas.toDataURL('image/png');
    }

    _clearMeshes() {
        for (const mesh of this._meshes) {
            this._scene.remove(mesh);
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach((material) => material.dispose());
            } else {
                mesh.material.dispose();
            }
        }
        this._meshes = [];
    }

    // Not called anywhere in the live app today (the service that owns
    // this renderer is a page-lifetime singleton — see
    // application/PreviewService.js) but provided for completeness and
    // for tests that construct a short-lived instance of their own.
    dispose() {
        this._clearMeshes();
        this._webglRenderer.dispose();
    }
}
