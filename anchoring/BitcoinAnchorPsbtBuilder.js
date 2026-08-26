const HEX_PATTERN = /^[0-9a-f]+$/i;
const TXID_PATTERN = /^[0-9a-f]{64}$/i;
const SEGWIT_SCRIPT_TYPES = ['p2wpkh', 'p2tr'];
const LEGACY_SCRIPT_TYPES = ['p2pkh'];
const FINAL_SEQUENCE = 0xffffffff; // no RBF signaling — see this file's own header

// 0.8.48 — Bitcoin Anchor PSBT Construction.
//
// anchoring/BitcoinAnchorTransactionBuilder.js (0.8.47) answers "which
// UTXOs would I spend, and what would the fee be?" and deliberately stops
// at an unsigned PLAN — never bytes, never anything a signer could act on
// directly. This class answers the next question in the same sequence
// 0.8.47's own header already reserved: "what would a wallet need in order
// to actually sign that plan?"
//
//   { inputs, outputs, feeSats }      an UNSIGNED PLAN (0.8.47)
//           │
//           ▼
//   + utxoDetails, changeScriptPubKey
//           │
//           ▼
//   BitcoinAnchorPsbtBuilder.build()        (THIS FILE — new)
//           │
//           ▼
//   { globalUnsignedTx, inputs, outputs }   a PSBT-SHAPED DESCRIPTION,
//                                           still never signed bytes
//           │
//           ▼
//   (a future milestone: wallet signing — NOT this one)
//
// STILL NEVER SIGNING, STILL NEVER BROADCASTING. This class does not
// import anchoring/BitcoinAnchorPublisher.js, generates no keys, and
// produces no signature of any kind. Handing a real, spec-serialized
// (BIP174 binary/base64) PSBT to an external wallet is a future concern —
// see "Deliberately excluded" below — exactly as 0.8.47 itself deferred
// real transaction-byte serialization rather than claiming it prematurely.
// What this class DOES produce is the same information a real BIP174 PSBT
// would carry (an unsigned-transaction shape, per-input previous-output
// data, per-output scripts), structured deterministically and validated
// strongly enough that a future serializer has nothing left to decide.
//
// "witnessUtxo" IS NOT WITNESS DATA. BIP174 vocabulary calls the previous
// output being spent (value + scriptPubKey) the "witness_utxo" — it is
// UTXO-describing input to signing, present in every unsigned PSBT, never
// itself a signature. This class's result carries `witnessUtxo` fields
// freely for exactly that reason. It never carries `finalScriptWitness`,
// `finalScriptSig`, or `partialSig` — the BIP174 fields that DO hold
// signing material — because those only exist once a real signer has acted,
// which this class never does. tests/BitcoinAnchorPsbtConstruction.test.js
// scans a built result for precisely that distinction: `witnessUtxo` must
// appear, `finalScriptWitness`/`finalScriptSig`/`partialSig`/`signature`/
// `privateKey`/`seed`/`wif` never may.
//
// NO ADDRESS DECODING, STILL. Exactly as 0.8.47 carried `changeAddress`
// through as an opaque string, this class never derives a scriptPubKey
// from an address itself — no base58/bech32 decoding, anywhere. The
// change output's real scriptPubKey is always caller-supplied
// (`changeScriptPubKey`), the same restraint held toward `utxoDetails`:
// this class validates SHAPE (hex, length, presence, and — for witness
// inputs — that the supplied value matches the plan's own selected input
// exactly), never the cryptographic correspondence between an address and
// a script. That correspondence is the caller's/wallet's own responsibility.
//
// LEGACY INPUTS ARE CARRIED OPAQUELY, ON PURPOSE. A non-witness
// (`p2pkh`) input's PSBT data is the FULL previous transaction
// (`nonWitnessUtxo`), not just a value and a script — real BIP174 signers
// derive the spent output's value/script themselves by parsing that raw
// transaction at the claimed `vout`. This class deliberately does not
// parse transaction bytes (see 0.8.47's own restraint against "raw
// transaction serialization"), so it cannot and does not cross-check a
// legacy input's amount the way it does for a witness input's
// `witnessUtxo.valueSats`. That asymmetry is intentional, not an
// oversight — documented here so it is never mistaken for one.
//
// EVERY VALIDATION IS INDEPENDENT, NOT INHERITED TRUST. Even though
// `plan` is expected to be a genuine anchoring/
// BitcoinAnchorTransactionBuilder.js#build() result, this class never
// assumes that — it re-checks the same input/output/fee invariant 0.8.47's
// own tests already prove holds for a REAL plan, so a hand-modified or
// otherwise malformed plan object is refused here too, independently.
// This gives the pipeline the second clean trust boundary 0.8.47's own
// header anticipated: "connecting a plan to a signature... stays
// deliberately unbuilt" — but validating the plan a SIGNER would be handed
// is exactly this milestone's job.
export class BitcoinAnchorPsbtBuilder {
    // Matches anchoring/BitcoinAnchorTransactionBuilder.js's own
    // anchorType exactly — same external protocol, one more stage of it.
    get anchorType() { return 'bitcoin-op-return'; }

