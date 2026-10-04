import { ContentStore, ContentTooLargeError } from './ContentStore.js';
import { ContentUnavailableError } from './IpfsContentStore.js';
import { SteemContentTooLargeError, decodeSteemContent, planSteemContentUpload } from './SteemContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { CONTENT_HASH_ALGORITHM } from '../serializer/contentHash.js';
import { blurtPublicationViewUrl } from '../core/ForkBuildAppLinks.js';
import {
    BLURT_CONTENT_MAX_PARTS,
    BLURT_CONTENT_PART_MAX_BYTES,
    BLURT_STORAGE,
    blurtBuildPostOperation,
    blurtContentLocator,
    blurtContentManifestOperation,
    blurtContentManifestPermlink,
    blurtContentPartData,
    blurtContentPartOperation,
    blurtContentPartPermlink,
    blurtContentPartProblem,
    describeBlurtContentManifest,
    emptyBlurtBuildPost,
    parseBlurtContentLocator
} from '../core/BlurtPost.js';

// Stores content on Blurt (docs/Protocol.md, "Proposed: Blurt Substrate",
// "Content"): a manifest replying to the poster's current build post,
// holding the encoded content itself when it fits one post, and otherwise
// listing up to 20 parts that follow as replies to it. The encoding, limits
// and resuming are Steem's (content/SteemContentStore.js); what differs is
// where the posts go, that they keep their payout, and that each costs a
// fee in BLURT, checked against the account's balance before posting when
// the node can say.
//
// Blurt is only a carrier. get() returns the decoded text and the caller
// checks it against the content hash, as for every other store.

const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const MAX_ENCODED_BYTES = BLURT_CONTENT_PART_MAX_BYTES * BLURT_CONTENT_MAX_PARTS;
// Stand-ins of the real names, for estimating fees before they exist.
const ESTIMATE_BUILD_POST_PERMLINK = 'forkbuild-mfs0d000-aaaaaaaa';
const ESTIMATE_MANIFEST_PERMLINK = blurtContentManifestPermlink(1790000000000, 'aaaaaaaa');
const FEE_REFUSAL = /sufficient funds for transaction fee|enough BLURT/i;

export class BlurtContentTooLargeError extends ContentTooLargeError {
    constructor(encodedBytes, maxEncodedBytes) {
        super(encodedBytes, maxEncodedBytes, 'Blurt');
        this.name = 'BlurtContentTooLargeError';
        this.message = `This build is ${formatKilobytes(encodedBytes)} even compressed, more than the ${formatKilobytes(maxEncodedBytes)} Blurt storage holds (${BLURT_CONTENT_MAX_PARTS} posts). Choose IPFS or Arweave storage to distribute it.`;
    }
}

// Refused before posting: the estimate says the account can't pay the fees.
export class BlurtFeeError extends Error {
    constructor(estimate) {
        super(`Storing this build on Blurt costs about ${estimate.neededText} in fees, and your account has ${estimate.balanceText}. Add BLURT to the account, or choose IPFS or Arweave storage.`);
        this.name = 'BlurtFeeError';
        this.estimate = estimate;
    }
}

// Some posts were made and a later one failed. Storing the same content
// again with the same account posts only what is missing.
export class BlurtContentUploadIncompleteError extends Error {
    constructor({ done, total, failedPost, cause }) {
        const reason = FEE_REFUSAL.test(cause?.message ?? '')
            ? 'your Blurt account ran out of BLURT for the transaction fees'
            : (cause?.message ?? 'unknown error').replace(/\.$/, '');
        super(`Post ${failedPost} of ${total} on Blurt failed: ${reason}. ${done} of ${total} posts are stored; distribute again with the same Blurt account to make only the missing ones.`);
        this.name = 'BlurtContentUploadIncompleteError';
        this.done = done;
        this.total = total;
        this.cause = cause;
    }
}

