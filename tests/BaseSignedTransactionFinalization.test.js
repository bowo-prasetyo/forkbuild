import { decodeBaseSignedTransaction } from '../base/BaseSignedTransactionCodec.js';
import { BaseSignedTransactionFinalizer } from '../base/BaseSignedTransactionFinalizer.js';
import { BaseSignedTransactionFinalizationCoordinator } from '../application/BaseSignedTransactionFinalizationCoordinator.js';
import { BaseSignedTransactionFinalizationState, isValidBaseSignedTransactionFinalizationState } from '../application/BaseSignedTransactionFinalizationState.js';
import { describeBaseSignedTransactionFinalization, describeBaseSignedTransactionFinalizationStateLabel } from '../application/BaseSignedTransactionFinalizationView.js';

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
//
// The flagship this milestone exists to prove: a signed transaction is
// finalized ONLY when it independently, cryptographically corresponds to
// the EXACT plan that was reviewed — never merely because a wallet
// returned some bytes claiming to be signed. See docs/Roadmap.md,
// "0.8.94 — Explicit Base Signed Transaction Verification & Finalization."
//
//   Section A (FLAGSHIP): exact plan survives — the finalizer uses only
//              the plan it is explicitly handed, never a fresher one, and
//              makes zero network calls.
//   Section B (FLAGSHIP): a correctly signed transaction matching the
//              plan finalizes, with a cryptographically recovered `from`.
//   Section C (FLAGSHIP): a transaction signed by the WRONG account is
//              INVALID_SIGNATURE — stronger than comparing a supplied
//              `from` string.
//   Section D: a modified nonce is refused (FAILED, structural).
//   Section E: modified gasLimit/maxFeePerGas/maxPriorityFeePerGas are
//              each refused independently.
//   Section F: modified to/value/data are each refused independently.
//   Section G (FLAGSHIP): a modified commitment (plan.data vs. the
//              signed transaction's own data) is refused — this is where
//              the publication commitment lives.
//   Section H: chain separation — a transaction signed for a different
//              chain id never finalizes against a Base plan.
//   Section I: no broadcast — zero network calls, and the outcome carries
//              no broadcast-shaped field of any kind.
//   Section J: artifact isolation — finalizing one transaction never
//              mutates its own plan, an unrelated plan, or an unrelated
//              signed artifact.
//   Section K: BaseSignedTransactionFinalizationCoordinator — state
//              mapping and caller-contract violations.
//   Section L: BaseSignedTransactionFinalizationState/View — closed,
//              verdict-free vocabulary.
//   Section M: base/BaseSignedTransactionCodec.js — structural decode
//              failures (bad RLP, wrong envelope type, non-empty access
//              list, contract creation) vs. genuine cryptographic ones.
//   Section N: a malformed `plan` throws, before rawTransaction is ever
//              considered.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

// ---------------------------------------------------------------------
// Independent secp256k1 + Keccak-256 + RLP — deliberately reimplemented
// separately from base/BaseSignedTransactionCodec.js's own copy, so that
// a real signature produced against THIS implementation genuinely tests
// the production decoder rather than merely feeding its own internal
// logic back into itself. Mirrors tests/BitcoinAnchorPsbtFinalization.test.js's
// own identical restraint, one chain over.
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

// ECDSA sign with an explicit, deterministic nonce (a fixed test seed) —
// deterministic, reproducible fixtures; this is a test file, not a
// wallet. Normalizes to low-s and computes yParity exactly as a real
// Ethereum signer does.
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

// --- Keccak-256 (Ethereum's own, 0x01 padding — see base/BaseSignedTransactionCodec.js's own header) ---
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

// --- RLP encode (canonical) ---
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

// Builds a real, canonically RLP-encoded, EIP-1559-signed raw transaction
// hex string from an explicit field set and a private key — the ONE
// helper every section below uses to fabricate genuine signed fixtures.
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

function freshFinalizer() { return new BaseSignedTransactionFinalizer(); }
function freshCoordinator() { return new BaseSignedTransactionFinalizationCoordinator({ baseSignedTransactionFinalizer: freshFinalizer() }); }

