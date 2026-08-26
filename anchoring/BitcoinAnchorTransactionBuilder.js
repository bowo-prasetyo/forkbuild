const HEX_PATTERN = /^[0-9a-f]+$/i;
const TXID_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_DUST_THRESHOLD_SATS = 546;

// Approximate transaction-weight figures, in vbytes, for the input/output
// script types this builder can estimate a fee for. These are the same
// widely-cited round figures most wallets use for fee ESTIMATION before a
// real signer exists to measure the real thing — NOT a consensus rule, and
// never claimed to be exact. See this file's own header for why an
// estimate is all this class ever needs to produce.
const INPUT_VBYTES_BY_SCRIPT_TYPE = { p2wpkh: 68, p2pkh: 148, p2tr: 58 };
const OUTPUT_VBYTES_BY_SCRIPT_TYPE = { p2wpkh: 31, p2pkh: 34, p2tr: 43 };
const TX_OVERHEAD_VBYTES = 10.5; // version(4) + segwit marker/flag(0.5) + locktime(4) + input/output count compactSize bytes(~2)

// 0.8.47 — Bitcoin Anchor Transaction Construction.
//
// anchoring/BitcoinAnchorPublisher.js (0.8.9) already answers "can I ask
// Bitcoin to record this contentHash?" — but it deliberately never builds
// the transaction itself; it hands the raw contentHash to an injected
// `broadcaster` and trusts that capability to construct, sign, AND
// broadcast, all three, as one opaque step. 0.8.9's own "Deliberately
// excluded" list named exactly what that left unbuilt: "wallet
// management... UTXO selection, automatic fee optimization, coin
// selection." This class builds ONE of those pieces — deterministic UTXO
// selection and fee/change computation — and stops there, on purpose:
//
//   contentHash, utxos, changeAddress
//           │
//           ▼
//   BitcoinAnchorTransactionBuilder.build()        (THIS FILE — new)
//           │
//           ▼
//   { inputs, outputs, feeSats }         an UNSIGNED PLAN, not a transaction
//           │
//           ▼
//   (a future milestone: wallet signing)
//           │
//           ▼
//   (a future milestone: broadcaster.broadcast())
//
// NEVER SIGNING, NEVER BROADCASTING, NEVER WIRED TO BitcoinAnchorPublisher.
// `build()` returns a PLAN — which UTXOs to spend, which outputs to create,
// and how large the fee is — never signed bytes, never a raw transaction
// hex string, never anything handed to a network. This class does not
// import anchoring/BitcoinAnchorPublisher.js, and BitcoinAnchorPublisher.js
// is not changed by this milestone: connecting "build a plan" to "sign it"
// to "broadcast it" is explicitly left to later, separately sized
// milestones (a wallet-signing boundary, then an explicit broadcast step),
// exactly as 0.8.9's own header already reserved that sequencing.
//
// NO WALLET MANAGEMENT, STILL. This class never generates keys, never
// derives or validates a Bitcoin address (`changeAddress` is carried
// through verbatim — validating its real address format is a future
// concern this class does not take on), never discovers UTXOs on its own,
// and never holds custody of anything. `utxos` is always a caller-supplied
// array — the identical restraint anchoring/BitcoinAnchorPublisher.js
// already holds toward its own `broadcaster`: real funding information is
// always the CALLER's own.
//
// FEE/SIZE ARE ESTIMATES, NOT CONSENSUS. This class never serializes an
// actual Bitcoin transaction (no varint encoding, no script bytes, no
// witness data) — producing genuinely correct wire-format bytes is a real
// signer's job, and a real signer's actual output can differ slightly from
// the vbyte figures this class estimates from. `estimatedVBytes` in a
// successful result is reported as exactly that: an estimate this class
// used to size the fee, never a claim about the eventual signed
// transaction's real weight.
//
// DETERMINISTIC COIN SELECTION. Given the same `utxos` (in any order),
// `contentHash`, `changeAddress`, and constructor policy, `build()` always
// selects the identical inputs and produces the identical outputs — sorted
// largest-value-first, with a stable txid/vout tie-break so array order
// never matters. This is a plain greedy accumulation, never an optimal
// (branch-and-bound, privacy-aware, or fee-minimizing-across-combinations)
// coin selector — "deterministic and simple to verify" is this class's own
// goal, not "the best possible selection."
//
// DUST NEVER BECOMES A MANUFACTURED OUTPUT. When the leftover after paying
// the estimated fee would fall below `dustThresholdSats`, no change output
// is created at all — the leftover is folded entirely into the fee, never
// rounded into a sub-dust output a real network would refuse to relay.
// `outputs` therefore always has either one entry (OP_RETURN only) or two
// (OP_RETURN + change), never a dust change entry.
//
// Every accepted result satisfies exactly one invariant, checked directly
// in tests/BitcoinAnchorTransactionConstruction.test.js: the sum of
// selected inputs' `valueSats` equals `feeSats` plus every output's own
// `valueSats` — nothing is created or destroyed that isn't explicitly
// named as `feeSats`.
export class BitcoinAnchorTransactionBuilder {
    constructor({
        network = 'mainnet', feeRateSatsPerVByte = 1,
        dustThresholdSats = DEFAULT_DUST_THRESHOLD_SATS, changeScriptType = 'p2wpkh'
    } = {}) {
        if (!Number.isFinite(feeRateSatsPerVByte) || feeRateSatsPerVByte <= 0) {
            throw new Error('BitcoinAnchorTransactionBuilder: feeRateSatsPerVByte must be a positive number');
        }
        if (!Number.isInteger(dustThresholdSats) || dustThresholdSats < 0) {
            throw new Error('BitcoinAnchorTransactionBuilder: dustThresholdSats must be a non-negative integer');
        }
        if (!(changeScriptType in OUTPUT_VBYTES_BY_SCRIPT_TYPE)) {
            throw new Error(`BitcoinAnchorTransactionBuilder: changeScriptType must be one of ${Object.keys(OUTPUT_VBYTES_BY_SCRIPT_TYPE).join(', ')}`);
        }
        this._network = network;
        this._feeRateSatsPerVByte = feeRateSatsPerVByte;
        this._dustThresholdSats = dustThresholdSats;
        this._changeScriptType = changeScriptType;
    }

