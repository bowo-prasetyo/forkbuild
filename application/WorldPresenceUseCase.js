import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { toWorldPresenceAdvertisement, isValidWorldPresenceAdvertisement } from '../core/WorldPresenceAdvertisement.js';
import { WorldPresenceActivity, isValidWorldPresenceActivity } from '../core/WorldPresenceActivity.js';

const PRESENCE_CHANGED_EVENT = 'WorldPresenceChanged';

// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// Answers the question this milestone deliberately orders AFTER
// application/WorldMembershipUseCase.js, not before it (see
// docs/Roadmap.md, 0.2.98: "presence becomes meaningful" only once
// more than one identity can legitimately edit): "who else is currently
// present in this World, and are they exploring or editing it?"
//
// Deliberately a SEPARATE protocol (`forkbuild:world-presence`) from
// `forkbuild:avatar-presence` (presence/PeerAvatarPresenceBroadcastProvider.js)
// — that protocol answers "where is this avatar's BODY in 3D space,"
// many times a second, always signed-optionally through
// core/AvatarPresenceAdvertisement.js. This one answers a coarser,
// much lower-frequency question — "is this SOCIAL IDENTITY here at
// all, and what are they broadly doing" — completely independent of
// whether that identity even has an avatar rendered. Also separate
// from `forkbuild:world-sync` (application/WorldCommandPropagationUseCase.js)
// — presence is never a mutation and is never recorded in a World's
// own operation log.
//
// The central architectural rule, worth stating once: World Presence is
// COMPUTED from currently live, authenticated peer connections, never
// PERSISTED. There is no `WorldPresence` row saved anywhere in
// storage/, and core/WorldPresenceAdvertisement.js is permanently
// unsigned, exactly like core/AvatarPresence.js's own — see that file's
// own header for the identical reasoning applied here. A participant
// who disconnects simply stops appearing in getRoster()'s next call;
// nothing needs to be told they left, the same way nothing needs to be
// told an avatar's presence advertisement stopped arriving. See
// docs/Principles.md, "World Presence Is Computed From Live, Authorized
// Connections, Never Persisted" (0.2.98).
//
// Identity, for this protocol, is resolved EXACTLY the way
// application/WorldCommandPropagationUseCase.js's own step 3 already
// does: through the injected `deviceAuthorization`
// (application/DeviceAuthorizationPropagationUseCase.js)
// `resolveConnectionIdentity(connectedPeer)` — DIRECT or DEVICE, device-
// aware, never a bare raw key. This is what makes Bob's Desktop and
// Bob's Tablet both roll up into ONE roster entry with
// `deviceCount: 2` — see getRoster()'s own header — with zero
// presence-specific device logic in this class at all.
//
// Crucially, `canEdit` on each roster entry is NEVER read off the
// remote party's own self-reported `activity` — a participant claiming
// EDITING proves nothing about whether they actually HOLD EDIT
// authority (see core/WorldPresenceActivity.js's own header, "Being
// online is not the same as being authorized to edit"). It is always
// RECOMPUTED locally, fresh on every getRoster() call, through the
// injected `resolveCanEdit(worldDocumentId, identityId)` — the exact
// same predicate application/WorldAuthorizationService.js#canEdit()
// already answers. Revoking Bob's World edit grant
// (application/WorldMembershipUseCase.js#revokeEdit()) therefore
// changes what the very next getRoster() call reports for him — with
// zero need to disconnect his still-perfectly-live WebRTC connection,
// the identical "revocation is a signing/authorization gate, not a
// connection-teardown event" discipline 0.2.78's own device revocation
// already established.
export class WorldPresenceUseCase {
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        deviceAuthorization,
        resolveCanEdit = null,
        protocol = WorldPresenceUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('WorldPresenceUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('WorldPresenceUseCase: a ConnectedPeerRegistry is required');
        }
        if (!deviceAuthorization || typeof deviceAuthorization.resolveConnectionIdentity !== 'function') {
            throw new Error('WorldPresenceUseCase: a DeviceAuthorizationPropagationUseCase is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._deviceAuth = deviceAuthorization;
        this._resolveCanEdit = typeof resolveCanEdit === 'function' ? resolveCanEdit : null;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        // worldDocumentId -> activity, ONLY for the Worlds this replica
        // itself currently participates in. Never persisted — see this
        // class's own header.
        this._localActivity = new Map();
        // worldDocumentId -> Map(connectionId -> { identityId, activity }),
        // this replica's own live, in-memory view of every OTHER
        // participant's last-known advertisement. Pruned, never left to
        // go stale — see _pruneDisconnected() below.
        this._remote = new Map();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange(() => {
            this._pruneDisconnected();
            // A newly-authenticated peer has seen none of this
            // replica's CURRENT presence yet — there is no "replay
            // history to a new joiner" mechanism the way a durable
            // protocol would need, so the simplest correct fix is to
            // simply re-advertise every World this replica is
            // currently present in, to everyone, on every registry
            // change. Presence payloads are tiny and this handler only
            // ever fires on connect/disconnect/lifecycle transitions,
            // never per-frame.
            for (const worldDocumentId of this._localActivity.keys()) {
                this._broadcast(worldDocumentId, true, this._localActivity.get(worldDocumentId));
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Declares this replica present in `worldDocumentId` and broadcasts
    // it to every currently AUTHENTICATED peer. Calling it again for a
    // World this replica is already present in is exactly setActivity()
    // — safe, idempotent, simply re-advertises.
    enterWorld(worldDocumentId, activity = WorldPresenceActivity.EXPLORING) {
        if (!worldDocumentId || typeof worldDocumentId !== 'string') {
            throw new Error('WorldPresenceUseCase.enterWorld(): worldDocumentId is required');
        }
        const resolvedActivity = isValidWorldPresenceActivity(activity) ? activity : WorldPresenceActivity.EXPLORING;
        this._localActivity.set(worldDocumentId, resolvedActivity);
        this._broadcast(worldDocumentId, true, resolvedActivity);
    }

    // Updates this replica's own self-reported activity for a World it
    // is already present in (a no-op for one it isn't — call
    // enterWorld() first) — the call a session makes when its own
    // EDIT authority changes (a fresh grant arrives, or an existing one
    // is revoked), so its own advertised activity stays honest.
    setActivity(worldDocumentId, activity) {
        if (!this._localActivity.has(worldDocumentId)) {
            return;
        }
        const resolvedActivity = isValidWorldPresenceActivity(activity) ? activity : WorldPresenceActivity.EXPLORING;
        this._localActivity.set(worldDocumentId, resolvedActivity);
        this._broadcast(worldDocumentId, true, resolvedActivity);
    }

    // Explicit "I have left" — broadcasts a LEAVE and forgets this
    // World locally. A no-op for a World this replica was never present
    // in.
    leaveWorld(worldDocumentId) {
        if (!this._localActivity.has(worldDocumentId)) {
            return;
        }
        this._localActivity.delete(worldDocumentId);
        this._broadcast(worldDocumentId, false, null);
    }

    // The roster of every OTHER (never this replica's own) participant
    // currently present in `worldDocumentId`, grouped by resolved
    // SOCIAL identity — Bob's Desktop and Bob's Tablet both roll up
    // into one `{ identityId: bob, deviceCount: 2, activity, canEdit }`
    // entry, exactly the multi-device composition this class's own
    // header describes. `activity` is the self-reported hint (EDITING
    // if ANY of that identity's live devices claims it, matching "Bob
    // is editing on his Desktop even though his Tablet is merely
    // watching" as the more informative of the two); `canEdit` is
    // ALWAYS locally recomputed — see this class's own header — and
    // simply `null` when no `resolveCanEdit` was wired (the exact
    // "graceful absence" posture every optional collaborator in this
    // codebase already follows).
    getRoster(worldDocumentId) {
        const byConnection = this._remote.get(worldDocumentId);
        if (!byConnection || byConnection.size === 0) {
            return [];
        }
        const grouped = new Map();
        for (const entry of byConnection.values()) {
            const existing = grouped.get(entry.identityId) || { identityId: entry.identityId, deviceCount: 0, activity: WorldPresenceActivity.EXPLORING };
            existing.deviceCount += 1;
            if (entry.activity === WorldPresenceActivity.EDITING) {
                existing.activity = WorldPresenceActivity.EDITING;
            }
            grouped.set(entry.identityId, existing);
        }
        const roster = Array.from(grouped.values());
        for (const entry of roster) {
            entry.canEdit = this._resolveCanEdit ? Boolean(this._resolveCanEdit(worldDocumentId, entry.identityId)) : null;
        }
        return roster;
    }

    // Returns an unsubscribe function. Fires with `getRoster(worldDocumentId)`
    // whenever this replica's own live view of that World's remote
    // participants changes (an advertisement arrived, or a connection
    // dropped and was pruned).
    onPresenceChanged(worldDocumentId, callback) {
        const subscription = this._eventBus.subscribe(PRESENCE_CHANGED_EVENT, ({ worldDocumentId: changedId }) => {
            if (changedId === worldDocumentId) {
                callback(this.getRoster(worldDocumentId));
            }
        });
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, or deviceAuthorization — all shared,
        // app-wide collaborators this class never owns.
    }

    _broadcast(worldDocumentId, present, activity) {
        const advertisement = toWorldPresenceAdvertisement({ worldDocumentId, present, activity });
        for (const peer of this._authenticatedPeers()) {
            try {
                this._bus.send(peer, this._protocol, advertisement);
            } catch {
                // A peer's lifecycle can change between the check and
                // this call — degrade to a silent, best-effort drop,
                // exactly like every other fire-and-forget broadcast in
                // this codebase (presence/PeerAvatarPresenceBroadcastProvider.js's
                // own advertise()).
            }
        }
    }

    _authenticatedPeers() {
        return this._registry.list().filter((peer) => peer && typeof peer.getLifecycleState === 'function'
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
    }

    // Identity is resolved from the LIVE CONNECTION only
    // (`meta.connectedPeer.remoteIdentity`, device-resolved through
    // `resolveConnectionIdentity`) — never from anything the payload
    // itself claims, exactly the same discipline core/AvatarPresence.js
    // already established for avatar movement, and consistent with
    // core/WorldPresenceAdvertisement.js's own permanently-unsigned
    // wire shape (see that file's header).
    _handleIncoming(payload, meta) {
        if (!isValidWorldPresenceAdvertisement(payload)) {
            return;
        }
        const connectedPeer = meta && meta.connectedPeer;
        if (!connectedPeer || connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            return;
        }
        const social = this._deviceAuth.resolveConnectionIdentity(connectedPeer);
        if (!social || !social.identityId) {
            return;
        }
        let byConnection = this._remote.get(payload.worldDocumentId);
        if (!payload.present) {
            if (byConnection) {
                byConnection.delete(connectedPeer.connectionId);
            }
            this._publishChange(payload.worldDocumentId);
            return;
        }
        if (!byConnection) {
            byConnection = new Map();
            this._remote.set(payload.worldDocumentId, byConnection);
        }
        byConnection.set(connectedPeer.connectionId, { identityId: social.identityId, activity: payload.activity });
        this._publishChange(payload.worldDocumentId);
    }

    // See this class's own header — presence is computed from live
    // connections, never persisted, so a connection that has dropped
    // simply has its last-known entries dropped too, in every World
    // this replica is tracking. Fires a change notification for each
    // World that actually lost an entry.
    _pruneDisconnected() {
        const liveConnectionIds = new Set(this._authenticatedPeers().map((peer) => peer.connectionId));
        for (const [worldDocumentId, byConnection] of this._remote) {
            let pruned = false;
            for (const connectionId of Array.from(byConnection.keys())) {
                if (!liveConnectionIds.has(connectionId)) {
                    byConnection.delete(connectionId);
                    pruned = true;
                }
            }
            if (pruned) {
                this._publishChange(worldDocumentId);
            }
        }
    }

    _publishChange(worldDocumentId) {
        this._eventBus.publish(PRESENCE_CHANGED_EVENT, { worldDocumentId });
    }
}

// Deliberately its own namespaced protocol — see this file's own
// header.
WorldPresenceUseCase.DEFAULT_PROTOCOL = 'forkbuild:world-presence';
