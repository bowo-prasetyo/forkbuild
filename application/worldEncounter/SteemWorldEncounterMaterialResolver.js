import { SteemContentStore } from '../../content/SteemContentStore.js';
import { parseSteemContentLocator } from '../../core/SteemContentManifest.js';

// The same ceiling ArweaveWorldEncounterMaterialResolver.js puts on a
// Signed Claim: one is a few kilobytes.
const DEFAULT_MAX_MATERIAL_BYTES = 48 * 1024;

// Retrieves a Publication's Signed Claim stored on Steem ("Proposed: Steem
// Content Storage" in docs/Protocol.md), for
// DecentralizedWorldEncounterMaterialSource. `retrieveByUri(uri)` follows
// ArweaveWorldEncounterMaterialResolver's contract:
// - a uri that isn't `steem://<author>/<permlink>` resolves to null;
// - content that is missing, isn't a ForkBuild content manifest, has
//   changed parts, is larger than `maxMaterialBytes`, or isn't a JSON
//   object resolves to null;
// - a failure to reach a Steem node rejects.
// It reads through its own SteemContentStore with no announcer, so it can
// never post, and its decoded-size limit stops an oversized post before it
// is decompressed. It never checks the claim's signature; the material
// verifier does that for material from every substrate.
export class SteemWorldEncounterMaterialResolver {
    constructor({ rpc, threadAccounts, maxMaterialBytes = DEFAULT_MAX_MATERIAL_BYTES } = {}) {
        this._store = new SteemContentStore({ rpc, threadAccounts, maxDecodedBytes: maxMaterialBytes });
        this.retrieveByUri = this.retrieveByUri.bind(this);
    }

    get storage() { return this._store.storage; }

    async retrieveByUri(uri) {
        if (parseSteemContentLocator(uri) === null) return null;
        let text;
        try {
            text = await this._store.get({ uri });
        } catch (error) {
            if (error?.cause) throw error;
            return null;
        }
        if (typeof text !== 'string') return null;
        let material;
        try {
            material = JSON.parse(text);
        } catch {
            return null;
        }
        return material !== null && typeof material === 'object' && !Array.isArray(material) ? material : null;
    }
}

SteemWorldEncounterMaterialResolver.DEFAULT_MAX_MATERIAL_BYTES = DEFAULT_MAX_MATERIAL_BYTES;
