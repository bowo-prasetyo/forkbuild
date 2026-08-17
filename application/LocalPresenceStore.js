import { isValidAvatarPresenceAdvertisement } from '../core/AvatarPresenceAdvertisement.js';
import { resolveIncomingPresence } from '../core/PresenceIngestion.js';
import { derivePresenceLifecycleState } from '../core/PresenceFreshness.js';
import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';

// 0.2.37 — avatarId -> latest known AvatarPresenceAdvertisement, plus
// the RECEIVER's own receipt timestamp for each. This is the
// ingestion boundary the design doc calls for: a broadcast transport
// handler never writes directly into rendering/session state, it only
// ever calls `ingest()` here, and every entry is judged independently
// through core/PresenceIngestion.js's monotonic-sequence rule before
// it's allowed to replace what's stored — see docs/Principles.md,
// "Never Let A Transport Callback Write Directly Into Session State."
//
// Deliberately NOT a StorageProvider-backed store — nothing here is
// ever persisted; a page reload starts with zero known remote
// presences, exactly as it should for something this ephemeral.
export class LocalPresenceStore {
    constructor({ staleAfterMs = 2500, absentAfterMs = 6000 } = {}) {
        this._records = new Map(); // avatarId -> { advertisement, receivedAt }
        this._staleAfterMs = staleAfterMs;
        this._absentAfterMs = absentAfterMs;
    }

    // Returns true if the advertisement was accepted (replaced what
    // was stored, or was the first ever seen for this avatarId),
    // false if it was rejected as malformed, stale, or a duplicate —
    // see core/PresenceIngestion.js for the exact rule.
    ingest(advertisement, receivedAt = Date.now()) {
        if (!isValidAvatarPresenceAdvertisement(advertisement)) {
            return false;
        }
        const existing = this._records.get(advertisement.avatarId);
        const decision = resolveIncomingPresence(existing ? existing.advertisement : null, advertisement);
        if (!decision.accepted) {
            return false;
        }
        this._records.set(advertisement.avatarId, { advertisement, receivedAt });
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
                continue;
            }
            result.push({ advertisement: record.advertisement, lifecycleState, receivedAt: record.receivedAt });
        }
        return result;
    }

    get(avatarId) {
        const record = this._records.get(avatarId);
        return record ? record.advertisement : null;
    }

    remove(avatarId) {
        this._records.delete(avatarId);
    }

    clear() {
        this._records.clear();
    }
}
