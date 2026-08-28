import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import {
    BaseAnchorPublicationLifecycleTimelineEntryKind,
    describeBaseAnchorPublicationLifecycleTimeline,
    reconstructBaseAnchorPublicationLifecycleTimeline
} from '../application/BaseAnchorPublicationLifecycleTimelineView.js';

// 0.8.101 — Base Anchor Publication Lifecycle Timeline.
//
// Section A: a fresh publication with no observations yet — the timeline
//            is exactly one entry, "Publication record created," never an
//            error and never a fabricated stage
// Section B: a full, single-publication timeline in the correct
//            chronological order, with repeated and UNAVAILABLE
//            observations preserved rather than collapsed or dropped
// Section C: malformed/absent inputs never throw
// Section D: FLAGSHIP — two publications sharing one contentHash, with
//            deliberately interleaved, out-of-order observation
//            timestamps; each publication's own timeline is
//            chronologically correct, source histories are untouched, and
//            neither publication's entries ever leak into the other's
// Section E: reconstructBaseAnchorPublicationLifecycleTimeline() over a
//            real, persisted archive — reload equivalence, zero network
//            access, "no record, no timeline" for a txid with Base facts
//            but no minted publication identity
// Section F: no verdict vocabulary anywhere, only two entry kinds ever
//            appear (never a fabricated BROADCAST — see this milestone's
//            own header on why), and repeated projection is byte-identical

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy',
    'completed', 'successful', 'final'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a lifecycle timeline presents recorded facts, it does not turn them into a verdict`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function withoutNetworkAccess(fn) {
    let networkCallOccurred = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
    try {
        return { result: await fn(), networkCallOccurred };
    } finally {
        globalThis.fetch = originalFetch;
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
const NETWORK = 'base-mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — a fresh publication with no observations yet.
    // ---------------------------------------------------------------
    {
        const publicationRecord = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: new Date('2026-08-20T00:00:00Z') });
        const timeline = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord);
        assert(timeline.txid === TX_A, '1. the timeline names the publication\'s own txid');
        assert(timeline.count === 1, '2. a fresh publication\'s timeline holds exactly one entry — never zero, never a fabricated stage');
        assert(timeline.entries[0].kind === BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION, '3. the one entry is the publication record itself');
        assert(timeline.entries[0].label === 'Publication record created', '4. the label is a plain factual sentence');
        assert(timeline.entries[0].txid === TX_A, '5. the entry is stamped with the publication\'s own txid');

        // No observationsByTransactionHash argument at all, and an empty
        // one, behave identically — an honestly empty history, never an
        // error.
        const timelineWithEmptyMap = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord, {});
        assert(JSON.stringify(timeline) === JSON.stringify(timelineWithEmptyMap), '6. an omitted and an explicitly empty observationsByTransactionHash produce byte-identical timelines');

        assertNeverScored(timeline, 'freshTimeline');
    }
    console.log('✓ Section A: a fresh publication\'s timeline is exactly one entry, never an error and never a fabricated stage');

    // ---------------------------------------------------------------
    // Section B — a full, single-publication timeline: repeated and
    // UNAVAILABLE observations are preserved, never collapsed or dropped.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-20T00:00:00Z');
        const publicationRecord = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt });

        // The user explicitly observed the same transaction three times —
        // INCLUDED, then UNAVAILABLE, then INCLUDED again. All three must
        // survive onto the timeline, in this exact order.
        const observationsByTransactionHash = {
            [TX_A]: [
                included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 1, observedAt: new Date('2026-08-20T08:10:07Z') }),
                unavailable({ txid: TX_A, reason: 'rpc timeout', observedAt: new Date('2026-08-20T08:10:31Z') }),
                included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 6, observedAt: new Date('2026-08-20T08:11:02Z') })
            ]
        };

        const timeline = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord, observationsByTransactionHash);

        const kinds = timeline.entries.map((e) => e.kind);
        assert(JSON.stringify(kinds) === JSON.stringify([
            BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION
        ]), `7. the full timeline presents every recorded fact in the correct chronological order, saw: ${JSON.stringify(kinds)}`);

        const observationEntries = timeline.entries.filter((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION);
        assert(observationEntries.length === 3, '8. all three observations survive onto the timeline — never collapsed because the txid is identical');
        assert(observationEntries[0].state === BaseTransactionInclusionObservationState.INCLUDED, '9. the first observation is the earlier INCLUDED fact');
        assert(observationEntries[1].state === BaseTransactionInclusionObservationState.UNAVAILABLE, '10. UNAVAILABLE stays on the timeline — an honest "could not tell" moment is never dropped from presentation');
        assert(observationEntries[2].state === BaseTransactionInclusionObservationState.INCLUDED, '11. the later INCLUDED observation follows it, in its own recorded order');
        assert(observationEntries[0].index === 1 && observationEntries[1].index === 2 && observationEntries[2].index === 3, '12. observation entries carry their own 1-based index — never relying on timestamp identity alone');
        assert(observationEntries[0].label === 'Inclusion observation #1' && observationEntries[2].label === 'Inclusion observation #3', '13. labels name their own index');
        assert(timeline.entries.every((e) => e.txid === TX_A), '14. every entry, of every kind, is stamped with the same txid');

        // Never mutated, never reordered.
        assert(observationsByTransactionHash[TX_A].length === 3 && observationsByTransactionHash[TX_A][0].confirmationCount === 1, '15. the caller\'s own observationsByTransactionHash is never reordered or mutated');

        // Repeated projection is byte-identical.
        const timelineAgain = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord, observationsByTransactionHash);
        assert(JSON.stringify(timeline) === JSON.stringify(timelineAgain), '16. calling the projection twice on byte-identical input returns a byte-identical result');

        assertNeverScored(timeline, 'fullTimeline');
    }
    console.log('✓ Section B: a full timeline presents every recorded fact in correct chronological order — repeated and UNAVAILABLE observations are preserved, never collapsed or dropped');

    // ---------------------------------------------------------------
    // Section C — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        assert(describeBaseAnchorPublicationLifecycleTimeline(null) === null, '17. a null publicationRecord returns null');
        assert(describeBaseAnchorPublicationLifecycleTimeline({ txid: TX_A, contentHash: CONTENT_HASH }) === null, '18. a bare object standing in for a publication record returns null, rather than silently correlating by whatever txid-like field it happens to carry');
        assert(describeBaseAnchorPublicationLifecycleTimeline(TX_A) === null, '19. a bare txid string returns null');

        const publicationRecord = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: new Date('2026-08-20T00:00:00Z') });
        const degraded = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord, null);
        assert(degraded.count === 1, '20. a null observationsByTransactionHash degrades to an empty history rather than throwing');
        const degradedAgain = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord, 'not-a-map');
        assert(degradedAgain.count === 1, '21. a non-object observationsByTransactionHash degrades to an empty history rather than throwing');

        assert(reconstructBaseAnchorPublicationLifecycleTimeline(null, TX_A) === null, '22. a null archive returns null rather than throwing');
        assert(reconstructBaseAnchorPublicationLifecycleTimeline({}, TX_A) === null, '23. a plain object masquerading as an archive returns null');
        assert(reconstructBaseAnchorPublicationLifecycleTimeline(PublicationObservationArchive.empty(), null) === null, '24. a missing txid returns null');
        assert(reconstructBaseAnchorPublicationLifecycleTimeline(PublicationObservationArchive.empty(), 'never-published') === null, '25. a txid with no publication record returns null');
    }
    console.log('✓ Section C: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: two publications, one shared contentHash,
    // deliberately interleaved observation timestamps and append order.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();

        const T1 = new Date('2026-08-20T08:10:07Z'); // A observation 1
        const T2 = new Date('2026-08-20T08:10:15Z'); // B observation 1
        const T3 = new Date('2026-08-20T08:10:31Z'); // A observation 2
        const T4 = new Date('2026-08-20T08:11:02Z'); // B observation 2

        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { contentHash: CONTENT_HASH, txid: TX_A, network: NETWORK, createdAt: new Date('2026-08-20T08:10:00Z') });
        archive = useCase.execute(archive, { contentHash: CONTENT_HASH, txid: TX_B, network: NETWORK, createdAt: new Date('2026-08-20T08:10:02Z') });

        // Deliberately awkward, cross-interleaved append order.
        archive = archive.appendBaseTransactionInclusionObservation(TX_B, included({ txid: TX_B, blockNumber: 25000010, confirmationCount: 1, observedAt: T2 }));
        archive = archive.appendBaseTransactionInclusionObservation(TX_A, included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 1, observedAt: T1 }));
        archive = archive.appendBaseTransactionInclusionObservation(TX_B, included({ txid: TX_B, blockNumber: 25000010, confirmationCount: 6, observedAt: T4 }));
        archive = archive.appendBaseTransactionInclusionObservation(TX_A, included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 6, observedAt: T3 }));

        const timelineA = reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_A);
        const timelineB = reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_B);

        const kindsA = timelineA.entries.map((e) => e.kind);
        const kindsB = timelineB.entries.map((e) => e.kind);
        assert(JSON.stringify(kindsA) === JSON.stringify([
            BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION
        ]), `26. Publication A's timeline is chronologically correct despite an interleaved append order, saw: ${JSON.stringify(kindsA)}`);
        assert(JSON.stringify(kindsB) === JSON.stringify([
            BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION,
            BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION
        ]), `27. Publication B's timeline is chronologically correct despite an interleaved append order, saw: ${JSON.stringify(kindsB)}`);

        // Identical contentHash never causes cross-contamination.
        assert(timelineA.entries.every((e) => e.txid === TX_A), '28. every one of Publication A\'s entries names TX-A');
        assert(timelineB.entries.every((e) => e.txid === TX_B), '29. every one of Publication B\'s entries names TX-B');
        assert(!timelineA.entries.some((e) => e.blockNumber === 25000010), '30. Publication B\'s own block never appears in Publication A\'s timeline');
        assert(!timelineB.entries.some((e) => e.blockNumber === 25000000), '31. Publication A\'s own block never appears in Publication B\'s timeline');

        // Source histories were never mutated or reordered by either
        // reconstruction call.
        assert(archive.baseTransactionInclusionObservationsByTransactionHash[TX_A].length === 2 && archive.baseTransactionInclusionObservationsByTransactionHash[TX_B].length === 2, '32. the archive\'s own inclusion-observation histories are untouched');

        // Equal timestamps have deterministic ordering — re-running the
        // same reconstruction twice never reshuffles a tie.
        const timelineAAgain = reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_A);
        assert(JSON.stringify(timelineA) === JSON.stringify(timelineAAgain), '33. repeated projection over the same archive is byte-identical');

        assertNeverScored(timelineA, 'timelineA');
        assertNeverScored(timelineB, 'timelineB');
    }
    console.log('✓ Section D: FLAGSHIP — two publications sharing one contentHash, interleaved histories, chronologically correct and never cross-contaminated');

    // ---------------------------------------------------------------
    // Section E — reconstructBaseAnchorPublicationLifecycleTimeline()
    // over a real, persisted archive: reload equivalence, zero network
    // access, and "no record, no timeline."
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { contentHash: CONTENT_HASH, txid: TX_A, network: NETWORK, createdAt: new Date('2026-08-20T08:10:00Z') });
        archive = archive.appendBaseTransactionInclusionObservation(TX_A, included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 1, observedAt: new Date('2026-08-20T08:10:07Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TX_A, included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 6, observedAt: new Date('2026-08-20T08:11:02Z') }));

        // A SECOND txid exists in the same archive with real Base facts,
        // but no minted publication identity — it must never gain a
        // timeline of its own.
        archive = archive.appendBaseTransactionInclusionObservation(TX_B, included({ txid: TX_B, blockNumber: 25000010, confirmationCount: 1, observedAt: new Date('2026-08-20T08:10:07Z') }));

        const preReload = reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_A);
        assert(preReload.count === 3, '34. the live, pre-reload timeline holds every recorded fact — the publication and both of its own inclusion observations');
        assert(reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_B) === null, '35. a txid with Base facts but no publication record has no lifecycle timeline');

        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);

        const { result: restored, networkCallOccurred } = await withoutNetworkAccess(() => persistence.load());
        assert(!networkCallOccurred, '36. restoring the archive performs zero network operations');

        const { result: postReload, networkCallOccurred: networkDuringReconstruction } = await withoutNetworkAccess(() => reconstructBaseAnchorPublicationLifecycleTimeline(restored, TX_A));
        assert(!networkDuringReconstruction, '37. reconstructing a timeline from a restored archive performs zero network operations');

        assert(JSON.stringify(preReload) === JSON.stringify(postReload), '38. the restored timeline is byte-identical to the live, pre-reload projection — destroying and restoring the archive cannot change the timeline');

        // A second save/reload cycle remains equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        const rereadTimeline = reconstructBaseAnchorPublicationLifecycleTimeline(reloadedAgain, TX_A);
        assert(JSON.stringify(rereadTimeline) === JSON.stringify(postReload), '39. a second save/load cycle is byte-identical to the first');

        assertNeverScored(postReload, 'postReload');
    }
    console.log('✓ Section E: reconstructBaseAnchorPublicationLifecycleTimeline() — reload equivalence, zero network access, "no record, no timeline"');

    // ---------------------------------------------------------------
    // Section F — no verdict vocabulary, and no fabricated third kind.
    // ---------------------------------------------------------------
    {
        const publicationRecord = record({ contentHash: CONTENT_HASH, txid: TX_A, createdAt: new Date('2026-08-20T00:00:00Z') });
        const timeline = describeBaseAnchorPublicationLifecycleTimeline(publicationRecord, {
            [TX_A]: [included({ txid: TX_A, blockNumber: 25000000, confirmationCount: 1, observedAt: new Date('2026-08-20T08:10:07Z') })]
        });

        const observedKinds = new Set(timeline.entries.map((e) => e.kind));
        for (const kind of observedKinds) {
            assert(
                kind === BaseAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION
                || kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION,
                `40. no entry kind other than PUBLICATION or INCLUSION_OBSERVATION ever appears — saw: ${kind}`
            );
        }
        assert(Object.keys(BaseAnchorPublicationLifecycleTimelineEntryKind).length === 2, '41. exactly two entry kinds are named — no BROADCAST, CONFIRMATION, or any other Bitcoin-shaped stage this domain has never made durable');

        assertNeverScored(timeline, 'noVerdictTimeline');
    }
    console.log('✓ Section F: no verdict vocabulary anywhere, and no fabricated entry kind beyond what this domain has actually made durable');

    console.log('\nAll BaseAnchorPublicationLifecycleTimeline tests passed.');
}

run().catch((error) => {
    console.error('BaseAnchorPublicationLifecycleTimeline.test.js FAILED:', error);
    process.exitCode = 1;
});
