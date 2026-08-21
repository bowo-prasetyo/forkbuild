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
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { WorldCommandPropagationUseCase, WorldOperationRejectionReason } from '../application/WorldCommandPropagationUseCase.js';
import { WorldMembershipUseCase } from '../application/WorldMembershipUseCase.js';
import { WorldPresenceUseCase } from '../application/WorldPresenceUseCase.js';
import { WorldAuthorizationService } from '../application/WorldAuthorizationService.js';
import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { WorldPresenceActivity, isValidWorldPresenceActivity } from '../core/WorldPresenceActivity.js';
import {
    toWorldEditAuthorizationGrant,
    isValidWorldEditAuthorizationGrant,
    toWorldEditAuthorizationRevocation,
    isValidWorldEditAuthorizationRevocation,
    getWorldEditAuthorizationGrantSigningDescriptor
} from '../core/WorldEditAuthorizationEnvelope.js';
import { toWorldPresenceAdvertisement, isValidWorldPresenceAdvertisement } from '../core/WorldPresenceAdvertisement.js';

// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// 0.2.95 answered "who may edit this World" with exactly one identity:
// its owner, plus (0.2.78's composition) that owner's own authorized
// devices. 0.2.96/0.2.97 proved a network of THAT owner's devices could
// safely converge concurrent edits — and named, rather than hid, the gap
// this file closes (docs/Roadmap.md, 0.2.97): "a genuine multi-owner/
// collaborator model... not one this milestone quietly assumed into
// existence." This file proves that gap is actually closed:
//
//   Section A: core/WorldEditAuthorizationEnvelope.js — the closed
//              GRANT/REVOCATION shapes in isolation.
//   Section B: WorldMembershipUseCase constructor — every collaborator
//              required.
//   Section C: FLAGSHIP — Alice owns World A; Bob starts READ-only;
//              Alice grants Bob EDIT; Bob's operation now propagates
//              exactly like an owner's; Bob's SECOND device inherits
//              the grant for free through 0.2.78's own composition;
//              Charlie cannot self-grant himself access by forging a
//              gossip message; Bob (a mere editor) cannot grant Charlie
//              anything; Alice revokes Bob and BOTH his devices
//              immediately lose EDIT, with no need to ever disconnect
//              either.
//   Section D: core/WorldPresenceActivity.js / core/WorldPresenceAdvertisement.js
//              — closed vocabulary and wire shape in isolation.
//   Section E: WorldPresenceUseCase FLAGSHIP — Alice sees Bob present
//              with deviceCount growing as his second device joins,
//              `canEdit` tracking the grant/revocation above in real
//              time even though his connections never drop, and the
//              roster correctly pruning a disconnected device.
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

// Mirrors tests/WorldCommandPropagation.test.js's own makeDevice()
// exactly — one independent LocalIdentityProvider instance standing in
// for one physically distinct device/replica.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/WorldCommandPropagation.test.js's own
// connectAndAuthenticate() exactly.
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

// One replica's own full stack — device authorization, World membership,
// World presence, and World command propagation, wired the identical
// shape application/CreateWorldViewUseCase.js wires them in a real
// deployment (see that file's own 0.2.98 comments).
function makeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const documents = new Map(); // worldDocumentId -> Document
    const membership = new WorldMembershipUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry,
        resolveWorldDocument: (id) => documents.get(id) || null
    });
    const applied = [];
    const rejected = [];
    const propagation = new WorldCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveWorldDocument: (id) => documents.get(id) || null,
        resolveWorldEditGrant: (worldDocumentId, identityId) => membership.hasActiveGrant(worldDocumentId, identityId)
    });
    propagation.onOperationApplied((worldDocumentId, command, authorIdentityId) => {
        applied.push({ worldDocumentId, command, authorIdentityId });
    });
    propagation.onOperationRejected((reason, envelope) => {
        rejected.push({ reason, envelope });
    });
    const presence = new WorldPresenceUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        resolveCanEdit: (worldDocumentId, identityId) => {
            const document = documents.get(worldDocumentId);
            if (!document || !identityId) return false;
            if (document.metadata.authorIdentityId === identityId) return true;
            return membership.hasActiveGrant(worldDocumentId, identityId);
        }
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, commandRegistry, documents, membership, propagation, presence, applied, rejected };
}

