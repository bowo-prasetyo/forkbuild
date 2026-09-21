const DEFAULT_BITCOIN_ESPLORA_API_URL = 'https://blockstream.info/api';

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
// serves one conceptual role (one URL, three read roles and one write role)
// rather than a read/write pair — a settings page needs exactly one field,
// never a list.
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

export class BitcoinEsploraConfiguration {
    constructor({ apiUrl } = {}) {
        if (!isValidBitcoinEsploraApiUrl(apiUrl)) {
            throw new Error(`BitcoinEsploraConfiguration: invalid apiUrl "${apiUrl}"`);
        }
        this._apiUrl = apiUrl.trim().replace(/\/+$/, '');
        Object.freeze(this);
    }

    get apiUrl() { return this._apiUrl; }

    // Value equality, never identity — the same convention core/
    // ArweaveGatewayConfiguration.js's own `equals()` already holds.
    equals(other) {
        return other instanceof BitcoinEsploraConfiguration && other._apiUrl === this._apiUrl;
    }

    // Plain-data convenience for storage/BitcoinEsploraConfigurationStore.js
    // — this class itself never calls it, and never reads or writes any
    // storage key on its own.
    toJSON() {
        return { apiUrl: this._apiUrl };
    }
}

// The one deployment default the four existing Esplora consumer classes
// already hardcode individually as their own `DEFAULT_API_URL` — byte-
// identical here, deliberately never imported from any of them (the same
// per-file "no cross-import of a sibling's own constant" restraint core/
// ArweaveGatewayConfiguration.js's own header already holds). A caller with
// no persisted BitcoinEsploraConfiguration consults THIS constant.
export { DEFAULT_BITCOIN_ESPLORA_API_URL };
