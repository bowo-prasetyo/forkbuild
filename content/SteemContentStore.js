import { ContentStore, ContentTooLargeError } from './ContentStore.js';
import { ContentUnavailableError } from './IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { STEEM_CONTENT_FAMILY, steemDiscoveryThreadPermlink } from '../core/SteemDiscoveryThread.js';
import { STEEM_RC_REFUSAL } from '../core/SteemResourceCredits.js';
import {
    STEEM_CONTENT_MAX_PARTS,
    STEEM_CONTENT_PART_MAX_BYTES,
    STEEM_CONTENT_MANIFEST_VERSION,
    STEEM_CONTENT_STORAGE,
    describeSteemContentManifest,
    parseSteemContentLocator,
    splitSteemContent,
    steemContentEncodedByteLength,
    steemContentLocator,
    steemContentManifestOperations,
    steemContentManifestPermlink,
    steemContentPartData,
    steemContentPartOperations,
    steemContentPartPermlink,
    steemContentPartProblem
} from '../core/SteemContentManifest.js';

// Stores content on Steem (docs/Protocol.md, "Proposed: Steem Content
// Storage"): a manifest replying to the current month's content thread,
// holding the encoded content itself when it fits one post, and otherwise
// listing up to 20 parts that follow as replies to it. Before posting it
// checks the account's Resource Credits when the node can say; an upload
// that stops part-way is resumed by storing the same content again with the
// same account. Progress is reported after each post, since each needs its
// own Keychain approval.
//
// Steem is only a carrier. get() returns the decoded text and the caller
// checks it against the content hash, as for every other store.

const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const MAX_ENCODED_BYTES = STEEM_CONTENT_PART_MAX_BYTES * STEEM_CONTENT_MAX_PARTS;
// Stand-ins of the real lengths, for estimating before the real permlinks exist.
const ESTIMATE_THREAD_PERMLINK = steemDiscoveryThreadPermlink(STEEM_CONTENT_FAMILY, '2026-01');
const ESTIMATE_MANIFEST_PERMLINK = steemContentManifestPermlink(1790000000000, 'aaaaaaaa');

export class SteemContentTooLargeError extends ContentTooLargeError {
    constructor(encodedBytes, maxEncodedBytes) {
        super(encodedBytes, maxEncodedBytes, 'Steem');
        this.name = 'SteemContentTooLargeError';
        this.message = `This build is ${formatKilobytes(encodedBytes)} even compressed, more than the ${formatKilobytes(maxEncodedBytes)} Steem storage holds (${STEEM_CONTENT_MAX_PARTS} posts). Choose IPFS or Arweave storage to distribute it.`;
    }
}

// Refused before posting: the estimate says the account can't afford it.
export class SteemResourceCreditsError extends Error {
    constructor(estimate) {
        super(`Storing this build on Steem needs about ${estimate.neededPercent}% of your account's Resource Credits, and it has ${estimate.availablePercent}% right now. Resource Credits refill over five days; try again later, or choose IPFS or Arweave storage.`);
        this.name = 'SteemResourceCreditsError';
        this.estimate = estimate;
    }
}

// Some posts were made and a later one failed. Storing the same content
// again with the same account posts only what is missing.
export class SteemContentUploadIncompleteError extends Error {
    constructor({ done, total, failedPost, cause }) {
        const reason = STEEM_RC_REFUSAL.test(cause?.message ?? '')
            ? 'your Steem account ran out of Resource Credits'
            : (cause?.message ?? 'unknown error').replace(/\.$/, '');
        super(`Post ${failedPost} of ${total} on Steem failed: ${reason}. ${done} of ${total} posts are stored; distribute again with the same Steem account to make only the missing ones.`);
        this.name = 'SteemContentUploadIncompleteError';
        this.done = done;
        this.total = total;
        this.cause = cause;
    }
}

