import { TrustStatus } from '../core/TrustObservation.js';

// did:key identifies a public key. Trust policy decides whether that
// key is trusted. A perfectly valid Ed25519 signature can belong to an
// attacker — identity is not trust (0.2.19).
export const AuthorityMode = Object.freeze({
    // Only ONE known signing identity is trusted as the index
    // authority. The strong default for a decentralized index root:
    // an index is normally published by one authority, so pin it.
    PINNED: 'PINNED',
    // Any identity that a configured external trust source accepts.
    // Not implemented locally in 0.2.19 (no external trust source
    // exists yet) — DISCOVERED currently behaves like "any signer with
    // a structurally valid signature", exactly the 0.2.16 default, and
    // is the fallback when no authority is pinned.
    DISCOVERED: 'DISCOVERED',
    // Signatures may be inspected (and reported) but are never
    // authoritative — nothing this identity signs can become trusted
    // state.
    UNTRUSTED: 'UNTRUSTED'
});

// Centralizes the decisions that used to be implicit or hardcoded
// inside DecentralizedSpatialDiscoveryProvider: which authorities are
// trusted, whether unsigned legacy content is tolerated, and whether a
// detected equivocation is merely reported or rejected outright.
//
// TrustPolicy makes a DECISION given a core/TrustObservation.js — it
// never performs verification itself (that stays in
// identity/LocalAuthorizationVerifier.js and the discovery provider).
// Two different policies can look at the identical observation and
// decide differently; that is the point of separating them.
export class TrustPolicy {
    // Defaults reproduce EXACTLY the pre-0.2.19 behavior — unsigned
    // legacy roots and placements are tolerated, any validly-signed
    // authority is accepted unless one is pinned — so every existing
    // caller that does not explicitly opt into hardening keeps working
    // unchanged. Call TrustPolicy.hardened() for the fully strict
    // policy this milestone's design describes as the target
    // configuration (requireSignedRoot/requireAuthorizedPlacements
    // both true) once an operator is ready to stop accepting legacy
    // unsigned content.
    constructor({
        requireSignedRoot = false,
        requireAuthorizedPlacements = false,
        allowLegacyUnsigned = true,
        rejectEquivocatingAuthority = true,
        authorityMode = null,
        pinnedAuthorityIdentity = null
    } = {}) {
        this._requireSignedRoot = requireSignedRoot;
        this._requireAuthorizedPlacements = requireAuthorizedPlacements;
        this._allowLegacyUnsigned = allowLegacyUnsigned;
        this._rejectEquivocatingAuthority = rejectEquivocatingAuthority;
        this._pinnedAuthorityIdentity = pinnedAuthorityIdentity;
        // Auto-derive the mode from whether an authority was actually
        // pinned, unless the caller is explicit — this is what keeps
        // the un-pinned (options.indexAuthorityIdentity === null)
        // 0.2.16 default behavior — "accept any validly signed root" —
        // unchanged for every caller that does not opt into pinning.
        this._authorityMode = authorityMode || (pinnedAuthorityIdentity ? AuthorityMode.PINNED : AuthorityMode.DISCOVERED);
    }

    get requireSignedRoot() { return this._requireSignedRoot; }
    get requireAuthorizedPlacements() { return this._requireAuthorizedPlacements; }
    get allowLegacyUnsigned() { return this._allowLegacyUnsigned; }
    get rejectEquivocatingAuthority() { return this._rejectEquivocatingAuthority; }
    get authorityMode() { return this._authorityMode; }
    get pinnedAuthorityIdentity() { return this._pinnedAuthorityIdentity; }

    // Is this signer acceptable as an authority at all — independent of
    // any specific object it signed?
    acceptsAuthority(signerId) {
        if (this._authorityMode === AuthorityMode.UNTRUSTED) {
            return false;
        }
        if (this._authorityMode === AuthorityMode.PINNED) {
            return !!this._pinnedAuthorityIdentity && signerId === this._pinnedAuthorityIdentity.id;
        }
        return true; // DISCOVERED: no external trust source configured yet -- accept any signer
    }

    // Should a TrustObservation be treated as acceptable current state
    // under this policy? MISSING/UNAVAILABLE/INTEGRITY_FAILURE/
    // INVALID_SIGNATURE/UNAUTHORIZED/STALE/CONFLICTING are never
    // acceptable regardless of policy — those describe objects that
    // are broken, superseded, or unresolved, not a matter of taste.
    accepts(observation) {
        switch (observation.status) {
            case TrustStatus.VALID:
                return true;
            case TrustStatus.LEGACY_UNSIGNED:
                return this._allowLegacyUnsigned;
            case TrustStatus.EQUIVOCATING:
                return !this._rejectEquivocatingAuthority;
            default:
                return false;
        }
    }

    toJSON() {
        return {
            requireSignedRoot: this._requireSignedRoot,
            requireAuthorizedPlacements: this._requireAuthorizedPlacements,
            allowLegacyUnsigned: this._allowLegacyUnsigned,
            rejectEquivocatingAuthority: this._rejectEquivocatingAuthority,
            authorityMode: this._authorityMode,
            pinnedAuthorityId: this._pinnedAuthorityIdentity ? this._pinnedAuthorityIdentity.id : null
        };
    }

    static pinnedTo(identity) {
        return new TrustPolicy({ authorityMode: AuthorityMode.PINNED, pinnedAuthorityIdentity: identity });
    }

    // The illustrative strict policy from this milestone's design: no
    // legacy content, an authority must be pinned to be trusted at
    // all, equivocation is rejected outright.
    static hardened(pinnedAuthorityIdentity = null) {
        return new TrustPolicy({
            requireSignedRoot: true,
            requireAuthorizedPlacements: true,
            allowLegacyUnsigned: false,
            rejectEquivocatingAuthority: true,
            authorityMode: pinnedAuthorityIdentity ? AuthorityMode.PINNED : AuthorityMode.DISCOVERED,
            pinnedAuthorityIdentity
        });
    }
}
