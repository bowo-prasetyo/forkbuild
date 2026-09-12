import { NostrPublicationRelaySetConfiguration } from '../core/NostrPublicationRelaySetConfiguration.js';
import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';

// 0.9.447 — Nostr Publication Relay Set Configuration Write Seam.
//
// The missing WRITE seam over core/NostrPublicationRelaySetConfiguration.js
// + storage/NostrPublicationRelaySetConfigurationStore.js (both this same
// milestone, sibling files) — the direct structural mirror of
// application/SetNostrRelayConfigurationUseCase.js, applied to a relay SET
// instead of a single relay URL. A settings view hands this class a plain
// `{ relayUrls }`, never a constructed value object of its own, and this
// class is the one place that turns it into a real
// `NostrPublicationRelaySetConfiguration` and persists it.
//
//   ui/views/NostrPublicationRelaySettingsView.js  (this same milestone)
//        save({ relayUrls })
//                    │
//                    ▼
//   SetNostrPublicationRelaySetConfigurationUseCase.execute({ relayUrls })   ★ (THIS)
//        new NostrPublicationRelaySetConfiguration({ relayUrls })   — throws
//             for an empty array or any entry that isn't a valid absolute
//             ws:/wss: URL; nothing is persisted when it throws
//                    │
//                    ▼
//   NostrPublicationRelaySetConfigurationStore.save(configuration)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY, THE IDENTICAL
// SHAPE ITS SINGLE-RELAY SIBLING ALREADY HOLDS. `execute()` does two
// things, in this order, and nothing else: (1) constructs a
// `NostrPublicationRelaySetConfiguration` — which is itself what validates
// and normalizes `relayUrls`, never re-implemented here — and (2) saves it.
// It never contacts a relay, never checks any relay actually speaks NIP-01,
// and never reads the current configuration; and it never exposes a
// `clear()` of its own — clearing needs no construction or validation of
// any kind, so a caller reaches
// `NostrPublicationRelaySetConfigurationStore.clear()` directly, exactly
// the same restraint `SetNostrRelayConfigurationUseCase.js`'s own header
// already holds.
//
// AN INVALID RELAY SET NEVER MUTATES THE STORE. `new
// NostrPublicationRelaySetConfiguration(...)` throws before `save()` is
// ever called, so a rejected input leaves whatever was previously on file
// completely untouched — construct first, save second, so a throw never
// reaches the store.
export class SetNostrPublicationRelaySetConfigurationUseCase {
    // `nostrPublicationRelaySetConfigurationStore` — a
    // NostrPublicationRelaySetConfigurationStore (this same milestone);
    // consulted via `save(configuration)` only, injected exactly like every
    // other composition-time dependency in this codebase, never constructed
    // here.
    constructor({ nostrPublicationRelaySetConfigurationStore } = {}) {
        if (!(nostrPublicationRelaySetConfigurationStore instanceof NostrPublicationRelaySetConfigurationStore)) {
            throw new Error('SetNostrPublicationRelaySetConfigurationUseCase requires a NostrPublicationRelaySetConfigurationStore');
        }
        this._store = nostrPublicationRelaySetConfigurationStore;
    }

    // Saves `relayUrls` as the Wanderer's own Nostr publication-distribution
    // relay set, replacing whatever was previously on file outright.
    // Returns the new, persisted NostrPublicationRelaySetConfiguration.
    //
    // Throws for anything
    // core/NostrPublicationRelaySetConfiguration.js's own constructor
    // rejects (an empty array, an array with no valid entry, an invalid
    // relay URL, ...) — before this method ever calls `save()`.
    execute({ relayUrls } = {}) {
        const configuration = new NostrPublicationRelaySetConfiguration({ relayUrls });
        this._store.save(configuration);
        return configuration;
    }
}
