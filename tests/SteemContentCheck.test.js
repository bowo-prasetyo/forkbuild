import { readSteemContentCheck, steemContentCheckText, storeSteemContentCheck, STEEM_CONTENT_CHECK_FILLER_LENGTH } from '../scripts/steem-threads/SteemContentCheck.js';
import { SteemContentStore } from '../content/SteemContentStore.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { assert } from './support/Assert.js';

// The content storage check page's logic (scripts/steem-threads/
// content-check.html): test content that needs a manifest and two parts,
// stored through the real SteemContentStore, then read back from each node
// on its own through the real RPC client, over a fake JSON-RPC fetch.

const NOW = new Date('2026-10-05T12:00:00Z');

function fakeChain() {
    const posts = new Map([['forkbuild/forkbuild-content-2026-10', { author: 'forkbuild', permlink: 'forkbuild-content-2026-10', allow_replies: true }]]);
    const broadcasts = [];
    const rpc = {
        async getContent(author, permlink) {
            return posts.get(`${author}/${permlink}`) ?? { author: '', permlink: '' };
        }
    };
    const broadcaster = {
        async broadcast(account, operations) {
            broadcasts.push(operations);
            const [, comment] = operations[0];
            posts.set(`${comment.author}/${comment.permlink}`, { ...comment, allow_replies: true });
            return { transactionId: `tx${broadcasts.length}` };
        }
    };
    return { posts, broadcasts, rpc, broadcaster };
}

// A JSON-RPC node over the chain's posts; `changePost` lets a node alter
// what it returns, and `down` makes it fail.
function nodeFetch(chain) {
    return (behaviour) => async (url, options) => {
        const node = behaviour[url] ?? {};
        if (node.down) throw new Error('connection refused');
        const { method, params, id } = JSON.parse(options.body);
        const change = node.changePost ?? ((post) => post);
        let result;
        if (method === 'condenser_api.get_content') {
            result = change(chain.posts.get(`${params[0]}/${params[1]}`) ?? { author: '', permlink: '' });
        } else if (method === 'condenser_api.get_content_replies') {
            result = [...chain.posts.values()].filter((p) => p.parent_author === params[0] && p.parent_permlink === params[1]).map(change);
        } else {
            return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `unknown method ${method}` } }), { status: 200 });
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200 });
    };
}

{
    const text = steemContentCheckText({ now: NOW });
    const parsed = JSON.parse(text);
    assert(parsed.forkbuild === 'Steem content storage check' && parsed.createdAt === NOW.toISOString() && parsed.filler.length === STEEM_CONTENT_CHECK_FILLER_LENGTH,
        'the test content names itself and carries random filler');

    const chain = fakeChain();
    let time = NOW.getTime();
    let n = 0;
    const announcer = createSteemAnnouncer({
        rpc: chain.rpc,
        getBroadcaster: () => chain.broadcaster,
        getAccount: () => 'alice',
        now: () => NOW,
        clock: () => time,
        sleep: async (ms) => { time += ms; },
        randomSuffix: () => `abcdefg${n++}`
    });
    const store = new SteemContentStore({ rpc: chain.rpc, announcer, threadAccounts: ['forkbuild'] });
    const stored = await storeSteemContentCheck({ store, text });
    assert(chain.broadcasts.length === 3, `the test content needs a manifest and two parts (got ${chain.broadcasts.length} posts)`);
    const partMetadata = chain.broadcasts[1][0][1].json_metadata;
    assert(partMetadata.length > 40 * 1024, `each part's json_metadata is close to the largest a post holds (got ${partMetadata.length})`);
    console.log('✓ storing the test content');

    const fetchImpl = nodeFetch(chain)({
        'https://truncating.example': { changePost: (post) => ({ ...post, json_metadata: (post.json_metadata ?? '').slice(0, 8192) }) },
        'https://down.example': { down: true }
    });
    const seen = [];
    const results = await readSteemContentCheck({
        ...stored,
        nodes: ['https://good.example', 'https://truncating.example', 'https://down.example'],
        threadAccounts: ['forkbuild'],
        fetchImpl,
        onResult: (result) => seen.push(result.node)
    });
    assert(results.length === 3 && seen.length === 3, 'one result per node, reported as each finishes');
    assert(results[0].ok === true && results[0].message.includes('unchanged'), `a node that returns the posts intact passes (got ${results[0].message})`);
    assert(results[1].ok === false && results[1].message.includes('carries no ForkBuild data'), `a node that cuts json_metadata short fails with the reason (got ${results[1].message})`);
    assert(results[2].ok === false && /connection refused/.test(results[2].message), `a node that is down fails with the reason (got ${results[2].message})`);

    const wrongHash = await readSteemContentCheck({ uri: stored.uri, hash: 'ffffffff', nodes: ['https://good.example'], threadAccounts: ['forkbuild'], fetchImpl });
    assert(wrongHash[0].ok === false && wrongHash[0].message.includes('stores different content'), 'a locator with the wrong hash fails');
    console.log('✓ reading back from each node');
}

console.log('\n✅ All SteemContentCheck tests passed.');
