import { AchievementKind, describeAchievementEvents } from './AchievementEvent.js';
import { BlockchainKind } from './BlockchainKind.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.103 — Achievement Badge Presentation.
//
// application/AchievementEvent.js (0.8.102) gives this replica a closed,
// deterministic vocabulary of ACHIEVEMENT EVENTS — attributable facts
// about a threshold crossing. It deliberately stopped there: "a future
// milestone can compose describeAchievementEvents() unchanged into a
// badge view" (docs/Roadmap.md, 0.8.102, "Deliberately excluded"). This
// file is that future milestone, and nothing more:
//
//   Publication Records (0.8.80/0.8.99)
//         │
//         ▼
//   Achievement Events (0.8.102) — describeAchievementEvents(), UNCHANGED
//         │
//         ▼
//   Achievement Badges (0.8.103) — describeAchievementBadges()
//     { achievementKind, title, description, icon, earnedAt,
//       sourcePublicationIdentity, sourceAnchorId, index }
//
// A HUMAN-FACING PRESENTATION OF AN ACHIEVEMENT EVENT, NEVER A SECOND
// ACHIEVEMENT SYSTEM. "An achievement event is evidence of a threshold
// crossing; a badge is a human-facing presentation of that achievement" —
// the one distinction this whole milestone exists to hold. This file
// invents no new achievement, no new threshold, and no new vocabulary of
// WHAT can be earned: `describeAchievementBadges()` below calls
// `describeAchievementEvents()` (0.8.102) UNCHANGED and formats its
// output. Every badge's own `achievementKind` is exactly the achievement
// event's own `achievementKind` — never renamed, widened, or narrowed —
// mirroring the restraint application/BaseAnchorPublicationLifecycleTimelineView.js's
// own header already held for composing an existing projection rather
// than recomputing one: "invents no new observation, state, or label of
// its own."
//
// `title` REUSES THE ACHIEVEMENT EVENT'S OWN `label` VERBATIM — NO SECOND
// WORDING FOR THE SAME FACT. A badge's headline is never a second,
// independently-chosen phrase that could drift from the event it
// presents; it is that event's own `label`, unchanged. `description` is
// this file's own, genuinely new contribution — a longer, human-readable
// sentence explaining what the badge means — and `icon` is a purely
// decorative glyph. Neither carries a fact `AchievementEvent.js` did not
// already state.
//
// A PROJECTION OVER ALREADY-DURABLE FACTS, NEVER A NEW DURABLE
// COLLECTION. Exactly like `describeAchievementEvents()` itself,
// `describeAchievementBadges()` is computed fresh, every time, from
// records the archive already holds. `application/
// PublicationObservationArchive.js` gains nothing from this milestone —
// no tenth collection, no `SCHEMA_VERSION` bump, no new `appendXxx()`
// method, no badge database, no server account, no badge counter, no
// mutable "earned" flag, no expiration, no network call. If the archive
// produces six achievement events today, this file produces six badges
// tomorrow after restart — the identical byte-for-byte determinism
// `describeAchievementEvents()` itself already guarantees, because this
// file adds no state of its own for a restart to lose.
//
// NO SCORING, NO RANKING, NO TRUST ASSESSMENT — THE SAME RESTRAINT ONE
// LAYER UP. No badge carries a `points`, `score`, `rank`, `level`,
// `tier`, `status`, `confidence`, `trusted`, or `valid` field. See
// docs/Principles.md, "An Achievement Describes An Attributable Fact,
// Not A Person's Worth (0.8.102)" — a badge is a costume on that same
// fact, not a new claim about a person's worth.
//
// `sourcePublicationIdentity` IS THE EXACT INSTANCE THE ACHIEVEMENT
// EVENT ALREADY CARRIES — NEVER RECONSTRUCTED. A badge never rebuilds an
// identity from `contentHash`, a timestamp, or a record's position in an
// array; it is the identical `BlockchainPublicationIdentity` (0.8.89)
// object `describeAchievementEvents()` already attributed to the
// completing record, passed through unchanged. That gives a clean chain
// of attribution: badge → event → exact publication identity → exact
// blockchain identity.
//
// `sourceAnchorId` IS A NAVIGATION CONVENIENCE, NEVER A SECOND IDENTITY.
// A Bitcoin publication's `BlockchainPublicationIdentity.chainReference`
// is that record's own `txid` (application/BitcoinAnchorPublicationRecord.js
// #toBlockchainPublicationIdentity(), 0.8.89) — not the `anchorId` this
// codebase's own Bitcoin lifecycle timeline is keyed by (application/
// BitcoinAnchorPublicationLifecycleTimelineView.js, 0.8.81). To let a
// person follow a Bitcoin badge to that already-existing timeline, this
// file locates the exact originating record — from the SAME
// `bitcoinAnchorPublicationRecords` array `describeAchievementEvents()`
// already read — using that record's own `toBlockchainPublicationIdentity()
// .sameAs()`, the one sanctioned equality `BlockchainPublicationIdentity.js`
// itself defines (0.8.89), and reads that record's own `anchorId` off it.
// This is never a new, general "find a Bitcoin record by txid" lookup —
// application/BitcoinAnchorPublicationRecordHistory.js's own header still
// holds "`findBitcoinAnchorPublicationRecordByAnchorId()` ... is the ONLY
// lookup this file offers" unchanged; this file adds no method there and
// performs a local, one-off identity match entirely within itself. A Base
// badge needs no such lookup at all — its own `chainReference` already
// IS the `txid` application/BaseAnchorPublicationLifecycleTimelineView.js
// (0.8.101) already keys its own timeline by, so `sourceAnchorId` is
// always `null` for a Base (or any non-Bitcoin) badge; a caller wanting
// Base's own lifecycle timeline uses `sourcePublicationIdentity.chainReference`
// directly.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describeAchievementBadges()` receives plain arrays of already-
// constructed records and projects them; `reconstructAchievementBadges()`
// below is the ONE, thin, separate function in this file that reads an
// archive — mirroring application/AchievementEvent.js's own
// `reconstructAchievementEvents()` exactly.
const BADGE_DESCRIPTION = Object.freeze({
    [AchievementKind.FIRST_PUBLICATION]: 'Published a blockchain-anchored record for the first time.',
    [AchievementKind.BITCOIN_PUBLISHER]: 'Published a blockchain-anchored record on Bitcoin.',
    [AchievementKind.BASE_PUBLISHER]: 'Published a blockchain-anchored record on Base.',
    [AchievementKind.MULTI_CHAIN_PUBLISHER]: 'Published blockchain-anchored records on more than one chain.',
    [AchievementKind.PUBLICATION_10]: 'Published 10 blockchain-anchored records.',
    [AchievementKind.PUBLICATION_100]: 'Published 100 blockchain-anchored records.'
});

