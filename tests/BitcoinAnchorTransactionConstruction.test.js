import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';

// 0.8.47 — Bitcoin Anchor Transaction Construction.
//
// The flagship this milestone exists to prove: anchoring/
// BitcoinAnchorTransactionBuilder.js can turn a contentHash plus
// caller-supplied UTXOs into a deterministic, arithmetically sound,
// UNSIGNED transaction plan — entirely synchronous, entirely offline, and
// never wired to anchoring/BitcoinAnchorPublisher.js's own real
// broadcast path.
//
//   Section A: flagship — a single comfortably-funded utxo produces a
//              change output; the input/fee/change arithmetic invariant
//              holds exactly.
//   Section B: dust folded into the fee — a leftover too small to become
//              a real change output is never manufactured into one; it
//              is folded entirely into feeSats instead, and the same
//              invariant still holds.
//   Section C: multi-utxo selection — one utxo alone cannot cover the
//              estimated fee; the builder accumulates a second, in a
//              deterministic largest-value-first order that does not
//              depend on the order utxos were supplied in.
//   Section D: insufficient funds — utxos too small for any fee report
//              built:false with a reason, never a partial or malformed
//              plan.
//   Section E: caller-contract violations — a malformed contentHash, an
//              empty utxos array, a malformed utxo entry, and a missing
//              changeAddress are all refused synchronously, before any
//              selection is attempted.
//   Section F: no signing, ever — a successful plan never carries a
//              signature, a private key, witness data, or raw
//              transaction bytes of any kind; fee scales with the
//              supplied fee rate, exactly as estimated.
//
// See docs/Principles.md, "A Transaction Plan Is Not A Transaction
// (0.8.47)."

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

function sumOutputs(outputs) {
    return outputs.reduce((total, output) => total + output.valueSats, 0);
}

