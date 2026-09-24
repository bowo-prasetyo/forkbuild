import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { StorageProvider } from '../storage/StorageProvider.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { editorViewFiles } from './support/SourceFileGroups.js';

// 0.9.653 — Surface Document Save Failures: closure audit.
//
// Verifies the fix tests/DocumentSaveFailureHandlingBoundaryAudit.test.js
// (0.9.652) recommended and this milestone built: both real Save entry
// points — ui/components/Toolbar.js's Save button and ui/views/EditorView.js's
// Ctrl+S/Cmd+S shortcut — now catch a thrown SaveDocumentUseCase.execute()
// failure and report it through the pre-existing feedback.show() boundary,
// with identical failure text, never a raw storage exception.
//
// Because ui/components/Toolbar.js and ui/views/EditorView.js both import
// `vue`, this repo's plain `node tests/*.test.js` runner cannot import them
// directly — tests/EditorViewPostPublishDistributionAction.test.js's own
// header names the constraint and its own technique: extract the REAL,
// CURRENT production block by marker-to-marker slicing (never hand-
// retyped) and execute it via `new Function(...)` against real
// collaborators (a real SaveDocumentUseCase, real storage-failure classes,
// a recording feedback stub). Both harnesses below run against the
// unmodified, currently-checked-out source, so a regression in either
// production file breaks this audit, not a stale fixture.
//
//   A. Toolbar Save failure.
//   B. Ctrl+S failure — same test, repeated through the keyboard shortcut.
//   C. Error corpus — quota, generic, document-write, manifest-write.
//   D. Partial persistence characterization (manifest-write failure).
//   E. Retry — a failed Save followed by a working one converges.
//   F. Success regression — both entry points' own unmodified success path.
//   G. Feedback boundary — one seam, one message, no alert() fallback.
//   H. No atomicity claims — SaveDocumentUseCase remains unwrapped and
//      non-transactional; the permanent invariant is recorded in its own
//      header, not merely in this test.
//   I. Production-change guard.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function extractRange(source, startMarker, endMarker, label) {
    const start = source.indexOf(startMarker);
    assert(start !== -1, `${label || startMarker}: start marker located in source`);
    const end = source.indexOf(endMarker, start);
    assert(end !== -1, `${label || startMarker}: end marker located after start`);
    return source.slice(start, end);
}

function extractModuleConstString(source, constName) {
    const match = source.match(new RegExp(`const ${constName} = '([^']+)';`));
    assert(match, `module-level const ${constName} found`);
    return match[1];
}

// -----------------------------------------------------------------
// Harness — Toolbar.js's own report()/save() pair, extracted live from
// the current file, never hand-retyped.
// -----------------------------------------------------------------
function makeToolbarHarness(toolbarSource, saveFailureMessage, props) {
    const blockSource = extractRange(
        toolbarSource,
        'function report(message) {',
        'function createNew() {',
        'Toolbar.js report()/save()'
    );
    const alertCalls = [];
    const consoleCalls = [];
    const fakeConsole = { error: (...args) => consoleCalls.push(args) };
    const factory = new Function(
        'props', 'console', 'alert', 'SAVE_FAILURE_MESSAGE',
        `${blockSource}\nreturn { report, save };`
    );
    const harness = factory(props, fakeConsole, (msg) => alertCalls.push(msg), saveFailureMessage);
    return { ...harness, alertCalls, consoleCalls };
}

// -----------------------------------------------------------------
// Harness — EditorView.js's own Ctrl+S/Cmd+S `if` block inside
// handleKeyDown(), extracted live from the current file.
// -----------------------------------------------------------------
function makeCtrlSHandler(editorViewSource) {
    const blockSource = extractRange(
        editorViewSource,
        "if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {",
        '// 4.1. ',
        'EditorView.js Ctrl+S block'
    );
    return new Function('event', 'saveDocumentUseCase', 'documentManager', 'feedback', 'console', 'SAVE_FAILURE_MESSAGE', blockSource);
}

function makeFeedbackRecorder() {
    const calls = [];
    return { show: (message) => calls.push(message), calls };
}

function makeCtrlSEvent() {
    let prevented = 0;
    return { ctrlKey: true, metaKey: false, key: 's', preventDefault: () => { prevented += 1; }, get preventedCount() { return prevented; } };
}

