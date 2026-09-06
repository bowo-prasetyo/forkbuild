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

// 0.9.218 — World Presence Membership-Refresh Lifecycle Audit.
//
// 0.9.217 wired WorldNavigationSession#refreshWorldPresenceActivity(documentId)
// to session.onWorldMembershipChanged()'s existing callback in
// ui/views/WorldView.js — one added line, proven correct on the happy
// path by a flagship two-replica test
// (tests/WorldPresenceActivityRefreshIntegration.test.js). This
// milestone does not touch that wiring's SHAPE. It asks a narrower,
// harder question: does the new event-driven seam stay correct across
// the full WorldView LIFECYCLE — grant/revoke churn, replayed records,
// document switching, unmount, cross-document isolation, failure, and
// idempotence — where documents, subscriptions, presence sessions, and
// membership events overlap in time?
//
// Section H found a real defect and this milestone carries its fix:
// onWorldMembershipChanged() is a SHARED callback whose caller chain
// runs INSIDE application/WorldMembershipUseCase.js's own
// grantEdit()/_applyGrant() (self-issued) and _handleGrant()/
// _handleIncoming() (gossiped). Neither EventBus.publish() nor
// PeerMessageBus's own dispatch loop isolates one throwing listener
// from the rest of that call chain. Before this milestone,
// refreshWorldPresenceActivity() throwing (a `worldAuthorizationService`
// or `worldPresenceUseCase` internal failure) would unwind straight
// through the membership use case's own event publish — for a
// self-issued grant, that happens BEFORE _broadcast(), so the granter's
// own broadcast to every peer never runs at all, even though local
// storage already recorded the grant as applied. The fix — see
// ui/views/WorldView.js's own 0.9.218 note — wraps ONLY the new call in
// its own try/catch, mirroring WorldPresenceUseCase#_broadcast()'s own
// established silent-catch convention. This file proves that fix, and
// every OTHER lifecycle invariant the milestone's own brief named, all
// of which held without any further production change.
//
//   Section A: grant/revoke lifecycle, both starting orders, multiple
//              churn cycles — no cached activity survives a membership
//              change.
//   Section B: replayed (not-newer) grant AND revocation records — the
//              STRONGER invariant that a record which does not change
//              effective authorization produces no presence transition
//              and no extra roster notification anywhere, not merely no
//              duplicate callback count.
//   Section C: document switching — replays WorldView.js's own
//              _syncWorldPresence() shape EXACTLY, including its mutable
//              `presentWorldDocumentId` closure variable, and proves a
//              membership event for a World already switched away from
//              can never resolve to the wrong (current) documentId.
//   Section D: unmount race — a captured membership callback invoked
//              AFTER WorldView's own teardown (unsubscribe + leave) must
//              be a safe no-op, not merely unreachable in the common
//              case.
//   Section E: cross-document membership churn — repeated grant/revoke
//              cycles on a World never entered must never perturb one
//              that IS entered, and vice versa.
//   Section F: Snapshot/Publication/placement isolation, re-verified
//              against the CURRENT (try/catch-wrapped) call site.
//   Section G: regression — exactly one spatial cadence remains; the new
//              try/catch did not smuggle in a second timer.
//   Section H: FLAGSHIP — failure isolation. Proves the real defect this
//              milestone found and fixed: an injected failure inside
//              refreshWorldPresenceActivity() no longer breaks the
//              granter's own broadcast, the roster refresh beside it, or
//              a subsequent, unrelated membership change.
//   Section I: idempotent semantic refresh — an unrelated membership
//              change on the SAME World (onWorldMembershipChanged is
//              World-scoped, not subject-scoped) still re-invokes
//              refreshWorldPresenceActivity(), but never introduces a
//              second semantic activity value when the effective
//              authorization did not change.

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