export class SteemContentStore extends ContentStore {
    // `rpc` reads posts (steem/SteemRpcClient.js). `announcer` posts them
    // (application/steem/SteemAnnouncer.js), so content and announcements
    // share one queue. `threadAccounts` are the accounts whose content
    // threads a manifest may reply to. `uploads` remembers unfinished uploads
    // (storage/SteemContentUploadStore.js); `estimator` checks Resource
    // Credits (application/steem/SteemResourceCreditEstimator.js); `progress`
    // hears every upload's progress. All three are optional.
    constructor({ rpc, announcer = null, threadAccounts, uploads = null, estimator = null, progress = null, maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES } = {}) {
        super();
        if (!rpc || typeof rpc.getContent !== 'function') throw new TypeError('SteemContentStore: a Steem RPC client is required');
        if (announcer !== null && (typeof announcer.postContent !== 'function' || typeof announcer.postContentPart !== 'function')) {
            throw new TypeError('SteemContentStore: the announcer must have postContent() and postContentPart()');
        }
        if (!Array.isArray(threadAccounts) || threadAccounts.length === 0) throw new TypeError('SteemContentStore: at least one thread account is required');
        this._rpc = rpc;
        this._announcer = announcer;
        this._threadAccounts = [...threadAccounts];
        this._uploads = uploads;
        this._estimator = estimator;
        this._progress = progress;
        this._maxDecodedBytes = maxDecodedBytes;
    }

    get storage() { return STEEM_CONTENT_STORAGE; }

    // The limit applies to the encoded content, which is only known after
    // compressing, so put() checks it rather than the caller.
    get maxContentBytes() { return Infinity; }

    // `onProgress` hears `{ phase, done, total, resumed, resourceCredits }`
    // for this upload: phase 'checking', then 'posting' after each post,
    // then 'stored' or 'failed'.
    async put(bytes, { onProgress = null } = {}) {
        if (!this._announcer) throw new Error('Storing content on Steem is not available.');
        const report = (state) => {
            const frozen = Object.freeze({ ...state });
            for (const listener of [onProgress, this._progress?.report?.bind(this._progress)]) {
                if (typeof listener !== 'function') continue;
                try {
                    listener(frozen);
                } catch {
                    // A listener never stops an upload.
                }
            }
        };
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const plan = await planSteemContentUpload(text);
        const author = typeof this._announcer.currentAccount === 'function' ? this._announcer.currentAccount() : null;
        const reference = new ContentReference({
            hash: plan.contentHash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size: plan.size,
            storage: STEEM_CONTENT_STORAGE
        });
        const total = plan.slices.length + 1;
        const resume = author ? await this._findResumable(author, plan) : null;
        const pendingParts = resume ? resume.pendingParts : plan.slices.map((_, index) => ({ index, edit: false }));
        const done = resume ? total - pendingParts.length : 0;
        let state = { phase: 'checking', done, total, resumed: Boolean(resume), resourceCredits: null };
        report(state);

        if (author && this._estimator && (!resume || pendingParts.length > 0)) {
            const transactions = [
                ...(resume ? [] : [steemContentManifestOperations({
                    author, threadAccount: this._threadAccounts[0], threadPermlink: ESTIMATE_THREAD_PERMLINK, permlink: ESTIMATE_MANIFEST_PERMLINK,
                    content: manifestContent(plan, ESTIMATE_MANIFEST_PERMLINK), data: plan.inline ? plan.encoded : undefined
                })]),
                ...pendingParts.map(({ index, edit }) => steemContentPartOperations({
                    author, manifestPermlink: ESTIMATE_MANIFEST_PERMLINK, index, count: plan.slices.length, data: plan.slices[index], withOptions: !edit
                }))
            ];
            const estimate = await this._estimator.estimate(author, transactions).catch(() => null);
            if (estimate) {
                state = { ...state, resourceCredits: { neededPercent: estimate.neededPercent, availablePercent: estimate.availablePercent } };
                if (!estimate.enough) {
                    report({ ...state, phase: 'failed' });
                    throw new SteemResourceCreditsError(estimate);
                }
            }
        }

        let manifestAuthor = resume?.author;
        let manifestPermlink = resume?.permlink;
        let posted = done;
        state = { ...state, phase: 'posting' };
        report(state);
        try {
            if (!resume) {
                const manifest = await this._announcer.postContent({
                    content: { ...manifestContent(plan, null), parts: plan.parts },
                    data: plan.inline ? plan.encoded : undefined
                });
                manifestAuthor = manifest.author;
                manifestPermlink = manifest.permlink;
                posted += 1;
                if (!plan.inline && this._uploads) {
                    this._uploads.save({ author: manifestAuthor, permlink: manifestPermlink, contentHash: plan.contentHash });
                }
                report({ ...state, done: posted });
            }
            for (const { index, edit } of pendingParts) {
                await this._announcer.postContentPart({ manifestPermlink, index, count: plan.slices.length, data: plan.slices[index], edit });
                posted += 1;
                report({ ...state, done: posted });
            }
        } catch (error) {
            report({ ...state, phase: 'failed', done: posted });
            if (posted === 0) {
                throw STEEM_RC_REFUSAL.test(error?.message ?? '')
                    ? new Error('Steem refused the post: your Steem account ran out of Resource Credits. They refill over five days; try again later, or choose IPFS or Arweave storage.')
                    : error;
            }
            throw new SteemContentUploadIncompleteError({ done: posted, total, failedPost: posted + 1, cause: error });
        }

        if (this._uploads && manifestAuthor) this._uploads.remove(manifestAuthor, plan.contentHash);
        report({ ...state, phase: 'stored', done: total });
        return new ContentReference({ ...reference.toJSON(), uri: steemContentLocator(manifestAuthor, manifestPermlink) });
    }