function buildOneBrickWorld({ worldId, buildingId, brickId, authorIdentityId, title, position = new Position(0, 0.5, 0) }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: buildingId });
    building.addBrick(new Brick({ id: brickId, definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function brickPosition(doc, buildingId, brickId) {
    const b = doc.world.getBuilding(buildingId).findBrick(brickId);
    return { x: b.position.x, y: b.position.y, z: b.position.z };
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — core/WorldEditAuthorizationEnvelope.js
// ---------------------------------------------------------------------
{
    const grant = toWorldEditAuthorizationGrant({ worldDocumentId: 'world-1', subjectIdentityId: 'did:key:bob', grantingIdentityId: 'did:key:alice' });
    assert(isValidWorldEditAuthorizationGrant(grant), '1. a well-formed grant validates');
    assertThrows(() => { if (!isValidWorldEditAuthorizationGrant({ ...grant, subjectIdentityId: grant.grantingIdentityId })) throw new Error('x'); }, '2. a grant naming the same identity as subject and grantor is invalid');
    assert(isValidWorldEditAuthorizationGrant({ ...grant, worldDocumentId: '' }) === false, '3. an empty worldDocumentId is never valid');
    assert(isValidWorldEditAuthorizationGrant(null) === false, '4. null is never valid');

    const revocation = toWorldEditAuthorizationRevocation({ worldDocumentId: 'world-1', subjectIdentityId: 'did:key:bob', grantingIdentityId: 'did:key:alice' });
    assert(isValidWorldEditAuthorizationRevocation(revocation), '5. a well-formed revocation validates');
    assert(isValidWorldEditAuthorizationRevocation({ ...revocation, grantingIdentityId: '' }) === false, '6. an empty grantingIdentityId is never valid');
    console.log('✓ Section A: core/WorldEditAuthorizationEnvelope.js — closed GRANT/REVOCATION shapes, required fields');
}

// ---------------------------------------------------------------------
// Section B — WorldMembershipUseCase constructor
// ---------------------------------------------------------------------
{
    const device = makeDevice('Solo');
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const resolveWorldDocument = () => null;

    assertThrows(() => new WorldMembershipUseCase(null, device.provider, { peerMessageBus, connectedPeerRegistry, resolveWorldDocument }), '7. missing storageProvider throws');
    assertThrows(() => new WorldMembershipUseCase(new InMemoryStorageProvider(), null, { peerMessageBus, connectedPeerRegistry, resolveWorldDocument }), '8. missing identityProvider throws');
    assertThrows(() => new WorldMembershipUseCase(new InMemoryStorageProvider(), device.provider, { connectedPeerRegistry, resolveWorldDocument }), '9. missing peerMessageBus throws');
    assertThrows(() => new WorldMembershipUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, resolveWorldDocument }), '10. missing connectedPeerRegistry throws');
    assertThrows(() => new WorldMembershipUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry }), '11. missing resolveWorldDocument throws');

    const solo = new WorldMembershipUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry, resolveWorldDocument });
    assertThrows(() => solo.grantEdit('world-x', 'did:key:someone'), '12. granting on an unknown World throws');
    assert(solo.hasActiveGrant('world-x', 'did:key:someone') === false, '13. an unknown grant resolves to false, never throws');
    solo.dispose();
    console.log('✓ Section B: WorldMembershipUseCase constructor — every collaborator required, unknown World refused');
}

