import { PublisherIdentityRecord } from './PublisherIdentityRecord.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { reconstructDistinctPublisherIdentifiers } from './PublisherAssociationView.js';
import { reconstructPublisherAchievementStatistics } from './PublisherAchievementStatisticsView.js';

// 0.8.112 — Explicit Publisher Ranking Policy.
//
// 0.8.108 through 0.8.111 answered one question, at increasing scope: "what
// happened?" — which publications a publisher explicitly claims, what those
// publications' achievements amount to, and how they tally. None of them
// ever asked, let alone answered, a genuinely different question: "given
// those facts, how should publishers be ORDERED?" This file is the first
// file in this codebase that answers that second question — and, in doing
// so, crosses an architectural boundary every milestone before it
// deliberately stayed on the near side of:
//
//   Publisher Achievement Statistics (0.8.111, UNCHANGED)
//         │
//         │  describePublisherRanking()   (THIS MILESTONE)
//         ▼
//   Publisher Ranking
//     { policy, entries: [{ rank, publisherIdentity, achievementCount,
//                            distinctAchievementKindCount,
//                            publicationIdentityCount, statistics }] }
//
// EVERY LAYER THROUGH 0.8.111 IS FACTUAL; THIS LAYER IS THE FIRST
// EXPLICITLY EVALUATIVE ONE — AND IT STATES THAT BOUNDARY IN ITS OWN NAME.
// `describePublisherAchievementStatistics()` (0.8.111) answers "what
// measurable facts exist." `describePublisherRanking()` below answers "how
// does an explicitly declared POLICY order those facts against each
// other." The two questions are different in kind, not merely in scope —
// see `docs/Principles.md`, "A Ranking Is A Policy Output, Not A Discovered
// Property (0.8.112)." A rank is never persisted, never treated as a fact
// about a publisher, and never confused with the statistics it is computed
// from.
//
// THE POLICY IS DELIBERATELY SIMPLE, AND DELIBERATELY VERSION 1. This
// milestone does not invent a weighted formula, a point value per
// achievement kind, or any per-blockchain multiplier. It ranks by three
// facts that already exist, verbatim, on 0.8.111's own statistics result —
// `achievementCount`, then `distinctAchievementKindCount`, then
// `publicationIdentityCount`, each compared descending — followed by one
// deterministic, non-numeric tie-break: the publisher identity's own exact
// `publisherId` string, compared ascending. No blockchain gets an intrinsic
// multiplier: a Bitcoin publication is never worth more than a Base
// publication merely because Bitcoin fees are higher, nor the reverse
// because Base is cheaper — `blockchainPublicationCounts` already exposes
// chain distribution as its own, separate fact (0.8.111), and this policy
// never reads it.
//
// `describePublisherRankingPolicy()` RETURNS THE POLICY DEFINITION ITSELF,
// AS DATA — NEVER HARDCODED SEPARATELY INSIDE THE COMPARATOR. The ordered
// `criteria` array below is the SINGLE source of truth for what this
// policy compares and in what order; `describePublisherRanking()`'s own
// comparator iterates that exact array rather than repeating the three
// field names in a hand-written if/else chain. This is deliberate: a
// caller (or a future test) can read `describePublisherRankingPolicy()`
// and see, as plain data, precisely what this milestone's own ranking
// does and does not consider — and the flagship test below proves the
// comparator actually walks this exact array, rather than a second,
// silently-diverging copy of it.
//
// A RANK IS A PRESENTATION RESULT, COMPUTED FRESH, NEVER A PERSISTED
// RECORD. There is no `PublisherRankingRecord`, no thirteenth (or
// fourteenth) collection on `application/PublicationObservationArchive.js`,
// and no `SCHEMA_VERSION` bump. `rank` exists only on the array
// `describePublisherRanking()` returns, for as long as a caller holds that
// result — recomputing it tomorrow, from the identical archive and the
// identical policy, produces the identical ranking; recomputing it after
// this policy someday changes produces a DIFFERENT ranking over the exact
// same, untouched historical facts. See this file's own flagship test,
// "policy isolation," for the concrete proof: ranking an array of
// statistics never mutates a single field on any of them.
//
// THE PUBLISHER POPULATION COMES FROM EXPLICIT ASSOCIATION ALONE — NEVER
// FROM WALLET DISCOVERY, TRANSACTION-SENDER INFERENCE, CONTENT-HASH
// MATCHING, SOCIAL-IDENTITY INFERENCE, NAME NORMALIZATION, OR AN EXTERNAL
// USER DIRECTORY. `reconstructPublisherRanking()` below composes
// `application/PublisherAssociationView.js`'s own
// `reconstructDistinctPublisherIdentifiers()` (0.8.108, UNCHANGED) to learn
// WHICH publisher identities exist to be ranked at all, and
// `application/PublisherAchievementStatisticsView.js`'s own
// `reconstructPublisherAchievementStatistics()` (0.8.111, UNCHANGED) to
// learn what each one has earned. A publisher enters the ranking universe
// for exactly one reason: an explicit `PublisherPublicationAssociationRecord`
// (0.8.108) names it. This extends `docs/Principles.md`, "Correlate
// Evidence By Explicit Identity, Never By Resemblance (0.8.78)," one layer
// further, over the population of a ranking rather than a single
// relationship.
//
// COMPOSES TWO EXISTING RECONSTRUCTIONS — NO PARALLEL ASSOCIATION LOOKUP,
// NO PARALLEL ACHIEVEMENT ENGINE, NO PARALLEL STATISTICS ENGINE.
// `reconstructPublisherRanking()` never reads
// `publisherPublicationAssociationRecords` off the archive directly, never
// re-derives a `sameAs()`-based membership test, and never recomputes a
// count `application/PublisherAchievementStatisticsView.js` already
// computes. It performs exactly two composed lookups — which publisher
// identities exist, and what each one's own already-computed statistics
// are — and hands the resulting array to the pure computation below.
//
// IDENTITY ORDERING RESPECTS `PublisherIdentityRecord`'S OWN CASE-SENSITIVE
// EQUALITY, AND IS NEVER LOCALE-SENSITIVE. `Alice`, `alice`, and `ALICE`
// remain three distinct publisher identities one layer down (0.8.108); the
// tie-break below compares their exact `publisherId` strings with the
// plain `<`/`>` operators — ordering by UTF-16 code unit alone — never
// `localeCompare()`, `toLowerCase()`, or any other transform a browser's,
// operating system's, or the current moment's locale could influence.
// Ranking the identical archive on any two machines, in any locale,
// produces byte-identical output.
//
// DETERMINISTIC TOTAL ORDERING WITH UNIQUE POSITIONS — NEVER COMPETITION
// RANKING (1, 2, 2, 4). Two publishers whose `achievementCount`,
// `distinctAchievementKindCount`, and `publicationIdentityCount` are all
// identical still receive two DIFFERENT, ADJACENT rank numbers (e.g. 1 and
// 2), decided by the exact-identity tie-break above — never the same rank
// number twice. Their statistics remain visibly identical on the result;
// only their `rank` field differs, and only because a total order requires
// SOME deterministic answer to "which one is listed first," never because
// one is secretly considered "better."
//
// NO SCORE, NO POINTS, NO LEVEL, NO TIER, NO XP, NO REPUTATION, NO WEIGHT,
// NO RATING, NO PERCENTILE. `rank` itself is the one ordinal concept this
// file introduces — this milestone's entire, deliberately narrow purpose —
// and it introduces nothing else: no `FIRST_PUBLICATION = 10 points`, no
// per-achievement-kind point value, no combined "publisher score" a rank
// happens to be sorted by. Ranking by already-existing counts, compared in
// a declared order, is not the same thing as inventing a new unit of
// value — see `docs/Principles.md`, "An Achievement Describes An
// Attributable Fact, Not A Person's Worth (0.8.102)," held here once more,
// at the one layer built specifically to answer "how should these be
// ordered" without ever answering "how much is this publisher worth."
//
// NO NEW DURABLE STATE, NO SCHEMA_VERSION BUMP, NO LEADERBOARD UI.
// `application/PublicationObservationArchive.js` gains nothing from this
// milestone. This file also renders nothing — no leaderboard view, no new
// UI card. A locally computed ranking is only ever authoritative over the
// archive it was computed from, and two replicas holding different
// archives can legitimately produce different, equally honest rankings;
// presenting one, with an explicit dataset scope stated alongside it, is
// real, separately sized, later work — see this milestone's own
// `docs/Roadmap.md` entry, "What's left."
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublisherRankingPolicy()` and `describePublisherRanking()`
// receive and return plain, already-computed values;
// `reconstructPublisherRanking()` below is the ONE, thin, separate function
// in this file that reads an archive — mirroring every other
// `reconstructXxx()` entry point at every layer below it.

function hasGenuinePublisherIdentity(entry) {
    return Boolean(entry) && entry.publisherIdentity instanceof PublisherIdentityRecord;
}

function safeCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// The policy definition itself, as plain frozen data — the single source
// of truth `describePublisherRanking()`'s own comparator walks below,
// never a second, hand-duplicated copy of these same three field names.
// Deliberately fixed at version 1, with no parameters and no customization
// point: this milestone ships exactly one policy, and states so plainly
// rather than half-building a configurable policy engine no caller yet
// needs. See this file's own header for why these three fields, in this
// order, and why no blockchain, achievement kind, or event carries an
// intrinsic multiplier.
export function describePublisherRankingPolicy() {
    return Object.freeze({
        version: 1,
        criteria: Object.freeze([
            Object.freeze({ field: 'achievementCount', order: 'DESCENDING' }),
            Object.freeze({ field: 'distinctAchievementKindCount', order: 'DESCENDING' }),
            Object.freeze({ field: 'publicationIdentityCount', order: 'DESCENDING' })
        ]),
        tieBreak: Object.freeze({
            field: 'publisherIdentity.publisherId',
            order: 'ASCENDING',
            comparison: 'EXACT_CASE_SENSITIVE_STRING'
        })
    });
}

// Compares two already-genuine statistics entries by walking `policy.criteria`
// in order — the ONE place this file's own declared field order actually
// governs behavior. Falls through to the exact, case-sensitive
// `publisherId` tie-break only when every criterion ties; this is a total
// order over any two entries with genuinely distinct `publisherId` values,
// so the result of a ranking never depends on whatever partial or
// non-stable ordering a sort implementation might otherwise apply.
function compareStatisticsByPolicy(a, b, policy) {
    for (const criterion of policy.criteria) {
        const valueA = safeCount(a[criterion.field]);
        const valueB = safeCount(b[criterion.field]);
        if (valueA !== valueB) {
            return criterion.order === 'DESCENDING' ? valueB - valueA : valueA - valueB;
        }
    }
    const idA = a.publisherIdentity.publisherId;
    const idB = b.publisherIdentity.publisherId;
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
}

// The pure computation. Receives a plain array of already-computed
// `PublisherAchievementStatistics` results (0.8.111 —
// `describePublisherAchievementStatistics()`/
// `reconstructPublisherAchievementStatistics()`, UNCHANGED) and returns
// `{ policy, entries }`. `policy` is exactly `describePublisherRankingPolicy()`'s
// own result, composed unchanged — never redefined inline. `entries` is a
// frozen array of `{ rank, publisherIdentity, achievementCount,
// distinctAchievementKindCount, publicationIdentityCount, statistics }`,
// one entry per DISTINCT genuine publisher identity, ordered by the policy
// above with unique, gapless ranks starting at 1. `statistics` is the
// EXACT, frozen, already-computed statistics object this entry was ranked
// from, echoed verbatim — never copied, renamed, or recomputed — so a
// caller wanting `badgeCount`, `achievementKindCounts`, or
// `blockchainPublicationCounts` reads them straight off it rather than
// this file computing a second, competing copy.
//
// An entry whose own `statistics.publisherIdentity` is missing or not a
// genuine `PublisherIdentityRecord` never enters the ranking at all —
// silently excluded, exactly like every malformed-entry tolerance in this
// codebase, never thrown on. Two or more statistics entries naming the
// identical publisher identity (by exact `publisherId`) are deduplicated,
// keeping only the FIRST one this array encounters, mirroring
// `application/PublisherAchievementProfileView.js`'s own "first time seen,
// kept" convention for distinct publication identities — a well-behaved
// caller composing this array from `reconstructPublisherRanking()` below
// never produces a duplicate in the first place, since
// `reconstructDistinctPublisherIdentifiers()` (0.8.108) already returns
// each `publisherId` once.
export function describePublisherRanking(publisherAchievementStatisticsList = []) {
    const policy = describePublisherRankingPolicy();
    const candidates = Array.isArray(publisherAchievementStatisticsList) ? publisherAchievementStatisticsList : [];

    const genuineStatistics = [];
    const seenPublisherIds = new Set();
    for (const statistics of candidates) {
        if (!hasGenuinePublisherIdentity(statistics)) continue;
        const publisherId = statistics.publisherIdentity.publisherId;
        if (seenPublisherIds.has(publisherId)) continue;
        seenPublisherIds.add(publisherId);
        genuineStatistics.push(statistics);
    }

    const ranked = [...genuineStatistics].sort((a, b) => compareStatisticsByPolicy(a, b, policy));

    const entries = ranked.map((statistics, index) => Object.freeze({
        rank: index + 1,
        publisherIdentity: statistics.publisherIdentity,
        achievementCount: safeCount(statistics.achievementCount),
        distinctAchievementKindCount: safeCount(statistics.distinctAchievementKindCount),
        publicationIdentityCount: safeCount(statistics.publicationIdentityCount),
        statistics
    }));

    return Object.freeze({ policy, entries: Object.freeze(entries) });
}

// reconstructPublisherRanking() — the ONE, thin, archive-reading entry
// point. It pulls this replica's own distinct publisher identifiers
// straight out of `reconstructDistinctPublisherIdentifiers()` (0.8.108,
// UNCHANGED), mints one `PublisherIdentityRecord` per identifier — the
// identical, only sanctioned way to mint one
// (`application/PublisherIdentityRecord.js`'s own header) — and asks
// `reconstructPublisherAchievementStatistics()` (0.8.111, UNCHANGED) for
// each one's own statistics, unchanged, before handing the resulting array
// to the pure function above. An invalid/missing archive is treated as
// `PublicationObservationArchive.empty()` — zero publisher identities, and
// therefore an empty ranking — never an error.
export function reconstructPublisherRanking(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const publisherIds = reconstructDistinctPublisherIdentifiers(safeArchive);
    const statisticsList = publisherIds.map((publisherId) => reconstructPublisherAchievementStatistics(
        safeArchive,
        new PublisherIdentityRecord({ publisherId })
    ));
    return describePublisherRanking(statisticsList);
}