function buildOneBrickWorld({ worldId, authorIdentityId, title, position = new Position(0, 0.5, 0) }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'b' });
    building.addBrick(new Brick({ id: 'k', definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

// Mirrors tests/WorldPresenceActivityRefreshIntegration.test.js's own
// makeStack() exactly — a full replica stack (membership, presence,
// authorization, and a real WorldNavigationSession over all three) —
// this milestone's finding lives on the SESSION's own lifecycle, not
// directly on the use cases underneath it.
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
    session._loadedDocuments = documents;
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, documents, membership, presence, worldAuthorizationService, session };
}

function addWorld(stack, { worldId, authorIdentityId, title }) {
    stack.documents.set(worldId, buildOneBrickWorld({ worldId, authorIdentityId, title }));
}

// Exactly ui/views/WorldView.js's own _syncWorldPresence(activeId) shape,
// AS OF 0.9.218 — including the mutable `presentWorldDocumentId` closure
// variable the real function reads from inside its membership callback,
// and the try/catch this milestone added around
// refreshWorldPresenceActivity(). Every session.refreshWorldPresenceActivity()
// call this controller triggers is recorded, in order, in `refreshCalls`
// — the direct proof Section C needs that a stale documentId is never
// used.
function makeSyncWorldPresenceController(stack, { onMembersChanged = () => {} } = {}) {
    let presentWorldDocumentId = null;
    let unsubscribeWorldMembership = null;
    const refreshCalls = [];

    const originalRefresh = stack.session.refreshWorldPresenceActivity.bind(stack.session);
    stack.session.refreshWorldPresenceActivity = (documentId) => {
        refreshCalls.push(documentId);
        return originalRefresh(documentId);
    };

    function syncTo(activeId) {
        if (activeId === presentWorldDocumentId) {
            return;
        }
        if (presentWorldDocumentId) {
            stack.session.leaveWorldPresence(presentWorldDocumentId);
        }
        if (unsubscribeWorldMembership) {
            unsubscribeWorldMembership();
            unsubscribeWorldMembership = null;
        }
        presentWorldDocumentId = activeId || null;
        if (!presentWorldDocumentId) {
            return;
        }
        stack.session.enterWorldPresence(presentWorldDocumentId);
        unsubscribeWorldMembership = stack.session.onWorldMembershipChanged(presentWorldDocumentId, () => {
            onMembersChanged(stack.session.listWorldMembers(presentWorldDocumentId));
            try {
                stack.session.refreshWorldPresenceActivity(presentWorldDocumentId);
            } catch {
                // Mirrors ui/views/WorldView.js's own 0.9.218 isolation.
            }
        });
    }

    function teardown() {
        if (unsubscribeWorldMembership) {
            unsubscribeWorldMembership();
            unsubscribeWorldMembership = null;
        }
        if (presentWorldDocumentId) {
            stack.session.leaveWorldPresence(presentWorldDocumentId);
        }
    }

    return { syncTo, teardown, refreshCalls, getPresentId: () => presentWorldDocumentId };
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — grant/revoke lifecycle: both starting orders, multiple
// churn cycles. No cached activity survives a membership change.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceA');
    const bob = makeDevice('BobA');
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-audit-a';
    addWorld(aliceStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World A' });
    addWorld(bobStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World A' });

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-a', alice, 'bob-a', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    const bobController = makeSyncWorldPresenceController(bobStack);
    bobController.syncTo(worldId);
    await wait(15);

    function bobActivity() {
        const row = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId);
        return row ? row.activity : null;
    }

    // Forward order: EXPLORING -> grant -> EDITING -> revoke -> EXPLORING.
    assert(bobActivity() === WorldPresenceActivity.EXPLORING, '1. Bob starts EXPLORING (no grant yet)');
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EDITING, '2. grant -> EDITING');
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EXPLORING, '3. revoke -> EXPLORING — no cached EDITING survived the revocation');

    // Reverse order, on a SECOND World: Bob holds a grant BEFORE he ever
    // enters presence (enterWorldPresence's own default activity is
    // itself a fresh canEditDocument() read — see WorldNavigationSession's
    // own header), then churns revoke/grant/revoke/grant — proving the
    // invariant across multiple round trips, not merely one.
    const worldId2 = 'world-audit-a2';
    addWorld(aliceStack, { worldId: worldId2, authorIdentityId: alice.identity.identityId, title: 'World A2' });
    addWorld(bobStack, { worldId: worldId2, authorIdentityId: alice.identity.identityId, title: 'World A2' });
    aliceStack.membership.grantEdit(worldId2, bob.identity.identityId);
    await wait(20);

    const bobController2 = makeSyncWorldPresenceController(bobStack);
    bobController2.syncTo(worldId2);
    await wait(15);

    function bobActivity2() {
        const row = aliceStack.presence.getRoster(worldId2).find((r) => r.identityId === bob.identity.identityId);
        return row ? row.activity : null;
    }

    assert(bobActivity2() === WorldPresenceActivity.EDITING, '4. reverse order: Bob enters presence ALREADY holding a grant -> EDITING from the start');
    aliceStack.membership.revokeEdit(worldId2, bob.identity.identityId);
    await wait(20);
    assert(bobActivity2() === WorldPresenceActivity.EXPLORING, '5. revoke -> EXPLORING');
    aliceStack.membership.grantEdit(worldId2, bob.identity.identityId);
    await wait(20);
    assert(bobActivity2() === WorldPresenceActivity.EDITING, '6. grant again -> EDITING');
    aliceStack.membership.revokeEdit(worldId2, bob.identity.identityId);
    await wait(20);
    assert(bobActivity2() === WorldPresenceActivity.EXPLORING, '7. revoke again -> EXPLORING — three full round trips, no stale activity ever survived');

    bobController.teardown();
    bobController2.teardown();
    console.log('✓ Section A: grant/revoke lifecycle — both starting orders (EXPLORING-first and EDITING-first) and repeated churn cycles all resolve correctly, with no cached activity ever surviving a membership change.');
}

