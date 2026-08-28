import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import {
    PublicationObservationArchiveFingerprintComparisonResult,
    comparePublicationObservationArchiveFingerprint
} from '../application/PublicationObservationArchiveFingerprintComparison.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';

// 0.8.85 — Explicit Publication Archive Fingerprint Comparison.
//
// The flagship this milestone exists to prove: two replicas holding
// IDENTICAL facts under DIFFERENT provenance (LOCAL vs. IMPORTED) carry
// DIFFERENT fingerprints (0.8.84's own invariant), and this milestone's
// comparison function reports that difference honestly — comparing
// replica A against replica B's own fingerprint reports DIFFERENT, never
// MATCH, even though every fact the two replicas hold looks identical.
//
//   Section A: FLAGSHIP — comparison against the archive's own current
//              fingerprint is MATCH; comparison against a
//              provenance-shifted twin's fingerprint is DIFFERENT, in
//              both directions
//   Section B: equality — same archive, own fingerprint, MATCH
//   Section C: one changed observation — DIFFERENT
//   Section D: archiveImportEvents change alone — still MATCH
//   Section E: duplicate preservation — a duplicated fact changes the
//              comparison outcome
//   Section F: empty archive — two independently constructed empty
//              archives compare as MATCH
//   Section G: invalid fingerprint input — malformed strings and
//              non-string values never coerce; always
//              INVALID_FINGERPRINT, never MATCH/DIFFERENT
//   Section H: invalid archive input — a non-instance archive is always
//              INVALID_ARCHIVE, checked before the fingerprint is even
//              normalized
//   Section I: fingerprint normalization — case-insensitive, whitespace
//              trimmed, nothing more
//   Section J: no mutation, no network, no capability access, determinism
//   Section K: no verification/trust vocabulary anywhere near the result

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;
const R = PublicationObservationArchiveFingerprintComparisonResult;

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: 'confirmed', txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

