import { TurnServerConfiguration } from '../core/TurnServerConfiguration.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';

// 0.9.456 — TURN Server Configuration Write Seam.
//
// core/TurnServerConfiguration.js (0.9.454) gives a user's own TURN relay a
// validated shape; storage/TurnServerConfigurationStore.js (0.9.454) gives
// it a durable home. Neither exposes a WRITE seam a settings view can call
// without constructing a TurnServerConfiguration itself — the same missing
// piece application/SetIceServerConfigurationUseCase.js already closed for
// STUN. This class is that missing seam for TURN, the direct structural
// mirror of that STUN sibling: a settings view hands this class a plain
// `{ urls, username, credential }`, never a constructed value object of its
// own, and this class is the one place that turns it into a real
// `TurnServerConfiguration` and persists it.
//
//   ui/views/TurnServerSettingsView.js  (this same milestone)
//        save({ urls, username, credential })
//                    │
//                    ▼
//   SetTurnServerConfigurationUseCase.execute({ urls, username, credential })   ★ (THIS)
//        new TurnServerConfiguration({ urls, username, credential })   — throws
//             for anything that isn't one or more valid turn:/turns: URLs, or
//             an empty username/credential; nothing is persisted when it throws
//                    │
//                    ▼
//   TurnServerConfigurationStore.save(configuration)   (0.9.454, unmodified)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY, THE IDENTICAL
// SHAPE ITS STUN SIBLING ALREADY HOLDS. `execute()` does two things, in this
// order, and nothing else: (1) constructs a `TurnServerConfiguration` — which
// is itself what validates and normalizes `urls`/`username`/`credential`,
// never re-implemented here — and (2) saves it. It never opens a socket,
// never gathers a real ICE candidate, never health-checks the configured
// relay, and never reads the current configuration; and it never exposes a
// `clear()` of its own — clearing needs no construction or validation of any
// kind, so a caller reaches `TurnServerConfigurationStore.clear()` directly,
// exactly the same restraint `SetIceServerConfigurationUseCase.js`'s own
// header already holds.
//
// AN INVALID CONFIGURATION NEVER MUTATES THE STORE. `new
// TurnServerConfiguration(...)` throws before `save()` is ever called, so a
// rejected input leaves whatever was previously on file completely
// untouched — construct first, save second, so a throw never reaches the
// store.
//
// NEVER LOGS, INSPECTS, OR RE-SHAPES THE CREDENTIAL. This class passes
// `credential` straight through to `TurnServerConfiguration`'s own
// constructor, and never itself reads `.credential` back off the
// constructed instance — see core/TurnServerConfiguration.js's own header,
// "the credential is sensitive configuration," for the one narrow guarantee
// that class holds and this one never weakens.
export class SetTurnServerConfigurationUseCase {
    // `turnServerConfigurationStore` — a TurnServerConfigurationStore
    // (0.9.454); consulted via `save(configuration)` only, injected exactly
    // like every other composition-time dependency in this codebase, never
    // constructed here.
    constructor({ turnServerConfigurationStore } = {}) {
        if (!(turnServerConfigurationStore instanceof TurnServerConfigurationStore)) {
            throw new Error('SetTurnServerConfigurationUseCase requires a TurnServerConfigurationStore');
        }
        this._store = turnServerConfigurationStore;
    }

    // Saves `{ urls, username, credential }` as the user's own TURN server
    // configuration, replacing whatever was previously on file outright
    // (see TurnServerConfigurationStore.js's own "A SINGLE CONFIGURATION,
    // NEVER A HISTORY" header). Returns the new, persisted
    // TurnServerConfiguration.
    //
    // Throws for anything core/TurnServerConfiguration.js's own constructor
    // rejects (an empty/invalid url list, a stun: entry, an empty
    // username/credential, ...) — before this method ever calls `save()`.
    execute({ urls, username, credential } = {}) {
        const configuration = new TurnServerConfiguration({ urls, username, credential });
        this._store.save(configuration);
        return configuration;
    }
}
