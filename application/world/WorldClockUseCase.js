import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { createSecureId } from '../../core/document/createId.js';
import {
    WORLD_CLOCK,
    clockSampleFrom,
    bestClockSample,
    agreedClockOffset,
    slewClockCorrection
} from '../../core/world/WorldClockAgreement.js';

// When a newly connected peer is asked for its clock: three quick samples
// to find a good round trip, then one a minute to follow drift.
const PROBE_DELAYS_MS = Object.freeze([0, 1000, 2000]);
const PROBE_INTERVAL_MS = 60_000;

// PINGs still waiting for their PONG, per peer; older ones are forgotten.
const MAX_PENDING_PINGS = 8;

const MAX_NONCE_LENGTH = 64;

// The World clock this device shows time-sampled things at
// (core/world/WorldClockAgreement.js): its own clock, moved to agree with
// every authenticated peer it is connected to. App-wide, like the peer bus,
// so the clocks already agree when World View opens.
//
// Over `forkbuild:world-clock` (version 1):
//
//   { type: 'PING', nonce }          "what does your clock say?"
//   { type: 'PONG', nonce, time }    "this", in milliseconds, uncorrected
//
// A PONG counts only when it answers a PING this device sent that peer and
// is still waiting on, so nobody can feed it times it never asked for. With
// no peers, or none whose clock is close enough to follow, World time is
// simply this device's own clock.
export class WorldClockUseCase {
    static DEFAULT_PROTOCOL = 'forkbuild:world-clock';

    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        protocol = WorldClockUseCase.DEFAULT_PROTOCOL,
        now = () => Date.now(),
        setTimer = (callback, ms) => setTimeout(callback, ms),
        clearTimer = (handle) => clearTimeout(handle),
        mintNonce = createSecureId
    } = {}) {
        this._bus = peerMessageBus || null;
        this._registry = connectedPeerRegistry || null;
        this._protocol = protocol;
        this._now = now;
        this._setTimer = setTimer;
        this._clearTimer = clearTimer;
        this._mintNonce = mintNonce;
        // connectionId -> { peer, pending: Map(nonce -> sentAt), samples, probes, timer }
        this._peers = new Map();
        this._target = 0;
        this._applied = 0;
        this._lastReal = this._now();
        this._unsubscribeBus = null;
        this._unsubscribeRegistry = null;
        if (!this._bus || !this._registry) return;

        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
        this._unsubscribeRegistry = this._registry.onChange(() => this._reconcile());
        this._reconcile();
    }

    // World time now, in seconds.
    seconds() {
        return this.nowMs() / 1000;
    }

    // World time now, in milliseconds.
    nowMs() {
        const real = this._now();
        const elapsed = real - this._lastReal;
        this._applied = slewClockCorrection(this._applied, this._target, elapsed);
        this._lastReal = real;
        return real + this._applied;
    }

    // How far World time is ahead of this device's clock right now (ms).
    correctionMs() {
        return this._applied;
    }

    // How far it is heading (ms): where the correction settles.
    targetCorrectionMs() {
        return this._target;
    }

    dispose() {
        if (this._unsubscribeBus) this._unsubscribeBus();
        if (this._unsubscribeRegistry) this._unsubscribeRegistry();
        this._unsubscribeBus = null;
        this._unsubscribeRegistry = null;
        for (const state of this._peers.values()) {
            if (state.timer !== null) this._clearTimer(state.timer);
        }
        this._peers.clear();
    }

    // Starts asking every newly authenticated peer, and forgets every peer
    // that is gone.
    _reconcile() {
        const live = new Map();
        for (const peer of this._registry.list()) {
            if (peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) {
                live.set(peer.connectionId, peer);
            }
        }
        for (const [connectionId, state] of this._peers) {
            if (!live.has(connectionId)) {
                if (state.timer !== null) this._clearTimer(state.timer);
                this._peers.delete(connectionId);
            }
        }
        for (const [connectionId, peer] of live) {
            if (this._peers.has(connectionId)) continue;
            this._bus.attach(peer);
            const state = { peer, pending: new Map(), samples: [], probes: 0, timer: null };
            this._peers.set(connectionId, state);
            this._scheduleProbe(connectionId, state);
        }
        this._retarget();
    }

    _scheduleProbe(connectionId, state) {
        const delay = state.probes < PROBE_DELAYS_MS.length ? PROBE_DELAYS_MS[state.probes] : PROBE_INTERVAL_MS;
        state.timer = this._setTimer(() => {
            state.timer = null;
            if (this._peers.get(connectionId) !== state) return;
            state.probes += 1;
            this._ping(state);
            this._scheduleProbe(connectionId, state);
        }, delay);
    }

    _ping(state) {
        const nonce = this._mintNonce();
        state.pending.set(nonce, this._now());
        while (state.pending.size > MAX_PENDING_PINGS) {
            state.pending.delete(state.pending.keys().next().value);
        }
        this._send(state.peer, { type: 'PING', nonce });
    }

    _send(peer, payload) {
        try {
            this._bus.send(peer, this._protocol, payload, { version: 1 });
        } catch {
            // Not authenticated any more: the registry's next change drops it.
        }
    }

    _handleIncoming(payload, meta) {
        const peer = meta && meta.connectedPeer;
        if (!peer || meta.version !== 1 || !payload || typeof payload !== 'object') return;
        const { nonce } = payload;
        if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > MAX_NONCE_LENGTH) return;
        if (payload.type === 'PING') {
            this._send(peer, { type: 'PONG', nonce, time: this._now() });
            return;
        }
        if (payload.type !== 'PONG') return;
        const state = this._peers.get(peer.connectionId);
        if (!state || state.peer !== peer || !state.pending.has(nonce)) return;
        const sentAt = state.pending.get(nonce);
        state.pending.delete(nonce);
        const sample = clockSampleFrom({ sentAt, peerTime: payload.time, receivedAt: this._now() });
        if (!sample) return;
        state.samples.push(sample);
        if (state.samples.length > WORLD_CLOCK.samplesKept) state.samples.shift();
        this._retarget();
    }

    _retarget() {
        const offsets = [];
        for (const state of this._peers.values()) {
            const best = bestClockSample(state.samples);
            if (best) offsets.push(best.offsetMs);
        }
        this._target = agreedClockOffset(offsets);
    }
}
