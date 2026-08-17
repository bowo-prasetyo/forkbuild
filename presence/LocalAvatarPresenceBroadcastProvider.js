import { AvatarPresenceBroadcastProvider } from './AvatarPresenceBroadcastProvider.js';

// 0.2.37's concrete presence transport: the browser's own
// BroadcastChannel API, scoped to one same-origin channel name. This
// is the "Local" half of the same pattern LocalDiscoveryProvider/
// LocalPublisherProvider/LocalSpatialIndexProvider already established
// — a real, working implementation of a decentralized-shaped
// interface, standing in for a future actual network transport
// (WebRTC, a relay server, ...) without anything ABOVE this interface
// needing to know the difference.
//
// Unlike those other Local*Providers, this one is not built on
// localStorage — presence is explicitly never persisted (see
// core/AvatarPresence.js), and BroadcastChannel is a purpose-built,
// non-persistent, same-origin pub/sub primitive: every other
// same-origin browsing context (another tab, another window) that
// opens a channel with the SAME name hears every message, and a
// channel never hears its own. Two browser tabs on the same origin
// genuinely see each other's avatars move — this is a real,
// demonstrable simulation of decentralized presence, not a mock.
//
// Delivery is fire-and-forget and inherently unordered/lossy across
// tabs exactly the way a real network would be — 0.2.37's whole
// design (core/PresenceIngestion.js's monotonic-sequence acceptance)
// is built to tolerate that, not to assume it away.
const DEFAULT_CHANNEL_NAME = 'forkbuild:avatar-presence';

export class LocalAvatarPresenceBroadcastProvider extends AvatarPresenceBroadcastProvider {
    constructor(channelName = DEFAULT_CHANNEL_NAME) {
        super();
        this._listeners = new Set();
        this._channel = null;
        // Defensive, not load-bearing: every environment this app
        // actually ships to (a real browser) has BroadcastChannel.
        // Degrading to a silent no-op rather than throwing means a
        // presence-sync failure can never take down the rest of World
        // View — the same failure-isolation posture applied
        // everywhere else an optional collaborator might be absent.
        if (typeof BroadcastChannel === 'function') {
            this._channel = new BroadcastChannel(channelName);
            this._channel.onmessage = (event) => {
                for (const listener of this._listeners) {
                    listener(event.data);
                }
            };
        }
    }

    advertise(advertisement) {
        if (!this._channel) {
            return;
        }
        this._channel.postMessage(advertisement);
    }

    onAdvertisement(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    dispose() {
        if (this._channel) {
            this._channel.close();
            this._channel = null;
        }
        this._listeners.clear();
    }
}
