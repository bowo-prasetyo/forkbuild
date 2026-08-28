import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import {
    PublicationObservationArchiveImportOutcome,
    importPublicationObservationArchive
} from '../application/PublicationObservationArchiveExport.js';
import { describePublicationObservationArchiveDifference } from '../application/PublicationObservationArchiveDifference.js';
import { describePublicationObservationArchiveReplacementReview } from '../application/PublicationObservationArchiveReplacementReview.js';

// 0.8.88 — Explicit Publication Archive Replacement Review.
//
// The flagship this milestone exists to prove: inspecting, comparing, and
// reviewing an external archive never mutate the current archive — ONLY
// the existing, explicit 0.8.82 import mechanism ever changes it. A
// review composes the current fingerprint, the external fingerprint,
// 0.8.87's own difference, and both archives' own factual/provenance
// counts — and nothing here ever decides which archive should win.
//
//   Section A: FLAGSHIP — review, review again, review a third time; the
//              current archive never moves; only an explicit
//              importPublicationObservationArchive() call changes it
//   Section B: the review composes 0.8.87's own difference wholesale,
//              never recomputing it a second, competing way
//   Section C: current/external factual + provenance counts match this
//              milestone's own worked example
//   Section D: identical archives — same === true, review still reports
//              full side-by-side counts
//   Section E: non-archive input always throws, for either argument
//   Section F: no mutation of either archive; deterministic
//   Section G: zero network operations; no capability/credential symbol
//              anywhere near this module
//   Section H: no trust/verdict/recommendation vocabulary anywhere in the
//              result's own field names (including nested current/external)
//   Section I: exported provenance stamped IMPORTED after replacement —
//              the review shown BEFORE replacement names the fingerprint
//              that is about to become current, and that is honestly a
//              different fingerprint once actually imported

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;
const CONTENT_HASH_A = 'e'.repeat(64);
const TXID_A = 'a'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild replacement review test content');
const IPFS_LOCATOR = 'ipfs://bafy-replacement-review-test';

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: review never mutates; only explicit import
    // changes the current archive.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = useCase.execute(currentArchive, { anchorId: 'anchor-a', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });

        let externalArchive = PublicationObservationArchive.empty();
        externalArchive = externalArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, publishedAt: new Date('2026-08-10T00:05:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }));

        let workingArchive = currentArchive;
        const currentFingerprintBefore = fingerprintPublicationObservationArchive(workingArchive);

        // Inspect (already held), compare, and review — three times each,
        // for good measure.
        for (let i = 0; i < 3; i++) {
            describePublicationObservationArchiveDifference(workingArchive, externalArchive);
            describePublicationObservationArchiveReplacementReview(workingArchive, externalArchive);
            assert(fingerprintPublicationObservationArchive(workingArchive) === currentFingerprintBefore, `1.${i} reviewing repeatedly never changes the current archive's own fingerprint`);
        }

        const review = describePublicationObservationArchiveReplacementReview(workingArchive, externalArchive);
        assert(review.currentFingerprint === currentFingerprintBefore, '2. the review names the current archive\'s own fingerprint, unchanged, before any replacement');
        assert(fingerprintPublicationObservationArchive(workingArchive) === currentFingerprintBefore, '3. workingArchive is still exactly the original current archive');

        // ONLY an explicit import call may change the current archive.
        const outcome = importPublicationObservationArchive(externalArchive.toJSON());
        assert(outcome.outcome === PublicationObservationArchiveImportOutcome.IMPORTED, '4. sanity check — the external archive imports cleanly');
        workingArchive = outcome.archive;

        // NOT necessarily review.externalFingerprint — 0.8.83's own import
        // restamps every fact IMPORTED, which itself changes the
        // fingerprint (see Section I below for the dedicated
        // demonstration). The one thing this section exists to prove is
        // narrower: reviewing never moved the current archive; only this
        // explicit import call did.
        assert(fingerprintPublicationObservationArchive(workingArchive) !== currentFingerprintBefore, '5. explicit replacement genuinely changed the current archive\'s own fingerprint — something reviewing alone, above, never did');
    }
    console.log('✓ Section A: FLAGSHIP — inspecting, comparing, and reviewing never mutate the current archive; only an explicit import call ever changes it');

    // ---------------------------------------------------------------
    // Section B — the review composes 0.8.87's own difference wholesale.
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendBitcoinBroadcastRecord({ anchorId: 'anchor-b', txid: TXID_A, broadcastedAt: new Date('2026-08-11T00:00:00Z'), origin: O.LOCAL });

        let externalArchive = currentArchive.appendBitcoinBroadcastRecord({ anchorId: 'anchor-b2', txid: TXID_A, broadcastedAt: new Date('2026-08-11T00:10:00Z'), origin: O.IMPORTED });

        const independentDifference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        const review = describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive);

        assert(JSON.stringify(review.difference) === JSON.stringify(independentDifference), '7. review.difference is byte-identical to calling describePublicationObservationArchiveDifference() directly — never a second, competing diff');
        assert(review.currentFingerprint === independentDifference.currentFingerprint, '8. currentFingerprint is read from the difference, not recomputed');
        assert(review.externalFingerprint === independentDifference.externalFingerprint, '9. externalFingerprint is read from the difference, not recomputed');
        assert(review.same === independentDifference.same, '10. same is read from the difference, not recomputed');
    }
    console.log('✓ Section B: the review embeds 0.8.87\'s own difference result wholesale, never recomputing a second, competing diff');

    // ---------------------------------------------------------------
    // Section C — current/external factual + provenance counts match this
    // milestone's own worked example.
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, publishedAt: new Date('2026-08-12T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }), O.LOCAL);
        currentArchive = currentArchive.appendArchiveImportEvent({ importedAt: new Date('2026-08-12T00:01:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 1 });
        currentArchive = currentArchive.appendArchiveImportEvent({ importedAt: new Date('2026-08-12T00:02:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 1 });

        let externalArchive = currentArchive;
        for (let i = 0; i < 3; i++) {
            externalArchive = externalArchive.appendArchiveImportEvent({ importedAt: new Date(`2026-08-12T00:1${i}:00Z`), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 1 });
        }

        const review = describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive);

        assert(review.current.ipfsPublicationCount === 1 && review.external.ipfsPublicationCount === 1, '11. both sides report the shared IPFS publication record');
        assert(review.current.localFactCount === 1 && review.current.importedFactCount === 0, '12. current side\'s own provenance counts match the archive it was given');
        assert(review.current.archiveImportCount === 2, '13. current side reports its own 2 import events');
        assert(review.external.archiveImportCount === 5, '14. external side reports its own 5 import events (2 inherited + 3 additional)');
        assert(review.difference.importEvents.currentCount === 2 && review.difference.importEvents.externalCount === 5, '15. the embedded difference\'s own importEvents counts agree exactly with the two sides\' own archiveImportCount');
    }
    console.log('✓ Section C: current/external factual and provenance counts are read straight off each archive\'s own existing projections, agreeing exactly with the embedded difference\'s own importEvents counts');

    // ---------------------------------------------------------------
    // Section D — identical archives.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { anchorId: 'anchor-d', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-13T00:00:00Z') });
        const twin = PublicationObservationArchive.fromJSON(archive.toJSON());

        const review = describePublicationObservationArchiveReplacementReview(archive, twin);

        assert(review.same === true, '16. identical archives report same === true');
        assert(review.difference.hasFactDifference === false && review.difference.hasProvenanceDifference === false, '17. no fact or provenance difference');
        assert(review.current.bitcoinAnchorPublicationRecordCount === 1 && review.external.bitcoinAnchorPublicationRecordCount === 1, '18. both sides still report their own full counts even when identical — a review is not suppressed just because nothing differs');
    }
    console.log('✓ Section D: identical archives report same === true while still exposing full, side-by-side factual and provenance counts');

    // ---------------------------------------------------------------
    // Section E — non-archive input always throws.
    // ---------------------------------------------------------------
    {
        const archive = PublicationObservationArchive.empty();
        const nonArchiveInputs = [null, undefined, {}, [], 'archive', 42, { toJSON: () => ({}) }];

        for (const bad of nonArchiveInputs) {
            let threw = false;
            try { describePublicationObservationArchiveReplacementReview(bad, archive); } catch { threw = true; }
            assert(threw, `19. a non-archive currentArchive argument throws, saw value: ${JSON.stringify(bad)}`);

            threw = false;
            try { describePublicationObservationArchiveReplacementReview(archive, bad); } catch { threw = true; }
            assert(threw, `20. a non-archive externalArchive argument throws, saw value: ${JSON.stringify(bad)}`);
        }
    }
    console.log('✓ Section E: a non-PublicationObservationArchive argument always throws, for either position — no duck typing, no silent degradation');

    // ---------------------------------------------------------------
    // Section F — no mutation; determinism.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = useCase.execute(currentArchive, { anchorId: 'anchor-f', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-14T00:00:00Z') });
        let externalArchive = currentArchive.appendBitcoinConfirmationObservation('anchor-f', {
            state: 'confirmed', txid: TXID_A, blockHash: 'c'.repeat(64), blockHeight: 1, confirmationCount: 1, reason: null, observedAt: new Date('2026-08-14T00:10:00Z')
        });

        const currentJSONBefore = JSON.stringify(currentArchive.toJSON());
        const externalJSONBefore = JSON.stringify(externalArchive.toJSON());

        const first = describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive);
        assert(JSON.stringify(currentArchive.toJSON()) === currentJSONBefore, '21. currentArchive is never mutated');
        assert(JSON.stringify(externalArchive.toJSON()) === externalJSONBefore, '22. externalArchive is never mutated');

        const second = describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive);
        assert(JSON.stringify(first) === JSON.stringify(second), '23. calling this function twice with byte-identical archives returns a byte-identical result');
    }
    console.log('✓ Section F: neither archive is ever mutated, and the function is deterministic');

    // ---------------------------------------------------------------
    // Section G — zero network operations; no capability/credential
    // symbol anywhere near this module.
    // ---------------------------------------------------------------
    {
        let networkCallOccurred = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        try {
            describePublicationObservationArchiveReplacementReview(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(!networkCallOccurred, '24. computing a review performs zero network operations');

        const fileText = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublicationObservationArchiveReplacementReview.js', import.meta.url), 'utf8'
        );
        const importLines = fileText.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n').toLowerCase();
        const FORBIDDEN_IMPORT_SUBSTRINGS = ['wallet', 'signer', 'pinning', 'bitcoinrpc', 'fetch', 'xmlhttprequest', 'websocket', 'storage'];
        for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
            assert(!importLines.includes(forbidden), `25. this module's own import statements never reference "${forbidden}"`);
        }
    }
    console.log('✓ Section G: computing a review performs zero network operations, and no wallet/signer/pinning/network/storage symbol is ever imported by this module');

    // ---------------------------------------------------------------
    // Section H — no trust/verdict/recommendation vocabulary anywhere in
    // the result's own field names, including nested current/external.
    // ---------------------------------------------------------------
    {
        const review = describePublicationObservationArchiveReplacementReview(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        const fieldNames = JSON.stringify(Object.keys(review)).toLowerCase()
            + JSON.stringify(Object.keys(review.current)).toLowerCase()
            + JSON.stringify(Object.keys(review.external)).toLowerCase();
        const FORBIDDEN_WORDS = ['trust', 'confidence', 'verified', 'authentic', 'reliable', 'health', 'score', 'newer', 'better', 'correct', 'recommend', 'winner', 'merge', 'reconcil', 'safe', 'stale'];
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!fieldNames.includes(forbidden), `26. the review result's own field names never mention "${forbidden}"`);
        }
    }
    console.log('✓ Section H: no trust/confidence/authentic/newer/better/correct/recommend/winner/merge/reconcile/safe/stale vocabulary exists anywhere in the review result\'s own field names');

    // ---------------------------------------------------------------
    // Section I — provenance perspective genuinely changes fingerprint
    // once actually imported; the review shown BEFORE replacement is
    // exactly what becomes current, honestly named.
    // ---------------------------------------------------------------
    {
        let exportedArchive = PublicationObservationArchive.empty();
        exportedArchive = exportedArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, publishedAt: new Date('2026-08-15T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }), O.LOCAL);

        const currentArchive = PublicationObservationArchive.empty();
        const review = describePublicationObservationArchiveReplacementReview(currentArchive, exportedArchive);

        assert(review.externalFingerprint === fingerprintPublicationObservationArchive(exportedArchive), '27. the review names the EXTERNAL archive\'s own fingerprint exactly as it stands before import — still LOCAL-stamped');

        const outcome = importPublicationObservationArchive(exportedArchive.toJSON());
        const importedArchive = outcome.archive;

        assert(fingerprintPublicationObservationArchive(importedArchive) !== review.externalFingerprint, '28. once actually imported, every fact is restamped IMPORTED (0.8.83) and the durable fingerprint genuinely differs from what the review showed beforehand — the review never hides this');
        assert(importedArchive.importedFactCount === 1 && importedArchive.localFactCount === 0, '29. sanity check — the imported archive really is uniformly IMPORTED');
    }
    console.log('✓ Section I: the review names the external archive\'s own fingerprint exactly as inspected — honestly different from the fingerprint that results after explicit import restamps provenance (0.8.83)');

    console.log('\nAll PublicationObservationArchiveReplacementReview tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveReplacementReview.test.js FAILED:', error);
    console.error(error.stack);
    process.exitCode = 1;
});
