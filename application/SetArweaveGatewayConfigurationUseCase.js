import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';

// 0.9.366 — Arweave Gateway Settings UI.
//
// core/ArweaveGatewayConfiguration.js (0.9.364) already named the one thing
// missing between a user's own gateway URL and a durable, validated
// configuration: "a future settings surface — this file builds none." This
// class is that missing WRITE seam: a settings view hands this class a
// plain `{ gatewayUrl }`, never a constructed value object of its own, and
// this class is the one place that turns it into a real
// `ArweaveGatewayConfiguration` and persists it — the identical "settings
// view hands the use case a plain field, the use case alone constructs and
// validates the value object" shape this codebase's other preference-write
// use cases already hold one feature over, applied here to a single
// gateway URL instead of a per-role provider choice.
//
//   ui/views/ArweaveGatewaySettingsView.js  (this same milestone)
//        save({ gatewayUrl })
//                    │
//                    ▼
//   SetArweaveGatewayConfigurationUseCase.execute({ gatewayUrl })   ★ (THIS)
//        new ArweaveGatewayConfiguration({ gatewayUrl })   — throws for
//             anything that isn't a valid absolute http(s) URL; nothing is
//             persisted when it throws
//                    │
//                    ▼
//   ArweaveGatewayConfigurationStore.save(configuration)   (0.9.364, unmodified)
//
// DELIBERATELY THE SMALLEST POSSIBLE APPLICATION CAPABILITY. `execute()`
// does two things, in this order, and nothing else: (1) constructs an
// `ArweaveGatewayConfiguration` — which is itself what validates and
// normalizes `gatewayUrl`, never re-implemented here — and (2) saves it.
// It never resolves, fetches, or health-checks the gateway; never reads the
// current configuration; and never exposes a `clear()` of its own —
// clearing needs no construction or validation of any kind, so a caller
// reaches `ArweaveGatewayConfigurationStore.clear()` directly (see that
// store's own header, "clear() is the one addition"), exactly the same way
// a caller reads the current configuration through `store.get()` directly
// rather than through a symmetric "Get" use case this milestone's own brief
// deliberately declined to add.
//
// AN INVALID URL NEVER MUTATES THE STORE. `new ArweaveGatewayConfiguration(...)`
// throws before `save()` is ever called, so a rejected input leaves
// whatever was previously on file completely untouched — construct first,
// save second, so a throw never reaches the store.
export class SetArweaveGatewayConfigurationUseCase {
    // `arweaveGatewayConfigurationStore` — an ArweaveGatewayConfigurationStore
    // (0.9.364); consulted via `save(configuration)` only, injected exactly
    // like every other composition-time dependency in this codebase, never
    // constructed here.
    constructor({ arweaveGatewayConfigurationStore } = {}) {
        if (!(arweaveGatewayConfigurationStore instanceof ArweaveGatewayConfigurationStore)) {
            throw new Error('SetArweaveGatewayConfigurationUseCase requires an ArweaveGatewayConfigurationStore');
        }
        this._store = arweaveGatewayConfigurationStore;
    }

    // Saves `gatewayUrl` as the user's own Arweave gateway override,
    // replacing whatever was previously on file outright (see
    // ArweaveGatewayConfigurationStore.js's own "A SINGLE CONFIGURATION,
    // NEVER A HISTORY" header for why that replacement is a structural
    // property of the store itself). Returns the new, persisted
    // ArweaveGatewayConfiguration.
    //
    // Throws for anything core/ArweaveGatewayConfiguration.js's own
    // constructor rejects (not an absolute http(s) URL, empty, ...) —
    // before this method ever calls `save()`.
    execute({ gatewayUrl } = {}) {
        const configuration = new ArweaveGatewayConfiguration({ gatewayUrl });
        this._store.save(configuration);
        return configuration;
    }
}
