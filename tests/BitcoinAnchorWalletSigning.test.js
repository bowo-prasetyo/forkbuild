import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorSignedPsbtInspector } from '../anchoring/BitcoinAnchorSignedPsbtInspector.js';
import { BitcoinAnchorWalletSigner } from '../anchoring/BitcoinAnchorWalletSigner.js';

// 0.8.50 — Explicit Bitcoin Wallet Signing.
//
// The flagship this milestone exists to prove: ForkBuild can hand a real
// 0.8.49 unsigned PSBT to an external wallet, get a claimed signed PSBT
// back, and NEVER call it "signed" unless independent inspection confirms
// it still names the exact transaction ForkBuild asked to have signed.
// Never a private key, never a signature ForkBuild itself produced, never
// a broadcast — and never blind trust in a wallet's own "signed: true"
// claim.
//
//   Section A: flagship — BitcoinAnchorSignedPsbtInspector recognizes a
//              correctly-signed segwit PSBT (finalScriptWitness) as intact.
//   Section B: flagship, end to end — BitcoinAnchorWalletSigner drives a
//              real plan through a real description to a signed result via
//              an injected fake wallet that actually signs correctly.
//   Section C: a legacy (p2pkh) input's finalScriptSig is recognized the
//              same way.
//   Section D: a not-yet-finalized partialSig alone is enough to count as
//              "carries signing material."
//   Section E: THE CORE INVARIANT — a wallet that returns a signed PSBT
//              for a SUBSTITUTED transaction (a changed output value) is
//              refused, by the inspector directly and by the signer's own
//              wallet-response boundary alike.
//   Section F: a signed PSBT whose claimed prevout no longer matches the
//              original description (a changed witnessUtxo) is refused.
//   Section G: a "signed" PSBT that still carries no signing material at
//              all (i.e., is just the unsigned PSBT again) is refused.
//   Section H: an unrecognized input field (the shape a BIP32 derivation
//              path would have) is refused, not silently ignored.
//   Section I: multi-input — tampering with just one of several inputs is
//              still caught; a fully-correct multi-input signs cleanly.
//   Section J: wallet tri-state — a definite decline, an unavailable
//              wallet (via a thrown error), and a wallet-contract
//              violation (signed: true with no psbt) all stay
//              distinguishable.
//   Section K: caller-contract violations — a missing/incapable wallet is
//              refused at construction; a malformed description is
//              refused before the wallet is ever consulted.
//   Section L: the inspector accepts a signed PSBT as raw bytes, hex, or
//              base64 alike.
//
// See docs/Principles.md, "A Wallet's Claim Is Not The Signature (0.8.50)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, ...(scriptType ? { scriptType } : {}) };
}

// ---------------------------------------------------------------------
// A wholly independent, hand-rolled signed-PSBT encoder — plain hex-string
// manipulation, sharing no code with anchoring/
// BitcoinAnchorSignedPsbtInspector.js's own decoder — used to construct
// exactly the shapes a real wallet's response could take, correct and
// tampered alike.
// ---------------------------------------------------------------------

function u32le(n) {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
        .map((b) => b.toString(16).padStart(2, '0')).join('');
}

function u64le(n) {
    let big = BigInt(n);
    const bytes = [];
    for (let i = 0; i < 8; i++) { bytes.push(Number(big & 0xffn)); big >>= 8n; }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function compactSizeHex(n) {
    if (n <= 0xfc) return n.toString(16).padStart(2, '0');
    throw new Error('test helper does not need multi-byte compactSize');
}

function reverseHex(hex) {
    return hex.match(/.{2}/g).reverse().join('');
}

function kv(keyHex, valueHex) {
    return compactSizeHex(keyHex.length / 2) + keyHex + compactSizeHex(valueHex.length / 2) + valueHex;
}

function encodeUnsignedTxHex(tx) {
    const inputsHex = tx.inputs.map((input) =>
        reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)
    ).join('');
    const outputsHex = tx.outputs.map((output) =>
        u64le(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey
    ).join('');
    return u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex
        + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);
}

