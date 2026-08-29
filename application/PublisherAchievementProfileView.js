import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublisherAssociatedPublications } from './PublisherAssociationView.js';
import { reconstructAchievementEvents } from './AchievementEvent.js';

// 0.8.109 — Publisher Achievement Profile Projection.
//
// 0.8.107 answered "what has this ONE PUBLICATION earned?" 0.8.108 answered
// "which publications does this PUBLISHER explicitly claim?" Neither one
// could yet answer the question a person actually asks while looking at a
// publisher's own page: "what, across every publication this publisher
// explicitly claims, does this publisher have to show for itself?" This
// file is that projection, and nothing more — the missing composition
// `application/PublisherAssociationView.js`'s own header already named as
// this milestone's exact scope:
//
//   PublisherPublicationAssociationRecord (0.8.108), append-only
//         │
//         │  describePublisherAssociatedPublications()   (0.8.108, UNCHANGED)
//         ▼
//   { publisherIdentity, associations, associationCount }
//         │
//         │  distinct publicationIdentity values, deduplicated by sameAs()
//         ▼
//   AchievementEvent (0.8.102/0.8.106), scoped to those publications
//         │
//         │  describePublisherAchievementProfile()   (THIS MILESTONE)
//         ▼
//   Publisher Achievement Profile
//     { publisherIdentity, publicationIdentities, publicationIdentityCount,
//       achievements, achievementCount,
//       achievementKinds, distinctAchievementKindCount }
//
// A REDUCTION BY EXPLICIT ASSOCIATION, NEVER A NEW ACHIEVEMENT ENGINE, AND
// NEVER A NEW ASSOCIATION ENGINE. This file invents no new `AchievementKind`,
// no new threshold, no new relationship, and computes nothing `application/
// AchievementEvent.js` or `application/PublisherAssociationView.js` did not
// already compute. It performs exactly two lookups, composed: which
// publications does this publisher explicitly claim (0.8.108, unchanged),
// and which already-computed achievement events (0.8.102/0.8.106,
// unchanged) belong to one of those publications. Every achievement object
// surviving that filter is the EXACT frozen event instance those files
// already produced — never copied, renamed, or re-scored — mirroring
// `application/AchievementProfileView.js`'s own restraint (0.8.107) one
// subject further: a publication's profile reduces the achievement
// vocabulary to one publication's own slice; a publisher's profile reduces
// it again, to the union of every publication that publisher has
// EXPLICITLY, DURABLY claimed.
//
// A PUBLISHER PROFILE AGGREGATES ACHIEVEMENTS ATTRIBUTED TO EXPLICITLY
// ASSOCIATED PUBLICATION IDENTITIES; IT NEVER INFERS THAT A PERSON OWNS,
// CONTROLS, OR DESERVES THOSE IDENTITIES. Every publication counted here
// reached this profile through a real, durable `PublisherPublicationAssociationRecord`
// (0.8.108) — never through a shared `contentHash`, a shared wallet
// address, a shared name, temporal proximity, or any other resemblance.
// This extends `docs/Principles.md`, "Correlate Evidence By Explicit
// Identity, Never By Resemblance (0.8.78)," one further layer: over a
// publisher's own achievement aggregate, exactly as 0.8.108 already
// extended it over the association itself. See this file's own flagship
// test for the concrete proof: two publishers, three publications sharing
// one `contentHash` across two chains, each publisher's own achievement
// profile naming only the achievements its own explicitly claimed
// publications actually earned.
//
// COMPOSES TWO EXISTING PROJECTIONS — NO PARALLEL ASSOCIATION LOOKUP, NO
// PARALLEL ACHIEVEMENT ENGINE. `describePublisherAchievementProfile()`
// below calls `application/PublisherAssociationView.js`'s own
// `describePublisherAssociatedPublications()` (0.8.108, UNCHANGED) to learn
// which publications this publisher claims, and receives the achievement
// events it filters as a plain, already-computed `achievementEvents` array
// — the identical `events` `application/AchievementEvent.js`'s own
// `describeAchievementEvents()`/`reconstructAchievementEvents()` (0.8.102/
// 0.8.106, UNCHANGED) already produces. It never reads
// `publisherPublicationAssociationRecords` or achievement-generating
// records off the archive by hand, and never re-derives a threshold
// crossing, an association match, or a `sameAs()` comparison any of those
// files did not already perform — the identical discipline `application/
// AchievementProfileView.js`'s own `reconstructAchievementProfile()`
// already holds for a single publication, extended here one subject up:
//
//   Archive
//     │
//     │  describePublisherAssociatedPublications()   (0.8.108, UNCHANGED)
//     │  reconstructAchievementEvents()               (0.8.102/0.8.106, UNCHANGED)
//     ▼
//   Publisher's own distinct publications  +  this replica's own achievement events
//     │
//     │  describePublisherAchievementProfile()        (THIS MILESTONE)
//     ▼
//   Publisher Achievement Profile
//
// DUPLICATE ASSOCIATIONS NEVER DUPLICATE ACHIEVEMENTS — ASSOCIATION
// MULTIPLICITY IS HISTORICAL FACT; ACHIEVEMENT MULTIPLICITY COMES FROM
// ACHIEVEMENT EVENTS ALONE. `application/PublisherPublicationAssociationRecord.js`'s
// own header deliberately allows a publisher to be associated with the same
// publication twice (or more) — a genuine, honestly recorded historical
// fact, never deduplicated at that layer. This file reduces those
// associations to their DISTINCT publication identities first (compared by
// `BlockchainPublicationIdentity#sameAs()`, 0.8.89, via the identical
// shorthand key `application/AchievementEvent.js`'s own `referenceIdentityKey()`
// already establishes as provably equivalent) — never a raw association
// count — and only then asks "which achievement events belong to ANY of
// these distinct publications." An achievement event that belongs to a
// publication this publisher claims twice is filtered in ONCE, because the
// filter tests SET MEMBERSHIP, never a join that could multiply once per
// matching association. See this file's own flagship test for the concrete
// proof: associating the identical publisher with the identical publication
// a second time changes `publicationIdentityCount` not at all and
// `achievementCount` not at all.
//
// PUBLICATIONIDENTITIES ARE THE EXACT INSTANCES THE ASSOCIATION RECORDS
// ALREADY CARRY, IN FIRST-ASSOCIATION ORDER — NEVER SORTED, NEVER
// RECONSTRUCTED FROM AN ACHIEVEMENT EVENT'S OWN COPY. The order mirrors
// `application/PublisherAssociationView.js`'s own `describeDistinctPublisherIdentifiers()`
// (0.8.108): the first time this publisher's own associations name a given
// publication, that publication's own identity object is kept; every later
// association naming the SAME publication (by `sameAs()`) contributes
// nothing further to this list.
//
// EVERY ACHIEVEMENT SURVIVING THE FILTER IS PRESERVED VERBATIM, IN ONE
// FIXED, REPRODUCIBLE CHRONOLOGICAL ORDER — THE IDENTICAL TWO-STEP ORDERING
// `application/AchievementProfileView.js`'s OWN `describeAchievementProfile()`
// ALREADY PERFORMS. Every achievement is first placed into one fixed,
// reproducible source order (its own existing array position in
// `achievementEvents`), and only THAT fixed-order sequence is stably sorted
// by `observedAt`, ties broken by that same fixed source order. Calling
// `describePublisherAchievementProfile()` twice on byte-identical input
// always returns a byte-identical result — including when the order of
// `publisherPublicationAssociationRecords`, or of the publisher's own
// associations within it, is shuffled: the SET of distinct publications a
// publisher claims does not depend on the order those associations were
// recorded in, only on which associations exist.
//
// AN ACHIEVEMENT EVENT COUNT AND A DISTINCT ACHIEVEMENT-KIND COUNT ARE TWO
// DIFFERENT FACTS, NEITHER ONE SILENTLY COLLAPSED INTO THE OTHER — THE ONE
// DISTINCTION THIS MILESTONE'S OWN ENTRY IN `docs/Roadmap.md` NAMES
// EXPLICITLY. A publisher who explicitly claims two publications, each of
// which independently earned its own `FIRST_REFERENCE_CREATED` (a kind
// scoped to ONE publication identity, and therefore capable of firing once
// PER publication — see `application/AchievementEvent.js`'s own 0.8.106
// header), has genuinely earned TWO achievement events of the identical
// kind — never one, and never silently deduplicated by kind. `achievements`/
// `achievementCount` name that first fact: every surviving achievement
// EVENT, verbatim, however many publications independently earned the same
// kind. `achievementKinds`/`distinctAchievementKindCount` name the second,
// genuinely different fact: how many DISTINCT entries of the closed
// `AchievementKind` vocabulary (`application/AchievementEvent.js`) this
// publisher's own achievements collectively touch, each counted once no
// matter how many of its own publications, or how many times, earned it.
// Neither field is derivable from the other without re-reading
// `achievements` — a caller who wants "how many achievements has this
// publisher earned, total" reads `achievementCount`; a caller who wants
// "how many different KINDS of achievement has this publisher's work
// earned" reads `distinctAchievementKindCount`. This file computes both,
// side by side, and never merges them into one number.
//
// NO ACHIEVEMENT IS EVER COUNTED FOR A PUBLISHER MERELY BECAUSE ITS OWN
// PUBLICATION APPEARS IN THE SAME ARCHIVE — ONLY AN EXPLICIT ASSOCIATION
// EVER ADMITS IT. A publisher with zero recorded associations — or whose
// every recorded association names a publication this replica's achievement
// events never mention — produces a valid, empty profile:
// `{ publisherIdentity, publicationIdentities: [], publicationIdentityCount: 0,
//    achievements: [], achievementCount: 0, achievementKinds: [],
//    distinctAchievementKindCount: 0 }` — never an error, never `null`, and
// never a profile inflated by publications this publisher never explicitly
// claimed.
//
// NODE IDENTITY IS `blockchain` + `chainReference` VIA `sameAs()` — NEVER
// `contentHash`, THE SAME RULE 0.8.89/0.8.104/0.8.105/0.8.106/0.8.107/0.8.108
// ALREADY HOLD, HELD HERE ONCE MORE, ONE LAYER OVER A PUBLISHER'S OWN
// AGGREGATE. Two publications sharing an identical `contentHash` — on the
// same chain, or across two different ones — remain two entirely separate
// publications for every purpose this file serves: a publisher who claims
// only one of them never has the other's achievements folded into their own
// profile merely because the content looks identical.
//
// NO NEW DURABLE STATE, NO SCHEMA_VERSION BUMP. `application/
// PublicationObservationArchive.js` gains nothing from this milestone — no
// eleventh collection, no cached profile, no mutable "publisher profile"
// record, no network call. A publisher achievement profile is computed
// fresh, every time, from this replica's own already-durable association
// records and already-computable achievement events.
//
// NO SCORE, NO RANK, NO LEVEL, NO TRUST, NO LEADERBOARD INPUT OF ANY KIND —
// THE SAME RESTRAINT HELD AT EVERY LAYER BELOW, HELD HERE ONCE MORE OVER A
// PUBLISHER'S OWN AGGREGATE. `achievementCount`, `publicationIdentityCount`,
// and `distinctAchievementKindCount` are plain counts — never a score, a
// reputation figure, a weighted total, or a leaderboard input of their own.
// This file carries no `points`, `score`, `rank`, `level`, `tier`, `status`,
// `confidence`, `trusted`, `verified`, or `valid` field, individually or
// combined. See `docs/Principles.md`, "An Achievement Describes An
// Attributable Fact, Not A Person's Worth (0.8.102)," and this milestone's
// own `docs/Roadmap.md` entry — a ranking projection over this exact
// aggregate is real, separately sized, later work (0.8.110+), never
// anticipated or half-built here.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublisherAchievementProfile()` receives plain, already-computed
// inputs and projects them; `reconstructPublisherAchievementProfile()`
// below is the ONE, thin, separate function in this file that reads an
// archive — mirroring `application/AchievementProfileView.js`'s own
// `reconstructAchievementProfile()` exactly.

