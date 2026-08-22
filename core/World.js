import { Building } from './Building.js';
import { Group } from './Group.js';
import { StructurePlacement } from './StructurePlacement.js';
import { WorldLandmark } from './WorldLandmark.js';
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
        this._placements = new Map();
        this._landmarks = new Map();
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

    // -----------------------------------------------------------------
    // Structure placements (0.2.90) — document state, mediated exactly
    // like buildings and groups above. A StructurePlacement never owns
    // bricks (core/StructurePlacement.js's own header); World only ever
    // stores the reference + position/rotation, never the referenced
    // Document's content.
    // -----------------------------------------------------------------

    addStructurePlacement(placement) {
        this._placements.set(placement.id, placement);
        this._publish(DomainEvent.STRUCTURE_PLACEMENT_ADDED, { placement });
    }

    removeStructurePlacement(id) {
        const placement = this._placements.get(id);
        if (!placement) {
            return;
        }
        this._placements.delete(id);
        this._publish(DomainEvent.STRUCTURE_PLACEMENT_REMOVED, { placement });
    }

    getStructurePlacement(id) {
        return this._placements.get(id) || null;
    }

    // 0.2.91 — World Instance Editing & Placement Management. Mutates an
    // EXISTING placement's position and/or rotation in place — the
    // instance-manipulation counterpart to updateBrick() above. changes:
    // { position, rotation }. Never touches documentId: moving or
    // rotating a placement never changes what it references (see
    // core/StructurePlacement.js's own header). A silent no-op for an
    // unknown id, the same graceful-absence posture removeStructurePlacement()
    // already takes.
    updateStructurePlacement(id, changes) {
        const placement = this._placements.get(id);
        if (!placement) {
            return;
        }
        if (changes.position) {
            placement.position = changes.position;
        }
        if (changes.rotation !== undefined) {
            placement.rotation = changes.rotation;
        }
        this._publish(DomainEvent.STRUCTURE_PLACEMENT_UPDATED, { placement });
    }

    getStructurePlacements() {
        return Array.from(this._placements.values());
    }

    // -----------------------------------------------------------------
    // Landmarks (0.3.7) — named, persistent points worth remembering.
    // A WorldLandmark is SEMANTIC: a human-meaningful label attached to
    // a position. Multiple landmarks can coexist; they do not partition
    // space or conflict. Deleting a landmark does NOT delete any nearby
    // structures, placements, or other content — curation organizes
    // content; it does not own content. See core/WorldLandmark.js.
    // -----------------------------------------------------------------

    addLandmark(landmark) {
        this._landmarks.set(landmark.id, landmark);
        this._publish(DomainEvent.LANDMARK_ADDED, { landmark });
    }

    removeLandmark(id) {
        const landmark = this._landmarks.get(id);
        if (!landmark) {
            return;
        }
        this._landmarks.delete(id);
        this._publish(DomainEvent.LANDMARK_REMOVED, { landmark });
    }

    getLandmark(id) {
        return this._landmarks.get(id) || null;
    }

    getLandmarks() {
        return Array.from(this._landmarks.values());
    }

    updateLandmark(id, changes) {
        const landmark = this._landmarks.get(id);
        if (!landmark) {
            return;
        }
        if (changes.title !== undefined) {
            landmark._title = changes.title;
        }
        if (changes.description !== undefined) {
            landmark._description = changes.description;
        }
        if (changes.position !== undefined) {
            landmark._position = changes.position;
        }
        this._publish(DomainEvent.LANDMARK_UPDATED, { landmark });
    }

    toJSON() {
        return {
            id: this._id,
            metadata: this._metadata,
            buildings: this.getBuildings().map((building) => building.toJSON()),
            groups: this.getGroups().map((group) => group.toJSON()),
            placements: this.getStructurePlacements().map((placement) => placement.toJSON()),
            landmarks: this.getLandmarks().map((landmark) => landmark.toJSON())
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
        // Worlds serialized before 0.2.90 have no placements field.
        for (const placementJson of json.placements || []) {
            world.addStructurePlacement(StructurePlacement.fromJSON(placementJson));
        }
        // Worlds serialized before 0.3.7 have no landmarks field.
        for (const landmarkJson of json.landmarks || []) {
            world.addLandmark(WorldLandmark.fromJSON(landmarkJson));
        }
        return world;
    }

    _publish(eventType, payload) {
        if (this._eventBus) {
            this._eventBus.publish(eventType, payload);
        }
    }
}
