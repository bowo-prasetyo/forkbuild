import { World } from '../core/World.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { WorldLocation } from '../core/WorldLocation.js';
import { WorldLocationKind, isValidWorldLocationKind } from '../core/WorldLocationKind.js';
import { WorldLocationDirectory, ORIGIN_LOCATION_ID } from '../application/WorldLocationDirectory.js';
import { CameraFocusAnimator } from '../application/CameraFocusAnimator.js';
import { computeCompassHeading, resolveCompassLabel } from '../core/CompassHeading.js';

// 0.2.94 — World View Location & Navigation.
//
// The design conversation's central claim: World View should become
// pleasant to navigate — findable destinations, a Home to return to, a
// sense of orientation, and a camera that glides rather than jumps —
// without gaining a single new capacity to MUTATE anything. This file
// proves that claim at every layer it touches:
//
//   Section A: core/WorldLocation.js + core/WorldLocationKind.js — the
//              closed vocabulary and the value object, including that
//              an invalid kind is rejected rather than silently
//              accepted.
//   Section B: core/CompassHeading.js — the pure, reused-convention
//              heading computation, including its "no meaningful
//              heading" null case.
//   Section C: application/CameraFocusAnimator.js — pure interpolation:
//              from/to/duration/elapsed always produce the SAME
//              framing, the path never jumps straight to the target
//              before the duration elapses, and it clamps cleanly
//              outside [0, duration].
//   Section D: application/WorldLocationDirectory.js — Origin always
//              first, one entry per StructurePlacement, correct
//              world-space position (placement + containing document's
//              own layout offset), and find() agreeing with list().
//   Section E: FLAGSHIP — Editor creates and places a House, saves
//              both; TWO INDEPENDENT WorldNavigationSession replicas
//              load the same World and produce the IDENTICAL location
//              list; focusLocation()/goHome() glide the camera through
//              a deterministic path to a deterministic final framing;
//              the compass reads a deterministic heading off of it; and
//              through all of it the World document, its placement, and
//              CommandHistory remain byte-identical — navigation is
//              proven to be camera-only, exactly as docs/Principles.md's
//              "World View Navigation Operates On Spatial Observation,
//              Never On Document Mutation (0.2.94)" claims.

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

// A stateful camera render-facade stub — unlike WorldViewInstanceInspection's
// own stubRenderer() (whose setCameraState() is a fire-and-forget no-op,
// fine for tests that never read the camera back), this one actually
// remembers what was set, so SpatialCameraController#getSpatialCameraState()
// round-trips exactly what applyFraming() last wrote — required to
// observe an in-flight camera focus animation mid-glide.
function stubCameraRenderer(initial) {
    let state = {
        position: { ...initial.position },
        target: { ...initial.target },
        zoom: 1
    };
    return {
        getCameraState() {
            return {
                position: { x: state.position.x, y: state.position.y, z: state.position.z },
                target: { x: state.target.x, y: state.target.y, z: state.target.z },
                zoom: state.zoom
            };
        },
        setCameraState(next) {
            state = {
                position: { x: next.position.x, y: next.position.y, z: next.position.z },
                target: { x: next.target.x, y: next.target.y, z: next.target.z },
                zoom: next.zoom
            };
        }
    };
}

// _loadWorld() calls straight through to `session._session.addWorld()` —
// the SAME minimal wiring WorldViewInstanceInspection's own flagship
// uses (`session._session = stubRenderer()`, assigned directly rather
// than via start()), narrowed to only what _loadWorld() itself touches;
// this file's own SpatialCameraController is wired separately, only
// where a test needs one — see stubCameraRenderer above.
function minimalWorldRenderSession() {
    return { addWorld() {}, removeWorld() {}, dispose() {} };
}

