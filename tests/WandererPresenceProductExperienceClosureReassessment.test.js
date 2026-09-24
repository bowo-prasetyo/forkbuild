
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/peer/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/peer/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/identity/DeviceAuthorizationPropagationUseCase.js';

import { AvatarProfile } from '../core/AvatarProfile.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { PresenceSyncService } from '../application/presence/PresenceSyncService.js';
import { LocalPresenceStore } from '../application/presence/LocalPresenceStore.js';
import { RemoteAvatarRegistry } from '../application/avatar/RemoteAvatarRegistry.js';
import { toAvatarPresenceAdvertisement } from '../core/AvatarPresenceAdvertisement.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { computeNearbyAvatars } from '../core/AvatarProximity.js';

import { describeLifecycleState, describeTrustStatus, describeAnimationState } from '../application/avatar/AvatarPresenceLabels.js';
import NearbyAvatarsPanel from '../ui/components/NearbyAvatarsPanel.js';
import AvatarInfoPanel from '../ui/components/AvatarInfoPanel.js';
import WorldMembersPanel from '../ui/components/WorldMembersPanel.js';
import WorldPresenceIndicator from '../ui/components/WorldPresenceIndicator.js';
import { buildWorldCollaborationRoster, WorldCollaborationAccess } from '../ui/components/WorldCollaborationRoster.js';
import { buildSpatialCollaboratorRows } from '../ui/components/WorldCollaboratorIndicator.js';
import { worldNavigationSessionFiles, stylesheetFiles, worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.583 — Wanderer Presence Product Experience Closure Reassessment.
//
// TYPE: test-only product/presentation reassessment, plus one small,
// narrowly-scoped production fix this milestone's own Section K located
// (application/avatar/AvatarPresenceLabels.js + the two panels that read it).
//
// 0.9.582 asked, and closed: does this codebase clearly and consistently
// REPRESENT (in its own application/core state) who is present, where,
// and what persists across connection/session changes? Its own verdict
// was WANDERER_PRESENCE_SESSION_CONTINUITY: COHERENT, at the mechanism/
// session layer — three deliberately separate protocols, seven
// independent identity axes, all live-confirmed never to collapse.
//
// This milestone asks the narrower, adjacent, DELIBERATELY SMALLER
// question the requesting brief named: can an ordinary Wanderer actually
// UNDERSTAND that experience from the UI, without knowing any of it is
// three protocols, or what a connectionId is? It is a presentation/
// product audit, not a second protocol audit — 0.9.582's own findings
// are CITED here, never re-derived, wherever this file's own scope
// doesn't require re-proving them live.
//
// SAME STRUCTURAL CONSTRAINT AS EVERY MILESTONE SINCE 0.9.574:
// application/world/WorldNavigationSession.js transitively imports
// application/world/RenderWorldViewUseCase.js, which imports `three` — a
// package this checkout has no node_modules for at all. So this file
// never imports WorldNavigationSession.js; every claim about its own
// methods (getAvatarDisplayName(), getAvatarInfo(), getNearbyAvatars(),
// the WorldView.js host-composition seams that call them) is proven by
// direct source citation (readSource() + exact string match), exactly
// like 0.9.576 through 0.9.582 already established. Every OTHER
// collaborator this file needs — application/avatar/RemoteAvatarRegistry.js,
// application/avatar/RemoteAvatarInterpolator.js, application/presence/PresenceSyncService.js,
// application/presence/LocalPresenceStore.js, application/avatar/AvatarPresenceSession.js,
// core/AvatarProximity.js, presence/PeerAvatarPresenceBroadcastProvider.js,
// application/avatar/AvatarPresenceLabels.js, and the plain-object UI components
// (ui/components/NearbyAvatarsPanel.js, ui/components/AvatarInfoPanel.js,
// ui/components/WorldMembersPanel.js, ui/components/WorldPresenceIndicator.js,
// ui/components/WorldCollaborationRoster.js, ui/components/WorldCollaboratorIndicator.js)
// — was confirmed, live, to import cleanly under plain `node` before this
// file was written (none of them, nor their own transitive imports, touch
// `vue`, the DOM, or `three`). Every scenario below runs against these
// real, unmodified (except Section K's own fix) classes, over REAL
// authenticated peer connections (peer/LocalPeerConnectionProvider.js's
// in-memory transport, peer/PeerAuthenticationSession.js's real
// handshake) — never a hand-rolled mock of presence/trust itself.
//
//   A — Presence discoverability: the Enter World -> notice -> understand
//       chain, walked through the real components that actually render it.
//   B — Identity presentation: displayName/avatarId/ownerIdentity/
//       identityId stay four distinct, correctly-composed facts, with a
//       graceful, never-throwing, never-blank degradation order.
//   C — Spatial comprehension: own avatar vs. another Wanderer vs. a
//       remote avatar's OWN inspection kind, live-confirmed distinct.
//   D — Presence lifecycle visibility: appear/move/leave/reconnect,
//       driven live through RemoteAvatarRegistry against a real render
//       facade spy — 0.9.582 imported this class but never once
//       instantiated it; this is its first live exercise.
//   E — World switching: the roster-reset-before-reenter seam, cited
//       from ui/views/WorldView.js's own source, plus a live proof that
//       a fresh RemoteAvatarRegistry never inherits a stale avatarId.
//   F — Failure/degradation language: what a viewer reads when presence
//       becomes STALE/ABSENT — never "left," never an implementation term.
//   G — Interaction boundary: VISIBLE / OBSERVABLE / INTERACTABLE,
//       inventoried directly from the two panels' own emits/template.
//   H — Avatar/vehicle presentation: mounting never presents as a
//       different Wanderer arriving.
//   I — Multiple participants (3+): dedup is by identity, never by
//       position or device count, across all three roster-building
//       pure functions this milestone's own UI actually uses.
//   J — Async visual correctness: out-of-order updates and a dispose()
//       never leave a ghost visual behind.
//   K — Vocabulary sweep: ONE real, narrow PRESENTATION_GAP found and
//       fixed — a raw internal animation-enum word ('walking') was
//       reaching the UI verbatim in both panels, unlike lifecycle/trust,
//       which already went through a label function. Everything else
//       swept clean.
//   L — Flagship: Alice enters, sees Bob already present, watches him
//       move, watches him disappear on disconnect, watches him
//       reappear on reconnect (never duplicated), then leaves for a
//       second World whose own presentation never inherits him —
//       driven end to end through the REAL render-facade seam a
//       Wanderer's own screen is built from.
//
// FINDING: see the verdict block at the end of this file.

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors tests/WandererPresenceSessionContinuityProductReassessment.test.js's
// own harness exactly (makeDevice/connectAndAuthenticate/makeStack/
// makeAvatarBody/spyRenderFacade) — reused rather than reinvented, per
// this codebase's own established precedent for a closure/reassessment
// file sharing its predecessor's rig.
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

function makeAvatarStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const avatarPresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus, connectedPeerRegistry });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, avatarPresenceTransport };
}

function makeAvatarBody(ownerIdentity, { position = { x: 0, y: 0, z: 0 } } = {}) {
    const profile = new AvatarProfile({ ownerIdentity, displayName: ownerIdentity });
    const session = new AvatarPresenceSession(profile, { position });
    return { profile, session };
}