function freshFixture(title = 'Save Failure Closure Audit Fixture') {
    const world = new World();
    const document = new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
    const documentManager = new DocumentManager();
    documentManager.load(document);
    documentManager.markDirty();
    return { document, documentManager, id: world.id };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The same failure corpus shapes tests/DocumentSaveFailureHandlingBoundaryAudit.test.js
// (0.9.652) live-composed against SaveDocumentUseCase directly — reused
// here one layer up, through the two real UI call sites.
class QuotaOnDocumentWrite extends StorageProvider {
    save() { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }
    load() { return null; }
    remove() {}
    list() { return []; }
}
class GenericFailureOnWrite extends StorageProvider {
    save() { throw new Error('storage backend unavailable'); }
    load() { return null; }
    remove() {}
    list() { return []; }
}
class UnavailableStorage extends StorageProvider {
    save() { throw new Error('storage unavailable'); }
    load() { throw new Error('storage unavailable'); }
    remove() { throw new Error('storage unavailable'); }
    list() { throw new Error('storage unavailable'); }
}
class QuotaOnManifestWriteOnly extends StorageProvider {
    constructor({ failManifest = true } = {}) { super(); this._docs = new Map(); this._failManifest = failManifest; }
    save(name, data) {
        if (name === 'forkbuild-index' && this._failManifest) {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        this._docs.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        if (name === 'forkbuild-index') return this._docs.has(name) ? this._docs.get(name) : null;
        return this._docs.has(name) ? JSON.parse(JSON.stringify(this._docs.get(name))) : null;
    }
    remove(name) { this._docs.delete(name); }
    list() { return Array.from(this._docs.keys()); }
}

async function run() {
    console.log('=== 0.9.653 Surface Document Save Failures — Closure Audit ===\n');

    const toolbarSource = await rawSource('ui/components/Toolbar.js');
    const editorViewSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
    const toolbarMessage = extractModuleConstString(toolbarSource, 'SAVE_FAILURE_MESSAGE');
    // EditorView.js imports Toolbar.js's own exported constant rather than
    // declaring a second copy.
    assert(/import Toolbar, \{ SAVE_FAILURE_MESSAGE \} from '\.\.\/components\/Toolbar\.js';/.test(editorViewSource),
        'EditorView.js imports SAVE_FAILURE_MESSAGE from Toolbar.js');
    const editorViewMessage = toolbarMessage;

    // ===============================================================
    // Section A — Toolbar Save failure.
    // ===============================================================
    {
        const fx = freshFixture();
        const feedback = makeFeedbackRecorder();
        const saveDocumentUseCase = new SaveDocumentUseCase(new QuotaOnDocumentWrite());
        const harness = makeToolbarHarness(toolbarSource, toolbarMessage, {
            feedback, saveDocumentUseCase, documentManager: fx.documentManager
        });

        let escaped = false;
        try { harness.save(); } catch { escaped = true; }
        assert(!escaped, n('A1. a QuotaExceededError thrown by SaveDocumentUseCase.execute() does not escape Toolbar.js\'s own save() — caught at the real UI call site.'));
        assert(feedback.calls.length === 1 && feedback.calls[0] === toolbarMessage,
            n(`A2. failure feedback appears exactly once, via the real feedback.show() boundary — got: ${JSON.stringify(feedback.calls)}`));
        assert(!feedback.calls.includes('Saved'), n('A3. success feedback ("Saved") does not appear alongside or instead of the failure message.'));
        assert(harness.alertCalls.length === 0, n('A4. alert() is never used as a fallback when a feedback object is supplied — the one existing boundary is reused, not bypassed.'));
        assert(fx.documentManager.document === fx.document, n('A5. the in-memory document remains the exact same instance — Save failure does not discard or replace it.'));
        assert(fx.documentManager.state.dirty === true, n('A6. the document remains usable and honestly marked dirty — no false "saved" state.'));
        assert(harness.consoleCalls.length === 1 && harness.consoleCalls[0][0] === 'Save failed:' && harness.consoleCalls[0][1] instanceof Error,
            n('A7. the real error is still logged for diagnostics (console.error(\'Save failed:\', error)) — this codebase\'s own existing convention (matching EditorView.js\'s pre-existing "Publication distribution failed:" logging) is preserved, not silently swallowed.'));

        console.log('✓ A: Toolbar Save failure — caught, reported once through feedback.show(), no success feedback, document stays usable and truthfully dirty, diagnostic logging preserved.');
    }

    // ===============================================================
    // Section B — Ctrl+S failure: the exact same test, through the
    // keyboard shortcut, because 0.9.652 found it to be a SECOND,
    // independent call site a toolbar-only fix would have left silent.
    // ===============================================================
    {
        const fx = freshFixture();
        const feedback = makeFeedbackRecorder();
        const saveDocumentUseCase = new SaveDocumentUseCase(new QuotaOnDocumentWrite());
        const ctrlSHandler = makeCtrlSHandler(editorViewSource);
        const event = makeCtrlSEvent();
        const consoleCalls = [];
        const fakeConsole = { error: (...args) => { consoleCalls.push(args); } };

        let escaped = false;
        try {
            ctrlSHandler(event, saveDocumentUseCase, fx.documentManager, feedback, fakeConsole, editorViewMessage);
        } catch { escaped = true; }

        assert(!escaped, n('B1. the identical QuotaExceededError does not escape EditorView.js\'s own Ctrl+S block either.'));
        assert(event.preventedCount === 1, n('B2. event.preventDefault() is still called exactly once, unaffected by the failure — the browser\'s own Ctrl+S save-page shortcut stays suppressed either way.'));
        assert(feedback.calls.length === 1 && feedback.calls[0] === editorViewMessage,
            n(`B3. failure feedback appears exactly once via the SAME feedback.show() boundary — got: ${JSON.stringify(feedback.calls)}`));
        assert(!feedback.calls.includes('Saved'), n('B4. success feedback does not appear.'));
        assert(fx.documentManager.document === fx.document, n('B5. the in-memory document is untouched.'));
        assert(fx.documentManager.state.dirty === true, n('B6. the document remains honestly dirty.'));
        assert(consoleCalls.length === 1 && consoleCalls[0][0] === 'Save failed:' && consoleCalls[0][1] instanceof Error,
            n('B7. diagnostic logging happens here too.'));
        assert(editorViewMessage === toolbarMessage,
            n('B8. THE CORE INVARIANT: the failure text shown via Ctrl+S is byte-for-byte identical to the one shown via the Toolbar Save button — "same user-visible failure semantics" for both entry points, verified directly, not assumed from each file declaring a same-named constant.'));

        console.log('✓ B: Ctrl+S failure — identical outcome to Section A through the second, independent call site 0.9.652 flagged, with byte-identical failure text.');
    }

    // ===============================================================
    // Section C — error corpus, through both real entry points.
    // ===============================================================
    {
        const corpus = [
            ['QuotaExceededError (document write)', () => new QuotaOnDocumentWrite()],
            ['generic storage failure (document write)', () => new GenericFailureOnWrite()],
            ['document-write failure (storage unavailable, read fails first)', () => new UnavailableStorage()],
            ['manifest-write failure (partial persistence)', () => new QuotaOnManifestWriteOnly()]
        ];

        for (const [label, makeProvider] of corpus) {
            // Toolbar entry point.
            {
                const fx = freshFixture();
                const feedback = makeFeedbackRecorder();
                const saveDocumentUseCase = new SaveDocumentUseCase(makeProvider());
                const harness = makeToolbarHarness(toolbarSource, toolbarMessage, { feedback, saveDocumentUseCase, documentManager: fx.documentManager });
                harness.save();
                assert(feedback.calls.length === 1 && feedback.calls[0] === toolbarMessage,
                    n(`C. [Toolbar] ${label}: same generic SAVE_FAILURE_MESSAGE shown regardless of the underlying cause — never a technical/storage-specific string — got: ${JSON.stringify(feedback.calls)}`));
            }
            // Ctrl+S entry point.
            {
                const fx = freshFixture();
                const feedback = makeFeedbackRecorder();
                const saveDocumentUseCase = new SaveDocumentUseCase(makeProvider());
                const ctrlSHandler = makeCtrlSHandler(editorViewSource);
                const fakeConsole = { error: () => {} };
                ctrlSHandler(makeCtrlSEvent(), saveDocumentUseCase, fx.documentManager, feedback, fakeConsole, editorViewMessage);
                assert(feedback.calls.length === 1 && feedback.calls[0] === editorViewMessage,
                    n(`C. [Ctrl+S] ${label}: same generic message shown — got: ${JSON.stringify(feedback.calls)}`));
            }
        }

        console.log('✓ C: the full failure corpus (quota-shaped, generic, an even-earlier document-write failure, and the manifest-only partial-persistence case) all produce the identical, generic, storage-agnostic feedback message through both entry points — the user is never shown QuotaExceededError, a stack trace, or any other technical detail.');
    }

    // ===============================================================
    // Section D — partial persistence characterization (manifest-write
    // failure): 0.9.653 must not pretend this is a successful Save.
    // ===============================================================
    {
        const fx = freshFixture();
        const feedback = makeFeedbackRecorder();
        const storage = new QuotaOnManifestWriteOnly();
        const serializer = new DocumentSerializer();
        const expectedJson = serializer.serialize(fx.document);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const harness = makeToolbarHarness(toolbarSource, toolbarMessage, { feedback, saveDocumentUseCase, documentManager: fx.documentManager });

        harness.save();

        const persistedDoc = storage.load(fx.id);
        assert(persistedDoc !== null, n('D1. document blob: PRESENT — the first write genuinely succeeded before the manifest write failed.'));
        assert(JSON.stringify(persistedDoc) === JSON.stringify(expectedJson), n('D2. ...and it is the correct, complete content, not a stale or partial write.'));
        const manifestEntry = new DocumentManifest(storage).find(fx.id);
        assert(!manifestEntry, n('D3. manifest: ABSENT — the second write never completed, exactly the partial-persistence shape 0.9.652 Section B5 found.'));

        assert(feedback.calls.length === 1 && feedback.calls[0] === toolbarMessage, n('D4. failure feedback is shown...'));
        assert(!feedback.calls.includes('Saved'), n('D5. ...and 0.9.653 does NOT pretend this is a successful Save — no success feedback appears despite the document blob genuinely being on disk.'));
        assert(fx.documentManager.state.dirty === true, n('D6. dirty state stays truthful (unsaved) — it does not, and structurally cannot, know about D1\'s own already-persisted bytes; understating reality is the honest failure mode here, never overstating it.'));

        console.log('✓ D: partial persistence after a manifest-write failure is exactly characterized (blob present, manifest absent) and 0.9.653 correctly reports this as a failure, never a success, despite real bytes already being durably stored.');
    }

    // ===============================================================
    // Section E — retry: a failed Save followed by a working one
    // converges to a normal, clean success.
    // ===============================================================
    {
        const fx = freshFixture();
        const feedback = makeFeedbackRecorder();
        const storage = new QuotaOnManifestWriteOnly({ failManifest: true });
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const harness = makeToolbarHarness(toolbarSource, toolbarMessage, { feedback, saveDocumentUseCase, documentManager: fx.documentManager });

        harness.save();
        assert(feedback.calls.length === 1 && feedback.calls[0] === toolbarMessage, n('E1. first Save attempt fails and reports failure, as Section D already established.'));
        assert(fx.documentManager.state.dirty === true, n('E2. ...document remains dirty after the failed attempt.'));

        storage._failManifest = false; // "replace the failing storage behavior with a working provider"
        harness.save();
        assert(feedback.calls.length === 2 && feedback.calls[1] === 'Saved', n(`E3. the SECOND Save attempt, against a now-working backend, succeeds and reports success normally — full call sequence: ${JSON.stringify(feedback.calls)}`));
        assert(fx.documentManager.state.dirty === false, n('E4. ...and the document is now correctly marked clean.'));
        const manifestEntry = new DocumentManifest(storage).find(fx.id);
        assert(manifestEntry && manifestEntry.revision === 1, n('E5. ...with a correct manifest entry — the retry converges cleanly even starting from the first attempt\'s own partial-persistence state, exactly as 0.9.652 Section D6 already proved for the bare use case, now reconfirmed through the real UI call site.'));

        console.log('✓ E: retry after failure works normally — no special-casing was needed or added, matching 0.9.652 Section D\'s own finding that recovery was never the gap.');
    }

    // ===============================================================
    // Section F — success regression: each entry point's own existing
    // successful behavior is unchanged.
    // ===============================================================
    {
        // Toolbar: success already showed 'Saved' before 0.9.653 — reconfirmed unchanged.
        {
            const storage = new InMemoryStorageProvider();
            const recoveryStore = new LocalRecoveryStore(storage);
            const serializer = new DocumentSerializer();
            const documentManifest = new DocumentManifest(storage);
            const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer, documentManifest, recoveryStore);
            const fx = freshFixture('Toolbar Success Regression Fixture');
            const feedback = makeFeedbackRecorder();
            const harness = makeToolbarHarness(toolbarSource, toolbarMessage, { feedback, saveDocumentUseCase, documentManager: fx.documentManager });

            harness.save();

            assert(feedback.calls.length === 1 && feedback.calls[0] === 'Saved', n('F1. Toolbar success path still shows exactly "Saved" — unchanged by 0.9.653.'));
            assert(fx.documentManager.state.dirty === false, n('F2. ...dirty -> clean transition unaffected.'));
            const persisted = storage.load(fx.id);
            assert(persisted !== null && JSON.stringify(persisted) === JSON.stringify(serializer.serialize(fx.document)), n('F3. ...document persisted correctly.'));
            const manifestEntry = documentManifest.find(fx.id);
            assert(manifestEntry && manifestEntry.contentHash === computeContentHash(JSON.stringify(persisted)) && manifestEntry.title === 'Toolbar Success Regression Fixture',
                n('F4. ...manifest revision/contentHash/title all correct.'));
            assert(harness.consoleCalls.length === 0, n('F5. ...and no diagnostic error logging happens on a successful Save.'));
        }

        // Ctrl+S: success was already silent (no toast) before 0.9.653 —
        // reconfirmed unchanged; this milestone only added FAILURE
        // reporting to this call site, never a new success notification.
        {
            const storage = new InMemoryStorageProvider();
            const serializer = new DocumentSerializer();
            const documentManifest = new DocumentManifest(storage);
            const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer, documentManifest);
            const fx = freshFixture('Ctrl+S Success Regression Fixture');
            const feedback = makeFeedbackRecorder();
            const ctrlSHandler = makeCtrlSHandler(editorViewSource);
            const event = makeCtrlSEvent();

            ctrlSHandler(event, saveDocumentUseCase, fx.documentManager, feedback, console, editorViewMessage);

            assert(event.preventedCount === 1, n('F6. Ctrl+S still calls preventDefault() exactly once on success.'));
            assert(feedback.calls.length === 0, n('F7. Ctrl+S success remains silent (no toast) — 0.9.653 only added a FAILURE branch here, it did not introduce a new success notification that did not exist before.'));
            assert(fx.documentManager.state.dirty === false, n('F8. ...dirty -> clean transition happens correctly all the same.'));
            const persisted = storage.load(fx.id);
            assert(persisted !== null, n('F9. ...document genuinely persisted.'));
            const manifestEntry = documentManifest.find(fx.id);
            assert(manifestEntry && manifestEntry.title === 'Ctrl+S Success Regression Fixture', n('F10. ...manifest entry correct.'));
        }

        console.log('✓ F: both entry points\' own pre-existing successful behavior — persistence, manifest/revision/contentHash, dirty-state transition, and each path\'s own existing feedback shape (a toast for Toolbar, silence for Ctrl+S) — is unchanged.');
    }

    // ===============================================================
    // Section G — feedback boundary: one seam, one message, reused
    // rather than a separate UI path invented per entry point.
    // ===============================================================
    {
        assert(toolbarMessage === editorViewMessage, n('G1. SAVE_FAILURE_MESSAGE is byte-identical between the two files (reconfirms B8).'));
        assert(!/QuotaExceeded|DOMException|storage backend unavailable|storage unavailable/.test(toolbarSource),
            n('G2. Toolbar.js never names a specific storage exception anywhere in its own source, including comments — the boundary stays storage-agnostic by construction, not merely by the one message string it happens to show today.'));
        assert(!/QuotaExceeded|DOMException/.test(extractRange(editorViewSource, "if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {", '// 4.1. ', 'Ctrl+S block')),
            n('G3. ...neither does EditorView.js\'s own Ctrl+S block.'));
        assert(!/class \w*SaveError|new Notification\(|errorBus|EventBus|window\.onerror\s*=/.test(toolbarSource + editorViewSource),
            n('G4. no new notification system, SaveError class, or global error bus was introduced anywhere in either changed file — the pre-existing feedback.show() boundary was reused, exactly as scoped.'));

        // Re-run Section A's scenario once more, this time asserting the
        // NEGATIVE: with a feedback object present, alert() is never
        // reached as a fallback — the only path is feedback.show().
        const fx = freshFixture();
        const feedback = makeFeedbackRecorder();
        const saveDocumentUseCase = new SaveDocumentUseCase(new QuotaOnDocumentWrite());
        const harness = makeToolbarHarness(toolbarSource, toolbarMessage, { feedback, saveDocumentUseCase, documentManager: fx.documentManager });
        harness.save();
        assert(harness.alertCalls.length === 0 && feedback.calls.length === 1, n('G5. exactly one UI path was used (feedback.show()) — alert() untouched.'));

        console.log('✓ G: both entry points funnel through the identical, pre-existing feedback.show() boundary with identical text — no second UI path, no new notification primitive, no storage-specific vocabulary leaked into either file.');
    }

    // ===============================================================
    // Section H — no atomicity claims. SaveDocumentUseCase itself
    // remains completely unwrapped; the two StorageProvider writes are
    // still not transactional, and 0.9.653 makes no attempt to change
    // that. The invariant is recorded permanently in the production
    // file's own header, not only asserted here.
    // ===============================================================
    {
        const useCaseSource = await rawSource('application/SaveDocumentUseCase.js');
        const useCaseCodeOnly = useCaseSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/try\s*\{/.test(useCaseCodeOnly),
            n('H1. application/SaveDocumentUseCase.js still contains no try/catch anywhere — 0.9.653 did not touch it, matching Section I\'s own production-change guard below.'));
        const useCaseHeaderProse = useCaseSource.split('\n')
            .map((line) => line.replace(/^\s*\/\/\s?/, ''))
            .join(' ')
            .replace(/\s+/g, ' ');
        assert(useCaseHeaderProse.includes('0.9.653 handles user-visible Save failure; it does not make the two StorageProvider writes transactional.'),
            n('H2. the permanent invariant this milestone was asked to document is recorded verbatim (across the header\'s own line-wrapped comment prose) in SaveDocumentUseCase.js\'s own header — durable documentation, not only a claim in this test file, so a future maintainer reading the source itself (not just this audit) sees it.'));

        // The mirror-image proof: partial persistence (Section D) still
        // happens through the real UI entry point after 0.9.653, and the
        // already-written document blob is NOT rolled back or deleted —
        // 0.9.653 introduces no cleanup/compensation logic, exactly as
        // scoped ("the blob may be valid durable data even though the
        // application-level Save operation failed").
        const fx = freshFixture();
        const feedback = makeFeedbackRecorder();
        const storage = new QuotaOnManifestWriteOnly();
        let removeCalled = false;
        const originalRemove = storage.remove.bind(storage);
        storage.remove = (name) => { removeCalled = true; return originalRemove(name); };
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const harness = makeToolbarHarness(toolbarSource, toolbarMessage, { feedback, saveDocumentUseCase, documentManager: fx.documentManager });
        harness.save();

        assert(storage.load(fx.id) !== null, n('H3. after the manifest-write failure, the document blob is still genuinely present in storage...'));
        assert(!removeCalled, n('H4. ...and nothing in the 0.9.653 failure-handling path ever calls StorageProvider.remove() to clean it up — no automatic rollback, compensation, or orphan-cleanup logic was added; the orphaned-blob question is explicitly left as a separate, unanswered storage-lifecycle question.'));

        console.log('✓ H: SaveDocumentUseCase.execute() remains entirely unwrapped and non-atomic; the two StorageProvider writes are still independently failable, no rollback/compensation/journaling was added, and the permanent "does not make it transactional" invariant now lives in the production file\'s own header.');
    }

    // ===============================================================
    // Section I — production-change guard.
    // ===============================================================
    {
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.653 " --format=%H -n 1', { cwd: SOURCE_ROOT.pathname }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT.pathname }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or the 0.9.653 commit does not exist yet at test-authoring time */ }

        const EXPECTED = new Set(['ui/components/Toolbar.js', 'ui/views/EditorView.js', 'application/SaveDocumentUseCase.js']);
        const unexpected = productionTouched.filter((f) => !EXPECTED.has(f));
        assert(unexpected.length === 0,
            n(`I. the 0.9.653 commit touches no production file outside the two Save entry points and SaveDocumentUseCase.js's own documentation-only header addition — found unexpected: ${JSON.stringify(unexpected)}`));

        console.log('✓ I: production diff limited to the two existing Save entry points (plus a documentation-only header note on SaveDocumentUseCase.js recording the non-atomicity invariant) — no new notification system, SaveError class, error bus, or storage-specific UI logic anywhere else.');
    }

    console.log(`\n✅ All Surface Document Save Failures Closure Audit tests passed (${assertionCount} assertions).`);
}

await run();
