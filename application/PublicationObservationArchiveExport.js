import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';

// 0.8.82 — Durable Publication Archive Export & Import.
//
// application/PublicationObservationArchive.js (0.8.75, extended through
// 0.8.80) already holds every durable fact this milestone exists to move —
// its own `toJSON()`/`fromJSON()` already serialize and reconstruct the
// complete, six-collection archive deterministically. storage/
// LocalStoragePublicationObservationArchive.js (0.8.75) already bridges
// that pure model to a browser's own localStorage. THIS FILE IS NOT A
// THIRD SUCH ADAPTER — it invents no new persistence mechanism, and
// carries no `StorageProvider` of any kind. It is the thin boundary
// between that already-existing archive shape and a person's own
// filesystem: a plain, JSON-safe payload a caller can write to a file, and
// a validated read of one back.
//
//   PublicationObservationArchive
//        │  toJSON()                              (0.8.75, unchanged)
//        ▼
//   exportPublicationObservationArchive()          (THIS FILE)
//        │
//        ▼
//   a file, a clipboard, anything outside this process's own memory
//        │
//        ▼
//   importPublicationObservationArchive()          (THIS FILE)
//        │  fromJSON()                             (0.8.75, unchanged)
//        ▼
//   PublicationObservationArchive
//
// THE EXPORTED PAYLOAD IS EXACTLY `archive.toJSON()` — NO ENVELOPE, NO
// SECOND SCHEMA VERSION, NO `exportedAt`. Wrapping the archive's own
// serialization in a competing envelope would mean this file, not
// application/PublicationObservationArchive.js, decides what "the
// archive's own shape" means — exactly the second source of truth this
// milestone's own proposal warns against. Because `toJSON()` is already
// deterministic (identical facts, identical field order, identical
// output — see that method's own header), two identical archives export
// to byte-identical JSON. In particular, NO TIMESTAMP IS EVER INSERTED
// FOR THE ACT OF EXPORTING ITSELF: `exportedAt`, or anything like it,
// would make exporting a durable fact's copy into a new observation of
// its own — precisely what docs/Principles.md, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict (0.8.57)," and every
// later restatement of it, already forbid one layer over.
//
// IMPORT NEVER MERGES. `importPublicationObservationArchive()` returns a
// freshly reconstructed archive — not `currentArchive.appendXxx(...)`
// applied for every entry the payload holds. A caller that wants the
// imported archive to become the active one performs that assignment
// itself, explicitly, exactly once — see ui/views/
// DecentralizedPublicationsView.js's own `confirmPublicationArchiveImport()`
// for the one place this codebase does. Merging two archives — which
// observation came first, whether a duplicate is intentional, which
// archive owns a shared `anchorId` — is a genuinely different, harder
// question this milestone deliberately leaves unbuilt; see docs/
// Roadmap.md, 0.8.82, "Deliberately excluded."
//
// MALFORMED INPUT IS `INVALID_ARCHIVE`, NEVER A SILENT EMPTY ARCHIVE.
// `PublicationObservationArchive.fromJSON()` itself treats "wrong
// schemaVersion" and "genuinely empty archive" identically, by design —
// the right call for a browser silently corrupting localStorage (see
// storage/LocalStoragePublicationObservationArchive.js's own header), but
// the wrong one for a person explicitly choosing a file and clicking
// "Import": silently replacing a real archive with an empty one because
// the chosen file was not actually an export would be dangerous, not
// graceful. `PublicationObservationArchive.isValidJSON()` (0.8.82) is the
// seam this file uses to tell the two apart before ever calling
// `fromJSON()` — see that method's own header.
// 0.8.83 — Publication Archive Provenance & Imported-Fact Boundary.
//
// `importPublicationObservationArchive()` gained exactly one new behavior:
// the archive it returns has EVERY fact's provenance stamped `IMPORTED`,
// via application/PublicationObservationArchive.js's own
// `withUniformProvenance()` — regardless of what provenance the exported
// JSON itself claimed (an archive that already held a mix of `LOCAL` and
// `IMPORTED` facts, re-exported, and imported again becomes uniformly
// `IMPORTED` here too). Provenance describes how a fact entered THIS
// archive, not the fact's own history one replica removed — see
// application/PublicationObservationArchiveProvenance.js's own header.
//
// STILL A PURE, DETERMINISTIC FUNCTION OF THE VALUE IT IS GIVEN.
// `withUniformProvenance()` reads no clock and touches no fact's own
// timestamp — calling `importPublicationObservationArchive()` twice on
// byte-identical input still produces byte-identical output, exactly as
// this function's own pre-0.8.83 header already promised. The ONE new
// durable fact this milestone adds — `archiveImportEvents`, recording
// WHEN this replica performed the import — is deliberately NOT appended
// here. See `recordPublicationObservationArchiveImport()` below for why
// that is kept a separate, explicit step.
export const PublicationObservationArchiveImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_ARCHIVE: 'invalid-archive'
});

