import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { RegionKind } from '../core/RegionKind.js';
import { WorldFocusKind, WorldFocusAction, deriveWorldFocusContext } from '../core/WorldFocusContext.js';
import {
    EditorEntryContext,
    EditorEntryReason,
    deriveEditorEntryContext,
    editorEntryContextToQuery,
    editorEntryContextFromQuery
} from '../core/EditorEntryContext.js';

// 0.6.0 — Context-Preserving Fork-to-Edit.
//
// 0.5.9 drew the boundary (World View Observes and Navigates; Editor
// Mutates and Builds) and left "Edit a Copy" a bare fork-and-navigate
// hop — camera framing and selection were both named, explicitly, as
// "a real feature, out of proportion to that milestone." This is that
// feature. The flagship scenario, matching this milestone's own design
// conversation (docs/Roadmap.md, 0.6.0):
//
//   Alice creates a World containing three structures — House, Well,
//   Barn (each its own placed Document, Well a plain WorldLandmark
//   instead). World View focuses the Barn, clicks "Edit a Copy," the
//   fork opens in the Editor with the camera already framing where the
//   Barn stood and its own bricks already selected.
//
//   A. Independence — the source World is completely unaffected.
//   B. Correct fork — the fork carries the source's own content under
//      a fresh, independent identity.
//   C. Context — WorldFocusContext#editCopyContext carries the right
//      sourceDocumentId/focusPosition/focusLocationId for every kind
//      that offers EDIT_COPY.
//   D. Selection — a STRUCTURE focus produces `selectAllBricks: true`,
//      and applying it after the fork actually selects every brick now
//      in the fork (never the SOURCE's own brick ids — see
//      core/EditorEntryContext.js's own header on why that would be a
//      category error).
//   E. Landmark — camera context only, never an arbitrary selection.
//   F. Geographic place — never offers Edit a Copy itself; resolution
//      stays exactly at "each of its own regions does," 0.5.9's own
//      invariant, untouched by this milestone.
//   G. Collaboration — the fork behaves exactly like an ordinary
//      Editor document afterward (full mutation capability).
//   H. Persistence boundary — an EditorEntryContext never appears in
//      Document.toJSON()/World.toJSON(), and the router-query
//      encode/decode pair used to carry it across the one page
//      navigation this milestone crosses round-trips correctly.

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

// Builds a small standalone Document (one Building, one Brick) — the
// same shape application/ForkStructureUseCase.js's own fork produces:
// a placed structure's OWN content document contains exactly its
// bricks, nothing else.
function makeStructureDocument(title, brickPosition) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: brickPosition }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