function timestampMillis(date) {
    return date instanceof Date ? date.getTime() : 0;
}

// The one, local, non-exported shorthand key this file uses to decide
// "have I already seen this exact publication identity," provably
// equivalent to `BlockchainPublicationIdentity#sameAs()` for the identical
// reason `application/AchievementEvent.js`'s own `referenceIdentityKey()`
// (0.8.106) already documents. Reimplemented locally rather than imported —
// this file reads no other projection file's internals, exactly as
// `application/AchievementProfileView.js`'s own header already holds.
function identityKey(identity) {
    return `${identity.blockchain}:${identity.chainReference}`;
}

function hasAttributablePublicationIdentity(event) {
    return Boolean(event) && event.sourcePublicationIdentity instanceof BlockchainPublicationIdentity;
}

function hasGenuinePublicationIdentity(association) {
    return Boolean(association) && association.publicationIdentity instanceof BlockchainPublicationIdentity;
}

// The pure computation. Receives one `PublisherIdentityRecord` (0.8.108),
// the raw `publisherPublicationAssociationRecords` array this replica's
// archive already holds (composed through `describePublisherAssociatedPublications()`,
// 0.8.108, UNCHANGED — no parallel association lookup), and the
// already-computed `achievementEvents` array `describeAchievementEvents()`/
// `reconstructAchievementEvents()` (0.8.102/0.8.106, UNCHANGED — no
// parallel achievement engine) itself already produces. Returns
// `{ publisherIdentity, publicationIdentities, publicationIdentityCount,
//    achievements, achievementCount, achievementKinds,
//    distinctAchievementKindCount }`. Malformed/absent `publisherPublicationAssociationRecords`
// or `achievementEvents` is tolerated exactly like every other entry point
// in this codebase: the offending entries are silently excluded, never
// thrown on. A malformed/absent `publisherIdentity` matches nothing —
// `describePublisherAssociatedPublications()`'s own `sameAs()`-based filter
// already guarantees that — and is still echoed back unchanged on the
// result.
export function describePublisherAchievementProfile(publisherIdentity, publisherPublicationAssociationRecords = [], achievementEvents = []) {
    const associationProfile = describePublisherAssociatedPublications(publisherIdentity, publisherPublicationAssociationRecords);

    // Distinct publication identities this publisher has EXPLICITLY,
    // durably claimed — first-association order, deduplicated by
    // `sameAs()`. A duplicate association naming the same publication a
    // second (or third) time contributes nothing further here.
    const publicationIdentities = [];
    const seenPublicationKeys = new Set();
    for (const association of associationProfile.associations) {
        if (!hasGenuinePublicationIdentity(association)) continue;
        const key = identityKey(association.publicationIdentity);
        if (!seenPublicationKeys.has(key)) {
            seenPublicationKeys.add(key);
            publicationIdentities.push(association.publicationIdentity);
        }
    }

    const events = Array.isArray(achievementEvents) ? achievementEvents : [];

    // Every achievement event attributed to ANY of this publisher's
    // distinct publications — a set-membership test, never a join, so a
    // publication claimed via more than one association still contributes
    // its own achievements exactly once each.
    const achievements = events
        .map((event, sourceIndex) => ({ event, sourceIndex }))
        .filter(({ event }) => hasAttributablePublicationIdentity(event)
            && publicationIdentities.some((publicationIdentity) => event.sourcePublicationIdentity.sameAs(publicationIdentity)))
        .sort((a, b) => {
            const delta = timestampMillis(a.event.observedAt) - timestampMillis(b.event.observedAt);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ event }) => event);

    // Distinct achievement KINDS this publisher's own achievements touch —
    // first-appearance order (in the already-chronological `achievements`
    // sequence above), each `AchievementKind` counted once no matter how
    // many of this publisher's own publications, or how many times, earned
    // it. A genuinely different fact from `achievementCount` below — see
    // this file's own header — and never derived from it in the other
    // direction.
    const achievementKinds = [];
    const seenKinds = new Set();
    for (const achievement of achievements) {
        if (!seenKinds.has(achievement.achievementKind)) {
            seenKinds.add(achievement.achievementKind);
            achievementKinds.push(achievement.achievementKind);
        }
    }

    return Object.freeze({
        publisherIdentity,
        publicationIdentities: Object.freeze(publicationIdentities),
        publicationIdentityCount: publicationIdentities.length,
        achievements: Object.freeze(achievements),
        achievementCount: achievements.length,
        achievementKinds: Object.freeze(achievementKinds),
        distinctAchievementKindCount: achievementKinds.length
    });
}

// reconstructPublisherAchievementProfile() — the ONE, thin, archive-reading
// entry point, mirroring `application/AchievementProfileView.js`'s own
// `reconstructAchievementProfile()` exactly, one subject further. It pulls
// this replica's own `publisherPublicationAssociationRecords` straight out
// of `archive`, unchanged, and this replica's own achievement events
// straight out of `reconstructAchievementEvents()` (0.8.102/0.8.106,
// UNCHANGED), and hands both, alongside `publisherIdentity`, to the pure
// function above. An invalid/missing archive is treated as
// `PublicationObservationArchive.empty()` — zero associations, zero
// achievement events, and therefore an empty profile — never an error.
export function reconstructPublisherAchievementProfile(archive, publisherIdentity) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const { events } = reconstructAchievementEvents(safeArchive);
    return describePublisherAchievementProfile(publisherIdentity, safeArchive.publisherPublicationAssociationRecords, events);
}
