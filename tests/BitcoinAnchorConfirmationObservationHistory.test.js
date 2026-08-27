import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import {
    appendBitcoinAnchorConfirmationObservationHistoryEntry,
    latestBitcoinAnchorConfirmationObservation
} from '../application/BitcoinAnchorConfirmationObservationHistory.js';
import {
    describeBitcoinAnchorConfirmationStateLabel,
    describeBitcoinAnchorConfirmationObservationHistory
} from '../application/BitcoinAnchorConfirmationObservationHistoryView.js';
import {
    describeBitcoinAnchorConfirmationObservationHistoryDetails,
    describeBitcoinAnchorConfirmationObservationDetail
} from '../application/BitcoinAnchorConfirmationObservationHistoryDetailView.js';

// 0.8.56 — Bitcoin Anchor Confirmation Observation History & Per-Observation
// Inspection.
//
// The flagship this milestone exists to prove: three real, explicit
// anchoring/BitcoinAnchorConfirmationObserver.js#observeConfirmation()
// calls against the SAME txid — NOT_CONFIRMED, then CONFIRMED at height
// 900000, then CONFIRMED at height 900001 — each appended, in order, to a
// single history. The history ends up holding all three observations,
// unmodified and in the order they happened; the later CONFIRMED entries
// never rewrite or discard the earlier ones.
//
//   Section A: FLAGSHIP — append-only accumulation across three real
//              observeConfirmation() calls; the earlier entries are never
//              rewritten by a later one, including a later CONFIRMED
//              observation naming a different blockHeight for the
//              identical blockHash (routine confirmation-count progress,
//              never interpreted as a reorganization by this milestone)
//   Section B: appendBitcoinAnchorConfirmationObservationHistoryEntry()
//              never mutates the array it was given; appending a
//              null/undefined observation is a no-op
//   Section C: latestBitcoinAnchorConfirmationObservation() — empty
//              history, a single entry, out-of-order observedAt values,
//              and a tie broken by later array position
//   Section D: describeBitcoinAnchorConfirmationStateLabel() names all
//              three states in full sentences; an unrecognized state
//              names nothing
//   Section E: describeBitcoinAnchorConfirmationObservationHistory()
//              narrates a full history, oldest first, carrying block
//              metadata and an UNAVAILABLE observation's own `reason`
//              through unchanged; a null/empty history narrates as empty
//   Section F: describeBitcoinAnchorConfirmationObservationHistoryDetails()
//              and describeBitcoinAnchorConfirmationObservationDetail()
//              add a short label alongside the same full label, freeze
//              every level, and return null for no observation
//   Section G: no `confidence`/`reliability`/`score`/`status`/
//              `reorganization`/`REORG_DETECTED` field anywhere in any
//              output this milestone's files produce
//   Section H: every function in this milestone is pure — calling it
//              twice with byte-identical arguments returns a
//              byte-identical result, and none of them accept an
//              observer, coordinator, or confirmationSource of their own
//
// See docs/Roadmap.md, "0.8.56 — Bitcoin Anchor Confirmation Observation
// History."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function fakeConfirmationSource(sequence) {
    let index = 0;
    return {
        fetchConfirmation: async () => {
            const result = sequence[Math.min(index, sequence.length - 1)];
            index += 1;
            return result;
        }
    };
}

