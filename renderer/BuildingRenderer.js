import { BrickRenderer } from './BrickRenderer.js';

// One responsibility: given a Building, produce a mesh for each of its
// bricks (delegating the actual mesh creation to BrickRenderer) and pair
// each mesh with the brick id it came from, so callers can track/remove
// them individually later.
export class BuildingRenderer {
    constructor(brickRenderer = new BrickRenderer()) {
        this._brickRenderer = brickRenderer;
    }

    renderBricks(building) {
        return building.getBricks().map((brick) => ({
            brickId: brick.id,
            mesh: this._brickRenderer.createMesh(brick)
        }));
    }
}
