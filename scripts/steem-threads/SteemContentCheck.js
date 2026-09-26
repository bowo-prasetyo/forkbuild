import { SteemContentStore } from '../../content/SteemContentStore.js';
import { STEEM_CONTENT_PART_MAX_BYTES } from '../../core/SteemContentManifest.js';
import { createSteemRpcClient } from '../../steem/SteemRpcClient.js';
import { computeContentHash } from '../../serializer/contentHash.js';

// The content storage check behind content-check.html: store test content
// on Steem with the real SteemContentStore, then read it back from each API
// node on its own. Version 2 posts keep the content in `json_metadata`
// (docs/Protocol.md, "Proposed: Steem Content Storage"), and a node that
// shortened or dropped a large `json_metadata` would make stored content
// unreadable through it. The test content is random, so it doesn't
// compress: it needs a manifest and two parts, each part close to the
// largest a post holds, and reading it uses both `get_content` and
// `get_content_replies`.

const FILLER_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';
// About 1.5 parts once compressed and base64-encoded.
export const STEEM_CONTENT_CHECK_FILLER_LENGTH = Math.round(STEEM_CONTENT_PART_MAX_BYTES * 1.75);

// Test content: JSON naming itself, with random filler. `randomBytes(n)`
// returns n random bytes; WebCrypto's by default.
export function steemContentCheckText({ now = new Date(), randomBytes = webCryptoRandomBytes } = {}) {
    const bytes = randomBytes(STEEM_CONTENT_CHECK_FILLER_LENGTH);
    let filler = '';
    for (const byte of bytes) filler += FILLER_CHARACTERS[byte % FILLER_CHARACTERS.length];
    return JSON.stringify({ forkbuild: 'Steem content storage check', createdAt: now.toISOString(), filler });
}

// getRandomValues() fills at most 64 KiB per call.
function webCryptoRandomBytes(n) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(bytes.subarray(i, Math.min(n, i + 65536)));
    return bytes;
}

// Stores `text` through `store` (a SteemContentStore with an announcer) and
// resolves to `{ uri, hash }`, the two things reading it back needs.
export async function storeSteemContentCheck({ store, text, onProgress = null }) {
    const reference = await store.put(text, { onProgress });
    return Object.freeze({ uri: reference.uri, hash: reference.hash });
}

// Reads `{ uri, hash }` back from each node separately. Resolves to one
// `{ node, ok, message }` per node, in order; never rejects.
export async function readSteemContentCheck({ uri, hash, nodes, threadAccounts, fetchImpl = globalThis.fetch, onResult = null }) {
    const results = [];
    for (const node of nodes) {
        const store = new SteemContentStore({ rpc: createSteemRpcClient({ nodes: [node], fetchImpl }), threadAccounts });
        let result;
        try {
            const text = await store.get({ uri, hash });
            if (typeof text !== 'string') {
                result = { node, ok: false, message: 'Not a steem:// locator.' };
            } else if (computeContentHash(text) !== hash) {
                result = { node, ok: false, message: `Read ${text.length} characters, but their content hash is ${computeContentHash(text)}, not ${hash}.` };
            } else {
                result = { node, ok: true, message: `Read back all ${text.length} characters, unchanged.` };
            }
        } catch (error) {
            result = { node, ok: false, message: error.message };
        }
        results.push(Object.freeze(result));
        if (typeof onResult === 'function') onResult(results.at(-1));
    }
    return results;
}
