import {
    STEEM_CONTENT_FAMILY,
    STEEM_DISCOVERY_THREAD_ACCOUNT,
    isSteemAccountName,
    steemDiscoveryPeriodOf,
    steemDiscoveryThreadPermlink
} from '../../core/SteemDiscoveryThread.js';
import {
    STEEM_MAX_TRANSACTION_BYTES,
    steemDiscoveryAnnouncementOperations,
    steemDiscoveryAnnouncementPermlink,
    steemOperationsByteLength
} from '../../core/SteemDiscoveryAnnouncement.js';
import { steemContentManifestOperations, steemContentManifestPermlink, steemContentPartOperations, steemContentPartPermlink } from '../../core/SteemContentManifest.js';
import { parseSteemTime } from '../../steem/SteemRpcClient.js';

// Posts one family's envelope as a reply to the current month's discovery
// thread, signed through Steem Keychain (docs/Protocol.md, "Proposed: Steem
// Announcement Substrate", "Announcing"). It also posts stored content to
// the current month's content thread ("Proposed: Steem Content Storage"),
// in the same queue, since the reply interval is per account. Every refusal
// is an Error with a message a person can act on; nothing is sent elsewhere.

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
// The chain accepts one comment per account in this interval
// (STEEM_MIN_REPLY_INTERVAL_HF20). Distribute posts a Snapshot and a
// Publication back to back, so announcements wait their turn.
export const STEEM_MIN_REPLY_INTERVAL_MS = 3000;
// Node and local clocks differ, and a Keychain approval can land a post
// later than we saw it return.
const DEFAULT_REPLY_MARGIN_MS = 1500;
const REPLY_INTERVAL_REFUSAL = /STEEM_MIN_REPLY_INTERVAL|comment once every/i;

export class SteemAnnouncementError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SteemAnnouncementError';
    }
}

