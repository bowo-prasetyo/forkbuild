import { isPlainObject } from '../utils/typeGuards.js';

// Steem Resource Credits (RC): what posting a transaction costs, and what an
// account has, computed the way the chain's rc plugin does it (steemit/steem,
// libraries/plugins/rc: rc_plugin.cpp, rc_utility.cpp, resource_count.cpp,
// resource_sizes.hpp). Pure integer arithmetic with BigInt; the inputs are
// what rc_api and condenser_api return, which this file only parses.
// docs/Protocol.md, "Proposed: Steem Content Storage", "Uploading".

export const STEEM_RC_RESOURCES = Object.freeze([
    'resource_history_bytes',
    'resource_new_accounts',
    'resource_market_bytes',
    'resource_state_bytes',
    'resource_execution_time'
]);

// The chain's refusal: "Account: alice has 123 RC, needs 456 RC. Please wait
// to transact, or power up STEEM." (rc_plugin.cpp).
export const STEEM_RC_REFUSAL = /has -?\d+ RC, needs \d+ RC/;

// STEEM_RC_REGEN_TIME and STEEM_BLOCK_INTERVAL.
const RC_REGEN_TIME_SECONDS = 60 * 60 * 24 * 5;
const BLOCK_INTERVAL_SECONDS = 3;
// state_object_size_info and operation_exec_info.
const STATE_BYTES_SCALE = 10000n;
const STATE_TRANSACTION_BYTE_SIZE = 174n;
const TRANSACTION_OBJECT_BASE_SIZE = 35n * STATE_TRANSACTION_BYTE_SIZE;
const COMMENT_OBJECT_BASE_SIZE = 201n * STATE_BYTES_SCALE;
const COMMENT_PERMLINK_CHAR_SIZE = STATE_BYTES_SCALE;
const COMMENT_PARENT_PERMLINK_CHAR_SIZE = 2n * STATE_BYTES_SCALE;
const COMMENT_EXEC_TIME = 114100n;
const COMMENT_OPTIONS_EXEC_TIME = 13200n;
// A Keychain transaction carries one signature.
const SIGNATURE_BYTES = 65;

// The binary size of a signed transaction of `comment` and
// `comment_options` operations with one signature, as fc::raw::pack_size
// counts it. Throws for any other operation.
export function steemTransactionPackedSize(operations) {
    let size = 2 + 4 + 4; // ref_block_num, ref_block_prefix, expiration
    size += varintSize(operations.length);
    for (const [kind, op] of operations) {
        size += 1; // the operation's type tag
        if (kind === 'comment') {
            for (const field of ['parent_author', 'parent_permlink', 'author', 'permlink', 'title', 'body', 'json_metadata']) {
                size += stringSize(op[field]);
            }
        } else if (kind === 'comment_options') {
            size += stringSize(op.author) + stringSize(op.permlink);
            size += 16 + 2 + 1 + 1; // max_accepted_payout, percent_steem_dollars, allow_votes, allow_curation_rewards
            size += varintSize(op.extensions?.length ?? 0);
        } else {
            throw new TypeError(`can't size a ${kind} operation`);
        }
    }
    size += varintSize(0); // extensions
    size += varintSize(1) + SIGNATURE_BYTES;
    return size;
}

// What one transaction uses of each resource (count_resources()).
export function steemTransactionResourceUsage(operations) {
    const txSize = BigInt(steemTransactionPackedSize(operations));
    let stateBytes = TRANSACTION_OBJECT_BASE_SIZE + STATE_TRANSACTION_BYTE_SIZE * txSize;
    let executionTime = 0n;
    for (const [kind, op] of operations) {
        if (kind === 'comment') {
            stateBytes += COMMENT_OBJECT_BASE_SIZE
                + COMMENT_PERMLINK_CHAR_SIZE * BigInt(utf8Length(op.permlink))
                + COMMENT_PARENT_PERMLINK_CHAR_SIZE * BigInt(utf8Length(op.parent_permlink));
            executionTime += COMMENT_EXEC_TIME;
        } else if (kind === 'comment_options') {
            executionTime += COMMENT_OPTIONS_EXEC_TIME;
        }
    }
    return Object.freeze({
        resource_history_bytes: txSize,
        resource_new_accounts: 0n,
        resource_market_bytes: 0n,
        resource_state_bytes: stateBytes,
        resource_execution_time: executionTime
    });
}

