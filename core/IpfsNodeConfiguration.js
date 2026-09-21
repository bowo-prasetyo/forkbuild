const DEFAULT_IPFS_NODE_API_URL = 'http://127.0.0.1:5001';

// User-Configurable IPFS Node API URL.
//
// content/IpfsContentStore.js — the Kubo write path new Content/Snapshot
// IPFS Placements are actually PUT onto — has always accepted an `apiUrl`
// constructor option, but ui/main.js never passed one, hardcoding every
// replica to `new IpfsContentStore()`'s own DEFAULT_API_URL
// ('http://127.0.0.1:5001', byte-identical to this file's own default
// below, deliberately never cross-imported — the same restraint core/
// IpfsGatewayConfiguration.js's own header already holds for its sibling
// gateway default). A person running Kubo anywhere other than localhost —
// a remote node, a node on another machine on their LAN — had no product
// path to point placement at it at all.
//
// A VALUE OBJECT, NEVER A DEFAULT-INJECTING ONE — mirrors core/
// IpfsGatewayConfiguration.js exactly. "No override configured" is
// represented by the ABSENCE of an instance (storage/
// IpfsNodeConfigurationStore.js's own get() returning null), never by this
// class quietly substituting DEFAULT_IPFS_NODE_API_URL for a missing value.
//
// VALIDATION IS SHAPE ONLY, NEVER REACHABILITY — a syntactically valid but
// unreachable node is a placement-time failure content/IpfsContentStore.js's
// own existing error handling already reports, never something this file
// predicts.
//
// WRITE-PATH ONLY, STRUCTURALLY ISOLATED FROM THE GATEWAY SETTING. This
// configures where NEW content gets PLACED (content/IpfsContentStore.js's
// own `put()`); it never touches core/IpfsGatewayConfiguration.js's own
// gateway list, which governs READING already-placed `ipfs://` content
// instead. The two settings answer different questions and are never
// merged into one.
export function isValidIpfsNodeApiUrl(value) {
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

export class IpfsNodeConfiguration {
    constructor({ apiUrl } = {}) {
        if (!isValidIpfsNodeApiUrl(apiUrl)) {
            throw new Error(`IpfsNodeConfiguration: invalid apiUrl "${apiUrl}"`);
        }
        this._apiUrl = apiUrl.trim().replace(/\/+$/, '');
        Object.freeze(this);
    }

    get apiUrl() { return this._apiUrl; }

    equals(other) {
        return other instanceof IpfsNodeConfiguration && other._apiUrl === this._apiUrl;
    }

    // Plain-data convenience for storage/IpfsNodeConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own.
    toJSON() {
        return { apiUrl: this._apiUrl };
    }
}

// The deployment default — byte-identical to content/IpfsContentStore.js's
// own DEFAULT_API_URL, deliberately never imported from that file (the
// same "no cross-import of a sibling's own constant" restraint core/
// IpfsGatewayConfiguration.js already holds for its own default).
export { DEFAULT_IPFS_NODE_API_URL };
