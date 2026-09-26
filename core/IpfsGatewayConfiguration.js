// The deployment default gateways, in the order reads try them — all from
// the IPFS project's public-gateway-checker list. ipfs.io stays first (and
// stays DEFAULT_IPFS_GATEWAY_URL, below); the others are run by different
// operators, so one outage or bot-detection wall doesn't stop reads. Content
// read through any of them is checked against our own content hash, so a
// gateway cannot substitute bytes.
const DEFAULT_IPFS_GATEWAY_URLS = Object.freeze([
    'https://ipfs.io',
    'https://dweb.link',
    'https://4everland.io',
    'https://ipfs.filebase.io'
]);
const DEFAULT_IPFS_GATEWAY_URL = DEFAULT_IPFS_GATEWAY_URLS[0];

// 0.9.665 — User-Configurable IPFS Gateway Configuration Boundary.
//
// Reverses the DEFER verdict 0.9.373 recorded and 0.9.385/0.9.657 each
// reconfirmed for this exact candidate. Those audits were correct about
// the evidence available at the time: IpfsGatewayContentStore is only ever
// constructed at two opt-in call sites, never the default World Encounter
// or Snapshot retrieval path, so a down gateway degraded a narrow corner
// of the product rather than the core loop. The new fact those audits
// never had: the hardcoded default itself, https://ipfs.io, now sits
// behind a bot-detection interstitial that returns an HTML challenge page
// instead of content for a plain fetch() — confirmed live (a real publish
// verified byte-identical against a second gateway, gateway.pinata.cloud,
// while the default failed with "Failed to fetch" against the same CID).
// That is not "gateway occasionally down," the condition the prior audits
// weighed and found too narrow to act on — it is "the one and only
// hardcoded gateway cannot ever be reached by a programmatic fetch() call,
// for anyone, indefinitely," with no code-level workaround. A DEFER
// verdict about severity of an occasional outage does not survive that.
//
// A VALUE OBJECT, NEVER A DEFAULT-INJECTING ONE — the same rule
// ArweaveGatewayConfiguration.js holds. "No override configured" is
// represented by the ABSENCE of an instance (storage/
// IpfsGatewayConfigurationStore.js's own get() returning null), never by
// this class quietly substituting DEFAULT_IPFS_GATEWAY_URL for a missing
// value.
//
// VALIDATION IS SHAPE ONLY, NEVER REACHABILITY — a syntactically valid
// but unreachable gateway is a retrieval-time failure for
// content/IpfsGatewayContentStore.js's own existing, honest
// ContentUnavailableError to report, never something this file predicts.
export function isValidIpfsGatewayUrl(value) {
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

// 0.9.666 — IPFS Gateway Read Failover.
//
// Reverses the OTHER half of core/ArweaveGatewayConfiguration.js's own
// pre-0.9.440 shape this file used to mirror exactly: that file's own
// 0.9.365-era header explicitly excluded IPFS from its later 0.9.440
// gatewayUrls/failover extension, reasoning that content/
// IpfsGatewayContentStore.js "only ever supports one gateway per
// instance." That reasoning described an existing LIMIT of the read
// collaborator, never a constraint this configuration shape had to keep
// forever — content/IpfsGatewayFailoverContentStore.js (this same
// milestone) is the new collaborator that removes it, the identical
// "one collaborator per configured gatewayUrls length" shape content/
// ArweaveGatewayFailoverContentStore.js already established. This class
// now mirrors core/ArweaveGatewayConfiguration.js's own 0.9.440 shape in
// full, one axis over: a single `gatewayUrl` string is still accepted,
// unchanged, and now means exactly "a one-element ordered list." A caller
// wanting more than one gateway passes `gatewayUrls` (a non-empty array,
// in priority order) instead — never both in the same call.
//
//   { gatewayUrl: 'https://a.example' }            (still valid, unchanged)
//        │                                          == one-element list
//        ▼
//   { gatewayUrls: ['https://a.example', 'https://b.example'] }   (new)
//        │
//        ▼
//   core/IpfsGatewayConfiguration.js   ★ (THIS)
//        .gatewayUrl   — the FIRST configured url, unchanged shape, for
//                         every caller that only ever wanted a single value
//        .gatewayUrls  — the FULL ordered list, new, for a caller building
//                         an ordered-failover read collaborator
//
// WRITE/PUBLISHING IS UNTOUCHED. content/IpfsGatewayContentStore.js's own
// put() is unimplemented on purpose (a read-only HTTPS gateway cannot
// accept content) — this class configures ordered READ failover only,
// exactly like the two real call sites it feeds: resolving an ipfs://
// Snapshot Placement, and the "Verify IPFS Content" check. Local Kubo
// (content/IpfsContentStore.js) and remote pinning (content/
// IpfsRemotePinningContentStore.js) — the actual IPFS *write* paths —
// remain completely untouched and structurally isolated from this setting.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB, STILL.
// - **Persistence of any kind.** See storage/IpfsGatewayConfigurationStore.js.
// - **A network call of any kind, ever, for any reason.** Held for every
//   entry in `gatewayUrls` too, not just the first.
// - **`timeout`/`retry`/`healthCheck`/`priority` fields, or any field
//   beyond `gatewayUrl`/`gatewayUrls`.** Ordering IS the priority.
// - **Choosing WHICH order to try gateways in, or what "unavailable"
//   means.** That policy lives in content/IpfsGatewayFailoverContentStore.js,
//   never in this plain value object.
export class IpfsGatewayConfiguration {
    // Exactly one of `gatewayUrl` (a single string) or `gatewayUrls` (a
    // non-empty array, in priority order) is accepted; passing both
    // throws, exactly like passing neither already did. `gatewayUrl: ['a',
    // 'b']` still throws — an array is never valid under the singular key,
    // only under `gatewayUrls`.
    constructor({ gatewayUrl, gatewayUrls } = {}) {
        if (gatewayUrl !== undefined && gatewayUrls !== undefined) {
            throw new Error('IpfsGatewayConfiguration: pass exactly one of gatewayUrl or gatewayUrls, never both');
        }
        const candidates = gatewayUrls !== undefined ? gatewayUrls : [gatewayUrl];
        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error('IpfsGatewayConfiguration: gatewayUrls must be a non-empty array');
        }
        this._gatewayUrls = Object.freeze(candidates.map((url) => {
            if (!isValidIpfsGatewayUrl(url)) {
                throw new Error(`IpfsGatewayConfiguration: invalid gatewayUrl "${url}"`);
            }
            // Trailing-slash normalization mirrors content/
            // IpfsGatewayContentStore.js's own constructor exactly, so a
            // configuration built here composes the identical `/ipfs/<cid>`
            // path that store already does.
            return url.trim().replace(/\/+$/, '');
        }));
        Object.freeze(this);
    }

    // The first configured gateway — unchanged shape/meaning for every
    // caller that only ever wanted a single value.
    get gatewayUrl() { return this._gatewayUrls[0]; }

    // The full ordered list, one entry per configured gateway — always at
    // least one entry, even when this instance was constructed from the
    // singular `gatewayUrl` shape.
    get gatewayUrls() { return this._gatewayUrls; }

    // Value equality, never identity. Order matters: [A, B] and [B, A] are
    // different configurations, since order IS the failover policy.
    equals(other) {
        return other instanceof IpfsGatewayConfiguration &&
            other._gatewayUrls.length === this._gatewayUrls.length &&
            other._gatewayUrls.every((url, index) => url === this._gatewayUrls[index]);
    }

    // Plain-data convenience for storage/IpfsGatewayConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own. Always the list shape, even for a
    // single-gateway configuration — storage/IpfsGatewayConfigurationStore.js's
    // own get() reads a legacy single-gatewayUrl payload back into the
    // identical one-element-list configuration this would have produced.
    toJSON() {
        return { gatewayUrls: [...this._gatewayUrls] };
    }
}

// The deployment default — byte-identical to content/
// IpfsGatewayContentStore.js's own DEFAULT_GATEWAY_URL, deliberately never
// imported from that file (the same "no cross-import of a sibling's own
// constant" restraint ArweaveGatewayConfiguration.js already holds). Left
// unchanged at https://ipfs.io on purpose — this milestone adds the
// ability to override it, never silently swaps what "unconfigured" means
// for the many existing tests and call sites that key on that exact
// string. A person who hits the bot-detection wall uses the new settings
// page to point at a reachable gateway instead.
export { DEFAULT_IPFS_GATEWAY_URL, DEFAULT_IPFS_GATEWAY_URLS };
