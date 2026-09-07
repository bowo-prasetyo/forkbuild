import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DocumentOperationCausalGapDetector, CausalGapStatus } from '../core/DocumentOperationCausalGapDetector.js';
import {
    DocumentOperationApplicationEligibility,
    isDocumentOperationApplicationEligibility,
    evaluateApplicationEligibility
} from '../core/DocumentOperationApplicationEligibility.js';

// 0.9.232 — Causal Application Eligibility Boundary.
//
// 0.9.228 answered "do we know this operation's causal predecessors"
// (Q2). This milestone answers a strictly narrower, previously-unnamed
// question built on top of it: "is this operation eligible to enter the
// application path" (the boundary between Q2 and Q3, PRODUCT POLICY,
// which stays exactly where 0.9.226 left it: `remoteApplication =
// IMMEDIATE`). Every section below exercises
// `evaluateApplicationEligibility()` directly, pure, no peers, no network
// — the same "pure query, exercised directly" posture
// `tests/DocumentOperationCausalGapDetector.test.js`'s own Sections A-G
// already established for its sibling file. The one section that touches
// `application/CommandHistory.js` (the negative test at the end) does so
// only to PROVE this milestone never touches it — never to exercise a new
// production wiring, because there isn't one.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// operation buffering, delayed/automatic application, causal reordering,
// automatic replay, rollback, history rewriting, retransmission, retry,
// CRDT, OT, conflict resolution, synchronized undo, or a convergence
// guarantee. `application/CommandHistory.js` is untouched by this
// milestone.

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

function runTests() {

// ===================================================================
// Section A — Genesis operation: no causal predecessors at all is
// unconditionally eligible.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const result = evaluateApplicationEligibility('doc-1', { operationId: 'A', causalPredecessors: [] }, { causalGapDetector: detector });
    assert(result.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '1. a genesis operation (no predecessors) is ELIGIBLE');
    assert(Array.isArray(result.missingCausalPredecessorIds) && result.missingCausalPredecessorIds.length === 0, '2. no missing predecessors for a genesis operation');
    assert(result.operationId === 'A' && result.documentId === 'doc-1', '3. the descriptor names the exact operation and document it was asked about');
    assert(isDocumentOperationApplicationEligibility(result.eligibility), '4. the reported eligibility is a valid, closed-vocabulary value');
    console.log('✓ Section A: a genesis operation is eligible');
}

// ===================================================================
// Section B — Complete predecessor: A is known, B -> A -> eligible.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'A', []);
    const result = evaluateApplicationEligibility('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector });
    assert(result.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '5. B, whose only predecessor A is known, is ELIGIBLE');
    assert(result.missingCausalPredecessorIds.length === 0, '6. no missing predecessors when the sole predecessor is known');
    console.log('✓ Section B: an operation whose predecessor is fully known is eligible');
}

// ===================================================================
// Section C — Causal gap: A unknown, B -> A -> not eligible.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const result = evaluateApplicationEligibility('doc-1', { operationId: 'B', causalPredecessors: ['A'] }, { causalGapDetector: detector });
    assert(result.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '7. B, whose only predecessor A is unknown, is NOT_ELIGIBLE');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['A']), '8. A is named exactly as the missing predecessor');
    assert(!detector.isKnown('doc-1', 'B'), '9. evaluating eligibility never records the operation it was asked about');
    console.log('✓ Section C: a causal gap makes an operation not eligible');
}

// ===================================================================
// Section D — Multiple predecessors: D -> [B, C], only B known ->
// not eligible, naming exactly C as missing.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'B', []);
    const result = evaluateApplicationEligibility('doc-1', { operationId: 'D', causalPredecessors: ['B', 'C'] }, { causalGapDetector: detector });
    assert(result.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '10. D, missing one of its two predecessors, is NOT_ELIGIBLE');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['C']), '11. only C — the actually-missing predecessor — is named; B, which IS known, is not falsely included');
    console.log('✓ Section D: a partially-known predecessor set is not eligible, naming exactly what is missing');
}

