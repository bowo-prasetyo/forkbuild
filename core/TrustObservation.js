// The shared vocabulary for "what happened when we checked whether an
// object could be trusted?" (0.2.19).
//
// Before this, discovery and verification code scattered ad hoc
// strings — "bad signature", "invalid", "stale", "missing" — through
// rejection branches. That works for one caller but does not compose:
// a UI cannot group failures, a test cannot assert on a stable set of
// outcomes, and two code paths describing the same situation drift
// apart over time. TrustObservation is that stable vocabulary.
//
// A TrustObservation is purely DESCRIPTIVE. It records what was
// observed, not what should happen next — that is TrustPolicy's job
// (identity/TrustPolicy.js). Two different policies can look at the
// same TrustObservation and make different decisions (e.g. one
// tolerates LEGACY_UNSIGNED, another rejects it).
export const TrustStatus = Object.freeze({
    VALID: 'VALID',                       // integrity + signature + authorization all hold
    LEGACY_UNSIGNED: 'LEGACY_UNSIGNED',   // pre-signing-era object, no signature to check
    INVALID_SIGNATURE: 'INVALID_SIGNATURE',
    UNAUTHORIZED: 'UNAUTHORIZED',         // signature valid, signer not allowed
    STALE: 'STALE',                       // valid, but a fresher observation supersedes it
    CONFLICTING: 'CONFLICTING',           // part of an unresolved ConflictSet
    EQUIVOCATING: 'EQUIVOCATING',         // same authority, same causal position, different content
    MISSING: 'MISSING',                   // referenced but not found in the store queried
    UNAVAILABLE: 'UNAVAILABLE',           // found but unreadable/malformed
    INTEGRITY_FAILURE: 'INTEGRITY_FAILURE', // content hash does not match the object's own claim
    // 0.2.38 — a claim structurally identical to one THIS replica has
    // already accepted. Deliberately distinct from STALE: STALE means
    // "superseded by something fresher I now hold"; REPLAYED means
    // "I recognize this exact claim, including a claim older than
    // what I currently hold, because I remember accepting it before"
    // — see core/PresenceReplayWindow.js. A replay is not necessarily
    // hostile (a lossy/duplicating transport redelivers plenty of
    // these honestly) — it is simply never new information.
    REPLAYED: 'REPLAYED',
    // 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal.
    // The signature verified and the signer is genuinely authorized to
    // speak for this avatarId — this is rejected purely because the
    // RECEIVING replica has locally blocked that signer. Deliberately
    // distinct from UNAUTHORIZED: unauthorized means "this signer never
    // had the right to make this claim, for anyone"; BLOCKED means "this
    // signer's claims would otherwise be perfectly legitimate — THIS
    // replica, specifically, has chosen to refuse them anyway." See
    // core/PeerBlockRecord.js's own header.
    BLOCKED: 'BLOCKED'
});

// A status counts as "acceptable by default" only for the two statuses
// that represent a genuinely trustworthy object under the historical
// 0.2.16 policy (valid signature, or tolerated pre-signing legacy).
// TrustPolicy.accepts() is the real decision function — this is only a
// context-free fallback for callers that have no policy at hand.
const DEFAULT_ACCEPTABLE = new Set([TrustStatus.VALID, TrustStatus.LEGACY_UNSIGNED]);

export class TrustObservation {
    constructor({ status, subjectType = null, subjectId = null, reason = null, freshness = null } = {}) {
        if (!Object.values(TrustStatus).includes(status)) {
            throw new Error(`TrustObservation: unknown status "${status}"`);
        }
        this._status = status;
        this._subjectType = subjectType;   // 'placement-record' | 'spatial-index-root' | 'spatial-index-manifest' | 'delegation' | ...
        this._subjectId = subjectId;       // placementId, cell key, root hash, delegation id, ...
        this._reason = reason;             // human-readable detail, e.g. "signer identity mismatch"
        this._freshness = freshness;       // FreshnessProof | null
    }

    get status() { return this._status; }
    get subjectType() { return this._subjectType; }
    get subjectId() { return this._subjectId; }
    get reason() { return this._reason; }
    get freshness() { return this._freshness; }

    // Context-free default; prefer TrustPolicy.accepts(this) whenever a
    // policy is available.
    get defaultAcceptable() { return DEFAULT_ACCEPTABLE.has(this._status); }

    toJSON() {
        return {
            status: this._status,
            subjectType: this._subjectType,
            subjectId: this._subjectId,
            reason: this._reason,
            freshness: this._freshness && typeof this._freshness.toJSON === 'function'
                ? this._freshness.toJSON()
                : null
        };
    }

    static of(status, { subjectType = null, subjectId = null, reason = null, freshness = null } = {}) {
        return new TrustObservation({ status, subjectType, subjectId, reason, freshness });
    }
}
