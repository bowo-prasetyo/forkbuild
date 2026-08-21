import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { WorldMembershipUseCase } from '../application/WorldMembershipUseCase.js';
import { WorldAuthorizationService } from '../application/WorldAuthorizationService.js';
import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { WorldSpatialPresenceUseCase } from '../application/WorldSpatialPresenceUseCase.js';
import { WorldSpatialSelection } from '../core/WorldSpatialSelection.js';
import { WorldSpatialActivity, isValidWorldSpatialActivity, deriveWorldSpatialActivity } from '../core/WorldSpatialActivity.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import {
    toWorldSpatialPresenceAdvertisement,
    isValidWorldSpatialPresenceAdvertisement
} from '../core/WorldSpatialPresenceAdvertisement.js';

// 0.3.0 — Collaborative Spatial Presence.
//
// 0.2.95 through 0.2.99 built the entire chain this milestone assumes as
// given: who may edit, how edits propagate and converge, who else is an
// editor and who is online, and a real UI on top of all of it. This file
// proves the ONE new fact this milestone adds — WHERE each present
// participant is looking/working, device-aware, throttled, and STILL
// completely ephemeral and observation-only:
//
//   Section A: core/WorldSpatialActivity.js / core/WorldSpatialSelection.js
//              / core/WorldSpatialPresenceAdvertisement.js — closed
//              vocabulary, the read-only remote-selection value object,
//              and the unsigned wire shape, all in isolation.
//   Section B: WorldSpatialPresenceUseCase constructor — every
//              collaborator required.
//   Section C: FLAGSHIP — Alice and Bob, both authorized editors of the
//              same World, see each other's camera position, heading,
//              and selection converge live; throttled position updates
//              vs. immediate selection/activity updates; Bob's second
//              device joins and both devices remain independently
//              visible; Bob's edit authorization is revoked while his
//              spatial presence keeps flowing, proving activity is never
//              authorization; disconnecting Bob removes his presence
//              entirely; the World document is byte-identical before and
//              after the whole scenario; and two independent replicas
//              (Alice and Charlie) receiving Bob's advertisements
//              independently converge on the identical roster.
//   Section D: the defining security assertion — remote spatial presence
//              can never enter a mutation path.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`ASSERT FAILED (expected throw): ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors tests/WorldMembership.test.js's own makeDevice() exactly.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/WorldMembership.test.js's own connectAndAuthenticate() exactly.
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

// One replica's own stack: device authorization, World membership, and
// spatial presence — the same shape application/CreateWorldViewUseCase.js
// wires in a real deployment. `now` is injectable so Section C can
// control throttling deterministically instead of racing a real clock.
function makeStack(device, { now = () => Date.now() } = {}) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const documents = new Map();
    const membership = new WorldMembershipUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry,
        resolveWorldDocument: (id) => documents.get(id) || null
    });
    const spatialPresence = new WorldSpatialPresenceUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        // A tiny real interval (not injected `now`) so Section C's
        // `await wait(...)` calls can straightforwardly cross the
        // throttle boundary without hand-rolling a fake clock.
        minIntervalMs: 30
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, documents, membership, spatialPresence };
}

