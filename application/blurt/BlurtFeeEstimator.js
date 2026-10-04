import { blurtFeeSchedule, blurtTransactionFee, formatBlurtAmount, parseBlurtAmount } from '../../core/BlurtFees.js';

// Estimates whether an account can pay the fees of some transactions, from
// the witnesses' median fees and the account's liquid BLURT
// (docs/Protocol.md, "Proposed: Blurt Substrate", "Fees"). Resolves to null
// when the node can't say: estimating is a courtesy, and the chain has the
// final word.
export function createBlurtFeeEstimator({ rpc } = {}) {
    if (!rpc || typeof rpc.getChainProperties !== 'function' || typeof rpc.getAccount !== 'function') {
        throw new TypeError('a Blurt RPC client with getChainProperties() and getAccount() is required');
    }

    // `transactions` is a list of operation lists, one per transaction.
    async function estimate(account, transactions) {
        let properties;
        let accountRecord;
        try {
            [properties, accountRecord] = await Promise.all([rpc.getChainProperties(), rpc.getAccount(account)]);
        } catch {
            return null;
        }
        const schedule = blurtFeeSchedule(properties);
        const balance = parseBlurtAmount(accountRecord?.balance);
        if (!schedule || balance === null) return null;
        const needed = transactions.reduce((sum, operations) => sum + blurtTransactionFee(operations, schedule), 0);
        return Object.freeze({
            needed,
            balance,
            enough: needed <= balance,
            neededText: formatBlurtAmount(needed),
            balanceText: formatBlurtAmount(balance)
        });
    }

    return Object.freeze({ estimate });
}
