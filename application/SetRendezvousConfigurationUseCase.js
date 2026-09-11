import { RendezvousConfiguration } from '../core/RendezvousConfiguration.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';

// 0.9.388 — User-Configurable Rendezvous Server Configuration Settings UI.
//
// core/RendezvousConfiguration.js already named the one thing missing
// between a user's own rendezvous server list and a durable, validated
// configuration: a settings surface. This class is that missing WRITE
// seam, the direct structural mirror of `application/
// SetIceServerConfigurationUseCase.js` (0.9.386) — a settings view hands
// this class a plain `{ urls }`, never a constructed value object of its
// own, and this class is the one place that turns it into a real
// `RendezvousConfiguration` and persists it.
//
//   ui/views/RendezvousSettingsView.js  (this same milestone)
//        save({ urls })
//                    │
//                    ▼
//   SetRendezvousConfigurationUseCase.execute({ urls })   ★ (THIS)
//        new RendezvousConfiguration({ urls })   — throws for anything
//             that isn't one or more valid ws:/wss: URLs; nothing is
//             persisted when it throws
//                    │
//                    ▼
//   RendezvousConfigurationStore.save(configuration)   (0.9.388, unmodified)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY. `execute()`
// does two things, in this order, and nothing else: (1) constructs a
// `RendezvousConfiguration` — which is itself what validates and
// normalizes `urls`, never re-implemented here — and (2) saves it. It
// never resolves, issues a LOOKUP against, or health-checks any configured
// server; never reads the current configuration; and never exposes a
// `clear()` of its own — clearing needs no construction or validation of
// any kind, so a caller reaches `RendezvousConfigurationStore.clear()`
// directly, exactly the same way a caller reads the current configuration
// through `store.get()` directly rather than through a symmetric "Get" use
// case.
//
// NO CONNECTION TESTING, NO AUTOMATIC FALLBACK. Saving a configuration
// here never opens a WebSocket, never issues a real PUBLISH/LOOKUP, and
// never falls back to the previous or default configuration if the
// newly-saved servers later turn out unreachable — see docs/Roadmap.md,
// 0.9.386, "explicitly exclude" (the identical restraint held here), and
// core/RendezvousConfiguration.js's own header, "validation is
// deliberately modest."
//
// AN INVALID SERVER LIST NEVER MUTATES THE STORE. `new
// RendezvousConfiguration(...)` throws before `save()` is ever called, so
// a rejected input leaves whatever was previously on file completely
// untouched — construct first, save second, so a throw never reaches the
// store.
export class SetRendezvousConfigurationUseCase {
    // `rendezvousConfigurationStore` — a RendezvousConfigurationStore
    // (0.9.388); consulted via `save(configuration)` only, injected exactly
    // like every other composition-time dependency in this codebase, never
    // constructed here.
    constructor({ rendezvousConfigurationStore } = {}) {
        if (!(rendezvousConfigurationStore instanceof RendezvousConfigurationStore)) {
            throw new Error('SetRendezvousConfigurationUseCase requires a RendezvousConfigurationStore');
        }
        this._store = rendezvousConfigurationStore;
    }

    // Saves `urls` as the user's own rendezvous server configuration,
    // replacing whatever was previously on file outright (see
    // RendezvousConfigurationStore.js's own "A SINGLE CONFIGURATION, NEVER
    // A HISTORY" header for why that replacement is a structural property
    // of the store itself). Returns the new, persisted
    // RendezvousConfiguration.
    //
    // Throws for anything core/RendezvousConfiguration.js's own constructor
    // rejects (empty, not ws:/wss:, ...) — before this method ever calls
    // `save()`.
    execute({ urls } = {}) {
        const configuration = new RendezvousConfiguration({ urls });
        this._store.save(configuration);
        return configuration;
    }
}