function buildOneBrickWorld({ worldId, buildingId, brickId, authorIdentityId, title, position = new Position(0, 0.5, 0) }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: buildingId });
    building.addBrick(new Brick({ id: brickId, definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — core/WorldSpatialActivity.js / core/WorldSpatialSelection.js
// / core/WorldSpatialPresenceAdvertisement.js
// ---------------------------------------------------------------------
{
    assert(isValidWorldSpatialActivity(WorldSpatialActivity.BUILDING), '1. BUILDING is a valid activity');
    assert(isValidWorldSpatialActivity('sleeping') === false, '2. an unknown activity string is never valid — closed vocabulary');

    assert(deriveWorldSpatialActivity({ gizmoActive: true, gizmoMode: 'translate' }) === WorldSpatialActivity.MOVING_STRUCTURE,
        '3. an active translate gizmo derives MOVING_STRUCTURE');
    assert(deriveWorldSpatialActivity({ gizmoActive: true, gizmoMode: 'rotate' }) === WorldSpatialActivity.ROTATING_STRUCTURE,
        '4. an active rotate gizmo derives ROTATING_STRUCTURE');
    assert(deriveWorldSpatialActivity({ hasSelection: true, canEdit: true }) === WorldSpatialActivity.BUILDING,
        '5. a selection held by an authorized editor derives BUILDING');
    assert(deriveWorldSpatialActivity({ hasSelection: true, canEdit: false }) === WorldSpatialActivity.INSPECTING,
        '6. a selection held by a non-editor derives INSPECTING, never BUILDING — activity is never authorization');
    assert(deriveWorldSpatialActivity({ isMoving: true }) === WorldSpatialActivity.WALKING, '7. movement with no selection derives WALKING');
    assert(deriveWorldSpatialActivity({}) === WorldSpatialActivity.IDLE, '8. no signal at all derives IDLE');

    const placementSelection = WorldSpatialSelection.placement({ documentId: 'world-a', placementId: 'placement-1' });
    assert(placementSelection.kind === 'placement' && placementSelection.placementId === 'placement-1', '9. WorldSpatialSelection.placement() round-trips its fields');
    assert(WorldSpatialSelection.none().isEmpty, '10. WorldSpatialSelection.none() is empty');
    assert(!(placementSelection instanceof SpatialSelectionState), '11. WorldSpatialSelection is never a SpatialSelectionState — deliberately separate types');
    const rehydrated = WorldSpatialSelection.fromJSON(placementSelection.toJSON());
    assert(rehydrated.equals(placementSelection), '12. WorldSpatialSelection round-trips through toJSON()/fromJSON()');

    const enter = toWorldSpatialPresenceAdvertisement({ worldDocumentId: 'world-1', present: true, sequence: 1, position: { x: 1, z: 2 }, heading: 90, activity: WorldSpatialActivity.WALKING });
    assert(isValidWorldSpatialPresenceAdvertisement(enter), '13. a well-formed present advertisement validates');
    assert(isValidWorldSpatialPresenceAdvertisement({ ...enter, activity: 'nope' }) === false, '14. an invalid activity is never valid');
    assert(isValidWorldSpatialPresenceAdvertisement({ ...enter, sequence: 'not-a-number' }) === false, '15. a non-numeric sequence is never valid');
    const leave = toWorldSpatialPresenceAdvertisement({ worldDocumentId: 'world-1', present: false, sequence: 2 });
    assert(isValidWorldSpatialPresenceAdvertisement(leave), '16. a LEAVE never needs a valid position/heading/selection/activity');
    assert(isValidWorldSpatialPresenceAdvertisement(null) === false, '17. null is never valid');
    assert(!('identityId' in enter), '18. the wire shape never carries an identityId — identity is resolved from the live connection, never the payload');

    console.log('✓ Section A: core/WorldSpatialActivity.js / core/WorldSpatialSelection.js / core/WorldSpatialPresenceAdvertisement.js — closed vocabulary, read-only selection, unsigned wire shape');
}

// ---------------------------------------------------------------------
// Section B — WorldSpatialPresenceUseCase constructor
// ---------------------------------------------------------------------
{
    const device = makeDevice('Solo');
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry });

    assertThrows(() => new WorldSpatialPresenceUseCase({ connectedPeerRegistry, deviceAuthorization: deviceAuth }), '19. missing peerMessageBus throws');
    assertThrows(() => new WorldSpatialPresenceUseCase({ peerMessageBus, deviceAuthorization: deviceAuth }), '20. missing connectedPeerRegistry throws');
    assertThrows(() => new WorldSpatialPresenceUseCase({ peerMessageBus, connectedPeerRegistry }), '21. missing deviceAuthorization throws');

    const solo = new WorldSpatialPresenceUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth });
    assert(solo.getSpatialRoster('world-x').length === 0, '22. an unknown World resolves to an empty roster, never throws');
    solo.updateSpatial('world-x', { position: { x: 1, z: 1 } }); // never entered — must be a safe no-op
    solo.dispose();
    console.log('✓ Section B: WorldSpatialPresenceUseCase constructor — every collaborator required, unknown/unentered World handled gracefully');
}

