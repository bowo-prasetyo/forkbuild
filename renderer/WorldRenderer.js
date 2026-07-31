import { BuildingRenderer } from './BuildingRenderer.js';
import { MeshRegistry } from './MeshRegistry.js';
import { DomainEvent } from '../core/events/Event.js';

// WorldRenderer no longer has a render(world) sweep. It subscribes to the
// domain events World publishes and reacts incrementally — one event, one
// mesh created or removed — instead of deleting and rebuilding everything
// on every change. This is the same approach editors like Blender or Unity
// use to keep a scene view in sync with a document.
//
// BuildingAdded/BuildingRemoved handle bulk changes (a whole building,
// possibly already containing bricks — e.g. on initial load). BrickAdded/
// BrickRemoved handle single-brick changes. Both paths go through
// BuildingRenderer -> BrickRenderer -> BrickRegistry -> ThreeBrickFactory,
// exactly as before; only how they get triggered has changed.
export class WorldRenderer {
    constructor(
        renderer,
        registry,
        buildingRenderer = new BuildingRenderer(registry),
        meshRegistry = new MeshRegistry()
    ) {
        this._renderer = renderer;
        this._buildingRenderer = buildingRenderer;
        this._meshRegistry = meshRegistry;
        this._subscriptions = [];
    }

    subscribe(eventBus) {
        this._subscriptions.push(
            eventBus.subscribe(DomainEvent.BUILDING_ADDED, ({ building }) => this._onBuildingAdded(building)),
            eventBus.subscribe(DomainEvent.BUILDING_REMOVED, ({ building }) => this._onBuildingRemoved(building)),
            eventBus.subscribe(DomainEvent.BRICK_ADDED, ({ brick }) => this._onBrickAdded(brick)),
            eventBus.subscribe(DomainEvent.BRICK_REMOVED, ({ brick }) => this._onBrickRemoved(brick))
        );
    }

    unsubscribe() {
        for (const subscription of this._subscriptions) {
            subscription.unsubscribe();
        }
        this._subscriptions = [];
    }

    _onBuildingAdded(building) {
        for (const { brickId, mesh } of this._buildingRenderer.renderBricks(building)) {
            this._addBrickMesh(brickId, mesh);
        }
    }

    _onBuildingRemoved(building) {
        for (const brick of building.getBricks()) {
            this._removeBrickMesh(brick.id);
        }
    }

    _onBrickAdded(brick) {
        const { brickId, mesh } = this._buildingRenderer.renderBrick(brick);
        this._addBrickMesh(brickId, mesh);
    }

    _onBrickRemoved(brick) {
        this._removeBrickMesh(brick.id);
    }

    _addBrickMesh(brickId, mesh) {
        this._meshRegistry.set(brickId, mesh);
        this._renderer.add(mesh);
    }

    _removeBrickMesh(brickId) {
        const mesh = this._meshRegistry.get(brickId);
        if (mesh) {
            this._renderer.remove(mesh);
            this._meshRegistry.delete(brickId);
        }
    }
}