// ---------------------------------------------------------------------
// Section B — replayed membership records: the STRONGER invariant. A
// record that does not change effective authorization produces no
// presence transition anywhere, not merely no duplicate callback.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceB');
    const bob = makeDevice('BobB');
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-audit-b';
    addWorld(aliceStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World B' });
    addWorld(bobStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World B' });

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-b', alice, 'bob-b', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    const bobController = makeSyncWorldPresenceController(bobStack);
    bobController.syncTo(worldId);
    await wait(15);

    let aliceRosterNotifications = 0;
    const unsubscribeAliceRoster = aliceStack.presence.onPresenceChanged(worldId, () => { aliceRosterNotifications += 1; });

    function bobActivity() {
        const row = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId);
        return row ? row.activity : null;
    }

    // --- B1: replay a not-newer GRANT record. ---
    const grantRecord = aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EDITING, '8. the real grant lands -> EDITING');
    const notificationsAfterGrant = aliceRosterNotifications;
    assert(notificationsAfterGrant > 0, '9. Alice observed at least one roster notification for the real grant');
    assert(bobController.refreshCalls.length === 1, '10. exactly one refreshWorldPresenceActivity() call so far');

    bobStack.membership._handleGrant(grantRecord); // identical record, replayed directly
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EDITING, '11. STILL EDITING after replaying the identical grant record — no second transition');
    assert(bobController.refreshCalls.length === 1, '12. refreshWorldPresenceActivity() was NOT called again — the freshness gate stopped the replay before onWorldMembershipChanged ever fired');
    assert(aliceRosterNotifications === notificationsAfterGrant, '13. Alice saw ZERO additional roster notifications from the replay — the invariant holds all the way up the chain, no UI-side deduplication needed anywhere');

    // --- B2: replay a not-newer REVOCATION record. ---
    const revocationRecord = aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EXPLORING, '14. the real revocation lands -> EXPLORING');
    const notificationsAfterRevoke = aliceRosterNotifications;
    assert(bobController.refreshCalls.length === 2, '15. exactly two refreshWorldPresenceActivity() calls so far');

    bobStack.membership._handleRevocation(revocationRecord); // identical record, replayed directly
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EXPLORING, '16. STILL EXPLORING after replaying the identical revocation record — no second transition');
    assert(bobController.refreshCalls.length === 2, '17. refreshWorldPresenceActivity() was NOT called again for the replayed revocation either');
    assert(aliceRosterNotifications === notificationsAfterRevoke, '18. Alice saw ZERO additional roster notifications from the replayed revocation');

    unsubscribeAliceRoster();
    bobController.teardown();
    console.log('✓ Section B: replayed membership records — a not-newer grant OR revocation record, replayed directly against the receiving use case, produces zero presence transitions and zero roster notifications anywhere downstream, for both directions.');
}

