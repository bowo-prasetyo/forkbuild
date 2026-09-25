import {
    STEEM_ROOT_POST_INTERVAL_MS,
    checkSteemDiscoveryThreadContent,
    describeSteemDiscoveryThreadPost,
    steemDiscoveryThreadOperations,
    steemDiscoveryThreadPermlink
} from '../../core/SteemDiscoveryThread.js';
import { parseSteemTime } from '../../steem/SteemRpcClient.js';

// Nodes and clocks disagree by a few seconds; posting early is refused by
// the chain, so wait a little past the interval.
const DEFAULT_MARGIN_MS = 15000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 90000;
const DEFAULT_POLL_INTERVAL_MS = 3000;

// Every family for every period, in the order they would be created: month
// by month, so an interrupted run leaves the nearest months complete.
export function planSteemDiscoveryThreads({ periods, families }) {
    return periods.flatMap((period) => families.map((family) => ({
        family,
        period,
        permlink: steemDiscoveryThreadPermlink(family, period)
    })));
}

// Looks up each planned thread on the chain.
export async function checkSteemDiscoveryThreads({ rpc, account, targets, onChecked = () => {} }) {
    const results = [];
    for (const target of targets) {
        const content = await rpc.getContent(account, target.permlink);
        const result = { ...target, ...checkSteemDiscoveryThreadContent(content, { account, family: target.family, period: target.period }) };
        results.push(result);
        onChecked(result);
    }
    return results;
}

// Creates each target that does not exist yet, one root post per interval.
// Stops at the first failure rather than skipping ahead, so a problem is
// seen before it repeats. Reports progress through `onProgress(event)`.
export async function createSteemDiscoveryThreads({
    rpc,
    broadcast,
    account,
    targets,
    signal,
    onProgress = () => {},
    now = () => Date.now(),
    sleep = abortableSleep,
    marginMs = DEFAULT_MARGIN_MS,
    confirmTimeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}) {
    let lastBroadcastAt = -Infinity;
    const created = [];
    for (const target of targets) {
        signal?.throwIfAborted();
        const where = { account, family: target.family, period: target.period };

        const chainAccount = await rpc.getAccount(account);
        if (!chainAccount) throw new Error(`Steem account @${account} does not exist`);
        // The chain's record covers posts made elsewhere; our own record
        // covers a node that has not caught up with our last post.
        const lastRootPost = parseSteemTime(chainAccount.last_root_post);
        const earliest = Math.max(
            Number.isFinite(lastRootPost) ? lastRootPost + STEEM_ROOT_POST_INTERVAL_MS + marginMs : -Infinity,
            lastBroadcastAt + STEEM_ROOT_POST_INTERVAL_MS + marginMs
        );
        const wait = earliest - now();
        if (wait > 0) {
            onProgress({ type: 'waiting', target, until: earliest });
            await sleep(wait, signal);
        }

        // Someone may have created it meanwhile, or an earlier broadcast
        // that timed out may have gone through after all.
        const before = checkSteemDiscoveryThreadContent(await rpc.getContent(account, target.permlink), where);
        if (before.exists) {
            onProgress({ type: 'exists', target, check: before });
            continue;
        }

        signal?.throwIfAborted();
        onProgress({ type: 'signing', target });
        const post = describeSteemDiscoveryThreadPost(where);
        const result = await broadcast(account, steemDiscoveryThreadOperations(post));
        lastBroadcastAt = now();
        onProgress({ type: 'broadcast', target, result });

        const check = await waitForThread({ rpc, where, permlink: target.permlink, signal, now, sleep, confirmTimeoutMs, pollIntervalMs });
        if (!check) throw new Error(`${target.permlink} was broadcast but did not appear within ${confirmTimeoutMs / 1000} s; check it before running again`);
        if (check.problems.length > 0) throw new Error(`${target.permlink} was created with problems: ${check.problems.join('; ')}`);
        onProgress({ type: 'created', target, check });
        created.push(target);
    }
    return created;
}

async function waitForThread({ rpc, where, permlink, signal, now, sleep, confirmTimeoutMs, pollIntervalMs }) {
    const deadline = now() + confirmTimeoutMs;
    for (;;) {
        const check = checkSteemDiscoveryThreadContent(await rpc.getContent(where.account, permlink), where);
        if (check.exists) return check;
        if (now() >= deadline) return null;
        await sleep(pollIntervalMs, signal);
    }
}

export function abortableSleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
