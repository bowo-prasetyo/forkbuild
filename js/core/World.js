import { Building } from './Building.js';

export class World {
    constructor({ metadata = {} } = {}) {
        this._buildings = new Map();
        this._metadata = metadata;
    }

    get metadata() {
        return this._metadata;
    }

    addBuilding(building) {
        this._buildings.set(building.id, building);
    }

    removeBuilding(id) {
        this._buildings.delete(id);
    }

    getBuilding(id) {
        return this._buildings.get(id) || null;
    }

    getBuildings() {
        return Array.from(this._buildings.values());
    }

    toJSON() {
        return {
            metadata: this._metadata,
            buildings: this.getBuildings().map((building) => building.toJSON())
        };
    }

    static fromJSON(json) {
        const world = new World({ metadata: json.metadata });

        for (const buildingJson of json.buildings) {
            world.addBuilding(Building.fromJSON(buildingJson));
        }

        return world;
    }
}
