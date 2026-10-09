import { PeerSessionManager } from '../peer/PeerSessionManager.js';
import { PartAssembler, sendInParts } from '../peer/ChunkedPeerTransfer.js';
import { RestoreMode } from '../backup/DeviceBackupUseCase.js';
import { DiscoveryBootstrap } from '../../peer/DiscoveryBootstrap.js';
import { RendezvousDiscoveryProvider } from '../../peer/RendezvousDiscoveryProvider.js';
import { PeerMessageBus } from '../../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { EphemeralIdentityProvider } from '../../identity/EphemeralIdentityProvider.js';
import {
    createDevicePairingCode, devicePairingPassphrase, parseDevicePairingCode, randomDevicePairingSecret
} from '../../core/DevicePairingCode.js';

// Copies this device's builds to another device through a code (core/
// DevicePairingCode.js), shown as a QR code and a link:
//
//   this device (sender)                    the other device (receiver)
//   ─────────────────────                   ───────────────────────────
//   a one-off identity and secret;
//   publishes a WebRTC offer on the
//   rendezvous servers under that
//   identity; shows the code        ──────► opens the link: finds the offer by
//                                           the code's identity, leaves its
//                                           answer in the rendezvous mailbox
//   collects the answer; the peer connection authenticates both one-off keys
//   sends a backup of everything ─────────► receives it in parts, opens it
//   (application/backup/), encrypted        with the secret, shows what it
//   with the secret                         holds; "received" goes back
//                                           Add to this device: merges it
//                                           (nothing here is overwritten)
//
// Both sides use a PeerSessionManager of their own around a one-off
// identity (identity/EphemeralIdentityProvider.js), so the user's identity
// is never involved, need not be unlocked, and never meets the rendezvous
// servers. The servers and the network see the one-off keys and
// ciphertext; the secret exists only in the code.
//
// One code serves one device, for PAIRING_TTL_MS. Showing a new code
// starts over.

export const DEVICE_PAIRING_PROTOCOL = 'forkbuild:device-pairing';
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const CONNECT_TIMEOUT_MS = 45 * 1000;
// The secret carries 256 bits, so stretching it buys nothing; the backup
// format still wants a count.
const PAIRING_KEY_ITERATIONS = 1;
const SETTLE_BEFORE_CLOSE_MS = 2000;

export const DevicePairingStatus = Object.freeze({
    STARTING: 'starting',
    WAITING: 'waiting',
    CONNECTING: 'connecting',
    SENDING: 'sending',
    SENT: 'sent',
    RECEIVING: 'receiving',
    RECEIVED: 'received',
    ADDING: 'adding',
    ADDED: 'added',
    EXPIRED: 'expired',
    FAILED: 'failed'
});

// Why a pairing failed, for the UI to explain.
export const DevicePairingFailure = Object.freeze({
    // The rendezvous servers can't be reached (or none is configured).
    UNREACHABLE: 'unreachable',
    // The link isn't a pairing code.
    INVALID_CODE: 'invalidCode',
    // No device is showing this code any more (expired, used, or closed).
    NOT_FOUND: 'notFound',
    // The connection didn't open, or dropped part-way.
    CONNECTION: 'connection',
    // What arrived couldn't be opened with the code's secret.
    DAMAGED: 'damaged',
    // Adding it to this device failed.
    NOT_ADDED: 'notAdded'
});

export class DevicePairing {
    // peerConnectionProvider: the app's (STUN/TURN settings come with it);
    //   pairing never disposes it.
    // rendezvousTransports: the app's rendezvous server connections.
    constructor({ deviceBackup, peerConnectionProvider, rendezvousTransports, ttlMs = PAIRING_TTL_MS, connectTimeoutMs = CONNECT_TIMEOUT_MS, answerPollIntervalMs, answerWatchIntervalMs }) {
        if (!deviceBackup) throw new Error('DevicePairing: deviceBackup is required');
        if (!peerConnectionProvider) throw new Error('DevicePairing: peerConnectionProvider is required');
        this._deviceBackup = deviceBackup;
        this._peerConnectionProvider = peerConnectionProvider;
        this._rendezvousTransports = Array.from(rendezvousTransports || []);
        this._ttlMs = ttlMs;
        this._connectTimeoutMs = connectTimeoutMs;
        this._pollIntervals = {
            ...(answerPollIntervalMs !== undefined ? { answerPollIntervalMs } : {}),
            ...(answerWatchIntervalMs !== undefined ? { answerWatchIntervalMs } : {})
        };
    }

    get available() {
        return this._rendezvousTransports.length > 0;
    }

    // Shows this device's builds to one other device. Call start().
    createSender() {
        return new DevicePairingSender(this);
    }

