import { SteemNodesUnreachableError, SteemRpcError, createSteemRpcClient, parseSteemTime } from '../steem/SteemRpcClient.js';
import { assert } from './support/Assert.js';

function reply(body, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => body };
}

// A fake fetch that answers per node URL and records every request.
function fakeFetch(answers) {
    const requests = [];
    const fetchImpl = async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        const answer = answers[url];
        if (typeof answer === 'function') return answer(init);
        if (answer instanceof Error) throw answer;
        return answer;
    };
    return { fetchImpl, requests };
}

// A call reaches the first node and returns its result.
{
    const { fetchImpl, requests } = fakeFetch({ 'https://a': reply({ jsonrpc: '2.0', id: 1, result: { author: 'forkbuild' } }) });
    const rpc = createSteemRpcClient({ nodes: ['https://a'], fetchImpl });
    const content = await rpc.getContent('forkbuild', 'forkbuild-snapshot-2026-09');
    assert(content.author === 'forkbuild', 'the result is returned');
    assert(requests[0].body.method === 'condenser_api.get_content', 'get_content is called');
    assert(JSON.stringify(requests[0].body.params) === '["forkbuild","forkbuild-snapshot-2026-09"]', 'with author and permlink');
    console.log('✓ a call returns the node\'s result');
}

// An unreachable or failing node falls through to the next one.
{
    const { fetchImpl, requests } = fakeFetch({
        'https://down': new Error('connection refused'),
        'https://busy': reply({}, { ok: false, status: 503 }),
        'https://up': reply({ result: [{ name: 'forkbuild', last_root_post: '2026-09-25T10:00:00' }] })
    });
    const rpc = createSteemRpcClient({ nodes: ['https://down', 'https://busy', 'https://up'], fetchImpl });
    const account = await rpc.getAccount('forkbuild');
    assert(account.name === 'forkbuild', 'the third node answers');
    assert(requests.length === 3, 'each node was tried once, in order');
    assert(JSON.stringify(requests[2].body.params) === '[["forkbuild"]]', 'get_accounts takes a list of names');
    console.log('✓ failing nodes fall through to the next');
}

// A missing account is null.
{
    const { fetchImpl } = fakeFetch({ 'https://a': reply({ result: [] }) });
    const rpc = createSteemRpcClient({ nodes: ['https://a'], fetchImpl });
    assert(await rpc.getAccount('nobody') === null, 'no account is null');
    console.log('✓ a missing account is null');
}

// A chain error is thrown at once, never retried on another node.
{
    const { fetchImpl, requests } = fakeFetch({
        'https://a': reply({ error: { code: -32000, message: 'bad params' } }),
        'https://b': reply({ result: {} })
    });
    const rpc = createSteemRpcClient({ nodes: ['https://a', 'https://b'], fetchImpl });
    let caught = null;
    try {
        await rpc.call('condenser_api.get_content', []);
    } catch (error) {
        caught = error;
    }
    assert(caught instanceof SteemRpcError && caught.message.includes('bad params'), 'a SteemRpcError carries the chain\'s message');
    assert(requests.length === 1, 'the second node was not asked');
    console.log('✓ chain errors are not retried');
}

// Every node failing names each one.
{
    const { fetchImpl } = fakeFetch({ 'https://a': new Error('refused'), 'https://b': reply({}, { ok: false, status: 500 }) });
    const rpc = createSteemRpcClient({ nodes: ['https://a', 'https://b'], fetchImpl });
    let caught = null;
    try {
        await rpc.getContent('forkbuild', 'x');
    } catch (error) {
        caught = error;
    }
    assert(caught instanceof SteemNodesUnreachableError, 'all nodes failing is SteemNodesUnreachableError');
    assert(caught.failures.length === 2 && caught.message.includes('https://a: refused') && caught.message.includes('HTTP 500'), `each failure is named (got ${caught.message})`);
    console.log('✓ unreachable nodes are reported together');
}

// A node that never answers times out.
{
    const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const { fetchImpl } = fakeFetch({ 'https://slow': hang });
    const rpc = createSteemRpcClient({ nodes: ['https://slow'], fetchImpl, timeoutMs: 20 });
    let caught = null;
    try {
        await rpc.getContent('forkbuild', 'x');
    } catch (error) {
        caught = error;
    }
    assert(caught instanceof SteemNodesUnreachableError && caught.message.includes('no answer within 20 ms'), `a hung node times out (got ${caught?.message})`);
    console.log('✓ a hung node times out');
}

// Steem times are UTC without a zone.
{
    assert(parseSteemTime('2026-09-25T10:00:00') === Date.parse('2026-09-25T10:00:00Z'), 'a zoneless time is UTC');
    assert(parseSteemTime('2026-09-25T10:00:00Z') === Date.parse('2026-09-25T10:00:00Z'), 'an explicit Z is kept');
    assert(Number.isNaN(parseSteemTime(undefined)), 'a missing time is NaN');
    console.log('✓ Steem times parse as UTC');
}
