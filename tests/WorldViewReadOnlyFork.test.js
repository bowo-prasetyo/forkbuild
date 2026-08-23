import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { RegionKind } from '../core/RegionKind.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { WorldFocusKind, WorldFocusAction, deriveWorldFocusContext } from '../core/WorldFocusContext.js';

// 0.5.9 — World View Read-Only Exploration & Fork-to-Edit.
//
// The flagship for the milestone's own principle (see docs/Principles.md,
// "World View Observes and Navigates; Editor Mutates and Builds"):
//
//   A. WorldNavigationSession has NO mutation capability left, except
//      World Region/Landmark naming (deliberately kept — annotation, not
//      construction) and movePlacement (deliberately kept — placement
//      ARRANGEMENT, never a document mutation).
//   B. Every pre-existing READ operation (locations, focus, regions,
//      pick/hover, navigation) still works exactly as before.
//   C. "Edit a Copy" — resolving a WorldFocusContext's own
//      source.documentId and forking it via the SAME ForkDocumentUseCase
//      ui/components/PublicationCatalog.js#forkPublication() already
//      uses (never a second fork mechanism) — produces an independent
//      Document.
//   D. The SOURCE document is byte-identical in storage before and
//      after the fork, and after the fork is subsequently mutated.
//   E. The FORK is independent: mutating it (in the Editor) never
//      touches the source.
//   F. Enough context (title, position, documentId) survives the fork
//      to identify what was being looked at — see this section's own
//      comment on what is and is not claimed.
//   G. A GEOGRAPHIC_PLACE never offers Edit a Copy (it has no document
//      of its own to fork); each of its own regions does.
//   H. The fork enters ordinary EditorSession architecture — full
//      mutation capability, no World-View-specific semantics.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function stubRenderer() {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {}
    };
}

function makeIdentityProvider({ identityId = null, username = null } = {}) {
    return {
        currentUser: () => (username ? { username } : null),
        getSigningIdentity: () => {
            if (!identityId) throw new Error('IdentityProviderStub: no authenticated identity');
            return { id: identityId };
        }
    };
}

