// Test-support only. A fake Blurt chain that keeps posts as the chain does
// and puts every broadcast in a real block: every transaction has its true
// id, every header its true Merkle root and block id, and is signed by a
// witness key, so kept block evidence checks out as on the chain. It
// enforces Blurt's posting rules (one top-level post per 5 minutes, one
// comment per 3 seconds, a parent that exists, an edit that keeps its
// parent), charges the fee, and serves the condenser_api calls ForkBuild
// makes, including the tag listing (top-level posts until they pay out) and
// authors' histories. `chain.time` is the chain's clock in ms; tests move it.
// `overrides[node]` replaces one node's answers (a function per method, or
// an Error to be unreachable).
import { secp256k1 } from '../../vendor/noble-curves/secp256k1.js';
import { sha256 } from '../../vendor/noble-hashes/sha2.js';
import {
    blurtBlockHeaderDigest,
    blurtBlockId,
    blurtMerkleTree,
    blurtPublicKeyString,
    blurtTransactionId,
    blurtTransactionMerkleDigest,
    bytesToHex
} from '../../core/BlurtBinary.js';
import { blurtFeeSchedule, blurtTransactionFee, formatBlurtAmount, parseBlurtAmount } from '../../core/BlurtFees.js';

export const BLURT_WITNESS = 'blurt-witness';
export const BLURT_WITNESS_SECRET = sha256(new TextEncoder().encode('forkbuild blurt test witness'));
export const BLURT_WITNESS_KEY = blurtPublicKeyString(secp256k1.getPublicKey(BLURT_WITNESS_SECRET, true));
const START = Date.UTC(2026, 9, 5, 12, 0, 0);
const CHAIN_PROPERTIES = { operation_flat_fee: '0.050 BLURT', bandwidth_kbytes_fee: '0.100 BLURT' };

export function blurtChainTime(ms) {
    return new Date(ms).toISOString().slice(0, 19);
}

function signHeader(header) {
    const signature = secp256k1.sign(blurtBlockHeaderDigest(header), BLURT_WITNESS_SECRET, { prehash: false, format: 'recovered' });
    signature[0] += 31;
    return bytesToHex(signature);
}

