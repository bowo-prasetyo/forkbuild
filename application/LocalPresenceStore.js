import { derivePresenceLifecycleState } from '../core/PresenceFreshness.js';
import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { PresenceTrustBoundary } from './PresenceTrustBoundary.js';

// 0.2.37 — avatarId -> latest known AvatarPresenceAdvertisement, plus
// the RECEIVER's own receipt timestamp for each. This is the
// ingestion boundary the design doc calls for: a broadcast transport
// handler never writes directly into rendering/session state, it only
// ever calls `ingest()` here.
//
// 0.2.38 — every entry is now judged by a PresenceTrustBoundary
// (signature verification, identity binding, replay detection,
// equivocation detection, THEN the monotonic-sequence rule
// core/PresenceIngestion.js already established) before it's allowed
// to replace what's stored — see docs/Principles.md, "Never Let A
// Transport Callback Write Directly Into Session State," which
// specifically anticipated hardening happening exactly here. Defaults
// to a permissive trust boundary, so a store built without one (every
// existing caller) behaves EXACTLY as 0.2.37 left it — unsigned
// presence still tolerated, only genuinely hostile/malformed/replayed/
// conflicting input newly rejected.
//
// Deliberately NOT a StorageProvider-backed store — nothing here is
// ever persisted; a page reload starts with zero known remote
// presences, exactly as it should for something this ephemeral.
export class LocalPresenceStore {
    constructor({ staleAfterMs = 2500, absentAfterMs = 6000, trustBoundary = new PresenceTrustBoundary() } = {}) {
        this._records = new Map(); // avatarId -> { advertisement, receivedAt }
        this._observations = new Map(); // avatarId -> most recent TrustObservation
        this._staleAfterMs = staleAfterMs;
        this._absentAfterMs = absentAfterMs;
        this._trustBoundary = trustBoundary;
    }

    // Returns true if the advertisement was accepted (replaced what
    // was stored, or was the first ever seen for this avatarId),
    // false if the trust boundary rejected it — as malformed,
    // unsigned-when-policy-forbids-it, unauthorized, replayed,
    // conflicting, or stale — see application/PresenceTrustBoundary.js
    // for the exact rule. Either way, the trust boundary's
    // TrustObservation is remembered for diagnostics
    // (core/PresenceDiagnosticsSummary.js) — a REJECTED claim still
    // updates what this replica knows about the avatar's trust state,
    // even though it never touches the avatar's displayed position.
    ingest(advertisement, receivedAt = Date.now()) {
        const avatarId = advertisement && typeof advertisement === 'object' ? advertisement.avatarId : null;
        const existing = avatarId ? this._records.get(avatarId) : null;
        const { accepted, observation } = this._trustBoundary.evaluate(advertisement, existing ? existing.advertisement : null);
        if (avatarId && typeof avatarId === 'string') {
            this._observations.set(avatarId, observation);
        }
        if (!accepted) {
            return false;
        }
        this._records.set(avatarId, { advertisement, receivedAt });
        return true;
    }

    // The "pull" half — a caller (application/PresenceSyncService.js,
    // ultimately WorldNavigationSession) asks, on its OWN schedule,
    // "what do you currently know," rather than this store ever
    // pushing anything into a caller's state itself. Prunes any
    // record that has aged into ABSENT as a side effect of being
    // asked — an absent avatar has nothing further to report, so
    // there's no reason to keep it around waiting to be asked again.
    list(now = Date.now()) {
        const result = [];
        for (const [avatarId, record] of this._records) {
            const lifecycleState = derivePresenceLifecycleState({
                receivedAt: record.receivedAt,
                now,
                staleAfterMs: this._staleAfterMs,
                absentAfterMs: this._absentAfterMs
            });
            if (lifecycleState === PresenceLifecycleState.ABSENT) {
                this._records.delete(avatarId);
                this._observations.delete(avatarId);
                continue;
            }
            result.push({
                advertisement: record.advertisement,
                lifecycleState,
                receivedAt: record.receivedAt,
                // 0.2.38 — the MOST RECENT TrustObservation for this
                // avatarId, which may describe a claim that was
                // REJECTED (e.g. EQUIVOCATING) even though the
                // DISPLAYED advertisement above is still whatever was
                // last legitimately accepted — see
                // core/PresenceDiagnosticsSummary.js. Rendering and
                // trust stay separate: this is diagnostics-only,
                // application/RemoteAvatarRegistry.js never reads it.
                trustObservation: this._observations.get(avatarId) || null
            });
        }
        return result;
    }

    get(avatarId) {
        const record = this._records.get(avatarId);
        return record ? record.advertisement : null;
    }

    remove(avatarId) {
        this._records.delete(avatarId);
        this._observations.delete(avatarId);
    }

    clear() {
        this._records.clear();
        this._observations.clear();
    }
}
