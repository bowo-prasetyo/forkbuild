import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { NostrRelayConfiguration, isValidNostrRelayUrl } from '../core/NostrRelayConfiguration.js';

const NOSTR_RELAY_CONFIGURATION_STORE_KEY = 'nostr-relay-configuration';

// 0.9.369 — Nostr Relay Configuration Persistence.
//
// core/NostrRelayConfiguration.js (this same milestone, sibling file) gave
// a user's own Nostr relay choice a real, validated, immutable shape —
// deliberately unconsumed by anything, with no storage key of any kind,
// the same restraint storage/ArweaveGatewayConfigurationStore.js's own
// header already holds for its own sibling value object. This file is the
// direct, named answer, mirroring that store's shape exactly, one field
// instead of a gateway URL.
//
//   core/NostrRelayConfiguration.js   (this milestone, unmodified by this
//        file — toJSON()/the constructor's own validation, reused
//        verbatim)
//                    │
//                    ▼
//   storage/NostrRelayConfigurationStore.js   ★ (THIS)
//        save(configuration) / get() / clear()
//                    │
//                    ▼
//   storage/StorageProvider.js   (generic, JSON-safe, injected — defaults
//        to storage/LocalStorageProvider.js, the identical seam
//        storage/ArweaveGatewayConfigurationStore.js's own header already
//        establishes)
//
//   (this milestone) ui/main.js reads get() once at startup and resolves
//   the effective relayUrl it hands to the three read-path composition
//   sites — see ui/main.js's own 0.9.369 comment for that wiring.
//
// A DEDICATED, SEPARATE STORAGE KEY — NEVER
// `ArweaveGatewayConfigurationStore`'S OWN KEY, AND NEVER A SHARED CLASS.
// `'nostr-relay-configuration'` is this file's own, one storage key,
// entirely independent of `'arweave-gateway-configuration'`. Two
// deliberately unconnected configuration systems — `ArweaveGatewayConfiguration`
// and `NostrRelayConfiguration` — stay two unconnected persisted facts,
// exactly the distinction this milestone's own brief draws by name:
// "shared implementation shape does not mean shared domain semantics."
//
// READ-PATH ONLY — THIS IS THE MOST IMPORTANT BOUNDARY THIS MILESTONE
// DRAWS, AND IT IS ENFORCED ONE LAYER UP, NOT HERE. This store has no
// opinion of its own about who consults it — that enforcement lives in
// which files `ui/main.js` threads the resolved `relayUrl` into (the three
// READ-path discovery classes) and which it deliberately never touches (the
// three Nostr WRITE-path publishers: `NostrPublicationDiscoveryPublisher`,
// `NostrSnapshotDiscoveryPublisher`, `NostrPlaceNamingDiscoveryPublisher`).
// This file itself is named, and behaves, identically regardless of who
// calls it; it is `ui/main.js`'s own wiring, not this class, that keeps
// publishing untouched.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT. `get()` returns
// `null` — never a `NostrRelayConfiguration` holding
// `DEFAULT_NOSTR_RELAY_URL` — when the user has never saved an override. A
// caller resolving the EFFECTIVE relay to actually use is the one that
// falls back to `DEFAULT_NOSTR_RELAY_URL` (core/NostrRelayConfiguration.js's
// own export) when `get()` returns `null` — this store never performs that
// fallback itself. This is the one rule this milestone's own brief calls
// out by name: "store.get() === null means no user override, rather than
// user explicitly selected the deployment default."
//
// A SINGLE CONFIGURATION, NEVER A HISTORY, AND NEVER A RELAY LIST. Storage
// holds exactly one `{ relayUrl }` object under one fixed key — saving a
// new relayUrl REPLACES whatever was previously on file outright. There is
// no per-region or per-purpose dimension here at all — this milestone gives
// Nostr discovery exactly one relay preference, application-wide, matching
// every one of the three read-path classes' own "exactly one relay per
// instance — no fan-out, no ranking" restraint.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — the
// identical split storage/ArweaveGatewayConfigurationStore.js's own header
// already draws. A persisted payload that isn't a plain object, or whose
// `relayUrl` fails `isValidNostrRelayUrl()`, degrades silently to "absent"
// (`get()` returns `null`) — never a thrown error escaping this class over
// bad bytes on file. The injected `StorageProvider`'s own `save()`/`load()`
// THROWING (quota exceeded, a broken adapter) is never caught here at all,
// and propagates straight out of `save()`/`get()`/`clear()` to the caller.
//
// `clear()` IS THE ONE WAY BACK TO "NO OVERRIDE, USE THE DEPLOYMENT
// DEFAULT" — a relay override needs an explicit way back that saving a
// fresh `NostrRelayConfiguration` can never express on its own (saving
// `DEFAULT_NOSTR_RELAY_URL` itself would wrongly turn the default into a
// persisted user preference). `clear()` never constructs, validates, or
// even reads a `NostrRelayConfiguration` — it only ever removes the one
// storage key this class owns.
export class NostrRelayConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('NostrRelayConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `configuration` (a NostrRelayConfiguration instance — this
    // method performs no duck-typing and constructs nothing of its own from
    // a plain object), replacing whatever was previously on file outright.
    // Returns nothing; the write either lands or the injected provider's
    // own save() throws (see this file's own header, "a genuine storage
    // failure propagates").
    save(configuration) {
        if (!(configuration instanceof NostrRelayConfiguration)) {
            throw new Error('NostrRelayConfigurationStore.save() requires a NostrRelayConfiguration instance');
        }
        this._storageProvider.save(NOSTR_RELAY_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // The NostrRelayConfiguration on file, re-hydrated through its own
    // constructor — never a plain object. Returns `null` when nothing is
    // on file, OR when what's on file is malformed (see this file's own
    // header) — both cases are indistinguishable to a caller, deliberately:
    // "absent" and "unreadable" both mean this store has no valid
    // configuration to hand back right now.
    get() {
        const raw = this._storageProvider.load(NOSTR_RELAY_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isValidNostrRelayUrl(raw.relayUrl)) {
            return null;
        }
        return new NostrRelayConfiguration({ relayUrl: raw.relayUrl });
    }

    // Removes any persisted override outright — the one way back to "no
    // override, use the deployment default." See this file's own header,
    // "clear() is the one way back."
    clear() {
        this._storageProvider.remove(NOSTR_RELAY_CONFIGURATION_STORE_KEY);
    }
}
