import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationApplicationEligibility } from '../core/DocumentOperationApplicationEligibility.js';
import {
    DocumentOperationApplicationReadiness,
    isDocumentOperationApplicationReadiness,
    evaluateApplicationReadiness
} from '../core/DocumentOperationApplicationReadiness.js';

// 0.9.234 — Causal Application Readiness Boundary.
//
// 0.9.232 named Q3 ("is this operation causally eligible") purely in terms
// of KNOWN. 0.9.231's own header already proves KNOWN != EXECUTED — a
// predecessor that arrived only through `DocumentOperationRecoveryUseCase`
// is KNOWN without ever having changed local document state. Nothing
// before this milestone asked whether eligibility's own KNOWN predecessors
// were actually EXECUTED. This suite exercises `evaluateApplicationReadiness()`
// directly, pure, no peers, no network — the same "pure query, exercised
// directly" posture `tests/DocumentOperationApplicationEligibility.test.js`
// already established for its sibling file — plus a section that wires
// real `application/CommandHistory.js` instances behind a small,
// test-local execution-history adapter, to prove readiness reads REAL
// execution state without any new method added to `CommandHistory` itself.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// operation buffering, delayed/automatic application, causal reordering,
// automatic replay, rollback, history rewriting, retransmission, retry,
// CRDT, OT, conflict resolution, synchronized undo, or a convergence
// guarantee. `application/CommandHistory.js` is untouched by this
// milestone — the one new method that appears in this file
// (`executionHistoryFromCommandHistories()`, below) is TEST-ONLY glue, not
// a change to `CommandHistory`'s own class.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function buildDocument(worldId) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: worldId, author: 'owner', authorIdentityId: 'author-1' }) });
}

function moveCommand(worldId, delta) {
    return new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta });
}

// A minimal, in-memory execution-history query — the shape
// `evaluateApplicationReadiness()` requires: `isExecuted(documentId,
// operationId)`. Document-scoped, mirroring
// `DocumentOperationCausalGraph`'s own per-document keying.
function makeExecutionHistory() {
    const executed = new Map(); // documentId -> Set(operationId)
    return {
        markExecuted(documentId, operationId) {
            if (!executed.has(documentId)) {
                executed.set(documentId, new Set());
            }
            executed.get(documentId).add(operationId);
        },
        isExecuted(documentId, operationId) {
            const forDocument = executed.get(documentId);
            return !!forDocument && forDocument.has(operationId);
        }
    };
}

// TEST-ONLY adapter: answers Q4 straight from one or more REAL
// `CommandHistory` instances, exactly the way a real caller would build
// this milestone's `executionHistory` dependency. `CommandHistory` gains
// no new method for this — `getExecutedCommands()` (0.1.x) already is the
// unambiguous record; this function only reshapes it into the small
// interface readiness expects, per document.
function executionHistoryFromCommandHistories(commandHistoriesByDocumentId) {
    return {
        isExecuted(documentId, operationId) {
            const history = commandHistoriesByDocumentId[documentId];
            return !!history && history.getExecutedCommands().some((command) => command.id === operationId);
        }
    };
}

function runTests() {

// ===================================================================
// Section A — Genesis: no causal predecessors at all is unconditionally
// READY.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    const result = evaluateApplicationReadiness('doc-1', { operationId: 'A', causalPredecessors: [] }, { causalGapDetector: detector, executionHistory });
    assert(result.readiness === DocumentOperationApplicationReadiness.READY, '1. a genesis operation (no predecessors) is READY');
    assert(result.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '2. a genesis operation is also ELIGIBLE');
    assert(Array.isArray(result.missingCausalPredecessorIds) && result.missingCausalPredecessorIds.length === 0, '3. no missing predecessors for a genesis operation');
    assert(Array.isArray(result.unexecutedCausalPredecessorIds) && result.unexecutedCausalPredecessorIds.length === 0, '4. no unexecuted predecessors for a genesis operation');
    assert(result.operationId === 'A' && result.documentId === 'doc-1', '5. the descriptor names the exact operation and document it was asked about');
    assert(isDocumentOperationApplicationReadiness(result.readiness), '6. the reported readiness is a valid, closed-vocabulary value');
    console.log('✓ Section A: a genesis operation is READY');
}

// ===================================================================
// Section B — Normal successor: A is known AND executed, B -> A -> READY.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    detector.record('doc-1', 'A', []);
    executionHistory.markExecuted('doc-1', 'A');

    const result = evaluateApplicationReadiness('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector, executionHistory });
    assert(result.readiness === DocumentOperationApplicationReadiness.READY, '7. B, whose sole predecessor A is both known and executed, is READY');
    assert(result.unexecutedCausalPredecessorIds.length === 0, '8. no unexecuted predecessors once the sole predecessor has been executed');
    console.log('✓ Section B: an operation whose predecessor is known and executed is READY');
}

