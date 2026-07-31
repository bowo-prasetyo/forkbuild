import * as THREE from 'three';

// TEMPORARY: every brick renders as the same plain colored box, regardless
// of its `type`. Real per-type geometry arrives with the Brick Library
// (Step 5). This class's only job right now is to prove the data flow:
// World -> Building -> Brick -> Mesh -> Renderer, replacing the renderer's
// old hardcoded diagnostic cube with real (if minimal) world data.
const PLACEHOLDER_SIZE = 1;
const PLACEHOLDER_COLOR = 0x4caf7d;

export class WorldRenderer {
    constructor(renderer) {
        this._renderer = renderer;
        this._meshesByBrickId = new Map();
    }

    render(world) {
        this.clear();

        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) {
                this._addBrickMesh(brick);
            }
        }
    }

    clear() {
        for (const mesh of this._meshesByBrickId.values()) {
            this._renderer.remove(mesh);
        }
        this._meshesByBrickId.clear();
    }

    _addBrickMesh(brick) {
        const geometry = new THREE.BoxGeometry(
            PLACEHOLDER_SIZE,
            PLACEHOLDER_SIZE,
            PLACEHOLDER_SIZE
        );
        const material = new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOR });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(brick.position.x, brick.position.y, brick.position.z);
        mesh.rotation.y = brick.rotation;

        this._meshesByBrickId.set(brick.id, mesh);
        this._renderer.add(mesh);
    }
}
