import { IceServerConfiguration } from '../core/IceServerConfiguration.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';

// 0.9.386 — User-Configurable STUN Server Configuration Settings UI.
//
// core/IceServerConfiguration.js already named the one thing missing
// between a user's own STUN server list and a durable, validated
// configuration: a settings surface. This class is that missing WRITE
// seam, the direct structural mirror of `application/
// SetArweaveGatewayConfigurationUseCase.js` / `application/
// SetNostrRelayConfigurationUseCase.js` — a settings view hands this class
// a plain `{ servers }`, never a constructed value object of its own, and
// this class is the one place that turns it into a real
// `IceServerConfiguration` and persists it.
//
//   ui/views/StunSettingsView.js  (this same milestone)
//        save({ servers })
//                    │
//                    ▼
//   SetIceServerConfigurationUseCase.execute({ servers })   ★ (THIS)
//        new IceServerConfiguration({ servers })   — throws for anything
//             that isn't one or more valid stun:/stuns: URLs; nothing is
//             persisted when it throws
//                    │
//                    ▼
//   IceServerConfigurationStore.save(configuration)   (0.9.386, unmodified)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY. `execute()`
// does two things, in this order, and nothing else: (1) constructs an
// `IceServerConfiguration` — which is itself what validates and normalizes
// `servers`, never re-implemented here — and (2) saves it. It never
// resolves, gathers an ICE candidate against, or health-checks any
// configured server; never reads the current configuration; and never
// exposes a `clear()` of its own — clearing needs no construction or
// validation of any kind, so a caller reaches
// `IceServerConfigurationStore.clear()` directly, exactly the same way a
// caller reads the current configuration through `store.get()` directly
// rather than through a symmetric "Get" use case.
//
// NO CONNECTION TESTING, NO AUTOMATIC FALLBACK. Saving a configuration
// here never attempts an RTCPeerConnection, never gathers a real ICE
// candidate, and never falls back to the previous or default configuration
// if the newly-saved servers later turn out unreachable — see
// docs/Roadmap.md, 0.9.386, "explicitly exclude," and core/
// IceServerConfiguration.js's own header, "validation is deliberately
// modest."
//
// AN INVALID SERVER LIST NEVER MUTATES THE STORE. `new
// IceServerConfiguration(...)` throws before `save()` is ever called, so a
// rejected input leaves whatever was previously on file completely
// untouched — construct first, save second, so a throw never reaches the
// store.
export class SetIceServerConfigurationUseCase {
    // `iceServerConfigurationStore` — an IceServerConfigurationStore
    // (0.9.386); consulted via `save(configuration)` only, injected exactly
    // like every other composition-time dependency in this codebase, never
    // constructed here.
    constructor({ iceServerConfigurationStore } = {}) {
        if (!(iceServerConfigurationStore instanceof IceServerConfigurationStore)) {
            throw new Error('SetIceServerConfigurationUseCase requires an IceServerConfigurationStore');
        }
        this._store = iceServerConfigurationStore;
    }

    // Saves `servers` as the user's own STUN server configuration,
    // replacing whatever was previously on file outright (see
    // IceServerConfigurationStore.js's own "A SINGLE CONFIGURATION, NEVER A
    // HISTORY" header for why that replacement is a structural property of
    // the store itself). Returns the new, persisted IceServerConfiguration.
    //
    // Throws for anything core/IceServerConfiguration.js's own constructor
    // rejects (empty, not stun:/stuns:, a turn: entry, ...) — before this
    // method ever calls `save()`.
    execute({ servers } = {}) {
        const configuration = new IceServerConfiguration({ servers });
        this._store.save(configuration);
        return configuration;
    }
}
