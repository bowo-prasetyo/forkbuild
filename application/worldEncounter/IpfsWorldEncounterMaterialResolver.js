// Reads a Publication's Signed Claim stored on IPFS (`ipfs://<cid>`) through
// an IPFS gateway store (content/IpfsGatewayContentStore.js or its failover
// sibling: `get({ uri })` resolves to the text, or rejects with
// ContentUnavailableError when no gateway returns it). `retrieveByUri(uri)`
// follows ArweaveWorldEncounterMaterialResolver's contract where a gateway
// allows: null for a uri that isn't a bare `ipfs://<cid>`, for content larger
// than a Signed Claim can be, or for content that isn't a JSON object; a
// rejection when the content can't be fetched (a gateway can't tell "not on
// IPFS" from "not reachable right now"). It never checks the claim's
// signature; the material verifier does.

const DEFAULT_MAX_MATERIAL_BYTES = 48 * 1024;
const CID_PATTERN = /^[A-Za-z0-9]{32,128}$/;

export class IpfsWorldEncounterMaterialResolver {
    constructor({ gatewayStore, maxMaterialBytes = DEFAULT_MAX_MATERIAL_BYTES } = {}) {
        if (!gatewayStore || typeof gatewayStore.get !== 'function') {
            throw new TypeError('IpfsWorldEncounterMaterialResolver: an IPFS gateway store is required');
        }
        this._gatewayStore = gatewayStore;
        this._maxMaterialBytes = maxMaterialBytes;
        this.retrieveByUri = this.retrieveByUri.bind(this);
    }

    get storage() { return 'ipfs'; }

    async retrieveByUri(uri) {
        if (typeof uri !== 'string' || !uri.startsWith('ipfs://') || !CID_PATTERN.test(uri.slice('ipfs://'.length))) return null;
        const text = await this._gatewayStore.get({ uri });
        if (typeof text !== 'string' || new TextEncoder().encode(text).length > this._maxMaterialBytes) return null;
        let material;
        try {
            material = JSON.parse(text);
        } catch {
            return null;
        }
        return material !== null && typeof material === 'object' && !Array.isArray(material) ? material : null;
    }
}

IpfsWorldEncounterMaterialResolver.DEFAULT_MAX_MATERIAL_BYTES = DEFAULT_MAX_MATERIAL_BYTES;