// The chain's prices at one moment: from rc_api.get_resource_params,
// rc_api.get_resource_pool and condenser_api.get_dynamic_global_properties.
// Returns null when any of them lacks what the formula needs.
export function parseSteemResourcePrices({ resourceParams, resourcePool, dynamicGlobalProperties }) {
    const params = resourceParams?.resource_params;
    const pools = resourcePool?.resource_pool;
    const totalVestingShares = parseVests(dynamicGlobalProperties?.total_vesting_shares);
    if (!isPlainObject(params) || !isPlainObject(pools) || totalVestingShares === null) return null;
    const curves = {};
    for (const resource of STEEM_RC_RESOURCES) {
        const curve = params[resource]?.price_curve_params;
        const coeffA = toBigInt(curve?.coeff_a);
        const coeffB = toBigInt(curve?.coeff_b);
        const shift = toBigInt(curve?.shift);
        const pool = toBigInt(pools[resource]?.pool);
        if (coeffA === null || coeffB === null || shift === null || pool === null) return null;
        curves[resource] = Object.freeze({ coeffA, coeffB, shift, pool });
    }
    const rcRegen = totalVestingShares / BigInt(RC_REGEN_TIME_SECONDS / BLOCK_INTERVAL_SECONDS);
    return Object.freeze({ curves: Object.freeze(curves), rcRegen });
}

// The RC one transaction costs at these prices (the sum over resources of
// compute_rc_cost_of_resource()). With no regeneration everything is free.
export function steemTransactionResourceCost(usage, prices) {
    if (prices.rcRegen <= 0n) return 0n;
    let total = 0n;
    for (const resource of STEEM_RC_RESOURCES) {
        total += resourceCost(prices.curves[resource], usage[resource], prices.rcRegen);
    }
    return total;
}

// What an account has now, from one entry of rc_api.find_rc_accounts:
// its manabar regenerated to `nowSeconds`, as regenerate_mana() does.
// Returns `{ current, max }`, or null when the entry is malformed.
export function steemAvailableResourceCredits(rcAccount, nowSeconds) {
    const max = toBigInt(rcAccount?.max_rc);
    const mana = toBigInt(rcAccount?.rc_manabar?.current_mana);
    const lastUpdate = toBigInt(rcAccount?.rc_manabar?.last_update_time);
    if (max === null || mana === null || lastUpdate === null || !Number.isFinite(nowSeconds)) return null;
    if (mana >= max) return Object.freeze({ current: max, max });
    let dt = BigInt(Math.floor(nowSeconds)) - lastUpdate;
    if (dt < 0n) dt = 0n;
    if (dt > BigInt(RC_REGEN_TIME_SECONDS)) dt = BigInt(RC_REGEN_TIME_SECONDS);
    const regenerated = mana + ((max > 0n ? max : 0n) * dt) / BigInt(RC_REGEN_TIME_SECONDS);
    return Object.freeze({ current: regenerated > max ? max : regenerated, max });
}

// A share of an account's maximum, as a whole percentage rounded up, for
// messages.
export function steemResourceCreditPercent(amount, max) {
    if (max <= 0n) return 100;
    return Number((amount * 100n + max - 1n) / max);
}

function resourceCost(curve, count, rcRegen) {
    if (count === 0n) return 0n;
    if (count < 0n) return -resourceCost(curve, -count, rcRegen);
    let num = (rcRegen * curve.coeffA) >> curve.shift;
    num += 1n;
    num *= count;
    const denom = curve.coeffB + (curve.pool > 0n ? curve.pool : 0n);
    return num / denom + 1n;
}

// "123.456789 VESTS", or a legacy asset object, as an integer amount.
function parseVests(value) {
    if (typeof value === 'string') {
        const match = /^(\d+)\.(\d{6}) VESTS$/.exec(value.trim());
        return match ? BigInt(match[1] + match[2]) : null;
    }
    if (isPlainObject(value)) return toBigInt(value.amount);
    return null;
}

// fc sends large integers as strings and small ones as numbers.
function toBigInt(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
    return null;
}

function stringSize(value) {
    const length = utf8Length(value ?? '');
    return varintSize(length) + length;
}

function utf8Length(value) {
    return new TextEncoder().encode(value).length;
}

function varintSize(value) {
    let size = 1;
    while (value >= 0x80) {
        value = Math.floor(value / 0x80);
        size++;
    }
    return size;
}