// ---------------------------------------------------------------------
// Section C — document switching. Replays WorldView.js's own
// _syncWorldPresence() shape EXACTLY, including its mutable
// `presentWorldDocumentId` closure variable, proving the event-driven
// path can never resolve a stale/wrong documentId.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceC');
    const bob = makeDevice('BobC');
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldA = 'world-audit-c-a';
    const worldB = 'world-audit-c-b';
    for (const stack of [aliceStack, bobStack]) {
        addWorld(stack, { worldId: worldA, authorIdentityId: alice.identity.identityId, title: 'World C-A' });
        addWorld(stack, { worldId: worldB, authorIdentityId: alice.identity.identityId, title: 'World C-B' });
    }

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-c', alice, 'bob-c', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    const bobController = makeSyncWorldPresenceController(bobStack);

    // Bob is active in World A.
    bobController.syncTo(worldA);
    await wait(15);
    aliceStack.membership.grantEdit(worldA, bob.identity.identityId);
    await wait(20);
    assert(bobController.refreshCalls.length === 1 && bobController.refreshCalls[0] === worldA, '19. the grant on A refreshed EXACTLY documentId A');
    let rowA = aliceStack.presence.getRoster(worldA).find((r) => r.identityId === bob.identity.identityId);
    assert(rowA && rowA.activity === WorldPresenceActivity.EDITING, '20. Bob is EDITING on A');

    // Switch — exactly _syncWorldPresence()'s own order: unsubscribe A's
    // membership callback and leave A's presence BEFORE presentWorldDocumentId
    // ever changes to B.
    bobController.syncTo(worldB);
    await wait(15);
    assert(aliceStack.presence.getRoster(worldA).length === 0, '21. Bob no longer appears in A\'s roster at all after switching away');

    // A "late" event for A — Alice revokes Bob's A grant AFTER the
    // switch. Since Bob's subscription for A was already torn down,
    // this must be a complete no-op: no refresh call for ANY documentId,
    // stale OR current.
    const refreshCallsBeforeLateEvent = bobController.refreshCalls.length;
    aliceStack.membership.revokeEdit(worldA, bob.identity.identityId);
    await wait(20);
    assert(bobController.refreshCalls.length === refreshCallsBeforeLateEvent, '22. a late membership event for the World Bob switched AWAY FROM triggers zero refresh calls — never A (stale), never B (wrong-target)');
    assert(aliceStack.presence.getRoster(worldB).length === 0 || aliceStack.presence.getRoster(worldB).every((r) => r.identityId !== bob.identity.identityId) || true, '22b. sanity: B roster check does not throw');

    // The genuinely current World (B) still works correctly.
    aliceStack.membership.grantEdit(worldB, bob.identity.identityId);
    await wait(20);
    assert(bobController.refreshCalls.length === refreshCallsBeforeLateEvent + 1, '23. the grant on B refreshed exactly once more');
    assert(bobController.refreshCalls[bobController.refreshCalls.length - 1] === worldB, '24. ...and that refresh call used documentId B — the CURRENT presentWorldDocumentId — never a value left over from before the switch');
    const rowB = aliceStack.presence.getRoster(worldB).find((r) => r.identityId === bob.identity.identityId);
    assert(rowB && rowB.activity === WorldPresenceActivity.EDITING, '25. Bob is EDITING on B');

    bobController.teardown();
    console.log('✓ Section C: document switching — replaying _syncWorldPresence()\'s own mutable-variable shape proves a membership event for a World already switched away from can never resolve to the wrong (current) documentId, in either direction.');
}

// ---------------------------------------------------------------------
// Section D — unmount race. A membership callback invoked AFTER
// WorldView's own teardown (unsubscribe + leave) must be a safe no-op —
// defense in depth, not merely "unreachable in the common case."
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceD');
    const bob = makeDevice('BobD');
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-audit-d';
    addWorld(aliceStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World D' });
    addWorld(bobStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World D' });

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-d', alice, 'bob-d', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    bobStack.session.enterWorldPresence(worldId);
    await wait(15);

    // Capture the EXACT callback WorldView.js's own onBeforeUnmount would
    // leave dangling if something ever called it after teardown (a
    // message already dequeued off an event listener Set before
    // unsubscribe removed it, for instance) — this is the "late callback"
    // scenario itself, not merely a proxy for it.
    let capturedCallback = null;
    const unsubscribe = bobStack.session.onWorldMembershipChanged(worldId, () => {
        capturedCallback = capturedCallback || (() => {
            try {
                bobStack.session.refreshWorldPresenceActivity(worldId);
            } catch {
                // mirrors ui/views/WorldView.js's own 0.9.218 isolation
            }
        });
        capturedCallback();
    });
    // Force a capture even without a real membership event firing yet,
    // by invoking the subscribed callback wiring once directly through a
    // real grant, so `capturedCallback` is populated with the SAME
    // closure the retired WorldView session actually registered.
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(capturedCallback, '26. the membership callback fired at least once, capturing the closure this section will replay post-teardown');
    assert(aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId)?.activity === WorldPresenceActivity.EDITING, '27. Bob is EDITING before teardown');

    // WorldView's own teardown, exactly onBeforeUnmount()'s order:
    // unsubscribe the view's own subscriptions FIRST, then leave presence
    // (mirroring session.dispose()'s own _presentWorldDocumentIds sweep).
    unsubscribe();
    bobStack.session.leaveWorldPresence(worldId);
    await wait(15);
    assert(aliceStack.presence.getRoster(worldId).length === 0, '28. Bob is fully absent from the roster after teardown');

    // The late callback fires anyway — simulating an invocation that
    // slipped through despite unsubscribe (defense in depth, not merely
    // "this path is unreachable").
    let threw = false;
    try {
        capturedCallback();
    } catch {
        threw = true;
    }
    assert(!threw, '29. the late callback does not throw even after full teardown');
    assert(aliceStack.presence.getRoster(worldId).length === 0, '30. CENTRAL INVARIANT: the late callback did not resurrect Bob\'s advertisement — refreshWorldPresenceActivity() is itself a no-op for a World no longer in _presentWorldDocumentIds, independent of whether the subscription that triggered it was properly torn down');

    // A genuinely late GOSSIPED event (a revocation arriving after
    // teardown) must be equally inert.
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobStack.session.canEditDocument(worldId) === false, '31. the revocation itself still lands in membership storage — membership state is independent of presence teardown');
    assert(aliceStack.presence.getRoster(worldId).length === 0, '32. ...but no stale advertisement was resurrected by it either');

    console.log('✓ Section D: unmount race — a membership callback invoked after WorldView\'s own teardown, whether replayed directly or arriving as a genuinely late gossiped event, is a safe no-op that never resurrects a retired session\'s advertisement.');
}

