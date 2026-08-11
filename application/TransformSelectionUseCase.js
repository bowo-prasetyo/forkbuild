import { SelectionBoundsService } from './SelectionBoundsService.js';
import { TransformSelectionCommand } from './commands/TransformSelectionCommand.js';
import { calculateTransforms, transformsEqual } from './TransformMath.js';

// The single entry point for transforming selections (0.1.44). Every
// transform — keyboard nudge, pivot rotation, gizmo gesture commit, in
// any surface — routes through here, and every one becomes exactly ONE
// TransformSelectionCommand in history. There is deliberately no
// MoveGroupCommand/RotateGroupCommand/ScaleGroupCommand: one generalized
// transform command covers single bricks, multi-selections, and resolved
// groups alike.
//
// Selection in, command out. The use case resolves the selection's
// member bricks, computes absolute post-transforms relative to the
// selection pivot (bounds center), and executes the command. It never
// sees a Group: group selection is resolved into an ordinary selection
// state before arriving here — groups define relationships, transforms
// modify members.
//
// Accepts a Document or a bare World (sessions hold documents; tools
// hold worlds). No-op transforms — calculated result identical to the
// current state — execute nothing and return null, keeping history free
// of empty entries (the discipline gizmo commit has had since 0.1.38,
// now applied to every transform path).
export class TransformSelectionUseCase {
    constructor(brickRegistry) {
        this._boundsService = new SelectionBoundsService(brickRegistry);
    }

    // Computes absolute post-transforms without executing anything.
    // Returns { pivot, before, transforms } or null when the selection
    // is not transformable (empty, ground, or referencing missing
    // bricks). `before` is the captured current state — callers (gizmo
    // commit) use it for no-op detection and rollback.
    calculateTransforms(documentOrWorld, selection, transform) {
        const world = this._resolveWorld(documentOrWorld);
        if (!world || !selection || selection.isEmpty || selection.type === 'ground') {
            return null;
        }
        const bounds = this._boundsService.calculate(selection, { world });
        if (!bounds) {
            return null;
        }
        const before = [];
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (!brick) {
                return null;
            }
            before.push({
                buildingId: item.buildingId,
                brickId: item.brickId,
                position: brick.position.toJSON(),
                rotation: brick.rotation
            });
        }
        return {
            pivot: bounds.center,
            before,
            transforms: calculateTransforms(before, bounds.center, transform)
        };
    }

    // Executes ONE TransformSelectionCommand for the requested transform.
    // Returns the executed command, or null when the selection is not
    // transformable or the transform would change nothing.
    execute(commandHistory, documentOrWorld, selection, transform, description = null) {
        if (!commandHistory) {
            return null;
        }
        const calculated = this.calculateTransforms(documentOrWorld, selection, transform);
        if (!calculated) {
            return null;
        }
        if (transformsEqual(calculated.before, calculated.transforms)) {
            return null;
        }
        const world = this._resolveWorld(documentOrWorld);
        const count = calculated.transforms.length;
        const command = new TransformSelectionCommand({
            worldId: world.id,
            transforms: calculated.transforms,
            description: description || `Transform ${count} ${count === 1 ? 'Brick' : 'Bricks'}`
        });
        commandHistory.execute(command);
        return command;
    }

    _resolveWorld(documentOrWorld) {
        if (!documentOrWorld) {
            return null;
        }
        return documentOrWorld.world || documentOrWorld;
    }
}
