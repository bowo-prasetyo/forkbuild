import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { NostrPublicationRelaySetConfiguration, normalizeNostrPublicationRelayUrls, isValidNostrPublicationRelayUrl } from '../core/NostrPublicationRelaySetConfiguration.js';

const NOSTR_PUBLICATION_RELAY_SET_CONFIGURATION_STORE_KEY = 'nostr-publication-relay-set-configuration';

// 0.9.447 — Nostr Publication Relay Set Configuration Persistence.
//
// core/NostrPublicationRelaySetConfiguration.js (this same milestone,
// sibling file) gave a Wanderer's own publication-distribution relay set a
// real, validated, immutable shape. This file is the direct, named answer,
// mirroring storage/NostrRelayConfigurationStore.js's own shape exactly —
// `save(configuration)` / `get()` / `clear()` — under a GENUINELY SEPARATE
// storage key, never `NostrRelayConfigurationStore`'s own
// `'nostr-relay-configuration'` key and never that class at all. 0.9.446's
// own Section I named exactly this risk by name — reusing the read-path
// store's own key or class would immediately collide "the discovery relay"
// with "the distribution relay set" under one field, the exact confusion
// this file's own dedicated key avoids.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT — the identical
// rule every sibling configuration store in this codebase already holds.
// `get()` returns `null` when a Wanderer has never configured a
// publication relay set, and `DEFAULT_NOSTR_PUBLICATION_RELAY_URL` (core/
// NostrPublicationRelaySetConfiguration.js's own export) is consulted only
// then — by application/NostrPublicationRelaySetConfigurationProvider.js
// (this same milestone), never by this store itself.
//
// A SINGLE CONFIGURATION, NEVER A HISTORY, AND NEVER PER-PUBLICATION.
// Storage holds exactly one `{ relayUrls }` object under one fixed key —
// saving a new relay set REPLACES whatever was previously on file outright.
// This configuration is application-wide infrastructure, never scoped to a
// particular Publication — see core/NostrPublicationRelaySetConfiguration.js's
// own header, "deliberately excluded... per-publication scoping."
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — the
// identical split every sibling configuration store already draws. A
// persisted payload that isn't a plain object, or whose `relayUrls` (once
// normalized) contains no valid entry, degrades silently to "absent"
// (`get()` returns `null`) — never a thrown error escaping this class over
// bad bytes on file. The injected `StorageProvider`'s own `save()`/`load()`
// THROWING (quota exceeded, a broken adapter) is never caught here, and
// propagates straight out of `save()`/`get()`/`clear()` to the caller. A
// persisted payload naming SOME valid and some invalid/duplicate entries
// degrades to the valid, normalized subset — mirroring
// core/NostrPublicationRelaySetConfiguration.js's own constructor
// normalization exactly, never a second, looser tolerance invented here.
//
// `clear()` IS THE ONE WAY BACK TO "NO OVERRIDE, USE THE DEPLOYMENT
// DEFAULT" — the identical shape every sibling configuration store already
// holds. It never constructs, validates, or even reads a
// `NostrPublicationRelaySetConfiguration` — it only ever removes the one
// storage key this class owns.
export class NostrPublicationRelaySetConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('NostrPublicationRelaySetConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `configuration` (a NostrPublicationRelaySetConfiguration
    // instance — this method performs no duck-typing and constructs nothing
    // of its own from a plain object), replacing whatever was previously on
    // file outright. Returns nothing; the write either lands or the
    // injected provider's own save() throws.
    save(configuration) {
        if (!(configuration instanceof NostrPublicationRelaySetConfiguration)) {
            throw new Error('NostrPublicationRelaySetConfigurationStore.save() requires a NostrPublicationRelaySetConfiguration instance');
        }
        this._storageProvider.save(NOSTR_PUBLICATION_RELAY_SET_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // The NostrPublicationRelaySetConfiguration on file, re-hydrated through
    // its own constructor — never a plain object. Returns `null` when
    // nothing is on file, OR when what's on file is malformed/empty-after-
    // normalization — both cases are indistinguishable to a caller,
    // deliberately: "absent" and "unreadable" both mean this store has no
    // valid configuration to hand back right now.
    get() {
        const raw = this._storageProvider.load(NOSTR_PUBLICATION_RELAY_SET_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.relayUrls)) {
            return null;
        }
        const validEntries = normalizeNostrPublicationRelayUrls(raw.relayUrls).filter(isValidNostrPublicationRelayUrl);
        if (validEntries.length === 0) {
            return null;
        }
        return new NostrPublicationRelaySetConfiguration({ relayUrls: validEntries });
    }

    // Removes any persisted relay set outright — the one way back to "no
    // override, use the deployment default."
    clear() {
        this._storageProvider.remove(NOSTR_PUBLICATION_RELAY_SET_CONFIGURATION_STORE_KEY);
    }
}