async function run() {
    // -------------------------------------------------------------
    // Section A: WorldLocation + WorldLocationKind
    // -------------------------------------------------------------
    {
        assert(isValidWorldLocationKind(WorldLocationKind.ORIGIN) === true, '1. ORIGIN is a valid kind');
        assert(isValidWorldLocationKind(WorldLocationKind.STRUCTURE) === true, '2. STRUCTURE is a valid kind');
        // 0.3.7 shipped LANDMARK — see core/WorldLocationKind.js and
        // tests/WorldLandmarks.test.js. 'not-a-real-kind' below still
        // proves the vocabulary stays closed, just no longer excluding
        // 'landmark' specifically.
        assert(isValidWorldLocationKind(WorldLocationKind.LANDMARK) === true, '3. LANDMARK is a valid kind (0.3.7)');

        const loc = new WorldLocation({
            id: 'placement-1', title: 'My House', kind: WorldLocationKind.STRUCTURE,
            position: new Position(5, 0, 7)
        });
        assert(loc.id === 'placement-1', '4. id is exposed');
        assert(loc.title === 'My House', '5. title is exposed');
        assert(loc.isStructure === true && loc.isOrigin === false, '6. isStructure/isOrigin read correctly');
        assert(loc.position.x === 5 && loc.position.z === 7, '7. position is exact');
        const json = loc.toJSON();
        assert(json.kind === 'structure' && json.position.x === 5, '8. toJSON is plain data, correct shape');

        let threw = false;
        try { new WorldLocation({ id: 'x', title: 'x', kind: 'not-a-real-kind' }); } catch (e) { threw = true; }
        assert(threw, '9. constructing with an invalid kind throws rather than silently accepting it');

        let threwNoId = false;
        try { new WorldLocation({ title: 'x', kind: WorldLocationKind.ORIGIN }); } catch (e) { threwNoId = true; }
        assert(threwNoId, '10. constructing without an id throws');

        const origin = new WorldLocation({ id: ORIGIN_LOCATION_ID, title: 'Origin', kind: WorldLocationKind.ORIGIN });
        assert(origin.isOrigin === true, '11. isOrigin true for an ORIGIN-kind location');
        assert(origin.position.x === 0 && origin.position.y === 0 && origin.position.z === 0,
            '12. a location built with no position defaults to (0,0,0)');
    }

    // -------------------------------------------------------------
    // Section B: core/CompassHeading.js
    // -------------------------------------------------------------
    {
        const north = computeCompassHeading({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 });
        assert(north.degrees === 0 && north.label === 'N', '13. facing +Z reads as North, 0 degrees');

        const east = computeCompassHeading({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
        assert(east.degrees === 90 && east.label === 'E', '14. facing +X reads as East, 90 degrees');

        const south = computeCompassHeading({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -5 });
        assert(south.degrees === 180 && south.label === 'S', '15. facing -Z reads as South, 180 degrees');

        const west = computeCompassHeading({ x: 0, y: 0, z: 0 }, { x: -5, y: 0, z: 0 });
        assert(west.degrees === 270 && west.label === 'W', '16. facing -X reads as West, 270 degrees');

        const same = computeCompassHeading({ x: 3, y: 0, z: 3 }, { x: 3, y: 9, z: 3 });
        assert(same === null, '17. position and target coinciding on X/Z (looking straight down) yields no meaningful heading — null, not a fabricated one');

        assert(resolveCompassLabel(20) === 'N' && resolveCompassLabel(46) === 'NE',
            '18. resolveCompassLabel rounds to the nearest 45-degree sector');
        assert(resolveCompassLabel(-10) === 'N', '19. a negative degree value normalizes before labeling');
    }

    // -------------------------------------------------------------
    // Section C: application/CameraFocusAnimator.js
    // -------------------------------------------------------------
    {
        const from = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
        const to = { position: { x: 100, y: 0, z: 0 }, target: { x: 50, y: 0, z: 0 } };
        const animator = new CameraFocusAnimator({ from, to, durationMs: 1000 });

        const atStart = animator.stateAt(0);
        assert(atStart.position.x === 0 && atStart.complete === false, '20. at elapsed=0, framing equals the start, not yet complete');

        const atEnd = animator.stateAt(1000);
        assert(atEnd.position.x === 100 && atEnd.target.x === 50 && atEnd.complete === true,
            '21. at elapsed=duration, framing equals the destination exactly, marked complete');

        const beforeStart = animator.stateAt(-500);
        assert(beforeStart.position.x === 0 && beforeStart.complete === false, '22. negative elapsed clamps to the start');

        const pastEnd = animator.stateAt(5000);
        assert(pastEnd.position.x === 100 && pastEnd.complete === true, '23. elapsed past duration clamps to the destination, still complete');

        const mid = animator.stateAt(500);
        assert(mid.position.x > 0 && mid.position.x < 100, '24. midway framing lies strictly between start and destination — the camera never jumps');
        assert(mid.complete === false, '25. midway framing is not yet marked complete');

        // Determinism: the SAME inputs at the SAME elapsed time always
        // produce the SAME output — two independently constructed
        // animators, never a shared mutable instance.
        const animatorTwo = new CameraFocusAnimator({ from, to, durationMs: 1000 });
        const midTwo = animatorTwo.stateAt(500);
        assert(mid.position.x === midTwo.position.x && mid.target.x === midTwo.target.x,
            '26. two independently constructed animators produce byte-identical intermediate framings for identical inputs');

        const zeroDuration = new CameraFocusAnimator({ from, to, durationMs: 0 });
        const instantly = zeroDuration.stateAt(0);
        assert(instantly.position.x === 100 && instantly.complete === true, '27. a zero-duration animator resolves straight to the destination');
    }

    // -------------------------------------------------------------
    // Section D: application/WorldLocationDirectory.js (isolated)
    // -------------------------------------------------------------
    {
        const placement = new StructurePlacement({
            documentId: 'house-doc-id',
            position: new Position(5, 0, 7),
            rotation: 0
        });
        const containerWorld = new World({});
        containerWorld.addStructurePlacement(placement);
        const containerDoc = new Document({ world: containerWorld, metadata: new DocumentMetadata({ title: 'Container' }) });

        const fakeSession = {
            getLoadedDocuments: () => [containerDoc],
            getDocumentPosition: (id) => (id === containerWorld.id ? new Position(100, 0, 200) : new Position(0, 0, 0)),
            getSavedDocumentTitle: (id) => (id === 'house-doc-id' ? 'My House' : id)
        };

        const directory = new WorldLocationDirectory(fakeSession);
        const locations = directory.list();
        assert(locations.length === 2, '28. Origin + one structure placement = two locations');
        assert(locations[0].kind === WorldLocationKind.ORIGIN && locations[0].id === ORIGIN_LOCATION_ID,
            '29. Origin is always listed first');
        assert(locations[0].position.x === 0 && locations[0].position.z === 0, '30. Origin sits at world (0,0,0)');

        const structureLoc = locations[1];
        assert(structureLoc.kind === WorldLocationKind.STRUCTURE && structureLoc.id === placement.id,
            '31. the structure location is keyed by the StructurePlacement\'s own id');
        assert(structureLoc.title === 'My House', '32. title resolves through getSavedDocumentTitle, the SAME lookup inspection uses');
        assert(structureLoc.position.x === 105 && structureLoc.position.z === 207,
            '33. world position = placement-local position + the containing document\'s own layout offset (5+100, 7+200)');

        assert(directory.find(placement.id).id === placement.id, '34. find() locates the same location by id');
        assert(directory.find('does-not-exist') === null, '35. find() returns null for an unknown id, never throws');
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP
    // -------------------------------------------------------------
    //   Editor creates House -> places House -> saves World -> TWO
    //   independent World View sessions load the same World and agree
    //   on the exact same location list -> Focus glides the camera
    //   through a deterministic path to a deterministic destination ->
    //   Home returns to the world's fixed starting framing -> the
    //   compass reads a deterministic heading off the result -> the
    //   World document, its placement, and CommandHistory are
    //   byte-identical throughout.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        const houseWorld = new World({});
        const houseManager = new DocumentManager(new Document({
            world: houseWorld,
            metadata: new DocumentMetadata({ title: 'My House' })
        }));
        saveDocumentUseCase.execute(houseManager);

        const bobWorld = new World({});
        const placement = new StructurePlacement({
            documentId: houseWorld.id,
            position: new Position(800, 0, 1200),
            rotation: 0
        });
        bobWorld.addStructurePlacement(placement);
        const bobManager = new DocumentManager(new Document({
            world: bobWorld,
            metadata: new DocumentMetadata({ title: "Bob's World", author: 'bob' })
        }));
        saveDocumentUseCase.execute(bobManager);

        function makeSession() {
            const session = new WorldNavigationSession({
                registry, loadPublicationDocumentUseCase, worldLayoutProvider,
                discoveryProvider, loadDocumentUseCase
            });
            session._session = minimalWorldRenderSession();
            session._loadWorld(bobWorld.id);
            return session;
        }

        // "TWO independent replicas ... agree on the exact same location
        // list" — never route- or timing-dependent.
        const replicaA = makeSession();
        const replicaB = makeSession();
        const locationsA = replicaA.getWorldLocations().map((l) => l.toJSON());
        const locationsB = replicaB.getWorldLocations().map((l) => l.toJSON());
        assert(JSON.stringify(locationsA) === JSON.stringify(locationsB),
            '36. flagship: two independently-built sessions loading the same World produce byte-identical location lists');
        assert(locationsA.length === 2, '37. flagship: Origin + the one placed House');
        const houseLocation = locationsA.find((l) => l.kind === 'structure');
        assert(houseLocation.title === 'My House', '38. flagship: the structure location resolves the real saved title');
        // Bob's World itself has no explicit WorldPlacement (this test
        // never wires a placementRegistry, matching WorldViewInstanceInspection's
        // own flagship) — LocalWorldLayoutProvider falls back to its
        // own deterministic, documentId-keyed grid position for it
        // (core/DeterministicGridPlacement.js), not (0,0,0). The
        // House's own WORLD position is that layout offset plus its
        // LOCAL (800, 0, 1200) — read the offset back the same way
        // WorldLocationDirectory itself does, rather than assuming a
        // specific number, so this assertion holds regardless of
        // exactly which grid slot bobWorld's id happens to hash to.
        const layoutPos = replicaA.getDocumentPosition(bobWorld.id);
        assert(houseLocation.position.x === 800 + layoutPos.x && houseLocation.position.z === 1200 + layoutPos.z,
            '39. flagship: world position = the House\'s local placement position plus its containing World\'s own deterministic layout offset');

        // "Focus glides the camera ... to a deterministic destination."
        // A stateful camera stub, wired directly onto the session the
        // same way WorldViewInstanceInspection's flagship wires
        // session._session directly — start() (and the real renderer it
        // requires) is never needed to prove this application-layer
        // contract.
        const startFraming = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } };
        // The deterministic offset framing focusLocation uses for a
        // STRUCTURE location — same formula on any replica. Computed up
        // front so both the "moved toward" check below and the final
        // exact-framing check compare against the SAME expected
        // destination, never the bare target position.
        const expectedPosition = { x: houseLocation.position.x + 12, y: houseLocation.position.y + 12, z: houseLocation.position.z + 12 };
        replicaA._spatialCameraController = new SpatialCameraController(stubCameraRenderer(startFraming));
        // Simulates start()'s frame-tick wiring being present, without
        // requiring a real onAnimationFrame-capable renderer — the
        // subscription's only observed property, from _beginCameraFocus's
        // point of view, is "truthy", so an animation is scheduled
        // rather than applied instantly.
        replicaA._cameraFocusFrameSubscription = () => {};

        const focused = replicaA.focusLocation(houseLocation.id);
        assert(focused === true, '40. flagship: focusLocation succeeds for a real location id');
        assert(replicaA._activeCameraFocus !== null, '41. flagship: focusing a location with frame-tick support schedules an animation rather than jumping');

        const { startedAt } = replicaA._activeCameraFocus;
        const midCamera = replicaA._spatialCameraController.getSpatialCameraState();
        // Advance the animation deterministically by simulated elapsed
        // time — never a real sleep, never wall-clock-dependent.
        replicaA._tickCameraFocus(startedAt + 450);
        const midFraming = replicaA._spatialCameraController.getSpatialCameraState();
        assert(midFraming.position.x !== midCamera.position.x, '42. flagship: midway through the glide, the camera has actually moved');
        assert((midFraming.position.x - startFraming.position.x) * (expectedPosition.x - startFraming.position.x) >= 0,
            '43. flagship: midway, the camera has moved TOWARD the destination, never away from it or past it');
        assert(replicaA._activeCameraFocus !== null, '44. flagship: the animation is still in flight at the midpoint');

        replicaA._tickCameraFocus(startedAt + 900);
        const finalFraming = replicaA._spatialCameraController.getSpatialCameraState();
        assert(finalFraming.target.x === houseLocation.position.x && finalFraming.target.z === houseLocation.position.z,
            '45. flagship: once the glide completes, the camera target is exactly the House\'s own world position');
        assert(replicaA._activeCameraFocus === null, '46. flagship: a completed animation clears itself');

        assert(Math.abs(finalFraming.position.x - expectedPosition.x) < 1e-9
            && Math.abs(finalFraming.position.z - expectedPosition.z) < 1e-9,
            '47. flagship: the final camera position is the House\'s position plus the fixed, documented offset — reproducible on any replica');

        // "The compass reads a deterministic heading off the result."
        const heading = replicaA.getCompassHeading();
        assert(heading !== null, '48. flagship: after focusing, the compass has a meaningful heading');
        assert(heading.label === 'SW',
            '49. flagship: looking from (+12,+12,+12) offset back down at the target reads as Southwest — a fixed, reproducible reading');

        // "Home returns to the world's fixed starting framing."
        replicaA._cameraFocusFrameSubscription = () => {};
        const wentHome = replicaA.goHome();
        assert(wentHome === true, '50. flagship: goHome() succeeds');
        const homeStartedAt = replicaA._activeCameraFocus.startedAt;
        replicaA._tickCameraFocus(homeStartedAt + 900);
        const homeFraming = replicaA._spatialCameraController.getSpatialCameraState();
        assert(homeFraming.position.x === 10 && homeFraming.position.y === 10 && homeFraming.position.z === 10,
            '51. flagship: Home returns the camera to the world\'s conventional (10,10,10) starting position');
        assert(homeFraming.target.x === 0 && homeFraming.target.y === 0 && homeFraming.target.z === 0,
            '52. flagship: Home\'s target is exactly the world origin');

        // An unknown location id is a clean no-op, never a throw.
        assert(replicaA.focusLocation('not-a-real-location-id') === false,
            '53. flagship: focusing an unknown location id returns false rather than throwing');

        // "Through all of it the World document, its placement, and
        // CommandHistory are byte-identical" — read back through the
        // session's OWN loaded copy, a different object than the
        // `bobWorld` this test built, exactly like WorldViewInstanceInspection's
        // own flagship insists on.
        const liveBobWorld = replicaA.getDocument(bobWorld.id).world;
        assert(liveBobWorld.getStructurePlacements().length === 1, '54. flagship: still exactly one placement after every navigation call');
        const livePlacement = liveBobWorld.getStructurePlacement(placement.id);
        assert(livePlacement.position.x === 800 && livePlacement.position.z === 1200,
            '55. flagship: the placement\'s own position is completely unaffected by any camera navigation');
        const history = replicaA._commandHistories.get(bobWorld.id);
        assert(!history || history.canUndo() === false,
            '56. flagship: zero commands were ever executed — Focus/Home/compass are pure camera + read operations');
        assert(replicaA.getActiveDocumentId() === bobWorld.id,
            '57. flagship: the active document is still exactly what _loadWorld bootstrapped it to — focusLocation/goHome never call setActiveDocument');

        // Graceful degradation: a session with a camera controller but
        // NO frame-tick support (e.g. start() truly never wired one)
        // still lands on the exact same deterministic destination —
        // just instantly instead of gliding. Same posture every other
        // optional frame-driven feature in WorldNavigationSession
        // already follows.
        const replicaC = makeSession();
        replicaC._spatialCameraController = new SpatialCameraController(stubCameraRenderer(startFraming));
        // _cameraFocusFrameSubscription deliberately left null.
        const focusedInstantly = replicaC.focusLocation(houseLocation.id);
        assert(focusedInstantly === true, '58. flagship: focusLocation still succeeds with no frame-tick support');
        assert(replicaC._activeCameraFocus === null, '59. flagship: without frame-tick support, no animation is scheduled at all');
        const instantFraming = replicaC._spatialCameraController.getSpatialCameraState();
        assert(instantFraming.target.x === houseLocation.position.x && instantFraming.target.z === houseLocation.position.z,
            '60. flagship: the framing is applied instantly, landing on the SAME deterministic destination as the animated path');
    }

    console.log('✓ Section A: core/WorldLocation.js + core/WorldLocationKind.js — closed vocabulary, invalid kinds rejected');
    console.log('✓ Section B: core/CompassHeading.js — pure heading computation, reused yaw convention, null when meaningless');
    console.log('✓ Section C: application/CameraFocusAnimator.js — deterministic interpolation, clamped, never jumps mid-path');
    console.log('✓ Section D: application/WorldLocationDirectory.js — Origin-first, correct world-space positions, find() agrees with list()');
    console.log('✓ Section E: FLAGSHIP — two replicas agree on locations, Focus/Home glide deterministically, compass reads correctly, zero document/placement/history mutation');

    console.log('\nAll World View Location & Navigation tests passed.');
}

await run();
