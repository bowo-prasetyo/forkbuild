import { BlockchainKind } from './BlockchainKind.js';
import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';
import { reconstructPublisherAchievementProfile } from './PublisherAchievementProfileView.js';
import { reconstructPublisherAchievementBadges } from './PublisherAchievementBadgeView.js';

// 0.8.111 — Publisher Achievement Statistics Projection.
//
// 0.8.109 answered "what has this publisher earned?" 0.8.110 answered "how
// does this replica present that, as badges?" Neither one answers the
// question a future ranking policy will need answered first: "what
// measurable FACTS exist about this publisher's own explicitly associated
// publications and their derived achievements?" This file is that
// projection, and nothing more — the missing composition this
// milestone's own entry in `docs/Roadmap.md` already named as real,
// separately sized, later work under 0.8.109's own "What's left":
//
//   Publisher Achievement Profile (0.8.109, UNCHANGED)
//         │
//   Publisher Achievement Badges (0.8.110, UNCHANGED)
//         │
//         │  describePublisherAchievementStatistics()   (THIS MILESTONE)
//         ▼
//   Publisher Achievement Statistics
//     { publisherIdentity, publicationIdentityCount,
//       achievementCount, distinctAchievementKindCount,
//       badgeCount, distinctBadgeKindCount,
//       achievementKindCounts, blockchainPublicationCounts }
//
// DESCRIBES MEASURABLE FACTS; NEVER DECIDES WHETHER THEY ARE GOOD, BAD,
// IMPORTANT, OR WORTHY OF A HIGHER RANK. This is the one boundary this
// whole milestone exists to hold. Every field on the result answers one
// plain, closed question about the publisher's own already-computed
// profile and badges — "how many," "how many distinct," "how many of
// each" — and none of them orders publishers against one another, weighs
// one achievement kind against another, or produces a single combined
// figure a ranking could sort by. `docs/Principles.md`, "An Achievement
// Describes An Attributable Fact, Not A Person's Worth (0.8.102)," held
// here once more, over a publisher's own statistical summary rather than
// a single achievement or badge. A ranking POLICY that turns these exact
// facts into an ordering is real, separately sized, later work — see this
// milestone's own `docs/Roadmap.md` entry, "What's left."
//
// COMPOSES TWO EXISTING, ALREADY PUBLISHER-SCOPED PROJECTIONS — NO
// PARALLEL ASSOCIATION LOOKUP, NO PARALLEL ACHIEVEMENT ENGINE, NO PARALLEL
// BADGE ENGINE. `describePublisherAchievementStatistics()` below receives
// the publisher's own already-computed `PublisherAchievementProfile`
// (0.8.109, UNCHANGED — `application/PublisherAchievementProfileView.js`'s
// own `describePublisherAchievementProfile()`/`reconstructPublisherAchievementProfile()`)
// and the publisher's own already-computed `PublisherAchievementBadges`
// (0.8.110, UNCHANGED — `application/PublisherAchievementBadgeView.js`'s
// own `describePublisherAchievementBadges()`/`reconstructPublisherAchievementBadges()`).
// Unlike 0.8.110, which composes an ARCHIVE-WIDE badge array and filters
// it down to one publisher, this file composes two projections that are
// ALREADY reduced to this one publisher's own slice — there is nothing
// left to filter, only to count and tally. This file never reads
// `publisherPublicationAssociationRecords`, an achievement event array, or
// an archive-wide badge array off the archive directly, and never
// re-derives a `sameAs()`-based membership test either of those two files
// already performed.
//
// `reconstructPublisherAchievementStatistics()` DELEGATES ITS ARCHIVE
// SAFETY ENTIRELY TO THE TWO RECONSTRUCTIONS IT COMPOSES — THE PUREST FORM
// OF THIS FILE'S OWN "COMPOSE, NEVER RECREATE" RULE. Both
// `reconstructPublisherAchievementProfile()` (0.8.109) and
// `reconstructPublisherAchievementBadges()` (0.8.110) already treat an
// invalid/missing archive as `PublicationObservationArchive.empty()`; this
// file's own thin entry point below passes `archive` straight through to
// both, unchanged, and never performs its own `instanceof` check or its
// own `PublicationObservationArchive.empty()` fallback — there is nothing
// for a third copy of that same tolerance to protect against here.
//
// `publicationIdentityCount`, `achievementCount`, AND
// `distinctAchievementKindCount` ARE THE PROFILE'S OWN FIELDS, ECHOED
// VERBATIM — NEVER RECOMPUTED. Which publications a publisher explicitly
// claims, how many achievement events those publications earned, and how
// many distinct kinds those achievements touch are entirely 0.8.108/
// 0.8.109's own concern; this file states only how those same facts count
// alongside the two genuinely new facts it adds. `badgeCount` and
// `distinctBadgeKindCount` are, likewise, the badges projection's own
// `badgeCount`/`distinctAchievementKindCount` fields, echoed verbatim —
// renamed `distinctBadgeKindCount` on this result ONLY to keep it from
// colliding with the profile's own, wider `distinctAchievementKindCount`
// field of the same name, never because the underlying fact changed.
//
// `badgeCount` CAN BE STRICTLY LESS THAN `achievementCount` — INHERITED,
// UNCHANGED, FROM 0.8.110's OWN DOCUMENTED GAP, NEVER HIDDEN OR EXPLAINED
// AWAY HERE. `application/AchievementBadgeView.js`'s own 0.8.103 scope
// never covered the five reference-derived achievement kinds
// (`FIRST_REFERENCE_CREATED` and its siblings); `PublisherAchievementBadgeView.js`'s
// own 0.8.110 header already documents that gap passing through unchanged.
// This file states both counts side by side and lets a reader see the gap
// for what it is — a real, documented boundary of this replica's current
// badge vocabulary — never a discrepancy this file silently reconciles.
//
// `achievementKindCounts` NAMES ONLY THE ACHIEVEMENT KINDS THE PROFILE
// ACTUALLY CONTAINS, EACH WITH ITS OWN TALLY, IN FIRST-APPEARANCE ORDER —
// MIRRORING `achievementKinds`' OWN CONVENTION AT EVERY LAYER BELOW, NEVER
// A FULL ENUMERATION OF THE CLOSED `AchievementKind` VOCABULARY. This file
// reports what exists; it does not pad the result with every achievement
// kind a publisher has never earned. Two publisher-scoped achievement
// kinds — the eleven-value vocabulary's five 0.8.106 members — can occur
// more than once for the same publisher, once per distinct publication
// that independently earns it (`docs/Roadmap.md`, 0.8.106, "Referenced By
// 10 Publications Means 10 Distinct Source Identities"); this file's own
// `count` on each entry states exactly how many achievement EVENTS of that
// kind the profile carries — never collapsed to "was this kind earned at
// all," and never confused with `distinctAchievementKindCount` above,
// which counts DISTINCT kinds, not events. Order is first-appearance
// within the profile's own already-chronological `achievements` array —
// never alphabetized, never sorted by count — the identical convention
// `PublisherAchievementProfileView.js`'s own `achievementKinds` and
// `PublisherAchievementBadgeView.js`'s own `achievementKinds` already
// hold.
//
// `blockchainPublicationCounts` NAMES EVERY VALUE OF THE CLOSED
// `BlockchainKind` VOCABULARY, IN ITS OWN FIXED ORDER, EACH WITH AN
// EXPLICIT COUNT — DELIBERATELY THE OPPOSITE CONVENTION FROM
// `achievementKindCounts` IMMEDIATELY ABOVE, AND FOR A DELIBERATE REASON.
// `AchievementKind` (`application/AchievementEvent.js`) is an eleven-value
// and growing vocabulary where "report only what exists" keeps a
// publisher's result from being padded with mostly-zero entries;
// `BlockchainKind` (`application/BlockchainKind.js`) is a small, genuinely
// closed, rarely-growing vocabulary — the exact one ForkBuild's own
// multi-chain publication model is built around — where naming every value
// explicitly, every time, is cheap and keeps a caller from having to know
// the full vocabulary in advance just to render "Bitcoin 0 · Base 4"
// correctly for a publisher who happens to have never published on
// Bitcoin. Each entry's own `count` is the number of this publisher's own
// distinct `publicationIdentities` (the profile's own field, 0.8.109) whose
// `blockchain` equals that entry's own `blockchain` — a plain tally, never
// a second, competing publication-identity reduction; `publicationIdentities`
// is already deduplicated by `sameAs()` one layer down, so this tally never
// double-counts a publication a publisher claims through more than one
// association.
//
// AN ACHIEVEMENT-EVENT COUNT, A DISTINCT-KIND COUNT, A BADGE COUNT, AND A
// DISTINCT-BADGE-KIND COUNT ARE FOUR DIFFERENT FACTS, NONE OF THEM
// SILENTLY COLLAPSED INTO ANY OTHER. `achievementCount` counts EVENTS —
// every surviving achievement, however many publications independently
// earned the identical kind. `distinctAchievementKindCount` counts KINDS
// — how many distinct entries of the closed `AchievementKind` vocabulary
// this publisher's achievements collectively touch, each counted once no
// matter how many times earned. `badgeCount` counts BADGES — the subset of
// those same events this replica can currently present as a badge.
// `distinctBadgeKindCount` counts DISTINCT BADGE KINDS — the same
// "distinct, not raw" relationship as above, but scoped to badges alone.
// A caller wanting any one of these four facts reads that field directly;
// none is derivable from another without re-reading the underlying
// profile or badges.
//
// NO SCORE, NO RANK, NO LEVEL, NO TIER, NO XP, NO REPUTATION, NO WEIGHT,
// NO RATING, NO PERCENTILE — NOT EVEN AN "OBVIOUS" ONE. This file carries
// no `score`, `points`, `rank`, `level`, `tier`, `xp`, `reputation`,
// `weight`, `rating`, `percentile`, `achievementScore`, `publisherScore`,
// or `reputationScore` field, individually or combined, and computes no
// single number that sums, weights, or otherwise combines two or more of
// its own fields into one. Every field is a plain, independently
// meaningful count. See `docs/Principles.md`, "An Achievement Describes An
// Attributable Fact, Not A Person's Worth (0.8.102)," held here once more,
// at the one layer where the temptation to add "just one combined number"
// is strongest — precisely because this file exists to feed a future
// ranking policy, never to pre-compute one.
//
// NO NEW DURABLE STATE, NO SCHEMA_VERSION BUMP. `application/
// PublicationObservationArchive.js` gains nothing from this milestone —
// no thirteenth collection, no cached statistics object, no mutable
// "publisher statistics" record, no network call. A publisher's own
// achievement statistics are computed fresh, every time, from this
// replica's own already-durable association records and
// already-computable achievement events and badges, by way of the two
// projections this file composes unchanged.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublisherAchievementStatistics()` receives two plain,
// already-computed projections and tallies them; `reconstructPublisherAchievementStatistics()`
// below is the ONE, thin, separate function in this file that reads an
// archive — mirroring `PublisherAchievementBadgeView.js`'s own
// `reconstructPublisherAchievementBadges()` exactly, one subject further.

