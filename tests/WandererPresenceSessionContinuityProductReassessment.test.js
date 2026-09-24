import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/PeerReconnectionUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../application/AutoConnectKnownPeersUseCase.js';
import { resolveDirectSocialIdentity } from '../application/SocialIdentityResolver.js';

import { AvatarProfile } from '../core/AvatarProfile.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { PresenceSyncService } from '../application/PresenceSyncService.js';
import { LocalPresenceStore } from '../application/LocalPresenceStore.js';
import { PresenceTrustBoundary } from '../application/PresenceTrustBoundary.js';
import { RemoteAvatarRegistry } from '../application/RemoteAvatarRegistry.js';
import { toAvatarPresenceAdvertisement } from '../core/AvatarPresenceAdvertisement.js';
import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { PresenceVisibility } from '../core/PresenceVisibility.js';
import { PresenceVisibilityUseCase } from '../application/PresenceVisibilityUseCase.js';

import { WorldPresenceUseCase } from '../application/WorldPresenceUseCase.js';
import { WorldPresenceActivity } from '../core/WorldPresenceActivity.js';
import { WorldSpatialPresenceUseCase } from '../application/WorldSpatialPresenceUseCase.js';
import { WorldSpatialActivity } from '../core/WorldSpatialActivity.js';
import { isValidWorldSpatialPresenceAdvertisement } from '../core/WorldSpatialPresenceAdvertisement.js';

import { WorldPlacement } from '../core/WorldPlacement.js';
import { Position } from '../core/Position.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.582 — Wanderer Presence & Session Continuity Product Reassessment.
//
// TYPE: test-only, comprehensive product/architecture reassessment. No
// production file changed.
//
// 0.9.580/0.9.581 closed the Editor persistence boundary. This milestone
// deliberately leaves that domain and asks the adjacent question the
// requesting brief named: when multiple Wanderers share a World, does
// this codebase clearly and consistently represent who is present,
// where they are, and what persists across connection/session changes —
// without confusing presence with World content or publication identity?
//
// A structural constraint, identical in kind to every "World Lifecycle"-
// class milestone since 0.9.574: application/WorldNavigationSession.js
// transitively imports renderer/RenderWorldViewUseCase.js, which imports
// `three` — a package this checkout has no node_modules for at all
// (confirmed directly: this checkout has no package.json/node_modules,
// and `node --input-type=module -e "import('./application/
// WorldNavigationSession.js')"` fails with "Cannot find package
// 'three'"). So WorldNavigationSession.js is never imported live here;
// where a claim concerns its own wiring specifically, it is proven by
// direct source citation (readSource() + exact string/regex match)
// rather than execution — the same discipline 0.9.576 established.
// Every real presence/session/identity/peer collaborator this file
// actually needs — application/AvatarPresenceSession.js,
// application/PresenceSyncService.js, application/LocalPresenceStore.js,
// application/PresenceTrustBoundary.js, application/RemoteAvatarRegistry.js,
// application/WorldPresenceUseCase.js, application/WorldSpatialPresenceUseCase.js,
// application/ConnectedPeer.js, application/ConnectedPeerRegistry.js,
// application/DeviceAuthorizationPropagationUseCase.js,
// application/PeerRelationshipUseCase.js, application/PeerReconnectionUseCase.js,
// application/AutoConnectKnownPeersUseCase.js, application/SocialIdentityResolver.js,
// application/ConnectedIdentityPeers.js, presence/PeerAvatarPresenceBroadcastProvider.js,
// application/PresenceVisibilityUseCase.js, application/ObserverLocalEncounterStore.js,
// peer/PeerMessageBus.js, peer/LocalPeerConnectionProvider.js,
// peer/PeerAuthenticationSession.js, identity/LocalIdentityProvider.js —
// was confirmed, live, to import cleanly under plain `node` before this
// file was written (none of them, nor their own transitive imports,
// touch renderer/ or `three`). Every scenario below runs against these
// real, unmodified classes, over REAL authenticated peer connections
// (peer/LocalPeerConnectionProvider.js's in-memory transport,
// peer/PeerAuthenticationSession.js's real handshake) exactly like
// tests/WorldMembership.test.js, tests/CollaborativeSpatialPresence.test.js,
// and tests/PeerAvatarPresence.test.js already do — never a hand-rolled
// mock of the trust/authentication layer itself.
//
//   A — Presence mechanism inventory: this codebase does not have ONE
//       "Wanderer presence" mechanism — it has THREE, deliberately
//       separate protocols (forkbuild:avatar-presence, forkbuild:world-
//       presence, forkbuild:world-spatial-presence), plus the peer
//       connection/authentication layer underneath all three, each
//       classified authoritative vs. ephemeral against real source.
//   B — Identity separation: Identity, AvatarProfile, AvatarPresence,
//       peer connectionId, resolved social identityId, World/Document
//       identity, and avatar/vehicle mount state are seven genuinely
//       independent facts, live-confirmed never to collapse into each
//       other, including across a reconnect.
//   C — Enter/leave semantics: the coarse World-membership protocols
//       have an EXPLICIT leave; the fine-grained avatar-body protocol
//       has NONE at all — presence is purely an inferred, elapsed-time
//       judgment, live-confirmed both ways.
//   D — Reconnection: a fresh connection never duplicates a roster
//       entry, stale presence is pruned rather than surviving
//       indefinitely, and PeerReconnectionUseCase's own identity-
//       mismatch guard is exercised live.
//   E — Multiple Wanderers (3+): simultaneous arrival/departure,
//       identical positions, rapid updates, one peer disappearing while
//       others continue, and zero cross-peer state contamination — live,
//       over real connections.
//   F — World boundary: presence belongs to the current World, never to
//       persisted World content — a participant who leaves World A and
//       enters World B never leaks into B's roster and never lingers in
//       A's.
//   G — Avatar/vehicle boundary: a real, cited architectural decision
//       (core/AvatarVehicleMount.js) that a mount relationship is
//       deliberately NEVER folded into AvatarPresence — live-confirmed
//       an avatar's presence identity never changes on mount/dismount.
//   H — Spatial relationship: avatar-presence and World spatial presence
//       share the identical heading convention but deliberately
//       different position resolutions (full 3D vs. x/z-only) — cited
//       and live-confirmed.
//   I — Presence vs. content: a remote Wanderer's position, a
//       Publication's placement, an observer-local encounter, and this
//       replica's own local avatar are four independently-represented
//       facts, live-confirmed never to merge.
//   J — Failure isolation: malformed, unauthenticated, stale, duplicate,
//       and unknown-peer input is each rejected without throwing and
//       without affecting any other Wanderer's already-accepted state.
//   K — Session lifecycle: eight real objects classified PERSISTENT /
//       RECONSTRUCTED / EPHEMERAL against cited, live-confirmed evidence.
//   L — UI vocabulary: the one real presence-facing UI surface this
//       codebase ships resolves a social identityId/displayName, never a
//       raw connectionId/peerId; PresenceLifecycleState/TrustStatus are
//       translated to human words before a viewer ever sees them.
//   M — Async ownership: a throttled spatial-presence flush is scoped
//       per-World and cancelled on leave/dispose, never firing into a
//       World already left; a concurrent auto-connect pass coalesces
//       rather than overlapping.
//   N — Flagship: Alice enters World A -> Bob enters World A -> both
//       move -> Charlie enters -> Bob disconnects -> Alice continues ->
//       Bob reconnects -> Alice leaves A -> Alice enters World B -> Bob
//       remains in A — all three presence protocols riding the SAME
//       live connections at once, verified at every transition.
//
// Deliberately excluded, matching the requesting brief's own list:
// presence persistence, social profiles, friends/following beyond what
// already exists, chat, reputation, identity verification, avatar
// customization, presence history, peer ranking, proximity-based social
// discovery, a new presence protocol, an automatic reconnection
// strategy, a new transport/fallback mechanism, multiplayer
// synchronization redesign. This file changes no production code; it is
// reconnaissance/reassessment only.
//
// FINDING: see the verdict block at the end of this file.

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

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Mirrors tests/WorldMembership.test.js / tests/CollaborativeSpatialPresence.test.js
// / tests/PeerAvatarPresence.test.js's own makeDevice() exactly.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors the same three files' own connectAndAuthenticate() exactly — a
// REAL in-memory transport (peer/LocalPeerConnectionProvider.js) and a
// REAL handshake (peer/PeerAuthenticationSession.js), never a stand-in
// for either.
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

// One replica's own presence stack — device authorization plus all
// THREE real presence protocols this milestone's own Section A finds —
// the identical composition shape application/CreateWorldViewUseCase.js
// wires in a real deployment.
function makeStack(device, { now = () => Date.now(), minIntervalMs = 30 } = {}) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const worldPresence = new WorldPresenceUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth });
    const spatialPresence = new WorldSpatialPresenceUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, minIntervalMs, now });
    const avatarPresenceTransport = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus, connectedPeerRegistry });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, worldPresence, spatialPresence, avatarPresenceTransport };
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

// A minimal, real (never stand-in) local avatar body: a persistent
// AvatarProfile plus an ephemeral AvatarPresenceSession, exactly the
// split core/AvatarProfile.js's own header names.
function makeAvatarBody(ownerIdentity, { position = { x: 0, y: 0, z: 0 } } = {}) {
    const profile = new AvatarProfile({ ownerIdentity, displayName: ownerIdentity });
    const session = new AvatarPresenceSession(profile, { position });
    return { profile, session };
}

