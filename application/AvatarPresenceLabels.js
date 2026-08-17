import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { TrustStatus } from '../core/TrustObservation.js';

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