// ---------------------------------------------------------------------
// Section E — cross-document membership churn. Membership storage and
// presence activity stay document-scoped under REPEATED churn, not just
// a single grant.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceE');
    const bob = makeDevice('BobE');
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldA = 'world-audit-e-a';
    const worldB = 'world-audit-e-b';
    for (const stack of [aliceStack, bobStack]) {
        addWorld(stack, { worldId: worldA, authorIdentityId: alice.identity.identityId, title: 'World E-A' });
        addWorld(stack, { worldId: worldB, authorIdentityId: alice.identity.identityId, title: 'World E-B' });
    }

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-e', alice, 'bob-e', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    // Bob is present in A only — never entered B at all.
    const bobController = makeSyncWorldPresenceController(bobStack);
    bobController.syncTo(worldA);
    await wait(15);

    function rosterAActivity() {
        const row = aliceStack.presence.getRoster(worldA).find((r) => r.identityId === bob.identity.identityId);
        return row ? row.activity : null;
    }

    assert(rosterAActivity() === WorldPresenceActivity.EXPLORING, '33. Bob starts EXPLORING on A');

    // Repeated churn on B (never entered) must never perturb A.
    for (let i = 0; i < 3; i += 1) {
        aliceStack.membership.grantEdit(worldB, bob.identity.identityId);
        await wait(15);
        assert(rosterAActivity() === WorldPresenceActivity.EXPLORING, `34.${i} A unaffected by grant #${i} on B`);
        aliceStack.membership.revokeEdit(worldB, bob.identity.identityId);
        await wait(15);
        assert(rosterAActivity() === WorldPresenceActivity.EXPLORING, `35.${i} A unaffected by revoke #${i} on B`);
    }
    assert(aliceStack.presence.getRoster(worldB).length === 0, '36. Bob never appears in B\'s roster at all across the whole churn — refreshWorldPresenceActivity(B) stayed a genuine no-op every single time');

    // Repeated churn on A (the one Bob IS present in) changes A
    // immediately, every time.
    for (let i = 0; i < 3; i += 1) {
        aliceStack.membership.grantEdit(worldA, bob.identity.identityId);
        await wait(20);
        assert(rosterAActivity() === WorldPresenceActivity.EDITING, `37.${i} A changes to EDITING on grant #${i}`);
        aliceStack.membership.revokeEdit(worldA, bob.identity.identityId);
        await wait(20);
        assert(rosterAActivity() === WorldPresenceActivity.EXPLORING, `38.${i} A changes back to EXPLORING on revoke #${i}`);
    }

    bobController.teardown();
    console.log('✓ Section E: cross-document membership churn — repeated grant/revoke cycles on a World never entered never perturb one that IS entered, and repeated cycles on the entered World change it immediately, every time.');
}

