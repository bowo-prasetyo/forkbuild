import { describePublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from './PublisherLeaderboardSnapshotFingerprint.js';
import { describePublisherLeaderboardSnapshotDifference } from './PublisherLeaderboardSnapshotDifference.js';

// 0.8.136 — Historical Leaderboard Snapshot Timeline Projection.
//
// 0.8.119 proved a leaderboard CONCLUSION could be identified and
// reproduced. 0.8.134 proved any TWO of those conclusions — regardless of
// where either came from — could be compared, side by side, over four
// independent change facts. 0.8.135 proved a single stored claim could be
// checked against an explicitly supplied historical snapshot, never a
// reconstructed one. None of them ever asked the question a SEQUENCE of
// historical snapshots naturally raises the moment more than two of them
// sit together: how did the snapshot itself evolve, one step at a time,
// across an entire caller-supplied history? This file is that question,
// answered as a projection over 0.8.134's own comparison, never a second
// one:
//
//   Snapshot A        Snapshot B        Snapshot C
//        │                 │                 │
//        └── difference ───┘                 │
//         (0.8.134, UNCHANGED)                │
//                          └── difference ────┘
//                           (0.8.134, UNCHANGED)
//                                   │
//                                   ▼
//        describePublisherLeaderboardSnapshotTimeline()
//                                   │
//                                   ▼
//   { snapshotCount, snapshots: [{ evidenceFingerprint, policyVersion,
//     snapshotFingerprint }, ...],
//     transitionCount, transitions: [{ fromSnapshotFingerprint,
//     toSnapshotFingerprint, difference }, ...] }
//
// A SEQUENCE-LEVEL PROJECTION, NEVER A THIRD COMPARISON ENGINE. This file
// performs exactly one piece of original work: walking a caller-supplied
// list of snapshots pairwise, adjacent element to adjacent element. Every
// actual comparison between two snapshots is
// `describePublisherLeaderboardSnapshotDifference()` (0.8.134, UNCHANGED),
// called once per adjacent pair and embedded on the result, byte for byte,
// as `transitions[i].difference` — never re-derived, never summarized, and
// never re-computed by a second, competing algorithm. Grep this file and
// there is no `JSON.stringify(...) !== JSON.stringify(...)` anywhere in
// it, no `evidenceFingerprintChanged`, no `policyChanged`, no
// `leaderboardChanged` — every one of 0.8.134's own change facts already
// exists, in full, one level down, inside each transition's own
// `difference`.
//
// THE CALLER SUPPLIES THE ORDER; THIS FILE NEVER INVENTS A CLOCK. Exactly
// like 0.8.135's own "the caller supplies both the stored claim and the
// historical snapshot to check it against," a snapshot carries no
// timestamp of its own (0.8.119's own "snapshot identity is the pair
// (evidenceFingerprint, policy.version) — never a timestamp," UNCHANGED),
// so there is no field on a snapshot this file could sort by even if it
// wanted to. `snapshots` is read strictly in the order the caller passed
// it, and `transitions[i]` is always the difference between
// `snapshots[i]` and `snapshots[i + 1]`, positionally — never reordered by
// a discovered or inferred chronology. A caller who supplies snapshots out
// of their intended historical order receives a timeline over the order
// they actually supplied, honestly reported as such, not a "corrected"
// one. If a snapshot artifact ever grows an explicit sequence field, that
// can become an ordering mechanism a caller applies BEFORE calling this
// file; this file adds no clock of its own to pre-empt that later choice.
//
// AN ALL-FALSE TRANSITION IS A LEGITIMATE, PRESERVED ENTRY — NEVER
// SILENTLY DROPPED. Two adjacent snapshots can be semantically identical
// (every one of 0.8.134's own four change facts `false`), and this file
// still reports that pair as one transition, in its own position in
// `transitions`, exactly like every other pair. `transitionCount` always
// equals `snapshotCount - 1` for a non-empty timeline (never fewer,
// because a repeated snapshot was "collapsed") — this file performs no
// deduplication, no run-length compression, and no filtering of any kind
// over the sequence it was handed. A faithful narration of history
// includes the moments where nothing changed.
//
// EACH SNAPSHOT'S OWN IDENTITY FIELDS ARE ECHOED, NEVER RE-DERIVED BY THE
// CALLER. `snapshots[i].evidenceFingerprint` and
// `snapshots[i].policyVersion` are read straight off
// `describePublisherLeaderboardSnapshot()`'s (0.8.119, UNCHANGED) own
// normalized result for that entry; `snapshots[i].snapshotFingerprint` is
// `describePublisherLeaderboardSnapshotFingerprint()`'s (0.8.121,
// UNCHANGED) own result over that identical normalized snapshot — the same
// two functions 0.8.135's own header already reuses for a single supplied
// snapshot, applied here across an entire sequence. `transitions[i].from
// SnapshotFingerprint`/`toSnapshotFingerprint` are these same, already-
// computed fingerprints, echoed again by value so a reader can match a
// transition back to its two endpoints in `snapshots` without
// recomputing anything.
//
// NORMALIZATION REUSES 0.8.119's OWN TOLERANCE — NEVER A SECOND, PARALLEL
// FALLBACK SCHEME. Every element of `snapshots` is routed through
// `describePublisherLeaderboardSnapshot()` before its identity fields are
// read, exactly like 0.8.134's own `normalizeSnapshot()` and 0.8.135's own
// `normalizeSnapshot()` already do. A well-formed snapshot passes through
// unchanged; anything missing, `null`, or shaped like garbage normalizes
// to the identical well-defined empty snapshot 0.8.119 already defines —
// never a thrown error, and the malformed entry's own POSITION in the
// sequence is preserved, never skipped. `transitions[i].difference` is
// computed by handing the ORIGINAL (not pre-normalized) elements straight
// to `describePublisherLeaderboardSnapshotDifference()`, which performs
// its own, identical normalization internally — this file never
// normalizes twice, and never normalizes differently for the summary list
// than 0.8.134 does for the difference embedded beside it.
//
// A SEQUENCE OF SNAPSHOTS, NEVER A SEQUENCE OF SIGNED CLAIMS. This file
// imports nothing from `application/LeaderboardClaimRecord.js`,
// `application/PublisherLeaderboardClaimHistoryView.js`, or
// `application/PublisherLeaderboardHistoricalClaimVerification.js`
// (0.8.123/0.8.130/0.8.135) — grep it and none of that vocabulary appears.
// `describePublisherLeaderboardSnapshotTimeline()` accepts a plain array
// of already-computed `PublisherLeaderboardSnapshot`-shaped values,
// exactly like 0.8.134's own two arguments — never a claim, never a
// `LeaderboardClaimRecord`, and never anything this file would need to
// verify a signature over. Relating a signer's own claim history
// (0.8.133) to a snapshot sequence like this one is a genuinely different,
// later question this milestone deliberately does not answer — see
// "Deliberately excluded," below.
//
// NO INTERPRETATION OF WHY A TRANSITION CHANGED, ONLY THAT IT DID — THE
// IDENTICAL BOUNDARY 0.8.134's OWN HEADER ALREADY HOLDS, HELD HERE AGAIN
// OVER A SEQUENCE INSTEAD OF A PAIR. A `leaderboardChanged: true` sitting
// beside an `evidenceFingerprintChanged: false` inside one transition's
// own `difference` is not resolved, explained, or summarized by this
// file — it is left exactly as 0.8.134 already reports it, one transition
// among possibly many, each independently legible without this file ever
// concluding a publisher "improved," "regressed," or that the SEQUENCE as
// a whole is trending any particular direction.
//
// ARCHITECTURAL BOUNDARY: SEQUENCE-LEVEL STRUCTURE OVER ALREADY-COMPUTED
// ARTIFACTS, NEVER A VERIFICATION, TRUST, OR RANKING DETERMINATION OF ANY
// KIND. This file imports nothing from
// `application/PublisherLeaderboardSnapshotVerification.js`,
// `application/PublisherLeaderboardSnapshotClaimVerification.js`, or
// `application/PublisherLeaderboardHistoricalClaimVerification.js`
// (0.8.120/0.8.121/0.8.135) — grep it and none of that vocabulary appears.
// It never determines which snapshot in the sequence is correct, never
// verifies a signature, never associates a snapshot with the signer who
// may have claimed it, and never persists or modifies anything.
//
// NO RECONSTRUCTION ENTRY POINT — DELIBERATELY, NOT AN OVERSIGHT, THE
// IDENTICAL CHOICE 0.8.134's/0.8.135's OWN HEADERS ALREADY MAKE. This
// file's one input is already a list of historical ARTIFACTS a caller
// already holds — from wherever they came, in whatever order the caller
// intends — never something this file should silently replace with
// "whatever this replica's archive currently produces" or "however many
// snapshots this replica happens to have stored." There is no
// `reconstructPublisherLeaderboardSnapshotTimeline(archive)` here, and an
// automatic, background, or periodic discovery of "every snapshot this
// replica has ever seen" is genuinely separate, later work this milestone
// deliberately declines — see "Deliberately excluded," below.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO STORAGE,
// NO NETWORK, NO MUTATION. `describePublisherLeaderboardSnapshotTimeline()`
// reads no clock and mutates neither the supplied array nor any snapshot
// inside it. Calling it twice with equivalent arguments — even reached by
// two entirely independent code paths — returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Archive reconstruction, automatic snapshot discovery, or a
//   `reconstructXxx()` entry point of any kind.** See "No reconstruction
//   entry point," above.
// - **Claim verification or claim-to-snapshot association.** A projection
//   relating a signer's own claim sequence (0.8.133) to a snapshot
//   timeline like this one — "which historical snapshot did each of a
//   signer's claims correspond to" — is genuinely separate, later work,
//   composing this file's own timeline with 0.8.133's/0.8.135's own
//   vocabulary, never folded into this pure function.
// - **Ranking recomputation of any kind.** Every transition's own
//   `difference` already carries whatever rank facts 0.8.134 computes;
//   this file recomputes none of them.
// - **Change interpretation — no `improved`, `regressed`, `trend`,
//   `direction`, or similar field anywhere.** See "No interpretation of
//   why a transition changed," above.
// - **Sorting by a timestamp not actually present on a snapshot.** See
//   "The caller supplies the order," above.
// - **Persistence of the timeline itself.** This file computes fresh,
//   every time, exactly like every other pure `describeXxx()` in this
//   family.
// - **Deduplication of snapshots.** See "An all-false transition is a
//   legitimate, preserved entry," above.
// - **Trust or reputation concepts of any kind.**
export function describePublisherLeaderboardSnapshotTimeline(snapshots) {
    const rawSnapshots = Array.isArray(snapshots) ? snapshots : [];

    const snapshotSummaries = rawSnapshots.map((rawSnapshot) => {
        const normalized = normalizeSnapshot(rawSnapshot);
        const { fingerprint: snapshotFingerprint } = describePublisherLeaderboardSnapshotFingerprint(normalized);
        return Object.freeze({
            evidenceFingerprint: normalized.evidenceFingerprint,
            policyVersion: normalized.policy.version,
            snapshotFingerprint
        });
    });

    const transitions = [];
    for (let index = 1; index < rawSnapshots.length; index++) {
        const difference = describePublisherLeaderboardSnapshotDifference(rawSnapshots[index - 1], rawSnapshots[index]);
        transitions.push(Object.freeze({
            fromSnapshotFingerprint: snapshotSummaries[index - 1].snapshotFingerprint,
            toSnapshotFingerprint: snapshotSummaries[index].snapshotFingerprint,
            difference
        }));
    }

    return Object.freeze({
        snapshotCount: snapshotSummaries.length,
        snapshots: Object.freeze(snapshotSummaries),
        transitionCount: transitions.length,
        transitions: Object.freeze(transitions)
    });
}

// Routes any value through 0.8.119's own `describePublisherLeaderboardSnapshot()`
// tolerance — see this file's own header, "Normalization reuses 0.8.119's
// own tolerance."
function normalizeSnapshot(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    return describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
}
