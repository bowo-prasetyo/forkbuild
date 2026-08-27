import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerifier } from '../application/IpfsPublicationContentVerifier.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';
import { appendIpfsPublicationRecordHistoryEntry } from '../application/IpfsPublicationRecordHistory.js';
import {
    appendIpfsPublicationContentVerificationHistoryEntry,
    latestIpfsPublicationContentVerification
} from '../application/IpfsPublicationContentVerificationHistory.js';
import { describeIpfsPublicationContentVerificationHistory } from '../application/IpfsPublicationContentVerificationHistoryView.js';

// 0.8.72 — IPFS Publication Verification History & Inspection UI.
//
// The flagship this milestone exists to prove: repeatedly verifying the
// SAME already-published record produces an APPEND-ONLY sequence of
// independent, dated observations — never a single "current" slot a later
// click silently overwrites — while a second, entirely separate record's
// own verification history stays completely independent of the first's.
//
//   Section A: FLAGSHIP — Publish #1 -> Record A; Verify A -> HASH_MATCH;
//              Verify A again -> UNAVAILABLE; Verify A again ->
//              HASH_MATCH; Publish #2 -> Record B; Verify B ->
//              HASH_MISMATCH. Record A's own history holds all three
//              observations, in order, undeduplicated; Record B's own
//              history holds exactly its one observation; publishing and
//              verifying Record B never alters Record A's own,
//              already-recorded history; no aggregate status/confidence/
//              trusted/healthy/valid field appears anywhere.
//   Section B: appendIpfsPublicationContentVerificationHistoryEntry()
//              never mutates the array it was given; appending a
//              null/undefined observation is a no-op; a non-array history
//              starts fresh
//   Section C: latestIpfsPublicationContentVerification() — empty
//              history, a single entry, out-of-order observedAt values,
//              and a tie broken by later array position
//   Section D: describeIpfsPublicationContentVerificationHistory()
//              narrates a full history, oldest first, carrying every
//              field through unchanged from the existing 0.8.70
//              describeIpfsPublicationContentVerification(); a null/empty
//              history narrates as empty
//   Section E: every function in this milestone is pure — calling it
//              twice with byte-identical arguments returns a
//              byte-identical result, and none of them accept a verifier,
//              coordinator, or content store of their own
//
// See docs/Roadmap.md, "0.8.72 — IPFS Publication Verification History &
// Inspection UI."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    const forbidden = ['confidence', 'reliability', 'trusted', 'verified', 'canonical', 'preferred', 'valid', 'healthy', 'reliable', 'current', 'score', 'status'];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — a verification history composes observations, it does not score them`);
    }
}

// A gateway stand-in that serves a PRE-SCRIPTED sequence of results per
// locator, one per call, repeating the final entry once exhausted — so a
// single record's locator can honestly simulate "matched, then a pin
// briefly dropped, then matched again" across three separate calls.
function makeSequencedContentStore(resultsByLocator) {
    const callCounts = new Map();
    return {
        get: async (reference) => {
            const sequence = resultsByLocator.get(reference.uri);
            if (!sequence) return null;
            const count = callCounts.get(reference.uri) || 0;
            callCounts.set(reference.uri, count + 1);
            return sequence[Math.min(count, sequence.length - 1)];
        }
    };
}

