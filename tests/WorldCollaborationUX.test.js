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
import { WorldPresenceActivity } from '../core/WorldPresenceActivity.js';
import { buildWorldCollaborationRoster, WorldCollaborationAccess } from '../ui/components/WorldCollaborationRoster.js';

// 0.2.99 — World Collaboration UX.
//
// 0.2.98 built the entire security substrate this milestone puts a face
// on — ownership, signed membership grants, and live presence — but
// deliberately left "any UI surface for granting/revoking membership or
// displaying a presence roster" unbuilt (docs/Roadmap.md, 0.2.98's own
// closing paragraph). This file proves the ONE seam this milestone adds
// — ui/components/WorldCollaborationRoster.js#buildWorldCollaborationRoster()
// — composes that already-decided application state correctly, WITHOUT
// re-testing the cryptography 0.2.98's own flagship (tests/
// WorldMembership.test.js) already proved. Per the design conversation's
// own instruction, this is an application-to-UI COMPOSITION flagship,
// not a second security flagship.
//
//   Section A: buildWorldCollaborationRoster() in isolation — no
//              network, no identities, pure joins over hand-built
//              members/presence arrays. Ownership labeling, the
//              "online is not the same as authorized" distinction,
//              device aggregation, canManage, sort order, and graceful
//              degradation (no owner known, no presence wired at all).
//   Section B: FLAGSHIP, over a REAL authenticated peer network and
//              the REAL WorldMembershipUseCase/WorldPresenceUseCase —
//              exactly the scenario the design conversation asked for:
//              Alice owns World A; Bob and Charlie start READ-only and
//              online; Alice grants Bob EDIT; Bob's second device
//              joins (deviceCount 2, still EDITOR); Alice revokes Bob
//              (back to READ_ONLY, deviceCount STILL 2 — neither
//              device is ever disconnected); and, finally, a
//              UI-level attempt to mutate World state as Bob is still
//              rejected by the REAL application layer — proving the
//              panel only ever REFLECTS authorization, never decides
//              it. See docs/Principles.md, "The UI Displays
//              Authorization; It Never Decides It (0.2.99)."
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

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors tests/WorldMembership.test.js's own helpers exactly — see
// that file's own header for why each one exists.
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

function makeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const documents = new Map();
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