// ===================================================================
// Section C — Missing predecessor: A unknown entirely, B -> A -> NOT_READY,
// and A is named in BOTH missing and unexecuted lists (an unknown
// predecessor was, by construction, never executed either).
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    const result = evaluateApplicationReadiness('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector, executionHistory });
    assert(result.readiness === DocumentOperationApplicationReadiness.NOT_READY, '9. B, whose only predecessor A is entirely unknown, is NOT_READY');
    assert(result.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '10. B is also NOT_ELIGIBLE (0.9.232\'s own answer, unchanged)');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['A']), '11. A is named exactly as the missing predecessor');
    assert(JSON.stringify(result.unexecutedCausalPredecessorIds) === JSON.stringify(['A']), '12. A is ALSO named as unexecuted — an unknown predecessor was never executed either');
    console.log('✓ Section C: a missing predecessor makes an operation NOT_READY, named in both the missing and unexecuted lists');
}

// ===================================================================
// Section D — THE CENTRAL CASE. Recovered predecessor: A is made known
// WITHOUT ever being executed (simulating 0.9.230's own recovery path,
// which records causal evidence but never touches CommandHistory — see
// core/DocumentOperationProvenance.js). B -> A is ELIGIBLE (0.9.232's own
// answer, unchanged) but NOT_READY: this is the proof that eligibility and
// readiness are genuinely different boundaries.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    // A becomes KNOWN exactly the way DocumentOperationRecoveryUseCase
    // #onOperationReceived() -> gap observation records it — never
    // executed.
    detector.record('doc-1', 'A', []);

    const result = evaluateApplicationReadiness('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector, executionHistory });
    assert(result.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '13. B, naming a RECOVERED (never-executed) predecessor, is ELIGIBLE — causal knowledge alone satisfies Q3');
    assert(result.readiness === DocumentOperationApplicationReadiness.NOT_READY, '14. B is NOT_READY — A was never actually applied, so Q4 fails even though Q3 passed');
    assert(result.missingCausalPredecessorIds.length === 0, '15. A is not "missing" — it IS known');
    assert(JSON.stringify(result.unexecutedCausalPredecessorIds) === JSON.stringify(['A']), '16. A is named exactly as unexecuted — known, but never applied');
    console.log('✓ Section D: a recovered-but-never-executed predecessor is ELIGIBLE yet NOT_READY — eligibility and readiness are genuinely different boundaries');
}

// ===================================================================
// Section E — Recovered -> executed: once A subsequently actually executes
// (e.g. this replica later applies it through the real chain), re-querying
// B transitions NOT_READY -> READY. This is a deliberate re-query, never
// an automatic transition — mirrors 0.9.232's own Section E ("resolves on
// re-query, never automatically").
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    detector.record('doc-1', 'A', []);

    const before = evaluateApplicationReadiness('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector, executionHistory });
    assert(before.readiness === DocumentOperationApplicationReadiness.NOT_READY, '17. before A is executed, B is NOT_READY');

    executionHistory.markExecuted('doc-1', 'A');
    const after = evaluateApplicationReadiness('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector, executionHistory });
    assert(after.readiness === DocumentOperationApplicationReadiness.READY, '18. once A is executed, re-evaluating the SAME B answers READY');
    assert(after.unexecutedCausalPredecessorIds.length === 0, '19. no unexecuted predecessors remain once A has actually been applied');
    console.log('✓ Section E: NOT_READY transitions to READY only once the missing execution fact actually exists, on deliberate re-query');
}

// ===================================================================
// Section F — Multiple predecessors: A executed, B merely recorded/known
// (recovered, never executed), C -> [A, B] -> NOT_READY, naming exactly B
// as unexecuted while nothing is reported missing.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    detector.record('doc-1', 'A', []);
    detector.record('doc-1', 'B', []);
    executionHistory.markExecuted('doc-1', 'A');
    // B is known (recorded) but deliberately never marked executed.

    const result = evaluateApplicationReadiness('doc-1', { operationId: 'C', causalPredecessors: ['A', 'B'] }, { causalGapDetector: detector, executionHistory });
    assert(result.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '20. C is ELIGIBLE — both A and B are known');
    assert(result.readiness === DocumentOperationApplicationReadiness.NOT_READY, '21. C is NOT_READY — B, though known, was never executed');
    assert(result.missingCausalPredecessorIds.length === 0, '22. nothing is missing');
    assert(JSON.stringify(result.unexecutedCausalPredecessorIds) === JSON.stringify(['B']), '23. exactly B — the known-but-unexecuted predecessor — is named; A, which WAS executed, is not falsely included');
    console.log('✓ Section F: one unexecuted predecessor out of several known ones is enough to make the dependent NOT_READY, naming exactly which one');
}