const CONTENT_A = 'ForkBuild verification history content A';
const HASH_A = computeContentHash(CONTENT_A);
const CONTENT_B = 'ForkBuild verification history content B';
const HASH_B = computeContentHash(CONTENT_B);
const WRONG_BYTES = 'not the content that Record B actually claims to be';

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    let publicationHistory = Object.freeze([]);
    const verificationHistoriesByIndex = {};
    {
        const recordA = new IpfsPublicationRecord({
            contentHash: HASH_A, locator: 'ipfs://bafyVERIFY-A', publishedAt: new Date('2026-08-27T11:00:00Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        publicationHistory = appendIpfsPublicationRecordHistoryEntry(publicationHistory, recordA);
        const indexA = 0;

        const contentStore = makeSequencedContentStore(new Map([
            ['ipfs://bafyVERIFY-A', [CONTENT_A, null, CONTENT_A]],
            ['ipfs://bafyVERIFY-B', [WRONG_BYTES]]
        ]));
        const verifier = new IpfsPublicationContentVerifier({ contentStore });

        const obsA1 = await verifier.verify(recordA);
        assert(obsA1.state === IpfsPublicationContentVerificationState.HASH_MATCH, '1. verifying Record A the first time reports HASH_MATCH');
        verificationHistoriesByIndex[indexA] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[indexA], obsA1);

        const obsA2 = await verifier.verify(recordA);
        assert(obsA2.state === IpfsPublicationContentVerificationState.UNAVAILABLE, '2. verifying Record A again reports UNAVAILABLE — a pin that momentarily dropped');
        verificationHistoriesByIndex[indexA] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[indexA], obsA2);

        const obsA3 = await verifier.verify(recordA);
        assert(obsA3.state === IpfsPublicationContentVerificationState.HASH_MATCH, '3. verifying Record A a third time reports HASH_MATCH again');
        verificationHistoriesByIndex[indexA] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[indexA], obsA3);

        assert(verificationHistoriesByIndex[indexA].length === 3, '4. Record A\'s own history holds all three observations');
        assert(
            verificationHistoriesByIndex[indexA][0].state === IpfsPublicationContentVerificationState.HASH_MATCH &&
            verificationHistoriesByIndex[indexA][1].state === IpfsPublicationContentVerificationState.UNAVAILABLE &&
            verificationHistoriesByIndex[indexA][2].state === IpfsPublicationContentVerificationState.HASH_MATCH,
            '5. Record A\'s own history preserves the exact chronological sequence HASH_MATCH, UNAVAILABLE, HASH_MATCH — the middle UNAVAILABLE observation is never discarded or overwritten by the later HASH_MATCH'
        );
        assert(verificationHistoriesByIndex[indexA][0] !== verificationHistoriesByIndex[indexA][2], '6. the two HASH_MATCH observations are genuinely distinct entries, never deduplicated');

        const recordB = new IpfsPublicationRecord({
            contentHash: HASH_B, locator: 'ipfs://bafyVERIFY-B', publishedAt: new Date('2026-08-27T11:30:00Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        publicationHistory = appendIpfsPublicationRecordHistoryEntry(publicationHistory, recordB);
        const indexB = 1;
        assert(publicationHistory.length === 2, '7. the publication history holds both Record A and Record B');

        const obsB1 = await verifier.verify(recordB);
        assert(obsB1.state === IpfsPublicationContentVerificationState.HASH_MISMATCH, '8. verifying Record B reports HASH_MISMATCH — a real, definite fact about a different record');
        verificationHistoriesByIndex[indexB] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[indexB], obsB1);

        assert(verificationHistoriesByIndex[indexB].length === 1, '9. Record B\'s own history holds exactly its one observation');
        assert(verificationHistoriesByIndex[indexA].length === 3, '10. publishing and verifying Record B never altered Record A\'s own, already-recorded history');
        assert(verificationHistoriesByIndex[indexA][1].state === IpfsPublicationContentVerificationState.UNAVAILABLE, '11. Record A\'s own earlier UNAVAILABLE observation remains exactly as it was');
        assert(publicationHistory.length === 2 && verificationHistoriesByIndex[indexA].length === 3 && verificationHistoriesByIndex[indexB].length === 1,
            '12. both histories remain exactly as they were — this milestone provides no way to rewrite or clear either history other than an explicit append');

        const narratedA = describeIpfsPublicationContentVerificationHistory(verificationHistoriesByIndex[indexA]);
        const narratedB = describeIpfsPublicationContentVerificationHistory(verificationHistoriesByIndex[indexB]);
        assert(narratedA.count === 3 && narratedA.verifications[0].state === IpfsPublicationContentVerificationState.HASH_MATCH
            && narratedA.verifications[1].state === IpfsPublicationContentVerificationState.UNAVAILABLE
            && narratedA.verifications[2].state === IpfsPublicationContentVerificationState.HASH_MATCH,
            '13. the narration for Record A preserves publish order, oldest first, with no state collapsed or reordered');
        assert(narratedB.count === 1 && narratedB.verifications[0].state === IpfsPublicationContentVerificationState.HASH_MISMATCH, '14. the narration for Record B carries exactly its own one observation');
        assertNeverScored(narratedA, 'narratedA');
        assertNeverScored(narratedB, 'narratedB');
        for (const v of narratedA.verifications) assertNeverScored(v, 'narratedA.verifications[]');
        for (const v of narratedB.verifications) assertNeverScored(v, 'narratedB.verifications[]');
        assert(latestIpfsPublicationContentVerification(verificationHistoriesByIndex[indexA]) === obsA3, '15. Record A\'s own latest observation is the third, most recent one — never inferred as "healthy" or "verified" from the sequence as a whole');
    }
    console.log('✓ Section A (FLAGSHIP): Verify/Verify Again/Verify Again on Record A produces a complete, ordered, non-deduplicated observation history, entirely independent of Record B\'s own separately kept history');

    // ---------------------------------------------------------------
    // Section B — appendIpfsPublicationContentVerificationHistoryEntry()
    // never mutates, and tolerates a missing observation.
    // ---------------------------------------------------------------
    {
        const before = verificationHistoriesByIndex[0];
        const appended = appendIpfsPublicationContentVerificationHistoryEntry(before, before[0]);
        assert(before.length === 3, '16. the original array is untouched by appending onto a copy');
        assert(appended.length === 4, '17. the returned array is a new, longer array');
        assert(appended !== before, '18. append never returns the same array reference');
        assert(Object.isFrozen(appended), '19. the appended array is frozen');

        const noop1 = appendIpfsPublicationContentVerificationHistoryEntry(before, null);
        const noop2 = appendIpfsPublicationContentVerificationHistoryEntry(before, undefined);
        assert(noop1.length === 3 && noop2.length === 3, '20. appending null/undefined is a no-op on length');
        assert(noop1 !== before && noop2 !== before, '21. even a no-op append returns a new array, never the original reference');

        const fromNothing = appendIpfsPublicationContentVerificationHistoryEntry(undefined, before[0]);
        assert(fromNothing.length === 1, '22. appending onto a non-array history starts a fresh one-entry history');
    }
    console.log('✓ Section B: append-only, non-mutating, tolerant of a missing observation');

    // ---------------------------------------------------------------
    // Section C — latestIpfsPublicationContentVerification().
    // ---------------------------------------------------------------
    {
        assert(latestIpfsPublicationContentVerification([]) === null, '23. an empty history has no latest observation');
        assert(latestIpfsPublicationContentVerification(null) === null, '24. a null history has no latest observation');

        const only = { state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: HASH_A, locator: 'ipfs://bafyONLY', reason: null, observedAt: new Date('2026-01-01T10:00:00Z') };
        assert(latestIpfsPublicationContentVerification([only]) === only, '25. a single-entry history\'s own entry is the latest');

        const early = { state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: HASH_A, locator: 'ipfs://x', reason: null, observedAt: new Date('2026-01-01T10:00:00Z') };
        const late = { state: IpfsPublicationContentVerificationState.UNAVAILABLE, contentHash: HASH_A, locator: 'ipfs://x', reason: null, observedAt: new Date('2026-01-01T10:30:00Z') };
        const middle = { state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: HASH_A, locator: 'ipfs://x', reason: null, observedAt: new Date('2026-01-01T10:10:00Z') };
        assert(latestIpfsPublicationContentVerification([early, late, middle]) === late, '26. the entry with the latest observedAt wins, regardless of array position');

        const tieA = { state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: HASH_A, locator: 'ipfs://x', reason: null, observedAt: new Date('2026-01-01T10:00:00Z') };
        const tieB = { state: IpfsPublicationContentVerificationState.UNAVAILABLE, contentHash: HASH_A, locator: 'ipfs://x', reason: null, observedAt: new Date('2026-01-01T10:00:00Z') };
        assert(latestIpfsPublicationContentVerification([tieA, tieB]) === tieB, '27. a tie in observedAt is broken by the later array position');
    }
    console.log('✓ Section C: latestIpfsPublicationContentVerification()');

    // ---------------------------------------------------------------
    // Section D — describeIpfsPublicationContentVerificationHistory().
    // ---------------------------------------------------------------
    {
        const history = verificationHistoriesByIndex[0];
        const narrated = describeIpfsPublicationContentVerificationHistory(history);
        assert(narrated.count === history.length, '28. the narration counts every entry');
        assert(narrated.verifications.length === history.length, '29. the narration lists every entry');
        assert(narrated.verifications[0].contentHash === history[0].contentHash, '30. contentHash is carried through unchanged');
        assert(narrated.verifications[0].locator === history[0].locator, '31. locator is carried through unchanged');
        assert(narrated.verifications[0].observedAt === history[0].observedAt, '32. observedAt is carried through unchanged');
        assert(typeof narrated.verifications[0].stateLabel === 'string' && narrated.verifications[0].stateLabel.length > 0, '33. each entry narrates its own full-sentence stateLabel via the existing 0.8.70 view');

        const empty = describeIpfsPublicationContentVerificationHistory(null);
        assert(empty.count === 0 && empty.verifications.length === 0, '34. a null history narrates as empty, never throwing');
        assert(Object.isFrozen(empty), '35. an empty narration result is frozen');
        assert(Object.isFrozen(empty.verifications), '36. an empty narration\'s own verifications array is frozen');

        const skipsNulls = describeIpfsPublicationContentVerificationHistory([history[0], null, undefined, history[1]]);
        assert(skipsNulls.count === 2, '37. a null/undefined entry is skipped rather than narrated as a false IDLE placeholder');
    }
    console.log('✓ Section D: describeIpfsPublicationContentVerificationHistory() narrates the full sequence, oldest first');

    // ---------------------------------------------------------------
    // Section E — purity: byte-identical input produces byte-identical
    // output, and no function here accepts a collaborator of its own.
    // ---------------------------------------------------------------
    {
        const history = verificationHistoriesByIndex[0];
        const first = JSON.stringify(describeIpfsPublicationContentVerificationHistory(history));
        const second = JSON.stringify(describeIpfsPublicationContentVerificationHistory(history));
        assert(first === second, '38. calling the narration layer twice on the same history returns byte-identical output');

        const appendedOnce = appendIpfsPublicationContentVerificationHistoryEntry(Object.freeze([]), history[0]);
        const appendedTwice = appendIpfsPublicationContentVerificationHistoryEntry(Object.freeze([]), history[0]);
        assert(JSON.stringify(appendedOnce) === JSON.stringify(appendedTwice), '39. appending the same observation onto the same starting history twice returns byte-identical output');

        assert(appendIpfsPublicationContentVerificationHistoryEntry.length === 2, '40. append takes exactly history and observation — no injected collaborator');
        assert(latestIpfsPublicationContentVerification.length === 1, '41. latest takes exactly a history — no injected collaborator');
        assert(describeIpfsPublicationContentVerificationHistory.length === 1, '42. history narration takes exactly a history — no injected collaborator');
    }
    console.log('✓ Section E: every function is pure, and none accept a verifier, coordinator, or content store of their own');

    console.log('\nAll IpfsPublicationContentVerificationHistory tests passed.');
}

run().catch((error) => {
    console.error('IpfsPublicationContentVerificationHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
