// Where Blurt announcements and content are read from (docs/Protocol.md,
// "Proposed: Blurt Substrate", "Reading"): the API nodes asked, in order,
// first answer wins.

// Two operators, so the anchor verifier, which asks every node and needs all
// that answer to agree, compares independent nodes by default.
export const DEFAULT_BLURT_API_NODES = Object.freeze([
    'https://rpc.blurt.blog',
    'https://rpc.beblurt.com'
]);
const MAX_NODES = 8;

export function isValidBlurtApiNodeUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        return new URL(value.trim()).protocol === 'https:';
    } catch {
        return false;
    }
}

export class BlurtReadingConfiguration {
    // A configuration saved before the followed accounts and the first month
    // were dropped still reads: those fields are ignored.
    constructor({ apiNodes = DEFAULT_BLURT_API_NODES } = {}) {
        if (!Array.isArray(apiNodes) || apiNodes.length === 0) throw new Error('BlurtReadingConfiguration: apiNodes must be a non-empty list');
        if (apiNodes.length > MAX_NODES) throw new Error(`BlurtReadingConfiguration: at most ${MAX_NODES} apiNodes`);
        this._apiNodes = Object.freeze([...new Set(apiNodes.map((node) => {
            if (!isValidBlurtApiNodeUrl(node)) throw new Error(`BlurtReadingConfiguration: an API node must be an https:// URL, got "${node}"`);
            return node.trim().replace(/\/+$/, '');
        }))]);
        Object.freeze(this);
    }

    static fromJSON(raw) {
        try {
            return new BlurtReadingConfiguration(raw ?? {});
        } catch {
            return null;
        }
    }

    get apiNodes() { return this._apiNodes; }

    toJSON() {
        return { apiNodes: [...this._apiNodes] };
    }
}
