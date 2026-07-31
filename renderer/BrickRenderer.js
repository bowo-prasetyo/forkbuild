import { ThreeBrickFactory } from './ThreeBrickFactory.js';

// BrickRenderer no longer knows what a brick looks like. Given a Brick, it
// asks the registry for its BrickDefinition (so an unknown definitionId
// fails loudly instead of silently rendering the wrong thing), then asks
// ThreeBrickFactory to build the actual mesh for that id.
export class BrickRenderer {
    constructor(registry, brickFactory = new ThreeBrickFactory()) {
        this._registry = registry;
        this._brickFactory = brickFactory;
    }

    createMesh(brick) {
        const definition = this._registry.get(brick.definitionId);
        if (!definition) {
            throw new Error(`Unknown brick definition: ${brick.definitionId}`);
        }

        const mesh = this._brickFactory.createMesh(brick.definitionId);
        mesh.position.set(brick.position.x, brick.position.y, brick.position.z);
        mesh.rotation.y = brick.rotation;
        mesh.name = brick.id;

        return mesh;
    }
}
