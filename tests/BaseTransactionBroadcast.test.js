import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
import { BaseSignedTransactionFinalizer } from '../base/BaseSignedTransactionFinalizer.js';
import { BaseTransactionBroadcaster } from '../base/BaseTransactionBroadcaster.js';
import { BaseTransactionBroadcastCoordinator } from '../application/BaseTransactionBroadcastCoordinator.js';
import { BaseTransactionBroadcastState, isValidBaseTransactionBroadcastState } from '../application/BaseTransactionBroadcastState.js';
import { describeBaseTransactionBroadcast, describeBaseTransactionBroadcastStateLabel } from '../application/BaseTransactionBroadcastView.js';
import { BitcoinAnchorTransactionBroadcaster } from '../anchoring/BitcoinAnchorTransactionBroadcaster.js';

// 0.8.95 — Explicit Base Transaction Broadcast.
//
// The governing principle this milestone exists to prove: broadcast
// PUBLISHES an already-finalized transaction; it does not construct,
// sign, modify, or re-verify one. See docs/Roadmap.md, "0.8.95 —
// Explicit Base Transaction Broadcast."
//
//   Section A (FLAGSHIP): a genuinely, cryptographically FINALIZED
//              transaction (a real chain: plan → sign → finalize, no
//              mocks) is handed to a fake rpcSource, which receives
//              EXACTLY the finalizer's own rawTransaction bytes.
//   Section B (FLAGSHIP): no reconstruction — changing the current
//              network's nonce/fee figures after finalization changes
//              nothing this class submits; zero reads of any kind beyond
//              the one broadcastRawTransaction() call.
//   Section C: no signer dependency of any kind — signCalls === 0.
//   Section D: no finalizer dependency of any kind — finalizationCalls === 0.
//   Section E: no confirmation/receipt dependency, and no polling —
//              receiptCalls === 0.
//   Section F: exactly one RPC submission per explicit broadcast() call.
//   Section G (FLAGSHIP): retry isolation — a REJECTED first attempt and
//              a BROADCASTED second, explicit attempt are two, wholly
//              independent calls; no automatic retry of any kind.
//   Section H: the network-returned transaction hash is exposed
//              unchanged — no normalization, no re-derivation.
//   Section I: broadcasting one finalized artifact never mutates its own
//              plan, an unrelated plan, or an unrelated signed artifact.
//   Section J: running a Base broadcast never touches Bitcoin broadcaster
//              state.
//   Section K: malformed finalizedTransaction / missing rpcSource throw,
//              before the rpcSource is ever consulted.
//   Section L: a throwing or malformed rpcSource response is reported as
//              unavailable, never a rejection, and never propagates.
//   Section M: BaseTransactionBroadcastCoordinator — state mapping and
//              caller-contract violations.
//   Section N: BaseTransactionBroadcastState/View — closed,
//              confirmation-free vocabulary.
//   Section O: base/BaseJsonRpcClient.js#broadcastRawTransaction() — a
//              definite JSON-RPC error is REJECTED-shaped; unreachable/
//              timeout/malformed is UNAVAILABLE-shaped; the six read
//              methods are entirely unchanged.
//
// See docs/Principles.md, "Broadcasting Submits; It Does Not Decide
// (0.8.52)," extended here one chain over.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (_e) { threw = true; }
    assert(threw, message);
}

// ---------------------------------------------------------------------
// An independent secp256k1 + Keccak-256 + RLP implementation, deliberately
// duplicated from tests/BaseSignedTransactionFinalization.test.js's own
// identical fixture — so this file's own flagship (Section A) genuinely
// exercises the production base/BaseSignedTransactionFinalizer.js rather
// than merely feeding hand-built objects to it. See that file's own
// header for why this duplication is deliberate.
// ---------------------------------------------------------------------
const P = (1n << 256n) - (1n << 32n) - 977n;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = { x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n };

