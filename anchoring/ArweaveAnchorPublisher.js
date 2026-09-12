const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 15000;

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// 0.9.424's own audit named PROOF_AND_ANCHORING's Arweave gap a pure
// PROVIDER_GAP: application/ExternalAnchorPublisherRegistry.js already
// accepts an "arweave" key with zero registry change (see that audit's
// own Section C). This class is the missing publisher — the CREATION-
// side counterpart of anchoring/ArweaveTransactionDataProofVerifier.js,
// exactly the split anchoring/BitcoinAnchorPublisher.js (creation) and
// anchoring/BitcoinOpReturnProofVerifier.js (verification) already hold
// for Bitcoin:
//
//   contentHash
//       │
//       ▼
//   ArweaveAnchorPublisher.publish()     (THIS FILE)
//       │
//       ├──► injected signer.sign(contentHash)   — the SAME
//       │        `signer.sign(material) -> Promise<{ id, transaction }>`
//       │        contract application/ArweavePublicationMaterialUploader.js
//       │        (0.9.45) already established, reused unchanged
//       │
//       ▼
//   POST <gatewayUrl>/tx   { body: JSON.stringify(transaction) }
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
// THE ANCHORED TRANSACTION'S OWN DATA IS THE CONTENTHASH, NEVER THE
// PUBLICATION'S MATERIAL. Exactly as anchoring/BitcoinAnchorPublisher.js
// asks its broadcaster to carry the raw contentHash hex as an OP_RETURN
// payload — never the publication's own bytes — this class hands
// `signer.sign()` the contentHash ITSELF as `material`. The resulting
// Arweave transaction is a small, independent commitment to a hash, never
// a second copy of a Publication's content: a publication anchored this
// way produces a transaction distinct from (and, in the ordinary case,
// unrelated to) whatever transaction application/
// ArweavePublicationMaterialUploader.js may separately have produced for
// that same publication's own CONTENT role. See docs/Principles.md,
// "External Anchoring Provides Evidence; It Does Not Establish Authority
// (0.8.0)" — this class anchors a HASH, never a document.
//
// SAME WIRE CONTRACT AS THE VERIFIER, NO NEW ENCODING. The `proof` this
// class returns is exactly anchoring/ArweaveTransactionDataProofVerifier.js's
// own expected shape — `{ txid }` — and the payload POSTed is the raw
// contentHash string, nothing else: no publicationId, no application-
// chosen envelope. A transaction this class helped create is therefore,
// by construction, one that verifier already knows how to check.
//
// NO WALLET MANAGEMENT — THE SAME RESTRAINT anchoring/
// BitcoinAnchorPublisher.js's OWN 0.8.9 HEADER ALREADY HOLDS FOR BITCOIN,
// HELD HERE FOR ARWEAVE. This class never generates keys, never signs a
// transaction, and never knows what an Arweave transaction's own JSON
// shape looks like — it treats `signer.sign(contentHash)`'s own
// `transaction` field as completely opaque, POSTing it unread. Delegating
// "construct, sign" entirely to an injected `signer` is what lets this
// class run fully deterministically in tests with zero real key material.
//
// A SIGNER OR GATEWAY FAILURE REPORTS `unavailable`, NEVER A THROW — THE
// SAME DISCIPLINE anchoring/BitcoinAnchorPublisher.js ALREADY HOLDS FOR A
// THROWING BROADCASTER. `signer.sign()` rejecting (no wallet available, a
// locked keystore, an operator declining to sign) and a genuine gateway
// transport failure are both "cannot PRESENTLY tell," reported as
// `{ published: false, unavailable: true, reason }` — never treated as a
// definite rejection, and never left to propagate as an uncaught
// rejection the way application/ArweavePublicationMaterialUploader.js
// (a RETRIEVAL/UPLOAD-side class, not a creation-side one) deliberately
// lets a signer failure propagate. This class is creation-side, and
// application/CreateExternalPublicationAnchorUseCase.js's own pipeline
// already expects a publisher to report failure this way, never to throw.
//
// A SIGNER THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT THROWS. If
// `signer.sign()` resolves successfully but hands back a missing/
// malformed `id` or no `transaction` at all, this class throws rather
// than reporting `unavailable` — the same "resolved with success but
// broke its own contract" distinction anchoring/BitcoinAnchorPublisher.js
// (a `txid` failing its own pattern) already draws for its own injected
// dependency. A malformed signer is a bug in how this class was wired,
// never a fact about Arweave.
//
// NO MANUFACTURED anchoredAt, NO CONFIRMATION TRACKING. A successful
// `publish()` result never includes an `anchoredAt` — CreatePublicationAnchorUseCase's
// own honest "now" default applies unchanged. `published: true` means
// only "the gateway accepted this transaction for broadcast" — it says
// nothing about the transaction later confirming; see anchoring/
// ArweaveTransactionDataProofVerifier.js's own header for the separate,
// later question of whether it actually did.
export class ArweaveAnchorPublisher {
    // signer: see this file's own header, "No wallet management" — the
    //   sole injection point responsible for turning a contentHash into a
    //   signed transaction and its own deterministic id.
    // gatewayUrl: which Arweave gateway accepts a transaction POST at
    //   `<gatewayUrl>/tx` — defaults to Arweave's own `arweave.net`, the
    //   same default host application/ArweavePublicationMaterialUploader.js
    //   already targets.
    // fetchImpl: an injection point, not a convenience — the same
    //   pattern every real-network adapter in this codebase already runs
    //   through, so every deterministic test supplies a fake one.
    constructor({ signer, gatewayUrl = DEFAULT_GATEWAY_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        if (!signer || typeof signer.sign !== 'function') {
            throw new Error('ArweaveAnchorPublisher: a signer with a sign() method is required');
        }
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweaveAnchorPublisher: a non-empty gatewayUrl is required');
        }
        this._signer = signer;
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveAnchorPublisher: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    // Matches anchoring/ArweaveTransactionDataProofVerifier.js's own
    // anchorType exactly — the two classes name the identical external
    // protocol, never a "creation-side" variant of it.
    get anchorType() { return 'arweave'; }
    get gatewayUrl() { return this._gatewayUrl; }

    // Resolves to exactly one of:
    //
    //   { published: true, locator, proof }
    //   { published: false, unavailable: true, reason }
    //       — cannot presently publish; retrying later may succeed.
    //
    // Never throws for a signer's or gateway's own operational failure —
    // only for a malformed contentHash (a caller contract violation) or a
    // signer that returned a result this class cannot recognize as valid
    // (a signer contract violation, not an operational failure).
    async publish(contentHash) {
        if (typeof contentHash !== 'string' || contentHash.length === 0) {
            throw new Error('ArweaveAnchorPublisher: contentHash must be a non-empty string');
        }

        let signed;
        try {
            signed = await this._signer.sign(contentHash);
        } catch (error) {
            return { published: false, unavailable: true, reason: error.message };
        }

        const id = signed && signed.id;
        if (typeof id !== 'string' || !TRANSACTION_ID_PATTERN.test(id)) {
            throw new Error('ArweaveAnchorPublisher: signer resolved with no valid transaction id');
        }
        if (!signed || signed.transaction === undefined) {
            throw new Error('ArweaveAnchorPublisher: signer resolved with no transaction to publish');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}/tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(signed.transaction),
                signal: controller.signal
            });
        } catch (error) {
            return { published: false, unavailable: true, reason: error.message };
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return {
                published: false,
                unavailable: true,
                reason: `gateway ${this._gatewayUrl} declined this transaction (status ${response.status})`
            };
        }

        return {
            published: true,
            locator: `ar://${id}`,
            proof: { txid: id }
        };
    }
}

ArweaveAnchorPublisher.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
