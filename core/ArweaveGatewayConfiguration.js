const DEFAULT_ARWEAVE_GATEWAY_URL = 'https://arweave.net';

// 0.9.364 — User-Configurable Arweave Gateway Configuration Boundary.
//
// 0.9.363's own audit named the exact gap this closes: every Arweave-facing
// retrieval adapter in this codebase already accepts its own `gatewayUrl`
// through ordinary constructor injection (content/ArweaveContentStore.js,
// application/ArweaveWorldEncounterMaterialResolver.js — mechanical,
// code-level configurability, Section C), but nothing gave a USER's own
// choice of gateway a durable, validated shape to travel in from a settings
// surface down to those constructors. This file is that shape, and nothing
// more — the read-path counterpart to `application/
// PublicationDistributionRuntimeConfiguration.js`'s own `{ gatewayUrl }`
// shape on the distribution WRITE path, exactly as 0.9.363's own "What
// comes after" named.
//
//   a user's own gateway URL (a plain string, from a future settings
//   surface — this file builds none)
//        │
//        ▼
//   core/ArweaveGatewayConfiguration.js   ★ (THIS)
//        new ArweaveGatewayConfiguration({ gatewayUrl })
//        │  — throws for anything that isn't a valid absolute http(s) URL
//        ▼
//   { gatewayUrl }   (immutable, frozen, trailing-slash-normalized)
//        │
//        ▼
//   (0.9.364, same milestone) storage/ArweaveGatewayConfigurationStore.js
//        — durable persistence, deliberately a SEPARATE file; see that
//        file's own header
//        │
//        ▼
//   (unscheduled) a settings UI constructs one of these from user input
//   (unscheduled) ui/main.js's own retrieval composition passes its
//        `gatewayUrl` into `new ArweaveContentStore(...)` /
//        `new ArweaveWorldEncounterMaterialResolver(...)`, exactly the
//        constructor argument each already accepts today
//
// A SEPARATE OBJECT, NEVER A REUSE OF `PublicationDistributionRuntimeConfiguration`.
// That file's own `gatewayUrl` field (inside `arweaveUploaderOptions`,
// resolved from `resolveArweaveUploaderOptions()`) configures the
// DISTRIBUTION WRITE path — `application/ArweavePublicationMaterialUploader.js`
// posting a Signed Claim's own material to a gateway a HOST capability
// chose. This file configures the RETRIEVAL READ path — a USER's own
// choice of which gateway serves already-published content back. Sharing
// one field name across two files that happen to both wrap Arweave gateway
// URLs would conflate two genuinely different configuration lifetimes: one
// resolved once per distribution attempt from host signing capability, the
// other a durable, user-editable preference with its own persistence and
// its own "absent means use the deployment default" semantics (see
// storage/ArweaveGatewayConfigurationStore.js's own header). Two small,
// unconnected files stay easier to reason about than one field serving two
// unrelated callers for reasons of coincidence alone.
//
// A VALUE OBJECT, NEVER A DEFAULT-INJECTING ONE. This class validates and
// normalizes exactly the `gatewayUrl` it is given — it never substitutes
// `DEFAULT_ARWEAVE_GATEWAY_URL` for a missing one. "The user configured
// nothing" is a fact a CALLER (storage/ArweaveGatewayConfigurationStore.js's
// own `get()`, or a future composition root) represents by having no
// `ArweaveGatewayConfiguration` instance at all — never by this class
// quietly constructing one that happens to hold the default. See this
// file's own exported `DEFAULT_ARWEAVE_GATEWAY_URL`, below, for the one
// place that default actually lives: a plain constant a caller consults
// only when no configuration exists, never a value this class invents on
// a caller's behalf. That is the one rule this milestone's own brief calls
// out by name: "the settings value should not become the new authority for
// the default."
//
// VALIDATION IS DELIBERATELY MODEST — SHAPE ONLY, NEVER REACHABILITY.
// `isValidArweaveGatewayUrl()` checks exactly one thing: is this a
// non-empty string that parses as an absolute `http:`/`https:` URL. It
// never makes a network call, never checks that the URL actually serves
// Arweave content, and never rejects a syntactically valid URL for being
// "probably wrong" — a configured-but-currently-unreachable gateway is a
// retrieval-time failure for the EXISTING content/ArweaveContentStore.js /
// application/ArweaveWorldEncounterMaterialResolver.js failure semantics
// to report, never something this file tries to predict up front.
//
// TRAILING SLASHES ARE NORMALIZED AWAY, mirroring content/
// ArweaveContentStore.js's own constructor (`gatewayUrl.replace(/\/+$/, '')`)
// exactly, so a configuration built here composes a path the identical way
// that store already does — `https://my-gateway.example/` and
// `https://my-gateway.example` produce the same stored `gatewayUrl`.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Persistence of any kind.** No `localStorage`, no `StorageProvider`
//   import, no `save()`/`load()`. See storage/
//   ArweaveGatewayConfigurationStore.js, this same milestone, sibling file.
// - **A network call of any kind, ever, for any reason.** See "validation
//   is deliberately modest," above.
// - **`timeout`/`retry`/`fallbackGateway`/`healthCheck`/`priority` fields,
//   or any field beyond `gatewayUrl`.** None of these are evidenced by
//   0.9.363's own audit as needed for a first configuration boundary —
//   adding them here would be speculative surface, not a real requirement.
// - **A settings UI, or any `ui/` import.** Unscheduled, later work.
// - **IPFS, or any other substrate's gateway.** 0.9.363's own audit named
//   IPFS Gateway as the SECOND candidate, deliberately separate — see
//   `docs/Roadmap.md`, 0.9.363, "then IPFS" — this file names itself
//   `ArweaveGatewayConfiguration`, never a generic
//   `InfrastructureEndpointConfiguration`, on purpose.
export function isValidArweaveGatewayUrl(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        return false;
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export class ArweaveGatewayConfiguration {
    constructor({ gatewayUrl } = {}) {
        if (!isValidArweaveGatewayUrl(gatewayUrl)) {
            throw new Error(`ArweaveGatewayConfiguration: invalid gatewayUrl "${gatewayUrl}"`);
        }
        this._gatewayUrl = gatewayUrl.trim().replace(/\/+$/, '');
        Object.freeze(this);
    }

    get gatewayUrl() { return this._gatewayUrl; }

    // Value equality, never identity — the same convention this
    // codebase's other small value objects already hold (e.g. content/
    // ContentReference.js's own verify()).
    equals(other) {
        return other instanceof ArweaveGatewayConfiguration && other._gatewayUrl === this._gatewayUrl;
    }

    // Plain-data convenience for storage/ArweaveGatewayConfigurationStore.js
    // — this class itself never calls it, and never reads or writes any
    // storage key on its own.
    toJSON() {
        return { gatewayUrl: this._gatewayUrl };
    }
}

// The one deployment default this codebase's Arweave-facing retrieval
// adapters already hardcode individually (content/ArweaveContentStore.js's
// own DEFAULT_GATEWAY_URL, application/ArweaveWorldEncounterMaterialResolver.js's
// own DEFAULT_GATEWAY_URL) — byte-identical here, deliberately never
// imported from either: the same per-file "no cross-import of a sibling's
// own constant" restraint content/ArweaveContentStore.js's own header
// already holds for its write-side ceiling, applied here to a value
// instead of a size limit. A caller with no persisted
// ArweaveGatewayConfiguration consults THIS constant — never lets an
// adapter's own internal default silently do the job, so "what is the
// current effective default" stays answerable by reading exactly one file.
export { DEFAULT_ARWEAVE_GATEWAY_URL };
