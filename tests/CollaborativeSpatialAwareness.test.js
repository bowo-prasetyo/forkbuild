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
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { WorldSpatialPresenceUseCase } from '../application/WorldSpatialPresenceUseCase.js';
import { WorldSpatialSelection } from '../core/WorldSpatialSelection.js';
import { WorldSpatialActivity } from '../core/WorldSpatialActivity.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import {
    WorldSpatialAnchor,
    WorldSpatialProximityTier,
    WorldSpatialPresentationMode,
    distanceXZ,
    deriveProximityTier,
    isWithinViewCone,
    derivePresentationMode,
    abbreviateIdentityLabel,
    describeSpatialActivity,
    deriveWorldSpatialAnchor
} from '../core/WorldSpatialAnchor.js';
import { buildSpatialCollaboratorRows } from '../ui/components/WorldCollaboratorIndicator.js';

// 0.3.1 — Collaborative Spatial Awareness.
//
// 0.3.0 made a collaborator's raw position/heading/selection/activity
// OBSERVABLE. This file proves the one new thing this milestone adds on
// top of that, without a second protocol or a single new persisted
// fact: a presentation-only reading of what that observation MEANS from
// the viewer's own vantage point.
//
//   Section A: core/WorldSpatialAnchor.js — every pure derivation in
//              isolation: distance, proximity tier, the view-cone
//              visibility heuristic, presentation mode, label
//              abbreviation, and contextual activity phrasing.
//   Section B: ui/components/WorldCollaboratorIndicator.js —
//              buildSpatialCollaboratorRows() picks the most-noteworthy
//              DEVICE (not just its activity string) and threads a
//              resolved contextual label into the SAME activityLabel
//              text the 3D marker shows.
//   Section C: FLAGSHIP — a real authenticated peer connection (Alice,
//              Bob), a real WorldNavigationSession, and a real
//              StructurePlacement: Bob's activity label reads "Building
//              My House" the moment his selection resolves to it and
//              falls back to plain wording the instant it doesn't;
//              proximity/view-cone change the derived presentation mode
//              as Bob moves; focusCollaborator() glides Alice's camera
//              toward Bob through the exact same deterministic path
//              focusLocation() already uses; and throughout all of it
//              the World document, its placement, and CommandHistory
//              stay byte-identical — Follow is never a mutation, and
//              nothing a WorldSpatialAnchor computes ever reaches
//              SpatialSelectionState or any application/commands/ class.

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

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

async function connectAndAuthenticate(network, addressA, deviceA, addressB, deviceB) {
    const transportA = new LocalPeerConnectionProvider(addressA, network);
    const transportB = new LocalPeerConnectionProvider(addressB, network);
    let incomingB = null;
    const unsubscribe = transportB.onIncomingConnection((connection) => { incomingB = connection; });
    const connectionA = transportA.connect(addressB);
    await wait();
    unsubscribe();
    assert(incomingB, `connectAndAuthenticate: ${addressB} never saw an incoming connection from ${addressA}`);

    const sessionA = new PeerAuthenticationSession({ connection: connectionA, identityProvider: deviceA.provider });
    const sessionB = new PeerAuthenticationSession({ connection: incomingB, identityProvider: deviceB.provider });
    sessionA.start();
    sessionB.start();
    await wait(10);
    assert(sessionA.isAuthenticated && sessionB.isAuthenticated, `connectAndAuthenticate: ${addressA} <-> ${addressB} did not reach AUTHENTICATED`);

    return {
        peerA: new ConnectedPeer({ connection: connectionA, authenticationSession: sessionA }),
        peerB: new ConnectedPeer({ connection: incomingB, authenticationSession: sessionB })
    };
}

// A stateful camera render-facade stub, mirroring
// tests/WorldViewLocationNavigation.test.js's own stubCameraRenderer()
// exactly — required so SpatialCameraController#getSpatialCameraState()
// round-trips whatever applyFraming() (via focusCollaborator()) last
// wrote, and so getCameraPosition()/getCompassHeading() report real,
// controllable values while Alice's own roster is being derived.
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

