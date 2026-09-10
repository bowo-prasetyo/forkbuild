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
// - **`timeout`/`retry`/`fallbackRelay`/`healthCheck`/`priority` fields, a
//   relay LIST, or any field beyond `relayUrl`.** None of these are
//   evidenced by 0.9.368's own audit as needed for a first configuration
//   boundary — adding them here would be speculative surface, not a real
//   requirement. `nostr/NostrRelayQueryClient.js`'s own header already
//   documents "exactly one relay, one subscription, per call — no fan-out,
//   no retry, no ranking" as deliberate; this file holds the identical
//   single-URL replacement semantic.
// - **A settings UI, or any `ui/` import.** Unscheduled, later work.
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
    constructor({ relayUrl } = {}) {
        if (!isValidNostrRelayUrl(relayUrl)) {
            throw new Error(`NostrRelayConfiguration: invalid relayUrl "${relayUrl}"`);
        }
        this._relayUrl = relayUrl.trim();
        Object.freeze(this);
    }

    get relayUrl() { return this._relayUrl; }

    // Value equality, never identity — the same convention this codebase's
    // other small value objects already hold (e.g. core/
    // ArweaveGatewayConfiguration.js's own equals()).
    equals(other) {
        return other instanceof NostrRelayConfiguration && other._relayUrl === this._relayUrl;
    }

    // Plain-data convenience for storage/NostrRelayConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own.
    toJSON() {
        return { relayUrl: this._relayUrl };
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
