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
// 0.9.440 — Arweave Gateway Read Failover.
//
// 0.9.439's own audit classified Arweave gateway read/retrieval as the one
// MINIMAL_FAILOVER_SEAM in this codebase: content-addressed, byte-identical
// regardless of which gateway answers, so ordered failover captures all of
// the resilience benefit with none of fan-out's complexity. This file is
// extended, narrowly, to be the shape that ordered list travels in — a
// single `gatewayUrl` string is still accepted, unchanged, and now means
// exactly "a one-element ordered list." A caller wanting more than one
// gateway passes `gatewayUrls` (a non-empty array, in priority order)
// instead — never both in the same call.
//
//   { gatewayUrl: 'https://a.example' }            (still valid, unchanged)
//        │                                          == one-element list
//        ▼
//   { gatewayUrls: ['https://a.example', 'https://b.example'] }   (new)
//        │
//        ▼
//   core/ArweaveGatewayConfiguration.js   ★ (THIS)
//        .gatewayUrl   — the FIRST configured url, unchanged shape, for
//                         every caller that only ever wanted a single value
//                         (core/ArweaveGatewayConfiguration.js's own
//                         pre-0.9.440 callers, and the Arweave Anchor
//                         publish/verify pair — see below)
//        .gatewayUrls  — the FULL ordered list, new, for a caller building
//                         an ordered-failover read collaborator
//
// WHY THE SINGLE-VALUE SHAPE ISN'T JUST "A LIST OF ONE" EVERYWHERE. Every
// existing caller of `.gatewayUrl` — content/ArweaveContentStore.js,
// application/ArweaveWorldEncounterMaterialResolver.js,
// application/CreateArweaveAnchorPublisherUseCase.js, application/
// CreateArweaveAnchorProofVerifierUseCase.js — keeps working unmodified,
// reading exactly the same field, holding exactly the same value it always
// did. A caller that wants the new ordered-failover behavior explicitly
// asks for `.gatewayUrls` and wires a NEW collaborator around it (see
// content/ArweaveGatewayFailoverContentStore.js and application/
// ArweaveGatewayFailoverWorldEncounterMaterialResolver.js, this same
// milestone) — this file itself never decides which collaborator a caller
// should build from what it hands back.
//
// THE ARWEAVE ANCHOR EXCEPTION IS DELIBERATELY UNTOUCHED. 0.9.439's own
// Section F3 found that ui/main.js already reuses ONE resolved gatewayUrl
// for BOTH `CreateArweaveAnchorPublisherUseCase` (write) and
// `CreateArweaveAnchorProofVerifierUseCase` (read) — a real, load-bearing
// exception to the read/write gateway split every other Arweave-facing
// composition site holds. This milestone does not extend Anchor to a list
// on either half; Anchor keeps consuming `.gatewayUrl` (the first
// configured gateway) exactly as it always has. Whether Anchor should ever
// gain its own list, shared or independent, is 0.9.439's own "a future
// list decision must explicitly choose" — explicitly NOT this milestone.
//
// WRITE/UPLOAD/DISTRIBUTION IS UNTOUCHED. This file says nothing about
// where new content gets written — see "a separate object, never a reuse,"
// above, unchanged by this extension. A `gatewayUrls` list configures
// ordered READ failover only, never fan-out on `put()`/upload.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB, STILL.
// - **Persistence of any kind.** No `localStorage`, no `StorageProvider`
//   import, no `save()`/`load()`. See storage/
//   ArweaveGatewayConfigurationStore.js, this same milestone, sibling file.
// - **A network call of any kind, ever, for any reason.** See "validation
//   is deliberately modest," above — held for every entry in `gatewayUrls`
//   too, not just the first.
// - **`timeout`/`retry`/`healthCheck`/`priority` fields, or any field
//   beyond `gatewayUrl`/`gatewayUrls`.** Ordering IS the priority — no
//   separate numeric field, no health check, no automatic reordering.
// - **Choosing WHICH order to try gateways in, or what "unavailable"
//   means.** That policy lives in the read collaborator that consumes
//   `.gatewayUrls` (content/ArweaveGatewayFailoverContentStore.js /
//   application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js),
//   never in this plain value object.
// - **A settings UI, or any `ui/` import.** See ui/views/
//   ArweaveGatewaySettingsView.js, this same milestone, for the reachable
//   surface over this shape.
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
    // Exactly one of `gatewayUrl` (a single string — unchanged since
    // 0.9.364) or `gatewayUrls` (a non-empty array, in priority order —
    // new, 0.9.440) is accepted; passing both throws, exactly like passing
    // neither already did. `gatewayUrl: ['a', 'b']` still throws — an array
    // is never valid under the singular key, only under `gatewayUrls`; see
    // this file's own header, "why the single-value shape isn't just a
    // list of one everywhere."
    constructor({ gatewayUrl, gatewayUrls } = {}) {
        if (gatewayUrl !== undefined && gatewayUrls !== undefined) {
            throw new Error('ArweaveGatewayConfiguration: pass exactly one of gatewayUrl or gatewayUrls, never both');
        }
        const candidates = gatewayUrls !== undefined ? gatewayUrls : [gatewayUrl];
        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error('ArweaveGatewayConfiguration: gatewayUrls must be a non-empty array');
        }
        this._gatewayUrls = Object.freeze(candidates.map((url) => {
            if (!isValidArweaveGatewayUrl(url)) {
                throw new Error(`ArweaveGatewayConfiguration: invalid gatewayUrl "${url}"`);
            }
            return url.trim().replace(/\/+$/, '');
        }));
        Object.freeze(this);
    }

    // The first configured gateway — unchanged shape/meaning for every
    // caller that only ever wanted a single value; see this file's own
    // header.
    get gatewayUrl() { return this._gatewayUrls[0]; }

    // The full ordered list, one entry per configured gateway — always at
    // least one entry, even when this instance was constructed from the
    // singular `gatewayUrl` shape.
    get gatewayUrls() { return this._gatewayUrls; }

    // Value equality, never identity — the same convention this
    // codebase's other small value objects already hold (e.g. content/
    // ContentReference.js's own verify()). Order matters: [A, B] and [B, A]
    // are different configurations, since order IS the failover policy.
    equals(other) {
        return other instanceof ArweaveGatewayConfiguration &&
            other._gatewayUrls.length === this._gatewayUrls.length &&
            other._gatewayUrls.every((url, index) => url === this._gatewayUrls[index]);
    }

    // Plain-data convenience for storage/ArweaveGatewayConfigurationStore.js
    // — this class itself never calls it, and never reads or writes any
    // storage key on its own. Always the list shape, even for a
    // single-gateway configuration — storage/ArweaveGatewayConfigurationStore.js's
    // own `get()` reads a legacy single-`gatewayUrl` payload back into the
    // identical one-element-list configuration this would have produced.
    toJSON() {
        return { gatewayUrls: [...this._gatewayUrls] };
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
