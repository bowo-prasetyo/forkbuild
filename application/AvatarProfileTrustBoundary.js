import { isValidAvatarProfileAdvertisement, getAvatarProfileSigningDescriptor } from '../core/AvatarProfileAdvertisement.js';
import { resolveIncomingProfile } from '../core/AvatarProfileIngestion.js';
import { detectAvatarProfileEquivocation } from '../core/AvatarProfileEquivocation.js';
import { PresenceAuthorityRegistry } from '../core/PresenceAuthority.js';
import { TrustObservation, TrustStatus } from '../core/TrustObservation.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { ReplayGuard } from '../replication/ReplayGuard.js';

// 0.2.41 — the profile counterpart to application/PresenceTrustBoundary.js,
// deliberately mirroring its five-question structure exactly (the
// design doc's own instruction: "reuse the trust vocabulary but not
// automatically duplicate the entire presence protocol"):
//
//   1. Is this even shaped like an advertisement?           (core/AvatarProfileAdvertisement.js)
//   2. If signed, does the signature actually verify?        (identity/LocalAuthorizationVerifier.js)
//      (unsigned is always tolerated — 0.2.41 has no policy
//      knob equivalent to core/PresenceTrustPolicy.js)
//   3. Is the claimant allowed to speak for this avatarId?    (core/PresenceAuthority.js — REUSED directly)
//   4. Have I already accepted this EXACT claim before?       (replication/ReplayGuard.js — REUSED directly)
//   5. Does it conflict with what's currently held at the      (core/AvatarProfileEquivocation.js)
//      same profileRevision?
//   6. Is it actually newer?                                  (core/AvatarProfileIngestion.js)
//
// TWO deliberate reuse decisions, both explained here rather than at
// the reused files themselves (neither file has anything
// presence-specific baked into its actual logic, despite living under
// a presence-flavored name/location):
//
//   - core/PresenceAuthority.js's PresenceAuthorityRegistry is reused
//     for the IDENTICAL underlying question ("who is authorized to
//     speak for this avatarId") — but with its OWN, SEPARATE instance
//     here, never the same one a PresenceTrustBoundary uses. Keeping
//     presence-authority and profile-authority independently
//     established is MORE conservative than sharing one binding: an
//     attacker who somehow won the race to send the first PRESENCE
//     claim for an avatarId does not thereby also hijack PROFILE
//     authority, or vice versa.
//   - replication/ReplayGuard.js (the UNBOUNDED, remember-forever
//     guard) is reused AS-IS, unlike presence's own bespoke
//     core/PresenceReplayWindow.js. That bounded structure exists
//     specifically because presence updates are HIGH-frequency (every
//     accepted WASD step); profile updates are the opposite — rare,
//     deliberate edits, exactly the workload ReplayGuard was built
//     for in the first place. Reusing it here is not a shortcut, it's
//     the class's actual intended use case.
//
// No PresenceTrustPolicy-equivalent exists for profiles in 0.2.41 —
// unsigned profile claims are always tolerated, the same permissive
// default presence itself ships with. A future milestone could add
// one the same additive way 0.2.38 added PresenceTrustPolicy, if ever
// needed.
export class AvatarProfileTrustBoundary {
    constructor({
        authorizationVerifier = new LocalAuthorizationVerifier(),
        authorityRegistry = new PresenceAuthorityRegistry(),
        replayGuard = new ReplayGuard()
    } = {}) {
        this._verifier = authorizationVerifier;
        this._authority = authorityRegistry;
        this._replayGuard = replayGuard;
    }

    // currentAdvertisement: whatever application/LocalAvatarProfileStore.js
    // currently has stored for this avatarId, or null.
    evaluate(incomingAdvertisement, currentAdvertisement) {
        if (!isValidAvatarProfileAdvertisement(incomingAdvertisement)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.UNAVAILABLE, {
                    subjectType: 'avatar-profile',
                    subjectId: incomingAdvertisement && typeof incomingAdvertisement === 'object' ? incomingAdvertisement.avatarId : null,
                    reason: 'malformed or structurally invalid advertisement'
                })
            };
        }
        const avatarId = incomingAdvertisement.avatarId;

        const verification = this._verifier.verifyAvatarProfileAdvertisement(incomingAdvertisement);
        if (verification.signed && !verification.valid) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.INVALID_SIGNATURE, {
                    subjectType: 'avatar-profile', subjectId: avatarId, reason: verification.reason
                })
            };
        }
        const signerId = (verification.signed && verification.valid) ? incomingAdvertisement.signature.signer : null;

        const authorityResult = this._authority.evaluate(avatarId, { ownerIdentity: incomingAdvertisement.ownerIdentity, signerId });
        if (!authorityResult.authorized) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.UNAUTHORIZED, {
                    subjectType: 'avatar-profile', subjectId: avatarId, reason: authorityResult.reason
                })
            };
        }

        const hash = computeContentHash(JSON.stringify(getAvatarProfileSigningDescriptor(incomingAdvertisement).payload));
        const scope = `avatar-profile:${avatarId}`;
        if (this._replayGuard.hasAccepted(hash, scope)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.REPLAYED, { subjectType: 'avatar-profile', subjectId: avatarId })
            };
        }

        const equivocation = detectAvatarProfileEquivocation(currentAdvertisement, incomingAdvertisement);
        if (equivocation) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.EQUIVOCATING, {
                    subjectType: 'avatar-profile', subjectId: avatarId,
                    reason: `competing claims at profileRevision ${incomingAdvertisement.profileRevision}`
                })
            };
        }

        const decision = resolveIncomingProfile(currentAdvertisement, incomingAdvertisement);
        if (!decision.accepted) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.STALE, {
                    subjectType: 'avatar-profile', subjectId: avatarId, reason: decision.reason
                })
            };
        }

        this._replayGuard.recordAccepted(hash, scope);
        return {
            accepted: true,
            observation: TrustObservation.of(TrustStatus.VALID, { subjectType: 'avatar-profile', subjectId: avatarId })
        };
    }
}