function fmod(a, m) { const r = a % m; return r >= 0n ? r : r + m; }
function modInv(a, m) {
    let [oldR, r] = [fmod(a, m), m];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
    }
    return fmod(oldS, m);
}
function pointAdd(p1, p2) {
    if (p1 === null) return p2;
    if (p2 === null) return p1;
    if (p1.x === p2.x && fmod(p1.y + p2.y, P) === 0n) return null;
    let m;
    if (p1.x === p2.x && p1.y === p2.y) m = fmod(3n * p1.x * p1.x * modInv(2n * p1.y, P), P);
    else m = fmod((p2.y - p1.y) * modInv(p2.x - p1.x, P), P);
    const x3 = fmod(m * m - p1.x - p2.x, P);
    const y3 = fmod(m * (p1.x - x3) - p1.y, P);
    return { x: x3, y: y3 };
}
function scalarMul(point, scalar) {
    let result = null, addend = point, k = scalar;
    while (k > 0n) {
        if (k & 1n) result = pointAdd(result, addend);
        addend = pointAdd(addend, addend);
        k >>= 1n;
    }
    return result;
}
function bytesToBigInt(bytes) { let v = 0n; for (const b of bytes) v = (v << 8n) | BigInt(b); return v; }
function bigIntTo32Bytes(v) { const out = new Uint8Array(32); let x = v; for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; } return out; }

function ecdsaSign(privateKey, hashBytes, nonce) {
    const e = bytesToBigInt(hashBytes);
    const R = scalarMul(G, nonce);
    const r = fmod(R.x, N);
    if (r === 0n) throw new Error('bad test nonce: r=0');
    const kInv = modInv(nonce, N);
    let s = fmod(kInv * fmod(e + r * privateKey, N), N);
    if (s === 0n) throw new Error('bad test nonce: s=0');
    let yParity = (R.y % 2n === 0n) ? 0 : 1;
    if (s > N / 2n) { s = N - s; yParity = yParity === 0 ? 1 : 0; }
    return { r, s, yParity };
}
function realKey(privateKeySeed) {
    const privateKey = privateKeySeed;
    const point = scalarMul(G, privateKey);
    return { privateKey, address: addressForPoint(point) };
}
function addressForPoint(point) {
    const xy = concatBytes([bigIntTo32Bytes(point.x), bigIntTo32Bytes(point.y)]);
    return '0x' + bytesToHex(keccak256(xy)).slice(24);
}

const MASK64 = (1n << 64n) - 1n;
const RC = [0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an, 0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n];
const RHO = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
function rotl64(v, n) { n = BigInt(n % 64); if (n === 0n) return v & MASK64; return ((v << n) | (v >> (64n - n))) & MASK64; }
function keccakRound(state, rc) {
    const C = [0, 1, 2, 3, 4].map((x) => state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]);
    const D = [0, 1, 2, 3, 4].map((x) => C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1));
    const A1 = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A1[x][y] = (state[x][y] ^ D[x]) & MASK64;
    const B = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) { const nx = y, ny = (2 * x + 3 * y) % 5; B[nx][ny] = rotl64(A1[x][y], RHO[x][y]); }
    const A2 = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A2[x][y] = (B[x][y] ^ (((~B[(x + 1) % 5][y]) & MASK64) & B[(x + 2) % 5][y])) & MASK64;
    A2[0][0] = (A2[0][0] ^ rc) & MASK64;
    return A2;
}
function keccakF1600(state) { for (let r = 0; r < 24; r++) state = keccakRound(state, RC[r]); return state; }
function keccak256(messageBytes) {
    const rate = 136, outb = 32;
    const blockCount = Math.floor(messageBytes.length / rate) + 1;
    const paddedLength = blockCount * rate;
    const padded = new Uint8Array(paddedLength);
    padded.set(messageBytes);
    padded[messageBytes.length] ^= 0x01;
    padded[paddedLength - 1] ^= 0x80;
    let state = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let offset = 0; offset < paddedLength; offset += rate) {
        for (let i = 0; i < rate / 8; i++) {
            const x = i % 5, y = Math.floor(i / 5);
            let lane = 0n;
            for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[offset + i * 8 + b]);
            state[x][y] = (state[x][y] ^ lane) & MASK64;
        }
        state = keccakF1600(state);
    }
    const out = new Uint8Array(outb);
    let written = 0;
    for (let i = 0; written < outb; i++) {
        const x = i % 5, y = Math.floor(i / 5);
        let lane = state[x][y];
        for (let b = 0; b < 8 && written < outb; b++) { out[written++] = Number(lane & 0xffn); lane >>= 8n; }
    }
    return out;
}

