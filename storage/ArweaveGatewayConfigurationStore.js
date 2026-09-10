import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { ArweaveGatewayConfiguration, isValidArweaveGatewayUrl } from '../core/ArweaveGatewayConfiguration.js';

const ARWEAVE_GATEWAY_CONFIGURATION_STORE_KEY = 'arweave-gateway-configuration';

// 0.9.364 — User-Configurable Arweave Gateway Configuration Persistence.
//
// core/ArweaveGatewayConfiguration.js (this same milestone, sibling file)
// gave a user's own Arweave gateway choice a real, validated, immutable
// shape — deliberately unconsumed by anything, with no storage key of any
// kind, the same restraint the 0.9.293 per-role provider preference
// boundary held one family over. This file is the direct, named answer,
// mirroring the shape of that boundary's own 0.9.294 persistence store
// exactly, one field instead of a per-role map.
//
//   core/ArweaveGatewayConfiguration.js   (this milestone, unmodified by
//        this file — toJSON()/the constructor's own validation, reused
//        verbatim)
//                    │
//                    ▼
//   storage/ArweaveGatewayConfigurationStore.js   ★ (THIS)
//        save(configuration) / get() / clear()
//                    │
//                    ▼
//   storage/StorageProvider.js   (generic, JSON-safe, injected — defaults
//        to storage/LocalStorageProvider.js, the identical seam the
//        0.9.294 per-role preference store already established)
//
//   (this milestone) ui/main.js reads get() once at startup and resolves
//   the effective gatewayUrl it hands to the retrieval composition sites
//   — see ui/main.js's own 0.9.364 comment for that wiring.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT. `get()` returns
// `null` — never an `ArweaveGatewayConfiguration` holding
// `DEFAULT_ARWEAVE_GATEWAY_URL` — when the user has never saved an
// override. A caller resolving the EFFECTIVE gateway to actually use is the
// one that falls back to `DEFAULT_ARWEAVE_GATEWAY_URL` (core/
// ArweaveGatewayConfiguration.js's own export) when `get()` returns `null`
// — this store never performs that fallback itself, exactly the same
// "no preference configured is never a fabricated value" restraint the
// 0.9.294 per-role preference store's own header already holds (see that
// milestone's own persistence test, Section I). This is the one rule this
// milestone's own brief calls out by name: "absence of a user preference
// remains meaningful."
//
// A SINGLE CONFIGURATION, NEVER A HISTORY. Storage holds exactly one
// `{ gatewayUrl }` object under one fixed key — saving a new gatewayUrl
// REPLACES whatever was previously on file outright, the identical
// "current configuration, not a log" semantic the 0.9.294 per-role
// preference store's own header already draws for a single role's own
// entry. There is no per-user or per-role dimension here at all — Arweave
// has exactly one gateway preference application-wide.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — the
// identical split the 0.9.294 per-role preference store's own header
// already draws and its own Sections F/G already regression-test. A
// persisted payload that isn't a plain object, or whose `gatewayUrl` fails
// `isValidArweaveGatewayUrl()`, degrades silently to "absent" (`get()`
// returns `null`) — never a thrown error escaping this class over bad
// bytes on file. The injected `StorageProvider`'s own `save()`/`load()`
// THROWING (quota exceeded, a broken adapter) is never caught here at all,
// and propagates straight out of `save()`/`get()`/`clear()` to the caller.
//
// `clear()` IS THE ONE ADDITION BEYOND THE 0.9.294 PER-ROLE PREFERENCE
// STORE'S OWN `save()`/`get()`/`loadAll()` SHAPE — a deliberate, minimal
// one. That store has no "unset" affordance because a role either holds a
// current entry or it doesn't accumulate one; a gateway override needs an
// explicit way BACK to "no override, use the deployment default" that
// saving a fresh `ArweaveGatewayConfiguration` can never express on its
// own (saving `DEFAULT_ARWEAVE_GATEWAY_URL` itself would wrongly turn the
// default into a persisted user preference — the exact confusion this
// file's header already rules out, above). `clear()` is the only way a
// caller reaches that state; it never constructs, validates, or even reads
// an `ArweaveGatewayConfiguration` — it only ever removes the one storage
// key this class owns.
export class ArweaveGatewayConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('ArweaveGatewayConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `configuration` (an ArweaveGatewayConfiguration instance —
    // this method performs no duck-typing and constructs nothing of its
    // own from a plain object), replacing whatever was previously on file
    // outright. Returns nothing; the write either lands or the injected
    // provider's own save() throws (see this file's own header, "a genuine
    // storage failure propagates").
    save(configuration) {
        if (!(configuration instanceof ArweaveGatewayConfiguration)) {
            throw new Error('ArweaveGatewayConfigurationStore.save() requires an ArweaveGatewayConfiguration instance');
        }
        this._storageProvider.save(ARWEAVE_GATEWAY_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // The ArweaveGatewayConfiguration on file, re-hydrated through its own
    // constructor — never a plain object. Returns `null` when nothing is
    // on file, OR when what's on file is malformed (see this file's own
    // header) — both cases are indistinguishable to a caller, deliberately:
    // "absent" and "unreadable" both mean this store has no valid
    // configuration to hand back right now.
    get() {
        const raw = this._storageProvider.load(ARWEAVE_GATEWAY_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isValidArweaveGatewayUrl(raw.gatewayUrl)) {
            return null;
        }
        return new ArweaveGatewayConfiguration({ gatewayUrl: raw.gatewayUrl });
    }

    // Removes any persisted override outright — the one way back to "no
    // override, use the deployment default." See this file's own header,
    // "clear() is the one addition."
    clear() {
        this._storageProvider.remove(ARWEAVE_GATEWAY_CONFIGURATION_STORE_KEY);
    }
}
