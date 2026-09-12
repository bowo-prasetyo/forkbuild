import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { TurnServerConfiguration, isValidTurnUrl } from '../core/TurnServerConfiguration.js';

const TURN_SERVER_CONFIGURATION_STORE_KEY = 'turn-server-configuration';

// 0.9.454 — User-Configurable TURN Server Configuration Persistence.
//
// core/TurnServerConfiguration.js (this same milestone, sibling file) gave
// a user's own TURN relay a real, validated, immutable shape. This file is
// its durable home — mirroring storage/IceServerConfigurationStore.js's own
// save()/get()/clear() shape, same StorageProvider seam, same "absence
// stays meaningful" rule — applied to a TURN relay (urls + username +
// credential) instead of a STUN server list.
//
//   core/TurnServerConfiguration.js   (this milestone, unmodified by this
//        file — toJSON()/the constructor's own validation, reused verbatim)
//                    │
//                    ▼
//   storage/TurnServerConfigurationStore.js   ★ (THIS)
//        save(configuration) / get() / clear()
//                    │
//                    ▼
//   storage/StorageProvider.js   (generic, JSON-safe, injected — defaults
//        to storage/LocalStorageProvider.js, the identical seam every
//        sibling configuration store already uses)
//
//   (0.9.454, sibling file) application/TurnServerConfigurationProvider.js
//        reads get() and hands back the result verbatim — see that file's
//        own header for why no default is ever fabricated here.
//
// ITS OWN DEDICATED PERSISTENCE KEY, `turn-server-configuration` —
// genuinely separate storage from `ice-server-configuration`
// (storage/IceServerConfigurationStore.js's own key). This store never
// reads, writes, or falls back to the STUN store's key, and the STUN store
// never reads, writes, or falls back to this one — see tests/
// TurnServerConfiguration.test.js's own "STUN isolation" section for a live
// regression check of exactly this property.
//
// "ABSENT" AND "NO TURN SERVER" ARE THE SAME FACT, ON PURPOSE — the one
// place this store's own contract differs in EMPHASIS (never in mechanism)
// from storage/IceServerConfigurationStore.js's own STUN equivalent: STUN
// has a deployment-wide default (`DEFAULT_ICE_SERVERS`) a caller falls back
// to when nothing is configured, but a TURN relay is inherently
// operator-specific — there is no deployment-wide default TURN relay this
// store could fall back to (`peer/IceServerConfig.js`'s own Metered fetch
// is a SEPARATE, unrelated seam this store never touches, reads, or
// composes with). `get()` returning `null` therefore means exactly "no TURN
// server," full stop — never "use some other TURN server instead." A
// caller resolving the effective TURN configuration to actually use (0.9.455,
// not this milestone) is the one that decides what "no TURN server"
// means for the peer connection it is about to open; this store never
// makes that decision itself, and never invents a TURN entry that was
// never explicitly saved.
//
// A SINGLE CONFIGURATION, NEVER A HISTORY, NEVER PER-PEER — identical to
// storage/IceServerConfigurationStore.js's own rule. Storage holds exactly
// one `{ urls, username, credential }` object under one fixed key — saving
// a new configuration REPLACES whatever was previously on file outright.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — the
// identical split every sibling configuration store's own header already
// draws. A persisted payload that isn't a plain object, whose `urls` isn't
// a non-empty array of valid turn:/turns: URLs, or whose `username`/
// `credential` isn't a non-empty string, degrades silently to "absent"
// (`get()` returns `null`) — never a thrown error escaping this class over
// bad bytes on file. The injected StorageProvider's own save()/load()
// THROWING (quota exceeded, a broken adapter) is never caught here, and
// propagates straight out of save()/get()/clear() to the caller.
//
// `clear()` IS THE ONE WAY BACK TO "NO TURN SERVER CONFIGURED."
export class TurnServerConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('TurnServerConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `configuration` (a TurnServerConfiguration instance — this
    // method performs no duck-typing and constructs nothing of its own from
    // a plain object), replacing whatever was previously on file outright.
    // Returns nothing; the write either lands or the injected provider's
    // own save() throws (see this file's own header, "a genuine storage
    // failure propagates").
    save(configuration) {
        if (!(configuration instanceof TurnServerConfiguration)) {
            throw new Error('TurnServerConfigurationStore.save() requires a TurnServerConfiguration instance');
        }
        this._storageProvider.save(TURN_SERVER_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // The TurnServerConfiguration on file, re-hydrated through its own
    // constructor — never a plain object. Returns `null` when nothing is on
    // file, OR when what's on file is malformed in any way (see this file's
    // own header) — both cases are indistinguishable to a caller,
    // deliberately: "absent" and "unreadable" both mean this store has no
    // valid configuration to hand back right now — and both mean "no TURN
    // server," never a fabricated one.
    get() {
        const raw = this._storageProvider.load(TURN_SERVER_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        if (!Array.isArray(raw.urls) || raw.urls.length === 0 || !raw.urls.every((url) => isValidTurnUrl(url))) {
            return null;
        }
        if (typeof raw.username !== 'string' || raw.username.trim().length === 0) {
            return null;
        }
        if (typeof raw.credential !== 'string' || raw.credential.trim().length === 0) {
            return null;
        }
        try {
            return new TurnServerConfiguration({ urls: raw.urls, username: raw.username, credential: raw.credential });
        } catch {
            return null;
        }
    }

    // Removes any persisted override outright — the one way back to "no
    // TURN server configured." See this file's own header, "clear() is the
    // one way back."
    clear() {
        this._storageProvider.remove(TURN_SERVER_CONFIGURATION_STORE_KEY);
    }
}
