import { decodeP2wpkhScriptPubKey } from '../anchoring/BitcoinSegwitAddressScriptPubKey.js';
import { describeBitcoinAnchorTransactionReview } from './BitcoinAnchorTransactionReviewView.js';

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// docs/Roadmap.md's own 0.8.61 entry named this milestone directly: "Address
// decoding, and the PSBT/signing wiring it would unlock, remain real,
// separately sized future work — 0.8.62's own concern, not this one's."
// This class is that wiring, and nothing more — it turns an already-
// CONSTRUCTED plan-level identity (0.8.61) into the PSBT-shaped description
// application/BitcoinAnchorTransactionReviewView.js (0.8.59) and anchoring/
// BitcoinAnchorReviewedPsbtSigner.js (0.8.59) have required, unchanged,
// since before a real one could ever reach them:
//
//   { publicationId, contentHash, fundingObservation, plan }   a CONSTRUCTION
//                                                               IDENTITY (0.8.61)
//           │
//           ▼
//   decodeP2wpkhScriptPubKey(fundingObservation.account)   anchoring/
//           │                                               BitcoinSegwitAddressScriptPubKey.js
//           │                                               (THIS MILESTONE — new)
//           ▼
//   BitcoinAnchorPsbtBuilder.build()                    (0.8.48, UNCHANGED)
//           │
//           ▼
//   { reviewable: true, description, review }
// | { reviewable: false, reason }
//
// A DELIBERATELY THIN BRIDGE — ORCHESTRATION ONLY, NEVER A SECOND
// IMPLEMENTATION. This class never selects a UTXO, never computes a fee,
// never re-derives a change amount, and never invents a scriptPubKey of its
// own devising — every one of those stays exactly where an earlier
// milestone already put it (selection and fee arithmetic: 0.8.47; PSBT
// shape: 0.8.48; the review projection itself: 0.8.59). This class only
// ever supplies the ONE fact those classes have always required from a
// caller and never had a real source for: a spent or change output's real
// `scriptPubKey`, derived from the exact same account a real, connected
// wallet already reported.
//
// ONLY A NATIVE SEGWIT (P2WPKH) ACCOUNT CAN PRESENTLY BE REVIEWED FOR
// SIGNING. `fundingObservation.scriptType` is read straight off anchoring/
// BitcoinWalletFundingObserver.js's own, unchanged 0.8.60 output. A p2tr or
// p2pkh account is a completely real, valid funding observation — this
// class simply cannot yet build a signable PSBT input for either (taproot
// scriptPubKey derivation, and a legacy input's full previous transaction,
// are each real, separately sized future work — see docs/Roadmap.md,
// 0.8.62's own "Deliberately excluded" list) — so it reports the honest
// `reviewable: false`, never a guess or a partial description.
//
// CHANGE SPENDS THE SAME SCRIPTPUBKEY AS EVERY INPUT, BECAUSE IT IS THE
// SAME ACCOUNT. anchoring/BitcoinWalletFundingObserver.js's own header
// (0.8.60) already named why: "`changeAccount` is always exactly the same
// `account` this observation was asked about." This class decodes that one
// address exactly once and reuses the identical `scriptPubKeyHex` for every
// selected input's `witnessUtxo` AND, when the plan has one, the change
// output — never two separate decodes that could silently disagree.
//
// A REAL BUT UNSUPPORTED OR UNDECODABLE ADDRESS IS AN OPERATIONAL OUTCOME,
// NEVER A THROW. Exactly as anchoring/BitcoinSegwitAddressScriptPubKey.js's
// own header holds toward the address string itself, this class treats
// `fundingObservation` as a real, externally-influenced fact (an account a
// wallet extension reported), never this codebase's own already-known-good
// internal artifact — so an unsupported script type or a failed decode is
// reported as `{ reviewable: false, reason }`, never thrown. Throwing here
// is reserved for a genuine caller-contract violation: a `construction` that
// is not itself a real 0.8.61 CONSTRUCTED identity at all.
//
// SYNCHRONOUS, EXACTLY LIKE EVERY CLASS IT COMPOSES. `review()` performs no
// network access and no async work of any kind — mirroring anchoring/
// BitcoinAnchorPsbtBuilder.js#build() and application/
// BitcoinAnchorTransactionConstructionCoordinator.js#construct() exactly,
// one and two stages earlier. A caller does not need to `await` this call.
export class BitcoinAnchorTransactionReviewCoordinator {
    constructor({ bitcoinAnchorPsbtBuilder } = {}) {
        if (!bitcoinAnchorPsbtBuilder || typeof bitcoinAnchorPsbtBuilder.build !== 'function') {
            throw new Error('BitcoinAnchorTransactionReviewCoordinator: a BitcoinAnchorPsbtBuilder is required');
        }
        this._bitcoinAnchorPsbtBuilder = bitcoinAnchorPsbtBuilder;
    }

    // Resolves synchronously to exactly one of:
    //
    //   { reviewable: true, description, review, reason: null }
    //   { reviewable: false, description: null, review: null, reason }
    //       — the funding observation's own account uses a script type or
    //         address this class cannot presently decode a scriptPubKey
    //         for.
    //
    // Throws only for a caller-contract violation checked BEFORE any
    // decoding or building is attempted — `construction` missing its own
    // `plan` or `fundingObservation` — mirroring exactly how application/
    // BitcoinAnchorTransactionConstructionCoordinator.js#construct() itself
    // throws for a fundingObservation that is not itself OBSERVED, rather
    // than reporting it as an operational outcome.
    review({ construction } = {}) {
        if (!construction || typeof construction !== 'object' || !construction.plan || !construction.fundingObservation) {
            throw new Error('BitcoinAnchorTransactionReviewCoordinator: construction must be a real BitcoinAnchorTransactionConstructionCoordinator CONSTRUCTED result\'s own construction');
        }
        const { plan, fundingObservation } = construction;

        if (fundingObservation.scriptType !== 'p2wpkh') {
            return this._unreviewable(`cannot yet build a signable PSBT for a "${fundingObservation.scriptType}" account — only native segwit (p2wpkh) addresses can presently be reviewed for signing`);
        }

        const decoded = decodeP2wpkhScriptPubKey(fundingObservation.account);
        if (!decoded.decoded) {
            return this._unreviewable(`could not derive a scriptPubKey for account ${fundingObservation.account} — ${decoded.reason}`);
        }
        if (decoded.network !== plan.network) {
            return this._unreviewable(`account ${fundingObservation.account} decodes to network "${decoded.network}", which does not match this plan's own network "${plan.network}"`);
        }

        const utxoDetails = plan.inputs.map((input) => ({
            txid: input.txid,
            vout: input.vout,
            scriptPubKey: decoded.scriptPubKeyHex,
            valueSats: input.valueSats
        }));
        const hasChangeOutput = plan.outputs.some((output) => output.type === 'change');

        const description = this._bitcoinAnchorPsbtBuilder.build({
            plan,
            utxoDetails,
            changeScriptPubKey: hasChangeOutput ? decoded.scriptPubKeyHex : undefined
        });
        const review = describeBitcoinAnchorTransactionReview(description);

        return Object.freeze({ reviewable: true, description, review, reason: null });
    }

    _unreviewable(reason) {
        return Object.freeze({ reviewable: false, description: null, review: null, reason: `BitcoinAnchorTransactionReviewCoordinator: ${reason}` });
    }
}
