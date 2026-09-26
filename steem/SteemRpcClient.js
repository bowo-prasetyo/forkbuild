import { DEFAULT_STEEM_API_NODES } from '../core/SteemReadingConfiguration.js';

// A minimal Steem JSON-RPC client: the few condenser_api calls ForkBuild
// needs, tried against each configured API node in turn.

export { DEFAULT_STEEM_API_NODES };
const DEFAULT_TIMEOUT_MS = 10000;

// The node answered, and the chain refused the call. Every node serves the
// same chain, so this is never retried on the next node.
export class SteemRpcError extends Error {
    constructor(method, error) {
        super(`${method}: ${error?.message ?? 'error'}`);
        this.name = 'SteemRpcError';
        this.method = method;
        this.rpcError = error;
    }
}

export class SteemNodesUnreachableError extends Error {
    constructor(method, failures) {
        super(`${method}: no Steem API node answered (${failures.map((f) => `${f.node}: ${f.reason}`).join('; ')})`);
        this.name = 'SteemNodesUnreachableError';
        this.method = method;
        this.failures = failures;
    }
}

export function createSteemRpcClient({ nodes = DEFAULT_STEEM_API_NODES, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError('at least one Steem API node is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    let nextId = 1;

    async function call(method, params) {
        const failures = [];
        for (const node of nodes) {
            let reply;
            try {
                reply = await postJson(fetchImpl, node, { jsonrpc: '2.0', method, params, id: nextId++ }, timeoutMs);
            } catch (error) {
                failures.push({ node, reason: error.message });
                continue;
            }
            if (reply.error) throw new SteemRpcError(method, reply.error);
            return reply.result;
        }
        throw new SteemNodesUnreachableError(method, failures);
    }

    return Object.freeze({
        call,
        getContent: (author, permlink) => call('condenser_api.get_content', [author, permlink]),
        // Every direct reply at once; the API has no paging.
        getContentReplies: (author, permlink) => call('condenser_api.get_content_replies', [author, permlink]),
        // null for a block the node doesn't have (yet).
        getBlock: async (blockNum) => (await call('condenser_api.get_block', [blockNum])) ?? null,
        getDynamicGlobalProperties: () => call('condenser_api.get_dynamic_global_properties', []),
        async getAccount(name) {
            const accounts = await call('condenser_api.get_accounts', [[name]]);
            return Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
        }
    });
}

// Steem reports times as UTC without a zone suffix ("2026-09-25T10:00:00").
export function parseSteemTime(text) {
    if (typeof text !== 'string') return NaN;
    return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
}

async function postJson(fetchImpl, url, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reply = await response.json();
        if (!reply || typeof reply !== 'object') throw new Error('not a JSON-RPC reply');
        return reply;
    } catch (error) {
        if (controller.signal.aborted) throw new Error(`no answer within ${timeoutMs} ms`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