async function run() {
    // ---------------------------------------------------------------
    // Section A (FLAGSHIP) — exact plan survives: the finalizer uses
    // ONLY the plan it is explicitly handed, never a fresher one, and
    // makes zero network calls.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const { rawTransaction } = signPlan(plan);

        // A "fresher" plan the network might report later — genuinely
        // different nonce and fees, as if constructed after the RPC's
        // own current figures changed.
        const fresherPlan = buildPlan({ nonce: 99, maxFeePerGas: '9999999999', maxPriorityFeePerGas: '9999999999' });

        const originalFetch = globalThis.fetch;
        let networkCallAttempted = false;
        globalThis.fetch = async (...args) => { networkCallAttempted = true; throw new Error(`unexpected network call: ${JSON.stringify(args)}`); };
        let result;
        try {
            result = freshFinalizer().finalize({ plan, rawTransaction });
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(result.finalized === true, '1. the OLD signed artifact still finalizes against the ORIGINAL plan it was signed against');
        assert(networkCallAttempted === false, '2. finalize() makes zero network calls of any kind');

        // The SAME signed bytes, checked against the fresher plan
        // instead, are refused — proving the finalizer genuinely
        // compares against whatever plan it is handed, not some cached
        // "current" notion of the transaction.
        const againstFresher = freshFinalizer().finalize({ plan: fresherPlan, rawTransaction });
        assert(againstFresher.finalized === false, '3. the identical signed bytes do NOT finalize against a different (fresher) plan');
    }
    console.log('✓ Section A (FLAGSHIP): the finalizer uses only the exact plan it is handed, never a fresher one, and makes zero network calls');

    // ---------------------------------------------------------------
    // Section B (FLAGSHIP) — a correctly signed transaction matching the
    // plan finalizes, with a cryptographically recovered `from`.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const { rawTransaction, address } = signPlan(plan);
        const result = freshFinalizer().finalize({ plan, rawTransaction });
        assert(result.finalized === true, '4. a correctly signed transaction matching the plan finalizes');
        assert(result.invalidSignature === false, '5. a FINALIZED result never carries invalidSignature: true');
        assert(result.reason === null, '6. a FINALIZED result carries no reason');
        assert(result.finalizedTransaction.from === address, '7. the finalized artifact\'s own `from` is the cryptographically RECOVERED signer');
        assert(result.finalizedTransaction.from === plan.from, '8. the recovered `from` matches the reviewed plan\'s own `from`');
        assert(typeof result.finalizedTransaction.transactionHash === 'string' && result.finalizedTransaction.transactionHash.startsWith('0x'), '9. a real transactionHash is produced');
        assert(result.finalizedTransaction.rawTransaction === rawTransaction, '10. the finalized artifact carries the exact rawTransaction unmodified');
        assert(result.finalizedTransaction.network === plan.network, '11. the finalized artifact carries the plan\'s own network');
        assert(Object.isFrozen(result.finalizedTransaction), '12. the finalized artifact is frozen');
    }
    console.log('✓ Section B (FLAGSHIP): a correctly signed transaction matching the plan finalizes, with a cryptographically recovered `from`');

    // ---------------------------------------------------------------
    // Section C (FLAGSHIP) — a transaction signed by the WRONG account
    // is INVALID_SIGNATURE — stronger than comparing a supplied `from`
    // string, because the finalizer never reads a `from` field at all.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const { rawTransaction } = buildSignedRawTransaction(fieldsFromPlan(plan), 0xdeadn); // a DIFFERENT private key
        const result = freshFinalizer().finalize({ plan, rawTransaction });
        assert(result.finalized === false, '13. a transaction signed by another account never finalizes');
        assert(result.invalidSignature === true, '14. wrong signer is reported as invalidSignature: true');
        assert(result.finalizedTransaction === null, '15. no finalizedTransaction is ever produced for a wrong-signer result');
        assert(/does not match/.test(result.reason), '16. the reason explicitly names the mismatch');
    }
    console.log('✓ Section C (FLAGSHIP): a transaction signed by the wrong account is INVALID_SIGNATURE, cryptographically — never a mere string comparison');

    // ---------------------------------------------------------------
    // Section D — a modified nonce is refused (structural, FAILED).
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const { rawTransaction } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), { nonce: plan.nonce + 1 }), 0x9a9a9an);
        const result = freshFinalizer().finalize({ plan, rawTransaction });
        assert(result.finalized === false, '17. a modified nonce never finalizes');
        assert(result.invalidSignature === false, '18. a modified nonce is a structural mismatch, never invalidSignature');
        assert(/nonce/.test(result.reason), '19. the reason names the nonce specifically');
    }
    console.log('✓ Section D: a modified nonce is refused, structurally, before cryptography is even consulted for it');

    // ---------------------------------------------------------------
    // Section E — modified gasLimit/maxFeePerGas/maxPriorityFeePerGas
    // are each refused independently.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const cases = [
            { gasLimit: plan.gasLimit + 1000 },
            { maxFeePerGas: '3000000000' },
            { maxPriorityFeePerGas: '2000000000' }
        ];
        for (const override of cases) {
            const { rawTransaction } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), override), 0x9a9a9an);
            const result = freshFinalizer().finalize({ plan, rawTransaction });
            assert(result.finalized === false, `20. a modified ${Object.keys(override)[0]} never finalizes`);
            assert(result.invalidSignature === false, `21. a modified ${Object.keys(override)[0]} is a structural mismatch`);
        }
    }
    console.log('✓ Section E: modified gasLimit/maxFeePerGas/maxPriorityFeePerGas are each independently refused');

    // ---------------------------------------------------------------
    // Section F — modified to/value/data are each refused independently.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const otherAddress = realKey(0x777777n).address;
        const cases = [
            { to: otherAddress },
            { value: '1000000000000000' },
            { data: '0xcafebabe' }
        ];
        for (const override of cases) {
            const { rawTransaction } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), override), 0x9a9a9an);
            const result = freshFinalizer().finalize({ plan, rawTransaction });
            assert(result.finalized === false, `22. a modified ${Object.keys(override)[0]} never finalizes`);
            assert(result.invalidSignature === false, `23. a modified ${Object.keys(override)[0]} is a structural mismatch, not a signature failure`);
        }
    }
    console.log('✓ Section F: modified to/value/data are each independently refused');

    // ---------------------------------------------------------------
    // Section G (FLAGSHIP) — a modified commitment: plan.data carries
    // commitment A while the signed transaction carries commitment B.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan({ data: '0x' + 'aa'.repeat(32) });
        const { rawTransaction } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), { data: '0x' + 'bb'.repeat(32) }), 0x9a9a9an);
        const result = freshFinalizer().finalize({ plan, rawTransaction });
        assert(result.finalized === false, '24. a transaction publishing a DIFFERENT commitment than the reviewed plan never finalizes');
        assert(result.invalidSignature === false, '25. a commitment mismatch is structural, not a cryptographic signature failure');
        assert(/data/.test(result.reason) && /commitment/.test(result.reason), '26. the reason explicitly names the commitment/data mismatch');
    }
    console.log('✓ Section G (FLAGSHIP): a transaction carrying a different commitment than the reviewed plan is refused, explicitly naming the mismatch');

    // ---------------------------------------------------------------
    // Section H — chain separation: a transaction signed for a
    // different chain id never finalizes against a Base plan.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan({ chainId: 8453 }); // Base mainnet
        const { rawTransaction } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), { chainId: 1 }), 0x9a9a9an); // Ethereum mainnet
        const result = freshFinalizer().finalize({ plan, rawTransaction });
        assert(result.finalized === false, '27. a transaction signed for a different chain id never finalizes against a Base plan');
        assert(/chainId/.test(result.reason), '28. the reason names the chainId mismatch');
    }
    console.log('✓ Section H: chain separation — a transaction signed for a different chain id never finalizes against a Base plan');

    // ---------------------------------------------------------------
    // Section I — no broadcast: zero network calls, and the outcome
    // carries no broadcast-shaped field of any kind.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const { rawTransaction } = signPlan(plan);
        const originalFetch = globalThis.fetch;
        let networkCallAttempted = false;
        globalThis.fetch = async (...args) => { networkCallAttempted = true; throw new Error(`unexpected network call: ${JSON.stringify(args)}`); };
        let outcome;
        try {
            outcome = freshCoordinator().finalize({ plan, rawTransaction });
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(outcome.state === BaseSignedTransactionFinalizationState.FINALIZED, '29. finalization succeeds with no network access available at all');
        assert(networkCallAttempted === false, '30. finalize() never attempts a network call — FINALIZED is not a broadcast');
        assert(!('broadcast' in outcome) && !('broadcasted' in outcome), '31. the outcome carries no broadcast-shaped field of any kind');
        assert(typeof BaseSignedTransactionFinalizer.prototype.broadcast === 'undefined', '32. BaseSignedTransactionFinalizer exposes no broadcast method of any kind');
    }
    console.log('✓ Section I: no broadcast — zero network calls, and the outcome carries no broadcast-shaped field of any kind');

    // ---------------------------------------------------------------
    // Section J — artifact isolation: finalizing one transaction never
    // mutates its own plan, an unrelated plan, or an unrelated signed
    // artifact.
    // ---------------------------------------------------------------
    {
        const plan1 = buildPlan({ data: '0x11111111', nonce: 1 });
        const plan2 = buildPlan({ data: '0x22222222', nonce: 2 });
        const signed1 = signPlan(plan1);
        const signed2 = signPlan(plan2);
        const plan1KeysBefore = Object.keys(plan1).sort().join(',');
        const plan2KeysBefore = Object.keys(plan2).sort().join(',');
        const plan1JsonBefore = JSON.stringify(plan1);
        const plan2JsonBefore = JSON.stringify(plan2);

        const result1 = freshFinalizer().finalize({ plan: plan1, rawTransaction: signed1.rawTransaction });
        const result2 = freshFinalizer().finalize({ plan: plan2, rawTransaction: signed2.rawTransaction });

        assert(result1.finalized === true && result2.finalized === true, '33. both, unrelated finalizations succeed independently');
        assert(Object.keys(plan1).sort().join(',') === plan1KeysBefore, '34. plan1 gains no field of its own from finalization');
        assert(Object.keys(plan2).sort().join(',') === plan2KeysBefore, '35. plan2 gains no field of its own from finalization');
        assert(JSON.stringify(plan1) === plan1JsonBefore, '36. plan1 is byte-identical before and after finalization');
        assert(JSON.stringify(plan2) === plan2JsonBefore, '37. plan2 is byte-identical before and after finalization');
        assert(result1.finalizedTransaction.data !== result2.finalizedTransaction.data, '38. the two finalized artifacts carry their own, distinct data');
    }
    console.log('✓ Section J: finalizing one transaction never mutates its own plan, an unrelated plan, or an unrelated signed artifact');

    // ---------------------------------------------------------------
    // Section K — BaseSignedTransactionFinalizationCoordinator: state
    // mapping and caller-contract violations.
    // ---------------------------------------------------------------
    {
        const plan = buildPlan();
        const { rawTransaction } = signPlan(plan);
        const finalized = freshCoordinator().finalize({ plan, rawTransaction });
        assert(finalized.state === BaseSignedTransactionFinalizationState.FINALIZED, '39. a correct signature maps to FINALIZED');

        const { rawTransaction: wrongSigner } = buildSignedRawTransaction(fieldsFromPlan(plan), 0xdeadn);
        const invalid = freshCoordinator().finalize({ plan, rawTransaction: wrongSigner });
        assert(invalid.state === BaseSignedTransactionFinalizationState.INVALID_SIGNATURE, '40. a wrong signer maps to INVALID_SIGNATURE');

        const { rawTransaction: modified } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), { nonce: plan.nonce + 1 }), 0x9a9a9an);
        const failed = freshCoordinator().finalize({ plan, rawTransaction: modified });
        assert(failed.state === BaseSignedTransactionFinalizationState.FAILED, '41. a structural mismatch maps to FAILED');

        expectThrows(() => freshCoordinator().finalize({ rawTransaction }), '42. a missing plan throws');
        expectThrows(() => freshCoordinator().finalize({ plan }), '43. a missing rawTransaction throws');
        expectThrows(() => new BaseSignedTransactionFinalizationCoordinator({}), '44. a missing finalizer throws at construction');
        expectThrows(() => new BaseSignedTransactionFinalizationCoordinator({ baseSignedTransactionFinalizer: {} }), '45. a finalizer without finalize() throws at construction');

        for (const outcome of [finalized, invalid, failed]) {
            assert(outcome.finalizedTransaction === null || outcome.state === BaseSignedTransactionFinalizationState.FINALIZED, '46. finalizedTransaction is null for every non-FINALIZED outcome');
        }
    }
    console.log('✓ Section K: BaseSignedTransactionFinalizationCoordinator maps every outcome onto its documented vocabulary, and throws only for its own caller-contract violations');

    // ---------------------------------------------------------------
    // Section L — BaseSignedTransactionFinalizationState/View: closed,
    // verdict-free vocabulary.
    // ---------------------------------------------------------------
    {
        const states = Object.values(BaseSignedTransactionFinalizationState);
        assert(states.length === 6, '47. exactly six states exist');
        for (const state of states) {
            assert(isValidBaseSignedTransactionFinalizationState(state), `48. ${state} is recognized as valid`);
            assert(typeof describeBaseSignedTransactionFinalizationStateLabel(state) === 'string', `49. ${state} has a label`);
        }
        assert(!isValidBaseSignedTransactionFinalizationState('finalized_and_trusted'), '50. an invented state is never valid');

        const idleView = describeBaseSignedTransactionFinalization(null);
        assert(idleView.state === BaseSignedTransactionFinalizationState.IDLE, '51. a null outcome projects as IDLE');
        assert(idleView.hasFinalizedTransaction === false, '52. IDLE carries no finalized transaction');

        const plan = buildPlan();
        const { rawTransaction } = signPlan(plan);
        const finalizedOutcome = freshCoordinator().finalize({ plan, rawTransaction });
        const finalizedViewResult = describeBaseSignedTransactionFinalization(finalizedOutcome);
        assert(finalizedViewResult.hasFinalizedTransaction === true, '53. FINALIZED carries hasFinalizedTransaction: true');
        assert(finalizedViewResult.from === plan.from, '54. the view surfaces the recovered from address');
        assert(!('rawTransaction' in finalizedViewResult) && !('finalizedTransaction' in finalizedViewResult), '55. the view never exposes the raw signed or finalized artifact itself');
        assert(!('safe' in finalizedViewResult) && !('trusted' in finalizedViewResult) && !('verified' in finalizedViewResult) && !('ready' in finalizedViewResult), '56. the view carries no verdict field of any kind beyond `state`');
    }
    console.log('✓ Section L: BaseSignedTransactionFinalizationState/View form a closed, verdict-free vocabulary that never exposes the raw artifact');

    // ---------------------------------------------------------------
    // Section M — base/BaseSignedTransactionCodec.js: structural decode
    // failures vs. genuine cryptographic ones.
    // ---------------------------------------------------------------
    {
        const notHex = decodeBaseSignedTransaction('not-a-hex-string');
        assert(notHex.decoded === false && notHex.cryptographicFailure === false, '57. non-hex input is a structural failure');

        const legacyType = decodeBaseSignedTransaction('0xc0'); // a bare, empty RLP list — no 0x02 type prefix
        assert(legacyType.decoded === false && legacyType.cryptographicFailure === false, '58. a non-EIP-1559 envelope is a structural failure, never cryptographic');

        const plan = buildPlan();
        const { rawTransaction: contractCreationRaw } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), { to: null }), 0x9a9a9an);
        const contractCreation = decodeBaseSignedTransaction(contractCreationRaw);
        assert(contractCreation.decoded === false && contractCreation.cryptographicFailure === false, '59. a contract-creation transaction (empty `to`) is refused, structurally');

        const { rawTransaction: withAccessListRaw } = buildSignedRawTransaction(Object.assign(fieldsFromPlan(plan), { accessList: [[hexToBytes(plan.to.slice(2)), []]] }), 0x9a9a9an);
        const withAccessList = decodeBaseSignedTransaction(withAccessListRaw);
        assert(withAccessList.decoded === true && withAccessList.transaction.accessListLength === 1, '60. a non-empty access list decodes structurally, its length reported honestly');
        const accessListResult = freshFinalizer().finalize({ plan, rawTransaction: withAccessListRaw });
        assert(accessListResult.finalized === false && accessListResult.invalidSignature === false, '61. a non-empty access list is refused by the finalizer as a structural drift from the reviewed plan');

        // A genuinely invalid signature: same structure, `s` forced to 0
        // (out of the valid ECDSA range [1, n-1]) — a real cryptographic
        // failure the codec's own ecrecover() must catch, never a
        // structural RLP problem.
        const key = realKey(0x9a9a9an);
        const unsignedFieldsForCorruption = [
            minimalBE(BigInt(plan.chainId)), minimalBE(BigInt(plan.nonce)),
            minimalBE(BigInt(plan.maxPriorityFeePerGas)), minimalBE(BigInt(plan.maxFeePerGas)),
            minimalBE(BigInt(plan.gasLimit)), hexToBytes(plan.to.slice(2)),
            minimalBE(BigInt(plan.value)), hexToBytes(plan.data.slice(2)), []
        ];
        const corruptedSigningHash = keccak256(concatBytes([Uint8Array.from([0x02]), rlpEncodeItem(unsignedFieldsForCorruption)]));
        const realSig = ecdsaSign(key.privateKey, corruptedSigningHash, 0x777n);
        const corruptedFields = unsignedFieldsForCorruption.concat([
            new Uint8Array(0), minimalBE(realSig.r), new Uint8Array(0) // s forced to 0 — out of range
        ]);
        const corrupted = '0x' + bytesToHex(concatBytes([Uint8Array.from([0x02]), rlpEncodeItem(corruptedFields)]));
        const corruptedDecode = decodeBaseSignedTransaction(corrupted);
        assert(corruptedDecode.decoded === false && corruptedDecode.cryptographicFailure === true, '62. a signature with s=0 (out of the valid ECDSA range) is a genuine cryptographic decode failure');

        assert(decodeBaseSignedTransaction('').decoded === false, '63. an empty string is refused, never throws');
        assert(decodeBaseSignedTransaction(null).decoded === false, '64. a null rawTransaction is refused, never throws');
        assert(decodeBaseSignedTransaction(12345).decoded === false, '65. a non-string rawTransaction is refused, never throws');
    }
    console.log('✓ Section M: base/BaseSignedTransactionCodec.js distinguishes structural decode failures from genuine cryptographic ones, and never throws for untrusted input');

    // ---------------------------------------------------------------
    // Section N — a malformed `plan` throws, before rawTransaction is
    // ever considered.
    // ---------------------------------------------------------------
    {
        const { rawTransaction } = signPlan(buildPlan());
        expectThrows(() => freshFinalizer().finalize({ rawTransaction }), '66. a missing plan throws');
        expectThrows(() => freshFinalizer().finalize({ plan: { network: 'mainnet' }, rawTransaction }), '67. an incomplete plan throws');
        expectThrows(() => freshFinalizer().finalize({ plan: buildPlan({ chainId: -1 }), rawTransaction }), '68. a plan with an invalid chainId throws');
        expectThrows(() => freshFinalizer().finalize({ plan: buildPlan({ from: 'not-an-address' }), rawTransaction }), '69. a plan with a malformed from address throws');
    }
    console.log('✓ Section N: a malformed plan throws before rawTransaction is ever considered — the identical caller-contract restraint every prior stage in this pipeline already holds');

    console.log('\nAll BaseSignedTransactionFinalization tests passed.');
}

run().catch((error) => {
    console.error('BaseSignedTransactionFinalization.test.js FAILED:', error);
    process.exitCode = 1;
});
