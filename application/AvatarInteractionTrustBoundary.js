import { isValidAvatarInteractionAdvertisement, getAvatarInteractionSigningDescriptor } from '../core/AvatarInteractionAdvertisement.js';
import { resolveIncomingInteraction } from '../core/AvatarInteractionIngestion.js';
import { PresenceAuthorityRegistry } from '../core/PresenceAuthority.js';
import { AvatarInteractionReplayWindow } from '../core/AvatarInteractionReplayWindow.js';
import { AvatarInteractionTrustPolicy } from '../core/AvatarInteractionTrustPolicy.js';
import { TrustObservation, TrustStatus } from '../core/TrustObservation.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.45 — "I received this avatar-interaction claim; why should I
// believe it?" The interaction counterpart to
// application/PresenceTrustBoundary.js/AvatarProfileTrustBoundary.js,
// mirroring their structure — "reuse the trust vocabulary but not
// automatically duplicate the entire presence protocol," the same
// instruction 0.2.41 was given, applied one layer further:
//
//   1. Is this even shaped like an advertisement?           (core/AvatarInteractionAdvertisement.js)
//   2. If signed, does the signature actually verify?        (identity/LocalAuthorizationVerifier.js)
//      If unsigned, does policy tolerate that?                (core/AvatarInteractionTrustPolicy.js)
//   3. Is the claimant allowed to speak for this avatarId?    (core/PresenceAuthority.js — REUSED, own instance)
//   4. Have I already accepted this EXACT event, or one       (core/AvatarInteractionReplayWindow.js +
//      genuinely newer, from this avatarId?                    core/AvatarInteractionIngestion.js)
//
// A claim is only ever ACCEPTED (and only then remembered by the
// replay window) after every one of those hold.
//
// Two deliberate departures from presence/profile's own boundaries,
// both because an interaction is an EVENT, not continuously-updated
// STATE (see application/AvatarInteractionSyncService.js's own
// header):
//
//   - evaluate() takes ONE argument, not two. Presence/profile compare
//     an incoming claim against whatever is CURRENTLY STORED for that
//     avatarId (for equivocation detection and monotonic-sequence
//     resolution). An interaction event has no "currently stored"
//     slot to compare against — it is rendered once and then
//     genuinely forgotten — so there is nothing for a caller to pass.
//   - no EQUIVOCATION check. Equivocation detection needs a retained
//     "current claim at this sequence" to compare a competitor
//     against; 0.2.45 deliberately keeps none. The closest analogue —
//     the SAME bound authority's own key producing two DIFFERENT
//     interactionIds at the identical sequence number, racing to see
//     which one a given replica processes first — is a real, narrower
//     gap this milestone does not close; see docs/Roadmap.md, "0.2.46
//     — Interaction Trust, Replay & Abuse Controls." What IS enforced
//     here: `sequence` must strictly increase to be accepted at all
//     (core/AvatarInteractionIngestion.js), so a second claim reusing
//     an already-accepted sequence is at minimum rejected as STALE,
//     never silently rendered as if it were new.
//
// Uses its OWN PresenceAuthorityRegistry instance, never one shared
// with a PresenceTrustBoundary or AvatarProfileTrustBoundary — the
// same "keeping presence-authority, profile-authority, and
// interaction-authority independently established is MORE
// conservative than sharing one binding" reasoning
// application/AvatarProfileTrustBoundary.js's own header already gives.
export class AvatarInteractionTrustBoundary {
    // 0.2.60 — `isBlocked`: see application/PresenceTrustBoundary.js's
    // own constructor comment; identical contract, own instance, never
    // shared.
    constructor({
        policy = AvatarInteractionTrustPolicy.permissive(),
        authorizationVerifier = new LocalAuthorizationVerifier(),
        authorityRegistry = new PresenceAuthorityRegistry(),
        replayWindow = new AvatarInteractionReplayWindow(),
        isBlocked = () => false
    } = {}) {
        this._policy = policy;
        this._verifier = authorizationVerifier;
        this._authority = authorityRegistry;
        this._replayWindow = replayWindow;
        this._isBlocked = isBlocked;
    }

    get policy() { return this._policy; }

    evaluate(incomingAdvertisement) {
        if (!isValidAvatarInteractionAdvertisement(incomingAdvertisement)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.UNAVAILABLE, {
                    subjectType: 'avatar-interaction',
                    subjectId: incomingAdvertisement && typeof incomingAdvertisement === 'object' ? incomingAdvertisement.avatarId : null,
                    reason: 'malformed or structurally invalid advertisement'
                })
            };
        }
        const avatarId = incomingAdvertisement.avatarId;

        const verification = this._verifier.verifyAvatarInteractionAdvertisement(incomingAdvertisement);
        if (!verification.signed) {
            if (this._policy.requireSignedInteraction) {
                return {
                    accepted: false,
                    observation: TrustObservation.of(TrustStatus.MISSING, {
                        subjectType: 'avatar-interaction', subjectId: avatarId,
                        reason: 'unsigned interaction rejected — this replica requires signed interactions'
                    })
                };
            }
        } else if (!verification.valid) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.INVALID_SIGNATURE, {
                    subjectType: 'avatar-interaction', subjectId: avatarId, reason: verification.reason
                })
            };
        }
        const signerId = (verification.signed && verification.valid) ? incomingAdvertisement.signature.signer : null;

        // 0.2.60 — see application/PresenceTrustBoundary.js's own
        // evaluate() comment for the full reasoning; identical gate.
        if (signerId && this._isBlocked(signerId)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.BLOCKED, {
                    subjectType: 'avatar-interaction', subjectId: avatarId, reason: 'signer is locally blocked'
                })
            };
        }

        const authorityResult = this._authority.evaluate(avatarId, { ownerIdentity: incomingAdvertisement.ownerIdentity, signerId });
        if (!authorityResult.authorized) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.UNAUTHORIZED, {
                    subjectType: 'avatar-interaction', subjectId: avatarId, reason: authorityResult.reason
                })
            };
        }

        if (this._replayWindow.hasAccepted(avatarId, incomingAdvertisement.interactionId)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.REPLAYED, { subjectType: 'avatar-interaction', subjectId: avatarId })
            };
        }

        const decision = resolveIncomingInteraction(this._replayWindow.highestSequence(avatarId), incomingAdvertisement);
        if (!decision.accepted) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.STALE, {
                    subjectType: 'avatar-interaction', subjectId: avatarId, reason: decision.reason
                })
            };
        }

        this._replayWindow.recordAccepted(avatarId, incomingAdvertisement.interactionId, incomingAdvertisement.sequence);
        return {
            accepted: true,
            observation: TrustObservation.of(TrustStatus.VALID, { subjectType: 'avatar-interaction', subjectId: avatarId })
        };
    }
}