// ===================================================================
// Section E — Gap disappears: after recording C, the SAME D becomes
// eligible on re-query, with no automatic re-evaluation of anything.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'B', []);
    const before = evaluateApplicationEligibility('doc-1', { operationId: 'D', causalPredecessors: ['B', 'C'] }, { causalGapDetector: detector });
    assert(before.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '12. before C is recorded, D is NOT_ELIGIBLE');

    detector.record('doc-1', 'C', []);
    const after = evaluateApplicationEligibility('doc-1', { operationId: 'D', causalPredecessors: ['B', 'C'] }, { causalGapDetector: detector });
    assert(after.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '13. after C is recorded, re-evaluating the SAME D answers ELIGIBLE');
    assert(after.missingCausalPredecessorIds.length === 0, '14. no missing predecessors remain once every named predecessor is known');
    console.log('✓ Section E: a gap resolves on re-query once the missing predecessor becomes known, with nothing automatic in between');
}

// ===================================================================
// Section F — Recovered predecessor: A is made known WITHOUT ever being
// executed (simulating 0.9.230's own recovery path, which records causal
// evidence but never touches CommandHistory — see
// core/DocumentOperationProvenance.js). B -> A must still be ELIGIBLE:
// causal knowledge, not execution history, is what eligibility reads.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const worldId = 'doc-prov-f';
    const commandHistory = new CommandHistory({ world: buildDocument(worldId).world });
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });

    // A becomes KNOWN to the causal graph exactly the way
    // DocumentOperationRecoveryUseCase#onOperationReceived() -> gap
    // observation records it — never through CommandHistory#execute().
    detector.record(worldId, opA.id, []);

    const result = evaluateApplicationEligibility(worldId, { operationId: 'B', causalPredecessors: [opA.id] }, { causalGapDetector: detector });
    assert(result.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '15. B, naming a RECOVERED (never-executed) predecessor, is still ELIGIBLE');
    assert(commandHistory.getExecutedCommands().length === 0, '16. A was never executed — CommandHistory stays empty throughout this section');
    console.log('✓ Section F: a recovered-but-never-executed predecessor still satisfies eligibility — causal knowledge, not execution history, is what eligibility reads');
}

// ===================================================================
// Section G — Recovered operation itself: recording/knowing an operation
// must not, by itself, make THAT operation eligible. Eligibility of A
// depends on A's OWN predecessor list, never on whether A happens to
// already be present ("known") in the causal graph.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    // A is recorded (e.g. via recovery) with its OWN predecessor X, but X
    // itself was never recorded — A is simultaneously KNOWN and, by its
    // own predecessor list, causally incomplete.
    detector.record('doc-1', 'A', ['X']);
    assert(detector.isKnown('doc-1', 'A'), '17. A is KNOWN to the causal graph');

    const result = evaluateApplicationEligibility('doc-1', { operationId: 'A', causalPredecessors: ['X'] }, { causalGapDetector: detector });
    assert(result.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '18. A is NOT_ELIGIBLE despite being KNOWN — being recorded/recovered never substitutes for A\'s own predecessors actually being known');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['X']), '19. X is named exactly as A\'s own missing predecessor');
    console.log('✓ Section G: an operation being known/recovered does not by itself make that operation eligible — eligibility concerns its own predecessors, not its presence in the causal graph');
}

// ===================================================================
// Section H — Document isolation: causal knowledge from one document can
// never make an operation in a different document eligible, even when
// the operationId strings collide exactly.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-X', 'shared-id', []);

    const sameDocument = evaluateApplicationEligibility('doc-X', { operationId: 'op-2', causalPredecessors: ['shared-id'] }, { causalGapDetector: detector });
    assert(sameDocument.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '20. WITHIN doc-X, shared-id is known and grants eligibility');

    const otherDocument = evaluateApplicationEligibility('doc-Y', { operationId: 'op-2', causalPredecessors: ['shared-id'] }, { causalGapDetector: detector });
    assert(otherDocument.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '21. the IDENTICAL operationId, known only under doc-X, does not grant eligibility under doc-Y');
    assert(otherDocument.documentId === 'doc-Y', '22. the descriptor names the document it was actually evaluated against');
    console.log('✓ Section H: application eligibility is strictly document-scoped, exactly like the causal graph it is built on');
}