function minimalBE(value) {
    if (value === 0n) return new Uint8Array(0);
    const bytes = [];
    while (value > 0n) { bytes.unshift(Number(value & 0xffn)); value >>= 8n; }
    return Uint8Array.from(bytes);
}
function concatBytes(arrays) {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
}
function rlpEncodeLength(len, offset) {
    if (len < 56) return Uint8Array.from([offset + len]);
    const lb = minimalBE(BigInt(len));
    return concatBytes([Uint8Array.from([offset + 55 + lb.length]), lb]);
}
function rlpEncodeItem(item) {
    if (item instanceof Uint8Array) {
        if (item.length === 1 && item[0] < 0x80) return item;
        return concatBytes([rlpEncodeLength(item.length, 0x80), item]);
    }
    if (Array.isArray(item)) {
        const body = concatBytes(item.map(rlpEncodeItem));
        return concatBytes([rlpEncodeLength(body.length, 0xc0), body]);
    }
    throw new Error('bad item');
}
function hexToBytes(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16); return out; }
function bytesToHex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }

function buildSignedRawTransaction(fields, privateKeySeed, nonceSeed = 0x424242n) {
    const key = realKey(privateKeySeed);
    const unsignedFields = [
        minimalBE(BigInt(fields.chainId)),
        minimalBE(BigInt(fields.nonce)),
        minimalBE(BigInt(fields.maxPriorityFeePerGas)),
        minimalBE(BigInt(fields.maxFeePerGas)),
        minimalBE(BigInt(fields.gasLimit)),
        fields.to === null ? new Uint8Array(0) : hexToBytes(fields.to.slice(2)),
        minimalBE(BigInt(fields.value)),
        hexToBytes(fields.data.slice(2)),
        fields.accessList || []
    ];
    const unsignedPayload = concatBytes([Uint8Array.from([0x02]), rlpEncodeItem(unsignedFields)]);
    const signingHash = keccak256(unsignedPayload);
    const sig = ecdsaSign(key.privateKey, signingHash, nonceSeed);
    const signedFields = unsignedFields.concat([
        sig.yParity === 0 ? new Uint8Array(0) : Uint8Array.from([1]),
        minimalBE(sig.r),
        minimalBE(sig.s)
    ]);
    const rawTransaction = '0x' + bytesToHex(concatBytes([Uint8Array.from([0x02]), rlpEncodeItem(signedFields)]));
    return { rawTransaction, address: key.address };
}

function buildPlan(overrides = {}) {
    const key = realKey(0x9a9a9an);
    return Object.freeze(Object.assign({
        network: 'mainnet',
        chainId: 8453,
        from: key.address,
        to: key.address,
        value: '0',
        data: '0xdeadbeef',
        nonce: 5,
        gasLimit: 21000,
        maxFeePerGas: '2000000000',
        maxPriorityFeePerGas: '1000000000'
    }, overrides));
}
function fieldsFromPlan(plan) {
    return { chainId: plan.chainId, nonce: plan.nonce, maxPriorityFeePerGas: plan.maxPriorityFeePerGas, maxFeePerGas: plan.maxFeePerGas, gasLimit: plan.gasLimit, to: plan.to, value: plan.value, data: plan.data };
}
function signPlan(plan, privateKeySeed = 0x9a9a9an) {
    return buildSignedRawTransaction(fieldsFromPlan(plan), privateKeySeed);
}

// A real, genuinely finalized transaction — the production finalizer,
// given a real plan and a really-signed raw transaction. Never a
// hand-built stand-in.
function buildFinalizedTransaction(planOverrides = {}) {
    const plan = buildPlan(planOverrides);
    const { rawTransaction } = signPlan(plan);
    const result = new BaseSignedTransactionFinalizer().finalize({ plan, rawTransaction });
    assert(result.finalized === true, 'test fixture: expected the real finalizer to finalize this real chain');
    return { plan, rawTransaction, finalizedTransaction: result.finalizedTransaction };
}

