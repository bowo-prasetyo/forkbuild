// Checks that the deployment default endpoints on the Network Settings pages
// still answer, and that a browser page can read their answers (CORS). Run
// it before a release, or when a default is suspected of having gone away:
//
//   node scripts/check-network-defaults.mjs
//
// It exits 1 if any default fails. It reads the defaults from the same
// constants the app uses, so there is no second list to keep in step.
//
// What it checks, per substrate:
//   Arweave   GET <gateway>/info returns JSON.
//   IPFS      GET <gateway>/ipfs/<empty directory CID> returns 200.
//   Bitcoin   GET <endpoint>/blocks/tip/height returns a block height.
//   Nostr     a REQ for one event gets an EVENT or EOSE back. Whether a
//             relay accepts writes can't be checked without publishing,
//             so that stays a manual check.
//   Steem     condenser_api.get_dynamic_global_properties returns a head
//             block number.
//   Blurt     the same, on the Blurt API nodes; an author's post listing,
//             which needs the node's tags plugin; and Nexus: newest posts
//             under a busy tag (`blurt`) from bridge.get_ranked_posts,
//             paged back until one is paid out, which shows Nexus keeps
//             posts the chain's own tag listing has dropped.
// STUN (UDP) and Rendezvous (our own server) are not checked here.
//
// The HTTP checks send an Origin header and report whether the response
// allows it (Access-Control-Allow-Origin); without that, the app, which runs
// in a browser, can't read the endpoint even though it answers.
import { DEFAULT_ARWEAVE_GATEWAY_URLS } from '../core/ArweaveGatewayConfiguration.js';
import { DEFAULT_IPFS_GATEWAY_URLS } from '../core/IpfsGatewayConfiguration.js';
import { DEFAULT_BITCOIN_ESPLORA_API_URLS } from '../core/BitcoinEsploraConfiguration.js';
import { DEFAULT_NOSTR_RELAY_URLS } from '../core/NostrRelayConfiguration.js';
import { DEFAULT_STEEM_API_NODES } from '../core/SteemReadingConfiguration.js';
import { DEFAULT_BLURT_API_NODES } from '../core/BlurtReadingConfiguration.js';

const ORIGIN = 'https://bowo-prasetyo.github.io';
const TIMEOUT_MS = 15000;
// The empty UnixFS directory: every gateway can serve it without fetching
// anything from the network first.
const EMPTY_DIRECTORY_CID = 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn';