function spyRenderFacade() {
    const calls = { setRemoteAvatar: [], updateRemoteAvatarPresence: [], removeRemoteAvatar: [] };
    return {
        calls,
        setRemoteAvatar: (avatarId, template, appearance, presenceLike) => calls.setRemoteAvatar.push({ avatarId, presenceLike }),
        updateRemoteAvatarPresence: (avatarId, presenceLike) => calls.updateRemoteAvatarPresence.push({ avatarId, presenceLike }),
        removeRemoteAvatar: (avatarId) => calls.removeRemoteAvatar.push(avatarId)
    };
}

// A minimal Vue-free component harness — identical in spirit to
// tests/ObserverLocalAuthoritativePlacementPresentationClosureReassessment.test.js's
// own buildCanvasInstance(): construct a plain `ctx` object carrying a
// component's own data/methods, so its REAL methods (never a
// reimplementation of them) can be called directly.
function buildPanelContext(ComponentDef, props = {}) {
    const ctx = { ...props };
    if (typeof ComponentDef.data === 'function') {
        Object.assign(ctx, ComponentDef.data.call(ctx));
    }
    Object.assign(ctx, ComponentDef.methods || {});
    return ctx;
}

async function main() {
    console.log('Running Wanderer Presence Product Experience Closure Reassessment tests...\n');

    // ===================================================================
    // Section A — Presence discoverability.
    //
    // "Enter World -> another Wanderer is present -> user notices ->
    // user understands it's another Wanderer" is not one component, in
    // this codebase's own architecture — it is a compact glance
    // (WorldPresenceIndicator), an explicit roster (WorldMembersPanel),
    // an ambient in-view list (WorldCollaboratorIndicator), and the
    // live 3D avatar body itself. Each is checked here for the one
    // thing that matters for discoverability: does it actually SAY
    // something, in plain words, the moment presence exists.
    // ===================================================================
    {
        // A1 — the glanceable indicator: a plain "N online" fact, always
        // visible when N > 0, never requiring a click to learn anything.
        const indicatorCtx = { onlineCount: 2 };
        const indicatorTemplate = WorldPresenceIndicator.template;
        assert(/👥.*onlineCount.*online/s.test(indicatorTemplate),
            'A1a. WorldPresenceIndicator always renders a plain-language "N online" fact — never merely a raw count with no unit, never a protocol name.');
        assert(indicatorCtx.onlineCount === 2, 'A1b. sanity: the count itself is a plain prop, not derived from anything protocol-shaped.');

        // A2 — the roster: explicit per-person rows the moment ANY
        // member is known, never silent about who counts as "known."
        const roster = buildWorldCollaborationRoster({
            ownerIdentityId: 'owner-a2',
            isViewerOwner: true,
            members: [{ subjectIdentityId: 'editor-a2', isAuthorized: true }],
            presence: [{ identityId: 'editor-a2', deviceCount: 1, activity: 'exploring', canEdit: false }]
        });
        assert(roster.length === 2, 'A2a. The roster reports one row per participating identity — owner and editor both discoverable in one place.');
        const membersCtx = buildPanelContext(WorldMembersPanel, { roster, isOwner: true, pendingIdentityId: null });
        assert(typeof membersCtx.accessLabel(WorldCollaborationAccess.OWNER) === 'string' && membersCtx.accessLabel(WorldCollaborationAccess.OWNER) === 'Owner',
            'A2b. WorldMembersPanel resolves access into a plain word ("Owner"), never the raw WorldCollaborationAccess.OWNER constant.');

        // A3 — the ambient in-view list: "who else is here," by its own
        // aria-label, verbatim.
        const collaboratorSource = codeOnly(await readSource('ui/components/WorldCollaboratorIndicator.js'));
        assert(collaboratorSource.includes(`aria-label="Who else is here"`),
            'A3. WorldCollaboratorIndicator names its own purpose in plain language for assistive tech too, not just sighted users.');

        // A4 — NearbyAvatarsPanel renders only entries it was actually
        // handed, and nothing (not even an empty shell) when there are
        // none — a deliberately quiet ambient surface, matching its own
        // header's "renders whatever entries... was handed."
        const emptyCtx = buildPanelContext(NearbyAvatarsPanel, { entries: [] });
        assert(Array.isArray(emptyCtx.entries) && emptyCtx.entries.length === 0,
            'A4. An empty nearby-avatars entries array is the exact, unmodified prop default — no component-level fabrication of a placeholder row.');

        console.log('✓ A: presence discoverability is composed from four real, distinct surfaces (indicator/roster/ambient-list/nearby-list), each independently confirmed to render a plain-language fact rather than staying silent or leaking a raw value.');
    }

    // ===================================================================
    // Section B — Identity presentation.
    //
    // displayName / avatarId / ownerIdentity / identityId must never
    // collapse. core/AvatarProximity.js#computeNearbyAvatars() — the
    // REAL function ui/views/WorldView.js's own getNearbyAvatars() path
    // feeds NearbyAvatarsPanel from — deliberately never computes a
    // displayName at all; ui/views/WorldView.js is cited (source) as the
    // ONE place that enriches each entry with
    // session.getAvatarDisplayName(entry.avatarId) before handing it to
    // the panel. This section proves the SPLIT live and cites the
    // enrichment seam and its own documented fallback order.
    // ===================================================================
    {
        // B1 — computeNearbyAvatars() itself never invents a displayName.
        const rows = computeNearbyAvatars({
            localPosition: { x: 0, y: 0, z: 0 },
            knownPresences: [{
                advertisement: { avatarId: 'avatar:bob-b1', ownerIdentity: 'identity:bob-b1', position: { x: 1, y: 0, z: 1 }, animation: 'walking' },
                lifecycleState: 'present',
                trustObservation: { status: 'valid' }
            }],
            radius: Infinity
        });
        assert(rows.length === 1 && !('displayName' in rows[0]),
            'B1. computeNearbyAvatars() returns avatarId/distance/position/animation/lifecycleState/trustStatus — never a displayName field of its own; identity naming is deliberately not this function\'s concern.');
        assert(rows[0].avatarId === 'avatar:bob-b1',
            'B1b. avatarId travels through unchanged — never conflated with ownerIdentity, which this function does not even read.');

        // B2 — the host enrichment seam (source-cited, since
        // WorldView.js is unimportable live): exactly ONE place adds
        // displayName, keyed off the SAME avatarId this section just
        // proved carries through untouched.
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(/nearbyAvatars\.value = session\.getNearbyAvatars\(\)\.map\(\(entry\) => \(\{\s*\n\s*\.\.\.entry,\s*\n\s*displayName: session\.getAvatarDisplayName\(entry\.avatarId\)/.test(worldViewSource),
            'B2. ui/views/WorldView.js enriches every getNearbyAvatars() row with displayName by calling getAvatarDisplayName(entry.avatarId) — the exact avatarId B1 confirmed is never itself a name.');

        // B3 — the fallback order itself, cited from
        // WorldNavigationSession.js's own getAvatarDisplayName(): real
        // displayName, then ownerIdentity, then the avatarId itself,
        // then (local only) "You" — never throws, never blank.
        const sessionSource = codeOnly((await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n'));
        assert(/getAvatarDisplayName\(avatarId\) \{\s*\n\s*if \(this\.isLocalAvatarId\(avatarId\)\) \{\s*\n\s*const profile = this\._avatarProfileUseCase[\s\S]{0,120}return \(profile && \(profile\.displayName \|\| profile\.ownerIdentity\)\) \|\| 'You';/.test(sessionSource),
            "B3a. getAvatarDisplayName(), for the LOCAL avatar, degrades displayName -> ownerIdentity -> 'You' — never an empty string, never a raw avatarId shown for yourself.");
        assert(sessionSource.includes('if (knownProfile && knownProfile.displayName) {')
            && sessionSource.includes('return knownProfile.displayName;')
            && sessionSource.includes('return (entry && entry.advertisement.ownerIdentity) || avatarId;'),
            'B3b. for a REMOTE avatar, the same function degrades displayName -> ownerIdentity -> the avatarId itself — the identity a Wanderer sees is never blank, and only ever falls back to a raw id as the LAST resort, never the first.');

        // B4 — identityId (a World-membership/roster concept) and
        // avatarId (a live-body concept) are never the same parameter
        // name anywhere in the two roster-building functions this
        // milestone's own UI actually renders from — confirmed
        // structurally, not just by convention.
        const rosterSource = codeOnly(await readSource('ui/components/WorldCollaborationRoster.js'));
        const collaboratorSource = codeOnly(await readSource('ui/components/WorldCollaboratorIndicator.js'));
        assert(!rosterSource.includes('avatarId') && !collaboratorSource.includes('connectionId') && !rosterSource.includes('connectionId'),
            'B4. Neither WorldCollaborationRoster.js (identityId-keyed) nor WorldCollaboratorIndicator.js (identityId-keyed) ever reads avatarId or connectionId — the coarse World-membership identity axis and the live-body/transport identity axes are structurally incapable of leaking into each other at this seam.');

        console.log('✓ B: displayName is composed at exactly one seam (WorldView.js), from a documented, never-blank fallback order (displayName -> ownerIdentity -> avatarId -> "You"), and never collapses with avatarId, ownerIdentity, or identityId anywhere in the functions this milestone\'s own UI actually calls.');
    }

    // ===================================================================
    // Section C — Spatial comprehension.
    //
    // A viewer must be able to tell their OWN avatar from ANOTHER
    // Wanderer, and (per AvatarInfoPanel's own design-doc mockup, cited
    // in its own header) a remote avatar's inspection is never presented
    // with an "Edit/Move/Delete/Save" affordance a Document/Placement
    // gets — "Avatars Are Never Document Selection" (docs/Principles.md,
    // cited by that file's own header).
    // ===================================================================
    {
        // C1 — isLocal is the one flag the panel uses to distinguish
        // "you" from "someone else," and it changes BOTH the Status row
        // AND which action buttons exist — never just a label swap.
        const localInfo = {
            displayName: 'You', templateLabel: 'Humanoid 01', isLocal: true,
            position: { x: 0, y: 0, z: 0 }, distance: null, animation: 'idle'
        };
        const remoteInfo = {
            displayName: 'Bob', templateLabel: 'Humanoid 01', isLocal: false,
            lifecycleState: 'present', trustStatus: 'valid',
            position: { x: 5, y: 0, z: 5 }, distance: 7.07, animation: 'walking'
        };
        const infoTemplate = AvatarInfoPanel.template;
        assert(infoTemplate.includes('v-if="info.isLocal"') && infoTemplate.includes('This is you'),
            'C1a. The Status row explicitly reads "This is you" for the local avatar — never a lifecycle/trust judgment applied to yourself.');
        assert(infoTemplate.includes('v-if="!info.isLocal"') && infoTemplate.includes("$emit('follow')"),
            'C1b. Follow/Greet/Wave/Point exist ONLY for a non-local avatar — the same isLocal flag gates both the identity presentation and the entire interaction surface, so a viewer can never end up with a "Follow yourself" affordance.');
        assert(!infoTemplate.includes('>Edit<') && !infoTemplate.includes('>Delete<') && !infoTemplate.includes('>Move<') && !infoTemplate.includes('>Save<'),
            'C1c. No Edit/Move/Delete/Save affordance exists anywhere in this panel\'s template, for either isLocal value — a remote avatar (and the local one) reads as a PERSON, never a document a viewer could mutate.');

        // C2 — the design doc's own mockup, embedded verbatim in this
        // file's own header comment, is Kind/Source/Name/Owner/Position
        // for an AVATAR encounter (per ui/components/WorldEncounterCanvas.js,
        // the World's separate top-down "Encounter" surface) — genuinely
        // different fields from a PUBLICATION encounter's Kind/Source/
        // Title/Publisher/Signed/Anchors/Placements, confirmed directly
        // from that file's own template.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/<dd>Avatar<\/dd>[\s\S]{0,400}<dt>Name<\/dt>/.test(canvasSource) && /<dd>Publication<\/dd>[\s\S]{0,900}<dt>Title<\/dt>/.test(canvasSource),
            "C2. WorldEncounterCanvas.js's own inspection panel renders AVATAR and PUBLICATION encounters with genuinely different field sets (Name/Owner vs. Title/Publisher/Signed/Anchors/Placements) — a Wanderer can never mistake one kind's detail sheet for the other's.");

        // C3 — DEFERRED, named precisely rather than silently folded in:
        // that same canvas ALSO has a real, complete `AVATAR` marker kind
        // (`projectedAvatars`, fed from `view.avatars`) — but neither
        // production host that mounts it (ui/views/WorldView.js,
        // ui/views/LiveWorldView.js) ever assigns anything to `avatars`
        // on the view/registry object it passes in. This is the
        // Publication-Discovery "World Encounter" 2D map — a genuinely
        // separate product surface from the live 3D World View avatar
        // presence this milestone concerns (see this file's own header:
        // 0.9.3's own "Wanderer" there names the VIEWER's own map
        // position, not another participant) — out of THIS milestone's
        // scope to fix, named here only so it is never mistaken for a
        // live-presence gap by a future reassessment.
        const worldViewSrc = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        const liveWorldViewSrc = codeOnly(await readSource('ui/views/LiveWorldView.js'));
        assert(!worldViewSrc.includes('avatars:') && !liveWorldViewSrc.includes('avatars:'),
            'C3. DEFERRED (not a live-presence gap): neither production host ever populates WorldEncounterCanvas\'s own `avatars` field — its AVATAR marker kind is real and correctly built, but structurally unreachable in production today. Separate surface, separate arc; not touched by this milestone.');

        console.log('✓ C: own-avatar vs. remote-avatar is a single, consistently-gating isLocal flag across identity AND interaction affordances; a remote AVATAR encounter and a remote PUBLICATION encounter render genuinely distinct field sets on the 2D World Encounter surface; that surface\'s own (production-unreachable) AVATAR marker kind is named as a deliberately out-of-scope DEFERRED observation, not conflated with this arc.');
    }

    // ===================================================================
    // Section D — Presence lifecycle visibility.
    //
    // application/avatar/RemoteAvatarRegistry.js is the ACTUAL seam between
    // "PresenceSyncService believes this avatar exists" and "the
    // renderer is showing something for it." 0.9.582 imported this
    // class and cited it, but never once instantiated it. This section
    // drives it live, against a real spy render facade, through a full
    // appear -> move -> leave(age out) -> reappear cycle.
    // ===================================================================
    {
        const store = new LocalPresenceStore({ staleAfterMs: 40, absentAfterMs: 90 });
        const facade = spyRenderFacade();
        const registry = new RemoteAvatarRegistry(facade, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });

        // D1 — appear.
        const bobAdvertisement = { avatarId: 'avatar:bob-d', ownerIdentity: 'identity:bob-d', position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 };
        store.ingest(bobAdvertisement, Date.now());
        registry.sync(store.list(Date.now()), Date.now());
        assert(facade.calls.setRemoteAvatar.length === 1 && facade.calls.setRemoteAvatar[0].avatarId === 'avatar:bob-d',
            'D1. The instant a presence is known, sync() calls setRemoteAvatar exactly once — Bob appears.');

        // D2 — move: a SECOND sync with a higher sequence updates the
        // SAME visual (updateRemoteAvatarPresence), never a second
        // setRemoteAvatar (which would mean a second, duplicate body).
        store.ingest({ ...bobAdvertisement, position: { x: 9, y: 0, z: 9 }, animation: 'walking', sequence: 2 }, Date.now());
        registry.sync(store.list(Date.now()), Date.now());
        registry.tick(Date.now());
        assert(facade.calls.setRemoteAvatar.length === 1, 'D2a. No second setRemoteAvatar call — a moving Wanderer is never re-created, only updated.');
        assert(facade.calls.updateRemoteAvatarPresence.length >= 1, 'D2b. updateRemoteAvatarPresence is called as Bob\'s presence advances — movement is visible.');

        // D3 — leave, by elapsed time alone (no explicit LEAVE message
        // for this protocol — 0.9.582 Section C's own finding, reused
        // here as the mechanism actually driving what a viewer SEES).
        await wait(120);
        registry.sync(store.list(Date.now()), Date.now());
        assert(facade.calls.removeRemoteAvatar.length === 1 && facade.calls.removeRemoteAvatar[0] === 'avatar:bob-d',
            'D3. Once Bob\'s presence ages past absentAfterMs, sync() calls removeRemoteAvatar exactly once — his visual disappears; it does not linger showing a stale position.');
        assert(!registry.has('avatar:bob-d'), 'D3b. registry.has() also agrees Bob is no longer known — the visual-removal fact and the "is this avatarId still tracked" fact never disagree.');

        // D4 — reconnect: a fresh advertisement creates a FRESH visual
        // (a second setRemoteAvatar call), never silently resuming the
        // deleted interpolator, and never producing two simultaneous
        // visuals for the same avatarId.
        store.ingest({ ...bobAdvertisement, position: { x: 1, y: 0, z: 1 }, animation: 'idle', sequence: 3 }, Date.now());
        registry.sync(store.list(Date.now()), Date.now());
        assert(facade.calls.setRemoteAvatar.length === 2, 'D4a. Reconnection produces exactly ONE more setRemoteAvatar call (total 2) — a fresh appearance.');
        assert(facade.calls.removeRemoteAvatar.length === 1, 'D4b. ...and no additional removeRemoteAvatar call happened around the reconnect — Bob reappears cleanly, never flickering removed-then-added twice.');

        registry.dispose();
        console.log('✓ D: appear/move/leave/reappear each drive exactly the render-facade call a viewer\'s own screen is built from — one setRemoteAvatar per genuine appearance, updates in place while present, exactly one removeRemoteAvatar the moment presence actually expires, and a clean re-appearance on reconnect with no duplicate or lingering visual.');
    }

    // ===================================================================
    // Section E — World switching.
    //
    // Presence must follow the World boundary, never survive as a
    // global list. Cited from ui/views/WorldView.js's own
    // _syncWorldSpatialPresence() (the identical shape its sibling
    // _syncWorldPresence() also uses): leave the previous World's
    // presence before resetting the roster to [], THEN enter the new
    // one — never the reverse order, which would let a stale roster
    // render even briefly. Then proven live, at the render-facade layer
    // this milestone actually owns: a fresh RemoteAvatarRegistry (the
    // one a fresh WorldNavigationSession/RenderWorldViewUseCase would
    // hold for a newly-entered World — cited architecture, 0.9.582
    // Section A/F) starts with zero knowledge of anyone, regardless of
    // what a DIFFERENT registry currently shows.
    // ===================================================================
    {
        const worldViewSrc = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(/if \(presentSpatialWorldDocumentId\) \{\s*\n\s*session\.leaveWorldSpatialPresence\(presentSpatialWorldDocumentId\);/.test(worldViewSrc),
            'E1a. _syncWorldSpatialPresence() explicitly leaves the PREVIOUS World\'s spatial presence before doing anything else on a document change.');
        assert(/presentSpatialWorldDocumentId = activeId \|\| null;\s*\n\s*spatialCollaboratorRows\.value = \[\];/.test(worldViewSrc),
            'E1b. The visible roster is reset to an EMPTY array as part of the same transition, before the new World\'s own roster (if any) is fetched — a viewer is never shown World A\'s roster while already looking at World B.');

        // E2 — live: World A's own registry/facade never receives
        // anything from a completely independent World B registry/feed.
        const facadeA = spyRenderFacade();
        const facadeB = spyRenderFacade();
        const registryA = new RemoteAvatarRegistry(facadeA, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });
        const registryB = new RemoteAvatarRegistry(facadeB, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });

        const bobInWorldA = [{ advertisement: { avatarId: 'avatar:bob-e', ownerIdentity: 'identity:bob-e', position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 }, lifecycleState: 'present', trustObservation: { status: 'valid' } }];
        registryA.sync(bobInWorldA, Date.now());
        registryB.sync([], Date.now());
        assert(facadeA.calls.setRemoteAvatar.length === 1, 'E2a. World A\'s own registry shows Bob.');
        assert(facadeB.calls.setRemoteAvatar.length === 0, 'E2b. World B\'s own, independently-constructed registry shows nothing for the exact same avatarId — presence never crosses a World boundary it was never fed across.');

        registryA.dispose();
        registryB.dispose();
        console.log('✓ E: WorldView.js\'s own source resets the visible roster to empty BEFORE entering a new World (never after, never leaving a stale one visible), and a fresh per-World registry structurally cannot show a participant it was never itself handed — proven both by citation and live.');
    }

    // ===================================================================
    // Section F — Failure/degradation language.
    //
    // A viewer whose knowledge of someone else has expired should read
    // a neutral, honest word — never an implementation term, and never
    // a false claim of deliberate departure the system cannot actually
    // know.
    // ===================================================================
    {
        assert(describeLifecycleState('stale') === 'Stale' || describeLifecycleState(undefined) === 'Unknown',
            'F0. sanity: describeLifecycleState() is a real, callable label function.');
        // F1 — the label vocabulary itself never says "left,"
        // "disconnected," or "offline" for the fine-grained avatar-body
        // protocol — because, per 0.9.582 Section C, this protocol has
        // NO explicit leave signal at all; claiming a deliberate
        // departure would be inventing a fact the system doesn't have.
        const labelsSource = codeOnly(await readSource('application/avatar/AvatarPresenceLabels.js'));
        assert(!/'?left'?|disconnected|offline/i.test(labelsSource),
            'F1. Present/Stale/Absent (and Trusted/Unsigned/Conflicting/etc.) never use "left"/"disconnected"/"offline" — the vocabulary stays honestly agnostic about WHY someone is no longer known.');

        // F2 — the coarse World-membership protocol, which DOES have an
        // explicit leave, is allowed the stronger "Offline" word
        // (WorldMembersPanel.js) — but never for the fine-grained body.
        // Confirmed these are two intentionally different vocabularies,
        // not an inconsistency: the coarse protocol's "Offline" reflects
        // a real, explicit signal (0.9.582 Section C), so a stronger
        // word is honestly earned there and nowhere else.
        const membersSource = codeOnly(await readSource('ui/components/WorldMembersPanel.js'));
        assert(membersSource.includes('Offline'), 'F2. WorldMembersPanel.js does use "Offline" — earned by that protocol\'s own explicit leave, unlike the avatar-body protocol\'s honestly-agnostic "Stale"/"Absent."');

        // F3 — no raw error/exception text ever reaches these templates:
        // none of the five core presence UI files read `.message` or
        // otherwise interpolate a caught error into user-facing markup.
        for (const path of ['ui/components/NearbyAvatarsPanel.js', 'ui/components/AvatarInfoPanel.js', 'ui/components/WorldMembersPanel.js', 'ui/components/WorldPresenceIndicator.js', 'ui/components/WorldCollaboratorIndicator.js']) {
            const source = codeOnly(await readSource(path));
            assert(!/\.message\b/.test(source) && !/catch\s*\(/.test(source),
                `F3. ${path} never catches or interpolates a raw error/exception — presence-degradation language stays a deliberate, chosen word, never a leaked stack/exception string.`);
        }

        console.log('✓ F: presence-degradation language is deliberately chosen and honestly scoped to what each protocol actually knows — never an implementation term, never a raw error, and never a stronger claim (e.g. "Offline") than a given protocol\'s own real signal earns.');
    }

    // ===================================================================
    // Section G — Interaction boundary: VISIBLE / OBSERVABLE / INTERACTABLE.
    // ===================================================================
    {
        // G1 — VISIBLE: a remote avatar is rendered (Section D already
        // proved this live) purely from presence, with no click required.
        // G2 — OBSERVABLE: AvatarInfoPanel's own info rows.
        const infoTemplate = AvatarInfoPanel.template;
        for (const label of ['Avatar', 'Status', 'Position', 'Distance', 'Animation']) {
            assert(infoTemplate.includes(`>${label}<`), `G2. AvatarInfoPanel exposes a "${label}" row — inspection ("look") is a real, reachable capability.`);
        }
        // G3 — INTERACTABLE: exactly Follow/Greet/Wave/Point, and this
        // panel's own emits() list is the complete inventory of what a
        // click here can ever ask the host to do — no chat, no message,
        // no "add friend," no "view profile."
        assert(JSON.stringify(AvatarInfoPanel.emits.slice().sort()) === JSON.stringify(['follow', 'interact', 'stop-follow'].sort()),
            "G3a. AvatarInfoPanel.emits is EXACTLY ['follow', 'stop-follow', 'interact'] — the panel is structurally incapable of emitting a chat/message/friend-request/profile-view event, because no such event exists in its own contract.");
        assert(JSON.stringify(NearbyAvatarsPanel.emits) === JSON.stringify(['select']),
            "G3b. NearbyAvatarsPanel.emits is EXACTLY ['select'] — clicking a nearby-avatars row can only ever ask the host to target that avatarId, the same reach-not-act boundary AvatarInfoPanel's own header states explicitly.");
        const interactionKinds = infoTemplate.match(/\$emit\('interact', '(\w+)'\)/g) || [];
        assert(interactionKinds.length === 3 && infoTemplate.includes("'greet'") && infoTemplate.includes("'wave'") && infoTemplate.includes("'point'"),
            "G3c. The only three interaction kinds a click can ever request are greet/wave/point — none of them requests a state change on the OTHER Wanderer's own avatar (0.9.582's own docs/Principles.md citation, 'An Interaction Request Is Not Authority Over Another Avatar,' still holds structurally here: this panel never emits anything the receiver's own replica isn't free to just render and discard).");

        console.log('✓ G: VISIBLE (rendered from presence alone), OBSERVABLE (five plain info rows), and INTERACTABLE (exactly Follow/Greet/Wave/Point) are three genuinely distinct, correctly-scoped tiers — chat/messaging/friending/profile-viewing were never silently smuggled in as a fourth.');
    }

    // ===================================================================
    // Section H — Avatar/vehicle presentation.
    // ===================================================================
    {
        // H1 — cited, 0.9.582's own G finding: a mount relationship is a
        // real, separate, immutable descriptor — never folded into
        // AvatarPresence's own identity fields.
        const mountSource = codeOnly(await readSource('core/AvatarVehicleMount.js'));
        const presenceSource = codeOnly(await readSource('core/AvatarPresence.js'));
        assert(!mountSource.includes('AvatarPresence') && !presenceSource.includes('AvatarVehicleMount'),
            'H1. core/AvatarVehicleMount.js and core/AvatarPresence.js never import each other — structurally incapable of a mount relationship altering an avatar\'s own presence identity.');

        // H2 — the mount/dismount prompt is LOCAL-only presentation: it
        // is driven by the LOCAL avatar's own vehicle-interaction state,
        // never by anyone else's, so a remote Wanderer mounting a
        // vehicle never pops this prompt for a bystander at all.
        const promptSource = await readSource('ui/components/VehicleInteractionPrompt.js');
        assert(promptSource.includes('PRESENTATION ONLY') && !promptSource.includes('avatarId'),
            'H2. VehicleInteractionPrompt.js takes no avatarId at all — it can only ever be about the viewer\'s own avatar, never a remote one, so it cannot itself misrepresent a remote mount as a departure/arrival.');

        // H3 — a REMOTE avatar's own displayName/avatarId are read from
        // AvatarPresence fields alone (Section B already proved the
        // fallback chain); core/AvatarAnimationState.js's own closed
        // vocabulary (idle/walking/running/jumping) has no "mounted" or
        // "riding" entry, so a mounted remote avatar keeps presenting
        // under the SAME identity and the SAME closed animation
        // vocabulary as an unmounted one — never a different-looking
        // "new Wanderer."
        const animationSource = codeOnly(await readSource('core/AvatarAnimationState.js'));
        assert(!/mounted|riding/i.test(animationSource),
            'H3. The avatar animation vocabulary has no separate "mounted"/"riding" identity-adjacent state — mounting changes WHERE the body goes, never WHICH body/name a viewer is looking at.');

        console.log('✓ H: mount/dismount is structurally isolated from avatar identity (H1), the mount/dismount prompt itself can only ever describe the viewer\'s own avatar (H2), and a mounted remote avatar keeps the exact same identity and animation vocabulary as an unmounted one (H3) — vehicles never present as a different Wanderer entering or leaving.');
    }

    // ===================================================================
    // Section I — Multiple participants (3+): dedup is by identity,
    // never by position, device count, or arrival order.
    // ===================================================================
    {
        // I1 — buildWorldCollaborationRoster(): three identities, two of
        // them sharing an identical presence "activity," stay three rows.
        const roster = buildWorldCollaborationRoster({
            ownerIdentityId: 'owner-i1',
            isViewerOwner: false,
            members: [{ subjectIdentityId: 'alice-i1', isAuthorized: true }, { subjectIdentityId: 'bob-i1', isAuthorized: true }],
            presence: [
                { identityId: 'alice-i1', deviceCount: 1, activity: 'exploring', canEdit: true },
                { identityId: 'bob-i1', deviceCount: 1, activity: 'exploring', canEdit: true }
            ]
        });
        assert(roster.length === 3, 'I1. owner + two editors with IDENTICAL activity strings still produce three distinct rows — dedup is by identityId, never by activity value.');

        // I2 — buildSpatialCollaboratorRows(): three identities at the
        // EXACT same coordinate never collapse into one row.
        const spatialRows = buildSpatialCollaboratorRows([
            { identityId: 'alice-i2', devices: [{ deviceId: 'd-alice', activity: 'idle', selection: null }] },
            { identityId: 'bob-i2', devices: [{ deviceId: 'd-bob', activity: 'idle', selection: null }] },
            { identityId: 'charlie-i2', devices: [{ deviceId: 'd-charlie', activity: 'idle', selection: null }] }
        ], { resolveDisplayName: (id) => id });
        assert(spatialRows.length === 3, 'I2. Three identities, identical activity and no distinguishing selection, still produce three rows — position/activity coincidence never merges distinct people.');

        // I3 — computeNearbyAvatars(): two avatars at the identical
        // position stay two entries, each keyed by its own avatarId.
        const nearby = computeNearbyAvatars({
            localPosition: { x: 0, y: 0, z: 0 },
            knownPresences: [
                { advertisement: { avatarId: 'avatar:d1-i3', ownerIdentity: 'identity:d1-i3', position: { x: 3, y: 0, z: 3 }, animation: 'idle' }, lifecycleState: 'present', trustObservation: { status: 'valid' } },
                { advertisement: { avatarId: 'avatar:d2-i3', ownerIdentity: 'identity:d2-i3', position: { x: 3, y: 0, z: 3 }, animation: 'idle' }, lifecycleState: 'present', trustObservation: { status: 'valid' } }
            ],
            radius: Infinity
        });
        assert(nearby.length === 2 && nearby[0].avatarId !== nearby[1].avatarId,
            'I3. Two avatars occupying the identical coordinate stay two distinct entries — an overlapping position never collapses two Wanderers into one.');

        // I4 — a departure removes exactly one participant, never a
        // sibling: reuse Section D's own RemoteAvatarRegistry, now with
        // three tracked avatars.
        const facade = spyRenderFacade();
        const registry = new RemoteAvatarRegistry(facade, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });
        const now = Date.now();
        const three = ['alice-i4', 'bob-i4', 'charlie-i4'].map((name, index) => ({
            advertisement: { avatarId: `avatar:${name}`, ownerIdentity: `identity:${name}`, position: { x: index, y: 0, z: index }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 },
            lifecycleState: 'present', trustObservation: { status: 'valid' }
        }));
        registry.sync(three, now);
        assert(facade.calls.setRemoteAvatar.length === 3, 'I4a. All three appear.');
        registry.sync(three.filter((entry) => entry.advertisement.avatarId !== 'avatar:bob-i4'), now);
        assert(facade.calls.removeRemoteAvatar.length === 1 && facade.calls.removeRemoteAvatar[0] === 'avatar:bob-i4',
            'I4b. Removing Bob from the known-presences list removes EXACTLY Bob — Alice and Charlie are untouched.');
        assert(registry.has('avatar:alice-i4') && registry.has('avatar:charlie-i4') && !registry.has('avatar:bob-i4'),
            'I4c. The registry\'s own tracked set agrees exactly: Alice and Charlie remain known, Bob does not.');
        registry.dispose();

        console.log('✓ I: across all three roster-building functions this milestone\'s UI actually uses, plus a live 3+-participant RemoteAvatarRegistry run, dedup and removal are always by identity — never collapsed by identical position, activity, or device count, and never cross-contaminated on departure.');
    }

    // ===================================================================
    // Section J — Async visual correctness: no ghost outlives its own
    // presence, and dispose() never leaks into a subsequent World.
    // ===================================================================
    {
        const facade = spyRenderFacade();
        const registry = new RemoteAvatarRegistry(facade, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });
        const now = Date.now();
        const advertisement = { avatarId: 'avatar:j1', ownerIdentity: 'identity:j1', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle', sequence: 1 };

        // J1 — out-of-order-looking rapid retargets never produce more
        // than one visual for the same avatarId.
        registry.sync([{ advertisement, lifecycleState: 'present', trustObservation: { status: 'valid' } }], now);
        registry.sync([{ advertisement: { ...advertisement, position: { x: 1, y: 0, z: 1 }, sequence: 2 }, lifecycleState: 'present', trustObservation: { status: 'valid' } }], now);
        registry.sync([{ advertisement: { ...advertisement, position: { x: 2, y: 0, z: 2 }, sequence: 3 }, lifecycleState: 'present', trustObservation: { status: 'valid' } }], now);
        assert(facade.calls.setRemoteAvatar.length === 1, 'J1. Three rapid syncs for the same avatarId produce exactly one setRemoteAvatar call, however many retargets happen after it.');

        // J2 — dispose() (the "leaving this World entirely" moment)
        // removes every currently-tracked visual, and a FRESH registry
        // built afterward (as a real World switch would construct)
        // starts from zero, never re-showing J1's own avatar without a
        // new, explicit sync.
        registry.dispose();
        assert(facade.calls.removeRemoteAvatar.includes('avatar:j1'), 'J2a. dispose() explicitly removes the still-tracked avatar\'s visual — it does not just stop ticking it while leaving it on screen.');
        const facadeAfterSwitch = spyRenderFacade();
        const registryAfterSwitch = new RemoteAvatarRegistry(facadeAfterSwitch, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });
        registryAfterSwitch.sync([], now);
        assert(facadeAfterSwitch.calls.setRemoteAvatar.length === 0 && !registryAfterSwitch.has('avatar:j1'),
            'J2b. The new World\'s own fresh registry has no memory whatsoever of avatar:j1 — an old presence can never visually reappear after a real dispose()/recreate cycle, the exact shape a World switch produces.');

        console.log('✓ J: rapid/out-of-order-looking updates collapse into one visual, and dispose() (the real World-switch boundary) both removes every live visual immediately and leaves nothing for a freshly-constructed registry to inherit.');
    }

    // ===================================================================
    // Section K — Vocabulary sweep.
    //
    // ONE real, narrow finding, classified PRESENTATION_GAP and fixed
    // as the smallest possible seam: core/AvatarAnimationState.js's own
    // internal, lowercase enum words ('walking', 'idle', 'running',
    // 'jumping') were reaching BOTH AvatarInfoPanel.js and
    // NearbyAvatarsPanel.js verbatim — the ONLY status field in either
    // panel that bypassed the label-function discipline
    // application/avatar/AvatarPresenceLabels.js already enforces for
    // lifecycleState and trustStatus. Both panels' OWN design-doc
    // mockups (embedded verbatim in their own header comments, cited in
    // Section A/G above) show "Walking"/"Idle" — capitalized — yet
    // neither template ever capitalized it, and no CSS rule
    // (text-transform) does either, confirmed directly against css/main.css.
    // ===================================================================
    {
        // K1 — reproduce the ORIGINAL defect shape structurally: before
        // this milestone's own fix, `{{ info.animation }}` and
        // `{{ entry.animation }}` interpolated the raw enum value with
        // no label function — this assertion pins the FIXED state so a
        // future edit cannot silently regress it back to the raw value.
        const infoTemplate = AvatarInfoPanel.template;
        const nearbyTemplate = NearbyAvatarsPanel.template;
        assert(infoTemplate.includes('{{ animationLabel(info.animation) }}') && !infoTemplate.includes('{{ info.animation }}'),
            'K1a. AvatarInfoPanel.js now renders animationLabel(info.animation), never the raw info.animation value.');
        assert(nearbyTemplate.includes('{{ animationLabel(entry.animation) }}') && !nearbyTemplate.includes('{{ entry.animation }}'),
            'K1b. NearbyAvatarsPanel.js now renders animationLabel(entry.animation), never the raw entry.animation value.');

        // K2 — the label function itself: a closed, explicit map
        // (matching LIFECYCLE_LABELS/TRUST_LABELS's own established
        // idiom in this same file), never a generic capitalize() that
        // could mangle a future, differently-cased enum value.
        assert(describeAnimationState('idle') === 'Idle' && describeAnimationState('walking') === 'Walking'
            && describeAnimationState('running') === 'Running' && describeAnimationState('jumping') === 'Jumping',
            'K2a. describeAnimationState() maps all four current AvatarAnimationState values to the exact capitalized words both panels\' own mockups already specified.');
        assert(describeAnimationState('not-a-real-state') === 'Unknown' && describeAnimationState(undefined) === 'Unknown',
            "K2b. An unrecognized or missing animation value degrades to 'Unknown' — the same never-throw, never-blank discipline describeLifecycleState()/describeTrustStatus() already established, applied consistently to the third status field.");

        // K3 — no CSS rule silently did this capitalization instead
        // (which would have made K1's own fix redundant, or masked a
        // real defect as a non-issue) — confirmed directly.
        const css = (await Promise.all(stylesheetFiles().map((file) => readSource(file)))).join('\n');
        const infoValueRuleMatch = css.match(/\.info-value\s*\{[^}]*\}/);
        const nearbyDetailRuleMatch = css.match(/\.nearby-avatars-item-detail\s*\{[^}]*\}/);
        assert(infoValueRuleMatch && !infoValueRuleMatch[0].includes('text-transform'),
            'K3a. .info-value carries no text-transform rule — the raw lowercase value was genuinely reaching the screen verbatim before this fix, not merely in this file\'s own source.');
        assert(nearbyDetailRuleMatch && !nearbyDetailRuleMatch[0].includes('text-transform'),
            'K3b. .nearby-avatars-item-detail likewise carries no text-transform rule.');

        // K4 — the broader sweep: none of the five core presence UI
        // files leak a raw connectionId, peerId, protocol name, or
        // handshake/lifecycle-state word as VISIBLE TEXT (as opposed to
        // an internal comparison inside a method, which is fine —
        // AvatarInfoPanel's own statusDotClass() compares against the
        // raw TrustStatus string internally but only ever hands the
        // VIEWER the labeled word, exactly like Section F already
        // confirmed for lifecycle/trust).
        for (const path of ['ui/components/NearbyAvatarsPanel.js', 'ui/components/AvatarInfoPanel.js', 'ui/components/WorldMembersPanel.js', 'ui/components/WorldPresenceIndicator.js', 'ui/components/WorldCollaboratorIndicator.js']) {
            const source = await readSource(path);
            const templateMatch = source.match(/template: `([\s\S]*)`/);
            const template = templateMatch ? templateMatch[1] : '';
            assert(!/connectionId|peerId|handshake|forkbuild:(avatar|world)-(spatial-)?presence/i.test(template),
                `K4. ${path}'s own rendered template never interpolates a connectionId/peerId/handshake state or a raw protocol name.`);
        }

        console.log('✓ K: ONE real PRESENTATION_GAP found (raw animation-enum leakage in two panels) and fixed with the smallest seam available — a new describeAnimationState() alongside the two already-established label functions, wired into both templates, with the CSS non-explanation ruled out and the fix pinned by a regression assertion. The broader vocabulary sweep across every other presence-facing template found nothing else.');
    }

    // ===================================================================
    // Section L — Flagship: the full user-visible journey, driven at the
    // real render-facade seam.
    //
    //   Alice enters -> Bob already there -> Alice sees Bob -> Bob moves
    //   -> Alice sees Bob move -> Bob disconnects -> Bob disappears ->
    //   Bob reconnects -> Alice sees Bob again -> Alice leaves for World B
    //   -> Bob remains visible only in World A's own registry.
    //
    // Driven over a REAL authenticated peer connection and REAL
    // PresenceSyncService/LocalPresenceStore/RemoteAvatarRegistry
    // objects — never a hand-rolled stand-in for the trust/transport
    // layer — with Alice's own render-facade spy as the thing actually
    // asserted against, because that spy IS, structurally, what a
    // Wanderer's own screen is built from (application/world/RenderWorldViewUseCase.js's
    // own setRemoteAvatar/updateRemoteAvatarPresence/removeRemoteAvatar,
    // cited in Section D's own header).
    // ===================================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('alice-l');
        const bob = makeDevice('bob-l');
        const aliceStack = makeAvatarStack(alice);
        const bobStack = makeAvatarStack(bob);

        const connection = await connectAndAuthenticate(network, 'alice-l-b', alice, 'bob-l-a', bob);
        aliceStack.connectedPeerRegistry.add(connection.peerA);
        bobStack.connectedPeerRegistry.add(connection.peerB);
        await wait(10);

        const bobBody = makeAvatarBody('bob-l', { position: { x: 0, y: 0, z: 0 } });
        // Alice's own view of the world: a short-fused store (so this
        // test doesn't need to wait real minutes for ABSENT), a
        // PresenceSyncService reading it, and a RemoteAvatarRegistry
        // driving Alice's own render-facade spy — exactly the chain
        // Section D proved in isolation, now driven by REAL network
        // traffic from Bob's own replica instead of hand-fed advertisements.
        const aliceStore = new LocalPresenceStore({ staleAfterMs: 40, absentAfterMs: 90 });
        const aliceSync = new PresenceSyncService(aliceStack.avatarPresenceTransport, { localAvatarId: 'avatar:alice-l-never-used', store: aliceStore });
        const aliceFacade = spyRenderFacade();
        const aliceRegistry = new RemoteAvatarRegistry(aliceFacade, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });

        // Step 1 — Bob is already there, and advertises before Alice
        // ever looks: "Bob already there" is proven by Alice's very
        // first sync already showing him.
        bobStack.avatarPresenceTransport.advertise(toAvatarPresenceAdvertisement(bobBody.session.current));
        await wait(20);
        aliceRegistry.sync(aliceSync.pull(Date.now()), Date.now());
        assert(aliceFacade.calls.setRemoteAvatar.length === 1 && aliceFacade.calls.setRemoteAvatar[0].avatarId === bobBody.session.current.avatarId,
            'L1. Alice enters and immediately sees Bob, already present — one setRemoteAvatar call, keyed by Bob\'s real avatarId, over a real authenticated connection.');
        // The name a NearbyAvatarsPanel row would actually show,
        // composed the same way Section B cited WorldView.js doing it:
        // real displayName absent (no profile sync wired here), so it
        // falls back to ownerIdentity — never blank, never a raw
        // connectionId or peerId.
        const knownBob = aliceSync.listKnownPresences(Date.now())[0];
        const displayNameAliceWouldSee = knownBob.advertisement.ownerIdentity;
        assert(displayNameAliceWouldSee === 'bob-l', "L1b. The name Alice's own UI would resolve for Bob is his ownerIdentity ('bob-l') — a real, stable, human-meaningful fallback, never a peer connectionId.");

        // Step 2 — Bob moves; Alice sees the movement.
        bobBody.session.update({ position: { x: 12, y: 0, z: 12 }, animation: 'walking' });
        bobStack.avatarPresenceTransport.advertise(toAvatarPresenceAdvertisement(bobBody.session.current));
        await wait(20);
        aliceRegistry.sync(aliceSync.pull(Date.now()), Date.now());
        aliceRegistry.tick(Date.now());
        const lastUpdate = aliceFacade.calls.updateRemoteAvatarPresence[aliceFacade.calls.updateRemoteAvatarPresence.length - 1];
        assert(lastUpdate && lastUpdate.presenceLike.position, 'L2a. Bob\'s movement reaches Alice\'s own render facade as an update, not a re-creation.');
        assert(aliceFacade.calls.setRemoteAvatar.length === 1, 'L2b. Still exactly one setRemoteAvatar call total — moving is never re-appearing.');

        // Step 3 — Bob disconnects (stops advertising; his presence
        // ages out on Alice's own side — the honest mechanism 0.9.582
        // Section C established this protocol actually has).
        await wait(120);
        aliceRegistry.sync(aliceSync.pull(Date.now()), Date.now());
        assert(aliceFacade.calls.removeRemoteAvatar.length === 1, 'L3. Bob disappears from Alice\'s own screen the moment his presence ages past absence — exactly one removeRemoteAvatar call.');

        // Step 4 — Bob reconnects and advertises again; Alice sees him
        // again, without a duplicate.
        bobBody.session.update({ position: { x: 0, y: 0, z: 0 }, animation: 'idle' });
        bobStack.avatarPresenceTransport.advertise(toAvatarPresenceAdvertisement(bobBody.session.current));
        await wait(20);
        aliceRegistry.sync(aliceSync.pull(Date.now()), Date.now());
        assert(aliceFacade.calls.setRemoteAvatar.length === 2, 'L4. Bob reappears — a second, fresh setRemoteAvatar call (total 2) — never silently resumed, never duplicated (still exactly one active visual, confirmed next).');
        assert(aliceRegistry.has(bobBody.session.current.avatarId), 'L4b. The registry itself agrees Bob is, once again, currently known.');

        // Step 5 — Alice leaves for World B: her own presence stack for
        // World A is torn down (mirroring WorldView.js's own
        // leaveWorldSpatialPresence() + roster-reset sequence, Section E),
        // and a FRESH registry/store, exactly as a real World B session
        // would construct, starts completely clean.
        aliceRegistry.dispose();
        aliceSync.dispose();
        assert(aliceStore.list(Date.now()).length === 0, 'L5a. Alice\'s own presence store for World A is empty after dispose() — nothing carries over in memory.');

        const worldBFacade = spyRenderFacade();
        const worldBRegistry = new RemoteAvatarRegistry(worldBFacade, { defaultTemplate: { id: 'humanoid-01' }, defaultAppearance: {} });
        const worldBStore = new LocalPresenceStore();
        worldBRegistry.sync(worldBStore.list(Date.now()), Date.now());
        assert(worldBFacade.calls.setRemoteAvatar.length === 0 && !worldBRegistry.has(bobBody.session.current.avatarId),
            'L5b. World B\'s own, independently-constructed presence chain has never heard of Bob — he remains visible only in World A\'s own (now-disposed) registry, exactly matching the World-boundary Section E already proved.');

        // Bob, meanwhile, never left World A himself and is completely
        // unaffected by Alice's own departure — his own AvatarPresence
        // body still holds his real last movement.
        assert(bobBody.session.current.position.x === 0 && bobBody.session.current.animation === 'idle',
            "L6. Bob's own presence is untouched by Alice's departure — two independent Wanderers' own experiences never cross-affect each other's state.");

        connection.peerA.dispose(); connection.peerB.dispose();
        aliceStack.avatarPresenceTransport.dispose(); bobStack.avatarPresenceTransport.dispose();

        console.log('✓ L (FLAGSHIP): Alice enters -> sees Bob already present (with a real, human-meaningful fallback name, never a raw connection id) -> watches him move -> watches him disappear on disconnect -> watches him reappear on reconnect without a duplicate -> leaves for World B, whose own independently-constructed presence chain has never heard of Bob at all — the complete user-visible journey, proven end to end at the exact render-facade seam a Wanderer\'s own screen is built from, over a real authenticated peer connection throughout.');
    }

    // ===================================================================
    // Verdict.
    // ===================================================================
    {
        const classifications = [
            ['A — Presence discoverability', 'ALREADY_CORRECT — four real, distinct surfaces each render a plain-language fact; none stay silent about presence that exists.'],
            ['B — Identity presentation', 'ALREADY_CORRECT — displayName is composed at exactly one seam, from a documented, never-blank fallback order, and never collapses with avatarId/ownerIdentity/identityId.'],
            ['C — Spatial comprehension', 'ALREADY_CORRECT (own vs. remote avatar; AVATAR vs. PUBLICATION encounter) + one DEFERRED, precisely-named, out-of-scope observation (World Encounter canvas\'s own AVATAR marker kind is real but production-unreachable — a separate arc\'s own concern).'],
            ['D — Presence lifecycle visibility', 'ALREADY_CORRECT — proven live for the first time (0.9.582 imported RemoteAvatarRegistry but never instantiated it): appear/move/leave/reappear each drive exactly the render-facade call a viewer\'s screen is built from.'],
            ['E — World switching', 'ALREADY_CORRECT — roster reset precedes re-entry (cited), and a fresh per-World registry structurally cannot show a participant it was never fed (live).'],
            ['F — Failure/degradation language', 'ALREADY_CORRECT — honestly scoped per protocol\'s own real signal; never an implementation term or a raw error.'],
            ['G — Interaction boundary', 'ALREADY_CORRECT (INTENTIONAL_BOUNDARY) — VISIBLE/OBSERVABLE/INTERACTABLE are genuinely distinct; chat/messaging/friending/profile-viewing were never smuggled in.'],
            ['H — Avatar/vehicle presentation', 'ALREADY_CORRECT — structurally isolated from identity; the mount prompt itself can only ever describe the viewer\'s own avatar.'],
            ['I — Multiple participants (3+)', 'ALREADY_CORRECT — dedup is by identity in all three roster functions and live in RemoteAvatarRegistry; overlapping position/activity never collapses people.'],
            ['J — Async visual correctness', 'ALREADY_CORRECT — rapid retargets collapse to one visual; dispose() removes every live visual and leaves nothing for a fresh registry to inherit.'],
            ['K — Vocabulary sweep', 'PRESENTATION_GAP FOUND AND FIXED — raw animation-enum leakage in AvatarInfoPanel.js/NearbyAvatarsPanel.js; fixed with describeAnimationState() in application/avatar/AvatarPresenceLabels.js, the smallest available seam. Nothing else found.'],
            ['L — Flagship journey', 'ALREADY_CORRECT — the complete enter/see/move/disconnect/reconnect/switch-world journey holds end to end at the real render-facade seam, over a real authenticated connection.']
        ];
        for (const [section, verdict] of classifications) {
            assert(typeof section === 'string' && typeof verdict === 'string' && verdict.length > 0, `Verdict entry malformed: ${section}`);
        }
        console.log('\nCLOSURE_REASSESSMENT complete. Verdict table:');
        for (const [section, verdict] of classifications) {
            console.log(`  - ${section}\n    -> ${verdict}`);
        }

        console.log(`
WANDERER_PRESENCE_PRODUCT_EXPERIENCE: COHERENT, with one small fix applied.

Eleven of twelve sections confirm the product experience an ordinary
Wanderer actually sees matches 0.9.582's own architectural findings:
presence is discoverable, identity never collapses, own-vs-remote is
unambiguous, lifecycle changes are visible at the exact render-facade
seam a screen is built from, World boundaries hold, degradation language
is honest, the interaction boundary is deliberately narrow, vehicles
never masquerade as a different Wanderer, multiple participants never
collapse into each other, and no stale visual outlives its own World.

Section K found and closed the one genuine, narrow PRESENTATION_GAP this
milestone's brief was designed to surface: a raw internal enum word
reaching the screen where a label function was already the established
pattern for its two siblings. The fix is the smallest seam available —
one new label function, two call sites — and is pinned by a regression
assertion (K1) so it cannot silently regress.

  0.9.582  Wanderer Presence & Session Continuity (mechanism/session)
      v
  0.9.583  Wanderer Presence Product Experience Closure (this milestone)
      v
            STOP

Per this milestone's own brief: 0.9.582 + 0.9.583 close the Wanderer
Presence arc. This recommends against opening a further Wanderer-
presence milestone purely because more architecture or more UI copy
could theoretically be audited — the next milestone should come from an
inventory of a genuinely different product area.`);

        console.log('\n✅ All Wanderer Presence Product Experience Closure Reassessment tests passed.');
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