export function fakeBlurtChain({ head = 5000, irreversibleLag = 20, balances = {}, overrides = {}, reportBlockNum = true, payoutAfterMs = 7 * 24 * 3600 * 1000 } = {}) {
    const chain = {
        head,
        time: START,
        blocks: new Map(),
        posts: new Map(),
        accounts: new Map(),
        broadcasts: [],
        calls: [],
        refusals: [],
        fees: [],
        payoutAfterMs
    };
    let counter = 0;
    chain.lib = () => chain.head - irreversibleLag;
    chain.account = (name) => {
        if (!chain.accounts.has(name)) {
            chain.accounts.set(name, { name, last_post: '1970-01-01T00:00:00', last_root_post: '1970-01-01T00:00:00', last_post_edit: -Infinity, balance: parseBlurtAmount(balances[name] ?? '100.000 BLURT') });
        }
        return chain.accounts.get(name);
    };
    chain.blockIdOf = (blockNum) => chain.blocks.get(blockNum)?.block_id ?? blockNum.toString(16).padStart(8, '0') + 'b'.repeat(32);
    chain.transaction = (operations) => {
        counter += 1;
        return { ref_block_num: chain.head % 65536, ref_block_prefix: 1234567890, expiration: blurtChainTime(chain.time + 60000 + counter * 1000), operations, extensions: [], signatures: ['1f' + '00'.repeat(64)] };
    };
    chain.addBlock = (transactions) => {
        chain.head += 1;
        const blockNum = chain.head;
        const txs = transactions.map((tx) => (Array.isArray(tx) ? chain.transaction(tx) : tx));
        const header = {
            previous: chain.blockIdOf(blockNum - 1),
            timestamp: blurtChainTime(chain.time),
            witness: BLURT_WITNESS,
            transaction_merkle_root: blurtMerkleTree(txs.map(blurtTransactionMerkleDigest)).root,
            extensions: [[3, { operation_flat_fee: 50, bandwidth_kbytes_fee: 100 }]]
        };
        header.witness_signature = signHeader(header);
        const ids = txs.map(blurtTransactionId);
        chain.blocks.set(blockNum, {
            ...header,
            block_id: blurtBlockId(header),
            signing_key: BLURT_WITNESS_KEY,
            transaction_ids: ids,
            transactions: txs.map((tx, index) => ({ ...tx, transaction_id: ids[index], block_num: blockNum, transaction_num: index }))
        });
        return { blockNum, ids };
    };
    chain.finalize = () => { chain.head += irreversibleLag; };

    // Applies a comment as the evaluator does, or throws its refusal.
    function applyComment(op) {
        const account = chain.account(op.author);
        const key = `${op.author}/${op.permlink}`;
        const existing = chain.posts.get(key);
        const root = op.parent_author === '';
        if (!existing) {
            if (!root && !chain.posts.has(`${op.parent_author}/${op.parent_permlink}`)) throw new Error('missing parent');
            if (root && chain.time - Date.parse(`${account.last_root_post}Z`) <= 5 * 60 * 1000) throw new Error('You may only post once every 5 minutes.');
            if (!root && chain.time - Date.parse(`${account.last_post}Z`) < 3000) throw new Error('You may only comment once every 3 seconds.');
            chain.posts.set(key, {
                author: op.author, permlink: op.permlink, parent_author: op.parent_author, parent_permlink: op.parent_permlink,
                title: op.title, body: op.body, json_metadata: op.json_metadata,
                created: blurtChainTime(chain.time), last_update: blurtChainTime(chain.time), category: root ? op.parent_permlink : existingCategory(op)
            });
            if (root) account.last_root_post = blurtChainTime(chain.time);
            account.last_post = blurtChainTime(chain.time);
            account.last_post_edit = chain.time;
            return;
        }
        if (chain.time - account.last_post_edit < 3000) throw new Error('Can only perform one comment edit per block.');
        if (existing.parent_author !== op.parent_author || existing.parent_permlink !== op.parent_permlink) throw new Error('The parent of a comment cannot change.');
        if (op.title) existing.title = op.title;
        if (op.body) existing.body = op.body;
        if (op.json_metadata) existing.json_metadata = op.json_metadata;
        existing.last_update = blurtChainTime(chain.time);
        account.last_post_edit = chain.time;
    }

    function existingCategory(op) {
        return chain.posts.get(`${op.parent_author}/${op.parent_permlink}`)?.category ?? op.parent_permlink;
    }

    chain.broadcaster = {
        async broadcast(account, operations) {
            const fee = blurtTransactionFee(operations, blurtFeeSchedule(CHAIN_PROPERTIES));
            const record = chain.account(account);
            try {
                if (record.balance < fee) throw new Error(`Account does not have sufficient funds for transaction fee. balance ${formatBlurtAmount(record.balance)} fee ${formatBlurtAmount(fee)}`);
                for (const [name, data] of operations) if (name === 'comment') applyComment(data);
            } catch (error) {
                chain.refusals.push({ account, operations, reason: error.message });
                throw error;
            }
            record.balance -= fee;
            chain.fees.push(fee);
            chain.broadcasts.push({ account, operations, time: chain.time });
            const { blockNum, ids } = chain.addBlock([
                [['vote', { voter: 'bob', author: 'carol', permlink: 'x', weight: 100 }]],
                operations
            ]);
            return { transactionId: ids[1], blockNum: reportBlockNum ? blockNum : null };
        }
    };

    function tagged(tag) {
        return [...chain.posts.values()]
            .filter((post) => post.parent_author === '' && chain.time - Date.parse(`${post.created}Z`) < chain.payoutAfterMs)
            .filter((post) => {
                try {
                    return (JSON.parse(post.json_metadata).tags ?? []).slice(0, 5).includes(tag);
                } catch {
                    return false;
                }
            })
            .sort((a, b) => (a.created < b.created ? 1 : (a.created > b.created ? -1 : (a.permlink < b.permlink ? 1 : -1))));
    }

    function page(list, startIndex, limit) {
        return list.slice(Math.max(0, startIndex), Math.max(0, startIndex) + limit).map((post) => structuredClone(post));
    }

    chain.fetchImpl = async (url, init) => {
        const { method, params, id } = JSON.parse(init.body);
        chain.calls.push({ url, method, params });
        const override = overrides[url];
        if (override instanceof Error) throw override;
        let result;
        if (override && typeof override[method] === 'function') {
            result = override[method](params, chain);
        } else if (method === 'condenser_api.get_dynamic_global_properties') {
            result = { head_block_number: chain.head, last_irreversible_block_num: chain.lib(), time: blurtChainTime(chain.time) };
        } else if (method === 'condenser_api.get_block') {
            const block = chain.blocks.get(params[0]);
            result = block ? structuredClone(block) : null;
        } else if (method === 'condenser_api.get_chain_properties') {
            result = { account_creation_fee: '10.000 BLURT', maximum_block_size: 65536, ...CHAIN_PROPERTIES };
        } else if (method === 'condenser_api.get_accounts') {
            result = params[0].map((name) => {
                const account = chain.account(name);
                return { name, last_post: account.last_post, last_root_post: account.last_root_post, balance: formatBlurtAmount(account.balance) };
            });
        } else if (method === 'condenser_api.get_content') {
            result = structuredClone(chain.posts.get(`${params[0]}/${params[1]}`) ?? { author: '', permlink: '' });
        } else if (method === 'condenser_api.get_content_replies') {
            result = [...chain.posts.values()].filter((post) => post.parent_author === params[0] && post.parent_permlink === params[1]).map((post) => structuredClone(post));
        } else if (method === 'condenser_api.get_discussions_by_created') {
            const { tag, limit, start_author: startAuthor, start_permlink: startPermlink } = params[0];
            const list = tagged(tag);
            const startIndex = startAuthor ? list.findIndex((post) => post.author === startAuthor && post.permlink === startPermlink) : 0;
            result = page(list, startIndex, limit);
        } else if (method === 'condenser_api.get_discussions_by_author_before_date') {
            const [author, startPermlink, , limit] = params;
            const list = [...chain.posts.values()]
                .filter((post) => post.author === author && post.parent_author === '')
                .sort((a, b) => (a.last_update < b.last_update ? 1 : (a.last_update > b.last_update ? -1 : (a.permlink < b.permlink ? 1 : -1))));
            const startIndex = startPermlink ? list.findIndex((post) => post.permlink === startPermlink) : 0;
            result = page(list, startIndex, limit);
        } else {
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, error: { message: `unknown method ${method}` } }) };
        }
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }) };
    };
    return chain;
}
