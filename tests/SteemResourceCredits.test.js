import {
    STEEM_RC_REFUSAL,
    parseSteemResourcePrices,
    steemAvailableResourceCredits,
    steemResourceCreditPercent,
    steemTransactionPackedSize,
    steemTransactionResourceCost,
    steemTransactionResourceUsage
} from '../core/SteemResourceCredits.js';
import { steemDeclinedPayoutOptions } from '../core/SteemDiscoveryThread.js';
import { createSteemResourceCreditEstimator } from '../application/steem/SteemResourceCreditEstimator.js';
import { assert } from './support/Assert.js';

// Steem Resource Credits, computed as the chain's rc plugin does
// (docs/Protocol.md, "Proposed: Steem Content Storage", "Uploading"). The
// expected values below are worked out by hand from rc_utility.cpp,
// resource_count.cpp and resource_sizes.hpp.

const RESOURCES = ['resource_history_bytes', 'resource_new_accounts', 'resource_market_bytes', 'resource_state_bytes', 'resource_execution_time'];

function commentOperations({ body = 'hi' } = {}) {
    return [
        ['comment', { parent_author: 'forkbuild', parent_permlink: 'forkbuild-content-2026-10', author: 'alice', permlink: 'p', title: '', body, json_metadata: '{}' }],
        steemDeclinedPayoutOptions('alice', 'p')
    ];
}

// Prices where only one resource is priced, so a cost can be checked by hand.
// The others get a huge denominator, so each one a transaction uses costs
// exactly the 1 the chain always adds.
function pricesFor({ resource, coeffA, coeffB, shift, pool, totalVests }) {
    const params = {};
    const pools = {};
    for (const name of RESOURCES) {
        params[name] = { price_curve_params: name === resource ? { coeff_a: coeffA, coeff_b: coeffB, shift } : { coeff_a: '0', coeff_b: '1000000000000000000', shift: 0 } };
        pools[name] = { pool: name === resource ? pool : 0 };
    }
    return {
        resourceParams: { resource_names: RESOURCES, resource_params: params },
        resourcePool: { resource_pool: pools },
        dynamicGlobalProperties: { total_vesting_shares: totalVests }
    };
}

// The binary size and what a transaction uses.
{
    // Header 10, one-byte operation count, extensions 1, one signature 66.
    // comment: tag 1 + strings (1+9)+(1+25)+(1+5)+(1+1)+(1+0)+(1+2)+(1+2) = 52.
    // comment_options: tag 1 + (1+5)+(1+1) + asset 16 + 2 + 1 + 1 + extensions 1 = 30.
    assert(steemTransactionPackedSize(commentOperations()) === 160, `a small comment and its options pack to 160 bytes (got ${steemTransactionPackedSize(commentOperations())})`);
    assert(steemTransactionPackedSize(commentOperations({ body: 'x'.repeat(200) })) === 160 - 3 + 202, 'a 200-byte body takes a two-byte length');
    assert(steemTransactionPackedSize(commentOperations({ body: '☃' })) === 160 - 3 + 4, 'lengths are in UTF-8 bytes');
    assert(steemTransactionPackedSize([commentOperations()[0]]) === 160 - 30, 'a comment alone, as when editing a part');

    const usage = steemTransactionResourceUsage(commentOperations());
    assert(usage.resource_history_bytes === 160n, 'history bytes are the transaction size');
    // 35*174 + 174*160 + 201*10000 + 1*10000 + 25*20000
    assert(usage.resource_state_bytes === 2553930n, `state bytes (got ${usage.resource_state_bytes})`);
    assert(usage.resource_execution_time === 127300n, 'execution time is the comment plus its options');
    assert(usage.resource_new_accounts === 0n && usage.resource_market_bytes === 0n, 'no accounts or market bytes');

    let threw = false;
    try {
        steemTransactionPackedSize([['vote', {}]]);
    } catch {
        threw = true;
    }
    assert(threw, 'other operations are not sized');
    console.log('✓ transaction size and resource usage');
}