    // Matches anchoring/BitcoinAnchorPublisher.js's own anchorType exactly
    // — this class names the same external protocol, never a "planning"
    // variant of it.
    get anchorType() { return 'bitcoin-op-return'; }
    get network() { return this._network; }
    get feeRateSatsPerVByte() { return this._feeRateSatsPerVByte; }

    // Resolves synchronously (no network, no async work of any kind) to
    // exactly one of:
    //
    //   { built: true, network, inputs, outputs, feeSats,
    //     totalInputSats, estimatedVBytes }
    //   { built: false, reason }
    //       — the supplied utxos cannot cover even the estimated fee.
    //
    // `inputs` is `[{ txid, vout, valueSats, scriptType }, ...]`, in
    // selection order. `outputs[0]` is always
    // `{ type: 'op_return', dataHex: contentHash, valueSats: 0 }`; a
    // second `{ type: 'change', address, valueSats }` entry is present
    // only when the leftover clears `dustThresholdSats`.
    //
    // Throws only for a caller contract violation checked BEFORE any
    // selection is attempted — a malformed contentHash, a missing/empty
    // utxos array, a malformed utxo entry, or a missing changeAddress —
    // mirroring exactly how publish() throws for its own malformed
    // contentHash rather than reporting it as an operational outcome.
    build({ contentHash, utxos, changeAddress }) {
        if (typeof contentHash !== 'string' || !HEX_PATTERN.test(contentHash) || contentHash.length % 2 !== 0) {
            throw new Error('BitcoinAnchorTransactionBuilder: contentHash must be an even-length hex string to carry as raw OP_RETURN bytes');
        }
        if (!Array.isArray(utxos) || utxos.length === 0) {
            throw new Error('BitcoinAnchorTransactionBuilder: utxos must be a non-empty array — this class never discovers funding on its own');
        }
        if (typeof changeAddress !== 'string' || !changeAddress.trim()) {
            throw new Error('BitcoinAnchorTransactionBuilder: changeAddress must be a non-empty string');
        }

        const normalizedUtxos = utxos.map((utxo, index) => normalizeUtxo(utxo, index));
        const sorted = sortUtxosForSelection(normalizedUtxos);
        const opReturnVBytes = opReturnOutputVBytes(contentHash.length / 2);
        const changeOutputVBytes = OUTPUT_VBYTES_BY_SCRIPT_TYPE[this._changeScriptType];

        const selected = [];
        let totalInputSats = 0;
        let totalInputVBytes = 0;
        let lastFeeWithoutChange = 0;

        for (const utxo of sorted) {
            selected.push(utxo);
            totalInputSats += utxo.valueSats;
            totalInputVBytes += INPUT_VBYTES_BY_SCRIPT_TYPE[utxo.scriptType];

            const feeWithChange = Math.ceil(
                (TX_OVERHEAD_VBYTES + totalInputVBytes + opReturnVBytes + changeOutputVBytes) * this._feeRateSatsPerVByte
            );
            const changeSats = totalInputSats - feeWithChange;
            if (changeSats >= this._dustThresholdSats) {
                return {
                    built: true,
                    network: this._network,
                    inputs: selected,
                    outputs: [
                        { type: 'op_return', dataHex: contentHash, valueSats: 0 },
                        { type: 'change', address: changeAddress, valueSats: changeSats }
                    ],
                    feeSats: feeWithChange,
                    totalInputSats,
                    estimatedVBytes: TX_OVERHEAD_VBYTES + totalInputVBytes + opReturnVBytes + changeOutputVBytes
                };
            }

            lastFeeWithoutChange = Math.ceil((TX_OVERHEAD_VBYTES + totalInputVBytes + opReturnVBytes) * this._feeRateSatsPerVByte);
            if (totalInputSats >= lastFeeWithoutChange) {
                // Covers a change-less transaction. Any leftover above the
                // fee is genuine dust — folded into feeSats rather than
                // manufactured into a sub-dust output the network would
                // refuse to relay (see this file's own header).
                return {
                    built: true,
                    network: this._network,
                    inputs: selected,
                    outputs: [
                        { type: 'op_return', dataHex: contentHash, valueSats: 0 }
                    ],
                    feeSats: totalInputSats,
                    totalInputSats,
                    estimatedVBytes: TX_OVERHEAD_VBYTES + totalInputVBytes + opReturnVBytes
                };
            }
        }

        return {
            built: false,
            reason: `insufficient funds: ${utxos.length} utxo(s) totaling ${totalInputSats} sat(s) cannot cover the estimated fee of ${lastFeeWithoutChange} sat(s) at ${this._feeRateSatsPerVByte} sat/vB`
        };
    }
}