// ===================================================================
// Section G — Independent concurrent operation: A executed, B recorded but
// never executed, C depends ONLY on A. C is READY regardless of B's own
// readiness — readiness must never become a total-order mechanism.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    detector.record('doc-1', 'A', []);
    detector.record('doc-1', 'B', []);
    executionHistory.markExecuted('doc-1', 'A');
    // B is deliberately left unexecuted, and C never names it at all.

    const bResult = evaluateApplicationReadiness('doc-1', { operationId: 'B', causalPredecessors: [] }, { causalGapDetector: detector, executionHistory });
    const cResult = evaluateApplicationReadiness('doc-1', { operationId: 'C', causalPredecessors: ['A'] }, { causalGapDetector: detector, executionHistory });
    assert(bResult.readiness === DocumentOperationApplicationReadiness.READY, '24. B is itself READY (a genesis operation) even though it was never "executed" as a predecessor of anything — readiness of an operation and execution of that SAME operation are different facts');
    assert(cResult.readiness === DocumentOperationApplicationReadiness.READY, '25. C, depending only on the executed A, is READY regardless of B\'s existence or state');
    console.log('✓ Section G: an operation concurrent with an unrelated one is READY on its own merits — readiness never becomes a total-order mechanism');
}

// ===================================================================
// Section H — Document isolation: execution state recorded for one
// document must never make an operation in a DIFFERENT document READY,
// even when the operationId strings collide exactly.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const executionHistory = makeExecutionHistory();
    detector.record('doc-X', 'shared-id', []);
    executionHistory.markExecuted('doc-X', 'shared-id');

    const sameDocument = evaluateApplicationReadiness('doc-X', { operationId: 'op-2', causalPredecessors: ['shared-id'] }, { causalGapDetector: detector, executionHistory });
    assert(sameDocument.readiness === DocumentOperationApplicationReadiness.READY, '26. WITHIN doc-X, shared-id is known and executed, so readiness holds');

    // shared-id is also independently recorded as KNOWN under doc-Y (so
    // this section isolates EXECUTION scoping specifically, not causal
    // knowledge scoping — 0.9.232's own Section H already covers that).
    detector.record('doc-Y', 'shared-id', []);
    const otherDocument = evaluateApplicationReadiness('doc-Y', { operationId: 'op-2', causalPredecessors: ['shared-id'] }, { causalGapDetector: detector, executionHistory });
    assert(otherDocument.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '27. under doc-Y, shared-id IS known, so eligibility holds');
    assert(otherDocument.readiness === DocumentOperationApplicationReadiness.NOT_READY, '28. but shared-id was only ever marked EXECUTED under doc-X — doc-Y\'s own readiness does not inherit it');
    assert(JSON.stringify(otherDocument.unexecutedCausalPredecessorIds) === JSON.stringify(['shared-id']), '29. shared-id is reported unexecuted under doc-Y despite being executed under doc-X');
    console.log('✓ Section H: execution history is strictly document-scoped — a predecessor executed in one document never makes an operation in another document READY');
}

// ===================================================================
// Section I — Real CommandHistory integration: the SAME distinction proven
// abstractly in Section D now proven against actual
// `application/CommandHistory.js` instances, through the test-local
// `executionHistoryFromCommandHistories()` adapter. No new method is added
// to CommandHistory itself.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const worldId = 'doc-readiness-real';
    const commandHistory = new CommandHistory({ world: buildDocument(worldId).world });
    const executionHistory = executionHistoryFromCommandHistories({ [worldId]: commandHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });

    // A becomes KNOWN exactly the way recovery would record it — never
    // through CommandHistory#execute().
    detector.record(worldId, opA.id, []);

    const beforeExecution = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector, executionHistory });
    assert(beforeExecution.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '30. B is ELIGIBLE — A is known');
    assert(beforeExecution.readiness === DocumentOperationApplicationReadiness.NOT_READY, '31. B is NOT_READY — CommandHistory has never executed A');
    assert(commandHistory.getExecutedCommands().length === 0, '32. CommandHistory stays empty throughout — evaluating readiness never executes anything itself');

    // A now actually executes, through the real chokepoint.
    commandHistory.execute(opA);
    const afterExecution = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector, executionHistory });
    assert(afterExecution.readiness === DocumentOperationApplicationReadiness.READY, '33. once A is actually executed via CommandHistory#execute(), re-evaluating B now answers READY');
    assert(commandHistory.getExecutedCommands().length === 1 && commandHistory.getExecutedCommands()[0].id === opA.id, '34. CommandHistory holds exactly A — evaluating readiness never itself executed B');

    console.log('✓ Section I: readiness reads REAL execution history through an injected query, never a new CommandHistory method, and never executes anything on its own');
}

