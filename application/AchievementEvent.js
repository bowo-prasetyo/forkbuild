import { BlockchainKind } from './BlockchainKind.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.102 — Achievement Event Foundation.
//
// The first milestone of the achievement system a person proposed
// alongside 0.8.101: a deterministic, closed vocabulary of ACHIEVEMENT
// EVENTS, each one an attributable statement that a specific, already-
// durable publication record caused a specific, named threshold to be
// crossed —
//
//   { achievementKind, label, observedAt, sourcePublicationIdentity, index }
//
// — and nothing resembling a badge, a point value, a score, a rank, or a
// leaderboard. Those are real, deliberately later milestones (see this
// milestone's own "Deliberately excluded" list in docs/Roadmap.md); this
// one answers exactly one question: given the publication IDENTITY
// records this replica already holds durably, what deterministic,
// attributable facts can be stated about them?
//
// A PROJECTION OVER ALREADY-DURABLE FACTS, NEVER A NEW DURABLE
// COLLECTION. `application/PublicationObservationArchive.js` gains
// NOTHING from this milestone — no ninth collection, no SCHEMA_VERSION
// bump, no new `appendXxx()` method. `describeAchievementEvents()` below
// is computed FRESH, every time, from whatever the archive's own
// `bitcoinAnchorPublicationRecords` (0.8.80) and
// `baseAnchorPublicationRecords` (0.8.99) already hold — mirroring
// exactly the restraint application/
// BaseAnchorPublicationLifecycleTimelineView.js's own header already held
// at 0.8.101, "NO NEW DURABLE STATE." An achievement event is never
// itself a fact this replica could disagree with itself about after a
// restart: destroying and restoring the archive can never change the
// achievement events this file produces from the identical underlying
// publication records, because there is nothing OF THIS FILE'S OWN to
// restore — only the records themselves are durable, and they already
// were, before this milestone existed. Calling this a "ledger" describes
// what it reads — the append-only, already-durable ledger of publication
// identity records — never a second, parallel ledger this file writes.
//
// SCOPED TO DURABLE BLOCKCHAIN PUBLICATION IDENTITY RECORDS ONLY — NEVER
// IPFS PUBLICATION RECORDS. `bitcoinAnchorPublicationRecords` and
// `baseAnchorPublicationRecords` are the only two of this archive's own
// collections that project onto application/
// BlockchainPublicationIdentity.js (via each record's own
// `toBlockchainPublicationIdentity()`, 0.8.89/0.8.99, both UNCHANGED) —
// the one identity shape `sourcePublicationIdentity` below is ever
// stamped with. `application/IpfsPublicationRecord.js` carries no
// `blockchain`/`chainReference` of its own to project through that same
// method, and this milestone invents no second, IPFS-shaped identity
// projection to force it in. A future milestone could define its own,
// separately named achievement vocabulary scoped to IPFS publication
// records — mirroring this codebase's own established chain-boundary
// discipline (docs/Roadmap.md, 0.8.89) rather than blurring it here by
// folding two genuinely different kinds of "publication" into one
// `FIRST_PUBLICATION` count.
//
// NO SUBJECT/OWNER IDENTITY — DELIBERATELY POSTPONED, NOT FORGOTTEN.
// Every achievement event here is scoped to THIS ARCHIVE'S OWN durable
// facts as a whole, never to a wallet address, a signing identity, or any
// other centralized "user" this codebase would otherwise have to invent
// a new account concept to represent. Neither
// `application/BitcoinAnchorPublicationRecord.js` nor `application/
// BaseAnchorPublicationRecord.js` carries a publisher/wallet field today
// — inventing one on either class just to give an achievement event a
// `subjectIdentity` would turn this milestone into an identity-management
// project rather than an achievement one. This mirrors docs/Principles.md,
// "Inspecting An External Archive Never Touches The Current One (0.8.86),"
// one layer further: an achievement event describes what THIS replica's
// own archive can attribute to an explicit publication identity, never
// what a person, wallet, or cross-replica "user" supposedly earned.
//
// EVERY ACHIEVEMENT IS EARNED AT MOST ONCE, EVER, AND ATTRIBUTED TO THE
// EXACT RECORD THAT CROSSED ITS THRESHOLD. `AchievementKind` is a closed,
// six-value vocabulary — FIRST_PUBLICATION, BITCOIN_PUBLISHER,
// BASE_PUBLISHER, MULTI_CHAIN_PUBLISHER, PUBLICATION_10, PUBLICATION_100
// — never a free-text string a caller supplies, the identical restraint
// `application/BlockchainKind.js`'s own header already holds for "which
// chain." Each kind is evaluated over the chronological sequence of every
// blockchain publication identity record this replica holds, and fires
// EXACTLY ONCE, at the moment its own threshold is first crossed — a
// SEVENTH Bitcoin publication contributes no new BITCOIN_PUBLISHER event
// (already earned by the first), the same restraint application/
// BitcoinAnchorPublicationRecordHistory.js's own header already holds one
// layer down: "never merged... never reconciled."
//
// `sourcePublicationIdentity` REUSES application/
// BlockchainPublicationIdentity.js VERBATIM — NO NEW IDENTITY MECHANISM.
// Every event names the exact `BlockchainPublicationIdentity` instance
// (0.8.89) its own completing record already projects via
// `toBlockchainPublicationIdentity()`, unchanged. This file never
// constructs one by hand from a bare `{ blockchain, txid }` pair, and
// never compares two identities by anything other than that class's own
// `sameAs()` — see this file's own flagship test for the concrete
// two-chains-one-contentHash proof, held here once more.
//
// DETERMINISTIC ORDERING, THE SAME PHILOSOPHY AS 0.8.81/0.8.101. Every
// blockchain publication identity record this replica holds — Bitcoin's
// own array, then Base's own array, in each array's own existing order —
// is first placed into one fixed, reproducible source order, and only
// THAT fixed-order sequence is ever stably sorted, by `createdAt`, with
// ties broken by that same fixed source order. Calling
// `describeAchievementEvents()` twice on byte-identical input always
// returns a byte-identical result. Within one record that crosses
// several thresholds AT ONCE (its archive's very first publication, on
// Bitcoin, happens to also be the 10th blockchain publication overall —
// only possible if a caller hands this function inputs it would never
// itself produce, but never assumed impossible here), the events it
// earns are emitted in one fixed, documented order — FIRST_PUBLICATION,
// then its own chain's PUBLISHER achievement, then any publication-count
// milestone, then MULTI_CHAIN_PUBLISHER — never an order that varies run
// to run.
//
// NO VERDICT VOCABULARY, NO POINTS, NO SCORE, NO RANK. Exactly as
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn
// Them Into A Verdict (0.8.57)," already holds for observations, held
// here for achievements: no event or result this file produces carries a
// `points`, `score`, `rank`, `level`, `tier`, `status`, `confidence`,
// `trusted`, or `valid` field, individually or combined. See docs/
// Principles.md, "An Achievement Describes An Attributable Fact, Not A
// Person's Worth (0.8.102)," for the principle this restraint now
// stands behind explicitly.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describeAchievementEvents()` receives plain arrays of already-
// constructed records and projects them; `reconstructAchievementEvents()`
// below is the ONE, thin, separate function in this file that reads an
// archive — mirroring application/
// BaseAnchorPublicationLifecycleTimelineView.js's own
// `reconstructBaseAnchorPublicationLifecycleTimeline()` exactly.
export const AchievementKind = Object.freeze({
    FIRST_PUBLICATION: 'first-publication',
    BITCOIN_PUBLISHER: 'bitcoin-publisher',
    BASE_PUBLISHER: 'base-publisher',
    MULTI_CHAIN_PUBLISHER: 'multi-chain-publisher',
    PUBLICATION_10: 'publication-10',
    PUBLICATION_100: 'publication-100'
});

