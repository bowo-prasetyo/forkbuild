import { BuildingRenderer } from './BuildingRenderer.js';

// Draws a claimed build: a downloaded Snapshot whose publisher claims a
// position this device holds no Placement for. It is shown translucent at
// that claimed position so a Wanderer can see what is said to stand there,
// without the claim ever becoming a Placement (see
// application/snapshot/claimed/ClaimedBuilds.js).
//
// Deliberately separate from WorldRenderer: its meshes are never registered
// with brickInstances or placementMeshRegistry, so PickingService never hits
// them and nothing can select, inspect, edit or fork a ghost as if it were a
// real build. Each brick is a standalone mesh with its own translucent
// material, like a structure placement's (WorldRenderer#_renderStructurePlacement);
// a build larger than `maxBricks` is drawn only in part, since a ghost is a
// preview, not the build.
export const DEFAULT_MAX_GHOST_BRICKS = 4000;
const GHOST_OPACITY = 0.35;

export class ClaimedBuildGhostRenderer {
    constructor(renderer, registry, { buildingRenderer = new BuildingRenderer(registry), maxBricks = DEFAULT_MAX_GHOST_BRICKS } = {}) {
        this._renderer = renderer;
        this._buildingRenderer = buildingRenderer;
        this._maxBricks = maxBricks;
        // key -> meshes[]
        this._ghosts = new Map();
    }

    has(key) {
        return this._ghosts.has(key);
    }

    keys() {
        return Array.from(this._ghosts.keys());
    }

    // Replaces any ghost already shown under `key`. Returns how many bricks
    // were drawn. A brick whose definition is unknown here is skipped, never
    // fatal: a stranger's build may use bricks this device lacks.
    show(key, world, position) {
        this.hide(key);
        const groundY = typeof this._renderer.terrainHeightAt === 'function'
            ? this._renderer.terrainHeightAt(position.x, position.z)
            : 0;
        const meshes = [];
        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) {
                if (meshes.length >= this._maxBricks) {
                    break;
                }
                let mesh;
                try {
                    mesh = this._buildingRenderer.renderBrick(brick).mesh;
                } catch (error) {
                    continue;
                }
                mesh.position.set(
                    brick.position.x + position.x,
                    brick.position.y + position.y + groundY,
                    brick.position.z + position.z
                );
                mesh.rotation.y = brick.rotation * (Math.PI / 180);
                makeGhostly(mesh);
                this._renderer.add(mesh);
                meshes.push(mesh);
            }
        }
        this._ghosts.set(key, meshes);
        return meshes.length;
    }

    hide(key) {
        const meshes = this._ghosts.get(key);
        if (!meshes) {
            return;
        }
        for (const mesh of meshes) {
            this._renderer.remove(mesh);
            if (mesh.material && typeof mesh.material.dispose === 'function') {
                mesh.material.dispose();
            }
        }
        this._ghosts.delete(key);
    }

    hideAll() {
        for (const key of this.keys()) {
            this.hide(key);
        }
    }
}

function makeGhostly(mesh) {
    const material = mesh.material;
    if (!material) {
        return;
    }
    material.transparent = true;
    material.opacity = GHOST_OPACITY;
    // Translucent surfaces must not hide what is behind them, including
    // other ghost bricks.
    material.depthWrite = false;
    material.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.claimedBuildGhost = true;
}
