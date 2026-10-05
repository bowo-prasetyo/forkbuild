import { createBlurtDiscoveryReader } from '../application/blurt/BlurtDiscoveryReader.js';
import { createBlurtPoster } from '../application/blurt/BlurtPoster.js';
import { createBlurtRpcClient } from '../blurt/BlurtRpcClient.js';
import { BlurtSnapshotDiscoveryQueryService } from '../application/blurt/BlurtSnapshotDiscoveryQueryService.js';
import { BlurtPublicationDiscoveryQueryService } from '../application/blurt/BlurtPublicationDiscoveryQueryService.js';
import { BlurtKnownAuthorStore } from '../storage/BlurtKnownAuthorStore.js';
import { blurtBuildPostOperation, emptyBlurtBuildPost } from '../core/BlurtPost.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { blurtChainTime, fakeBlurtChain } from './support/FakeBlurtChain.js';
import { assert } from './support/Assert.js';

const DAY = 24 * 3600 * 1000;
let suffixes = 0;

function rpcFor(chain) {
    return createBlurtRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
}

function posterFor(chain, account) {
    return createBlurtPoster({
        rpc: rpcFor(chain),
        getBroadcaster: () => chain.broadcaster,
        getAccount: () => account,
        now: () => new Date(chain.time),
        clock: () => chain.time,
        sleep: async (ms) => { chain.time += ms; },
        randomSuffix: () => `r${String(suffixes++).padStart(7, '0')}`
    });
}

function readerFor(chain, options = {}) {
    return createBlurtDiscoveryReader({ rpc: rpcFor(chain), clock: () => chain.time, ...options });
}

function knownAuthorsOf(authors) {
    const known = new BlurtKnownAuthorStore(new InMemoryStorageProvider());
    known.remember(authors);
    return known;
}

// Puts a post straight on the fake chain, as someone else's app might.
function plantPost(chain, { author, permlink, json_metadata, parent_permlink = 'forkbuild', ageMs = 0 }) {
    const created = blurtChainTime(chain.time - ageMs);
    chain.posts.set(`${author}/${permlink}`, { author, permlink, parent_author: '', parent_permlink, title: 't', body: 'b', json_metadata, created, last_update: created });
}

// Recent posts are found by tag, newest across pages, and their authors are
// remembered; noise under the tag is skipped.
{
    const chain = fakeBlurtChain();
    for (let i = 0; i < 130; i += 1) {
        const [, op] = blurtBuildPostOperation({ author: `user${String(i).padStart(3, '0')}`, permlink: `forkbuild-p${i}`, state: { ...emptyBlurtBuildPost(), announcements: [{ family: 'snapshot', envelope: { n: i } }] } });
        plantPost(chain, { author: op.author, permlink: op.permlink, json_metadata: op.json_metadata, ageMs: (130 - i) * 60000 });
    }
    plantPost(chain, { author: 'spammer', permlink: 'junk', json_metadata: JSON.stringify({ tags: ['forkbuild-snapshot'] }) });
    plantPost(chain, { author: 'other', permlink: 'elsewhere', parent_permlink: 'photography', json_metadata: JSON.stringify({ tags: ['forkbuild-snapshot'], forkbuild: { version: 1, announcements: [{ family: 'snapshot', envelope: { n: -1 } }] } }) });
    const known = new BlurtKnownAuthorStore(new InMemoryStorageProvider());
    const result = await readerFor(chain, { knownAuthors: known }).read('snapshot');
    assert(result.outcome === 'found' && result.announcements.length === 130, `every build post across two pages (got ${result.announcements.length})`);
    assert(new Set(result.announcements.map((a) => a.envelope.n)).size === 130, 'none twice where pages meet');
    assert(!result.announcements.some((a) => a.author === 'spammer' || a.author === 'other'), 'noise and posts outside the category are skipped');
    assert(!known.list().includes('spammer') && known.list().includes('user129'), 'authors of build posts are remembered, not of noise');
    assert(known.list().length === 100 && known.list()[0] === 'user129' && !known.list().includes('user000'), `the 100 most recently seen are kept (got ${known.list().length})`);
    assert(result.announcements[0].envelope.n === 0, 'reported oldest first');
    console.log('✓ the tag listing');
}

// Without Nexus, a post leaves the tag listing after payout; its author's
// history still has it, for every remembered account.
{
    const chain = fakeBlurtChain();
    const known = new BlurtKnownAuthorStore(new InMemoryStorageProvider());
    await posterFor(chain, 'alice').announce('snapshot', { contentHash: 'h-old' });
    await readerFor(chain, { knownAuthors: known }).read('snapshot');
    assert(known.list().includes('alice'), 'alice is remembered while her post is listed');

    chain.time += 8 * DAY;
    const [, bobOp] = blurtBuildPostOperation({ author: 'bob', permlink: 'forkbuild-bob-1', state: { ...emptyBlurtBuildPost(), announcements: [{ family: 'snapshot', envelope: { contentHash: 'h-bob' } }] } });
    plantPost(chain, { author: 'bob', permlink: 'forkbuild-bob-1', json_metadata: bobOp.json_metadata, ageMs: 30 * DAY });
    const tagOnly = await readerFor(chain).read('snapshot');
    assert(tagOnly.outcome === 'empty', 'paid-out posts are gone from the tag');
    known.remember(['bob']);
    const result = await readerFor(chain, { knownAuthors: known }).read('snapshot');
    const hashes = result.announcements.map((a) => a.envelope.contentHash).sort();
    assert(hashes.join() === 'h-bob,h-old', `remembered authors' older posts are found (got ${hashes})`);
    const snapshots = await new BlurtSnapshotDiscoveryQueryService({ reader: readerFor(chain, { knownAuthors: known }) }).searchWithOutcome('forkbuild-snapshot');
    assert(snapshots.outcome === 'empty', 'an envelope that isn\'t a Snapshot envelope yields no candidate');
    console.log('✓ authors\' histories');
}