// ===================================================================
// Section J — Readiness evaluation is not history repair, mirroring
// 0.9.232's own Section I: B applies immediately under today's
// ARRIVAL_ORDER policy while NOT_READY; re-evaluating readiness — even
// repeatedly, even after A becomes known AND executed — never touches
// CommandHistory itself.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const worldId = 'doc-readiness-repair-guard';
    const commandHistory = new CommandHistory({ world: buildDocument(worldId).world });
    const executionHistory = executionHistoryFromCommandHistories({ [worldId]: commandHistory });
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });

    const beforeAKnown = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector, executionHistory });
    assert(beforeAKnown.readiness === DocumentOperationApplicationReadiness.NOT_READY, '35. at the moment B arrives, A is not yet known, so B is NOT_READY');
    commandHistory.execute(opB);
    assert(commandHistory.getExecutedCommands().length === 1 && commandHistory.getExecutedCommands()[0].id === opB.id, '36. B is applied regardless of its own NOT_READY readiness — this milestone gates nothing, exactly like 0.9.232 before it');

    const beforeSnapshot = commandHistory.getExecutedCommands().map((c) => c.id);

    detector.record(worldId, opA.id, []);
    commandHistory.execute(opA);
    evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector, executionHistory });
    evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector, executionHistory });
    const afterQuerying = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector, executionHistory });
    assert(afterQuerying.readiness === DocumentOperationApplicationReadiness.READY, '37. B now re-evaluates as READY, since A has since actually executed');

    const afterSnapshot = commandHistory.getExecutedCommands().map((c) => c.id);
    assert(JSON.stringify(afterSnapshot) === JSON.stringify([...beforeSnapshot, opA.id]), '38. CommandHistory reflects only the explicit commandHistory.execute(opA) call above — no reordering, no re-insertion of B, no side effect from any readiness query');
    console.log('✓ Section J: readiness evaluation never repairs, reorders, or otherwise touches existing application history — it only ever answers the question it was asked');
}

// ===================================================================
// Section K — Input validation and defaults: evaluateApplicationReadiness
// requires an executionHistory (no silent default), delegates
// documentId/operationId/predecessor validation to
// evaluateApplicationEligibility(), and accepts a fresh, private
// causalGapDetector by default when one is not supplied.
// ===================================================================
{
    assertThrows(() => evaluateApplicationReadiness('doc-1', { operationId: 'A', causalPredecessors: [] }), '39. calling without an executionHistory throws — there is no silent "nothing is executed" default');
    assertThrows(() => evaluateApplicationReadiness('doc-1', { operationId: 'A', causalPredecessors: [] }, { executionHistory: {} }), '40. an executionHistory without isExecuted() throws');
    assertThrows(() => evaluateApplicationReadiness(null, { operationId: 'A', causalPredecessors: [] }, { executionHistory: makeExecutionHistory() }), '41. a missing documentId throws (delegated to evaluateApplicationEligibility)');
    assertThrows(() => evaluateApplicationReadiness('doc-1', { operationId: 'A', causalPredecessors: ['A'] }, { executionHistory: makeExecutionHistory() }), '42. an operation naming itself as its own predecessor throws (delegated)');

    const defaultedDetector = evaluateApplicationReadiness('doc-1', { operationId: 'A', causalPredecessors: [] }, { executionHistory: makeExecutionHistory() });
    assert(defaultedDetector.readiness === DocumentOperationApplicationReadiness.READY, '43. a caller that supplies no causalGapDetector gets a fresh, private one, and a genesis operation still evaluates correctly against it');
    console.log('✓ Section K: readiness evaluation enforces its own required executionHistory dependency while inheriting the same closed-vocabulary input discipline as evaluateApplicationEligibility()');
}

console.log('\n0.9.234 — causal application readiness is now an explicit, testable boundary between "do we causally know this operation\'s predecessors" (0.9.232\'s own ELIGIBLE) and "have those predecessors actually been applied" (READY): recovery can repair causal knowledge without ever pretending that a recovered-but-unexecuted operation changed this replica\'s own document state.');

}

try {
    runTests();
    console.log('\n✓ All DocumentOperationApplicationReadiness tests passed');
} catch (error) {
    console.error('\n✗ DocumentOperationApplicationReadiness tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
}
