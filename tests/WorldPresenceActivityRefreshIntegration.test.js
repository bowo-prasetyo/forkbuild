import { readFile } from 'node:fs/promises';

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
import { WorldPresenceUseCase } from '../application/WorldPresenceUseCase.js';
import { WorldAuthorizationService } from '../application/WorldAuthorizationService.js';
import { WorldPresenceActivity } from '../core/WorldPresenceActivity.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { WorldCommandPropagationUseCase } from '../application/WorldCommandPropagationUseCase.js';

// 0.9.217 — Wire World Presence Activity Refresh.
//
// 0.9.216's own Section L5 found exactly one ACTUAL_GAP left in the
// whole capability-reachability arc: WorldNavigationSession#
// refreshWorldPresenceActivity(documentId) — fully implemented (it
// re-derives this replica's OWN advertised World-presence activity from
// a fresh canEditDocument() read and re-broadcasts it), zero callers
// anywhere. This is deliberately NOT a new heartbeat/timer/state
// machine — the fix is wiring the ALREADY-EXISTING method to the
// ALREADY-EXISTING semantic event its own header names: "the call a
// session makes after a World edit grant it holds changes (granted or
// revoked)."
//
// ui/views/WorldView.js already had exactly that event wired for a
// DIFFERENT purpose — session.onWorldMembershipChanged(documentId, cb)
// refreshes the Members panel roster the moment a grant/revocation
// (self-issued or gossiped) arrives for the active document. 0.9.217
// adds ONE call inside that same callback: session.refreshWorldPresenceActivity(documentId).
// No new timer, no new subscription, no new state.
//
//   Section A: static wiring proof — the production call site exists,
//              in the right place, with the right documentId, and nowhere
//              else (in particular, NOT inside the unrelated 3-second
//              spatialInterval/refreshSpatialUI() poll — see this
//              milestone's own brief on why spatial observation and
//              presence activity must stay separate temporal concerns).
//   Section B: FLAGSHIP — a real, authenticated two-replica peer
//              network (Alice owns a World; Bob is present but
//              unauthorized) proves that REPLAYING the exact callback
//              WorldView.js now runs — nothing more — is sufficient for
//              Bob's advertised activity to flip EXPLORING -> EDITING
//              the instant Alice grants him edit, and back on
//              revocation, entirely independent of Bob's own 3-second
//              poll or any second action on his part.
//   Section C: document identity / cross-document isolation — a grant
//              on a SECOND World Bob is not present in never touches
//              his advertised activity for the first.
//   Section D: document switching — leaving presence for A (as
//              WorldView.js's teardown already does before switching
//              documents) makes a stale/late membership change for A a
//              genuine no-op, never resurrecting A's advertised
//              activity.
//   Section E: no duplicate broadcast — a re-gossiped, not-newer copy
//              of the same grant (WorldMembershipUseCase's own
//              freshness gate) never fires the callback a second time.
//   Section F: Snapshot/Publication/placement isolation — the new call
//              site touches nothing but presence.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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

function buildOneBrickWorld({ worldId, buildingId, brickId, authorIdentityId, title, position = new Position(0, 0.5, 0) }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: buildingId });
    building.addBrick(new Brick({ id: brickId, definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

// Builds a full replica stack — membership, presence, authorization, and
// a real WorldNavigationSession wired over all three — mirroring
// tests/WorldCollaborationUX.test.js's own makeStack(), extended with
// the WorldNavigationSession/WorldAuthorizationService layer WorldView.js
// itself sits on top of, since this milestone's own finding lives on
// THAT session, not directly on the use cases.
function makeStack(device) {
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
    const presence = new WorldPresenceUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        resolveCanEdit: (worldDocumentId, identityId) => {
            const document = documents.get(worldDocumentId);
            if (!document || !identityId) return false;
            if (document.metadata.authorIdentityId === identityId) return true;
            return membership.hasActiveGrant(worldDocumentId, identityId);
        }
    });
    const worldAuthorizationService = new WorldAuthorizationService({
        identityProvider: device.provider,
        resolveWorldEditGrant: (worldDocumentId, identityId) => membership.hasActiveGrant(worldDocumentId, identityId)
    });
    const registry = new CreateCommandRegistryUseCase().execute();
    const session = new WorldNavigationSession({
        registry,
        loadPublicationDocumentUseCase: null,
        worldLayoutProvider: null,
        worldAuthorizationService,
        worldMembershipUseCase: membership,
        worldPresenceUseCase: presence,
        identityProvider: device.provider
    });
    // Every session in this file loads its documents directly into the
    // private map WorldNavigationSession itself reads from — the same
    // shortcut tests/WorldEditingAuthorization.test.js's own buildSession()
    // takes, avoiding a full LoadPublicationDocumentUseCase/storage round
    // trip this milestone's finding has nothing to do with.
    session._loadedDocuments = documents;
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, documents, membership, presence, worldAuthorizationService, session };
}