    // The unfinished upload of this content by this account, if one is
    // remembered and the chain still matches the plan: its manifest, and the
    // parts still to post (missing ones) or to fix (changed ones).
    async _findResumable(author, plan) {
        if (!this._uploads || plan.inline) return null;
        const record = this._uploads.get(author, plan.contentHash);
        if (!record) return null;
        try {
            const post = await this._rpc.getContent(author, record.permlink);
            const { manifest } = describeSteemContentManifest(post, { threadAccounts: this._threadAccounts });
            const matches = manifest
                && manifest.author === author
                && manifest.version === STEEM_CONTENT_MANIFEST_VERSION
                && manifest.contentHash === plan.contentHash
                && manifest.encoding === plan.encoding
                && manifest.parts.length === plan.parts.length
                && manifest.parts.every((part, index) => part.length === plan.parts[index].length && part.sha256 === plan.parts[index].sha256);
            if (!matches) {
                this._uploads.remove(author, plan.contentHash);
                return null;
            }
            const posts = await this._readParts(manifest);
            const pendingParts = [];
            manifest.parts.forEach((_, index) => {
                const partPost = posts[index];
                if (steemContentPartProblem(partPost, manifest, index) === null && steemContentPartData(partPost, manifest.version) === plan.slices[index]) return;
                pendingParts.push({ index, edit: Boolean(partPost?.author) });
            });
            return { author, permlink: manifest.permlink, pendingParts };
        } catch {
            // Can't tell what is there; a fresh upload is always correct.
            return null;
        }
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
            throw Object.assign(new ContentUnavailableError(`Couldn't read ${where} from Steem: ${error.message}`), { cause: error });
        }
        const { manifest, problem } = describeSteemContentManifest(post, { threadAccounts: this._threadAccounts });
        if (!manifest) throw new ContentUnavailableError(`${where} can't be loaded: ${problem}.`);
        if (reference.hash && manifest.contentHash !== reference.hash) {
            throw new ContentUnavailableError(`${where} stores different content (content hash ${manifest.contentHash}, expected ${reference.hash}).`);
        }
        if (manifest.size > this._maxDecodedBytes) {
            throw new ContentUnavailableError(`${where} says its content is ${manifest.size} bytes, more than ForkBuild loads.`);
        }