function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    const forbidden = ['confidence', 'reliability', 'score', 'status', 'reorganization', 'reorgDetected', 'valid', 'healthy', 'trusted'];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — a history and its inspection compose facts, they do not score them`);
    }
}

const TXID = 'a'.repeat(64);
const BLOCK_A = 'b'.repeat(64);

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: append-only accumulation across three real
    // observeConfirmation() calls.
    // ---------------------------------------------------------------
    let history = Object.freeze([]);
    {
        const source = fakeConfirmationSource([
            { found: true, confirmed: false },
            { found: true, confirmed: true, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1 },
            { found: true, confirmed: true, blockHash: BLOCK_A, blockHeight: 900001, confirmationCount: 2 }
        ]);
        const observer = new BitcoinAnchorConfirmationObserver({ confirmationSource: source });

        const obs1 = await observer.observeConfirmation(TXID);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs1);
        assert(history.length === 1, '1. first observation appended');
        assert(history[0].state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '2. first entry is NOT_CONFIRMED');

        const obs2 = await observer.observeConfirmation(TXID);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs2);
        assert(history.length === 2, '3. second observation appended, not merged with the first');
        assert(history[0].state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '4. the first entry is unchanged after the second append');
        assert(history[1].state === BitcoinAnchorConfirmationState.CONFIRMED && history[1].blockHeight === 900000, '5. second entry is CONFIRMED at height 900000');

        const obs3 = await observer.observeConfirmation(TXID);
        history = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, obs3);
        assert(history.length === 3, '6. third observation appended');
        assert(history[0].state === BitcoinAnchorConfirmationState.NOT_CONFIRMED && history[1].blockHeight === 900000, '7. the first two entries are still exactly as they were');
        assert(history[2].state === BitcoinAnchorConfirmationState.CONFIRMED && history[2].blockHeight === 900001, '8. third entry is CONFIRMED at height 900001');
        assert(history[1].blockHash === history[2].blockHash, '9. sanity: the two CONFIRMED entries name the same block, not a reorganization scenario');

        assert(latestBitcoinAnchorConfirmationObservation(history) === obs3, '10. the latest observation is the third, most recent one');
    }
    console.log('✓ Section A: flagship — append-only accumulation across three real observeConfirmation() calls');

    // ---------------------------------------------------------------
    // Section B — appendBitcoinAnchorConfirmationObservationHistoryEntry()
    // never mutates, and tolerates a missing observation.
    // ---------------------------------------------------------------
    {
        const before = history;
        const appended = appendBitcoinAnchorConfirmationObservationHistoryEntry(before, before[0]);
        assert(before.length === 3, '11. the original array is untouched by appending onto a copy');
        assert(appended.length === 4, '12. the returned array is a new, longer array');
        assert(appended !== before, '13. append never returns the same array reference');
        assert(Object.isFrozen(appended), '14. the appended array is frozen');

        const noop1 = appendBitcoinAnchorConfirmationObservationHistoryEntry(before, null);
        const noop2 = appendBitcoinAnchorConfirmationObservationHistoryEntry(before, undefined);
        assert(noop1.length === 3 && noop2.length === 3, '15. appending null/undefined is a no-op on length');
        assert(noop1 !== before && noop2 !== before, '16. even a no-op append returns a new array, never the original reference');

        const fromNothing = appendBitcoinAnchorConfirmationObservationHistoryEntry(undefined, before[0]);
        assert(fromNothing.length === 1, '17. appending onto a non-array history starts a fresh one-entry history');
    }
    console.log('✓ Section B: append-only, non-mutating, tolerant of a missing observation');

    // ---------------------------------------------------------------
    // Section C — latestBitcoinAnchorConfirmationObservation().
    // ---------------------------------------------------------------
    {
        assert(latestBitcoinAnchorConfirmationObservation([]) === null, '18. an empty history has no latest observation');
        assert(latestBitcoinAnchorConfirmationObservation(null) === null, '19. a null history has no latest observation');
        assert(latestBitcoinAnchorConfirmationObservation([history[0]]) === history[0], '20. a single-entry history\'s own entry is the latest');

        const early = { ...history[0], observedAt: new Date('2026-01-01T10:00:00Z') };
        const late = { ...history[1], observedAt: new Date('2026-01-01T10:30:00Z') };
        const middle = { ...history[2], observedAt: new Date('2026-01-01T10:10:00Z') };
        assert(latestBitcoinAnchorConfirmationObservation([early, late, middle]) === late, '21. the entry with the latest observedAt wins, regardless of array position');

        const tieA = { ...history[0], observedAt: new Date('2026-01-01T10:00:00Z') };
        const tieB = { ...history[1], observedAt: new Date('2026-01-01T10:00:00Z') };
        assert(latestBitcoinAnchorConfirmationObservation([tieA, tieB]) === tieB, '22. a tie in observedAt is broken by the later array position');
    }
    console.log('✓ Section C: latestBitcoinAnchorConfirmationObservation()');

    // ---------------------------------------------------------------
    // Section D — describeBitcoinAnchorConfirmationStateLabel().
    // ---------------------------------------------------------------
    {
        assert(describeBitcoinAnchorConfirmationStateLabel(BitcoinAnchorConfirmationState.CONFIRMED) === 'Transaction confirmed', '23. CONFIRMED label');
        assert(describeBitcoinAnchorConfirmationStateLabel(BitcoinAnchorConfirmationState.NOT_CONFIRMED) === 'Transaction not confirmed', '24. NOT_CONFIRMED label');
        assert(describeBitcoinAnchorConfirmationStateLabel(BitcoinAnchorConfirmationState.UNAVAILABLE) === 'Confirmation status unavailable', '25. UNAVAILABLE label');
        assert(describeBitcoinAnchorConfirmationStateLabel('not-a-real-state') === null, '26. an unrecognized state names nothing');
        assert(describeBitcoinAnchorConfirmationStateLabel(undefined) === null, '27. no state names nothing');
    }
    console.log('✓ Section D: describeBitcoinAnchorConfirmationStateLabel() names all three states');

    // ---------------------------------------------------------------
    // Section E — describeBitcoinAnchorConfirmationObservationHistory().
    // ---------------------------------------------------------------
    {
        const narrated = describeBitcoinAnchorConfirmationObservationHistory(history);
        assert(narrated.count === 3, '28. the narration counts every entry');
        assert(narrated.observations.length === 3, '29. the narration lists every entry');
        assert(narrated.observations[0].stateLabel === 'Transaction not confirmed', '30. the first entry narrates NOT_CONFIRMED in full');
        assert(narrated.observations[1].stateLabel === 'Transaction confirmed' && narrated.observations[1].blockHeight === 900000, '31. the second entry narrates CONFIRMED with its own block height');
        assert(narrated.observations[2].blockHeight === 900001, '32. the third entry keeps its own, different block height — oldest first, never reordered');
        assert(narrated.observations[0].txid === TXID, '33. txid is carried through unchanged');

        const unavailableObservation = { state: BitcoinAnchorConfirmationState.UNAVAILABLE, txid: TXID, blockHash: null, blockHeight: null, confirmationCount: null, reason: 'confirmation source unreachable', observedAt: new Date() };
        const withUnavailable = describeBitcoinAnchorConfirmationObservationHistory([unavailableObservation]);
        assert(withUnavailable.observations[0].reason === 'confirmation source unreachable', '34. an UNAVAILABLE observation\'s own reason is carried through unchanged');
        assert(withUnavailable.observations[0].stateLabel === 'Confirmation status unavailable', '35. UNAVAILABLE narrates in full');

        const empty = describeBitcoinAnchorConfirmationObservationHistory(null);
        assert(empty.count === 0 && empty.observations.length === 0, '36. a null history narrates as empty, never throwing');
    }
    console.log('✓ Section E: describeBitcoinAnchorConfirmationObservationHistory() narrates the full sequence, oldest first');

    // ---------------------------------------------------------------
    // Section F — per-observation inspection.
    // ---------------------------------------------------------------
    {
        const details = describeBitcoinAnchorConfirmationObservationHistoryDetails(history);
        assert(details.count === 3, '37. inspection counts every entry');
        assert(details.entries[0].stateShortLabel === 'Not confirmed' && details.entries[0].stateLabel === 'Transaction not confirmed', '38. the first entry carries both the short and full label');
        assert(details.entries[1].stateShortLabel === 'Confirmed', '39. the second entry\'s short label');
        assert(details.entries[2].blockHeight === 900001 && details.entries[2].stateShortLabel === 'Confirmed', '40. the third entry keeps its own block height alongside its short label');
        assert(Object.isFrozen(details), '41. the top-level details result is frozen');
        assert(Object.isFrozen(details.entries), '42. the entries array is frozen');
        assert(Object.isFrozen(details.entries[0]), '43. each entry is frozen');

        const single = describeBitcoinAnchorConfirmationObservationDetail(history[1]);
        assert(single.stateShortLabel === 'Confirmed' && single.blockHeight === 900000, '44. a single observation\'s own detail matches its entry in the full history');
        assert(describeBitcoinAnchorConfirmationObservationDetail(null) === null, '45. no observation describes as null');
        assert(describeBitcoinAnchorConfirmationObservationDetail(undefined) === null, '46. undefined describes as null');

        const emptyDetails = describeBitcoinAnchorConfirmationObservationHistoryDetails(null);
        assert(emptyDetails.count === 0 && emptyDetails.entries.length === 0, '47. a null history\'s own details are empty, never throwing');
    }
    console.log('✓ Section F: per-observation inspection adds a short label, freezes every level, and adds no new facts');

    // ---------------------------------------------------------------
    // Section G — no scoring, ranking, or reorganization vocabulary
    // anywhere in this milestone's output.
    // ---------------------------------------------------------------
    {
        const narrated = describeBitcoinAnchorConfirmationObservationHistory(history);
        const details = describeBitcoinAnchorConfirmationObservationHistoryDetails(history);
        assertNeverScored(narrated, 'history');
        for (const observation of narrated.observations) assertNeverScored(observation, 'history.observations[]');
        assertNeverScored(details, 'details');
        for (const entry of details.entries) assertNeverScored(entry, 'details.entries[]');
    }
    console.log('✓ Section G: no confidence/reliability/score/status/reorganization field anywhere in this milestone\'s output');

    // ---------------------------------------------------------------
    // Section H — every function here is pure: byte-identical input
    // produces byte-identical output, and none of them accept a
    // collaborator of their own.
    // ---------------------------------------------------------------
    {
        const first = JSON.stringify(describeBitcoinAnchorConfirmationObservationHistoryDetails(history));
        const second = JSON.stringify(describeBitcoinAnchorConfirmationObservationHistoryDetails(history));
        assert(first === second, '48. calling the inspection layer twice on the same history returns byte-identical output');

        const appendedOnce = appendBitcoinAnchorConfirmationObservationHistoryEntry(Object.freeze([]), history[0]);
        const appendedTwice = appendBitcoinAnchorConfirmationObservationHistoryEntry(Object.freeze([]), history[0]);
        assert(JSON.stringify(appendedOnce) === JSON.stringify(appendedTwice), '49. appending the same observation onto the same starting history twice returns byte-identical output');

        assert(appendBitcoinAnchorConfirmationObservationHistoryEntry.length === 2, '50. append takes exactly history and observation — no injected collaborator');
        assert(latestBitcoinAnchorConfirmationObservation.length === 1, '51. latest takes exactly a history — no injected collaborator');
        assert(describeBitcoinAnchorConfirmationObservationHistory.length === 1, '52. history narration takes exactly a history — no injected collaborator');
        assert(describeBitcoinAnchorConfirmationObservationHistoryDetails.length === 1, '53. inspection takes exactly a history — no injected collaborator');
    }
    console.log('✓ Section H: every function is pure, and none accept an observer, coordinator, or confirmationSource of their own');

    console.log('\nAll BitcoinAnchorConfirmationObservationHistory tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorConfirmationObservationHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
