import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';

// 0.8.48 — Bitcoin Anchor PSBT Construction.
//
// The flagship this milestone exists to prove: anchoring/
// BitcoinAnchorPsbtBuilder.js can turn a real anchoring/
// BitcoinAnchorTransactionBuilder.js plan, plus the previous-output data a
// signer would need, into a deterministic, strongly-validated,
// PSBT-shaped description — entirely synchronous, entirely offline, and
// never carrying a signature, a private key, or any other signing
// material.
//
//   Section A: flagship — a segwit (p2wpkh) plan with change builds a
//              PSBT-shaped result whose global unsigned tx, witnessUtxo,
//              and OP_RETURN script are all exactly right.
//   Section B: no-change plan — changeScriptPubKey must be entirely
//              absent, and the PSBT carries exactly one output.
//   Section C: a legacy (p2pkh) input carries its previous transaction
//              opaquely via nonWitnessUtxo, never a witnessUtxo.
//   Section D: multi-input plans preserve the plan's own input order
//              exactly, in both the global unsigned tx and the psbt
//              inputs array.
//   Section E: caller-contract violations — a plan that isn't built:true,
//              a tampered plan whose invariant no longer holds, a missing
//              or surplus utxoDetails entry, a value mismatch, the wrong
//              detail shape for a given scriptType, and a
//              changeScriptPubKey supplied/omitted incorrectly are all
//              refused before any output is produced.
//   Section F: no signing, ever — witnessUtxo (previous-output data) is
//              present, but no signature, private key, seed, wif,
//              partialSig, or final witness/scriptSig vocabulary ever
//              appears.
//
// See docs/Principles.md, "A PSBT Is A Description, Not A Signature (0.8.48)."

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

