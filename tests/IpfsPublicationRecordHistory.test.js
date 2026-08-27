import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerifier } from '../application/IpfsPublicationContentVerifier.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';
import {
    appendIpfsPublicationRecordHistoryEntry,
    latestIpfsPublicationRecord
} from '../application/IpfsPublicationRecordHistory.js';
import {
    describeIpfsPublicationMethodLabel,
    describeIpfsPublicationRecordHistoryEntry,
    describeIpfsPublicationRecordHistory
} from '../application/IpfsPublicationRecordHistoryView.js';

// 0.8.71 — IPFS Publication Record History & Inspection.
//
// The flagship this milestone exists to prove: publishing the SAME
// content twice produces TWO independent, append-only
// `IpfsPublicationRecord` entries — a second publish never overwrites or
// discards the first — and each record's own, separately kept content
// verification observation stays bound to exactly that record, never
// contaminating or being contaminated by the other's.
//
//   Section A: FLAGSHIP — publish content A -> Record A; publish content
//              A again -> Record B; history holds [A, B]; verifying
//              Record A reports HASH_MATCH while Record B (whose own
//              locator the gateway does not serve) reports UNAVAILABLE;
//              both records and both observations remain unchanged and
//              independent afterward
//   Section B: appendIpfsPublicationRecordHistoryEntry() never mutates
//              the array it was given; appending a null/undefined record
//              is a no-op; a non-array history starts fresh
//   Section C: latestIpfsPublicationRecord() — empty history, a single
//              entry, out-of-order publishedAt values, and a tie broken
//              by later array position
//   Section D: describeIpfsPublicationMethodLabel() names both known
//              methods; an unrecognized/null method names nothing
//   Section E: describeIpfsPublicationRecordHistory() narrates a full
//              history, oldest first, carrying every field through
//              unchanged; a null/empty history narrates as empty
//   Section F: describeIpfsPublicationRecordHistoryEntry() freezes its
//              result and returns null for no record
//   Section G: no `confidence`/`reliability`/`trusted`/`verified`/
//              `canonical`/`preferred` field anywhere in any output this
//              milestone's files produce — a history composes facts, it
//              does not score them
//   Section H: every function in this milestone is pure — calling it
//              twice with byte-identical arguments returns a
//              byte-identical result, and none of them accept a verifier,
//              coordinator, or content store of their own
//
// See docs/Roadmap.md, "0.8.71 — IPFS Publication Record History &
// Inspection."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    const forbidden = ['confidence', 'reliability', 'trusted', 'verified', 'canonical', 'preferred', 'valid', 'healthy', 'reliable', 'current', 'score', 'status'];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — a publication history and its inspection compose facts, they do not score them`);
    }
}

// A tiny in-memory gateway stand-in, keyed by locator — identical in
// spirit to tests/IpfsPublicationContentVerification.test.js's own fake,
// except it resolves by locator directly (a plain `get()` contract) so
// this test needs no real content/IpfsGatewayContentStore.js CID parsing.
function makeFakeContentStore(network) {
    return {
        get: async (reference) => {
            if (!network.has(reference.uri)) return null;
            return network.get(reference.uri);
        }
    };
}

