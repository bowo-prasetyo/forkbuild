// Test-support only. A fake Steem chain whose blocks are real: every
// transaction has its true id, every header its true transaction Merkle
// root and block id, and is signed by a witness key, so kept block evidence
// (core/SteemBlockEvidence.js) checks out exactly as on the chain. It serves
// the JSON-RPC calls ForkBuild makes per node URL; `overrides[node]`
// replaces one node's answers (a function per method, or an Error to be
// unreachable).
import { secp256k1 } from '../../vendor/noble-curves/secp256k1.js';
import { sha256 } from '../../vendor/noble-hashes/sha2.js';
import {
    bytesToHex,
    steemBlockHeaderDigest,
    steemBlockId,
    steemMerkleTree,
    steemPublicKeyString,
    steemTransactionId,
    steemTransactionMerkleDigest
} from '../../core/SteemBinary.js';

export const WITNESS = 'witness-one';
export const WITNESS_SECRET = sha256(new TextEncoder().encode('forkbuild test witness'));
export const WITNESS_KEY = steemPublicKeyString(secp256k1.getPublicKey(WITNESS_SECRET, true));

let expirationCounter = 0;

// A transaction as a block returns it; `signatures` only need to be bytes.
export function steemTransaction(operations, { refBlockNum = 1 } = {}) {
    expirationCounter += 1;
    const expires = new Date(Date.UTC(2026, 8, 26, 10, 0, 0) + expirationCounter * 1000).toISOString().slice(0, 19);
    return { ref_block_num: refBlockNum % 65536, ref_block_prefix: 1234567890, expiration: expires, operations, extensions: [], signatures: ['1f' + '00'.repeat(64)] };
}

export function signSteemHeader(header, secret = WITNESS_SECRET) {
    const signature = secp256k1.sign(steemBlockHeaderDigest(header), secret, { prehash: false, format: 'recovered' });
    signature[0] += 31;
    return bytesToHex(signature);
}

export function fakeSteemChain({ head = 1000, irreversibleLag = 20, overrides = {}, reportBlockNum = true, reportTransactionId = true } = {}) {
    const chain = { head, blocks: new Map(), broadcasts: [], calls: [] };
    chain.lib = () => chain.head - irreversibleLag;
    chain.blockIdOf = (blockNum) => chain.blocks.get(blockNum)?.block_id ?? blockNum.toString(16).padStart(8, '0') + 'a'.repeat(32);
    // Appends a block of `transactions` (operations lists or transactions).
    chain.addBlock = (transactions) => {
        chain.head += 1;
        const blockNum = chain.head;
        const txs = transactions.map((tx) => (Array.isArray(tx) ? steemTransaction(tx, { refBlockNum: blockNum }) : tx));
        const header = {
            previous: chain.blockIdOf(blockNum - 1),
            timestamp: new Date(Date.UTC(2026, 8, 26, 10, 0, 0) + (blockNum - 1000) * 3000).toISOString().slice(0, 19),
            witness: WITNESS,
            transaction_merkle_root: steemMerkleTree(txs.map(steemTransactionMerkleDigest)).root,
            extensions: []
        };
        header.witness_signature = signSteemHeader(header);
        const ids = txs.map(steemTransactionId);
        chain.blocks.set(blockNum, {
            ...header,
            block_id: steemBlockId(header),
            signing_key: WITNESS_KEY,
            transaction_ids: ids,
            // Nodes add these to each transaction; the chain doesn't sign them.
            transactions: txs.map((tx, index) => ({ ...tx, transaction_id: ids[index], block_num: blockNum, transaction_num: index }))
        });
        return { blockNum, ids };
    };
    chain.finalize = () => { chain.head += irreversibleLag; };
    chain.broadcaster = {
        async broadcast(account, operations) {
            chain.broadcasts.push({ account, operations });
            // Someone else's transactions land in the same block too.
            const { blockNum, ids } = chain.addBlock([
                [['vote', { voter: 'bob', author: 'carol', permlink: 'x', weight: 100 }]],
                operations,
                [['transfer', { from: 'dave', to: 'erin', amount: '1.000 STEEM', memo: '' }]]
            ]);
            return { transactionId: reportTransactionId ? ids[1] : null, blockNum: reportBlockNum ? blockNum : null };
        }
    };
    chain.fetchImpl = async (url, init) => {
        const { method, params, id } = JSON.parse(init.body);
        chain.calls.push({ url, method, params });
        const override = overrides[url];
        if (override instanceof Error) throw override;
        let result;
        if (override && typeof override[method] === 'function') {
            result = override[method](params, chain);
        } else if (method === 'condenser_api.get_dynamic_global_properties') {
            result = { head_block_number: chain.head, last_irreversible_block_num: chain.lib() };
        } else if (method === 'condenser_api.get_block') {
            const block = chain.blocks.get(params[0]);
            result = block ? structuredClone(block) : null;
        } else {
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, error: { message: `unknown method ${method}` } }) };
        }
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }) };
    };
    return chain;
}
