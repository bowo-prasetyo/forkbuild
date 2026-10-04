import { BlurtContentStore } from '../../content/BlurtContentStore.js';
import { parseBlurtContentLocator } from '../../core/BlurtPost.js';

// The same ceiling ArweaveWorldEncounterMaterialResolver.js puts on a
// Signed Claim: one is a few kilobytes.
const DEFAULT_MAX_MATERIAL_BYTES = 48 * 1024;

// Retrieves a Publication's Signed Claim stored on Blurt ("Proposed: Blurt
// Substrate" in docs/Protocol.md), for DecentralizedWorldEncounterMaterialSource,
// with ArweaveWorldEncounterMaterialResolver's contract:
// - a uri that isn't `blurt://<author>/<permlink>` resolves to null;
// - content that is missing, isn't a ForkBuild content manifest, has
//   changed parts, is larger than `maxMaterialBytes`, or isn't a JSON
//   object resolves to null;
// - a failure to reach a Blurt node rejects.
// It reads through its own BlurtContentStore with no poster, so it can never
// post. It never checks the claim's signature; the material verifier does.
export class BlurtWorldEncounterMaterialResolver {
    constructor({ rpc, maxMaterialBytes = DEFAULT_MAX_MATERIAL_BYTES } = {}) {
        this._store = new BlurtContentStore({ rpc, maxDecodedBytes: maxMaterialBytes });
        this.retrieveByUri = this.retrieveByUri.bind(this);
    }

    get storage() { return this._store.storage; }

    async retrieveByUri(uri) {
        if (parseBlurtContentLocator(uri) === null) return null;
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

BlurtWorldEncounterMaterialResolver.DEFAULT_MAX_MATERIAL_BYTES = DEFAULT_MAX_MATERIAL_BYTES;