export function createSteemAnnouncer({
    rpc,
    getBroadcaster,
    getAccount,
    threadAccount = STEEM_DISCOVERY_THREAD_ACCOUNT,
    appVersion = null,
    now = () => new Date(),
    clock = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    replyMarginMs = DEFAULT_REPLY_MARGIN_MS,
    randomSuffix = defaultRandomSuffix
} = {}) {
    if (!rpc || typeof rpc.getContent !== 'function') throw new TypeError('a Steem RPC client is required');
    if (typeof getBroadcaster !== 'function') throw new TypeError('getBroadcaster must be a function');
    if (typeof getAccount !== 'function') throw new TypeError('getAccount must be a function');
    // A thread, once seen open, stays open for the session: only its owner
    // can close it, and the chain would then refuse the reply anyway.
    const openThreads = new Set();
    let queue = Promise.resolve();
    let lastBroadcastAt = -Infinity;

    // Waits until both this announcer's last post and the account's last
    // post on the chain (from any device) are an interval old. A node that
    // can't say is no reason to stop; the chain has the final word.
    async function waitForReplyInterval(author) {
        let chainLastPost = -Infinity;
        if (typeof rpc.getAccount === 'function') {
            try {
                chainLastPost = parseSteemTime((await rpc.getAccount(author))?.last_post);
            } catch {
                // Fall back to this announcer's own record.
            }
        }
        const gap = STEEM_MIN_REPLY_INTERVAL_MS + replyMarginMs;
        const earliest = Math.max(lastBroadcastAt + gap, Number.isFinite(chainLastPost) ? chainLastPost + gap : -Infinity);
        const wait = earliest - clock();
        if (wait > 0) await sleep(wait);
    }

    async function broadcastPacing(broadcaster, author, operations) {
        await waitForReplyInterval(author);
        try {
            return await broadcaster.broadcast(author, operations);
        } catch (error) {
            // Clocks can still disagree; wait a full interval and try once more.
            if (!REPLY_INTERVAL_REFUSAL.test(error?.message ?? '')) throw error;
            await sleep(STEEM_MIN_REPLY_INTERVAL_MS + replyMarginMs);
            return await broadcaster.broadcast(author, operations);
        } finally {
            lastBroadcastAt = clock();
        }
    }

    async function requireOpenThread(family, threadPermlink) {
        if (openThreads.has(threadPermlink)) return;
        const kind = family === STEEM_CONTENT_FAMILY ? 'content' : 'discovery';
        const action = family === STEEM_CONTENT_FAMILY ? 'stored' : 'announced';
        let content;
        try {
            content = await rpc.getContent(threadAccount, threadPermlink);
        } catch (error) {
            throw new SteemAnnouncementError(`Couldn't check this month's Steem ${kind} thread: ${error.message}`);
        }
        if (!content || !content.author) {
            throw new SteemAnnouncementError(`This month's Steem ${kind} thread @${threadAccount}/${threadPermlink} doesn't exist yet, so nothing can be ${action} on Steem until it is created.`);
        }
        if (content.allow_replies !== true) {
            throw new SteemAnnouncementError(`The Steem ${kind} thread @${threadAccount}/${threadPermlink} no longer accepts replies.`);
        }
        openThreads.add(threadPermlink);
    }

    // Resolves to what was broadcast. "accepted" means an API node took the
    // transaction; it is not yet irreversible.
    function announce(family, envelope) {
        return enqueue(() => postReply({
            family,
            what: 'announcement',
            permlinkFor: (timeMs) => steemDiscoveryAnnouncementPermlink(timeMs, randomSuffix()),
            operationsFor: ({ author, threadPermlink, permlink }) => steemDiscoveryAnnouncementOperations({ author, threadAccount, threadPermlink, family, envelope, permlink, appVersion })
        }));
    }

    // Posts a content manifest: `body` is the encoded content when it is
    // inline, and ignored when `content.parts` lists parts (`{ length,
    // sha256 }` each; their permlinks follow from the manifest's). Resolves
    // like announce().
    function postContent({ content, body }) {
        return enqueue(() => postReply({
            family: STEEM_CONTENT_FAMILY,
            what: 'content',
            permlinkFor: (timeMs) => steemContentManifestPermlink(timeMs, randomSuffix()),
            operationsFor: ({ author, threadPermlink, permlink }) => steemContentManifestOperations({
                author, threadAccount, threadPermlink, permlink, body, appVersion,
                content: { ...content, parts: content.parts.map((part, index) => ({ ...part, permlink: steemContentPartPermlink(permlink, index) })) }
            })
        }));
    }

    // Posts part `index` of `count` as a reply to the manifest, which must be
    // the current account's. `edit` replaces a part already on the chain.
    function postContentPart({ manifestPermlink, index, count, body, edit = false }) {
        return enqueue(() => withPoster(async ({ author, broadcaster }) => {
            const operations = steemContentPartOperations({ author, manifestPermlink, index, count, body, appVersion, withOptions: !edit });
            return broadcastChecked({ author, broadcaster, operations, what: `content part ${index + 1} of ${count}`, parentUrlPath: `@${author}/${manifestPermlink}` });
        }));
    }

    // The account posts would come from right now, or null.
    function currentAccount() {
        const author = getAccount();
        return isSteemAccountName(author) ? author : null;
    }

    // One post at a time, whoever calls: the interval is per account.
    function enqueue(task) {
        const run = queue.then(task);
        queue = run.catch(() => {});
        return run;
    }

    async function postReply({ family, what, permlinkFor, operationsFor }) {
        return withPoster(async ({ author, broadcaster }) => {
            const period = steemDiscoveryPeriodOf(now());
            const threadPermlink = steemDiscoveryThreadPermlink(family, period);
            await requireOpenThread(family, threadPermlink);
            const permlink = permlinkFor(now().getTime());
            const operations = operationsFor({ author, threadPermlink, permlink });
            const posted = await broadcastChecked({ author, broadcaster, operations, what, parentUrlPath: `@${threadAccount}/${threadPermlink}` });
            return Object.freeze({ ...posted, threadAccount, threadPermlink, period });
        });
    }

    async function withPoster(task) {
        const author = getAccount();
        if (!isSteemAccountName(author)) {
            throw new SteemAnnouncementError('Set your Steem account in Network Settings → Steem before posting on Steem.');
        }
        const broadcaster = getBroadcaster();
        if (!broadcaster) {
            throw new SteemAnnouncementError('Steem Keychain was not found. Install it, add your Steem account with its posting key, and reload.');
        }
        return task({ author, broadcaster });
    }

    async function broadcastChecked({ author, broadcaster, operations, what, parentUrlPath }) {
        const size = steemOperationsByteLength(operations);
        if (size > STEEM_MAX_TRANSACTION_BYTES) {
            throw new SteemAnnouncementError(`This ${what} is ${size} bytes, over Steem's ${STEEM_MAX_TRANSACTION_BYTES}-byte transaction limit.`);
        }
        const { permlink } = operations[0][1];
        const { transactionId } = await broadcastPacing(broadcaster, author, operations);
        return Object.freeze({
            status: 'accepted',
            author,
            permlink,
            transactionId,
            id: `@${author}/${permlink}`,
            url: `https://steemit.com/@${author}/${permlink}`,
            threadUrl: `https://steemit.com/${parentUrlPath}`
        });
    }

    return Object.freeze({ announce, postContent, postContentPart, currentAccount, threadAccount });
}

function defaultRandomSuffix() {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join('');
}