// Exactly what 0.9.217 adds inside ui/views/WorldView.js's own
// _syncWorldPresence() — replayed here at the application layer so this
// file proves the WIRING itself (not merely that the two methods it
// connects already work in isolation, which 0.2.98/0.2.99 already
// proved).
function wireWorldViewMembershipCallback(stack, worldDocumentId) {
    return stack.session.onWorldMembershipChanged(worldDocumentId, () => {
        stack.session.refreshWorldPresenceActivity(worldDocumentId);
    });
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — static wiring proof.
// ---------------------------------------------------------------------
{
    const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
    const navigationSessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');

    // A1 — the method itself is unchanged: still a real implementation,
    // never a stub, still delegating to WorldPresenceUseCase#setActivity
    // with a fresh canEditDocument() read.
    assert(/refreshWorldPresenceActivity\(documentId\)\s*\{/.test(navigationSessionSource), 'A1a. refreshWorldPresenceActivity() is still a real, implemented method');
    assert(/this\._worldPresenceUseCase\.setActivity\(documentId, this\.canEditDocument\(documentId\)/.test(navigationSessionSource), 'A1b. ...whose body is untouched — this milestone integrates the capability, it does not reinterpret it');

    // A2 — WorldView.js now calls it exactly once, and that one call
    // lives inside the onWorldMembershipChanged() callback — the exact
    // "a World edit grant it holds changes" event the method's own
    // header names as its trigger.
    assert(countOccurrences(worldViewSource, 'session.refreshWorldPresenceActivity(') === 1, 'A2a. WorldView.js calls session.refreshWorldPresenceActivity() exactly once — a single, precisely-scoped integration, not a broad rewiring');
    const membershipCallbackMatch = worldViewSource.match(/session\.onWorldMembershipChanged\(presentWorldDocumentId, \(\) => \{([\s\S]*?)\}\);/);
    assert(membershipCallbackMatch, 'A2b. the onWorldMembershipChanged(presentWorldDocumentId, ...) subscription this milestone hooks into is still present, unchanged in shape');
    assert(/session\.refreshWorldPresenceActivity\(presentWorldDocumentId\)/.test(membershipCallbackMatch[1]), 'A2c. ...and the new call lives INSIDE that exact callback, passed the SAME presentWorldDocumentId the roster refresh beside it already uses — never a second, independently-tracked id');
    assert(/worldMembers\.value = session\.listWorldMembers\(presentWorldDocumentId\)/.test(membershipCallbackMatch[1]), 'A2d. ...alongside the pre-existing roster refresh, not replacing it');

    // A3 — deliberately NOT wired to the unrelated 3-second spatial
    // poll. spatialInterval's own callback (session.updateSpatialView()
    // + refreshSpatialUI()) must never itself call
    // refreshWorldPresenceActivity — spatial observation and presence
    // activity are different temporal semantics, per this milestone's
    // own brief.
    const spatialIntervalMatch = worldViewSource.match(/spatialInterval = setInterval\(\(\) => \{([\s\S]*?)\}, 3000\);/);
    assert(spatialIntervalMatch, 'A3a. the 3-second spatialInterval is still present, unchanged in shape');
    assert(!/refreshWorldPresenceActivity/.test(spatialIntervalMatch[1]), 'A3b. ...and it does NOT call refreshWorldPresenceActivity — the fix is event-driven (membership changed), never cadence-driven');

    // A4 — no new timer was introduced to make the method reachable:
    // the same three intervals (spatial, spatial-presence-sync, vehicle
    // interaction) this codebase already had are still the only ones.
    const intervalCount = (worldViewSource.match(/setInterval\(/g) || []).length;
    assert(intervalCount === 3, `A4. WorldView.js still declares exactly three setInterval() calls (found ${intervalCount}) — no new timer/heartbeat was added for this milestone`);

    console.log('✓ Section A: static wiring proof — refreshWorldPresenceActivity() is called exactly once, from inside the pre-existing onWorldMembershipChanged() callback with the correct documentId, never from the unrelated 3-second spatial poll, and no new timer was introduced.');
}

// ---------------------------------------------------------------------
// Section B — FLAGSHIP: replaying WorldView.js's own new wiring over a
// real, authenticated two-replica peer network.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice217');
    const bob = makeDevice('Bob217');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-presence-refresh-1';
    const doc = () => buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: "Alice's World" });
    aliceStack.documents.set(worldId, doc());
    bobStack.documents.set(worldId, doc());

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-wpr', alice, 'bob-wpr', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    await wait(10);

    // Bob arrives as a mere Explorer — he holds no grant yet.
    assert(bobStack.session.canEditDocument(worldId) === false, '1. Bob: cannot edit yet');
    bobStack.session.enterWorldPresence(worldId);
    await wait(15);
    let bobRow = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId);
    assert(bobRow && bobRow.activity === WorldPresenceActivity.EXPLORING, '2. Alice sees Bob as EXPLORING, matching his real (lack of) authority');

    // Exactly WorldView.js's own new wiring — nothing more.
    const unsubscribeBobMembership = wireWorldViewMembershipCallback(bobStack, worldId);

    // --- Alice grants Bob EDIT -------------------------------------------
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobStack.session.canEditDocument(worldId) === true, '3. Bob: the grant landed — canEditDocument() now true');
    bobRow = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId);
    assert(bobRow && bobRow.activity === WorldPresenceActivity.EDITING, '4. FLAGSHIP: Alice sees Bob\'s advertised activity flip to EDITING the instant the grant lands — solely because the onWorldMembershipChanged callback fired refreshWorldPresenceActivity(), with zero further action from Bob (no re-enterWorldPresence, no manual setActivity call)');

    // --- Alice revokes Bob ------------------------------------------------
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobStack.session.canEditDocument(worldId) === false, '5. Bob: the revocation landed — canEditDocument() now false');
    bobRow = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId);
    assert(bobRow && bobRow.activity === WorldPresenceActivity.EXPLORING, '6. FLAGSHIP: Alice sees Bob\'s advertised activity flip back to EXPLORING the instant the revocation lands, honestly reflecting his authority the moment it changed rather than leaving a stale "still EDITING" advertisement — exactly the header\'s own "presence stays honest without waiting for a peer to notice" promise');

    unsubscribeBobMembership();
    console.log('✓ Section B: FLAGSHIP — replaying WorldView.js\'s own new callback over a real authenticated peer network proves the wiring alone (no other action from Bob) keeps his advertised World-presence activity honest across both a grant and a revocation.');
}

