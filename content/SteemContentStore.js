import { ContentStore, ContentTooLargeError } from './ContentStore.js';
import { ContentUnavailableError } from './IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';
import {
    STEEM_CONTENT_PART_MAX_BYTES,
    STEEM_CONTENT_STORAGE,
    describeSteemContentManifest,
    parseSteemContentLocator,
    steemContentEncodedByteLength,
    steemContentLocator
} from '../core/SteemContentManifest.js';

// Stores content in one Steem post: a manifest replying to the current
// month's content thread, with the encoded content as its body
// (docs/Protocol.md, "Proposed: Steem Content Storage"). This is the inline
// case only; content that doesn't fit one post is refused with a message
// pointing to IPFS or Arweave, and a manifest that lists parts can't be
// read yet.
//
// Steem is only a carrier. get() returns the decoded text and the caller
// checks it against the content hash, as for every other store.

const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;

export class SteemContentTooLargeError extends ContentTooLargeError {
    constructor(encodedBytes, maxEncodedBytes) {
        super(encodedBytes, maxEncodedBytes, 'Steem');
        this.name = 'SteemContentTooLargeError';
        this.message = `This build is ${formatKilobytes(encodedBytes)} even compressed, more than the ${formatKilobytes(maxEncodedBytes)} one Steem post holds. Choose IPFS or Arweave storage to distribute it.`;
    }
}

export class SteemContentStore extends ContentStore {
    // `rpc` reads posts (steem/SteemRpcClient.js). `announcer` posts them
    // (application/steem/SteemAnnouncer.js's postContent()), so content and
    // announcements share one queue. `threadAccounts` are the accounts whose
    // content threads a manifest may reply to.
    constructor({ rpc, announcer = null, threadAccounts, maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES } = {}) {
        super();
        if (!rpc || typeof rpc.getContent !== 'function') throw new TypeError('SteemContentStore: a Steem RPC client is required');
        if (announcer !== null && typeof announcer.postContent !== 'function') throw new TypeError('SteemContentStore: the announcer must have postContent()');
        if (!Array.isArray(threadAccounts) || threadAccounts.length === 0) throw new TypeError('SteemContentStore: at least one thread account is required');
        this._rpc = rpc;
        this._announcer = announcer;
        this._threadAccounts = [...threadAccounts];
        this._maxDecodedBytes = maxDecodedBytes;
    }

    get storage() { return STEEM_CONTENT_STORAGE; }

    // The limit applies to the encoded content, which is only known after
    // compressing, so put() checks it rather than the caller.
    get maxContentBytes() { return Infinity; }

    async put(bytes) {
        if (!this._announcer) throw new Error('Storing content on Steem is not available.');
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const size = new TextEncoder().encode(text).length;
        const { encoding, encoded } = await encodeSteemContent(text);
        const encodedBytes = steemContentEncodedByteLength(encoded);
        if (encodedBytes > STEEM_CONTENT_PART_MAX_BYTES) {
            throw new SteemContentTooLargeError(encodedBytes, STEEM_CONTENT_PART_MAX_BYTES);
        }
        const hash = computeContentHash(text);
        const posted = await this._announcer.postContent({
            content: {
                contentHash: hash,
                algorithm: 'fnv1a-32',
                mediaType: 'application/json',
                size,
                encoding,
                encodedLength: encoded.length,
                parts: []
            },
            body: encoded
        });
        return new ContentReference({
            hash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size,
            uri: steemContentLocator(posted.author, posted.permlink),
            storage: STEEM_CONTENT_STORAGE
        });
    }

    // null when the reference isn't a `steem://` locator (the wrong store was
    // asked); ContentUnavailableError for anything that stops the content
    // from being read, never a silent null.
    async get(reference) {
        const location = parseSteemContentLocator(reference && reference.uri);
        if (location === null) return null;
        const where = `@${location.author}/${location.permlink}`;

        let post;
        try {
            post = await this._rpc.getContent(location.author, location.permlink);
        } catch (error) {
            throw new ContentUnavailableError(`Couldn't read ${where} from Steem: ${error.message}`);
        }
        const { manifest, problem } = describeSteemContentManifest(post, { threadAccounts: this._threadAccounts });
        if (!manifest) throw new ContentUnavailableError(`${where} can't be loaded: ${problem}.`);
        if (reference.hash && manifest.contentHash !== reference.hash) {
            throw new ContentUnavailableError(`${where} stores different content (content hash ${manifest.contentHash}, expected ${reference.hash}).`);
        }
        if (!manifest.inline) {
            throw new ContentUnavailableError(`${where} is stored in parts, which this version of ForkBuild can't read yet.`);
        }
        if (manifest.size > this._maxDecodedBytes) {
            throw new ContentUnavailableError(`${where} says its content is ${manifest.size} bytes, more than ForkBuild loads.`);
        }
        try {
            return await decodeSteemContent(manifest.body, manifest.encoding, manifest.size);
        } catch (error) {
            throw new ContentUnavailableError(`${where} can't be decoded: ${error.message}`);
        }
    }

    // Best effort: false for anything unreadable, never a throw.
    async has(reference) {
        try {
            return (await this.get(reference)) !== null;
        } catch {
            return false;
        }
    }
}

// Picks whichever encoding is shorter once escaped for the operations:
// plain text, or gzip then base64. Plain text is never used when it is empty
// (the chain refuses an empty body) or starts with "@@ " (API nodes read that
// as an edit patch).
export async function encodeSteemContent(text) {
    const compressed = await transform(new TextEncoder().encode(text), new CompressionStream('gzip'), Infinity);
    const base64 = bytesToBase64(compressed);
    const plainUsable = text.length > 0 && !text.startsWith('@@ ');
    return !plainUsable || steemContentEncodedByteLength(base64) < steemContentEncodedByteLength(text)
        ? { encoding: 'gzip-base64', encoded: base64 }
        : { encoding: 'utf8', encoded: text };
}

// Decodes a body back to text of exactly `size` UTF-8 bytes. Decompression
// stops as soon as the output passes `size`, so a small body can't expand
// without bound.
export async function decodeSteemContent(body, encoding, size) {
    let bytes;
    if (encoding === 'utf8') {
        bytes = new TextEncoder().encode(body);
    } else if (encoding === 'gzip-base64') {
        bytes = await transform(base64ToBytes(body), new DecompressionStream('gzip'), size);
    } else {
        throw new Error(`unknown encoding ${encoding}`);
    }
    if (bytes.length !== size) throw new Error(`the content is ${bytes.length} bytes, but the post says ${size}`);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Runs bytes through a (de)compression stream, refusing output past
// `maxBytes`.
async function transform(input, stream, maxBytes) {
    const writer = stream.writable.getWriter();
    const writing = writer.write(input).then(() => writer.close());
    writing.catch(() => {});
    const reader = stream.readable.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > maxBytes) {
                await reader.cancel();
                throw new Error(`the content is larger than the ${maxBytes} bytes the post says`);
            }
            chunks.push(value);
        }
        await writing;
    } catch (error) {
        reader.releaseLock();
        throw error;
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }
    return output;
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function formatKilobytes(bytes) {
    return `${Math.ceil(bytes / 1024)} KB`;
}