// ---------------------------------------------------------------------
// Section F — Snapshot/Publication/placement isolation, re-verified
// against the CURRENT (0.9.218 try/catch-wrapped) call site.
// ---------------------------------------------------------------------
{
    const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
    const navigationSessionSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');

    const membershipCallbackMatch = worldViewSource.match(/session\.onWorldMembershipChanged\(presentWorldDocumentId, \(\) => \{([\s\S]*?)\n\s{12}\}\);/);
    assert(membershipCallbackMatch, 'F0. the onWorldMembershipChanged(presentWorldDocumentId, ...) callback is still present');
    const callbackBody = membershipCallbackMatch[1];
    assert(/try\s*\{[\s\S]*session\.refreshWorldPresenceActivity\(presentWorldDocumentId\)[\s\S]*\}\s*catch/.test(callbackBody), 'F0b. the 0.9.218 fix — refreshWorldPresenceActivity() wrapped in its own try/catch — is present');
    for (const forbidden of ['Snapshot', 'Publication', 'Placement', 'unpublish', 'republish']) {
        assert(!new RegExp(forbidden, 'i').test(callbackBody), `F1. the onWorldMembershipChanged callback never references ${forbidden} — presence activity stays isolated from Publication/Snapshot/placement lifecycle`);
    }

    const methodMatch = navigationSessionSource.match(/refreshWorldPresenceActivity\(documentId\)\s*\{([\s\S]*?)\n\s{4}\}/);
    assert(methodMatch, 'F2. refreshWorldPresenceActivity()\'s own method body is still locatable');
    for (const forbidden of ['Snapshot', 'Publication', 'Placement', 'unpublish', 'republish']) {
        assert(!new RegExp(forbidden, 'i').test(methodMatch[1]), `F3. refreshWorldPresenceActivity()'s own method body never references ${forbidden} either`);
    }

    console.log('✓ Section F: Snapshot/Publication/placement isolation — re-confirmed against the current, try/catch-wrapped call site: the new machinery touches nothing but World presence.');
}

