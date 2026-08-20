import { BuildingRenderer } from './BuildingRenderer.js';
import { MeshRegistry } from './MeshRegistry.js';
import { PlacementMeshRegistry } from './PlacementMeshRegistry.js';
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
//
// 0.2.90 — Structure Placement & World Instances. A StructurePlacement
// (core/StructurePlacement.js) is rendered by resolving its documentId
// FRESH, every add, through `structureResolver`
// (application/StructureDocumentResolver.js) — never a snapshot copied
// into the World at placement time. This is what makes "edit the
// referenced Document, every placement reflects it on next load" true
// without any synchronization machinery: there is only ever one
// authoritative representation of a structure's bricks to draw from.
//
// Placement meshes are tracked in their OWN registry
// (`_placementMeshRegistry`, renderer/PlacementMeshRegistry.js, keyed by
// placementId), deliberately NEVER registered with `meshRegistry` — the
// same Document placed twice (House at A, House at B) would otherwise
// mint the SAME brick ids twice into a registry keyed by brick id alone.
// 0.2.91 gives PickingService its OWN second raycast against this
// registry instead (application/RenderWorldUseCase.js wires
// placementMeshRegistry in alongside meshRegistry) — a placed
// structure's individual bricks are still never individually pickable,
// but the WHOLE instance now is, resolved via mesh uuid -> placementId
// rather than mesh uuid -> brickId.
//
// `transformMath` composes a placement's rotation with each of its
// bricks' local positions — injected (mirrors TransformGizmoController's
// own transformMath injection in application/RenderWorldUseCase.js /
// RenderWorldViewUseCase.js) rather than imported, because renderer/
// must never depend on application/ (see RenderWorldUseCase.js's own
// header). A placement with rotation 0 (the common case) never needs it
// at all; one with a nonzero rotation and no injected transformMath
// (an old caller, a minimal test fake) degrades to translating without
// rotating — the same graceful-absence posture `terrainHeightAt` already
// gets below, never a thrown error.
export class WorldRenderer {
    constructor(
        renderer,
        registry,
        buildingRenderer = new BuildingRenderer(registry),
        meshRegistry = new MeshRegistry(),
        structureResolver = null,
        transformMath = null
    ) {
        this._renderer = renderer;
        this._buildingRenderer = buildingRenderer;
        this._meshRegistry = meshRegistry;
        this._structureResolver = structureResolver;
        this._transformMath = transformMath;
        this._subscriptions = [];
        this._documentOffsets = new Map();
        this._buildingToDocument = new Map();
        // 0.2.91 — was a bare Map(placementId -> meshes[]); now a small
        // dedicated registry (renderer/PlacementMeshRegistry.js) that
        // ALSO indexes mesh uuid -> placementId, so PickingService can
        // resolve a raycast hit on a placement's brick back to the
        // instance it belongs to — the enabling change for "select the
        // whole instance." Exposed via its own getter below, mirroring
        // meshRegistry's own getter exactly.
        this._placementMeshRegistry = new PlacementMeshRegistry();
        this._placementToDocument = new Map();
    }

    get meshRegistry() {
        return this._meshRegistry;
    }

    // 0.2.91 — read by application/RenderWorldUseCase.js to construct
    // PickingService with a second, placement-aware mesh source, exactly
    // the way meshRegistry already is.
    get placementMeshRegistry() {
        return this._placementMeshRegistry;
    }