// ---------------------------------------------------------------------
// Section C — document identity: a grant on a World Bob is not present
// in must never touch his advertised activity for one he IS present in.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice217c');
    const bob = makeDevice('Bob217c');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldA = 'world-presence-refresh-c-a';
    const worldB = 'world-presence-refresh-c-b';
    aliceStack.documents.set(worldA, buildOneBrickWorld({ worldId: worldA, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World A' }));
    bobStack.documents.set(worldA, buildOneBrickWorld({ worldId: worldA, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World A' }));
    aliceStack.documents.set(worldB, buildOneBrickWorld({ worldId: worldB, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World B' }));
    bobStack.documents.set(worldB, buildOneBrickWorld({ worldId: worldB, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World B' }));

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-wpr-c', alice, 'bob-wpr-c', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    await wait(10);

    // Bob is present ONLY in World A — never entered World B at all.
    bobStack.session.enterWorldPresence(worldA);
    await wait(15);
    wireWorldViewMembershipCallback(bobStack, worldA);
    wireWorldViewMembershipCallback(bobStack, worldB);

    // Alice grants Bob edit on World B, the one he never entered.
    aliceStack.membership.grantEdit(worldB, bob.identity.identityId);
    await wait(20);

    const rowA = aliceStack.presence.getRoster(worldA).find((r) => r.identityId === bob.identity.identityId);
    assert(rowA && rowA.activity === WorldPresenceActivity.EXPLORING, '7. World A: Bob\'s advertised activity is untouched by a grant on a DIFFERENT World — refreshWorldPresenceActivity(worldB) never bleeds into World A\'s own advertisement');
    assert(aliceStack.presence.getRoster(worldB).length === 0, '8. World B: Bob never appears there at all — refreshWorldPresenceActivity() is correctly a no-op for a World this replica never entered presence for, exactly its own documented contract, even though the membership callback for it fired');

    console.log('✓ Section C: document identity — a grant/revocation on one World never contaminates another World\'s advertised activity, and refreshWorldPresenceActivity() stays a genuine no-op for a World never entered.');
}

// ---------------------------------------------------------------------
// Section D — document switching: leaving presence for A before a
// stale/late membership change for A arrives must never resurrect A's
// advertisement, mirroring WorldView.js's own teardown-before-switch
// order in _syncWorldPresence().
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice217d');
    const bob = makeDevice('Bob217d');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-presence-refresh-d';
    aliceStack.documents.set(worldId, buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World D' }));
    bobStack.documents.set(worldId, buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World D' }));

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-wpr-d', alice, 'bob-wpr-d', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    await wait(10);

    bobStack.session.enterWorldPresence(worldId);
    await wait(15);
    const unsubscribe = wireWorldViewMembershipCallback(bobStack, worldId);

    // Bob switches away — WorldView.js's own _syncWorldPresence() always
    // unsubscribes BEFORE leaving, and always leaves before moving to a
    // new activeId. Mirrored exactly here.
    unsubscribe();
    bobStack.session.leaveWorldPresence(worldId);
    await wait(15);
    assert(aliceStack.presence.getRoster(worldId).length === 0, '9. Bob no longer appears in World D\'s roster at all after leaving');

    // A grant that arrives AFTER Bob left (the "late gossip" case) must
    // never resurrect his advertisement for a World he is no longer
    // present in.
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobStack.session.canEditDocument(worldId) === true, '10. the grant itself still lands (membership state is independent of presence)');
    assert(aliceStack.presence.getRoster(worldId).length === 0, '11. ...but Bob is still absent from the roster — no stale identity was resurrected by the late membership change, since the callback was torn down and refreshWorldPresenceActivity() is itself a no-op for a World no longer entered');

    console.log('✓ Section D: document switching — unsubscribing and leaving presence before a late membership change arrives leaves no stale advertisement behind.');
}

// ---------------------------------------------------------------------
// Section E — no duplicate broadcast: a re-gossiped, not-newer copy of
// an already-applied grant never re-fires the callback.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice217e');
    const bob = makeDevice('Bob217e');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-presence-refresh-e';
    aliceStack.documents.set(worldId, buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World E' }));
    bobStack.documents.set(worldId, buildOneBrickWorld({ worldId, buildingId: 'b', brickId: 'k', authorIdentityId: alice.identity.identityId, title: 'World E' }));

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-wpr-e', alice, 'bob-wpr-e', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);
    await wait(10);

    bobStack.session.enterWorldPresence(worldId);
    await wait(15);

    let callbackCount = 0;
    const unsubscribe = bobStack.session.onWorldMembershipChanged(worldId, () => {
        callbackCount += 1;
        bobStack.session.refreshWorldPresenceActivity(worldId);
    });

    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(callbackCount === 1, '12. the callback fires exactly once for the grant');

    // Re-broadcast the identical grant record directly over the bus —
    // simulating a duplicate/replayed gossip message. WorldMembershipUseCase's
    // own freshness gate (authorizedAt strictly newer) must swallow it
    // before ever publishing a second change event.
    const sameGrantRecord = bobStack.membership.resolveGrant(worldId, bob.identity.identityId).grant;
    bobStack.membership._handleGrant(sameGrantRecord);
    await wait(15);
    assert(callbackCount === 1, '13. re-delivering the exact same (not-newer) grant record does not fire the callback a second time — no UI-side deduplication was needed because the existing use case already guarantees this');

    unsubscribe();
    console.log('✓ Section E: no duplicate activity — a replayed, not-newer grant record never re-triggers the presence refresh, per WorldMembershipUseCase\'s own existing freshness gate.');
}

// ---------------------------------------------------------------------
// Section F — Snapshot/Publication/placement isolation: the new call
// site is textually confined to presence/membership; it references
// none of the machinery 0.9.197-0.9.203 deliberately kept separate.
// ---------------------------------------------------------------------
{
    const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
    const membershipCallbackMatch = worldViewSource.match(/session\.onWorldMembershipChanged\(presentWorldDocumentId, \(\) => \{([\s\S]*?)\}\);/);
    assert(membershipCallbackMatch, 'F0. the callback this milestone extends is still present');
    const callbackBody = membershipCallbackMatch[1];
    for (const forbidden of ['Snapshot', 'Publication', 'Placement', 'unpublish', 'republish']) {
        assert(!new RegExp(forbidden, 'i').test(callbackBody), `F1. the onWorldMembershipChanged callback never references ${forbidden} — presence activity stays isolated from Publication/Snapshot/placement lifecycle`);
    }
    console.log('✓ Section F: Snapshot/Publication/placement isolation — the new call site touches nothing but World presence.');
}

console.log('\n✅ All World Presence Activity Refresh Integration tests passed.');
}

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

await runTests();
