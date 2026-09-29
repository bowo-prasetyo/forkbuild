// Vehicles other players ride, and telling them what the local avatar rides
// (core/AvatarVehicleAdvertisement.js, on `forkbuild:avatar-vehicle`).
//
// Where a vehicle is when nobody rides it stays each replica's own
// (application/world/VehicleRuntimeInstances.js): while another player rides
// one, this replica hides its own copy and draws theirs under them; once they
// get off, it reappears wherever this replica last had it.
import { AvatarVehicleSyncService } from '../avatar/AvatarVehicleSyncService.js';
import { AvatarVehicleTrustBoundary } from '../avatar/AvatarVehicleTrustBoundary.js';
import { toAvatarVehicleAdvertisement } from '../../core/AvatarVehicleAdvertisement.js';
import { signAvatarVehicleAdvertisement } from '../avatar/AvatarVehicleSigning.js';

// Sent again this often while nothing changes, so a player who arrives later
// learns it; the same beat as presence's heartbeat.
const VEHICLE_HEARTBEAT_MS = 2000;

export const remoteVehicleMethods = {
    // Called from _setupRemoteAvatars(), once presence exists.
    _setupRemoteVehicles(localAvatarId, isBlocked) {
        if (!this._avatarVehicleBroadcastProvider) {
            return;
        }
        this._avatarVehicleSyncService = new AvatarVehicleSyncService(this._avatarVehicleBroadcastProvider, {
            localAvatarId,
            trustBoundary: new AvatarVehicleTrustBoundary({ isBlocked })
        });
    },

    // Once a frame, before remote avatars are drawn: takes in what arrived,
    // forgets avatars no longer present, and tells the renderer who rides what.
    _syncRemoteVehicles() {
        if (!this._avatarVehicleSyncService || !this._remoteAvatarRegistry) {
            return;
        }
        this._avatarVehicleSyncService.pull();
        const known = this._remoteAvatarRegistry.knownAvatarIds();
        this._avatarVehicleSyncService.retainOnly(known);
        if (typeof this._session.setRemoteAvatarVehicle === 'function') {
            for (const avatarId of known) {
                const riding = this._avatarVehicleSyncService.ridingOf(avatarId);
                this._session.setRemoteAvatarVehicle(avatarId, riding ? riding.vehicleType : null);
            }
        }
    },

    // { vehicleId, vehicleType } another avatar rides, or null.
    remoteAvatarVehicle(avatarId) {
        return this._avatarVehicleSyncService ? this._avatarVehicleSyncService.ridingOf(avatarId) : null;
    },

    // Vehicle ids other present players are riding now; never the one the
    // local avatar is on, which stays drawn here whoever else claims it.
    _remotelyRiddenVehicleIds() {
        const ids = new Set();
        if (!this._avatarVehicleSyncService || !this._remoteAvatarRegistry) {
            return ids;
        }
        for (const avatarId of this._remoteAvatarRegistry.knownAvatarIds()) {
            const riding = this._avatarVehicleSyncService.ridingOf(avatarId);
            if (riding) ids.add(riding.vehicleId);
        }
        const mount = this.avatarVehicleMount();
        if (mount) ids.delete(mount.vehicleId);
        return ids;
    },

    // What the local avatar rides, told to others when it changes and again
    // every VEHICLE_HEARTBEAT_MS. Called every frame of the local avatar.
    _publishLocalVehicle(now = Date.now()) {
        if (!this._avatarVehicleSyncService || !this._avatarPresenceSession) {
            return;
        }
        const mount = this.avatarVehicleMount();
        const instance = mount && this._vehicleRuntimeInstances ? this._vehicleRuntimeInstances.get(mount.vehicleId) : null;
        const riding = instance && this._isRidingMovableVehicle() ? { vehicleId: instance.id, vehicleType: instance.type } : null;
        const key = riding ? `${riding.vehicleType}:${riding.vehicleId}` : 'none';
        if (key === this._advertisedRidingKey && now - this._lastVehicleAdvertisedAt < VEHICLE_HEARTBEAT_MS) {
            return;
        }
        // Time-based, so a reloaded page's claims are still newer than its last ones.
        this._vehicleAdvertisementSequence = Math.max(this._vehicleAdvertisementSequence + 1, now);
        const current = this._avatarPresenceSession.current;
        const advertisement = toAvatarVehicleAdvertisement({
            avatarId: current.avatarId,
            ownerIdentity: current.ownerIdentity,
            vehicleId: riding ? riding.vehicleId : null,
            vehicleType: riding ? riding.vehicleType : null,
            sequence: this._vehicleAdvertisementSequence
        });
        this._avatarVehicleSyncService.publish(signAvatarVehicleAdvertisement(advertisement, this._identityProvider));
        this._advertisedRidingKey = key;
        this._lastVehicleAdvertisedAt = now;
    }
};
