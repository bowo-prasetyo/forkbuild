import { Position } from './Position.js';
import { AvatarAnimationState, isValidAnimationState } from './AvatarAnimationState.js';

// 0.2.33 — the live, ephemeral half of the split this milestone
// establishes (see core/AvatarProfile.js for the full picture).
//
// AvatarPresence answers "where is this user RIGHT NOW" — nothing
// else. It is deliberately the opposite of everything this codebase
// has built persistence around so far:
//
//   - never passed to a StorageProvider.save() call anywhere;
//   - never signed (there is no getSigningDescriptor() here, and
//     there must never be one — see below);
//   - never a WorldPlacement (a WorldPlacement answers "where does
//     this immutable PUBLICATION live in shared space," a question
//     with exactly one durable answer until someone deliberately
//     moves it; a Presence answers "where is this live PARTICIPANT,"
//     a question with a new answer many times a second);
//   - never part of a Document, and never affects one — a hundred
//     avatars walking across a published castle leave that castle's
//     immutable snapshot exactly as it was.
//
// Why AvatarPresence ITSELF never carries a signature: signing exists
// in this codebase to let a replica answer "did this authority really
// authorize this durable fact?" — meaningful for a Publication or a
// PlacementRecord because both are meant to be believed and relied on
// indefinitely. AvatarPresence is not that kind of fact, and adding a
// signature field HERE would suggest it was — see
// core/AvatarPresenceAdvertisement.js's own header for where a
// signature actually lives instead.
//
// 0.2.38 update: "is this movement claim even plausible, and is it
// being replayed or spoofed?" turned out to need MORE than `sequence`
// alone — replay protection, an identity binding so an avatarId can't
// simply be claimed by whoever speaks loudest
// (core/PresenceAuthority.js), and equivocation detection
// (core/PresenceEquivocation.js) all build on `sequence` but aren't
// answered by it alone. And "per-session channel trust" turned out to
// undersell what was actually needed: 0.2.38 DOES use real Ed25519
// signatures — over a canonical envelope, exactly like every other
// signed object in this codebase — but the signature lives on
// core/AvatarPresenceAdvertisement.js's wire shape, produced fresh
// from an AvatarPresence every time (application/PresenceSigning.js),
// never on AvatarPresence itself. AvatarPresence stays exactly what
// it always was: the ephemeral, unsigned, unpersisted LOCAL fact of
// where this avatar is right now. What changed is that a RECEIVER can
// now optionally demand cryptographic proof of who is asserting that
// fact before believing it — a property of the transport/trust layer,
// never of this class.
//
// `sequence` is a plain, per-avatar-session monotonic counter — NOT a
// CausalStamp (core/CausalStamp.js). A CausalStamp exists to let
// independently-authorized REPLICAS of a durable, multi-writer record
// converge after being offline. A presence stream has exactly one
// writer (the avatar's own client) and no offline-merge story — it is
// either the latest update from that avatar or it is stale and
// discarded. A flat, always-increasing integer is the simplest thing
// that lets a future receiver detect "this update is older than one I
// already have" (replay/reordering), which is all 0.2.38 needs.
export class AvatarPresence {
    constructor({
        avatarId,
        ownerIdentity,
        position = new Position(),
        rotation = { x: 0, y: 0, z: 0 },
        animation = AvatarAnimationState.IDLE,
        sequence = 0,
        timestamp = new Date()
    } = {}) {
        if (!avatarId) {
            throw new Error('AvatarPresence requires an avatarId');
        }
        if (!isValidAnimationState(animation)) {
            throw new Error(`AvatarPresence: unknown animation state "${animation}"`);
        }
        this._avatarId = avatarId;
        this._ownerIdentity = ownerIdentity || null;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._rotation = { x: 0, y: 0, z: 0, ...rotation };
        this._animation = animation;
        this._sequence = sequence;
        this._timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    }

    get avatarId() { return this._avatarId; }
    get ownerIdentity() { return this._ownerIdentity; }
    get position() { return this._position; }
    get rotation() { return { ...this._rotation }; }
    get animation() { return this._animation; }
    get sequence() { return this._sequence; }
    get timestamp() { return this._timestamp; }

    // The one way an AvatarPresence changes: a brand new snapshot,
    // never a mutation of this one — the previous snapshot stays valid
    // to whoever already read it (e.g. a renderer mid-interpolation).
    // `sequence` always advances by exactly 1 regardless of what
    // changed, so a gap in received sequence numbers is always exactly
    // "N updates were missed," never ambiguous.
    next({ position, rotation, animation } = {}) {
        return new AvatarPresence({
            avatarId: this._avatarId,
            ownerIdentity: this._ownerIdentity,
            position: position !== undefined ? position : this._position,
            rotation: rotation !== undefined ? rotation : this._rotation,
            animation: animation !== undefined ? animation : this._animation,
            sequence: this._sequence + 1,
            timestamp: new Date()
        });
    }

    // Only for the eventual network message shape (0.2.37) — NOT for
    // any StorageProvider. Nothing in application/ or storage/ may
    // call this and then persist the result durably.
    toJSON() {
        return {
            avatarId: this._avatarId,
            ownerIdentity: this._ownerIdentity,
            position: this._position.toJSON(),
            rotation: { ...this._rotation },
            animation: this._animation,
            sequence: this._sequence,
            timestamp: this._timestamp.toISOString()
        };
    }

    static fromJSON(json) {
        return new AvatarPresence({
            avatarId: json.avatarId,
            ownerIdentity: json.ownerIdentity,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            animation: json.animation,
            sequence: json.sequence,
            timestamp: json.timestamp
        });
    }
}
