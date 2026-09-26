// The deployment default endpoints, in the order they are tried. Both are
// public Esplora instances run by different operators. Reads fall over to
// the next when one is unreachable, and a broadcast goes to the first that
// answers (anchoring/BitcoinEsploraFailover.js).
const DEFAULT_BITCOIN_ESPLORA_API_URLS = Object.freeze([
    'https://blockstream.info/api',
    'https://mempool.space/api'
]);
const DEFAULT_BITCOIN_ESPLORA_API_URL = DEFAULT_BITCOIN_ESPLORA_API_URLS[0];

// User-Configurable Bitcoin Esplora Endpoint Configuration Boundary.
//
// Closes the gap the codebase's own BitcoinEndpointConfigurationUIReachability
// audit named and deliberately left open (see that test file's own header):
// anchoring/BitcoinEsploraTransactionBroadcaster.js, anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js, anchoring/
// BitcoinEsploraWalletFundingSource.js, and anchoring/
// BitcoinOpReturnProofVerifier.js each already accept `apiUrl` through
// ordinary constructor injection — mechanical, code-level configurability —
// but nothing gave a user's own choice of endpoint a durable, validated
// shape to travel in from a settings surface down to those constructors.
// This file is that shape, mirroring core/ArweaveGatewayConfiguration.js's
// own "a value object, never a default-injecting one" boundary exactly, one
// field, since that audit's own Section E already found this endpoint
// serves one conceptual role (three read roles and one write role) rather
// than a read/write pair — a settings page needs exactly one field, which
// may hold several endpoints tried in order.
//
// A VALUE OBJECT, NEVER A DEFAULT-INJECTING ONE. This class validates and
// normalizes exactly the `apiUrl` it is given — it never substitutes
// `DEFAULT_BITCOIN_ESPLORA_API_URL` for a missing one. "The user configured
// nothing" is a fact a caller (storage/BitcoinEsploraConfigurationStore.js's
// own `get()`, or ui/main.js's own composition root) represents by having no
// `BitcoinEsploraConfiguration` instance at all — never by this class
// quietly constructing one that happens to hold the default.
//
// VALIDATION IS DELIBERATELY MODEST — SHAPE ONLY, NEVER REACHABILITY, the
// identical restraint core/ArweaveGatewayConfiguration.js's own
// `isValidArweaveGatewayUrl()` holds: is this a non-empty string that
// parses as an absolute `http:`/`https:` URL. A configured-but-currently-
// unreachable host is a request-time failure for the four existing Esplora
// consumer classes to report, never something this file tries to predict.
//
// TRAILING SLASHES ARE NORMALIZED AWAY so a configuration built here
// composes the same `${apiUrl}/tx`-shaped paths those four classes already
// build from their own hardcoded default.
export function isValidBitcoinEsploraApiUrl(value) {
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

// Several endpoints may be configured, in priority order, the same shape
// core/IpfsGatewayConfiguration.js holds: exactly one of `apiUrl` (a single
// string) or `apiUrls` (a non-empty array). `apiUrl` stays the first entry,
// so every caller that only wants one endpoint keeps working unchanged.
export class BitcoinEsploraConfiguration {
    constructor({ apiUrl, apiUrls } = {}) {
        if (apiUrl !== undefined && apiUrls !== undefined) {
            throw new Error('BitcoinEsploraConfiguration: pass exactly one of apiUrl or apiUrls, never both');
        }
        const candidates = apiUrls !== undefined ? apiUrls : [apiUrl];
        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error('BitcoinEsploraConfiguration: apiUrls must be a non-empty array');
        }
        this._apiUrls = Object.freeze(candidates.map((url) => {
            if (!isValidBitcoinEsploraApiUrl(url)) {
                throw new Error(`BitcoinEsploraConfiguration: invalid apiUrl "${url}"`);
            }
            return url.trim().replace(/\/+$/, '');
        }));
        Object.freeze(this);
    }

    // The first configured endpoint.
    get apiUrl() { return this._apiUrls[0]; }

    // Every configured endpoint, in the order they are tried.
    get apiUrls() { return this._apiUrls; }

    // Value equality, never identity. Order matters: it is the failover
    // order.
    equals(other) {
        return other instanceof BitcoinEsploraConfiguration &&
            other._apiUrls.length === this._apiUrls.length &&
            other._apiUrls.every((url, index) => url === this._apiUrls[index]);
    }

    // Plain-data convenience for storage/BitcoinEsploraConfigurationStore.js
    // — this class itself never calls it, and never reads or writes any
    // storage key on its own. Always the list shape; the store reads a
    // legacy single-`apiUrl` payload back as a one-entry list.
    toJSON() {
        return { apiUrls: [...this._apiUrls] };
    }
}

// The one deployment default the four existing Esplora consumer classes
// already hardcode individually as their own `DEFAULT_API_URL` — byte-
// identical here, deliberately never imported from any of them (the same
// per-file "no cross-import of a sibling's own constant" restraint core/
// ArweaveGatewayConfiguration.js's own header already holds). A caller with
// no persisted BitcoinEsploraConfiguration consults THIS constant.
export { DEFAULT_BITCOIN_ESPLORA_API_URL, DEFAULT_BITCOIN_ESPLORA_API_URLS };
