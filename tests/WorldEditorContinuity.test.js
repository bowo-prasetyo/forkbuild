import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { WorldFocusKind, deriveWorldFocusContext } from '../core/WorldFocusContext.js';
import {
    EditorEntryContext,
    EditorEntryReason,
    withReturnWorld,
    editorEntryContextToQuery,
    editorEntryContextFromQuery
} from '../core/EditorEntryContext.js';

// 0.6.1 — World ↔ Editor Continuity & Return Navigation.
//
// 0.6.0 gave the Editor an ephemeral EditorEntryContext to arrive WITH
// (camera framing, and for a STRUCTURE, a selection) but drew no return
// trip at all — "Edit a Copy" was a one-way door. This milestone reuses
// the SAME object for the way back out, rather than inventing a second
// "return context" shape — see core/EditorEntryContext.js's own 0.6.1
// header. The flagship scenario:
//
//   Alice's World "Green Valley" contains a Barn (a placed Document —
//   STRUCTURE) inside the Willow Village region (REGION). World View
//   focuses the Barn, clicks "Edit a Copy" — the fork carries a return
//   address (Green Valley's own documentId + the Barn's own placement
//   id) all the way to the Editor and back.
//
//   A. returnWorldId/returnWorldTitle — EditorEntryContext's own new
//      fields: construction, getters, toJSON.
//   B. withReturnWorld() — the one place they're ever attached to an
//      already-derived context (core/WorldFocusContext.js#editCopyContext
//      has no way to know "which World is on screen" itself). Pure,
//      never mutates its input, graceful with nothing to attach.
//   C. Router-query round-trip — entryReturnWorld/entryReturnWorldTitle
//      carried the same plain-string way every other field already is;
//      a pre-0.6.1 query (no entryReturnWorld at all) still decodes
//      cleanly, with returnWorldId simply null — backward compatible.
//   D. Uniform across kind — a STRUCTURE's own sourceDocumentId is the
//      placed structure's content (the fork TARGET); a REGION's is the
//      containing World already. returnWorldId is deliberately supplied
//      by the SAME caller value regardless of kind (see
//      ui/views/WorldView.js#currentReturnWorld()) — proven here by
//      attaching the identical Green Valley id to both and confirming
//      neither corrupts the other's sourceDocumentId/selectAllBricks.
//   E. Round trip through a real WorldNavigationSession — the
//      focusLocationId carried out survives being encoded, decoded, and
//      handed back to getFocusContextForLocation(), resolving the SAME
//      Barn placement a fresh WorldFocusPanel would show on return.
//   F. Fork + apply through a real EditorSession — returnWorldId/
//      returnWorldTitle are inert to applyEntryContext() (camera/
//      selection only, exactly as 0.6.0 left it) yet survive completely
//      intact on the context object handed back to the Editor's own "←
//      Back to World" button. Document/World toJSON carry no trace.

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

function stubRenderSession(extra = {}) {
    let cameraState = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        setControlsEnabled() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return null; },
        gizmoPointerDown() { return null; }, gizmoPointerMove() { return null; }, gizmoPointerUp() { return null; },
        gizmoKeyDown() { return false; }, cancelGizmoGesture() {}, isGizmoDragging() { return false; },
        getCameraState() { return cameraState; },
        setCameraState(state) { cameraState = state; },
        dispose() {},
        ...extra
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

function makeStructureDocument(title, brickPosition) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: brickPosition }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

function makeEditorSession(registry, storage, serializer, identityProvider) {
    const editorContext = new CreateEditorContextUseCase().execute();
    const documentManager = new DocumentManager();
    const selectionUseCase = new SelectionUseCase(editorContext);
    const editorSession = new EditorSession({
        registry, editorContext, toolRegistry: null, documentManager, selectionUseCase,
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: new LoadDocumentUseCase(storage, serializer),
        identityProvider
    });
    editorSession._session = stubRenderSession();
    return { editorSession, editorContext, documentManager };
}

