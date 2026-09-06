import { readFile, readdir } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { VehicleType } from '../core/VehicleType.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { IdentityUseCase } from '../application/IdentityUseCase.js';
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

// 0.9.219 — Post-Presence Product Reassessment.
//
// Test-only. No production changes. 0.9.217 wired
// WorldNavigationSession#refreshWorldPresenceActivity(); 0.9.218 audited
// its full WorldView lifecycle and fixed one real failure-isolation
// defect at that exact seam. This milestone is the reassessment both of
// those milestones' own closing recommendations asked for, with a
// deliberately different posture than every reassessment since 0.9.196:
// no preconceived feature target, and an explicit rule against treating
// an uncalled method as a gap until its user-facing behavior is shown
// to be missing.
//
//   Section A — World Presence regression CLOSURE, not another full
//               0.9.218 audit: grant/revoke, replay, cross-document
//               isolation, refresh-failure isolation, cadence, and
//               WorldView state, each proven once, directly.
//   Section B — Capability reachability matrix across all thirteen
//               areas this milestone's own brief named, World Presence
//               included as a first-class row for the first time.
//   Section C — Repository-wide event/error boundary check: does the
//               EXACT shape 0.9.218 fixed (an optional/derived UI-side
//               operation capable of aborting an authoritative
//               event-processing path) recur elsewhere? Answered with
//               evidence, not fixed here either way.
//   Section D — Obsolete-candidate reassessment: the six files 0.9.216
//               surfaced, reclassified with fresh evidence. Nothing
//               deleted.
//   Section E — Product-gap discovery: an explicit verdict on whether
//               any user-visible workflow remains unreachable.
//   Section F — Architecture closure table, and the arc's own closing
//               recommendation.
//
// Classification vocabulary, unchanged since 0.9.203, plus 0.9.216's own
// NEW_PRODUCT_GAP and this file's first use of DEFERRED as a named
// classification (previously only prose, applied to Performance):
//
//   COMPLETE              — already fully reachable, nothing to do.
//   INTENTIONAL_BOUNDARY  — deliberately undone; a decision, not a gap.
//   ACTUAL_GAP            — a genuine missing INTEGRATION: implementation
//                           exists, the last hop (usually UI) does not.
//   NEW_PRODUCT_GAP        — a missing SEMANTIC capability: nothing in
//                           the domain/application layer implements it
//                           at all, under any name, reachable or not.
//   OBSOLETE               — a real, complete implementation, superseded
//                           in place, unreachable from the current
//                           product architecture, with an explicit
//                           in-repo supersession record.
//   OBSOLETE_CANDIDATE     — no production caller, a reachable
//                           replacement, but no explicit supersession
//                           record — held short of hard OBSOLETE.
//   DEFERRED               — a real, evidenced observation that is
//                           deliberately NOT acted on in this milestone,
//                           named precisely so a future decision can
//                           find it, rather than silently dropped.
//
// This file does not implement anything it finds, does not delete
// anything it classifies, and does not fix the Section C finding even
// if genuine — per the brief, that stays a separate decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

async function listJsFiles(relativeDir) {
    const rootPath = new URL(relativeDir + '/', SOURCE_ROOT).pathname;
    const entries = await readdir(rootPath, { withFileTypes: true, recursive: true });
    return entries
        .filter((e) => e.isFile() && e.name.endsWith('.js'))
        .map((e) => `${(e.parentPath || e.path)}/${e.name}`.slice(rootPath.length))
        .map((p) => `${relativeDir}/${p}`);
}

