import { isValidAvatarPresenceAdvertisement, getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';
import { resolveIncomingPresence } from '../core/PresenceIngestion.js';
import { detectPresenceEquivocation } from '../core/PresenceEquivocation.js';
import { PresenceAuthorityRegistry } from '../core/PresenceAuthority.js';
import { PresenceReplayWindow } from '../core/PresenceReplayWindow.js';
import { PresenceTrustPolicy } from '../core/PresenceTrustPolicy.js';
import { TrustObservation, TrustStatus } from '../core/TrustObservation.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.38 — "I received this avatar-presence claim; why should I
// believe it, and what should happen if competing or old claims
// arrive?" This is the SINGLE gate every incoming advertisement passes
// through before application/LocalPresenceStore.js's Map is ever
// touched — the design doc's own diagram:
//
//   PresenceSyncService.pull() -> [Trust/Replay Boundary] ->
//     LocalPresenceStore -> RemoteAvatarRegistry -> Renderer
//
// Composes five independent, individually-testable questions, checked
// in an order that matters — later checks assume earlier ones already
// held:
//
//   1. Is this even shaped like an advertisement?           (core/AvatarPresenceAdvertisement.js)
//   2. If signed, does the signature actually verify?        (identity/LocalAuthorizationVerifier.js)
//      If unsigned, does policy tolerate that?                (core/PresenceTrustPolicy.js)
//   3. Is the claimant allowed to speak for this avatarId?    (core/PresenceAuthority.js)
//   4. Have I already accepted this EXACT claim before?       (core/PresenceReplayWindow.js)
//   5. Does it conflict with what I currently have at the     (core/PresenceEquivocation.js)
//      same sequence?
//   6. Is it actually newer than what I currently have?       (core/PresenceIngestion.js)
//
// A claim is only ever ACCEPTED (and only then remembered by the
// replay window) after every one of those hold. Rejecting for any
// reason NEVER mutates application/LocalPresenceStore.js's stored
// record — see docs/Principles.md, "Do Not Let Arrival Order Choose A
// Winner": the CURRENTLY held state keeps being the currently held
// state; a competing or hostile claim is recorded as a TrustObservation
// for diagnostics (core/PresenceDiagnosticsSummary.js), never silently
// swapped in.
export class PresenceTrustBoundary {
    // 0.2.60 — `isBlocked`: a zero-arg-per-call predicate
    // `(identityId) => boolean`, consulted immediately after a claim's
    // signer is established (see evaluate() below) — mirrors
    // application/FriendRelationshipUseCase.js's own `isBlocked`
    // contract exactly: called fresh every time, never cached, never
    // backed by this class importing application/PeerBlockUseCase.js
    // itself. Defaults to `() => false` — a caller that never wires
    // blocking gets EXACTLY 0.2.38's own behavior.
    constructor({
        policy = PresenceTrustPolicy.permissive(),
        authorizationVerifier = new LocalAuthorizationVerifier(),
        authorityRegistry = new PresenceAuthorityRegistry(),
        replayWindow = new PresenceReplayWindow(),
        isBlocked = () => false
    } = {}) {
        this._policy = policy;
        this._verifier = authorizationVerifier;
        this._authority = authorityRegistry;
        this._replayWindow = replayWindow;
        this._isBlocked = isBlocked;
    }

    get policy() { return this._policy; }

    // currentAdvertisement: whatever application/LocalPresenceStore.js
    // currently has stored for this avatarId, or null. Never mutates
    // its caller's state — returns a decision, the caller (
    // LocalPresenceStore.ingest()) is the one that actually writes.
    evaluate(incomingAdvertisement, currentAdvertisement) {
        if (!isValidAvatarPresenceAdvertisement(incomingAdvertisement)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.UNAVAILABLE, {
                    subjectType: 'avatar-presence',
                    subjectId: incomingAdvertisement && typeof incomingAdvertisement === 'object' ? incomingAdvertisement.avatarId : null,
                    reason: 'malformed or structurally invalid advertisement'
                })
            };
        }
        const avatarId = incomingAdvertisement.avatarId;

        const verification = this._verifier.verifyPresenceAdvertisement(incomingAdvertisement);
        if (!verification.signed) {
            if (this._policy.requireSignedPresence) {
                return {
                    accepted: false,
                    observation: TrustObservation.of(TrustStatus.MISSING, {
                        subjectType: 'avatar-presence', subjectId: avatarId,
                        reason: 'unsigned presence rejected — this replica requires signed presence'
                    })
                };
            }
        } else if (!verification.valid) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.INVALID_SIGNATURE, {
                    subjectType: 'avatar-presence', subjectId: avatarId, reason: verification.reason
                })
            };
        }
        // A verified signer's did:key — null for a (policy-tolerated)
        // unsigned claim. Never the RAW advertisement.signature.signer
        // read directly — that would trust an unverified assertion.
        const signerId = (verification.signed && verification.valid) ? incomingAdvertisement.signature.signer : null;

        // 0.2.60 — a locally BLOCKED signer is rejected here, BEFORE
        // authority/replay/equivocation are even consulted: none of
        // those questions matter once this replica has already decided
        // it does not want to hear from this identity at all. An
        // unsigned (signerId === null) claim can never be attributed
        // with confidence, so it can never be blocked either way — the
        // same "anonymous claims are outside blocking's reach" gap
        // presence/PeerAvatarPresenceBroadcastProvider.js's own
        // sender-side gate accepts too.
        if (signerId && this._isBlocked(signerId)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.BLOCKED, {
                    subjectType: 'avatar-presence', subjectId: avatarId, reason: 'signer is locally blocked'
                })
            };
        }

        const authorityResult = this._authority.evaluate(avatarId, { ownerIdentity: incomingAdvertisement.ownerIdentity, signerId });
        if (!authorityResult.authorized) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.UNAUTHORIZED, {
                    subjectType: 'avatar-presence', subjectId: avatarId, reason: authorityResult.reason
                })
            };
        }

        const hash = computeContentHash(JSON.stringify(getAvatarPresenceSigningDescriptor(incomingAdvertisement).payload));
        if (this._replayWindow.hasAccepted(avatarId, hash)) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.REPLAYED, { subjectType: 'avatar-presence', subjectId: avatarId })
            };
        }

        const equivocation = detectPresenceEquivocation(currentAdvertisement, incomingAdvertisement);
        if (equivocation) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.EQUIVOCATING, {
                    subjectType: 'avatar-presence', subjectId: avatarId,
                    reason: `competing claims at sequence ${incomingAdvertisement.sequence}`
                })
            };
        }

        const decision = resolveIncomingPresence(currentAdvertisement, incomingAdvertisement);
        if (!decision.accepted) {
            return {
                accepted: false,
                observation: TrustObservation.of(TrustStatus.STALE, {
                    subjectType: 'avatar-presence', subjectId: avatarId, reason: decision.reason
                })
            };
        }

        this._replayWindow.recordAccepted(avatarId, hash);
        return {
            accepted: true,
            observation: TrustObservation.of(TrustStatus.VALID, { subjectType: 'avatar-presence', subjectId: avatarId })
        };
    }
}
