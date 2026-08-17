import { EventBus } from '../core/events/EventBus.js';
import { AvatarPresence } from '../core/AvatarPresence.js';

const PRESENCE_EVENT = 'LocalPresenceChanged';

// 0.2.33 — the live half of the Identity/AvatarProfile/Presence split
// (see core/AvatarProfile.js and core/AvatarPresence.js). Tracks ONE
// user's own live presence for the duration of a World View session.
//
// Deliberately constructed with NO StorageProvider at all — not "a
// StorageProvider that happens not to be called," but no such
// dependency exists to call. Persisting presence is not a bug this
// class avoids; it's a capability this class structurally does not
// have. Compare AvatarProfileUseCase, which takes a StorageProvider
// because persistence is exactly its job.
//
// Scoped to the LOCAL avatar only. Tracking other participants'
// presences (a registry keyed by avatarId, ingesting remote updates,
// deciding what to do with a stale/out-of-order one) is 0.2.37's
// "Decentralized Presence Synchronization" — this class doesn't
// pretend to solve a networking problem it hasn't been asked to solve
// yet, the same restraint 0.2.33's own design doc asked for by
// splitting that work into a later milestone.
export class AvatarPresenceSession {
    constructor(avatarProfile, { position, rotation, animation } = {}) {
        this._eventBus = new EventBus();
        this._presence = new AvatarPresence({
            avatarId: avatarProfile.avatarId,
            ownerIdentity: avatarProfile.ownerIdentity,
            position,
            rotation,
            animation
        });
    }

    get current() {
        return this._presence;
    }

    // Applies a partial update (any of position/rotation/animation),
    // advancing `sequence` by exactly one regardless of how many
    // fields changed — see core/AvatarPresence.js's `next()` for why.
    update({ position, rotation, animation } = {}) {
        this._presence = this._presence.next({ position, rotation, animation });
        this._eventBus.publish(PRESENCE_EVENT, { presence: this._presence });
        return this._presence;
    }

    // Returns an unsubscribe function, same shape as
    // IdentityUseCase.onUserChanged / AvatarProfileUseCase.onProfileChanged.
    onPresenceChanged(callback) {
        const subscription = this._eventBus.subscribe(
            PRESENCE_EVENT,
            ({ presence }) => callback(presence)
        );
        return () => subscription.unsubscribe();
    }
}