// `archive` must be a real `PublicationObservationArchive` instance —
// this function performs no duck-typing, mirroring storage/
// LocalStoragePublicationObservationArchive.js's own `save()` contract
// exactly. Returns `archive.toJSON()`'s own output, unchanged — a plain,
// JSON-safe object a caller may `JSON.stringify()` for a file, a
// clipboard, or anywhere else outside this process's own memory. Never
// throws for a well-formed archive; never mutates it.
export function exportPublicationObservationArchive(archive) {
    if (!(archive instanceof PublicationObservationArchive)) {
        throw new Error('exportPublicationObservationArchive() requires a PublicationObservationArchive');
    }
    return archive.toJSON();
}

// `payload` may be either the parsed JSON value itself, or the raw text
// of a file/clipboard paste a caller has not yet parsed — a string that
// fails to parse as JSON is `INVALID_ARCHIVE`, exactly like a string that
// parses but fails `PublicationObservationArchive`'s own structural
// contract. Returns a frozen `{ outcome, archive }`:
//
//   IMPORTED        — `archive` is a genuine, freshly reconstructed
//                      `PublicationObservationArchive` instance.
//   INVALID_ARCHIVE — `archive` is `null`. The payload was not valid
//                      JSON, or did not satisfy `PublicationObservationArchive`'s
//                      own strict `fromJSON()` contract (wrong/missing
//                      `schemaVersion`, a missing collection, an
//                      unexpected field, a timestamp that does not
//                      parse) — see application/
//                      PublicationObservationArchive.js's own
//                      `validateArchiveJSON()` for the exact contract
//                      enforced here, unchanged.
//
// Never throws. Never touches any storage, network, wallet, or
// credential of any kind — a pure, synchronous function over the value
// it is given.
export function importPublicationObservationArchive(payload) {
    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    if (!PublicationObservationArchive.isValidJSON(json)) {
        return Object.freeze({ outcome: PublicationObservationArchiveImportOutcome.INVALID_ARCHIVE, archive: null });
    }
    const archive = PublicationObservationArchive.fromJSON(json).withUniformProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    return Object.freeze({ outcome: PublicationObservationArchiveImportOutcome.IMPORTED, archive });
}

function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

// 0.8.83 — the ONE durable fact describing THE ACT OF IMPORTING itself,
// kept deliberately separate from `importPublicationObservationArchive()`
// above so that function can stay a pure, clock-free transformation of
// its own input. A caller calls this exactly once, at the moment a person
// actually confirms the replacement — `ui/views/
// DecentralizedPublicationsView.js`'s own `confirmPublicationArchiveImport()`
// is the one place this codebase does — never at preview time, when a
// person may still change their mind or never click "Replace Current
// Archive" at all.
//
// `importedAt` defaults to "now" for the identical reason application/
// CreateBitcoinAnchorPublicationRecordUseCase.js's own `createdAt`
// default does: a caller minting this fact the moment it calls this
// function has no earlier, more honest instant to name. `importedArchiveSchemaVersion`
// and `importedEntryCount` are never accepted as arguments — they are
// read directly off `archive` itself (`PublicationObservationArchive.SCHEMA_VERSION`
// and the sum of its own `publicationCount`/`observationCount`/
// `bitcoinAnchorPublicationRecordCount`/`baseAnchorPublicationRecordCount`
// (0.8.99)/`publicationReferenceRecordCount` (0.8.104)/
// `publisherPublicationAssociationRecordCount` (0.8.108)/
// `leaderboardClaimRecordCount` (0.8.130)), so a caller cannot accidentally
// pass a stale or fabricated count.
//
// NEVER A VERIFICATION. This function does not check, re-validate, or
// pass judgment on anything `archive` holds — it only records that an
// import happened, and when. `archive` must be a real
// `PublicationObservationArchive` instance; a non-archive input is
// returned unchanged, mirroring `exportPublicationObservationArchive()`'s
// own instance-required contract one door down (that function throws;
// this one degrades, because a caller here already holds whatever
// `importPublicationObservationArchive()` itself just returned, never a
// caller-supplied value to validate).
export function recordPublicationObservationArchiveImport(archive, { importedAt = new Date() } = {}) {
    if (!(archive instanceof PublicationObservationArchive)) return archive;
    return archive.appendArchiveImportEvent({
        importedAt,
        importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION,
        importedEntryCount: archive.publicationCount + archive.observationCount + archive.bitcoinAnchorPublicationRecordCount
            + archive.baseAnchorPublicationRecordCount + archive.publicationReferenceRecordCount
            + archive.publisherPublicationAssociationRecordCount + archive.leaderboardClaimRecordCount
    });
}
