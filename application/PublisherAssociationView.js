import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublisherPublicationAssociationRecordHistory } from './PublisherPublicationAssociationRecordHistoryView.js';

// 0.8.108 — Explicit Publisher Identity Association.
//
// A publisher-identity-scoped reduction over the raw, append-only
// `publisherPublicationAssociationRecords` — mirroring `application/
// AchievementProfileView.js`'s own `describeAchievementProfile()`
// (0.8.107) exactly, one subject over: that file reduces achievement
// events to one PUBLICATION's own slice; this file reduces association
// records to one PUBLISHER's own slice.
//
//   Publisher Publication Association Records (0.8.108), append-only
//         │
//         │  describePublisherPublicationAssociationRecordHistory()   (0.8.108, UNCHANGED)
//         ▼
//   describePublisherAssociatedPublications(publisherIdentity, records)
//     { publisherIdentity, associations, associationCount }
//
// A REDUCTION BY EXPLICIT IDENTITY, NEVER A NEW ASSOCIATION ENGINE. This
// file invents no new relationship, computes nothing `application/
// PublisherPublicationAssociationRecord.js` did not already establish. It
// performs exactly one operation: given an already-computed `records`
// array and one `PublisherIdentityRecord`, keep the records whose own
// `publisherIdentity` `sameAs()` (0.8.108) that identity, in their
// existing order. Every association object surviving that filter is the
// EXACT frozen record-narration object
// `describePublisherPublicationAssociationRecordHistory()` already
// produced — never copied, renamed, or re-scored.
//
// IDENTITY IS `publisherId` VIA `sameAs()` — NEVER A SHARED WALLET, A
// SHARED `contentHash`, OR ANY OTHER RESEMBLANCE. Two publications a
// person happens to control are never evidence they share a publisher,
// absent an explicit `PublisherPublicationAssociationRecord` naming both —
// see that class's own header, and `application/PublisherIdentityRecord.js`'s
// own header on why `sameAs()` compares `publisherId` alone, exactly and
// case-sensitively.
//
// AN EMPTY PROFILE IS A VALID ANSWER, NEVER AN ERROR. A publisher this
// replica has never seen associated with anything still produces
// `{ publisherIdentity, associations: [], associationCount: 0 }` — the
// same restraint `application/AchievementProfileView.js`'s own profile
// already holds for an untouched publication identity.
//
// NO ACHIEVEMENT AGGREGATION, NO SCORE, NO RANK. This file does not read
// `application/AchievementEvent.js`, does not compose any publication's
// own achievement profile, and computes no combined achievement count
// across a publisher's associated publications — that composition is
// explicitly named as later work (0.8.109) in `docs/Roadmap.md`, this
// milestone's own "What's left." `associationCount` here counts
// ASSOCIATIONS, never achievements — a plain `associations.length`, never
// a score, a reputation figure, or a leaderboard input of its own.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublisherAssociatedPublications()`/`describeDistinctPublisherIdentifiers()`
// receive plain, already-durable arrays and project them;
// `reconstructPublisherAssociatedPublications()`/
// `reconstructDistinctPublisherIdentifiers()` below are the ONLY two thin
// functions in this file that read an archive — mirroring `application/
// AchievementProfileView.js`'s own `reconstructAchievementProfile()`
// exactly.

function hasAttributablePublisherIdentity(entry) {
    return Boolean(entry) && entry.publisherIdentity && typeof entry.publisherIdentity.sameAs === 'function';
}

// The pure computation. Receives one `PublisherIdentityRecord` (0.8.108)
// and the already-narrated `records` array
// `describePublisherPublicationAssociationRecordHistory()` itself already
// produces, and returns `{ publisherIdentity, associations, associationCount }`
// — `associations` a frozen array of the EXACT narrated entries whose own
// `publisherIdentity` `sameAs()` `publisherIdentity`, in their existing
// order (oldest first, exactly as the history itself already holds them —
// never re-sorted, since `PublisherPublicationAssociationRecordHistory.js`
// never reorders on append). `sameAs()` (0.8.108) itself already returns
// `false` whenever its argument is not a genuine `PublisherIdentityRecord`
// — so an invalid, absent, or malformed `publisherIdentity` never throws
// here, it simply matches nothing, and the exact value passed is still
// echoed back unchanged on the result.
export function describePublisherAssociatedPublications(publisherIdentity, publisherPublicationAssociationRecords = []) {
    const history = describePublisherPublicationAssociationRecordHistory(publisherPublicationAssociationRecords);
    const associations = history.records.filter((entry) => hasAttributablePublisherIdentity(entry)
        && entry.publisherIdentity.sameAs(publisherIdentity));

    return Object.freeze({
        publisherIdentity,
        associations: Object.freeze(associations),
        associationCount: associations.length
    });
}

// reconstructPublisherAssociatedPublications() — the ONE, thin,
// archive-reading entry point, mirroring `application/AchievementProfileView.js`'s
// own `reconstructAchievementProfile()` exactly. An invalid/missing
// archive is treated as `PublicationObservationArchive.empty()` — zero
// association records, and therefore an empty profile — never an error.
export function reconstructPublisherAssociatedPublications(archive, publisherIdentity) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describePublisherAssociatedPublications(publisherIdentity, safeArchive.publisherPublicationAssociationRecords);
}

// Every DISTINCT `publisherId` this archive's own association records
// name, in first-appearance order — never alphabetized, never "most
// associated first." A convenience for a UI populating a "choose an
// existing publisher" list; never a second, competing identity a caller
// could construct from this string alone (a fresh `PublisherIdentityRecord`
// still has to be minted the same way `application/
// CreatePublisherPublicationAssociationRecordUseCase.js`'s own header
// requires).
export function describeDistinctPublisherIdentifiers(publisherPublicationAssociationRecords = []) {
    const history = describePublisherPublicationAssociationRecordHistory(publisherPublicationAssociationRecords);
    const seen = new Set();
    const identifiers = [];
    history.records.forEach((entry) => {
        if (!hasAttributablePublisherIdentity(entry)) return;
        const publisherId = entry.publisherIdentity.publisherId;
        if (!seen.has(publisherId)) {
            seen.add(publisherId);
            identifiers.push(publisherId);
        }
    });
    return Object.freeze(identifiers);
}

export function reconstructDistinctPublisherIdentifiers(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describeDistinctPublisherIdentifiers(safeArchive.publisherPublicationAssociationRecords);
}