    // Receives from the device showing `code`. Call start().
    createReceiver(code) {
        return new DevicePairingReceiver(this, code);
    }

    _openPeerSession(identityProvider) {
        const discoveryProviders = this._rendezvousTransports.map((transport) => new RendezvousDiscoveryProvider({ transport, identityProvider }));
        const discovery = new DiscoveryBootstrap({ bootstrapProviders: discoveryProviders });
        const manager = new PeerSessionManager({
            identityProvider,
            peerConnectionProvider: borrowedConnectionProvider(this._peerConnectionProvider),
            discoveryProvider: discovery,
            ...this._pollIntervals
        });
        const bus = new PeerMessageBus();
        return {
            manager,
            bus,
            close() {
                for (const peer of manager.listPeers()) peer.close();
                bus.dispose();
                manager.dispose();
                discovery.dispose();
                for (const provider of discoveryProviders) provider.dispose();
            }
        };
    }
}

// The app's connection provider, minus dispose(): PeerSessionManager#dispose
// disposes its provider, and this one is shared.
function borrowedConnectionProvider(provider) {
    return {
        createOffer: (options) => provider.createOffer(options),
        connect: (remoteAddress) => provider.connect(remoteAddress),
        onIncomingConnection: (callback) => provider.onIncomingConnection(callback),
        ...(typeof provider.prepareIceServers === 'function' ? { prepareIceServers: () => provider.prepareIceServers() } : {}),
        dispose() {}
    };
}

class PairingSide {
    constructor(pairing) {
        this._pairing = pairing;
        this._listeners = new Set();
        this._timers = new Set();
        this._session = null;
        this._closed = false;
        this.state = Object.freeze({ status: DevicePairingStatus.STARTING });
    }

    // callback(state) on every change. Returns an unsubscribe function.
    onChange(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    // Ends the pairing and closes its connection. Safe to call twice.
    close() {
        if (this._closed) return;
        this._closed = true;
        for (const timer of this._timers) clearTimeout(timer);
        this._timers.clear();
        if (this._session) this._session.close();
        this._session = null;
    }

    _set(state) {
        this.state = Object.freeze(state);
        for (const listener of Array.from(this._listeners)) listener(this.state);
    }

    _fail(failure) {
        if (this._closed) return;
        this._set({ status: DevicePairingStatus.FAILED, failure });
        this.close();
    }

    _later(ms, callback) {
        const timer = setTimeout(() => {
            this._timers.delete(timer);
            callback();
        }, ms);
        if (typeof timer.unref === 'function') timer.unref();
        this._timers.add(timer);
    }
}

export class DevicePairingSender extends PairingSide {
    async start() {
        if (!this._pairing.available) return this._fail(DevicePairingFailure.UNREACHABLE);
        const identity = new EphemeralIdentityProvider();
        const secret = randomDevicePairingSecret();
        this._passphrase = devicePairingPassphrase(secret);
        this._session = this._pairing._openPeerSession(identity);
        let published;
        try {
            published = await this._session.manager.publishSelf({ ttlMs: this._pairing._ttlMs });
        } catch {
            published = null;
        }
        if (this._closed) return;
        if (!(Array.isArray(published) ? published.length > 0 : published)) {
            return this._fail(DevicePairingFailure.UNREACHABLE);
        }
        const expiresAt = new Date(Date.now() + this._pairing._ttlMs);
        this._set({ status: DevicePairingStatus.WAITING, code: createDevicePairingCode({ identityId: identity.identityId, secret }), expiresAt });
        this._session.manager.onPeersChanged((peers) => {
            const peer = peers.find((candidate) => candidate.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
            if (peer && !this._peer) this._send(peer);
        });
        this._later(this._pairing._ttlMs, () => {
            if (this.state.status === DevicePairingStatus.WAITING) {
                this._set({ status: DevicePairingStatus.EXPIRED });
                this.close();
            }
        });
    }

    async _send(peer) {
        this._peer = peer;
        this._set({ status: DevicePairingStatus.SENDING });
        const { bus } = this._session;
        bus.attach(peer);
        bus.subscribe(DEVICE_PAIRING_PROTOCOL, (payload, { connectedPeer }) => {
            if (connectedPeer !== peer || !payload) return;
            if (payload.type === 'received' && this.state.status === DevicePairingStatus.SENDING) {
                this._set({ status: DevicePairingStatus.SENT, groups: this._groups });
                this._later(SETTLE_BEFORE_CLOSE_MS, () => this.close());
            } else if (payload.type === 'failed') {
                this._fail(DevicePairingFailure.DAMAGED);
            }
        });
        peer.onStateChange((state) => {
            if ((state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED) && this.state.status === DevicePairingStatus.SENDING) {
                this._fail(DevicePairingFailure.CONNECTION);
            }
        });
        let text;
        try {
            const { bytes, groups } = await this._pairing._deviceBackup.createBackupFile({ passphrase: this._passphrase, iterations: PAIRING_KEY_ITERATIONS });
            this._groups = groups;
            text = bytesToBase64(bytes);
        } catch {
            return this._fail(DevicePairingFailure.CONNECTION);
        }
        if (this._closed) return;
        const sent = await sendInParts(bus, peer, DEVICE_PAIRING_PROTOCOL, text, (part) => ({ type: 'part', ...part }));
        if (!sent) this._fail(DevicePairingFailure.CONNECTION);
    }
}

export class DevicePairingReceiver extends PairingSide {
    constructor(pairing, code) {
        super(pairing);
        this._code = parseDevicePairingCode(code);
        this._assembler = new PartAssembler({ maxConcurrentTransfers: 1 });
    }

