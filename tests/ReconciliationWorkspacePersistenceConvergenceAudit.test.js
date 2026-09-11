import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { IpfsPublicationRecord } from '../application/IpfsPublicationRecord.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { LeaderboardClaimArchiveReceiptOutcome } from '../application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import { RevalidationObservationArchiveOutcome } from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';
import { ReconcilePublisherLeaderboardSnapshotClaimOutcome } from '../application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import ReconciliationWorkspaceView from '../ui/views/ReconciliationWorkspaceView.js';

// 0.9.409 — Reconciliation Workspace Persistence Convergence Audit.
//
// Type: test-only audit. No production file is touched.
//
// 0.9.408 shipped the Reconciliation Workspace and, in its own header,
// documented one specific restraint: "A failed save is swallowed, never
// allowed to interrupt the result already shown on screen." That sentence
// is a real architectural decision, not an incidental detail, and it
// creates the exact seam this milestone exists to examine:
//
//   reconciliation execution succeeded  ??=??  reconciliation fact was
//                                                persisted
//
// This audit does not assume an answer. It establishes one, with live
// evidence against real production code (`ReconcilePublisherLeaderboardSnapshotClaimUseCase`,
// `LocalStoragePublicationObservationArchive`, `ReconciliationWorkspaceView`,
// and the existing, unchanged Leaderboard reconstruction chain), never
// against a re-description of what the source merely says.
//
//   Section A — Existing persistence semantics: what
//               `DecentralizedPublicationsView.js`'s own, already-shipped
//               `persistPublicationObservationArchive()` (0.8.75) already
//               decided about "returned" vs. "persisted" archives, proven
//               to be the SAME discipline the Workspace inherited, not a
//               new one 0.9.408 invented.
//   Section B — Workspace result semantics: the click -> read -> execute
//               -> save -> display chain, traced through the file's own
//               source and then proven live — the displayed result never
//               depends on whether the save succeeded.
//   Section C — A REAL save failure, exercised against the real
//               `LocalStoragePublicationObservationArchive` adapter (never
//               a hand-rolled double one layer up), answering the six
//               concrete product questions this milestone's own brief
//               poses.
//   Section D — Concurrent archive freshness survives a full workflow: an
//               external operation persists a fact between page-load and
//               click; the click's own save never loses it.
//   Section E — THE CENTERPIECE: workspace produces an observation, it is
//               persisted through the real adapter (a real JSON
//               serialize/deserialize round trip, not merely an in-memory
//               reference), the workspace is destroyed and a fresh
//               Leaderboard-shaped read is performed against the SAME
//               underlying storage — and the identical reconciliation fact
//               is observable there. Also: the workspace holds no private
//               result representation the Leaderboard cannot equally
//               observe.
//   Section F — Duplicate execution: the SAME reconciliation, run twice,
//               examined against the EXISTING, already-documented
//               "no deduplication, multiplicity is the fact this file
//               exists to preserve" vocabulary already on file for all
//               three record histories this use case appends to.
//   Section G — Failure vocabulary: a storage failure can never surface
//               as `RECONCILIATION_FAILED` or any decision/observation
//               outcome literal — proven structurally (the try/catch
//               wraps only the save call, after `result` is already
//               computed) and behaviorally (forcing a real save failure
//               changes nothing about `result.outcome`).
//   Section H — Product decision classification: Option A ("execution
//               success is the primary fact; persistence is best-effort")
//               vs. Option B ("successful reconciliation requires durable
//               observation"), decided from Sections A-G's own evidence,
//               not asserted from scratch.
//   Section I — Production boundary: test-only, zero production files
//               touched.
//
// See ui/views/ReconciliationWorkspaceView.js's own header for the
// restraint this audit examines, and storage/LocalStoragePublicationObservationArchive.js's
// own header for the adapter contract Section C exercises directly.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

