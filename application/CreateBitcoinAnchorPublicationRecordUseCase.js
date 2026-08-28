import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';

// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
//
// THE ONE PLACE THIS CODEBASE IS EXPECTED TO CONSTRUCT A
// `BitcoinAnchorPublicationRecord` before appending it to a
// `PublicationObservationArchive`. Mirrors the shape every other
// `CreateXxxUseCase.js` in this directory already holds — orchestration
// only, no new domain rule beyond what
// application/BitcoinAnchorPublicationRecord.js's own constructor already
// enforces:
//
//   { anchorId, contentHash, txid, network, createdAt }
//           │
//           │  new BitcoinAnchorPublicationRecord(...)   (validates, freezes)
//           ▼
//   archive.appendBitcoinAnchorPublicationRecord(record)  (0.8.80, unchanged)
//           ▼
//   a NEW PublicationObservationArchive, never a mutation of the one
//   this call was given
//
// CALL THIS AT SUCCESSFUL FINALIZATION, NEVER EARLIER. A publication
// record names a concrete `txid` — one only exists once application/
// BitcoinAnchorSignedPsbtFinalizationCoordinator.js (0.8.63) has actually
// produced one. This use case does not itself know, or care, what stage
// produced its inputs — it is the caller's own responsibility never to
// call `execute()` before a real, finalized transaction identity exists —
// but the ordinary, intended call site is exactly that boundary: the
// moment a "Verify & Finalize Transaction" click reaches its own FINALIZED
// outcome, never earlier (not at funding, not at construction, not at
// review, not at signing) and never automatically retried on broadcast
// failure. A publication record's own identity does not depend on the
// network later accepting the broadcast — see docs/Roadmap.md, 0.8.80.
//
// NO LOOKUP, NO INFERENCE, NO DEFAULTS BEYOND `createdAt`. Every field but
// `createdAt` is exactly what the caller passes — this class never derives
// `contentHash` from a publication catalog, never derives `network` from
// a wallet connection, and never derives `anchorId` from `txid` (even
// though, in this codebase's own existing convention, a caller usually
// passes the same string for both — see application/
// BitcoinAnchorPublicationRecord.js's own header on why `anchorId` and
// `txid` stay two, separately named fields regardless). `createdAt`
// defaults to "now" only because a caller minting a brand-new identity
// the moment it calls this method has no earlier, more honest instant to
// name.
//
// THROWS FOR AN INVALID IDENTITY, NEVER SILENTLY DEGRADES IT. Every
// validation failure is `BitcoinAnchorPublicationRecord`'s own
// constructor throwing — this class adds no second validation pass and
// catches nothing. A missing `contentHash`, `txid`, or `network` is a
// caller-contract violation (the caller reached this method without a
// genuinely finalized transaction in hand), not an operational outcome to
// report gracefully.
export class CreateBitcoinAnchorPublicationRecordUseCase {
    // Returns a NEW `PublicationObservationArchive` holding the newly
    // constructed record appended to whatever `archive` already held.
    // `archive` is never mutated; a non-archive `archive` (including
    // `undefined`) is treated as `PublicationObservationArchive.empty()`,
    // mirroring every other reader in this milestone's own "malformed
    // input degrades to empty" restraint.
    execute(archive, { anchorId, contentHash, txid, network, createdAt = new Date() } = {}) {
        const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
        const record = new BitcoinAnchorPublicationRecord({ anchorId, contentHash, txid, network, createdAt });
        return safeArchive.appendBitcoinAnchorPublicationRecord(record);
    }
}
