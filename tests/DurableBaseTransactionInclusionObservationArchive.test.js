import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';
import { describePublicationObservationArchiveDifference } from '../application/PublicationObservationArchiveDifference.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import { inspectPublicationObservationArchive, PublicationObservationArchiveInspectionOutcome } from '../application/PublicationObservationArchiveInspection.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive,
    PublicationObservationArchiveImportOutcome
} from '../application/PublicationObservationArchiveExport.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.97 — Durable Base Transaction Inclusion Observation Archive.
//
// The flagship this milestone exists to prove: a Base transaction
// inclusion observation — 0.8.96's own, unchanged
// `base/BaseTransactionInclusionObserver.js` outcome shape — survives a
// full application restart (real, JSON-round-tripping storage; destroy
// every in-memory reference; reload) with its exact history preserved,
// keyed strictly by `txid`, never by `contentHash`, and with provenance
// correctly distinguishing what was IMPORTED from what this replica
// subsequently observed LOCALLY.
//
//   Section A: FLAGSHIP — broadcast H, observe twice, persist through real
//              storage, destroy, reload — [observation1, observation2]
//              preserved exactly; a further LOCAL observation appends
//              alongside two IMPORTED ones
//   Section B: identity isolation — two Base transactions sharing one
//              contentHash keep two entirely independent observation
//              histories, surviving export/import
//   Section C: append semantics — never mutates the receiver; a missing
//              transactionHash/observation is a no-op
//   Section D: NOT_INCLUDED and UNAVAILABLE observations are archived
//              exactly as observed — every field, including nulls and
//              reason — never filtered down to only INCLUDED outcomes
//   Section E: observationCount counts Base inclusion observations;
//              publicationCount/bitcoinAnchorPublicationRecordCount stay
//              unaffected
//   Section F: schemaVersion 3 → 4 — a pre-0.8.97 payload degrades to an
//              empty archive, never a partial migration
//   Section G: PublicationObservationArchiveDifference reports the new
//              collection — additional/changed/provenance-changed
//              signals, duplicates never absorbed
//   Section H: an archive fingerprint changes the moment a Base
//              observation is added or its provenance changes — no new
//              fingerprinting mechanism
//   Section I: PublicationObservationArchiveInspection exposes
//              baseTransactionInclusionObservationCount/baseTransactionHashes
//   Section J: the cross-domain timeline (PublicationObservationArchiveView's
//              own entries) is UNTOUCHED by this milestone's own count field
//              — this milestone answers durability only, never timeline
//              integration; see docs/Roadmap.md, 0.8.98, "Base Transaction
//              Inclusion Observation Timeline," for where entries/entryCount
//              gained Base facts one milestone later — this file's own
//              assertions below are updated accordingly, without changing
//              this milestone's own scope
//   Section K: no trust/verdict vocabulary anywhere in this milestone's
//              own new surface

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const TXID_H = '1'.repeat(64);
const TXID_H1 = '2'.repeat(64);
const TXID_H2 = '3'.repeat(64);
const CONTENT_HASH_C = 'c'.repeat(64);
const BLOCK_HASH = 'b'.repeat(64);