function run() {
    const contentHash = 'f'.repeat(64); // a 32-byte sha256-shaped hash

    // ---------------------------------------------------------------
    // Section A — flagship: comfortable funding produces real change.
    // ---------------------------------------------------------------
    {
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        assert(builder.anchorType === 'bitcoin-op-return', '1. builder.anchorType matches the publisher/verifier\'s own anchorType exactly');

        const plan = builder.build({
            contentHash,
            utxos: [utxo('a', 0, 100000)],
            changeAddress: 'bc1qexamplechangeaddress'
        });

        assert(plan.built === true, '2. a comfortably-funded utxo builds successfully');
        assert(plan.network === 'mainnet', '3. the plan carries the builder\'s own network');
        assert(plan.inputs.length === 1 && plan.inputs[0].valueSats === 100000, '4. the single supplied utxo is selected as the only input');
        assert(plan.outputs.length === 2, '5. a comfortably-funded plan has an OP_RETURN output and a change output');
        assert(plan.outputs[0].type === 'op_return' && plan.outputs[0].dataHex === contentHash && plan.outputs[0].valueSats === 0,
            '6. the OP_RETURN output carries the raw contentHash and zero value — no second encoding, no envelope');
        assert(plan.outputs[1].type === 'change' && plan.outputs[1].address === 'bc1qexamplechangeaddress' && plan.outputs[1].valueSats > 0,
            '7. the change output returns to the caller-supplied changeAddress, verbatim');
        assert(plan.totalInputSats === sumOutputs(plan.outputs) + plan.feeSats,
            '8. the core invariant holds: total input value equals total output value plus the fee — nothing created or destroyed');
        assert(plan.feeSats === Math.ceil(plan.estimatedVBytes * 1), '9. feeSats is exactly the estimated vsize times the fee rate, rounded up');
    }
    console.log('✓ Section A: flagship — a comfortably-funded utxo builds a plan whose input/output/fee arithmetic is exact');

    // ---------------------------------------------------------------
    // Section B — dust is folded into the fee, never manufactured into
    // a sub-dust output.
    // ---------------------------------------------------------------
    {
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        // One p2wpkh input covers a change-less fee (122 sats) plus a
        // small leftover (100 sats) — far short of the 546-sat dust
        // threshold a real change output would need.
        const plan = builder.build({
            contentHash,
            utxos: [utxo('b', 0, 222)],
            changeAddress: 'bc1qexamplechangeaddress'
        });

        assert(plan.built === true, '10. a utxo covering only a change-less fee still builds successfully');
        assert(plan.outputs.length === 1 && plan.outputs[0].type === 'op_return',
            '11. no change output is created when the leftover would be dust');
        assert(plan.feeSats === plan.totalInputSats, '12. the entire leftover is folded into feeSats, never left unaccounted for');
        assert(plan.totalInputSats === sumOutputs(plan.outputs) + plan.feeSats,
            '13. the same input/output/fee invariant holds even in the no-change case');
    }
    console.log('✓ Section B: a leftover too small for a real change output is folded entirely into the fee, never manufactured into a dust output');

    // ---------------------------------------------------------------
    // Section C — multi-utxo selection, deterministic regardless of
    // supply order.
    // ---------------------------------------------------------------
    {
        const utxos = [utxo('2', 0, 100), utxo('1', 0, 100), utxo('3', 0, 50)];
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });

        const planInOrder = builder.build({ contentHash, utxos, changeAddress: 'bc1qchange' });
        const shuffled = [utxos[2], utxos[0], utxos[1]];
        const planShuffled = builder.build({ contentHash, utxos: shuffled, changeAddress: 'bc1qchange' });

        assert(planInOrder.built === true && planShuffled.built === true, '14. a single utxo cannot cover the fee alone, so a second is accumulated');
        assert(planInOrder.inputs.length === 2, '15. exactly two of the three utxos are selected — the smallest is left behind');
        assert(planInOrder.inputs.every((input) => input.valueSats === 100), '16. the two equal, largest-value utxos are selected over the smaller third');
        assert(JSON.stringify(planInOrder.inputs) === JSON.stringify(planShuffled.inputs),
            '17. selection is identical regardless of the order utxos were supplied in — array order never matters');
        assert(planInOrder.inputs[0].txid < planInOrder.inputs[1].txid, '18. equal-value utxos break ties by txid, deterministically');
    }
    console.log('✓ Section C: multi-utxo accumulation is deterministic — same selection regardless of supply order, ties broken by txid');

    // ---------------------------------------------------------------
    // Section D — insufficient funds.
    // ---------------------------------------------------------------
    {
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const plan = builder.build({
            contentHash,
            utxos: [utxo('c', 0, 50)],
            changeAddress: 'bc1qexamplechangeaddress'
        });

        assert(plan.built === false, '19. a utxo too small to cover even the change-less fee is reported as insufficient, never a malformed plan');
        assert(typeof plan.reason === 'string' && plan.reason.includes('insufficient funds'), '20. the reason names insufficient funds explicitly');
        assert(!('inputs' in plan) && !('outputs' in plan), '21. an insufficient-funds result carries no partial inputs/outputs at all');
    }
    console.log('✓ Section D: utxos too small to cover the estimated fee report built:false with an explicit reason, never a partial plan');

    // ---------------------------------------------------------------
    // Section E — caller-contract violations, refused before selection.
    // ---------------------------------------------------------------
    {
        const builder = new BitcoinAnchorTransactionBuilder();
        const goodUtxos = [utxo('d', 0, 100000)];

        expectThrows(() => builder.build({ contentHash: 'not-hex-data', utxos: goodUtxos, changeAddress: 'bc1q' }),
            '22. a malformed contentHash is refused');
        expectThrows(() => builder.build({ contentHash: 'abc', utxos: goodUtxos, changeAddress: 'bc1q' }),
            '23. an odd-length hex contentHash is refused — it cannot be raw bytes');
        expectThrows(() => builder.build({ contentHash, utxos: [], changeAddress: 'bc1q' }),
            '24. an empty utxos array is refused — this class never discovers funding on its own');
        expectThrows(() => builder.build({ contentHash, utxos: [{ txid: 'not-a-txid', vout: 0, valueSats: 100 }], changeAddress: 'bc1q' }),
            '25. a malformed utxo txid is refused');
        expectThrows(() => builder.build({ contentHash, utxos: [{ ...goodUtxos[0], valueSats: 0 }], changeAddress: 'bc1q' }),
            '26. a zero-value utxo is refused');
        expectThrows(() => builder.build({ contentHash, utxos: goodUtxos, changeAddress: '' }),
            '27. a missing changeAddress is refused');
        expectThrows(() => builder.build({ contentHash, utxos: [{ ...goodUtxos[0], scriptType: 'p2sh-multisig' }], changeAddress: 'bc1q' }),
            '28. an unrecognized scriptType is refused, rather than silently estimated as something it is not');
    }
    console.log('✓ Section E: malformed contentHash, empty utxos, malformed utxo entries, and a missing changeAddress are all refused before any selection is attempted');

    // ---------------------------------------------------------------
    // Section F — no signing, ever; fee scales with the configured rate.
    // ---------------------------------------------------------------
    {
        const utxos = [utxo('e', 0, 100000)];
        const cheap = new BitcoinAnchorTransactionBuilder({ feeRateSatsPerVByte: 1 }).build({ contentHash, utxos, changeAddress: 'bc1qchange' });
        const expensive = new BitcoinAnchorTransactionBuilder({ feeRateSatsPerVByte: 10 }).build({ contentHash, utxos, changeAddress: 'bc1qchange' });

        assert(expensive.feeSats > cheap.feeSats, '29. a higher configured fee rate produces a higher fee');
        assert(expensive.feeSats === Math.ceil(expensive.estimatedVBytes * 10), '30. the higher fee is exactly the estimated vsize times the configured rate');

        const serialized = JSON.stringify(cheap);
        const forbidden = ['privateKey', 'private_key', 'signature', 'witness', 'txHex', 'rawHex', 'seed', 'wif'];
        for (const word of forbidden) {
            assert(!serialized.toLowerCase().includes(word.toLowerCase()), `31. a built plan never carries a "${word}" field — this class never signs anything`);
        }
    }
    console.log('✓ Section F: fee scales exactly with the configured fee rate; a built plan never carries signing material of any kind');

    console.log('\nAll BitcoinAnchorTransactionConstruction tests passed.');
}

try {
    run();
} catch (error) {
    console.error('BitcoinAnchorTransactionConstruction.test.js FAILED:', error);
    process.exitCode = 1;
}