// A render facade that CAPTURES every WorldSpatialAnchor this session
// derives, instead of actually drawing anything — this file cares about
// what WorldNavigationSession computed and handed to the renderer, never
// about THREE.js itself (that's renderer/RemoteSpatialPresenceRenderer.js's
// own concern, unit-tested by construction — see this milestone's own
// header on why a THREE-free renderer contract matters).
function capturingWorldRenderSession() {
    const anchors = new Map();
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        setRemoteSpatialPresence(deviceId, anchor) { anchors.set(deviceId, anchor); },
        removeRemoteSpatialPresence(deviceId) { anchors.delete(deviceId); },
        _anchors: anchors
    };
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — core/WorldSpatialAnchor.js, every pure derivation in isolation
// ---------------------------------------------------------------------
{
    assert(distanceXZ({ x: 0, z: 0 }, { x: 3, z: 4 }) === 5, '1. distanceXZ is plain 2D Euclidean distance, ignoring Y entirely');
    assert(distanceXZ(null, { x: 1, z: 1 }) === null, '2. distanceXZ degrades to null rather than throwing on a missing position');

    assert(deriveProximityTier(5) === WorldSpatialProximityTier.NEAR, '3. 5 units away is NEAR');
    assert(deriveProximityTier(12) === WorldSpatialProximityTier.NEAR, '4. exactly the NEAR boundary (12) is still NEAR');
    assert(deriveProximityTier(12.01) === WorldSpatialProximityTier.MID, '5. just past the NEAR boundary is MID');
    assert(deriveProximityTier(30) === WorldSpatialProximityTier.MID, '6. exactly the MID boundary (30) is still MID');
    assert(deriveProximityTier(30.01) === WorldSpatialProximityTier.FAR, '7. just past the MID boundary is FAR — there is no cutoff beyond FAR, just a quieter marker');
    assert(deriveProximityTier(null) === WorldSpatialProximityTier.FAR, '8. an unknown distance degrades to FAR rather than throwing');
    assert(deriveProximityTier(Infinity) === WorldSpatialProximityTier.FAR, '9. Infinity is FAR, never a crash');

    assert(isWithinViewCone({ x: 0, z: 0 }, 0, { x: 0, z: 10 }) === true, '10. a target directly ahead (matching the viewer\'s own heading) is within view');
    assert(isWithinViewCone({ x: 0, z: 0 }, 0, { x: 0, z: -10 }) === false, '11. a target directly BEHIND the viewer is outside the default 140-degree cone');
    assert(isWithinViewCone({ x: 0, z: 0 }, 0, { x: 5, z: 5 }, 90) === true, '12. a target 45 degrees to the side is within a wide-enough explicit FOV (half-angle 45)');
    assert(isWithinViewCone({ x: 0, z: 0 }, 0, { x: 5, z: 5 }, 30) === false, '13. the same target falls outside a NARROW explicit FOV (half-angle 15)');
    assert(isWithinViewCone(null, 0, { x: 1, z: 1 }) === true, '14. a missing viewer position degrades to visible, never a false cull');
    assert(isWithinViewCone({ x: 0, z: 0 }, null, { x: 1, z: 1 }) === true, '15. a missing viewer heading (no camera movement yet) degrades to visible');
    assert(isWithinViewCone({ x: 3, z: 3 }, 0, { x: 3, z: 3 }) === true, '16. a target exactly at the viewer\'s own position has no meaningful bearing — degrades to visible, never hidden');

    assert(derivePresentationMode(WorldSpatialProximityTier.NEAR, true) === WorldSpatialPresentationMode.MARKER_FULL, '17. NEAR + visible = MARKER_FULL');
    assert(derivePresentationMode(WorldSpatialProximityTier.MID, true) === WorldSpatialPresentationMode.MARKER_ABBREVIATED, '18. MID + visible = MARKER_ABBREVIATED');
    assert(derivePresentationMode(WorldSpatialProximityTier.FAR, true) === WorldSpatialPresentationMode.MARKER_ONLY, '19. FAR + visible = MARKER_ONLY');
    assert(derivePresentationMode(WorldSpatialProximityTier.NEAR, false) === WorldSpatialPresentationMode.HIDDEN, '20. NEAR but OUTSIDE the view cone is still HIDDEN — visibility always wins over proximity');

    assert(abbreviateIdentityLabel('Bob') === 'Bob', '21. a short label passes through unchanged');
    assert(abbreviateIdentityLabel('A Very Long Display Name Indeed', 10) === 'A Very Lo…', '22. a long label truncates to maxLength with an ellipsis');

    assert(describeSpatialActivity(WorldSpatialActivity.BUILDING, 'House') === 'Building House', '23. BUILDING + a resolved target reads as "Building House"');
    assert(describeSpatialActivity(WorldSpatialActivity.BUILDING, null) === 'Building', '24. BUILDING with no resolvable target falls back to the plain 0.3.0 phrase');
    assert(describeSpatialActivity(WorldSpatialActivity.MOVING_STRUCTURE, 'House') === 'Moving House', '25. MOVING_STRUCTURE + a target reads as "Moving House"');
    assert(describeSpatialActivity(WorldSpatialActivity.ROTATING_STRUCTURE, 'House') === 'Rotating House', '26. ROTATING_STRUCTURE + a target reads as "Rotating House"');
    assert(describeSpatialActivity(WorldSpatialActivity.INSPECTING, 'House') === 'Inspecting House', '27. INSPECTING + a target reads as "Inspecting House"');
    assert(describeSpatialActivity(WorldSpatialActivity.WALKING, 'House') === 'Walking', '28. WALKING ignores any target — there is nothing to attach it to');
    assert(describeSpatialActivity(WorldSpatialActivity.IDLE) === 'Here', '29. IDLE reads as "Here", matching 0.3.0\'s own default exactly');

    const anchor = deriveWorldSpatialAnchor({
        deviceId: 'd1', identityId: 'bob', label: 'Bob',
        position: { x: 0, z: 8 }, heading: 90,
        selection: WorldSpatialSelection.placement({ documentId: 'w', placementId: 'p' }),
        activity: WorldSpatialActivity.BUILDING, contextualLabel: 'House',
        viewerPosition: { x: 0, z: 0 }, viewerHeadingDegrees: 0
    });
    assert(anchor instanceof WorldSpatialAnchor, '30. deriveWorldSpatialAnchor() returns a real WorldSpatialAnchor instance');
    assert(anchor.tier === WorldSpatialProximityTier.NEAR, '31. flagship-adjacent: 8 units away derives NEAR');
    assert(anchor.presentationMode === WorldSpatialPresentationMode.MARKER_FULL, '32. NEAR + directly ahead derives MARKER_FULL');
    assert(anchor.activityLabel === 'Building House', '33. the anchor\'s own activityLabel is already the fully-composed contextual phrase');
    assert(anchor.isHidden === false, '34. isHidden reflects presentationMode directly');
    assert(!(anchor.selection instanceof SpatialSelectionState), '35. an anchor\'s carried selection is never a SpatialSelectionState — the 0.3.0 type separation holds one layer higher');

    console.log('✓ Section A: core/WorldSpatialAnchor.js — distance, proximity tier, view-cone visibility, presentation mode, abbreviation, and contextual activity phrasing, all pure and in isolation');
}

