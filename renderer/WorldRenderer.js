import { BuildingRenderer } from './BuildingRenderer.js';

// WorldRenderer's only job: render(world).
//
// World -> (for each) Building -> BuildingRenderer -> (for each) Brick ->
// BrickRenderer -> Mesh -> Renderer.add()
//
// WorldRenderer itself creates nothing directly — it delegates to
// BuildingRenderer, which delegates to BrickRenderer. Renderer never knows
// any of this exists; it only ever receives finished meshes through
// add()/remove().
export class WorldRenderer {
    constructor(renderer, buildingRenderer = new BuildingRenderer()) {
        this._renderer = renderer;
        this._buildingRenderer = buildingRenderer;
        this._meshesByBrickId = new Map();
    }

    render(world) {
        this.clear();

        for (const building of world.getBuildings()) {
            const brickMeshes = this._buildingRenderer.renderBricks(building);

            for (const { brickId, mesh } of brickMeshes) {
                this._meshesByBrickId.set(brickId, mesh);
                this._renderer.add(mesh);
            }
        }
    }

    clear() {
        for (const mesh of this._meshesByBrickId.values()) {
            this._renderer.remove(mesh);
        }
        this._meshesByBrickId.clear();
    }
}