function hasGenuineBlockchainPublicationIdentity(value) {
    return value instanceof BlockchainPublicationIdentity;
}

// The pure computation. Receives one already-computed `PublisherAchievementProfile`
// (0.8.109 — `describePublisherAchievementProfile()`/`reconstructPublisherAchievementProfile()`,
// UNCHANGED) and one already-computed `PublisherAchievementBadges` (0.8.110
// — `describePublisherAchievementBadges()`/`reconstructPublisherAchievementBadges()`,
// UNCHANGED — already scoped to the SAME publisher; this file never checks
// the two arguments name the same publisher, exactly as it never re-derives
// any membership test either already performed). Returns
// `{ publisherIdentity, publicationIdentityCount, achievementCount,
//    distinctAchievementKindCount, badgeCount, distinctBadgeKindCount,
//    achievementKindCounts, blockchainPublicationCounts }`. A malformed/
// absent `profile` or `badges` is treated exactly like 0.8.109's/0.8.110's
// own empty result: `publisherIdentity` is `null`, every count is zero,
// every array is empty — never an error.
export function describePublisherAchievementStatistics(profile, badges) {
    const hasProfile = Boolean(profile) && typeof profile === 'object';
    const hasBadges = Boolean(badges) && typeof badges === 'object';

    const publisherIdentity = hasProfile && profile.publisherIdentity !== undefined ? profile.publisherIdentity : null;
    const publicationIdentityCount = hasProfile && typeof profile.publicationIdentityCount === 'number' ? profile.publicationIdentityCount : 0;
    const publicationIdentities = hasProfile && Array.isArray(profile.publicationIdentities) ? profile.publicationIdentities : [];
    const achievements = hasProfile && Array.isArray(profile.achievements) ? profile.achievements : [];
    const distinctAchievementKindCount = hasProfile && typeof profile.distinctAchievementKindCount === 'number' ? profile.distinctAchievementKindCount : 0;

    const badgeCount = hasBadges && typeof badges.badgeCount === 'number' ? badges.badgeCount : 0;
    const distinctBadgeKindCount = hasBadges && typeof badges.distinctAchievementKindCount === 'number' ? badges.distinctAchievementKindCount : 0;

    // achievementKindCounts — first-appearance order within the profile's
    // own already-chronological `achievements`, each distinct
    // `AchievementKind` counted once, alongside how many EVENTS of that
    // kind actually exist. See this file's own header on why this reports
    // only what exists, rather than the full closed vocabulary. A garbage
    // entry in `achievements` (never something 0.8.109 itself produces, but
    // never assumed impossible of a caller-supplied `profile` here either)
    // is silently excluded, the identical tolerance every projection in
    // this codebase already holds.
    const achievementKindCounts = [];
    const countEntryByKind = new Map();
    let genuineAchievementCount = 0;
    for (const achievement of achievements) {
        if (!achievement || typeof achievement.achievementKind !== 'string') continue;
        genuineAchievementCount += 1;
        const existingEntry = countEntryByKind.get(achievement.achievementKind);
        if (existingEntry) {
            existingEntry.count += 1;
        } else {
            const entry = { achievementKind: achievement.achievementKind, count: 1 };
            countEntryByKind.set(achievement.achievementKind, entry);
            achievementKindCounts.push(entry);
        }
    }

    // `achievementCount` prefers the profile's own already-computed field —
    // never recomputed when the profile is genuine. Only when `profile`
    // itself is malformed/absent does this fall back to a count of its own,
    // and even then it counts only the GENUINE achievement-shaped entries
    // `achievementKindCounts` above already validated, never a raw
    // `achievements.length` that could include garbage.
    const achievementCount = hasProfile && typeof profile.achievementCount === 'number' ? profile.achievementCount : genuineAchievementCount;

    // blockchainPublicationCounts — every value of the closed BlockchainKind
    // vocabulary, in its own fixed order, each an explicit tally over the
    // profile's own already-deduplicated `publicationIdentities`. See this
    // file's own header on why this, deliberately, is a full enumeration
    // rather than a "report only what exists" list.
    const blockchainPublicationCounts = Object.values(BlockchainKind).map((blockchain) => Object.freeze({
        blockchain,
        count: publicationIdentities.filter((identity) => hasGenuineBlockchainPublicationIdentity(identity) && identity.blockchain === blockchain).length
    }));

    return Object.freeze({
        publisherIdentity,
        publicationIdentityCount,
        achievementCount,
        distinctAchievementKindCount,
        badgeCount,
        distinctBadgeKindCount,
        achievementKindCounts: Object.freeze(achievementKindCounts.map((entry) => Object.freeze(entry))),
        blockchainPublicationCounts: Object.freeze(blockchainPublicationCounts)
    });
}

// reconstructPublisherAchievementStatistics() — the ONE, thin,
// archive-reading entry point, mirroring `PublisherAchievementBadgeView.js`'s
// own `reconstructPublisherAchievementBadges()` exactly, one subject
// further. It pulls this publisher's own already-computed profile straight
// out of `reconstructPublisherAchievementProfile()` (0.8.109, UNCHANGED)
// and this publisher's own already-computed badges straight out of
// `reconstructPublisherAchievementBadges()` (0.8.110, UNCHANGED), and hands
// both to the pure function above. See this file's own header, "Delegates
// Its Archive Safety Entirely To The Two Reconstructions It Composes" — an
// invalid/missing archive, or a missing/malformed `publisherIdentity`,
// never throws here for the identical reason it never throws in either of
// the two files this one composes.
export function reconstructPublisherAchievementStatistics(archive, publisherIdentity) {
    const profile = reconstructPublisherAchievementProfile(archive, publisherIdentity);
    const badges = reconstructPublisherAchievementBadges(archive, publisherIdentity);
    return describePublisherAchievementStatistics(profile, badges);
}
