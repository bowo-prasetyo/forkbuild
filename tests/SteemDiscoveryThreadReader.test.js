import { parseSteemDiscoveryAnnouncement } from '../core/SteemDiscoveryAnnouncement.js';
import {
    SteemDiscoveryReadOutcome,
    createSteemDiscoveryThreadReader,
    steemDiscoveryPeriodsToRead
} from '../application/steem/SteemDiscoveryThreadReader.js';
import { assert } from './support/Assert.js';

const NOW = new Date('2026-11-15T12:00:00Z');

function reply({ threadAccount = 'forkbuild', threadPermlink, author = 'alice', permlink, family, envelope = { id: permlink }, version = 1, created = '2026-11-01T00:00:00', metadata } = {}) {
    return {
        parent_author: threadAccount,
        parent_permlink: threadPermlink,
        author,
        permlink,
        created,
        json_metadata: metadata ?? JSON.stringify({ app: 'forkbuild/1.0.0', forkbuild: { version, family, envelope } })
    };
}

// A fake chain: replies per thread, and threads that fail.
function fakeRpc(threads = {}, { failing = [] } = {}) {
    const calls = [];
    return {
        calls,
        async getContentReplies(author, permlink) {
            const key = `${author}/${permlink}`;
            calls.push(key);
            if (failing.includes(key)) throw new Error('no Steem API node answered');
            return threads[key] ?? [];
        }
    };
}

// Parsing one reply.
{
    const where = { threadAccount: 'forkbuild', threadPermlink: 'forkbuild-snapshot-2026-11', family: 'snapshot' };
    const good = parseSteemDiscoveryAnnouncement(reply({ threadPermlink: where.threadPermlink, permlink: 'a1', family: 'snapshot', envelope: { contentHash: 'h' } }), where);
    assert(good && good.envelope.contentHash === 'h' && good.author === 'alice' && good.permlink === 'a1', 'a well-formed reply parses');
    assert(good.created === '2026-11-01T00:00:00', 'the reply time is kept');

    const rejected = [
        [reply({ threadPermlink: 'forkbuild-snapshot-2026-10', permlink: 'x', family: 'snapshot' }), 'another thread'],
        [reply({ threadAccount: 'bob', threadPermlink: where.threadPermlink, permlink: 'x', family: 'snapshot' }), 'a nested reply'],
        [reply({ threadPermlink: where.threadPermlink, permlink: 'x', family: 'publication' }), 'another family'],
        [reply({ threadPermlink: where.threadPermlink, permlink: 'x', family: 'snapshot', version: 2 }), 'another version'],
        [reply({ threadPermlink: where.threadPermlink, permlink: 'x', family: 'snapshot', envelope: 'text' }), 'a non-object envelope'],
        [reply({ threadPermlink: where.threadPermlink, permlink: 'x', metadata: 'not json' }), 'unreadable metadata'],
        [reply({ threadPermlink: where.threadPermlink, permlink: 'x', metadata: '{}' }), 'no forkbuild metadata'],
        [null, 'no reply']
    ];
    for (const [candidate, why] of rejected) assert(parseSteemDiscoveryAnnouncement(candidate, where) === null, `${why} is ignored`);
    console.log('✓ parsing a reply');
}

// Which months are read.
{
    const periods = steemDiscoveryPeriodsToRead({ earliestPeriod: '2026-09', now: NOW });
    assert(JSON.stringify(periods) === '["2026-09","2026-10","2026-11"]', `from the earliest month to now (got ${periods})`);
    assert(steemDiscoveryPeriodsToRead({ earliestPeriod: '2026-12', now: NOW }).length === 0, 'an earliest month in the future reads nothing');
    const capped = steemDiscoveryPeriodsToRead({ earliestPeriod: '2020-01', now: NOW, maxPeriods: 2 });
    assert(JSON.stringify(capped) === '["2026-10","2026-11"]', `the cap keeps the most recent months (got ${capped})`);
    assert(steemDiscoveryPeriodsToRead({ earliestPeriod: 'soon', now: NOW }).length === 0, 'a malformed earliest month reads nothing');
    console.log('✓ months to read');
}

