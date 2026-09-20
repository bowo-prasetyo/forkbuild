const DEFAULT_NOSTR_RELAY_URL = 'wss://relay.damus.io';

// 0.9.369 — Nostr Relay Configuration Boundary.
//
// docs/Roadmap.md's own 0.9.368 audit named the exact gap this closes: all
// three read-path Nostr discovery classes in this codebase
// (application/NostrDiscoveryQueryService.js, application/
// NostrSnapshotDiscoveryQueryService.js, application/
// NostrPlaceNamingDiscoverySource.js) already accept their own `relayUrl`
// through ordinary constructor injection, but `ui/main.js` never supplied
// one — every Wanderer silently inherited `wss://relay.damus.io`, with no
// way back if that relay ever became unreachable. This file is the direct
// structural mirror of `core/ArweaveGatewayConfiguration.js` (0.9.364),
// applied to a relay URL instead of a gateway URL:
//
//   a user's own relay URL (a plain string, from a future settings
//   surface — this file builds none)
//        │
//        ▼
//   core/NostrRelayConfiguration.js   ★ (THIS)
//        new NostrRelayConfiguration({ relayUrl })
//        │  — throws for anything that isn't a valid absolute ws:/wss: URL
//        ▼
//   { relayUrl }   (immutable, frozen)
//        │
//        ▼
//   (0.9.369, same milestone) storage/NostrRelayConfigurationStore.js
//        — durable persistence, deliberately a SEPARATE file; see that
//        file's own header
//        │
//        ▼
//   (unscheduled) a settings UI constructs one of these from user input
//   (0.9.369, same milestone) ui/main.js's own three read-path composition
//        sites (World Encounter decentralized discovery, Snapshot
//        discovery, Place Naming discovery) each receive the resolved
//        `relayUrl`, exactly the constructor argument each already accepts
//        today
//
// A SEPARATE OBJECT, NEVER A SHARED SHAPE WITH `ArweaveGatewayConfiguration`.
// The two classes happen to look structurally identical — one string field,
// one validated scheme family — but sharing an implementation because two
// shapes coincide would conflate two genuinely independent endpoint
// configurations with their own storage keys, their own defaults, and their
// own set of consumers. Two small, unconnected files stay easier to reason
// about than one shared "endpoint configuration" abstraction serving two
// unrelated substrates for reasons of coincidence alone — see this file's
// own "Deliberately excluded," below, for the abstraction this milestone
// refuses to build.
//
// A VALUE OBJECT, NEVER A DEFAULT-INJECTING ONE. This class validates
// exactly the `relayUrl` it is given — it never substitutes
// `DEFAULT_NOSTR_RELAY_URL` for a missing one. "The user configured
// nothing" is a fact a CALLER (storage/NostrRelayConfigurationStore.js's
// own `get()`, or a future composition root) represents by having no
// `NostrRelayConfiguration` instance at all — never by this class quietly
// constructing one that happens to hold the default. See this file's own
// exported `DEFAULT_NOSTR_RELAY_URL`, below, for the one place that default
// actually lives: a plain constant a caller consults only when no
// configuration exists, never a value this class invents on a caller's
// behalf.
//
// VALIDATION IS DELIBERATELY MODEST — SHAPE ONLY, NEVER REACHABILITY.
// `isValidNostrRelayUrl()` checks exactly one thing: is this a non-empty
// string that parses as an absolute `ws:`/`wss:` URL. It never opens a
// WebSocket, never checks that the URL actually speaks NIP-01, and never
// rejects a syntactically valid URL for being "probably wrong" — a
// configured-but-currently-unreachable relay is a discovery-time failure
// for the EXISTING three read-path classes' own failure semantics to
// report, never something this file tries to predict up front.
//
// NO TRAILING-SLASH NORMALIZATION. Unlike `core/ArweaveGatewayConfiguration.js`
// (which mirrors `content/ArweaveContentStore.js`'s own
// `gatewayUrl.replace(/\/+$/, '')` because that store appends a path
// segment onto its gatewayUrl), none of the three Nostr read-path classes
// ever concatenate anything onto `relayUrl` — each hands it, unmodified,
// straight to its own `queryImpl(relayUrl, filter)`. Normalizing a trailing
// slash here would be speculative surface with no real consumer behavior to
// justify it, exactly this milestone's own brief: "trailing-slash
// normalization only if actually required by the consumers." Only
// surrounding whitespace — never meaningful to a URL — is trimmed.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Persistence of any kind.** No `localStorage`, no `StorageProvider`
//   import, no `save()`/`load()`. See storage/NostrRelayConfigurationStore.js,
//   this same milestone, sibling file.
// - **A network call of any kind, ever, for any reason.** See "validation
//   is deliberately modest," above.
// - **`timeout`/`healthCheck`/`priority` fields, or any field beyond
//   `relayUrl`/`relayUrls`.** None of these are evidenced as needed for
//   this configuration boundary — adding them here would be speculative
//   surface, not a real requirement.
// - **A settings UI, or any `ui/` import.** See ui/views/
//   NostrRelaySettingsView.js for the reachable surface over this shape.
// - **Publishing.** This configuration affects read/discovery only — see
//   storage/NostrRelayConfigurationStore.js's own header, "read-path only,"
//   and `ui/main.js`'s own 0.9.369 wiring for the enforced boundary. The
//   three Nostr WRITE-path publishers (`NostrPublicationDiscoveryPublisher`,
//   `NostrSnapshotDiscoveryPublisher`, `NostrPlaceNamingDiscoveryPublisher`)
//   never import this file.
// - **A generic `InfrastructureEndpointConfiguration` abstraction, or any
//   sharing with `core/ArweaveGatewayConfiguration.js`.** See "a separate
//   object," above — this file names itself `NostrRelayConfiguration` on
//   purpose.
//
// RELAY MULTIPLICITY — FAN-OUT, NEVER ORDERED FAILOVER. Unlike
// `core/ArweaveGatewayConfiguration.js`'s own `gatewayUrls` (ordered read
// FAILOVER — a second gateway serves byte-identical content, so trying the
// next one only after the first fails captures the whole benefit at no
// cost), Nostr relays are independent, non-interchangeable stores: a relay
// that is never contacted because an earlier one already succeeded is a
// real, permanently lost discovery surface for anyone who only ever queries
// that relay. So `relayUrls` here means every configured relay is queried
// or published to, every time, independently of the others' own outcomes.
// `relayUrls` is still accepted as an ORDERED array — order is preserved
// for stable, predictable rendering only, and carries no priority/
// preference meaning of any kind.
//
// UNIFIED — THIS IS NOW THE ONE NOSTR RELAY SET FOR THE WHOLE APPLICATION,
// PUBLICATIONS INCLUDED. A separate, earlier configuration boundary —
// `core/NostrPublicationRelaySetConfiguration.js` — used to hold an
// independent relay SET for Publication distribution/discovery only, kept
// deliberately apart from this file across several past milestones on the
// reasoning that Publications (meant for broad discovery by strangers) and
// Snapshot/Place-Naming discovery (a narrower, personal-utility need)
// might reasonably want different relays. In practice, no product need for
// that divergence ever materialized — every Wanderer who configured one
// wanted the other to match, and maintaining two nearly-identical
// textareas was pure friction for zero real flexibility. That file, its
// storage store, its use case, its resolution provider, and its own
// settings page have all been REMOVED; every consumer that used to read
// `resolvedNostrPublicationRelayUrls` (Publication distribution via
// `application/NostrMultiRelayPublicationDiscoveryPublisher.js`,
// Publication discovery via `application/
// NostrPublicationRelaySetDiscoveryQueryService.js`) now reads THIS file's
// own `relayUrls` instead — the identical array Snapshot discovery,
// Snapshot announcement, and Place Naming discovery already use. Nostr
// Publication Commentary (`application/
// NostrMultiRelayPublicationCommentaryDistribution.js`) was extended to
// the same fan-out set at the same time, closing the one asynchronous
// Nostr substrate that had never gained relay multiplicity at all. There
// is now exactly one Nostr relay list in this codebase, one Settings page,
// and one fan-out policy — reachability, broad discoverability, and
// resilience all draw from the same configured set, everywhere Nostr is
// used.
//
// A WANDERER WHO GENUINELY WANTS TO SPLIT THEM AGAIN HAS NO SEAM TO DO SO
// TODAY. Reintroducing per-feature relay divergence (e.g., "announce
// Publications more broadly than I query for Snapshots") would be a new,
// deliberate product decision — building a second configuration boundary
// back is a well-understood, mechanical reversal (this file's own git
// history holds the original `NostrPublicationRelaySetConfiguration.js`),
// never something to smuggle back in as an incidental side effect of an
// unrelated change.
//
//   { relayUrl: 'wss://a.example' }            (still valid, unchanged)
//        │                                      == one-element list
//        ▼
//   { relayUrls: ['wss://a.example', 'wss://b.example'] }   (new)
//        │
//        ▼
//   core/NostrRelayConfiguration.js   ★ (THIS)
//        .relayUrl    — the FIRST configured relay, unchanged shape, for
//                        every caller that only ever wanted a single value
//        .relayUrls   — the FULL configured set, new, for a caller building
//                        a fan-out read/write collaborator
export function isValidNostrRelayUrl(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        return false;
    }
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
}

