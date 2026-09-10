import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';

// 0.9.371 — Nostr Relay Settings UI.
//
// 0.9.369's own core/NostrRelayConfiguration.js already named the one thing
// missing between a user's own relay URL and a durable, validated
// configuration: "a future settings surface — this file builds none." This
// class is that missing WRITE seam, the direct structural mirror of
// application/SetArweaveGatewayConfigurationUseCase.js (0.9.366) applied to
// a relay URL instead of a gateway URL — a settings view hands this class a
// plain `{ relayUrl }`, never a constructed value object of its own, and
// this class is the one place that turns it into a real
// `NostrRelayConfiguration` and persists it.
//
//   ui/views/NostrRelaySettingsView.js  (this same milestone)
//        save({ relayUrl })
//                    │
//                    ▼
//   SetNostrRelayConfigurationUseCase.execute({ relayUrl })   ★ (THIS)
//        new NostrRelayConfiguration({ relayUrl })   — throws for anything
//             that isn't a valid absolute ws:/wss: URL; nothing is
//             persisted when it throws
//                    │
//                    ▼
//   NostrRelayConfigurationStore.save(configuration)   (0.9.369, unmodified)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY, THE IDENTICAL
// SHAPE ITS ARWEAVE SIBLING ALREADY HOLDS. `execute()` does two things, in
// this order, and nothing else: (1) constructs a `NostrRelayConfiguration` —
// which is itself what validates `relayUrl`, never re-implemented here —
// and (2) saves it. It never opens a WebSocket, never checks the relay
// actually speaks NIP-01, and never reads the current configuration; and it
// never exposes a `clear()` of its own — clearing needs no construction or
// validation of any kind, so a caller reaches
// `NostrRelayConfigurationStore.clear()` directly (see that store's own
// header, "clear() is the one way back"), exactly the same way a caller
// reads the current configuration through `store.get()` directly rather
// than through a symmetric "Get" use case this milestone's own brief
// deliberately declines to add — the identical restraint
// SetArweaveGatewayConfigurationUseCase.js's own header already holds.
//
// AN INVALID URL NEVER MUTATES THE STORE. `new NostrRelayConfiguration(...)`
// throws before `save()` is ever called, so a rejected input leaves
// whatever was previously on file completely untouched — construct first,
// save second, so a throw never reaches the store.
export class SetNostrRelayConfigurationUseCase {
    // `nostrRelayConfigurationStore` — a NostrRelayConfigurationStore
    // (0.9.369); consulted via `save(configuration)` only, injected exactly
    // like every other composition-time dependency in this codebase, never
    // constructed here.
    constructor({ nostrRelayConfigurationStore } = {}) {
        if (!(nostrRelayConfigurationStore instanceof NostrRelayConfigurationStore)) {
            throw new Error('SetNostrRelayConfigurationUseCase requires a NostrRelayConfigurationStore');
        }
        this._store = nostrRelayConfigurationStore;
    }

    // Saves `relayUrl` as the user's own Nostr relay override, replacing
    // whatever was previously on file outright (see
    // NostrRelayConfigurationStore.js's own "a single configuration, never
    // a history, and never a relay list" header for why that replacement is
    // a structural property of the store itself). Returns the new,
    // persisted NostrRelayConfiguration.
    //
    // Throws for anything core/NostrRelayConfiguration.js's own constructor
    // rejects (not a ws:/wss: URL, empty, ...) — before this method ever
    // calls `save()`.
    execute({ relayUrl } = {}) {
        const configuration = new NostrRelayConfiguration({ relayUrl });
        this._store.save(configuration);
        return configuration;
    }
}