        let encoded = manifest.data;
        if (!manifest.inline) {
            let posts;
            try {
                posts = await this._readParts(manifest);
            } catch (error) {
                throw Object.assign(new ContentUnavailableError(`Couldn't read the parts of ${where} from Steem: ${error.message}`), { cause: error });
            }
            const bodies = [];
            for (let index = 0; index < manifest.parts.length; index++) {
                const partProblem = steemContentPartProblem(posts[index], manifest, index);
                if (partProblem) throw new ContentUnavailableError(`${where} can't be loaded: ${partProblem}. The upload may not have finished.`);
                const data = steemContentPartData(posts[index], manifest.version);
                if (await sha256Hex(data) !== manifest.parts[index].sha256) {
                    throw new ContentUnavailableError(`${where} can't be loaded: part ${index + 1} of ${manifest.parts.length} has been changed since the content was stored.`);
                }
                bodies.push(data);
            }
            encoded = bodies.join('');
            if (encoded.length !== manifest.encodedLength) {
                throw new ContentUnavailableError(`${where} can't be loaded: its parts don't add up to the content's length.`);
            }
        }
        try {
            return await decodeSteemContent(encoded, manifest.encoding, manifest.size);
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

    // Each listed part's post, or null: one get_content_replies for all of
    // them, then get_content for any it didn't return.
    async _readParts(manifest) {
        let replies = [];
        if (typeof this._rpc.getContentReplies === 'function') {
            try {
                replies = await this._rpc.getContentReplies(manifest.author, manifest.permlink);
            } catch {
                replies = [];
            }
        }
        const byPermlink = new Map();
        for (const reply of Array.isArray(replies) ? replies : []) {
            if (reply?.author === manifest.author) byPermlink.set(reply.permlink, reply);
        }
        return Promise.all(manifest.parts.map(async (part) => {
            if (byPermlink.has(part.permlink)) return byPermlink.get(part.permlink);
            const post = await this._rpc.getContent(manifest.author, part.permlink);
            return post?.author ? post : null;
        }));
    }
}

// What will be posted: the encoded content, inline when it fits one post,
// otherwise gzip-base64 split into parts with their hashes. Throws
// SteemContentTooLargeError when it would need more than the most parts.
export async function planSteemContentUpload(text) {
    const size = new TextEncoder().encode(text).length;
    const contentHash = computeContentHash(text);
    let { encoding, encoded } = await encodeSteemContent(text);
    const inline = steemContentEncodedByteLength(encoded) <= STEEM_CONTENT_PART_MAX_BYTES;
    if (!inline && encoding !== 'gzip-base64') {
        encoding = 'gzip-base64';
        encoded = await gzipBase64(text);
    }
    if (!inline && encoded.length > MAX_ENCODED_BYTES - 2 * STEEM_CONTENT_MAX_PARTS) {
        throw new SteemContentTooLargeError(steemContentEncodedByteLength(encoded), MAX_ENCODED_BYTES);
    }
    const slices = inline ? [] : splitSteemContent(encoded);
    const parts = await Promise.all(slices.map(async (slice) => Object.freeze({ length: slice.length, sha256: await sha256Hex(slice) })));
    return Object.freeze({ text, size, contentHash, encoding, encoded, inline, slices, parts });
}

function manifestContent(plan, manifestPermlink) {
    return {
        contentHash: plan.contentHash,
        algorithm: 'fnv1a-32',
        mediaType: 'application/json',
        size: plan.size,
        encoding: plan.encoding,
        encodedLength: plan.encoded.length,
        parts: manifestPermlink === null
            ? plan.parts
            : plan.parts.map((part, index) => ({ ...part, permlink: steemContentPartPermlink(manifestPermlink, index) }))
    };
}

async function sha256Hex(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Picks whichever encoding is shorter once escaped for the operations:
// plain text, or gzip then base64. Plain text is never used when it is empty
// (the chain refuses an empty body) or starts with "@@ " (API nodes read that
// as an edit patch).
export async function encodeSteemContent(text) {
    const base64 = await gzipBase64(text);
    const plainUsable = text.length > 0 && !text.startsWith('@@ ');
    return !plainUsable || steemContentEncodedByteLength(base64) < steemContentEncodedByteLength(text)
        ? { encoding: 'gzip-base64', encoded: base64 }
        : { encoding: 'utf8', encoded: text };
}

async function gzipBase64(text) {
    return bytesToBase64(await transform(new TextEncoder().encode(text), new CompressionStream('gzip'), Infinity));
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
