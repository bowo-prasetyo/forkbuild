import {
    BLURT_BUILD_POST_MAX_BYTES,
    BLURT_MAX_TRANSACTION_BYTES,
    blurtBuildPostHasRoom,
    blurtBuildPostOperation,
    blurtBuildPostPermlink,
    blurtContentManifestOperation,
    blurtContentManifestPermlink,
    blurtContentPartOperation,
    blurtContentPartPermlink,
    blurtFamilyTag,
    blurtOperationsByteLength,
    blurtPostCommitments,
    blurtPostUrl,
    blurtTagUrl,
    emptyBlurtBuildPost,
    isBlurtAccountName,
    isBlurtFamily
} from '../../core/BlurtPost.js';
import { blurtBatchAnchorOperations } from '../../core/BlurtAnchor.js';
import { blurtPublicationViewUrl, publicationViewUrl } from '../../core/ForkBuildAppLinks.js';
import { parseBlurtTime } from '../../blurt/BlurtRpcClient.js';

// Posts everything ForkBuild puts on Blurt from the poster's own account
// (docs/Protocol.md, "Proposed: Blurt Substrate"): announcements and single
// anchors go into a build post, a top-level post that keeps its payout;
// stored content is a reply under one. The build post made most recently
// in this session is edited to take more, for up to 30 minutes, so one
// Distribute makes one top-level post and never waits out the chain's
// 5-minute interval between top-level posts. Every post goes through one
// queue, paced to the chain's intervals, and is signed through Blurt
// Keychain. Every refusal is an Error with a message a person can act on.

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const BLURT_BUILD_POST_GROUPING_MS = 30 * 60 * 1000;
// BLURT_MIN_REPLY_INTERVAL_HF20 and BLURT_MIN_ROOT_COMMENT_INTERVAL; an edit
// is held to one per block, which the reply pacing covers.
export const BLURT_MIN_REPLY_INTERVAL_MS = 3000;
export const BLURT_MIN_ROOT_POST_INTERVAL_MS = 5 * 60 * 1000;
// Node and local clocks differ, and a Keychain approval can land a post
// later than we saw it return.
const DEFAULT_MARGIN_MS = 1500;
const INTERVAL_REFUSAL = /once every|one comment edit per block/i;
const FEE_REFUSAL = /sufficient funds for transaction fee/i;

export class BlurtPostingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BlurtPostingError';
    }
}

