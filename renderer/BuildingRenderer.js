import { BrickRenderer } from './BrickRenderer.js';

// One responsibility: given a Building, produce a mesh for each of its
// bricks (delegating the actual mesh creation to BrickRenderer, which needs
// the registry to resolve definitionId -> BrickDefinition) and pair each
// mesh with the brick id it came from, so callers can track/remove them
// individually later.
export class BuildingRenderer {
    constructor(registry, brickRenderer = new BrickRenderer(registry)) {
        this._brickRenderer = brickRenderer;
    }

    renderBricks(building) {
        return building.getBricks().map((brick) => ({
            brickId: brick.id,
            mesh: this._brickRenderer.createMesh(brick)
        }));
    }
}