    // Resolves synchronously (no network, no async work of any kind) to a
    // PSBT-shaped description. Never returns a `built:false` operational
    // outcome the way BitcoinAnchorTransactionBuilder#build() can — every
    // input here is already-known-good data (a real plan plus the details
    // needed to sign it), so every failure is a caller-contract violation,
    // and every one of them throws, before any output is produced.
    build({ plan, utxoDetails, changeScriptPubKey } = {}) {
        validatePlan(plan);
        const detailByInput = matchUtxoDetails(plan.inputs, utxoDetails);

        const psbtInputs = plan.inputs.map((input) => buildPsbtInput(input, detailByInput.get(inputKey(input))));

        const opReturnOutput = plan.outputs[0];
        const changeOutput = plan.outputs.find((output) => output.type === 'change');
        if (changeOutput && (typeof changeScriptPubKey !== 'string' || !isNonEmptyHex(changeScriptPubKey))) {
            throw new Error('BitcoinAnchorPsbtBuilder: changeScriptPubKey must be a non-empty hex string when the plan has a change output');
        }
        if (!changeOutput && changeScriptPubKey !== undefined) {
            throw new Error('BitcoinAnchorPsbtBuilder: changeScriptPubKey must not be supplied when the plan has no change output');
        }

        const psbtOutputs = [
            {
                type: 'op_return',
                scriptPubKey: opReturnScriptHex(opReturnOutput.dataHex),
                valueSats: 0,
                dataHex: opReturnOutput.dataHex
            }
        ];
        if (changeOutput) {
            psbtOutputs.push({
                type: 'change',
                scriptPubKey: changeScriptPubKey,
                valueSats: changeOutput.valueSats,
                address: changeOutput.address
            });
        }

        return {
            network: plan.network,
            anchorType: this.anchorType,
            globalUnsignedTx: {
                version: 2,
                locktime: 0,
                inputs: plan.inputs.map((input) => ({ txid: input.txid, vout: input.vout, sequence: FINAL_SEQUENCE })),
                outputs: psbtOutputs.map((output) => ({ scriptPubKey: output.scriptPubKey, valueSats: output.valueSats }))
            },
            inputs: psbtInputs,
            outputs: psbtOutputs,
            feeSats: plan.feeSats,
            totalInputSats: plan.totalInputSats
        };
    }
}

function isNonEmptyHex(value) {
    return typeof value === 'string' && value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

function inputKey(input) {
    return `${input.txid}:${input.vout}`;
}

// Independently re-validates the plan this class was handed — never
// trusts that it genuinely came from BitcoinAnchorTransactionBuilder#build().
function validatePlan(plan) {
    if (!plan || typeof plan !== 'object' || plan.built !== true) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan must be a successfully built BitcoinAnchorTransactionBuilder result (built: true)');
    }
    if (typeof plan.network !== 'string' || !plan.network) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.network must be a non-empty string');
    }
    if (!Array.isArray(plan.inputs) || plan.inputs.length === 0) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.inputs must be a non-empty array');
    }
    if (!Array.isArray(plan.outputs) || plan.outputs.length === 0 || plan.outputs[0].type !== 'op_return') {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.outputs must start with an op_return output');
    }
    const opReturnOutput = plan.outputs[0];
    if (typeof opReturnOutput.dataHex !== 'string' || !HEX_PATTERN.test(opReturnOutput.dataHex) || opReturnOutput.dataHex.length % 2 !== 0) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.outputs[0].dataHex must be an even-length hex string');
    }
    if (!Number.isInteger(plan.feeSats) || plan.feeSats < 0) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.feeSats must be a non-negative integer');
    }
    if (!Number.isInteger(plan.totalInputSats) || plan.totalInputSats <= 0) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.totalInputSats must be a positive integer');
    }
    plan.inputs.forEach((input, index) => {
        if (!input || typeof input.txid !== 'string' || !TXID_PATTERN.test(input.txid)) {
            throw new Error(`BitcoinAnchorPsbtBuilder: plan.inputs[${index}].txid must be a 32-byte hex transaction id`);
        }
        if (!Number.isInteger(input.vout) || input.vout < 0) {
            throw new Error(`BitcoinAnchorPsbtBuilder: plan.inputs[${index}].vout must be a non-negative integer`);
        }
        if (!Number.isInteger(input.valueSats) || input.valueSats <= 0) {
            throw new Error(`BitcoinAnchorPsbtBuilder: plan.inputs[${index}].valueSats must be a positive integer`);
        }
        if (![...SEGWIT_SCRIPT_TYPES, ...LEGACY_SCRIPT_TYPES].includes(input.scriptType)) {
            throw new Error(`BitcoinAnchorPsbtBuilder: plan.inputs[${index}].scriptType must be one of ${[...SEGWIT_SCRIPT_TYPES, ...LEGACY_SCRIPT_TYPES].join(', ')}`);
        }
    });
    plan.outputs.forEach((output, index) => {
        if (!Number.isInteger(output.valueSats) || output.valueSats < 0) {
            throw new Error(`BitcoinAnchorPsbtBuilder: plan.outputs[${index}].valueSats must be a non-negative integer`);
        }
    });

    const totalInputSats = plan.inputs.reduce((total, input) => total + input.valueSats, 0);
    const totalOutputSats = plan.outputs.reduce((total, output) => total + output.valueSats, 0);
    if (totalInputSats !== plan.totalInputSats) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan.totalInputSats does not equal the sum of plan.inputs — plan failed independent re-verification');
    }
    if (totalInputSats !== totalOutputSats + plan.feeSats) {
        throw new Error('BitcoinAnchorPsbtBuilder: plan fails its own input/output/fee invariant — total input value must equal total output value plus feeSats');
    }
}

