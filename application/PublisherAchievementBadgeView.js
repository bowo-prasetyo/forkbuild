import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { reconstructPublisherAchievementProfile } from './PublisherAchievementProfileView.js';
import { reconstructAchievementBadges } from './AchievementBadgeView.js';

// 0.8.110 — Publisher Achievement Badge Projection.
//
// 0.8.103 turned this replica's own achievement EVENTS into human-facing
// BADGES, for one publication at a time. 0.8.109 turned this replica's own
// achievement events into a PUBLISHER's own aggregate, across every
// publication that publisher explicitly claims. Neither one could yet
// answer the question a person actually asks while looking at a
// publisher's own page: "show me what this publisher has to show for
// itself, as badges — not as a bare list of achievement events." This
// file is that projection, and nothing more — the missing composition
// `application/PublisherAchievementProfileView.js`'s own header already
// named as real, separately sized, later work: "a publisher-scoped badge
// presentation is real, separately sized, later work," mirroring
// `application/AchievementBadgeView.js`'s own relationship to
// `application/AchievementProfileView.js`.
//
//   AchievementEvent (0.8.102/0.8.106)
//         │
//         │  describeAchievementBadges()        (0.8.103, UNCHANGED)
//         ▼
//   AchievementBadgeView — badges for THIS REPLICA'S WHOLE ARCHIVE
//
//   PublisherPublicationAssociationRecord (0.8.108)
//         │
//         │  describePublisherAchievementProfile()   (0.8.109, UNCHANGED)
//         ▼
//   PublisherAchievementProfile — this PUBLISHER's own achievement events
//         │
//         │  describePublisherAchievementBadges()    (THIS MILESTONE)
//         ▼
//   Publisher Achievement Badges
//     { publisherIdentity, publicationIdentityCount, badges, badgeCount,
//       achievementKinds, distinctAchievementKindCount }
//
// A PRESENTATION OF ACHIEVEMENTS ALREADY EARNED BY AN EXPLICITLY ASSOCIATED
// PUBLICATION; NEVER A NEW ACHIEVEMENT. This is the one principle this
// whole milestone exists to hold, one subject further than
// `AchievementBadgeView.js`'s own: "an achievement event is evidence of a
// threshold crossing; a badge is a human-facing presentation of that
// achievement." A publisher badge adds nothing to that statement except
// "and this publisher explicitly claims the publication that earned it" —
// a fact `PublisherPublicationAssociationRecord` (0.8.108) already, durably
// establishes, composed here unchanged through `PublisherAchievementProfileView.js`'s
// own `describePublisherAchievementProfile()`/`reconstructPublisherAchievementProfile()`
// (0.8.109). This file invents no new `AchievementKind`, no new threshold,
// no new badge description, no new badge icon, and no new `sourceAnchorId`
// lookup — every one of those already exists in `AchievementBadgeView.js`
// (0.8.103) and is reused here VERBATIM.
//
// COMPOSES TWO EXISTING PROJECTIONS' OWN ALREADY-COMPUTED OUTPUT — NO
// PARALLEL BADGE ENGINE, NO PARALLEL PROFILE ENGINE. `describePublisherAchievementBadges()`
// below receives the publisher's own already-computed `PublisherAchievementProfile`
// (0.8.109, UNCHANGED) and the archive's own already-computed, already-shaped
// badge list (`AchievementBadgeView.js`'s own `describeAchievementBadges()`/
// `reconstructAchievementBadges()`, 0.8.103, UNCHANGED) and does exactly one
// thing with them: keeps only the badges that belong to an achievement the
// profile already decided is this publisher's own. It never re-derives a
// publication association, never re-derives an achievement threshold, and
// never recomputes a badge's own `description`/`icon`/`sourceAnchorId` — the
// identical restraint `PublisherAchievementProfileView.js`'s own header
// already holds one layer down: "no parallel association lookup, no
// parallel achievement engine."
//
//   Archive
//     │
//     │  reconstructPublisherAchievementProfile()   (0.8.109, UNCHANGED)
//     │  reconstructAchievementBadges()              (0.8.103, UNCHANGED)
//     ▼
//   This publisher's own achievement events  +  every badge this replica
//   has ever produced, already shaped
//     │
//     │  describePublisherAchievementBadges()        (THIS MILESTONE)
//     ▼
//   Publisher Achievement Badges
//
// A BADGE SURVIVES THIS FILTER IFF THE PROFILE ALREADY NAMED THE SAME
// (achievementKind, sourcePublicationIdentity) PAIR — NEVER BY RE-DERIVING
// PUBLICATION MEMBERSHIP HERE A SECOND TIME. `PublisherAchievementProfileView.js`
// already decided, once, which achievement events belong to this publisher
// — by reducing the publisher's own associations to distinct publication
// identities and testing set membership via `BlockchainPublicationIdentity#sameAs()`
// (0.8.89). This file never repeats that reduction or that membership test.
// Instead, for each already-shaped badge in `AchievementBadgeView.js`'s own
// output, it asks only "does the profile's own `achievements` array already
// contain an event with this exact `achievementKind` and this exact
// `sourcePublicationIdentity` (by `sameAs()`)?" — trusting 0.8.109's own
// decision verbatim rather than recomputing it. Matching on the pair,
// rather than on either field alone, is deliberate: `achievementKind` alone
// would work today only because every one of `AchievementBadgeView.js`'s
// own six achievement kinds is scoped to THIS REPLICA'S ENTIRE ARCHIVE and
// therefore earned at most once, ever (`application/AchievementEvent.js`'s
// own 0.8.102 header) — but this file never assumes that invariant silently;
// it checks the publication identity too, so this composition stays correct
// even if a future, badge-covered achievement kind were ever scoped to one
// publication instead.
//
// EVERY BADGE SURVIVING THE FILTER IS THE EXACT FROZEN BADGE OBJECT
// `AchievementBadgeView.js` ALREADY PRODUCED — NEVER COPIED, RENAMED, OR
// RESHAPED. `sourcePublicationIdentity`, `sourceAnchorId`, `description`,
// `icon`, `title`, `earnedAt`, and `index` all come through unchanged, in
// `AchievementBadgeView.js`'s own already-chronological order (filtering
// never reorders). This mirrors 0.8.109's own restraint for achievement
// events one layer up: "every achievement surviving the reduction is the
// EXACT frozen event instance those files already produced."
//
// REFERENCE-DERIVED ACHIEVEMENT KINDS HAVE NO BADGE PRESENTATION HERE —
// INHERITED, UNCHANGED, FROM `AchievementBadgeView.js`'s OWN SCOPE, NEVER A
// NEW GAP THIS MILESTONE INTRODUCES. `application/AchievementEvent.js`'s
// own 0.8.106 extension added five achievement kinds attributable to a
// reference between two publications (`FIRST_REFERENCE_CREATED` and
// friends); `AchievementBadgeView.js`'s own header already documents,
// deliberately, that its `describeAchievementBadges()` calls
// `describeAchievementEvents()` with only its own original two arguments,
// so none of those five kinds ever becomes a badge there — "real, separate,
// later work on this file, not a side effect of 0.8.106 having been built."
// This file composes `AchievementBadgeView.js`'s own output UNCHANGED, so
// that same gap passes through here unchanged too: a publisher who
// genuinely earned `FIRST_REFERENCE_CREATED` sees it in
// `PublisherAchievementProfileView.js`'s own `achievements` list (0.8.109,
// already built, unaffected by this milestone) but not as a badge from this
// file — `badgeCount` can therefore be strictly less than the profile's own
// `achievementCount`. Extending `AchievementBadgeView.js`'s own badge
// vocabulary to reference-derived kinds, should a future milestone want to,
// is real, separate, later work on that file, not a side effect of this one.
//
// `achievementKinds`/`distinctAchievementKindCount` NAME THE DISTINCT KINDS
// THIS FILE ACTUALLY PRESENTS AS BADGES — NEVER BLINDLY COPIED FROM THE
// PROFILE'S OWN, WIDER FIELD OF THE SAME NAME. Because of the gap
// documented immediately above, `profile.achievementKinds` (0.8.109) can
// legitimately name a kind (a reference-derived one) that never appears
// among this file's own `badges`. Copying that field verbatim here would
// silently promise "N distinct kinds of badge below" while delivering
// fewer. Instead, this file computes its own `achievementKinds` — first-
// appearance order among the SURVIVING badges only, each `AchievementKind`
// counted once — so this milestone's own two fields, `badgeCount` and
// `distinctAchievementKindCount`, always describe exactly what
// `badges` itself contains, and nothing wider.
//
// `publisherIdentity`/`publicationIdentityCount` ARE THE PROFILE'S OWN
// FIELDS, ECHOED VERBATIM — NEVER RECOMPUTED. Which publications a
// publisher explicitly claims is entirely 0.8.108/0.8.109's own concern;
// this file states only how many of that publisher's own already-earned
// achievements this replica can additionally present as a badge.
//
// NO NEW DURABLE STATE, NO SCHEMA_VERSION BUMP. `application/
// PublicationObservationArchive.js` gains nothing from this milestone — no
// twelfth collection, no cached badge list, no mutable "publisher badge"
// record, no network call. A publisher's own achievement badges are
// computed fresh, every time, from this replica's own already-durable
// association records and already-computable achievement events and
// badges.
//
// NO SCORE, NO RANK, NO LEVEL, NO TRUST, NO LEADERBOARD INPUT OF ANY KIND —
// THE SAME RESTRAINT HELD AT EVERY LAYER BELOW, HELD HERE ONCE MORE OVER A
// PUBLISHER'S OWN BADGE PRESENTATION. `badgeCount`, `publicationIdentityCount`,
// and `distinctAchievementKindCount` are plain counts — never a score, a
// reputation figure, a weighted total, or a leaderboard input of their own.
// This file carries no `points`, `score`, `rank`, `level`, `tier`, `status`,
// `confidence`, `trusted`, `verified`, or `valid` field, individually or
// combined. See `docs/Principles.md`, "An Achievement Describes An
// Attributable Fact, Not A Person's Worth (0.8.102)." A ranking projection
// over a publisher's own achievement facts is real, separately sized, later
// work — see this milestone's own `docs/Roadmap.md` entry.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublisherAchievementBadges()` receives a plain, already-computed
// profile and a plain, already-computed badge array and projects them;
// `reconstructPublisherAchievementBadges()` below is the ONE, thin, separate
// function in this file that reads an archive — mirroring
// `PublisherAchievementProfileView.js`'s own `reconstructPublisherAchievementProfile()`
// exactly.

