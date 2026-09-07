import { readFile } from 'node:fs/promises';
import {
    DOCUMENT_COLLABORATION_CONSISTENCY_POLICY,
    DeliveryOrderGuarantee,
    RemoteApplicationTiming,
    HistoryOrderingBasis,
    ConcurrentConflictResolution,
    MissingOperationDetection,
    DuplicateOperationSuppression,
    LocalUndoScope,
    LocalUndoPropagation,
    DocumentIsolationGuarantee,
    ReplicaConvergenceGuarantee
} from '../core/DocumentCollaborationConsistencyPolicy.js';

// 0.9.241 — Post-Collaboration Product Reassessment.
//
// Test/document-only. No production changes. 0.9.222-0.9.240 ran one
// continuous arc: a shared-editing trust boundary (0.9.222/0.9.223),
// wired into the real Editor runtime (0.9.224), audited under
// concurrency (0.9.225), named as an explicit consistency policy
// (0.9.226/0.9.238), given real causal identity (0.9.227), causal-gap
// detection (0.9.228/0.9.229), recovery (0.9.230/0.9.231), causal
// eligibility/readiness (0.9.232-0.9.235), recovered-operation replay
// (0.9.236), causal deferral (0.9.237), and a lifecycle-wide proof
// (0.9.239), closing with an explicit, deliberate non-answer on
// conflict semantics (0.9.240): concurrent, non-commutative,
// causally-ready edits are allowed to diverge, on purpose.
//
// This milestone does not extend that arc. Like 0.9.221 before it (the
// same reassessment posture, one arc earlier), it does four narrower
// things:
//
//   Section A — Freeze the collaboration contract as a compact
//               fingerprint: one concrete source signal per pipeline
//               stage, and the full GUARANTEED / NOT GUARANTEED matrix
//               read directly off the real, frozen policy object.
//   Section B — Capability reachability audit around the newly
//               completed collaboration stack: does every class in the
//               shipped 0.9.222-0.9.240 chain have a real product
//               caller? And, the other direction this audit style has
//               never asked before: does anything *older* now have
//               ZERO callers because the shipped chain superseded it?
//   Section C — Revisit the two 0.9.221 candidates collaboration didn't
//               resolve — commentary/annotation and notifications — with
//               fresh evidence, and rank them explicitly.
//   Section D — Reject premature conflict resolution: confirm no
//               CRDT/OT/total-order/merge vocabulary exists anywhere in
//               the real collaboration chain's own CODE (not its
//               prose, which discusses these by name only to say they
//               are absent).
//   Section E — Verdict.
//
//   0.9.196 ── … ── 0.9.221 ── 0.9.222 ── … ── 0.9.240 ── 0.9.241  <- this
//    (arc 1:        (product      (arc 2: live collaboration,     (freeze +
//     reachability)  evolution     causal order, deliberately       reachability +
//                     baseline)    undefined conflict semantics)    re-rank, no pick)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors tests/ProductEvolutionBaseline.test.js's own B3 helper exactly:
// "how many files under these directories construct this class, other
// than the class's own file" — the one grep-verifiable signal this whole
// reassessment lineage has always used for "does anything real call
// this," rather than trusting a header comment's own claim either way.
async function constructorCallerCount(className, dirs, { excludeSuffix = null } = {}) {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        hits = execSync(`grep -rl "new ${className}(" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function referenceCount(needle, dirs, { excludeSuffix = null } = {}) {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        hits = execSync(`grep -rl "${needle}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function runTests() {
    console.log('Running Post-Collaboration Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Collaboration closure.
    //
    // A1 freezes the eleven-stage pipeline as one representative source
    // signal per stage — the same "fingerprint, not re-derivation"
    // discipline 0.9.221 Section A used for the first arc. Every signal
    // below is the exact call site application/EditorSession.js's own
    // wiring method already uses, cited by line-shape, not paraphrased.
    // A2 reads the full GUARANTEED / NOT GUARANTEED matrix directly off
    // the real, frozen DOCUMENT_COLLABORATION_CONSISTENCY_POLICY object.
    // ---------------------------------------------------------------
    {
        const editorSession = await rawSource('application/EditorSession.js');
        const propagation = await rawSource('application/DocumentCommandPropagationUseCase.js');
        const deferral = await rawSource('application/DocumentOperationDeferralUseCase.js');
        const recovery = await rawSource('application/DocumentOperationRecoveryUseCase.js');
        const readiness = await rawSource('core/DocumentOperationApplicationReadiness.js');

        // A1a. Authentication — DocumentCommandPropagationUseCase never
        // trusts a peer that has not reached AUTHENTICATED.
        assert(/PeerLifecycleState\.AUTHENTICATED/.test(propagation),
            'A1a. application/DocumentCommandPropagationUseCase.js still gates on PeerLifecycleState.AUTHENTICATED before trusting an incoming operation (0.9.222).');

        // A1b. Identity / authorization — the same class resolves a
        // signing identity and checks it against WorldAccessLevel before
        // an operation is ever accepted.
        assert(propagation.includes('resolveSigningIdentityId') && propagation.includes('WorldAccessLevel'),
            'A1b. application/DocumentCommandPropagationUseCase.js still resolves the signing identity and checks WorldAccessLevel before accepting an operation (0.9.222).');

        // A1c. Operation verification — the one _verify() chokepoint both
        // the live-receive and recovery-response paths funnel through.
        assert(/_verify\(payload, meta\)\s*\{/.test(propagation) && propagation.includes('verifyEnvelope(envelope, connectedPeer)'),
            'A1c. application/DocumentCommandPropagationUseCase.js still exposes one _verify() chokepoint, reused by verifyEnvelope() for the recovery path (0.9.222/0.9.230).');

        // A1d. ReplayGuard — duplicate suppression sits inside that same
        // verification chain, not bolted on separately.
        assert(propagation.includes("import { ReplayGuard } from '../replication/ReplayGuard.js'"),
            'A1d. application/DocumentCommandPropagationUseCase.js still imports and consumes replication/ReplayGuard.js inside its own verification chain (0.9.222).');

        // A1e. Causal-gap observation — wired onto the propagation feed
        // in EditorSession's own composition.
        assert(editorSession.includes('this._documentOperationCausalGapObservation.attachToPropagation(this._documentCommandPropagation)'),
            'A1e. application/EditorSession.js still attaches DocumentOperationCausalGapObservationUseCase directly to documentCommandPropagation (0.9.229).');

        // A1f. Recovery — wired onto the gap-observation feed, the very
        // next composition step.
        assert(editorSession.includes('this._documentOperationRecovery.attachToGapObservation(this._documentOperationCausalGapObservation)'),
            'A1f. application/EditorSession.js still attaches DocumentOperationRecoveryUseCase directly to the gap-observation feed (0.9.230).');

        // A1g. Causal eligibility — the pure query readiness delegates
        // to, never re-implemented.
        assert(readiness.includes("evaluateApplicationEligibility") && readiness.includes("from './DocumentOperationApplicationEligibility.js'"),
            'A1g. core/DocumentOperationApplicationReadiness.js still delegates to core/DocumentOperationApplicationEligibility.js#evaluateApplicationEligibility() rather than re-deriving eligibility itself (0.9.232/0.9.234).');

        // A1h. Execution readiness — the deferral boundary's own gate,
        // imported and called, not re-implemented.
        assert(deferral.includes('evaluateApplicationReadiness') && /from\s+'.*DocumentOperationApplicationReadiness\.js'/.test(deferral),
            'A1h. application/DocumentOperationDeferralUseCase.js still imports and calls evaluateApplicationReadiness() from core/DocumentOperationApplicationReadiness.js (0.9.234/0.9.237).');

        // A1i. Causal deferral — the one class standing between
        // "authorized and verified" and "actually applied."
        assert(editorSession.includes('this._documentOperationDeferral.attachToPropagation('),
            'A1i. application/EditorSession.js still attaches DocumentOperationDeferralUseCase to the propagation feed as the real application chokepoint (0.9.237).');

        // A1j. CommandHistory — the one mutation surface every released
        // operation, local or remote, ultimately reaches.
        assert(deferral.includes('target.commandHistory.execute()') || /commandHistory\.execute\(/.test(deferral),
            'A1j. application/DocumentOperationDeferralUseCase.js still releases a ready operation through target.commandHistory.execute() — the same chokepoint every other path in this codebase uses (0.9.237).');

        // A1k. Document mutation — CommandHistory acts on the real
        // Document's own World, never a shadow copy.
        const commandHistorySource = await rawSource('application/CommandHistory.js');
        assert(/command\.execute\(this\._context\)/.test(commandHistorySource),
            'A1k. application/CommandHistory.js still executes commands directly against the real World context it was constructed with (unchanged since long before this arc).');

        console.log('✓ A1: All eleven collaboration pipeline stages — authentication (a), identity/authorization (b), operation verification (c), ReplayGuard (d), causal-gap observation (e), recovery (f), causal eligibility (g), execution readiness (h), causal deferral (i), CommandHistory (j), and Document mutation (k) — still hold their one representative wiring signal in the real, unmodified source.');

        // A2. The full closure matrix, read directly off the real,
        // frozen policy object — never restated from memory.
        const P = DOCUMENT_COLLABORATION_CONSISTENCY_POLICY;
        assert(P.duplicateOperations.suppression === DuplicateOperationSuppression.GUARANTEED,
            'A2a. duplicateOperations.suppression === GUARANTEED (ReplayGuard, 0.9.222/0.9.225 Section J).');
        assert(P.isolation.acrossDocuments === DocumentIsolationGuarantee.GUARANTEED,
            'A2b. isolation.acrossDocuments === GUARANTEED (0.9.223/0.9.224/0.9.225 Section I).');
        assert(P.application.remote === RemoteApplicationTiming.CAUSAL_READINESS,
            'A2c. application.remote === CAUSAL_READINESS — an operation applies only once every named causal predecessor has actually EXECUTED (0.9.237/0.9.238).');
        assert(P.delivery.order === DeliveryOrderGuarantee.NOT_GUARANTEED,
            'A2d. delivery.order === NOT_GUARANTEED — nothing in the wire format or the transport enforces arrival order (0.9.225 Section A).');
        assert(P.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
            'A2e. conflict.nonCommutingOperations === UNDEFINED — no designed resolution rule exists for a non-commuting concurrent pair (0.9.225 Section D1, 0.9.240).');
        assert(P.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
            'A2f. convergence.guaranteed === NOT_GUARANTEED — the composite of delivery/conflict/missing-operation gaps (0.9.225, 0.9.240).');
        assert(P.undo.propagation === LocalUndoPropagation.NEVER,
            'A2g. undo.propagation === NEVER — CommandHistory#undo()/redo() never broadcast (0.9.225 Section H, 0.9.240 Section 6).');
        assert(P.undo.scope === LocalUndoScope.LOCAL_ONLY,
            'A2h. undo.scope === LOCAL_ONLY.');
        assert(P.missingOperations.detection === MissingOperationDetection.NONE,
            'A2i. missingOperations.detection === NONE, in its narrow, still-accurate sense — 0.9.228\'s causal-gap detector answers "is a NAMED predecessor of an operation I already received absent," never "does some replica have an operation I was never told about at all" (core/DocumentOperationCausality.js\'s own header, unchanged by 0.9.228-0.9.237).');
        assert(P.history.orderingBasis === HistoryOrderingBasis.ARRIVAL_ORDER,
            'A2j. history.orderingBasis === ARRIVAL_ORDER — a released operation lands in CommandHistory at its own execution/release moment, never a causal or logical clock position (0.9.238).');

        // A2k. Two real, code-level facts the user's own proposed closure
        // table did not distinguish, corrected here against the actual
        // running code rather than restated as given: causal-gap
        // RECOVERY is triggered automatically (attachToGapObservation()
        // wires it directly onto the gap-observation feed with no user
        // action, A1f above), but RETRY is not — DocumentOperationRecoveryUseCase
        // sends exactly one request per gap and never schedules another.
        assert(!/setTimeout|setInterval/.test(codeOnlyLines(recovery)),
            'A2k. application/DocumentOperationRecoveryUseCase.js\'s own CODE still contains no setTimeout/setInterval anywhere — "no retry, no backoff" is a structural fact about the file, not merely its own header\'s claim (0.9.230).');

        console.log('✓ A2: Full closure matrix confirmed against the real, frozen policy object — GUARANTEED: causal deferral (c), duplicate suppression (a), document isolation (b); NOT GUARANTEED: delivery order (d), convergence (f); UNDEFINED: conflict resolution (e); NEVER: undo propagation (g, scope h); NONE: missing-operation detection in its narrow sense (i); ARRIVAL_ORDER: history ordering (j). Recovery-on-gap is automatic (A1f); retry of a recovery request is not (k) — a refinement of the brief\'s own proposed table against the real code, not a restatement of it.');
    }

    // ---------------------------------------------------------------
    // Section B — Capability reachability audit.
    //
    // B1 confirms the shipped 0.9.222-0.9.240 chain is fully reachable
    // from the real product runtime (EditorView -> EditorSession),
    // exactly the positive half of this audit style's usual question.
    // B2 asks the same question in the direction this lineage has never
    // asked before: does anything *older* now have ZERO product callers
    // BECAUSE this arc superseded it? It finds one real answer.
    // ---------------------------------------------------------------
    {
        const editorView = await rawSource('ui/views/EditorView.js');

        // B1a. ui/views/EditorView.js is the one real product entry
        // point that constructs the shipped chain's own composition
        // root — EditorSession, itself the class that wires every stage
        // A1 verified.
        assert(/new\s+EditorSession\s*\(/.test(editorView),
            'B1a. ui/views/EditorView.js still constructs a real EditorSession — the shipped collaboration chain\'s own composition root (0.9.224).');
        assert(editorView.includes('DocumentCommandPropagationUseCase') && editorView.includes('DocumentOperationRecoveryUseCase'),
            'B1b. ui/views/EditorView.js still references both DocumentCommandPropagationUseCase and DocumentOperationRecoveryUseCase directly, passing them into that EditorSession (0.9.222/0.9.230).');

        // B1c. Every class named in this milestone's own brief has at
        // least one real caller outside its own file and outside
        // tests/ — computed, not assumed.
        const liveChainClasses = [
            { name: 'DocumentOperationCausality', dirs: ['core'], note: 'DocumentOperationCausalGraph is imported by name elsewhere; the module itself is checked by import below.' },
            { name: 'DocumentCommandPropagationUseCase', dirs: ['application', 'ui'] },
            { name: 'RemoteDocumentOperationApplicationUseCase', dirs: ['application', 'ui'] },
            { name: 'DocumentOperationDeferralUseCase', dirs: ['application', 'ui'] },
            { name: 'DocumentOperationCausalGapObservationUseCase', dirs: ['application', 'ui'] },
            { name: 'DocumentOperationRecoveryUseCase', dirs: ['application', 'ui'] },
            { name: 'RecoveredOperationReplayUseCase', dirs: ['application', 'ui'] },
            { name: 'EditorSession', dirs: ['application', 'ui'] }
        ];
        for (const { name, dirs } of liveChainClasses) {
            if (name === 'DocumentOperationCausality') continue;
            const count = await constructorCallerCount(name, dirs, { excludeSuffix: `/${name}.js` });
            assert(count >= 1, `B1d. ${name} still has at least one real "new ${name}(" caller across ${dirs.join('/')} outside its own file (found ${count}) — no class in the shipped chain is stranded.`);
        }
        // DocumentOperationCausality.js exports a graph class + enum,
        // never constructed by className directly everywhere it's used
        // (some call sites hold it via a use case's own field); checked
        // instead by real import count, matching how it's actually
        // consumed.
        const causalityImporters = await referenceCount("DocumentOperationCausalGraph", ['application', 'core'], { excludeSuffix: '/DocumentOperationCausality.js' });
        assert(causalityImporters >= 1,
            `B1e. core/DocumentOperationCausality.js's own DocumentOperationCausalGraph is still imported by at least one other core/application file outside itself (found ${causalityImporters}).`);

        console.log('✓ B1: The shipped 0.9.222-0.9.240 collaboration chain is fully reachable — ui/views/EditorView.js constructs the real EditorSession composition root (a), wires both DocumentCommandPropagationUseCase and DocumentOperationRecoveryUseCase into it directly (b), and every class this milestone\'s own brief named has at least one real caller outside its own file (c-e). Nothing in the newly completed stack is dead code.');

        // ---------------------------------------------------------
        // B2 — the other direction: what does the shipped chain leave
        // stranded? This is the actual finding this section exists to
        // report.
        // ---------------------------------------------------------

        // B2a. collaboration/CollaborationSession.js, collaboration/
        // DocumentAuthority.js, collaboration/AuthorityCollaborationTransport.js,
        // and collaboration/LocalCollaborationTransport.js — a complete,
        // self-consistent, AUTHORITY-based collaboration protocol from
        // 0.2.7-0.2.9 (envelope + transport + central ordering service
        // that REJECTS conflicting operations, rather than the shipped
        // 0.9.222-0.9.240 model's peer-to-peer causal graph that ALLOWS
        // divergence) — have zero real constructors anywhere in
        // application/ or ui/ except their own one wiring file.
        const legacyCollaborationClasses = [
            'CollaborationSession',
            'DocumentAuthority',
            'AuthorityCollaborationTransport',
            'LocalCollaborationTransport'
        ];
        for (const name of legacyCollaborationClasses) {
            const count = await constructorCallerCount(name, ['application', 'ui'], { excludeSuffix: `CreateCollaborationUseCase.js` });
            assert(count === 0,
                `B2a. collaboration/${name}.js still has zero "new ${name}(" callers in application/ or ui/ outside application/CreateCollaborationUseCase.js (found ${count}) — this 0.2.7-0.2.9 authority-based protocol is not wired into the real product.`);
        }

        // B2b. application/CreateCollaborationUseCase.js — the one DI
        // wiring file for the entire legacy protocol above — is itself
        // never referenced by anything else in application/ or ui/.
        const wiringCallers = await referenceCount('CreateCollaborationUseCase', ['application', 'ui'], { excludeSuffix: '/CreateCollaborationUseCase.js' });
        assert(wiringCallers === 0,
            `B2b. application/CreateCollaborationUseCase.js — the sole entry point for the legacy authority-based protocol — is still referenced by zero other files in application/ or ui/ (found ${wiringCallers}); its only callers anywhere in the repository are its own two test files.`);

        // B2c. core/CollaborationEnvelope.js — the wire-format data type
        // the legacy protocol above depends on — is consumed only by
        // files inside collaboration/ itself, never by core/,
        // application/, or ui/ outside that one dependent subsystem.
        const envelopeCallersOutsideCollab = await referenceCount('CollaborationEnvelope', ['application', 'ui'], {});
        assert(envelopeCallersOutsideCollab === 0,
            `B2c. core/CollaborationEnvelope.js is still referenced by zero files in application/ or ui/ (found ${envelopeCallersOutsideCollab}) — its only consumers anywhere are the same legacy collaboration/ subsystem B2a already found stranded.`);

        // B2d. docs/Architecture.md documents this exact protocol under
        // its own historical 0.2.7/0.2.9 section headers, in the same
        // append-only changelog style every other milestone's own
        // section uses, and has never been edited to mark it superseded
        // — supporting evidence this is a genuinely legacy design this
        // codebase moved on from, not a deliberately dormant escape
        // hatch nothing has needed yet.
        const architectureDoc = await rawSource('docs/Architecture.md');
        assert(architectureDoc.includes('Collaboration Protocol Foundation (0.2.7)') && architectureDoc.includes('Multi-client Synchronization (0.2.9)'),
            'B2d. docs/Architecture.md still documents the legacy protocol under its own unedited 0.2.7/0.2.9 historical section headers.');

        console.log('✓ B2: One real reachability finding — the entire 0.2.7-0.2.9 authority-based collaboration protocol (collaboration/CollaborationSession.js, DocumentAuthority.js, AuthorityCollaborationTransport.js, LocalCollaborationTransport.js, core/CollaborationEnvelope.js, application/CreateCollaborationUseCase.js — six files) has zero callers anywhere in application/ or ui/ (a-c), is documented only under its own unedited historical section (d), and is architecturally superseded by the shipped 0.9.222-0.9.240 peer-to-peer causal chain B1 just reconfirmed live: the old model rejects conflicting operations centrally, the new one allows divergence and names that divergence explicitly (0.9.226/0.9.240). Classified OBSOLETE_CANDIDATE, consistent with 0.9.216/0.9.219/0.9.221\'s own register — nothing deleted here; deletion is a deliberate, later, human decision.');
    }

    // ---------------------------------------------------------------
    // Section C — Revisit the 0.9.221 candidates.
    //
    // 0.9.221 Section C named three candidate product seams without
    // choosing among them: live multi-editor co-editing (C1), Publication
    // commentary/annotation (C2), and notifications (C3). C1 is now
    // built. This section re-verifies C2 and C3 are still genuinely
    // absent, with fresh evidence, and explicitly ranks them — the one
    // thing 0.9.221 deliberately declined to do.
    // ---------------------------------------------------------------
    {
        const { execSync } = await import('node:child_process');

        // C1. Live multi-editor collaboration — COMPLETE. Re-verified
        // here as a fresh fact, not merely cited: the exact vocabulary
        // 0.9.221's own C1 assertion checked for absence
        // (lock/merge/CRDT/OT) is STILL absent from SaveDocumentUseCase
        // (nothing changed the save path itself), while the wiring
        // Section A/B just reconfirmed proves the capability itself now
        // exists, one layer below the save path, in the propagation/
        // deferral/recovery chain instead.
        const saveDocumentUseCase = await rawSource('application/SaveDocumentUseCase.js');
        assert(!/\block\b|\bmerge\b|\bCRDT\b|operational.transform/i.test(saveDocumentUseCase),
            'C1a. application/SaveDocumentUseCase.js still names no session-lock, merge, or CRDT/OT concept — collaboration was built beside the save path, exactly as designed, never inside it (0.9.222\'s own header).');
        assert(await sourceExists('application/DocumentCommandPropagationUseCase.js') && await sourceExists('application/EditorSession.js'),
            'C1b. The capability itself — real-time propagation, causal ordering, deferral, and recovery — now exists and is wired (Section A/B above). 0.9.221\'s C1 candidate is CLOSED.');

        // C2. Asynchronous commentary/annotation on a Publication.
        // Re-run 0.9.221's own grep, extended to ui/ as well (0.9.221
        // checked only application/core), fresh evidence: still zero.
        const commentHits = execSync('grep -rli "class .*Comment\\|class .*Annotation" application core ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(commentHits === '',
            'C2a. No `class ...Comment`/`class ...Annotation` exists anywhere in application/, core/, or ui/ — still genuinely absent, one collaboration arc later.');
        const publicationCard = await rawSource('ui/components/PublicationCard.js');
        assert(await sourceExists('discovery/PublicationCatalogDiscoveryProvider.js') && publicationCard.length > 0,
            'C2b. The adjacent, already-built seam still stands: Publication content/distribution/discovery are all real, shipped concepts (discovery/PublicationCatalogDiscoveryProvider.js, ui/components/PublicationCard.js) with no fourth "commentary" facet next to them.');

        // C3. Notifications. Re-run 0.9.221's own grep, extended to ui/
        // as well, fresh evidence: still zero.
        const notificationHits = execSync('grep -rli "class .*Notification\\|NotificationUseCase\\|NotificationService" application core ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(notificationHits === '',
            'C3a. No Notification class/use case/service exists anywhere in application/, core/, or ui/ — still genuinely absent, one collaboration arc later.');

        // C4. The explicit ranking 0.9.221 deliberately declined to make.
        //
        // Commentary/annotation ranks ABOVE notifications, for a reason
        // this very milestone's own Section A/D makes concrete rather
        // than a matter of taste: notifications are fundamentally a
        // DELIVERY-guarantee question ("did the Publisher actually learn
        // that X happened?") — precisely the family of question
        // (delivery order, missing-operation detection, convergence)
        // 0.9.225/0.9.240 spent this entire arc being careful to name as
        // NOT_GUARANTEED/NONE/UNDEFINED rather than quietly assume.
        // Building notifications first risks re-opening that exact can
        // of worms speculatively, before any concrete event exists worth
        // notifying about. Commentary/annotation carries no such
        // dependency: a Comment attached to an immutable Publication is
        // structurally the same shape as the already-shipped
        // PublicationObservationArchive (application/PublicationObservationArchive.js)
        // — a local, append-only record a Wanderer can read without any
        // peer-online-state, delivery-guarantee, or real-time
        // propagation question at all. It also directly serves the
        // already-complete Publication discovery/consumption flow
        // (0.9.196 Section D), where notifications so far serve only a
        // Publisher who is not otherwise part of that flow. And,
        // concretely: "someone commented on your Publication" is the
        // single most natural FIRST notification event this codebase
        // could ever surface — meaning commentary is not merely
        // independent of notifications, it is a plausible PREREQUISITE
        // for a well-motivated one, while the reverse is not true.
        const observationArchiveExists = await sourceExists('application/PublicationObservationArchive.js');
        assert(observationArchiveExists,
            'C4. application/PublicationObservationArchive.js still exists as the real, shipped precedent for "a local, append-only record attached to an immutable Publication" — the exact shape a Comment/Annotation type would reuse, supporting the ranking below with a concrete architectural analog rather than assertion alone.');

        console.log('✓ C: 0.9.221\'s three candidates re-visited — live multi-editor collaboration (C1) is now CLOSED; commentary/annotation (C2) and notifications (C3) are both re-confirmed genuinely absent with fresh evidence, extended to ui/ this time. Explicitly ranked (C4, not attempted by 0.9.221): commentary/annotation first — it has a concrete shipped architectural analog (PublicationObservationArchive) and no delivery-guarantee dependency; notifications second — they are fundamentally a delivery-guarantee question this arc spent 19 milestones being careful not to assume, and are better motivated by a first real cross-user event (a comment) than built speculatively ahead of one.');
    }

    // ---------------------------------------------------------------
    // Section D — Explicitly reject premature conflict resolution.
    // ---------------------------------------------------------------
    {
        // D1. The policy fields 0.9.240 closed on stay exactly where
        // that milestone left them — re-verified fresh, not merely
        // cited, the same discipline 0.9.240 Section 8 itself used.
        assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
            'D1a. conflict.nonCommutingOperations is still UNDEFINED.');
        assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
            'D1b. convergence.guaranteed is still NOT_GUARANTEED.');

        // D2. No CRDT/OT/total-order/merge-rule vocabulary exists in the
        // real collaboration chain's own CODE. Every file in this arc's
        // own header PROSE discusses these terms by name, always to say
        // they are absent — codeOnlyLines() strips comment lines first
        // so this check reads only executable code, never a header's own
        // careful "we did not build this" disclaimer.
        const collaborationCoreFiles = [
            'core/DocumentOperationCausality.js',
            'core/DocumentOperationCausalGapDetector.js',
            'core/DocumentOperationApplicationEligibility.js',
            'core/DocumentOperationApplicationReadiness.js',
            'core/DocumentCollaborationConsistencyPolicy.js',
            'application/DocumentCommandPropagationUseCase.js',
            'application/DocumentOperationDeferralUseCase.js',
            'application/RemoteDocumentOperationApplicationUseCase.js',
            'application/DocumentOperationRecoveryUseCase.js',
            'application/RecoveredOperationReplayUseCase.js'
        ];
        const forbidden = /\bCRDT\b|operational.transform|vectorClock|lamportClock|totalOrder|mergeOperation|conflictResolver|resolveConflict/i;
        for (const path of collaborationCoreFiles) {
            const code = codeOnlyLines(await rawSource(path));
            assert(!forbidden.test(code),
                `D2. ${path}'s own CODE (comments excluded) still contains no CRDT/OT/vector-clock/total-order/merge-rule vocabulary — no such mechanism was introduced anywhere in the collaboration chain, in this milestone or any prior one.`);
        }

        console.log('✓ D: The 0.9.240 finding is preserved and re-verified fresh (D1) — concurrent, non-commutative, causally-ready edits remain an accepted, explicitly-named property of this collaboration model, not a bug awaiting a fix. No CRDT requirement, no OT requirement, no total-order requirement, no conflict-UI requirement, and no merge mechanism is discovered anywhere in the real collaboration chain\'s own code (D2) — a known limitation is not automatically a product gap, and this reassessment does not manufacture one where its own evidence found none.');
    }

    // ---------------------------------------------------------------
    // Section E — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.241 — Post-Collaboration Product Reassessment — Verdict\n' +
'\n' +
'COLLABORATION CAPABILITY\n' +
'    COMPLETE\n' +
'\n' +
'CAUSAL CONSISTENCY\n' +
'    COMPLETE\n' +
'\n' +
'CONCURRENT CONFLICT RESOLUTION\n' +
'    INTENTIONALLY UNDEFINED\n' +
'\n' +
'REACHABILITY\n' +
'    Shipped 0.9.222-0.9.240 chain: fully reachable, zero dead code (Section B1)\n' +
'    Legacy 0.2.7-0.2.9 authority protocol: zero product callers, OBSOLETE_CANDIDATE (Section B2)\n' +
'\n' +
'PRODUCT GAPS\n' +
'    1. Publication commentary/annotation — absent, adjacent, no delivery-guarantee dependency\n' +
'    2. Notifications — absent, adjacent, IS a delivery-guarantee question\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Publication commentary/annotation (named, not built here)\n');

        console.log('✓ Section E: Verdict recorded. Collaboration and causal consistency are both COMPLETE; conflict resolution stays intentionally UNDEFINED, preserved rather than reopened; one real reachability finding (the legacy authority protocol) is classified OBSOLETE_CANDIDATE, nothing deleted; and the two remaining 0.9.221 candidates are re-ranked with commentary/annotation named as the next product seam. No implementation happens in this milestone — that choice, per this milestone\'s own brief, belongs to the next one, made on purpose.');
    }

    console.log('\n✅ All PostCollaborationProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostCollaborationProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostCollaborationProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
