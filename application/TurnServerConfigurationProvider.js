import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';

// 0.9.454 — TURN Server Configuration Provider.
//
// core/TurnServerConfiguration.js gives a user's own TURN relay a validated
// shape; storage/TurnServerConfigurationStore.js gives it a durable home.
// Neither ever resolves an EFFECTIVE TURN configuration — the store
// deliberately returns `null` for "nothing configured" rather than
// inventing one (see that file's own header, "absent and no TURN server
// are the same fact, on purpose"). This file is the one seam between
// "whatever is on file, or nothing" and a future WebRTC composition step
// (0.9.455, NOT this milestone) — the "provider" box between a future TURN
// Settings surface and the WebRTC runtime, mirroring the shape
// application/NostrPublicationRelaySetConfigurationProvider.js's own
// `resolveNostrPublicationRelayUrls()` already establishes for a sibling
// configuration family:
//
//   TurnServerConfigurationStore.get()   -> configuration | null
//                    │
//                    ▼
//   application/TurnServerConfigurationProvider.js   ★ (THIS)
//        resolveTurnServerConfiguration({ turnServerConfigurationStore })
//                    │
//                    ▼
//   a TurnServerConfiguration instance | null
//                    │
//                    ▼
//   (0.9.455, not this milestone) WebRTC composition — appends
//        `.toIceServerEntry()` into the merged iceServers array
//        WebRtcPeerConnectionProvider already accepts, when and only when
//        this function returns non-null
//
// NO FABRICATED DEFAULT — THE ONE RULE THIS FILE EXISTS TO HOLD, AND THE
// ONE PLACE THIS PROVIDER DELIBERATELY DIVERGES FROM ITS OWN NOSTR SIBLING.
// `resolveNostrPublicationRelayUrls()` falls back to a write-side default
// relay when nothing is configured, because a Nostr relay set always has
// SOME effective value. A TURN relay does not: there is no deployment-wide
// default TURN relay a user's own configuration could fall back to (see
// storage/TurnServerConfigurationStore.js's own header — `peer/
// IceServerConfig.js`'s Metered-backed fetch is a separate, unrelated seam
// this file never touches, imports, or composes with). "No TURN
// configuration" resolves to exactly `null`, never a manufactured entry —
// a caller composing the effective iceServers array (0.9.455) is the one
// that decides what "no TURN server" means for the connection it is about
// to open; this function never makes that decision itself.
//
// A PLAIN, SYNCHRONOUS, SIDE-EFFECT-FREE FUNCTION OF ITS OWN ARGUMENT —
// NEVER A CLASS, NEVER A SINGLETON, NEVER A CACHE, matching the existing
// configuration-provider pattern this codebase already holds for every
// sibling configuration family. Calling this function twice in a row, with
// no write in between, resolves the identical result both times; a caller
// wanting the freshest on-file value calls this function again, fresh.
// Synchronous because the injected store's own `get()` is synchronous —
// this function performs no I/O of its own beyond that one call.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Health checking, credential refresh, failover, or server ranking.**
//   See core/TurnServerConfiguration.js's own header, "one shared
//   credential pair" — this provider resolves exactly one configuration or
//   none, never chooses among several.
// - **Automatic discovery of any kind.**
// - **Composing this configuration into WebRtcPeerConnectionProvider's own
//   iceServers array, or touching `peer/` in any way.** Deferred to 0.9.455
//   — this file never imports from `peer/`.
// - **A UI of any kind.**
// - **Combining this configuration with STUN, Rendezvous, or any other
//   substrate's configuration.** This file resolves exactly one thing: the
//   effective TURN configuration, or its explicit absence.
export function resolveTurnServerConfiguration({ turnServerConfigurationStore } = {}) {
    if (!(turnServerConfigurationStore instanceof TurnServerConfigurationStore)) {
        throw new Error('resolveTurnServerConfiguration requires a TurnServerConfigurationStore');
    }
    return turnServerConfigurationStore.get();
}
