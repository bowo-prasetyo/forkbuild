const HEX_PATTERN = /^[0-9a-f]+$/i;
const TXID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.8.9 — Bitcoin Anchor Creation Adapter.
//
// anchoring/BitcoinOpReturnProofVerifier.js (0.8.1) answers "can I verify
// this claimed Bitcoin evidence?" This class answers the other half:
// "can I ask Bitcoin to record this contentHash, and get back the exact
// evidence parameters that verifier already knows how to check?" It is
// the CREATION-side counterpart, never a replacement, and never a second
// way to construct a `core/PublicationAnchor.js` — see application/
// CreatePublicationAnchorUseCase.js's own header for why creating a claim
// and recording evidence externally stay two separate, explicit actions:
//
//   contentHash
//       │
//       ▼
//   BitcoinAnchorPublisher.publish()     (THIS FILE — Bitcoin-specific)
//       │
//       ▼
//   { locator, proof }                    evidence parameters, NOT an anchor
//       │
//       ▼
//   CreatePublicationAnchorUseCase.execute()   (0.8.8 — generic, unchanged)
//       │
//       ▼
//   PublicationAnchor
//
// This class never imports core/PublicationAnchor.js or application/
// CreatePublicationAnchorUseCase.js — exactly the asymmetry anchoring/
// BitcoinOpReturnProofVerifier.js already holds for verification, held
// here for creation. Nothing about `publish()`'s return value is ever
// itself a signed claim; it is only the raw material a caller feeds to
// CreatePublicationAnchorUseCase afterward, as an explicit, separate step.
//
// SAME WIRE CONTRACT AS THE VERIFIER, NO NEW ENCODING. The `proof` this
// class returns is exactly anchoring/BitcoinOpReturnProofVerifier.js's own
// expected shape — `{ txid, network }` — and the payload it asks its
// broadcaster to carry in the OP_RETURN output is the raw contentHash hex,
// nothing else: no publicationId, no application-chosen envelope. A
// transaction this class helped create is therefore, by construction, one
// anchoring/BitcoinOpReturnProofVerifier.js already knows how to check —
// proven directly in tests/BitcoinAnchorCreationAdapter.test.js by handing
// the SAME fake chain this class published into to that verifier.
//
// NO WALLET MANAGEMENT. This class never generates keys, manages UTXOs,
// estimates fees, or holds custody of anything. It delegates the actual
// "construct, sign, broadcast" work to an injected `broadcaster` — the
// identical injection-point discipline content/IpfsContentStore.js
// established for `fetchImpl` and anchoring/BitcoinOpReturnProofVerifier.js
// already reuses for the identical reason: every deterministic test in
// this codebase supplies a fake one (tests/BitcoinAnchorCreationAdapter.test.js),
// so this file's own orchestration is fully covered without this codebase
// ever taking on real signing/broadcast responsibility. A real wallet
// capability is a future, separately sized concern — see docs/Roadmap.md,
// 0.8.9's own "Deliberately excluded" list.
//
// A `broadcaster` has exactly this shape:
//
//   { broadcast(opReturnHex, { network }) ->
//       { broadcast: true, txid }
//       | { broadcast: false, reason }
//           — a DEFINITE no: the network was reached and it refused this
//             transaction (e.g. rejected as non-standard, double-spend).
//       | { broadcast: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: no network connectivity, no funds
//             currently available to spend, a timeout. NEVER treated as a
//             rejection.
//     (sync return or Promise — publish() always awaits it) }
//
// Throwing is tolerated as a last resort — publish() catches it and
// reports the `unavailable` form, never the definite-rejection form —
// mirroring exactly how application/ExternalAnchorVerifier.js already
// treats a throwing proofVerifier. See docs/Principles.md, "Broadcast
// Acceptance Is Not Anchor Validity (0.8.9)."
//
// NO MANUFACTURED anchoredAt. A successful `publish()` result never
// includes an `anchoredAt` — this class has no meaningful external record
// time to report. Broadcast time is not confirmation time is not block
// time (see this file's own header point on confirmation staying a
// SEPARATE, later concern), and Bitcoin transactions can remain
// unconfirmed for an unbounded time. A caller feeding this result straight
// into CreatePublicationAnchorUseCase.execute() gets that use case's own
// honest "now" default — never a timestamp this class invented to look
// like it came from Bitcoin itself.
//
// BROADCAST ACCEPTANCE IS NOT ANCHOR VALIDITY. A `published: true` result
// means only "the network accepted this transaction for broadcast" — it
// says nothing about confirmation. The resulting PublicationAnchor, the
// moment it is created, independently reports PROOF_UNAVAILABLE from
// application/ExternalAnchorVerifier.js until the transaction actually
// confirms — at which point the SAME anchor, unchanged, reports VALID.
// See tests/BitcoinAnchorCreationAdapter.test.js's own lifecycle section.
export class BitcoinAnchorPublisher {
    constructor({ network = 'mainnet', broadcaster } = {}) {
        if (!broadcaster || typeof broadcaster.broadcast !== 'function') {
            throw new Error('BitcoinAnchorPublisher: a transaction broadcaster is required');
        }
        this._network = network;
        this._broadcaster = broadcaster;
    }

    // Matches anchoring/BitcoinOpReturnProofVerifier.js's own anchorType
    // exactly — the two classes name the identical external protocol,
    // never a "creation-side" variant of it.
    get anchorType() { return 'bitcoin-op-return'; }
    get network() { return this._network; }

    // Resolves to exactly one of:
    //
    //   { published: true, locator, proof }
    //   { published: false, reason }
    //       — the broadcaster reached a definite no.
    //   { published: false, unavailable: true, reason }
    //       — cannot presently broadcast; retrying later may succeed.
    //
    // Never throws for a broadcaster's own operational failure — only for
    // a malformed contentHash (a caller contract violation, checked before
    // the broadcaster is ever consulted) or a broadcaster that returned a
    // txid this class cannot recognize as one (a broadcaster contract
    // violation, not an operational failure).
    async publish(contentHash) {
        if (typeof contentHash !== 'string' || !HEX_PATTERN.test(contentHash) || contentHash.length % 2 !== 0) {
            throw new Error('BitcoinAnchorPublisher: contentHash must be an even-length hex string to carry as raw OP_RETURN bytes');
        }

        let result;
        try {
            result = await this._broadcaster.broadcast(contentHash, { network: this._network });
        } catch (error) {
            return { published: false, unavailable: true, reason: error.message };
        }

        if (!result || result.broadcast !== true) {
            return {
                published: false,
                unavailable: !!(result && result.unavailable),
                reason: (result && result.reason) || 'broadcaster declined to broadcast this transaction'
            };
        }

        const { txid } = result;
        if (typeof txid !== 'string' || !TXID_PATTERN.test(txid)) {
            throw new Error('BitcoinAnchorPublisher: broadcaster reported success but returned a malformed txid');
        }

        return {
            published: true,
            locator: `bitcoin:${txid}`,
            proof: { txid, network: this._network }
        };
    }
}
