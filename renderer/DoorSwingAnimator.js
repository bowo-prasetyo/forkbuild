import { doorSwingTarget, stepDoorSwing, doorSwingOffset } from '../core/DoorSwing.js';
import { isPassableDoor } from '../core/BrickPassage.js';

// Swings World View's doors open as people walk up to them, and shut behind
// them (core/DoorSwing.js decides how far; this draws it). Two kinds of
// door are drawn: a World's own bricks, as instances in the
// BrickInstanceRegistry, and the bricks of structure placements, each a mesh
// of its own (renderer/WorldRenderer.js#_renderStructurePlacement()), which
// that renderer hands over with addMeshDoor().
//
// Only standing doors swing: a door tilted onto its side is a plank. Doors
// with nobody near and already shut cost one distance check a frame.
export class DoorSwingAnimator {
    // registry: the BrickRegistry, for which definitions are doors and how
    // wide each one is.
    constructor(brickInstances, registry) {
        this._brickInstances = brickInstances;
        this._registry = registry;
        // Definition ids that are doors, worked out once per id.
        this._doorDefinitions = new Map();
        // key -> { mesh, door: { x, y, z, rotationY, width, height }, swing }
        this._meshDoors = new Map();
    }

    // A placement's door brick, drawn as `mesh` with no swing: `door` is
    // where its middle is and how it is turned, as drawn.
    addMeshDoor(key, mesh, door) {
        this._meshDoors.set(key, { mesh, door: { ...door }, swing: 0 });
    }

    removeMeshDoor(key) {
        this._meshDoors.delete(key);
    }

    // The door definition `definitionId` names, or null.
    doorDefinition(definitionId) {
        if (!this._doorDefinitions.has(definitionId)) {
            const definition = this._registry?.get?.(definitionId) || null;
            this._doorDefinitions.set(definitionId, isPassableDoor(definition) ? definition : null);
        }
        return this._doorDefinitions.get(definitionId);
    }

    // observers: [{ x, y, z }], where the people who open doors stand, in
    // world coordinates.
    animate(observers, deltaSeconds) {
        for (const definitionId of this._doorDefinitionIds()) {
            const definition = this.doorDefinition(definitionId);
            for (const brickId of this._brickInstances.brickIdsOf(definitionId)) {
                const visual = this._brickInstances.getVisual(brickId);
                if (!visual || visual.rotationX) continue;
                const current = this._brickInstances.getSwing(brickId) || 0;
                const door = { x: visual.x, y: visual.y, z: visual.z, rotationY: visual.rotationY, width: definition.width, height: definition.height };
                const next = stepDoorSwing(current, doorSwingTarget(door, observers), deltaSeconds);
                if (next !== current) {
                    this._brickInstances.setSwing(brickId, next, definition.width);
                }
            }
        }
        for (const entry of this._meshDoors.values()) {
            const next = stepDoorSwing(entry.swing, doorSwingTarget(entry.door, observers), deltaSeconds);
            if (next === entry.swing) continue;
            entry.swing = next;
            const { door, mesh } = entry;
            const offset = doorSwingOffset(door.width, door.rotationY, next);
            mesh.position.set(door.x + offset.x, door.y, door.z + offset.z);
            mesh.rotation.y = door.rotationY + next;
        }
    }

    // Worked out on the first frame: the brick libraries are all registered
    // before World View draws anything.
    _doorDefinitionIds() {
        if (!this._doorIds) {
            this._doorIds = (this._registry?.getByCategory?.('door') || [])
                .filter((definition) => this.doorDefinition(definition.id))
                .map((definition) => definition.id);
        }
        return this._doorIds;
    }
}
