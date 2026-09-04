import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryQueryService } from './NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from './DecentralizedSnapshotResolver.js';

// 0.9.142 — World View Snapshot Discovery Command.
//
// application/DiscoverSnapshotCommand.js takes an already-constructed
// `resolver` (and, optionally, an already-constructed `contentStore`) and
// is, in its own words, composable, not composed — nothing in this
// codebase turns a host's own Nostr query/Arweave capability into that
// pair. application/SnapshotDistributionRuntimeComposition.js (0.9.137)
// already closed the identical gap for Snapshot DISTRIBUTION; this file
// is that same seam, built for Snapshot DISCOVERY instead, and nothing
// more.
//
//   nostrSnapshotDiscoveryQueryServiceOptions{ queryImpl, relayUrl, ... }
//   arweaveContentStoreOptions{ signer, gatewayUrl, fetchImpl, ... }
//        │
//        ▼
//   application/DiscoverSnapshotRuntimeComposition.js   ★ (THIS)
//        composeDiscoverSnapshotRuntime({
//            arweaveContentStoreOptions,
//            nostrSnapshotDiscoveryQueryServiceOptions
//        })
//        │
//        ├──► new NostrSnapshotDiscoveryQueryService(                  (application/
//        │        nostrSnapshotDiscoveryQueryServiceOptions)            NostrSnapshotDiscoveryQueryService.js,
//        │        — only when `queryImpl` is usable; `null` otherwise    0.9.133, unmodified)
//        │        │
//        │        ▼
//        │    new DecentralizedSnapshotResolver(queryService)          (application/
//        │        — only when a queryService was built; `null`          DecentralizedSnapshotResolver.js,
//        │        otherwise                                             0.9.134, unmodified)
//        │
//        └──► new ArweaveContentStore(arweaveContentStoreOptions)      (content/ArweaveContentStore.js,
//                 — only when `signer` is usable; `null` otherwise       0.9.132, unmodified)
//        │
//        ▼
//   { resolver, contentStore }
//        │
//        │   a caller's own call — never this file's own:
//        ▼
//   executeDiscoverSnapshotCommand({ discoveryTag, contentHash, resolver, contentStore })   (application/
//                                                                                             DiscoverSnapshotCommand.js,
//                                                                                             0.9.142, unmodified — and
//                                                                                             NOT imported or called by
//                                                                                             this file; see "composition,
//                                                                                             never orchestration," below)
//
// COMPOSITION, NEVER A THIRD COLLABORATOR AND NEVER A NEW ORCHESTRATION
// ENTRY POINT. This file contains no Nostr filter construction, no
// Arweave gateway I/O of its own, and no resolve()/verification
// sequencing of any kind — it does not even import application/
// DiscoverSnapshotCommand.js. Its only job is object construction: decide,
// per capability, whether there is enough here to even ATTEMPT it, build
// the collaborator(s) that decision allows, and hand them back together.
// Every behavior a caller ever observes through a returned collaborator is
// entirely application/NostrSnapshotDiscoveryQueryService.js's,
// application/DecentralizedSnapshotResolver.js's, or content/
// ArweaveContentStore.js's own, unmodified.
//
// GRACEFUL DEGRADATION, NEVER A THROW, FOR AN ABSENT CAPABILITY — THE
// SAME "undefined/null, never a throw" RESTRAINT application/
// SnapshotDistributionRuntimeComposition.js'S OWN HEADER ALREADY HOLDS,
// HELD HERE UNCHANGED. `NostrSnapshotDiscoveryQueryService`'s own
// constructor already throws synchronously when handed no usable
// `queryImpl` — the honest behavior for a CALLER who explicitly chose to
// construct one anyway. But a composition root, called unconditionally
// at application/test startup regardless of which host capabilities
// happen to be present today, is a different caller with a different
// obligation: it must never let "no Nostr relay-query capability is
// available" — an ordinary, expected, first-class outcome, exactly the
// one `ui/main.js` itself already documents for `nostrQueryImpl`
// ("NO HOST NOSTR RELAY-QUERY CAPABILITY EXISTS ANYWHERE IN THIS CODEBASE
// YET") — crash construction of everything else. So this file checks, PER
// CAPABILITY, whether its own options object carries a usable capability
// BEFORE ever calling a constructor, and produces `null` instead of
// constructing anything when it does not.
//
// `resolver` DEPENDS ONLY ON A USABLE `queryImpl` — NEVER ON `contentStore`
// ALSO BEING USABLE. `DecentralizedSnapshotResolver`'s own constructor
// requires only a query service (`application/
// DecentralizedSnapshotResolver.js`'s own header: "queryService... an
// application/NostrSnapshotDiscoveryQueryService.js instance... required,
// never defaulted"); `contentStore` is a per-call option its own
// `resolve()` accepts, not a constructor dependency. So a host with a
// working Nostr query capability but no Arweave signer still gets a real,
// usable `resolver` — every `resolve()` call through it genuinely
// completes the DISCOVERY layer, and honestly reports the pre-existing
// `STORE_UNAVAILABLE` outcome for the LOCATION layer, exactly the
// structural distinction application/DecentralizedSnapshotResolver.js's
// own header already names ("Never a verdict about the candidate itself;
// a caller with the right store available can resolve the identical
// candidate successfully"). Collapsing the two capabilities into one
// combined precondition would silently discard that honest, already-built
// distinction.
//
// ASYMMETRIC AVAILABILITY IS NEVER COLLAPSED INTO ONE MISLEADING FLAG —
// THE SAME RESTRAINT application/SnapshotDistributionRuntimeComposition.js'S
// OWN HEADER ALREADY HOLDS. `resolver`/`contentStore` stay two
// independently truthful facts; this file invents no `available`/
// `discoveryAvailable`-style summary boolean over them.
//
// A GENUINELY MALFORMED — NOT MERELY ABSENT — CAPABILITY STILL THROWS,
// UNCHANGED. `canAttemptNostrQuery()` only ever asks "is there a
// queryImpl here at all;" it never re-validates `relayUrl`, `tagName`, or
// anything else `NostrSnapshotDiscoveryQueryService`'s own constructor
// already validates on its own. The identical restraint holds for
// `canAttemptArweaveRetrieval()` and `ArweaveContentStore`'s own
// constructor.
//
// COLLABORATORS ARE HANDED VERBATIM OPTIONS BAGS, NEVER A RAW HOST
// CAPABILITY OR `window` — THE SAME LAYERING application/
// SnapshotDistributionRuntimeComposition.js'S OWN HEADER ALREADY HOLDS.
// Neither `queryImpl` nor `signer` is ever produced by this file — a
// caller already resolved each from whatever host capability it found.
//
// NO BROWSER API OF ANY KIND, NO I/O OF ANY KIND — CONSTRUCTION ONLY.
// The identical restraint application/
// SnapshotDistributionRuntimeComposition.js's own header already holds,
// held here unchanged: this file never touches `window`, `fetch`, or
// `WebSocket`, and calling `composeDiscoverSnapshotRuntime()` never
// contacts a Nostr relay or an Arweave gateway.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT SET — NO MODULE-LEVEL STATE, NO
// SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED RUNTIME.
//
// NO COUPLING TO PUBLICATION DISCOVERY OR SIGNED CLAIM DISTRIBUTION. This
// file never imports `application/DecentralizedWorldDiscoveryQuery.js`,
// `application/ArweaveGraphqlDiscoveryQueryService.js`,
// `application/NostrDiscoveryQueryService.js`,
// `application/PublicationDistribution*.js`, or
// `application/NostrSnapshotDiscoveryPublisher.js` — composing the
// Snapshot DISCOVERY family's own runtime is never itself a Publication
// discovery or Snapshot DISTRIBUTION composition, the same boundary every
// sibling in this family already holds for itself.
//
// NO UI OF ANY KIND, AND NO NEW ORCHESTRATION ENTRY POINT. This file has
// no idea `ui/` exists, and it never calls
// `executeDiscoverSnapshotCommand()` itself.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reading `window.nostr`/a live relay connection, or building a real
//   NIP-01 `queryImpl`.** See "graceful degradation," above — a caller
//   supplies an already-resolved `queryImpl`. No genuine Nostr
//   relay-query capability exists anywhere in this codebase yet (the
//   identical, already-documented gap `ui/main.js`'s own 0.9.110 comment
//   names for `nostrQueryImpl`) — wiring this composition into `ui/main.js`
//   therefore gracefully resolves `resolver: null` today, exactly as
//   0.9.110's own composition already gracefully resolves `nostr: null`
//   for Publication discovery.
// - **A `SnapshotPlacementStoreRegistry` wiring of any kind.** A caller
//   who wants to resolve against a registry rather than a single explicit
//   `contentStore` supplies its own `storeRegistry` directly to
//   `executeDiscoverSnapshotCommand()` — see that file's own header, "no
//   Nostr class, no content store, and no registry is ever constructed
//   here." This file only ever builds one, single, explicit
//   `contentStore` (Arweave), never a registry.
// - **A `[E] Discover Snapshot` UI action, or any World View control.**
//   A separate, later, unscheduled step.
// - **Calling `executeDiscoverSnapshotCommand()` itself, or any other new
//   orchestration entry point.**
// - **Retries, caching, or fallback between multiple relays/gateways.**
//   Exactly one `queryService` and one `contentStore` per call.
// - **Validating options beyond the one presence check each resolver
//   helper performs.**

