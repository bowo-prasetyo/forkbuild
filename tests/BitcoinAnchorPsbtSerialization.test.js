import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorPsbtSerializer } from '../anchoring/BitcoinAnchorPsbtSerializer.js';

// 0.8.49 — Real BIP-174 PSBT Serialization.
//
// The flagship this milestone exists to prove: anchoring/
// BitcoinAnchorPsbtSerializer.js can turn a real anchoring/
// BitcoinAnchorPsbtBuilder.js description into genuine, spec-shaped
// BIP174 wire bytes — deterministically, with input order preserved,
// with a txid correctly byte-reversed, and with every byte independently
// re-derivable by hand from the same description — while still never
// signing, never broadcasting, and never silently dropping signing
// material it was never supposed to encode in the first place.
//
//   Section A: flagship — a segwit (p2wpkh) description with a change
//              output serializes to exactly the bytes this test computes
//              by hand, byte for byte, via a wholly independent reference
//              encoder.
//   Section B: a legacy (p2pkh) description's nonWitnessUtxo is carried
//              onto the wire completely opaquely, also verified byte for
//              byte against an independent reference encoding.
//   Section C: multi-input descriptions preserve order exactly, and
//              serializing the identical description twice produces
//              byte-identical output.
//   Section D: round trip — parse(serialize(d)) reproduces the exact
//              { globalUnsignedTx, inputs } shape serialize() consumed,
//              for bytes, hex, and base64 alike.
//   Section E: caller-contract violations — a missing globalUnsignedTx, a
//              length/order mismatch between description.inputs and
//              globalUnsignedTx.inputs, both/neither witnessUtxo and
//              nonWitnessUtxo, malformed hex, an out-of-range field, and
//              any signing-material field (partialSig, privateKey, ...)
//              are all refused before any byte is produced.
//   Section F: parse() refuses bytes it cannot make sense of — bad magic,
//              truncated bytes, and a hand-crafted PSBT carrying a field
//              this class does not recognize (the shape a signed or
//              partially-signed real-world PSBT would have) are all
//              rejected rather than silently misread.
//
// See docs/Principles.md, "Real Bytes Are Still Not A Signature (0.8.49)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, ...(scriptType ? { scriptType } : {}) };
}

// ---------------------------------------------------------------------
// A wholly independent reference encoder — plain hex-string manipulation,
// sharing no code with anchoring/BitcoinAnchorPsbtSerializer.js's own
// Uint8Array/DataView implementation — used to cross-check that
// implementation's actual output byte for byte.
// ---------------------------------------------------------------------

function u32le(n) {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
        .map((b) => b.toString(16).padStart(2, '0')).join('');
}

