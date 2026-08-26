import { LocalContentStore } from '../content/LocalContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { createSnapshotMaterializationAttempt } from '../application/SnapshotMaterializationAttempt.js';
import { appendSnapshotMaterializationHistoryEntry } from '../application/SnapshotMaterializationHistory.js';
import {
    describeSnapshotMaterializationHistoryEntry,
    describeSnapshotMaterializationHistoryDetails
} from '../application/SnapshotMaterializationHistoryDetailView.js';

// 0.8.44 — Explicit Snapshot Acquisition Attempt Inspection.
//
//   Section A: describeSnapshotMaterializationHistoryEntry() and
//              describeSnapshotMaterializationHistoryDetails() are pure,
//              frozen, chronologically ordered, and add no fact beyond
//              what application/SnapshotMaterializationHistoryView.js's
//              own describeSnapshotMaterializationHistory() already
//              narrates — plus exactly one new, non-evaluative
//              `outcomeShortLabel`.
//   Section B: neither function performs a new content check, contacts a
//              peer, resolves a placement, or mutates the history/attempt
//              it was given.
//   Section C — FLAGSHIP, INVARIANT 1: identical acquisition history,
//              different current possession. Bob and Carol materialize
//              through the identical one-entry PLACEMENT history; both
//              read AVAILABLE. Bob's bytes are then deleted underneath
//              him — his own per-attempt detail is STILL byte-identical
//              to Carol's, even though his current possession now differs.
//              Inspection never reinterprets acquisition in light of
//              current possession, because it is never even given it.
//   Section D — FLAGSHIP, INVARIANT 2: identical current possession,
//              different acquisition histories. Alice (PACKAGE) and Bob
//              (PLACEMENT then PEER hash-mismatch then PLACEMENT recovery)
//              both end up AVAILABLE with byte-identical content, while
//              their own per-attempt detail narrations remain entirely
//              different.
//
// See docs/Principles.md, "Materialization History Describes Byte
// Acquisition, Not Source Trust (0.8.38)" and "Current Snapshot Possession
// Is Independent Of How The Snapshot Was Acquired (0.8.43)."

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
// PublicationSnapshotAcquisitionView.test.js's own
// assertNoForbiddenVocabulary() already established, reproduced here for
// this file's own composed shape.
const FORBIDDEN_WORDS = [
    'confidence', 'quality', 'reliability', 'bestsource', 'preferredsource', 'successrate',
    'score', 'rank', 'trust', 'verified', 'canonical', 'recommended', 'best', 'preferred'
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — pure, frozen, ordered, and adds only outcomeShortLabel
    // ---------------------------------------------------------------
    {
        const observedAt1 = new Date('2026-08-26T20:14:03Z');
        const observedAt2 = new Date('2026-08-26T20:16:41Z');
        const stored = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: StoreSnapshotContentOutcome.STORED,
            publicationId: 'pub-a', contentHash: 'hash-a', observedAt: observedAt1
        });
        const mismatch = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH,
            publicationId: 'pub-a', contentHash: 'hash-a', observedAt: observedAt2
        });
        let history = appendSnapshotMaterializationHistoryEntry([], stored);
        history = appendSnapshotMaterializationHistoryEntry(history, mismatch);

        const details = describeSnapshotMaterializationHistoryDetails(history);
        assert(details.count === 2 && details.entries.length === 2, '1. count and entries.length match the history given');
        assert(Object.isFrozen(details), '2. the top-level result is frozen');
        assert(Object.isFrozen(details.entries), '3. the entries array is frozen');
        assert(Object.isFrozen(details.entries[0]), '4. each individual entry is frozen');

        assert(details.entries[0].sourceLabel === 'Placement' && details.entries[0].outcomeLabel === 'Snapshot stored locally',
            '5. the first (oldest) entry carries the same sourceLabel/outcomeLabel describeSnapshotMaterializationHistory() already narrates');
        assert(details.entries[0].outcomeShortLabel === 'Stored', '6. STORED gets the short label "Stored"');
        assert(details.entries[1].sourceLabel === 'Peer' && details.entries[1].outcomeShortLabel === 'Hash mismatch',
            '7. the second (newest) entry is narrated correctly, with its own short label');
        assert(details.entries[0].observedAt === observedAt1 && details.entries[1].observedAt === observedAt2,
            '8. observedAt is carried through unchanged, oldest first — never sorted or reordered');
        assert(details.entries[0].publicationId === 'pub-a' && details.entries[0].contentHash === 'hash-a',
            '9. publicationId and contentHash are carried through unchanged');
        assert(details.entries[0].possessed === true && details.entries[1].possessed === false,
            '10. possessed mirrors describeSnapshotMaterializationHistory()\'s own definition exactly');

        // describeSnapshotMaterializationHistoryEntry() on a single attempt
        // matches exactly the corresponding element of the batch call.
        const singleEntry = describeSnapshotMaterializationHistoryEntry(stored);
        assert(JSON.stringify(singleEntry) === JSON.stringify(details.entries[0]),
            '11. describeSnapshotMaterializationHistoryEntry() on one attempt matches describeSnapshotMaterializationHistoryDetails()\'s own entry for it exactly');
        assert(describeSnapshotMaterializationHistoryEntry(null) === null, '12. describeSnapshotMaterializationHistoryEntry(null) reports null, never throws');

        // Tolerant of null/empty, never throws.
        assert(describeSnapshotMaterializationHistoryDetails(null).count === 0, '13. a null history reports zero entries, never throws');
        assert(describeSnapshotMaterializationHistoryDetails([]).entries.length === 0, '14. an empty history reports zero entries');

        // Purity: calling twice with the identical history yields a
        // byte-identical result.
        assert(JSON.stringify(describeSnapshotMaterializationHistoryDetails(history)) === JSON.stringify(details),
            '15. calling twice with the identical history returns a byte-identical result');

        // No evaluative vocabulary anywhere in the composed shape.
        assertNoForbiddenVocabulary(details, '', '16. the composed detail view');

        // outcomeShortLabel is short, factual, and forbidden-word-free —
        // the identical restraint tests/SnapshotMaterializationHistory
        // .test.js's own check on the full-sentence outcome labels.
        const shortLabels = ['Stored', 'Already available', 'Hash mismatch'];
        for (const label of shortLabels) {
            for (const forbidden of FORBIDDEN_WORDS) {
                assert(!label.toLowerCase().includes(forbidden), `17. outcomeShortLabel "${label}" never contains the forbidden word "${forbidden}"`);
            }
        }
    }
    console.log('✓ Section A: describeSnapshotMaterializationHistoryEntry()/describeSnapshotMaterializationHistoryDetails() are pure, frozen, chronologically ordered, and add only a non-evaluative outcomeShortLabel');

    // ---------------------------------------------------------------
    // Section B — inspection never performs a new action, and never
    // mutates anything it was given
    // ---------------------------------------------------------------
    {
        const attempt = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED,
            publicationId: 'pub-b', contentHash: 'hash-b'
        });
        const history = appendSnapshotMaterializationHistoryEntry([], attempt);
        const beforeJson = JSON.stringify(history);

        describeSnapshotMaterializationHistoryDetails(history);
        describeSnapshotMaterializationHistoryEntry(attempt);

        assert(JSON.stringify(history) === beforeJson, '1. INVARIANT: inspecting a history never mutates the history array or any attempt inside it');
        assert(Object.isFrozen(attempt), '2. the individual attempt record itself stays frozen, exactly as application/SnapshotMaterializationAttempt.js already established');

        // No network/store dependency exists anywhere in this module —
        // both functions are synchronous and take no coordinator, use
        // case, catalog, or store as an argument, so there is no way for
        // either call above to have performed a new content check,
        // resolved a placement, or contacted a peer.
        assert(describeSnapshotMaterializationHistoryDetails.length <= 1, '3. describeSnapshotMaterializationHistoryDetails() takes only a history — no coordinator, catalog, or store it could use to perform a new action');
        assert(describeSnapshotMaterializationHistoryEntry.length <= 1, '4. describeSnapshotMaterializationHistoryEntry() takes only one attempt — no coordinator, catalog, or store it could use to perform a new action');
    }
    console.log('✓ Section B: inspection performs no new content check, contacts no peer, resolves no placement, and mutates neither the history nor any attempt it was given');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP, INVARIANT 1: identical acquisition history,
    // different current possession
    // ---------------------------------------------------------------
    {
        const bytes = JSON.stringify({ snapshot: 'shared-placement-bytes' });
        const contentHash = computeContentHash(bytes);
        const publication = { id: 'pub-bc', contentReference: new ContentReference({ hash: contentHash }) };
        const observedAt = new Date('2026-08-26T12:00:00Z');

        const bobStorageProvider = new InMemoryStorageProvider();
        const bobContentStore = new LocalContentStore(bobStorageProvider);
        const bobStoreUseCase = new StoreSnapshotContentUseCase(bobContentStore);
        const bobChecker = new CheckLocalSnapshotContentAvailabilityUseCase(bobContentStore);

        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const carolStoreUseCase = new StoreSnapshotContentUseCase(carolContentStore);
        const carolChecker = new CheckLocalSnapshotContentAvailabilityUseCase(carolContentStore);

        const bobResult = await bobStoreUseCase.execute({ contentHash, bytes });
        const carolResult = await carolStoreUseCase.execute({ contentHash, bytes });
        assert(bobResult.outcome === StoreSnapshotContentOutcome.STORED && carolResult.outcome === StoreSnapshotContentOutcome.STORED,
            '1. both Bob and Carol store the identical bytes via an identical PLACEMENT attempt');

        const bobHistory = appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: bobResult.outcome, publicationId: publication.id, contentHash, observedAt
        }));
        const carolHistory = appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: carolResult.outcome, publicationId: publication.id, contentHash, observedAt
        }));

        const bobDetailsBefore = describeSnapshotMaterializationHistoryDetails(bobHistory);
        const carolDetailsBefore = describeSnapshotMaterializationHistoryDetails(carolHistory);
        assert(JSON.stringify(bobDetailsBefore) === JSON.stringify(carolDetailsBefore), '2. Bob\'s and Carol\'s per-attempt detail narrations are byte-identical');

        const bobAvailabilityBefore = await bobChecker.execute(publication);
        const carolAvailabilityBefore = await carolChecker.execute(publication);
        assert(bobAvailabilityBefore.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE && carolAvailabilityBefore.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '3. both Bob and Carol currently report AVAILABLE');

        // Bob's bytes vanish underneath him — never an explicit
        // acquisition action, so his own history (and its detail
        // narration) is never touched.
        bobStorageProvider.remove('content:' + contentHash);

        const bobAvailabilityAfter = await bobChecker.execute(publication);
        const carolAvailabilityAfter = await carolChecker.execute(publication);
        assert(bobAvailabilityAfter.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '4. Bob now reports NOT_AVAILABLE');
        assert(carolAvailabilityAfter.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '5. Carol still reports AVAILABLE — her own bytes were never touched');

        const bobDetailsAfter = describeSnapshotMaterializationHistoryDetails(bobHistory);
        const carolDetailsAfter = describeSnapshotMaterializationHistoryDetails(carolHistory);
        assert(JSON.stringify(bobDetailsAfter) === JSON.stringify(bobDetailsBefore),
            '6. INVARIANT: Bob\'s own per-attempt detail narration is UNCHANGED by the possession loss underneath him — inspection is never re-run or re-derived from current possession');
        assert(JSON.stringify(bobDetailsAfter) === JSON.stringify(carolDetailsAfter),
            '7. INVARIANT: Bob\'s and Carol\'s detail narrations are STILL byte-identical — identical history, now genuinely different current possession, and this module was never even given the possession to react to');
    }
    console.log('✓ Section C: FLAGSHIP — identical acquisition history, different current possession — Bob and Carol materialize identically, then Bob\'s bytes vanish underneath him; his own detail narration never changes');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP, INVARIANT 2: identical current possession,
    // different acquisition histories
    // ---------------------------------------------------------------
    {
        const bytes = JSON.stringify({ snapshot: 'two-replica-flagship' });
        const tamperedBytes = JSON.stringify({ snapshot: 'tampered-by-mallory' });
        const contentHash = computeContentHash(bytes);
        const publication = { id: 'pub-flagship-detail', contentReference: new ContentReference({ hash: contentHash }) };

        function makeReplica() {
            const contentStore = new LocalContentStore(new InMemoryStorageProvider());
            return {
                contentStore,
                storeUseCase: new StoreSnapshotContentUseCase(contentStore),
                checker: new CheckLocalSnapshotContentAvailabilityUseCase(contentStore),
                history: []
            };
        }

        const alice = makeReplica();
        const bob = makeReplica();

        // Alice: a single explicit PACKAGE import.
        const aliceResult = await alice.storeUseCase.execute({ contentHash, bytes });
        alice.history = appendSnapshotMaterializationHistoryEntry(alice.history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: aliceResult.outcome, publicationId: publication.id, contentHash
        }));

        // Bob: a peer first answers with the wrong bytes (rejected), then a
        // placement resolves with the correct bytes.
        const bobFirstAttempt = await bob.storeUseCase.execute({ contentHash, bytes: tamperedBytes });
        assert(bobFirstAttempt.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, '1. Bob\'s first attempt, from a peer with the wrong bytes, is rejected — HASH_MISMATCH');
        bob.history = appendSnapshotMaterializationHistoryEntry(bob.history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: bobFirstAttempt.outcome, publicationId: publication.id, contentHash
        }));
        const bobSecondAttempt = await bob.storeUseCase.execute({ contentHash, bytes });
        assert(bobSecondAttempt.outcome === StoreSnapshotContentOutcome.STORED, '2. Bob\'s second attempt, from a placement with the correct bytes, succeeds — STORED');
        bob.history = appendSnapshotMaterializationHistoryEntry(bob.history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: bobSecondAttempt.outcome, publicationId: publication.id, contentHash
        }));

        const aliceAvailability = await alice.checker.execute(publication);
        const bobAvailability = await bob.checker.execute(publication);
        assert(aliceAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE && bobAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '3. both Alice and Bob currently report the IDENTICAL possession state — AVAILABLE');

        const aliceBytes = await alice.contentStore.get(publication.contentReference);
        const bobBytes = await bob.contentStore.get(publication.contentReference);
        assert(aliceBytes === bobBytes, '4. both replicas hold byte-identical content');

        const aliceDetails = describeSnapshotMaterializationHistoryDetails(alice.history);
        const bobDetails = describeSnapshotMaterializationHistoryDetails(bob.history);

        assert(aliceDetails.count === 1 && aliceDetails.entries[0].sourceLabel === 'Transfer package',
            '5. Alice\'s own detail narration holds exactly one PACKAGE entry');
        assert(bobDetails.count === 2 && bobDetails.entries[0].outcomeShortLabel === 'Hash mismatch' && bobDetails.entries[1].outcomeShortLabel === 'Stored',
            '6. Bob\'s own detail narration holds exactly two entries, in order — the rejection first, the success second');
        assert(JSON.stringify(aliceDetails) !== JSON.stringify(bobDetails),
            '7. INVARIANT: Alice\'s and Bob\'s detail narrations are DIFFERENT, despite both reporting the identical current possession');

        assertNoForbiddenVocabulary(aliceDetails, '', '8. Alice\'s own detail narration');
        assertNoForbiddenVocabulary(bobDetails, '', '9. Bob\'s own detail narration');
    }
    console.log('✓ Section D: FLAGSHIP — identical current possession, different acquisition histories — Alice (package) and Bob (peer hash-mismatch, then placement recovery) both reach AVAILABLE with byte-identical content, while their own detail narrations remain distinct');

    console.log('\n✅ All SnapshotMaterializationHistoryDetailView tests passed');
}

run().catch((error) => {
    console.error('❌ SnapshotMaterializationHistoryDetailView tests failed:', error);
    process.exitCode = 1;
});