function finalScriptWitnessKv() {
    const item = 'ff';
    const value = compactSizeHex(1) + compactSizeHex(item.length / 2) + item;
    return kv('08', value);
}

function finalScriptSigKv() {
    return kv('07', 'aabb');
}

function partialSigKv() {
    const pubkey = '02' + 'ab'.repeat(32); // a 33-byte compressed-pubkey-shaped key, content unchecked
    const signature = 'aa'.repeat(70); // a DER-signature-shaped value, content unchecked
    return kv('02' + pubkey, signature);
}

// No Buffer/btoa dependency — this file runs identically under Node
// (tests) and in the browser (tests.html), the same restraint
// anchoring/BitcoinAnchorPsbtSerializer.js already holds for the
// identical reason.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        const triplet = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
        result += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
        result += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
        result += b1 !== undefined ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=';
        result += b2 !== undefined ? BASE64_ALPHABET[triplet & 0x3f] : '=';
    }
    return result;
}

function unrecognizedFieldKv() {
    const fakeBip32Pubkey = 'aa'.repeat(33);
    return kv('06' + fakeBip32Pubkey, 'deadbeef');
}

// Builds a full signed-PSBT hex string from scratch, given the original
// description's inputs (for their prevout data, unless overridden) and a
// caller-chosen unsigned-tx section (the real one, for a correctly-signed
// PSBT; a tampered one, to prove substitution is caught).
function buildSignedPsbtHex(description, { tx, inputOverrides = [], inputExtras = [], outputMapExtras = [] } = {}) {
    const unsignedTx = tx || description.globalUnsignedTx;
    let out = '70736274ff'; // magic
    out += kv('00', encodeUnsignedTxHex(unsignedTx)); // PSBT_GLOBAL_UNSIGNED_TX
    out += '00'; // end of global map

    description.inputs.forEach((input, i) => {
        const override = inputOverrides[i];
        const prevOut = override || input;
        if ('witnessUtxo' in prevOut) {
            const w = prevOut.witnessUtxo;
            const valueHex = u64le(w.valueSats) + compactSizeHex(w.scriptPubKey.length / 2) + w.scriptPubKey;
            out += kv('01', valueHex);
        } else {
            out += kv('00', prevOut.nonWitnessUtxo);
        }
        (inputExtras[i] || []).forEach((extraKv) => { out += extraKv; });
        out += '00'; // end of this input's map
    });

    unsignedTx.outputs.forEach((_, i) => {
        (outputMapExtras[i] || []).forEach((extraKv) => { out += extraKv; });
        out += '00'; // end of this output's map
    });

    return out;
}

function buildFlagshipDescription({ psbtBuilder, transactionBuilder, contentHash = 'deadbeef' } = {}) {
    const plan = transactionBuilder.build({
        contentHash,
        utxos: [utxo('a', 0, 100000, 'p2wpkh')],
        changeAddress: 'bc1qexamplechangeaddress'
    });
    const description = psbtBuilder.build({
        plan,
        utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
        changeScriptPubKey: '0014' + 'b'.repeat(40)
    });
    return description;
}