async function httpCheck(url, { method = 'GET', body = null, accept } = {}) {
    const started = Date.now();
    try {
        const response = await fetch(url, {
            method,
            body,
            headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        const text = await response.text();
        const allowOrigin = response.headers.get('access-control-allow-origin');
        const cors = allowOrigin === '*' || allowOrigin === ORIGIN;
        const answered = response.ok && accept(text);
        return {
            ok: answered && cors,
            detail: `${response.status}${answered ? '' : ' unexpected answer'}${cors ? '' : ', no CORS'}`,
            ms: Date.now() - started
        };
    } catch (error) {
        return { ok: false, detail: error.name === 'TimeoutError' ? 'timed out' : error.message, ms: Date.now() - started };
    }
}

// Pages Nexus's `created` listing for `tag` until a paid-out post turns up.
async function nexusCheck(url, tag = 'blurt', maxPages = 10) {
    const started = Date.now();
    let start = null;
    let seen = 0;
    try {
        for (let page = 0; page < maxPages; page += 1) {
            const params = { sort: 'created', tag, limit: 100, observer: '', ...(start ? { start_author: start.author, start_permlink: start.permlink } : {}) };
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({ jsonrpc: '2.0', method: 'bridge.get_ranked_posts', params, id: 1 }),
                headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            const allowOrigin = response.headers.get('access-control-allow-origin');
            if (allowOrigin !== '*' && allowOrigin !== ORIGIN) return { ok: false, detail: `${response.status}, no CORS`, ms: Date.now() - started };
            const reply = await response.json();
            if (reply.error || !Array.isArray(reply.result)) return { ok: false, detail: `no Nexus (${reply.error?.message ?? 'not a list'})`, ms: Date.now() - started };
            seen += reply.result.length;
            const paidOut = reply.result.find((post) => post.is_paidout === true);
            if (paidOut) return { ok: true, detail: `keeps paid-out posts (one from ${paidOut.created}, after ${seen} posts)`, ms: Date.now() - started };
            if (reply.result.length < 100) break;
            const last = reply.result[reply.result.length - 1];
            start = { author: last.author, permlink: last.permlink };
        }
        return { ok: false, detail: `no paid-out post among the ${seen} newest`, ms: Date.now() - started };
    } catch (error) {
        return { ok: false, detail: error.name === 'TimeoutError' ? 'timed out' : error.message, ms: Date.now() - started };
    }
}

function isJson(text) {
    try { JSON.parse(text); return true; } catch { return false; }
}

function nostrCheck(url) {
    const started = Date.now();
    return new Promise((resolve) => {
        let socket;
        let done = false;
        const finish = (ok, detail) => {
            // close() can fire 'error', which calls finish() again.
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { socket.close(); } catch { /* already closed */ }
            resolve({ ok, detail, ms: Date.now() - started });
        };
        const timer = setTimeout(() => finish(false, 'timed out'), TIMEOUT_MS);
        try {
            socket = new WebSocket(url);
        } catch (error) {
            finish(false, error.message);
            return;
        }
        socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', 'check', { kinds: [1], limit: 1 }])));
        socket.addEventListener('message', (event) => {
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message[0] === 'EVENT' || message[0] === 'EOSE') finish(true, message[0]);
            else if (message[0] === 'CLOSED' || message[0] === 'NOTICE') finish(false, `${message[0]} ${message[2] ?? message[1] ?? ''}`.trim());
        });
        socket.addEventListener('error', () => finish(false, 'connection failed'));
    });
}

const checks = [
    ...DEFAULT_ARWEAVE_GATEWAY_URLS.map((url) => ['Arweave', url, () => httpCheck(`${url}/info`, { accept: isJson })]),
    ...DEFAULT_IPFS_GATEWAY_URLS.map((url) => ['IPFS', url, () => httpCheck(`${url}/ipfs/${EMPTY_DIRECTORY_CID}`, { accept: () => true })]),
    ...DEFAULT_BITCOIN_ESPLORA_API_URLS.map((url) => ['Bitcoin', url, () => httpCheck(`${url}/blocks/tip/height`, { accept: (text) => /^\d+$/.test(text.trim()) })]),
    ...DEFAULT_NOSTR_RELAY_URLS.map((url) => ['Nostr', url, () => nostrCheck(url)]),
    ...DEFAULT_STEEM_API_NODES.map((url) => ['Steem', url, () => httpCheck(url, {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_dynamic_global_properties', params: [], id: 1 }),
        accept: (text) => isJson(text) && Number.isInteger(JSON.parse(text)?.result?.head_block_number)
    })]),
    ...DEFAULT_BLURT_API_NODES.map((url) => ['Blurt', url, () => httpCheck(url, {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_dynamic_global_properties', params: [], id: 1 }),
        accept: (text) => isJson(text) && Number.isInteger(JSON.parse(text)?.result?.head_block_number)
    })]),
    // Readers list top-level posts by tag and by author; a node without the
    // tags plugin answers both with an error.
    ...DEFAULT_BLURT_API_NODES.map((url) => ['Blurt', `${url} (tags)`, () => httpCheck(url, {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_discussions_by_author_before_date', params: ['blurtbook', '', '1970-01-01T00:00:00', 1], id: 1 }),
        accept: (text) => isJson(text) && Array.isArray(JSON.parse(text)?.result)
    })]),
    ...DEFAULT_BLURT_API_NODES.map((url) => ['Blurt', `${url} (Nexus)`, () => nexusCheck(url)])
];

const results = await Promise.all(checks.map(async ([kind, url, check]) => ({ kind, url, ...(await check()) })));
for (const { kind, url, ok, detail, ms } of results) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${kind.padEnd(8)} ${url.padEnd(34)} ${detail} (${ms} ms)`);
}
const failed = results.filter((result) => !result.ok).length;
console.log(failed === 0 ? `\nAll ${results.length} defaults answered.` : `\n${failed} of ${results.length} defaults failed.`);
process.exitCode = failed === 0 ? 0 : 1;
