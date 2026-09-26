import {
    STEEM_DISCOVERY_THREAD_ACCOUNT,
    isSteemDiscoveryFamily,
    isSteemDiscoveryPeriod,
    steemDiscoveryPeriodOf,
    steemDiscoveryPeriodsFrom,
    steemDiscoveryThreadPermlink
} from '../../core/SteemDiscoveryThread.js';
import { parseSteemDiscoveryAnnouncement } from '../../core/SteemDiscoveryAnnouncement.js';
import { DEFAULT_STEEM_EARLIEST_PERIOD } from '../../core/SteemReadingConfiguration.js';

// Reads one family's announcements from every configured thread account's
// monthly discovery threads (docs/Protocol.md, "Proposed: Steem Announcement
// Substrate", "Reading"). It returns candidates only: each envelope still
// goes through its family's own parser and verifier.

export const DEFAULT_STEEM_MAX_REPLIES_PER_THREAD = 2000;
// Bounds the requests a single read makes as the years pass.
export const DEFAULT_STEEM_MAX_PERIODS = 36;
const DEFAULT_CONCURRENCY = 4;
// Announcers only reply to the current month's thread, so an earlier
// month's replies rarely change. The current month is cached only long
// enough to absorb a burst, such as place naming asking region by region.
const DEFAULT_PAST_PERIOD_CACHE_MS = 10 * 60 * 1000;
const DEFAULT_CURRENT_PERIOD_CACHE_MS = 30 * 1000;

export const SteemDiscoveryReadOutcome = Object.freeze({
    FOUND: 'found',
    EMPTY: 'empty',
    UNAVAILABLE: 'unavailable'
});

// The periods to read: from `earliestPeriod` up to the current UTC month,
// at most `maxPeriods` of the most recent.
export function steemDiscoveryPeriodsToRead({ earliestPeriod, now, maxPeriods = DEFAULT_STEEM_MAX_PERIODS }) {
    if (!isSteemDiscoveryPeriod(earliestPeriod)) return [];
    const current = steemDiscoveryPeriodOf(now);
    if (earliestPeriod > current) return [];
    const count = monthIndex(current) - monthIndex(earliestPeriod) + 1;
    const skipped = Math.max(0, count - maxPeriods);
    return steemDiscoveryPeriodsFrom(earliestPeriod, count).slice(skipped);
}

export function createSteemDiscoveryThreadReader({
    rpc,
    threadAccounts = [STEEM_DISCOVERY_THREAD_ACCOUNT],
    earliestPeriod = DEFAULT_STEEM_EARLIEST_PERIOD,
    now = () => new Date(),
    clock = () => Date.now(),
    maxRepliesPerThread = DEFAULT_STEEM_MAX_REPLIES_PER_THREAD,
    maxPeriods = DEFAULT_STEEM_MAX_PERIODS,
    concurrency = DEFAULT_CONCURRENCY,
    pastPeriodCacheMs = DEFAULT_PAST_PERIOD_CACHE_MS,
    currentPeriodCacheMs = DEFAULT_CURRENT_PERIOD_CACHE_MS
} = {}) {
    if (!rpc || typeof rpc.getContentReplies !== 'function') throw new TypeError('a Steem RPC client with getContentReplies() is required');
    const accounts = [...new Set(Array.isArray(threadAccounts) ? threadAccounts : [])];
    const cache = new Map();

    async function repliesOf(threadAccount, threadPermlink, isPast) {
        const key = `${threadAccount}/${threadPermlink}`;
        const cached = cache.get(key);
        if (cached && clock() - cached.at < (isPast ? pastPeriodCacheMs : currentPeriodCacheMs)) return cached.replies;
        const replies = await rpc.getContentReplies(threadAccount, threadPermlink);
        if (!Array.isArray(replies)) throw new Error(`get_content_replies for @${key} did not return a list`);
        cache.set(key, { at: clock(), replies });
        return replies;
    }

    // Resolves to `{ outcome, announcements, threadsRead, threadsUnavailable,
    // threadsTruncated }` and never rejects: a thread that can't be read is
    // counted, not thrown. A thread that doesn't exist reads as no replies.
    async function read(family) {
        if (!isSteemDiscoveryFamily(family)) throw new TypeError(`unknown Steem discovery family: ${family}`);
        const current = steemDiscoveryPeriodOf(now());
        const threads = steemDiscoveryPeriodsToRead({ earliestPeriod, now: now(), maxPeriods }).flatMap((period) => (
            accounts.map((threadAccount) => ({ threadAccount, period, threadPermlink: steemDiscoveryThreadPermlink(family, period) }))
        ));

        const announcements = [];
        const unavailable = [];
        const truncated = [];
        await forEachLimited(threads, concurrency, async (thread) => {
            let replies;
            try {
                replies = await repliesOf(thread.threadAccount, thread.threadPermlink, thread.period < current);
            } catch (error) {
                unavailable.push({ ...thread, reason: error?.message ?? String(error) });
                return;
            }
            // The newest replies matter most, so an oversized thread keeps its tail.
            if (replies.length > maxRepliesPerThread) truncated.push(thread);
            for (const reply of replies.slice(-maxRepliesPerThread)) {
                const announcement = parseSteemDiscoveryAnnouncement(reply, { ...thread, family });
                if (announcement) announcements.push(Object.freeze({ ...announcement, threadAccount: thread.threadAccount, period: thread.period }));
            }
        });

        // Threads are read in parallel; report in a stable order regardless.
        announcements.sort((a, b) => compare(a.period, b.period) || compare(a.created ?? '', b.created ?? '')
            || compare(a.threadAccount, b.threadAccount) || compare(a.permlink, b.permlink));

        const allUnavailable = threads.length > 0 && unavailable.length === threads.length;
        return Object.freeze({
            outcome: allUnavailable
                ? SteemDiscoveryReadOutcome.UNAVAILABLE
                : (announcements.length > 0 ? SteemDiscoveryReadOutcome.FOUND : SteemDiscoveryReadOutcome.EMPTY),
            announcements: Object.freeze(announcements),
            threadsRead: threads.length - unavailable.length,
            threadsUnavailable: Object.freeze(unavailable),
            threadsTruncated: Object.freeze(truncated)
        });
    }

    return Object.freeze({ read, threadAccounts: Object.freeze(accounts), earliestPeriod });
}

function compare(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
}

function monthIndex(period) {
    const [year, month] = period.split('-').map(Number);
    return year * 12 + month - 1;
}

async function forEachLimited(items, limit, task) {
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const item = items[next];
            next += 1;
            await task(item);
        }
    });
    await Promise.all(workers);
}