const CONTENT_A = 'ForkBuild publication history content';
const HASH_A = computeContentHash(CONTENT_A);

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: publish content A, publish content A again,
    // verify each record independently.
    // ---------------------------------------------------------------
    let history = Object.freeze([]);
    {
        const recordA = new IpfsPublicationRecord({
            contentHash: HASH_A, locator: 'ipfs://bafyRECORD-A', publishedAt: new Date('2026-08-27T10:00:00Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        history = appendIpfsPublicationRecordHistoryEntry(history, recordA);
        assert(history.length === 1, '1. the first publish appends Record A');
        assert(history[0] === recordA, '2. the first entry is exactly Record A, unmodified');

        // Publishing the identical content again — a real, common case
        // (a provider dropped the pin, or a person simply republishes) —
        // produces a SECOND, distinct record, never merged with the first
        // even though both name the identical contentHash.
        const recordB = new IpfsPublicationRecord({
            contentHash: HASH_A, locator: 'ipfs://bafyRECORD-B', publishedAt: new Date('2026-08-27T10:15:00Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        history = appendIpfsPublicationRecordHistoryEntry(history, recordB);
        assert(history.length === 2, '3. the second publish appends Record B, never overwriting Record A');
        assert(history[0] === recordA, '4. Record A is still exactly where it was after Record B is appended');
        assert(history[1] === recordB, '5. Record B is the second, distinct entry');
        assert(history[0].locator !== history[1].locator, '6. sanity: the two records genuinely name different locators');

        assert(latestIpfsPublicationRecord(history) === recordB, '7. the latest record is Record B, the most recently published');

        // The gateway only ever serves Record A's own locator — Record
        // B's own locator is never reachable, simulating a pin that never
        // took (or was later dropped).
        const network = new Map([['ipfs://bafyRECORD-A', CONTENT_A]]);
        const contentStore = makeFakeContentStore(network);
        const verifier = new IpfsPublicationContentVerifier({ contentStore });

        const observationA = await verifier.verify(recordA);
        assert(observationA.state === IpfsPublicationContentVerificationState.HASH_MATCH, '8. verifying Record A reports HASH_MATCH');

        const observationB = await verifier.verify(recordB);
        assert(observationB.state === IpfsPublicationContentVerificationState.UNAVAILABLE, '9. verifying Record B reports UNAVAILABLE — an entirely different fact about an entirely different record');

        // Both records remain unchanged, and both observations remain
        // independent — verifying B never touched A's own record or A's
        // own observation, and vice versa.
        assert(history[0] === recordA && history[1] === recordB, '10. neither record was mutated or reordered by verification');
        assert(observationA.state === IpfsPublicationContentVerificationState.HASH_MATCH, '11. Record A\'s own observation is unchanged after Record B was verified');
        assert(observationA.locator === recordA.locator && observationB.locator === recordB.locator, '12. each observation carries its own record\'s own locator, never the other\'s');
        assert(observationA.observedAt.getTime() !== observationB.observedAt.getTime() || observationA !== observationB, '13. the two observations are genuinely distinct objects');

        // Re-verifying Record A a second time is still a fresh,
        // independent read — it does not retroactively change Record B's
        // own, earlier UNAVAILABLE observation.
        const observationA2 = await verifier.verify(recordA);
        assert(observationA2.state === IpfsPublicationContentVerificationState.HASH_MATCH, '14. re-verifying Record A still reports HASH_MATCH');
        assert(observationB.state === IpfsPublicationContentVerificationState.UNAVAILABLE, '15. Record B\'s own earlier observation is untouched by re-verifying Record A');

        // The narration composes both records, in order, with no
        // aggregate "history status" or combined verdict anywhere.
        const narrated = describeIpfsPublicationRecordHistory(history);
        assert(narrated.count === 2, '16. the narration counts both records');
        assert(narrated.records[0].locator === recordA.locator && narrated.records[1].locator === recordB.locator, '17. the narration preserves publish order, oldest first');
        assert(!('status' in narrated) && !('verdict' in narrated), '18. the narration carries no aggregate status/verdict field');
    }
    console.log('✓ Section A (FLAGSHIP): publishing content twice produces two independent, append-only records, each with its own, uncontaminated verification observation');

    // ---------------------------------------------------------------
    // Section B — appendIpfsPublicationRecordHistoryEntry() never
    // mutates, and tolerates a missing record.
    // ---------------------------------------------------------------
    {
        const before = history;
        const appended = appendIpfsPublicationRecordHistoryEntry(before, before[0]);
        assert(before.length === 2, '19. the original array is untouched by appending onto a copy');
        assert(appended.length === 3, '20. the returned array is a new, longer array');
        assert(appended !== before, '21. append never returns the same array reference');
        assert(Object.isFrozen(appended), '22. the appended array is frozen');

        const noop1 = appendIpfsPublicationRecordHistoryEntry(before, null);
        const noop2 = appendIpfsPublicationRecordHistoryEntry(before, undefined);
        assert(noop1.length === 2 && noop2.length === 2, '23. appending null/undefined is a no-op on length');
        assert(noop1 !== before && noop2 !== before, '24. even a no-op append returns a new array, never the original reference');

        const fromNothing = appendIpfsPublicationRecordHistoryEntry(undefined, before[0]);
        assert(fromNothing.length === 1, '25. appending onto a non-array history starts a fresh one-entry history');
    }
    console.log('✓ Section B: append-only, non-mutating, tolerant of a missing record');

    // ---------------------------------------------------------------
    // Section C — latestIpfsPublicationRecord().
    // ---------------------------------------------------------------
    {
        assert(latestIpfsPublicationRecord([]) === null, '26. an empty history has no latest record');
        assert(latestIpfsPublicationRecord(null) === null, '27. a null history has no latest record');
        assert(latestIpfsPublicationRecord([history[0]]) === history[0], '28. a single-entry history\'s own entry is the latest');

        const early = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyEARLY', publishedAt: new Date('2026-01-01T10:00:00Z') });
        const late = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyLATE', publishedAt: new Date('2026-01-01T10:30:00Z') });
        const middle = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyMIDDLE', publishedAt: new Date('2026-01-01T10:10:00Z') });
        assert(latestIpfsPublicationRecord([early, late, middle]) === late, '29. the entry with the latest publishedAt wins, regardless of array position');

        const tieA = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyTIEA', publishedAt: new Date('2026-01-01T10:00:00Z') });
        const tieB = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyTIEB', publishedAt: new Date('2026-01-01T10:00:00Z') });
        assert(latestIpfsPublicationRecord([tieA, tieB]) === tieB, '30. a tie in publishedAt is broken by the later array position');
    }
    console.log('✓ Section C: latestIpfsPublicationRecord()');

    // ---------------------------------------------------------------
    // Section D — describeIpfsPublicationMethodLabel().
    // ---------------------------------------------------------------
    {
        assert(describeIpfsPublicationMethodLabel(IpfsPublicationMethod.KUBO) === 'Local IPFS node (Kubo)', '31. KUBO label');
        assert(describeIpfsPublicationMethodLabel(IpfsPublicationMethod.REMOTE_PINNING) === 'Remote pinning provider', '32. REMOTE_PINNING label');
        assert(describeIpfsPublicationMethodLabel('not-a-real-method') === null, '33. an unrecognized method names nothing');
        assert(describeIpfsPublicationMethodLabel(null) === null, '34. no method names nothing');
    }
    console.log('✓ Section D: describeIpfsPublicationMethodLabel() names both known publication methods');

    // ---------------------------------------------------------------
    // Section E — describeIpfsPublicationRecordHistory().
    // ---------------------------------------------------------------
    {
        const narrated = describeIpfsPublicationRecordHistory(history);
        assert(narrated.count === history.length, '35. the narration counts every entry');
        assert(narrated.records.length === history.length, '36. the narration lists every entry');
        assert(narrated.records[0].contentHash === history[0].contentHash, '37. contentHash is carried through unchanged');
        assert(narrated.records[0].locator === history[0].locator, '38. locator is carried through unchanged');
        assert(narrated.records[0].publishedAt === history[0].publishedAt, '39. publishedAt is carried through unchanged');
        assert(narrated.records[0].publicationMethodLabel === 'Remote pinning provider', '40. the first entry narrates its own publication method');

        const empty = describeIpfsPublicationRecordHistory(null);
        assert(empty.count === 0 && empty.records.length === 0, '41. a null history narrates as empty, never throwing');
        assert(Object.isFrozen(empty), '42. an empty narration result is frozen');
        assert(Object.isFrozen(empty.records), '43. an empty narration\'s own records array is frozen');
    }
    console.log('✓ Section E: describeIpfsPublicationRecordHistory() narrates the full sequence, oldest first');

    // ---------------------------------------------------------------
    // Section F — describeIpfsPublicationRecordHistoryEntry().
    // ---------------------------------------------------------------
    {
        const entry = describeIpfsPublicationRecordHistoryEntry(history[1]);
        assert(entry.locator === history[1].locator, '44. a single record\'s own description matches its entry in the full history');
        assert(Object.isFrozen(entry), '45. a single record\'s own description is frozen');
        assert(describeIpfsPublicationRecordHistoryEntry(null) === null, '46. no record describes as null');
        assert(describeIpfsPublicationRecordHistoryEntry(undefined) === null, '47. undefined describes as null');
    }
    console.log('✓ Section F: describeIpfsPublicationRecordHistoryEntry() freezes its result and describes no record as null');

    // ---------------------------------------------------------------
    // Section G — no scoring, ranking, or trust vocabulary anywhere in
    // this milestone's output.
    // ---------------------------------------------------------------
    {
        const narrated = describeIpfsPublicationRecordHistory(history);
        assertNeverScored(narrated, 'history');
        for (const record of narrated.records) assertNeverScored(record, 'history.records[]');
    }
    console.log('✓ Section G: no confidence/reliability/trusted/verified/canonical/preferred field anywhere in this milestone\'s output');

    // ---------------------------------------------------------------
    // Section H — every function here is pure: byte-identical input
    // produces byte-identical output, and none of them accept a
    // collaborator of their own.
    // ---------------------------------------------------------------
    {
        const first = JSON.stringify(describeIpfsPublicationRecordHistory(history));
        const second = JSON.stringify(describeIpfsPublicationRecordHistory(history));
        assert(first === second, '48. calling the narration layer twice on the same history returns byte-identical output');

        const appendedOnce = appendIpfsPublicationRecordHistoryEntry(Object.freeze([]), history[0]);
        const appendedTwice = appendIpfsPublicationRecordHistoryEntry(Object.freeze([]), history[0]);
        assert(JSON.stringify(appendedOnce) === JSON.stringify(appendedTwice), '49. appending the same record onto the same starting history twice returns byte-identical output');

        assert(appendIpfsPublicationRecordHistoryEntry.length === 2, '50. append takes exactly history and record — no injected collaborator');
        assert(latestIpfsPublicationRecord.length === 1, '51. latest takes exactly a history — no injected collaborator');
        assert(describeIpfsPublicationRecordHistory.length === 1, '52. history narration takes exactly a history — no injected collaborator');
        assert(describeIpfsPublicationRecordHistoryEntry.length === 1, '53. single-record description takes exactly a record — no injected collaborator');
    }
    console.log('✓ Section H: every function is pure, and none accept a verifier, coordinator, or content store of their own');

    console.log('\nAll IpfsPublicationRecordHistory tests passed.');
}

run().catch((error) => {
    console.error('IpfsPublicationRecordHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
