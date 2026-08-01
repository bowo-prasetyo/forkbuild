import { Building } from './Building.js';
import { DomainEvent } from './events/Event.js';
import { createId } from './createId.js';

// World is the aggregate root. It owns Buildings and publishes domain
// events whenever something changes, so nothing else — not the renderer,
// not future undo/autosave/multiplayer/publisher systems — needs to be
// called manually after a mutation. eventBus is optional: a World created
// without one (e.g. during JSON hydration) simply publishes nothing.
export class World {
    constructor({ id = createId(), metadata = {}, eventBus = null } = {}) {
        this._id = id;
        this._buildings = new Map();
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

    toJSON() {
        return {
            id: this._id,
            metadata: this._metadata,
            buildings: this.getBuildings().map((building) => building.toJSON())
        };
    }

    static fromJSON(json, eventBus = null) {
        const world = new World({ id: json.id, metadata: json.metadata, eventBus });

        for (const buildingJson of json.buildings) {
            world.addBuilding(Building.fromJSON(buildingJson));
        }

        return world;
    }

    _publish(eventType, payload) {
        if (this._eventBus) {
            this._eventBus.publish(eventType, payload);
        }
    }
}