// Matches each of plan.inputs to exactly one utxoDetails entry, by
// (txid, vout) — never by array position, so utxoDetails may be supplied
// in any order. Throws on a missing match, an ambiguous (duplicate) match,
// or a surplus entry that names no selected input.
function matchUtxoDetails(planInputs, utxoDetails) {
    if (!Array.isArray(utxoDetails)) {
        throw new Error('BitcoinAnchorPsbtBuilder: utxoDetails must be an array — one entry per plan input');
    }
    const planKeys = new Set(planInputs.map(inputKey));
    const detailByInput = new Map();

    utxoDetails.forEach((detail, index) => {
        if (!detail || typeof detail !== 'object' || typeof detail.txid !== 'string' || !Number.isInteger(detail.vout)) {
            throw new Error(`BitcoinAnchorPsbtBuilder: utxoDetails[${index}] must supply txid and vout matching a plan input`);
        }
        const key = `${detail.txid}:${detail.vout}`;
        if (!planKeys.has(key)) {
            throw new Error(`BitcoinAnchorPsbtBuilder: utxoDetails[${index}] (${key}) does not match any input selected by the plan`);
        }
        if (detailByInput.has(key)) {
            throw new Error(`BitcoinAnchorPsbtBuilder: utxoDetails contains more than one entry for ${key}`);
        }
        detailByInput.set(key, detail);
    });

    for (const input of planInputs) {
        if (!detailByInput.has(inputKey(input))) {
            throw new Error(`BitcoinAnchorPsbtBuilder: utxoDetails is missing an entry for plan input ${inputKey(input)}`);
        }
    }

    return detailByInput;
}

function buildPsbtInput(input, detail) {
    const base = { txid: input.txid, vout: input.vout, valueSats: input.valueSats, scriptType: input.scriptType };

    if (SEGWIT_SCRIPT_TYPES.includes(input.scriptType)) {
        if ('nonWitnessUtxo' in detail) {
            throw new Error(`BitcoinAnchorPsbtBuilder: ${inputKey(input)} is a ${input.scriptType} input and must not supply nonWitnessUtxo`);
        }
        if (!isNonEmptyHex(detail.scriptPubKey)) {
            throw new Error(`BitcoinAnchorPsbtBuilder: ${inputKey(input)} must supply witnessUtxo.scriptPubKey as a non-empty hex string`);
        }
        if (detail.valueSats !== input.valueSats) {
            throw new Error(`BitcoinAnchorPsbtBuilder: ${inputKey(input)} witnessUtxo.valueSats (${detail.valueSats}) must equal the plan's selected value (${input.valueSats})`);
        }
        return { ...base, witnessUtxo: { scriptPubKey: detail.scriptPubKey, valueSats: detail.valueSats } };
    }

    // LEGACY_SCRIPT_TYPES
    if ('scriptPubKey' in detail || 'valueSats' in detail) {
        throw new Error(`BitcoinAnchorPsbtBuilder: ${inputKey(input)} is a ${input.scriptType} input and must supply nonWitnessUtxo, not witnessUtxo fields`);
    }
    if (!isNonEmptyHex(detail.nonWitnessUtxo)) {
        throw new Error(`BitcoinAnchorPsbtBuilder: ${inputKey(input)} must supply nonWitnessUtxo as a non-empty hex string`);
    }
    return { ...base, nonWitnessUtxo: detail.nonWitnessUtxo };
}

// The real OP_RETURN scriptPubKey — OP_RETURN(0x6a) + a push opcode +
// the raw data — derivable purely arithmetically from the content hash
// itself, unlike a change output's script, which depends on an address
// this class never decodes. Mirrors anchoring/
// BitcoinAnchorTransactionBuilder.js's own opReturnOutputVBytes byte-count
// logic exactly, but emits the actual bytes rather than only their count.
function opReturnScriptHex(dataHex) {
    const dataBytes = dataHex.length / 2;
    if (dataBytes > 255) {
        throw new Error('BitcoinAnchorPsbtBuilder: contentHash is too large to carry as a single OP_RETURN push');
    }
    const pushOpcodeHex = dataBytes <= 75
        ? dataBytes.toString(16).padStart(2, '0')
        : '4c' + dataBytes.toString(16).padStart(2, '0');
    return '6a' + pushOpcodeHex + dataHex;
}