// Reading a family across months and accounts.
{
    const rpc = fakeRpc({
        'forkbuild/forkbuild-snapshot-2026-09': [reply({ threadPermlink: 'forkbuild-snapshot-2026-09', permlink: 's1', family: 'snapshot', created: '2026-09-27T00:00:00' })],
        'forkbuild/forkbuild-snapshot-2026-11': [
            reply({ threadPermlink: 'forkbuild-snapshot-2026-11', permlink: 's3', family: 'snapshot', created: '2026-11-02T00:00:00' }),
            reply({ threadPermlink: 'forkbuild-snapshot-2026-11', permlink: 'noise', metadata: 'hello' })
        ],
        'mirror/forkbuild-snapshot-2026-10': [reply({ threadAccount: 'mirror', threadPermlink: 'forkbuild-snapshot-2026-10', permlink: 's2', family: 'snapshot' })]
    });
    const reader = createSteemDiscoveryThreadReader({ rpc, threadAccounts: ['forkbuild', 'mirror'], now: () => NOW });
    const result = await reader.read('snapshot');
    assert(rpc.calls.length === 6, `every account's thread for every month is read (read ${rpc.calls.length})`);
    assert(result.outcome === SteemDiscoveryReadOutcome.FOUND, 'announcements were found');
    assert(JSON.stringify(result.announcements.map((a) => a.permlink)) === '["s1","s2","s3"]', `in month order, noise dropped (got ${result.announcements.map((a) => a.permlink)})`);
    assert(result.announcements[1].threadAccount === 'mirror' && result.announcements[1].period === '2026-10', 'each announcement names its thread');
    assert(result.threadsRead === 6 && result.threadsUnavailable.length === 0, 'all threads were read');
    console.log('✓ reading across months and thread accounts');
}

// Nothing announced, and nothing reachable.
{
    const empty = await createSteemDiscoveryThreadReader({ rpc: fakeRpc(), now: () => NOW }).read('commentary');
    assert(empty.outcome === SteemDiscoveryReadOutcome.EMPTY && empty.announcements.length === 0, 'missing threads read as empty');

    const failing = ['forkbuild/forkbuild-publication-2026-09', 'forkbuild/forkbuild-publication-2026-10', 'forkbuild/forkbuild-publication-2026-11'];
    const down = await createSteemDiscoveryThreadReader({ rpc: fakeRpc({}, { failing }), now: () => NOW }).read('publication');
    assert(down.outcome === SteemDiscoveryReadOutcome.UNAVAILABLE, 'no thread readable is unavailable, not empty');
    assert(down.threadsUnavailable.length === 3 && down.threadsUnavailable[0].reason.includes('no Steem API node'), 'each failure is reported');

    const partial = await createSteemDiscoveryThreadReader({
        rpc: fakeRpc({ 'forkbuild/forkbuild-publication-2026-11': [reply({ threadPermlink: 'forkbuild-publication-2026-11', permlink: 'p', family: 'publication' })] }, { failing: failing.slice(0, 1) }),
        now: () => NOW
    }).read('publication');
    assert(partial.outcome === SteemDiscoveryReadOutcome.FOUND && partial.threadsUnavailable.length === 1, 'one failed thread does not hide the others');
    console.log('✓ empty and unavailable are told apart');
}

// An oversized thread keeps its newest replies and says so.
{
    const permlink = 'forkbuild-commentary-2026-11';
    const replies = Array.from({ length: 5 }, (_, i) => reply({ threadPermlink: permlink, permlink: `c${i}`, family: 'commentary', created: `2026-11-0${i + 1}T00:00:00` }));
    const result = await createSteemDiscoveryThreadReader({
        rpc: fakeRpc({ [`forkbuild/${permlink}`]: replies }),
        earliestPeriod: '2026-11',
        now: () => NOW,
        maxRepliesPerThread: 3
    }).read('commentary');
    assert(JSON.stringify(result.announcements.map((a) => a.permlink)) === '["c2","c3","c4"]', 'the newest three are kept');
    assert(result.threadsTruncated.length === 1 && result.threadsTruncated[0].threadPermlink === permlink, 'the truncation is reported');
    console.log('✓ oversized threads are capped');
}

// Earlier months are cached for a while, the current month only briefly.
{
    let time = 0;
    const rpc = fakeRpc();
    const reader = createSteemDiscoveryThreadReader({ rpc, now: () => NOW, clock: () => time, pastPeriodCacheMs: 1000, currentPeriodCacheMs: 100 });
    await reader.read('snapshot');
    await reader.read('snapshot');
    assert(rpc.calls.length === 3, `an immediate second read is served from the cache (calls ${rpc.calls.length})`);
    time = 500;
    await reader.read('snapshot');
    assert(rpc.calls.length === 4 && rpc.calls[3].endsWith('2026-11'), 'after a short while only the current month is read again');
    time = 2000;
    await reader.read('snapshot');
    assert(rpc.calls.length === 7, 'after the longer cache expires every month is read again');
    console.log('✓ earlier months are cached for a while, the current month briefly');
}

// Unknown families are refused.
{
    let caught = null;
    try {
        await createSteemDiscoveryThreadReader({ rpc: fakeRpc(), now: () => NOW }).read('votes');
    } catch (error) {
        caught = error;
    }
    assert(caught instanceof TypeError, 'an unknown family is a TypeError');
    console.log('✓ unknown families are refused');
}