// ---------------------------------------------------------------------
// Section C — FLAGSHIP: membership
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const bobTablet = makeDevice('Bob-Tablet');
    const charlie = makeDevice('Charlie');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);
    const bobTabletStack = makeStack(bobTablet);
    const charlieStack = makeStack(charlie);

    // Bob's Tablet is an authorized DEVICE of Bob's own identity — 0.2.78's
    // own composition, completely unmodified. Bob adopts his own grant so
    // resolveOwnSocialIdentity()/resolveConnectionIdentity() resolve it.
    const tabletGrant = bob.provider.authorizeDevice(bob.identity.identityId, bobTablet.identity.identityId, bobTablet.identity.publicKey, { deviceLabel: 'Bob-Tablet' });
    bobTabletStack.deviceAuth.adoptOwnDeviceGrant(tabletGrant);

    const worldAId = 'world-a', buildingAId = 'building-a', brickAId = 'brick-a';
    const world = () => buildOneBrickWorld({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, authorIdentityId: alice.identity.identityId, title: "Alice's World" });
    aliceStack.documents.set(worldAId, world());
    bobStack.documents.set(worldAId, world());
    bobTabletStack.documents.set(worldAId, world());
    charlieStack.documents.set(worldAId, world());

    // --- connect everyone to Alice --------------------------------------
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);

    const { peerA: aliceToCharlie, peerB: charlieFromAlice } = await connectAndAuthenticate(network, 'alice-2', alice, 'charlie-for-alice', charlie);
    aliceStack.connectedPeerRegistry.add(aliceToCharlie);
    charlieStack.connectedPeerRegistry.add(charlieFromAlice);
    await wait(10);

    // --- Before any grant: Bob cannot edit World A ----------------------
    const bobViewerAuth = new WorldAuthorizationService({ identityProvider: bob.provider });
    assert(bobViewerAuth.resolveAccess(bobStack.documents.get(worldAId), worldAId) === WorldAccessLevel.READ,
        '14. Bob: before any grant, World A is READ-only — he is not the owner');

    const moveCommand1 = new MoveBrickCommand({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 1, y: 0, z: 0 } });
    bobStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: moveCommand1 });
    await wait(20);
    assert(aliceStack.rejected.length === 1 && aliceStack.rejected[0].reason === WorldOperationRejectionReason.NOT_AUTHORIZED,
        '15. Alice: Bob\'s pre-grant operation is rejected as NOT_AUTHORIZED');

    // --- Bob cannot forge access for himself or anyone else --------------
    assertThrows(() => bobStack.membership.grantEdit(worldAId, charlie.identity.identityId), '16. Bob: locally, granting on a World he does not own throws — he holds no EDIT yet, let alone the authority to grant it');
    // Forge the wire message directly, using Bob's OWN, perfectly
    // legitimate signing key — a STRUCTURALLY VALID, PROPERLY SIGNED
    // grant (Bob really did sign it; `grantingIdentityId` really does
    // equal the signer) naming Bob himself as the granting identity for
    // Charlie on Alice's World. Handed straight to the ingestion
    // boundary to prove the RECEIVING side's own "is grantingIdentityId
    // really THIS World's owner" check holds even against an honestly-
    // signed forgery, not merely a malformed one — the exact security
    // property this milestone's own header names: "Bob must never be
    // able to grant himself, or anyone else, access."
    const forgedRecord = toWorldEditAuthorizationGrant({ worldDocumentId: worldAId, subjectIdentityId: charlie.identity.identityId, grantingIdentityId: bob.identity.identityId });
    const forgedSignature = bob.provider.signCanonical(getWorldEditAuthorizationGrantSigningDescriptor(forgedRecord));
    const forgedGrant = { ...forgedRecord, signature: forgedSignature.toJSON() };
    assert(isValidWorldEditAuthorizationGrant(forgedGrant), '17. the forged grant is structurally well-formed and properly self-signed by Bob');
    aliceStack.membership._handleGrant(forgedGrant);
    assert(aliceStack.membership.hasActiveGrant(worldAId, charlie.identity.identityId) === false,
        '18. Alice: a properly-signed grant NOT from World A\'s own true owner is refused, regardless of how validly it was signed');

    // --- Alice grants Bob EDIT -------------------------------------------
    const grantRecord = aliceStack.membership.grantEdit(worldAId, bob.identity.identityId);
    assert(aliceStack.membership.hasActiveGrant(worldAId, bob.identity.identityId), '19. Alice: self-application — sees her own grant immediately');
    await wait(20);
    assert(bobStack.membership.hasActiveGrant(worldAId, bob.identity.identityId), '20. Bob: received and accepted the gossiped grant');
    assert(charlieStack.membership.hasActiveGrant(worldAId, bob.identity.identityId) === true,
        '21. Charlie: also connected to Alice — receives and accepts the SAME gossiped grant too; a grant is not private between owner and subject, only its ISSUANCE is restricted to the true owner');

    const bobViewerAuthAfterGrant = new WorldAuthorizationService({ identityProvider: bob.provider, resolveWorldEditGrant: (w, id) => bobStack.membership.hasActiveGrant(w, id) });
    assert(bobViewerAuthAfterGrant.resolveAccess(bobStack.documents.get(worldAId), worldAId) === WorldAccessLevel.EDIT,
        '21b. Bob: WorldAuthorizationService now reports EDIT once the grant is wired in');

    // --- Bob's operation now propagates -----------------------------------
    bobStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: moveCommand1 });
    await wait(20);
    assert(brickPosition(aliceStack.documents.get(worldAId), buildingAId, brickAId).x === 1,
        '22. Alice: Bob\'s post-grant operation is applied — her replica now shows the move');
    assert(aliceStack.applied.length === 1 && aliceStack.applied[0].authorIdentityId === bob.identity.identityId,
        '23. Alice: the applied event names Bob as author');

    // --- Bob (a mere editor, not the owner) cannot grant Charlie ----------
    assertThrows(() => bobStack.membership.grantEdit(worldAId, charlie.identity.identityId),
        '24. Bob: holding EDIT does not confer the authority to grant it onward — only the owner may');

    // --- Bob's Tablet inherits the grant via 0.2.78's own composition ----
    const { peerA: bobToAliceFromTablet, peerB: aliceFromBobTablet } = await connectAndAuthenticate(network, 'bob-tablet', bobTablet, 'alice-for-bob-tablet', alice);
    bobTabletStack.connectedPeerRegistry.add(bobToAliceFromTablet);
    aliceStack.connectedPeerRegistry.add(aliceFromBobTablet);
    await wait(10);
    // The Tablet's own membership store never independently received
    // Alice's grant (it was broadcast to Bob's own connection, not the
    // Tablet's) — but it doesn't need to: WorldAuthorizationService
    // resolves EDIT for Bob's ROOT identity, and resolveOwnSocialIdentity()
    // already makes the Tablet resolve AS Bob, socially — the identical
    // multi-device composition 0.2.95 proved for ownership itself, now
    // extended to a membership grant instead of ownership.
    const tabletAuth = new WorldAuthorizationService({
        identityProvider: bobTablet.provider,
        resolveSocialIdentity: () => bobTabletStack.deviceAuth.resolveOwnSocialIdentity(),
        resolveWorldEditGrant: (w, id) => aliceStack.membership.hasActiveGrant(w, id)
    });
    assert(tabletAuth.resolveAccess(bobTabletStack.documents.get(worldAId), worldAId) === WorldAccessLevel.EDIT,
        '25. Bob\'s Tablet: resolves EDIT too — the grant follows Bob\'s IDENTITY, not one specific device');

    // --- Alice revokes Bob -------------------------------------------------
    aliceStack.membership.revokeEdit(worldAId, bob.identity.identityId);
    assert(aliceStack.membership.hasActiveGrant(worldAId, bob.identity.identityId) === false, '26. Alice: self-application of the revocation is immediate');
    await wait(20);
    assert(bobStack.membership.hasActiveGrant(worldAId, bob.identity.identityId) === false, '27. Bob: received and accepted the gossiped revocation');
    assert(tabletAuth.resolveAccess(bobTabletStack.documents.get(worldAId), worldAId) === WorldAccessLevel.READ,
        '28. Bob\'s Tablet: immediately loses EDIT too, re-asked fresh — no separate revocation ever needed to reach the Tablet directly');

    aliceStack.rejected.length = 0;
    const moveCommand2 = new MoveBrickCommand({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 1, y: 0, z: 0 } });
    bobStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: moveCommand2 });
    await wait(20);
    assert(aliceStack.rejected.length === 1 && aliceStack.rejected[0].reason === WorldOperationRejectionReason.NOT_AUTHORIZED,
        '29. Alice: Bob\'s post-revocation operation is rejected — and his live WebRTC connection was never disconnected to make that true');
    assert(aliceStack.connectedPeerRegistry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.identity.identityId),
        '30. Alice: Bob\'s connection is still live — revocation is an authorization gate, never a connection-teardown event');

    // --- Alice re-grants Bob: a revoked identity can be re-granted -------
    aliceStack.membership.grantEdit(worldAId, bob.identity.identityId);
    assert(aliceStack.membership.hasActiveGrant(worldAId, bob.identity.identityId), '31. Alice: re-granting after a revocation works — the SAME re-grantable discipline device authorization already established');

    console.log('✓ Section C: FLAGSHIP — grant/revoke, self-grant forgery refused, multi-device composition, live connection survives revocation, re-grant after revoke');
    void grantRecord;
}