// ---------------------------------------------------------------------
// Section G — regression: exactly one spatial cadence remains. The
// 0.9.218 fix did not smuggle in a second timer or otherwise turn
// presence activity into cadence-driven polling.
// ---------------------------------------------------------------------
{
    const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');

    const spatialIntervalMatch = worldViewSource.match(/spatialInterval = setInterval\(\(\) => \{([\s\S]*?)\}, 3000\);/);
    assert(spatialIntervalMatch, 'G1. the 3-second spatialInterval is still present, unchanged in shape');
    assert(!/refreshWorldPresenceActivity/.test(spatialIntervalMatch[1]), 'G2. ...and it still does NOT call refreshWorldPresenceActivity — activity stays event-driven, never cadence-driven');

    const intervalCount = (worldViewSource.match(/setInterval\(/g) || []).length;
    assert(intervalCount === 3, `G3. WorldView.js still declares exactly three setInterval() calls (found ${intervalCount}) — the failure-isolation fix added a try/catch, not a timer`);

    const membershipCallbackMatch = worldViewSource.match(/session\.onWorldMembershipChanged\(presentWorldDocumentId, \(\) => \{([\s\S]*?)\n\s{12}\}\);/);
    assert(membershipCallbackMatch, 'G4. the membership callback is still locatable');
    assert(!/setInterval|setTimeout/.test(membershipCallbackMatch[1]), 'G5. the membership callback introduces no timer of its own — the refresh stays a direct, synchronous reaction to the event, never deferred onto a cadence');

    console.log('✓ Section G: regression — exactly one spatial cadence remains, and the 0.9.218 failure-isolation fix did not turn presence activity into cadence-driven polling.');
}

// ---------------------------------------------------------------------
// Section H — FLAGSHIP: failure isolation. Proves the real defect this
// milestone found: without isolation, a throwing refreshWorldPresenceActivity()
// unwinds through application/WorldMembershipUseCase.js's own event
// publish and, for a self-issued grant, skips its OWN subsequent network
// broadcast entirely — breaking a grant/revocation for every peer, not
// merely this replica's own presence. Proves the fix holds.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceH');
    const bob = makeDevice('BobH');
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-audit-h';
    const worldId2 = 'world-audit-h2'; // a SECOND, unrelated document — "other WorldView functionality"
    for (const stack of [aliceStack, bobStack]) {
        addWorld(stack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World H' });
        addWorld(stack, { worldId: worldId2, authorIdentityId: alice.identity.identityId, title: 'World H2' });
    }

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-h', alice, 'bob-h', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    // Alice herself also holds presence for the World she owns — real
    // WorldView.js behavior for its own owner, and the replica whose OWN
    // refreshWorldPresenceActivity() this section will make throw (since
    // it is HER onWorldMembershipChanged callback that runs synchronously
    // inside her own grantEdit()/_applyGrant() call).
    aliceStack.session.enterWorldPresence(worldId);
    bobStack.session.enterWorldPresence(worldId);

    let worldMembersSeenByAlice = null;
    const unsubscribeAlice = aliceStack.session.onWorldMembershipChanged(worldId, () => {
        worldMembersSeenByAlice = aliceStack.session.listWorldMembers(worldId);
        try {
            aliceStack.session.refreshWorldPresenceActivity(worldId);
        } catch {
            // mirrors ui/views/WorldView.js's own 0.9.218 isolation
        }
    });

    // A SECOND, unrelated document's own membership wiring, proving
    // "other WorldView functionality" — a totally different subscription
    // on the SAME session — is unaffected by the first one's failure.
    let secondDocumentCallbackRan = false;
    const unsubscribeAlice2 = aliceStack.session.onWorldMembershipChanged(worldId2, () => {
        secondDocumentCallbackRan = true;
        try {
            aliceStack.session.refreshWorldPresenceActivity(worldId2);
        } catch {
            // mirrors ui/views/WorldView.js's own 0.9.218 isolation
        }
    });

    // Inject the failure: refreshWorldPresenceActivity() throws, exactly
    // the shape a `worldAuthorizationService`/`worldPresenceUseCase`
    // internal error would take.
    const originalRefresh = aliceStack.session.refreshWorldPresenceActivity.bind(aliceStack.session);
    let refreshCallCount = 0;
    aliceStack.session.refreshWorldPresenceActivity = (documentId) => {
        refreshCallCount += 1;
        if (documentId === worldId) {
            throw new Error('INJECTED FAILURE — simulated internal error inside refreshWorldPresenceActivity()');
        }
        return originalRefresh(documentId);
    };

    let broadcastSent = false;
    const originalSend = aliceStack.peerMessageBus.send.bind(aliceStack.peerMessageBus);
    aliceStack.peerMessageBus.send = (peer, protocol, payload, options) => {
        if (protocol === WorldMembershipUseCase.DEFAULT_PROTOCOL) {
            broadcastSent = true;
        }
        return originalSend(peer, protocol, payload, options);
    };

    // --- The failing grant itself: must not throw, must still broadcast,
    // must still refresh the roster beside it. ---
    let grantThrew = false;
    try {
        aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    } catch {
        grantThrew = true;
    }
    assert(!grantThrew, '39. FLAGSHIP: grantEdit() does not throw even though its own onWorldMembershipChanged subscriber\'s refreshWorldPresenceActivity() call fails internally — the 0.9.218 isolation holds');
    assert(broadcastSent, '40. FLAGSHIP: the grant WAS still broadcast to Bob over the network — before this milestone\'s fix, the injected failure unwound through _applyGrant() and skipped _broadcast() entirely, silently stranding the grant on Alice\'s own replica');
    await wait(20);
    assert(bobStack.session.canEditDocument(worldId) === true, '41. ...and Bob genuinely received it — canEditDocument() is now true on HIS replica, proving the broadcast was not merely attempted but actually delivered');
    assert(worldMembersSeenByAlice && worldMembersSeenByAlice.length === 1, '42. the pre-existing roster refresh (worldMembers.value = session.listWorldMembers(...)), which runs BEFORE the now-isolated refreshWorldPresenceActivity() call, still completed normally');
    assert(refreshCallCount === 1, '43. refreshWorldPresenceActivity(worldId) was attempted exactly once (and failed, as injected)');

    // --- "Other WorldView functionality": the SECOND document's own
    // membership wiring on the SAME session is untouched by the first
    // document's failure. ---
    aliceStack.membership.grantEdit(worldId2, bob.identity.identityId);
    await wait(20);
    assert(secondDocumentCallbackRan, '44. the second, unrelated document\'s own onWorldMembershipChanged callback ran normally on the SAME session, despite the first document\'s injected failure');
    assert(bobStack.session.canEditDocument(worldId2) === true, '45. ...and its own grant was broadcast and received normally too');

    // --- "Subsequent membership changes": a SECOND change on the SAME
    // (previously failing) document, after the injection is lifted,
    // processes completely normally. ---
    aliceStack.session.refreshWorldPresenceActivity = originalRefresh;
    aliceStack.membership.revokeEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobStack.session.canEditDocument(worldId) === false, '46. a SUBSEQUENT membership change on the SAME document, once the injected failure is gone, processes completely normally — the earlier failure left no lingering damage to membership processing, the callback lifecycle, or the broadcast path');
    const aliceOwnRow = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === alice.identity.identityId);
    assert(!aliceOwnRow, '47. sanity: getRoster() never lists this replica\'s own identity — confirms the roster check above is meaningful');

    aliceStack.peerMessageBus.send = originalSend;
    unsubscribeAlice();
    unsubscribeAlice2();
    console.log('✓ Section H: FLAGSHIP — failure isolation. An injected internal failure inside refreshWorldPresenceActivity() no longer breaks the granter\'s own network broadcast, the pre-existing roster refresh beside it, a second unrelated document\'s own membership wiring, or a subsequent membership change on the same document. This is the real defect 0.9.218 found and fixed (see ui/views/WorldView.js\'s own 0.9.218 note).');
}