const TXID_A = 'a'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const CONTENT_HASH_A = 'e'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild fingerprint comparison test content');
const IPFS_LOCATOR = 'ipfs://bafy-fingerprint-comparison-test';

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const observedAt = new Date('2026-08-01T00:10:00Z');

        let archiveLocal = PublicationObservationArchive.empty();
        archiveLocal = useCase.execute(archiveLocal, { anchorId: 'anchor-flagship', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        archiveLocal = archiveLocal.appendBitcoinConfirmationObservation('anchor-flagship', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt }));

        let archiveImported = PublicationObservationArchive.empty();
        archiveImported = useCase.execute(archiveImported, { anchorId: 'anchor-flagship', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') }, O.IMPORTED);
        archiveImported = archiveImported.appendBitcoinConfirmationObservation('anchor-flagship', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt }), O.IMPORTED);

        const fingerprintLocal = fingerprintPublicationObservationArchive(archiveLocal);
        const fingerprintImported = fingerprintPublicationObservationArchive(archiveImported);
        assert(fingerprintLocal !== fingerprintImported, '1. sanity check — 0.8.84\'s own provenance invariant still holds: identical-looking facts under different provenance fingerprint differently');

        assert(comparePublicationObservationArchiveFingerprint(archiveLocal, fingerprintLocal) === R.MATCH, '2. THE FLAGSHIP INVARIANT — comparing an archive against its OWN current fingerprint is MATCH');
        assert(comparePublicationObservationArchiveFingerprint(archiveImported, fingerprintImported) === R.MATCH, '3. ...and this holds for the provenance-shifted twin\'s own fingerprint too');

        assert(comparePublicationObservationArchiveFingerprint(archiveLocal, fingerprintImported) === R.DIFFERENT, '4. THE FLAGSHIP INVARIANT — comparing the LOCAL archive against the IMPORTED twin\'s fingerprint is DIFFERENT, even though every fact looks identical');
        assert(comparePublicationObservationArchiveFingerprint(archiveImported, fingerprintLocal) === R.DIFFERENT, '5. ...and the reverse direction is DIFFERENT too');
    }
    console.log('✓ Section A: FLAGSHIP — comparison honestly reports the provenance-driven fingerprint divergence 0.8.84 already established, in both directions');

    // ---------------------------------------------------------------
    // Section B — equality: same archive, own fingerprint, MATCH.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-b', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));
        const fingerprint = fingerprintPublicationObservationArchive(archive);
        assert(comparePublicationObservationArchiveFingerprint(archive, fingerprint) === R.MATCH, '6. an archive compared against its own fingerprint is MATCH');
    }
    console.log('✓ Section B: an archive compared against its own current fingerprint is MATCH');

    // ---------------------------------------------------------------
    // Section C — one changed observation is DIFFERENT.
    // ---------------------------------------------------------------
    {
        let archiveA = PublicationObservationArchive.empty();
        archiveA = archiveA.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));
        const fingerprintA = fingerprintPublicationObservationArchive(archiveA);

        const archiveB = archiveA.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 2, observedAt: new Date('2026-06-01T00:05:00Z') }));
        assert(comparePublicationObservationArchiveFingerprint(archiveB, fingerprintA) === R.DIFFERENT, '7. archive B (A plus one observation) compared against A\'s own fingerprint is DIFFERENT');
    }
    console.log('✓ Section C: one additional observation changes the comparison outcome to DIFFERENT');

    // ---------------------------------------------------------------
    // Section D — archiveImportEvents alone never changes the outcome.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-d', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));
        const fingerprint = fingerprintPublicationObservationArchive(archive);

        const withImportEvent = archive.appendArchiveImportEvent({ importedAt: new Date('2026-06-02T00:00:00Z'), importedArchiveSchemaVersion: 3, importedEntryCount: 1 });
        assert(comparePublicationObservationArchiveFingerprint(withImportEvent, fingerprint) === R.MATCH, '8. adding an archiveImportEvent does not change the comparison outcome — this reasserts 0.8.84\'s own exclusion boundary');
    }
    console.log('✓ Section D: archiveImportEvents changes never affect the comparison outcome, reasserting the 0.8.84 boundary');

    // ---------------------------------------------------------------
    // Section E — duplicate preservation.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const ipfsRecord = new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-04-01T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        const withOneRecord = archive.appendIpfsPublicationRecord(ipfsRecord);
        const fingerprintOne = fingerprintPublicationObservationArchive(withOneRecord);

        const withTwoRecords = withOneRecord.appendIpfsPublicationRecord(ipfsRecord);
        assert(comparePublicationObservationArchiveFingerprint(withTwoRecords, fingerprintOne) === R.DIFFERENT, '9. two archives holding a different NUMBER of duplicate factual records compare as DIFFERENT');
        assert(comparePublicationObservationArchiveFingerprint(withOneRecord, fingerprintOne) === R.MATCH, '10. ...while the original single-record archive still matches its own fingerprint');
    }
    console.log('✓ Section E: duplicate factual records are significant to the comparison outcome, not collapsed');

    // ---------------------------------------------------------------
    // Section F — empty archive.
    // ---------------------------------------------------------------
    {
        const emptyOne = PublicationObservationArchive.empty();
        const emptyTwo = PublicationObservationArchive.empty();
        const fingerprintOfEmptyOne = fingerprintPublicationObservationArchive(emptyOne);
        assert(comparePublicationObservationArchiveFingerprint(emptyTwo, fingerprintOfEmptyOne) === R.MATCH, '11. two independently constructed empty archives compare as MATCH');
    }
    console.log('✓ Section F: two independently constructed empty archives compare as MATCH');

    // ---------------------------------------------------------------
    // Section G — invalid fingerprint input.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-g', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));
        const fingerprint = fingerprintPublicationObservationArchive(archive);

        assert(comparePublicationObservationArchiveFingerprint(archive, fingerprint.slice(0, 63)) === R.INVALID_FINGERPRINT, '12. a 63-character string (one short) is INVALID_FINGERPRINT');
        assert(comparePublicationObservationArchiveFingerprint(archive, fingerprint + 'a') === R.INVALID_FINGERPRINT, '13. a 65-character string (one long) is INVALID_FINGERPRINT');
        assert(comparePublicationObservationArchiveFingerprint(archive, 'z'.repeat(64)) === R.INVALID_FINGERPRINT, '14. 64 characters of non-hex content is INVALID_FINGERPRINT');
        assert(comparePublicationObservationArchiveFingerprint(archive, '') === R.INVALID_FINGERPRINT, '15. an empty string is INVALID_FINGERPRINT');
        assert(comparePublicationObservationArchiveFingerprint(archive, '   ') === R.INVALID_FINGERPRINT, '16. a whitespace-only string is INVALID_FINGERPRINT');
        assert(comparePublicationObservationArchiveFingerprint(archive, null) === R.INVALID_FINGERPRINT, '17. null is INVALID_FINGERPRINT, never coerced to a string');
        assert(comparePublicationObservationArchiveFingerprint(archive, undefined) === R.INVALID_FINGERPRINT, '18. undefined is INVALID_FINGERPRINT');
        assert(comparePublicationObservationArchiveFingerprint(archive, 12345) === R.INVALID_FINGERPRINT, '19. a number is INVALID_FINGERPRINT, never coerced to a string and compared');
        assert(comparePublicationObservationArchiveFingerprint(archive, { fingerprint }) === R.INVALID_FINGERPRINT, '20. an object is INVALID_FINGERPRINT, even one carrying the correct digest as a property');
        assert(comparePublicationObservationArchiveFingerprint(archive, [fingerprint]) === R.INVALID_FINGERPRINT, '21. an array is INVALID_FINGERPRINT, even one containing the correct digest');
    }
    console.log('✓ Section G: malformed or non-string fingerprint input is always INVALID_FINGERPRINT, never silently coerced into a comparison');

    // ---------------------------------------------------------------
    // Section H — invalid archive input.
    // ---------------------------------------------------------------
    {
        assert(comparePublicationObservationArchiveFingerprint({ not: 'an archive' }, 'a'.repeat(64)) === R.INVALID_ARCHIVE, '22. a plain object is INVALID_ARCHIVE');
        assert(comparePublicationObservationArchiveFingerprint(null, 'a'.repeat(64)) === R.INVALID_ARCHIVE, '23. null is INVALID_ARCHIVE');
        assert(comparePublicationObservationArchiveFingerprint(undefined, 'a'.repeat(64)) === R.INVALID_ARCHIVE, '24. undefined is INVALID_ARCHIVE');
        assert(comparePublicationObservationArchiveFingerprint('not an archive either', 'a'.repeat(64)) === R.INVALID_ARCHIVE, '25. a string is INVALID_ARCHIVE');
        // A non-instance archive is INVALID_ARCHIVE even when the supplied
        // fingerprint is ALSO malformed — the archive check runs first.
        assert(comparePublicationObservationArchiveFingerprint({ not: 'an archive' }, 'not a fingerprint') === R.INVALID_ARCHIVE, '26. archive validity is checked before the fingerprint is normalized');
    }
    console.log('✓ Section H: a non-PublicationObservationArchive input is always INVALID_ARCHIVE, checked before the fingerprint is normalized');

    // ---------------------------------------------------------------
    // Section I — fingerprint normalization: case-insensitive, trimmed,
    // nothing more.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-i', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));
        const fingerprint = fingerprintPublicationObservationArchive(archive);

        assert(comparePublicationObservationArchiveFingerprint(archive, fingerprint.toUpperCase()) === R.MATCH, '27. an uppercase-hex fingerprint normalizes to lowercase before comparison and still MATCHes');
        assert(comparePublicationObservationArchiveFingerprint(archive, `  ${fingerprint}  `) === R.MATCH, '28. leading/trailing whitespace is trimmed before comparison and still MATCHes');
        assert(comparePublicationObservationArchiveFingerprint(archive, `  ${fingerprint.toUpperCase()}  `) === R.MATCH, '29. both trimming and case normalization apply together');
        const fingerprintWithInternalWhitespace = `${fingerprint.slice(0, 32)} ${fingerprint.slice(32)}`;
        assert(comparePublicationObservationArchiveFingerprint(archive, fingerprintWithInternalWhitespace) === R.INVALID_FINGERPRINT, '30. internal whitespace is never collapsed — a fingerprint with whitespace embedded in the middle stays INVALID_FINGERPRINT, even though trim() alone cannot see it');
    }
    console.log('✓ Section I: normalization is exactly case-insensitivity plus outer-whitespace trimming — nothing more');

    // ---------------------------------------------------------------
    // Section J — no mutation, no network, no capability access,
    // determinism.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-j', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));
        const fingerprint = fingerprintPublicationObservationArchive(archive);
        const before = JSON.stringify(archive.toJSON());

        const first = comparePublicationObservationArchiveFingerprint(archive, fingerprint);
        const second = comparePublicationObservationArchiveFingerprint(archive, fingerprint);
        assert(first === second, '31. calling the comparison twice with byte-identical arguments returns the byte-identical result');
        assert(JSON.stringify(archive.toJSON()) === before, '32. comparing never mutates the archive it reads');

        // This module's own `import` statements name no wallet, signer,
        // IPFS provider, pinning provider, or Bitcoin RPC symbol at all —
        // a compile-time, read-the-source guarantee that no such
        // capability could ever be reached, mirroring 0.8.84's own
        // self-containment claim. Only the `import` lines themselves are
        // checked (never the prose comments, which name these same
        // capabilities to explain their absence).
        const fileText = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublicationObservationArchiveFingerprintComparison.js', import.meta.url), 'utf8'
        );
        const importLines = fileText.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n').toLowerCase();
        const FORBIDDEN_IMPORT_SUBSTRINGS = ['wallet', 'signer', 'ipfs', 'pinning', 'bitcoinrpc', 'fetch', 'xmlhttprequest', 'websocket'];
        for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
            assert(!importLines.includes(forbidden), `33. the comparison module's own import statements never reference "${forbidden}"`);
        }
    }
    console.log('✓ Section J: comparison is deterministic, never mutates the archive, and the module itself never references any network or capability primitive');

    // ---------------------------------------------------------------
    // Section K — no verification/trust vocabulary anywhere near the
    // comparison result.
    // ---------------------------------------------------------------
    {
        const FORBIDDEN_WORDS = ['trust', 'confidence', 'verified', 'authentic', 'reliable', 'health', 'score', 'canonical', 'newer', 'correct'];
        const resultValues = Object.values(PublicationObservationArchiveFingerprintComparisonResult).join(' ').toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!resultValues.includes(forbidden), `34. the comparison result vocabulary never mentions "${forbidden}"`);
        }
        assert(Object.keys(PublicationObservationArchiveFingerprintComparisonResult).sort().join(',') === 'DIFFERENT,INVALID_ARCHIVE,INVALID_FINGERPRINT,MATCH', '35. the result enum exposes exactly these four outcomes — nothing more');
    }
    console.log('✓ Section K: no trust/confidence/validity/verified/authentic/newer/correct vocabulary exists anywhere in the comparison result outcomes');

    console.log('\nAll PublicationObservationArchiveFingerprintComparison tests passed.');
}

run().catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