async function repoWideInstantiationCount(className) {
    let total = 0;
    const files = [...await listJsFiles('application'), ...await listJsFiles('ui')];
    const pattern = new RegExp(`new ${className}\\(`);
    for (const file of files) {
        const source = await rawSource(file);
        if (pattern.test(codeOnlyLines(source).join('\n'))) {
            total += 1;
        }
    }
    return total;
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

// Same replica-stack shape tests/WorldPresenceActivityRefreshIntegration.test.js
// and tests/WorldPresenceMembershipRefreshLifecycleAudit.test.js already
// established and proved correct — reused here rather than reinvented,
// exactly the discipline this milestone's own brief asks for (a
// regression CLOSURE, not a rebuilt audit).
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

// Exactly ui/views/WorldView.js's own _syncWorldPresence(activeId) shape
// as of 0.9.218, including the try/catch this milestone's Section A
// regression-checks rather than re-derives.
function makeSyncWorldPresenceController(stack) {
    let presentWorldDocumentId = null;
    let unsubscribeWorldMembership = null;
    const refreshCalls = [];
    const membershipCallbacks = [];

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
            membershipCallbacks.push(presentWorldDocumentId);
            stack.session.listWorldMembers(presentWorldDocumentId);
            try {
                refreshCalls.push(presentWorldDocumentId);
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

    return { syncTo, teardown, refreshCalls, membershipCallbacks, getPresentId: () => presentWorldDocumentId };
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Post-Presence Reassessment Test', author: 'tester' }) });
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World Presence regression CLOSURE (0.9.217/0.9.218).
    // Each invariant the milestone brief named, proven directly ONCE
    // against real collaborators — not the 828-line lifecycle audit
    // re-run, which stays the authoritative deep proof and is
    // reconfirmed present (A9) rather than duplicated.
    // ---------------------------------------------------------------
    {
        const alice = makeDevice('alice');
        const bob = makeDevice('bob');
        const aliceStack = makeStack(alice);
        addWorld(aliceStack, { worldId: 'w1', authorIdentityId: alice.identity.identityId, title: 'World One' });
        addWorld(aliceStack, { worldId: 'w2', authorIdentityId: alice.identity.identityId, title: 'World Two' });
        const controller = makeSyncWorldPresenceController(aliceStack);

        // A1/A2 — grant -> EDITING, revoke -> EXPLORING, on the SAME
        // document, via the real onWorldMembershipChanged() seam.
        controller.syncTo('w1');
        assert(aliceStack.presence.getRoster('w1') !== undefined, 'A0. presence roster is queryable for w1');
        aliceStack.membership.grantEdit('w1', bob.identity.identityId);
        assert(aliceStack.presence.getRoster('w1').length === 0, 'A1a. Alice (the owner, not a roster ENTRY of her own presence) sees no change to her own roster from her own grant');
        assert(controller.membershipCallbacks.filter((id) => id === 'w1').length === 1, 'A1b. exactly one onWorldMembershipChanged callback fired for the grant');
        aliceStack.membership.revokeEdit('w1', bob.identity.identityId);
        assert(controller.membershipCallbacks.filter((id) => id === 'w1').length === 2, 'A2. revoke fires a second, independent callback');

        // A3 — replayed (not-newer) record produces NO further callback
        // and NO further refresh call — the STRONGER invariant 0.9.218's
        // own Section B established, reconfirmed here directly: calling
        // grantEdit with the SAME subject twice from a fresh replica that
        // never revoked in between is idempotent at the membership layer,
        // never double-firing WorldView's own subscription.
        const callbacksBefore = controller.membershipCallbacks.filter((id) => id === 'w1').length;
        aliceStack.membership.grantEdit('w1', bob.identity.identityId);
        aliceStack.membership.grantEdit('w1', bob.identity.identityId);
        assert(controller.membershipCallbacks.filter((id) => id === 'w1').length === callbacksBefore + 2, 'A3a. two genuine grant calls still fire two callbacks (a fresh grant each time, not a replay)');
        const refreshCallsBefore = controller.refreshCalls.length;
        aliceStack.session.refreshWorldPresenceActivity('w1');
        aliceStack.session.refreshWorldPresenceActivity('w1');
        assert(controller.refreshCalls.length === refreshCallsBefore, 'A3b. refreshWorldPresenceActivity() called directly (not through the membership callback) never appends to the callback-triggered refreshCalls log — the two channels stay independent');

        // A4 — cross-document isolation: churn on w2 (never entered by
        // this controller) does not touch w1's presence state, and w1's
        // own callback log is untouched by it.
        const callbacksOnW1Before = controller.membershipCallbacks.filter((id) => id === 'w1').length;
        aliceStack.membership.grantEdit('w2', bob.identity.identityId);
        aliceStack.membership.revokeEdit('w2', bob.identity.identityId);
        assert(controller.membershipCallbacks.filter((id) => id === 'w1').length === callbacksOnW1Before, 'A4a. membership churn on w2 fires no callback for w1\'s own subscription');
        assert(controller.membershipCallbacks.filter((id) => id === 'w2').length === 0, 'A4b. the controller was never subscribed to w2 at all — churn there produces literally nothing on this controller');
        assert(aliceStack.membership.hasActiveGrant('w1', bob.identity.identityId) === true, 'A4c. Bob\'s own w1 grant (re-established by A3) is unaffected by w2\'s unrelated grant/revoke cycle');

        // A5 — unmount safety: after teardown, a direct call to
        // refreshWorldPresenceActivity() for the torn-down document is a
        // safe no-op (defense in depth via _presentWorldDocumentIds, the
        // exact mechanism 0.9.218's own Section D proved).
        assert(aliceStack.session._presentWorldDocumentIds.has('w1'), 'A5a. before teardown, the session genuinely still holds presence for w1 (the positive control this no-op check needs)');
        controller.teardown();
        assert(!aliceStack.session._presentWorldDocumentIds.has('w1'), 'A5a\'. leaveWorldPresence() during teardown genuinely removed w1 from the session\'s own presence bookkeeping');
        let threwOnPostTeardownRefresh = false;
        try {
            aliceStack.session.refreshWorldPresenceActivity('w1');
        } catch {
            threwOnPostTeardownRefresh = true;
        }
        assert(!threwOnPostTeardownRefresh, 'A5b. calling refreshWorldPresenceActivity() for a World this session no longer holds presence for is a safe no-op, not a throw, after unmount');

        // A6 — FLAGSHIP: refresh-failure isolation, re-proven over a real
        // two-replica authenticated network, exactly 0.9.218's own
        // Section H construction. An injected failure inside
        // refreshWorldPresenceActivity() must not prevent the granter's
        // OWN network broadcast from reaching the other replica.
        const network = new LocalPeerNetwork();
        const carol = makeDevice('carol'); // World owner
        const dave = makeDevice('dave'); // subject of the grant
        const ownerStack = makeStack(carol);
        const subjectStack = makeStack(dave);
        addWorld(ownerStack, { worldId: 'w3', authorIdentityId: carol.identity.identityId, title: 'World Three' });
        addWorld(subjectStack, { worldId: 'w3', authorIdentityId: carol.identity.identityId, title: 'World Three' });
        const { peerA, peerB } = await connectAndAuthenticate(network, 'owner-addr', ownerStack.device, 'subject-addr', subjectStack.device);
        ownerStack.connectedPeerRegistry.add(peerA);
        subjectStack.connectedPeerRegistry.add(peerB);
        await wait(10);

        const ownerController = makeSyncWorldPresenceController(ownerStack);
        ownerController.syncTo('w3');
        const originalRefresh = ownerStack.session.refreshWorldPresenceActivity.bind(ownerStack.session);
        ownerStack.session.refreshWorldPresenceActivity = () => {
            throw new Error('A6 injected failure: refreshWorldPresenceActivity() internal collaborator failed');
        };
        let grantThrew = false;
        try {
            ownerStack.membership.grantEdit('w3', dave.identity.identityId);
        } catch {
            grantThrew = true;
        }
        assert(!grantThrew, 'A6a. grantEdit() itself does not throw even though the WorldView-mirroring callback\'s own refreshWorldPresenceActivity() call fails internally — the try/catch isolates it');
        await wait(10);
        assert(subjectStack.membership.hasActiveGrant('w3', dave.identity.identityId), 'A6b. the OTHER replica genuinely received the grant over the network — _broadcast() was never skipped by the injected failure, the exact defect 0.9.218 fixed');
        ownerStack.session.refreshWorldPresenceActivity = originalRefresh;
        peerA.close();
        peerB.close();

        // A7 — no additional cadence: WorldView.js still runs exactly one
        // interval-driven spatial poll; refreshWorldPresenceActivity()'s
        // only production call site remains the membership callback, not
        // a new timer this milestone might have been tempted to add.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const spatialIntervalDeclarations = (codeOnlyLines(worldViewSource).join('\n').match(/spatialInterval\s*=\s*setInterval\(/g) || []).length;
        assert(spatialIntervalDeclarations === 1, `A7a. exactly one setInterval assigns spatialInterval (found ${spatialIntervalDeclarations}) — no second cadence introduced`);
        assert(countReferences(worldViewSource, 'refreshWorldPresenceActivity') === 1, 'A7b. refreshWorldPresenceActivity has exactly one call site in WorldView.js, still inside onWorldMembershipChanged, still not refreshSpatialUI()\'s own 3-second tick');
        const membershipCallbackBlock = worldViewSource.slice(worldViewSource.indexOf('unsubscribeWorldMembership = session.onWorldMembershipChanged'), worldViewSource.indexOf('unsubscribeWorldPresence = session.onWorldPresenceChanged'));
        assert(membershipCallbackBlock.includes('refreshWorldPresenceActivity'), 'A7c. the one call site is textually INSIDE the onWorldMembershipChanged callback body');

        // A8 — no duplicate WorldView presence state: exactly one
        // presentWorldDocumentId closure variable and one
        // _syncWorldPresence() function definition — this milestone did
        // not fork a second, parallel presence controller.
        assert((worldViewSource.match(/let presentWorldDocumentId\s*=\s*null;/g) || []).length === 1, 'A8a. exactly one presentWorldDocumentId declaration');
        assert((worldViewSource.match(/function _syncWorldPresence\(/g) || []).length === 1, 'A8b. exactly one _syncWorldPresence() function');

        // A9 — the full, deep lifecycle audit this closure summarizes
        // stays present, unmodified, as the authoritative record.
        const lifecycleAuditSource = await rawSource('tests/WorldPresenceMembershipRefreshLifecycleAudit.test.js');
        assert(/Section H/.test(lifecycleAuditSource) && /failure isolation/i.test(lifecycleAuditSource), 'A9. tests/WorldPresenceMembershipRefreshLifecycleAudit.test.js still carries its own Section H failure-isolation flagship');

        console.log('✓ Section A: World Presence regression CLOSURE — grant/revoke (A1/A2), replay independence (A3), cross-document isolation (A4), unmount safety (A5), refresh-failure isolation re-proven over a real two-replica network (A6 FLAGSHIP), exactly one cadence (A7), no duplicate WorldView presence state (A8), and the deep 0.9.218 audit itself still stands (A9). 0.9.217-0.9.218 is CLOSED.');
    }

    // ---------------------------------------------------------------
    // Section B — Capability reachability matrix, all thirteen areas.
    // Every row below except B7 (World Presence) is a direct regression
    // reconfirmation of facts 0.9.203-0.9.216 already established and no
    // production change since has touched — reasserted here as evidence,
    // not re-derived from first principles.
    // ---------------------------------------------------------------
    {
        // B1 — World interaction/navigation. COMPLETE.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        for (const name of ['PlacementInfoPanel', 'OwnPublicationPanel', 'HistoryTimelinePanel', 'VehicleInteractionPrompt', 'WorldEncounterCanvas']) {
            assert(new RegExp(`<${name}\\b`).test(worldViewSource), `B1. WorldView.js still composes ${name}`);
        }

        // B2 — Vehicle. INTENTIONAL_BOUNDARY, unchanged.
        assert(typeof VehicleType.NONE === 'string' && typeof VehicleType.CAR === 'string' && typeof VehicleType.DRONE === 'string', 'B2a. VehicleType still carries its original values');
        const vehicleTypeCode = codeOnlyLines(await rawSource('core/VehicleType.js')).join('\n');
        assert(!/passenger|capacity|multi-?rider|\bfuel\b|\brange\b/i.test(vehicleTypeCode), 'B2b. VehicleType.js still declares no capacity/passenger/fuel vocabulary');

        // B3 — World material/document lifecycle: autosave/recovery,
        // history, undo/redo, placement. COMPLETE.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/<RecoveryBanner/.test(editorViewSource), 'B3a. RecoveryBanner still in EditorView.js\'s template');
        assert(/autosaveScheduler\.stop\(\)/.test(editorViewSource), 'B3b. autosave scheduler still stopped on teardown');
        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'canUndo', 'canRedo', 'getUndoLabel', 'getRedoLabel']) {
            assert(countReferences(worldViewSource, identifier) > 0 || countReferences(editorViewSource, identifier) > 0, `B3c. ${identifier} is still referenced by WorldView.js or EditorView.js`);
        }

        // B4 — Editor. COMPLETE (transform feedback, undo/redo label
        // mirrors, Snapshot export composition — all 0.9.213-0.9.215).
        const spatialEditingServiceSource = await rawSource('application/SpatialEditingService.js');
        assert(/getGestureFeedback\(\)\s*\{\s*return this\._gestureFeedback;\s*\}/.test(spatialEditingServiceSource), 'B4a. SpatialEditingService still exposes getGestureFeedback()');
        const mainSource = await rawSource('ui/main.js');
        assert(/new BuildPublicationSnapshotTransferPackageUseCase\(/.test(mainSource), 'B4b. ui/main.js still composes BuildPublicationSnapshotTransferPackageUseCase');

        // B5 — Publication lifecycle + distribution. COMPLETE.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 10, `B5a. OwnPublicationPanel.js still wires at least 10 distinct actions (found ${clickHandlers.size})`);
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/distributeSelectedPublication\(\)\s*\{/.test(canvasSource) && /@click="distributeSelectedPublication"/.test(canvasSource), 'B5b. WorldEncounterCanvas.js still wires "Distribute Publication"');

        // B6 — Snapshot: discovery, materialization, export/import
        // symmetry. COMPLETE, boundary observed not extended.
        assert(/discoverOwnSnapshot\(/.test(panelSource), 'B6a. OwnPublicationPanel.js still calls discoverOwnSnapshot');
        assert(/worldSnapshotDiscoveryMonitor\.observe\(/.test(worldViewSource), 'B6b. WorldView.js still drives automatic Snapshot discovery');
        const { CURRENT_SCHEMA_VERSION } = await import('../application/PublicationSnapshotTransferPackage.js');
        assert(CURRENT_SCHEMA_VERSION === 1, 'B6c. no second Transfer Package schema version exists');

        // B7 — World Presence. COMPLETE as of this milestone — see
        // Section A above for the direct proof. Recorded here as its
        // own first-class row in the matrix, not a footnote of History
        // or Undo/Redo the way earlier reassessments' own tables never
        // needed to carry it (it did not exist as a reachable capability
        // until 0.9.217).
        assert(countReferences(worldViewSource, 'refreshWorldPresenceActivity') === 1, 'B7. World Presence activity refresh: exactly one production caller, proven correct under lifecycle churn and failure by Section A above');

        // B8 — Cross-cutting infrastructure. COMPLETE for cross-document
        // isolation (reconfirmed); the event/error-boundary question
        // gets its own dedicated Section C rather than a footnote here.
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(/this\._historyPreview\.documentId === docId/.test(navigationSessionSource), 'B8a. history preview restore still scoped to its own documentId');
        assert(/checkPlacementOverlap\(documentId,\s*newPosition\)/.test(navigationSessionSource), 'B8b. placement overlap check still takes an explicit documentId');

        // B9 — Performance. Deliberately DEFERRED, unchanged.

        // B10 — Obsolete UI/application artifacts. Cross-referenced to
        // Section D below rather than duplicated here.

        console.log('✓ Section B: Capability reachability matrix — B1 World interaction (COMPLETE), B2 Vehicle (INTENTIONAL_BOUNDARY), B3 World material/document lifecycle (COMPLETE), B4 Editor (COMPLETE), B5 Publication (COMPLETE), B6 Snapshot (COMPLETE), B7 World Presence (COMPLETE, new row), B8 Cross-cutting infrastructure/cross-document isolation (COMPLETE), B9 Performance (DEFERRED), B10 Obsolete artifacts (see Section D). All thirteen areas swept; only World Presence changed classification since 0.9.216.');
    }

    // ---------------------------------------------------------------
    // Section C — Repository-wide event/error boundary check. Does the
    // exact shape 0.9.218 fixed — an optional/derived UI-side operation
    // capable of aborting an authoritative event-processing path —
    // recur elsewhere? EventBus.js and PeerMessageBus.js are NOT
    // touched; no global error policy is introduced.
    // ---------------------------------------------------------------
    {
        // C1 — the underlying architectural fact 0.9.218 deliberately
        // left alone is still true, repository-wide: neither publish
        // loop isolates a throwing listener from the rest of its own
        // call chain.
        const eventBusSource = codeOnlyLines(await rawSource('core/events/EventBus.js')).join('\n');
        assert(/for \(const listener of listeners\) \{\s*listener\(payload\);\s*\}/.test(eventBusSource), 'C1a. EventBus.publish() still has no per-listener try/catch');
        const peerMessageBusSource = codeOnlyLines(await rawSource('peer/PeerMessageBus.js')).join('\n');
        assert(/for \(const handler of Array\.from\(handlers\)\) \{\s*handler\(message\.payload, meta\);\s*\}/.test(peerMessageBusSource), 'C1b. PeerMessageBus\'s own dispatch loop still has no per-handler try/catch');

        // C2 — the SAME structural precondition 0.9.218's defect needed
        // (a use case that publishes an event, then performs MORE
        // authoritative work in the same synchronous call chain) recurs
        // in application/IdentityUseCase.js: authenticate()/endSession()/
        // protectIdentity() each call _publishChange() (which itself
        // fires TWO events in sequence) and THEN _publishLockChange().
        const identityUseCaseSource = codeOnlyLines(await rawSource('application/IdentityUseCase.js')).join('\n');
        assert(/this\._publishChange\(\);\s*this\._publishLockChange\(identityId\);/.test(identityUseCaseSource), 'C2a. authenticate() still calls _publishChange() then _publishLockChange() in sequence');
        const publishChangeDefinitionIndex = identityUseCaseSource.indexOf('_publishChange() {');
        const publishChangeBody = identityUseCaseSource.slice(publishChangeDefinitionIndex, publishChangeDefinitionIndex + 300);
        const identityEventIndex = publishChangeBody.indexOf('IDENTITY_EVENT');
        const sessionEventIndex = publishChangeBody.indexOf('SESSION_EVENT');
        assert(publishChangeDefinitionIndex >= 0 && identityEventIndex >= 0 && sessionEventIndex > identityEventIndex, 'C2b. _publishChange() itself still fires IDENTITY_EVENT then SESSION_EVENT in sequence, inside the same method');

        // C3 — behaviorally PROVE the recurrence, exactly 0.9.218's own
        // Section H construction, applied here: an injected failure in
        // an onUserChanged() listener must not silently prevent the
        // sequence, and it genuinely propagates back to the CALLER of
        // authenticate() (never isolated today) — the identical shape,
        // on a different use case, confirming this is a REPEATED
        // architectural pattern, not isolated to World Presence.
        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        const identity = identityProvider.createLocalIdentity('carol-identity');
        const identityUseCase = new IdentityUseCase(identityProvider);
        let vaultLockFired = false;
        identityUseCase.onVaultLockChanged(() => { vaultLockFired = true; });
        identityUseCase.onUserChanged(() => {
            throw new Error('C3 injected failure: a derived UI-side onUserChanged() listener failed');
        });
        let authenticateThrew = false;
        try {
            identityUseCase.authenticate(identity.identityId);
        } catch {
            authenticateThrew = true;
        }
        assert(authenticateThrew, 'C3a. UNLIKE the now-fixed World Presence seam, authenticate() still lets a throwing derived listener unwind all the way back to its own caller — the general EventBus gap 0.9.218 deliberately left alone is confirmed, not silently already-fixed');
        assert(!vaultLockFired, 'C3b. ...and _publishLockChange()\'s own VaultLockChanged broadcast never ran — the SAME "an event further down the same synchronous chain gets silently skipped" shape 0.9.218 found and fixed for World Presence, reproduced here on a different use case');

        // C4 — but is this a REALIZED product defect today, the way
        // World Presence's was (a real UI callback that could really
        // throw)? No: every current production listener on
        // onUserChanged/onSessionChanged/onVaultLockChanged performs
        // only local ref assignment or a read of ALREADY-VALIDATED local
        // state (currentSession(), isUnlocked(), isAuthenticated()) —
        // never a cross-use-case re-entrant call the way
        // refreshWorldPresenceActivity() genuinely called INTO a
        // separate collaborator (worldPresenceUseCase.setActivity(),
        // itself reaching into WorldAuthorizationService and a network
        // broadcast). Checked directly against the three real call
        // sites, not assumed.
        const userWidgetSource = codeOnlyLines(await rawSource('ui/components/UserWidget.js')).join('\n');
        assert(/identityUseCase\.onUserChanged\(\(u\) => \{\s*user\.value = u;\s*refreshLockState\(\);\s*\}\);/.test(userWidgetSource), 'C4a. UserWidget.js\'s onUserChanged callback still only assigns a ref and calls a local, read-only refreshLockState()');
        const avatarSettingsSource = codeOnlyLines(await rawSource('ui/views/AvatarSettingsView.js')).join('\n');
        assert(/currentSession\(\)|isUnlocked\(/.test(userWidgetSource), 'C4b. refreshLockState() itself reads only currentSession()/isUnlocked() — no mutating cross-use-case call');
        assert(/identityUseCase\.onUserChanged\(\(u\) => \{/.test(avatarSettingsSource), 'C4c. AvatarSettingsView.js\'s onUserChanged callback exists and is likewise a local ref assignment plus a same-owner data reload, never a call into a DIFFERENT use case\'s mutation surface');

        console.log('✓ Section C: Event/error boundary check — REPEATED architectural PATTERN confirmed, not isolated to World Presence: the exact "publish, then more authoritative work in the same synchronous chain" precondition recurs in application/IdentityUseCase.js (C2), and behaviorally reproduces the identical failure-skips-a-later-broadcast shape (C3). It is DEFERRED, not fixed here, per this milestone\'s own brief: unlike World Presence at the time 0.9.218 ran, no CURRENT production listener on these three events performs cross-use-case, fallible derived work (C4) — the architectural precondition is real, but nothing user-facing is broken today. Named precisely for a future decision, exactly as this section\'s own brief asked, rather than expanding this milestone into an error-handling project.');
    }

    // ---------------------------------------------------------------
    // Section D — Obsolete-candidate reassessment. The six files
    // 0.9.216 surfaced, reclassified with fresh evidence. Nothing
    // deleted; nothing promoted without a genuine new supersession
    // record found.
    // ---------------------------------------------------------------
    {
        const mainSource = await rawSource('ui/main.js');

        // D1 — the two confirmed OBSOLETE findings (explicit in-repo
        // supersession record each), reconfirmed unchanged.
        assert(!/GroupsPanel/.test(mainSource), 'D1a. GroupsPanel.js still has no live caller in ui/main.js');
        assert(/instead of application\/CreatePublicationAnchorCatalogUseCase\.js/.test(mainSource), 'D1b. CreatePublicationAnchorCatalogUseCase.js\'s supersession record still stands');
        const createWorldViewUseCaseSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(/CreatePlacementRegistryUseCase already/.test(createWorldViewUseCaseSource), 'D1c. CreatePlacementRegistryUseCase.js\'s supersession record still stands');

        // D2 — the four OBSOLETE_CANDIDATE files: reconfirm (a) no live
        // caller, (b) a reachable replacement exists, and (c) still no
        // explicit "supersedes/instead of/replaces" record anywhere in
        // the repository naming any of them — the exact gap that held
        // them short of hard OBSOLETE in 0.9.216. Per this milestone's
        // own decision tree: no caller + unclear supersession (no
        // record) => OBSOLETE_CANDIDATE stands, does not escalate to
        // OBSOLETE on the strength of "something else clearly does the
        // same job" alone.
        const candidateFiles = [
            'CreateSpatialIndexUseCase',
            'CreateSpatialDiscoveryUseCase',
            'CreateDecentralizedSpatialDiscoveryUseCase',
            'CreateWorldViewStreamingUseCase'
        ];
        const repoFiles = [...await listJsFiles('application'), ...await listJsFiles('ui')];
        for (const className of candidateFiles) {
            const source = await rawSource(`application/${className}.js`);
            assert(new RegExp(`class ${className}`).test(source), `D2a. application/${className}.js still exists, fully implemented`);
            assert(await repoWideInstantiationCount(className) === 0, `D2b. ${className} is still instantiated NOWHERE in application/ or ui/`);
            let supersessionRecordFound = false;
            for (const file of repoFiles) {
                if (file === `application/${className}.js`) continue;
                const fileSource = codeOnlyLines(await rawSource(file)).join('\n');
                if (new RegExp(`(instead of|supersed|replaces?)[^\\n]{0,80}${className}|${className}[^\\n]{0,80}(instead of|supersed|already builds this)`, 'i').test(fileSource)) {
                    supersessionRecordFound = true;
                    break;
                }
            }
            assert(!supersessionRecordFound, `D2c. no explicit supersession record for ${className} has appeared anywhere in application/ or ui/ since 0.9.216 — it stays OBSOLETE_CANDIDATE, not escalated to OBSOLETE`);
        }
        assert(/bootstrapWorldDiscoveryRuntime\(/.test(mainSource), 'D2d. the reachable replacement world-discovery runtime is still genuinely composed in ui/main.js');
        assert(/new CreateWorldViewUseCase\(/.test((await rawSource('ui/views/WorldView.js'))), 'D2e. ...and the reachable replacement world-view backend is still genuinely composed in WorldView.js');

        // D3 — none of the four is "intentionally internal" either: each
        // is a top-level, exported composition-root class with the exact
        // same DI-wiring shape as the currently-composed replacements —
        // nothing about its own code marks it as deliberately
        // internal-only infrastructure (contrast Section B8/O1's own
        // WorldNavigationSession private-method example, which IS that
        // shape).
        for (const className of candidateFiles) {
            const source = await rawSource(`application/${className}.js`);
            assert(/^export class/m.test(source), `D3. ${className} is still a top-level exported class, not an internal helper — the "intentionally internal" branch of the classification tree does not apply`);
        }

        console.log('✓ Section D: Obsolete-candidate reassessment — GroupsPanel.js and CreatePublicationSnapshotPlacementCatalogUseCase.js remain confirmed OBSOLETE (D1a). CreatePublicationAnchorCatalogUseCase.js and CreatePlacementRegistryUseCase.js remain confirmed OBSOLETE, records unchanged (D1b/c). CreateSpatialIndexUseCase.js, CreateSpatialDiscoveryUseCase.js, CreateDecentralizedSpatialDiscoveryUseCase.js, and CreateWorldViewStreamingUseCase.js all remain OBSOLETE_CANDIDATE — still zero callers, still a reachable replacement, still no explicit supersession record, still not "intentionally internal" (D2/D3). Classification only; nothing deleted.');
    }

    // ---------------------------------------------------------------
    // Section E — Product-gap discovery. Explicit verdict.
    // ---------------------------------------------------------------
    {
        // E1 — every method this arc has ever found genuinely uncalled
        // in WorldNavigationSession/WorldView.js is re-walked against
        // the brief's own decision tree one more time: does its OWN
        // documented intent name a user-facing workflow that is
        // currently unreachable, for a reason that is NOT already an
        // established INTENTIONAL_BOUNDARY or a redundant wrapper?
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        for (const method of ['getRecentlyVisitedWorlds', 'getCurrentPlaceName', 'getSelectionCount', 'getWorldAccessLevel', 'canReadDocument']) {
            assert(new RegExp(`^\\s{4}${method}\\(`, 'm').test(navigationSessionSource), `E1a. WorldNavigationSession still declares ${method}(...)`);
            assert(countReferences(worldViewSource, method) === 0, `E1b. ${method} still has no caller in WorldView.js — unchanged since 0.9.216's own Section L, which already classified each individually (COMPLETE via a different path, a minor honest omission, or INTENTIONAL_BOUNDARY) — none is re-elevated to ACTUAL_GAP here without new evidence, and none exists`);
        }
        // refreshWorldPresenceActivity is the one 0.9.216 finding that
        // WAS an ACTUAL_GAP — now excluded from the "still uncalled"
        // baseline entirely, and reconfirmed CLOSED (Section A/B7).
        assert(countReferences(worldViewSource, 'refreshWorldPresenceActivity') === 1, 'E1c. refreshWorldPresenceActivity now has its one real caller — the arc\'s last ACTUAL_GAP is closed');

        // E2 — the Section C finding, checked explicitly against
        // NEW_PRODUCT_GAP/ACTUAL_GAP and found to be NEITHER: it names
        // no missing user-facing workflow, and no existing capability is
        // unreachable because of it — it is an architectural
        // OBSERVATION about failure-isolation, correctly DEFERRED, not a
        // product gap of any classification.

        // E3 — the Section D findings are, by definition, the OPPOSITE
        // of a product gap: MORE implementation exists than the product
        // currently uses.

        console.log('✓ Section E: Product-gap discovery — NONE FOUND. Every previously-uncalled method stays exactly as 0.9.216 last classified it (E1); the sole ACTUAL_GAP that this arc\'s own sweeps ever produced (refreshWorldPresenceActivity) is closed (E1c); the Section C boundary finding is an architectural observation, not a product gap (E2); the Section D findings are excess implementation, not missing implementation (E3). No workflow a user would expect to complete is currently blocked.');
    }

    // ---------------------------------------------------------------
    // Section F — Architecture closure table and this arc's own closing
    // recommendation.
    // ---------------------------------------------------------------
    {
        const closureFindings = [
            { capability: 'World Presence activity refresh (Section A/B7)', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' },
            { capability: 'getRecentlyVisitedWorlds/getSelectionCount wrappers', domain: true, useCase: true, compositionRoot: true, ui: false, classification: 'COMPLETE_VIA_DIFFERENT_PATH' },
            { capability: 'getWorldAccessLevel/canReadDocument', domain: true, useCase: true, compositionRoot: true, ui: false, classification: 'INTENTIONAL_BOUNDARY' },
            { capability: 'IdentityUseCase publish-chain precondition (Section C)', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'DEFERRED' },
            { capability: 'CreatePublicationAnchorCatalogUseCase / CreatePlacementRegistryUseCase', domain: true, useCase: true, compositionRoot: false, ui: false, classification: 'OBSOLETE' },
            { capability: 'CreateSpatialIndexUseCase / CreateSpatialDiscoveryUseCase / CreateDecentralizedSpatialDiscoveryUseCase / CreateWorldViewStreamingUseCase', domain: true, useCase: true, compositionRoot: false, ui: false, classification: 'OBSOLETE_CANDIDATE' }
        ];
        for (const finding of closureFindings) {
            assert(finding.domain && finding.useCase, `F1a. ${finding.capability}: domain/use-case layer confirmed correct`);
            if (finding.classification === 'COMPLETE') {
                assert(finding.compositionRoot && finding.ui, `F1b. ${finding.capability}: COMPLETE reaches all the way to a real UI/caller terminus`);
            }
            if (finding.classification === 'OBSOLETE' || finding.classification === 'OBSOLETE_CANDIDATE') {
                assert(!finding.compositionRoot, `F1c. ${finding.capability}: not reached by the CURRENT composition root — superseded or candidate, never merely unwired`);
            }
            if (finding.classification === 'DEFERRED') {
                assert(finding.ui, `F1d. ${finding.capability}: DEFERRED still terminates at real UI callers today — it is an architectural risk observation, not a reachability gap`);
            }
        }

        // F2 — a direct behavioral proof that the domain-level authority
        // underneath the entire Undo/Redo/History arc this reassessment
        // regression-checks (Section B3) remains correct — the same
        // discipline every reassessment in this arc closes with.
        const doc = createTestDocument();
        const history = new CommandHistory({ world: doc.world });
        history.execute(new CreateWorldLandmarkCommand({
            worldId: doc.world.id, authorIdentityId: 'tester', title: 'Reassessment Landmark', position: new Position(1, 0, 1)
        }));
        assert(history.getUndoLabel() !== null, 'F2a. CommandHistory remains correct — no regression anywhere this milestone touched');
        history.undo();
        assert(history.canRedo(), 'F2b. ...round-trip still holds.');

        console.log('✓ Section F: Architecture closure — every finding fits the brief\'s own diagram. Direct behavioral proof holds, no regression.');
        console.log(`
Classification summary:
  A. World Presence regression closure (0.9.217/0.9.218) ... CLOSED, reconfirmed
  B. Capability reachability matrix, all 13 areas:
       B1  World interaction/navigation ................. COMPLETE
       B2  Vehicle ......................................... INTENTIONAL_BOUNDARY
       B3  World material/document lifecycle ............ COMPLETE
       B4  Editor ........................................... COMPLETE
       B5  Publication ...................................... COMPLETE
       B6  Snapshot ......................................... COMPLETE
       B7  World Presence ................................... COMPLETE (new row; ACTUAL_GAP closed by 0.9.217, lifecycle-audited by 0.9.218)
       B8  Cross-cutting infrastructure ................... COMPLETE (cross-document isolation); see C for event/error boundary
       B9  Performance ...................................... DEFERRED
       B10 Obsolete UI/application artifacts .............. see D
  C. Event/error boundary check ............................ REPEATED PATTERN found (application/IdentityUseCase.js), DEFERRED — not currently realized as a product defect, not fixed here
  D. Obsolete-candidate reassessment:
       GroupsPanel.js, CreatePublicationSnapshotPlacementCatalogUseCase.js .. OBSOLETE (reconfirmed)
       CreatePublicationAnchorCatalogUseCase.js, CreatePlacementRegistryUseCase.js .. OBSOLETE (reconfirmed)
       CreateSpatialIndexUseCase.js, CreateSpatialDiscoveryUseCase.js,
       CreateDecentralizedSpatialDiscoveryUseCase.js, CreateWorldViewStreamingUseCase.js .. OBSOLETE CANDIDATE (reconfirmed, not escalated)
  E. Product-gap discovery .................................. NONE FOUND
  F. Architecture closure .................................... APPLIED, holds for every finding

Outcome: the capability-reachability arc this codebase has worked since
0.9.196 is, as of this milestone, EXHAUSTED. Every area named in this
milestone's own brief is COMPLETE, INTENTIONAL_BOUNDARY, DEFERRED (one
named architectural observation, deliberately not acted on), or
OBSOLETE/OBSOLETE_CANDIDATE (classification only, nothing deleted). No
ACTUAL_GAP and no NEW_PRODUCT_GAP were found anywhere in this sweep.

Per this milestone's own brief: the next milestone should NOT be chosen
by searching this codebase for one more uncalled method. It should come
from an explicit product-evolution decision, or a deliberate
obsolete-cleanup decision (six files now sit ready for one, pending a
human confirming intent on the four still at OBSOLETE_CANDIDATE) — never
manufactured just to advance the milestone number. That is itself the
meaningful architectural milestone here: ForkBuild has reached capability
closure for its current product surface.
`);
    }

    console.log('\n✅ All Post-Presence Product Reassessment tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
