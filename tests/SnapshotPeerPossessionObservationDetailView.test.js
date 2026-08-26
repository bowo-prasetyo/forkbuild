import { LocalContentStore } from '../content/LocalContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { SnapshotPeerPossessionState } from '../application/SnapshotPeerPossessionState.js';
import { toSnapshotPeerPossessionObservation } from '../application/SnapshotPeerPossessionObservation.js';
import {
    appendSnapshotPeerPossessionObservationHistoryEntry,
    latestSnapshotPeerPossessionObservationsByPeer
} from '../application/SnapshotPeerPossessionObservationHistory.js';
import { describeSnapshotPeerPossessionComparison } from '../application/SnapshotPeerPossessionComparisonView.js';
import {
    describeSnapshotPeerPossessionObservationDetail,
    describeSnapshotPeerPossessionObservationDetails
} from '../application/SnapshotPeerPossessionObservationDetailView.js';

// 0.8.45 — Explicit Peer Possession Observation Inspection.
//
//   Section A: describeSnapshotPeerPossessionObservationDetail() and
//              describeSnapshotPeerPossessionObservationDetails() are
//              pure, frozen, order-preserving, and add no fact beyond
//              what an observation already carries — plus two ALREADY
//              EXISTING sentences this codebase produces elsewhere for
//              the same `state`: application/
//              SnapshotPeerPossessionView.js#describePeerPossessionAttempt()'s
//              own full-sentence `label` (here `stateLabel`) and
//              application/SnapshotPeerPossessionComparisonView.js#
//              describeSnapshotPeerPossessionStateLabel()'s own short word
//              (here `stateShortLabel`). No availability percentage, no
//              reliability, no ranking vocabulary anywhere.
//   Section B: neither function performs a new content check, contacts a
//              peer, resolves a placement, or mutates the observation/array
//              it was given.
//   Section C — FLAGSHIP A: same observation, different later reality.
//              Alice reports AVAILABLE to Bob at t1. Alice's own bytes are
//              then deleted. A fresh check at t2 honestly reports
//              NOT_AVAILABLE, and a SECOND observation is appended — but
//              Bob's own first observation, and its detail narration, are
//              BYTE-IDENTICAL before and after. Inspecting history never
//              rewrites an earlier observation.
//   Section D — FLAGSHIP B: same current observations, different
//              histories. Replica X's history is [Alice → AVAILABLE].
//              Replica Y's history is [Alice → NOT_AVAILABLE, Alice →
//              AVAILABLE]. Their latest-per-peer comparisons are
//              byte-identical (both AVAILABLE), while their complete
//              detail histories remain different (different counts,
//              different entries) — reinforcing the existing distinction
//              between latest observation, comparison projection, and
//              historical observations.
//
// See docs/Principles.md, "Peer Possession Observations Describe What
// Peers Report; They Do Not Become Placement Claims (0.8.41)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The identical evaluative-vocabulary scan tests/
// SnapshotMaterializationHistoryDetailView.test.js's own
// assertNoForbiddenVocabulary() already established, extended here with
// the peer-specific terms the milestone explicitly excludes (reliability,
// availability percentage, source ranking, "best"/"most reliable" peer).
const FORBIDDEN_WORDS = [
    'confidence', 'quality', 'reliability', 'bestsource', 'preferredsource', 'successrate',
    'score', 'rank', 'trust', 'verified', 'canonical', 'recommended', 'best', 'preferred',
    'availabilitypercentage', 'percentage', 'bestpeer', 'mostreliable', 'peerscore', 'sourceranking'
];
function assertNoForbiddenVocabulary(value, path, message) {
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
        const lowerKey = key.toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!lowerKey.includes(forbidden), `${message} — forbidden field "${key}" found at ${path}${key}`);
        }
        assertNoForbiddenVocabulary(value[key], `${path}${key}.`, message);
    }
}

