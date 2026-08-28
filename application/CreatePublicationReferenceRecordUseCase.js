import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';

// 0.8.104 — Explicit Publication Reference Relationship.
//
// THE ONE PLACE THIS CODEBASE IS EXPECTED TO CONSTRUCT A
// `PublicationReferenceRecord` before appending it to a
// `PublicationObservationArchive` — mirroring application/
// CreateBaseAnchorPublicationRecordUseCase.js (0.8.99) exactly, one
// relationship over: orchestration only, no new domain rule beyond what
// application/PublicationReferenceRecord.js's own constructor already
// enforces:
//
//   { sourcePublicationIdentity, referencedPublicationIdentity, createdAt }
//           │
//           │  new PublicationReferenceRecord(...)   (validates, freezes)
//           ▼
//   archive.appendPublicationReferenceRecord(record)  (THIS MILESTONE,
//           │                                           sibling file)
//           ▼
//   a NEW PublicationObservationArchive, never a mutation of the one
//   this call was given
//
// BOTH IDENTITIES MUST ALREADY BE GENUINE `BlockchainPublicationIdentity`
// INSTANCES — THIS CLASS ASSEMBLES NEITHER FROM RAW PARTS. Exactly as
// application/BlockchainPublicationIdentity.js's own header requires ("A
// Projection Target, Never A Replacement"), a caller reaches
// `sourcePublicationIdentity`/`referencedPublicationIdentity` by calling
// an ALREADY-DURABLE publication record's own `toBlockchainPublicationIdentity()`
// — `application/BitcoinAnchorPublicationRecord.js`'s or `application/
// BaseAnchorPublicationRecord.js`'s, both 0.8.89/0.8.99, unchanged — never
// by handing this use case a bare `{ blockchain, contentHash, chainReference }`
// object assembled from a form field. This use case performs no such
// assembly itself, and validates nothing beyond what `PublicationReferenceRecord`'s
// own constructor already validates — a caller passing anything else gets
// exactly that constructor's own thrown error, unchanged.
//
// EXPLICIT, NEVER INFERRED — THIS MILESTONE'S OWN CENTRAL RULE, HELD HERE
// AT THE ONE CALL BOUNDARY. `execute()` never scans `archive`'s own
// content for matching hashes, similar snapshots, or shared timestamps to
// decide two publications are "probably" related — it records EXACTLY the
// one relationship its own caller explicitly names, nothing this class
// infers on its own. See application/PublicationReferenceRecord.js's own
// header, and docs/Principles.md, "Correlate Evidence By Explicit Identity,
// Never By Resemblance (0.8.78)," held here once more, one layer over a
// relationship between two publications rather than evidence for one.
//
// NO AUTOMATIC CALL SITE — DELIBERATELY UNLIKE `CreateBaseAnchorPublicationRecordUseCase.js`.
// That use case is called automatically, once, the moment a broadcast
// finalizes. This one is never called automatically by any finalization,
// broadcast, or observation flow in this codebase — a reference exists
// only when a person explicitly records one (`ui/views/
// DecentralizedPublicationsView.js`'s own "Publication References" card is
// the one place this codebase does), never as a side effect of publishing.
//
// THROWS FOR AN INVALID REFERENCE, NEVER SILENTLY DEGRADES IT. Every
// validation failure — a missing identity, both sides naming the same
// publication — is `PublicationReferenceRecord`'s own constructor
// throwing; this class adds no second validation pass and catches
// nothing.
export class CreatePublicationReferenceRecordUseCase {
    // Returns a NEW `PublicationObservationArchive` holding the newly
    // constructed reference record appended to whatever `archive` already
    // held. `archive` is never mutated; a non-archive `archive` (including
    // `undefined`) is treated as `PublicationObservationArchive.empty()`,
    // mirroring every other use case in this milestone's own "malformed
    // input degrades to empty" restraint. `createdAt` defaults to "now"
    // for the identical reason every other `CreateXxxUseCase.js` in this
    // codebase already defaults it: a caller minting a brand-new
    // relationship the moment it calls this method has no earlier, more
    // honest instant to name.
    execute(archive, { sourcePublicationIdentity, referencedPublicationIdentity, createdAt = new Date() } = {}) {
        const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
        const record = new PublicationReferenceRecord({ sourcePublicationIdentity, referencedPublicationIdentity, createdAt });
        return safeArchive.appendPublicationReferenceRecord(record);
    }
}
