import { BlockchainKind } from './BlockchainKind.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';
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
// EVERY ACHIEVEMENT IS EARNED AT MOST ONCE PER SCOPE, AND ATTRIBUTED TO THE
// EXACT RECORD THAT CROSSED ITS THRESHOLD. `AchievementKind` is a closed
// vocabulary — never a free-text string a caller supplies, the identical
// restraint `application/BlockchainKind.js`'s own header already holds for
// "which chain." At 0.8.102 it named exactly six values, each scoped to
// THIS REPLICA'S ENTIRE ARCHIVE and therefore earned AT MOST ONCE, EVER:
// FIRST_PUBLICATION, BITCOIN_PUBLISHER, BASE_PUBLISHER,
// MULTI_CHAIN_PUBLISHER, PUBLICATION_10, PUBLICATION_100. Each kind is
// evaluated over the chronological sequence of every blockchain
// publication identity record this replica holds, and fires EXACTLY ONCE,
// at the moment its own threshold is first crossed — a SEVENTH Bitcoin
// publication contributes no new BITCOIN_PUBLISHER event (already earned
// by the first), the same restraint application/
// BitcoinAnchorPublicationRecordHistory.js's own header already holds one
// layer down: "never merged... never reconciled." 0.8.106, below, extends
// this same vocabulary with five further values, each instead scoped to
// ONE explicit publication identity — see that milestone's own header for
// the full rationale and the resulting eleven-value vocabulary.
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
//
// 0.8.106 — Reference-Derived Achievement Events.
//
// Everything above is 0.8.102, UNCHANGED. This milestone extends the same
// closed vocabulary with FIVE new, factual thresholds derived from
// application/PublicationReferenceRecord.js (0.8.104) — the first
// achievement kinds attributable to an explicit REFERENCE between two
// publications, rather than to a single publication's own existence:
//
//   PublicationReferenceRecord (0.8.104), durable, append-only
//         │
//         ▼
//   describeAchievementEvents(..., publicationReferenceRecords)  (THIS MILESTONE)
//         │
//         ▼
//   FIRST_REFERENCE_CREATED / FIRST_REFERENCE_RECEIVED /
//   REFERENCED_BY_10_PUBLICATIONS / REFERENCED_BY_100_PUBLICATIONS /
//   FIRST_CROSS_CHAIN_REFERENCE
//
// A THIRD, OPTIONAL ARGUMENT — NEVER A BREAKING CHANGE TO THE FIRST TWO.
// `describeAchievementEvents()` gains one new parameter,
// `publicationReferenceRecords = []`, appended after the two 0.8.102
// parameters, both UNCHANGED. Every call site written before this
// milestone existed — `application/AchievementBadgeView.js`'s own
// `describeAchievementBadges()` chief among them — keeps compiling and
// keeps returning its own identical six-achievement result, because an
// omitted third argument defaults to an empty array, and an empty
// `publicationReferenceRecords` contributes zero additional events. "0.8.102
// achievements remain unchanged when the reference collection is empty" is
// not a claim this file merely hopes holds — it holds because the
// reference-derived computation below is strictly ADDITIVE: it only ever
// pushes MORE entries onto the same `events` array the 0.8.102 loop already
// built, never rewrites, reorders, or removes one of that loop's own
// entries.
//
// EVERY REFERENCE-DERIVED ACHIEVEMENT IS ATTRIBUTED TO AN EXPLICIT
// PUBLICATION IDENTITY, NEVER TO "THE ARCHIVE" AS A WHOLE. This is a
// genuine, deliberate difference from the five 0.8.102 achievement kinds
// above, each of which is a fact about THIS REPLICA'S OWN ENTIRE ARCHIVE
// ("its first publication ever," "its 10th publication ever") and can
// therefore fire AT MOST ONCE, ever. A reference names TWO publications,
// and a graph can have arbitrarily many of them each crossing the
// identical threshold independently — Alice's own first outgoing
// reference and Carol's own first outgoing reference are two entirely
// separate facts, not the same fact re-observed. So each of the five kinds
// below is scoped to ONE `BlockchainPublicationIdentity` (0.8.89) — the
// exact identity named by `sourcePublicationIdentity` on the resulting
// event, reached the identical way every achievement event already reaches
// one: never assembled by hand, always the record's own already-durable
// identity — and fires once PER DISTINCT IDENTITY, the first time that
// identity's own criterion is met:
//
//   FIRST_REFERENCE_CREATED         -> attributed to the REFERENCE'S OWN
//                                      sourcePublicationIdentity (Alice),
//                                      the first time SHE creates ANY
//                                      outgoing reference
//   FIRST_REFERENCE_RECEIVED        -> attributed to the reference's own
//                                      referencedPublicationIdentity (Bob),
//                                      the first time ANY reference points
//                                      at him
//   REFERENCED_BY_10_PUBLICATIONS   -> attributed to referencedPublicationIdentity,
//                                      the moment its own count of DISTINCT
//                                      referencing publications (never raw
//                                      reference records — see below)
//                                      first reaches 10
//   REFERENCED_BY_100_PUBLICATIONS  -> the identical rule, at 100
//   FIRST_CROSS_CHAIN_REFERENCE     -> attributed to sourcePublicationIdentity,
//                                      the first time IT creates a
//                                      reference whose own referenced
//                                      identity names a DIFFERENT
//                                      `blockchain`. The reverse direction
//                                      — that referenced publication later
//                                      referencing something back, on a
//                                      third chain or on the original one —
//                                      is a SEPARATE source identity, and
//                                      therefore a separate, independent
//                                      occurrence of this same achievement
//                                      kind, never assumed already earned.
//
// "REFERENCED BY 10 PUBLICATIONS" MEANS 10 DISTINCT SOURCE IDENTITIES,
// NEVER 10 REFERENCE RECORDS — THE ONE DISTINCTION THIS MILESTONE EXISTS TO
// GET RIGHT. Alice referencing Bob three times is three durable
// `PublicationReferenceRecord`s (0.8.104, "Reference Count And Distinct
// Referencing Publisher Count Are Two Different Facts") but ONE distinct
// referencing publication — the second and third A -> B records advance no
// counter this file tracks, and cross no threshold, exactly because the
// SET of distinct source identities a referenced publication has already
// been seen from did not grow. `REFERENCED_BY_10_PUBLICATIONS` fires
// precisely when the 10th DIFFERENT publication references Bob, whatever
// number of raw reference records happen to already exist between any of
// those ten publications and Bob.
//
// EVERY REFERENCE-DERIVED EVENT CARRIES ITS OWN `triggeringReference` — THE
// ACTUAL RECORD THAT CROSSED THE THRESHOLD, NEVER MERELY A RESTATED COUNT.
// A person reading "Bob earned REFERENCED_BY_10_PUBLICATIONS" is entitled
// to ask "because of which reference, exactly?" — this file answers that
// with `triggeringReference: { sourcePublicationIdentity,
// referencedPublicationIdentity, createdAt }`, the exact
// `PublicationReferenceRecord` (0.8.104) that completed the threshold,
// narrated in the identical shape application/
// PublicationReferenceRecordHistoryView.js's own
// `describePublicationReferenceRecordHistoryEntry()` already uses. This
// gives the auditable chain a person can walk in full: `PublicationReferenceRecord`
// -> `ReferenceGraph`(0.8.105, conceptually) -> `AchievementEvent` ->
// (a future) `AchievementBadge` — never a event that merely asserts "Bob
// now has 10" with nothing behind it. The five 0.8.102 achievement kinds
// carry no `triggeringReference` field — a single completing publication
// record IS the fact there; only a reference-derived event names two
// publications and therefore needs a second, explicit pointer back to the
// relationship record itself.
//
// CHRONOLOGICAL, NEVER "TODAY'S GRAPH REINTERPRETED BACKWARDS" — THE
// IDENTICAL DISCIPLINE 0.8.102/0.8.81 ALREADY HELD FOR PUBLICATIONS,
// EXTENDED TO REFERENCES. This file never looks at application/
// PublicationReferenceGraphView.js's own already-computed, present-tense
// graph and tries to infer, after the fact, when a threshold must have been
// crossed — that would silently assume today's node counts describe
// history, which they do not once records are deleted, re-imported, or
// simply observed out of order. Instead, every `PublicationReferenceRecord`
// this replica holds is first placed into one fixed, reproducible source
// order (the exact array position `publicationReferenceRecords` itself
// already holds it at), and only THAT fixed-order sequence is ever stably
// sorted, by `createdAt`, ties broken by that same fixed source order —
// word for word the same two-step ordering `describeAchievementEvents()`'s
// own 0.8.102 loop above already performs for publication records. If the
// 10th distinct publisher references Bob at time T, the event's own
// `observedAt` — and its `triggeringReference.createdAt` — is T, whatever
// order this replica happened to import or observe the underlying records
// in.
//
// NODE IDENTITY IS `blockchain` + `chainReference` — NEVER `contentHash`,
// THE SAME RULE 0.8.104/0.8.105 ALREADY HOLD, HELD HERE ONCE MORE. Every
// grouping decision below — "have I already seen this source create a
// reference," "how many distinct sources has this target been referenced
// by" — is made through `BlockchainPublicationIdentity#sameAs()`'s (0.8.89)
// own two fields, via the identical `${blockchain}:${chainReference}`
// shorthand key application/PublicationReferenceGraphView.js's own
// `identityKey()` (0.8.105) already established as provably equivalent to
// `sameAs()` — reimplemented locally here, never imported, because this
// file's own header already holds "PURE AND STATELESS: NO ARCHIVE ACCESS OF
// ITS OWN" and composes no other projection file's internals. Two
// publications sharing an identical `contentHash` — on the same chain or
// across two different ones — remain two entirely separate identities for
// every one of these five achievement kinds, exactly as they already are
// everywhere else in this codebase.
//
// CROSS-CHAIN IS `source.blockchain !== referenced.blockchain` — NOTHING
// ELSE, AND NEVER CONTENT SIMILARITY. `FIRST_CROSS_CHAIN_REFERENCE` reads
// exactly one comparison — the two identities' own `blockchain` fields,
// both drawn from the closed `BlockchainKind` vocabulary (application/
// BlockchainKind.js) — and nothing about `contentHash`, text similarity, or
// any other resemblance-based signal `docs/Principles.md`, "Correlate
// Evidence By Explicit Identity, Never By Resemblance (0.8.78)," already
// forbids inferring identity from.
//
// NO NEW DURABLE COLLECTION, NO SCHEMA_VERSION BUMP — THE IDENTICAL
// RESTRAINT HELD ONE LAYER UP. `application/PublicationObservationArchive.js`
// gains nothing from this milestone: it already held
// `publicationReferenceRecords` since 0.8.104, unchanged, and this file
// merely reads that same array a second way. Deleting or changing a
// `PublicationReferenceRecord` naturally changes which reference-derived
// achievement events this file computes on the next call — there is no
// stale, second copy of "Bob's achievements" anywhere for a deletion to
// leave behind.
//
// STILL NO POINTS, REPUTATION, XP, LEVELS, RARITY, "POPULAR" LABELS,
// LEADERBOARDS, ACHIEVEMENT SCORES, WEIGHTED REFERENCES, TRUST, OR
// "INFLUENCER" CLASSIFICATIONS. Every one of those is an interpretation of
// the graph 0.8.105 already refused to bake in; this milestone states
// exactly one thing per event — "this explicitly defined threshold was
// crossed, by this exact record, at this point in the durable record
// history" — and nothing more. See docs/Principles.md, "An Achievement
// Describes An Attributable Fact, Not A Person's Worth (0.8.102)," held
// here once more, over a relationship between two publications rather than
// a single one.
export const AchievementKind = Object.freeze({
    FIRST_PUBLICATION: 'first-publication',
    BITCOIN_PUBLISHER: 'bitcoin-publisher',
    BASE_PUBLISHER: 'base-publisher',
    MULTI_CHAIN_PUBLISHER: 'multi-chain-publisher',
    PUBLICATION_10: 'publication-10',
    PUBLICATION_100: 'publication-100',
    // 0.8.106 — Reference-Derived Achievement Events.
    FIRST_REFERENCE_CREATED: 'first-reference-created',
    FIRST_REFERENCE_RECEIVED: 'first-reference-received',
    REFERENCED_BY_10_PUBLICATIONS: 'referenced-by-10-publications',
    REFERENCED_BY_100_PUBLICATIONS: 'referenced-by-100-publications',
    FIRST_CROSS_CHAIN_REFERENCE: 'first-cross-chain-reference'
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
    [AchievementKind.PUBLICATION_100]: 'One hundred publications',
    // 0.8.106 — Reference-Derived Achievement Events.
    [AchievementKind.FIRST_REFERENCE_CREATED]: 'First reference created',
    [AchievementKind.FIRST_REFERENCE_RECEIVED]: 'First reference received',
    [AchievementKind.REFERENCED_BY_10_PUBLICATIONS]: 'Referenced by 10 publications',
    [AchievementKind.REFERENCED_BY_100_PUBLICATIONS]: 'Referenced by 100 publications',
    [AchievementKind.FIRST_CROSS_CHAIN_REFERENCE]: 'First cross-chain reference'
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

// 0.8.106 — the identical milestone shape as PUBLICATION_COUNT_MILESTONES
// above, one layer over, evaluated against a publication's own DISTINCT
// referencing-publication count — never its raw incoming reference-record
// count. Adding a new threshold (e.g. 1,000) is, exactly as above, a
// deliberate, future, one-line change here — never a caller-supplied,
// open-ended parameter.
const REFERENCE_RECEIVED_MILESTONES = Object.freeze([
    Object.freeze({ threshold: 10, achievementKind: AchievementKind.REFERENCED_BY_10_PUBLICATIONS }),
    Object.freeze({ threshold: 100, achievementKind: AchievementKind.REFERENCED_BY_100_PUBLICATIONS })
]);

function toChainEntries(records, blockchain, RecordClass) {
    const list = Array.isArray(records) ? records : [];
    return list
        .filter((record) => record instanceof RecordClass)
        .map((record) => Object.freeze({ blockchain, record }));
}

function timestampMillis(date) {
    return date instanceof Date ? date.getTime() : 0;
}

function createdAtMillis({ record }) {
    return timestampMillis(record.createdAt);
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

// 0.8.106 — the one, local, non-exported shorthand key this file uses to
// decide "have I already seen this exact publication identity," provably
// equivalent to `BlockchainPublicationIdentity#sameAs()` for the identical
// reason application/PublicationReferenceGraphView.js's own `identityKey()`
// (0.8.105) already documents: `blockchain` is always one of the closed
// `BlockchainKind` values, none of which can ever contain the `:`
// separator, so no two distinct `(blockchain, chainReference)` pairs can
// ever collide onto the same key. Reimplemented locally rather than
// imported — this file reads no other projection file's internals, exactly
// as its own header already holds.
function referenceIdentityKey(identity) {
    return `${identity.blockchain}:${identity.chainReference}`;
}

// The fixed, reproducible source order (this array's own existing
// position), stably sorted by `createdAt`, ties broken by that same fixed
// source order — word for word the same two-step ordering the publication
// loop below already performs, extended to `PublicationReferenceRecord`
// (0.8.104) instances. Malformed/absent input, or an array holding
// anything other than a genuine `PublicationReferenceRecord`, is tolerated
// exactly like every other entry point in this file: the offending entries
// are silently excluded, never thrown on.
function toChronologicalReferenceRecords(publicationReferenceRecords) {
    const list = Array.isArray(publicationReferenceRecords) ? publicationReferenceRecords : [];
    return list
        .map((record, sourceIndex) => ({ record, sourceIndex }))
        .filter(({ record }) => record instanceof PublicationReferenceRecord)
        .sort((a, b) => {
            const delta = timestampMillis(a.record.createdAt) - timestampMillis(b.record.createdAt);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ record }) => record);
}

// 0.8.106 — the reference-derived counterpart of `achievementEvent()`
// above. `attributedIdentity` is whichever of the triggering record's own
// two identities this particular achievement kind is attributed to (see
// this file's own header for the per-kind attribution rule); `record`
// itself — the exact `PublicationReferenceRecord` that crossed the
// threshold — is carried through in full as `triggeringReference`, never
// reduced to a bare count.
function referenceAchievementEvent(achievementKind, attributedIdentity, record, index) {
    return Object.freeze({
        achievementKind,
        label: ACHIEVEMENT_LABEL[achievementKind],
        observedAt: record.createdAt,
        sourcePublicationIdentity: attributedIdentity,
        triggeringReference: Object.freeze({
            sourcePublicationIdentity: record.sourcePublicationIdentity,
            referencedPublicationIdentity: record.referencedPublicationIdentity,
            createdAt: record.createdAt
        }),
        index
    });
}

// 0.8.106 — the pure, reference-derived achievement computation. Walks
// `publicationReferenceRecords` in chronological order (never today's
// already-grouped graph — see this file's own header, "Chronological,
// Never 'Today's Graph Reinterpreted Backwards'") and pushes every newly
// earned event straight onto the SAME `events` array the 0.8.102
// publication loop already built, in the exact fixed per-record order this
// file's own header documents: FIRST_REFERENCE_CREATED,
// FIRST_REFERENCE_RECEIVED, a REFERENCE_RECEIVED_MILESTONES crossing (at
// most one per record — a distinct-source count can only ever advance by
// exactly one per record), then FIRST_CROSS_CHAIN_REFERENCE. Strictly
// additive: `events` is never read, reordered, or spliced — only ever
// appended to, exactly the discipline every `appendXxx()` in application/
// PublicationObservationArchive.js already holds for its own durable
// collections.
function appendReferenceAchievementEvents(events, publicationReferenceRecords) {
    const chronological = toChronologicalReferenceRecords(publicationReferenceRecords);

    const sourcesThatHaveCreatedAReference = new Set();
    const publicationsThatHaveReceivedAReference = new Set();
    const distinctSourcesByReferencedKey = new Map();
    const sourcesThatHaveMadeACrossChainReference = new Set();

    for (const record of chronological) {
        const sourceKey = referenceIdentityKey(record.sourcePublicationIdentity);
        const referencedKey = referenceIdentityKey(record.referencedPublicationIdentity);
        const newlyEarned = [];

        if (!sourcesThatHaveCreatedAReference.has(sourceKey)) {
            sourcesThatHaveCreatedAReference.add(sourceKey);
            newlyEarned.push({ achievementKind: AchievementKind.FIRST_REFERENCE_CREATED, attributedIdentity: record.sourcePublicationIdentity });
        }

        if (!publicationsThatHaveReceivedAReference.has(referencedKey)) {
            publicationsThatHaveReceivedAReference.add(referencedKey);
            newlyEarned.push({ achievementKind: AchievementKind.FIRST_REFERENCE_RECEIVED, attributedIdentity: record.referencedPublicationIdentity });
        }

        // "Referenced by 10 publications" means 10 DISTINCT source
        // identities — never 10 reference records. A repeat reference from
        // a source already counted for this target never grows this set,
        // and therefore never crosses a threshold a second time.
        let distinctSources = distinctSourcesByReferencedKey.get(referencedKey);
        if (!distinctSources) {
            distinctSources = new Set();
            distinctSourcesByReferencedKey.set(referencedKey, distinctSources);
        }
        if (!distinctSources.has(sourceKey)) {
            distinctSources.add(sourceKey);
            const distinctCount = distinctSources.size;
            for (const milestone of REFERENCE_RECEIVED_MILESTONES) {
                if (distinctCount === milestone.threshold) {
                    newlyEarned.push({ achievementKind: milestone.achievementKind, attributedIdentity: record.referencedPublicationIdentity });
                }
            }
        }

        // Cross-chain is strictly `source.blockchain !== referenced.blockchain`
        // — nothing about contentHash or resemblance — and is attributed to
        // the SOURCE, once per distinct source, ever. The reverse direction
        // is a different source identity, and therefore a genuinely separate
        // occurrence, never assumed already earned.
        if (record.sourcePublicationIdentity.blockchain !== record.referencedPublicationIdentity.blockchain
            && !sourcesThatHaveMadeACrossChainReference.has(sourceKey)) {
            sourcesThatHaveMadeACrossChainReference.add(sourceKey);
            newlyEarned.push({ achievementKind: AchievementKind.FIRST_CROSS_CHAIN_REFERENCE, attributedIdentity: record.sourcePublicationIdentity });
        }

        for (const { achievementKind, attributedIdentity } of newlyEarned) {
            events.push(referenceAchievementEvent(achievementKind, attributedIdentity, record, events.length + 1));
        }
    }
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
export function describeAchievementEvents(bitcoinAnchorPublicationRecords = [], baseAnchorPublicationRecords = [], publicationReferenceRecords = []) {
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

    // 0.8.106 — strictly additive: appends reference-derived events onto
    // the SAME array the loop above already built, never touching one of
    // its entries. An empty (or omitted) `publicationReferenceRecords`
    // appends nothing, leaving the 0.8.102 result byte-for-byte unchanged.
    appendReferenceAchievementEvents(events, publicationReferenceRecords);

    return Object.freeze({ count: events.length, events: Object.freeze(events) });
}

// reconstructAchievementEvents() — the ONE, thin, archive-reading entry
// point, mirroring application/
// BaseAnchorPublicationLifecycleTimelineView.js#
// reconstructBaseAnchorPublicationLifecycleTimeline() (0.8.101) exactly.
// It pulls this replica's own `bitcoinAnchorPublicationRecords`,
// `baseAnchorPublicationRecords`, and (0.8.106) `publicationReferenceRecords`
// straight out of `archive`, unchanged, and hands them to the pure function
// above. An invalid/missing archive is treated as
// `PublicationObservationArchive.empty()` — zero records, zero achievement
// events, never an error.
export function reconstructAchievementEvents(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describeAchievementEvents(
        safeArchive.bitcoinAnchorPublicationRecords,
        safeArchive.baseAnchorPublicationRecords,
        safeArchive.publicationReferenceRecords
    );
}
