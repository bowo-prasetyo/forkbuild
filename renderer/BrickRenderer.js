import { normalizeTilt } from '../core/building/BrickOrientation.js';
import { ThreeBrickFactory } from './ThreeBrickFactory.js';
import { nightGlowColor } from '../core/nature/NightGlow.js';
import { castShadows } from './ShadowRoles.js';

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

    // { definitionId, x, y, z, rotationY, rotationX (radians), color, glow }, in
    // the brick's own (document-local) coordinates. rotationX is its tilt
    // (core/building/BrickOrientation.js), applied before rotationY (Euler 'YXZ').
    describe(brick) {
        const definition = this._registry.get(brick.definitionId);
        if (!definition) {
            throw new Error(`Unknown brick definition: ${brick.definitionId}`);
        }
        // Choose Your Brick Color: an instance override (Brick#color,
        // set by SetBrickColorCommand) wins; otherwise fall back to
        // this type's own default (BrickDefinition#color).
        const color = brick.color !== null && brick.color !== undefined ? brick.color : definition.color;
        return {
            definitionId: brick.definitionId,
            x: brick.position.x,
            y: brick.position.y,
            z: brick.position.z,
            rotationY: brick.rotation * (Math.PI / 180),
            rotationX: normalizeTilt(brick.tilt) * (Math.PI / 180),
            color,
            // The light it gives off at full night (core/nature/NightGlow.js), 0 for none.
            glow: nightGlowColor(definition, color)
        };
    }

    createMesh(brick) {
        const { definitionId, x, y, z, rotationY, rotationX, color, glow } = this.describe(brick);
        const mesh = this._brickFactory.createMesh(definitionId, color);
        // Lit after dark once a Renderer adds it (Renderer#add()).
        if (glow) mesh.userData.nightGlow = glow;
        castShadows(mesh, { receive: true });
        mesh.position.set(x, y, z);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.x = rotationX;
        mesh.rotation.y = rotationY;
        mesh.name = brick.id;

        return mesh;
    }
}