export class NostrRelayConfiguration {
    // Exactly one of `relayUrl` (a single string — unchanged since 0.9.369)
    // or `relayUrls` (a non-empty array, fan-out targets — new) is
    // accepted; passing both throws, exactly like passing neither already
    // did. `relayUrl: ['a', 'b']` still throws — an array is never valid
    // under the singular key, only under `relayUrls`.
    constructor({ relayUrl, relayUrls } = {}) {
        if (relayUrl !== undefined && relayUrls !== undefined) {
            throw new Error('NostrRelayConfiguration: pass exactly one of relayUrl or relayUrls, never both');
        }
        const candidates = relayUrls !== undefined ? relayUrls : [relayUrl];
        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error('NostrRelayConfiguration: relayUrls must be a non-empty array');
        }
        this._relayUrls = Object.freeze(candidates.map((url) => {
            if (!isValidNostrRelayUrl(url)) {
                throw new Error(`NostrRelayConfiguration: invalid relayUrl "${url}"`);
            }
            return url.trim();
        }));
        Object.freeze(this);
    }

    // The first configured relay — unchanged shape/meaning for every
    // caller that only ever wanted a single value; see this file's own
    // header.
    get relayUrl() { return this._relayUrls[0]; }

    // The full configured set, one entry per configured relay — always at
    // least one entry, even when this instance was constructed from the
    // singular `relayUrl` shape.
    get relayUrls() { return this._relayUrls; }

    // Value equality, never identity — the same convention this codebase's
    // other small value objects already hold (e.g. core/
    // ArweaveGatewayConfiguration.js's own equals()). Order is preserved
    // for stable rendering only — see this file's own header, "fan-out,
    // never ordered failover" — but two configurations naming the same
    // relays in a different order are still NOT equal, mirroring
    // `core/ArweaveGatewayConfiguration.js`'s own `equals()` exactly.
    equals(other) {
        return other instanceof NostrRelayConfiguration &&
            other._relayUrls.length === this._relayUrls.length &&
            other._relayUrls.every((url, index) => url === this._relayUrls[index]);
    }

    // Plain-data convenience for storage/NostrRelayConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own. Always the list shape, even for a
    // single-relay configuration — storage/NostrRelayConfigurationStore.js's
    // own `get()` reads a legacy single-`relayUrl` payload back into the
    // identical one-element-list configuration this would have produced.
    toJSON() {
        return { relayUrls: [...this._relayUrls] };
    }
}

// The one deployment default every one of the three read-path Nostr
// discovery classes already hardcodes individually (application/
// NostrDiscoveryQueryService.js's own DEFAULT_RELAY_URL, application/
// NostrSnapshotDiscoveryQueryService.js's own DEFAULT_RELAY_URL,
// application/NostrPlaceNamingDiscoverySource.js's own DEFAULT_RELAY_URL) —
// byte-identical here, deliberately never imported from any of the three:
// the same per-file "no cross-import of a sibling's own constant" restraint
// this codebase's other configuration boundaries already hold, applied here
// to a value instead of a size limit. A caller with no persisted
// NostrRelayConfiguration consults THIS constant — never lets a consumer's
// own internal default silently do the job, so "what is the current
// effective default" stays answerable by reading exactly one file.
export { DEFAULT_NOSTR_RELAY_URL };
