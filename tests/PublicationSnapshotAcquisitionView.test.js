import { describePublicationSnapshotPossession } from '../application/PublicationSnapshotPossessionView.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { createSnapshotMaterializationAttempt } from '../application/SnapshotMaterializationAttempt.js';
import { appendSnapshotMaterializationHistoryEntry } from '../application/SnapshotMaterializationHistory.js';
import { describePublicationSnapshotAcquisition } from '../application/PublicationSnapshotAcquisitionView.js';

import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.8.43 — Unified Snapshot Acquisition Outcome & Possession UX.
//
//   Section A: describePublicationSnapshotAcquisition() is pure — byte-
//              identical inputs yield a byte-identical, frozen result, and
//              the result never carries a score/verdict/ranking field
//              anywhere in its shape.
//   Section B: current possession and acquisition history vary
//              INDEPENDENTLY — a "stored" history entry alongside a
//              NOT_AVAILABLE possession, and a "hash mismatch" history
//              entry alongside an AVAILABLE possession, are both reported
//              exactly as given, with no correction or flag.
//   Section C: a mixed PACKAGE/PLACEMENT/PEER history tallies correctly
//              across every one of the outcome and source dimensions at
//              once, over the exact scenario docs/Roadmap.md's own 0.8.43
//              entry illustrates: 4 attempts, 2 stored, 1 already
//              available, 1 hash mismatch, package 1 / placement 2 / peer 1.
//   Section D: corruption/recovery over a REAL content/LocalContentStore.js
//              — AVAILABLE, then storage corruption (never itself an
//              acquisition attempt, so it leaves no trace in the history),
//              then CONTENT_HASH_MISMATCH, then an explicit re-
//              materialization from a different source, then AVAILABLE
//              again — while the history narrates only the two EXPLICIT
//              attempts that actually happened.
//   Section E — FLAGSHIP: two independent multi-replica invariants over
//              REAL content stores. (1) Bob and Carol each materialize the
//              IDENTICAL one-entry history and both read AVAILABLE — then
//              Bob's bytes are deleted underneath him: his own history is
//              STILL byte-identical to Carol's, yet his current possession
//              now reads NOT_AVAILABLE while Carol's still reads AVAILABLE.
//              (2) Alice (PACKAGE), Bob (PLACEMENT), Carol (PEER), and Dave
//              (PEER hash-mismatch, then PLACEMENT recovery) all end up
//              possessing BYTE-IDENTICAL content and all report AVAILABLE,
//              while each retains its own, entirely different acquisition
//              history.
//
// See docs/Principles.md, "Current Snapshot Possession Is Independent Of
// How The Snapshot Was Acquired (0.8.43)" and "Acquisition History
// Explains Past Attempts; It Does Not Determine Present Possession
// (0.8.43)."

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

const FORBIDDEN_WORDS = [
    'confidence', 'quality', 'reliability', 'bestsource', 'preferredsource', 'successrate',
    'score', 'rank', 'trust', 'verified', 'canonical', 'recommended', 'best', 'preferred'
];

// Recursively scans every key of a plain object/array for a forbidden
// evaluative word — this milestone's own central promise is DESCRIPTION,
// never EVALUATION, and this check applies that promise directly to the
// actual shape returned, rather than trusting the header comment alone.
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