// ===================================================================
// Section I — Eligibility evaluation != history repair. B is applied
// (today\'s ARRIVAL_ORDER policy applies remote operations immediately,
// regardless of gap status — see core/DocumentCollaborationConsistencyPolicy.js
// and 0.9.228\'s own Section H) BEFORE its own predecessor A is known.
// A later becomes known (e.g. via recovery). Re-evaluating B\'s
// eligibility now answers ELIGIBLE, but CommandHistory — where B already
// lives — is untouched: nothing here retroactively reorders, re-applies,
// or removes anything.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const worldId = 'doc-repair-guard';
    const commandHistory = new CommandHistory({ world: buildDocument(worldId).world });
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });

    // B arrives and is applied immediately, exactly as today\'s policy
    // dictates, even though A (its own named predecessor) is not yet known.
    const beforeAKnown = evaluateApplicationEligibility(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector });
    assert(beforeAKnown.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '23. at the moment B arrives, A is not yet known, so B is NOT_ELIGIBLE');
    commandHistory.execute(opB);
    assert(commandHistory.getExecutedCommands().length === 1 && commandHistory.getExecutedCommands()[0].id === opB.id, '24. B is applied regardless of its own NOT_ELIGIBLE eligibility — this milestone gates nothing');

    const beforeSnapshot = commandHistory.getExecutedCommands().map((c) => c.id);

    // A becomes known afterward (e.g. via recovery), and eligibility is
    // re-evaluated for B, repeatedly, from a completely independent
    // detector call.
    detector.record(worldId, opA.id, []);
    const afterAKnown = evaluateApplicationEligibility(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector });
    assert(afterAKnown.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '25. once A becomes known, re-evaluating B now answers ELIGIBLE');
    evaluateApplicationEligibility(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector });
    evaluateApplicationEligibility(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: detector });

    const afterSnapshot = commandHistory.getExecutedCommands().map((c) => c.id);
    assert(JSON.stringify(afterSnapshot) === JSON.stringify(beforeSnapshot), '26. CommandHistory is byte-for-byte unchanged by any of these eligibility re-evaluations — no retroactive insertion, reordering, or repair');
    assert(afterSnapshot.length === 1 && afterSnapshot[0] === opB.id, '27. B still sits exactly where it was applied — A itself was never inserted before it');
    console.log('✓ Section I: eligibility evaluation never repairs, reorders, or otherwise touches existing application history — it only ever answers the question it was asked');
}

// ===================================================================
// Section J — Input validation and defaults: evaluateApplicationEligibility
// delegates its own validation to DocumentOperationCausalGapDetector#detect(),
// and accepts a fresh, private detector by default.
// ===================================================================
{
    assertThrows(() => evaluateApplicationEligibility(null, { operationId: 'A', causalPredecessors: [] }), '28. a missing documentId throws');
    assertThrows(() => evaluateApplicationEligibility('doc-1', { operationId: '', causalPredecessors: [] }), '29. a missing operationId throws');
    assertThrows(() => evaluateApplicationEligibility('doc-1', { operationId: 'A', causalPredecessors: ['A'] }), '30. an operation naming itself as its own predecessor throws');
    assertThrows(() => evaluateApplicationEligibility('doc-1', { operationId: 'A', causalPredecessors: [] }, { causalGapDetector: {} }), '31. an invalid causalGapDetector dependency throws');

    const defaulted = evaluateApplicationEligibility('doc-1', { operationId: 'A', causalPredecessors: [] });
    assert(defaulted.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '32. a caller that supplies no detector gets a fresh, private one, and a genesis operation still evaluates correctly against it');
    console.log('✓ Section J: eligibility evaluation enforces the same closed-vocabulary input discipline as its sibling files, and works with a default, private detector');
}

console.log('\n0.9.232 — causal application eligibility is now an explicit, testable boundary between "do we know this operation\'s predecessors" and "should we apply it": a pure, stateless answer that reads causal knowledge only, never gates or repairs application history, and never conflates being known with being eligible.');

}

try {
    runTests();
    console.log('\n✓ All DocumentOperationApplicationEligibility tests passed');
} catch (error) {
    console.error('\n✗ DocumentOperationApplicationEligibility tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
}