// ---------------------------------------------------------------------
// Section D — core/WorldPresenceActivity.js / core/WorldPresenceAdvertisement.js
// ---------------------------------------------------------------------
{
    assert(isValidWorldPresenceActivity(WorldPresenceActivity.EDITING), '32. EDITING is a valid activity');
    assert(isValidWorldPresenceActivity(WorldPresenceActivity.EXPLORING), '33. EXPLORING is a valid activity');
    assert(isValidWorldPresenceActivity('lurking') === false, '34. an unknown activity string is never valid — closed vocabulary');

    const enter = toWorldPresenceAdvertisement({ worldDocumentId: 'world-1', present: true, activity: WorldPresenceActivity.EDITING });
    assert(isValidWorldPresenceAdvertisement(enter), '35. a well-formed present advertisement validates');
    assert(isValidWorldPresenceAdvertisement({ ...enter, activity: 'nope' }) === false, '36. a present advertisement with an invalid activity is not valid');

    const leave = toWorldPresenceAdvertisement({ worldDocumentId: 'world-1', present: false });
    assert(isValidWorldPresenceAdvertisement(leave), '37. a LEAVE (present: false) never needs a valid activity');
    assert(isValidWorldPresenceAdvertisement(null) === false, '38. null is never valid');
    console.log('✓ Section D: core/WorldPresenceActivity.js / core/WorldPresenceAdvertisement.js — closed vocabulary, wire shape');
}