function normalizeUtxo(utxo, index) {
    if (!utxo || typeof utxo !== 'object') {
        throw new Error(`BitcoinAnchorTransactionBuilder: utxos[${index}] must be an object`);
    }
    if (typeof utxo.txid !== 'string' || !TXID_PATTERN.test(utxo.txid)) {
        throw new Error(`BitcoinAnchorTransactionBuilder: utxos[${index}].txid must be a 32-byte hex transaction id`);
    }
    if (!Number.isInteger(utxo.vout) || utxo.vout < 0) {
        throw new Error(`BitcoinAnchorTransactionBuilder: utxos[${index}].vout must be a non-negative integer`);
    }
    if (!Number.isInteger(utxo.valueSats) || utxo.valueSats <= 0) {
        throw new Error(`BitcoinAnchorTransactionBuilder: utxos[${index}].valueSats must be a positive integer`);
    }
    const scriptType = utxo.scriptType || 'p2wpkh';
    if (!(scriptType in INPUT_VBYTES_BY_SCRIPT_TYPE)) {
        throw new Error(`BitcoinAnchorTransactionBuilder: utxos[${index}].scriptType must be one of ${Object.keys(INPUT_VBYTES_BY_SCRIPT_TYPE).join(', ')}`);
    }
    return { txid: utxo.txid, vout: utxo.vout, valueSats: utxo.valueSats, scriptType };
}

// Largest-value-first, with a txid/vout tie-break — deterministic
// regardless of the order utxos were supplied in. See this file's own
// header on why this is "deterministic and simple to verify," never an
// optimal coin selector.
function sortUtxosForSelection(utxos) {
    return utxos.slice().sort((a, b) => {
        if (b.valueSats !== a.valueSats) return b.valueSats - a.valueSats;
        if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
        return a.vout - b.vout;
    });
}

// value(8) + scriptPubKey compactSize length prefix(1, valid while the
// script itself stays under 253 bytes — always true for the hash sizes
// this class expects) + OP_RETURN(1) + push-opcode + data. A push of 75
// bytes or fewer uses a single direct push opcode; 76-255 bytes needs the
// two-byte OP_PUSHDATA1 form. Anything larger throws — well beyond any
// content hash this codebase produces, and beyond typical OP_RETURN relay
// policy limits besides.
function opReturnOutputVBytes(dataBytes) {
    if (dataBytes > 255) {
        throw new Error('BitcoinAnchorTransactionBuilder: contentHash is too large to carry as a single OP_RETURN push');
    }
    const pushOpcodeBytes = dataBytes <= 75 ? 1 : 2;
    return 8 + 1 + 1 + pushOpcodeBytes + dataBytes;
}
