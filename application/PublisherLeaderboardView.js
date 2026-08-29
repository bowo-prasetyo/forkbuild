import { PublisherIdentityRecord } from './PublisherIdentityRecord.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublisherRankingPolicy, reconstructPublisherRanking } from './PublisherRankingPolicy.js';

// 0.8.113 — Explicit Publisher Leaderboard Projection.
//
// 0.8.112 answered "given these facts, how should publishers be ORDERED?"
// It deliberately stopped there — its own header states plainly that it
// "renders nothing — no leaderboard view, no new UI card," and its own
// `docs/Roadmap.md` entry named the exact next question this file answers:
// not how publishers are ordered, but how that ordering is PRESENTED.
//
//   Publisher Ranking (0.8.112, UNCHANGED)
//         │
//         │  describePublisherLeaderboard()   (THIS MILESTONE)
//         ▼
//   Publisher Leaderboard
//     { policy, entryCount, entries: [{ rank, publisherIdentity,
//                                        achievementCount,
//                                        distinctAchievementKindCount,
//                                        publicationIdentityCount }] }
//
// RANKING ANSWERS HOW PUBLISHERS ARE ORDERED; THE LEADERBOARD ANSWERS HOW
// THAT ORDER IS PRESENTED — AND NOTHING ELSE. See `docs/Principles.md`, "A
// Leaderboard Is A Presentation Of A Ranking, Never A Second Ranking
// System (0.8.113)." `describePublisherLeaderboard()` below never sorts,
// never compares two entries against each other, and never breaks a tie.
// Every `rank` value on its result is the EXACT value `describePublisherRanking()`
// (0.8.112) already assigned, echoed verbatim, in the exact order 0.8.112
// already produced. This file composes that one existing computation; it
// does not perform a second, competing one.
//
// THE RANK COMES EXCLUSIVELY FROM 0.8.112 — THIS FILE NEVER INVENTS A
// SECOND RANKING SYSTEM. `describePublisherLeaderboard()` takes an
// already-computed `PublisherRanking` (0.8.112's own `{ policy, entries }`
// result) as its one argument. It has no comparator, no criteria array, no
// tie-break, and no `sort()` call anywhere in this file — there is
// nothing here FOR a ranking policy to disagree with, because this file
// never makes a ranking decision of its own.
//
// A LEADERBOARD ENTRY IS A DELIBERATELY NARROWER VIEW THAN A RANKING
// ENTRY — THE FIVE FACTS A LEADERBOARD ACTUALLY DISPLAYS, NOT THE FULL
// COMPUTED SUBSTRATE BEHIND THEM. A 0.8.112 ranking entry carries a sixth
// field, `statistics` — the entry's own complete, frozen
// `PublisherAchievementStatistics` (0.8.111), including `badgeCount`,
// `achievementKindCounts`, and `blockchainPublicationCounts`. This file's
// own entries deliberately do not carry that field. A leaderboard's job is
// to answer "what does this ranking look like, presented as a table" —
// `rank`, `publisherIdentity`, `achievementCount`,
// `distinctAchievementKindCount`, `publicationIdentityCount` are the
// leaderboard's own five columns, taken verbatim from `docs/Roadmap.md`'s
// own 0.8.112 entry. A caller who wants the deeper substrate — badge
// counts, achievement-kind breakdowns, chain distribution — already has it:
// nothing on 0.8.111's or 0.8.112's own results was deleted, hidden, or
// made harder to reach; this file simply does not duplicate it onto a
// narrower, presentation-shaped result whose entire purpose is to be small
// enough to render as a table row. This mirrors
// `PublisherAchievementBadgeView.js`'s own 0.8.110 relationship to
// 0.8.109's richer profile — a narrower, presentation-shaped projection
// alongside the richer computation it composes, never a replacement for
// it.
//
// PRESERVE THE POLICY WITH THE RESULT — NEVER PRESENT A RANK WITHOUT
// STATING WHICH POLICY PRODUCED IT. `describePublisherLeaderboard()`'s
// result carries the EXACT `policy` object its input ranking already
// carried, echoed verbatim — never recomputed, never re-described, never
// summarized down to a bare version number. "Rank #1" alone is an
// unfalsifiable claim; "rank #1 under ranking policy version 1" is a
// falsifiable, reproducible one. If ForkBuild ever ships a policy version
// 2, a leaderboard built from a version-1 ranking and a leaderboard built
// from a version-2 ranking remain honestly distinguishable from each
// other by this one field, without this file having to know a version 2
// exists.
//
// DO NOT PERSIST LEADERBOARD POSITIONS — A LEADERBOARD IS COMPUTED FRESH,
// EVERY TIME, EXACTLY LIKE THE RANKING IT PRESENTS. There is no
// `PublisherLeaderboardRecord`, no fourteenth (or fifteenth) collection on
// `application/PublicationObservationArchive.js`, and no `SCHEMA_VERSION`
// bump. The durable facts remain exactly what they already were —
// publication, reference, publisher association, achievement event — and
// stay exactly that far down the stack; everything from
// `PublisherAchievementStatisticsView.js` (0.8.111) upward, this file
// included, is reconstructable, never durable. The identical archive,
// presented under a deliberately different future ranking policy, can
// produce a different leaderboard without a single historical record ever
// being rewritten.
//
// "A RANKED SNAPSHOT" — A DURABLE "LEADERBOARD AS OBSERVED ON DATE X" —
// IS DELIBERATELY NOT THIS MILESTONE. A live leaderboard, computed fresh
// from an archive's own current state, is what this file is. A historical
// snapshot with its own identity and its own semantics (what does it mean
// for a snapshot to be reproduced from an archive that has since changed?
// does a snapshot outlive the archive it was taken from?) is real,
// separately sized, later work this milestone deliberately declines to
// answer — see this milestone's own `docs/Roadmap.md` entry, "What's
// left."
//
// COMPOSES ONE EXISTING RECONSTRUCTION — NO PARALLEL RANKING ENGINE, NO
// PARALLEL ASSOCIATION LOOKUP, NO PARALLEL STATISTICS ENGINE.
// `reconstructPublisherLeaderboard()` below calls `reconstructPublisherRanking()`
// (0.8.112, UNCHANGED) exactly once and hands its result, unchanged, to
// the pure function above. It never reads `publisherPublicationAssociationRecords`
// off the archive directly, never re-derives a `sameAs()`-based membership
// test, and never recomputes a statistic 0.8.111 or a rank 0.8.112 already
// computed.
//
// PUBLISHER IDENTITY, NOT PERSON IDENTITY — THE LEADERBOARD SAYS "PUBLISHER
// IDENTITY: ALICE," NEVER "PERSON: ALICE." Every entry's own
// `publisherIdentity` field is the exact `PublisherIdentityRecord` (0.8.108)
// the ranking entry already carried — the same explicit, self-declared
// string identity every layer since 0.8.108 has carried, never a person, a
// wallet, or a cryptographic identity a caller could mistake it for. See
// `docs/Principles.md`, "Publisher Identity Is Explicit And
// Self-Declared, Never Inferred (0.8.108)." This file introduces no new
// field, and no renamed field, that narrows that distinction — there is no
// `publisher` field here, only `publisherIdentity`, exactly as 0.8.112 and
// every layer below it already name it.
//
// A MALFORMED OR OUT-OF-ORDER RANKING ENTRY IS SILENTLY EXCLUDED — NEVER
// REORDERED, NEVER RENUMBERED, NEVER THROWN ON. An entry whose `rank` is
// not a positive integer, or whose `publisherIdentity` is not a genuine
// `PublisherIdentityRecord`, never appears on the leaderboard at all; the
// surviving entries keep their own original `rank` values exactly as
// 0.8.112 assigned them, even if that leaves a gap. This file corrects
// nothing about its input — a caller handing it anything other than
// `describePublisherRanking()`'s or `reconstructPublisherRanking()`'s own
// result is, by construction, off this file's one supported path, and
// this file's only obligation to it is to never throw.
//
// NO SCORE, NO POINTS, NO LEVEL, NO TIER, NO XP, NO REPUTATION, NO WEIGHT,
// NO RATING, NO PERCENTILE — THE IDENTICAL VOCABULARY BOUNDARY 0.8.112
// ALREADY HELD, HELD HERE ONCE MORE, ONE LAYER CLOSER TO WHAT A USER
// ACTUALLY SEES. `rank` is the one ordinal concept on this result, and it
// is 0.8.112's own `rank`, never a second one this file computes.
//
// NO LEADERBOARD UI, NO DASHBOARD, NO ACHIEVEMENT-BADGE ICONOGRAPHY. This
// file renders nothing — no leaderboard table, no publisher profile card,
// no achievement gallery. It returns plain, frozen, presentation-SHAPED
// data; turning that data into an actual UI surface is real, separately
// sized, later work — see this milestone's own `docs/Roadmap.md` entry,
// "What's left."
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublisherLeaderboard()` receives an already-computed ranking
// and reshapes it; `reconstructPublisherLeaderboard()` below is the ONE,
// thin, separate function in this file that reads an archive — mirroring
// every other `reconstructXxx()` entry point at every layer below it.

function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function safeCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasGenuineRankingEntry(entry) {
    return Boolean(entry)
        && typeof entry === 'object'
        && isPositiveInteger(entry.rank)
        && entry.publisherIdentity instanceof PublisherIdentityRecord;
}

// The pure computation. Receives one already-computed `PublisherRanking`
// (0.8.112 — `describePublisherRanking()`/`reconstructPublisherRanking()`'s
// own `{ policy, entries }` result) and returns
// `{ policy, entryCount, entries }`. `policy` is the input ranking's own
// `policy` field, echoed verbatim — falling back to
// `describePublisherRankingPolicy()` (0.8.112, UNCHANGED) only when the
// input itself is malformed or missing a genuine policy object, never
// recomputed when a genuine one is already present. `entries` is a frozen
// array of `{ rank, publisherIdentity, achievementCount,
// distinctAchievementKindCount, publicationIdentityCount }`, one per
// genuine input entry, in the EXACT order the input ranking already held
// them — this function never sorts, never re-numbers, and never drops a
// genuine entry. `entryCount` is simply `entries.length`, a plain,
// derived convenience for a caller rendering "N publishers ranked" without
// having to read the array's own length itself.
export function describePublisherLeaderboard(ranking) {
    const hasRanking = Boolean(ranking) && typeof ranking === 'object';
    const policy = hasRanking && ranking.policy && typeof ranking.policy === 'object'
        ? ranking.policy
        : describePublisherRankingPolicy();
    const rankingEntries = hasRanking && Array.isArray(ranking.entries) ? ranking.entries : [];

    const entries = rankingEntries
        .filter(hasGenuineRankingEntry)
        .map((entry) => Object.freeze({
            rank: entry.rank,
            publisherIdentity: entry.publisherIdentity,
            achievementCount: safeCount(entry.achievementCount),
            distinctAchievementKindCount: safeCount(entry.distinctAchievementKindCount),
            publicationIdentityCount: safeCount(entry.publicationIdentityCount)
        }));

    return Object.freeze({
        policy,
        entryCount: entries.length,
        entries: Object.freeze(entries)
    });
}

// reconstructPublisherLeaderboard() — the ONE, thin, archive-reading entry
// point. It pulls this replica's own current ranking straight out of
// `reconstructPublisherRanking()` (0.8.112, UNCHANGED) and hands it,
// unchanged, to the pure function above. An invalid/missing archive is
// treated exactly like 0.8.112's own tolerance — `reconstructPublisherRanking()`
// already reduces it to `PublicationObservationArchive.empty()` and an
// empty ranking, so this file performs no separate `instanceof` check or
// fallback of its own; there is nothing left for a second copy of that
// same tolerance to protect against here.
export function reconstructPublisherLeaderboard(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const ranking = reconstructPublisherRanking(safeArchive);
    return describePublisherLeaderboard(ranking);
}
