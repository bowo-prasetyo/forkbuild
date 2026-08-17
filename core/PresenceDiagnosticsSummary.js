import { PresenceLifecycleState } from './PresenceLifecycleState.js';
import { TrustStatus } from './TrustObservation.js';

// 0.2.38 — pure derivation for World View's unobtrusive presence
// diagnostic surface (see docs/Principles.md, "Rendering Presence And
// Trusting Presence Remain Separate"). Given exactly what
// `application/LocalPresenceStore.list()`/`PresenceSyncService.pull()`
// already return — no extra querying, no I/O — buckets each KNOWN
// remote avatar into ONE of four user-facing categories:
//
//   trusted     — PRESENT, and the most recent claim accepted for it
//                 was VALID.
//   stale       — lifecycle has gone STALE (haven't heard from them in
//                 a while) — a TIME concept, entirely independent of
//                 trust.
//   conflicting — the most recent claim seen for it was EQUIVOCATING —
//                 competing, unresolved claims exist right now.
//   unavailable — anything else questionable about the most recent
//                 claim (a required signature was missing, a signature
//                 failed to verify, the claimant was unauthorized, a
//                 replay was detected, or a stale-by-sequence claim
//                 arrived) while the avatar itself is still known and
//                 still rendered at its last legitimately accepted
//                 position.
//
// A record only ever appears in `knownPresences` at all once it has
// been ACCEPTED at least once (see
// application/PresenceTrustBoundary.js) — so "conflicting"/
// "unavailable" here always describe an avatar this replica is still
// legitimately watching, never one that was never trusted in the
// first place (those never enter the store to begin with, and so
// never appear anywhere in this summary).
export function summarizePresenceDiagnostics(knownPresences) {
    const summary = { total: knownPresences.length, trusted: 0, stale: 0, conflicting: 0, unavailable: 0 };
    for (const entry of knownPresences) {
        const status = entry.trustObservation ? entry.trustObservation.status : null;
        if (status === TrustStatus.EQUIVOCATING) {
            summary.conflicting++;
        } else if (entry.lifecycleState === PresenceLifecycleState.STALE) {
            summary.stale++;
        } else if (status === TrustStatus.VALID) {
            summary.trusted++;
        } else {
            summary.unavailable++;
        }
    }
    return summary;
}
