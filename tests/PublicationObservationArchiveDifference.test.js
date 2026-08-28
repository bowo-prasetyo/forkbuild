import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import {
    PublicationObservationArchiveFingerprintComparisonResult,
    comparePublicationObservationArchiveFingerprint
} from '../application/PublicationObservationArchiveFingerprintComparison.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { describePublicationObservationArchiveDifference } from '../application/PublicationObservationArchiveDifference.js';

// 0.8.87 — Durable Publication Archive Difference Projection.
//
// The flagship this milestone exists to prove: two archives that hold the
// SAME durable facts under DIFFERENT provenance, PLUS one archive holding
// an ADDITIONAL fact the other does not, produce a difference that keeps
// all three signals separate — which facts are identical, which fact is
// only present on one side, and which existing fact's PROVENANCE differs —
// never collapsing them into one "changed" verdict, and never
// recommending which archive is correct.
//
//   Section A: FLAGSHIP — combined fact addition + provenance shift,
//              reported as three independent signals
//   Section B: SECOND FLAGSHIP — identical facts, different provenance:
//              fact difference is NONE, provenance difference is PRESENT
//   Section C: additional Bitcoin confirmation observation — same prefix,
//              one additional entry, matching this milestone's own
//              worked example
//   Section D: duplicates remain meaningful — [X, X] vs [X] is a real
//              difference, never absorbed by a set-like comparison
//   Section E: anchorId identity — two anchors with byte-identical
//              content stay two distinct identities, never merged
//   Section F: archiveImportEvents is metadata, reported separately, and
//              never affects hasFactDifference/hasProvenanceDifference or
//              the fingerprint
//   Section G: identical archives — same === true, every collection
//              empty, and 0.8.85's own comparison agrees (MATCH)
//   Section H: non-archive input always throws, for either argument
//   Section I: no mutation of either archive; deterministic
//   Section J: zero network operations; no capability/credential symbol
//              anywhere near this module
//   Section K: no trust/verdict/recommendation vocabulary anywhere in the
//              result's own field names
//   Section L: a changed fact at a shared position is reported as
//              `changed`, never silently ignored

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: 'confirmed', txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const CONTENT_HASH_A = 'e'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild archive difference test content');
const IPFS_LOCATOR = 'ipfs://bafy-difference-test';

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const observedAt = new Date('2026-08-01T00:10:00Z');
        const publicationRecord = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-flagship', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z')
        });

        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendBitcoinAnchorPublicationRecord(publicationRecord, O.LOCAL);
        currentArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-flagship', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt }), O.LOCAL);

        // externalArchive: the SAME publication record and confirmation
        // observation, but IMPORTED — plus ONE ADDITIONAL confirmation
        // observation current does not have.
        let externalArchive = PublicationObservationArchive.empty();
        externalArchive = externalArchive.appendBitcoinAnchorPublicationRecord(publicationRecord, O.IMPORTED);
        externalArchive = externalArchive.appendBitcoinConfirmationObservation('anchor-flagship', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt }), O.IMPORTED);
        externalArchive = externalArchive.appendBitcoinConfirmationObservation('anchor-flagship', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-08-01T00:20:00Z') }), O.IMPORTED);

        assert(fingerprintPublicationObservationArchive(currentArchive) !== fingerprintPublicationObservationArchive(externalArchive), '1. sanity check — the two archives fingerprint differently');

        const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);

        // The existing confirmation observation (position 0): SAME fact,
        // DIFFERENT provenance.
        assert(difference.bitcoinConfirmationObservationsByAnchorId.unchangedCount === 1, '2. the shared confirmation observation is reported as an unchanged FACT');
        assert(difference.bitcoinConfirmationObservationsByAnchorId.provenanceChangedCount === 1, '3. ...but its PROVENANCE is reported as changed');
        assert(difference.bitcoinConfirmationObservationsByAnchorId.changedCount === 0, '4. the shared observation is never counted as a changed FACT merely because its provenance differs');

        // The additional confirmation observation (position 1): only in
        // external, never counted as a provenance change.
        assert(difference.bitcoinConfirmationObservationsByAnchorId.onlyInExternalCount === 1, '5. the additional confirmation observation is reported as only-in-external');
        assert(difference.bitcoinConfirmationObservationsByAnchorId.onlyInCurrentCount === 0, '6. current holds nothing external lacks');
        assert(JSON.stringify(difference.bitcoinConfirmationObservationsByAnchorId.onlyInExternal) === JSON.stringify([{ anchorId: 'anchor-flagship', position: 1 }]), '7. the only-in-external entry names its own explicit anchorId/position identity');

        // The Bitcoin anchor publication record itself: same fact,
        // different provenance, at position 0.
        assert(difference.bitcoinAnchorPublicationRecords.unchangedCount === 1, '8. the publication record is the same FACT in both archives');
        assert(difference.bitcoinAnchorPublicationRecords.provenanceChangedCount === 1, '9. ...but its provenance differs');

        // Overall summary flags reflect BOTH kinds of difference — never
        // collapsed into one.
        assert(difference.hasFactDifference === true, '10. hasFactDifference is true — the archive holds an additional fact');
        assert(difference.hasProvenanceDifference === true, '11. hasProvenanceDifference is true — an existing, shared fact\'s provenance differs');
        assert(difference.same === false, '12. same is false, matching the fingerprints computed independently above');
        assert(difference.currentFingerprint === fingerprintPublicationObservationArchive(currentArchive), '13. currentFingerprint reuses 0.8.84\'s own algorithm exactly');
        assert(difference.externalFingerprint === fingerprintPublicationObservationArchive(externalArchive), '14. externalFingerprint reuses 0.8.84\'s own algorithm exactly');
    }
    console.log('✓ Section A: FLAGSHIP — an additional fact and a changed provenance tag on an existing fact are reported as two independent, non-collapsed signals');

    // ---------------------------------------------------------------
    // Section B — SECOND FLAGSHIP: same facts, different provenance only.
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-08-02T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }), O.LOCAL);

        let externalArchive = PublicationObservationArchive.empty();
        externalArchive = externalArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-08-02T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }), O.IMPORTED);

        assert(fingerprintPublicationObservationArchive(currentArchive) !== fingerprintPublicationObservationArchive(externalArchive), '15. sanity check — provenance alone is enough to change the fingerprint (0.8.84\'s own invariant)');

        const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);

        assert(difference.hasFactDifference === false, '16. FACT difference: NONE — every collection reports zero changed/only-in-current/only-in-external entries');
        assert(difference.hasProvenanceDifference === true, '17. PROVENANCE difference: PRESENT');
        assert(difference.same === false, '18. the fingerprints themselves still differ, per 0.8.84');
        assert(difference.ipfsPublicationRecords.unchangedCount === 1 && difference.ipfsPublicationRecords.changedCount === 0, '19. the IPFS publication record itself is exactly the same fact in both archives');
        assert(difference.ipfsPublicationRecords.provenanceChangedCount === 1, '20. only its provenance differs');

        for (const [name, collection] of Object.entries({
            ipfsPublicationRecords: difference.ipfsPublicationRecords,
            ipfsContentVerificationObservationsByRecordIndex: difference.ipfsContentVerificationObservationsByRecordIndex,
            bitcoinBroadcastRecords: difference.bitcoinBroadcastRecords,
            bitcoinConfirmationObservationsByAnchorId: difference.bitcoinConfirmationObservationsByAnchorId,
            bitcoinContentProofObservationsByAnchorId: difference.bitcoinContentProofObservationsByAnchorId,
            bitcoinAnchorPublicationRecords: difference.bitcoinAnchorPublicationRecords
        })) {
            assert(collection.changedCount === 0 && collection.onlyInCurrentCount === 0 && collection.onlyInExternalCount === 0, `21. ${name} holds no fact-level difference of any kind`);
        }
    }
    console.log('✓ Section B: identical facts under different provenance report FACT difference NONE and PROVENANCE difference PRESENT — the fingerprint still sees provenance; the fact-level diff does not confuse the two');

    // ---------------------------------------------------------------
    // Section C — additional Bitcoin confirmation observation, matching
    // this milestone's own worked example (same prefix, one additional
    // entry).
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-08-03T00:00:00Z') }));
        currentArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 2, observedAt: new Date('2026-08-03T00:10:00Z') }));

        let externalArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 3, observedAt: new Date('2026-08-03T00:20:00Z') }));

        const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        const collection = difference.bitcoinConfirmationObservationsByAnchorId;

        assert(collection.unchangedCount === 2, '22. the existing two confirmation observations are reported as unchanged');
        assert(collection.onlyInExternalCount === 1, '23. exactly one additional observation is reported as only-in-external');
        assert(collection.onlyInCurrentCount === 0, '24. current holds nothing external lacks');
        assert(collection.provenanceChangedCount === 0, '25. provenance is untouched throughout this scenario');
        assert(JSON.stringify(collection.onlyInExternal) === JSON.stringify([{ anchorId: 'anchor-c', position: 2 }]), '26. the additional entry names its own explicit position — the third observation, at index 2');
    }
    console.log('✓ Section C: a same-prefix history with one additional entry reports "existing observations: same, additional observation: present" exactly');

    // ---------------------------------------------------------------
    // Section D — duplicates remain meaningful.
    // ---------------------------------------------------------------
    {
        let single = PublicationObservationArchive.empty();
        single = single.appendBitcoinContentProofObservation('anchor-d', {
            state: 'hash-match', contentHash: CONTENT_HASH_A, reason: null, observedAt: new Date('2026-08-04T00:00:00Z')
        });

        // A SECOND, byte-identical content-proof observation for the same
        // anchor — a genuine duplicate, not a re-verification with new
        // content.
        let duplicated = single.appendBitcoinContentProofObservation('anchor-d', {
            state: 'hash-match', contentHash: CONTENT_HASH_A, reason: null, observedAt: new Date('2026-08-04T00:00:00Z')
        });

        const difference = describePublicationObservationArchiveDifference(single, duplicated);
        const collection = difference.bitcoinContentProofObservationsByAnchorId;

        assert(collection.currentCount === 1 && collection.externalCount === 2, '27. the duplicate genuinely changes each archive\'s own count');
        assert(collection.unchangedCount === 1, '28. the one shared position (0) is unchanged');
        assert(collection.onlyInExternalCount === 1, '29. the SECOND, duplicate entry is reported as a real difference — onlyInExternal — never silently absorbed because it looks identical to the first');
        assert(difference.hasFactDifference === true, '30. a duplicate that only one side holds is a genuine fact difference');
    }
    console.log('✓ Section D: [X, X] vs [X] is a real, reported difference — duplicates and position are never absorbed by a set-like comparison');

    // ---------------------------------------------------------------
    // Section E — anchorId identity: two anchors with byte-identical
    // content stay two distinct identities.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = useCase.execute(currentArchive, { anchorId: 'anchor-X', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-05T00:00:00Z') });

        // externalArchive holds a DIFFERENT anchor with the IDENTICAL
        // contentHash — never merged with anchor-X.
        let externalArchive = useCase.execute(currentArchive, { anchorId: 'anchor-Y', contentHash: CONTENT_HASH_A, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-05T00:10:00Z') });

        const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        const collection = difference.bitcoinAnchorPublicationRecords;

        assert(collection.unchangedCount === 1, '31. the shared anchor-X record is unchanged');
        assert(collection.onlyInExternalCount === 1, '32. the second record (anchor-Y, identical content, different anchor) is a real difference — never merged into anchor-X\'s own record because the content hash matches');
        assert(collection.onlyInExternal[0] === 1, '33. the additional record is identified by its own array position');
        assert(externalArchive.bitcoinAnchorPublicationRecords[1].anchorId === 'anchor-Y' && externalArchive.bitcoinAnchorPublicationRecords[0].anchorId === 'anchor-X', '34. sanity check — the two records genuinely carry two distinct anchorIds despite sharing one contentHash');
    }
    console.log('✓ Section E: two Bitcoin anchor publication records sharing an identical contentHash remain two distinct identities — never merged or deduplicated by content');

    // ---------------------------------------------------------------
    // Section F — archiveImportEvents is metadata, reported separately.
    // ---------------------------------------------------------------
    {
        let base = PublicationObservationArchive.empty();
        base = base.appendBitcoinConfirmationObservation('anchor-f', confirmed({ txid: TXID_B, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-08-06T00:00:00Z') }));

        const withEvents = base
            .appendArchiveImportEvent({ importedAt: new Date('2026-08-06T01:00:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 1 })
            .appendArchiveImportEvent({ importedAt: new Date('2026-08-06T02:00:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 2 });

        const difference = describePublicationObservationArchiveDifference(base, withEvents);

        assert(difference.same === true, '35. two archives differing ONLY in archiveImportEvents fingerprint identically — the difference agrees');
        assert(difference.hasFactDifference === false && difference.hasProvenanceDifference === false, '36. neither summary flag is affected by archiveImportEvents');
        assert(difference.importEvents.currentCount === 0 && difference.importEvents.externalCount === 2, '37. importEvents reports the raw counts as its own, separate metadata');
    }
    console.log('✓ Section F: archiveImportEvents is reported as separate metadata that never affects hasFactDifference/hasProvenanceDifference/same — 0.8.84\'s own fingerprint boundary held once more');

    // ---------------------------------------------------------------
    // Section G — identical archives; cross-check against 0.8.85's own
    // comparison.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, publishedAt: new Date('2026-08-07T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }));
        archive = useCase.execute(archive, { anchorId: 'anchor-g', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-07T00:05:00Z') });

        const twin = PublicationObservationArchive.fromJSON(archive.toJSON());

        const difference = describePublicationObservationArchiveDifference(archive, twin);
        assert(difference.same === true, '38. an archive compared against its own byte-identical twin reports same === true');
        assert(difference.hasFactDifference === false && difference.hasProvenanceDifference === false, '39. every summary flag is false');
        for (const collection of [
            difference.ipfsPublicationRecords, difference.ipfsContentVerificationObservationsByRecordIndex,
            difference.bitcoinBroadcastRecords, difference.bitcoinConfirmationObservationsByAnchorId,
            difference.bitcoinContentProofObservationsByAnchorId, difference.bitcoinAnchorPublicationRecords
        ]) {
            assert(collection.changedCount === 0 && collection.onlyInCurrentCount === 0 && collection.onlyInExternalCount === 0 && collection.provenanceChangedCount === 0, '40. every collection reports zero differences of any kind');
        }

        const comparison = comparePublicationObservationArchiveFingerprint(archive, difference.externalFingerprint);
        assert(comparison === PublicationObservationArchiveFingerprintComparisonResult.MATCH, '41. 0.8.85\'s own comparison agrees: comparing the current archive against the external archive\'s own fingerprint is MATCH');
    }
    console.log('✓ Section G: an archive compared against its own byte-identical twin reports same === true, every collection empty, agreeing with 0.8.85\'s own MATCH result');

    // ---------------------------------------------------------------
    // Section H — non-archive input always throws.
    // ---------------------------------------------------------------
    {
        const archive = PublicationObservationArchive.empty();
        const nonArchiveInputs = [null, undefined, {}, [], 'archive', 42, { toJSON: () => ({}) }];

        for (const bad of nonArchiveInputs) {
            let threw = false;
            try { describePublicationObservationArchiveDifference(bad, archive); } catch { threw = true; }
            assert(threw, `42. a non-archive currentArchive argument throws, saw value: ${JSON.stringify(bad)}`);

            threw = false;
            try { describePublicationObservationArchiveDifference(archive, bad); } catch { threw = true; }
            assert(threw, `43. a non-archive externalArchive argument throws, saw value: ${JSON.stringify(bad)}`);
        }
    }
    console.log('✓ Section H: a non-PublicationObservationArchive argument always throws, for either position — no duck typing, no silent degradation');

    // ---------------------------------------------------------------
    // Section I — no mutation; determinism.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = useCase.execute(currentArchive, { anchorId: 'anchor-i', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-08T00:00:00Z') });
        let externalArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-i', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-08-08T00:10:00Z') }));

        const currentJSONBefore = JSON.stringify(currentArchive.toJSON());
        const externalJSONBefore = JSON.stringify(externalArchive.toJSON());

        const first = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        assert(JSON.stringify(currentArchive.toJSON()) === currentJSONBefore, '44. currentArchive is never mutated');
        assert(JSON.stringify(externalArchive.toJSON()) === externalJSONBefore, '45. externalArchive is never mutated');

        const second = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        assert(JSON.stringify(first) === JSON.stringify(second), '46. calling this function twice with byte-identical archives returns a byte-identical result');
    }
    console.log('✓ Section I: neither archive is ever mutated, and the function is deterministic');

    // ---------------------------------------------------------------
    // Section J — zero network operations; no capability/credential
    // symbol anywhere near this module.
    // ---------------------------------------------------------------
    {
        let networkCallOccurred = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        try {
            describePublicationObservationArchiveDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(!networkCallOccurred, '47. computing a difference performs zero network operations');

        const fileText = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublicationObservationArchiveDifference.js', import.meta.url), 'utf8'
        );
        const importLines = fileText.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n').toLowerCase();
        const FORBIDDEN_IMPORT_SUBSTRINGS = ['wallet', 'signer', 'pinning', 'bitcoinrpc', 'fetch', 'xmlhttprequest', 'websocket', 'storage'];
        for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
            assert(!importLines.includes(forbidden), `48. this module's own import statements never reference "${forbidden}"`);
        }
    }
    console.log('✓ Section J: computing a difference performs zero network operations, and no wallet/signer/pinning/network/storage symbol is ever imported by this module');

    // ---------------------------------------------------------------
    // Section K — no trust/verdict/recommendation vocabulary in the
    // result's own field names.
    // ---------------------------------------------------------------
    {
        const difference = describePublicationObservationArchiveDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        const fieldNames = JSON.stringify(Object.keys(difference)).toLowerCase();
        const FORBIDDEN_WORDS = ['trust', 'confidence', 'verified', 'authentic', 'reliable', 'health', 'score', 'canonical', 'newer', 'better', 'correct', 'recommend', 'winner', 'merge'];
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!fieldNames.includes(forbidden), `49. the difference result's own top-level field names never mention "${forbidden}"`);
        }
    }
    console.log('✓ Section K: no trust/confidence/authentic/newer/better/correct/recommend/winner/merge vocabulary exists anywhere in the difference result\'s own field names');

    // ---------------------------------------------------------------
    // Section L — a changed fact at a shared position is reported as
    // `changed`, never silently ignored.
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-l', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-08-09T00:00:00Z') }));

        // externalArchive independently observed a DIFFERENT confirmation
        // count at the SAME history position — no shared ancestor is
        // assumed; the two archives simply disagree about what position 0
        // holds.
        let externalArchive = PublicationObservationArchive.empty();
        externalArchive = externalArchive.appendBitcoinConfirmationObservation('anchor-l', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 99, observedAt: new Date('2026-08-09T00:00:00Z') }));

        const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        const collection = difference.bitcoinConfirmationObservationsByAnchorId;

        assert(collection.changedCount === 1, '50. two different facts at the same shared identity position are reported as changed');
        assert(collection.unchangedCount === 0 && collection.onlyInCurrentCount === 0 && collection.onlyInExternalCount === 0, '51. never miscategorized as unchanged or as only-in-one-side');
        assert(JSON.stringify(collection.changed) === JSON.stringify([{ anchorId: 'anchor-l', position: 0 }]), '52. the changed entry names its own explicit identity');
        assert(difference.hasFactDifference === true, '53. a changed fact counts toward hasFactDifference');
    }
    console.log('✓ Section L: two archives holding different facts at the same shared identity position report that position as changed, never silently ignored');

    console.log('\nAll PublicationObservationArchiveDifference tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveDifference.test.js FAILED:', error);
    console.error(error.stack);
    process.exitCode = 1;
});