// The price of a resource.
{
    // total_vesting_shares 144,000,000.000000 VESTS -> amount 144e12, rc_regen = 144e12 / 144000 = 1e9.
    const prices = parseSteemResourcePrices(pricesFor({ resource: 'resource_history_bytes', coeffA: String(2n ** 40n), coeffB: 1000, shift: 20, pool: 9000, totalVests: '144000000.000000 VESTS' }));
    assert(prices.rcRegen === 1000000000n, `rc_regen from total vesting shares (got ${prices.rcRegen})`);
    // num = ((1e9 * 2^40) >> 20) + 1 = 1e9 * 2^20 + 1; times 160; over 1000 + 9000; plus 1.
    // State bytes and execution time add 1 each.
    const expected = ((1000000000n * 2n ** 20n + 1n) * 160n) / 10000n + 1n + 2n;
    const cost = steemTransactionResourceCost(steemTransactionResourceUsage(commentOperations()), prices);
    assert(cost === expected, `the cost follows compute_rc_cost_of_resource() (got ${cost}, expected ${expected})`);

    const negativePool = parseSteemResourcePrices(pricesFor({ resource: 'resource_history_bytes', coeffA: String(2n ** 40n), coeffB: 1000, shift: 20, pool: -5000, totalVests: '144000000.000000 VESTS' }));
    const atZero = parseSteemResourcePrices(pricesFor({ resource: 'resource_history_bytes', coeffA: String(2n ** 40n), coeffB: 1000, shift: 20, pool: 0, totalVests: '144000000.000000 VESTS' }));
    const usage = steemTransactionResourceUsage(commentOperations());
    assert(steemTransactionResourceCost(usage, negativePool) === steemTransactionResourceCost(usage, atZero), 'a negative pool costs no more than an empty one');
    assert(steemTransactionResourceCost(usage, { ...prices, rcRegen: 0n }) === 0n, 'with no regeneration everything is free');

    assert(parseSteemResourcePrices({ ...pricesFor({ resource: 'resource_history_bytes', coeffA: '1', coeffB: 1, shift: 0, pool: 0, totalVests: 'lots' }) }) === null, 'unreadable vesting shares give no prices');
    assert(parseSteemResourcePrices({ resourceParams: {}, resourcePool: {}, dynamicGlobalProperties: {} }) === null, 'missing parameters give no prices');
    const legacy = parseSteemResourcePrices(pricesFor({ resource: 'resource_history_bytes', coeffA: '1', coeffB: 1, shift: 0, pool: 0, totalVests: { amount: '144000000000', precision: 6, nai: '@@000000037' } }));
    assert(legacy?.rcRegen === 1000000n, 'a legacy asset object is read too');
    console.log('✓ the price of a resource');
}

// What an account has, regenerated to now.
{
    const account = { account: 'alice', max_rc: '1000', rc_manabar: { current_mana: '100', last_update_time: 0 } };
    assert(steemAvailableResourceCredits(account, 43200).current === 200n, 'a tenth of five days regenerates a tenth of the maximum');
    assert(steemAvailableResourceCredits(account, 10 * 432000).current === 1000n, 'regeneration stops at the maximum');
    assert(steemAvailableResourceCredits({ ...account, rc_manabar: { current_mana: '5000', last_update_time: 0 } }, 1).current === 1000n, 'more than the maximum reads as the maximum');
    assert(steemAvailableResourceCredits({ ...account, max_rc: 'many' }, 1) === null, 'a malformed entry gives nothing');
    assert(steemResourceCreditPercent(1n, 1000n) === 1 && steemResourceCreditPercent(0n, 1000n) === 0 && steemResourceCreditPercent(501n, 1000n) === 51, 'shares round up');
    assert(STEEM_RC_REFUSAL.test('Account: alice has 10 RC, needs 999 RC. Please wait to transact, or power up STEEM.') && !STEEM_RC_REFUSAL.test('Missing posting authority'), 'the chain\'s refusal is recognized');
    console.log('✓ what an account has');
}

// The estimator, over a fake node.
{
    const chainData = {
        ...pricesFor({ resource: 'resource_history_bytes', coeffA: String(2n ** 40n), coeffB: 1000, shift: 20, pool: 9000, totalVests: '144000000.000000 VESTS' }),
        rcAccounts: { rc_accounts: [{ account: 'alice', max_rc: '100000000000000', rc_manabar: { current_mana: '20000000000000', last_update_time: 1000 } }] }
    };
    const calls = [];
    const rpc = {
        async call(method, params) {
            calls.push(method);
            if (method === 'rc_api.find_rc_accounts') return params.accounts[0] === 'alice' ? chainData.rcAccounts : { rc_accounts: [] };
            if (method === 'rc_api.get_resource_params') return chainData.resourceParams;
            if (method === 'rc_api.get_resource_pool') return chainData.resourcePool;
            if (method === 'condenser_api.get_dynamic_global_properties') return chainData.dynamicGlobalProperties;
            throw new Error(`unexpected ${method}`);
        }
    };
    const estimator = createSteemResourceCreditEstimator({ rpc, nowSeconds: () => 1000 });
    const one = ((1000000000n * 2n ** 20n + 1n) * 160n) / 10000n + 1n + 2n;
    const cheap = await estimator.estimate('alice', [commentOperations()]);
    assert(cheap.needed === one && cheap.enough === true && cheap.available === 20000000000000n && cheap.availablePercent === 20, `one post is affordable (needed ${cheap.needed})`);
    assert(cheap.neededPercent === Number((one * 100n + 99999999999999n) / 100000000000000n), 'the needed share rounds up');
    assert(JSON.stringify([...new Set(calls)].sort()) === JSON.stringify(['condenser_api.get_dynamic_global_properties', 'rc_api.find_rc_accounts', 'rc_api.get_resource_params', 'rc_api.get_resource_pool']), 'it asks the node for the account and the prices');
    const costly = await estimator.estimate('alice', Array.from({ length: 2 }, () => commentOperations()));
    assert(costly.needed === 2n * one && costly.enough === false, 'two posts are not');

    assert(await estimator.estimate('nobody', [commentOperations()]) === null, 'an account the node does not know gives no estimate');
    const down = createSteemResourceCreditEstimator({ rpc: { call: async () => { throw new Error('rc_api not enabled'); } } });
    assert(await down.estimate('alice', [commentOperations()]) === null, 'a node without rc_api gives no estimate rather than an error');
    console.log('✓ the estimator');
}

console.log('\n✅ All SteemResourceCredits tests passed.');
