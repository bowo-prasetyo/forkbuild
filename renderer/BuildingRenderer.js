import { BrickRenderer } from './BrickRenderer.js';

// One responsibility: turn Bricks into something drawable, delegating to
// BrickRenderer (which needs the registry to resolve definitionId ->
// BrickDefinition). describeBrick() gives the instance description
// renderer/WorldRenderer.js batches; renderBricks()/renderBrick() build
// standalone meshes (structure placements, document thumbnails) and
// return { brickId, mesh } pairs so callers can track/remove them later.
export class BuildingRenderer {
    constructor(registry, brickRenderer = new BrickRenderer(registry)) {
        this._brickRenderer = brickRenderer;
    }

    describeBrick(brick) {
        return this._brickRenderer.describe(brick);
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