// Mirrors tests/WorldViewFocus.test.js#makeReplica() — a real
// WorldNavigationSession with no render session started (never touches
// three.js), documents loaded directly into `_loadedDocuments`.
function makeWorldReplica(documents = []) {
    const discoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
    const worldLayoutProvider = new LocalWorldLayoutProvider(null, discoveryProvider);
    const session = new WorldNavigationSession({ registry: null, worldLayoutProvider, discoveryProvider });
    for (const document of documents) {
        session._loadedDocuments.set(document.world.id, document);
    }
    return session;
}

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const identityProvider = makeIdentityProvider({ identityId: 'bob-identity', username: 'bob' });

    const greenValleyWorldId = 'world-green-valley';
    const barnPosition = { x: 40, y: 0, z: -15 };
    const barnDocument = makeStructureDocument('Barn', new Position(0, 0.5, 0));
    const barnDocumentId = barnDocument.world.id;
    storage.save(barnDocumentId, serializer.serialize(barnDocument));
    const barnJsonBeforeFork = JSON.stringify(storage.load(barnDocumentId));

    // -------------------------------------------------------------
    // A — EditorEntryContext's own new fields.
    // -------------------------------------------------------------
    {
        const bare = new EditorEntryContext({ sourceDocumentId: barnDocumentId });
        assert(bare.returnWorldId === null, '1. returnWorldId defaults to null');
        assert(bare.returnWorldTitle === '', '2. returnWorldTitle defaults to an empty string');

        const withReturn = new EditorEntryContext({
            sourceDocumentId: barnDocumentId,
            returnWorldId: greenValleyWorldId,
            returnWorldTitle: 'Green Valley'
        });
        assert(withReturn.returnWorldId === greenValleyWorldId, '3. returnWorldId is carried');
        assert(withReturn.returnWorldTitle === 'Green Valley', '4. returnWorldTitle is carried');
        const json = withReturn.toJSON();
        assert(json.returnWorldId === greenValleyWorldId && json.returnWorldTitle === 'Green Valley',
            '5. toJSON() surfaces both new fields');

        console.log('✓ A. EditorEntryContext#returnWorldId/returnWorldTitle: defaults, construction, toJSON');
    }

    // -------------------------------------------------------------
    // B — withReturnWorld(): pure, immutable, graceful.
    // -------------------------------------------------------------
    {
        assert(withReturnWorld(null, { returnWorldId: greenValleyWorldId }) === null,
            '6. withReturnWorld(null, ...) is null, never a throw');

        const original = new EditorEntryContext({
            sourceDocumentId: barnDocumentId,
            focusPosition: barnPosition,
            focusLocationId: 'placement-barn',
            selectAllBricks: true,
            title: 'Barn',
            kind: WorldFocusKind.STRUCTURE,
            reason: EditorEntryReason.WORLD_VIEW_EDIT_COPY
        });

        // No returnWorldId supplied — the input comes back UNCHANGED
        // (not merely equivalent — the exact same instance), since
        // there is nothing to attach.
        const unattached = withReturnWorld(original, {});
        assert(unattached === original, '7. withReturnWorld() with no returnWorldId returns the SAME instance, untouched');

        const attached = withReturnWorld(original, { returnWorldId: greenValleyWorldId, returnWorldTitle: 'Green Valley' });
        assert(attached !== original, '8. withReturnWorld() with a returnWorldId returns a NEW instance');
        assert(attached.returnWorldId === greenValleyWorldId && attached.returnWorldTitle === 'Green Valley',
            '9. ...carrying the attached return world');
        assert(original.returnWorldId === null, '10. ...the ORIGINAL instance is never mutated');

        // Every OTHER field survives the attach untouched.
        assert(attached.sourceDocumentId === barnDocumentId && attached.focusLocationId === 'placement-barn'
            && attached.selectAllBricks === true && attached.title === 'Barn' && attached.kind === WorldFocusKind.STRUCTURE,
            '11. every pre-existing field is carried through unchanged');

        console.log('✓ B. withReturnWorld() attaches a return address without mutating its input, or leaves it alone with nothing to attach');
    }

    // -------------------------------------------------------------
    // C — Router-query round-trip, including backward compatibility
    // with a pre-0.6.1 query carrying no return address at all.
    // -------------------------------------------------------------
    {
        const entryContext = new EditorEntryContext({
            sourceDocumentId: barnDocumentId,
            focusPosition: barnPosition,
            focusLocationId: 'placement-barn',
            selectAllBricks: true,
            title: 'Barn',
            reason: EditorEntryReason.WORLD_VIEW_EDIT_COPY,
            returnWorldId: greenValleyWorldId,
            returnWorldTitle: 'Green Valley'
        });

        const query = editorEntryContextToQuery(entryContext);
        assert(query.entryReturnWorld === greenValleyWorldId, '12. the query carries returnWorldId as a plain string');
        assert(query.entryReturnWorldTitle === 'Green Valley', '13. ...and returnWorldTitle');

        const decoded = editorEntryContextFromQuery(query, barnDocumentId);
        assert(decoded.returnWorldId === greenValleyWorldId, '14. decode round-trips returnWorldId');
        assert(decoded.returnWorldTitle === 'Green Valley', '15. ...and returnWorldTitle');
        // Every 0.6.0 field the round trip already proved still works,
        // unaffected by this milestone's additions.
        assert(decoded.focusLocationId === 'placement-barn' && decoded.selectAllBricks === true,
            '16. pre-existing fields still round-trip correctly alongside the new ones');

        // A pre-0.6.1 query — every fork reached before this milestone,
        // and every OTHER fork entry point this milestone did not touch
        // (a bare Publication Catalog fork) — has no entryReturnWorld
        // key at all. Decoding it must not fabricate a return address.
        const oldStyleQuery = { entryReason: EditorEntryReason.WORLD_VIEW_EDIT_COPY, entryTitle: 'Barn' };
        const decodedOld = editorEntryContextFromQuery(oldStyleQuery, barnDocumentId);
        assert(decodedOld.returnWorldId === null, '17. a query with no entryReturnWorld decodes to returnWorldId: null, never a throw or a guess');
        assert(decodedOld.returnWorldTitle === '', '18. ...and returnWorldTitle: \'\'');

        console.log('✓ C. The router-query channel carries returnWorldId/returnWorldTitle, and a pre-0.6.1 query still decodes cleanly with no return address');
    }

    // -------------------------------------------------------------
    // D — Uniform across kind: the SAME returnWorldId (Green Valley,
    // the World currently on screen) attaches correctly to a
    // STRUCTURE's editCopyContext (whose OWN sourceDocumentId is the
    // fork TARGET, not Green Valley) and a REGION's (whose
    // sourceDocumentId already IS Green Valley) — proving
    // ui/views/WorldView.js#currentReturnWorld() is right to read the
    // SAME value regardless of which kind is being forked.
    // -------------------------------------------------------------
    {
        const barnEntity = { id: 'placement-barn', title: 'Barn', position: barnPosition, documentId: barnDocumentId };
        const structureFocus = deriveWorldFocusContext({ kind: WorldFocusKind.STRUCTURE, entity: barnEntity, viewerPosition: null, regions: [] });
        const structureEntry = withReturnWorld(structureFocus.editCopyContext, { returnWorldId: greenValleyWorldId, returnWorldTitle: 'Green Valley' });
        assert(structureEntry.sourceDocumentId === barnDocumentId, '19. STRUCTURE: sourceDocumentId is still the fork TARGET (the Barn\'s own content)');
        assert(structureEntry.returnWorldId === greenValleyWorldId, '20. ...while returnWorldId correctly names the CONTAINING World instead');
        assert(structureEntry.selectAllBricks === true, '21. ...and attaching a return address never disturbs selectAllBricks');

        const villageEntity = { id: 'region-willow', name: 'Willow Village', kind: RegionKind.VILLAGE, description: '', radius: 30, position: { x: 0, y: 0, z: 0 }, documentId: greenValleyWorldId };
        const regionFocus = deriveWorldFocusContext({ kind: WorldFocusKind.REGION, entity: villageEntity, viewerPosition: null, regions: [] });
        const regionEntry = withReturnWorld(regionFocus.editCopyContext, { returnWorldId: greenValleyWorldId, returnWorldTitle: 'Green Valley' });
        assert(regionEntry.sourceDocumentId === greenValleyWorldId, '22. REGION: sourceDocumentId already IS Green Valley');
        assert(regionEntry.returnWorldId === greenValleyWorldId, '23. ...and returnWorldId names the identical World — no divergence, no corruption');
        assert(regionEntry.selectAllBricks === false, '24. ...and a REGION never selects bricks, attach or not (0.6.0\'s own invariant, untouched)');

        console.log('✓ D. The identical returnWorldId attaches correctly for both a STRUCTURE (whose own sourceDocumentId diverges from it) and a REGION (whose own sourceDocumentId already matches it)');
    }

    // -------------------------------------------------------------
    // E — Round trip through a real WorldNavigationSession: the
    // focusLocationId carried OUT resolves the SAME structure placement
    // when handed back to getFocusContextForLocation(), exactly what
    // ui/views/WorldView.js's own return-navigation handler does.
    // -------------------------------------------------------------
    {
        const villageRegion = new WorldRegion({
            id: 'region-willow', worldId: greenValleyWorldId, authorIdentityId: 'alice',
            name: 'Willow Village', description: '', kind: RegionKind.VILLAGE,
            position: new Position(0, 0, 0), radius: 60
        });
        const greenValleyWorld = new World({ id: greenValleyWorldId });
        greenValleyWorld.addWorldRegion(villageRegion);
        const barnPlacement = new StructurePlacement({ id: 'placement-barn', documentId: barnDocumentId, position: new Position(barnPosition.x, 0, barnPosition.z) });
        greenValleyWorld.addStructurePlacement(barnPlacement);
        const greenValleyDocument = { world: greenValleyWorld, metadata: new DocumentMetadata({ title: 'Green Valley', author: 'alice' }) };

        const replica = makeWorldReplica([greenValleyDocument]);
        const outgoingFocus = replica.getFocusContextForLocation('placement-barn');
        assert(outgoingFocus && outgoingFocus.kind === WorldFocusKind.STRUCTURE, '25. the session resolves the Barn placement to a real STRUCTURE focus');

        const outgoingEntry = withReturnWorld(outgoingFocus.editCopyContext, { returnWorldId: greenValleyWorldId, returnWorldTitle: 'Green Valley' });
        const query = editorEntryContextToQuery(outgoingEntry);
        // Exactly what EditorView's fork handler decodes on arrival —
        // sourceDocumentId supplied separately, as `route.query.fork`
        // always is (see editorEntryContextFromQuery()'s own header).
        const arrivedEntry = editorEntryContextFromQuery(query, outgoingEntry.sourceDocumentId);

        // The "← Back to World" trip: EditorView.js#backToWorld() reads
        // exactly these two fields off the (possibly still-`entryContext`-
        // held) context to build `/world/<returnWorldId>?returnLocation=<focusLocationId>`.
        assert(arrivedEntry.returnWorldId === greenValleyWorldId, '26. the return World id survives the full round trip');
        assert(arrivedEntry.focusLocationId === 'placement-barn', '27. ...and so does the focus location id');

        // ui/views/WorldView.js's own onMounted() return-navigation
        // handler: getFocusContextForLocation(returnLocation) reopens
        // the SAME WorldFocusPanel.
        const returnFocus = replica.getFocusContextForLocation(arrivedEntry.focusLocationId);
        assert(returnFocus && returnFocus.kind === WorldFocusKind.STRUCTURE && returnFocus.title === outgoingFocus.title,
            '28. getFocusContextForLocation() resolves the SAME Barn placement on return — the focus panel can reopen exactly where the viewer left it');

        // A placement removed while the viewer was away degrades
        // silently — arriving back in World View is never an error.
        greenValleyWorld.removeStructurePlacement('placement-barn');
        assert(replica.getFocusContextForLocation('placement-barn') === null,
            '29. a focus location that no longer resolves returns null, never a throw — WorldView\'s own return handler simply skips reopening the panel');

        console.log('✓ E. The focusLocationId carried back out of the Editor resolves the exact same World content through a real WorldNavigationSession, and degrades silently once it\'s gone');
    }

    // -------------------------------------------------------------
    // F — Fork + apply through a real EditorSession: returnWorldId/
    // returnWorldTitle are inert to camera/selection application, yet
    // survive completely intact for the Editor's own header/"← Back to
    // World" button — and never leak into Document/World persistence.
    // -------------------------------------------------------------
    {
        const forkUseCase = new ForkDocumentUseCase(storage, serializer);
        const forked = forkUseCase.execute(barnDocumentId, identityProvider, null);
        assert(forked.world.id !== barnDocumentId, '30. the fork has a fresh document identity');

        const barnEntity = { id: 'placement-barn', title: 'Barn', position: barnPosition, documentId: barnDocumentId };
        const focusContext = deriveWorldFocusContext({ kind: WorldFocusKind.STRUCTURE, entity: barnEntity, viewerPosition: null, regions: [] });
        const entryContext = withReturnWorld(focusContext.editCopyContext, { returnWorldId: greenValleyWorldId, returnWorldTitle: 'Green Valley' });

        const { editorSession, editorContext, documentManager } = makeEditorSession(registry, storage, serializer, identityProvider);
        documentManager.newDocument(forked);
        editorSession._commandHistory = new CommandHistory({ world: forked.world });
        editorSession.applyEntryContext(entryContext);

        // Camera + selection still apply exactly as 0.6.0 established —
        // returnWorldId/returnWorldTitle change nothing about that path.
        const forkedBrickId = forked.world.getBuildings()[0].getBricks()[0].id;
        assert(editorContext.selection.items.length === 1 && editorContext.selection.items[0].brickId === forkedBrickId,
            '31. applyEntryContext() still selects the fork\'s own brick — the return address rides along inertly');
        const cameraState = editorSession._session.getCameraState();
        assert(cameraState.target.x === 40 && cameraState.target.z === -15, '32. ...and still frames the camera on the Barn\'s own position');

        // The context object itself — what the Editor's own header/"←
        // Back to World" button reads — still carries the full return
        // address after being applied.
        assert(entryContext.returnWorldId === greenValleyWorldId && entryContext.returnWorldTitle === 'Green Valley',
            '33. the entry context itself still carries the full return address after being applied');

        // Persistence boundary — extends 0.6.0's own Section H: neither
        // new field ever touches Document/World content.
        const documentJson = JSON.stringify(forked.toJSON ? forked.toJSON() : forked.world.toJSON());
        assert(documentJson.indexOf('returnWorldId') === -1 && documentJson.indexOf(greenValleyWorldId) === -1,
            '34. Document/World persistence carries no trace of returnWorldId, or the return World\'s own id');

        // The SOURCE stays untouched by any of this.
        assert(JSON.stringify(storage.load(barnDocumentId)) === barnJsonBeforeFork,
            '35. the source document is still byte-identical in storage after the full fork-and-return round trip');

        console.log('✓ F. A real EditorSession fork applies camera/selection exactly as 0.6.0 already did; the return address survives untouched, and never reaches Document/World persistence');
    }

    console.log('\nAll World ↔ Editor Continuity & Return Navigation tests passed.');
}

await run();