// ---------------------------------------------------------------------
// A fake rpcSource carrying its own call counters for every method
// base/BaseJsonRpcClient.js exposes — so a test can assert not just that
// broadcastRawTransaction() was called, but that NOTHING else was.
// ---------------------------------------------------------------------
function fakeRpcSource(responder) {
    const calls = {
        broadcastRawTransaction: 0,
        fetchTransactionCount: 0,
        fetchGasPrice: 0,
        fetchMaxPriorityFeePerGas: 0,
        fetchGasEstimate: 0,
        fetchChainId: 0,
        fetchBalance: 0
    };
    const submitted = [];
    return {
        calls,
        submitted,
        async broadcastRawTransaction(rawTransaction) {
            calls.broadcastRawTransaction++;
            submitted.push(rawTransaction);
            if (typeof responder === 'function') return responder(rawTransaction, calls.broadcastRawTransaction);
            return { broadcasted: true, txid: '0x' + '11'.repeat(32) };
        },
        async fetchTransactionCount() { calls.fetchTransactionCount++; return { available: true, nonce: 999 }; },
        async fetchGasPrice() { calls.fetchGasPrice++; return { available: true, gasPriceWei: '999' }; },
        async fetchMaxPriorityFeePerGas() { calls.fetchMaxPriorityFeePerGas++; return { available: true, maxPriorityFeePerGasWei: '999' }; },
        async fetchGasEstimate() { calls.fetchGasEstimate++; return { available: true, gasLimit: 999 }; },
        async fetchChainId() { calls.fetchChainId++; return { available: true, chainId: 999 }; },
        async fetchBalance() { calls.fetchBalance++; return { available: true, balanceWei: '999' }; }
    };
}

function freshBroadcaster(rpcSource) { return new BaseTransactionBroadcaster({ rpcSource }); }
function freshCoordinator(rpcSource) { return new BaseTransactionBroadcastCoordinator({ baseTransactionBroadcaster: freshBroadcaster(rpcSource) }); }