// ---------------------------------------------------------------------
// Section B — ui/components/WorldCollaboratorIndicator.js
// ---------------------------------------------------------------------
{
    const selection = WorldSpatialSelection.placement({ documentId: 'w', placementId: 'p1' });
    const roster = [{
        identityId: 'bob',
        devices: [
            { deviceId: 'bob-tablet', activity: WorldSpatialActivity.WALKING, selection: WorldSpatialSelection.none() },
            { deviceId: 'bob-desktop', activity: WorldSpatialActivity.BUILDING, selection }
        ]
    }];
    const rows = buildSpatialCollaboratorRows(roster, {
        resolveDisplayName: (id) => (id === 'bob' ? 'Bob' : id),
        resolveSelectionLabel: (sel) => (sel && sel.kind === 'placement' ? 'House' : null)
    });
    assert(rows.length === 1, '36. one row per identity, exactly as 0.3.0 established');
    assert(rows[0].primaryDeviceId === 'bob-desktop', '37. the MOST noteworthy device (BUILDING beats WALKING) is the one Follow would target');
    assert(rows[0].activityLabel === 'Building House', '38. the row\'s activityLabel is the SAME contextual phrasing the 3D marker shows — one shared derivation, never a second wording');

    const idleRoster = [{ identityId: 'bob', devices: [{ deviceId: 'bob-desktop', activity: WorldSpatialActivity.IDLE, selection: WorldSpatialSelection.none() }] }];
    const idleRows = buildSpatialCollaboratorRows(idleRoster, { resolveSelectionLabel: () => null });
    assert(idleRows[0].activityLabel === 'Here', '39. an idle, unselected device falls back to the plain "Here" phrase, unchanged from 0.3.0');

    console.log('✓ Section B: ui/components/WorldCollaboratorIndicator.js — the most-noteworthy device\'s own contextual activityLabel, shared verbatim with the 3D marker');
}

