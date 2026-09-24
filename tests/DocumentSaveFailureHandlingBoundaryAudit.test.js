import { execSync } from 'node:child_process';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { DocumentManifest } from '../application/document/DocumentManifest.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { editorViewFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.652 — Document Save Failure Handling Boundary Audit.
//
// TYPE: test-only boundary audit. PRODUCTION CHANGES: none (Section I's
// own guard).
//
// 0.9.650 Section G2 already live-proved the headline fact: Save has no
// error handling anywhere in its real call chain, confirmed by actually
// throwing a QuotaExceededError through the unmodified SaveDocumentUseCase
// and observing it propagate uncaught out of Toolbar.js's own save(). This
// milestone does not re-derive that fact — Section A reconfirms it
// structurally in one pass — and instead spends its own live effort on the
// questions 0.9.650 deliberately left open: what does the FULL failure
// corpus look like (not just quota-exceeded), what state does the document
// end up in for each, can the user recover without loss, and what is the
// smallest existing seam a real fix would use.
//
// METHOD: every failure in Section B is live-composed against real,
// unmodified production classes (SaveDocumentUseCase, DocumentManifest,
// LocalStorageProvider, DocumentManager) — never asserted from reading the
// source alone. Section B5 is this milestone's own flagship finding: a
// failure mode 0.9.650 never triggered, found only by reading
// SaveDocumentUseCase.execute()'s actual write order closely enough to see
// that it performs TWO separate StorageProvider.save() calls (the document
// blob, then the manifest), not one.
//
//   A. Complete Save call chain — both real call sites, reconfirmed.
//   B. Failure corpus — five distinct, live-triggered storage failures.
//   C. Document state after each failure — dirty/clean/ambiguous, by case.
//   D. Recovery — in-memory document survives; retry converges cleanly.
//   E. UI feedback boundary — the seam a fix would use, already wired.
//   F. Success regression — the unmodified success path, full round trip.
//   G. Error information policy — what (if anything) reaches the user today.
//   H. No false durability — checked across the whole corpus, plus B5's
//      own mirror-image gap named and classified separately.
//   I. Production-change guard.
//   J. Verdict and recommendation.
//
// AMENDED BY 0.9.653 — Surface Document Save Failures. This milestone's own
// RECOMMENDATION (Section J, below) was built one milestone later: both
// real call sites (Toolbar.js's Save button, EditorView.js's Ctrl+S/Cmd+S)
// now wrap SaveDocumentUseCase.execute() in a try/catch that calls the
// existing feedback.show() boundary this audit's own Section E identified,
// with a generic, storage-agnostic message. Sections A4, A5, A6, and G2
// below — which asserted the PRE-FIX unwrapped shape — are amended in
// place to reconfirm the POST-FIX shape instead, mirroring the precedent
// tests/PublicationCommentaryNostrRoundTripBoundaryAudit.test.js's own
// 0.9.629 amendment already set. Finding #2 (Section B5's own partial-
// persistence/manifest-atomicity gap) remains deliberately OPEN — 0.9.653
// explicitly did not attempt it, exactly as this audit's own Section J
// recommended.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function freshFixture() {
    const world = new World();
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Save Failure Corpus Fixture', author: 'tester' })
    });
    const documentManager = new DocumentManager();
    documentManager.load(document);
    documentManager.markDirty(); // a real edit — so a false "saved" state would be observable
    return { document, documentManager, id: world.id };
}

// A plain in-memory StorageProvider — the same shape prior audits
// (0.9.650, PostPlacementWorldVisibilityProductBoundaryAudit) already use
// for a working backend, kept here as the "storage recovers" half of
// Section D's retry proof.