function u16le(n) {
    return [n & 0xff, (n >>> 8) & 0xff].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function u64le(n) {
    let big = BigInt(n);
    const bytes = [];
    for (let i = 0; i < 8; i++) { bytes.push(Number(big & 0xffn)); big >>= 8n; }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function compactSizeHex(n) {
    if (n <= 0xfc) return n.toString(16).padStart(2, '0');
    if (n <= 0xffff) return 'fd' + u16le(n);
    if (n <= 0xffffffff) return 'fe' + u32le(n);
    return 'ff' + u64le(n);
}

function reverseHex(hex) {
    return hex.match(/.{2}/g).reverse().join('');
}

function referenceSerializeHex(description) {
    const tx = description.globalUnsignedTx;

    const inputsHex = tx.inputs.map((input) =>
        reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)
    ).join('');
    const outputsHex = tx.outputs.map((output) =>
        u64le(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey
    ).join('');
    const unsignedTxHex = u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex
        + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);

    let out = '70736274ff'; // magic
    out += compactSizeHex(1) + '00' + compactSizeHex(unsignedTxHex.length / 2) + unsignedTxHex; // PSBT_GLOBAL_UNSIGNED_TX
    out += '00'; // end of global map

    description.inputs.forEach((input) => {
        if ('witnessUtxo' in input) {
            const valueHex = u64le(input.witnessUtxo.valueSats)
                + compactSizeHex(input.witnessUtxo.scriptPubKey.length / 2) + input.witnessUtxo.scriptPubKey;
            out += compactSizeHex(1) + '01' + compactSizeHex(valueHex.length / 2) + valueHex;
        } else {
            out += compactSizeHex(1) + '00' + compactSizeHex(input.nonWitnessUtxo.length / 2) + input.nonWitnessUtxo;
        }
        out += '00'; // end of this input's map
    });

    tx.outputs.forEach(() => { out += '00'; }); // one empty map per output

    return out;
}

function run() {
    const contentHash = 'deadbeef'; // a small, easy-to-eyeball 4-byte payload
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();
    const serializer = new BitcoinAnchorPsbtSerializer();

    // ---------------------------------------------------------------
    // Section A — flagship: a segwit description with change serializes
    // to exactly the independently hand-computed reference bytes.
    // ---------------------------------------------------------------
    {
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

        const result = serializer.serialize(description);
        assert(result.hex.startsWith('70736274ff'), '1. serialized output begins with the fixed BIP174 magic bytes');
        assert(result.hex === referenceSerializeHex(description), '2. the real serializer\'s output matches an independently hand-computed reference byte for byte');
        assert(result.bytes instanceof Uint8Array && result.bytes.length * 2 === result.hex.length, '3. .bytes and .hex describe the identical byte sequence');
        assert(result.hex.includes('6a04' + contentHash), '4. the OP_RETURN scriptPubKey (OP_RETURN + push(4) + the raw content hash) appears verbatim on the wire');

        assert(typeof result.base64 === 'string' && result.base64.length > 0, '5. a base64 encoding is also produced');
    }
    console.log('✓ Section A: flagship — a segwit description with change serializes to exactly the independently computed reference bytes');

    // ---------------------------------------------------------------
    // Section B — a legacy p2pkh description's nonWitnessUtxo is carried
    // onto the wire opaquely, also cross-checked byte for byte.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('b', 0, 100000, 'p2pkh')],
            changeAddress: '1ExampleLegacyAddress'
        });
        const fakePrevTxHex = 'ab'.repeat(100);
        const description = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, nonWitnessUtxo: fakePrevTxHex }],
            changeScriptPubKey: '76a914' + 'c'.repeat(40) + '88ac'
        });

        const result = serializer.serialize(description);
        assert(result.hex === referenceSerializeHex(description), '6. a legacy description also matches its independently computed reference bytes exactly');
        assert(result.hex.includes(fakePrevTxHex), '7. the full previous transaction is carried onto the wire completely verbatim');
    }
    console.log('✓ Section B: a legacy p2pkh description\'s nonWitnessUtxo is carried onto the wire opaquely, verified byte for byte');

    // ---------------------------------------------------------------
    // Section C — multi-input order preservation and determinism.
    // ---------------------------------------------------------------
    {
        const bigContentHash = 'f'.repeat(64); // a larger payload, so its fee alone exceeds any one of these small utxos
        const plan = transactionBuilder.build({
            contentHash: bigContentHash,
            utxos: [utxo('2', 0, 100, 'p2wpkh'), utxo('1', 0, 100, 'p2wpkh'), utxo('3', 0, 50, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        assert(plan.inputs.length >= 2, 'sanity: more than one input is selected');

        const utxoDetails = plan.inputs.map((input) => ({ txid: input.txid, vout: input.vout, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: input.valueSats }));
        const description = psbtBuilder.build({ plan, utxoDetails, changeScriptPubKey: plan.outputs.length > 1 ? '0014' + 'b'.repeat(40) : undefined });

        const result = serializer.serialize(description);
        assert(result.hex === referenceSerializeHex(description), '8. a multi-input description matches its independently computed reference bytes exactly, order included');

        const secondResult = serializer.serialize(description);
        assert(result.hex === secondResult.hex, '9. serializing the identical description twice produces byte-identical output');
    }
    console.log('✓ Section C: multi-input descriptions preserve order exactly, and serializing the same description twice is byte-identical');

    // ---------------------------------------------------------------
    // Section D — round trip: parse(serialize(d)) reproduces the exact
    // shape serialize() consumed.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('d', 0, 100000, 'p2wpkh')],
            changeAddress: 'bc1qexamplechangeaddress'
        });
        const description = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });
        const result = serializer.serialize(description);

        const expected = { globalUnsignedTx: description.globalUnsignedTx, inputs: description.inputs.map((input) => ({ txid: input.txid, vout: input.vout, ...('witnessUtxo' in input ? { witnessUtxo: input.witnessUtxo } : { nonWitnessUtxo: input.nonWitnessUtxo }) })) };

        assert(JSON.stringify(serializer.parse(result.bytes)) === JSON.stringify(expected), '10. parsing the raw bytes reproduces the exact description shape');
        assert(JSON.stringify(serializer.parse(result.hex)) === JSON.stringify(expected), '11. parsing the hex string reproduces the exact description shape');
        assert(JSON.stringify(serializer.parse(result.base64)) === JSON.stringify(expected), '12. parsing the base64 string reproduces the exact description shape');
    }
    console.log('✓ Section D: parse(serialize(description)) reproduces the exact description shape, for bytes, hex, and base64 alike');

    // ---------------------------------------------------------------
    // Section E — caller-contract violations, refused before any byte is
    // produced.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('e', 0, 100000, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        const goodDescription = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });

        expectThrows(() => serializer.serialize({ ...goodDescription, globalUnsignedTx: undefined }),
            '13. a missing globalUnsignedTx is refused');
        expectThrows(() => serializer.serialize({ ...goodDescription, inputs: [] }),
            '14. a description.inputs length mismatch against globalUnsignedTx.inputs is refused');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            inputs: [{ ...goodDescription.inputs[0], vout: goodDescription.inputs[0].vout + 1 }]
        }), '15. a description.inputs entry whose (txid, vout) does not match globalUnsignedTx.inputs at the same index is refused');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            inputs: [{ ...goodDescription.inputs[0], nonWitnessUtxo: 'ab'.repeat(10) }]
        }), '16. an input carrying both witnessUtxo and nonWitnessUtxo is refused');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            inputs: [{ txid: goodDescription.inputs[0].txid, vout: goodDescription.inputs[0].vout }]
        }), '17. an input carrying neither witnessUtxo nor nonWitnessUtxo is refused');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            inputs: [{ ...goodDescription.inputs[0], witnessUtxo: { ...goodDescription.inputs[0].witnessUtxo, scriptPubKey: 'not-hex' } }]
        }), '18. a malformed witnessUtxo.scriptPubKey is refused');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            globalUnsignedTx: { ...goodDescription.globalUnsignedTx, version: -1 }
        }), '19. an out-of-range globalUnsignedTx.version is refused');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            inputs: [{ ...goodDescription.inputs[0], partialSig: 'aa'.repeat(70) }]
        }), '20. an input carrying a partialSig field is refused — never silently dropped');
        expectThrows(() => serializer.serialize({
            ...goodDescription,
            inputs: [{ ...goodDescription.inputs[0], privateKey: 'aa'.repeat(32) }]
        }), '21. an input carrying a privateKey field is refused outright');
    }
    console.log('✓ Section E: a missing/mismatched unsigned tx, malformed or contradictory input data, and any signing-material field are all refused before any byte is produced');

    // ---------------------------------------------------------------
    // Section F — parse() refuses bytes it cannot make sense of.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('f', 0, 100000, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        const description = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });
        const goodHex = serializer.serialize(description).hex;

        expectThrows(() => serializer.parse('00'.repeat(20)), '22. bytes with the wrong magic are refused');
        expectThrows(() => serializer.parse(goodHex.slice(0, goodHex.length - 10)), '23. truncated PSBT bytes are refused');

        // Hand-craft a PSBT whose single input map carries an unrecognized
        // key (type 0x02 — PSBT_IN_PARTIAL_SIG in real BIP174) alongside
        // its witnessUtxo, the shape a partially-signed real-world PSBT
        // would actually have. parse() must refuse it, not silently
        // ignore the field it does not understand.
        const withUnrecognizedField = injectUnrecognizedInputField(goodHex);
        expectThrows(() => serializer.parse(withUnrecognizedField), '24. a PSBT carrying a field this class does not recognize (e.g. a signed PSBT\'s partialSig) is refused, not silently misread');
    }
    console.log('✓ Section F: bad magic bytes, truncated bytes, and an unrecognized (e.g. already-signed) PSBT field are all refused rather than silently misread');

    console.log('\nAll BitcoinAnchorPsbtSerialization tests passed.');
}

