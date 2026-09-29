import { PresenceLifecycleState } from '../../core/PresenceLifecycleState.js';
import { TrustStatus } from '../../core/TrustObservation.js';
import { AvatarAnimationState } from '../../core/AvatarAnimationState.js';
import { message } from '../../core/Message.js';

// 0.2.39 — human-readable labels for PresenceLifecycleState/TrustStatus,
// shared by ui/components/AvatarInfoPanel.js's read view. One place,
// so a future diagnostics surface never drifts from the panel's own
// wording — same reasoning as application/document/LicenseLabels.js. Every
// label is a message (core/Message.js); anything unrecognized is "Unknown".
const UNKNOWN = 'presence.unknown';

function describe(keys, value) {
    return message(keys[value] || UNKNOWN);
}

const LIFECYCLE_KEYS = Object.freeze({
    [PresenceLifecycleState.PRESENT]: 'presence.lifecycle.present',
    [PresenceLifecycleState.STALE]: 'presence.lifecycle.stale',
    [PresenceLifecycleState.ABSENT]: 'presence.lifecycle.absent'
});

export function describeLifecycleState(state) {
    return describe(LIFECYCLE_KEYS, state);
}

// Deliberately not a 1:1 echo of the raw TrustStatus constant — see
// core/TrustObservation.js's own header for what each status actually
// means; these are the SAME concepts in the words a viewer (not a
// developer) reads.
const TRUST_KEYS = Object.freeze({
    [TrustStatus.VALID]: 'presence.trust.trusted',
    [TrustStatus.LEGACY_UNSIGNED]: 'presence.trust.unsigned',
    [TrustStatus.INVALID_SIGNATURE]: 'presence.trust.invalidSignature',
    [TrustStatus.UNAUTHORIZED]: 'presence.trust.unauthorized',
    [TrustStatus.STALE]: 'presence.trust.superseded',
    [TrustStatus.CONFLICTING]: 'presence.trust.conflicting',
    [TrustStatus.EQUIVOCATING]: 'presence.trust.conflicting',
    [TrustStatus.MISSING]: 'presence.trust.unsigned',
    [TrustStatus.UNAVAILABLE]: 'presence.trust.unavailable',
    [TrustStatus.INTEGRITY_FAILURE]: 'presence.trust.corrupted',
    [TrustStatus.REPLAYED]: 'presence.trust.replayed'
});

export function describeTrustStatus(status) {
    return describe(TRUST_KEYS, status);
}

// 0.9.583 — the same "raw enum never reaches a viewer" discipline
// LIFECYCLE_LABELS/TRUST_LABELS already enforce, extended to the one
// status word this file had never covered: core/AvatarAnimationState.js's
// own values ('walking', 'idle', ...) are an internal, lowercase,
// typo-proof vocabulary (see that file's own header), never player-facing
// copy — ui/components/AvatarInfoPanel.js's and
// ui/components/NearbyAvatarsPanel.js's own design-doc mockups (see each
// file's own header comment) both show "Walking"/"Idle" capitalized;
// before this, both panels interpolated `info.animation`/`entry.animation`
// directly, so a real avatar's presence rendered the internal enum word
// verbatim (lowercase) instead of that mockup's own copy.
const ANIMATION_KEYS = Object.freeze({
    [AvatarAnimationState.IDLE]: 'presence.animation.idle',
    [AvatarAnimationState.WALKING]: 'presence.animation.walking',
    [AvatarAnimationState.RUNNING]: 'presence.animation.running',
    [AvatarAnimationState.JUMPING]: 'presence.animation.jumping'
});

export function describeAnimationState(state) {
    return describe(ANIMATION_KEYS, state);
}
