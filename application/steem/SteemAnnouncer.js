import {
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

// Posts one family's envelope as a reply to the current month's discovery
// thread, signed through Steem Keychain (docs/Protocol.md, "Proposed: Steem
// Announcement Substrate", "Announcing"). Every refusal is an Error with a
// message a person can act on; nothing is retried or sent elsewhere.

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

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
    randomSuffix = defaultRandomSuffix
} = {}) {
    if (!rpc || typeof rpc.getContent !== 'function') throw new TypeError('a Steem RPC client is required');
    if (typeof getBroadcaster !== 'function') throw new TypeError('getBroadcaster must be a function');
    if (typeof getAccount !== 'function') throw new TypeError('getAccount must be a function');
    // A thread, once seen open, stays open for the session: only its owner
    // can close it, and the chain would then refuse the reply anyway.
    const openThreads = new Set();

    async function requireOpenThread(threadPermlink) {
        if (openThreads.has(threadPermlink)) return;
        let content;
        try {
            content = await rpc.getContent(threadAccount, threadPermlink);
        } catch (error) {
            throw new SteemAnnouncementError(`Couldn't check this month's Steem discovery thread: ${error.message}`);
        }
        if (!content || !content.author) {
            throw new SteemAnnouncementError(`This month's Steem discovery thread @${threadAccount}/${threadPermlink} doesn't exist yet, so nothing can be announced on Steem until it is created.`);
        }
        if (content.allow_replies !== true) {
            throw new SteemAnnouncementError(`The Steem discovery thread @${threadAccount}/${threadPermlink} no longer accepts replies.`);
        }
        openThreads.add(threadPermlink);
    }

    // Resolves to what was broadcast. "accepted" means an API node took the
    // transaction; it is not yet irreversible.
    async function announce(family, envelope) {
        const author = getAccount();
        if (!isSteemAccountName(author)) {
            throw new SteemAnnouncementError('Set your Steem account in Network Settings → Steem before announcing on Steem.');
        }
        const broadcaster = getBroadcaster();
        if (!broadcaster) {
            throw new SteemAnnouncementError('Steem Keychain was not found. Install it, add your Steem account with its posting key, and reload.');
        }
        const period = steemDiscoveryPeriodOf(now());
        const threadPermlink = steemDiscoveryThreadPermlink(family, period);
        await requireOpenThread(threadPermlink);

        const permlink = steemDiscoveryAnnouncementPermlink(now().getTime(), randomSuffix());
        const operations = steemDiscoveryAnnouncementOperations({ author, threadAccount, threadPermlink, family, envelope, permlink, appVersion });
        const size = steemOperationsByteLength(operations);
        if (size > STEEM_MAX_TRANSACTION_BYTES) {
            throw new SteemAnnouncementError(`This announcement is ${size} bytes, over Steem's ${STEEM_MAX_TRANSACTION_BYTES}-byte transaction limit.`);
        }

        const { transactionId } = await broadcaster.broadcast(author, operations);
        return Object.freeze({
            status: 'accepted',
            author,
            permlink,
            threadAccount,
            threadPermlink,
            period,
            transactionId,
            id: `@${author}/${permlink}`,
            url: `https://steemit.com/@${author}/${permlink}`,
            threadUrl: `https://steemit.com/@${threadAccount}/${threadPermlink}`
        });
    }

    return Object.freeze({ announce, threadAccount });
}

function defaultRandomSuffix() {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join('');
}
