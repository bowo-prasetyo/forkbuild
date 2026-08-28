import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { describeBaseAnchorPublicationObservations } from '../application/BaseAnchorPublicationObservation.js';
import { describeBaseAnchorPublicationObservationProjection } from '../application/BaseAnchorPublicationObservationView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';

// 0.8.100 — Publication Identity–Scoped Observation Correlation.
//
// The flagship this milestone exists to prove: given a
// `BaseAnchorPublicationRecord` and the archive's own
// `baseTransactionInclusionObservationsByTransactionHash` collection,
// `describeBaseAnchorPublicationObservations()` returns exactly — and
// only — the observations recorded under THAT publication's own `txid`,
// never observations recorded under a different `txid`, even when both
// publications share an identical `contentHash`.
//
//   Section A: basic correlation — a publication's own observations are
//              returned, in order, unchanged; a publication with no
//              recorded history projects to an honest empty list
//   Section B: FLAGSHIP — two publications sharing one contentHash, two
//              different txids, two independent observation histories:
//              requesting Publication A's observations never returns
//              Publication B's, and vice versa
//   Section C: cross-chain — a Bitcoin publication and a Base publication
//              sharing an identical contentHash AND an identical raw
//              txid/chainReference string: the Base projection still only
//              ever reads the Base-domain observation collection, and
//              never anything from Bitcoin's own, entirely separate
//              confirmation-observation collection
//   Section D: argument validation — a non-BaseAnchorPublicationRecord
//              throws before anything else is touched
//   Section E: purity/immutability — frozen result, no mutation of the
//              inputs, byte-identical repeated calls, no persistence
//   Section F: real archive integration — correlation over the actual
//              collections `PublicationObservationArchive` produces via
//              `appendBaseAnchorPublicationRecord()`/
//              `appendBaseTransactionInclusionObservation()`
//   Section G: the view layer — composition of already-existing describe
//              functions, no new vocabulary
//   Section H: no verdict vocabulary anywhere in this milestone's own new
//              surface — no `status`, `confirmed`, `included` (as a
//              publication-level field), `health`, or `confidence`

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — observations are correlated to an identity, never turned into a verdict about it`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

function record({ contentHash, txid, network = 'base-mainnet', createdAt }) {
    return new BaseAnchorPublicationRecord({ contentHash, txid, network, createdAt });
}

function included({ txid, blockNumber, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BaseTransactionInclusionObservationState.INCLUDED,
        txid, blockHash: 'b'.repeat(64), blockNumber, transactionIndex: 0, confirmationCount,
        reason: null, observedAt
    });
}

function notIncluded({ txid, observedAt }) {
    return Object.freeze({
        state: BaseTransactionInclusionObservationState.NOT_INCLUDED,
        txid, blockHash: null, blockNumber: null, transactionIndex: null, confirmationCount: null,
        reason: null, observedAt
    });
}

function unavailable({ txid, reason, observedAt }) {
    return Object.freeze({
        state: BaseTransactionInclusionObservationState.UNAVAILABLE,
        txid, blockHash: null, blockNumber: null, transactionIndex: null, confirmationCount: null,
        reason, observedAt
    });
}

const CONTENT_HASH = 'h'.repeat(64);
const TX_A = 'a'.repeat(64);
const TX_B = 'b'.repeat(64);
const CREATED_AT = new Date('2026-08-20T00:00:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — basic correlation.
    // ---------------------------------------------------------------
    {
        const publicationA = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: CREATED_AT });
        const obsA1 = included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-20T00:10:00Z') });
        const obsA2 = included({ txid: TX_A, blockNumber: 100, confirmationCount: 6, observedAt: new Date('2026-08-20T00:30:00Z') });

        const projection = describeBaseAnchorPublicationObservations(publicationA, { [TX_A]: [obsA1, obsA2] });

        assert(projection.publication === publicationA, '1. the projection carries the exact publication record it was handed, never a copy');
        assert(projection.observations.length === 2, '2. both of Publication A\'s own observations are present');
        assert(projection.observations[0] === obsA1 && projection.observations[1] === obsA2, '3. observations are carried through unchanged and in their own recorded order');

        const emptyProjection = describeBaseAnchorPublicationObservations(publicationA, {});
        assert(Array.isArray(emptyProjection.observations) && emptyProjection.observations.length === 0, '4. a publication with no recorded history projects to an honest empty list, never an error');

        const missingCollectionProjection = describeBaseAnchorPublicationObservations(publicationA, null);
        assert(missingCollectionProjection.observations.length === 0, '5. a missing observationsByTransactionHash collection is tolerated as empty, never thrown on');
    }
    console.log('✓ Section A: basic correlation — a publication\'s own observations are returned, unchanged and in order; a missing history projects to empty');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: identical contentHash, two txids, isolated
    // histories. This is the scenario this milestone exists to prove.
    // ---------------------------------------------------------------
    {
        const publicationA = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: CREATED_AT });
        const publicationB = record({ contentHash: CONTENT_HASH, txid: TX_B, createdAt: CREATED_AT });

        assert(publicationA.contentHash === publicationB.contentHash, 'sanity check — both publications genuinely share the identical contentHash');
        assert(publicationA.txid !== publicationB.txid, 'sanity check — the two publications carry genuinely different txids');

        const observationsByTransactionHash = {
            [TX_A]: [
                included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-20T00:10:00Z') }),
                included({ txid: TX_A, blockNumber: 100, confirmationCount: 6, observedAt: new Date('2026-08-20T00:30:00Z') }),
                unavailable({ txid: TX_A, reason: 'rpc timeout', observedAt: new Date('2026-08-20T00:40:00Z') })
            ],
            [TX_B]: [
                included({ txid: TX_B, blockNumber: 200, confirmationCount: 1, observedAt: new Date('2026-08-20T00:15:00Z') })
            ]
        };

        const projectionA = describeBaseAnchorPublicationObservations(publicationA, observationsByTransactionHash);
        const projectionB = describeBaseAnchorPublicationObservations(publicationB, observationsByTransactionHash);

        assert(projectionA.observations.length === 3, '6. Publication A\'s projection contains exactly its own three observations');
        assert(projectionA.observations.every((o) => o.txid === TX_A), '7. THE FLAGSHIP RULE: every observation in Publication A\'s projection names TX-A, never TX-B — even though contentHash(A) === contentHash(B)');
        assert(projectionB.observations.length === 1, '8. Publication B\'s projection contains exactly its own one observation');
        assert(projectionB.observations[0].txid === TX_B, '9. Publication B\'s projection names only TX-B — never leaking any of Publication A\'s three observations');
    }
    console.log('✓ Section B: FLAGSHIP — two publications sharing one contentHash under two different txids never leak observations into one another');

    // ---------------------------------------------------------------
    // Section C — cross-chain: a Bitcoin publication and a Base
    // publication sharing an identical contentHash AND an identical raw
    // txid/chainReference string. The Base projection must still only
    // ever read the Base-domain observation collection.
    // ---------------------------------------------------------------
    {
        const SHARED_RAW_REFERENCE = 'c'.repeat(64);
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-shared', contentHash: CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: 'mainnet', createdAt: CREATED_AT });
        archive = baseUseCase.execute(archive, { contentHash: CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: 'base-mainnet', createdAt: CREATED_AT });

        // A Bitcoin confirmation observation, recorded under the SAME raw
        // anchorId, in Bitcoin's own, entirely separate collection.
        archive = archive.appendBitcoinConfirmationObservation('anchor-shared', Object.freeze({
            state: 'CONFIRMED', txid: SHARED_RAW_REFERENCE, blockHash: 'd'.repeat(64), blockHeight: 900, confirmationCount: 3,
            reason: null, observedAt: new Date('2026-08-20T01:00:00Z')
        }));
        // A genuine Base inclusion observation, recorded under the
        // identical raw txid string, in Base's own collection.
        const baseObservation = included({ txid: SHARED_RAW_REFERENCE, blockNumber: 5000, confirmationCount: 2, observedAt: new Date('2026-08-20T01:05:00Z') });
        archive = archive.appendBaseTransactionInclusionObservation(SHARED_RAW_REFERENCE, baseObservation);

        const baseRecord = archive.baseAnchorPublicationRecords[0];
        assert(baseRecord.txid === SHARED_RAW_REFERENCE, 'sanity check — the Base publication record genuinely carries the shared raw txid string');

        const projection = describeBaseAnchorPublicationObservations(baseRecord, archive.baseTransactionInclusionObservationsByTransactionHash);

        assert(projection.observations.length === 1, '10. exactly one observation is projected — the genuine Base inclusion observation, never anything derived from Bitcoin\'s own confirmation observation');
        assert(projection.observations[0] === baseObservation, '11. the projected observation is the exact Base observation object, never a re-derived or Bitcoin-shaped stand-in');
        assert(typeof projection.observations[0].blockHeight === 'undefined', '12. no Bitcoin-shaped field (blockHeight) ever appears on a Base observation projection');

        // Reversed: reading the same shared reference off Bitcoin's own
        // confirmation collection returns Bitcoin's own fact, never Base's.
        const bitcoinConfirmations = archive.bitcoinConfirmationObservationsByAnchorId['anchor-shared'] || [];
        assert(bitcoinConfirmations.length === 1 && bitcoinConfirmations[0].blockHeight === 900, '13. sanity check — Bitcoin\'s own confirmation collection is entirely unaffected by the Base observation appended under the identical raw reference string');
    }
    console.log('✓ Section C: cross-chain — identical contentHash AND identical raw txid/chainReference across two chains never lets Bitcoin\'s own observations leak into a Base publication\'s projection');

    // ---------------------------------------------------------------
    // Section D — argument validation.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try {
            describeBaseAnchorPublicationObservations({ txid: TX_A }, { [TX_A]: [] });
        } catch (error) {
            threw = true;
        }
        assert(threw, '14. a bare object standing in for a publication record throws, rather than silently correlating by whatever txid-like field it happens to carry');

        threw = false;
        try {
            describeBaseAnchorPublicationObservations(null, {});
        } catch (error) {
            threw = true;
        }
        assert(threw, '15. a null publicationRecord throws');

        threw = false;
        try {
            describeBaseAnchorPublicationObservations(TX_A, {});
        } catch (error) {
            threw = true;
        }
        assert(threw, '16. a bare txid string standing in for a publication record throws — observations are never correlated by a raw string alone');
    }
    console.log('✓ Section D: argument validation — only an actual BaseAnchorPublicationRecord may request an observation projection');

    // ---------------------------------------------------------------
    // Section E — purity, immutability, no persistence.
    // ---------------------------------------------------------------
    {
        const publicationA = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: CREATED_AT });
        const history = [included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-20T00:10:00Z') })];
        const observationsByTransactionHash = { [TX_A]: history };

        const first = describeBaseAnchorPublicationObservations(publicationA, observationsByTransactionHash);
        const second = describeBaseAnchorPublicationObservations(publicationA, observationsByTransactionHash);

        assert(JSON.stringify(first.observations) === JSON.stringify(second.observations), '17. repeated calls with byte-identical arguments return byte-identical results');
        assert(Object.isFrozen(first), '18. the returned projection is frozen');
        assert(Object.isFrozen(first.observations), '19. the returned observations list is frozen');

        let mutationThrew = false;
        try { first.observations.push('tampered'); } catch (error) { mutationThrew = true; }
        assert(mutationThrew, '20. the returned observations list cannot be mutated');

        assert(history.length === 1, '21. the original history array handed in is never mutated');
        assert(observationsByTransactionHash[TX_A] === history, '22. the original observationsByTransactionHash object is never mutated or replaced');
    }
    console.log('✓ Section E: purity and immutability — frozen output, no mutation of any input, byte-identical repeated calls');

    // ---------------------------------------------------------------
    // Section F — real archive integration.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { contentHash: CONTENT_HASH, txid: TX_A, network: 'base-mainnet', createdAt: CREATED_AT });
        archive = archive.appendBaseTransactionInclusionObservation(TX_A, notIncluded({ txid: TX_A, observedAt: new Date('2026-08-20T00:05:00Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TX_A, included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-20T00:10:00Z') }));
        // An entirely unrelated txid's own observation must never appear.
        archive = archive.appendBaseTransactionInclusionObservation(TX_B, included({ txid: TX_B, blockNumber: 200, confirmationCount: 1, observedAt: new Date('2026-08-20T00:12:00Z') }));

        const publicationRecord = archive.baseAnchorPublicationRecords[0];
        const projection = describeBaseAnchorPublicationObservations(publicationRecord, archive.baseTransactionInclusionObservationsByTransactionHash);

        assert(projection.observations.length === 2, '23. exactly the two observations recorded under this publication\'s own txid are present');
        assert(projection.observations[0].state === BaseTransactionInclusionObservationState.NOT_INCLUDED, '24. the earlier NOT_INCLUDED observation is present, in its own recorded order');
        assert(projection.observations[1].state === BaseTransactionInclusionObservationState.INCLUDED, '25. the later INCLUDED observation follows it — history is never collapsed to "the current state"');
        assert(projection.observations.every((o) => o.txid === TX_A), '26. no observation recorded under TX-B ever appears in this publication\'s own projection');

        // Correlation over this milestone touches nothing else the archive
        // already tracks.
        assert(archive.baseAnchorPublicationRecordCount === 1, '27. requesting a projection never mutates the archive\'s own publication record count');
        assert(Object.keys(archive.baseTransactionInclusionObservationsByTransactionHash).length === 2, '28. requesting a projection never mutates the archive\'s own observation collections');
    }
    console.log('✓ Section F: real archive integration — correlation over the actual PublicationObservationArchive collections behaves identically to the isolated flagship scenario');

    // ---------------------------------------------------------------
    // Section G — the view layer.
    // ---------------------------------------------------------------
    {
        const publicationA = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: CREATED_AT });
        const observation = included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-20T00:10:00Z') });
        const projection = describeBaseAnchorPublicationObservations(publicationA, { [TX_A]: [observation] });

        const described = describeBaseAnchorPublicationObservationProjection(projection);

        assert(described.publication.contentHash === CONTENT_HASH && described.publication.txid === TX_A, '29. the described publication carries the identity fields unchanged');
        assert(described.observations.count === 1, '30. the described observations section carries the correct count');
        assert(described.observations.observations[0].stateLabel === 'Transaction included', '31. the described observation reuses application/BaseTransactionInclusionObservationView.js\'s own, already-established labels — no new vocabulary');

        assert(describeBaseAnchorPublicationObservationProjection(null) === null, '32. a null projection describes as null, never throwing');
    }
    console.log('✓ Section G: the view layer composes only already-existing describe functions — no new vocabulary');

    // ---------------------------------------------------------------
    // Section H — no verdict vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const publicationA = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: CREATED_AT });
        const observation = included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-20T00:10:00Z') });
        const projection = describeBaseAnchorPublicationObservations(publicationA, { [TX_A]: [observation] });
        const described = describeBaseAnchorPublicationObservationProjection(projection);

        assertNeverScored(described, 'describeBaseAnchorPublicationObservationProjection()');
        assert(!('status' in projection), '33. the raw projection itself never carries an aggregate publication status field');
    }
    console.log('✓ Section H: no trust/confidence/verdict vocabulary exists anywhere in this milestone\'s own new surface');

    console.log('\nAll BaseAnchorPublicationObservation tests passed.');
}

run().catch((error) => {
    console.error('BaseAnchorPublicationObservation.test.js FAILED:', error);
    process.exitCode = 1;
});