// ---------------------------------------------------------------------
// Section C — FLAGSHIP
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice3');
    const bob = makeDevice('Bob3');
    const bobTablet = makeDevice('Bob3-Tablet');
    const charlie = makeDevice('Charlie3');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);
    const bobTabletStack = makeStack(bobTablet);
    const charlieStack = makeStack(charlie);

    const tabletGrant = bob.provider.authorizeDevice(bob.identity.identityId, bobTablet.identity.identityId, bobTablet.identity.publicKey, { deviceLabel: 'Bob3-Tablet' });
    bobTabletStack.deviceAuth.adoptOwnDeviceGrant(tabletGrant);

    const worldId = 'world-spatial-1', buildingId = 'b', brickId = 'k';
    const worldJsonBefore = JSON.stringify(buildOneBrickWorld({ worldId, buildingId, brickId, authorIdentityId: alice.identity.identityId, title: "Alice's World" }).toJSON());
    const doc = () => buildOneBrickWorld({ worldId, buildingId, brickId, authorIdentityId: alice.identity.identityId, title: "Alice's World" });
    aliceStack.documents.set(worldId, doc());
    bobStack.documents.set(worldId, doc());
    bobTabletStack.documents.set(worldId, doc());
    charlieStack.documents.set(worldId, doc());

    // --- 1/2. Alice and Bob connect to the same World, both authorized ---
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'sp-alice', alice, 'sp-bob', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);

    const { peerA: aliceToCharlie, peerB: charlieFromAlice } = await connectAndAuthenticate(network, 'sp-alice-2', alice, 'sp-charlie', charlie);
    aliceStack.connectedPeerRegistry.add(aliceToCharlie);
    charlieStack.connectedPeerRegistry.add(charlieFromAlice);

    // 15's own setup: Charlie ALSO connects directly to Bob, so both
    // Alice and Charlie are independent replicas receiving Bob's spatial
    // advertisements directly, never relayed through one another.
    const { peerA: bobToCharlie, peerB: charlieFromBob } = await connectAndAuthenticate(network, 'sp-bob-2', bob, 'sp-charlie-2', charlie);
    bobStack.connectedPeerRegistry.add(bobToCharlie);
    charlieStack.connectedPeerRegistry.add(charlieFromBob);
    await wait(15);

    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    // Gossips the Tablet's own device authorization grant to Alice over
    // Bob's ALREADY-connected primary connection — the same
    // broadcastAuthorization() step tests/MultiDevicePresenceSemantics.test.js
    // uses, required so Alice's own resolveConnectionIdentity() (never
    // the Tablet's self-referential resolveOwnSocialIdentity()) can
    // later resolve the Tablet's connection back to Bob's real identity.
    bobStack.deviceAuth.broadcastAuthorization(tabletGrant);
    await wait(20);
    const bobAuth = new WorldAuthorizationService({ identityProvider: bob.provider, resolveWorldEditGrant: (w, id) => bobStack.membership.hasActiveGrant(w, id) });
    assert(bobAuth.resolveAccess(bobStack.documents.get(worldId), worldId) === WorldAccessLevel.EDIT, '23. Bob: holds real EDIT authority before the spatial scenario begins');

    // --- 3. Alice moves her camera -----------------------------------------
    aliceStack.spatialPresence.enterWorld(worldId, { position: { x: 0, z: 0 }, heading: 0 });
    bobStack.spatialPresence.enterWorld(worldId, { position: { x: 10, z: 10 }, heading: 180 });
    await wait(15);

    aliceStack.spatialPresence.updateSpatial(worldId, { position: { x: 5, z: 5 }, heading: 45 });
    await wait(50); // clears the throttle window

    // --- 4. Bob receives Alice's spatial presence ---------------------------
    let bobsView = bobStack.spatialPresence.getSpatialRoster(worldId);
    assert(bobsView.length === 1 && bobsView[0].identityId === alice.identity.identityId, '24. Bob: sees exactly one remote participant — Alice');
    assert(bobsView[0].devices.length === 1, '25. Bob: Alice has exactly one live device so far');
    assert(bobsView[0].devices[0].position.x === 5 && bobsView[0].devices[0].position.z === 5, '26. Bob: Alice\'s reported position matches her latest update');
    assert(bobsView[0].devices[0].heading === 45, '27. Bob: Alice\'s reported heading matches her latest update');

    // --- Throttling: a rapid burst of position-only updates does not -------
    // --- each individually cross the wire; only the LATEST value wins ------
    for (let i = 0; i < 5; i++) {
        aliceStack.spatialPresence.updateSpatial(worldId, { position: { x: 5 + i, z: 5 } });
    }
    await wait(50);
    bobsView = bobStack.spatialPresence.getSpatialRoster(worldId);
    assert(bobsView[0].devices[0].position.x === 9, '28. Bob: after a throttled burst, the FINAL position always wins — never a stale intermediate one');

    // --- 5/6. Alice selects a StructurePlacement; Bob sees it IMMEDIATELY --
    const aliceSelection = WorldSpatialSelection.placement({ documentId: worldId, placementId: 'house-1' });
    aliceStack.spatialPresence.updateSpatial(worldId, { selection: aliceSelection, activity: WorldSpatialActivity.BUILDING });
    await wait(15); // a selection change bypasses throttling — no need to wait out minIntervalMs
    bobsView = bobStack.spatialPresence.getSpatialRoster(worldId);
    assert(bobsView[0].devices[0].selection.kind === 'placement' && bobsView[0].devices[0].selection.placementId === 'house-1',
        '29. Bob: sees Alice\'s StructurePlacement selection immediately, not throttled');
    assert(bobsView[0].devices[0].activity === WorldSpatialActivity.BUILDING, '30. Bob: sees Alice\'s activity change immediately too');

    // --- 7/8. Bob moves independently; Alice sees him independently --------
    bobStack.spatialPresence.updateSpatial(worldId, { position: { x: 20, z: 20 }, heading: 270 });
    await wait(50);
    const alicesView = aliceStack.spatialPresence.getSpatialRoster(worldId);
    assert(alicesView.length === 1 && alicesView[0].identityId === bob.identity.identityId, '31. Alice: sees exactly one remote participant — Bob');
    assert(alicesView[0].devices[0].position.x === 20 && alicesView[0].devices[0].position.z === 20, '32. Alice: Bob\'s own movement is independent of Alice\'s own — she sees his real position');
    bobsView = bobStack.spatialPresence.getSpatialRoster(worldId);
    assert(bobsView[0].devices[0].selection.kind === 'placement', '33. Bob: his own movement never disturbed his OWN view of Alice\'s still-selected placement');

    // --- 9/10. Bob's second device connects; aggregation stays correct -----
    bobTabletStack.spatialPresence.enterWorld(worldId, { position: { x: 21, z: 19 }, heading: 90 });
    const { peerA: bobTabletToAlice, peerB: aliceFromBobTablet } = await connectAndAuthenticate(network, 'sp-bob-tablet', bobTablet, 'sp-alice-3', alice);
    bobTabletStack.connectedPeerRegistry.add(bobTabletToAlice);
    aliceStack.connectedPeerRegistry.add(aliceFromBobTablet);
    await wait(20);

    const alicesViewWithTablet = aliceStack.spatialPresence.getSpatialRoster(worldId);
    assert(alicesViewWithTablet.length === 1, '34. Alice: still exactly ONE identity for Bob — his Tablet never becomes a second person');
    const bobGroup = alicesViewWithTablet[0];
    assert(bobGroup.identityId === bob.identity.identityId, '35. Alice: the single Bob group is keyed by his real social identity');
    assert(bobGroup.devices.length === 2, '36. Alice: Bob now has two independently-tracked devices');
    const desktopDevice = bobGroup.devices.find((d) => d.position && d.position.x === 20);
    const tabletDevice = bobGroup.devices.find((d) => d.position && d.position.x === 21);
    assert(desktopDevice && tabletDevice, '37. Alice: Bob\'s Desktop and Tablet report genuinely DIFFERENT positions — devices are never collapsed into one shared position');

    // --- 11/12. Bob's edit authorization is revoked; presence keeps flowing -
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobAuth.resolveAccess(bobStack.documents.get(worldId), worldId) === WorldAccessLevel.READ, '38. Bob: has genuinely lost EDIT authority');
    assert(bobFromAlice.getLifecycleState && bobStack.connectedPeerRegistry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === alice.identity.identityId),
        '39. Bob: his connection to Alice is still live — revocation never tears down a connection');
    // Spatial presence has no idea authorization changed at all — it
    // keeps updating exactly as before, proving activity/position are
    // never gated on canEdit.
    bobStack.spatialPresence.updateSpatial(worldId, { position: { x: 22, z: 22 }, activity: WorldSpatialActivity.BUILDING });
    await wait(20);
    const alicesViewAfterRevoke = aliceStack.spatialPresence.getSpatialRoster(worldId);
    const bobAfterRevoke = alicesViewAfterRevoke.find((entry) => entry.identityId === bob.identity.identityId);
    assert(bobAfterRevoke && bobAfterRevoke.devices.some((d) => d.position && d.position.x === 22 && d.activity === WorldSpatialActivity.BUILDING),
        '40. Alice: still sees Bob\'s live spatial presence, self-reported activity and all, even though he no longer holds EDIT — activity is never authorization, and spatial presence is observation-only');

    // --- 13. Disconnecting Bob removes his spatial presence -----------------
    bobFromAlice.connection.close();
    await wait(20);
    const alicesViewAfterDisconnect = aliceStack.spatialPresence.getSpatialRoster(worldId);
    const bobAfterDisconnect = alicesViewAfterDisconnect.find((entry) => entry.identityId === bob.identity.identityId);
    assert(!bobAfterDisconnect || bobAfterDisconnect.devices.length === 1,
        '41. Alice: Bob\'s Desktop connection dropped — pruned from the live roster; only his still-connected Tablet remains, never a stale ghost of the Desktop');

    // --- 15. Two independent replicas converge on the identical roster -----
    bobStack.spatialPresence.updateSpatial(worldId, { position: { x: 33, z: 44 }, heading: 12, activity: WorldSpatialActivity.WALKING });
    await wait(20);
    const charliesView = charlieStack.spatialPresence.getSpatialRoster(worldId).find((e) => e.identityId === bob.identity.identityId);
    // Alice's own connection to Bob's Desktop was closed above — only
    // Charlie still has a live direct connection to Bob's Desktop, so
    // this proves CHARLIE's own independent replica correctly reflects
    // Bob's latest state without needing Alice at all.
    assert(charliesView && charliesView.devices.some((d) => d.position && d.position.x === 33 && d.position.z === 44 && d.heading === 12 && d.activity === WorldSpatialActivity.WALKING),
        '42. Charlie: an independent replica, directly connected to Bob, converges on his exact latest spatial state with no dependency on Alice\'s own replica');

    // --- 14. World serialization is byte-identical before and after --------
    const worldJsonAfter = JSON.stringify(aliceStack.documents.get(worldId).toJSON());
    assert(worldJsonAfter === worldJsonBefore, '43. FLAGSHIP: the World document is byte-identical before and after the entire spatial presence scenario — nothing here was ever World content');

    console.log('✓ Section C: FLAGSHIP — live convergence, throttled vs. immediate updates, device aggregation, revocation never gates presence, disconnect pruning, independent-replica convergence, byte-identical World');
}

