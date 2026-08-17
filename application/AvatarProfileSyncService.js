import { LocalAvatarProfileStore } from './LocalAvatarProfileStore.js';

// 0.2.41 — the "advertise / pull" round trip application/
// PresenceSyncService.js already established, one layer up for
// profiles. Deliberately a SEPARATE, small class rather than reusing
// PresenceSyncService directly: the underlying advertise/pull/inbox
// pattern is identical, but `listKnownPresences()` is presence-flavored
// naming that would read oddly applied to profiles, and profile
// callers need one thing presence callers don't — a direct,
// O(1)-by-avatarId lookup (`getKnownProfile()`), used both per-frame
// and at the exact moment a brand-new remote avatar's visual is first
// created (see application/RemoteAvatarAppearanceRegistry.js).
//
// Runs over its OWN transport instance (a separate BroadcastChannel
// name from presence's — see application/CreateWorldViewUseCase.js),
// so a torrent of movement updates on the presence channel never
// competes with, or is confused for, the rare profile updates on this
// one.
export class AvatarProfileSyncService {
    constructor(broadcastProvider = null, { localAvatarId = null, store = new LocalAvatarProfileStore() } = {}) {
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

    // Drains whatever advertisements arrived since the last pull into
    // the store — the ONE place incoming profile data crosses from "a
    // raw broadcast event" to "this replica's own accepted state,"
    // exactly the same boundary PresenceSyncService.pull() already
    // draws for presence.
    pull() {
        const inbox = this._inbox;
        this._inbox = [];
        for (const advertisement of inbox) {
            if (this._localAvatarId && advertisement && advertisement.avatarId === this._localAvatarId) {
                continue;
            }
            this._store.ingest(advertisement);
        }
        return this._store.list();
    }

    listKnownProfiles() {
        return this._store.list();
    }

    getKnownProfile(avatarId) {
        return this._store.get(avatarId);
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