function hasGenuineIdentity(value) {
    return value instanceof BlockchainPublicationIdentity;
}

// The one, local, non-exported membership test this file performs — see
// this file's own header, "A Badge Survives This Filter Iff The Profile
// Already Named The Same Pair." Never a new `sameAs()`-based reduction of
// its own; this only asks whether 0.8.109's own already-filtered
// `achievements` array already contains the matching pair.
function belongsToProfile(badge, profileAchievements) {
    return profileAchievements.some((achievement) => achievement
        && achievement.achievementKind === badge.achievementKind
        && hasGenuineIdentity(achievement.sourcePublicationIdentity)
        && hasGenuineIdentity(badge.sourcePublicationIdentity)
        && achievement.sourcePublicationIdentity.sameAs(badge.sourcePublicationIdentity));
}

// The pure computation. Receives one already-computed `PublisherAchievementProfile`
// (0.8.109 — `describePublisherAchievementProfile()`/`reconstructPublisherAchievementProfile()`,
// UNCHANGED) and the already-computed, already-shaped badge array this
// replica's own `AchievementBadgeView.js` produces (0.8.103 —
// `describeAchievementBadges()`/`reconstructAchievementBadges()`, UNCHANGED
// — pass its own `.badges`). Returns `{ publisherIdentity,
// publicationIdentityCount, badges, badgeCount, achievementKinds,
// distinctAchievementKindCount }`. A malformed/absent `profile` is treated
// exactly like 0.8.109's own empty profile: `publisherIdentity` is `null`,
// every count is zero, every array is empty — never an error. A
// malformed/absent `achievementBadges` behaves identically to every other
// entry point in this codebase: silently treated as empty, never thrown on.
export function describePublisherAchievementBadges(profile, achievementBadges = []) {
    const hasProfile = Boolean(profile) && typeof profile === 'object';
    const publisherIdentity = hasProfile && profile.publisherIdentity !== undefined ? profile.publisherIdentity : null;
    const publicationIdentityCount = hasProfile && typeof profile.publicationIdentityCount === 'number' ? profile.publicationIdentityCount : 0;
    const profileAchievements = hasProfile && Array.isArray(profile.achievements) ? profile.achievements : [];
    const badgesInput = Array.isArray(achievementBadges) ? achievementBadges : [];

    // Filtering preserves `achievementBadges`' own existing order —
    // already chronological, per `AchievementBadgeView.js`'s own header —
    // never re-sorted here.
    const badges = badgesInput.filter((badge) => badge && typeof badge === 'object' && belongsToProfile(badge, profileAchievements));

    // Distinct achievement KINDS actually represented among the surviving
    // badges — first-appearance order, each `AchievementKind` counted once.
    // See this file's own header on why this is computed fresh here rather
    // than copied from the profile's own, wider `achievementKinds` field.
    const achievementKinds = [];
    const seenKinds = new Set();
    for (const badge of badges) {
        if (!seenKinds.has(badge.achievementKind)) {
            seenKinds.add(badge.achievementKind);
            achievementKinds.push(badge.achievementKind);
        }
    }

    return Object.freeze({
        publisherIdentity,
        publicationIdentityCount,
        badges: Object.freeze(badges),
        badgeCount: badges.length,
        achievementKinds: Object.freeze(achievementKinds),
        distinctAchievementKindCount: achievementKinds.length
    });
}

// reconstructPublisherAchievementBadges() — the ONE, thin, archive-reading
// entry point, mirroring `PublisherAchievementProfileView.js`'s own
// `reconstructPublisherAchievementProfile()` exactly, one subject further.
// It pulls this publisher's own already-computed profile straight out of
// `reconstructPublisherAchievementProfile()` (0.8.109, UNCHANGED) and this
// replica's own already-computed, already-shaped badge list straight out of
// `reconstructAchievementBadges()` (0.8.103, UNCHANGED), and hands both to
// the pure function above. An invalid/missing archive is treated as
// `PublicationObservationArchive.empty()` — zero associations, zero
// achievement events, zero badges, and therefore an empty result — never an
// error.
export function reconstructPublisherAchievementBadges(archive, publisherIdentity) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const profile = reconstructPublisherAchievementProfile(safeArchive, publisherIdentity);
    const { badges } = reconstructAchievementBadges(safeArchive);
    return describePublisherAchievementBadges(profile, badges);
}