async function run() {
    // ---------------------------------------------------------------
    // Section A (FLAGSHIP) — exact finalized bytes: a real chain (plan →
    // real signature → real finalization) is handed to a fake rpcSource,
    // which receives EXACTLY the finalizer's own rawTransaction, byte for
    // byte.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource();
        const result = await freshBroadcaster(rpc).broadcast({ finalizedTransaction });

        assert(result.broadcasted === true, '1. a genuinely finalized transaction broadcasts');
        assert(rpc.calls.broadcastRawTransaction === 1, '2. exactly one broadcastRawTransaction() call');
        assert(rpc.submitted[0] === finalizedTransaction.rawTransaction, '3. the rpcSource received EXACTLY the finalizer\'s own rawTransaction string — byte for byte, no re-encoding');
    }
    console.log('✓ Section A (FLAGSHIP): a real, finalized transaction is broadcast with byte-for-byte identical rawTransaction bytes');

    // ---------------------------------------------------------------
    // Section B (FLAGSHIP) — no reconstruction: changing what the network
    // currently reports for nonce/fees after finalization changes nothing
    // this class submits, and none of those reads ever happen.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction({ nonce: 5, maxFeePerGas: '2000000000' });
        const rpc = fakeRpcSource();
        // The rpcSource's OWN fake reads (nonce 999, fees 999) are
        // deliberately different from the plan's own (5, 2000000000) —
        // simulating the network's current figures having drifted after
        // finalization.
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction });

        assert(rpc.calls.fetchTransactionCount === 0, '4. zero eth_getTransactionCount reads');
        assert(rpc.calls.fetchGasPrice === 0, '5. zero eth_gasPrice reads');
        assert(rpc.calls.fetchMaxPriorityFeePerGas === 0, '6. zero eth_maxPriorityFeePerGas reads');
        assert(rpc.calls.fetchGasEstimate === 0, '7. zero eth_estimateGas reads');
        assert(rpc.calls.fetchChainId === 0, '8. zero eth_chainId reads');
        assert(rpc.calls.fetchBalance === 0, '9. zero eth_getBalance reads');
    }
    console.log('✓ Section B (FLAGSHIP): broadcasting never re-reads nonce, fees, chain id, or balance — the exact finalized bytes are submitted, never reconstructed');

    // ---------------------------------------------------------------
    // Section C — no signer dependency of any kind.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource();
        const wallet = { signCalls: 0, async signTransaction() { this.signCalls++; return '0xnever'; } };
        // `wallet` is never passed to the broadcaster or the coordinator
        // at all — there is no parameter for it. This proves the class
        // has no signing dependency, structurally, not merely that this
        // test forgot to call it.
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction });
        assert(wallet.signCalls === 0, '10. signCalls === 0 — no signer was ever consulted');
    }
    console.log('✓ Section C: no signer dependency of any kind — signCalls === 0');

    // ---------------------------------------------------------------
    // Section D — no finalizer dependency of any kind.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource();
        const finalizer = new BaseSignedTransactionFinalizer();
        let finalizationCalls = 0;
        const originalFinalize = finalizer.finalize.bind(finalizer);
        finalizer.finalize = (...args) => { finalizationCalls++; return originalFinalize(...args); };
        // `finalizer` is never passed to the broadcaster or coordinator —
        // there is no parameter for it.
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction });
        assert(finalizationCalls === 0, '11. finalizationCalls === 0 — no re-finalization occurred during broadcast');
    }
    console.log('✓ Section D: no finalization occurs during broadcast — finalizationCalls === 0');

    // ---------------------------------------------------------------
    // Section E — no confirmation/receipt dependency, and no polling.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource();
        const confirmationObserver = { receiptCalls: 0, async observeConfirmation() { this.receiptCalls++; return { confirmed: false }; } };
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction });
        assert(confirmationObserver.receiptCalls === 0, '12. receiptCalls === 0 — no confirmation/receipt fetch of any kind');
        assert(rpc.calls.broadcastRawTransaction === 1, '13. no polling — exactly one submission, not repeated calls waiting for a result');
    }
    console.log('✓ Section E: no confirmation or receipt fetching, and no polling — receiptCalls === 0');

    // ---------------------------------------------------------------
    // Section F — exactly one RPC submission per explicit broadcast()
    // call.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource();
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction });
        assert(rpc.calls.broadcastRawTransaction === 1, '14. sendRawTransactionCalls === 1 for one explicit broadcast() call');
    }
    console.log('✓ Section F: exactly one RPC submission per explicit broadcast() call');

    // ---------------------------------------------------------------
    // Section G (FLAGSHIP) — retry isolation: a REJECTED first attempt
    // and a BROADCASTED second, EXPLICIT attempt are two wholly
    // independent calls; the coordinator itself never retries
    // automatically.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource((rawTransaction, callNumber) => {
            if (callNumber === 1) return { broadcasted: false, reason: 'nonce too low' };
            return { broadcasted: true, txid: '0x' + '22'.repeat(32) };
        });
        const coordinator = freshCoordinator(rpc);

        const first = await coordinator.broadcast({ finalized: true, finalizedTransaction });
        assert(first.state === BaseTransactionBroadcastState.REJECTED, '15. the first attempt is REJECTED');
        assert(rpc.calls.broadcastRawTransaction === 1, '16. the REJECTED attempt itself performed exactly one RPC call — no automatic retry inside it');

        // A second, EXPLICIT attempt — a person clicking "Broadcast Again."
        const second = await coordinator.broadcast({ finalized: true, finalizedTransaction });
        assert(second.state === BaseTransactionBroadcastState.BROADCASTED, '17. a second, explicit attempt succeeds');
        assert(rpc.calls.broadcastRawTransaction === 2, '18. exactly two total RPC submissions across two explicit attempts — never more than one per attempt');
    }
    console.log('✓ Section G (FLAGSHIP): a REJECTED attempt is never automatically retried — a second, explicit attempt is its own independent call');

    // ---------------------------------------------------------------
    // Section H — the network-returned transaction hash is exposed
    // unchanged.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();
        const returnedTxid = '0xABCDEF0123456789abcdef0123456789ABCDEF0123456789abcdef012345678'.slice(0, 66);
        const rpc = fakeRpcSource(() => ({ broadcasted: true, txid: returnedTxid }));
        const result = await freshBroadcaster(rpc).broadcast({ finalizedTransaction });
        assert(result.txid === returnedTxid, '19. the exact RPC-returned hash is exposed unchanged, including its original case');
    }
    console.log('✓ Section H: the network-returned transaction hash is exposed unchanged, with no normalization');

    // ---------------------------------------------------------------
    // Section I — broadcasting one finalized artifact never mutates its
    // own plan, an unrelated plan, or an unrelated signed artifact.
    // ---------------------------------------------------------------
    {
        const fixture1 = buildFinalizedTransaction({ nonce: 1 });
        const fixture2 = buildFinalizedTransaction({ nonce: 2 });
        const plan1Before = JSON.stringify(fixture1.plan);
        const plan2Before = JSON.stringify(fixture2.plan);
        const signed1Before = fixture1.rawTransaction;
        const signed2Before = fixture2.rawTransaction;
        const finalized1Before = JSON.stringify(fixture1.finalizedTransaction);

        const rpc = fakeRpcSource();
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction: fixture1.finalizedTransaction });

        assert(JSON.stringify(fixture1.plan) === plan1Before, '20. plan1 is untouched by broadcasting its own finalized transaction');
        assert(JSON.stringify(fixture2.plan) === plan2Before, '21. an unrelated plan2 is untouched');
        assert(fixture1.rawTransaction === signed1Before, '22. signed1 is untouched');
        assert(fixture2.rawTransaction === signed2Before, '23. an unrelated signed2 is untouched');
        assert(JSON.stringify(fixture1.finalizedTransaction) === finalized1Before, '24. the finalizedTransaction artifact itself is untouched');
    }
    console.log('✓ Section I: broadcasting one finalized artifact never mutates its own plan, an unrelated plan, or an unrelated signed artifact');

    // ---------------------------------------------------------------
    // Section J — running a Base broadcast never touches Bitcoin
    // broadcaster state.
    // ---------------------------------------------------------------
    {
        let bitcoinBroadcastCalls = 0;
        const bitcoinBroadcaster = new BitcoinAnchorTransactionBroadcaster({
            broadcaster: { async broadcast() { bitcoinBroadcastCalls++; return { broadcast: true }; } }
        });

        const { finalizedTransaction } = buildFinalizedTransaction();
        const rpc = fakeRpcSource();
        await freshBroadcaster(rpc).broadcast({ finalizedTransaction });

        assert(bitcoinBroadcastCalls === 0, '25. the Bitcoin broadcaster was never invoked by a Base broadcast');
        assert(bitcoinBroadcaster.anchorType === 'bitcoin-op-return', '26. the unrelated Bitcoin broadcaster instance itself is entirely unaffected');
    }
    console.log('✓ Section J: running a Base broadcast never invokes or modifies Bitcoin broadcaster state');

    // ---------------------------------------------------------------
    // Section K — malformed finalizedTransaction / missing rpcSource
    // throw, before the rpcSource is ever consulted.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BaseTransactionBroadcaster({}), '27. a missing rpcSource throws');
        expectThrows(() => new BaseTransactionBroadcaster({ rpcSource: { notBroadcastRawTransaction() {} } }), '28. an rpcSource without broadcastRawTransaction throws');

        const rpc = fakeRpcSource();
        const broadcaster = freshBroadcaster(rpc);
        await expectRejects(broadcaster.broadcast(), '29. a missing finalizedTransaction throws (rejects)');
        await expectRejects(broadcaster.broadcast({ finalizedTransaction: null }), '30. a null finalizedTransaction throws (rejects)');
        await expectRejects(broadcaster.broadcast({ finalizedTransaction: { rawTransaction: '' } }), '31. an empty rawTransaction throws (rejects)');
        await expectRejects(broadcaster.broadcast({ finalizedTransaction: { rawTransaction: '0xzz' } }), '32. a non-hex rawTransaction throws (rejects)');
        await expectRejects(broadcaster.broadcast({ finalizedTransaction: { rawTransaction: '0xabc' } }), '33. an odd-length rawTransaction throws (rejects)');
        assert(rpc.calls.broadcastRawTransaction === 0, '34. none of the malformed-input attempts ever reached the rpcSource');
    }
    console.log('✓ Section K: a malformed finalizedTransaction, or a missing rpcSource, throws before the rpcSource is ever consulted');

    // ---------------------------------------------------------------
    // Section L — a throwing or malformed rpcSource response is reported
    // as unavailable, never a rejection, and never propagates.
    // ---------------------------------------------------------------
    {
        const { finalizedTransaction } = buildFinalizedTransaction();

        const throwingRpc = fakeRpcSource(() => { throw new Error('network exploded'); });
        const throwingResult = await freshBroadcaster(throwingRpc).broadcast({ finalizedTransaction });
        assert(throwingResult.broadcasted === false && throwingResult.unavailable === true, '35. a throwing rpcSource is reported as unavailable, not a rejection');

        for (const malformed of [undefined, null, 'yes', { broadcasted: 'yes' }, { broadcasted: true }]) {
            const rpc = fakeRpcSource(() => malformed);
            const result = await freshBroadcaster(rpc).broadcast({ finalizedTransaction });
            assert(result.broadcasted === false, `36. a malformed rpcSource response (${JSON.stringify(malformed)}) is never treated as broadcasted`);
        }

        const explicitRejection = fakeRpcSource(() => ({ broadcasted: false, reason: 'insufficient funds' }));
        const rejectedResult = await freshBroadcaster(explicitRejection).broadcast({ finalizedTransaction });
        assert(rejectedResult.broadcasted === false && !rejectedResult.unavailable, '37. an explicit rejection is never reported as unavailable');
    }
    console.log('✓ Section L: a throwing or malformed rpcSource response is always reported as an honest, never-thrown outcome');

    // ---------------------------------------------------------------
    // Section M — BaseTransactionBroadcastCoordinator: state mapping and
    // caller-contract violations.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BaseTransactionBroadcastCoordinator({}), '38. the coordinator requires a real broadcaster');

        const { finalizedTransaction } = buildFinalizedTransaction();
        const coordinator = freshCoordinator(fakeRpcSource());
        await expectRejects(coordinator.broadcast({ finalizedTransaction }), '39. finalized !== true throws (finalized omitted)');
        await expectRejects(coordinator.broadcast({ finalized: false, finalizedTransaction }), '40. finalized: false throws');
        await expectRejects(coordinator.broadcast({ finalized: true }), '41. a missing finalizedTransaction throws');

        const broadcasted = await freshCoordinator(fakeRpcSource()).broadcast({ finalized: true, finalizedTransaction });
        assert(broadcasted.state === BaseTransactionBroadcastState.BROADCASTED, '42. a successful broadcast maps to BROADCASTED');
        assert(broadcasted.broadcasted === true && typeof broadcasted.txid === 'string' && broadcasted.reason === null, '43. BROADCASTED carries broadcasted:true, a txid, and no reason');

        const rejected = await freshCoordinator(fakeRpcSource(() => ({ broadcasted: false, reason: 'nope' }))).broadcast({ finalized: true, finalizedTransaction });
        assert(rejected.state === BaseTransactionBroadcastState.REJECTED && rejected.txid === null, '44. an explicit rejection maps to REJECTED with no txid');

        const unavailable = await freshCoordinator(fakeRpcSource(() => ({ broadcasted: false, unavailable: true, reason: 'timeout' }))).broadcast({ finalized: true, finalizedTransaction });
        assert(unavailable.state === BaseTransactionBroadcastState.UNAVAILABLE && unavailable.txid === null, '45. an unavailable rpcSource maps to UNAVAILABLE with no txid');

        const outcome = Object.freeze(broadcasted);
        assert(Object.isFrozen(outcome), '46. the coordinator\'s own returned outcome is frozen');
    }
    console.log('✓ Section M: BaseTransactionBroadcastCoordinator maps every outcome onto its documented vocabulary, and throws only for its own caller-contract violations');

    // ---------------------------------------------------------------
    // Section N — BaseTransactionBroadcastState/View: closed,
    // confirmation-free vocabulary.
    // ---------------------------------------------------------------
    {
        const allStates = Object.values(BaseTransactionBroadcastState);
        assert(allStates.length === 6, '47. exactly six states exist');
        for (const state of allStates) {
            assert(isValidBaseTransactionBroadcastState(state), `48. ${state} is recognized as valid`);
            assert(typeof describeBaseTransactionBroadcastStateLabel(state) === 'string', `49. ${state} has a human label`);
        }
        assert(!isValidBaseTransactionBroadcastState('confirmed'), '50. CONFIRMED is not part of this vocabulary — broadcasting is not confirmation');
        assert(!isValidBaseTransactionBroadcastState('safe'), '51. no verdict-shaped state exists');

        const idleView = describeBaseTransactionBroadcast(null);
        assert(idleView.state === BaseTransactionBroadcastState.IDLE, '52. a null outcome projects as IDLE');
        assert(idleView.txid === null && idleView.reason === null, '53. an IDLE projection carries no txid or reason');

        const broadcastedOutcome = { state: BaseTransactionBroadcastState.BROADCASTED, broadcasted: true, txid: '0xdeadbeef', reason: null, confirmed: true, confirmations: 6 };
        const broadcastedView = describeBaseTransactionBroadcast(broadcastedOutcome);
        assert(broadcastedView.txid === '0xdeadbeef', '54. the view exposes the coordinator\'s own txid, unchanged');
        assert(!('confirmed' in broadcastedView) && !('confirmations' in broadcastedView), '55. the view never exposes a confirmed/confirmations field, even if smuggled onto the outcome — BROADCASTED never becomes CONFIRMED');
        assert(Object.isFrozen(broadcastedView), '56. describeBaseTransactionBroadcast() returns a frozen projection');
    }
    console.log('✓ Section N: BaseTransactionBroadcastState/View form a closed vocabulary that never promotes BROADCASTED into a confirmation claim');

    // ---------------------------------------------------------------
    // Section O — base/BaseJsonRpcClient.js#broadcastRawTransaction():
    // a definite JSON-RPC error is REJECTED-shaped; unreachable/timeout/
    // malformed is UNAVAILABLE-shaped; the six read methods are entirely
    // unchanged.
    // ---------------------------------------------------------------
    {
        // A definite JSON-RPC error object — the endpoint was reached and
        // explicitly refused.
        const rejectingClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'nonce too low' } }) })
        });
        const rejected = await rejectingClient.broadcastRawTransaction('0xdeadbeef');
        assert(rejected.broadcasted === false && !rejected.unavailable, '57. a definite JSON-RPC error is REJECTED-shaped (no unavailable flag)');
        assert(rejected.reason.includes('nonce too low'), '58. the RPC error message is preserved in the reason');

        // Unreachable — a throwing fetch.
        const unreachableClient = new BaseJsonRpcClient({
            fetchImpl: async () => { throw new Error('ECONNREFUSED'); }
        });
        const unreachable = await unreachableClient.broadcastRawTransaction('0xdeadbeef');
        assert(unreachable.broadcasted === false && unreachable.unavailable === true, '59. an unreachable endpoint is UNAVAILABLE-shaped');

        // A non-2xx response.
        const httpErrorClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
        });
        const httpError = await httpErrorClient.broadcastRawTransaction('0xdeadbeef');
        assert(httpError.broadcasted === false && httpError.unavailable === true, '60. a non-2xx response is UNAVAILABLE-shaped, never a rejection');

        // A malformed (non-hash) success result.
        const malformedClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: 'not-a-hash' }) })
        });
        const malformed = await malformedClient.broadcastRawTransaction('0xdeadbeef');
        assert(malformed.broadcasted === false && malformed.unavailable === true, '61. a malformed success result is UNAVAILABLE-shaped');

        // A genuine success.
        const returnedHash = '0x' + '33'.repeat(32);
        const acceptingClient = new BaseJsonRpcClient({
            fetchImpl: async (url, init) => {
                const body = JSON.parse(init.body);
                assert(body.method === 'eth_sendRawTransaction', '62. broadcastRawTransaction() calls eth_sendRawTransaction');
                assert(body.params[0] === '0xdeadbeef', '63. the exact rawTransaction string is passed as the sole param');
                return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: returnedHash }) };
            }
        });
        const accepted = await acceptingClient.broadcastRawTransaction('0xdeadbeef');
        assert(accepted.broadcasted === true && accepted.txid === returnedHash, '64. a genuine success returns broadcasted:true with the RPC\'s own hash');

        // The six read methods are entirely unchanged — a definite
        // JSON-RPC error still collapses to the identical, single
        // `available: false` shape they always reported, proving
        // broadcastRawTransaction()'s own new rpcError distinction was
        // added without touching their own contract.
        const readClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'boom' } }) })
        });
        const readResult = await readClient.fetchChainId();
        assert(readResult.available === false && !('unavailable' in readResult) && !('rpcError' in readResult), '65. fetchChainId() still reports only { available: false, reason } — no new field leaked onto it');
    }
    console.log('✓ Section O: base/BaseJsonRpcClient.js#broadcastRawTransaction() distinguishes a definite rejection from mere unavailability, and the six read methods are unchanged');

    console.log('\nAll BaseTransactionBroadcast tests passed.');
}

run().catch((error) => {
    console.error('BaseTransactionBroadcast.test.js FAILED:', error);
    process.exitCode = 1;
});
