import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { reconstructAchievementEvents } from './AchievementEvent.js';

// 0.8.107 — Achievement Profile Projection.
//
// 0.8.102/0.8.106 gave this replica a closed, deterministic vocabulary of
// ACHIEVEMENT EVENTS, each one already attributed to an explicit
// `BlockchainPublicationIdentity` (0.8.89) — either the single publication
// that earned it, or (0.8.106) the source/referenced side of a reference
// that earned it. Both milestones deliberately stopped at "here is every
// achievement this replica's ENTIRE archive can attribute" — neither one
// answers the narrower question a person actually asks while looking at
// ONE publication: "what, exactly, does THIS publication have to show for
// itself?" This file is that projection, and nothing more:
//
//   Achievement Events (0.8.102/0.8.106) — reconstructAchievementEvents(), UNCHANGED
//         │
//         ▼
//   Achievement Profile (0.8.107) — describeAchievementProfile()
//     { publicationIdentity, achievements, achievementCount }
//
// A REDUCTION BY EXPLICIT IDENTITY, NEVER A NEW ACHIEVEMENT ENGINE.
// `describeAchievementProfile()` invents no new `AchievementKind`, no new
// threshold, and computes nothing `application/AchievementEvent.js` did not
// already compute. It performs exactly one operation: given an already-
// computed `events` array and one `BlockchainPublicationIdentity`, keep the
// events whose own `sourcePublicationIdentity` `sameAs()` (0.8.89) that
// identity, in their existing chronological order. Every achievement
// object surviving that filter is the EXACT frozen event instance
// `describeAchievementEvents()` already produced — never copied, renamed,
// or re-scored. This mirrors application/AchievementBadgeView.js's own
// restraint (0.8.103), "invents no new achievement, no new threshold, and
// no new vocabulary of WHAT can be earned," one layer further: a profile
// is a reduction of that same vocabulary to one publication's own slice of
// it, never a second, competing computation of it.
//
// `reconstructAchievementProfile()` CONSUMES THE ARCHIVE'S OWN EXISTING
// ACHIEVEMENT RECONSTRUCTION — NO PARALLEL ACHIEVEMENT ENGINE. The one,
// thin, archive-reading entry point below calls
// `reconstructAchievementEvents()` (0.8.102/0.8.106) UNCHANGED and hands
// its own `events` straight to `describeAchievementProfile()`. It never
// reads `bitcoinAnchorPublicationRecords`, `baseAnchorPublicationRecords`,
// or `publicationReferenceRecords` off the archive itself, and never
// re-derives a threshold crossing by hand — the identical discipline
// application/AchievementBadgeView.js's own `reconstructAchievementBadges()`
// already holds for badges, extended here to a per-publication profile:
//
//   Archive
//     │
//     │  reconstructAchievementEvents()   (0.8.102/0.8.106, UNCHANGED)
//     ▼
//   Achievement Events
//     │
//     │  describeAchievementProfile()     (THIS MILESTONE)
//     ▼
//   Achievement Profile
//
// A PUBLICATION IDENTITY'S PROFILE, DELIBERATELY NOT YET A USER'S. Every
// achievement event this replica can compute is already attributed to an
// explicit `BlockchainPublicationIdentity` — never a wallet, a signer, or
// a cross-replica "user" (application/AchievementEvent.js's own header,
// "No Subject/Owner Identity — Deliberately Postponed, Not Forgotten,"
// held here again, unchanged). This file names that restraint in its own
// title: an ACHIEVEMENT PROFILE is a publication's own earned-achievement
// slice, never a person's. ForkBuild can state "publication X earned
// achievement Y" today; it cannot yet state "human Z earned Y," because no
// durable record anywhere in this codebase links a publication identity to
// a human, a wallet, or an account — inventing that link here, silently,
// just to make a profile feel more personal, would be exactly the kind of
// resemblance-based inference docs/Principles.md, "Correlate Evidence By
// Explicit Identity, Never By Resemblance (0.8.78)," already forbids, one
// layer up: a shared `contentHash` is never evidence of a shared publisher
// (application/BlockchainPublicationIdentity.js, 0.8.89), and two
// publications a person happens to control are never evidence of a shared
// identity either, absent an explicit, durable association this codebase
// does not yet have a place to record. That association — an explicit,
// user-created link between a publisher identity and a
// `BlockchainPublicationIdentity`, mirroring 0.8.104's own "the association
// exists because someone explicitly established it, not because ForkBuild
// inferred it" — is real, separately sized, later work; this milestone
// does not anticipate it, borrow from it, or leave a placeholder field for
// it.
//
// IDENTITY IS `blockchain` + `chainReference` VIA `sameAs()` — NEVER
// `contentHash`, THE SAME RULE 0.8.89/0.8.104/0.8.105/0.8.106 ALREADY
// HOLD, HELD HERE ONCE MORE. Two publications sharing an identical
// `contentHash` — on the same chain, or across two different ones — are
// two entirely separate profiles: a Bitcoin publication and a Base
// publication that happen to anchor byte-identical content each keep their
// own, disjoint set of achievements, never merged into one because their
// content looks the same. See this file's own flagship test for the
// concrete two-chains-one-contentHash proof, held here once more.
//
// `publicationIdentity` ON THE RESULT IS THE EXACT INSTANCE THE CALLER
// SUPPLIED, NEVER A COPY RECONSTRUCTED FROM AN ACHIEVEMENT EVENT. A person
// asking "show me publication X's profile" already holds X's own
// `BlockchainPublicationIdentity` — from a "Bitcoin/Base Anchor
// Publications" record's own `toBlockchainPublicationIdentity()`, or from
// an achievement event/badge's own `sourcePublicationIdentity` — and that
// identical object is echoed back on the result unchanged, whether or not
// this replica's own achievement events happen to include anything
// attributed to it. An identity this replica has never seen earn anything
// still produces a valid, empty profile — never an error, never `null`.
//
// EVERY ACHIEVEMENT SURVIVING THE FILTER IS PRESERVED VERBATIM, DUPLICATES
// INCLUDED, CHRONOLOGICAL ORDER PRESERVED. This file reorders nothing a
// caller could not already have reordered by hand and never deduplicates —
// if a genuinely duplicate achievement event somehow existed twice in the
// input (never something `describeAchievementEvents()` itself produces,
// but never assumed impossible of a caller-supplied array here either),
// both instances survive the filter. Ordering is never merely "whatever
// order the filter happened to preserve": every achievement is placed into
// one fixed, reproducible source order (its own existing array position)
// and only THAT fixed-order sequence is stably sorted by `observedAt`,
// ties broken by that same fixed source order — word for word the same
// two-step ordering `application/AchievementEvent.js`'s own
// `describeAchievementEvents()` already performs. Calling
// `describeAchievementProfile()` twice on byte-identical input always
// returns a byte-identical result.
//
// NO SCORE, NO RANK, NO LEVEL, NO TRUST — THE SAME RESTRAINT HELD AT EVERY
// LAYER BELOW. `achievementCount` is a plain count of `achievements.length`
// — never a score, never a reputation figure, never a leaderboard input of
// its own. This file carries no `points`, `score`, `rank`, `level`, `tier`,
// `status`, `confidence`, `trusted`, or `valid` field, individually or
// combined. See docs/Principles.md, "An Achievement Describes An
// Attributable Fact, Not A Person's Worth (0.8.102)," held here once more,
// over a publication's own slice of that vocabulary rather than the whole
// of it.
//
// NO NEW DURABLE STATE, NO SCHEMA_VERSION BUMP. `application/
// PublicationObservationArchive.js` gains nothing from this milestone —
// no eleventh collection, no cached profile, no mutable "profile" record,
// no network call. A profile is computed fresh, every time, from the
// archive's own already-durable records, by way of achievement events
// this replica already knew how to compute.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describeAchievementProfile()` receives a plain, already-computed
// `events` array and one identity, and projects them;
// `reconstructAchievementProfile()` below is the ONE, thin, separate
// function in this file that reads an archive — mirroring application/
// AchievementEvent.js's own `reconstructAchievementEvents()` exactly.