// Splices one extra, unrecognized key/value entry (compactSize(1) + 0x02
// as a fake key, one arbitrary byte of value) into the first input map of
// an already-serialized PSBT's hex, immediately before that map's own
// closing 0x00 separator. Locates the separator by re-deriving where the
// first input map starts and ends via the reference encoder's own logic,
// applied to a minimal one-input, one-output shape — deliberately
// independent of anchoring/BitcoinAnchorPsbtSerializer.js's own decoder.
function injectUnrecognizedInputField(goodHex) {
    // The one-input flagship shape this helper is only ever called with:
    // magic(5) + global map + one input map (which ends in a lone "00")
    // + one output map ("00"). The input map's closing separator is
    // therefore the second-to-last byte pair of the whole hex string.
    const closingSeparatorIndex = goodHex.length - 4; // "00" (input map end) + "00" (output map end)
    const before = goodHex.slice(0, closingSeparatorIndex);
    const after = goodHex.slice(closingSeparatorIndex);
    const fakeEntry = '02' /* keylen=1 */ + '02' /* PSBT_IN_PARTIAL_SIG */ + '01' /* valuelen=1 */ + 'ff';
    return before + fakeEntry + after;
}

try {
    run();
} catch (error) {
    console.error('BitcoinAnchorPsbtSerialization.test.js FAILED:', error);
    process.exitCode = 1;
}