function possessionOf(outcome, publicationId = 'pub-a', contentHash = 'hash-a') {
    return describePublicationSnapshotPossession(outcome ? { publicationId, contentHash, outcome } : null);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — pure composition
    // ---------------------------------------------------------------
    {
        const history = appendSnapshotMaterializationHistoryEntry(
            appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED,
                publicationId: 'pub-a', contentHash: 'hash-a', observedAt: new Date('2026-08-01T00:00:00Z')
            })),
            createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH,
                publicationId: 'pub-a', contentHash: 'hash-a', observedAt: new Date('2026-08-02T00:00:00Z')
            })
        );
        const possessionView = possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE);

        const args = { publicationId: 'pub-a', contentHash: 'hash-a', possessionView, materializationHistory: history };
        const first = describePublicationSnapshotAcquisition(args);
        const second = describePublicationSnapshotAcquisition(args);
        assert(JSON.stringify(first) === JSON.stringify(second), '1. calling twice with byte-identical arguments returns a byte-identical result');
        assert(Object.isFrozen(first), '2. the top-level result is frozen');
        assert(Object.isFrozen(first.possession), '3. the possession sub-object is frozen');
        assert(Object.isFrozen(first.acquisition), '4. the acquisition sub-object is frozen');
        assert(Object.isFrozen(first.acquisition.sources), '5. the acquisition.sources sub-object is frozen');

        assert(first.publicationId === 'pub-a' && first.contentHash === 'hash-a', '6. publicationId/contentHash are carried through exactly as given');
        assert(first.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '7. possession.state matches the possessionView given');
        assert(first.acquisition.attemptCount === 2 && first.acquisition.storedCount === 1 && first.acquisition.hashMismatchCount === 1 && first.acquisition.alreadyAvailableCount === 0,
            '8. acquisition counts match the history given');
        assert(first.acquisition.sources.package === 1 && first.acquisition.sources.peer === 1 && first.acquisition.sources.placement === 0,
            '9. acquisition.sources matches the history given');

        assertNoForbiddenVocabulary(first, '', '10. the composed view');

        // Absent/empty inputs are tolerated, never thrown, and report
        // honest "nothing observed yet" defaults.
        const empty = describePublicationSnapshotAcquisition({ publicationId: 'pub-b', contentHash: 'hash-b' });
        assert(empty.possession.state === null, '11. an absent possessionView reports possession.state: null — "not yet observed," not an error');
        assert(empty.acquisition.attemptCount === 0 && empty.acquisition.sources.package === 0 && empty.acquisition.sources.placement === 0 && empty.acquisition.sources.peer === 0,
            '12. an absent/empty materializationHistory reports all-zero counts');
        assert(describePublicationSnapshotAcquisition().possession.state === null, '13. calling with no arguments at all never throws');
    }
    console.log('✓ Section A: describePublicationSnapshotAcquisition() is pure, frozen, and carries no evaluative vocabulary anywhere in its shape');

    // ---------------------------------------------------------------
    // Section B — current possession and acquisition history vary
    // independently, in both directions
    // ---------------------------------------------------------------
    {
        // History shows a STORED peer attempt; current possession reports
        // NOT_AVAILABLE — the bytes could have been deleted since.
        const storedThenGone = appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.STORED, publicationId: 'pub-c', contentHash: 'hash-c'
        }));
        const goneNow = describePublicationSnapshotAcquisition({
            publicationId: 'pub-c', contentHash: 'hash-c',
            possessionView: possessionOf(LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, 'pub-c', 'hash-c'),
            materializationHistory: storedThenGone
        });
        assert(goneNow.possession.state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '1. possession.state is NOT_AVAILABLE exactly as given, even though the history shows a STORED entry');
        assert(goneNow.acquisition.storedCount === 1, '2. the history\'s own STORED count is untouched by the current NOT_AVAILABLE possession');

        // History shows only a rejected HASH_MISMATCH attempt; current
        // possession reports AVAILABLE — a later, unrecorded replacement.
        const mismatchThenRecovered = appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH, publicationId: 'pub-d', contentHash: 'hash-d'
        }));
        const recoveredNow = describePublicationSnapshotAcquisition({
            publicationId: 'pub-d', contentHash: 'hash-d',
            possessionView: possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE, 'pub-d', 'hash-d'),
            materializationHistory: mismatchThenRecovered
        });
        assert(recoveredNow.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '3. possession.state is AVAILABLE exactly as given, even though the history shows only a HASH_MISMATCH entry');
        assert(recoveredNow.acquisition.hashMismatchCount === 1 && recoveredNow.acquisition.storedCount === 0, '4. the history\'s own rejection count is untouched by the current AVAILABLE possession');

        // Not-yet-checked possession alongside a real history: history is
        // reported, current possession stays honestly null, never guessed.
        const notYetChecked = describePublicationSnapshotAcquisition({
            publicationId: 'pub-e', contentHash: 'hash-e', possessionView: null, materializationHistory: storedThenGone
        });
        assert(notYetChecked.possession.state === null && notYetChecked.acquisition.attemptCount === 1,
            '5. an unchecked possessionView never infers a state from a non-empty history');
    }
    console.log('✓ Section B: current possession and acquisition history are reported exactly as given, in both directions, with no correction or inference between them');

    // ---------------------------------------------------------------
    // Section C — a mixed PACKAGE/PLACEMENT/PEER history, exactly the
    // scenario docs/Roadmap.md's own 0.8.43 entry illustrates
    // ---------------------------------------------------------------
    {
        let history = [];
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED, publicationId: 'pub-f', contentHash: 'hash-f'
        }));
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: StoreSnapshotContentOutcome.STORED, publicationId: 'pub-f', contentHash: 'hash-f'
        }));
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: StoreSnapshotContentOutcome.ALREADY_AVAILABLE, publicationId: 'pub-f', contentHash: 'hash-f'
        }));
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH, publicationId: 'pub-f', contentHash: 'hash-f'
        }));

        const view = describePublicationSnapshotAcquisition({
            publicationId: 'pub-f', contentHash: 'hash-f',
            possessionView: possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE, 'pub-f', 'hash-f'),
            materializationHistory: history
        });

        assert(view.acquisition.attemptCount === 4, '1. attemptCount tallies every recorded attempt across all three sources');
        assert(view.acquisition.storedCount === 2, '2. storedCount tallies exactly the two STORED attempts');
        assert(view.acquisition.alreadyAvailableCount === 1, '3. alreadyAvailableCount tallies exactly the one ALREADY_AVAILABLE attempt');
        assert(view.acquisition.hashMismatchCount === 1, '4. hashMismatchCount tallies exactly the one HASH_MISMATCH attempt');
        assert(view.acquisition.sources.package === 1 && view.acquisition.sources.placement === 2 && view.acquisition.sources.peer === 1,
            '5. sources tallies 1 package / 2 placement / 1 peer, matching every attempt regardless of its own outcome');
        assert(view.acquisition.attemptCount === view.acquisition.storedCount + view.acquisition.alreadyAvailableCount + view.acquisition.hashMismatchCount,
            '6. INVARIANT: attemptCount always equals the sum of the three outcome counts');
        assert(view.acquisition.attemptCount === view.acquisition.sources.package + view.acquisition.sources.placement + view.acquisition.sources.peer,
            '7. INVARIANT: attemptCount always equals the sum of the three source counts');
    }
    console.log('✓ Section C: a mixed PACKAGE/PLACEMENT/PEER history tallies correctly across both the outcome and source dimensions at once');

    // ---------------------------------------------------------------
    // Section D — corruption/recovery over a real content store: current
    // possession moves through storage corruption that is NEVER itself an
    // acquisition attempt, so it leaves no trace in the history, while an
    // explicit re-materialization from a different source both recovers
    // possession AND is recorded.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const storeUseCase = new StoreSnapshotContentUseCase(contentStore);
        const checker = new CheckLocalSnapshotContentAvailabilityUseCase(contentStore);

        const bytes = JSON.stringify({ snapshot: 'grain-silo' });
        const contentHash = computeContentHash(bytes);
        const publication = { id: 'pub-d', contentReference: new ContentReference({ hash: contentHash }) };

        let history = [];

        // --- An explicit PACKAGE import stores the real bytes: STORED, recorded. ---
        const firstStore = await storeUseCase.execute({ contentHash, bytes });
        assert(firstStore.outcome === StoreSnapshotContentOutcome.STORED, '1. the first explicit materialization stores the real bytes — STORED');
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: firstStore.outcome, publicationId: publication.id, contentHash
        }));

        const afterStore = describePublicationSnapshotAcquisition({
            publicationId: publication.id, contentHash,
            possessionView: describePublicationSnapshotPossession(await checker.execute(publication)),
            materializationHistory: history
        });
        assert(afterStore.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '2. current possession reports AVAILABLE right after the first attempt');
        assert(afterStore.acquisition.attemptCount === 1 && afterStore.acquisition.storedCount === 1, '3. exactly one attempt is recorded so far');

        // --- Storage corruption beneath this replica — NEVER an explicit
        // acquisition action, so it produces no new history entry. ---
        storageProvider.save('content:' + contentHash, 'these-bytes-were-corrupted-after-storage');

        const afterCorruption = describePublicationSnapshotAcquisition({
            publicationId: publication.id, contentHash,
            possessionView: describePublicationSnapshotPossession(await checker.execute(publication)),
            materializationHistory: history
        });
        assert(afterCorruption.possession.state === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH, '4. current possession now reports CONTENT_HASH_MISMATCH');
        assert(afterCorruption.acquisition.attemptCount === 1, '5. INVARIANT: the acquisition history is completely UNCHANGED by the corruption — it was never an explicit attempt');

        // --- An explicit re-materialization, from a DIFFERENT source,
        // recovers the bytes: recorded as a second history entry. ---
        const secondStore = await storeUseCase.execute({ contentHash, bytes });
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: secondStore.outcome, publicationId: publication.id, contentHash
        }));

        const afterRecovery = describePublicationSnapshotAcquisition({
            publicationId: publication.id, contentHash,
            possessionView: describePublicationSnapshotPossession(await checker.execute(publication)),
            materializationHistory: history
        });
        assert(afterRecovery.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '6. current possession reports AVAILABLE again after the explicit recovery attempt');
        assert(afterRecovery.acquisition.attemptCount === 2, '7. the history now holds exactly TWO entries — the original attempt, and the explicit recovery attempt; the corruption itself still left no trace');
        assert(afterRecovery.acquisition.sources.package === 1 && afterRecovery.acquisition.sources.peer === 1,
            '8. the two recorded attempts name their own two different sources, exactly as they happened');
    }
    console.log('✓ Section D: possession moves AVAILABLE → (untracked) corruption → CONTENT_HASH_MISMATCH → explicit recovery → AVAILABLE, while the history narrates only the two explicit attempts that actually happened');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP
    // ---------------------------------------------------------------
    {
        // --- Invariant 1: IDENTICAL acquisition history, DIFFERENT
        // current possession. Bob and Carol each materialize the snapshot
        // through the identical one-entry PLACEMENT history, at the
        // identical recorded moment. Both read AVAILABLE. Bob's bytes are
        // then deleted underneath him: his own history stays byte-
        // identical to Carol's, yet his current possession now differs. ---
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

            let bobHistory = appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: bobResult.outcome, publicationId: publication.id, contentHash, observedAt
            }));
            let carolHistory = appendSnapshotMaterializationHistoryEntry([], createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: carolResult.outcome, publicationId: publication.id, contentHash, observedAt
            }));
            assert(JSON.stringify(bobHistory) === JSON.stringify(carolHistory), '2. Bob\'s and Carol\'s materialization histories are byte-identical');

            const bobBefore = describePublicationSnapshotAcquisition({
                publicationId: publication.id, contentHash,
                possessionView: describePublicationSnapshotPossession(await bobChecker.execute(publication)),
                materializationHistory: bobHistory
            });
            const carolBefore = describePublicationSnapshotAcquisition({
                publicationId: publication.id, contentHash,
                possessionView: describePublicationSnapshotPossession(await carolChecker.execute(publication)),
                materializationHistory: carolHistory
            });
            assert(bobBefore.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE && carolBefore.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
                '3. both Bob and Carol currently report AVAILABLE');
            assert(JSON.stringify(bobBefore.acquisition) === JSON.stringify(carolBefore.acquisition), '4. Bob\'s and Carol\'s acquisition summaries are byte-identical');

            // Bob's bytes vanish underneath him — never an explicit action,
            // so his own history is never touched.
            bobStorageProvider.remove('content:' + contentHash);

            const bobAfter = describePublicationSnapshotAcquisition({
                publicationId: publication.id, contentHash,
                possessionView: describePublicationSnapshotPossession(await bobChecker.execute(publication)),
                materializationHistory: bobHistory
            });
            const carolAfter = describePublicationSnapshotAcquisition({
                publicationId: publication.id, contentHash,
                possessionView: describePublicationSnapshotPossession(await carolChecker.execute(publication)),
                materializationHistory: carolHistory
            });
            assert(bobAfter.possession.state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '5. Bob now reports NOT_AVAILABLE');
            assert(carolAfter.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '6. Carol still reports AVAILABLE — her own bytes were never touched');
            assert(JSON.stringify(bobAfter.acquisition) === JSON.stringify(carolAfter.acquisition),
                '7. INVARIANT: Bob\'s and Carol\'s acquisition summaries are STILL byte-identical — identical history, now genuinely different current possession');
        }
        console.log('  ✓ Invariant 1: identical acquisition history, different current possession — Bob and Carol materialize identically, then Bob\'s bytes vanish underneath him');

        // --- Invariant 2: IDENTICAL current possession, DIFFERENT
        // acquisition history. Alice (PACKAGE), Bob (PLACEMENT), Carol
        // (PEER), and Dave (PEER hash-mismatch, then PLACEMENT recovery)
        // all end up possessing byte-identical content and all report
        // AVAILABLE, while each retains its own, entirely different
        // history. ---
        {
            const bytes = JSON.stringify({ snapshot: 'four-replica-flagship' });
            const tamperedBytes = JSON.stringify({ snapshot: 'tampered-by-mallory' });
            const contentHash = computeContentHash(bytes);
            const publication = { id: 'pub-flagship', contentReference: new ContentReference({ hash: contentHash }) };

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
            const carol = makeReplica();
            const dave = makeReplica();

            const aliceResult = await alice.storeUseCase.execute({ contentHash, bytes });
            alice.history = appendSnapshotMaterializationHistoryEntry(alice.history, createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: aliceResult.outcome, publicationId: publication.id, contentHash
            }));

            const bobResult = await bob.storeUseCase.execute({ contentHash, bytes });
            bob.history = appendSnapshotMaterializationHistoryEntry(bob.history, createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: bobResult.outcome, publicationId: publication.id, contentHash
            }));

            const carolResult = await carol.storeUseCase.execute({ contentHash, bytes });
            carol.history = appendSnapshotMaterializationHistoryEntry(carol.history, createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: carolResult.outcome, publicationId: publication.id, contentHash
            }));

            // Dave: a peer first answers with the WRONG bytes — nothing is
            // stored, HASH_MISMATCH is recorded — then a placement resolves
            // with the correct bytes — STORED is recorded.
            const daveFirstAttempt = await dave.storeUseCase.execute({ contentHash, bytes: tamperedBytes });
            assert(daveFirstAttempt.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, '8. Dave\'s first attempt, from a peer with the wrong bytes, is rejected — HASH_MISMATCH');
            dave.history = appendSnapshotMaterializationHistoryEntry(dave.history, createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: daveFirstAttempt.outcome, publicationId: publication.id, contentHash
            }));
            const daveSecondAttempt = await dave.storeUseCase.execute({ contentHash, bytes });
            assert(daveSecondAttempt.outcome === StoreSnapshotContentOutcome.STORED, '9. Dave\'s second attempt, from a placement with the correct bytes, succeeds — STORED');
            dave.history = appendSnapshotMaterializationHistoryEntry(dave.history, createSnapshotMaterializationAttempt({
                sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: daveSecondAttempt.outcome, publicationId: publication.id, contentHash
            }));

            async function acquisitionFor(replica) {
                return describePublicationSnapshotAcquisition({
                    publicationId: publication.id, contentHash,
                    possessionView: describePublicationSnapshotPossession(await replica.checker.execute(publication)),
                    materializationHistory: replica.history
                });
            }
            const aliceView = await acquisitionFor(alice);
            const bobView = await acquisitionFor(bob);
            const carolView = await acquisitionFor(carol);
            const daveView = await acquisitionFor(dave);

            // --- All four possess byte-identical content and report the
            // identical current possession state. ---
            const aliceBytes = await alice.contentStore.get(publication.contentReference);
            const bobBytes = await bob.contentStore.get(publication.contentReference);
            const carolBytes = await carol.contentStore.get(publication.contentReference);
            const daveBytes = await dave.contentStore.get(publication.contentReference);
            assert(aliceBytes === bobBytes && bobBytes === carolBytes && carolBytes === daveBytes,
                '10. all four replicas hold BYTE-IDENTICAL content, obtained through four entirely different acquisition paths');
            for (const [name, view] of [['Alice', aliceView], ['Bob', bobView], ['Carol', carolView], ['Dave', daveView]]) {
                assert(view.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, `11. ${name} currently reports AVAILABLE`);
            }

            // --- Yet each retains its own, entirely different history. ---
            assert(aliceView.acquisition.attemptCount === 1 && aliceView.acquisition.sources.package === 1 && aliceView.acquisition.sources.placement === 0 && aliceView.acquisition.sources.peer === 0,
                '12. Alice\'s own history holds exactly one PACKAGE attempt');
            assert(bobView.acquisition.attemptCount === 1 && bobView.acquisition.sources.placement === 1 && bobView.acquisition.sources.package === 0 && bobView.acquisition.sources.peer === 0,
                '13. Bob\'s own history holds exactly one PLACEMENT attempt');
            assert(carolView.acquisition.attemptCount === 1 && carolView.acquisition.sources.peer === 1 && carolView.acquisition.sources.package === 0 && carolView.acquisition.sources.placement === 0,
                '14. Carol\'s own history holds exactly one PEER attempt');
            assert(daveView.acquisition.attemptCount === 2 && daveView.acquisition.sources.peer === 1 && daveView.acquisition.sources.placement === 1 && daveView.acquisition.hashMismatchCount === 1 && daveView.acquisition.storedCount === 1,
                '15. Dave\'s own history holds exactly two attempts — a rejected PEER attempt and a recovering PLACEMENT attempt — that neither Alice, Bob, nor Carol shares');

            const histories = [aliceView.acquisition, bobView.acquisition, carolView.acquisition, daveView.acquisition];
            const uniqueSerializedHistories = new Set(histories.map((acquisition) => JSON.stringify(acquisition)));
            assert(uniqueSerializedHistories.size === 4,
                '16. INVARIANT: all four replicas\' acquisition summaries are pairwise DIFFERENT, despite every one of them reporting the identical current possession');

            // --- A combined tally across all four is a plain fact, never a
            // ranking: no adjective anywhere describes one source or one
            // replica as better, more reliable, or more trustworthy. ---
            for (const view of [aliceView, bobView, carolView, daveView]) {
                assertNoForbiddenVocabulary(view, '', '17. every replica\'s own composed view');
            }
        }
        console.log('  ✓ Invariant 2: identical current possession, different acquisition history — Alice/Bob/Carol/Dave reach byte-identical possession through four different paths, each keeping its own distinct history');
    }
    console.log('✓ Section E: FLAGSHIP — acquisition history and current possession vary completely independently of one another, in both directions, over real content stores');

    console.log('\n✅ All PublicationSnapshotAcquisitionView tests passed');
}

run().catch((error) => {
    console.error('❌ PublicationSnapshotAcquisitionView tests failed:', error);
    process.exitCode = 1;
});
