import { LocalPresenceStore } from './LocalPresenceStore.js';

// 0.2.37 — the "advertise / pull" round trip the design doc calls
// for, given a transport (application/AvatarPresenceBroadcastProvider.js's
// interface) and a LocalPresenceStore:
//
//   publish(advertisement) — ADVERTISE: hands the local avatar's
//       latest presence to the transport. Called by
//       WorldNavigationSession only when AvatarPresenceSession
//       actually accepted a new update — an idle local avatar
//       publishes nothing, exactly mirroring 0.2.36's "no movement,
//       no sequence advancement" rule one level further out: "no
//       sequence advancement, no network traffic."
//
//   pull(now) — PULL: drains whatever advertisements have arrived
//       since the last pull into an inbox-processing step, and
//       returns the store's current view. This is the ONE place
//       incoming network data crosses from "a raw broadcast event" to
//       "this replica's own accepted state" — the broadcast
//       provider's callback below only ever appends to `_inbox`; it
//       never calls `_store.ingest()` directly. That split matters
//       precisely because 0.2.38 will harden what happens at the pull
//       step (rate limits, trust checks) without needing to touch how
//       messages arrive at all.
//
// Deliberately stateless about WHO the local avatar is beyond
// `localAvatarId` — this class has no opinion about rendering,
// interpolation, or how many remote avatars exist; see
// application/RemoteAvatarRegistry.js for that.
export class PresenceSyncService {
    constructor(broadcastProvider = null, { localAvatarId = null, store = new LocalPresenceStore() } = {}) {
        this._broadcastProvider = broadcastProvider;
        this._localAvatarId = localAvatarId;
        this._store = store;
        this._inbox = [];
        this._unsubscribe = broadcastProvider
            ? broadcastProvider.onAdvertisement((advertisement) => { this._inbox.push(advertisement); })
            : null;
    }

    publish(advertisement) {
        if (this._broadcastProvider) {
            this._broadcastProvider.advertise(advertisement);
        }
    }

    pull(now = Date.now()) {
        const inbox = this._inbox;
        this._inbox = [];
        for (const advertisement of inbox) {
            // A channel never delivers its own message back (see
            // LocalAvatarPresenceBroadcastProvider's own header), but
            // this check stays as defense in depth — a future
            // transport implementation might not offer that guarantee
            // for free, and a replica's own avatar must never be
            // treated as a "remote" one regardless of transport.
            if (this._localAvatarId && advertisement && advertisement.avatarId === this._localAvatarId) {
                continue;
            }
            this._store.ingest(advertisement, now);
        }
        return this._store.list(now);
    }

    listKnownPresences(now = Date.now()) {
        return this._store.list(now);
    }

    dispose() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._store.clear();
        this._inbox = [];
    }
}