function findRow(roster, identityId) {
    return roster.find((r) => r.identityId === identityId) || null;
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — buildWorldCollaborationRoster() in isolation
// ---------------------------------------------------------------------
{
    assert(Array.isArray(buildWorldCollaborationRoster()), '1. no arguments at all degrades to an empty array, never a throw');
    assert(buildWorldCollaborationRoster({ ownerIdentityId: null, members: [], presence: [] }).length === 0,
        '2. no owner known, no members, no presence — an empty roster, the "graceful degraded mode" the design conversation asked for');

    // Owner alone, viewing their own panel with no peer stack at all —
    // the "Members: Alice / Owner" degraded case named explicitly.
    const soloOwnerOnly = buildWorldCollaborationRoster({ ownerIdentityId: 'did:key:alice', isViewerOwner: true, members: [], presence: [] });
    assert(soloOwnerOnly.length === 1, '3. owner-only, no membership/presence wired — exactly one row');
    assert(soloOwnerOnly[0].access === WorldCollaborationAccess.OWNER, '4. that row is labeled OWNER');
    assert(soloOwnerOnly[0].online === true, '5. the viewer IS the owner, so online is true even though presence never reports one\'s own participation');
    assert(soloOwnerOnly[0].deviceCount === null, '6. no presence entry exists for it — deviceCount is null, never a fabricated number');
    assert(soloOwnerOnly[0].canManage === false, '7. an owner never manages their own row');

    // A presence-only participant who was NEVER granted anything (a
    // pure passerby) — still shown, READ_ONLY, online.
    const withPasserby = buildWorldCollaborationRoster({
        ownerIdentityId: 'did:key:alice',
        isViewerOwner: true,
        members: [],
        presence: [{ identityId: 'did:key:charlie', deviceCount: 1, activity: WorldPresenceActivity.EXPLORING, canEdit: false }]
    });
    const charlieRow = findRow(withPasserby, 'did:key:charlie');
    assert(charlieRow && charlieRow.access === WorldCollaborationAccess.READ_ONLY, '8. a never-granted, merely-present identity is READ_ONLY');
    assert(charlieRow.online === true && charlieRow.deviceCount === 1, '9. and correctly shown online with one device');
    assert(charlieRow.canManage === true, '10. the OWNER viewing this panel may manage even a never-granted row (Grant Edit is exactly how a passerby becomes an editor)');

    // An OFFLINE editor: a live grant on file, but not currently
    // present — "David ○ Offline Editor" from the design conversation.
    const withOfflineEditor = buildWorldCollaborationRoster({
        ownerIdentityId: 'did:key:alice',
        isViewerOwner: true,
        members: [{ subjectIdentityId: 'did:key:david', isAuthorized: true }],
        presence: []
    });
    const davidRow = findRow(withOfflineEditor, 'did:key:david');
    assert(davidRow.access === WorldCollaborationAccess.EDITOR, '11. an active grant makes the row EDITOR regardless of presence');
    assert(davidRow.online === false && davidRow.deviceCount === null, '12. and correctly shown OFFLINE — online and access are independent facts, never merged');

    // A REVOKED (inactive) member, still online as a mere viewer.
    const withRevokedButPresent = buildWorldCollaborationRoster({
        ownerIdentityId: 'did:key:alice',
        isViewerOwner: false,
        members: [{ subjectIdentityId: 'did:key:bob', isAuthorized: false }],
        presence: [{ identityId: 'did:key:bob', deviceCount: 2, activity: WorldPresenceActivity.EXPLORING, canEdit: false }]
    });
    const bobRow = findRow(withRevokedButPresent, 'did:key:bob');
    assert(bobRow.access === WorldCollaborationAccess.READ_ONLY, '13. an inactive (revoked) grant is READ_ONLY, not EDITOR');
    assert(bobRow.deviceCount === 2, '14. device aggregation is untouched by revocation — still 2, exactly the design conversation\'s own "without disconnecting either device"');
    assert(bobRow.canManage === false, '15. a NON-owner viewer never gets manage affordances on anyone\'s row — only the true owner does');

    // Sort order: owner first, then online before offline.
    const sorted = buildWorldCollaborationRoster({
        ownerIdentityId: 'did:key:alice',
        isViewerOwner: true,
        members: [],
        presence: [
            { identityId: 'did:key:zed', deviceCount: 1, activity: WorldPresenceActivity.EXPLORING, canEdit: false },
            { identityId: 'did:key:amy', deviceCount: 1, activity: WorldPresenceActivity.EXPLORING, canEdit: false }
        ]
    });
    assert(sorted[0].access === WorldCollaborationAccess.OWNER, '16. owner always sorts first');
    assert(sorted[1].identityId === 'did:key:amy' && sorted[2].identityId === 'did:key:zed', '17. otherwise alphabetical by identityId');

    console.log('✓ Section A: buildWorldCollaborationRoster() — ownership labeling, online≠authorized, device aggregation survives revocation, canManage, sort order, graceful degradation');
}

// ---------------------------------------------------------------------
// Section B — FLAGSHIP: the design conversation's own scenario, over a
// REAL authenticated peer network and the REAL application layer.
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

    const worldId = 'world-ux-1';
    const doc = () => buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: "Alice's World" });
    aliceStack.documents.set(worldId, doc());
    bobStack.documents.set(worldId, doc());
    bobTabletStack.documents.set(worldId, doc());
    charlieStack.documents.set(worldId, doc());

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-ux', alice, 'bob-ux', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    const { peerA: aliceToCharlie, peerB: charlieFromAlice } = await connectAndAuthenticate(network, 'alice-ux-2', alice, 'charlie-ux', charlie);
    aliceStack.connectedPeerRegistry.add(aliceToCharlie);
    charlieStack.connectedPeerRegistry.add(charlieFromAlice);
    await wait(10);

    // --- Alice opens the Members panel: Bob and Charlie start READ-only,
    //     both already online. ------------------------------------------
    bobStack.presence.enterWorld(worldId, WorldPresenceActivity.EXPLORING);
    charlieStack.presence.enterWorld(worldId, WorldPresenceActivity.EXPLORING);
    await wait(15);

    function aliceRoster() {
        return buildWorldCollaborationRoster({
            ownerIdentityId: aliceStack.documents.get(worldId).metadata.authorIdentityId,
            isViewerOwner: true,
            members: aliceStack.membership.listMembers(worldId),
            presence: aliceStack.presence.getRoster(worldId)
        });
    }

    let roster = aliceRoster();
    assert(roster.length === 3, '18. Alice sees three rows: herself, Bob, Charlie');
    assert(findRow(roster, alice.identity.identityId).access === WorldCollaborationAccess.OWNER, '19. Alice: Owner');
    assert(findRow(roster, alice.identity.identityId).online === true, '20. Alice: shown online — she is obviously here');
    assert(findRow(roster, bob.identity.identityId).access === WorldCollaborationAccess.READ_ONLY, '21. Bob: Read only');
    assert(findRow(roster, bob.identity.identityId).online === true, '22. Bob: Online');
    assert(findRow(roster, charlie.identity.identityId).access === WorldCollaborationAccess.READ_ONLY, '23. Charlie: Read only');
    assert(findRow(roster, charlie.identity.identityId).online === true, '24. Charlie: Online');

    // --- Alice grants Bob EDIT: Bob -> Editor · Online -------------------
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(15);
    roster = aliceRoster();
    assert(findRow(roster, bob.identity.identityId).access === WorldCollaborationAccess.EDITOR, '25. Bob: now Editor');
    assert(findRow(roster, bob.identity.identityId).online === true, '26. Bob: still Online');

    // --- Bob's second device (Tablet) joins: deviceCount -> 2, still
    //     Editor. ----------------------------------------------------------
    const { peerA: bobTabletToAlice, peerB: aliceFromBobTablet } = await connectAndAuthenticate(network, 'bob-tablet-ux', bobTablet, 'alice-ux-3', alice);
    bobTabletStack.connectedPeerRegistry.add(bobTabletToAlice);
    aliceStack.connectedPeerRegistry.add(aliceFromBobTablet);
    await wait(10);
    bobStack.deviceAuth.broadcastAuthorization(tabletGrant);
    await wait(10);
    bobTabletStack.presence.enterWorld(worldId, WorldPresenceActivity.EXPLORING);
    await wait(15);
    roster = aliceRoster();
    const bobAfterTablet = findRow(roster, bob.identity.identityId);
    assert(bobAfterTablet.access === WorldCollaborationAccess.EDITOR, '27. Bob: still Editor after his second device joins');
    assert(bobAfterTablet.deviceCount === 2, '28. Bob: deviceCount is now 2');

    // --- Alice revokes Bob: Bob -> Read only · Online · 2 devices,
    //     WITHOUT disconnecting either device. -----------------------------
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    roster = aliceRoster();
    const bobAfterRevoke = findRow(roster, bob.identity.identityId);
    assert(bobAfterRevoke.access === WorldCollaborationAccess.READ_ONLY, '29. Bob: back to Read only');
    assert(bobAfterRevoke.online === true, '30. Bob: still shown Online');
    assert(bobAfterRevoke.deviceCount === 2, '31. Bob: still 2 devices — revocation never touched presence/connections');
    assert(aliceStack.connectedPeerRegistry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.identity.identityId),
        '32. Bob\'s Desktop connection to Alice is still live');
    assert(aliceStack.connectedPeerRegistry.list().some((p) => p.remoteIdentity && p.remoteIdentity.identityId === bobTablet.identity.identityId),
        '33. Bob\'s Tablet connection to Alice is still live too — neither device was ever disconnected');

    // --- Proof the panel only ever REFLECTS authorization: a UI-level
    //     attempt to mutate World state as the now-revoked Bob is still
    //     rejected by the REAL application layer, completely independent
    //     of anything this milestone's own composition function computed
    //     above. -------------------------------------------------------
    const moveCommand = new MoveBrickCommand({ worldId, buildingId: 'b', brickId: 'k', delta: { x: 1, y: 0, z: 0 } });
    bobStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: moveCommand });
    await wait(20);
    assert(aliceStack.rejected.length === 1 && aliceStack.rejected[0].reason === WorldOperationRejectionReason.NOT_AUTHORIZED,
        '34. Alice: Bob\'s post-revocation mutation attempt is rejected NOT_AUTHORIZED — the panel never had, and never needed, any enforcement power of its own');

    console.log('✓ Section B: FLAGSHIP — Members panel composition tracks real grant/revoke/presence exactly, device aggregation survives revocation, mutation still gated by the real application layer');
}

    console.log('\nAll World Collaboration UX tests passed.');
}

await runTests();
