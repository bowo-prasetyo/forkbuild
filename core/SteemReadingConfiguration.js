import { STEEM_DISCOVERY_THREAD_ACCOUNT, isSteemAccountName, isSteemDiscoveryPeriod } from './SteemDiscoveryThread.js';

// Where Steem announcements are read from: the API nodes asked (in order,
// first answer wins), the accounts whose discovery threads are read, and
// the first month read.

// api.steemit.com first, then a long-running community node run by a
// different operator: reads fall over to it when api.steemit.com doesn't
// answer. Kept to two because anchoring/SteemProofVerifier.js asks every
// node and needs all that answer to agree, so each extra node is one more
// that can report a block as missing.
export const DEFAULT_STEEM_API_NODES = Object.freeze([
    'https://api.steemit.com',
    'https://api.justyy.com'
]);
export const DEFAULT_STEEM_THREAD_ACCOUNTS = Object.freeze([STEEM_DISCOVERY_THREAD_ACCOUNT]);
// The first month with discovery threads on the chain.
export const DEFAULT_STEEM_EARLIEST_PERIOD = '2026-09';
const MAX_ENTRIES = 8;

export function isValidSteemApiNodeUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        return new URL(value.trim()).protocol === 'https:';
    } catch {
        return false;
    }
}

export class SteemReadingConfiguration {
    constructor({ apiNodes = DEFAULT_STEEM_API_NODES, threadAccounts = DEFAULT_STEEM_THREAD_ACCOUNTS, earliestPeriod = DEFAULT_STEEM_EARLIEST_PERIOD } = {}) {
        this._apiNodes = Object.freeze(uniqueList(apiNodes, 'apiNodes', (node) => {
            if (!isValidSteemApiNodeUrl(node)) throw new Error(`SteemReadingConfiguration: an API node must be an https:// URL, got "${node}"`);
            return node.trim().replace(/\/+$/, '');
        }));
        this._threadAccounts = Object.freeze(uniqueList(threadAccounts, 'threadAccounts', (account) => {
            const name = typeof account === 'string' ? account.trim().replace(/^@/, '') : account;
            if (!isSteemAccountName(name)) throw new Error(`SteemReadingConfiguration: "${account}" is not a Steem account name`);
            return name;
        }));
        if (!isSteemDiscoveryPeriod(earliestPeriod)) throw new Error(`SteemReadingConfiguration: the earliest month must be YYYY-MM, got "${earliestPeriod}"`);
        this._earliestPeriod = earliestPeriod;
        Object.freeze(this);
    }

    static fromJSON(raw) {
        try {
            return new SteemReadingConfiguration(raw ?? {});
        } catch {
            return null;
        }
    }

    get apiNodes() { return this._apiNodes; }
    get threadAccounts() { return this._threadAccounts; }
    get earliestPeriod() { return this._earliestPeriod; }

    toJSON() {
        return { apiNodes: [...this._apiNodes], threadAccounts: [...this._threadAccounts], earliestPeriod: this._earliestPeriod };
    }
}

function uniqueList(values, name, normalize) {
    if (!Array.isArray(values) || values.length === 0) throw new Error(`SteemReadingConfiguration: ${name} must be a non-empty list`);
    if (values.length > MAX_ENTRIES) throw new Error(`SteemReadingConfiguration: at most ${MAX_ENTRIES} ${name}`);
    return [...new Set(values.map(normalize))];
}
