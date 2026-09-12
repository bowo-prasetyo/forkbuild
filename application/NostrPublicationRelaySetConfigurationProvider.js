import { DEFAULT_NOSTR_PUBLICATION_RELAY_URL } from '../core/NostrPublicationRelaySetConfiguration.js';
import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';

// 0.9.447 — Nostr Publication Relay Set Configuration Provider.
//
// core/NostrPublicationRelaySetConfiguration.js gives a Wanderer's own
// relay set a validated shape; storage/NostrPublicationRelaySetConfigurationStore.js
// gives it a durable home. Neither ever resolves an EFFECTIVE relay list —
// both deliberately return `null`/throw for "nothing configured" rather
// than inventing a fallback (see each file's own header, "absence stays
// meaningful"). This file is the one seam that turns "whatever is on file,
// or nothing" into the plain `relayUrls` array
// `application/NostrMultiRelayPublicationDistributionOrchestrator.js`'s own
// `nostrRelayUrls` parameter already accepts — the "configuration provider"
// box between Settings and the multi-relay distribution command:
//
//   NostrPublicationRelaySetConfigurationStore.get()   -> configuration | null
//                    │
//                    ▼
//   application/NostrPublicationRelaySetConfigurationProvider.js   ★ (THIS)
//        resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore })
//                    │
//                    ▼
//   a non-empty array of relay URL strings
//                    │
//                    ▼
//   application/PublicationDistributionCommandComposition.js's own
//        composeMultiRelayNostrPublicationDistributionCommand()   (this same
//        milestone) pre-binds this array as `nostrRelayUrls`
//                    │
//                    ▼
//   application/NostrMultiRelayPublicationDistributionOrchestrator.js
//        (0.9.444, unmodified)
//
// THE FALLBACK COMES FROM THE WRITE-SIDE DEFAULT, NEVER FROM DISCOVERY
// CONFIGURATION — THE ONE RULE THIS FILE EXISTS TO HOLD. 0.9.446's own
// Section A3 proved, by real execution, that neither today's existing
// single-relay write path nor 0.9.444's own fan-out ever reads
// `resolvedNostrRelayUrl`/`NostrRelayConfigurationStore` — the WRITE path's
// own existing default is `NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL`,
// a value this file never imports, mirroring instead the identical "each
// configuration boundary owns its own copy of the default, never a
// sibling's" restraint `core/NostrPublicationRelaySetConfiguration.js`'s own
// header already holds for `DEFAULT_NOSTR_PUBLICATION_RELAY_URL`. This
// function never imports, reads, or otherwise consults
// `core/NostrRelayConfiguration.js`, `storage/NostrRelayConfigurationStore.js`,
// or any variable named `resolvedNostrRelayUrl` — doing so would silently
// re-couple the read and write paths 0.9.446's own audit proved, and this
// milestone's own brief requires staying, separate.
//
// "NO OVERRIDE" BECOMES A ONE-ELEMENT ARRAY, NEVER A ZERO-ELEMENT ONE. An
// empty array is never a valid `nostrRelayUrls` value —
// `NostrMultiRelayPublicationDiscoveryPublisher`'s own constructor already
// throws for one (0.9.446's own Section C) — so "nothing configured"
// resolves to exactly `[DEFAULT_NOSTR_PUBLICATION_RELAY_URL]`, the same
// "existing single relay -> one-element relay set" backward-compatibility
// equivalence 0.9.446's own Section D already proved byte-identical to the
// pre-existing single-relay command, for that one relay.
//
// A PLAIN, SYNCHRONOUS, SIDE-EFFECT-FREE FUNCTION OF ITS OWN ARGUMENT —
// NEVER A CLASS, NEVER A SINGLETON, NEVER A CACHE. Calling this function
// twice in a row, with no write in between, resolves the identical array
// both times; a caller wanting the freshest on-file value calls this
// function again, fresh, exactly as `ui/main.js`'s own
// `resolvedArweaveGatewayUrls`/`resolvedNostrRelayUrl` are each resolved
// once, at composition time, from their own stores.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any relay-URL validation of its own.** Every entry already on file
//   was validated at `NostrPublicationRelaySetConfiguration` construction
//   time (either originally, by `SetNostrPublicationRelaySetConfigurationUseCase`,
//   or on read-back, by the store's own `get()`); this function reads
//   `configuration.relayUrls` verbatim, unread a second time.
// - **A UI of any kind.**
// - **Combining this relay set with any other substrate's configuration**
//   (Arweave gateway, STUN, rendezvous). This file resolves exactly one
//   thing: the Nostr publication-distribution relay array.
export function resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore } = {}) {
    if (!(nostrPublicationRelaySetConfigurationStore instanceof NostrPublicationRelaySetConfigurationStore)) {
        throw new Error('resolveNostrPublicationRelayUrls requires a NostrPublicationRelaySetConfigurationStore');
    }
    const configuration = nostrPublicationRelaySetConfigurationStore.get();
    return configuration ? configuration.relayUrls : [DEFAULT_NOSTR_PUBLICATION_RELAY_URL];
}