function run() {
    const contentHash = 'f'.repeat(64); // a 32-byte sha256-shaped hash
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();

    // ---------------------------------------------------------------
    // Section A — flagship: a comfortably-funded p2wpkh plan builds a
    // fully-shaped PSBT description.
    // ---------------------------------------------------------------
    {
        assert(psbtBuilder.anchorType === 'bitcoin-op-return', '1. psbtBuilder.anchorType matches the transaction builder\'s own anchorType exactly');

        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('a', 0, 100000, 'p2wpkh')],
            changeAddress: 'bc1qexamplechangeaddress'
        });

        const result = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });

        assert(result.network === 'mainnet', '2. the result carries the plan\'s own network');
        assert(result.feeSats === plan.feeSats && result.totalInputSats === plan.totalInputSats, '3. fee and total input value are carried through unchanged from the plan');

        assert(result.globalUnsignedTx.version === 2 && result.globalUnsignedTx.locktime === 0, '4. the unsigned tx uses version 2 and a zero locktime — no RBF, no timelock');
        assert(result.globalUnsignedTx.inputs.length === 1 && result.globalUnsignedTx.inputs[0].txid === plan.inputs[0].txid
            && result.globalUnsignedTx.inputs[0].vout === 0 && result.globalUnsignedTx.inputs[0].sequence === 0xffffffff,
            '5. the unsigned tx names the exact selected input with a final sequence number');
        assert(result.globalUnsignedTx.outputs.length === 2, '6. the unsigned tx has an OP_RETURN output and a change output, matching the plan');
        assert(result.globalUnsignedTx.outputs[0].scriptPubKey === '6a20' + contentHash,
            '7. the OP_RETURN scriptPubKey is OP_RETURN(6a) + a 32-byte push(20) + the raw content hash, byte for byte');
        assert(result.globalUnsignedTx.outputs[0].valueSats === 0, '8. the OP_RETURN output carries zero value');
        assert(result.globalUnsignedTx.outputs[1].scriptPubKey === '0014' + 'b'.repeat(40) && result.globalUnsignedTx.outputs[1].valueSats === plan.outputs[1].valueSats,
            '9. the change output carries the caller-supplied scriptPubKey and the plan\'s own change value');

        assert(result.inputs.length === 1, '10. one PSBT input entry per plan input');
        assert(result.inputs[0].witnessUtxo.scriptPubKey === '0014' + 'a'.repeat(40) && result.inputs[0].witnessUtxo.valueSats === 100000,
            '11. a segwit input carries witnessUtxo with the exact supplied scriptPubKey and value');
        assert(!('nonWitnessUtxo' in result.inputs[0]), '12. a segwit input never carries nonWitnessUtxo');

        assert(result.outputs[0].type === 'op_return' && result.outputs[0].dataHex === contentHash, '13. the op_return output entry names the exact content hash');
        assert(result.outputs[1].type === 'change' && result.outputs[1].address === 'bc1qexamplechangeaddress', '14. the change output entry still names the original caller-supplied address, for reference');
    }
    console.log('✓ Section A: flagship — a segwit plan with change builds an exact, fully-shaped PSBT description');

    // ---------------------------------------------------------------
    // Section B — a no-change plan carries no changeScriptPubKey and
    // produces exactly one PSBT output.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('b', 0, 222, 'p2wpkh')],
            changeAddress: 'bc1qexamplechangeaddress'
        });
        assert(plan.outputs.length === 1, 'sanity: this plan has no change output');

        const result = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 222 }]
        });

        assert(result.outputs.length === 1 && result.outputs[0].type === 'op_return', '15. a no-change plan produces a PSBT with exactly one, op_return output');
        assert(result.globalUnsignedTx.outputs.length === 1, '16. the unsigned tx itself also has exactly one output');

        expectThrows(() => psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 222 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        }), '17. supplying changeScriptPubKey when the plan has no change output is refused');
    }
    console.log('✓ Section B: a no-change plan carries no changeScriptPubKey and produces exactly one PSBT output');

    // ---------------------------------------------------------------
    // Section C — a legacy p2pkh input carries its previous transaction
    // opaquely, never a witnessUtxo.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('c', 0, 100000, 'p2pkh')],
            changeAddress: '1ExampleLegacyAddress'
        });

        const fakePrevTxHex = 'ab'.repeat(100);
        const result = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, nonWitnessUtxo: fakePrevTxHex }],
            changeScriptPubKey: '76a914' + 'c'.repeat(40) + '88ac'
        });

        assert(result.inputs[0].nonWitnessUtxo === fakePrevTxHex, '18. a legacy input carries the caller-supplied previous transaction hex verbatim');
        assert(!('witnessUtxo' in result.inputs[0]), '19. a legacy input never carries witnessUtxo');

        expectThrows(() => psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
            changeScriptPubKey: '76a914' + 'c'.repeat(40) + '88ac'
        }), '20. supplying witnessUtxo fields for a legacy input is refused');
    }
    console.log('✓ Section C: a legacy p2pkh input carries its previous transaction opaquely via nonWitnessUtxo, never a witnessUtxo');

    // ---------------------------------------------------------------
    // Section D — multi-input plans preserve input order exactly.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('2', 0, 100, 'p2wpkh'), utxo('1', 0, 100, 'p2wpkh'), utxo('3', 0, 50, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        assert(plan.inputs.length === 2, 'sanity: two of the three utxos are selected');
        assert(plan.outputs.length === 1, 'sanity: this plan\'s two inputs leave no room for a real change output');

        const utxoDetails = plan.inputs.map((input) => ({ txid: input.txid, vout: input.vout, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: input.valueSats }));
        const result = psbtBuilder.build({ plan, utxoDetails });

        assert(result.inputs.length === 2 && result.inputs[0].txid === plan.inputs[0].txid && result.inputs[1].txid === plan.inputs[1].txid,
            '21. psbt inputs preserve the plan\'s own selection order exactly');
        assert(result.globalUnsignedTx.inputs[0].txid === plan.inputs[0].txid && result.globalUnsignedTx.inputs[1].txid === plan.inputs[1].txid,
            '22. the unsigned tx\'s own input order matches the plan and the psbt inputs array');

        // utxoDetails may be supplied in any order — matching is by
        // (txid, vout), never by array position.
        const shuffledDetails = [utxoDetails[1], utxoDetails[0]];
        const shuffledResult = psbtBuilder.build({ plan, utxoDetails: shuffledDetails });
        assert(JSON.stringify(shuffledResult.inputs) === JSON.stringify(result.inputs), '23. utxoDetails order never affects the result — matching is by (txid, vout)');
    }
    console.log('✓ Section D: multi-input plans preserve input order exactly, regardless of the order utxoDetails is supplied in');

    // ---------------------------------------------------------------
    // Section E — caller-contract violations, refused before any output
    // is produced.
    // ---------------------------------------------------------------
    {
        const goodPlan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('e', 0, 100000, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        const goodDetail = { txid: goodPlan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 };
        const goodChangeScriptPubKey = '0014' + 'b'.repeat(40);

        expectThrows(() => psbtBuilder.build({ plan: { built: false, reason: 'nope' }, utxoDetails: [goodDetail], changeScriptPubKey: goodChangeScriptPubKey }),
            '24. a built:false plan is refused');
        expectThrows(() => psbtBuilder.build({ plan: { ...goodPlan, feeSats: goodPlan.feeSats + 1 }, utxoDetails: [goodDetail], changeScriptPubKey: goodChangeScriptPubKey }),
            '25. a tampered plan whose invariant no longer holds is refused, independently re-checked');
        expectThrows(() => psbtBuilder.build({ plan: goodPlan, utxoDetails: [], changeScriptPubKey: goodChangeScriptPubKey }),
            '26. a missing utxoDetails entry for a selected input is refused');
        expectThrows(() => psbtBuilder.build({
            plan: goodPlan,
            utxoDetails: [goodDetail, { txid: 'f'.repeat(64), vout: 9, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 1 }],
            changeScriptPubKey: goodChangeScriptPubKey
        }), '27. a surplus utxoDetails entry naming no selected input is refused');
        expectThrows(() => psbtBuilder.build({ plan: goodPlan, utxoDetails: [{ ...goodDetail, valueSats: 1 }], changeScriptPubKey: goodChangeScriptPubKey }),
            '28. a witnessUtxo.valueSats that does not match the plan\'s own selected value is refused');
        expectThrows(() => psbtBuilder.build({ plan: goodPlan, utxoDetails: [{ ...goodDetail, scriptPubKey: 'not-hex' }], changeScriptPubKey: goodChangeScriptPubKey }),
            '29. a malformed scriptPubKey is refused');
        expectThrows(() => psbtBuilder.build({ plan: goodPlan, utxoDetails: [goodDetail] }),
            '30. a missing changeScriptPubKey when the plan has a change output is refused');
        expectThrows(() => psbtBuilder.build({ plan: goodPlan, utxoDetails: [goodDetail, goodDetail], changeScriptPubKey: goodChangeScriptPubKey }),
            '31. a duplicate utxoDetails entry for the same input is refused');
    }
    console.log('✓ Section E: a non-built plan, a tampered plan, missing/surplus/duplicate/mismatched utxoDetails, and a wrongly present/absent changeScriptPubKey are all refused');

    // ---------------------------------------------------------------
    // Section F — no signing, ever. witnessUtxo is expected vocabulary;
    // real signing material never appears.
    // ---------------------------------------------------------------
    {
        const plan = transactionBuilder.build({
            contentHash,
            utxos: [utxo('f', 0, 100000, 'p2wpkh')],
            changeAddress: 'bc1qchange'
        });
        const result = psbtBuilder.build({
            plan,
            utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
            changeScriptPubKey: '0014' + 'b'.repeat(40)
        });

        const serialized = JSON.stringify(result);
        assert(serialized.includes('witnessUtxo'), '32. witnessUtxo (previous-output data) is expected, present vocabulary — not signing material');

        const forbidden = ['privateKey', 'private_key', 'signature', 'partialSig', 'finalScriptWitness', 'finalScriptSig', 'seed', 'wif'];
        for (const word of forbidden) {
            assert(!serialized.toLowerCase().includes(word.toLowerCase()), `33. a built PSBT result never carries a "${word}" field — this class never signs anything`);
        }
    }
    console.log('✓ Section F: witnessUtxo is present as expected unsigned-input data; no signature, private key, or other signing material ever appears');

    console.log('\nAll BitcoinAnchorPsbtConstruction tests passed.');
}

try {
    run();
} catch (error) {
    console.error('BitcoinAnchorPsbtConstruction.test.js FAILED:', error);
    process.exitCode = 1;
}