// An author's history stops at the earliest month, and is cached.
{
    const chain = fakeBlurtChain();
    for (let i = 0; i < 250; i += 1) plantPost(chain, { author: 'carol', permlink: `misc-${i}`, parent_permlink: 'life', json_metadata: '{}', ageMs: (i + 1) * DAY });
    const reader = readerFor(chain, { knownAuthors: knownAuthorsOf(['carol']), earliestPeriod: '2026-09' });
    await reader.read('snapshot');
    const pages = chain.calls.filter((call) => call.method === 'condenser_api.get_discussions_by_author_before_date').length;
    assert(pages === 1, `stops paging once posts are older than the first month (pages ${pages})`);
    await reader.read('publication');
    assert(chain.calls.filter((call) => call.method === 'condenser_api.get_discussions_by_author_before_date').length === 1, 'a history is read once for every family');
    console.log('✓ history limits and caching');
}

// Nothing readable is "unavailable", never "nothing announced".
{
    const chain = fakeBlurtChain({ overrides: { 'https://a': new Error('offline') } });
    const result = await readerFor(chain, { knownAuthors: knownAuthorsOf(['bob']) }).read('publication');
    assert(result.outcome === 'unavailable' && result.sourcesUnavailable.length === 3, 'Nexus, the tag and the history all count as unavailable');
    const snapshots = await new BlurtSnapshotDiscoveryQueryService({ reader: readerFor(chain) }).searchWithOutcome('forkbuild-snapshot');
    assert(snapshots.outcome === 'unavailable', 'the snapshot search reports unavailable');
    assert((await new BlurtPublicationDiscoveryQueryService({ reader: readerFor(chain) }).search('forkbuild-publication')).length === 0, 'publication discovery finds no leads');
    assert(new BlurtPublicationDiscoveryQueryService({ reader: readerFor(chain) }).origin === 'dweb:blurt', 'its origin names Blurt');

    const partly = fakeBlurtChain({ overrides: { 'https://a': { 'condenser_api.get_discussions_by_created': () => { throw new Error('no tags plugin'); } } } });
    const answered = await readerFor(partly, { knownAuthors: knownAuthorsOf(['bob']) }).read('publication');
    assert(answered.outcome === 'empty' && answered.sourcesRead === 1, 'one source that answers is enough to say nothing was found');
    console.log('✓ unavailability');
}

// Nexus lists every post under the tag, paid out or not, so a fresh device
// finds old builds without following anyone, and nothing else is read.
{
    const chain = fakeBlurtChain({ nexus: true });
    // A month on, so every post is paid out but after the first month read.
    chain.time += 31 * DAY;
    for (let i = 0; i < 150; i += 1) {
        const [, op] = blurtBuildPostOperation({ author: `old${String(i).padStart(3, '0')}`, permlink: `forkbuild-o${i}`, state: { ...emptyBlurtBuildPost(), announcements: [{ family: 'publication', envelope: { n: i } }] } });
        plantPost(chain, { author: op.author, permlink: op.permlink, json_metadata: op.json_metadata, ageMs: (8 + i / 10) * DAY });
    }
    plantPost(chain, { author: 'noise', permlink: 'p', json_metadata: JSON.stringify({ tags: ['forkbuild-publication'] }) });
    const result = await readerFor(chain).read('publication');
    assert(result.nexus && result.outcome === 'found' && result.announcements.length === 150, `every paid-out build post is found through Nexus, across pages (got ${result.announcements.length})`);
    assert(new Set(result.announcements.map((a) => a.envelope.n)).size === 150, 'none twice where pages meet');
    const methods = new Set(chain.calls.map((call) => call.method));
    assert(!methods.has('condenser_api.get_discussions_by_created') && !methods.has('condenser_api.get_discussions_by_author_before_date'), 'nothing else is read when Nexus answers');

    // A node without Nexus is skipped for one that has it.
    const plain = fakeBlurtChain();
    const both = createBlurtDiscoveryReader({
        rpc: createBlurtRpcClient({ nodes: ['https://plain', 'https://a'], fetchImpl: (url, init) => (url === 'https://plain' ? plain.fetchImpl(url, init) : chain.fetchImpl(url, init)) }),
        clock: () => chain.time
    });
    assert((await both.read('publication')).announcements.length === 150, 'the next node that serves Nexus answers');
    console.log('✓ Nexus');
}