function observationAt(peerId, state, isoTime, overrides = {}) {
    return toSnapshotPeerPossessionObservation({
        peerId, publicationId: 'pub-1', contentHash: 'hash-a', state, observedAt: new Date(isoTime), ...overrides
    });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — pure, frozen, ordered, and adds only stateLabel/stateShortLabel
    // ---------------------------------------------------------------
    {
        const observedAt1 = new Date('2026-08-26T20:21:04Z');
        const observedAt2 = new Date('2026-08-26T20:21:07Z');
        const available = observationAt('conn-alice', SnapshotPeerPossessionState.AVAILABLE, observedAt1);
        const unavailable = toSnapshotPeerPossessionObservation({
            peerId: 'conn-dave', publicationId: 'pub-1', contentHash: 'hash-a',
            state: SnapshotPeerPossessionState.UNAVAILABLE, observedAt: observedAt2
        });

        const details = describeSnapshotPeerPossessionObservationDetails([available, unavailable]);
        assert(details.count === 2 && details.entries.length === 2, '1. count and entries.length match the observations given');
        assert(Object.isFrozen(details), '2. the top-level result is frozen');
        assert(Object.isFrozen(details.entries), '3. the entries array is frozen');
        assert(Object.isFrozen(details.entries[0]), '4. each individual entry is frozen');

        assert(details.entries[0].peerId === 'conn-alice' && details.entries[0].publicationId === 'pub-1' && details.entries[0].contentHash === 'hash-a',
            '5. peerId/publicationId/contentHash are carried through unchanged');
        assert(details.entries[0].state === SnapshotPeerPossessionState.AVAILABLE, '6. the raw state is carried through unchanged');
        assert(details.entries[0].observedAt.getTime() === observedAt1.getTime(), '7. observedAt is carried through unchanged, oldest first — never sorted or reordered');
        assert(details.entries[0].stateShortLabel === 'Available', '8. AVAILABLE gets the short label "Available"');
        assert(details.entries[0].stateLabel === 'Peer reports snapshot available',
            '9. AVAILABLE gets the SAME full-sentence label application/SnapshotPeerPossessionView.js#describePeerPossessionAttempt() already produces');

        // UNAVAILABLE deliberately stays "Could not determine," never "Not available."
        assert(details.entries[1].stateShortLabel === 'Could not determine', '10. UNAVAILABLE\'s short label is "Could not determine," never "Not available"');
        assert(details.entries[1].stateLabel === 'No answer from peer',
            '11. UNAVAILABLE\'s full-sentence label matches describePeerPossessionAttempt()\'s own wording exactly');

        // describeSnapshotPeerPossessionObservationDetail() on a single observation matches the batch call exactly.
        const singleEntry = describeSnapshotPeerPossessionObservationDetail(available);
        assert(JSON.stringify(singleEntry) === JSON.stringify(details.entries[0]),
            '12. describeSnapshotPeerPossessionObservationDetail() on one observation matches describeSnapshotPeerPossessionObservationDetails()\'s own entry for it exactly');
        assert(describeSnapshotPeerPossessionObservationDetail(null) === null, '13. describeSnapshotPeerPossessionObservationDetail(null) reports null, never throws');

        // Tolerant of null/empty, never throws.
        assert(describeSnapshotPeerPossessionObservationDetails(null).count === 0, '14. a null observations array reports zero entries, never throws');
        assert(describeSnapshotPeerPossessionObservationDetails([]).entries.length === 0, '15. an empty observations array reports zero entries');

        // Purity: calling twice with the identical observations yields a byte-identical result.
        assert(JSON.stringify(describeSnapshotPeerPossessionObservationDetails([available, unavailable])) === JSON.stringify(details),
            '16. calling twice with identical observations returns a byte-identical result');

        // No evaluative/reliability vocabulary anywhere in the composed shape.
        assertNoForbiddenVocabulary(details, '', '17. the composed detail view');

        // No availability percentage or any derived ratio field exists anywhere on the shape.
        for (const entry of details.entries) {
            assert(!('availabilityPercentage' in entry), '18. no entry ever carries an "availabilityPercentage" field');
            assert(!('reliability' in entry) && !('score' in entry), '19. no entry ever carries a "reliability" or "score" field');
        }
    }
    console.log('✓ Section A: describeSnapshotPeerPossessionObservationDetail()/describeSnapshotPeerPossessionObservationDetails() are pure, frozen, order-preserving, and add only stateLabel/stateShortLabel — both already-existing sentences composed together, never new vocabulary');

    // ---------------------------------------------------------------
    // Section B — inspection never performs a new action, and never mutates anything it was given
    // ---------------------------------------------------------------
    {
        const observation = observationAt('conn-bob', SnapshotPeerPossessionState.NOT_AVAILABLE, '2026-08-26T20:21:10Z');
        const history = appendSnapshotPeerPossessionObservationHistoryEntry([], observation);
        const beforeJson = JSON.stringify(history);

        describeSnapshotPeerPossessionObservationDetails(history);
        describeSnapshotPeerPossessionObservationDetail(observation);

        assert(JSON.stringify(history) === beforeJson, '1. INVARIANT: inspecting a history never mutates the history array or any observation inside it');
        assert(Object.isFrozen(observation), '2. the individual observation record itself stays frozen, exactly as application/SnapshotPeerPossessionObservation.js already established');

        // No network/store/coordinator dependency exists anywhere in this
        // module — both functions are synchronous and take no coordinator,
        // use case, catalog, or store as an argument, so there is no way
        // for either call above to have contacted a peer, performed a new
        // local content check, or resolved a placement.
        assert(describeSnapshotPeerPossessionObservationDetails.length <= 1, '3. describeSnapshotPeerPossessionObservationDetails() takes only an array of observations — no coordinator, catalog, or store it could use to perform a new action');
        assert(describeSnapshotPeerPossessionObservationDetail.length <= 1, '4. describeSnapshotPeerPossessionObservationDetail() takes only one observation — no coordinator, catalog, or store it could use to perform a new action');
    }
    console.log('✓ Section B: inspection performs no new content check, contacts no peer, resolves no placement, and mutates neither the history nor any observation it was given');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP A: same observation, different later reality
    // ---------------------------------------------------------------
    {
        const bytes = JSON.stringify({ snapshot: 'flagship-a-bytes' });
        const contentHash = computeContentHash(bytes);
        const publication = { id: 'pub-flagship-a', contentReference: new ContentReference({ hash: contentHash }) };

        const aliceStorageProvider = new InMemoryStorageProvider();
        const aliceContentStore = new LocalContentStore(aliceStorageProvider);
        const aliceStoreUseCase = new StoreSnapshotContentUseCase(aliceContentStore);
        const aliceChecker = new CheckLocalSnapshotContentAvailabilityUseCase(aliceContentStore);

        await aliceStoreUseCase.execute({ contentHash, bytes });
        const firstCheck = await aliceChecker.execute(publication);
        assert(firstCheck.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '1. Alice genuinely holds the bytes at t1');

        const observedAt1 = new Date('2026-08-26T20:21:04Z');
        const firstObservation = toSnapshotPeerPossessionObservation({
            peerId: 'conn-alice', publicationId: publication.id, contentHash, state: SnapshotPeerPossessionState.AVAILABLE, observedAt: observedAt1
        });
        let bobHistory = appendSnapshotPeerPossessionObservationHistoryEntry([], firstObservation);

        const firstDetailsBefore = describeSnapshotPeerPossessionObservationDetails(bobHistory);
        assert(firstDetailsBefore.count === 1 && firstDetailsBefore.entries[0].stateShortLabel === 'Available',
            '2. Bob\'s own detail narration holds exactly one observation, reading "Available"');

        // Alice's own bytes vanish underneath her — never an explicit
        // observation action, so the FIRST observation (and Bob's own
        // history of it) is never touched by this alone.
        aliceStorageProvider.remove('content:' + contentHash);
        const secondCheck = await aliceChecker.execute(publication);
        assert(secondCheck.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '3. Alice honestly now reports NOT_AVAILABLE');

        const observedAt2 = new Date('2026-08-26T20:22:15Z');
        const secondObservation = toSnapshotPeerPossessionObservation({
            peerId: 'conn-alice', publicationId: publication.id, contentHash, state: SnapshotPeerPossessionState.NOT_AVAILABLE, observedAt: observedAt2
        });
        bobHistory = appendSnapshotPeerPossessionObservationHistoryEntry(bobHistory, secondObservation);

        const detailsAfter = describeSnapshotPeerPossessionObservationDetails(bobHistory);
        assert(detailsAfter.count === 2, '4. the SECOND observation is appended — Bob now holds two observations, never one "refreshed" observation');
        assert(JSON.stringify(detailsAfter.entries[0]) === JSON.stringify(firstDetailsBefore.entries[0]),
            '5. INVARIANT: Bob\'s FIRST observation\'s own detail narration is BYTE-IDENTICAL before and after Alice\'s bytes vanished — "Alice reported AVAILABLE at 20:21:04" is never rewritten');
        assert(detailsAfter.entries[0].stateShortLabel === 'Available', '6. INVARIANT: the first entry still reads "Available," even though Alice no longer currently holds the bytes');
        assert(detailsAfter.entries[1].stateShortLabel === 'Not available', '7. the SECOND, later entry honestly reads "Not available" — a NEW fact, not a correction of the first');
        assert(detailsAfter.entries[0].observedAt === observedAt1 && detailsAfter.entries[1].observedAt === observedAt2,
            '8. both entries keep their own original observedAt, oldest first');

        assertNoForbiddenVocabulary(detailsAfter, '', '9. the two-entry history');
    }
    console.log('✓ Section C: FLAGSHIP A — Alice reports AVAILABLE, then her bytes vanish underneath her; a later, second observation honestly reports NOT_AVAILABLE, but Bob\'s first observation\'s own detail narration never changes');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP B: same current observations, different histories
    // ---------------------------------------------------------------
    {
        const replicaXHistory = appendSnapshotPeerPossessionObservationHistoryEntry(
            [], observationAt('conn-alice', SnapshotPeerPossessionState.AVAILABLE, '2026-08-26T20:21:00Z')
        );

        let replicaYHistory = appendSnapshotPeerPossessionObservationHistoryEntry(
            [], observationAt('conn-alice', SnapshotPeerPossessionState.NOT_AVAILABLE, '2026-08-26T20:19:00Z')
        );
        replicaYHistory = appendSnapshotPeerPossessionObservationHistoryEntry(
            replicaYHistory, observationAt('conn-alice', SnapshotPeerPossessionState.AVAILABLE, '2026-08-26T20:21:00Z')
        );

        const xLatest = latestSnapshotPeerPossessionObservationsByPeer(replicaXHistory);
        const yLatest = latestSnapshotPeerPossessionObservationsByPeer(replicaYHistory);
        const xComparison = describeSnapshotPeerPossessionComparison('pub-1', 'hash-a', xLatest);
        const yComparison = describeSnapshotPeerPossessionComparison('pub-1', 'hash-a', yLatest);
        assert(JSON.stringify(xComparison) === JSON.stringify(yComparison),
            '1. both replicas\' latest-per-peer comparisons are byte-identical — both report Alice as AVAILABLE');

        const xDetails = describeSnapshotPeerPossessionObservationDetails(replicaXHistory);
        const yDetails = describeSnapshotPeerPossessionObservationDetails(replicaYHistory);
        assert(xDetails.count === 1, '2. replica X\'s own full history holds exactly one observation');
        assert(yDetails.count === 2, '3. replica Y\'s own full history holds exactly two observations');
        assert(JSON.stringify(xDetails) !== JSON.stringify(yDetails),
            '4. INVARIANT: the two replicas\' full detail histories remain DIFFERENT, despite reporting the identical current (latest-per-peer) comparison');
        assert(yDetails.entries[0].stateShortLabel === 'Not available' && yDetails.entries[1].stateShortLabel === 'Available',
            '5. replica Y\'s own history still narrates BOTH of Alice\'s observations, in order — never collapsed down to only the latest');

        assertNoForbiddenVocabulary(xDetails, '', '6. replica X\'s own detail history');
        assertNoForbiddenVocabulary(yDetails, '', '7. replica Y\'s own detail history');
    }
    console.log('✓ Section D: FLAGSHIP B — replica X (one observation) and replica Y (two observations, the first later superseded) both project to the identical current comparison, while their own complete detail histories remain distinct — latest observation, comparison projection, and historical observations stay three separate facts');

    console.log('\n✅ All SnapshotPeerPossessionObservationDetailView tests passed');
}

run().catch((error) => {
    console.error('❌ SnapshotPeerPossessionObservationDetailView tests failed:', error);
    process.exitCode = 1;
});
