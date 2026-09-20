const DEFAULT_IPFS_GATEWAY_URL = 'https://ipfs.io';

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
// Mirrors core/ArweaveGatewayConfiguration.js's own pre-multi-gateway
// (0.9.364-era) single-value shape exactly, deliberately WITHOUT that
// file's later 0.9.440 gatewayUrls/failover extension:
// content/IpfsGatewayContentStore.js's own header is explicit that it
// supports exactly one gateway per instance, "no list, no automatic
// fallback... a caller that wants multiple gateways runs multiple
// instances explicitly" — so this configuration shape stays a single
// `gatewayUrl`, never a list.
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

export class IpfsGatewayConfiguration {
    constructor({ gatewayUrl } = {}) {
        if (!isValidIpfsGatewayUrl(gatewayUrl)) {
            throw new Error(`IpfsGatewayConfiguration: invalid gatewayUrl "${gatewayUrl}"`);
        }
        // Trailing-slash normalization mirrors content/
        // IpfsGatewayContentStore.js's own constructor exactly, so a
        // configuration built here composes the identical `/ipfs/<cid>`
        // path that store already does.
        this._gatewayUrl = gatewayUrl.trim().replace(/\/+$/, '');
        Object.freeze(this);
    }

    get gatewayUrl() { return this._gatewayUrl; }

    equals(other) {
        return other instanceof IpfsGatewayConfiguration && other.gatewayUrl === this.gatewayUrl;
    }

    toJSON() {
        return { gatewayUrl: this._gatewayUrl };
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
export { DEFAULT_IPFS_GATEWAY_URL };
