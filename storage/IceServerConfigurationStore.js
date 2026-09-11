import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { IceServerConfiguration, isValidStunUrl } from '../core/IceServerConfiguration.js';

const ICE_SERVER_CONFIGURATION_STORE_KEY = 'ice-server-configuration';

// 0.9.386 — User-Configurable STUN Server Configuration Persistence.
//
// core/IceServerConfiguration.js (this same milestone, sibling file) gave a
// user's own STUN server list a real, validated, immutable shape. This file
// is the direct, named answer, mirroring `storage/
// ArweaveGatewayConfigurationStore.js` / `storage/
// NostrRelayConfigurationStore.js` exactly — same save()/get()/clear()
// shape, same StorageProvider seam, same "absence stays meaningful" rule —
// applied to a STUN server list instead of a single URL field.
//
//   core/IceServerConfiguration.js   (this milestone, unmodified by this
//        file — toJSON()/the constructor's own validation, reused verbatim)
//                    │
//                    ▼
//   storage/IceServerConfigurationStore.js   ★ (THIS)
//        save(configuration) / get() / clear()
//                    │
//                    ▼
//   storage/StorageProvider.js   (generic, JSON-safe, injected — defaults
//        to storage/LocalStorageProvider.js, the identical seam every
//        sibling configuration store already uses)
//
//   (this milestone) ui/main.js reads get() once at startup and resolves
//   the effective STUN server list it hands to
//   `new WebRtcPeerConnectionProvider({ iceServers })` — see that file's
//   own 0.9.386 comment for the exact wiring.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT, exactly the
// same rule `storage/ArweaveGatewayConfigurationStore.js`'s own header
// already draws. `get()` returns `null` — never an `IceServerConfiguration`
// holding `peer/IceServerConfig.js`'s own `DEFAULT_ICE_SERVERS` — when the
// user has never saved an override. A caller resolving the EFFECTIVE STUN
// list to actually use is the one that falls back to `DEFAULT_ICE_SERVERS`
// when `get()` returns `null` — this store never performs that fallback
// itself.
//
// A SINGLE CONFIGURATION, NEVER A HISTORY, NEVER PER-PEER. Storage holds
// exactly one `{ servers: [...] }` object under one fixed key — saving a
// new server list REPLACES whatever was previously on file outright. There
// is no per-peer or per-connection dimension: every future peer connection
// this replica creates uses the same configured STUN list, exactly the
// "existing peer, identity, and authentication semantics stay untouched"
// boundary this milestone's own brief draws.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — the
// identical split every sibling configuration store's own header already
// draws. A persisted payload that isn't a plain object, whose `servers`
// isn't a non-empty array, or that contains any entry
// `isValidStunUrl()` rejects, degrades silently to "absent" (`get()`
// returns `null`) — never a thrown error escaping this class over bad
// bytes on file, and never a PARTIAL list (some valid entries kept, some
// dropped) — the whole saved configuration is either entirely valid or
// entirely treated as absent. The injected `StorageProvider`'s own
// `save()`/`load()` THROWING (quota exceeded, a broken adapter) is never
// caught here at all, and propagates straight out of
// `save()`/`get()`/`clear()` to the caller.
//
// `clear()` IS THE ONE WAY BACK TO "NO OVERRIDE, USE THE DEFAULT STUN
// LIST" — saving `DEFAULT_ICE_SERVERS` itself would wrongly turn the
// default into a persisted user preference, the exact confusion every
// sibling configuration store's own header already rules out.
export class IceServerConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('IceServerConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `configuration` (an IceServerConfiguration instance — this
    // method performs no duck-typing and constructs nothing of its own
    // from a plain object), replacing whatever was previously on file
    // outright. Returns nothing; the write either lands or the injected
    // provider's own save() throws (see this file's own header, "a genuine
    // storage failure propagates").
    save(configuration) {
        if (!(configuration instanceof IceServerConfiguration)) {
            throw new Error('IceServerConfigurationStore.save() requires an IceServerConfiguration instance');
        }
        this._storageProvider.save(ICE_SERVER_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // The IceServerConfiguration on file, re-hydrated through its own
    // constructor — never a plain object. Returns `null` when nothing is
    // on file, OR when what's on file is malformed in any way (see this
    // file's own header) — both cases are indistinguishable to a caller,
    // deliberately: "absent" and "unreadable" both mean this store has no
    // valid configuration to hand back right now.
    get() {
        const raw = this._storageProvider.load(ICE_SERVER_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.servers) || raw.servers.length === 0) {
            return null;
        }
        const allValid = raw.servers.every((entry) => (
            entry && typeof entry === 'object' && !Array.isArray(entry) && isValidStunUrl(entry.urls)
        ));
        if (!allValid) {
            return null;
        }
        try {
            return new IceServerConfiguration({ servers: raw.servers });
        } catch {
            return null;
        }
    }

    // Removes any persisted override outright — the one way back to "no
    // override, use the default STUN list." See this file's own header,
    // "clear() is the one way back."
    clear() {
        this._storageProvider.remove(ICE_SERVER_CONFIGURATION_STORE_KEY);
    }
}
