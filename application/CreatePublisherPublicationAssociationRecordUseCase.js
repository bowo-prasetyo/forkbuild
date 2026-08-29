import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublisherIdentityRecord } from './PublisherIdentityRecord.js';
import { PublisherPublicationAssociationRecord } from './PublisherPublicationAssociationRecord.js';

// 0.8.108 — Explicit Publisher Identity Association.
//
// THE ONE PLACE THIS CODEBASE IS EXPECTED TO CONSTRUCT A
// `PublisherIdentityRecord` AND A `PublisherPublicationAssociationRecord`
// before appending the latter to a `PublicationObservationArchive` —
// mirroring `application/CreatePublicationReferenceRecordUseCase.js`
// (0.8.104) exactly, one relationship over: orchestration only, no new
// domain rule beyond what those two classes' own constructors already
// enforce.
//
//   { publisherId, publicationIdentity, createdAt }
//           │
//           │  new PublisherIdentityRecord({ publisherId })   (validates, freezes)
//           │  new PublisherPublicationAssociationRecord(...)  (validates, freezes)
//           ▼
//   archive.appendPublisherPublicationAssociationRecord(record)  (THIS
//           │                                                     MILESTONE,
//           │                                                     sibling file)
//           ▼
//   a NEW PublicationObservationArchive, never a mutation of the one
//   this call was given
//
// THE ONE LEGITIMATE PLACE A RAW `publisherId` STRING BECOMES A
// `PublisherIdentityRecord`. Unlike `publicationIdentity` — which MUST
// already be a genuine, already-projected `BlockchainPublicationIdentity`
// (0.8.89), reached by calling an already-durable publication record's
// own `toBlockchainPublicationIdentity()`, exactly as `application/
// PublicationReferenceRecord.js`'s own header requires — a publisher
// identity has no prior durable record to project from at all: it is
// whatever label a person explicitly typed. This use case is therefore
// the one seam that turns that raw string into a genuine
// `PublisherIdentityRecord` instance; no other file in this codebase
// constructs one.
//
// EXPLICIT, NEVER INFERRED — THIS MILESTONE'S OWN CENTRAL RULE, HELD HERE
// AT THE ONE CALL BOUNDARY. `execute()` never scans `archive`'s own
// content for a matching wallet, a matching `contentHash`, or a
// previously used `publisherId` to decide a publication "probably"
// belongs to some publisher — it records EXACTLY the one association its
// own caller explicitly names, nothing this class infers on its own. See
// `application/PublisherPublicationAssociationRecord.js`'s own header, and
// `docs/Principles.md`, "Correlate Evidence By Explicit Identity, Never By
// Resemblance (0.8.78)," held here once more.
//
// NO AUTOMATIC CALL SITE — DELIBERATELY UNLIKE `CreateBitcoinAnchorPublicationRecordUseCase`/
// `CreateBaseAnchorPublicationRecordUseCase`. Those use cases are called
// automatically, the moment a broadcast finalizes. This one is never
// called automatically by any finalization, broadcast, or observation flow
// in this codebase — an association exists only when a person explicitly
// types a publisher identifier, chooses one already-durable publication
// identity, and confirms the action (`ui/views/
// DecentralizedPublicationsView.js`'s own "Publisher Associations" card is
// the one place this codebase does), never as a side effect of publishing
// or of achieving anything.
//
// CREATES NO ACHIEVEMENT. Associating a publisher with a publication is a
// relationship fact, never a threshold crossing — this use case touches
// neither `application/AchievementEvent.js` nor
// `application/AchievementBadgeView.js`, and mints no achievement event of
// any kind. See `docs/Roadmap.md`, this milestone's own entry, "The
// Association Itself Should Not Create An Achievement."
//
// THROWS FOR AN INVALID ASSOCIATION, NEVER SILENTLY DEGRADES IT. Every
// validation failure — a missing/empty `publisherId`, a `publicationIdentity`
// that is not a genuine `BlockchainPublicationIdentity` — is
// `PublisherIdentityRecord`'s or `PublisherPublicationAssociationRecord`'s
// own constructor throwing; this class adds no second validation pass and
// catches nothing.
export class CreatePublisherPublicationAssociationRecordUseCase {
    // Returns a NEW `PublicationObservationArchive` holding the newly
    // constructed association record appended to whatever `archive`
    // already held. `archive` is never mutated; a non-archive `archive`
    // (including `undefined`) is treated as `PublicationObservationArchive.empty()`,
    // mirroring every other use case in this codebase's own "malformed
    // input degrades to empty" restraint. `createdAt` defaults to "now"
    // for the identical reason every other `CreateXxxUseCase.js` in this
    // codebase already defaults it: a caller minting a brand-new
    // relationship the moment it calls this method has no earlier, more
    // honest instant to name.
    execute(archive, { publisherId, publicationIdentity, createdAt = new Date() } = {}) {
        const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
        const publisherIdentity = new PublisherIdentityRecord({ publisherId });
        const record = new PublisherPublicationAssociationRecord({ publisherIdentity, publicationIdentity, createdAt });
        return safeArchive.appendPublisherPublicationAssociationRecord(record);
    }
}
