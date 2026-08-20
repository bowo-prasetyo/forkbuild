import { BuildingRenderer } from './BuildingRenderer.js';
import { MeshRegistry } from './MeshRegistry.js';
import { DomainEvent } from '../core/events/Event.js';

// WorldRenderer has no render(world) sweep. It subscribes to the domain
// events World publishes and reacts incrementally — one event, one mesh
// created or removed — instead of deleting and rebuilding everything on
// every change. This is the same approach editors like Blender or Unity
// use to keep a scene view in sync with a document.
//
// BuildingAdded/BuildingRemoved handle bulk changes (a whole building,
// possibly already containing bricks — e.g. on initial load). BrickAdded/
// BrickRemoved handle single-brick changes. Both paths go through
// BuildingRenderer -> BrickRenderer -> BrickRegistry -> ThreeBrickFactory,
// exactly as before; only how they get triggered has changed.
//
// meshRegistry is exposed via a getter so PickingService (constructed
// alongside this in RenderWorldUseCase) can resolve raycast hits back to
// brick/building ids without WorldRenderer needing to know PickingService
// exists.
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
        this._documentOffsets = new Map();
        this._buildingToDocument = new Map();
    }

    get meshRegistry() {
        return this._meshRegistry;
    }

    // Event-driven mode (EditorView)
    subscribe(eventBus) {
        this._subscriptions.push(
            eventBus.subscribe(DomainEvent.BUILDING_ADDED, ({ building }) => this._onBuildingAdded(building)),
            eventBus.subscribe(DomainEvent.BUILDING_REMOVED, ({ building }) => this._onBuildingRemoved(building)),
            eventBus.subscribe(DomainEvent.BRICK_ADDED, ({ buildingId, brick }) => this._onBrickAdded(buildingId, brick)),
            eventBus.subscribe(DomainEvent.BRICK_REMOVED, ({ brick }) => this._onBrickRemoved(brick)),
            eventBus.subscribe(DomainEvent.BRICK_UPDATED, ({ buildingId, brick }) => this._onBrickUpdated(buildingId, brick))
        );
    }

    unsubscribe() {
        for (const subscription of this._subscriptions) {
            subscription.unsubscribe();
        }
        this._subscriptions = [];
    }

    // Imperative mode (WorldView): render an entire world at once with
    // its documentId and optional layout offset so multiple worlds occupy
    // distinct regions of shared space.
    addWorld(world, documentId, layoutPosition = null) {
        const offset = layoutPosition
            ? { x: layoutPosition.x, y: layoutPosition.y, z: layoutPosition.z }
            : { x: 0, y: 0, z: 0 };
        this._documentOffsets.set(documentId, offset);
        const groundY = this._terrainOffsetY(offset.x, offset.z);

        for (const building of world.getBuildings()) {
            this._buildingToDocument.set(building.id, documentId);
            for (const brick of building.getBricks()) {
                const { brickId, mesh } = this._buildingRenderer.renderBrick(brick);
                mesh.position.x += offset.x;
                mesh.position.y += offset.y + groundY;
                mesh.position.z += offset.z;
                this._addBrickMesh(brickId, documentId, building.id, mesh);
            }
        }
    }

    // Remove every mesh belonging to a specific world. Called during
    // spatial unload — the world itself is not mutated, only its
    // visual representation is removed from the renderer.
    removeWorld(world, documentId) {
        this._documentOffsets.delete(documentId);
        for (const building of world.getBuildings()) {
            this._buildingToDocument.delete(building.id);
            for (const brick of building.getBricks()) {
                this._removeBrickMesh(brick.id);
            }
        }
    }

    _onBuildingAdded(building) {
        const documentId = this._buildingToDocument.get(building.id);
        const offset = this._documentOffsets.get(documentId) || { x: 0, y: 0, z: 0 };
        const groundY = this._terrainOffsetY(offset.x, offset.z);
        for (const { brickId, mesh } of this._buildingRenderer.renderBricks(building)) {
            mesh.position.x += offset.x;
            mesh.position.y += offset.y + groundY;
            mesh.position.z += offset.z;
            this._addBrickMesh(brickId, documentId, building.id, mesh);
        }
    }

    _onBuildingRemoved(building) {
        for (const brick of building.getBricks()) {
            this._removeBrickMesh(brick.id);
        }
    }

    _onBrickAdded(buildingId, brick) {
        const documentId = this._buildingToDocument.get(buildingId);
        const offset = this._documentOffsets.get(documentId) || { x: 0, y: 0, z: 0 };
        const groundY = this._terrainOffsetY(offset.x, offset.z);
        const { brickId, mesh } = this._buildingRenderer.renderBrick(brick);
        mesh.position.x += offset.x;
        mesh.position.y += offset.y + groundY;
        mesh.position.z += offset.z;
        this._addBrickMesh(brickId, documentId, buildingId, mesh);
    }

    _onBrickRemoved(brick) {
        this._removeBrickMesh(brick.id);
    }

    _onBrickUpdated(buildingId, brick) {
        const mesh = this._meshRegistry.getMesh(brick.id);
        if (!mesh) {
            return;
        }
        const documentId = this._meshRegistry.getDocumentId(brick.id);
        const offset = this._documentOffsets.get(documentId) || { x: 0, y: 0, z: 0 };
        const groundY = this._terrainOffsetY(offset.x, offset.z);
        mesh.position.set(
            brick.position.x + offset.x,
            brick.position.y + offset.y + groundY,
            brick.position.z + offset.z
        );
        mesh.rotation.y = brick.rotation * (Math.PI / 180);
    }

    // 0.2.76 — sampled ONCE per document, at its own placement position
    // (offset.x/offset.z), never per brick: a whole building rides the
    // terrain as one rigid unit at its own ground level, never tilted or
    // deformed brick-by-brick — see docs/Principles.md, "Terrain
    // Elevation Is A Rendering-Time Offset, Never A Presence Or
    // Placement Fact." Guarded by a feature check, not a hard dependency
    // on renderer/Renderer.js: every existing test constructs
    // WorldRenderer with a plain `{ add, remove }` fake "low-level
    // renderer" (see tests/ForkRenderSync.test.js) that has no
    // terrainHeightAt() at all — those keep behaving exactly as before,
    // groundY simply 0, the same graceful-absence posture every other
    // optional collaborator in this codebase already follows.
    _terrainOffsetY(x, z) {
        return typeof this._renderer.terrainHeightAt === 'function'
            ? this._renderer.terrainHeightAt(x, z)
            : 0;
    }

    _addBrickMesh(brickId, documentId, buildingId, mesh) {
        this._meshRegistry.set(brickId, documentId, buildingId, mesh);
        this._renderer.add(mesh);
    }

    _removeBrickMesh(brickId) {
        const mesh = this._meshRegistry.getMesh(brickId);
        if (mesh) {
            this._renderer.remove(mesh);
            this._meshRegistry.delete(brickId);
        }
    }
}