    // Event-driven mode (EditorView)
    subscribe(eventBus) {
        this._subscriptions.push(
            eventBus.subscribe(DomainEvent.BUILDING_ADDED, ({ building }) => this._onBuildingAdded(building)),
            eventBus.subscribe(DomainEvent.BUILDING_REMOVED, ({ building }) => this._onBuildingRemoved(building)),
            eventBus.subscribe(DomainEvent.BRICK_ADDED, ({ buildingId, brick }) => this._onBrickAdded(buildingId, brick)),
            eventBus.subscribe(DomainEvent.BRICK_REMOVED, ({ brick }) => this._onBrickRemoved(brick)),
            eventBus.subscribe(DomainEvent.BRICK_UPDATED, ({ buildingId, brick }) => this._onBrickUpdated(buildingId, brick)),
            eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_ADDED, ({ placement }) => this._onStructurePlacementAdded(placement)),
            eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_REMOVED, ({ placement }) => this._onStructurePlacementRemoved(placement)),
            // 0.2.91 — an already-placed instance moved/rotated in
            // place. There is no incremental per-mesh update here (a
            // placement can carry many bricks, all of which shift
            // together): remove and re-render, the same "small World,
            // simplest correct thing" trade-off _onBuildingAdded/Removed
            // already make for a whole building.
            eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_UPDATED, ({ placement }) => this._onStructurePlacementUpdated(placement))
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
        for (const placement of world.getStructurePlacements()) {
            this._placementToDocument.set(placement.id, documentId);
            this._renderStructurePlacement(placement, offset);
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
        for (const placement of world.getStructurePlacements()) {
            this._placementToDocument.delete(placement.id);
            this._removeStructurePlacementMeshes(placement.id);
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

    // 0.2.90 — mirrors _onBuildingAdded's own offset lookup exactly:
    // `_placementToDocument` is only ever populated by addWorld() (World
    // View's imperative mode), so an event-driven WorldRenderer
    // (EditorView, which never calls addWorld) always falls through to
    // the {0,0,0} default here — the same implicit "there is only ever
    // one document, at the origin" assumption every other event handler
    // in this class already makes.
    _onStructurePlacementAdded(placement) {
        const documentId = this._placementToDocument.get(placement.id);
        const offset = this._documentOffsets.get(documentId) || { x: 0, y: 0, z: 0 };
        this._renderStructurePlacement(placement, offset);
    }

    _onStructurePlacementRemoved(placement) {
        this._removeStructurePlacementMeshes(placement.id);
        this._placementToDocument.delete(placement.id);
    }

    // 0.2.91 — remove-and-re-render at the placement's (possibly new)
    // position/rotation. _placementToDocument still names the SAME
    // containing document (updating a placement never changes which
    // World it lives in), so the offset/terrain lookup is unaffected —
    // only the placement's own position/rotation, read fresh off the
    // `placement` the event carries, changes what gets composed.
    _onStructurePlacementUpdated(placement) {
        this._removeStructurePlacementMeshes(placement.id);
        const documentId = this._placementToDocument.get(placement.id);
        const offset = this._documentOffsets.get(documentId) || { x: 0, y: 0, z: 0 };
        this._renderStructurePlacement(placement, offset);
    }

    // Resolves the placement's Document, then renders every one of its
    // Bricks as an ordinary mesh (the same BuildingRenderer/BrickRenderer/
    // BrickRegistry pipeline every other brick in this engine renders
    // through — never a special "structure instance" mesh factory),
    // composed with this placement's own position/rotation and then the
    // CONTAINING document's offset/terrain groundY — "the placement
    // transforms the entire structure," per the design conversation:
    // one rigid unit, rotated and translated as a whole, never per-brick.
    // A silent no-op if there's no resolver or the Document can't be
    // resolved (StructureDocumentResolver's own header explains why that
    // is absence, not an error).
    _renderStructurePlacement(placement, offset) {
        if (!this._structureResolver) {
            return;
        }
        const placedWorld = this._structureResolver.resolve(placement.documentId);
        if (!placedWorld) {
            return;
        }
        const groundY = this._terrainOffsetY(offset.x, offset.z);
        const meshes = [];
        for (const building of placedWorld.getBuildings()) {
            for (const brick of building.getBricks()) {
                const localPoint = this._rotateAroundOrigin(brick.position, placement.rotation);
                const { mesh } = this._buildingRenderer.renderBrick(brick);
                mesh.position.set(
                    localPoint.x + placement.position.x + offset.x,
                    localPoint.y + placement.position.y + offset.y + groundY,
                    localPoint.z + placement.position.z + offset.z
                );
                mesh.rotation.y = (brick.rotation + placement.rotation) * (Math.PI / 180);
                this._renderer.add(mesh);
                meshes.push(mesh);
            }
        }
        this._placementMeshRegistry.set(placement.id, meshes);
    }

    _rotateAroundOrigin(point, degrees) {
        if (!degrees || !this._transformMath) {
            return point;
        }
        return this._transformMath.rotatePointAroundPivotY(point, { x: 0, y: 0, z: 0 }, degrees);
    }

    _removeStructurePlacementMeshes(placementId) {
        const meshes = this._placementMeshRegistry.getMeshes(placementId);
        if (meshes.length === 0) {
            return;
        }
        for (const mesh of meshes) {
            this._renderer.remove(mesh);
        }
        this._placementMeshRegistry.delete(placementId);
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
