import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { RendezvousConfiguration, isValidRendezvousUrl } from '../core/RendezvousConfiguration.js';

const RENDEZVOUS_CONFIGURATION_STORE_KEY = 'rendezvous-configuration';

// 0.9.388 — User-Configurable Rendezvous Server Configuration Persistence.
//
// core/RendezvousConfiguration.js (this same milestone, sibling file) gave
// a user's own rendezvous server list a real, validated, immutable shape.
// This file is the direct, named answer, mirroring `storage/
// IceServerConfigurationStore.js` (0.9.386) exactly — same
// save()/get()/clear() shape, same StorageProvider seam, same "absence
// stays meaningful" rule — applied to a rendezvous URL list instead of a
// STUN server list.
//
//   core/RendezvousConfiguration.js   (this milestone, unmodified by this
//        file — toJSON()/the constructor's own validation, reused verbatim)
//                    │
//                    ▼
//   storage/RendezvousConfigurationStore.js   ★ (THIS)
//        save(configuration) / get() / clear()
//                    │
//                    ▼
//   storage/StorageProvider.js   (generic, JSON-safe, injected — defaults
//        to storage/LocalStorageProvider.js, the identical seam every
//        sibling configuration store already uses)
//
//   (this milestone) ui/main.js reads get() once at startup and resolves
//   the effective rendezvous URL list it hands to `DiscoveryBootstrap`'s
//   own `bootstrapProviders` — see that file's own 0.9.388 comment for the
//   exact wiring.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT, exactly the
// same rule `storage/IceServerConfigurationStore.js`'s own header already
// draws. `get()` returns `null` — never a `RendezvousConfiguration` holding
// `peer/RendezvousConfig.js`'s own `DEFAULT_RENDEZVOUS_URLS` — when the
// user has never saved an override. A caller resolving the EFFECTIVE
// rendezvous list to actually use is the one that falls back to
// `DEFAULT_RENDEZVOUS_URLS` when `get()` returns `null` — this store never
// performs that fallback itself.
//
// A SINGLE CONFIGURATION, NEVER A HISTORY, NEVER PER-PEER. Storage holds
// exactly one `{ urls: [...] }` object under one fixed key — saving a new
// URL list REPLACES whatever was previously on file outright. There is no
// per-peer or per-connection dimension: every future discovery/publish
// call this replica makes uses the same configured rendezvous list,
// exactly the "existing peer, identity, and authentication semantics stay
// untouched" boundary this milestone's own brief draws.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — the
// identical split every sibling configuration store's own header already
// draws. A persisted payload that isn't a plain object, whose `urls` isn't
// a non-empty array, or that contains any entry `isValidRendezvousUrl()`
// rejects, degrades silently to "absent" (`get()` returns `null`) — never
// a thrown error escaping this class over bad bytes on file, and never a
// PARTIAL list (some valid entries kept, some dropped) — the whole saved
// configuration is either entirely valid or entirely treated as absent.
// The injected `StorageProvider`'s own `save()`/`load()` THROWING (quota
// exceeded, a broken adapter) is never caught here at all, and propagates
// straight out of `save()`/`get()`/`clear()` to the caller.
//
// `clear()` IS THE ONE WAY BACK TO "NO OVERRIDE, USE THE DEFAULT
// RENDEZVOUS LIST" — saving `DEFAULT_RENDEZVOUS_URLS` itself would wrongly
// turn the default into a persisted user preference, the exact confusion
// every sibling configuration store's own header already rules out.
export class RendezvousConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('RendezvousConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `configuration` (a RendezvousConfiguration instance — this
    // method performs no duck-typing and constructs nothing of its own
    // from a plain object), replacing whatever was previously on file
    // outright. Returns nothing; the write either lands or the injected
    // provider's own save() throws (see this file's own header, "a genuine
    // storage failure propagates").
    save(configuration) {
        if (!(configuration instanceof RendezvousConfiguration)) {
            throw new Error('RendezvousConfigurationStore.save() requires a RendezvousConfiguration instance');
        }
        this._storageProvider.save(RENDEZVOUS_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // The RendezvousConfiguration on file, re-hydrated through its own
    // constructor — never a plain object. Returns `null` when nothing is
    // on file, OR when what's on file is malformed in any way (see this
    // file's own header) — both cases are indistinguishable to a caller,
    // deliberately: "absent" and "unreadable" both mean this store has no
    // valid configuration to hand back right now.
    get() {
        const raw = this._storageProvider.load(RENDEZVOUS_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.urls) || raw.urls.length === 0) {
            return null;
        }
        const allValid = raw.urls.every((url) => isValidRendezvousUrl(url));
        if (!allValid) {
            return null;
        }
        try {
            return new RendezvousConfiguration({ urls: raw.urls });
        } catch {
            return null;
        }
    }

    // Removes any persisted override outright — the one way back to "no
    // override, use the default rendezvous list." See this file's own
    // header, "clear() is the one way back."
    clear() {
        this._storageProvider.remove(RENDEZVOUS_CONFIGURATION_STORE_KEY);
    }
}