// canAttemptNostrQuery({ queryImpl }) -> boolean. Asks exactly the one
// question `application/NostrSnapshotDiscoveryQueryService.js`'s own
// constructor already asks of `queryImpl` — see this file's own header,
// "graceful degradation."
function canAttemptNostrQuery({ queryImpl } = {}) {
    return typeof queryImpl === 'function';
}

// canAttemptArweaveRetrieval({ signer }) -> boolean. Asks exactly the one
// question `content/ArweaveContentStore.js`'s own constructor already
// asks of `signer` — see this file's own header, "graceful degradation."
function canAttemptArweaveRetrieval({ signer } = {}) {
    return Boolean(signer) && typeof signer.sign === 'function';
}

// composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions,
//   nostrSnapshotDiscoveryQueryServiceOptions }) -> { resolver,
//   contentStore }. See this file's own header for the full contract:
//   each field is either a real, working collaborator or `null` — never a
//   throw for an absent capability, never a fabricated stand-in, and
//   never a summary boolean over the two. A genuinely malformed PRESENT
//   capability still throws, exactly as calling the underlying
//   constructor directly already would.
export function composeDiscoverSnapshotRuntime({
    arweaveContentStoreOptions = {},
    nostrSnapshotDiscoveryQueryServiceOptions = {}
} = {}) {
    const contentStore = canAttemptArweaveRetrieval(arweaveContentStoreOptions)
        ? new ArweaveContentStore(arweaveContentStoreOptions)
        : null;

    const queryService = canAttemptNostrQuery(nostrSnapshotDiscoveryQueryServiceOptions)
        ? new NostrSnapshotDiscoveryQueryService(nostrSnapshotDiscoveryQueryServiceOptions)
        : null;

    const resolver = queryService ? new DecentralizedSnapshotResolver(queryService) : null;

    return Object.freeze({ resolver, contentStore });
}