export function isValidAchievementKind(value) {
    return Object.values(AchievementKind).includes(value);
}

const ACHIEVEMENT_LABEL = Object.freeze({
    [AchievementKind.FIRST_PUBLICATION]: 'First publication',
    [AchievementKind.BITCOIN_PUBLISHER]: 'Bitcoin publisher',
    [AchievementKind.BASE_PUBLISHER]: 'Base publisher',
    [AchievementKind.MULTI_CHAIN_PUBLISHER]: 'Multi-chain publisher',
    [AchievementKind.PUBLICATION_10]: 'Ten publications',
    [AchievementKind.PUBLICATION_100]: 'One hundred publications'
});

// Publication-count milestones, evaluated in this fixed order — never a
// caller-supplied, open-ended list. Adding a new milestone (e.g. 1,000)
// is a deliberate, future, one-line change here, exactly like adding a
// new value to `AchievementKind` above — never something a caller can
// parameterize into an arbitrary threshold at call time.
const PUBLICATION_COUNT_MILESTONES = Object.freeze([
    Object.freeze({ threshold: 10, achievementKind: AchievementKind.PUBLICATION_10 }),
    Object.freeze({ threshold: 100, achievementKind: AchievementKind.PUBLICATION_100 })
]);

function toChainEntries(records, blockchain, RecordClass) {
    const list = Array.isArray(records) ? records : [];
    return list
        .filter((record) => record instanceof RecordClass)
        .map((record) => Object.freeze({ blockchain, record }));
}

