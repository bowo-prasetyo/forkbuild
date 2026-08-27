import { BitcoinAnchorPsbtSerializer } from '../anchoring/BitcoinAnchorPsbtSerializer.js';

const serializer = new BitcoinAnchorPsbtSerializer();

// 0.8.59 — Explicit Bitcoin Anchor Transaction Review UI.
//
// 0.8.58's own "Deliberately excluded" list named exactly this milestone:
// "Reviewing a real transaction plan before signing it is real, separately
// sized future work." Every piece needed to build a transaction has existed
// since 0.8.47-0.8.49 — a plan, a PSBT-shaped description, real BIP174
// bytes — but nothing in this codebase has ever turned that description
// into what a PERSON needs to see before authorizing it. This file is that
// missing projection, and nothing more:
//
//   { globalUnsignedTx, inputs, outputs, feeSats, ... }   a PSBT-SHAPED
//                                                          DESCRIPTION
//                                                          (0.8.48/0.8.49)
//           │
//           ▼
//   describeBitcoinAnchorTransactionReview()        (THIS FILE — new)
//           │
//           ▼
//   { network, contentHash, inputs, outputs,
//     changeSats, feeSats, totalInputSats,
//     unsignedPsbtHex }
//
// A connected wallet is a signing CAPABILITY, never authorization (see
// docs/Principles.md, "A Connection Grants A Capability; It Does Not Grant
// Trust (0.8.58)"). This file exists because a capability being available
// is not the same thing as a person having actually looked at what they are
// about to authorize — a real review, of the REAL transaction, is what
// belongs between "a wallet is connected" and "a wallet is asked to sign."
//
// A PURE PROJECTION, NOT A NEW SOURCE OF TRUTH. `describeBitcoinAnchorTransactionReview()`
// invents no fact about the transaction — every field it returns is read
// straight off `description` (itself already independently re-validated
// exactly as anchoring/BitcoinAnchorWalletSigner.js and every other
// consumer of a description already does, via
// BitcoinAnchorPsbtSerializer#serialize()). Calling it twice with the
// byte-identical `description` returns a byte-identical result — no
// network access, no caching, no async work of any kind.
//
// `unsignedPsbtHex` IS THE IDENTITY ANCHOR BETWEEN "REVIEWED" AND "SIGNED."
// This is the one field no other "describe*" view in this codebase has
// needed before: the exact, real BIP174 hex a wallet is about to be asked
// to sign, computed the identical way anchoring/BitcoinAnchorWalletSigner.js
// itself computes it before ever calling `wallet.signPsbt()`. A caller that
// shows this review to a person, then later hands `description` to
// anchoring/BitcoinAnchorReviewedPsbtSigner.js's own `requestSignature()`
// alongside this same `unsignedPsbtHex`, gets a hard, structural guarantee
// that a wallet is never asked to sign anything OTHER than what was
// reviewed — see that file's own header for the other half of this
// boundary.
//
// NEVER A VERDICT. This view carries no `valid`, `safe`, `recommended`, or
// `confidence` field of any kind — only the transaction's own facts: which
// UTXOs are spent, what is created, how large the fee is, and what content
// hash is being anchored. Whether those facts are ACCEPTABLE is entirely a
// judgment for the person reading them, exactly as docs/Principles.md, "The
// UI Displays Observations; It Does Not Turn Them Into A Verdict (0.8.57),"
// already held for a transaction's own confirmation and content-proof
// status, extended here to the transaction's own construction.
//
// Throws only for a malformed `description` — this codebase's own
// already-known-good internal artifact (a real anchoring/
// BitcoinAnchorPsbtBuilder.js result), independently re-validated via
// BitcoinAnchorPsbtSerializer#serialize() exactly as every anchoring/ class
// downstream of it already re-validates what it is handed. This is a
// caller-contract violation, never an operational outcome — there is no
// "review unavailable" state, because a description that fails this
// re-validation was never a real, signable transaction to begin with.
export function describeBitcoinAnchorTransactionReview(description) {
    const { hex: unsignedPsbtHex } = serializer.serialize(description);

    const opReturnOutput = description.outputs.find((output) => output.type === 'op_return');
    const changeOutput = description.outputs.find((output) => output.type === 'change');

    return Object.freeze({
        network: description.network,
        anchorType: description.anchorType,
        contentHash: opReturnOutput.dataHex,
        inputs: description.inputs.map((input) => ({
            txid: input.txid,
            vout: input.vout,
            valueSats: input.valueSats,
            scriptType: input.scriptType
        })),
        outputs: description.outputs.map((output) => ({
            type: output.type,
            address: output.type === 'change' ? output.address : null,
            valueSats: output.valueSats
        })),
        changeSats: changeOutput ? changeOutput.valueSats : 0,
        feeSats: description.feeSats,
        totalInputSats: description.totalInputSats,
        unsignedPsbtHex
    });
}