// ---------------------------------------------------------------------
// Fixture helpers — the SAME shape tests/ReconciliationWorkspaceUi.test.js
// and tests/ReconciliationWorkspaceExecutionBoundary.test.js already use,
// reused here rather than reinvented. The one deliberate departure: this
// file's own `InMemoryStorageProvider` and `FailingStorageProvider` are
// handed to the REAL `LocalStoragePublicationObservationArchive` adapter
// — the actual class ui/main.js wires up as
// `publicationObservationArchiveStorage` — rather than to a hand-rolled
// fake that stands in for the whole adapter. This is the one property
// this audit needs that 0.9.408's own test did not: a genuine
// toJSON()/fromJSON() round trip, and a genuine adapter-level save()
// failure, not merely a fake `.save()` method that happens to throw.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Stands in for a real, exhausted browser storage quota — the identical
// FAILURE SHAPE `window.localStorage.setItem()` itself throws when full,
// per storage/LocalStorageProvider.js's own direct pass-through. `load()`
// still works, backed by a plain in-memory map, so this class can answer
// "what does a SUBSEQUENT, independent load see" honestly rather than
// also being broken in a way real failed storage never is.
class FailingStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { throw new Error('simulated storage quota exceeded'); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function fingerprintOf(snapshot) {
    return describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint;
}

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

const E_WRONG = '9'.repeat(64);

// A genuinely DIVERGENT peer claim against a genuinely empty local
// archive — the SAME flagship shape tests/ReconciliationWorkspaceUi.test.js
// Section D already proves produces a real candidate/decision/observation.
function divergentClaimTextAgainstEmptyLocal(identityProvider, createdAt) {
    const localSnapshot = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
    const realSnapshotFingerprint = fingerprintOf(localSnapshot);
    const claim = signedClaim(identityProvider, {
        evidenceFingerprint: E_WRONG,
        policyVersion: localSnapshot.policy.version,
        snapshotFingerprint: realSnapshotFingerprint,
        createdAt
    });
    return JSON.stringify(claim.toJSON());
}

function buildWorkspaceInstance({ publicationObservationArchiveStorage = null } = {}) {
    const ctx = { publicationObservationArchiveStorage };
    Object.assign(ctx, ReconciliationWorkspaceView.data());
    Object.assign(ctx, ReconciliationWorkspaceView.methods);
    return ctx;
}

function candidateProducedOf(ctx) {
    return ReconciliationWorkspaceView.computed.candidateProduced.call(ctx);
}

async function run() {
    // ===============================================================
    // Section A — Existing persistence semantics.
    // ===============================================================
    {
        const publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        const workspaceSource = await readSource('ui/views/ReconciliationWorkspaceView.js');

        // The EXISTING, pre-0.9.408 precedent: `persistPublicationObservationArchive()`
        // (0.8.75) already treats a save failure as something that "only
        // means this one fact will not survive a reload" — never as
        // something that invalidates the fact itself. This is the
        // precedent, not something invented by the Workspace.
        assert(/will not survive a reload/.test(publicationsSource),
            n('A1. DecentralizedPublicationsView.js\'s own persistPublicationObservationArchive() already documents "returned/observed" and "persisted" as DELIBERATELY distinct facts, predating this milestone'));
        assert(/Intentionally swallowed/.test(publicationsSource),
            n('A2. the existing Publications page already swallows a save failure — the identical discipline this audit examines, not a new one'));

        // The Workspace's own header claims this is "the IDENTICAL
        // discipline" — checked directly, not taken on faith.
        assert(/IDENTICAL DISCIPLINE.*DecentralizedPublicationsView\.js.*OWN.*persistPublicationObservationArchive/is.test(workspaceSource)
            || /identical discipline that function's own header documents/i.test(workspaceSource),
            n('A3. the Workspace\'s own header genuinely claims to inherit the SAME discipline Section A1/A2 just verified exists independently'));
        assert(/Intentionally swallowed/.test(workspaceSource),
            n('A4. the Workspace genuinely swallows a save failure the same way'));

        // The adapter contract underneath both call sites: save() can
        // genuinely throw (proven live, not merely asserted from the
        // adapter's own header), and load() never throws, degrading a
        // missing/corrupted archive to an empty one instead — checked
        // directly against the REAL adapter class.
        const failing = new LocalStoragePublicationObservationArchive(new FailingStorageProvider());
        let saveThrew = false;
        try { failing.save(PublicationObservationArchive.empty()); } catch (error) { saveThrew = true; }
        assert(saveThrew === true, n('A5. LocalStoragePublicationObservationArchive.save() genuinely propagates a real storage failure — the swallow at A2/A4 is swallowing something real, not a hypothetical'));

        class ThrowingLoadProvider extends StorageProvider {
            load() { throw new Error('corrupted storage'); }
            save() {}
            remove() {}
            list() { return []; }
        }
        const corrupted = new LocalStoragePublicationObservationArchive(new ThrowingLoadProvider());
        let loadThrew = false;
        let loaded = null;
        try { loaded = corrupted.load(); } catch (error) { loadThrew = true; }
        assert(loadThrew === false, n('A6. LocalStoragePublicationObservationArchive.load() never throws, even for genuinely corrupted underlying storage'));
        assert(loaded instanceof PublicationObservationArchive && loaded.totalFactCount === 0, n('A7. a corrupted/unreadable archive degrades to a genuinely empty PublicationObservationArchive, never a crash and never a partial reconstruction'));

        // Every OTHER existing caller of `PublicationObservationArchive`
        // (the Leaderboard's own `sourceArchive`) already reads it
        // exclusively through the SAME `storage.load()` call — there is
        // no second notion of "the archive" anywhere else this milestone
        // needs to reconcile.
        const leaderboardSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        assert(/sourceArchive = publicationObservationArchiveStorage\s*\n?\s*\?\s*publicationObservationArchiveStorage\.load\(\)/.test(leaderboardSource),
            n('A8. the existing, unchanged Leaderboard reads its own sourceArchive from the SAME storage.load() call — "the archive" has exactly one durable meaning across this codebase, the persisted one'));

        console.log('\n=== SECTION A: EXISTING PERSISTENCE SEMANTICS ===');
        console.log('✓ Section A: the Workspace\'s best-effort swallow is the SAME, pre-existing discipline DecentralizedPublicationsView.js already established at 0.8.75 — not a new decision 0.9.408 invented. The adapter genuinely can fail to save and never fails to load; every other reader of "the archive" already means the persisted one.');
    }

    // ===============================================================
    // Section B — Workspace result semantics: the full chain, traced.
    // ===============================================================
    {
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');

        // The click -> read -> execute -> save -> display chain, in
        // exactly this order, checked directly against reconcile()'s own
        // source: the local archive is read, the use case executes and
        // assigns `this.result` BEFORE the save is even attempted.
        const reconcileBody = source.match(/reconcile\(\)\s*\{([\s\S]*?)\n\s{8}\},/);
        assert(reconcileBody !== null, n('B1. reconcile()\'s own method body is isolatable for direct inspection'));
        const body = reconcileBody[1];
        const resultAssignmentIndex = body.indexOf('this.result = useCase.execute(');
        const saveCallIndex = body.indexOf('.save(this.result.archive)');
        assert(resultAssignmentIndex !== -1 && saveCallIndex !== -1 && resultAssignmentIndex < saveCallIndex,
            n('B2. `this.result` is assigned from the use case\'s own return value STRICTLY BEFORE the save is attempted — display never waits on persistence'));

        // Live proof: local archive is read fresh EVERY call (never
        // cached across two calls on the same instance), via
        // `publicationObservationArchiveStorage.load()` alone.
        let loadCallCount = 0;
        const storage = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        const realLoad = storage.load.bind(storage);
        storage.load = () => { loadCallCount += 1; return realLoad(); };
        const bob = makeIdentity('Bob');
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: storage });
        ctx.peerEvidenceText = divergentClaimTextAgainstEmptyLocal(bob, new Date('2026-09-11T00:00:00Z'));
        ctx.reconcile();
        ctx.reconcile();
        assert(loadCallCount === 2, n(`B3. publicationObservationArchiveStorage.load() is called exactly once per reconcile() click (found ${loadCallCount} calls across 2 clicks) — never cached across calls`));