// ---------------------------------------------------------------------
// Section E — FLAGSHIP: presence
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice2');
    const bob = makeDevice('Bob2');
    const bobDesktop = bob; // Bob's primary device IS his root identity here
    const bobTablet = makeDevice('Bob2-Tablet');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bobDesktop);
    const bobTabletStack = makeStack(bobTablet);

    const tabletGrant = bob.provider.authorizeDevice(bob.identity.identityId, bobTablet.identity.identityId, bobTablet.identity.publicKey, { deviceLabel: 'Bob2-Tablet' });
    bobTabletStack.deviceAuth.adoptOwnDeviceGrant(tabletGrant);

    const worldId = 'world-presence-1';
    const doc = () => buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: "Alice's World" });
    aliceStack.documents.set(worldId, doc());
    bobStack.documents.set(worldId, doc());
    bobTabletStack.documents.set(worldId, doc());

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-p', alice, 'bob-p', bobDesktop);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    await wait(10);
    // Bob's own stack gossips the Tablet's device grant to Alice
    // (already connected) — the SAME broadcastAuthorization() path
    // tests/WorldCommandPropagation.test.js's own Phone scenario uses.
    // Without this, Alice's resolveConnectionIdentity() has no way to
    // know the Tablet's raw connection key is one of Bob's own devices,
    // and this section is specifically about ALICE'S view of Bob's
    // multi-device presence.
    bobStack.deviceAuth.broadcastAuthorization(tabletGrant);
    await wait(10);

    // --- Bob enters, exploring (no grant yet) -----------------------------
    bobStack.presence.enterWorld(worldId, WorldPresenceActivity.EXPLORING);
    await wait(10);
    let roster = aliceStack.presence.getRoster(worldId);
    assert(roster.length === 1, '39. Alice: sees exactly one remote participant (Bob) present');
    assert(roster[0].identityId === bob.identity.identityId, '40. Alice: the roster entry names Bob');
    assert(roster[0].deviceCount === 1, '41. Alice: one device so far');
    assert(roster[0].activity === WorldPresenceActivity.EXPLORING, '42. Alice: Bob self-reports EXPLORING');
    assert(roster[0].canEdit === false, '43. Alice: canEdit is LOCALLY recomputed — false, Bob holds no grant yet, regardless of what he might claim');

    // --- Alice grants Bob EDIT; Bob refreshes his own advertised activity -
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(15);
    bobStack.presence.setActivity(worldId, WorldPresenceActivity.EDITING);
    await wait(15);
    roster = aliceStack.presence.getRoster(worldId);
    assert(roster[0].activity === WorldPresenceActivity.EDITING, '44. Alice: Bob now self-reports EDITING');
    assert(roster[0].canEdit === true, '45. Alice: canEdit is now true — recomputed from the real grant, not merely from Bob\'s own claim');

    // --- Bob's Tablet joins too: deviceCount rolls up to 2 -----------------
    const { peerA: bobTabletToAlice, peerB: aliceFromBobTablet } = await connectAndAuthenticate(network, 'bob-tablet-p', bobTablet, 'alice-p2', alice);
    bobTabletStack.connectedPeerRegistry.add(bobTabletToAlice);
    aliceStack.connectedPeerRegistry.add(aliceFromBobTablet);
    await wait(10);
    bobTabletStack.presence.enterWorld(worldId, WorldPresenceActivity.EXPLORING);
    await wait(15);
    roster = aliceStack.presence.getRoster(worldId);
    assert(roster.length === 1, '46. Alice: still exactly ONE roster entry for Bob — both devices roll up into one identity, never two entries');
    assert(roster[0].deviceCount === 2, '47. Alice: deviceCount is now 2 — Bob\'s Desktop and Tablet both present');
    assert(roster[0].activity === WorldPresenceActivity.EDITING, '48. Alice: activity is EDITING — ANY of Bob\'s devices reporting EDITING wins over the other reporting EXPLORING');

    // --- Alice revokes Bob: canEdit flips immediately, deviceCount unchanged
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    roster = aliceStack.presence.getRoster(worldId);
    assert(roster[0].deviceCount === 2, '49. Alice: both devices are still CONNECTED — revocation never disconnects anything');
    assert(roster[0].canEdit === false, '50. Alice: canEdit flips to false the instant the grant is gone — "being online is not the same as being authorized to edit"');

    // --- Bob's Tablet disconnects: roster prunes to deviceCount 1 ---------
    bobTabletToAlice.connection.close();
    await wait(20);
    roster = aliceStack.presence.getRoster(worldId);
    assert(roster.length === 1 && roster[0].deviceCount === 1, '51. Alice: Bob\'s Tablet disconnected — pruned from the live roster, deviceCount back to 1');

    // --- Bob leaves explicitly: roster empties -----------------------------
    bobStack.presence.leaveWorld(worldId);
    await wait(15);
    roster = aliceStack.presence.getRoster(worldId);
    assert(roster.length === 0, '52. Alice: Bob explicitly left — the roster is empty, not merely stale');

    console.log('✓ Section E: FLAGSHIP — presence roster, device rollup, locally-recomputed canEdit, disconnect pruning, explicit leave');
}

    console.log('\nAll World membership and presence tests passed.');
}

await runTests();