async function run() {
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();
    const inspector = new BitcoinAnchorSignedPsbtInspector();

    // ---------------------------------------------------------------
    // Section A — flagship: the inspector recognizes a correctly-signed
    // segwit PSBT (finalScriptWitness) as intact.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv()]] });

        const result = inspector.inspect({ description, signedPsbt: signedHex });
        assert(result.intact === true, '1. a correctly-signed segwit PSBT is recognized as intact');
        assert(result.signedInputs.length === 1 && result.signedInputs[0].hasFinalScriptWitness === true, '2. the signed input is reported with hasFinalScriptWitness: true');
        assert(result.signedInputs[0].partialSigCount === 0 && result.signedInputs[0].hasFinalScriptSig === false, '3. no partialSig/finalScriptSig is reported when only finalScriptWitness is present');
    }
    console.log('✓ Section A: flagship — the inspector recognizes a correctly-signed segwit PSBT as intact');

    // ---------------------------------------------------------------
    // Section B — flagship, end to end: BitcoinAnchorWalletSigner drives a
    // real plan through a real description to a signed result via an
    // injected fake wallet that actually signs correctly.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        let sawUnsignedPsbt;
        const wallet = {
            signPsbt: async (unsignedPsbt) => {
                sawUnsignedPsbt = unsignedPsbt;
                return { signed: true, psbt: buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv()]] }) };
            }
        };
        const signer = new BitcoinAnchorWalletSigner({ wallet });

        const result = await signer.requestSignature({ description });
        assert(result.signed === true, '4. the signer reports signed: true for a wallet that returns a matching, correctly-signed PSBT');
        assert(result.signedInputs.length === 1 && result.signedInputs[0].hasFinalScriptWitness === true, '5. the signer surfaces the same signedInputs the inspector itself would report');
        assert(sawUnsignedPsbt && sawUnsignedPsbt.hex && sawUnsignedPsbt.hex.startsWith('70736274ff'), '6. the wallet was handed a real, genuinely serialized unsigned BIP174 PSBT — bytes, hex, and base64 alike');
        assert(typeof result.psbt === 'string', '7. requestSignature() returns the wallet\'s own signed psbt value unchanged');
    }
    console.log('✓ Section B: flagship, end to end — the signer drives a real plan to a signed result through an injected wallet, never broadcasting');

    // ---------------------------------------------------------------
    // Section C — a legacy (p2pkh) input's finalScriptSig is recognized.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash: 'deadbeef',
            utxos: [utxo('b', 0, 100000, 'p2pkh')],
            changeAddress: '1ExampleLegacyAddress'
        });
        const description = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, nonWitnessUtxo: 'ab'.repeat(100) }],
            changeScriptPubKey: '76a914' + 'c'.repeat(40) + '88ac'
        });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptSigKv()]] });

        const result = inspector.inspect({ description, signedPsbt: signedHex });
        assert(result.intact === true, '8. a correctly-signed legacy PSBT is recognized as intact');
        assert(result.signedInputs[0].hasFinalScriptSig === true, '9. the signed input is reported with hasFinalScriptSig: true');
    }
    console.log('✓ Section C: a legacy p2pkh input\'s finalScriptSig is recognized the same way');

    // ---------------------------------------------------------------
    // Section D — a not-yet-finalized partialSig alone counts as signed.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[partialSigKv()]] });

        const result = inspector.inspect({ description, signedPsbt: signedHex });
        assert(result.intact === true, '10. a not-yet-finalized partialSig alone is enough to count as carrying signing material');
        assert(result.signedInputs[0].partialSigCount === 1, '11. the partial signature is counted');
    }
    console.log('✓ Section D: a not-yet-finalized partialSig alone counts as "carries signing material"');

    // ---------------------------------------------------------------
    // Section E — THE CORE INVARIANT: a substituted transaction is
    // refused, by the inspector directly and by the signer's own
    // wallet-response boundary alike.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const tamperedTx = {
            ...description.globalUnsignedTx,
            outputs: description.globalUnsignedTx.outputs.map((output, i) => i === 1 ? { ...output, valueSats: output.valueSats + 1 } : output)
        };
        assert(description.globalUnsignedTx.outputs.length === 2, 'sanity: the flagship description has a change output to tamper with');
        const tamperedSignedHex = buildSignedPsbtHex(description, { tx: tamperedTx, inputExtras: [[finalScriptWitnessKv()]] });

        const inspection = inspector.inspect({ description, signedPsbt: tamperedSignedHex });
        assert(inspection.intact === false, '12. a signed PSBT for a substituted transaction (a changed output value) is refused');
        assert(/transaction identity changed/.test(inspection.reason), '13. the refusal reason names transaction identity changing across signing');

        const wallet = { signPsbt: async () => ({ signed: true, psbt: tamperedSignedHex }) };
        const signer = new BitcoinAnchorWalletSigner({ wallet });
        const result = await signer.requestSignature({ description });
        assert(result.signed === false, '14. the signer never reports signed: true when the wallet\'s claimed signature does not match the intended transaction');
        assert(!result.unavailable, '15. a substituted transaction is a definite refusal, never reported as merely unavailable');
        assert(/does not match the intended transaction/.test(result.reason), '16. the signer\'s own reason explains why the wallet\'s response was refused');
    }
    console.log('✓ Section E: a wallet-claimed signature over a substituted transaction is refused — by the inspector directly and by the signer alike');

    // ---------------------------------------------------------------
    // Section F — a changed claimed prevout (witnessUtxo) is refused.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const tamperedOverride = { witnessUtxo: { scriptPubKey: '0014' + 'f'.repeat(40), valueSats: 100000 } };
        const signedHex = buildSignedPsbtHex(description, {
            inputOverrides: [tamperedOverride],
            inputExtras: [[finalScriptWitnessKv()]]
        });

        const result = inspector.inspect({ description, signedPsbt: signedHex });
        assert(result.intact === false, '17. a signed PSBT whose claimed prevout no longer matches the original description is refused');
        assert(/witnessUtxo no longer matches/.test(result.reason), '18. the refusal names the prevout mismatch specifically');
    }
    console.log('✓ Section F: a signed PSBT whose claimed prevout has changed is refused');

    // ---------------------------------------------------------------
    // Section G — a "signed" PSBT carrying no signing material at all
    // (i.e., still just the unsigned PSBT) is refused.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const stillUnsignedHex = buildSignedPsbtHex(description, {});

        const result = inspector.inspect({ description, signedPsbt: stillUnsignedHex });
        assert(result.intact === false, '19. a PSBT with no partialSig/finalScriptSig/finalScriptWitness on any input is never treated as signed');
        assert(/no recognized signing material/.test(result.reason), '20. the refusal explains that no recognized signing material is present');
    }
    console.log('✓ Section G: a "signed" PSBT that still carries no signing material at all is refused');

    // ---------------------------------------------------------------
    // Section H — an unrecognized input field (the shape a BIP32
    // derivation path would have) is refused, not silently ignored.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv(), unrecognizedFieldKv()]] });

        const result = inspector.inspect({ description, signedPsbt: signedHex });
        assert(result.intact === false, '21. an input carrying a field this class does not recognize is refused');
        assert(/does not recognize/.test(result.reason), '22. the refusal explains the field is unrecognized rather than silently ignoring it');
    }
    console.log('✓ Section H: an unrecognized input field is refused rather than silently ignored');

    // ---------------------------------------------------------------
    // Section I — multi-input: tampering with just one of several inputs
    // is still caught; a fully-correct multi-input signs cleanly.
    // ---------------------------------------------------------------
    {
        const bigContentHash = 'f'.repeat(64); // large enough that its fee alone exceeds any one small utxo
        const plan = transactionBuilder.build({
            contentHash: bigContentHash,
            utxos: [utxo('2', 0, 100, 'p2wpkh'), utxo('1', 0, 100, 'p2wpkh'), utxo('3', 0, 50, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        assert(plan.inputs.length >= 2, 'sanity: more than one input is selected');
        const utxoDetails = plan.inputs.map((input) => ({ txid: input.txid, vout: input.vout, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: input.valueSats }));
        const description = psbtBuilder.build({ plan, utxoDetails, changeScriptPubKey: plan.outputs.length > 1 ? '0014' + 'b'.repeat(40) : undefined });

        const allSignedExtras = description.inputs.map(() => [finalScriptWitnessKv()]);
        const goodSignedHex = buildSignedPsbtHex(description, { inputExtras: allSignedExtras });
        const goodResult = inspector.inspect({ description, signedPsbt: goodSignedHex });
        assert(goodResult.intact === true && goodResult.signedInputs.length === description.inputs.length, '23. a fully-correct multi-input signed PSBT is recognized as intact, one entry per input');

        const oneUnsignedExtras = description.inputs.map((_, i) => i === 1 ? [] : [finalScriptWitnessKv()]);
        const partiallyUnsignedHex = buildSignedPsbtHex(description, { inputExtras: oneUnsignedExtras });
        const partialResult = inspector.inspect({ description, signedPsbt: partiallyUnsignedHex });
        assert(partialResult.intact === false && /input 1/.test(partialResult.reason), '24. a single unsigned input among several signed ones is still caught, and named by index');
    }
    console.log('✓ Section I: multi-input descriptions are checked input by input — one tampered/unsigned input is still caught');

    // ---------------------------------------------------------------
    // Section J — wallet tri-state: a definite decline, an unavailable
    // wallet, and a wallet-contract violation all stay distinguishable.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });

        const decliningWallet = { signPsbt: async () => ({ signed: false, reason: 'user rejected the request in their wallet' }) };
        const declineResult = await new BitcoinAnchorWalletSigner({ wallet: decliningWallet }).requestSignature({ description });
        assert(declineResult.signed === false && !declineResult.unavailable && declineResult.reason === 'user rejected the request in their wallet',
            '25. a definite decline is reported verbatim, never conflated with "unavailable"');

        const unreachableWallet = { signPsbt: async () => { throw new Error('wallet is locked'); } };
        const unavailableResult = await new BitcoinAnchorWalletSigner({ wallet: unreachableWallet }).requestSignature({ description });
        assert(unavailableResult.signed === false && unavailableResult.unavailable === true && unavailableResult.reason === 'wallet is locked',
            '26. a throwing wallet is reported as unavailable, never as a definite decline');

        const malformedWallet = { signPsbt: async () => ({ signed: true }) };
        await expectThrowsAsync(() => new BitcoinAnchorWalletSigner({ wallet: malformedWallet }).requestSignature({ description }),
            '27. a wallet reporting signed: true with no psbt at all is a wallet-contract violation, and throws');
    }
    console.log('✓ Section J: a definite decline, an unavailable wallet, and a wallet-contract violation all stay distinguishable');

    // ---------------------------------------------------------------
    // Section K — caller-contract violations, refused before the wallet
    // is ever consulted.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BitcoinAnchorWalletSigner({}), '28. a missing wallet is refused at construction');
        expectThrows(() => new BitcoinAnchorWalletSigner({ wallet: {} }), '29. a wallet without signPsbt() is refused at construction');

        let walletWasCalled = false;
        const wallet = { signPsbt: async () => { walletWasCalled = true; return { signed: true, psbt: '00' }; } };
        const signer = new BitcoinAnchorWalletSigner({ wallet });
        await expectThrowsAsync(() => signer.requestSignature({ description: { globalUnsignedTx: undefined, inputs: [] } }),
            '30. a malformed description is refused before the wallet is ever consulted');
        assert(walletWasCalled === false, '31. the wallet is never called when the description itself is malformed');
    }
    console.log('✓ Section K: a missing/incapable wallet and a malformed description are both refused before any wallet is ever consulted');

    // ---------------------------------------------------------------
    // Section L — the inspector accepts a signed PSBT as raw bytes, hex,
    // or base64 alike.
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription({ psbtBuilder, transactionBuilder });
        const signedHex = buildSignedPsbtHex(description, { inputExtras: [[finalScriptWitnessKv()]] });
        const signedBytes = Uint8Array.from(signedHex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
        const signedBase64 = bytesToBase64(signedBytes);

        assert(inspector.inspect({ description, signedPsbt: signedHex }).intact === true, '32. a hex-string signed PSBT is accepted');
        assert(inspector.inspect({ description, signedPsbt: signedBytes }).intact === true, '33. a raw Uint8Array signed PSBT is accepted');
        assert(inspector.inspect({ description, signedPsbt: signedBase64 }).intact === true, '34. a base64-string signed PSBT is accepted');
    }
    console.log('✓ Section L: the inspector accepts a signed PSBT as raw bytes, hex, or base64 alike');

    console.log('\nAll BitcoinAnchorWalletSigning tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorWalletSigning.test.js FAILED:', error);
    process.exitCode = 1;
});