// Purely decorative — never read as a state, a rank, or anything a caller
// could mistake for meaning "better than" another badge's own glyph.
const BADGE_ICON = Object.freeze({
    [AchievementKind.FIRST_PUBLICATION]: '🏆',
    [AchievementKind.BITCOIN_PUBLISHER]: '₿',
    [AchievementKind.BASE_PUBLISHER]: '🔵',
    [AchievementKind.MULTI_CHAIN_PUBLISHER]: '🌐',
    [AchievementKind.PUBLICATION_10]: '🔟',
    [AchievementKind.PUBLICATION_100]: '💯'
});

// The one, local, one-off identity match this file performs — see this
// file's own header, "`sourceAnchorId` Is A Navigation Convenience."
// Never exported: a caller outside this file has no reason to look up a
// Bitcoin record by an achievement badge's own identity.
function findSourceAnchorId(bitcoinAnchorPublicationRecords, sourcePublicationIdentity) {
    const list = Array.isArray(bitcoinAnchorPublicationRecords) ? bitcoinAnchorPublicationRecords : [];
    const match = list.find((record) => record instanceof BitcoinAnchorPublicationRecord
        && record.toBlockchainPublicationIdentity().sameAs(sourcePublicationIdentity));
    return match ? match.anchorId : null;
}

function achievementBadge(event, bitcoinAnchorPublicationRecords) {
    const isBitcoin = event.sourcePublicationIdentity.blockchain === BlockchainKind.BITCOIN;
    return Object.freeze({
        achievementKind: event.achievementKind,
        title: event.label,
        description: BADGE_DESCRIPTION[event.achievementKind],
        icon: BADGE_ICON[event.achievementKind],
        earnedAt: event.observedAt,
        sourcePublicationIdentity: event.sourcePublicationIdentity,
        sourceAnchorId: isBitcoin ? findSourceAnchorId(bitcoinAnchorPublicationRecords, event.sourcePublicationIdentity) : null,
        index: event.index
    });
}

// 0.8.106 note: `describeAchievementEvents()` later gained a third,
// optional `publicationReferenceRecords` parameter, extending
// `AchievementKind` with five reference-derived values. This file calls it
// with only its own original two arguments — deliberately, this milestone
// (0.8.103) is untouched by that later one — so that third parameter
// always defaults to an empty array here, and none of the five
// reference-derived kinds (nor the `triggeringReference` field their events
// carry) ever reaches a badge. Presenting those as badges, should a future
// milestone want to, is real, separate, later work on this file, not a
// side effect of 0.8.106 having been built.
//
// The pure computation. Receives the archive's own two blockchain
// publication identity record arrays — the identical shape
// `describeAchievementEvents()` itself accepts — and returns
// `{ count, badges }`, one badge per achievement event, in the same
// chronological order `describeAchievementEvents()` already established.
// Malformed or absent input behaves exactly as `describeAchievementEvents()`
// itself already does: never throws, simply produces zero badges.
export function describeAchievementBadges(bitcoinAnchorPublicationRecords = [], baseAnchorPublicationRecords = []) {
    const described = describeAchievementEvents(bitcoinAnchorPublicationRecords, baseAnchorPublicationRecords);
    const badges = described.events.map((event) => achievementBadge(event, bitcoinAnchorPublicationRecords));
    return Object.freeze({ count: badges.length, badges: Object.freeze(badges) });
}

// reconstructAchievementBadges() — the ONE, thin, archive-reading entry
// point, mirroring application/AchievementEvent.js's own
// `reconstructAchievementEvents()` exactly. An invalid/missing archive is
// treated as `PublicationObservationArchive.empty()` — zero records, zero
// badges, never an error.
export function reconstructAchievementBadges(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describeAchievementBadges(safeArchive.bitcoinAnchorPublicationRecords, safeArchive.baseAnchorPublicationRecords);
}