function createdAtMillis({ record }) {
    return record.createdAt instanceof Date ? record.createdAt.getTime() : 0;
}

function achievementEvent(achievementKind, record, index) {
    return Object.freeze({
        achievementKind,
        label: ACHIEVEMENT_LABEL[achievementKind],
        observedAt: record.createdAt,
        sourcePublicationIdentity: record.toBlockchainPublicationIdentity(),
        index
    });
}

// The pure computation. Receives the archive's own two blockchain
// publication identity record arrays and returns
// `{ count, events }` — `events` a chronologically ordered, frozen array
// of frozen achievement-event objects, `count` its own length. Malformed
// or absent input (not an array, or an array holding something other
// than the expected record class) never throws — the offending entries
// are simply excluded, the identical tolerance every `appendXxx()` in
// application/PublicationObservationArchive.js already holds for a
// missing/falsy argument.
export function describeAchievementEvents(bitcoinAnchorPublicationRecords = [], baseAnchorPublicationRecords = []) {
    const insertionOrder = [
        ...toChainEntries(bitcoinAnchorPublicationRecords, BlockchainKind.BITCOIN, BitcoinAnchorPublicationRecord),
        ...toChainEntries(baseAnchorPublicationRecords, BlockchainKind.BASE, BaseAnchorPublicationRecord)
    ];

    const chronological = insertionOrder
        .map((entry, sourceIndex) => ({ entry, sourceIndex }))
        .sort((a, b) => {
            const delta = createdAtMillis(a.entry) - createdAtMillis(b.entry);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ entry }) => entry);

    const events = [];
    let totalCount = 0;
    let bitcoinCount = 0;
    let baseCount = 0;
    let multiChainEarned = false;

    for (const { blockchain, record } of chronological) {
        const newlyEarnedKinds = [];

        if (totalCount === 0) newlyEarnedKinds.push(AchievementKind.FIRST_PUBLICATION);
        if (blockchain === BlockchainKind.BITCOIN && bitcoinCount === 0) newlyEarnedKinds.push(AchievementKind.BITCOIN_PUBLISHER);
        if (blockchain === BlockchainKind.BASE && baseCount === 0) newlyEarnedKinds.push(AchievementKind.BASE_PUBLISHER);

        totalCount += 1;
        if (blockchain === BlockchainKind.BITCOIN) bitcoinCount += 1;
        if (blockchain === BlockchainKind.BASE) baseCount += 1;

        for (const milestone of PUBLICATION_COUNT_MILESTONES) {
            if (totalCount === milestone.threshold) newlyEarnedKinds.push(milestone.achievementKind);
        }

        if (!multiChainEarned && bitcoinCount >= 1 && baseCount >= 1) {
            newlyEarnedKinds.push(AchievementKind.MULTI_CHAIN_PUBLISHER);
            multiChainEarned = true;
        }

        for (const achievementKind of newlyEarnedKinds) {
            events.push(achievementEvent(achievementKind, record, events.length + 1));
        }
    }

    return Object.freeze({ count: events.length, events: Object.freeze(events) });
}

// reconstructAchievementEvents() — the ONE, thin, archive-reading entry
// point, mirroring application/
// BaseAnchorPublicationLifecycleTimelineView.js#
// reconstructBaseAnchorPublicationLifecycleTimeline() (0.8.101) exactly.
// It pulls this replica's own `bitcoinAnchorPublicationRecords` and
// `baseAnchorPublicationRecords` straight out of `archive`, unchanged,
// and hands them to the pure function above. An invalid/missing archive
// is treated as `PublicationObservationArchive.empty()` — zero records,
// zero achievement events, never an error.
export function reconstructAchievementEvents(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describeAchievementEvents(safeArchive.bitcoinAnchorPublicationRecords, safeArchive.baseAnchorPublicationRecords);
}
