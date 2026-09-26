import {
    parseSteemResourcePrices,
    steemAvailableResourceCredits,
    steemResourceCreditPercent,
    steemTransactionResourceCost,
    steemTransactionResourceUsage
} from '../../core/SteemResourceCredits.js';

// Estimates whether an account has the Resource Credits (RC) to post some
// transactions, from the account's RC and the chain's current prices
// (docs/Protocol.md, "Proposed: Steem Content Storage", "Uploading").
// Resolves to null when the node can't say: estimating is a courtesy, and
// the chain has the final word.

export function createSteemResourceCreditEstimator({ rpc, nowSeconds = () => Date.now() / 1000 } = {}) {
    if (!rpc || typeof rpc.call !== 'function') throw new TypeError('a Steem RPC client with call() is required');

    // `transactions` is a list of operation lists, one per transaction.
    async function estimate(account, transactions) {
        let rcAccounts;
        let resourceParams;
        let resourcePool;
        let dynamicGlobalProperties;
        try {
            [rcAccounts, resourceParams, resourcePool, dynamicGlobalProperties] = await Promise.all([
                rpc.call('rc_api.find_rc_accounts', { accounts: [account] }),
                rpc.call('rc_api.get_resource_params', {}),
                rpc.call('rc_api.get_resource_pool', {}),
                rpc.call('condenser_api.get_dynamic_global_properties', [])
            ]);
        } catch {
            return null;
        }
        const entry = Array.isArray(rcAccounts?.rc_accounts) ? rcAccounts.rc_accounts.find((a) => a?.account === account) : null;
        const available = entry ? steemAvailableResourceCredits(entry, nowSeconds()) : null;
        const prices = parseSteemResourcePrices({ resourceParams, resourcePool, dynamicGlobalProperties });
        if (!available || !prices) return null;
        const needed = transactions.reduce((sum, operations) => sum + steemTransactionResourceCost(steemTransactionResourceUsage(operations), prices), 0n);
        return Object.freeze({
            needed,
            available: available.current,
            max: available.max,
            enough: needed <= available.current,
            neededPercent: steemResourceCreditPercent(needed, available.max),
            availablePercent: Math.floor(Number((available.current * 100n) / (available.max > 0n ? available.max : 1n)))
        });
    }

    return Object.freeze({ estimate });
}
