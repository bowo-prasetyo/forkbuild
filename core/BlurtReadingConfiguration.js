import { isBlurtAccountName } from './BlurtPost.js';

// Where Blurt announcements and content are read from (docs/Protocol.md,
// "Proposed: Blurt Substrate", "Reading"): the API nodes asked (in order,
// first answer wins), the accounts whose post histories are always read,
// and the first month read from those histories.

// Two operators, so the anchor verifier, which asks every node and needs all
// that answer to agree, compares independent nodes by default.
export const DEFAULT_BLURT_API_NODES = Object.freeze([
    'https://rpc.blurt.blog',
    'https://rpc.beblurt.com'
]);
export const DEFAULT_BLURT_FOLLOWED_ACCOUNTS = Object.freeze([]);
// The first month ForkBuild posted on Blurt.
export const DEFAULT_BLURT_EARLIEST_PERIOD = '2026-10';
const MAX_NODES = 8;
const MAX_FOLLOWED_ACCOUNTS = 32;
const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidBlurtApiNodeUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        return new URL(value.trim()).protocol === 'https:';
    } catch {
        return false;
    }
}

export function isBlurtPeriod(period) {
    return typeof period === 'string' && PERIOD_PATTERN.test(period);
}

export class BlurtReadingConfiguration {
    constructor({ apiNodes = DEFAULT_BLURT_API_NODES, followedAccounts = DEFAULT_BLURT_FOLLOWED_ACCOUNTS, earliestPeriod = DEFAULT_BLURT_EARLIEST_PERIOD } = {}) {
        if (!Array.isArray(apiNodes) || apiNodes.length === 0) throw new Error('BlurtReadingConfiguration: apiNodes must be a non-empty list');
        if (apiNodes.length > MAX_NODES) throw new Error(`BlurtReadingConfiguration: at most ${MAX_NODES} apiNodes`);
        this._apiNodes = Object.freeze([...new Set(apiNodes.map((node) => {
            if (!isValidBlurtApiNodeUrl(node)) throw new Error(`BlurtReadingConfiguration: an API node must be an https:// URL, got "${node}"`);
            return node.trim().replace(/\/+$/, '');
        }))]);
        if (!Array.isArray(followedAccounts)) throw new Error('BlurtReadingConfiguration: followedAccounts must be a list');
        if (followedAccounts.length > MAX_FOLLOWED_ACCOUNTS) throw new Error(`BlurtReadingConfiguration: at most ${MAX_FOLLOWED_ACCOUNTS} followedAccounts`);
        this._followedAccounts = Object.freeze([...new Set(followedAccounts.map((account) => {
            const name = typeof account === 'string' ? account.trim().replace(/^@/, '') : account;
            if (!isBlurtAccountName(name)) throw new Error(`BlurtReadingConfiguration: "${account}" is not a Blurt account name`);
            return name;
        }))]);
        if (!isBlurtPeriod(earliestPeriod)) throw new Error(`BlurtReadingConfiguration: the earliest month must be YYYY-MM, got "${earliestPeriod}"`);
        this._earliestPeriod = earliestPeriod;
        Object.freeze(this);
    }

    static fromJSON(raw) {
        try {
            return new BlurtReadingConfiguration(raw ?? {});
        } catch {
            return null;
        }
    }

    get apiNodes() { return this._apiNodes; }
    get followedAccounts() { return this._followedAccounts; }
    get earliestPeriod() { return this._earliestPeriod; }

    toJSON() {
        return { apiNodes: [...this._apiNodes], followedAccounts: [...this._followedAccounts], earliestPeriod: this._earliestPeriod };
    }
}