async function run() {
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const registry = new CreateBrickRegistryUseCase().execute();
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const identityProvider = makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' });

    // -------------------------------------------------------------
    // A. No mutation capability, except the two deliberate exceptions
    // -------------------------------------------------------------
    {
        const session = new WorldNavigationSession({ registry, loadPublicationDocumentUseCase, worldLayoutProvider, discoveryProvider });

        const REMOVED_METHODS = [
            'setActiveDefinitionId', 'getActiveDefinitionId', 'isPlacementMode',
            'rotatePlacementPreview', 'getSpatialPlacement', 'commitPlacement', 'cancelPlacement',
            'isGestureActive', 'gizmoPointerDown', 'gizmoPointerMove', 'gizmoPointerUp', 'gizmoKeyDown',
            'moveSelection', 'deleteSelection', 'rotateSelection', 'alignSelection',
            'distributeSelection', 'snapSelectionToGrid', 'applyNumericTransform',
            'copySelection', 'pasteClipboard', 'duplicateSelection', 'repeatSelection',
            'getGroups', 'createGroupFromSelection', 'selectGroup',
            'addSelectionToSelectedGroup', 'removeSelectionFromSelectedGroup',
            'renameGroup', 'duplicateGroup', 'deleteGroup',
            'addToGroupWithSelection', 'removeFromGroupWithSelection'
        ];
        for (const method of REMOVED_METHODS) {
            assert(typeof session[method] !== 'function', `1. WorldNavigationSession must NOT expose ${method}`);
        }

        // Deliberately kept: read/focus/navigation, World Region/Landmark
        // naming (annotation, not construction), and movePlacement
        // (arrangement, not document mutation).
        const KEPT_METHODS = [
            'pick', 'hover', 'clearSelection', 'selectAll', 'marqueeSelect',
            'getSpatialSelection', 'getSelectionCount', 'setControlsEnabled',
            'undo', 'redo', 'getSpatialInspection', 'getSpatialEditingContext',
            'movePlacement', 'saveDocument', 'publishDocument', 'forkDocument', 'cloneDocument',
            'createRegionHere', 'updateRegion', 'removeRegion',
            'createLandmarkHere', 'updateLandmark', 'removeLandmark',
            'getFocusContextForLocation', 'getFocusContextForCollaborator',
            'getPublicationIdForDocument'
        ];
        for (const method of KEPT_METHODS) {
            assert(typeof session[method] === 'function', `2. WorldNavigationSession must still expose ${method}`);
        }
        console.log('✓ A. WorldNavigationSession has no mutation capability, except Region/Landmark naming and placement arrangement');
    }

    // -------------------------------------------------------------
    // B. Read operations remain intact
    // -------------------------------------------------------------
    let sourceDocumentId;
    let landmarkId;
    let regionId;
    let structurePlacementId;
    let structureDocumentId;
    let sourceJsonBeforeFork;
    {
        // A second, independent document — the "structure" a
        // StructurePlacement in Alice's World points at (never the
        // containing World's own document — see core/WorldFocusContext.js).
        const structureWorld = new World({});
        const structureBuilding = new Building({});
        structureBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        structureWorld.addBuilding(structureBuilding);
        const structureDoc = new Document({ world: structureWorld, metadata: new DocumentMetadata({ title: 'Old Bridge', author: 'alice' }) });
        storage.save(structureWorld.id, serializer.serialize(structureDoc));
        structureDocumentId = structureWorld.id;

        const avatarPresenceSession = new AvatarPresenceSession(
            { avatarId: 'alice-avatar', ownerIdentity: 'did:key:alice' },
            { position: new Position(0, 0, 0) }
        );
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider, discoveryProvider,
            avatarPresenceSession, identityProvider
        });
        session._session = stubRenderer();

        // A brand-new World, saved once so ForkDocumentUseCase (Section C
        // below) has a real storage entry to load — never streamed in
        // through discovery/publication, exactly like createLandmarkHere's
        // own "Place Here" convention.
        const world = new World({});
        const doc = new Document({ world, metadata: new DocumentMetadata({ title: "Alice's Village", author: 'alice', authorIdentityId: 'did:key:alice' }) });
        storage.save(world.id, serializer.serialize(doc));
        sourceDocumentId = world.id;
        session._loadWorld(world.id);

        landmarkId = session.createLandmarkHere('Village Well', 'Central water source');
        regionId = session.createRegionHere('Willow Village', { description: 'A quiet village', kind: RegionKind.VILLAGE, radius: 30 });

        const placement = new StructurePlacement({ documentId: structureDocumentId, position: new Position(5, 0, 5) });
        session.getDocument(world.id).world.addStructurePlacement(placement);
        structurePlacementId = placement.id;

        // Persist directly (session.saveDocument() needs a
        // saveDocumentUseCase this minimal session was never wired
        // with — not the concern of this section) so ForkDocumentUseCase
        // below, which loads straight from storage, actually sees the
        // landmark/region/placement just added.
        storage.save(sourceDocumentId, serializer.serialize(session.getDocument(sourceDocumentId)));
        sourceJsonBeforeFork = JSON.stringify(storage.load(sourceDocumentId));

        // getWorldLocations()/getRegions() — every location this session
        // now knows about is reachable, exactly as before.
        const locations = session.getWorldLocations();
        assert(locations.some((l) => l.id === landmarkId), '3. getWorldLocations() lists the landmark');
        assert(locations.some((l) => l.id === regionId), '4. getWorldLocations() lists the region');
        assert(session.getRegions().length === 1, '5. getRegions() lists the region');

        // getFocusContextForLocation() — landmark, region, structure.
        const landmarkFocus = session.getFocusContextForLocation(landmarkId);
        assert(landmarkFocus && landmarkFocus.kind === WorldFocusKind.LANDMARK, '6. landmark focus context resolves');
        assert(landmarkFocus.source.documentId === sourceDocumentId, '7. a landmark\'s own documentId is the containing World');
        assert(landmarkFocus.hasAction(WorldFocusAction.EDIT_COPY), '8. a landmark offers Edit a Copy');

        const regionFocus = session.getFocusContextForLocation(regionId);
        assert(regionFocus && regionFocus.kind === WorldFocusKind.REGION, '9. region focus context resolves');
        assert(regionFocus.source.documentId === sourceDocumentId, '10. a region\'s own documentId is the containing World');
        assert(regionFocus.hasAction(WorldFocusAction.EDIT_COPY), '11. a region offers Edit a Copy');

        const structureFocus = session.getFocusContextForLocation(structurePlacementId);
        assert(structureFocus && structureFocus.kind === WorldFocusKind.STRUCTURE, '12. structure focus context resolves');
        assert(structureFocus.source.documentId === structureDocumentId,
            '13. a STRUCTURE\'s own documentId is the PLACED structure\'s content document, never the containing World');
        assert(structureFocus.source.documentId !== sourceDocumentId,
            '14. ...and that is a genuinely different document than the one containing the placement');
        assert(structureFocus.hasAction(WorldFocusAction.EDIT_COPY), '15. a structure offers Edit a Copy');

        // Navigation still works.
        assert(session.focusLocation(landmarkId) === true, '16. focusLocation() still moves the camera to a landmark');
        assert(session.focusLocation('nonsense-id') === false, '17. focusLocation() still returns false for an unknown id');

        // Pick/hover still work (read-only, never throw).
        assert(typeof session.pick(0, 0) !== 'undefined' || session.pick(0, 0) === null, '18. pick() still runs without throwing');
        session.hover(0, 0);
        console.log('✓ B. Every pre-existing read/navigation operation still works');
    }

    // -------------------------------------------------------------
    // C, D, E, H — Edit a Copy: resolve -> fork -> Editor -> independent
    // -------------------------------------------------------------
    {
        // "Edit a Copy" itself is a two-line WorldView.js function:
        // read context.source.documentId, resolve a publication id (none
        // here — this document was never published), then navigate to
        // `/editor?fork=<documentId>`. EditorView's own onMounted() then
        // does exactly what this section does directly: call
        // ForkDocumentUseCase, then EditorSession#openDocument(). Testing
        // it here, at this level, is the same flow with the Vue Router
        // hop removed — never a second fork mechanism.
        const forkUseCase = new ForkDocumentUseCase(storage, serializer);
        const forked = forkUseCase.execute(sourceDocumentId, identityProvider, null);

        // C. Independent Document.
        assert(forked.world.id !== sourceDocumentId, '19. the fork has a fresh document identity');
        assert(forked.metadata.title === "Fork of Alice's Village", '20. the fork is titled "Fork of ..."');
        assert(forked.metadata.parentDocumentId === sourceDocumentId, '21. lineage is recorded via parentDocumentId');
        assert(forked.world.getWorldLandmarks().length === 1 && forked.world.getWorldLandmarks()[0].title === 'Village Well',
            '22. the fork carries the source\'s own content (landmark included)');

        // D. Source immutability — byte-identical in storage, forking
        // never touched it.
        const sourceJsonAfterFork = JSON.stringify(storage.load(sourceDocumentId));
        assert(sourceJsonAfterFork === sourceJsonBeforeFork, '23. the source document is byte-identical in storage after the fork');

        // H. The fork enters ORDINARY EditorSession architecture — full
        // mutation capability, exactly like any other document EditorSession
        // opens (Load, a fresh New, or a published-world fork already
        // reachable via ui/components/PublicationCatalog.js).
        const editorContext = new CreateEditorContextUseCase().execute();
        const documentManager = new DocumentManager();
        documentManager.newDocument(forked);
        const selectionUseCase = new SelectionUseCase(editorContext);
        const editorSession = new EditorSession({
            registry, editorContext, toolRegistry: null, documentManager, selectionUseCase,
            previewUseCase: new PreviewUseCase(editorContext),
            loadDocumentUseCase: new LoadDocumentUseCase(storage, serializer),
            identityProvider
        });
        // EditorSession normally wires this up inside _rebuild(), which
        // requires a real render container (renderer/ imports 'three') —
        // see tests/StructureInstanceEditing.test.js's own header on why
        // a headless test harness supplies this directly instead.
        editorSession._commandHistory = new CommandHistory({ world: forked.world });

        assert(typeof editorSession.deleteSelection === 'function' && typeof editorSession.moveSelection === 'function'
            && typeof editorSession.alignSelection === 'function' && typeof editorSession.applyNumericTransform === 'function',
            '24. the fork\'s EditorSession has full ordinary mutation capability — no World-View-specific restriction follows it in');

        const building = forked.world.getBuildings()[0] || (() => {
            const b = new Building({});
            forked.world.addBuilding(b);
            return b;
        })();
        const brick = new Brick({ definitionId: 'core:cube', position: new Position(9, 0, 9) });
        building.addBrick(brick);

        selectionUseCase.select(brick.id, building.id);
        const deleted = editorSession.deleteSelection();
        assert(deleted === true, '25. the fork can actually be edited — deleteSelection() succeeds');
        assert(building.findBrick(brick.id) === null, '26. the brick is really gone from the FORK');

        // E. Fork independence — editing the fork never touches the
        // source, still sitting untouched in storage.
        const sourceJsonAfterEdit = JSON.stringify(storage.load(sourceDocumentId));
        assert(sourceJsonAfterEdit === sourceJsonBeforeFork, '27. the source document is STILL byte-identical after editing the fork');

        console.log('✓ C/D/E/H. Edit a Copy forks an independent Document, the source is never touched, and the fork enters ordinary Editor architecture');
    }

    // -------------------------------------------------------------
    // F. Context preservation — what data survives, honestly scoped
    // -------------------------------------------------------------
    {
        // 0.5.9 deliberately does NOT implement camera framing inside the
        // Editor (EditorSession has no camera-positioning API at all
        // today — adding one is a real feature, out of proportion to this
        // milestone). What it DOES guarantee: the WorldFocusContext that
        // drove "Edit a Copy" carries everything a future framing feature
        // would need (title, position, documentId) — this proves that
        // data survives the trip, without claiming the camera actually
        // moves anywhere in the Editor today.
        const entity = { id: 'lm-1', title: 'Village Well', description: '', position: { x: 12, y: 0, z: 12 }, documentId: sourceDocumentId };
        const context = deriveWorldFocusContext({ kind: WorldFocusKind.LANDMARK, entity, viewerPosition: null, regions: [] });
        assert(context.title === 'Village Well', '28. the focus context carries the target\'s own title');
        assert(context.position.x === 12 && context.position.z === 12, '29. ...and its own position');
        assert(context.source.documentId === sourceDocumentId, '30. ...and the documentId "Edit a Copy" actually forks');
        console.log('✓ F. Enough context survives the fork to identify what was being looked at (camera framing itself is out of scope)');
    }

    // -------------------------------------------------------------
    // G. A geographic place never offers Edit a Copy; its own regions do
    // -------------------------------------------------------------
    {
        const region = { id: 'r-1', name: 'Willow Village', kind: RegionKind.VILLAGE, description: '', radius: 30, position: { x: 0, y: 0, z: 0 }, documentId: 'doc-1' };
        const regionContext = deriveWorldFocusContext({ kind: WorldFocusKind.REGION, entity: region, viewerPosition: null, regions: [] });
        assert(regionContext.hasAction(WorldFocusAction.EDIT_COPY), '31. a region offers Edit a Copy');

        const place = { fingerprintKey: 'k1', displayName: 'Kawahara Village', descriptionCount: 2, worldCount: 2, authorCount: 3, position: { x: 0, y: 0, z: 0 } };
        const placeContext = deriveWorldFocusContext({ kind: WorldFocusKind.GEOGRAPHIC_PLACE, entity: place, viewerPosition: null, regions: [], nearbyPlaceEntries: [] });
        assert(!placeContext.hasAction(WorldFocusAction.EDIT_COPY),
            '32. a geographic place NEVER offers Edit a Copy — it is a derived grouping of OTHER Worlds\' regions, not a document of its own');

        const collaborator = { identityId: 'bob-id', deviceId: 'bob-device', displayName: 'Bob', activity: 'BUILDING', position: { x: 0, y: 0, z: 0 } };
        const collabContext = deriveWorldFocusContext({ kind: WorldFocusKind.COLLABORATOR, entity: collaborator, viewerPosition: null, regions: [] });
        assert(!collabContext.hasAction(WorldFocusAction.EDIT_COPY), '33. a collaborator never offers Edit a Copy either — a person is not a document');

        console.log('✓ G. A geographic place stays non-editable; each of its own regions offers Edit a Copy individually');
    }

    console.log('\nAll World View Read-Only Exploration & Fork-to-Edit tests passed.');
}

await run();