// `records` (storage/BlurtPostRecordStore.js), when given, remembers which
// transaction committed to which contentHash, so an anchor can reuse it.
// `onWaiting({ untilMs, reason })` hears when a post waits for the chain's
// interval.
export function createBlurtPoster({
    rpc,
    getBroadcaster,
    getAccount,
    appVersion = null,
    records = null,
    onWaiting = null,
    now = () => new Date(),
    clock = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    marginMs = DEFAULT_MARGIN_MS,
    randomSuffix = defaultRandomSuffix
} = {}) {
    if (!rpc || typeof rpc.getAccount !== 'function') throw new TypeError('a Blurt RPC client is required');
    if (typeof getBroadcaster !== 'function') throw new TypeError('getBroadcaster must be a function');
    if (typeof getAccount !== 'function') throw new TypeError('getAccount must be a function');
    let queue = Promise.resolve();
    let lastBroadcastAt = -Infinity;
    let lastRootPostAt = -Infinity;
    // The build post this session may still group into: `{ author, permlink,
    // createdAt, state }`.
    let current = null;
    const committed = new Map();

    // Resolves to what was broadcast. "accepted" means an API node took the
    // transaction; it is not yet irreversible.
    function announce(family, envelope) {
        if (!isBlurtFamily(family)) throw new TypeError(`unknown Blurt family: ${family}`);
        return enqueue(() => withPoster(async ({ author, broadcaster }) => {
            const posted = await updateBuildPost(author, broadcaster, (state) => {
                if (!blurtBuildPostHasRoom(state, { announcement: true })) return null;
                const viewUrl = family === 'publication' ? (viewUrlForLocator(envelope?.uri) ?? state.viewUrl) : state.viewUrl;
                return { ...state, announcements: [...state.announcements, { family, envelope }], viewUrl };
            }, 'announcement');
            return Object.freeze({ ...posted, threadUrl: blurtTagUrl(blurtFamilyTag(family)) });
        }));
    }

    // Adds `contentHash` to a build post's anchors and resolves like
    // announce(): the transaction is the anchor.
    function postAnchor(contentHash) {
        return enqueue(() => withPoster(({ author, broadcaster }) => updateBuildPost(author, broadcaster, (state) => {
            if (!blurtBuildPostHasRoom(state, { anchor: true })) return null;
            return { ...state, anchors: [...state.anchors, contentHash] };
        }, 'anchor')));
    }

    // A batch anchor: one custom_json, which no build post can stand in for.
    function postBatchAnchor({ merkleRoot, count }) {
        return enqueue(() => withPoster(async ({ author, broadcaster }) => {
            const operations = blurtBatchAnchorOperations({ account: author, merkleRoot, count });
            const { transactionId, blockNum } = await broadcastPaced(broadcaster, author, operations, { root: false });
            return Object.freeze({ status: 'accepted', author, transactionId: transactionId ?? null, blockNum: blockNum ?? null });
        }));
    }

    // Posts a content manifest as a reply to the current build post (making
    // one first when there is none to group with). `data` is the encoded
    // content when it is inline; `content.parts` lists `{ length, sha256 }`
    // per part, whose permlinks follow from the manifest's. `linkToView`
    // links the notice to the app's view, for a Signed Claim, and `card`
    // adds the build's picture and words, there and on the build post.
    function postContent({ content, data, linkToView = false, card = null }) {
        return enqueue(() => withPoster(async ({ author, broadcaster }) => {
            const permlink = blurtContentManifestPermlink(now().getTime(), randomSuffix());
            const viewUrl = linkToView ? blurtPublicationViewUrl(author, permlink) : null;
            const addTo = (state) => ({ ...state, storedCount: state.storedCount + 1, ...(viewUrl ? { viewUrl, card: card ?? state.card } : {}) });
            const grouped = isGroupable(author);
            const parentPermlink = grouped
                ? current.permlink
                : (await newBuildPost(author, broadcaster, addTo(emptyBlurtBuildPost()), 'content')).permlink;
            const operation = blurtContentManifestOperation({
                author, parentPermlink, permlink, data, appVersion, viewUrl, card: viewUrl ? card : null,
                content: { ...content, parts: content.parts.map((part, index) => ({ ...part, permlink: blurtContentPartPermlink(permlink, index) })) }
            });
            const posted = await broadcastPost(author, broadcaster, [operation], { what: 'content', root: false });
            // Shown at the build post's next edit; content alone doesn't edit it.
            if (grouped && current?.permlink === parentPermlink) current = { ...current, state: addTo(current.state) };
            return posted;
        }));
    }

    // Posts part `index` of `count` as a reply to the manifest, which must be
    // the current account's. Posting a part that exists edits it.
    function postContentPart({ manifestPermlink, index, count, data }) {
        return enqueue(() => withPoster(({ author, broadcaster }) => {
            const operation = blurtContentPartOperation({ author, manifestPermlink, index, count, data, appVersion });
            return broadcastPost(author, broadcaster, [operation], { what: `content part ${index + 1} of ${count}`, root: false });
        }));
    }

    // A transaction this device made with the current account that commits
    // to `contentHash`, as `{ author, permlink, trxId, blockNum }`, or null.
    function findCommitment(contentHash) {
        const author = currentAccount();
        if (!author) return null;
        return committed.get(`${author}:${contentHash}`) ?? records?.get(author, contentHash) ?? null;
    }

    // Whether storing content now would first make a new build post, for
    // estimating its fee.
    function willStartBuildPost() {
        const author = currentAccount();
        return !author || !isGroupable(author);
    }

    // The account posts would come from right now, or null.
    function currentAccount() {
        const author = getAccount();
        return isBlurtAccountName(author) ? author : null;
    }

    function isGroupable(author) {
        return current !== null && current.author === author && clock() - current.createdAt < BLURT_BUILD_POST_GROUPING_MS;
    }

    // Edits the current build post with `update(state)`, or, when there is
    // none to group with, it is full (`update` returns null), or the edit
    // would be too large, posts a new one.
    async function updateBuildPost(author, broadcaster, update, what) {
        if (isGroupable(author)) {
            const next = update(current.state);
            if (next !== null) {
                const operation = blurtBuildPostOperation({ author, permlink: current.permlink, state: next, appVersion });
                if (blurtOperationsByteLength([operation]) <= BLURT_BUILD_POST_MAX_BYTES) {
                    const posted = await broadcastPost(author, broadcaster, [operation], { what, root: false });
                    current = { ...current, state: next };
                    return Object.freeze({ ...posted, edited: true });
                }
            }
        }
        const state = update(emptyBlurtBuildPost());
        if (state === null) throw new BlurtPostingError(`This ${what} doesn't fit in a Blurt post.`);
        return Object.freeze({ ...(await newBuildPost(author, broadcaster, state, what)), edited: false });
    }

    async function newBuildPost(author, broadcaster, state, what) {
        const permlink = blurtBuildPostPermlink(now().getTime(), randomSuffix());
        const operation = blurtBuildPostOperation({ author, permlink, state, appVersion });
        const posted = await broadcastPost(author, broadcaster, [operation], { what, root: true });
        current = { author, permlink, createdAt: clock(), state };
        return posted;
    }

    async function broadcastPost(author, broadcaster, operations, { what, root }) {
        const size = blurtOperationsByteLength(operations);
        if (size > BLURT_MAX_TRANSACTION_BYTES) {
            throw new BlurtPostingError(`This ${what} is ${size} bytes, over Blurt's ${BLURT_MAX_TRANSACTION_BYTES}-byte transaction limit.`);
        }
        const { permlink, json_metadata: jsonMetadata } = operations[0][1];
        const { transactionId, blockNum } = await broadcastPaced(broadcaster, author, operations, { root });
        remember(author, permlink, jsonMetadata, transactionId, blockNum);
        return Object.freeze({
            status: 'accepted',
            author,
            permlink,
            transactionId: transactionId ?? null,
            blockNum: blockNum ?? null,
            id: `@${author}/${permlink}`,
            url: blurtPostUrl(author, permlink)
        });
    }

    function remember(author, permlink, jsonMetadata, transactionId, blockNum) {
        if (typeof transactionId !== 'string') return;
        const record = Object.freeze({ author, permlink, trxId: transactionId, blockNum: Number.isSafeInteger(blockNum) ? blockNum : null });
        for (const contentHash of blurtPostCommitments(jsonMetadata)) {
            committed.set(`${author}:${contentHash}`, record);
            try {
                records?.save(author, contentHash, record);
            } catch {
                // Only lets a later anchor reuse this post; never stops posting.
            }
        }
    }

    // Waits until the account's last post (and last top-level post, for a
    // new one) is an interval old, by the chain and by this poster's own
    // record. A node that can't say is no reason to stop; the chain has the
    // final word.
    async function waitForIntervals(author, { root }) {
        let account = null;
        try {
            account = await rpc.getAccount(author);
        } catch {
            // Fall back to this poster's own record.
        }
        const replyGap = BLURT_MIN_REPLY_INTERVAL_MS + marginMs;
        const chainLastPost = parseBlurtTime(account?.last_post);
        let earliest = Math.max(lastBroadcastAt + replyGap, Number.isFinite(chainLastPost) ? chainLastPost + replyGap : -Infinity);
        let reason = null;
        if (root) {
            const rootGap = BLURT_MIN_ROOT_POST_INTERVAL_MS + marginMs;
            const chainLastRoot = parseBlurtTime(account?.last_root_post);
            const rootEarliest = Math.max(lastRootPostAt + rootGap, Number.isFinite(chainLastRoot) ? chainLastRoot + rootGap : -Infinity);
            if (rootEarliest > earliest) {
                earliest = rootEarliest;
                reason = 'root-interval';
            }
        }
        const wait = earliest - clock();
        if (wait <= 0) return;
        if (reason && typeof onWaiting === 'function') {
            try {
                onWaiting({ untilMs: earliest, reason });
            } catch {
                // Hearing about it never stops a post.
            }
        }
        await sleep(wait);
    }

    async function broadcastPaced(broadcaster, author, operations, { root }) {
        await waitForIntervals(author, { root });
        try {
            return await broadcaster.broadcast(author, operations);
        } catch (error) {
            const message = error?.message ?? '';
            if (FEE_REFUSAL.test(message)) {
                throw new BlurtPostingError(`Blurt refused the post: your account doesn't have enough BLURT to pay its transaction fee (${message}).`);
            }
            // Clocks can still disagree; wait a full interval and try once more.
            if (!INTERVAL_REFUSAL.test(message)) throw error;
            await sleep((root ? BLURT_MIN_ROOT_POST_INTERVAL_MS : BLURT_MIN_REPLY_INTERVAL_MS) + marginMs);
            return await broadcaster.broadcast(author, operations);
        } finally {
            lastBroadcastAt = clock();
            if (root) lastRootPostAt = clock();
        }
    }

    // One post at a time, whoever calls: the intervals are per account.
    function enqueue(task) {
        const run = queue.then(task);
        queue = run.catch(() => {});
        return run;
    }

    async function withPoster(task) {
        const author = getAccount();
        if (!isBlurtAccountName(author)) {
            throw new BlurtPostingError('Set your Blurt account in Network Settings → Blurt before posting on Blurt.');
        }
        const broadcaster = getBroadcaster();
        if (!broadcaster) {
            throw new BlurtPostingError('Blurt Keychain was not found. Install it (or WhaleVault), add your Blurt account with its posting key, and reload.');
        }
        return task({ author, broadcaster });
    }

    return Object.freeze({ announce, postAnchor, postBatchAnchor, postContent, postContentPart, findCommitment, willStartBuildPost, currentAccount });
}

function viewUrlForLocator(locator) {
    try {
        return publicationViewUrl(locator);
    } catch {
        return null;
    }
}

function defaultRandomSuffix() {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join('');
}