function timestampMillis(date) {
    return date instanceof Date ? date.getTime() : 0;
}

// A "genuine achievement event" is tolerated the same way every other
// projection in this codebase tolerates caller-supplied garbage: never by
// throwing, only by silently excluding whatever does not carry a real
// `BlockchainPublicationIdentity` (0.8.89) of its own to compare against.
function hasAttributablePublicationIdentity(event) {
    return Boolean(event) && event.sourcePublicationIdentity instanceof BlockchainPublicationIdentity;
}

// The pure computation. Receives one `BlockchainPublicationIdentity`
// (0.8.89) and the already-computed `events` array
// `describeAchievementEvents()`/`reconstructAchievementEvents()` (0.8.102/
// 0.8.106) itself already produces, and returns
// `{ publicationIdentity, achievements, achievementCount }` —
// `achievements` a chronologically ordered, frozen array of the EXACT
// event objects whose own `sourcePublicationIdentity` `sameAs()`
// `publicationIdentity`, `achievementCount` its own length.
// `sameAs()` (0.8.89) itself already returns `false` whenever its argument
// is not a genuine `BlockchainPublicationIdentity` — so an invalid, absent,
// or malformed `publicationIdentity` never throws here, it simply matches
// nothing, and the exact value passed is still echoed back unchanged on
// the result. Malformed/absent `achievementEvents` (not an array, or an
// array holding something other than a genuine achievement event) is
// tolerated exactly like every other entry point in this codebase: the
// offending entries are silently excluded, never thrown on.
export function describeAchievementProfile(publicationIdentity, achievementEvents = []) {
    const list = Array.isArray(achievementEvents) ? achievementEvents : [];

    const achievements = list
        .map((event, sourceIndex) => ({ event, sourceIndex }))
        .filter(({ event }) => hasAttributablePublicationIdentity(event)
            && event.sourcePublicationIdentity.sameAs(publicationIdentity))
        .sort((a, b) => {
            const delta = timestampMillis(a.event.observedAt) - timestampMillis(b.event.observedAt);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ event }) => event);

    return Object.freeze({
        publicationIdentity,
        achievements: Object.freeze(achievements),
        achievementCount: achievements.length
    });
}

// reconstructAchievementProfile() — the ONE, thin, archive-reading entry
// point, mirroring application/AchievementEvent.js's own
// `reconstructAchievementEvents()` exactly. It pulls this replica's own
// achievement events straight out of `reconstructAchievementEvents()`
// (0.8.102/0.8.106, UNCHANGED — no parallel achievement engine) and hands
// them, alongside `publicationIdentity`, to the pure function above. An
// invalid/missing archive is treated as `PublicationObservationArchive.empty()`
// — zero achievement events, and therefore an empty profile — never an
// error.
export function reconstructAchievementProfile(archive, publicationIdentity) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const { events } = reconstructAchievementEvents(safeArchive);
    return describeAchievementProfile(publicationIdentity, events);
}
