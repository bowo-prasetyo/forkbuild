import { BrickRenderer } from './BrickRenderer.js';

// One responsibility: turn Bricks into meshes, delegating the actual mesh
// creation to BrickRenderer (which needs the registry to resolve
// definitionId -> BrickDefinition). renderBricks() handles a whole
// building at once (used when a BuildingAdded event arrives); renderBrick()
// handles exactly one (used when a single BrickAdded event arrives). Both
// return { brickId, mesh } pairs so callers can track/remove them later.
export class BuildingRenderer {
    constructor(registry, brickRenderer = new BrickRenderer(registry)) {
        this._brickRenderer = brickRenderer;
    }

    renderBricks(building) {
        return building.getBricks().map((brick) => this.renderBrick(brick));
    }

    renderBrick(brick) {
        return {
            brickId: brick.id,
            mesh: this._brickRenderer.createMesh(brick)
        };
    }
}