async function run() {
    console.log('=== 0.9.652 Document Save Failure Handling Boundary Audit ===\n');

    // ===============================================================
    // Section A — the complete, real Save call chain.
    // ===============================================================
    {
        const useCaseSource = codeOnly(await rawSource('application/document/SaveDocumentUseCase.js'));
        assert(!/try\s*\{/.test(useCaseSource),
            n('A1. application/document/SaveDocumentUseCase.js contains no try/catch anywhere — reconfirms 0.9.650 G2a structurally against current source.'));
        assert(/this\._storageProvider\.save\(id, json\);/.test(useCaseSource),
            n('A2. execute() calls storageProvider.save() for the document blob unwrapped.'));

        const manifestSource = codeOnly(await rawSource('application/document/DocumentManifest.js'));
        const manifestSaveCalls = (manifestSource.match(/this\._storageProvider\.save\(/g) || []).length;
        assert(manifestSaveCalls === 2, n(`A3. application/document/DocumentManifest.js itself calls storageProvider.save() twice more (upsert, remove) — found ${manifestSaveCalls}. THE STRUCTURAL FACT SECTION B5 IS BUILT ON: one explicit Save performs up to three separate StorageProvider.save() calls (document, manifest, [recovery-store remove is a StorageProvider.remove(), not save()]) plus two load()-driven reads, any one of which can fail independently, not one atomic operation.`));

        // Both real production call sites. AMENDED BY 0.9.653: each now
        // wraps SaveDocumentUseCase.execute() in a try/catch that reports
        // through the identical existing feedback boundary Section E
        // identified — reconfirmed structurally here, post-fix.
        const toolbarSource = codeOnly(await rawSource('ui/components/Toolbar.js'));
        assert(/function save\(\) \{\s*try \{\s*props\.saveDocumentUseCase\.execute\(props\.documentManager\);\s*\} catch \(error\) \{\s*console\.error\('Save failed:', error\);\s*report\(SAVE_FAILURE_MESSAGE\);\s*return;\s*\}\s*report\('Saved'\);\s*\}/.test(toolbarSource.replace(/\s+/g, ' ')),
            n('A4 (AMENDED BY 0.9.653). Toolbar.js\'s Save button: saveDocumentUseCase.execute() is now wrapped in a try/catch — success still calls report(\'Saved\') exactly as 0.9.650 G2c found it, but a thrown error is now caught, logged (console.error, matching this codebase\'s own existing diagnostic-logging convention — e.g. EditorView.js\'s "Publication distribution failed:" precedent), and reported through the same report()/feedback.show() seam via a new module-level SAVE_FAILURE_MESSAGE constant, never the raw error.'));
        assert(/const SAVE_FAILURE_MESSAGE = '[^']+';/.test(toolbarSource),
            n('A4b (0.9.653). ...and that constant is a fixed, generic, storage-agnostic string — never QuotaExceededError or any other raw storage exception name — matching Section E3\'s own "report()/feedback.show() takes a plain string, already storage-agnostic" finding.'));

        const editorViewSource = codeOnly((await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n'));
        assert(/event\.key\.toLowerCase\(\) === 's'\) \{\s*event\.preventDefault\(\);\s*try \{\s*saveDocumentUseCase\.execute\(documentManager\);\s*\} catch \(error\) \{\s*console\.error\('Save failed:', error\);\s*feedback\.show\(SAVE_FAILURE_MESSAGE\);\s*\}\s*return;/.test(editorViewSource.replace(/\s+/g, ' ')),
            n('A5 (AMENDED BY 0.9.653). EditorView.js\'s own Ctrl+S/Cmd+S shortcut — the SECOND, independent call site this section\'s own original finding flagged as the gap a toolbar-only fix would leave silent — is now wrapped too, reporting through the same local `feedback` object Toolbar.js\'s `props.feedback` is the prop-passed form of (Section E2\'s own seam), via the identical SAVE_FAILURE_MESSAGE text Toolbar.js uses (see A5b).'));
        assert(/import Toolbar, \{ SAVE_FAILURE_MESSAGE \} from '\.\.\/components\/Toolbar\.js';/.test(editorViewSource)
            && toolbarSource.includes("export const SAVE_FAILURE_MESSAGE = 'Save failed — your changes are still here, but were not saved. Try again.';"),
            n('A5b (0.9.653). ...and that string is the SAME constant in both places — Toolbar.js exports it and EditorView.js imports it, so the two can never drift apart.'));
        assert(/onKeyDown = \(event\) => \{\s*handleKeyDown\(event\);\s*refreshSelectedPlacementInfo\(\);\s*refreshSelectionSummary\(\);/.test(editorViewSource.replace(/\s+/g, ' ')),
            n('A6 (AMENDED BY 0.9.653). ...and because that call sits inside handleKeyDown(), this section\'s own original finding — that an uncaught throw there also skipped onKeyDown()\'s own trailing refreshSelectedPlacementInfo()/refreshSelectionSummary() calls for that keystroke — is now CLOSED as a side effect of catching the error one level down: handleKeyDown() itself no longer throws on a Save failure, so onKeyDown()\'s trailing calls (still present here, unchanged) now always run for that keystroke, matching this file\'s own structural shape both before and after 0.9.653.'));

        console.log('✓ A (AMENDED BY 0.9.653): both real call sites (Toolbar.js Save button, EditorView.js Ctrl+S) now wrap SaveDocumentUseCase.execute() in a try/catch reporting through the pre-existing feedback boundary, with byte-identical failure text. SaveDocumentUseCase.execute() itself remains completely unwrapped and unmodified — it still performs up to three separate StorageProvider writes, not a single atomic one (Section A3, below, unaffected) — 0.9.653 deliberately fixed only the UI-boundary gap this section originally measured, not Finding #2\'s own manifest-write atomicity question.');
    }

    // ===============================================================
    // Section B — the failure corpus, live-triggered through real,
    // unmodified production classes.
    // ===============================================================
    const corpusResults = [];
    {
        // B1. QuotaExceededError on the primary document write — the
        // 0.9.650 G2 case, reconfirmed here as this corpus's baseline,
        // using the exact DOMException shape a real browser throws.
        class QuotaOnDocumentWrite extends StorageProvider {
            save(name) { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }
            load() { return null; }
            remove() {}
            list() { return []; }
        }
        const fx1 = freshFixture();
        const useCase1 = new SaveDocumentUseCase(new QuotaOnDocumentWrite());
        let threw1 = false, error1 = null;
        try { useCase1.execute(fx1.documentManager); } catch (e) { threw1 = true; error1 = e; }
        assert(threw1, n('B1a. QuotaExceededError on the document write: propagates uncaught through SaveDocumentUseCase.execute().'));
        assert(error1.name === 'QuotaExceededError', n('B1b. ...the real DOMException identity survives unmodified to the caller (nothing wraps or reclassifies it).'));
        corpusResults.push({ label: 'B1 QuotaExceededError (document write)', dirty: fx1.documentManager.state.dirty, documentPersisted: false });

        // B2. A generic, non-quota storage failure on the same write —
        // the brief's own reminder not to assume every failure gets the
        // same treatment. Confirms the corpus's other cases aren't
        // special-cased to quota-shaped errors specifically.
        class GenericFailureOnWrite extends StorageProvider {
            save(name) { throw new Error('storage backend unavailable'); }
            load() { return null; }
            remove() {}
            list() { return []; }
        }
        const fx2 = freshFixture();
        const useCase2 = new SaveDocumentUseCase(new GenericFailureOnWrite());
        let threw2 = false;
        try { useCase2.execute(fx2.documentManager); } catch { threw2 = true; }
        assert(threw2, n('B2. A generic (non-DOMException) storage error on the same write path propagates exactly the same way — the missing boundary is not quota-specific.'));
        corpusResults.push({ label: 'B2 generic storage error (document write)', dirty: fx2.documentManager.state.dirty, documentPersisted: false });

        // B3. Storage unavailable entirely — even a READ fails. This
        // fails at a DIFFERENT, EARLIER point than B1/B2: SaveDocumentUseCase
        // reads the manifest (for the current saved revision) before it
        // ever attempts to write the document, so an unavailable backend
        // never gets as far as attempting persistence at all.
        class UnavailableStorage extends StorageProvider {
            save() { throw new Error('storage unavailable'); }
            load() { throw new Error('storage unavailable'); }
            remove() { throw new Error('storage unavailable'); }
            list() { throw new Error('storage unavailable'); }
        }
        const fx3 = freshFixture();
        const useCase3 = new SaveDocumentUseCase(new UnavailableStorage());
        let threw3 = false, wroteDocument3 = false;
        const originalSave3 = UnavailableStorage.prototype.save;
        UnavailableStorage.prototype.save = function (name) { wroteDocument3 = true; return originalSave3.call(this, name); };
        try { useCase3.execute(fx3.documentManager); } catch { threw3 = true; }
        UnavailableStorage.prototype.save = originalSave3;
        assert(threw3, n('B3a. Storage unavailable (load() also throws): propagates uncaught.'));
        assert(!wroteDocument3, n('B3b. ...and it fails at the revision-read step, BEFORE ever attempting to write the document blob — a distinct failure point from B1/B2, confirming the corpus should not assume every failure happens at the same step in execute().'));
        corpusResults.push({ label: 'B3 storage unavailable (read fails first)', dirty: fx3.documentManager.state.dirty, documentPersisted: false });

        // B4. Malformed/invalid storage response — the manifest key
        // returns corrupted data (an object, not the array the manifest
        // always writes) rather than the provider throwing outright. This
        // is a DOWNSTREAM failure: DocumentManifest.find() (called by
        // SaveDocumentUseCase._readSavedRevision(), the very FIRST thing
        // execute() does after serializing) calls .find() on whatever
        // list() returned, and a non-array response makes that a
        // TypeError from OUR OWN code, not the storage layer's. Because
        // that read happens before the document write (Section A2), this
        // corpus entry fails at the EARLIEST possible point — even
        // earlier than B1/B2, and structurally like B3, not like B5.
        class MalformedManifestStorage extends StorageProvider {
            constructor() { super(); this._docs = new Map(); }
            save(name, data) { this._docs.set(name, data); }
            load(name) {
                if (name === 'forkbuild-index') return { corrupted: true }; // not an array
                return this._docs.has(name) ? this._docs.get(name) : null;
            }
            remove() {}
            list() { return Array.from(this._docs.keys()); }
        }
        const storage4 = new MalformedManifestStorage();
        const fx4 = freshFixture();
        const useCase4 = new SaveDocumentUseCase(storage4);
        let threw4 = false, error4 = null;
        try { useCase4.execute(fx4.documentManager); } catch (e) { threw4 = true; error4 = e; }
        assert(threw4, n('B4a. A malformed (non-array) manifest response makes DocumentManifest.find() throw a TypeError of its own — a distinct failure ORIGIN from B1-B3 (application code, not the storage layer) that SaveDocumentUseCase.execute() still does not catch.'));
        assert(error4 instanceof TypeError, n('B4b. ...confirmed to be a genuine TypeError (entries.find is not a function), not a storage-layer exception re-thrown — this corpus entry would NOT be caught by a fix that only wraps StorageProvider-shaped errors by name/type.'));
        assert(storage4.load(fx4.id) === null, n('B4c. ...and, because the manifest is read (Section A2\'s own read-before-write order) before the document is ever written, the document blob was NEVER persisted here — storage4.load(id) returns null, same clean-failed shape as B3, NOT the same shape as B5 below.'));
        corpusResults.push({ label: 'B4 malformed manifest response (TypeError, earliest failure point)', dirty: fx4.documentManager.state.dirty, documentPersisted: false });

        // B5. *** THE FLAGSHIP FINDING *** Partial persistence: the
        // document blob write succeeds, but the manifest's own write (a
        // SECOND, independent StorageProvider.save() call — Section A3)
        // fails. This is the scenario the brief's own "partially
        // persisted" option names, and it is real: SaveDocumentUseCase
        // never checked for it because 0.9.650 only ever exercised a
        // single storage.save() throwing everywhere at once.
        class QuotaOnManifestWriteOnly extends StorageProvider {
            constructor() { super(); this._docs = new Map(); }
            save(name, data) {
                if (name === 'forkbuild-index') {
                    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
                }
                this._docs.set(name, JSON.parse(JSON.stringify(data)));
            }
            load(name) {
                if (name === 'forkbuild-index') return null;
                return this._docs.has(name) ? JSON.parse(JSON.stringify(this._docs.get(name))) : null;
            }
            remove() {}
            list() { return Array.from(this._docs.keys()); }
        }
        const storage5 = new QuotaOnManifestWriteOnly();
        const fx5 = freshFixture();
        const serializer5 = new DocumentSerializer();
        const expectedJson5 = serializer5.serialize(fx5.document);
        const useCase5 = new SaveDocumentUseCase(storage5, serializer5);
        let threw5 = false;
        try { useCase5.execute(fx5.documentManager); } catch { threw5 = true; }
        assert(threw5, n('B5a. *** THE FLAGSHIP FINDING *** the whole Save operation throws (the manifest write fails) — outwardly indistinguishable from B1/B2 to any caller.'));
        const persistedDoc5 = storage5.load(fx5.id);
        assert(persistedDoc5 !== null, n('B5b. ...BUT the document blob itself IS genuinely, durably in storage: storageProvider.load(documentId) returns real content, not null.'));
        assert(JSON.stringify(persistedDoc5) === JSON.stringify(expectedJson5),
            n('B5c. ...and it is byte-for-byte the SAME content that was about to be saved — not a stale or partial write, a complete and correct one that simply never got recorded in the manifest.'));
        assert(fx5.documentManager.state.dirty === true,
            n('B5d. ...yet DocumentManager still reports the document dirty (unsaved) — the user-visible state actively DISAGREES with what is actually sitting in storage. This is not "no false success"; it is the opposite gap: a real, correct, already-persisted save that the application itself has no way to know happened.'));
        corpusResults.push({ label: 'B5 *** partial persistence *** (document written, manifest write fails)', dirty: fx5.documentManager.state.dirty, documentPersisted: true });

        console.log('✓ B: five distinct failure origins live-triggered through real, unmodified classes — a thrown provider exception on the primary write (B1 quota-shaped, B2 generic), a provider that fails even on the earlier revision-read (B3), a malformed stored response causing OUR OWN code to throw at that same earliest read step (B4), and — the flagship finding — a second write (the manifest) failing AFTER the first (the document) already succeeded (B5), the one case in the corpus that reaches the write step at all before failing. None of the five is caught anywhere.');
    }

    // ===============================================================
    // Section C — document state after each failure, tabulated.
    // ===============================================================
    {
        console.log('\n=== 0.9.652 FAILURE CORPUS — STATE AFTER FAILURE ===');
        console.log(`
  Case                                             Dirty stays true   Document bytes actually persisted   Classification
  ------------------------------------------------ ------------------ ------------------------------------ -------------------
  B1  QuotaExceededError (document write)           yes                no                                    clean-failed (honest)
  B2  generic storage error (document write)        yes                no                                    clean-failed (honest)
  B3  storage unavailable (read fails first)        yes                no                                    clean-failed (honest)
  B4  malformed manifest response (earliest read)    yes                no                                    clean-failed (honest)
  B5  partial persistence (manifest write fails)     yes                YES                                   AMBIGUOUS (state understates reality)
`);
        corpusResults.forEach((c) => {
            assert(c.dirty === true, n(`C. ${c.label}: document correctly stays marked dirty after this failure — no case in the corpus ever reports a FALSE "saved" state.`));
        });
        const ambiguous = corpusResults.filter((c) => c.documentPersisted);
        assert(ambiguous.length === 1, n('C. exactly one of five corpus cases (B5) leaves the document in the AMBIGUOUS state the brief\'s own Section C names: bytes are genuinely on disk, but every user-visible and application-visible signal (dirty flag, manifest, revision, contentHash) says otherwise. The other four fail before any bytes are written at all, and are simply — if silently — honest.'));
        console.log('✓ C: no case in the corpus ever reports a false "saved" state (H\'s own concern, reconfirmed here per-case). Only B5 is AMBIGUOUS, in the opposite direction: real, correct bytes are already durably stored with no record of it anywhere the application itself can see. The other four all fail before any write is attempted.');
    }

    // ===============================================================
    // Section D — recovery: is the in-memory document still usable, and
    // does a plain retry converge cleanly, including from B5's own
    // divergent state?
    // ===============================================================
    {
        class AlwaysThrows extends StorageProvider {
            save() { throw new Error('storage unavailable'); }
            load() { return null; }
            remove() {}
            list() { return []; }
        }
        const fx = freshFixture();
        const originalDocument = fx.documentManager.document;
        const originalTitle = originalDocument.metadata.title;
        const useCase = new SaveDocumentUseCase(new AlwaysThrows());
        try { useCase.execute(fx.documentManager); } catch { /* expected */ }

        assert(fx.documentManager.document === originalDocument,
            n('D1. after a failed Save, DocumentManager still holds the EXACT SAME in-memory Document instance — a failed Save neither discards nor replaces it.'));
        assert(fx.documentManager.document.metadata.title === originalTitle,
            n('D2. ...its content is unmodified — a failed Save never mutates the document being saved.'));
        assert(fx.documentManager.state.dirty === true,
            n('D3. ...and it is still marked dirty, so the editor\'s own "unsaved changes" UI (whatever surfaces DocumentState.dirty) stays honest without any new code — this already works today.'));

        // A plain retry against a NOW-WORKING backend succeeds cleanly.
        const workingStorage = new InMemoryStorageProvider();
        const retryUseCase = new SaveDocumentUseCase(workingStorage);
        const retryId = retryUseCase.execute(fx.documentManager);
        assert(retryId === fx.id, n('D4. retrying Save (same document, same use case shape, a working storage backend) succeeds and returns the same document id.'));
        assert(fx.documentManager.state.dirty === false, n('D5. ...and the document is now correctly marked clean — retry-after-failure is not a new capability; it already works because nothing about the failed attempt corrupted in-memory state.'));

        // D6 — the harder case: does a retry converge correctly even
        // starting from B5's own divergent state (bytes present, manifest
        // absent)? Composed directly, not inferred.
        class QuotaOnManifestWriteOnly extends StorageProvider {
            constructor() { super(); this._docs = new Map(); this._failManifest = true; }
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
            remove() {}
            list() { return Array.from(this._docs.keys()); }
        }
        const storage6 = new QuotaOnManifestWriteOnly();
        const fx6 = freshFixture();
        const useCase6 = new SaveDocumentUseCase(storage6);
        try { useCase6.execute(fx6.documentManager); } catch { /* B5's own scenario */ }
        assert(fx6.documentManager.state.dirty === true, n('D6a. reconfirms B5\'s starting point: dirty after the manifest-only failure.'));

        storage6._failManifest = false; // "storage recovers" — the retry's backend now accepts the manifest write
        const retryId6 = useCase6.execute(fx6.documentManager);
        assert(retryId6 === fx6.id, n('D6b. retrying from B5\'s own divergent state succeeds — SaveDocumentUseCase does not need the manifest and the document blob to already agree; it simply re-derives and re-writes both.'));
        assert(fx6.documentManager.state.dirty === false, n('D6c. ...and the document is correctly clean afterward.'));
        const manifestEntry6 = new DocumentManifest(storage6).find(fx6.id);
        assert(manifestEntry6 && manifestEntry6.revision === 1,
            n('D6d. ...with a correct manifest entry at revision 1 — the retry\'s own revision computation is not confused by the fact that a document blob (but no manifest entry) already existed in storage from the failed first attempt; DocumentRevision.nextRevision() reads the manifest, finds nothing, and correctly starts from 0.'));

        console.log('✓ D: a failed Save never discards or mutates the in-memory document, and a plain retry — with no new code — already converges correctly, including from the harder B5 starting point where a document blob exists in storage with no matching manifest entry yet. Recovery is not a gap; the corpus\'s only real gap is that the user is never told a retry is needed.');
    }

    // ===============================================================
    // Section E — the UI feedback boundary: what already exists to
    // translate a storage failure into user-facing text, and where.
    // ===============================================================
    {
        const storageProviderSource = codeOnly(await rawSource('storage/StorageProvider.js'));
        assert(!/ui\/|alert\(|window\.alert|QuotaExceeded/i.test(storageProviderSource),
            n('E1. storage/StorageProvider.js has zero UI or quota-specific knowledge — confirmed structurally, not merely by its own header comment. Whatever fix Section J recommends must not put that knowledge here.'));

        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        assert(/function report\(message\) \{/.test(toolbarSource) && /props\.feedback\.show\(message\)/.test(toolbarSource),
            n('E2. ui/components/Toolbar.js ALREADY HAS a report(message) helper, already used for the Save success case (report(\'Saved\')) one line above the unwrapped execute() call — the exact seam a failure branch would call into already exists in the same function.'));
        assert(!/QuotaExceeded|DOMException/.test(toolbarSource),
            n('E3. ...and, correctly, Toolbar.js does not and should not know QuotaExceededError by name — report()/feedback.show() takes a plain string, already storage-agnostic.'));

        const actionFeedbackSource = await rawSource('ui/components/ActionFeedback.js');
        assert(actionFeedbackSource.includes("aria-live"), n('E4. the feedback surface underneath (ui/components/ActionFeedback.js) is a real, already-accessible (aria-live) one-line UI component, not a placeholder.'));

        // Precedent: this codebase has already solved "translate an
        // infrastructure error into safe, generic user-facing text"
        // exactly once before, for a different journey (post-publish
        // distribution) — the shape a Save fix should mirror, not
        // reinvent.
        const sanitizerSource = await rawSource('application/publication/distribution/DistributionErrorMessageSanitizer.js');
        assert(sanitizerSource.includes('export function sanitizeDistributionErrorMessage'),
            n('E5. application/publication/distribution/DistributionErrorMessageSanitizer.js already establishes exactly this pattern for a different journey — strips hostnames/paths/stack traces/tokens from a raw error and returns null (never invents wording) when nothing safe is left, letting the caller fall back to its own generic notice.'));
        const loadFailureReasonSource = await rawSource('application/document/LoadFailureReason.js');
        assert(loadFailureReasonSource.includes('error.reason ='.replace(' =', '')) || /\.reason\s*=/.test(await rawSource('application/document/LoadDocumentUseCase.js')),
            n('E6. ...and application/document/LoadFailureReason.js + LoadDocumentUseCase.js already establish a second, complementary pattern: a typed `.reason` attached to the thrown Error, so a caller can branch structurally instead of string-matching `.message` — the same shape application/document/ForkFailureReason.js uses for Fork.'));

        console.log('✓ E: the smallest correct boundary is already wired and already in active use for Save\'s own SUCCESS case — Toolbar.js\'s report()/feedback.show() — one line away from where the failure needs to be caught. StorageProvider correctly knows nothing about any of this. Two existing, unrelated-journey precedents (DistributionErrorMessageSanitizer.js\'s text-sanitizing filter, LoadFailureReason.js\'s typed .reason) already show the two shapes a Save fix could mirror rather than invent from scratch.');
    }

    // ===============================================================
    // Section F — success regression: the unmodified path, full round
    // trip, proven live.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const recoveryStore = new LocalRecoveryStore(storage);
        const serializer = new DocumentSerializer();
        const useCase = new SaveDocumentUseCase(storage, serializer, new DocumentManifest(storage), recoveryStore);

        const world = new World();
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Success Regression Fixture', author: 'tester' }) });
        const documentManager = new DocumentManager();
        documentManager.load(document);
        documentManager.markDirty();

        // Seed a pending recovery checkpoint so this proves the explicit
        // Save's own documented supersession behavior too (SaveDocumentUseCase's
        // own header), not just the base success path.
        recoveryStore.save(world.id, { documentId: world.id, revision: 1, savedAt: new Date().toISOString(), contentHash: 'x', document: {} });

        const beforeSaveState = documentManager.state;
        const returnedId = useCase.execute(documentManager);

        assert(returnedId === world.id, n('F1. execute() returns the document id, unchanged behavior.'));
        assert(documentManager.state.dirty === false, n('F2. dirty -> clean transition happens exactly as before.'));
        assert(documentManager.state.lastSaved instanceof Date, n('F3. lastSaved is populated.'));
        assert(documentManager.state !== beforeSaveState, n('F4. DocumentState is replaced (immutable-state convention), not mutated in place — unchanged from before this audit.'));

        const persisted = storage.load(world.id);
        assert(persisted !== null, n('F5. the document blob is genuinely persisted — storageProvider.load(id) returns it.'));
        assert(JSON.stringify(persisted) === JSON.stringify(serializer.serialize(document)),
            n('F6. ...and it matches exactly what DocumentSerializer would produce for this document — content identity preserved.'));

        const manifestEntry = new DocumentManifest(storage).find(world.id);
        assert(manifestEntry && manifestEntry.revision === 2, n('F7. manifest entry recorded with the correct revision — one past the seeded recovery checkpoint\'s own revision 1, per DocumentRevision.nextRevision().'));
        assert(manifestEntry.contentHash === computeContentHash(JSON.stringify(persisted)), n('F8. ...and the correct contentHash.'));
        assert(manifestEntry.title === 'Success Regression Fixture', n('F9. ...and the correct title metadata.'));

        assert(!recoveryStore.exists(world.id), n('F10. the pending recovery checkpoint seeded above was correctly cleared — an explicit Save still supersedes autosave, unchanged.'));

        // Subsequent Load reconstructs identical document identity.
        const { LoadDocumentUseCase } = await import('../application/document/LoadDocumentUseCase.js');
        const loadUseCase = new LoadDocumentUseCase(storage, serializer);
        const reloadedManager = new DocumentManager();
        const reloaded = loadUseCase.execute(reloadedManager, world.id);
        assert(reloaded.world.id === world.id, n('F11. Load after Save reconstructs the same document id.'));
        assert(reloaded.metadata.title === 'Success Regression Fixture', n('F12. ...and the same title/metadata.'));
        assert(reloadedManager.state.dirty === false, n('F13. ...loaded fresh and clean, as always.'));

        console.log('✓ F: the entire successful Save path — persistence, dirty-state transition, manifest/revision/contentHash, recovery-checkpoint supersession, and a subsequent Load — is byte-for-byte unchanged from before this audit. Nothing in Section B\'s corpus construction touches the success path; this is the same production SaveDocumentUseCase, unmodified.');
    }

    // ===============================================================
    // Section G — error information policy: what actually reaches the
    // user today, precisely (not "too much detail" — the finding is
    // narrower and stranger than that).
    // ===============================================================
    {
        assert(!grepFiles('errorCaptured|window\\.onerror|config\\.errorHandler', ['ui']).length,
            n('G1. reconfirms 0.9.650 G2d: no Vue errorCaptured hook, no window.onerror, no app.config.errorHandler exists anywhere in ui/ — there is no global net a raw throw could fall into even accidentally.'));

        // The precise, easy-to-get-wrong claim: an uncaught throw inside a
        // Vue click handler or a raw window keydown listener does NOT put
        // error.message on screen for the user by itself — it reaches the
        // browser console (and, for the Ctrl+S path specifically, silently
        // truncates that one keydown's remaining handler logic, Section A6).
        // The honest description of today's behavior is "the user sees
        // and is told NOTHING", not "the user sees a raw stack trace" —
        // worth stating precisely so a fix is scoped at translating
        // silence into a message, not merely sanitizing a message that
        // was never going to reach the screen in the first place.
        // AMENDED BY 0.9.653 — Toolbar.js's save() now HAS a catch block
        // (this section's own G2 originally confirmed it did not). The
        // brace-balance-naive regex this assertion used pre-0.9.653
        // ([^}]*, which stops at the FIRST literal `}` — the try block's
        // own closing brace, not save()'s) would silently keep "passing"
        // today even though it no longer captures the whole function body,
        // which would make this assertion falsely claim "no catch" by
        // accident of regex construction rather than by fact. Rewritten to
        // check the true condition directly instead of relying on that
        // now-broken brace-matching trick.
        const toolbarSource = codeOnly(await rawSource('ui/components/Toolbar.js'));
        const saveFunctionMatch = toolbarSource.match(/function save\(\) \{[\s\S]*?\n {8}\}/);
        assert(saveFunctionMatch && /catch \(error\)/.test(saveFunctionMatch[0]),
            n('G2 (AMENDED BY 0.9.653). Toolbar.js\'s own save() function now DOES have a catch block — this section\'s own pre-0.9.653 finding (total silence on any Save failure) is CLOSED. The catch calls report(SAVE_FAILURE_MESSAGE) — a fixed, generic, sanitized-by-construction string, never the caught error\'s own .message — so this remains, correctly, the DistributionErrorMessageSanitizer.js-style "never show raw text" policy Section E5 named as one of the two available precedents, not the LoadFailureReason.js-style typed-.reason branching Section E6 named as the other.'));

        console.log('✓ G (AMENDED BY 0.9.653): today\'s failure mode is no longer silence — Toolbar.js\'s save() and EditorView.js\'s Ctrl+S handler both now report a fixed, generic SAVE_FAILURE_MESSAGE through the pre-existing feedback.show() boundary on any Save failure, never the raw underlying error. Diagnostic detail is preserved via console.error(\'Save failed:\', error), matching this codebase\'s own existing convention (e.g. EditorView.js\'s pre-existing "Publication distribution failed:" logging) rather than being discarded.');
    }

    // ===============================================================
    // Section H — no false durability, checked across the whole corpus.
    // ===============================================================
    {
        // Re-verified directly here (not merely inferred from Section B's
        // own per-case assertions) that markSaved() — the one call that
        // could ever produce a false "saved" state — never ran in ANY
        // corpus case. DocumentState is immutable and only ever replaced
        // by markDirty()/markSaved() (application/document/DocumentManager.js's
        // own _setState() convention), so if execute() throws before
        // reaching markSaved(), documentManager.state stays the EXACT
        // SAME object reference it was before execute() was even called
        // — a stronger, more direct check than re-reading dirty/lastSaved
        // off a state object that might merely happen to still look the
        // same by coincidence.
        const cases = [
            ['B1', class extends StorageProvider { save() { throw new DOMException('quota', 'QuotaExceededError'); } load() { return null; } remove() {} list() { return []; } }],
            ['B2', class extends StorageProvider { save() { throw new Error('fail'); } load() { return null; } remove() {} list() { return []; } }],
            ['B3', class extends StorageProvider { save() { throw new Error('fail'); } load() { throw new Error('fail'); } remove() {} list() { throw new Error('fail'); } }]
        ];
        cases.forEach(([label, ProviderClass]) => {
            const fx = freshFixture();
            const stateBeforeSave = fx.documentManager.state;
            const useCase = new SaveDocumentUseCase(new ProviderClass());
            try { useCase.execute(fx.documentManager); } catch { /* expected */ }
            assert(fx.documentManager.state === stateBeforeSave,
                n(`H. ${label}: DocumentState is the exact same object reference after the failed Save as before it — markSaved() provably never ran (it is the only thing that would replace it); no false "saved" state is ever recorded.`));
        });

        console.log('✓ H: across the corpus, a Save that throws NEVER calls DocumentManager.markSaved() — no case ever produces a false "saved" state, the brief\'s own explicit concern. B5\'s own AMBIGUOUS classification (Section C) is a DIFFERENT, MIRROR-IMAGE gap — real bytes durably persisted with no record of it — and is deliberately NOT counted as a false-durability violation: the application never claims success it did not earn; it simply fails, in that one case, to notice a success it already earned.');
    }

    // ===============================================================
    // Section I — production-change guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', n(`I. no production file is modified by this milestone — found: ${changedNonTestFiles || 'none'}`));
        console.log('✓ I: no production file touched. This audit measures the Save failure boundary; it does not repair it.');
    }

    // ===============================================================
    // Section J — verdict and recommendation.
    // ===============================================================
    console.log(`
0.9.652 verdict: 0.9.650 Section G2's headline finding — Save has no error
handling anywhere in its real call chain — is reconfirmed, and sharpened
into something more precisely scoped:

  1. TWO real call sites are unwrapped, not one: Toolbar.js's Save button
     AND EditorView.js's own Ctrl+S/Cmd+S shortcut (Section A5), both
     routing through the same unwrapped SaveDocumentUseCase.execute().

  2. THE FLAGSHIP FINDING (Section B5): SaveDocumentUseCase.execute()
     performs up to three separate, independently-failable StorageProvider
     calls per Save (Section A3) — the document blob, then the manifest.
     A failure on the SECOND write leaves the document blob genuinely,
     correctly, durably persisted while every signal the application or
     user can see (dirty flag, manifest entry, revision, contentHash,
     recovery checkpoint) says the opposite. This is a real, live-composed
     AMBIGUOUS state (Section C), distinct from — and not covered by —
     0.9.650's own quota-on-first-write case.

  3. Recovery already works with zero new code (Section D): the in-memory
     document is never discarded or mutated by a failed Save, and a plain
     retry converges correctly even from Finding #2's own divergent
     starting state.

  4. The correct UI seam already exists and is already wired one line
     away from the failure (Section E): Toolbar.js's own report()/
     feedback.show(), reused today for the Save SUCCESS message. Two
     existing, unrelated-journey precedents — DistributionErrorMessageSanitizer.js's
     text-sanitizing filter and LoadFailureReason.js's typed \`.reason\` —
     already show two shapes a fix's own information policy could mirror.

  5. Today's actual failure mode is verified to be total silence, not
     information leakage (Section G) — no global safety net exists, and
     no local catch of any kind exists to leak from.

RECOMMENDATION: a single, narrow 0.9.653 that:
  - wraps SaveDocumentUseCase.execute() at BOTH real call sites (Toolbar.js
    Save button AND EditorView.js Ctrl+S — Finding #1) in a try/catch that
    calls the already-existing feedback.show() with a generic, storage-
    agnostic message (Section E2/E3's own boundary; StorageProvider stays
    exactly as ignorant of UI as Section E1 confirms it is today);
  - leaves DocumentManager/DocumentState entirely alone — Section D already
    proves recovery needs no new code, only a message;
  - explicitly does NOT attempt to fix Finding #2 (the manifest-write
    partial-persistence gap) as part of the same milestone: that finding
    is about SaveDocumentUseCase's own internal write ordering/atomicity,
    a structurally different and independently-scoped question from
    "tell the user when Save fails," and folding it in would widen 0.9.653
    well past the narrow UI-boundary fix this audit was asked to scope.
    Left as a clearly-named candidate for whichever milestone the
    requesting brief chooses to schedule it in.

Deliberately excluded, matching this milestone's own test-only brief:
autosave, backup copies, cloud sync, retry loops, storage quota
management, automatic document recovery, Save As, export, any change to
StorageProvider, and any generic application-wide error-handling
framework. This milestone measures; it does not repair.
`);

    console.log(`✅ All Document Save Failure Handling Boundary Audit tests passed (${assertionCount} assertions).`);
}

await run();