    async start() {
        if (!this._code) return this._fail(DevicePairingFailure.INVALID_CODE);
        if (!this._pairing.available) return this._fail(DevicePairingFailure.UNREACHABLE);
        this._set({ status: DevicePairingStatus.CONNECTING });
        this._session = this._pairing._openPeerSession(new EphemeralIdentityProvider());
        const { manager, bus } = this._session;
        let records;
        try {
            records = await manager.discoverCandidates(this._code.identityId);
        } catch {
            records = [];
        }
        if (this._closed) return;
        if (!records || records.length === 0) return this._fail(DevicePairingFailure.NOT_FOUND);
        bus.subscribe(DEVICE_PAIRING_PROTOCOL, (payload, { connectedPeer }) => {
            if (connectedPeer === this._peer && payload && payload.type === 'part') this._acceptPart(payload);
        });
        let connected;
        try {
            connected = await manager.connectToDiscovered(records[0], { expectedIdentityId: this._code.identityId });
        } catch {
            connected = null;
        }
        if (this._closed) {
            if (connected) connected.connectedPeer.close();
            return;
        }
        if (!connected || !connected.delivered) return this._fail(DevicePairingFailure.CONNECTION);
        this._peer = connected.connectedPeer;
        bus.attach(this._peer);
        this._peer.onStateChange((state) => {
            if ((state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED)
                && (this.state.status === DevicePairingStatus.CONNECTING || this.state.status === DevicePairingStatus.RECEIVING)) {
                this._fail(DevicePairingFailure.CONNECTION);
            }
        });
        this._later(this._pairing._connectTimeoutMs, () => {
            if (this.state.status === DevicePairingStatus.CONNECTING) this._fail(DevicePairingFailure.CONNECTION);
        });
    }

    _acceptPart(part) {
        if (this.state.status !== DevicePairingStatus.CONNECTING && this.state.status !== DevicePairingStatus.RECEIVING) return;
        const result = this._assembler.accept(this._peer.connectionId, part);
        if (result.status === 'rejected') {
            this._reply('failed');
            return this._fail(DevicePairingFailure.DAMAGED);
        }
        if (result.status === 'progress') {
            this._set({ status: DevicePairingStatus.RECEIVING, receivedLength: result.receivedLength, totalLength: result.totalLength });
            return;
        }
        this._open(result.text);
    }

    async _open(text) {
        let received;
        try {
            received = await this._pairing._deviceBackup.readBackupFile(base64ToBytes(text), this._code.passphrase);
        } catch {
            this._reply('failed');
            return this._fail(DevicePairingFailure.DAMAGED);
        }
        if (this._closed) return;
        this._received = received;
        this._reply('received');
        this._set({ status: DevicePairingStatus.RECEIVED, createdAt: received.createdAt, groups: received.groups });
    }

    // Merges what arrived into this device. Resolves to the restore's
    // { written, kept, skipped }, or null when it failed.
    async add() {
        if (this.state.status !== DevicePairingStatus.RECEIVED) return null;
        const { createdAt, groups, entries } = this._received;
        this._set({ status: DevicePairingStatus.ADDING, createdAt, groups });
        try {
            const result = await this._pairing._deviceBackup.restore(entries, { mode: RestoreMode.MERGE, createdAt });
            this._received = null;
            this._set({ status: DevicePairingStatus.ADDED, createdAt, groups, result });
            this.close();
            return result;
        } catch {
            this._fail(DevicePairingFailure.NOT_ADDED);
            return null;
        }
    }

    _reply(type) {
        try {
            this._session.bus.send(this._peer, DEVICE_PAIRING_PROTOCOL, { type });
        } catch {
            // The sender learns nothing more; it times out or sees the
            // connection close.
        }
    }
}

function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
