import { BuildingRenderer } from './BuildingRenderer.js';
import { MeshRegistry } from './MeshRegistry.js';
import { PlacementMeshRegistry } from './PlacementMeshRegistry.js';
import { AnimalRenderer } from './AnimalRenderer.js';
import { AnimalVisual } from './AnimalVisual.js';
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
// (application/editor/StructureDocumentResolver.js) — never a snapshot copied
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
// registry instead (application/world/RenderWorldUseCase.js wires
// placementMeshRegistry in alongside meshRegistry) — a placed
// structure's individual bricks are still never individually pickable,
// but the WHOLE instance now is, resolved via mesh uuid -> placementId
// rather than mesh uuid -> brickId.
//
// `transformMath` composes a placement's rotation with each of its
// bricks' local positions — injected (mirrors TransformGizmoController's
// own transformMath injection in application/world/RenderWorldUseCase.js /
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
        transformMath = null,
        animalRenderer = new AnimalRenderer()
    ) {
        this._renderer = renderer;
        this._registry = registry;
        this._buildingRenderer = buildingRenderer;
        this._meshRegistry = meshRegistry;
        this._structureResolver = structureResolver;
        this._transformMath = transformMath;
        // 0.9.702 — World Animal Decorations. Reuses the SAME
        // renderer/AnimalRenderer.js a released, individually-tracked
        // animal already renders through (application/
        // RenderWorldViewUseCase.js's own syncAnimals()) — a decoration
        // must look exactly like the released animal it was baked from,
        // never a second shape/material definition.
        this._animalRenderer = animalRenderer;
        // decorationId -> AnimalVisual, one per decoration, for the
        // identical "look it up by id to remove/re-render it" job
        // `_meshRegistry`/`_placementMeshRegistry` already do for
        // bricks/placements — simpler than either, since a decoration
        // is a single static visual, never a per-mesh collection.
        this._animalDecorationVisuals = new Map();
        this._subscriptions = [];
        this._documentOffsets = new Map();
        this._buildingToDocument = new Map();
        // 0.9.702 — decorationId -> worldId. UNLIKE `_buildingToDocument`/
        // `_placementToDocument` below (populated only by addWorld()'s
        // own initial load, per those fields' own header), this can
        // ALSO be populated straight from a LIVE `ANIMAL_DECORATION_ADDED`
        // event's own payload — an AnimalDecoration already carries its
        // own `worldId` (core/AnimalDecoration.js), unlike a Brick or a
        // StructurePlacement, so `_onAnimalDecorationAdded()` below never
        // needs a pre-existing lookup entry to resolve which document's
        // layout offset applies, the way `_onStructurePlacementAdded()`'s
        // own "falls through to {0,0,0} outside World View" comment
        // has to.
        this._decorationToDocument = new Map();
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

    // 0.2.91 — read by application/world/RenderWorldUseCase.js to construct
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
            eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_UPDATED, ({ placement }) => this._onStructurePlacementUpdated(placement)),
            // 0.9.702 — World Animal Decorations. No UPDATED counterpart
            // — decorative only, v1 (core/AnimalDecoration.js's own
            // header): a decoration is only ever added or removed, never
            // edited in place.
            eventBus.subscribe(DomainEvent.ANIMAL_DECORATION_ADDED, ({ decoration }) => this._onAnimalDecorationAdded(decoration)),
            eventBus.subscribe(DomainEvent.ANIMAL_DECORATION_REMOVED, ({ decoration }) => this._onAnimalDecorationRemoved(decoration))
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
        for (const decoration of world.getAnimalDecorations()) {
            this._decorationToDocument.set(decoration.id, documentId);
            this._renderAnimalDecoration(decoration, offset);
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
        for (const decoration of world.getAnimalDecorations()) {
            this._decorationToDocument.delete(decoration.id);
            this._removeAnimalDecorationVisual(decoration.id);
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
        this._applyBrickColor(mesh, brick);
    }

    // Choose Your Brick Color — SetBrickColorCommand mutates a brick
    // in place and publishes the SAME BRICK_UPDATED event MoveBrickCommand/
    // RotateBrickCommand already use, so an already-rendered mesh (built
    // once, at BRICK_ADDED, with whatever color applied then) needs its
    // material updated in place here too — mirrors renderer/BrickRenderer.js's
    // own "instance override wins, else the definition's own default"
    // resolution exactly, so a live recolor and a fresh render of the
    // same brick always agree.
    _applyBrickColor(mesh, brick) {
        if (!mesh.material || !mesh.material.color) {
            return;
        }
        const definition = this._registry ? this._registry.get(brick.definitionId) : null;
        const color = brick.color !== null && brick.color !== undefined
            ? brick.color
            : (definition ? definition.color : null);
        if (color !== null && color !== undefined) {
            mesh.material.color.setHex(color);
        }
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
        // Bug fix — same defensive guard as _addBrickMesh() above: a
        // stale entry already registered under this placement.id would
        // otherwise be silently overwritten by the set() call below,
        // orphaning its OLD meshes in the scene (never removed from the
        // renderer, no longer reachable through placementMeshRegistry —
        // and PickingService's own pickPlacement() raycasts exclusively
        // against placementMeshRegistry.getAllMeshes(), never the raw
        // scene). Every existing caller (_onStructurePlacementUpdated
        // already removes first, by hand) is unaffected; this simply
        // makes that ordering a guarantee of this method itself, not
        // something every caller must remember to do.
        this._removeStructurePlacementMeshes(placement.id);
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

    // 0.9.702 — World Animal Decorations. An AnimalDecoration already
    // carries its own worldId (core/AnimalDecoration.js) — unlike
    // _onStructurePlacementAdded() above, this needs no pre-populated
    // lookup table to know which document's layout offset applies, so a
    // LIVE add (application/world/WorldNavigationSession.js#
    // decorateNearestReleasedAnimalHere(), executed against an
    // ALREADY-loaded document) renders correctly the moment the command
    // commits, not only for a decoration present at addWorld()'s own
    // initial load.
    _onAnimalDecorationAdded(decoration) {
        this._decorationToDocument.set(decoration.id, decoration.worldId);
        const offset = this._documentOffsets.get(decoration.worldId) || { x: 0, y: 0, z: 0 };
        this._renderAnimalDecoration(decoration, offset);
    }

    _onAnimalDecorationRemoved(decoration) {
        this._removeAnimalDecorationVisual(decoration.id);
        this._decorationToDocument.delete(decoration.id);
    }

    // Builds and adds ONE static AnimalVisual, composed with the
    // containing document's own offset/terrain groundY exactly the way
    // _renderStructurePlacement() composes a placement's own bricks —
    // `decoration.position` is LOCAL to this World, lifted as a rigid
    // whole, never re-sampled per decoration (see
    // core/AnimalDecoration.js's own header for why Y is authoritative
    // here, unlike a WorldLandmark's). A species this renderer has no
    // visual for (AnimalVisual#isSupported false) is silently skipped —
    // the identical graceful-degradation posture
    // renderer/AnimalFieldRenderer.js#setAnimal() already takes for a
    // live released animal.
    _renderAnimalDecoration(decoration, offset) {
        // Bug-fix guard, the same one _addBrickMesh()/_renderStructurePlacement()
        // already take: never let a stale visual already registered
        // under this id be silently overwritten/orphaned.
        this._removeAnimalDecorationVisual(decoration.id);
        const groundY = this._terrainOffsetY(offset.x, offset.z);
        const visual = new AnimalVisual(this._animalRenderer, decoration.species);
        if (!visual.isSupported) {
            return;
        }
        visual.setPosition({
            x: decoration.position.x + offset.x,
            y: decoration.position.y + offset.y + groundY,
            z: decoration.position.z + offset.z
        });
        this._renderer.add(visual.root);
        this._animalDecorationVisuals.set(decoration.id, visual);
    }

    _removeAnimalDecorationVisual(decorationId) {
        const visual = this._animalDecorationVisuals.get(decorationId);
        if (!visual) {
            return;
        }
        this._renderer.remove(visual.root);
        visual.dispose();
        this._animalDecorationVisuals.delete(decorationId);
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

    // Bug fix — defensively removes any mesh ALREADY registered under
    // this brickId before adding the new one. Every call site of
    // _addBrickMesh() already believes it is adding a brick that isn't
    // currently tracked, but nothing previously verified that: if this
    // ever ran twice for the same brickId without a clean
    // _removeBrickMesh() in between (e.g. a document rapidly streaming
    // out and back in — see addWorld()/_onBrickAdded() above — racing
    // against its own removeWorld() cleanup), the OLD mesh's
    // MeshRegistry entry would simply be overwritten, orphaning the OLD
    // Three.js object in the scene forever: still rendered (never
    // removed from the renderer), but no longer reachable through
    // meshRegistry — and renderer/PickingService.js's own pick()/
    // pickRich() raycast EXCLUSIVELY against meshRegistry.getAllMeshes(),
    // never the raw scene graph (see its own header). An orphaned mesh
    // is therefore permanently unpickable and, since collision
    // (application/avatar/AvatarMovementConstraint.js) reads
    // WorldNavigationSession's own _loadedDocuments — a completely
    // separate structure this class never touches — an orphan is
    // exactly a visible-but-unselectable-and-uncollidable ghost: solid
    // to the eye, absent to every other system. This one-line guard
    // makes that outcome structurally impossible, regardless of what
    // upstream condition ever causes a re-add without a prior remove.
    _addBrickMesh(brickId, documentId, buildingId, mesh) {
        this._removeBrickMesh(brickId);
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