export class BlurtContentStore extends ContentStore {
    // `rpc` reads posts (blurt/BlurtRpcClient.js). `poster` posts them
    // (application/blurt/BlurtPoster.js), so content, announcements and
    // anchors share one queue. `uploads` remembers unfinished uploads
    // (storage/BlurtContentUploadStore.js); `estimator` checks fees
    // (application/blurt/BlurtFeeEstimator.js); `progress` hears every
    // upload's progress. All three are optional. `describePublication(claim)`,
    // when given, is asked for a Signed Claim's card before it is posted.
    constructor({ rpc, poster = null, uploads = null, estimator = null, progress = null, maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES, describePublication = null } = {}) {
        super();
        if (!rpc || typeof rpc.getContent !== 'function') throw new TypeError('BlurtContentStore: a Blurt RPC client is required');
        if (poster !== null && (typeof poster.postContent !== 'function' || typeof poster.postContentPart !== 'function')) {
            throw new TypeError('BlurtContentStore: the poster must have postContent() and postContentPart()');
        }
        this._rpc = rpc;
        this._poster = poster;
        this._uploads = uploads;
        this._estimator = estimator;
        this._progress = progress;
        this._maxDecodedBytes = maxDecodedBytes;
        this._describePublication = typeof describePublication === 'function' ? describePublication : null;
    }

    get storage() { return BLURT_STORAGE; }

    // The limit applies to the encoded content, which is only known after
    // compressing, so put() checks it rather than the caller.
    get maxContentBytes() { return Infinity; }

    // `onProgress` hears `{ phase, done, total, resumed, fees }` for this
    // upload: phase 'describing' (a Signed Claim's card), 'checking', then
    // 'posting' after each post, then 'stored' or 'failed'. `fees` is
    // `{ needed, balance }` as text when the node could say.
    async put(bytes, { onProgress = null, kind = null } = {}) {
        if (!this._poster) throw new Error('Storing content on Blurt is not available.');
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
        const plan = await planBlurtContentUpload(text);
        const linkToView = kind === 'publication' && plan.inline;
        const author = typeof this._poster.currentAccount === 'function' ? this._poster.currentAccount() : null;
        const total = plan.slices.length + 1;
        const resume = author ? await this._findResumable(author, plan) : null;
        const pendingParts = resume ? resume.pendingParts : plan.slices.map((_, index) => ({ index }));
        const done = resume ? total - pendingParts.length : 0;
        let card = null;
        if (linkToView && this._describePublication) {
            report({ phase: 'describing', done, total, resumed: false, fees: null });
            card = await describeClaim(this._describePublication, text);
        }
        let state = { phase: 'checking', done, total, resumed: Boolean(resume), fees: null };
        report(state);

        if (author && this._estimator && (!resume || pendingParts.length > 0)) {
            const startsBuildPost = !resume && (typeof this._poster.willStartBuildPost !== 'function' || this._poster.willStartBuildPost());
            const transactions = [
                ...(startsBuildPost ? [[blurtBuildPostOperation({ author, permlink: ESTIMATE_BUILD_POST_PERMLINK, state: { ...emptyBlurtBuildPost(), storedCount: 1 } })]] : []),
                ...(resume ? [] : [[blurtContentManifestOperation({
                    author, parentPermlink: ESTIMATE_BUILD_POST_PERMLINK, permlink: ESTIMATE_MANIFEST_PERMLINK,
                    content: manifestContent(plan, ESTIMATE_MANIFEST_PERMLINK), data: plan.inline ? plan.encoded : undefined,
                    viewUrl: linkToView ? blurtPublicationViewUrl(author, ESTIMATE_MANIFEST_PERMLINK) : null,
                    card
                })]]),
                ...pendingParts.map(({ index }) => [blurtContentPartOperation({
                    author, manifestPermlink: ESTIMATE_MANIFEST_PERMLINK, index, count: plan.slices.length, data: plan.slices[index]
                })])
            ];
            const estimate = await this._estimator.estimate(author, transactions).catch(() => null);
            if (estimate) {
                state = { ...state, fees: { needed: estimate.neededText, balance: estimate.balanceText } };
                if (!estimate.enough) {
                    report({ ...state, phase: 'failed' });
                    throw new BlurtFeeError(estimate);
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
                const manifest = await this._poster.postContent({
                    content: { ...manifestContent(plan, null), parts: plan.parts },
                    data: plan.inline ? plan.encoded : undefined,
                    linkToView,
                    card
                });
                manifestAuthor = manifest.author;
                manifestPermlink = manifest.permlink;
                posted += 1;
                if (!plan.inline && this._uploads) {
                    this._uploads.save({ author: manifestAuthor, permlink: manifestPermlink, contentHash: plan.contentHash });
                }
                report({ ...state, done: posted });
            }
            for (const { index } of pendingParts) {
                await this._poster.postContentPart({ manifestPermlink, index, count: plan.slices.length, data: plan.slices[index] });
                posted += 1;
                report({ ...state, done: posted });
            }
        } catch (error) {
            report({ ...state, phase: 'failed', done: posted });
            if (posted === 0) throw error;
            throw new BlurtContentUploadIncompleteError({ done: posted, total, failedPost: posted + 1, cause: error });
        }

        if (this._uploads && manifestAuthor) this._uploads.remove(manifestAuthor, plan.contentHash);
        report({ ...state, phase: 'stored', done: total });
        return new ContentReference({
            hash: plan.contentHash,
            algorithm: CONTENT_HASH_ALGORITHM,
            mediaType: 'application/json',
            size: plan.size,
            storage: BLURT_STORAGE,
            uri: blurtContentLocator(manifestAuthor, manifestPermlink)
        });
    }

    // The unfinished upload of this content by this account, if one is
    // remembered and the chain still matches the plan: its manifest, and the
    // parts still to post (missing ones) or to fix (changed ones, which
    // posting again edits).
    async _findResumable(author, plan) {
        if (!this._uploads || plan.inline) return null;
        const record = this._uploads.get(author, plan.contentHash);
        if (!record) return null;
        try {
            const post = await this._rpc.getContent(author, record.permlink);
            const { manifest } = describeBlurtContentManifest(post);
            const matches = manifest
                && manifest.author === author
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
                if (blurtContentPartProblem(partPost, manifest, index) === null && blurtContentPartData(partPost) === plan.slices[index]) return;
                pendingParts.push({ index });
            });
            return { author, permlink: manifest.permlink, pendingParts };
        } catch {
            // Can't tell what is there; a fresh upload is always correct.
            return null;
        }
    }

    // null when the reference isn't a `blurt://` locator (the wrong store was
    // asked); ContentUnavailableError for anything that stops the content
    // from being read, never a silent null.
    async get(reference) {
        const location = parseBlurtContentLocator(reference && reference.uri);
        if (location === null) return null;
        const where = `@${location.author}/${location.permlink}`;

        let post;
        try {
            post = await this._rpc.getContent(location.author, location.permlink);
        } catch (error) {
            throw Object.assign(new ContentUnavailableError(`Couldn't read ${where} from Blurt: ${error.message}`), { cause: error });
        }
        const { manifest, problem } = describeBlurtContentManifest(post);
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
                throw Object.assign(new ContentUnavailableError(`Couldn't read the parts of ${where} from Blurt: ${error.message}`), { cause: error });
            }
            const slices = [];
            for (let index = 0; index < manifest.parts.length; index++) {
                const partProblem = blurtContentPartProblem(posts[index], manifest, index);
                if (partProblem) throw new ContentUnavailableError(`${where} can't be loaded: ${partProblem}. The upload may not have finished.`);
                const data = blurtContentPartData(posts[index]);
                if (await sha256Hex(data) !== manifest.parts[index].sha256) {
                    throw new ContentUnavailableError(`${where} can't be loaded: part ${index + 1} of ${manifest.parts.length} has been changed since the content was stored.`);
                }
                slices.push(data);
            }
            encoded = slices.join('');
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

