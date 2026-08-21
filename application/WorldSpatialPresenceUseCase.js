import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import {
    toWorldSpatialPresenceAdvertisement,
    isValidWorldSpatialPresenceAdvertisement
} from '../core/WorldSpatialPresenceAdvertisement.js';
import { WorldSpatialSelection } from '../core/WorldSpatialSelection.js';
import { WorldSpatialActivity, isValidWorldSpatialActivity } from '../core/WorldSpatialActivity.js';
import { resolveIncomingPresence } from '../core/PresenceIngestion.js';

const SPATIAL_PRESENCE_CHANGED_EVENT = 'WorldSpatialPresenceChanged';

// 0.3.0 — Collaborative Spatial Presence.
//
// 0.2.98's own WorldPresenceUseCase answers "who else is here, and are
// they broadly exploring or editing" — a coarse, low-frequency fact.
// 0.2.99 put a UI on top of it. This class answers the question this
// milestone exists for, deliberately ordered after both:
// "WHERE is each present participant, which way are they looking, what
// have they selected, and what do they appear to be doing" — updated as
// often as many times a second, never persisted, never a mutation.
//
// A THIRD, separate protocol from `forkbuild:world-sync`
// (WorldCommandPropagationUseCase) and `forkbuild:world-presence`
// (WorldPresenceUseCase) — see core/WorldSpatialPresenceAdvertisement.js's
// own header for why. This class is structured as closely as possible
// after WorldPresenceUseCase itself — same constructor shape, same
// authenticated-peer broadcast, same "computed from live connections,
// never persisted" discipline, same device-aware identity resolution
// through the injected DeviceAuthorizationPropagationUseCase — because
// nothing about THAT architecture needed to change; only the payload got
// richer and the frequency got higher.
//
// The one genuinely new mechanism this class adds: THROTTLING.
// `updateSpatial()` distinguishes two kinds of change:
//
//   - selection or activity changed  -> broadcast IMMEDIATELY (these are
//     rare, discrete, meaningful events — "Bob selected the House" should
//     never wait behind a timer)
//   - only position/heading changed  -> broadcast at most once every
//     `minIntervalMs` (default ~90ms, comfortably inside the "10-15
//     updates/second" ceiling this milestone's own design conversation
//     settled on) — a camera can move every single animation frame, and
//     nothing downstream needs more than a handful of updates a second
//     to read as continuous.
//
// `sequence` is this replica's own plain, per-World monotonic counter —
// NOT a wall-clock timestamp, and NOT a CausalStamp. It advances by
// exactly one on every LOGICAL call to updateSpatial(), whether or not
// that particular call actually goes out over the wire — exactly
// core/AvatarPresence.js's own "sequence is the sender's own monotonic
// clock; how often it's actually transmitted is a separate transport
// concern" discipline. A receiver that only ever sees every third
// sequence number (because two were throttled away) loses nothing: it
// still always displays the LATEST value it received, which is always
// newer than whatever it already had — the identical gap-tolerant
// guarantee core/PresenceIngestion.js#resolveIncomingPresence() already
// gives 0.2.37's avatar presence, reused here completely unmodified
// rather than re-inventing a second "is this newer" rule.
//
// Device aggregation mirrors WorldPresenceUseCase#getRoster() one rung
// further: getSpatialRoster() groups by resolved SOCIAL identityId, but
// — unlike the coarse roster, which only ever needed a deviceCount — this
// one keeps every device's own independent position/heading/selection/
// activity, because Bob's Desktop and Bob's Tablet are frequently in
// genuinely different places. A caller (a UI panel, a renderer) decides
// whether to show "Bob" once or "Bob · Desktop" / "Bob · Tablet"
// separately — this class only ever hands back the honest, ungrouped
// per-device facts. See this milestone's own design conversation,
// "Device aggregation must continue."
export class WorldSpatialPresenceUseCase {
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        deviceAuthorization,
        protocol = WorldSpatialPresenceUseCase.DEFAULT_PROTOCOL,
        minIntervalMs = 90,
        now = () => Date.now()
    } = {}) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('WorldSpatialPresenceUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('WorldSpatialPresenceUseCase: a ConnectedPeerRegistry is required');
        }
        if (!deviceAuthorization || typeof deviceAuthorization.resolveConnectionIdentity !== 'function') {
            throw new Error('WorldSpatialPresenceUseCase: a DeviceAuthorizationPropagationUseCase is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._deviceAuth = deviceAuthorization;
        this._protocol = protocol;
        this._minIntervalMs = minIntervalMs;
        this._now = typeof now === 'function' ? now : () => Date.now();
        this._eventBus = new EventBus();

        // worldDocumentId -> { position, heading, selection
        // (WorldSpatialSelection), activity, sequence, lastSentAt } —
        // this replica's OWN outgoing state, never persisted.
        this._local = new Map();
        // worldDocumentId -> Map(connectionId -> { identityId, deviceId,
        // position, heading, selection, activity, sequence }) — this
        // replica's live view of every OTHER participant's last-accepted
        // advertisement. Pruned on disconnect, never left to go stale —
        // see _pruneDisconnected() below, identical to WorldPresenceUseCase's
        // own.
        this._remote = new Map();
        // worldDocumentId -> a scheduled setTimeout id — see
        // updateSpatial()'s own header: a throttled (position/heading-only)
        // update that arrives with nothing queued behind it still gets
        // FLUSHED once the throttle window closes, rather than silently
        // waiting forever for a next call that may never come (a camera
        // that moves once and then stops must still eventually be seen
        // at its true resting position).
        this._flushTimers = new Map();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange(() => {
            this._pruneDisconnected();
            // A newly-authenticated peer has seen none of this replica's
            // CURRENT spatial state yet — re-advertise every World this
            // replica is present in, to everyone, exactly like
            // WorldPresenceUseCase's own onChange handler. Cheap: this
            // only ever fires on connect/disconnect, never per-frame.
            for (const [worldDocumentId, state] of this._local) {
                this._broadcast(worldDocumentId, true, state);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Declares this replica spatially present in `worldDocumentId` —
    // IDLE, no selection, and whatever initial position/heading are
    // already known (both optional; a caller with no camera position
    // yet may enter with neither and updateSpatial() the moment it
    // does). Broadcasts immediately, to every AUTHENTICATED peer.
    enterWorld(worldDocumentId, { position = null, heading = null } = {}) {
        if (!worldDocumentId || typeof worldDocumentId !== 'string') {
            throw new Error('WorldSpatialPresenceUseCase.enterWorld(): worldDocumentId is required');
        }
        const state = {
            position: position ? { x: position.x, z: position.z } : null,
            heading: Number.isFinite(heading) ? heading : null,
            selection: WorldSpatialSelection.none(),
            activity: WorldSpatialActivity.IDLE,
            sequence: 0,
            lastSentAt: -Infinity
        };
        this._local.set(worldDocumentId, state);
        this._send(worldDocumentId, state);
    }

    // The one call a session makes many times a second while the camera
    // moves, and occasionally when selection/activity changes. A no-op
    // for a World this replica hasn't entered — call enterWorld() first.
    // See this class's own header for the throttling rule. A throttled
    // (position/heading-only) call that isn't sent immediately is always
    // eventually FLUSHED — see _scheduleFlush() below — so a camera that
    // moves once and then goes still is still seen at its true resting
    // position, never stuck at a stale in-window value forever.
    updateSpatial(worldDocumentId, { position = undefined, heading = undefined, selection = undefined, activity = undefined } = {}) {
        const current = this._local.get(worldDocumentId);
        if (!current) {
            return;
        }
        const resolvedSelection = selection instanceof WorldSpatialSelection
            ? selection
            : (selection === undefined ? current.selection : WorldSpatialSelection.none());
        const resolvedActivity = activity === undefined
            ? current.activity
            : (isValidWorldSpatialActivity(activity) ? activity : WorldSpatialActivity.IDLE);
        const selectionChanged = !resolvedSelection.equals(current.selection);
        const activityChanged = resolvedActivity !== current.activity;

        const next = {
            position: position ? { x: position.x, z: position.z } : current.position,
            heading: Number.isFinite(heading) ? heading : current.heading,
            selection: resolvedSelection,
            activity: resolvedActivity,
            sequence: current.sequence + 1,
            lastSentAt: current.lastSentAt
        };
        this._local.set(worldDocumentId, next);

        const dueByThrottle = (this._now() - current.lastSentAt) >= this._minIntervalMs;
        if (selectionChanged || activityChanged || dueByThrottle) {
            this._clearFlush(worldDocumentId);
            this._send(worldDocumentId, next);
        } else {
            this._scheduleFlush(worldDocumentId, current.lastSentAt);
        }
    }

    // Explicit "I have left" — see core/WorldSpatialPresenceAdvertisement.js's
    // own header: never inferred from silence. A no-op for a World this
    // replica was never present in.
    leaveWorld(worldDocumentId) {
        const current = this._local.get(worldDocumentId);
        if (!current) {
            return;
        }
        this._clearFlush(worldDocumentId);
        this._local.delete(worldDocumentId);
        this._broadcast(worldDocumentId, false, { ...current, sequence: current.sequence + 1 });
    }

    // Every OTHER participant currently spatially present in
    // `worldDocumentId`, grouped by resolved SOCIAL identity — see this
    // class's own header, "Device aggregation must continue." Returns
    // `[{ identityId, devices: [{ deviceId, position, heading,
    // selection, activity, sequence }] }]`, never this replica's own
    // participation (exactly WorldPresenceUseCase#getRoster()'s own
    // "roster of every OTHER participant" rule).
    getSpatialRoster(worldDocumentId) {
        const byConnection = this._remote.get(worldDocumentId);
        if (!byConnection || byConnection.size === 0) {
            return [];
        }
        const grouped = new Map();
        for (const entry of byConnection.values()) {
            let group = grouped.get(entry.identityId);
            if (!group) {
                group = { identityId: entry.identityId, devices: [] };
                grouped.set(entry.identityId, group);
            }
            group.devices.push({
                deviceId: entry.deviceId,
                position: entry.position ? { ...entry.position } : null,
                heading: entry.heading,
                selection: entry.selection,
                activity: entry.activity,
                sequence: entry.sequence
            });
        }
        return Array.from(grouped.values());
    }

    // Returns an unsubscribe function. Fires with `getSpatialRoster(worldDocumentId)`
    // whenever this replica's own live view of that World's remote
    // spatial participants changes.
    onSpatialPresenceChanged(worldDocumentId, callback) {
        const subscription = this._eventBus.subscribe(SPATIAL_PRESENCE_CHANGED_EVENT, ({ worldDocumentId: changedId }) => {
            if (changedId === worldDocumentId) {
                callback(this.getSpatialRoster(worldDocumentId));
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
        for (const worldDocumentId of Array.from(this._flushTimers.keys())) {
            this._clearFlush(worldDocumentId);
        }
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, or deviceAuthorization — all shared,
        // app-wide collaborators this class never owns.
    }

    // Marks `state` as sent right now and broadcasts it — the ONE place
    // `lastSentAt` is ever written, so updateSpatial()'s throttle window
    // always measures from the last thing that actually went out, never
    // from a merely-computed local update.
    _send(worldDocumentId, state) {
        state.lastSentAt = this._now();
        this._broadcast(worldDocumentId, true, state);
    }

    // Guarantees a throttled update is never stranded: schedules exactly
    // one pending flush per World, firing when THIS update's own
    // remaining throttle window closes. Re-scheduling is a no-op — a
    // burst of position-only calls inside one window still produces at
    // most one flush, which always sends whatever is CURRENTLY in
    // `_local` at fire time (the latest state, not whatever was true
    // when the timer was set).
    _scheduleFlush(worldDocumentId, lastSentAt) {
        if (this._flushTimers.has(worldDocumentId)) {
            return;
        }
        const remaining = Math.max(0, this._minIntervalMs - (this._now() - lastSentAt));
        const timer = setTimeout(() => {
            this._flushTimers.delete(worldDocumentId);
            const latest = this._local.get(worldDocumentId);
            if (latest) {
                this._send(worldDocumentId, latest);
            }
        }, remaining);
        if (typeof timer.unref === 'function') {
            timer.unref(); // never keeps a Node process alive on its own
        }
        this._flushTimers.set(worldDocumentId, timer);
    }

    _clearFlush(worldDocumentId) {
        const timer = this._flushTimers.get(worldDocumentId);
        if (timer) {
            clearTimeout(timer);
            this._flushTimers.delete(worldDocumentId);
        }
    }

    _broadcast(worldDocumentId, present, state) {
        const advertisement = toWorldSpatialPresenceAdvertisement({
            worldDocumentId,
            present,
            sequence: state.sequence,
            position: state.position,
            heading: state.heading,
            selection: state.selection ? state.selection.toJSON() : null,
            activity: state.activity
        });
        for (const peer of this._authenticatedPeers()) {
            try {
                this._bus.send(peer, this._protocol, advertisement);
            } catch {
                // A peer's lifecycle can change between the check and
                // this call — degrade to a silent, best-effort drop,
                // exactly like every other fire-and-forget broadcast in
                // this codebase.
            }
        }
    }

    _authenticatedPeers() {
        return this._registry.list().filter((peer) => peer && typeof peer.getLifecycleState === 'function'
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
    }

    // Identity is resolved from the LIVE CONNECTION only — never from
    // anything the payload itself claims. See
    // core/WorldSpatialPresenceAdvertisement.js's own header.
    _handleIncoming(payload, meta) {
        if (!isValidWorldSpatialPresenceAdvertisement(payload)) {
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
        // 0.3.0 — the ONE new trust-boundary step WorldPresenceUseCase's
        // own coarse presence never needed: at up to ~10-15 updates a
        // second, out-of-order delivery is a real, expected occurrence,
        // not an edge case. core/PresenceIngestion.js#resolveIncomingPresence()
        // is reused completely unmodified — a stale or duplicate
        // sequence for this exact connection is simply ignored, never
        // allowed to regress what's currently displayed.
        const currentEntry = byConnection.get(connectedPeer.connectionId) || null;
        const { accepted } = resolveIncomingPresence(
            currentEntry ? { sequence: currentEntry.sequence } : null,
            { sequence: payload.sequence }
        );
        if (!accepted) {
            return;
        }
        byConnection.set(connectedPeer.connectionId, {
            identityId: social.identityId,
            deviceId: social.deviceIdentityId || social.identityId,
            position: payload.position,
            heading: payload.heading,
            selection: WorldSpatialSelection.fromJSON(payload.selection),
            activity: payload.activity,
            sequence: payload.sequence
        });
        this._publishChange(payload.worldDocumentId);
    }

    // See this class's own header — spatial presence is computed from
    // live connections, never persisted, so a dropped connection simply
    // has its last-known entry dropped too, in every World this replica
    // is tracking. Fires a change notification for each World that
    // actually lost an entry.
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
        this._eventBus.publish(SPATIAL_PRESENCE_CHANGED_EVENT, { worldDocumentId });
    }
}

// Deliberately its own namespaced protocol — see
// core/WorldSpatialPresenceAdvertisement.js's own header.
WorldSpatialPresenceUseCase.DEFAULT_PROTOCOL = 'forkbuild:world-spatial-presence';