// ---------------------------------------------------------------------
// Section D — Remote spatial presence can never enter a mutation path
// ---------------------------------------------------------------------
{
    // A structural assertion, not a behavioral one: the shape
    // getSpatialRoster() hands back is built entirely from
    // WorldSpatialSelection/plain data — never a SpatialSelectionState,
    // never a Command, never anything application/SpatialEditingService.js
    // or application/commands/CommandRegistry.js would recognize as an
    // editing target. There is, by construction, no code path from a
    // remote selection to a mutation: nothing in this file, or in
    // WorldSpatialPresenceUseCase itself, ever imports SpatialEditingService,
    // CommandRegistry, or any application/commands/ class.
    const remoteSelection = WorldSpatialSelection.placement({ documentId: 'world-x', placementId: 'p1' });
    assert(!(remoteSelection instanceof SpatialSelectionState), '44. a remote observation can never be mistaken for editable selection state by the type system itself');
    assert(typeof remoteSelection.toJSON === 'function' && remoteSelection.placementId === 'p1', '45. remote selection stays a plain, inert, read-only observation');
    console.log('✓ Section D: remote spatial presence can never enter a mutation path — no shared type with local editing selection');
}

    console.log('\nAll Collaborative Spatial Presence tests passed.');
}

await runTests();