// What will be posted, exactly as on Steem: the encoded content, inline when
// it fits one post, otherwise gzip-base64 split into parts with their
// hashes. Throws BlurtContentTooLargeError when it would need more than the
// most parts.
export async function planBlurtContentUpload(text) {
    try {
        return await planSteemContentUpload(text);
    } catch (error) {
        if (error instanceof SteemContentTooLargeError) throw new BlurtContentTooLargeError(error.contentBytes, MAX_ENCODED_BYTES);
        throw error;
    }
}

// A Signed Claim's card, or null when there is none or describing it
// failed: a card only makes the notice richer, so it never stops a post.
async function describeClaim(describePublication, text) {
    try {
        const card = await describePublication(JSON.parse(text));
        return card && typeof card === 'object' ? card : null;
    } catch (error) {
        console.warn('The Blurt post will have no picture or description:', error?.message ?? error);
        return null;
    }
}

function manifestContent(plan, manifestPermlink) {
    return {
        contentHash: plan.contentHash,
        algorithm: CONTENT_HASH_ALGORITHM,
        mediaType: 'application/json',
        size: plan.size,
        encoding: plan.encoding,
        encodedLength: plan.encoded.length,
        parts: manifestPermlink === null
            ? plan.parts
            : plan.parts.map((part, index) => ({ ...part, permlink: blurtContentPartPermlink(manifestPermlink, index) }))
    };
}

async function sha256Hex(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function formatKilobytes(bytes) {
    return `${Math.ceil(bytes / 1024)} KB`;
}