// ---------------------------------------------------------------------
// Section C — FLAGSHIP
// ---------------------------------------------------------------------
{
    // --- World setup: a House document, and a shared World that places it ---
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
    const houseManager = new DocumentManager(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'My House' }) }));
    saveDocumentUseCase.execute(houseManager);

    const sharedWorld = new World({});
    const placement = new StructurePlacement({ documentId: houseWorld.id, position: new Position(5, 0, 5), rotation: 0 });
    sharedWorld.addStructurePlacement(placement);
    const sharedManager = new DocumentManager(new Document({ world: sharedWorld, metadata: new DocumentMetadata({ title: 'Shared World', author: 'alice' }) }));
    saveDocumentUseCase.execute(sharedManager);
    const worldJsonBefore = JSON.stringify(sharedManager.document.toJSON());

    // --- Real authenticated peers: Alice and Bob ------------------------
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceAwareness');
    const bob = makeDevice('BobAwareness');

    function makeSpatialStack(device) {
        const peerMessageBus = new PeerMessageBus();
        const connectedPeerRegistry = new ConnectedPeerRegistry();
        const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry });
        const spatialPresence = new WorldSpatialPresenceUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, minIntervalMs: 20 });
        return { peerMessageBus, connectedPeerRegistry, deviceAuth, spatialPresence };
    }

    const aliceStack = makeSpatialStack(alice);
    const bobStack = makeSpatialStack(bob);

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'awareness-alice', alice, 'awareness-bob', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    await wait(15);

    // --- Alice's own, real WorldNavigationSession -----------------------
    const aliceSession = new WorldNavigationSession({
        registry, loadPublicationDocumentUseCase, worldLayoutProvider,
        discoveryProvider, loadDocumentUseCase,
        worldSpatialPresenceUseCase: aliceStack.spatialPresence
    });
    const captured = capturingWorldRenderSession();
    aliceSession._session = captured;
    // Alice stands at the world origin, facing +Z (heading 0) — see
    // tests/WorldViewLocationNavigation.test.js's own Section B for the
    // identical convention (facing +Z reads as heading 0).
    aliceSession._spatialCameraController = new SpatialCameraController(
        stubCameraRenderer({ position: { x: 0, y: 5, z: 0 }, target: { x: 0, y: 0, z: 10 } })
    );
    aliceSession._cameraFocusFrameSubscription = () => {};
    aliceSession._loadWorld(sharedWorld.id);
    aliceSession.enterWorldSpatialPresence(sharedWorld.id, {
        resolveDisplayName: (identityId) => (identityId === bob.identity.identityId ? 'Bob' : identityId)
    });

    const bobDeviceId = bob.identity.identityId; // DeviceAuthorizationPropagationUseCase resolves an own-identity device to its own identityId absent a device grant — matches WorldSpatialPresenceUseCase's own _handleIncoming() fallback.

    // --- 1. Bob enters, directly ahead of Alice and NEAR (8 units) ------
    bobStack.spatialPresence.enterWorld(sharedWorld.id, { position: { x: 0, z: 8 }, heading: 180 });
    await wait(20);
    let anchor = captured._anchors.get(bobDeviceId);
    assert(anchor, '40. flagship: Alice\'s session captured a WorldSpatialAnchor for Bob\'s device');
    assert(anchor.tier === WorldSpatialProximityTier.NEAR, '41. flagship: 8 units away derives NEAR');
    assert(anchor.presentationMode === WorldSpatialPresentationMode.MARKER_FULL, '42. flagship: NEAR and directly ahead derives MARKER_FULL');
    assert(anchor.activityLabel === 'Here', '43. flagship: no selection yet — the plain "Here" phrase, unchanged');

    // --- 2. Bob selects the House placement and starts BUILDING ---------
    bobStack.spatialPresence.updateSpatial(sharedWorld.id, {
        selection: WorldSpatialSelection.placement({ documentId: sharedWorld.id, placementId: placement.id }),
        activity: WorldSpatialActivity.BUILDING
    });
    await wait(15);
    anchor = captured._anchors.get(bobDeviceId);
    assert(anchor.contextualLabel === 'My House', '44. flagship: the remote placement selection resolves to the House\'s REAL saved title, through the SAME getSavedDocumentTitle() lookup a local inspector uses');
    assert(anchor.activityLabel === 'Building My House', '45. flagship: the composed activity label is "Building My House", not just "Building"');

    // --- 3. Bob moves to MID range, still directly ahead -----------------
    bobStack.spatialPresence.updateSpatial(sharedWorld.id, { position: { x: 0, z: 20 } });
    await wait(40); // clears the throttle window
    anchor = captured._anchors.get(bobDeviceId);
    assert(anchor.tier === WorldSpatialProximityTier.MID, '46. flagship: 20 units away derives MID');
    assert(anchor.presentationMode === WorldSpatialPresentationMode.MARKER_ABBREVIATED, '47. flagship: MID derives MARKER_ABBREVIATED');

    // --- 4. Bob moves FAR away, still directly ahead ---------------------
    bobStack.spatialPresence.updateSpatial(sharedWorld.id, { position: { x: 0, z: 50 } });
    await wait(40);
    anchor = captured._anchors.get(bobDeviceId);
    assert(anchor.tier === WorldSpatialProximityTier.FAR, '48. flagship: 50 units away derives FAR');
    assert(anchor.presentationMode === WorldSpatialPresentationMode.MARKER_ONLY, '49. flagship: FAR derives MARKER_ONLY — still a marker, just a quiet one');

    // --- 5. Bob moves close again but BEHIND Alice — outside her view cone
    bobStack.spatialPresence.updateSpatial(sharedWorld.id, { position: { x: 0, z: -8 } });
    await wait(40);
    anchor = captured._anchors.get(bobDeviceId);
    assert(anchor.tier === WorldSpatialProximityTier.NEAR, '50. flagship: 8 units away is NEAR by distance alone');
    assert(anchor.presentationMode === WorldSpatialPresentationMode.HIDDEN, '51. flagship: but directly BEHIND Alice\'s own camera heading — HIDDEN wins over proximity, no 3D marker at all');

    // --- 6. Bob returns to a followable, NEAR, in-view position ----------
    bobStack.spatialPresence.updateSpatial(sharedWorld.id, { position: { x: 30, z: 40 }, activity: WorldSpatialActivity.IDLE, selection: WorldSpatialSelection.none() });
    await wait(20);

    // --- 7. Follow: local camera navigation only, never a shared camera --
    const bobWorldBytesBeforeFollow = JSON.stringify(aliceSession.getDocument(sharedWorld.id).world.toJSON());
    const followed = aliceSession.focusCollaborator(bobDeviceId);
    assert(followed === true, '52. flagship: focusCollaborator() succeeds for a device with a known position');
    assert(aliceSession._activeCameraFocus !== null, '53. flagship: Follow schedules a real camera glide, exactly like focusLocation()');
    const { startedAt } = aliceSession._activeCameraFocus;
    aliceSession._tickCameraFocus(startedAt + 900);
    const finalFraming = aliceSession._spatialCameraController.getSpatialCameraState();
    const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, 30, 40);
    assert(Math.abs(finalFraming.target.x - 30) < 1e-9 && Math.abs(finalFraming.target.z - 40) < 1e-9,
        '54. flagship: the camera glides to a target exactly at Bob\'s own last-known position');
    assert(Math.abs(finalFraming.position.y - (groundY + 12)) < 1e-9,
        '55. flagship: the final camera offset matches the SAME LOCATION_FOCUS_OFFSET focusLocation() already uses — no second navigation formula');
    assert(JSON.stringify(aliceSession.getDocument(sharedWorld.id).world.toJSON()) === bobWorldBytesBeforeFollow,
        '56. flagship: Follow never mutates the World it navigates through — camera-only, exactly like every other focus call in this codebase');

    assert(aliceSession.focusCollaborator('not-a-real-device-id') === false, '57. flagship: an unknown deviceId is a clean no-op, never a throw');

    // --- 8. Disconnecting Bob removes his anchor entirely -----------------
    bobFromAlice.connection.close();
    await wait(20);
    assert(!captured._anchors.has(bobDeviceId), '58. flagship: disconnecting Bob removes his captured anchor — pruned exactly like the underlying 0.3.0 roster already is');

    // --- 9. Nothing here ever touched the World, its placement, or history
    const worldJsonAfter = JSON.stringify(sharedManager.document.toJSON());
    assert(worldJsonAfter === worldJsonBefore, '59. flagship: the shared World document is byte-identical before and after the entire scenario — spatial awareness is presentation, never content');
    const livePlacement = aliceSession.getDocument(sharedWorld.id).world.getStructurePlacement(placement.id);
    assert(livePlacement.position.x === 5 && livePlacement.position.z === 5, '60. flagship: the House placement\'s own position is completely unaffected by any anchor derivation or Follow navigation');
    const history = aliceSession._commandHistories && aliceSession._commandHistories.get(sharedWorld.id);
    assert(!history || history.canUndo() === false, '61. flagship: zero commands were ever executed — nothing here is a mutation path');
    assert(!(anchor.selection instanceof SpatialSelectionState), '62. flagship: reaffirmed one layer higher — an anchor\'s selection is never mistaken for local editing selection by the type system itself');

    console.log('✓ Section C: FLAGSHIP — real peer convergence, contextual labels resolved from the real saved House title, proximity/view-cone-driven presentation modes, Follow as pure local camera navigation, byte-identical World/placement/history throughout');
}

    console.log('\nAll Collaborative Spatial Awareness tests passed.');
}

await runTests();