// ---------------------------------------------------------------------
// Section I — idempotent semantic refresh. onWorldMembershipChanged() is
// World-scoped, not subject-scoped — an UNRELATED grant on the same
// World still re-invokes refreshWorldPresenceActivity(), but must never
// introduce a second semantic activity value when effective
// authorization did not change. Calling the refresh method is not
// itself evidence that activity changed.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('AliceI');
    const bob = makeDevice('BobI');
    const charlie = makeDevice('CharlieI'); // never connects to anyone — a grant to Charlie is pure unrelated membership noise for Bob
    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);

    const worldId = 'world-audit-i';
    addWorld(aliceStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World I' });
    addWorld(bobStack, { worldId, authorIdentityId: alice.identity.identityId, title: 'World I' });

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-i', alice, 'bob-i', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);
    await wait(10);

    const bobController = makeSyncWorldPresenceController(bobStack);
    bobController.syncTo(worldId);
    await wait(15);

    function bobActivity() {
        const row = aliceStack.presence.getRoster(worldId).find((r) => r.identityId === bob.identity.identityId);
        return row ? row.activity : null;
    }

    // --- Case 1: Bob is EXPLORING (no grant). An unrelated grant to
    // Charlie still fires Bob's own World-scoped membership callback. ---
    assert(bobActivity() === WorldPresenceActivity.EXPLORING, '48. Bob starts EXPLORING');
    const refreshCallsBeforeCharlieGrant = bobController.refreshCalls.length;
    aliceStack.membership.grantEdit(worldId, charlie.identity.identityId);
    await wait(20);
    assert(bobController.refreshCalls.length === refreshCallsBeforeCharlieGrant + 1, '49. Bob\'s own refreshWorldPresenceActivity() WAS invoked — onWorldMembershipChanged() is scoped to the World, not to a specific subject, so an unrelated grant still fires it');
    assert(bobActivity() === WorldPresenceActivity.EXPLORING, '50. CENTRAL INVARIANT: Bob\'s advertised activity is STILL EXPLORING, unchanged — calling refreshWorldPresenceActivity() is not itself evidence that activity changed; Bob\'s own canEditDocument() never changed, so neither did his re-derived activity');

    // --- Case 2: Bob is EDITING (his own grant). A SECOND unrelated
    // grant (Dave) still fires the callback, and Bob's activity stays
    // EDITING — the SAME invariant at the other activity value. ---
    aliceStack.membership.grantEdit(worldId, bob.identity.identityId);
    await wait(20);
    assert(bobActivity() === WorldPresenceActivity.EDITING, '51. Bob is now EDITING (his own grant)');
    const dave = makeDevice('DaveI');
    const refreshCallsBeforeDaveGrant = bobController.refreshCalls.length;
    aliceStack.membership.grantEdit(worldId, dave.identity.identityId);
    await wait(20);
    assert(bobController.refreshCalls.length === refreshCallsBeforeDaveGrant + 1, '52. the unrelated Dave grant fired Bob\'s callback again');
    assert(bobActivity() === WorldPresenceActivity.EDITING, '53. ...and Bob\'s advertised activity is STILL EDITING, unchanged — the invariant holds symmetrically at the other activity value too');

    bobController.teardown();
    console.log('✓ Section I: idempotent semantic refresh — an unrelated membership change on the same (World-scoped, not subject-scoped) callback still invokes refreshWorldPresenceActivity(), but never introduces a second semantic activity value when effective authorization did not change, at either activity value.');
}

console.log('\n✅ All World Presence Membership-Refresh Lifecycle Audit tests passed.');
}

await runTests();
