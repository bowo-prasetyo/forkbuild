import { Building } from './Building.js';
import { Group } from './Group.js';
import { DomainEvent } from './events/Event.js';
import { createId } from './createId.js';

// World is the aggregate root. It owns Buildings and Groups (0.1.43) and
// publishes domain events whenever something changes, so nothing else —
// not the renderer, not future undo/autosave/multiplayer/publisher
// systems — needs to be called manually after a mutation. eventBus is
// optional: a World created without one (e.g. during JSON hydration)
// simply publishes nothing.
export class World {
    constructor({ id = createId(), metadata = {}, eventBus = null } = {}) {
        this._id = id;
        this._buildings = new Map();
        this._groups = new Map();
        this._metadata = metadata;
        this._eventBus = eventBus;
    }

    get id() {
        return this._id;
    }

    get metadata() {
        return this._metadata;
    }

    addBuilding(building) {
        this._buildings.set(building.id, building);
        this._publish(DomainEvent.BUILDING_ADDED, { building });
    }

    removeBuilding(id) {
        const building = this._buildings.get(id);
        if (!building) {
            return;
        }
        this._buildings.delete(id);
        this._publish(DomainEvent.BUILDING_REMOVED, { building });
    }

    getBuilding(id) {
        return this._buildings.get(id) || null;
    }

    getBuildings() {
        return Array.from(this._buildings.values());
    }

    // Routes a brick mutation through the building it belongs to, then
    // publishes the event. Prefer this over calling building.addBrick()
    // directly whenever the rest of the engine needs to know about it —
    // which, in practice, is almost always.
    addBrickToBuilding(buildingId, brick) {
        const building = this.getBuilding(buildingId);
        if (!building) {
            throw new Error(`Unknown building: ${buildingId}`);
        }
        building.addBrick(brick);
        this._publish(DomainEvent.BRICK_ADDED, { buildingId, brick });
    }

    removeBrickFromBuilding(buildingId, brickId) {
        const building = this.getBuilding(buildingId);
        if (!building) {
            throw new Error(`Unknown building: ${buildingId}`);
        }
        const brick = building.findBrick(brickId);
        if (!brick) {
            return;
        }
        building.removeBrick(brickId);
        this._publish(DomainEvent.BRICK_REMOVED, { buildingId, brick });
    }

    // Mutates an existing brick and publishes BRICK_UPDATED so the
    // renderer can react incrementally. changes: { position, rotation }.
    updateBrick(buildingId, brickId, changes) {
        const building = this.getBuilding(buildingId);
        if (!building) {
            throw new Error(`Unknown building: ${buildingId}`);
        }
        const brick = building.findBrick(brickId);
        if (!brick) {
            return;
        }
        if (changes.position) {
            brick.position = changes.position;
        }
        if (changes.rotation !== undefined) {
            brick.rotation = changes.rotation;
        }
        this._publish(DomainEvent.BRICK_UPDATED, { buildingId, brick });
    }

    // -----------------------------------------------------------------
    // Groups (0.1.43) — document state, mediated exactly like bricks.
    // -----------------------------------------------------------------

    addGroup(group) {
        this._groups.set(group.id, group);
        this._publish(DomainEvent.GROUP_ADDED, { group });
    }

    removeGroup(groupId) {
        const group = this._groups.get(groupId);
        if (!group) {
            return;
        }
        this._groups.delete(groupId);
        this._publish(DomainEvent.GROUP_REMOVED, { group });
    }

    getGroup(groupId) {
        return this._groups.get(groupId) || null;
    }

    getGroups() {
        return Array.from(this._groups.values());
    }

    getGroupsContainingBrick(brickId) {
        return this.getGroups().filter((group) => group.hasMember(brickId));
    }

    // Resolves a group's membership against the live world, skipping
    // brick ids that no longer exist (membership is referential).
    getGroupBricks(groupId) {
        const group = this.getGroup(groupId);
        if (!group) {
            return [];
        }
        const bricks = [];
        for (const brickId of group.brickIds) {
            for (const building of this._buildings.values()) {
                const brick = building.findBrick(brickId);
                if (brick) {
                    bricks.push(brick);
                    break;
                }
            }
        }
        return bricks;
    }

    renameGroup(groupId, name) {
        const group = this.getGroup(groupId);
        if (!group) {
            return;
        }
        group.setName(name);
        this._publish(DomainEvent.GROUP_UPDATED, { group });
    }

    // Returns true if the brick was actually added (not already a member).
    addMemberToGroup(groupId, brickId) {
        const group = this.getGroup(groupId);
        if (!group) {
            return false;
        }
        const added = group.addMember(brickId);
        if (added) {
            this._publish(DomainEvent.GROUP_UPDATED, { group });
        }
        return added;
    }

    // Returns true if the brick was actually a member.
    removeMemberFromGroup(groupId, brickId) {
        const group = this.getGroup(groupId);
        if (!group) {
            return false;
        }
        const removed = group.removeMember(brickId);
        if (removed) {
            this._publish(DomainEvent.GROUP_UPDATED, { group });
        }
        return removed;
    }

    toJSON() {
        return {
            id: this._id,
            metadata: this._metadata,
            buildings: this.getBuildings().map((building) => building.toJSON()),
            groups: this.getGroups().map((group) => group.toJSON())
        };
    }

    static fromJSON(json, eventBus = null) {
        const world = new World({ id: json.id, metadata: json.metadata, eventBus });
        for (const buildingJson of json.buildings) {
            world.addBuilding(Building.fromJSON(buildingJson));
        }
        // Worlds serialized before 0.1.43 have no groups field.
        for (const groupJson of json.groups || []) {
            world.addGroup(Group.fromJSON(groupJson));
        }
        return world;
    }

    _publish(eventType, payload) {
        if (this._eventBus) {
            this._eventBus.publish(eventType, payload);
        }
    }
}
