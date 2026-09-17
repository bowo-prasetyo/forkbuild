import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';

// 0.2.39 — human-readable labels for PresenceLifecycleState/TrustStatus,
// shared by ui/components/AvatarInfoPanel.js's read view. One place,
// so a future diagnostics surface never drifts from the panel's own
// wording — same reasoning as application/LicenseLabels.js.
const LIFECYCLE_LABELS = Object.freeze({
    [PresenceLifecycleState.PRESENT]: 'Present',
    [PresenceLifecycleState.STALE]: 'Stale',
    [PresenceLifecycleState.ABSENT]: 'Absent'
});

export function describeLifecycleState(state) {
    return LIFECYCLE_LABELS[state] || 'Unknown';
}

// Deliberately not a 1:1 echo of the raw TrustStatus constant — see
// core/TrustObservation.js's own header for what each status actually
// means; these are the SAME concepts in the words a viewer (not a
// developer) reads.
const TRUST_LABELS = Object.freeze({
    [TrustStatus.VALID]: 'Trusted',
    [TrustStatus.LEGACY_UNSIGNED]: 'Unsigned',
    [TrustStatus.INVALID_SIGNATURE]: 'Invalid Signature',
    [TrustStatus.UNAUTHORIZED]: 'Unauthorized',
    [TrustStatus.STALE]: 'Superseded',
    [TrustStatus.CONFLICTING]: 'Conflicting',
    [TrustStatus.EQUIVOCATING]: 'Conflicting',
    [TrustStatus.MISSING]: 'Unsigned',
    [TrustStatus.UNAVAILABLE]: 'Unavailable',
    [TrustStatus.INTEGRITY_FAILURE]: 'Corrupted',
    [TrustStatus.REPLAYED]: 'Replayed'
});

export function describeTrustStatus(status) {
    return TRUST_LABELS[status] || 'Unknown';
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
const ANIMATION_LABELS = Object.freeze({
    [AvatarAnimationState.IDLE]: 'Idle',
    [AvatarAnimationState.WALKING]: 'Walking',
    [AvatarAnimationState.RUNNING]: 'Running',
    [AvatarAnimationState.JUMPING]: 'Jumping'
});

export function describeAnimationState(state) {
    return ANIMATION_LABELS[state] || 'Unknown';
}
