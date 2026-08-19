// 0.2.68 — Identity Lifecycle Propagation.
//
// "What has THIS device learned, from a signed message another
// identity sent it, about SOME OTHER identity's lifecycle?" —
// deliberately a THIRD concept, kept apart from both:
//
//   core/IdentityLifecycleState.js   "Has the OWNER of THIS device's
//                                     OWN identity revoked it?" — local,
//                                     first-person, enforced at
//                                     identity/LocalIdentityProvider.js's
//                                     signing gate (0.2.67).
//   RemoteIdentityLifecycle (THIS)   "What does this device merely
//                                     KNOW, second-hand, and verified,
//                                     about ANOTHER identity?" — never
//                                     enforced anywhere, never a
//                                     signing gate, carries no
//                                     authority over this device's own
//                                     keys or sessions at all.
//
// And, just as deliberately, kept apart from core/PeerRelationship.js
// and core/FriendshipRecord.js: propagation tells this device what an
// identity cryptographically DECLARED about itself; it is never
// wired to mutate, delete, or reinterpret an existing relationship or
// friendship record — see docs/Principles.md, "Identity Lifecycle
// State Does Not Implicitly Rewrite Unrelated Durable Social State"
// (0.2.68). A UI cross-references a RemoteIdentityLifecycle entry
// alongside a PeerRelationship/FriendshipRecord to DISPLAY something
// ("this known peer's identity was revoked"), exactly the way
// ui/views/PeerConnectionsView.js already cross-references "Known
// Peers" against "My Peers" for live connection status — never by
// this class reaching into either store itself.
//
// `identityId` is the identity this record is ABOUT (the revoked/
// predecessor identity) — never the identity of whoever happened to
// relay the message; see application/
// IdentityLifecyclePropagationUseCase.js's own header for why the
// RELAYING connection's identity is irrelevant to whether a record is
// trusted. `revocation`/`succession` are each either null or the
// EXACT signed record (core/IdentityRevocationEnvelope.js /
// core/IdentitySuccessionEnvelope.js's own JSON shape, including its
// `signature`) this device received and independently verified — this
// class is its own evidence, never a re-derived summary of one,
// mirroring core/FriendshipRecord.js's own discipline exactly.
//
// Immutable, like every other durable record in this codebase —
// withRevocation()/withSuccession() return a NEW instance.
export class RemoteIdentityLifecycle {
    constructor({ identityId, revocation = null, succession = null, updatedAt = new Date() } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('RemoteIdentityLifecycle: identityId is required');
        }
        this._identityId = identityId;
        this._revocation = revocation || null;
        this._succession = succession || null;
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get identityId() { return this._identityId; }
    get revocation() { return this._revocation; }
    get succession() { return this._succession; }
    get updatedAt() { return this._updatedAt; }

    get isRevoked() { return this._revocation !== null; }

    // The successor this device currently believes this identity
    // named, if any — preferring a dedicated succession record when
    // present, falling back to the revocation's own OPTIONAL
    // `successorIdentityId` (see core/IdentityRevocationEnvelope.js's
    // own header on why a revocation can bundle one). The two can never
    // meaningfully disagree in practice — both are only ever produced,
    // for the same predecessor, by the same single-successor-per-
    // predecessor local invariant identity/LocalIdentityProvider.js
    // already enforces (one storage slot, overwritten, never two) —
    // but a dedicated succession record is preferred when both exist
    // since it may be strictly newer.
    get successorIdentityId() {
        if (this._succession) {
            return this._succession.successorIdentityId;
        }
        return this._revocation ? this._revocation.successorIdentityId : null;
    }

    // Revocation is boolean and permanent (see core/
    // IdentityLifecycleState.js's own header) — once this device has a
    // verified revocation on file for identityId, a second one changes
    // nothing and is simply ignored by application/
    // IdentityLifecyclePropagationUseCase.js before this method is ever
    // called. Storing `record` here is a one-way transition.
    withRevocation(record, updatedAt = new Date()) {
        return new RemoteIdentityLifecycle({ identityId: this._identityId, revocation: record, succession: this._succession, updatedAt });
    }

    // Succession is STATE, not an event log (see docs/Principles.md,
    // "State Synchronization And Event Synchronization Are Different
    // Protocols," 0.2.45) — a single current fact per predecessor,
    // replaced wholesale by a newer, validly-signed declaration from
    // the SAME predecessor, never appended to. The caller (application/
    // IdentityLifecyclePropagationUseCase.js) is responsible for only
    // calling this with a record whose `declaredAt` is strictly newer
    // than whatever is already stored — see that file's own header.
    withSuccession(record, updatedAt = new Date()) {
        return new RemoteIdentityLifecycle({ identityId: this._identityId, revocation: this._revocation, succession: record, updatedAt });
    }

    toJSON() {
        return {
            identityId: this._identityId,
            revocation: this._revocation,
            succession: this._succession,
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new RemoteIdentityLifecycle(json);
    }
}