// Builds a headless EditorSession — exactly tests/WorldViewReadOnlyFork.test.js's
// own Section H harness: `_rebuild()` needs a real render container
// (renderer/ imports 'three'), so `_session`/`_commandHistory` are set
// directly rather than calling start().
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

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const identityProvider = makeIdentityProvider({ identityId: 'bob-identity', username: 'bob' });

    // -------------------------------------------------------------
    // Set the scene — Alice's World: House, Well (a WorldLandmark),
    // Barn, each its own Document. Only the Barn's own placement is
    // exercised end-to-end below (STRUCTURE is the flagship kind), but
    // Well stands in for LANDMARK's own camera-only path in section E.
    // -------------------------------------------------------------
    const barnPosition = { x: 40, y: 0, z: -15 };
    const barnDocument = makeStructureDocument('Barn', new Position(0, 0.5, 0));
    const barnDocumentId = barnDocument.world.id;
    storage.save(barnDocumentId, serializer.serialize(barnDocument));
    const barnJsonBeforeFork = JSON.stringify(storage.load(barnDocumentId));

    // -------------------------------------------------------------
    // C/D — STRUCTURE: editCopyContext carries the right fields, and
    // selectAllBricks is set (only STRUCTURE ever sets it).
    // -------------------------------------------------------------
    {
        const barnEntity = { id: 'placement-barn', title: 'Barn', position: barnPosition, documentId: barnDocumentId };
        const context = deriveWorldFocusContext({ kind: WorldFocusKind.STRUCTURE, entity: barnEntity, viewerPosition: null, regions: [] });
        assert(context.hasAction(WorldFocusAction.EDIT_COPY), '1. a structure offers Edit a Copy');

        const entryContext = context.editCopyContext;
        assert(entryContext instanceof EditorEntryContext, '2. editCopyContext is a real EditorEntryContext');
        assert(entryContext.sourceDocumentId === barnDocumentId, '3. ...pointing at the Barn\'s OWN content document');
        assert(entryContext.focusPosition.x === 40 && entryContext.focusPosition.z === -15, '4. ...carrying the Barn\'s own position');
        assert(entryContext.focusLocationId === 'placement-barn', '5. ...and the placement\'s own id as focusLocationId');
        assert(entryContext.title === 'Barn', '6. ...and its own title');
        assert(entryContext.selectAllBricks === true, '7. a STRUCTURE\'s own document IS its content — selectAllBricks is true');
        assert(entryContext.reason === EditorEntryReason.WORLD_VIEW_EDIT_COPY, '8. reason records how the viewer arrived');

        // toJSON() surfaces the same context — WorldView.js reads
        // context.editCopyContext off exactly this shape after
        // `context.toJSON()`, never the class instance directly.
        const json = context.toJSON();
        assert(json.editCopyContext && json.editCopyContext.sourceDocumentId === barnDocumentId,
            '9. WorldFocusContext#toJSON() carries editCopyContext through, plain-object shaped');

        console.log('✓ C/D. A STRUCTURE\'s editCopyContext carries sourceDocumentId/focusPosition/focusLocationId/title and selects all bricks');
    }

    // -------------------------------------------------------------
    // E — LANDMARK: camera context only, never a selection.
    // -------------------------------------------------------------
    {
        const wellEntity = { id: 'landmark-well', title: 'Village Well', description: '', position: { x: 5, y: 0, z: 5 }, documentId: 'world-doc-1' };
        const context = deriveWorldFocusContext({ kind: WorldFocusKind.LANDMARK, entity: wellEntity, viewerPosition: null, regions: [] });
        assert(context.hasAction(WorldFocusAction.EDIT_COPY), '10. a landmark offers Edit a Copy');

        const entryContext = context.editCopyContext;
        assert(entryContext.sourceDocumentId === 'world-doc-1', '11. a landmark\'s editCopyContext points at the CONTAINING World');
        assert(entryContext.focusPosition.x === 5 && entryContext.focusPosition.z === 5, '12. ...carrying the landmark\'s own position for camera framing');
        assert(entryContext.selectAllBricks === false,
            '13. a landmark\'s own document is NOT exclusively its content — selectAllBricks stays false (never "half the village")');

        console.log('✓ E. A LANDMARK\'s editCopyContext frames the camera but never selects arbitrary bricks');
    }

    // A REGION gets the identical treatment — its own document is the
    // containing World, never exclusively-owned content either.
    {
        const region = { id: 'region-willow', name: 'Willow Village', kind: RegionKind.VILLAGE, description: '', radius: 30, position: { x: 0, y: 0, z: 0 }, documentId: 'world-doc-1' };
        const context = deriveWorldFocusContext({ kind: WorldFocusKind.REGION, entity: region, viewerPosition: null, regions: [] });
        const entryContext = context.editCopyContext;
        assert(entryContext.sourceDocumentId === 'world-doc-1', 'E2. a region\'s editCopyContext points at the CONTAINING World');
        assert(entryContext.selectAllBricks === false, 'E3. ...and never selects arbitrary bricks — "why did clicking the well select half the village?"');
        console.log('✓ E (region). A REGION\'s editCopyContext matches LANDMARK\'s own camera-only treatment');
    }

    // -------------------------------------------------------------
    // F — GEOGRAPHIC_PLACE and COLLABORATOR never offer Edit a Copy at
    // all — 0.5.9's own invariant, untouched by this milestone.
    // -------------------------------------------------------------
    {
        const place = { fingerprintKey: 'k1', displayName: 'Kawahara Village', descriptionCount: 2, worldCount: 2, authorCount: 3, position: { x: 0, y: 0, z: 0 } };
        const placeContext = deriveWorldFocusContext({ kind: WorldFocusKind.GEOGRAPHIC_PLACE, entity: place, viewerPosition: null, regions: [], nearbyPlaceEntries: [] });
        assert(!placeContext.hasAction(WorldFocusAction.EDIT_COPY), '14. a geographic place never offers Edit a Copy');
        assert(placeContext.editCopyContext === null, '15. ...so it has no editCopyContext to derive either — it never pretends to belong to a document');

        const collaborator = { identityId: 'carol-id', deviceId: 'carol-device', displayName: 'Carol', activity: 'WALKING', position: { x: 0, y: 0, z: 0 } };
        const collabContext = deriveWorldFocusContext({ kind: WorldFocusKind.COLLABORATOR, entity: collaborator, viewerPosition: null, regions: [] });
        assert(collabContext.editCopyContext === null, '16. a collaborator has no editCopyContext either — no fork target without an explicitly selected document');

        console.log('✓ F. A geographic place resolves through its own regions only, never claiming a document of its own');
    }

    // -------------------------------------------------------------
    // A/B/D/G — the full Barn scenario: fork, then open in a real
    // (headless) EditorSession, and verify camera + selection land.
    // -------------------------------------------------------------
    {
        const forkUseCase = new ForkDocumentUseCase(storage, serializer);
        const forked = forkUseCase.execute(barnDocumentId, identityProvider, null);

        // B. Correct fork — same content, independent identity.
        assert(forked.world.id !== barnDocumentId, '17. the fork has a fresh document identity');
        assert(forked.metadata.title === 'Fork of Barn', '18. titled "Fork of ..."');
        assert(forked.metadata.parentDocumentId === barnDocumentId, '19. lineage recorded via parentDocumentId');
        assert(forked.world.getBuildings().length === 1 && forked.world.getBuildings()[0].getBricks().length === 1,
            '20. the fork carries the Barn\'s own content (one building, one brick)');

        // A. Independence — the source is untouched by the fork itself.
        assert(JSON.stringify(storage.load(barnDocumentId)) === barnJsonBeforeFork, '21. the source document is byte-identical in storage after the fork');

        // Derive the SAME EditorEntryContext "Edit a Copy" would have,
        // then apply it to a fresh EditorSession opened on the fork —
        // exactly EditorSession#openDocument()'s own second argument.
        const barnEntity = { id: 'placement-barn', title: 'Barn', position: barnPosition, documentId: barnDocumentId };
        const focusContext = deriveWorldFocusContext({ kind: WorldFocusKind.STRUCTURE, entity: barnEntity, viewerPosition: null, regions: [] });
        const entryContext = focusContext.editCopyContext;

        const { editorSession, editorContext, documentManager } = makeEditorSession(registry, storage, serializer, identityProvider);
        documentManager.newDocument(forked);
        editorSession._commandHistory = new CommandHistory({ world: forked.world });
        editorSession.applyEntryContext(entryContext);

        // D. Selection — every brick NOW IN THE FORK is selected (never
        // the source's own brick ids, which the clone already discarded
        // — see core/EditorEntryContext.js's own header).
        const forkedBrickId = forked.world.getBuildings()[0].getBricks()[0].id;
        assert(editorContext.selection.items.length === 1, '22. exactly one item is selected after applying the entry context');
        assert(editorContext.selection.items[0].brickId === forkedBrickId, '23. ...and it\'s the FORK\'s own (freshly-minted) brick id, not the source\'s');

        // Camera framing — position + the same diagonal offset
        // application/WorldNavigationSession.js#focusLocation() uses,
        // target = the focused position itself.
        const cameraState = editorSession._session.getCameraState();
        assert(cameraState.target.x === 40 && cameraState.target.z === -15, '24. the camera target is the Barn\'s own position');
        assert(cameraState.position.x === 52 && cameraState.position.z === -3, '25. the camera sits at position + the standard diagonal offset');

        // G. Collaboration — the fork is an ORDINARY, fully mutable
        // Editor document afterward; applying an entry context follows
        // no restricted path.
        assert(typeof editorSession.deleteSelection === 'function', '26. the fork\'s EditorSession has full ordinary mutation capability');
        const deleted = editorSession.deleteSelection();
        assert(deleted === true, '27. the selected (fork-owned) brick can actually be deleted');
        assert(forked.world.getBuildings()[0].findBrick(forkedBrickId) === null, '28. it\'s really gone from the FORK');
        assert(JSON.stringify(storage.load(barnDocumentId)) === barnJsonBeforeFork,
            '29. the SOURCE is still byte-identical after editing the fork — forks stay independent');

        // A null/no-op entry context (every other openDocument() caller
        // — Load, forkStructure(), a fresh New) touches neither camera
        // nor selection.
        const { editorSession: plainSession, editorContext: plainContext } = makeEditorSession(registry, storage, serializer, identityProvider);
        const cameraBefore = JSON.stringify(plainSession._session.getCameraState());
        plainSession.applyEntryContext(null);
        assert(JSON.stringify(plainSession._session.getCameraState()) === cameraBefore, '30. a null entry context leaves the camera untouched');
        assert(plainContext.selection.items.length === 0, '31. ...and leaves selection untouched');

        console.log('✓ A/B/D/G. Fork independence, correct content, camera + selection applied from the SAME entry context, and the fork is an ordinary mutable Editor document');
    }

    // -------------------------------------------------------------
    // H — Persistence boundary: never Document/World content, and the
    // router-query channel round-trips.
    // -------------------------------------------------------------
    {
        const barnEntity = { id: 'placement-barn', title: 'Barn', position: barnPosition, documentId: barnDocumentId };
        const focusContext = deriveWorldFocusContext({ kind: WorldFocusKind.STRUCTURE, entity: barnEntity, viewerPosition: null, regions: [] });
        const entryContext = focusContext.editCopyContext;

        // Never part of a Document — Document.toJSON()/World.toJSON()
        // have no field for it, deriveEditorEntryContext() never reads
        // or writes a Document, and nothing above ever called
        // document.save()/world.toJSON() with an entryContext in scope.
        const documentJson = barnDocument.toJSON();
        assert(JSON.stringify(documentJson).indexOf('EditorEntryContext') === -1, '32. Document.toJSON() carries no trace of an EditorEntryContext');
        assert(!('entryContext' in documentJson) && !('editorEntryContext' in documentJson), '33. ...no field for it exists on Document.toJSON() at all');
        assert(!('entryContext' in documentJson.world) && !('editorEntryContext' in documentJson.world), '34. ...nor on World.toJSON()');

        // The router-query channel — the ONE way this context crosses
        // the WorldView.js -> EditorView.js page navigation — round-trips.
        const query = editorEntryContextToQuery(entryContext);
        assert(query.entryReason === EditorEntryReason.WORLD_VIEW_EDIT_COPY, '35. the query carries the reason');
        assert(query.entrySelectAll === '1', '36. ...and selectAllBricks, encoded as a plain string like every other query value');
        assert(query.entryTitle === 'Barn', '37. ...and the title');

        const decoded = editorEntryContextFromQuery(query, barnDocumentId);
        assert(decoded.sourceDocumentId === entryContext.sourceDocumentId, '38. decode round-trips sourceDocumentId');
        assert(decoded.focusPosition.x === entryContext.focusPosition.x && decoded.focusPosition.z === entryContext.focusPosition.z,
            '39. ...focusPosition');
        assert(decoded.focusLocationId === entryContext.focusLocationId, '40. ...focusLocationId');
        assert(decoded.selectAllBricks === entryContext.selectAllBricks, '41. ...selectAllBricks');
        assert(decoded.title === entryContext.title, '42. ...and title');

        // A plain fork with no entry context at all (a bare
        // `/editor?fork=` — every OTHER fork entry point this milestone
        // did not touch) decodes to null, never a synthesized one.
        assert(editorEntryContextFromQuery({}, barnDocumentId) === null, '43. no entryReason in the query means no entry context at all');
        assert(editorEntryContextFromQuery(query, null) === null, '44. no sourceDocumentId means no entry context either');

        // deriveEditorEntryContext() itself: null propagates gracefully.
        assert(deriveEditorEntryContext(null) === null, '45. deriveEditorEntryContext(null) returns null, never throws');
        assert(deriveEditorEntryContext({ source: {} }) === null, '46. ...same for a focus context with no source.documentId');

        console.log('✓ H. An EditorEntryContext never touches Document/World content, and the router-query channel round-trips exactly');
    }

    console.log('\nAll Context-Preserving Fork-to-Edit tests passed.');
}

await run();
