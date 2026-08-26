import { BitcoinAnchorPsbtSerializer } from './BitcoinAnchorPsbtSerializer.js';
import { BitcoinAnchorSignedPsbtInspector } from './BitcoinAnchorSignedPsbtInspector.js';

// 0.8.50 — Explicit Bitcoin Wallet Signing.
//
// anchoring/BitcoinAnchorPsbtSerializer.js (0.8.49) stops at a genuine
// unsigned BIP174 PSBT and names exactly what comes next: "a future
// milestone: handing this to an external wallet — NOT this one." This
// class is that handoff, held to the identical principle every wallet
// milestone in docs/Roadmap.md was already promised under:
//
//   ForkBuild requests authorization; the wallet controls the keys and
//   performs the signing.
//
//   { globalUnsignedTx, inputs, ... }        a PSBT-SHAPED
//                                             DESCRIPTION (0.8.48)
//           │
//           ▼
//   BitcoinAnchorPsbtSerializer.serialize()          (0.8.49)
//           │
//           ▼
//   an unsigned BIP174 PSBT
//           │
//           ▼
//   ┌─────────────────────┐
//   │ an injected `wallet` │   user reviews, user approves, wallet signs
//   │  (never this class)  │   — entirely outside this class's own walls
//   └──────────┬───────────┘
//              ▼
//   a claimed SIGNED PSBT
//              │
//              ▼
//   BitcoinAnchorSignedPsbtInspector.inspect()   (0.8.50 — new sibling)
//              │
//              ▼
//   { signed: true, psbt, signedInputs }
// | { signed: false, reason }
// | { signed: false, unavailable: true, reason }
//
// FORKBUILD NEVER RECEIVES A PRIVATE KEY, NEVER GENERATES ONE, NEVER
// DERIVES A SEED, NEVER STORES A WALLET SECRET. This class does not
// generate keys, does not import anything from anchoring/
// BitcoinAnchorPublisher.js, and never broadcasts — `requestSignature()`
// resolves to a signed PSBT or a reason it could not get one, nothing
// more. Whether the user approves the transaction, and how the private
// key that signs it is held, is entirely the injected `wallet`'s own
// concern — the identical restraint anchoring/BitcoinAnchorPublisher.js
// already holds toward its own injected `broadcaster` for "construct,
// sign, broadcast."
//
// A `wallet` has exactly this shape, mirroring anchoring/
// BitcoinAnchorPublisher.js's own `broadcaster` contract precisely:
//
//   { signPsbt(unsignedPsbt) ->
//       { signed: true, psbt }
//           — psbt: a Uint8Array, hex string, or base64 string.
//     | { signed: false, reason }
//           — a DEFINITE no: the user declined, or the wallet refused.
//     | { signed: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: the wallet is locked, unreachable,
//             or not installed. NEVER treated as a decline.
//     (sync return or Promise — requestSignature() always awaits it) }
//
// Throwing is tolerated as a last resort — caught and reported as the
// `unavailable` form, never the definite-decline form — mirroring exactly
// how anchoring/BitcoinAnchorPublisher.js already treats a throwing
// broadcaster.
//
// A SIGNED-PSBT INSPECTION BOUNDARY, NEVER SKIPPED. This class never
// simply trusts a wallet's own `{ signed: true }` claim. Every claimed
// signature is independently re-inspected by
// BitcoinAnchorSignedPsbtInspector — an unrelated, separately testable
// class — against the exact description this class itself asked to be
// signed. A wallet that returns `{ signed: true }` for a transaction that
// no longer matches (a substituted output, a changed value, a missing
// signing field) is reported here as `{ signed: false, reason }`, never
// as success. See docs/Principles.md, "A Wallet's Claim Is Not The
// Signature (0.8.50)."
//
// STILL NEVER BROADCASTING. A successful `{ signed: true }` result is a
// signed PSBT, never a raw transaction, never a txid, never anything
// handed to a network. Turning a signed PSBT into a broadcastable
// transaction (finalization) and broadcasting it are each their own,
// separately sized future milestones — see docs/Roadmap.md, 0.8.51 and
// 0.8.52.
export class BitcoinAnchorWalletSigner {
    constructor({ wallet } = {}) {
        if (!wallet || typeof wallet.signPsbt !== 'function') {
            throw new Error('BitcoinAnchorWalletSigner: a wallet capable of signPsbt() is required');
        }
        this._wallet = wallet;
        this._serializer = new BitcoinAnchorPsbtSerializer();
        this._inspector = new BitcoinAnchorSignedPsbtInspector();
    }

    // Matches anchoring/BitcoinAnchorPublisher.js's own anchorType exactly
    // — the same external protocol, one more stage of it.
    get anchorType() { return 'bitcoin-op-return'; }

    // Resolves to exactly one of:
    //
    //   { signed: true, psbt, signedInputs }
    //   { signed: false, reason }
    //       — the wallet reached a definite no, or its claimed signature
    //         does not survive independent inspection.
    //   { signed: false, unavailable: true, reason }
    //       — cannot presently obtain a signature; retrying later may
    //         succeed.
    //
    // Throws only for a malformed `description` (a caller-contract
    // violation on this codebase's own already-known-good internal
    // artifact, checked before the wallet is ever consulted — the
    // identical `serialize()` re-validation 0.8.49 itself already
    // performs) or a wallet result this class cannot make sense of at all
    // (a wallet-contract violation, not an operational failure — mirroring
    // anchoring/BitcoinAnchorPublisher.js#publish() throwing on a
    // malformed txid rather than reporting it as a decline).
    async requestSignature({ description } = {}) {
        const unsignedPsbt = this._serializer.serialize(description);

        let result;
        try {
            result = await this._wallet.signPsbt(unsignedPsbt);
        } catch (error) {
            return { signed: false, unavailable: true, reason: error.message };
        }

        if (!result || result.signed !== true) {
            return {
                signed: false,
                unavailable: !!(result && result.unavailable),
                reason: (result && result.reason) || 'wallet declined to sign this PSBT'
            };
        }

        if (result.psbt === undefined) {
            throw new Error('BitcoinAnchorWalletSigner: wallet reported signed: true but returned no psbt');
        }

        const inspection = this._inspector.inspect({ description, signedPsbt: result.psbt });
        if (!inspection.intact) {
            return { signed: false, reason: `wallet returned a signed PSBT that does not match the intended transaction — ${inspection.reason}` };
        }

        return { signed: true, psbt: result.psbt, signedInputs: inspection.signedInputs };
    }
}
