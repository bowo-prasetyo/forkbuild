import { ThreeBrickFactory } from './ThreeBrickFactory.js';

// BrickRenderer no longer knows what a brick looks like. Given a Brick, it
// asks the registry for its BrickDefinition (so an unknown definitionId
// fails loudly instead of silently rendering the wrong thing), then either
// describes how it should be drawn (describe(), for
// renderer/BrickInstanceRegistry.js) or asks ThreeBrickFactory to build a
// standalone mesh for it (createMesh()).
export class BrickRenderer {
    constructor(registry, brickFactory = new ThreeBrickFactory()) {
        this._registry = registry;
        this._brickFactory = brickFactory;
    }

    // { definitionId, x, y, z, rotationY (radians), color }, in the
    // brick's own (document-local) coordinates.
    describe(brick) {
        const definition = this._registry.get(brick.definitionId);
        if (!definition) {
            throw new Error(`Unknown brick definition: ${brick.definitionId}`);
        }
        return {
            definitionId: brick.definitionId,
            x: brick.position.x,
            y: brick.position.y,
            z: brick.position.z,
            rotationY: brick.rotation * (Math.PI / 180),
            // Choose Your Brick Color: an instance override (Brick#color,
            // set by SetBrickColorCommand) wins; otherwise fall back to
            // this type's own default (BrickDefinition#color).
            color: brick.color !== null && brick.color !== undefined ? brick.color : definition.color
        };
    }

    createMesh(brick) {
        const { definitionId, x, y, z, rotationY, color } = this.describe(brick);
        const mesh = this._brickFactory.createMesh(definitionId, color);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotationY;
        mesh.name = brick.id;

        return mesh;
    }
}