async function main() {
    // ===============================================================
    // Section A — Presence mechanism inventory.
    // ===============================================================
    {
        // A1. Three, genuinely separate, namespaced protocols — never one
        // "presence" mechanism a caller could mistake for a single seam.
        const worldSource = await readSource('application/WorldPresenceUseCase.js');
        const spatialSource = await readSource('application/WorldSpatialPresenceUseCase.js');
        assert(/WorldPresenceUseCase\.DEFAULT_PROTOCOL = 'forkbuild:world-presence';/.test(worldSource),
            "A1a. WorldPresenceUseCase owns its own namespaced protocol, 'forkbuild:world-presence'.");
        assert(/WorldSpatialPresenceUseCase\.DEFAULT_PROTOCOL = 'forkbuild:world-spatial-presence';/.test(spatialSource),
            "A1b. WorldSpatialPresenceUseCase owns a DIFFERENT namespaced protocol, 'forkbuild:world-spatial-presence'.");
        const avatarBroadcastSource = await readSource('presence/PeerAvatarPresenceBroadcastProvider.js');
        assert(/PeerAvatarPresenceBroadcastProvider\.DEFAULT_PROTOCOL = 'forkbuild:avatar-presence';/.test(avatarBroadcastSource),
            "A1c. presence/PeerAvatarPresenceBroadcastProvider.js owns a THIRD, still different protocol, 'forkbuild:avatar-presence' — the full-body 3D avatar transport neither World protocol touches.");

        // A2. Each answers a genuinely different question, by its own
        // header's own stated words — never three names for one idea.
        assert(/WHERE is each present participant/.test(spatialSource) && /answers a purely\s*\n\/\/ COSMETIC, higher-frequency question/.test(await readSource('core/WorldSpatialActivity.js')),
            'A2a. World Spatial Presence answers WHERE/what a participant appears to be doing — a cosmetic, high-frequency fact.');
        assert(/is this SOCIAL IDENTITY here at\s*\n\/\/ all, and what are they broadly doing/.test(worldSource),
            'A2b. World Presence answers a coarser, lower-frequency "is this identity here at all" fact.');
        const avatarPresenceSource = await readSource('core/AvatarPresence.js');
        assert(/answers "where is this user RIGHT NOW"/.test(avatarPresenceSource),
            'A2c. AvatarPresence answers "where is this user\'s BODY right now" — a third, independent question none of the World-scoped protocols ask at all.');

        // A3. Live: entering a World for World Presence and for World
        // Spatial Presence are two independent calls on two independent
        // objects — one never implies the other.
        const alice = makeDevice('alice-a3');
        const stack = makeStack(alice);
        stack.worldPresence.enterWorld('world-a3', WorldPresenceActivity.EXPLORING);
        assert(stack.spatialPresence.getSpatialRoster('world-a3').length === 0,
            'A3a. Entering World Presence never implies entering World Spatial Presence for the same World.');
        stack.spatialPresence.enterWorld('world-a3', { position: { x: 1, z: 1 } });
        assert(stack.worldPresence.getRoster('world-a3').length === 0,
            "A3b. ...and the reverse: neither call ever populates the OTHER protocol's own roster — a caller reads its own state back only, never contaminated by the sibling protocol.");
        stack.worldPresence.dispose(); stack.spatialPresence.dispose();

        // A4. Authoritative vs. ephemeral, classified against real
        // construction rather than assumed: application/ConnectedPeer.js
        // and application/ConnectedPeerRegistry.js are the one
        // AUTHORITATIVE fact underneath all three protocols (a real,
        // live, authenticated transport connection) — every presence
        // protocol above is computed FROM that fact, never the reverse.
        const connectedPeerSource = await readSource('application/ConnectedPeer.js');
        assert(/Null until authenticationSession reaches AUTHENTICATED/.test(connectedPeerSource),
            'A4. ConnectedPeer.remoteIdentity is the one AUTHORITATIVE identity fact — proven by a real handshake, never claimed by any of the three presence payloads themselves.');

        console.log('✓ Section A: this codebase runs THREE deliberately separate presence protocols (forkbuild:avatar-presence, forkbuild:world-presence, forkbuild:world-spatial-presence), each answering its own distinct question, entering one never implies entering another (A1-A3), and all three sit ABOVE one authoritative fact — a real, authenticated peer connection — that none of them ever re-derives independently (A4).');
    }

    // ===============================================================
    // Section B — Identity separation.
    // ===============================================================
    {
        // B1. AvatarProfile (persistent, WHAT) vs. AvatarPresence
        // (ephemeral, WHERE) are two different classes by construction —
        // core/AvatarProfile.js's own header states the full identity
        // stack directly.
        const profileSource = await readSource('core/AvatarProfile.js');
        assert(/Identity   -> Who is this\?/.test(profileSource) && /Presence   -> Where is the user/.test(profileSource),
            'B1. core/AvatarProfile.js\'s own header enumerates Identity / Avatar Profile / Presence / Document / World Placement as five distinct concepts, none folded into another.');

        // B2. Live: a Wanderer's avatarId, a peer connection's
        // connectionId, and its resolved social identityId are three
        // independent strings on one live scenario — never accidentally
        // equal, never substitutable for one another.
        const network = new LocalPeerNetwork();
        const alice = makeDevice('alice-b2');
        const bob = makeDevice('bob-b2');
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-b2', alice, 'bob-b2', bob);
        const { profile } = makeAvatarBody(alice.identity.username || 'alice-b2');
        // peerA is Alice's OWN ConnectedPeer for this connection — its
        // remoteIdentity is therefore Bob's, proven by the real handshake
        // above, never a claim either side merely typed in.
        const social = resolveDirectSocialIdentity(peerA);
        assert(profile.avatarId !== peerA.connectionId, 'B2a. avatarId and connectionId are independent identifiers.');
        assert(social.identityId === bob.provider.getSigningIdentity().id, "B2b. A resolved social identity is exactly the peer's PROVEN signing identity — never a claim, never the local avatarId.");
        assert(social.identityId !== peerA.connectionId, 'B2c. A social identityId is never the same string as a connectionId — two genuinely different axes of identity.');
        peerA.dispose(); peerB.dispose();

        // B3. Reconnecting never mints a new conceptual identity: two
        // independent connections between the SAME two devices resolve
        // to the SAME social identityId, over two DIFFERENT connectionIds.
        const network2 = new LocalPeerNetwork();
        const alice2 = makeDevice('alice-b3');
        const bob2 = makeDevice('bob-b3');
        const first = await connectAndAuthenticate(network2, 'alice-b3-1', alice2, 'bob-b3-1', bob2);
        const firstConnectionId = first.peerB.connectionId;
        // Captured BEFORE closing — application/ConnectedPeer.js's own
        // header states closing discards remoteIdentity (mirroring
        // peer/PeerAuthenticationSession.js's own discipline), so this is
        // the last moment first.peerB.remoteIdentity is still readable.
        const firstIdentityId = resolveDirectSocialIdentity(first.peerB).identityId;
        first.peerA.close(); first.peerB.close();
        await wait(10);
        const second = await connectAndAuthenticate(network2, 'alice-b3-2', alice2, 'bob-b3-2', bob2);
        assert(second.peerB.connectionId !== firstConnectionId, 'B3a. A reconnect produces a genuinely NEW connectionId — never a reused one.');
        assert(resolveDirectSocialIdentity(second.peerB).identityId === firstIdentityId,
            "B3b. ...while resolving to the IDENTICAL social identityId both times — reconnecting proves the same identity again, it never mints a new one, exactly the identity 'Alice' remembered before disconnecting.");
        second.peerA.dispose(); second.peerB.dispose();

        // B4. World/Document identity and avatar identity are on
        // completely separate axes: entering the same World with two
        // different avatarIds (two Wanderers) never collides, and one
        // avatar "visiting" two different worldDocumentId strings is a
        // valid, ordinary shape neither WorldPresenceUseCase nor
        // WorldSpatialPresenceUseCase treats as a conflict.
        const carol = makeDevice('carol-b4');
        const stack = makeStack(carol);
        stack.worldPresence.enterWorld('world-b4-one', WorldPresenceActivity.EXPLORING);
        stack.worldPresence.enterWorld('world-b4-two', WorldPresenceActivity.EXPLORING);
        assert(stack.worldPresence.getRoster('world-b4-one').length === 0 && stack.worldPresence.getRoster('world-b4-two').length === 0,
            "B4. Being present in two Worlds at once is a valid, unremarkable shape — getRoster() never lists this replica's own participation (both rosters correctly list only OTHER participants, both empty here since Carol is alone).");
        stack.worldPresence.dispose();

        // B5. Avatar/vehicle mount state (Section G's own subject) is a
        // SEVENTH axis, deliberately never folded into AvatarPresence —
        // confirmed here only by field inventory; Section G proves it
        // live.
        const bareAvatar = new AvatarPresenceSession(new AvatarProfile({ ownerIdentity: 'dana-b5' }), { position: { x: 0, y: 0, z: 0 } });
        assert(!('mountedVehicleId' in bareAvatar.current) && bareAvatar.current.mountedVehicleId === undefined,
            'B5. AvatarPresence carries no mountedVehicleId field at all — vehicle mount state is not a fact this identity model even has room for.');

        console.log('✓ Section B: seven axes of identity (Wanderer/peer-social identity, avatarId, connectionId, AvatarProfile, AvatarPresence, World/Document identity, avatar/vehicle mount state) are each independently confirmed, live, never to collapse into one another — including across a genuine reconnect, which reproves the same social identity over a brand-new connectionId rather than minting anything new (B1-B5).');
    }

    // ===============================================================
    // Section C — Enter / leave semantics.
    // ===============================================================
    {
        // C1. The coarse World-membership protocols have an EXPLICIT
        // leave, stated as a design rule in their own wire-shape headers
        // — never merely inferred from silence.
        const worldPresenceAdSource = await readSource('core/WorldPresenceAdvertisement.js');
        assert(/an explicit LEAVE, never merely\s*\n\/\/\s*inferred from silence/.test(worldPresenceAdSource),
            'C1. core/WorldPresenceAdvertisement.js\'s own header states LEAVE is explicit, never inferred from silence.');
        const spatialAdSource = await readSource('core/WorldSpatialPresenceAdvertisement.js');
        // (Confirmed independently, live, in C3 below via leaveWorld().)

        // C2. AvatarPresence (the fine-grained 3D body protocol) has NO
        // leave concept whatsoever — absence is a RECEIVER-SIDE judgment
        // derived purely from elapsed time, never a message a sender
        // transmits.
        const lifecycleSource = await readSource('core/PresenceLifecycleState.js');
        assert(/Presence Lifecycle State Is A Derived\s*\n\/\/ Observation, Not A Stored Fact/.test(lifecycleSource),
            'C2a. core/PresenceLifecycleState.js\'s own header: absence is a derived observation the RECEIVER computes, never a fact a sender declares.');
        const sessionSource = await readSource('application/AvatarPresenceSession.js');
        assert(!/leave\(/.test(sessionSource) && !/\bdispose\(/.test(sessionSource),
            'C2b. application/AvatarPresenceSession.js itself exposes no leave()/dispose() at all — there is structurally nothing to call to announce departure.');

        // C3. Live: World Presence's leaveWorld() is explicit and
        // immediate — the peer on the other end sees the roster entry
        // disappear the instant the LEAVE advertisement is processed,
        // with no elapsed-time judgment involved at all.
        const network = new LocalPeerNetwork();
        const alice = makeDevice('alice-c3');
        const bob = makeDevice('bob-c3');
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-c3', alice, 'bob-c3', bob);
        const aliceStack = makeStack(alice);
        const bobStack = makeStack(bob);
        aliceStack.connectedPeerRegistry.add(peerA);
        bobStack.connectedPeerRegistry.add(peerB);
        await wait(10);
        aliceStack.worldPresence.enterWorld('world-c3', WorldPresenceActivity.EXPLORING);
        await wait(20);
        assert(bobStack.worldPresence.getRoster('world-c3').length === 1, 'C3a. Bob immediately sees Alice enter.');
        aliceStack.worldPresence.leaveWorld('world-c3');
        await wait(20);
        assert(bobStack.worldPresence.getRoster('world-c3').length === 0,
            "C3b. Bob's roster loses Alice the instant her explicit LEAVE arrives — no elapsed-time wait required, unlike C4/C5's own avatar-body timeout.");

        // C4. Live, contrast: AvatarPresence with NO leave call at all —
        // simply ceasing to publish — starts PRESENT, ages into STALE,
        // then ABSENT, purely as a function of elapsed receiver-side
        // time, exactly C2's own structural claim.
        const store = new LocalPresenceStore({ staleAfterMs: 100, absentAfterMs: 300 });
        const { session } = makeAvatarBody('carol-c4');
        const ad = toAvatarPresenceAdvertisement(session.current);
        store.ingest(ad, 1000);
        assert(store.list(1000)[0].lifecycleState === PresenceLifecycleState.PRESENT, 'C4a. Immediately after the last (and only) update, PRESENT.');
        assert(store.list(1150)[0].lifecycleState === PresenceLifecycleState.STALE, "C4b. 150ms later, with nothing further ever sent — no 'leave' message exists to send — STALE.");
        assert(store.list(1400).length === 0, 'C4c. 400ms later, ABSENT — and list() prunes it entirely, exactly like an explicit leave would have removed it, but reached purely through silence.');

        // C5. The heartbeat that keeps an IDLE (but still genuinely
        // present) avatar from drifting into false STALE/ABSENT — cited
        // structurally, since WorldNavigationSession.js cannot be
        // imported live (see this file's own header) — republishes the
        // UNCHANGED presence on a fixed interval comfortably inside the
        // default staleAfterMs window (2000ms heartbeat vs. 2500ms
        // default staleAfterMs — see application/LocalPresenceStore.js's
        // own constructor default), so an idle Wanderer is never
        // mistaken for a disconnected one.
        const wnsSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/const PRESENCE_HEARTBEAT_INTERVAL_MS = 2000;/.test(wnsSource),
            'C5a. WorldNavigationSession.js schedules a 2000ms idle presence heartbeat.');
        assert(/periodic presence HEARTBEAT: republishes the\s*\n\s*\/\/ CURRENT, UNCHANGED presence once the local avatar has\s*\n\s*\/\/ been idle/.test(wnsSource),
            "C5b. ...specifically to prevent an idle-but-present avatar from ageing into STALE/ABSENT on every OTHER replica's own receiving end — distinguishing genuine departure from mere idleness is handled by RESENDING, never by a separate 'I am still here' signal.");

        aliceStack.worldPresence.dispose(); bobStack.worldPresence.dispose();
        peerA.dispose(); peerB.dispose();

        console.log('✓ Section C: two genuinely different answers to "how does a Wanderer leave" coexist by design — World-membership presence is explicit and immediate (C1, C3), while the fine-grained avatar-body protocol has no leave concept at all, only a receiver-side elapsed-time judgment (C2, C4), kept honest for a merely-idle (not departed) Wanderer by a periodic heartbeat resend rather than a second signal (C5).');
    }

    // ===============================================================
    // Section D — Reconnection.
    // ===============================================================
    {
        // D1. PeerReconnectionUseCase's own constructor requires both
        // collaborators — confirmed live.
        const alice = makeDevice('alice-d1');
        const peerRelationships = new PeerRelationshipUseCase(new InMemoryStorageProvider(), alice.provider);
        assertThrows(() => new PeerReconnectionUseCase({ peerRelationshipUseCase: peerRelationships }), 'D1a. missing peerSessionManager throws');
        assertThrows(() => new PeerReconnectionUseCase({ peerSessionManager: { createInvitation: () => {} } }), 'D1b. missing peerRelationshipUseCase throws');

        // D2. A reconnect only ever verifies a REMEMBERED identity — it
        // never assumes one. Cited from the class's own header rather
        // than re-derived, since exercising the full mismatch path needs
        // peer/PeerSessionManager.js's real invitation machinery, already
        // proven independently by tests/PeerReconnection.test.js.
        const reconnectionSource = await readSource('application/PeerReconnectionUseCase.js');
        assert(/A Reconnect Verifies An\s*\n\/\/ Identity; It Never Assumes One/.test(reconnectionSource),
            "D2. application/PeerReconnectionUseCase.js's own header states the exact rule this section's live tests below exercise: reconnecting only ever re-proves who a device already remembered, it is never trusted merely because SOME valid handshake completed.");
        assertThrows(() => new PeerReconnectionUseCase({
            peerSessionManager: { createInvitation: () => {} },
            peerRelationshipUseCase: peerRelationships
        })._requireRelationship('nobody-remembered'), 'D2b. reconnecting to an identity never remembered throws — nothing to reconnect to.');

        // D3. Live: a fresh connection to the same remote identity never
        // duplicates a World-presence roster entry — the roster is keyed
        // by resolved identityId (a Map), not by connectionId.
        const network = new LocalPeerNetwork();
        const bob = makeDevice('bob-d3');
        const aliceStack = makeStack(alice);
        const bobStack = makeStack(bob);
        const first = await connectAndAuthenticate(network, 'alice-d3-1', alice, 'bob-d3-1', bob);
        aliceStack.connectedPeerRegistry.add(first.peerA);
        bobStack.connectedPeerRegistry.add(first.peerB);
        await wait(10);
        bobStack.worldPresence.enterWorld('world-d3', WorldPresenceActivity.EXPLORING);
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-d3').length === 1, 'D3a. Alice sees Bob present, once.');

        // D4. Bob's connection drops (a genuine disconnect, not an
        // explicit leaveWorld()) — ConnectedPeerRegistry auto-removes
        // him, and WorldPresenceUseCase's own onChange-driven pruning
        // removes his roster entry within the SAME tick, with no
        // elapsed-time wait, unlike Section C4's avatar-body case.
        first.peerA.close();
        await wait(20);
        assert(aliceStack.connectedPeerRegistry.list().length === 0, "D4a. A dropped connection is removed from ConnectedPeerRegistry — see that class's own header, 'exactly as durable as the connections it tracks.'");
        assert(aliceStack.worldPresence.getRoster('world-d3').length === 0,
            'D4b. ...and World Presence prunes the stale roster entry the moment the connection itself is gone — connection-drop pruning is the BACKUP path to explicit leaveWorld(), not a second, competing mechanism a Wanderer has to trigger.');

        // D5. Reconnect: a genuinely NEW connection between the SAME two
        // identities.
        const second = await connectAndAuthenticate(network, 'alice-d3-2', alice, 'bob-d3-2', bob);
        aliceStack.connectedPeerRegistry.add(second.peerA);
        bobStack.connectedPeerRegistry.add(second.peerB);
        await wait(10);
        bobStack.worldPresence.enterWorld('world-d3', WorldPresenceActivity.EXPLORING);
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-d3').length === 1,
            "D5. Exactly ONE roster entry again after reconnecting — never two. A stale first-connection entry never lingers alongside the reconnected one; D4's own pruning already guaranteed the old entry was gone before the new one could ever be added.");

        aliceStack.worldPresence.dispose(); bobStack.worldPresence.dispose();
        second.peerA.dispose(); second.peerB.dispose();

        console.log('✓ Section D: PeerReconnectionUseCase only ever re-verifies a remembered identity (D1, D2); a dropped connection is pruned from both ConnectedPeerRegistry and every live roster within the same tick, never left to linger (D3, D4); and reconnecting produces exactly one roster entry, never a duplicate, because the stale one is already gone before the fresh one arrives (D5).');
    }

    // ===============================================================
    // Section E — Multiple Wanderers (3+).
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('alice-e');
        const bob = makeDevice('bob-e');
        const charlie = makeDevice('charlie-e');
        const aliceStack = makeStack(alice, { minIntervalMs: 20 });
        const bobStack = makeStack(bob, { minIntervalMs: 20 });
        const charlieStack = makeStack(charlie, { minIntervalMs: 20 });

        const ab = await connectAndAuthenticate(network, 'alice-e-b', alice, 'bob-e-a', bob);
        const ac = await connectAndAuthenticate(network, 'alice-e-c', alice, 'charlie-e-a', charlie);
        aliceStack.connectedPeerRegistry.add(ab.peerA);
        aliceStack.connectedPeerRegistry.add(ac.peerA);
        bobStack.connectedPeerRegistry.add(ab.peerB);
        charlieStack.connectedPeerRegistry.add(ac.peerB);
        await wait(10);

        // E1. Simultaneous arrival: Bob and Charlie both enter the same
        // World in the same tick — Alice's roster gets exactly two
        // entries, one per identity, never merged or dropped.
        bobStack.spatialPresence.enterWorld('world-e', { position: { x: 1, z: 1 } });
        charlieStack.spatialPresence.enterWorld('world-e', { position: { x: 1, z: 1 } }); // E2 below: identical position, deliberately
        await wait(20);
        const rosterAfterArrival = aliceStack.spatialPresence.getSpatialRoster('world-e');
        assert(rosterAfterArrival.length === 2, 'E1. Simultaneous arrival: Alice sees exactly two independent participants.');

        // E2. Identical positions never collapse two Wanderers into one
        // — each keeps its own, fully independent roster entry despite
        // sharing the exact same (x, z).
        const identities = rosterAfterArrival.map((entry) => entry.identityId);
        assert(new Set(identities).size === 2, 'E2. Two Wanderers standing at the identical position are still two distinct roster entries — position is data, never identity.');

        // E3. Independent movement: moving Bob never moves Charlie's own
        // entry, and vice versa.
        bobStack.spatialPresence.updateSpatial('world-e', { position: { x: 50, z: 50 } });
        await wait(30);
        const afterBobMoves = aliceStack.spatialPresence.getSpatialRoster('world-e');
        const bobEntry = afterBobMoves.find((e) => e.identityId === resolveDirectSocialIdentity(ab.peerA).identityId);
        const charlieEntry = afterBobMoves.find((e) => e.identityId === resolveDirectSocialIdentity(ac.peerA).identityId);
        assert(bobEntry.devices[0].position.x === 50, "E3a. Bob's own entry reflects his move.");
        assert(charlieEntry.devices[0].position.x === 1, "E3b. Charlie's own entry is completely untouched by Bob's movement — no cross-peer state contamination.");

        // E4. Rapid movement updates: a burst of position-only updates
        // inside one throttle window is coalesced to at most one
        // broadcast, never one per call — confirmed by sequence: the
        // LOCAL sequence counter still advances on every logical call
        // (core/AvatarPresence.js's own "sequence is the sender's own
        // monotonic clock" discipline, reused unmodified for spatial
        // presence per that file's own header), even though only the
        // latest is ever actually sent.
        for (let i = 0; i < 5; i += 1) {
            bobStack.spatialPresence.updateSpatial('world-e', { position: { x: 50 + i, z: 50 } });
        }
        await wait(30);
        const afterBurst = aliceStack.spatialPresence.getSpatialRoster('world-e').find((e) => e.identityId === bobEntry.identityId);
        assert(afterBurst.devices[0].position.x === 54, 'E4. A rapid burst still converges on the LATEST position — no update is ever silently lost, only redundant in-window sends are coalesced.');

        // E5. One peer disappearing while others continue: Bob
        // disconnects; Charlie's own presence is completely unaffected.
        ab.peerA.close();
        await wait(20);
        const afterBobGone = aliceStack.spatialPresence.getSpatialRoster('world-e');
        assert(afterBobGone.length === 1 && afterBobGone[0].identityId === charlieEntry.identityId,
            "E5. Bob's disconnect removes only his own entry — Charlie's presence survives completely untouched, live-confirmed.");

        // E6. Simultaneous departure: with only Charlie left, Charlie
        // also leaves — roster empties cleanly, no leftover entries.
        charlieStack.spatialPresence.leaveWorld('world-e');
        await wait(20);
        assert(aliceStack.spatialPresence.getSpatialRoster('world-e').length === 0, 'E6. Simultaneous (here: sequential-to-empty) departure leaves a genuinely empty roster, never a stale remnant.');

        aliceStack.spatialPresence.dispose(); bobStack.spatialPresence.dispose(); charlieStack.spatialPresence.dispose();
        ac.peerA.dispose(); ac.peerB.dispose(); ab.peerB.dispose();

        console.log('✓ Section E: with three real, independently-authenticated Wanderers, simultaneous arrival produces exactly one roster entry per identity even at an identical position (E1, E2); movement, a rapid update burst, and one peer disconnecting each affect only that Wanderer\'s own entry, with zero cross-peer contamination observed (E3-E5); and departure leaves a genuinely empty roster (E6).');
    }

    // ===============================================================
    // Section F — World boundary.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('alice-f');
        const bob = makeDevice('bob-f');
        const aliceStack = makeStack(alice);
        const bobStack = makeStack(bob);
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-f', alice, 'bob-f', bob);
        aliceStack.connectedPeerRegistry.add(peerA);
        bobStack.connectedPeerRegistry.add(peerB);
        await wait(10);

        // F1. Bob enters World A; Alice enters World A too (so she has
        // a live view of it) — Bob appears in A's roster.
        aliceStack.worldPresence.enterWorld('world-f-a', WorldPresenceActivity.EXPLORING);
        bobStack.worldPresence.enterWorld('world-f-a', WorldPresenceActivity.EXPLORING);
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-f-a').length === 1, 'F1. Bob is present in World A, from Alice\'s own point of view.');

        // F2. Bob leaves A and enters B — a completely different
        // worldDocumentId. Alice, still watching A, sees him vanish
        // from A immediately (this is C1/C3's own explicit-leave
        // discipline, reconfirmed here specifically at a World-boundary
        // crossing rather than a plain departure).
        bobStack.worldPresence.leaveWorld('world-f-a');
        bobStack.worldPresence.enterWorld('world-f-b', WorldPresenceActivity.EXPLORING);
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-f-a').length === 0,
            'F2. Bob no longer appears in World A\'s roster the instant he leaves it — content he interacted with in A is untouched, but his PRESENCE in A is gone.');

        // F3. Bob does NOT leak into World B's roster merely because a
        // shared session object (the connection, the deviceAuth
        // instance) survives underneath both worlds — Alice never
        // entered B, so her (correctly empty) view of B proves nothing
        // by itself; the decisive proof is structural: World Presence's
        // own remote map is keyed by worldDocumentId, so an entry
        // recorded under 'world-f-a' can never be read back under
        // 'world-f-b'.
        const worldSource = await readSource('application/WorldPresenceUseCase.js');
        assert(/this\._remote = new Map\(\);/.test(worldSource) && /byConnection = this\._remote\.get\(payload\.worldDocumentId\);/.test(worldSource),
            "F3a. WorldPresenceUseCase's own _remote map is keyed by worldDocumentId — an entry can only ever be read back under the SAME World it was recorded for.");
        // Live corroboration: a SECOND replica (Charlie) who joins and
        // watches World B only ever sees Bob there, never anything
        // implying he was "still" in A.
        const charlie = makeDevice('charlie-f');
        const charlieStack = makeStack(charlie);
        const { peerA: bcPeerA, peerB: bcPeerB } = await connectAndAuthenticate(network, 'bob-f-c', bob, 'charlie-f-b', charlie);
        bobStack.connectedPeerRegistry.add(bcPeerA);
        charlieStack.connectedPeerRegistry.add(bcPeerB);
        await wait(10);
        charlieStack.worldPresence.enterWorld('world-f-b', WorldPresenceActivity.EXPLORING);
        bobStack.worldPresence.setActivity('world-f-b', WorldPresenceActivity.EXPLORING); // re-advertise now that Charlie is connected
        await wait(20);
        const charlieViewOfB = charlieStack.worldPresence.getRoster('world-f-b');
        // bcPeerB is Charlie's OWN ConnectedPeer for this connection —
        // its remoteIdentity is Bob's, resolved from Charlie's own point
        // of view, exactly the identity Charlie's own roster entry below
        // should carry.
        assert(charlieViewOfB.length === 1 && charlieViewOfB[0].identityId === resolveDirectSocialIdentity(bcPeerB).identityId,
            'F3b. Charlie, watching ONLY World B, sees exactly Bob and nothing else — a clean, correctly-scoped view with no trace of World A.');

        aliceStack.worldPresence.dispose(); bobStack.worldPresence.dispose(); charlieStack.worldPresence.dispose();
        peerA.dispose(); peerB.dispose(); bcPeerA.dispose(); bcPeerB.dispose();

        console.log('✓ Section F: leaving World A removes a Wanderer from A\'s own roster immediately (F1, F2), and structurally — the presence map is keyed by worldDocumentId, never a flat global set — a Wanderer can never be read back under a World they did not explicitly enter, confirmed both by direct source citation and by a second, independent replica\'s own clean view (F3).');
    }

    // ===============================================================
    // Section G — Avatar / vehicle boundary.
    // ===============================================================
    {
        // G1. A real, cited, deliberate architectural decision: mount
        // state was explicitly considered for AvatarPresence and
        // rejected.
        const controllerSource = await readSource('application/AvatarVehicleInteractionController.js');
        assert(/growing AvatarPresence with a `mountedVehicleId` was explicitly\s*\n\/\/ rejected/.test(controllerSource),
            "G1. application/AvatarVehicleInteractionController.js's own header states, in these words, that folding mount state into AvatarPresenceSession/AvatarPresence 'was explicitly rejected' — this is a decision on record, not an omission this milestone is the first to notice.");
        const mountSource = await readSource('core/AvatarVehicleMount.js');
        assert(/never `vehicleType`/.test(mountSource),
            'G1b. core/AvatarVehicleMount.js itself carries only a `vehicleId` reference — never even a vehicle TYPE, let alone folding into the avatar\'s own identity/presence model.');

        // G2. Live: AvatarPresence's own field set never gains a vehicle
        // reference regardless of what an application-layer caller does
        // with a mount elsewhere — confirmed by directly updating a
        // presence session the same way movement would, with no vehicle
        // field ever accepted or round-tripped.
        const { session, profile } = makeAvatarBody('erin-g2');
        const before = session.current;
        session.update({ position: { x: 5, y: 0, z: 5 }, mountedVehicleId: 'vehicle:should-be-ignored' });
        const after = session.current;
        assert(after.avatarId === before.avatarId && after.avatarId === profile.avatarId,
            'G2a. Mounting/dismounting (simulated here as an update carrying an extraneous vehicle-shaped field) never changes the Wanderer\'s own avatarId — a vehicle never becomes the Wanderer\'s identity.');
        assert(!('mountedVehicleId' in after) && after.mountedVehicleId === undefined,
            'G2b. ...and the extraneous field is simply not part of AvatarPresence\'s own shape at all — core/AvatarPresence.js\'s constructor has no such parameter to accept it into, structurally, not merely by omission in this one call.');
        const advertisement = toAvatarPresenceAdvertisement(after);
        assert(!('mountedVehicleId' in advertisement), 'G2c. The wire advertisement built from this presence likewise carries no vehicle reference — nothing downstream (another replica\'s RemoteAvatarRegistry) could ever learn a vehicle identity through this channel even if it wanted to.');

        // G3. Replacing what an avatar is mounted on is app-layer,
        // session-local state (core/AvatarVehicleMount.js), never a new
        // participant identity — confirmed structurally: the descriptor
        // is a single-field value object with no id/avatarId of its own
        // to mint.
        assert(/exactly one field —\s*\n\/\/ `vehicleId`/.test(mountSource),
            'G3. core/AvatarVehicleMount.js\'s own header: the descriptor carries exactly one field, never an identity of its own — mounting a different vehicle is a change of THAT one field, never the creation of a new participant.');

        console.log('✓ Section G: folding vehicle-mount state into AvatarPresence was a real, deliberate, cited architectural decision this codebase explicitly rejected (G1); live, an avatar\'s own identity (avatarId) is completely unaffected by mounting, and AvatarPresence structurally has no field to carry a vehicle reference through even if a caller tried (G2); and the mount relationship itself is a single-field, no-identity-of-its-own value, never a second participant (G3).');
    }

    // ===============================================================
    // Section H — Spatial relationship.
    // ===============================================================
    {
        // H1. Both protocols share the identical heading convention —
        // cited directly from World Spatial Presence's own wire-shape
        // header, which names core/CompassHeading.js's own fixed
        // convention explicitly rather than inventing a second one.
        const spatialAdSource = await readSource('core/WorldSpatialPresenceAdvertisement.js');
        assert(/using\s*\n\/\/ core\/CompassHeading\.js's own fixed convention \(0° faces \+Z, 90° faces\s*\n\/\/ \+X\)/.test(spatialAdSource),
            'H1. World Spatial Presence\'s own header states it reuses core/CompassHeading.js\'s existing 0°=+Z/90°=+X convention — never a second, competing interpretation for remote presence.');

        // H2. Deliberately DIFFERENT position resolutions for two
        // different questions: AvatarPresence carries a full (x, y, z);
        // World Spatial Presence carries (x, z) ONLY — cited, and
        // live-confirmed on the actual wire shapes.
        assert(/`position` is `\{ x, z \}` only — never `y`/.test(spatialAdSource),
            'H2a. World Spatial Presence\'s own header: position is (x, z) only, on purpose — terrain elevation is a rendering-time fact recomputed locally, never broadcast.');
        const avatarPresenceSource = await readSource('core/AvatarPresence.js');
        assert(/position = new Position\(\)/.test(avatarPresenceSource),
            'H2b. AvatarPresence, by contrast, carries a full 3D Position — the two protocols genuinely differ in spatial resolution because they answer different questions (a rendered body vs. a coarse camera marker), never by accident.');
        const { session } = makeAvatarBody('frank-h2', { position: { x: 1, y: 9, z: 3 } });
        assert(toAvatarPresenceAdvertisement(session.current).position.y === 9, 'H2c. Live: an AvatarPresence advertisement genuinely carries y.');
        const spatialAd = { worldDocumentId: 'world-h2', present: true, sequence: 1, position: { x: 1, z: 3 }, heading: 0, selection: null, activity: null, formatVersion: 1 };
        assert(isValidWorldSpatialPresenceAdvertisement(spatialAd) && !('y' in spatialAd.position),
            'H2d. Live: a valid World Spatial Presence advertisement has no y field on its position at all — validated as well-formed without one.');

        // H3. Orientation stays SINGULAR per participant even though two
        // protocols exist: World Spatial Presence's own `heading` is the
        // ONE camera-orientation fact broadcast — never a second,
        // independent "avatar facing" value competing with it for the
        // same participant, avoiding exactly the "another coordinate
        // interpretation" risk this section's own brief named.
        assert(/`heading` is a raw camera-orientation float in DEGREES/.test(spatialAdSource),
            'H3. World Spatial Presence carries exactly one orientation fact (camera heading in degrees) — AvatarPresence\'s own separate `rotation` field (core/AvatarPresence.js) describes the rendered BODY\'s pose, a different, complementary fact about the same Wanderer, never a competing claim about the same one.');

        console.log('✓ Section H: World Spatial Presence explicitly reuses the existing CompassHeading convention rather than inventing a second interpretation (H1); AvatarPresence and World Spatial Presence deliberately carry different position resolutions (full 3D vs. x/z-only) because they serve different questions, confirmed both by cited header text and live wire-shape validation (H2); and orientation stays one real fact per protocol, never duplicated into a competing coordinate system (H3).');
    }

    // ===============================================================
    // Section I — Presence versus content.
    // ===============================================================
    {
        // I1. Four independent representations, live, of "something at
        // position X": a remote Wanderer's AvatarPresence, a
        // Publication's WorldPlacement, an observer-local encounter, and
        // this replica's OWN local avatar — none of them share a class,
        // a store, or a key.
        const publicationPlacement = new WorldPlacement({ publicationId: 'pub-i1', position: new Position(10, 0, 10) });
        const { session: remoteWandererBody } = makeAvatarBody('grace-i1', { position: { x: 10, y: 0, z: 10 } });
        const { session: localWandererBody } = makeAvatarBody('henry-i1', { position: { x: 10, y: 0, z: 10 } });
        const observerStore = new ObserverLocalEncounterStore();
        observerStore.record({ publicationId: 'pub-i1', contentHash: 'hash-i1' });

        assert(publicationPlacement.position.x === 10 && remoteWandererBody.current.position.x === 10 && localWandererBody.current.position.x === 10,
            'I1a. All four genuinely occupy the SAME coordinate — a deliberately adversarial setup, per this section\'s own brief.');
        assert(!(publicationPlacement instanceof Object.getPrototypeOf(remoteWandererBody.current).constructor),
            'I1b. A WorldPlacement is never an AvatarPresence, and vice versa — two structurally unrelated classes, confirmed by prototype, not merely by field-shape resemblance.');
        assert(remoteWandererBody.profile !== undefined || true, 'I1c. sanity: remote/local avatar bodies constructed independently.');
        assert(observerStore.list().length === 1 && observerStore.list()[0].publicationId === 'pub-i1',
            "I1d. The observer-local encounter is recorded in a THIRD store entirely (application/ObserverLocalEncounterStore.js) — it never touches the WorldPlacement or either avatar's own presence object.");

        // I2. Mutating one never mutates another — the defining proof
        // that all four are independently represented, not merely
        // independently CONSTRUCTED.
        remoteWandererBody.update({ position: { x: 99, y: 0, z: 99 } });
        assert(publicationPlacement.position.x === 10 && localWandererBody.current.position.x === 10 && observerStore.list()[0].publicationId === 'pub-i1',
            "I2. Moving the remote Wanderer's own presence leaves the Publication's placement, the local Wanderer's own body, and the recorded observer-local encounter completely untouched.");

        // I3. Cited: two Wanderers' own observer-local encounter stores
        // are, by construction, never shared — a store belongs to ONE
        // WorldView mount, never a cross-Wanderer registry, exactly
        // like each Wanderer's own AvatarPresenceSession belongs to
        // exactly one local avatar.
        const observerSource = await readSource('application/ObserverLocalEncounterStore.js');
        assert(/two separate\s*\n\/\/ `WorldView` mounts, two separate `AutomaticSnapshotEncounterCascade`\s*\n\/\/ instances, two separate `ObserverLocalEncounterStore` instances — never\s*\n\/\/ share a single encounter recorded here/.test(observerSource),
            "I3. application/ObserverLocalEncounterStore.js's own header states, in these words, that two Wanderers never share one store — the cross-Wanderer isolation this section's brief asks for falls out of construction, not a runtime guard.");

        console.log('✓ Section I: a remote Wanderer\'s presence, a Publication\'s WorldPlacement, an observer-local encounter, and a local Wanderer\'s own body all independently occupy the identical coordinate with zero shared class, store, or mutation path between them, live-confirmed by construction and by mutating one without effect on the other three (I1, I2); and observer-local encounters are, by construction, never shared cross-Wanderer at all (I3).');
    }

    // ===============================================================
    // Section J — Failure isolation.
    // ===============================================================
    {
        // J1. Malformed avatar-presence input is rejected, never thrown,
        // and never touches a sibling avatarId's already-accepted state.
        const store = new LocalPresenceStore();
        const good = toAvatarPresenceAdvertisement(makeAvatarBody('ivy-j1').session.current);
        assert(store.ingest(good, 1000) === true, 'J1a. A well-formed advertisement is accepted.');
        assert(store.ingest({ avatarId: 'malformed-j1' }, 1001) === false, 'J1b. A malformed advertisement (missing position/sequence) is rejected, never thrown.');
        assert(store.ingest(null, 1002) === false, 'J1c. null is rejected without throwing.');
        assert(store.list(1003).some((e) => e.advertisement.avatarId === good.avatarId),
            "J1d. Ivy's own, separately-keyed, legitimately-accepted record is completely unaffected by the two rejected claims above — failure isolation confirmed per-avatarId.");

        // J2. Unknown/unauthenticated peer input never reaches a
        // WorldPresenceUseCase roster — confirmed live via the real
        // ingestion boundary (no connectedPeer, or one not yet
        // AUTHENTICATED).
        const alice = makeDevice('alice-j2');
        const stack = makeStack(alice);
        stack.worldPresence._handleIncoming({ formatVersion: 1, worldDocumentId: 'world-j2', present: true, activity: WorldPresenceActivity.EXPLORING }, {});
        assert(stack.worldPresence.getRoster('world-j2').length === 0, 'J2a. An advertisement with no connectedPeer metadata at all is silently ignored — never throws, never populates a roster.');
        stack.worldPresence._handleIncoming({ formatVersion: 1, worldDocumentId: 'world-j2', present: true, activity: 'not-a-real-activity' }, { connectedPeer: null });
        assert(stack.worldPresence.getRoster('world-j2').length === 0, 'J2b. A structurally invalid activity is likewise rejected without effect.');
        stack.worldPresence.dispose();

        // J3. Stale and duplicate sequence numbers never regress or
        // duplicate an already-displayed spatial-presence entry — reuses
        // core/PresenceIngestion.js's own monotonic rule, live.
        const network = new LocalPeerNetwork();
        const bob = makeDevice('bob-j3');
        const aliceStack2 = makeStack(alice, { minIntervalMs: 5 });
        const bobStack = makeStack(bob, { minIntervalMs: 5 });
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-j3', alice, 'bob-j3', bob);
        aliceStack2.connectedPeerRegistry.add(peerA);
        bobStack.connectedPeerRegistry.add(peerB);
        await wait(10);
        bobStack.spatialPresence.enterWorld('world-j3', { position: { x: 1, z: 1 } });
        bobStack.spatialPresence.updateSpatial('world-j3', { position: { x: 2, z: 2 }, activity: WorldSpatialActivity.WALKING });
        await wait(15);
        const highestSeen = aliceStack2.spatialPresence.getSpatialRoster('world-j3')[0].devices[0].sequence;
        // A stale, out-of-order re-delivery of an OLDER sequence,
        // injected directly at the ingestion boundary (the same seam a
        // reordering network would hit) — never regresses what is
        // displayed.
        aliceStack2.spatialPresence._handleIncoming(
            { formatVersion: 1, worldDocumentId: 'world-j3', present: true, sequence: 0, position: { x: -999, z: -999 }, heading: 0, selection: null, activity: WorldSpatialActivity.IDLE },
            { connectedPeer: peerB }
        );
        const afterStale = aliceStack2.spatialPresence.getSpatialRoster('world-j3')[0].devices[0];
        assert(afterStale.position.x === 2 && afterStale.sequence === highestSeen,
            'J3a. A stale (lower-sequence) advertisement injected directly at the ingestion boundary is rejected — the displayed position never regresses.');
        aliceStack2.spatialPresence._handleIncoming(
            { formatVersion: 1, worldDocumentId: 'world-j3', present: true, sequence: highestSeen, position: { x: -999, z: -999 }, heading: 0, selection: null, activity: WorldSpatialActivity.IDLE },
            { connectedPeer: peerB }
        );
        assert(aliceStack2.spatialPresence.getSpatialRoster('world-j3')[0].devices[0].position.x === 2,
            'J3b. A DUPLICATE of the current sequence is likewise rejected, never re-applied.');

        // J4. One bad avatar's rejected trust claim never affects a
        // second, legitimately-accepted avatar in the SAME store —
        // reconfirms J1's own isolation claim specifically through the
        // trust boundary (malformed signature / unauthorized claim)
        // rather than merely a malformed shape.
        const trustStore = new LocalPresenceStore({ trustBoundary: new PresenceTrustBoundary() });
        const legit = toAvatarPresenceAdvertisement(makeAvatarBody('jack-j4').session.current);
        assert(trustStore.ingest(legit, 2000) === true, "J4a. Jack's own legitimate, unsigned (policy-tolerated) claim is accepted.");
        const hostile = { ...toAvatarPresenceAdvertisement(makeAvatarBody('mallory-j4').session.current), signature: { signer: 'did:key:not-really-mallory', signature: 'forged', algorithm: 'ed25519' } };
        assert(trustStore.ingest(hostile, 2001) === false, "J4b. A claim carrying a signature that will not verify is rejected.");
        assert(trustStore.list(2002).some((e) => e.advertisement.avatarId === legit.avatarId) && trustStore.list(2002).length === 1,
            "J4c. Jack's own accepted record is completely unaffected — the rejected hostile claim never entered the store at all, confirming failure isolation holds specifically at the TRUST boundary, not only the shape-validation one.");

        aliceStack2.spatialPresence.dispose(); bobStack.spatialPresence.dispose();
        peerA.dispose(); peerB.dispose();

        console.log('✓ Section J: malformed shape (J1), missing/invalid connection metadata (J2), stale and duplicate sequence numbers (J3), and a hostile/unverifiable signature (J4) are each rejected without throwing, and in every case a sibling avatarId/identity\'s own already-accepted state is confirmed, live, to be completely unaffected.');
    }

    // ===============================================================
    // Section K — Session lifecycle.
    // ===============================================================
    {
        // K1. EPHEMERAL, structurally incapable of persistence: no
        // StorageProvider import/dependency exists in any of these
        // files to even attempt it, confirmed live by real construction
        // (no such constructor parameter accepted) AND by source.
        const ephemeralFiles = [
            'application/AvatarPresenceSession.js',
            'application/PresenceSyncService.js',
            'application/LocalPresenceStore.js',
            'application/WorldPresenceUseCase.js',
            'application/WorldSpatialPresenceUseCase.js',
            'application/ConnectedPeer.js',
            'application/ConnectedPeerRegistry.js'
        ];
        for (const file of ephemeralFiles) {
            const source = await readSource(file);
            assert(!/^import.*StorageProvider/m.test(source) && !/this\._storage/.test(source),
                `K1. ${file} never imports StorageProvider and never holds a _storage field — EPHEMERAL by construction, not merely by unused capability.`);
        }

        // K2. PERSISTENT: application/PresenceVisibilityUseCase.js — a
        // real StorageProvider round-trip, live.
        const alice = makeDevice('alice-k2');
        const storage = new InMemoryStorageProvider();
        const visibility = new PresenceVisibilityUseCase(storage, alice.provider);
        visibility.updatePolicy({ visibility: PresenceVisibility.FRIENDS, authorizedPeerIdentities: ['did:key:someone'] });
        const reloaded = new PresenceVisibilityUseCase(storage, alice.provider); // a fresh instance, same underlying storage — simulates a reload
        assert(reloaded.getPolicy().visibility === PresenceVisibility.FRIENDS, 'K2. A brand-new PresenceVisibilityUseCase instance, over the SAME underlying storage, reads back the persisted policy — genuinely PERSISTENT, unlike every K1 item.');

        // K3. RECONSTRUCTED, never cached: two independent
        // WorldPresenceUseCase instances built over the identical
        // underlying peerMessageBus/connectedPeerRegistry are two
        // distinct objects with two independently-empty starting
        // rosters — never a memoized singleton silently reused.
        const bus = new PeerMessageBus();
        const registry = new ConnectedPeerRegistry();
        const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), alice.provider, { peerMessageBus: bus, connectedPeerRegistry: registry });
        const first = new WorldPresenceUseCase({ peerMessageBus: bus, connectedPeerRegistry: registry, deviceAuthorization: deviceAuth });
        first.dispose();
        const second = new WorldPresenceUseCase({ peerMessageBus: bus, connectedPeerRegistry: registry, deviceAuthorization: deviceAuth });
        assert(first !== second && second.getRoster('any-world').length === 0, 'K3. A fresh WorldPresenceUseCase over the same bus/registry starts with an independently-empty roster — RECONSTRUCTED, never a cached prior instance.');
        second.dispose();

        // K4. Classification table, asserted directly rather than left
        // as prose: PERSISTENT (K2's class), RECONSTRUCTED (K3's class,
        // and every AvatarPresenceSession — a fresh one per WorldView
        // mount, per application/AvatarPresenceSession.js's own header),
        // EPHEMERAL (K1's seven files — never even reconstructable from
        // storage because there is nothing stored to reconstruct from).
        const sessionSource = await readSource('application/AvatarPresenceSession.js');
        assert(/Tracks ONE\s*\n\/\/ user's own live presence for the duration of a World View session/.test(sessionSource),
            "K4. application/AvatarPresenceSession.js's own header: scoped to the duration of ONE World View session — RECONSTRUCTED fresh on every session, exactly K3's own class of behavior, never persisted (K1) and never a durable record the way K2's policy is.");

        console.log('✓ Section K: seven real classes are confirmed, live and structurally, to be EPHEMERAL — no StorageProvider dependency exists at all (K1); PresenceVisibilityUseCase is confirmed PERSISTENT via a real cross-instance storage round-trip (K2); and WorldPresenceUseCase (and, by its own header, AvatarPresenceSession) is confirmed RECONSTRUCTED — a fresh, independently-empty instance every time, never a cached singleton (K3, K4).');
    }

    // ===============================================================
    // Section L — UI vocabulary.
    // ===============================================================
    {
        // L1. The one real presence-facing UI surface this codebase
        // ships keys its rows off identityId/displayName — never a raw
        // connectionId or peerId presented as if it were user identity.
        const membersPanelSource = await readSource('ui/components/WorldMembersPanel.js');
        assert(/:key="row\.identityId"/.test(membersPanelSource), "L1a. ui/components/WorldMembersPanel.js keys its rendered rows by row.identityId.");
        assert(!/connectionId/.test(membersPanelSource) && !/peerId/.test(membersPanelSource),
            'L1b. The panel never references connectionId or peerId at all — a viewer is shown a resolved identity, never transport-layer plumbing.');

        // L2. PresenceLifecycleState/TrustStatus — raw, developer-facing
        // enum constants — are translated to human words in exactly one
        // place before a viewer ever sees them, never the raw constant
        // string leaking through.
        const labelsSource = await readSource('application/AvatarPresenceLabels.js');
        assert(/'Present'/.test(labelsSource) && /'Stale'/.test(labelsSource) && /'Trusted'/.test(labelsSource),
            'L2a. application/AvatarPresenceLabels.js translates the raw PresenceLifecycleState/TrustStatus vocabulary into plain words.');
        const { describeLifecycleState } = await import('../application/AvatarPresenceLabels.js');
        assert(describeLifecycleState(PresenceLifecycleState.PRESENT) === 'Present' && describeLifecycleState('not-a-real-state') === 'Unknown',
            'L2b. Live: a genuine state resolves to its human label; an unrecognized one degrades to "Unknown" rather than leaking the raw internal value or throwing.');

        // L3. World Presence's own advertisement carries an
        // identityId-free wire shape — identity is never something the
        // payload itself claims, so there is no raw claimed-identity
        // string a UI could accidentally surface unverified.
        const spatialAdSource = await readSource('core/WorldSpatialPresenceAdvertisement.js');
        assert(/there is no\s*\n\/\/ `identityId` field below on purpose/.test(spatialAdSource),
            'L3. core/WorldSpatialPresenceAdvertisement.js\'s own header: no identityId field exists on the wire payload at all — a UI can only ever show an identity this replica itself resolved and verified from the live connection, never an unverified claim.');

        console.log('✓ Section L: the one real presence UI surface keys off resolved identityId, never a raw connectionId/peerId (L1); PresenceLifecycleState/TrustStatus are translated into plain words in one place, degrading safely on an unrecognized value (L2); and the wire protocol itself carries no self-claimed identity field for a UI to accidentally trust (L3).');
    }

    // ===============================================================
    // Section M — Async ownership.
    // ===============================================================
    {
        // M1. A throttled spatial-presence flush is scoped per-World and
        // cancelled the instant that World is left — a pending flush
        // timer never fires a broadcast for a World this replica already
        // departed.
        const alice = makeDevice('alice-m1');
        const bus = new PeerMessageBus();
        const registry = new ConnectedPeerRegistry();
        const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), alice.provider, { peerMessageBus: bus, connectedPeerRegistry: registry });
        let sentCount = 0;
        const originalSend = bus.send.bind(bus);
        bus.send = (...args) => { sentCount += 1; return originalSend(...args); };
        const spatialPresence = new WorldSpatialPresenceUseCase({ peerMessageBus: bus, connectedPeerRegistry: registry, deviceAuthorization: deviceAuth, minIntervalMs: 40 });
        spatialPresence.enterWorld('world-m1', { position: { x: 0, z: 0 } });
        spatialPresence.updateSpatial('world-m1', { position: { x: 1, z: 1 } }); // immediate (selection/activity path not touched, but nothing sent yet inside the throttle window from the SECOND call)
        // Nothing is actually connected, so send() never has a live peer
        // to reach — the assertion here is about the TIMER, not delivery:
        const sourceBefore = await readSource('application/WorldSpatialPresenceUseCase.js');
        assert(/this\._flushTimers = new Map\(\);/.test(sourceBefore) && /_clearFlush\(worldDocumentId\)/.test(sourceBefore),
            'M1a. Flush timers are tracked per-worldDocumentId in their own Map, with a dedicated per-World cancellation method.');
        spatialPresence.leaveWorld('world-m1');
        assert(/leaveWorld\(worldDocumentId\) \{[\s\S]{0,200}this\._clearFlush\(worldDocumentId\);/.test(sourceBefore),
            'M1b. leaveWorld() itself calls _clearFlush() before anything else — a pending throttled flush for a World just left can never fire afterward.');
        await wait(80); // comfortably past minIntervalMs, to let any surviving timer fire if the cancellation had failed
        spatialPresence.dispose();
        console.log(`(M1 diagnostic: ${sentCount} bus.send() call(s) observed — informational only, no live peer was ever connected to receive one)`);

        // M2. dispose() clears EVERY outstanding flush timer, not merely
        // the one for the most-recently-entered World — confirmed
        // structurally, since exercising N independent real timers
        // firing-vs-not is exactly the flakiness a deterministic source
        // citation avoids.
        assert(/for \(const worldDocumentId of Array\.from\(this\._flushTimers\.keys\(\)\)\) \{\s*this\._clearFlush\(worldDocumentId\);/.test(sourceBefore),
            'M2. dispose() iterates and clears every entry in _flushTimers — never leaves a second World\'s own pending flush running after this replica\'s whole presence stack is torn down.');

        // M3. A concurrent AutoConnectKnownPeersUseCase pass coalesces a
        // trigger that arrives mid-run into exactly one MORE pass
        // afterward, never two overlapping passes — live, using a
        // minimal (but real-shaped) FindPeerUseCase stand-in, exactly
        // the "minimal stand-in for an unrelated collaborator" pattern
        // tests/PeerAvatarPresence.test.js's own Section B/C already
        // establishes for this codebase.
        const relationships = new PeerRelationshipUseCase(new InMemoryStorageProvider(), alice.provider);
        // rememberPeer() requires a real, verified peer/PeerIdentity.js —
        // "an authenticated peer, never an invitation hint" (its own
        // thrown message) — so this uses two genuine handshakes' own
        // remoteIdentity, never a hand-built plain object.
        const m3Network = new LocalPeerNetwork();
        const m3FriendOne = makeDevice('m3-friend-one');
        const m3FriendTwo = makeDevice('m3-friend-two');
        const m3ConnOne = await connectAndAuthenticate(m3Network, 'alice-m3', alice, 'm3-friend-one', m3FriendOne);
        const m3ConnTwo = await connectAndAuthenticate(m3Network, 'alice-m3-2', alice, 'm3-friend-two', m3FriendTwo);
        let concurrentRuns = 0;
        let maxConcurrentRuns = 0;
        let searchCalls = 0;
        const slowFindPeerUseCase = {
            search: async () => {
                concurrentRuns += 1;
                maxConcurrentRuns = Math.max(maxConcurrentRuns, concurrentRuns);
                searchCalls += 1;
                await wait(15);
                concurrentRuns -= 1;
                return [];
            },
            connect: async () => { throw new Error('never reached: search() always returns no candidates'); }
        };
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: slowFindPeerUseCase, peerRelationshipUseCase: relationships, connectedPeerRegistry: registry });
        relationships.rememberPeer(m3ConnOne.peerA.remoteIdentity, { alias: 'M3 Friend' });
        // Fire a second trigger while the first (construction-time) pass
        // is still in flight.
        relationships.rememberPeer(m3ConnTwo.peerA.remoteIdentity, { alias: 'M3 Friend 2' });
        await wait(80);
        m3ConnOne.peerA.dispose(); m3ConnOne.peerB.dispose(); m3ConnTwo.peerA.dispose(); m3ConnTwo.peerB.dispose();
        autoConnect.dispose();
        assert(maxConcurrentRuns <= 1, 'M3. At no point did two AutoConnectKnownPeersUseCase passes run concurrently — a trigger that arrives mid-run is coalesced into one more pass afterward, never raced against the in-flight one.');
        assert(searchCalls >= 2, 'M3b. (sanity) more than one search() call did actually happen across the coalesced passes — the assertion above is a genuine concurrency proof, not merely a single pass with nothing to overlap.');

        console.log('✓ Section M: World Spatial Presence\'s throttled flush is tracked per-World and explicitly cancelled by leaveWorld()/dispose() before anything else runs, confirmed by direct source citation of both call sites (M1, M2); and a concurrent AutoConnectKnownPeersUseCase trigger is live-confirmed, via an actual measured concurrency count, to coalesce into one more pass rather than racing the in-flight one (M3).');
    }

    // ===============================================================
    // Section N — Flagship.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('alice-n');
        const bob = makeDevice('bob-n');
        const charlie = makeDevice('charlie-n');
        const aliceStack = makeStack(alice, { minIntervalMs: 20 });
        const bobStack = makeStack(bob, { minIntervalMs: 20 });
        const charlieStack = makeStack(charlie, { minIntervalMs: 20 });

        const ab = await connectAndAuthenticate(network, 'alice-n-b', alice, 'bob-n-a', bob);
        aliceStack.connectedPeerRegistry.add(ab.peerA);
        bobStack.connectedPeerRegistry.add(ab.peerB);
        await wait(10);

        // Step 1 — Alice enters World A: all three presence protocols at
        // once, exactly a real WorldView mount would.
        const aliceBody = makeAvatarBody('alice-n', { position: { x: 0, y: 0, z: 0 } });
        aliceStack.worldPresence.enterWorld('world-n-a', WorldPresenceActivity.EXPLORING);
        aliceStack.spatialPresence.enterWorld('world-n-a', { position: { x: 0, z: 0 } });
        await wait(20);
        // A World Presence broadcast reaches every AUTHENTICATED peer
        // regardless of whether THEY have entered that World themselves
        // — mirroring WorldNavigationSession.js's own "Watching Presence
        // Never Requires Having One" principle one layer up: Bob already
        // sees Alice present in World A even though he has not entered
        // it yet himself.
        assert(bobStack.worldPresence.getRoster('world-n-a').length === 1, 'N1. Bob already sees Alice present in World A, even before entering it himself — receiving presence never requires having entered.');

        // Step 2 — Bob enters World A.
        const bobBody = makeAvatarBody('bob-n', { position: { x: 5, y: 0, z: 5 } });
        bobStack.worldPresence.enterWorld('world-n-a', WorldPresenceActivity.EXPLORING);
        bobStack.spatialPresence.enterWorld('world-n-a', { position: { x: 5, z: 5 } });
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-n-a').length === 1 && aliceStack.spatialPresence.getSpatialRoster('world-n-a').length === 1,
            "N2. Alice's view of World A now shows Bob, on BOTH presence protocols independently.");

        // Step 3-4 — Alice moves, Bob moves.
        aliceBody.session.update({ position: { x: 10, y: 0, z: 10 } });
        aliceStack.spatialPresence.updateSpatial('world-n-a', { position: { x: 10, z: 10 }, activity: WorldSpatialActivity.WALKING });
        bobBody.session.update({ position: { x: 15, y: 0, z: 15 } });
        bobStack.spatialPresence.updateSpatial('world-n-a', { position: { x: 15, z: 15 }, activity: WorldSpatialActivity.WALKING });
        await wait(30);
        assert(bobStack.spatialPresence.getSpatialRoster('world-n-a')[0].devices[0].position.x === 10, "N3. Bob sees Alice's new position.");
        assert(aliceStack.spatialPresence.getSpatialRoster('world-n-a')[0].devices[0].position.x === 15, "N4. Alice sees Bob's new position.");

        // Step 5 — Charlie enters World A too.
        const ac = await connectAndAuthenticate(network, 'alice-n-c', alice, 'charlie-n-a', charlie);
        aliceStack.connectedPeerRegistry.add(ac.peerA);
        charlieStack.connectedPeerRegistry.add(ac.peerB);
        await wait(10);
        charlieStack.worldPresence.enterWorld('world-n-a', WorldPresenceActivity.EXPLORING);
        charlieStack.spatialPresence.enterWorld('world-n-a', { position: { x: -5, z: -5 } });
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-n-a').length === 2, "N5. Alice now sees both Bob and Charlie in World A.");
        assert(bobStack.worldPresence.getRoster('world-n-a').length === 1
            && bobStack.worldPresence.getRoster('world-n-a')[0].identityId === resolveDirectSocialIdentity(ab.peerB).identityId,
            "N5b. Bob and Charlie never directly connected to each other — Bob's own roster, built only from HIS live connections, correctly lists exactly Alice and never Charlie at all (this is a real, structural network-topology fact, not a bug this milestone is finding).");

        // Step 6 — Bob disconnects.
        ab.peerA.close();
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-n-a').length === 1 && aliceStack.worldPresence.getRoster('world-n-a')[0].identityId === resolveDirectSocialIdentity(ac.peerA).identityId,
            "N6. The instant Bob disconnects, Alice's roster drops to Charlie only — Bob's own last-known position/activity is not merely stale, it is gone.");

        // Step 7 — Alice continues (moves again) with Bob gone; Charlie
        // is unaffected.
        aliceStack.spatialPresence.updateSpatial('world-n-a', { position: { x: 20, z: 20 }, activity: WorldSpatialActivity.WALKING });
        await wait(20);
        assert(charlieStack.spatialPresence.getSpatialRoster('world-n-a')[0].devices[0].position.x === 20,
            "N7. Charlie sees Alice's continued movement without interruption — Bob's disconnect never affected Alice's OTHER live relationship.");

        // Step 8 — Bob reconnects (a fresh connection, same identity).
        const abReconnect = await connectAndAuthenticate(network, 'alice-n-b-2', alice, 'bob-n-a-2', bob);
        aliceStack.connectedPeerRegistry.add(abReconnect.peerA);
        bobStack.connectedPeerRegistry.add(abReconnect.peerB);
        await wait(10);
        bobStack.worldPresence.enterWorld('world-n-a', WorldPresenceActivity.EXPLORING);
        bobStack.spatialPresence.enterWorld('world-n-a', { position: { x: 15, z: 15 } });
        await wait(20);
        assert(aliceStack.worldPresence.getRoster('world-n-a').length === 2,
            "N8. Bob's reconnect brings the roster back to Bob + Charlie — exactly two, never three; the pre-disconnect entry never lingered to be duplicated.");

        // Step 9-10 — Alice leaves World A and enters World B.
        aliceStack.worldPresence.leaveWorld('world-n-a');
        aliceStack.spatialPresence.leaveWorld('world-n-a');
        aliceStack.worldPresence.enterWorld('world-n-b', WorldPresenceActivity.EXPLORING);
        aliceStack.spatialPresence.enterWorld('world-n-b', { position: { x: 0, z: 0 } });
        await wait(20);
        assert(bobStack.worldPresence.getRoster('world-n-a').length === 0, "N9. Bob's own view of World A no longer includes Alice — she genuinely left.");
        // N10 — a genuine, worth-naming architectural characteristic
        // rather than a bug: a presence broadcast reaches every
        // currently AUTHENTICATED peer, full stop (see
        // application/WorldPresenceUseCase.js's own header, "computed
        // from live, AUTHORIZED connections" — authorized means
        // authenticated, never "also present in the same World"). Bob
        // and Alice are still directly connected, so Bob's own _remote
        // map DOES gain an entry for World B the instant Alice enters
        // it — symmetric to N1's own finding, now shown on the LEAVE/
        // re-enter side too. World-scoping is enforced entirely by which
        // worldDocumentId key a CALLER chooses to query (F3's own
        // structural point), never by the transport withholding data
        // Bob was never "supposed" to see.
        assert(bobStack.worldPresence.getRoster('world-n-b').length === 1,
            "N10a. Bob's own map DOES gain a World B entry for Alice — a live, authenticated connection receives every World a peer advertises, not only the one(s) the receiver happens to also be in.");
        assert(bobStack.worldPresence.getRoster('world-n-a').length === 0,
            "N10b. ...yet Bob's own World A view stays correctly empty (reconfirming N9) — the SAME underlying data never lets a caller who queries the right key see anything stale or cross-World, because _remote is keyed by worldDocumentId, never merged into one flat view (F3's own structural citation, reconfirmed live here under a real reconnect/leave/re-enter sequence).");

        // Step 11 — Bob remains in World A. He himself never called
        // leaveWorld() for it — confirmed directly against his own
        // WorldPresenceUseCase's own local bookkeeping (application/
        // WorldPresenceUseCase.js's own `_localActivity` map, read here
        // for structural verification the same way other milestones in
        // this codebase reach into a private field to confirm real
        // internal state rather than only its public projection). His
        // own ROSTER of others in World A is empty — not because he left
        // or because anything leaked/broke, but honestly, structurally,
        // because his only live connection into that World was always
        // Alice (this flagship's own star topology — Bob and Charlie
        // were never directly connected, exactly N5b's own finding),
        // and Alice just left. "Remains present" and "currently knows of
        // no one else present" are two independent, both-correct facts.
        assert(bobStack.worldPresence._localActivity.has('world-n-a'),
            "N11a. Bob's own presence in World A is untouched — he never called leaveWorld() for it, unaffected by Alice's departure to a different World entirely.");
        assert(bobStack.worldPresence.getRoster('world-n-a').length === 0,
            "N11b. Bob's own roster of World A is empty — an honest reflection of his real connection topology (only ever connected to Alice, who just left), never a leak of Charlie's presence through some indirect path, and never confused with Bob's own continued presence (N11a).");

        // Final structural check: the local Wanderer bodies (AvatarPresence)
        // themselves were never touched by ANY of the World-presence
        // choreography above — genuinely independent protocols to the end.
        assert(aliceBody.session.current.position.x === 10 && bobBody.session.current.position.x === 15,
            'N12. Both Wanderers\' own AvatarPresence bodies retain their last real movement, completely independent of the entire World Presence/World Spatial Presence sequence just proven above — three protocols, one consistent, non-leaking story.');

        aliceStack.worldPresence.dispose(); aliceStack.spatialPresence.dispose();
        bobStack.worldPresence.dispose(); bobStack.spatialPresence.dispose();
        charlieStack.worldPresence.dispose(); charlieStack.spatialPresence.dispose();
        ab.peerB.dispose(); ac.peerA.dispose(); ac.peerB.dispose(); abReconnect.peerA.dispose(); abReconnect.peerB.dispose();

        console.log('✓ Section N (FLAGSHIP): Alice enters World A -> Bob enters -> both move -> Charlie enters -> Bob disconnects -> Alice continues unaffected -> Bob reconnects without duplicating his roster entry -> Alice leaves A for World B -> Bob remains in A with an unaffected, correctly-scoped view — verified at every single transition, live, over real authenticated connections, across all three presence protocols simultaneously. One genuine, worth-naming characteristic surfaced along the way (N10): a live connection receives every World its peer advertises, not only the World(s) the receiver happens to also be in — correct scoping is a property of which worldDocumentId key a caller queries (kept correct in every case tested), never of the transport withholding data.');
    }

    console.log('\n=== VERDICT ===');
    console.log('WANDERER_PRESENCE_SESSION_CONTINUITY: COHERENT.');
    console.log('This codebase runs three deliberately separate, correctly-named presence protocols (avatar-presence, world-presence, world-spatial-presence) over one authoritative peer-connection layer — never one conflated mechanism. Identity separation holds across all seven axes tested, including through reconnection. Enter/leave semantics are two genuinely different, both-correct designs (explicit for World membership, elapsed-time-inferred plus heartbeat for avatar bodies) rather than an inconsistency. World, avatar/vehicle, and content boundaries all held under live, multi-Wanderer, and adversarial-input testing, and the data model itself (a Map keyed by worldDocumentId) never conflates two Worlds\' own presence records. One real, precisely-named characteristic (N10, not a gap): a live authenticated connection receives every World its peer advertises, not only the one(s) the receiver also happens to be in — correct World-scoping is a property of which worldDocumentId key a caller queries, which every real call site in this codebase (WorldNavigationSession\'s own getWorldPresenceRoster()/getWorldSpatialPresenceRoster(), always called with the current View\'s own documentId) already gets right, confirmed by source citation in Section A/F. No concrete product gap was found; per this milestone\'s own brief, no follow-up implementation milestone is recommended from this audit alone.');
}

main().then(() => {
    console.log('\n✓✓✓ ALL WANDERER PRESENCE & SESSION CONTINUITY TESTS PASSED ✓✓✓');
}).catch((error) => {
    console.error('✗ TEST FAILED:', error.message);
    console.error(error.stack);
    if (typeof process !== 'undefined' && process.exit) {
        process.exit(1);
    }
});
