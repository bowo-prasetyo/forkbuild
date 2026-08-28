import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';

// 0.8.99 — Durable Base Publication Identity Record.
//
// THE ONE PLACE THIS CODEBASE IS EXPECTED TO CONSTRUCT A
// `BaseAnchorPublicationRecord` before appending it to a
// `PublicationObservationArchive` — mirroring application/
// CreateBitcoinAnchorPublicationRecordUseCase.js (0.8.80) exactly, one
// chain over: orchestration only, no new domain rule beyond what
// application/BaseAnchorPublicationRecord.js's own constructor already
// enforces:
//
//   { contentHash, txid, network, createdAt }
//           │
//           │  new BaseAnchorPublicationRecord(...)   (validates, freezes)
//           ▼
//   archive.appendBaseAnchorPublicationRecord(record)  (THIS MILESTONE,
//           │                                            sibling file)
//           ▼
//   a NEW PublicationObservationArchive, never a mutation of the one
//   this call was given
//
// CALL THIS AT SUCCESSFUL FINALIZATION, NEVER EARLIER — the identical
// boundary application/CreateBitcoinAnchorPublicationRecordUseCase.js's
// own header already draws. A Base publication record names a concrete
// `txid` — one only exists once `base/BaseSignedTransactionFinalizer.js`
// (0.8.94) has actually produced a `finalizedTransaction.transactionHash`.
// This use case does not itself know, or care, what stage produced its
// inputs — it is the caller's own responsibility never to call `execute()`
// before a real, finalized transaction identity exists — but the ordinary,
// intended call site is exactly that boundary: the moment a "Verify &
// Finalize Transaction" click reaches its own FINALIZED outcome, never
// earlier (not at construction, not at review, not at signing) and never
// automatically retried on a later broadcast attempt. A publication
// record's own identity does not depend on the network later accepting
// the broadcast — see application/BaseAnchorPublicationRecord.js's own
// header.
//
// THE TRANSACTION IDENTITY COMES FROM THE FINALIZED ARTIFACT, NEVER FROM
// THE BROADCASTER OR AN RPC LOOKUP. `base/BaseSignedTransactionFinalizer.js`
// (0.8.94, unchanged) already computes `transactionHash` deterministically
// from the signed bytes themselves — no network call, before broadcast
// ever happens. A caller passes that value as this use case's own `txid`
// argument directly; this class performs no RPC call, imports no
// `base/BaseJsonRpcClient.js`, and never "discovers" a transaction's
// identity from the network. The dependency stays exactly
// `finalizedTransaction -> publication identity`, never the reverse.
//
// NO LOOKUP, NO INFERENCE, NO DEFAULTS BEYOND `createdAt`. Every field but
// `createdAt` is exactly what the caller passes — this class never derives
// `contentHash` from a publication catalog and never derives `network`
// from a wallet connection. `createdAt` defaults to "now" only because a
// caller minting a brand-new identity the moment it calls this method has
// no earlier, more honest instant to name.
//
// THROWS FOR AN INVALID IDENTITY, NEVER SILENTLY DEGRADES IT. Every
// validation failure is `BaseAnchorPublicationRecord`'s own constructor
// throwing — this class adds no second validation pass and catches
// nothing. A missing `contentHash`, `txid`, or `network` is a
// caller-contract violation (the caller reached this method without a
// genuinely finalized transaction in hand), not an operational outcome to
// report gracefully.
export class CreateBaseAnchorPublicationRecordUseCase {
    // Returns a NEW `PublicationObservationArchive` holding the newly
    // constructed record appended to whatever `archive` already held.
    // `archive` is never mutated; a non-archive `archive` (including
    // `undefined`) is treated as `PublicationObservationArchive.empty()`,
    // mirroring every other reader in this milestone's own "malformed
    // input degrades to empty" restraint.
    execute(archive, { contentHash, txid, network, createdAt = new Date() } = {}) {
        const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
        const record = new BaseAnchorPublicationRecord({ contentHash, txid, network, createdAt });
        return safeArchive.appendBaseAnchorPublicationRecord(record);
    }
}