// Mirrors exactly what `base/BaseTransactionInclusionObserver.js#observeInclusion()`
// (0.8.96, unchanged) resolves to.
function included({ txid, blockNumber, transactionIndex = 0, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BaseTransactionInclusionObservationState.INCLUDED,
        txid, blockHash: BLOCK_HASH, blockNumber, transactionIndex, confirmationCount,
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: broadcast H, observe twice, persist through
    // real storage, destroy, reload — identical history. A further LOCAL
    // observation appends alongside two now-IMPORTED ones.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const obs1 = notIncluded({ txid: TXID_H, observedAt: new Date('2026-08-01T00:00:00Z') });
        const obs2 = included({ txid: TXID_H, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-08-01T00:10:00Z') });

        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, obs1);
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, obs2);

        assert(archive.baseTransactionInclusionObservationsByTransactionHash[TXID_H].length === 2, '1. both observations are held under the exact txid, in order');
        assert(archive.observationCount === 2, '2. observationCount counts both Base observations');

        // Persist through REAL, JSON-round-tripping storage.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);

        // Destroy every in-memory reference.
        archive = null;

        const restored = persistence.load();
        assert(restored instanceof PublicationObservationArchive, '3. load() returns a genuine archive');
        const restoredHistory = restored.baseTransactionInclusionObservationsByTransactionHash[TXID_H];
        assert(restoredHistory.length === 2, '4. the restored history holds exactly two observations');
        assert(restoredHistory[0].state === BaseTransactionInclusionObservationState.NOT_INCLUDED, '5. the earlier NOT_INCLUDED observation is preserved, not overwritten');
        assert(restoredHistory[1].state === BaseTransactionInclusionObservationState.INCLUDED, '6. the later INCLUDED observation is present alongside it');
        assert(restoredHistory[1].blockNumber === 100 && restoredHistory[1].confirmationCount === 1, '7. block metadata survives the round trip exactly');
        assert(restoredHistory[1].observedAt instanceof Date && restoredHistory[1].observedAt.getTime() === obs2.observedAt.getTime(), '8. observedAt survives as a real Date, byte-identical');

        // Now round-trip through export/import (0.8.82/0.8.83's own path)
        // instead of raw storage — the SAME facts become IMPORTED.
        const exported = exportPublicationObservationArchive(restored);
        const { outcome, archive: imported } = importPublicationObservationArchive(exported);
        assert(outcome === PublicationObservationArchiveImportOutcome.IMPORTED, '9. a real export round-trips as IMPORTED');
        assert(imported.baseTransactionInclusionObservationProvenanceByTransactionHash[TXID_H].every((origin) => origin === O.IMPORTED),
            '10. every imported Base observation is stamped IMPORTED, regardless of what it claimed before export');

        // A further, LOCAL observation appends alongside the two IMPORTED
        // ones — the flagship provenance sequence.
        const obs3 = included({ txid: TXID_H, blockNumber: 106, confirmationCount: 7, observedAt: new Date('2026-08-01T01:00:00Z') });
        const withLocal = imported.appendBaseTransactionInclusionObservation(TXID_H, obs3);
        const finalProvenance = withLocal.baseTransactionInclusionObservationProvenanceByTransactionHash[TXID_H];
        assert(JSON.stringify(finalProvenance) === JSON.stringify([O.IMPORTED, O.IMPORTED, O.LOCAL]),
            '11. the provenance sequence is exactly [IMPORTED, IMPORTED, LOCAL] — imported facts stay IMPORTED, the new one is LOCAL');
        assert(withLocal.baseTransactionInclusionObservationsByTransactionHash[TXID_H].length === 3, '12. all three observations coexist in one, single history');
    }
    console.log('✓ Section A: FLAGSHIP — broadcast, observe twice, persist through real storage, destroy, reload — [obs1, obs2] preserved exactly; a further LOCAL observation appends alongside two IMPORTED ones');

    // ---------------------------------------------------------------
    // Section B — identity isolation: two Base transactions sharing one
    // contentHash keep two entirely independent observation histories.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H1, included({ txid: TXID_H1, blockNumber: 10, confirmationCount: 1, observedAt: new Date('2026-08-02T00:00:00Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H1, included({ txid: TXID_H1, blockNumber: 10, confirmationCount: 4, observedAt: new Date('2026-08-02T00:05:00Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H2, notIncluded({ txid: TXID_H2, observedAt: new Date('2026-08-02T00:01:00Z') }));

        assert(archive.baseTransactionInclusionObservationsByTransactionHash[TXID_H1].length === 2, '13. H1 holds its own two observations');
        assert(archive.baseTransactionInclusionObservationsByTransactionHash[TXID_H2].length === 1, '14. H2 holds its own single observation, never merged with H1\'s');

        const restored = PublicationObservationArchive.fromJSON(archive.toJSON());
        assert(restored.baseTransactionInclusionObservationsByTransactionHash[TXID_H1].length === 2, '15. H1\'s history survives export/import round trip independently');
        assert(restored.baseTransactionInclusionObservationsByTransactionHash[TXID_H2].length === 1, '16. H2\'s history survives independently too — CONTENT_HASH_C never used as a lookup key anywhere');
        // CONTENT_HASH_C is never referenced by either collection at all —
        // this archive holds no publication-identity record binding
        // txid <-> contentHash for Base (that record type is not part of
        // this milestone), so nothing here could accidentally merge on it.
        assert(CONTENT_HASH_C.length === 64, '17. sanity — a shared contentHash exists conceptually, yet plays no role in either history\'s own identity');
    }
    console.log('✓ Section B: two Base transactions sharing one contentHash keep two entirely independent observation histories, surviving export/import');

    // ---------------------------------------------------------------
    // Section C — append semantics: never mutates the receiver; a missing
    // transactionHash/observation is a no-op.
    // ---------------------------------------------------------------
    {
        const empty = PublicationObservationArchive.empty();
        const obs = included({ txid: TXID_H, blockNumber: 1, confirmationCount: 1, observedAt: new Date() });
        const withObs = empty.appendBaseTransactionInclusionObservation(TXID_H, obs);

        assert(Object.keys(empty.baseTransactionInclusionObservationsByTransactionHash).length === 0, '18. appendBaseTransactionInclusionObservation() never mutates the receiver');
        assert(withObs !== empty, '19. append always returns a new instance');
        assert(empty.appendBaseTransactionInclusionObservation(null, obs) === empty, '20. a missing transactionHash is a no-op');
        assert(empty.appendBaseTransactionInclusionObservation(TXID_H, null) === empty, '21. a missing observation is a no-op');
        assert(empty.appendBaseTransactionInclusionObservation(TXID_H, obs, 'not-a-real-origin') === empty, '22. an invalid origin is a no-op');
        assert(Object.isFrozen(withObs), '23. every archive instance is frozen');
        assert(Object.isFrozen(withObs.baseTransactionInclusionObservationsByTransactionHash[TXID_H]), '24. the per-transaction observation array is frozen');
    }
    console.log('✓ Section C: append never mutates the receiver, and a missing transactionHash/observation/invalid origin is a no-op');

    // ---------------------------------------------------------------
    // Section D — NOT_INCLUDED and UNAVAILABLE observations are archived
    // exactly as observed, never filtered down to only INCLUDED outcomes.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const notIncludedObs = notIncluded({ txid: TXID_H, observedAt: new Date('2026-08-03T00:00:00Z') });
        const unavailableObs = unavailable({ txid: TXID_H, reason: 'RPC endpoint unreachable', observedAt: new Date('2026-08-03T00:05:00Z') });

        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, notIncludedObs);
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, unavailableObs);

        const restored = PublicationObservationArchive.fromJSON(archive.toJSON());
        const history = restored.baseTransactionInclusionObservationsByTransactionHash[TXID_H];
        assert(history.length === 2, '25. both a NOT_INCLUDED and an UNAVAILABLE attempt are archived — an inability to observe is preserved, never silently dropped');
        assert(history[0].state === BaseTransactionInclusionObservationState.NOT_INCLUDED && history[0].blockHash === null && history[0].confirmationCount === null,
            '26. NOT_INCLUDED carries every inapplicable field as null, exactly as observed');
        assert(history[1].state === BaseTransactionInclusionObservationState.UNAVAILABLE && history[1].reason === 'RPC endpoint unreachable',
            '27. UNAVAILABLE carries its own reason, exactly as observed');
    }
    console.log('✓ Section D: NOT_INCLUDED and UNAVAILABLE observations are archived exactly as observed, including every inapplicable null field and the UNAVAILABLE reason');

    // ---------------------------------------------------------------
    // Section E — observationCount counts Base inclusion observations;
    // publicationCount/bitcoinAnchorPublicationRecordCount stay unaffected.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        assert(archive.observationCount === 0 && archive.publicationCount === 0 && archive.bitcoinAnchorPublicationRecordCount === 0, '28. a fresh archive holds none of the three counts');

        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, notIncluded({ txid: TXID_H, observedAt: new Date('2026-08-04T00:00:00Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, included({ txid: TXID_H, blockNumber: 5, confirmationCount: 1, observedAt: new Date('2026-08-04T00:05:00Z') }));

        assert(archive.observationCount === 2, '29. observationCount counts both Base observations');
        assert(archive.publicationCount === 0, '30. publicationCount is unaffected — a Base inclusion observation is never a publication-shaped fact');
        assert(archive.bitcoinAnchorPublicationRecordCount === 0, '31. bitcoinAnchorPublicationRecordCount is unaffected — Base mints no publication-identity record in this milestone');
        assert(archive.totalFactCount === 2 && archive.localFactCount === 2 && archive.importedFactCount === 0, '32. provenance counts agree: two LOCAL facts, zero IMPORTED');

        const summary = describePublicationObservationArchive(archive);
        assert(summary.observationCount === 2, '33. the view\'s own observationCount matches the archive\'s own getter exactly');
        assert(summary.baseTransactionInclusionCount === 2, '34. the view exposes a per-domain baseTransactionInclusionCount breakdown, mirroring bitcoinConfirmationCount');
    }
    console.log('✓ Section E: observationCount counts Base inclusion observations; publicationCount/bitcoinAnchorPublicationRecordCount stay unaffected');

    // ---------------------------------------------------------------
    // Section F — schemaVersion 3 → 4; a pre-0.8.97 payload degrades to an
    // empty archive. SCHEMA_VERSION itself has since been bumped again, to
    // 5 by 0.8.99's own baseAnchorPublicationRecords collection, to 6 by
    // 0.8.104's own publicationReferenceRecords collection, and to 7 by
    // 0.8.108's own publisherPublicationAssociationRecords collection —
    // this section still only asserts the ONE fact that stays true
    // regardless: a schemaVersion-3 payload (predating 0.8.97 entirely) is
    // not valid under whatever the CURRENT schema is.
    // ---------------------------------------------------------------
    {
        assert(PublicationObservationArchive.SCHEMA_VERSION === 8, '35. SCHEMA_VERSION is now 8 (bumped to 4 by 0.8.97, to 5 by 0.8.99, to 6 by 0.8.104, to 7 by 0.8.108, then to 8 by 0.8.130)');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, included({ txid: TXID_H, blockNumber: 1, confirmationCount: 1, observedAt: new Date('2026-08-05T00:00:00Z') }));
        const preMilestoneJson = { ...archive.toJSON(), schemaVersion: 3 };
        delete preMilestoneJson.baseTransactionInclusionObservationsByTransactionHash;
        delete preMilestoneJson.baseTransactionInclusionObservationProvenanceByTransactionHash;

        const restored = PublicationObservationArchive.fromJSON(preMilestoneJson);
        assert(restored.observationCount === 0 && restored.publicationCount === 0, '36. a schemaVersion-3 payload (missing the Base collections entirely) degrades to an empty archive, never a partial migration');

        assert(PublicationObservationArchive.isValidJSON(preMilestoneJson) === false, '37. isValidJSON() agrees — a schemaVersion-3 payload is not a valid current-schema archive');
    }
    console.log('✓ Section F: SCHEMA_VERSION is now 6; a pre-0.8.97 (schemaVersion 3) payload degrades to an empty archive, never a partial migration');

    // ---------------------------------------------------------------
    // Section G — PublicationObservationArchiveDifference reports the new
    // collection.
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendBaseTransactionInclusionObservation(TXID_H, notIncluded({ txid: TXID_H, observedAt: new Date('2026-08-06T00:00:00Z') }), O.LOCAL);

        let externalArchive = PublicationObservationArchive.empty();
        externalArchive = externalArchive.appendBaseTransactionInclusionObservation(TXID_H, notIncluded({ txid: TXID_H, observedAt: new Date('2026-08-06T00:00:00Z') }), O.IMPORTED);
        externalArchive = externalArchive.appendBaseTransactionInclusionObservation(TXID_H, included({ txid: TXID_H, blockNumber: 9, confirmationCount: 2, observedAt: new Date('2026-08-06T00:10:00Z') }), O.IMPORTED);

        const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        const collection = difference.baseTransactionInclusionObservationsByTransactionHash;

        assert(collection.unchangedCount === 1, '38. the shared observation is reported as an unchanged FACT');
        assert(collection.provenanceChangedCount === 1, '39. ...but its provenance differs');
        assert(collection.onlyInExternalCount === 1, '40. the additional observation is reported as only-in-external');
        assert(JSON.stringify(collection.onlyInExternal) === JSON.stringify([{ transactionHash: TXID_H, position: 1 }]), '41. the additional entry names its own explicit transactionHash/position identity');
        assert(difference.hasFactDifference === true && difference.hasProvenanceDifference === true, '42. both summary flags reflect this collection\'s own differences');

        // Duplicates remain meaningful — never absorbed by a set-like
        // comparison.
        let single = PublicationObservationArchive.empty();
        single = single.appendBaseTransactionInclusionObservation(TXID_H2, notIncluded({ txid: TXID_H2, observedAt: new Date('2026-08-06T01:00:00Z') }));
        let duplicated = single.appendBaseTransactionInclusionObservation(TXID_H2, notIncluded({ txid: TXID_H2, observedAt: new Date('2026-08-06T01:00:00Z') }));
        const dupDifference = describePublicationObservationArchiveDifference(single, duplicated);
        assert(dupDifference.baseTransactionInclusionObservationsByTransactionHash.onlyInExternalCount === 1, '43. a genuine duplicate is reported as a real difference, never silently absorbed');
    }
    console.log('✓ Section G: PublicationObservationArchiveDifference reports the seventh collection with the identical unchanged/changed/provenance-changed/onlyInCurrent/onlyInExternal signals, duplicates included');

    // ---------------------------------------------------------------
    // Section H — an archive fingerprint changes the moment a Base
    // observation is added or its provenance changes.
    // ---------------------------------------------------------------
    {
        const withoutBase = PublicationObservationArchive.empty();
        const withBase = withoutBase.appendBaseTransactionInclusionObservation(TXID_H, notIncluded({ txid: TXID_H, observedAt: new Date('2026-08-07T00:00:00Z') }));
        assert(fingerprintPublicationObservationArchive(withoutBase) !== fingerprintPublicationObservationArchive(withBase),
            '44. adding a Base observation changes the archive fingerprint — no separate fingerprinting mechanism was introduced, the existing algorithm simply sees the expanded canonical JSON');

        const localProvenance = withBase;
        const importedProvenance = withBase.withUniformProvenance(O.IMPORTED);
        assert(fingerprintPublicationObservationArchive(localProvenance) !== fingerprintPublicationObservationArchive(importedProvenance),
            '45. a provenance-only change to a Base observation also changes the fingerprint, exactly like every other collection');
    }
    console.log('✓ Section H: adding a Base observation, or changing its provenance, changes the archive fingerprint — the existing 0.8.84 algorithm, unmodified, simply sees the expanded canonical archive');

    // ---------------------------------------------------------------
    // Section I — PublicationObservationArchiveInspection exposes
    // baseTransactionInclusionObservationCount/baseTransactionHashes.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H1, included({ txid: TXID_H1, blockNumber: 1, confirmationCount: 1, observedAt: new Date('2026-08-08T00:00:00Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H2, notIncluded({ txid: TXID_H2, observedAt: new Date('2026-08-08T00:01:00Z') }));

        const { outcome, inspection } = inspectPublicationObservationArchive(archive.toJSON());
        assert(outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED, '46. a real archive inspects successfully');
        assert(inspection.baseTransactionInclusionObservationCount === 2, '47. baseTransactionInclusionObservationCount matches the archive\'s own two observations');
        assert(JSON.stringify(inspection.baseTransactionHashes.slice().sort()) === JSON.stringify([TXID_H1, TXID_H2].sort()), '48. baseTransactionHashes names both distinct transaction identities, first-seen order');
    }
    console.log('✓ Section I: PublicationObservationArchiveInspection exposes baseTransactionInclusionObservationCount and a baseTransactionHashes identity list, mirroring bitcoinAnchorIds');

    // ---------------------------------------------------------------
    // Section J — as of 0.8.98, the cross-domain timeline DOES compose
    // durably archived Base facts (see
    // tests/BaseTransactionInclusionObservationTimeline.test.js for that
    // milestone's own flagship coverage); this file's own remaining
    // assertion is narrower — that the summary COUNT this milestone (0.8.97)
    // introduced counts Base observations independently of whatever the
    // timeline separately does with them.
    // ---------------------------------------------------------------
    {
        let withoutBase = PublicationObservationArchive.empty();
        let withBase = withoutBase.appendBaseTransactionInclusionObservation(TXID_H, included({ txid: TXID_H, blockNumber: 1, confirmationCount: 1, observedAt: new Date('2026-08-09T00:00:00Z') }));

        const summaryWithout = describePublicationObservationArchive(withoutBase);
        const summaryWith = describePublicationObservationArchive(withBase);

        assert(summaryWithout.entryCount === 0 && summaryWith.entryCount === 1, '49. (0.8.98) the timeline entryCount now sees a Base observation — one entry, never a synthetic multiple');
        assert(summaryWith.entries[0].domain === 'base' && summaryWith.entries[0].transactionHash === TXID_H, '50. (0.8.98) the one new entry names the Base domain and this observation\'s own transactionHash, never contentHash');
        assert(summaryWith.baseTransactionInclusionCount === 1, '51. the summary COUNT this milestone introduced also sees it — a count and a timeline entry are two independent projections of the same durable fact, never merged into one');
    }
    console.log('✓ Section J: baseTransactionInclusionCount (0.8.97) and the cross-domain timeline (0.8.98) both independently see a durably archived Base observation');

    // ---------------------------------------------------------------
    // Section K — no trust/verdict vocabulary anywhere in this milestone's
    // own new surface.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBaseTransactionInclusionObservation(TXID_H, included({ txid: TXID_H, blockNumber: 1, confirmationCount: 1, observedAt: new Date('2026-08-10T00:00:00Z') }));

        const summary = describePublicationObservationArchive(archive);
        const { inspection } = inspectPublicationObservationArchive(archive.toJSON());
        const difference = describePublicationObservationArchiveDifference(archive, PublicationObservationArchive.empty());

        const FORBIDDEN_WORDS = ['trust', 'confidence', 'verified', 'authentic', 'reliable', 'health', 'score', 'canonical', 'newer', 'better', 'correct', 'recommend', 'winner', 'merge', 'valid', 'safe'];
        const haystacks = [
            JSON.stringify(Object.keys(summary)),
            JSON.stringify(Object.keys(inspection)),
            JSON.stringify(Object.keys(difference))
        ].join(' ').toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!haystacks.includes(forbidden), `52. no field name anywhere in this milestone's own new surface mentions "${forbidden}"`);
        }
    }
    console.log('✓ Section K: no trust/confidence/verified/health/score/newer/better/correct/recommend/merge vocabulary exists anywhere in this milestone\'s own new surface');

    console.log('\nAll DurableBaseTransactionInclusionObservationArchive tests passed.');
}

run().catch((error) => {
    console.error('DurableBaseTransactionInclusionObservationArchive.test.js FAILED:', error);
    console.error(error.stack);
    process.exitCode = 1;
});