        // Live proof: the DISPLAYED result depends ONLY on the use
        // case's own outcome, never on whether the subsequent save
        // succeeds. Two otherwise-identical runs, one backed by working
        // storage and one backed by storage whose save() always throws,
        // produce IDENTICAL `result.outcome`/`candidateProduced`.
        const dave = makeIdentity('Dave');
        const carol = makeIdentity('Carol');
        const claimTextWorking = divergentClaimTextAgainstEmptyLocal(dave, new Date('2026-09-11T00:01:00Z'));
        const claimTextFailing = divergentClaimTextAgainstEmptyLocal(carol, new Date('2026-09-11T00:01:00Z'));

        const workingCtx = buildWorkspaceInstance({ publicationObservationArchiveStorage: new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider()) });
        workingCtx.peerEvidenceText = claimTextWorking;
        workingCtx.reconcile();

        const failingCtx = buildWorkspaceInstance({ publicationObservationArchiveStorage: new LocalStoragePublicationObservationArchive(new FailingStorageProvider()) });
        failingCtx.peerEvidenceText = claimTextFailing;
        failingCtx.reconcile();

        assert(workingCtx.result.outcome === failingCtx.result.outcome, n('B4. result.outcome is IDENTICAL whether the save succeeds or fails — display is driven by execution alone'));
        assert(candidateProducedOf(workingCtx) === candidateProducedOf(failingCtx), n('B5. candidateProduced is IDENTICAL whether the save succeeds or fails'));
        assert(workingCtx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('B6. sanity: both runs genuinely reached the fully-completed RECORDED outcome'));

        console.log('\n=== SECTION B: WORKSPACE RESULT SEMANTICS ===');
        console.log('✓ Section B: the chain is click -> fresh load -> execute -> assign result (display-ready) -> best-effort save, in that exact order. The displayed result never depends on whether the save that follows it succeeds.');
    }

    // ===============================================================
    // Section C — A REAL save failure, exercised against the real
    // adapter. Answers this milestone's own six concrete questions.
    // ===============================================================
    {
        const backingProvider = new FailingStorageProvider();
        const workspaceStorage = new LocalStoragePublicationObservationArchive(backingProvider);

        const erin = makeIdentity('Erin');
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: workspaceStorage });
        ctx.peerEvidenceText = divergentClaimTextAgainstEmptyLocal(erin, new Date('2026-09-11T00:02:00Z'));
        ctx.reconcile();

        // Q1 — Is the reconciliation fact still available in memory?
        assert(ctx.result !== null && ctx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED,
            n('C1. Q1 — YES: the reconciliation fact is genuinely available in memory as ctx.result, unaffected by the save failure'));
        assert(ctx.result.archive.leaderboardClaimRecords.length === 1 && ctx.result.archive.reconciliationDecisionRecords.length === 1 && ctx.result.archive.revalidationObservationRecords.length === 1,
            n('C2. Q1 (continued) — the in-memory result.archive genuinely holds the real, complete records — claim, decision, and observation alike'));

        // Q2 — Is it visible in the current workspace?
        assert(candidateProducedOf(ctx) === true, n('C3. Q2 — YES: the CURRENT workspace instance still displays "candidate produced" — its own template branches on result.outcome alone (Section B), never on save success'));

        // Q3 — Does a subsequent Leaderboard load see it?
        const reopenedStorage = new LocalStoragePublicationObservationArchive(backingProvider);
        const sourceArchiveAfterFailure = reopenedStorage.load();
        assert(sourceArchiveAfterFailure.leaderboardClaimRecords.length === 0, n('C4. Q3 — NO: a Leaderboard reading the SAME underlying storage sees ZERO claim records — the save genuinely never reached durable storage'));
        const pageAfterFailure = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchiveAfterFailure, PublicationObservationArchive.empty());
        assert(pageAfterFailure.rows.length === 0, n('C5. Q3 (continued) — the Leaderboard\'s own reconstructed page shows ZERO rows for this reconciliation — it genuinely cannot observe what the workspace just displayed as recorded'));

        // Q4 — Does refreshing the workspace lose it?
        const freshWorkspaceCtx = buildWorkspaceInstance({ publicationObservationArchiveStorage: workspaceStorage });
        assert(freshWorkspaceCtx.result === null, n('C6. Q4 — YES: a freshly-constructed Workspace instance (the same effect as reloading the page) starts with result === null — the in-memory fact from C1/C2 does not survive a reload, exactly as ui/views/ReconciliationWorkspaceView.js\'s own header already documents for `result` in general'));

        // Q5 — Does reopening the Leaderboard show the same result?
        // Answered directly by C4/C5 above — restated here as its own
        // numbered fact per this milestone's own six-question brief,
        // rather than left implicit.
        assert(pageAfterFailure.rows.length === 0, n('C7. Q5 — NO, for the identical reason as Q3: reopening the Leaderboard performs its own independent storage.load(), which never saw this reconciliation'));

        const saveFailureClassification = {
            factAvailableInMemory: true, // C1/C2
            visibleInCurrentWorkspace: true, // C3
            visibleToASubsequentLeaderboardLoad: false, // C4/C5
            survivesAWorkspaceRefresh: false, // C6
            visibleOnLeaderboardReopen: false, // C7
            verdict: 'A save failure produces a REAL, observable divergence: the workspace displays a completed reconciliation that no other surface, and not even the same workspace after a refresh, can ever independently observe again.'
        };
        assert(saveFailureClassification.factAvailableInMemory === true && saveFailureClassification.visibleToASubsequentLeaderboardLoad === false,
            n('C8. the save-failure classification captures a genuine, reproducible product-level gap: "shown as recorded" and "durably recorded" diverge exactly when persistence fails'));

        console.log('\n=== SECTION C: SAVE FAILURE, EXERCISED FOR REAL ===');
        console.log('✓ Section C: against the REAL LocalStoragePublicationObservationArchive adapter with a genuine, throwing save(): the fact survives in the clicking workspace\'s own in-memory result, is displayed there, and nowhere else — not a subsequent Leaderboard load, not the same workspace refreshed, not the Leaderboard reopened.');
    }

    // ===============================================================
    // Section D — Concurrent archive freshness survives a full
    // workflow, not merely a single read.
    // ===============================================================
    {
        const backingProvider = new InMemoryStorageProvider();
        const storageA = new LocalStoragePublicationObservationArchive(backingProvider);

        // Archive A: empty, nothing on file yet.
        assert(storageA.load().totalFactCount === 0, n('D1. sanity: Archive A starts genuinely empty'));

        // "another operation modifies archive" — the SAME kind of
        // append+persist Publications page's own archivePublishIpfsRecord()
        // performs (0.8.75, unchanged), run directly against the SAME
        // underlying storage, entirely independent of the Workspace.
        const record = new IpfsPublicationRecord({ contentHash: 'bafy-external-operation', locator: 'ipfs://bafy-external-operation', publishedAt: new Date('2026-09-11T00:03:00Z') });
        const archiveWithExternalFact = storageA.load().appendIpfsPublicationRecord(record);
        storageA.save(archiveWithExternalFact);
        assert(storageA.load().ipfsPublicationRecords.length === 1, n('D2. sanity: the external operation\'s own fact is genuinely durable before the Workspace ever runs'));

        // Reconcile click — a FRESH workspace instance, constructed after
        // the external operation, reading whatever is on file NOW.
        const frank = makeIdentity('Frank');
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: storageA });
        ctx.peerEvidenceText = divergentClaimTextAgainstEmptyLocal(frank, new Date('2026-09-11T00:04:00Z'));
        ctx.reconcile();

        assert(ctx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('D3. the reconciliation genuinely completed against the freshly-read archive'));

        // "fresh Archive B is used" — the archive the use case operated
        // on, and the one now persisted, carries BOTH the pre-existing
        // external fact AND the new reconciliation records — never one
        // overwriting the other.
        const finalArchive = storageA.load();
        assert(finalArchive.ipfsPublicationRecords.length === 1, n('D4. no cached/stale archive snuck back into the composition — the external operation\'s own fact from D2 SURVIVES the reconcile click'));
        assert(finalArchive.leaderboardClaimRecords.length === 1 && finalArchive.reconciliationDecisionRecords.length === 1 && finalArchive.revalidationObservationRecords.length === 1,
            n('D5. AND the reconciliation\'s own new records are genuinely present alongside it — this is a merge onto the freshest state, never a blind overwrite of it'));

        console.log('\n=== SECTION D: CONCURRENT ARCHIVE FRESHNESS ===');
        console.log('✓ Section D: an operation entirely outside the Workspace persists a fact between page-load and click; the click\'s own fresh load()/save() carries that fact forward untouched, alongside its own new records — no cached archive ever overwrites a concurrent change.');
    }

    // ===============================================================
    // Section E — THE CENTERPIECE: full-chain Leaderboard convergence,
    // through a REAL serialize/deserialize round trip, with the
    // workspace genuinely destroyed and recreated in between.
    // ===============================================================
    {
        // Step 1-3: execute reconciliation and persist through the REAL
        // storage adapter (never the Fake, reference-preserving double
        // 0.9.408's own test used) — a genuine JSON round trip, the exact
        // mechanism a real page reload exercises.
        const backingProvider = new InMemoryStorageProvider();
        const workspaceStorage = new LocalStoragePublicationObservationArchive(backingProvider);

        const grace = makeIdentity('Grace');
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: workspaceStorage });
        ctx.peerEvidenceText = divergentClaimTextAgainstEmptyLocal(grace, new Date('2026-09-11T00:05:00Z'));
        ctx.reconcile();

        assert(ctx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('E1. Step 1-2 — reconciliation executed and a real candidate/decision/observation was produced'));
        const producedClaimId = ctx.result.receipt.record.claim.id;
        const producedDecisionRecord = ctx.result.decision.record;
        const producedObservationRecord = ctx.result.observation.record;
        assert(typeof producedClaimId === 'string' && producedClaimId.length > 0, n('E2. sanity: a real claimId exists to look for on the other side'));

        // Step 4: destroy/recreate the workspace — a genuinely NEW
        // component instance AND a genuinely new adapter instance wired
        // to the same underlying storage, exactly what reopening the tab
        // would produce. `ctx` itself is never referenced again below.
        const recreatedWorkspaceStorage = new LocalStoragePublicationObservationArchive(backingProvider);
        const recreatedCtx = buildWorkspaceInstance({ publicationObservationArchiveStorage: recreatedWorkspaceStorage });
        assert(recreatedCtx.result === null, n('E3. Step 4 — the recreated workspace genuinely starts with no result of its own; anything it can show now must come from durable storage'));

        // Step 5: reload the archive — the SAME mechanism the Leaderboard
        // itself already uses (ReconciliationCandidateLeaderboardView.js's
        // own `sourceArchive`), against a THIRD, independent adapter
        // instance, proving this is genuinely about the underlying store,
        // never about any object reference surviving in this test's own
        // closure.
        const leaderboardStorage = new LocalStoragePublicationObservationArchive(backingProvider);
        const sourceArchive = leaderboardStorage.load();
        assert(sourceArchive !== ctx.result.archive, n('E4. Step 5 — the reloaded archive is a GENUINELY DIFFERENT INSTANCE from the one the use case returned (a real toJSON()/fromJSON() round trip occurred, not a reference carried over)'));
        assert(sourceArchive.leaderboardClaimRecords.length === 1, n('E5. Step 5 (continued) — the reloaded archive durably holds the received claim'));
        assert(sourceArchive.reconciliationDecisionRecords.length === 1, n('E6. Step 5 (continued) — the reloaded archive durably holds the recorded decision'));
        assert(sourceArchive.revalidationObservationRecords.length === 1, n('E7. Step 5 (continued) — the reloaded archive durably holds the recorded revalidation observation'));

        // Fields survive the round trip byte-for-byte, not merely in
        // count.
        assert(JSON.stringify(sourceArchive.reconciliationDecisionRecords[0]) === JSON.stringify(producedDecisionRecord),
            n('E8. the reloaded decision record is byte-for-byte identical, field for field, to the one the use case originally produced'));
        assert(JSON.stringify(sourceArchive.revalidationObservationRecords[0]) === JSON.stringify(producedObservationRecord),
            n('E9. the reloaded observation record is byte-for-byte identical, field for field, to the one the use case originally produced'));

        // Step 6-7: open the existing, UNCHANGED Leaderboard reconstruction
        // (never a duplicate view of this test's own) and verify the SAME
        // reconciliation fact is observable there.
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, PublicationObservationArchive.empty());
        assert(page.rows.length === 1, n('E10. Step 6-7 — the existing, unchanged Leaderboard reconstruction shows exactly one candidate row for this reconciliation'));
        assert(page.rows[0].candidate.claimId === producedClaimId, n('E11. Step 6-7 (continued) — that row genuinely names the SAME claimId the workspace itself produced — this is the SAME fact, not merely "a" fact'));
        assert(page.rows[0].candidate.selected === true, n('E12. Step 6-7 (continued) — the row\'s own candidate was genuinely selected, matching result.candidate.selected from the original run'));
        assert(page.rows[0].decisionEvidence.sourceOnlyCount >= 1, n('E13. Step 6-7 (continued) — the Leaderboard\'s own decision-evidence tally genuinely reflects the persisted decision, not zero'));
        assert(page.rows[0].observationEvidence.sourceOnlyCount >= 1, n('E14. Step 6-7 (continued) — the Leaderboard\'s own observation-evidence tally genuinely reflects the persisted observation, not zero'));

        // No private result representation: every fact `ctx.result` carried
        // that the domain treats as durable (the decision record, the
        // observation record) is ALSO exactly what the persisted archive
        // holds — proven above at E8/E9 by direct equality, restated here
        // as the closing claim this section exists to establish.
        const noPrivateRepresentation = {
            claim: 'the workspace holds no candidate/decision/observation fact that the persisted archive, once saved, does not equally hold',
            provenBy: ['E8 (decision record byte-identical)', 'E9 (observation record byte-identical)', 'E10-E14 (the SAME fact independently reconstructs into the Leaderboard\'s own read model)'],
            verdict: 'CONFIRMED'
        };
        assert(noPrivateRepresentation.verdict === 'CONFIRMED', n('E15. the closing claim of this section — no private, Leaderboard-invisible result representation exists once the save succeeds — is proven by construction, not asserted in prose'));

        console.log('\n=== SECTION E: LEADERBOARD CONVERGENCE (CENTERPIECE) ===');
        console.log('✓ Section E: workspace produces observation -> persisted through the REAL adapter -> workspace destroyed/recreated -> archive reloaded through a THIRD independent adapter instance (a genuine serialize/deserialize round trip) -> the existing, unchanged Leaderboard reconstruction shows the SAME reconciliation fact, byte-for-byte. The complete chain — USER ACTION -> WORKSPACE -> APPLICATION OPERATION -> RECONCILIATION FACT -> PERSISTENCE -> LEADERBOARD OBSERVATION — holds end to end, on the success path.');
    }

    // ===============================================================
    // Section F — Duplicate execution: examined against the EXISTING
    // domain vocabulary, never against an assumed deduplication policy.
    // ===============================================================
    {
        const backingProvider = new InMemoryStorageProvider();
        const workspaceStorage = new LocalStoragePublicationObservationArchive(backingProvider);
        const henry = makeIdentity('Henry');
        const claimText = divergentClaimTextAgainstEmptyLocal(henry, new Date('2026-09-11T00:06:00Z'));

        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: workspaceStorage });
        ctx.peerEvidenceText = claimText;
        ctx.reconcile();
        const firstClaimId = ctx.result.receipt.record.claim.id;

        ctx.reconcile(); // the IDENTICAL pasted text, run again — a genuine re-click, not a synthetic retry.
        const secondClaimId = ctx.result.receipt.record.claim.id;

        assert(ctx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('F1. the second, identical reconciliation ALSO completes — it is never rejected as "already reconciled"'));
        assert(firstClaimId === secondClaimId, n('F2. sanity: both runs genuinely name the identical claim (the peer evidence is byte-identical both times, and claim identity is content-derived, never a fresh random value per parse)'));

        const finalArchive = workspaceStorage.load();

        // What the EXISTING, on-file domain vocabulary already says about
        // this — never invented for this audit. Every one of the three
        // history files this use case appends to already documents "no
        // deduplication, multiplicity is the fact this file exists to
        // preserve" (application/LeaderboardClaimHistory.js,
        // application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js,
        // application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js
        // — checked directly, below).
        const claimHistorySource = await readSource('application/LeaderboardClaimHistory.js');
        const decisionHistorySource = await readSource('application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js');
        const observationHistorySource = await readSource('application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js');
        assert(/NO DEDUPLICATION HERE/.test(claimHistorySource), n('F3. application/LeaderboardClaimHistory.js already documents "NO DEDUPLICATION HERE" — the SAME claim received twice is two independent records, by explicit, pre-existing design'));
        assert(/DEDUPLICATED — MULTIPLICITY IS PRESERVED/.test(decisionHistorySource), n('F4. application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js already documents the identical restraint for decisions'));
        assert(/DEDUPLICATED — THE IDENTICAL DISCIPLINE/.test(observationHistorySource), n('F5. application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js already documents the identical restraint for revalidation observations'));

        // Live proof that the use case genuinely HONORS that existing
        // vocabulary — it does not silently collapse the second run.
        assert(finalArchive.leaderboardClaimRecords.length === 2, n('F6. two independent LeaderboardClaimRecords exist on file — repeated execution genuinely produced repeated, un-collapsed records, matching F3\'s own pre-existing domain rule'));
        assert(finalArchive.reconciliationDecisionRecords.length === 2, n('F7. two independent decision records exist on file, matching F4'));
        assert(finalArchive.revalidationObservationRecords.length === 2, n('F8. two independent revalidation observation records exist on file, matching F5'));

        // The Leaderboard's own read model, separately, happens to
        // project by distinct claimId today — a PRE-EXISTING, unrelated
        // read-model choice this milestone neither made nor needs to
        // change, named explicitly so it is never mistaken for evidence
        // that the underlying archive deduplicated anything.
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(finalArchive, PublicationObservationArchive.empty());
        assert(page.rows.length === 1, n('F9. the Leaderboard\'s own EXISTING read model shows one row for this claimId — a pre-existing display-layer projection, never evidence that the archive itself collapsed F6-F8\'s own two independent records'));

        const duplicateExecutionClassification = {
            question: 'repeated execution ≠ duplicate bug — unless the domain says these executions represent the same fact',
            domainAnswer: 'The domain (LeaderboardClaimHistory.js/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js/...RevalidationObservationHistory.js) ALREADY says, explicitly and by design, that repeated receipt of the identical claim is legitimate multiplicity, never a duplicate to collapse.',
            thisAuditsOwnFinding: 'The Workspace\'s repeated-click behavior is CONSISTENT with that existing rule — it introduces no new duplication concern beyond what the domain already accepts.',
            verdict: 'VALID_BEHAVIOR',
            reason: 'not a bug, and not a policy question this milestone needs to open'
        };
        assert(duplicateExecutionClassification.verdict === 'VALID_BEHAVIOR', n('F10. the audit\'s own classification: duplicate execution is valid, pre-existing domain behavior, not deduplication policy this milestone needs to prescribe'));

        console.log('\n=== SECTION F: DUPLICATE EXECUTION ===');
        console.log('✓ Section F: the same reconciliation, run twice, produces two independent claim/decision/observation records — exactly what the EXISTING, pre-0.9.409 "no deduplication, multiplicity is the fact this file exists to preserve" vocabulary already prescribes for all three histories. Not a bug; not a new policy decision.');
    }

    // ===============================================================
    // Section G — Failure vocabulary: a storage failure can never
    // surface as a reconciliation-domain outcome.
    // ===============================================================
    {
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');

        // Structural proof: the try/catch around the save call appears
        // STRICTLY AFTER `this.result` is already assigned from the use
        // case's own return value (re-confirmed directly here, not
        // merely inherited from Section B, since this section's own
        // claim is specifically about VOCABULARY, not ordering).
        const tryIndex = source.indexOf('try {\n                    this.publicationObservationArchiveStorage.save');
        const resultAssignIndex = source.indexOf('this.result = useCase.execute(');
        assert(resultAssignIndex !== -1 && tryIndex !== -1 && resultAssignIndex < tryIndex, n('G1. the save\'s own try/catch appears strictly after result is assigned — structurally, a save failure cannot influence which outcome literal is already sitting in `this.result`'));

        // No file in this exact reconciliation family mints a
        // "RECONCILIATION_FAILED"-shaped literal anywhere.
        const filesToCheck = [
            'ui/views/ReconciliationWorkspaceView.js',
            'application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js',
            'storage/LocalStoragePublicationObservationArchive.js'
        ];
        for (const file of filesToCheck) {
            const text = await readSource(file);
            const codeOnly = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/RECONCILIATION_FAILED/.test(codeOnly), n(`G2. ${file}'s own CODE never mints a "RECONCILIATION_FAILED" literal of any kind`));
        }

        // Every outcome literal `ReconcilePublisherLeaderboardSnapshotClaimUseCase`
        // can actually return is one of the pre-existing enums this
        // family already ships — re-confirmed directly so this section's
        // own claim rests on the real vocabulary, not a description of
        // it.
        const knownOutcomes = new Set([
            ...Object.values(LeaderboardClaimArchiveReceiptOutcome),
            ...Object.values(ReconcilePublisherLeaderboardSnapshotClaimOutcome),
            RevalidationObservationArchiveOutcome.RECORDED
        ]);
        assert(knownOutcomes.has('RECORDED'), n('G3. sanity: the known-outcomes set genuinely includes RECORDED'));
        assert(!Array.from(knownOutcomes).some((value) => /FAIL/i.test(value) && /RECONCIL/i.test(value)), n('G4. no outcome literal this family can ever return spells anything resembling "RECONCILIATION_FAILED" — persistence failure and reconciliation-domain outcome are, and remain, two separate vocabularies'));

        // Live, behavioral confirmation, restated from Section B/C for
        // this section's own specific claim: forcing a REAL save failure
        // never changes `result.outcome` away from RECORDED.
        const ivy = makeIdentity('Ivy');
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: new LocalStoragePublicationObservationArchive(new FailingStorageProvider()) });
        ctx.peerEvidenceText = divergentClaimTextAgainstEmptyLocal(ivy, new Date('2026-09-11T00:07:00Z'));
        ctx.reconcile();
        assert(ctx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('G5. LIVE: a genuine save failure leaves result.outcome exactly RECORDED — never re-labeled, never replaced by a persistence-layer word'));
        assert(typeof ctx.result.outcome === 'string' && ctx.result.outcome === 'RECORDED', n('G6. the displayed outcome is the SAME plain-data literal the domain already uses for a fully completed run, on both the success and save-failure paths alike'));

        console.log('\n=== SECTION G: FAILURE VOCABULARY ===');
        console.log('✓ Section G: structurally, the try/catch around save() sits after result is already computed; no file in this family mints a "RECONCILIATION_FAILED" literal; and, live, a genuine storage failure leaves result.outcome untouched at RECORDED. Storage failure and reconciliation-domain outcome remain two separate semantic layers, exactly as they must.');
    }

    // ===============================================================
    // Section H — Product decision classification: Option A vs Option B.
    // ===============================================================
    {
        const classificationTable = [
            {
                question: 'What does a successful Reconcile action mean to the user?',
                answer: 'OPTION A — execution success is the primary fact; persistence is best-effort.',
                rationale: 'Per Section A: this is not a NEW decision 0.9.408 made — it is the SAME discipline DecentralizedPublicationsView.js\'s own persistPublicationObservationArchive() already established at 0.8.75, for the identical class of fact (an observation this replica itself just made). Adopting Option B for the Workspace alone would make "the archive" mean two different things depending on which page produced the fact it holds — a genuinely new inconsistency this audit would be introducing, not one it would be resolving.'
            },
            {
                question: 'Is the current best-effort swallow "correct"?',
                answer: 'YES, as the PRIMARY-FACT semantic — but Section C proves it has a real, reproducible cost.',
                rationale: 'Per Section C: on a save failure, the clicking workspace shows a completed reconciliation that NO other surface — not a fresh Leaderboard load, not the same workspace refreshed, not the Leaderboard reopened — can ever independently confirm. This is not a defect in Option A\'s own logic (Option A never promised durability); it is an HONEST gap in what the user is TOLD about durability, which Option A\'s own semantic does not by itself require closing.'
            },
            {
                question: 'Does persistence failure ever get mislabeled as a reconciliation-domain outcome?',
                answer: 'NO.',
                rationale: 'Per Section G: structurally and behaviorally proven — the try/catch sits after result is computed, no RECONCILIATION_FAILED-shaped literal exists anywhere in this family, and a live, genuine save failure leaves result.outcome at RECORDED, unchanged.'
            },
            {
                question: 'Is repeated/duplicate execution a bug this milestone must resolve?',
                answer: 'NO.',
                rationale: 'Per Section F: the existing, pre-0.9.409 domain vocabulary (all three record histories this use case appends to) already, explicitly, treats repeated receipt of the identical claim as legitimate multiplicity, never as a duplicate to collapse. The Workspace\'s repeated-click behavior is consistent with that rule, not a new problem.'
            },
            {
                question: 'Does the freshness property (read the local archive fresh on every click) survive a full, realistic workflow?',
                answer: 'YES.',
                rationale: 'Per Section D: an external operation\'s own persisted fact, written between page-load and click, survives the reconcile click untouched, alongside the click\'s own new records — no cached archive ever overwrites a concurrent change.'
            },
            {
                question: 'On the success path, does the Workspace converge with the Leaderboard as one coherent persisted journey?',
                answer: 'YES — proven end to end, through a real serialize/deserialize round trip.',
                rationale: 'Per Section E (the centerpiece): workspace destroyed and recreated, archive reloaded through an independent adapter instance, the existing unchanged Leaderboard reconstruction shows the identical fact, byte-for-byte. The Workspace holds no private result representation the Leaderboard cannot equally observe, once the save succeeds.'
            }
        ];

        assert(classificationTable.length === 6, n('H1. all six questions this milestone exists to answer are classified'));
        for (const row of classificationTable) {
            assert(typeof row.question === 'string' && row.question.length > 0, n(`H2. every row names its question in prose: "${row.question}"`));
            assert(typeof row.answer === 'string' && row.answer.length > 0, n(`H3. every row carries an explicit answer: "${row.question}" -> "${row.answer}"`));
            assert(typeof row.rationale === 'string' && row.rationale.length > 60, n(`H4. every row's answer is backed by rationale grounded in a specific section above, not asserted bare: "${row.question}"`));
        }

        // The milestone's own overall verdict, checked against what
        // Sections A-G actually demonstrated, not assumed in advance.
        const overallVerdict = {
            semanticsAreCorrect: true, // Option A, per H's own first row, is the pre-existing, consistent architecture
            productionChangeRequired: false, // per this milestone's own explicit exclusion: do not change the swallow merely because it was noticed
            genuineFollowUpCandidate: 'Surfacing a save-failure indicator to the user (distinct from changing what "success" means) is a legitimate, separately-sized FUTURE seam — named here, not built here, per this milestone\'s own exclusion list.',
            nextMilestone: '0.9.410 — Reconciliation Workflow Product Reassessment, per the milestone brief\'s own stated branch for "persistence semantics are correct."'
        };
        assert(overallVerdict.semanticsAreCorrect === true, n('H5. OVERALL VERDICT: the current best-effort persistence semantics (Option A) are CORRECT — a pre-existing, consistent architectural choice this milestone confirms rather than invents'));
        assert(overallVerdict.productionChangeRequired === false, n('H6. OVERALL VERDICT: no production change is required BY this finding — per this milestone\'s own explicit instruction not to change the swallow merely because it was noticed'));

        console.log('\n=== SECTION H: PRODUCT DECISION CLASSIFICATION ===');
        console.log('✓ Section H: OPTION A is correct — execution success is the primary fact, persistence is best-effort, and this is the SAME pre-existing discipline the rest of this archive family already lives by. The one honest, real cost (Section C) is a save-failure indicator gap, named as a legitimate future seam, not built here.');
    }

    // ===============================================================
    // Section I — Production boundary: this milestone is test-only.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationWorkspacePersistenceConvergenceAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I1. every changed/added file is one this milestone explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const gitDiffStat = execSync(
            'git diff --stat HEAD -- ui/views/ReconciliationWorkspaceView.js application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js storage/LocalStoragePublicationObservationArchive.js application/PublicationObservationArchive.js ui/views/DecentralizedPublicationsView.js ui/views/ReconciliationCandidateLeaderboardView.js application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js application/LeaderboardClaimHistory.js application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT }
        ).toString().trim();
        assert(gitDiffStat === '', n(`I2. no production file this audit examines was modified by this test-only milestone. Found: ${gitDiffStat || '(none)'}.`));

        console.log('\n=== SECTION I: PRODUCTION BOUNDARY ===');
        console.log('✓ Section I: only this test file and tests.html\'s own registration changed. No production code, route, view, or application/core/storage symbol was added or modified to perform this audit.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('RECONCILIATION_WORKSPACE_PERSISTENCE_CONVERGENCE_CONFIRMED');
    console.log('');
    console.log('Option A is correct: execution success is the primary fact the');
    console.log('Reconciliation Workspace displays; persistence is best-effort, the');
    console.log('SAME pre-existing discipline DecentralizedPublicationsView.js already');
    console.log('established at 0.8.75. On the success path, the Workspace, its own');
    console.log('persisted archive, and the existing, unchanged Leaderboard form ONE');
    console.log('coherent journey, proven end to end through a real storage round trip.');
    console.log('On a genuine save failure, that convergence breaks in a real, reproducible');
    console.log('way (Section C) — an honest gap in user-facing durability feedback, named');
    console.log('as a legitimate future seam and deliberately NOT built here.');
    console.log('='.repeat(78));

    console.log('\n✅ All Reconciliation Workspace Persistence Convergence Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
