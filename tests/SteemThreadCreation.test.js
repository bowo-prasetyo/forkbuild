import { STEEM_ROOT_POST_INTERVAL_MS } from '../core/SteemDiscoveryThread.js';
import { checkSteemDiscoveryThreads, createSteemDiscoveryThreads, planSteemDiscoveryThreads } from '../scripts/steem-threads/SteemThreadCreation.js';
import { assert } from './support/Assert.js';

const MINUTE = 60 * 1000;
const START = Date.parse('2026-09-25T12:00:00Z');

function steemTime(ms) {
    return new Date(ms).toISOString().slice(0, 19);
}

// A fake chain and clock: broadcasting stores the post as the chain would,
// and sleeping moves the clock forward.
function fakeChain({ lastRootPost = START - 60 * MINUTE, visibleAfterPolls = 0, alter = (content) => content } = {}) {
    let clock = START;
    const posts = new Map();
    const pending = new Map();
    const account = { name: 'forkbuild', last_root_post: steemTime(lastRootPost) };
    const broadcasts = [];
    const sleeps = [];

    const rpc = {
        async getContent(author, permlink) {
            const waiting = pending.get(permlink);
            if (waiting) {
                if (waiting.polls-- > 0) return { author: '', permlink: '' };
                pending.delete(permlink);
                posts.set(permlink, waiting.content);
            }
            return posts.get(permlink) ?? { author: '', permlink: '' };
        },
        async getAccount(name) {
            return name === 'forkbuild' ? { ...account } : null;
        }
    };

    async function broadcast(author, operations) {
        const [[, comment], [, options]] = operations;
        if (clock < Date.parse(`${account.last_root_post}Z`) + STEEM_ROOT_POST_INTERVAL_MS) {
            throw new Error('You may only post once every 5 minutes.');
        }
        broadcasts.push({ at: clock, permlink: comment.permlink });
        account.last_root_post = steemTime(clock);
        const content = alter({ ...comment, ...options, allow_replies: true });
        pending.set(comment.permlink, { polls: visibleAfterPolls, content });
        return { transactionId: `tx-${broadcasts.length}` };
    }

    async function sleep(ms, signal) {
        signal?.throwIfAborted();
        sleeps.push(ms);
        clock += ms;
    }

    return { rpc, broadcast, sleep, now: () => clock, posts, broadcasts, sleeps, tick: (ms) => { clock += ms; } };
}

// Planning runs month by month.
{
    const plan = planSteemDiscoveryThreads({ periods: ['2026-09', '2026-10'], families: ['publication', 'snapshot'] });
    assert(JSON.stringify(plan.map((t) => t.permlink)) === JSON.stringify([
        'forkbuild-publication-2026-09', 'forkbuild-snapshot-2026-09',
        'forkbuild-publication-2026-10', 'forkbuild-snapshot-2026-10'
    ]), 'every family of a month comes before the next month');
    console.log('✓ planning goes month by month');
}

// Creating three threads: the first right away, the rest five minutes apart, each confirmed.
{
    const chain = fakeChain({ visibleAfterPolls: 2 });
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication', 'snapshot', 'commentary'] });
    const events = [];
    const created = await createSteemDiscoveryThreads({ ...chain, account: 'forkbuild', targets, onProgress: (e) => events.push(e.type) });

    assert(created.length === 3, 'all three were created');
    assert(chain.broadcasts[0].at === START, 'the first is posted at once when the last root post is old');
    for (let i = 1; i < chain.broadcasts.length; i += 1) {
        const gap = chain.broadcasts[i].at - chain.broadcasts[i - 1].at;
        assert(gap >= STEEM_ROOT_POST_INTERVAL_MS, `posts are at least five minutes apart (gap ${gap} ms)`);
    }
    const results = await checkSteemDiscoveryThreads({ rpc: chain.rpc, account: 'forkbuild', targets });
    assert(results.every((r) => r.exists && r.problems.length === 0), 'every created thread checks out');
    assert(events.filter((e) => e === 'created').length === 3 && events.includes('waiting'), `progress is reported (got ${events})`);
    console.log('✓ threads are created five minutes apart and confirmed');
}

// A recent root post made elsewhere is waited out first.
{
    const chain = fakeChain({ lastRootPost: START - 2 * MINUTE });
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication'] });
    await createSteemDiscoveryThreads({ ...chain, account: 'forkbuild', targets });
    assert(chain.broadcasts[0].at >= START + 3 * MINUTE, 'the post waits until five minutes after the last root post');
    console.log('✓ a recent root post is waited out');
}

// A thread that appeared meanwhile is skipped, not posted again.
{
    const chain = fakeChain();
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication', 'snapshot'] });
    await createSteemDiscoveryThreads({ ...chain, account: 'forkbuild', targets: targets.slice(0, 1) });
    const events = [];
    await createSteemDiscoveryThreads({ ...chain, account: 'forkbuild', targets, onProgress: (e) => events.push(`${e.type}:${e.target.family}`) });
    assert(chain.broadcasts.length === 2, 'only the missing one was broadcast');
    assert(events.includes('exists:publication'), 'the existing one is reported as existing');
    console.log('✓ existing threads are skipped');
}

// A thread that comes out wrong stops the run.
{
    const chain = fakeChain({ alter: (content) => ({ ...content, allow_votes: true }) });
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication', 'snapshot'] });
    let caught = null;
    try {
        await createSteemDiscoveryThreads({ ...chain, account: 'forkbuild', targets });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message.includes('votes are allowed'), `the problem is reported (got ${caught?.message})`);
    assert(chain.broadcasts.length === 1, 'nothing more is posted after a problem');
    console.log('✓ a wrong thread stops the run');
}

// A thread that never appears stops the run.
{
    const chain = fakeChain({ visibleAfterPolls: Infinity });
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication', 'snapshot'] });
    let caught = null;
    try {
        await createSteemDiscoveryThreads({ ...chain, account: 'forkbuild', targets, confirmTimeoutMs: 10000, pollIntervalMs: 1000 });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message.includes('did not appear'), `an unconfirmed post is reported (got ${caught?.message})`);
    assert(chain.broadcasts.length === 1, 'nothing more is posted');
    console.log('✓ an unconfirmed thread stops the run');
}

// A Keychain refusal stops the run.
{
    const chain = fakeChain();
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication'] });
    let caught = null;
    try {
        await createSteemDiscoveryThreads({ ...chain, broadcast: async () => { throw new Error('Request was canceled by the user.'); }, account: 'forkbuild', targets });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message === 'Request was canceled by the user.', 'the refusal is passed on');
    console.log('✓ a refusal stops the run');
}

// Stopping ends the run before the next post.
{
    const chain = fakeChain();
    const controller = new AbortController();
    const targets = planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication', 'snapshot'] });
    let caught = null;
    try {
        await createSteemDiscoveryThreads({
            ...chain,
            account: 'forkbuild',
            targets,
            signal: controller.signal,
            onProgress: (e) => { if (e.type === 'created') controller.abort(new Error('stopped')); }
        });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message === 'stopped', 'the run ends with the stop reason');
    assert(chain.broadcasts.length === 1, 'the second thread was not posted');
    console.log('✓ stopping ends the run');
}

// An account that does not exist is reported.
{
    const chain = fakeChain();
    let caught = null;
    try {
        await createSteemDiscoveryThreads({ ...chain, account: 'nobody', targets: planSteemDiscoveryThreads({ periods: ['2026-09'], families: ['publication'] }) });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message.includes('@nobody does not exist'), 'a missing account is named');
    console.log('✓ a missing account is reported');
}
