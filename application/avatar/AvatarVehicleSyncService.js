// Sends what the local avatar rides and keeps what other avatars ride, over
// its own broadcast channel (`forkbuild:avatar-vehicle`), the way
// AvatarProfileSyncService does for appearance. Incoming claims wait in an
// inbox until pull(), and cross the AvatarVehicleTrustBoundary there.
import { AvatarVehicleTrustBoundary } from './AvatarVehicleTrustBoundary.js';

export class AvatarVehicleSyncService {
    constructor(broadcastProvider = null, { localAvatarId = null, trustBoundary = new AvatarVehicleTrustBoundary() } = {}) {
        this._broadcastProvider = broadcastProvider;
        this._localAvatarId = localAvatarId;
        this._trustBoundary = trustBoundary;
        this._records = new Map(); // avatarId -> accepted advertisement
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

    // Takes in what arrived since the last pull. Returns nothing: read with
    // ridingOf().
    pull() {
        const inbox = this._inbox;
        this._inbox = [];
        for (const advertisement of inbox) {
            const avatarId = advertisement && typeof advertisement === 'object' ? advertisement.avatarId : null;
            if (this._localAvatarId && avatarId === this._localAvatarId) {
                continue;
            }
            const current = typeof avatarId === 'string' ? this._records.get(avatarId) || null : null;
            if (this._trustBoundary.evaluate(advertisement, current).accepted) {
                this._records.set(avatarId, advertisement);
            }
        }
    }

    // { vehicleId, vehicleType } an avatar is riding, or null.
    ridingOf(avatarId) {
        const record = this._records.get(avatarId);
        return record && record.riding ? { vehicleId: record.vehicleId, vehicleType: record.vehicleType } : null;
    }

    // Forgets avatars no longer present, so a rider who left isn't drawn on
    // their vehicle when they come back on foot.
    retainOnly(avatarIds) {
        const keep = new Set(avatarIds);
        for (const avatarId of [...this._records.keys()]) {
            if (!keep.has(avatarId)) {
                this._records.delete(avatarId);
            }
        }
    }

    dispose() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._records.clear();
        this._inbox = [];
    }
}
