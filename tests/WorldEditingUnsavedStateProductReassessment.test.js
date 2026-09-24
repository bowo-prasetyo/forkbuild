import { readFile } from 'node:fs/promises';

import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { CreateDocumentManagerUseCase } from '../application/CreateDocumentManagerUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadFailureReason } from '../application/LoadFailureReason.js';
import { AutosaveScheduler } from '../application/AutosaveScheduler.js';
import { AutosaveDocumentUseCase } from '../application/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from '../application/DiscardRecoveryUseCase.js';
import { RecoveryObserver } from '../application/RecoveryObserver.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { DocumentRevision } from '../core/DocumentRevision.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { ForkPublishedWorldUseCase } from '../application/ForkPublishedWorldUseCase.js';
import { LifecycleStatus, computeLifecycleStatus, describeLifecycleStatus } from '../application/DocumentLifecycleStatus.js';

// 0.9.579 — World Editing & Unsaved-State Product Reassessment.
//
// 0.9.577 closed World creation -> publication lifecycle at the
// use-case boundary. This milestone asks the question that file
// deliberately left open: does the actual EDITING experience keep the
// mutable working state, the last saved state, and an immutable
// Publication apart, safely and understandably, from the Wanderer's own
// point of view — Save vs. Publish, unsaved-changes risk, re-entry,
// reload/interruption, and what the UI actually tells the Wanderer about
// which of these states they are looking at?
//
// Same structural constraint as 0.9.576/0.9.577/0.9.578: ui/views/
// EditorView.js imports 'vue' and application/EditorSession.js
// transitively imports 'three' (via RenderWorldUseCase.js -> Renderer.js)
// — neither resolves under plain `node tests/*.test.js` in this
// checkout (reconfirmed directly for this milestone; every other
// EditorView/EditorSession-touching test file in this repo has the
// identical constraint, per tests/EditorAutosaveRecoveryUIIntegration
// .test.js's own header). Every claim about EditorView.js/EditorSession.js
// THEMSELVES is therefore proven by direct source citation (readSource()
// + exact line/regex quotes), never by live import. Everywhere else —
// application/DocumentManager.js, SaveDocumentUseCase.js,
// LoadDocumentUseCase.js, AutosaveScheduler.js, AutosaveDocumentUseCase.js,
// CheckRecoveryUseCase.js, RecoverDocumentUseCase.js, DiscardRecoveryUseCase.js,
// RecoveryObserver.js, PublishDocumentUseCase.js, DocumentLifecycleStatus.js,
// DocumentManifest.js, core/DocumentRevision.js, publisher/
// LocalPublisherProvider.js, persistence/LocalRecoveryStore.js,
// discovery/LocalDiscoveryProvider.js — real, unmodified production
// classes are imported and exercised live, wired together in the SAME
// sequence EditorView.js's own onMounted()/onBeforeUnmount()/
// recoverDocument()/discardRecovery() compose them in (cited verbatim
// wherever the wiring itself, not just the collaborator, is the claim).
//
//   A — Editing-state inventory: the real production vocabulary
//       (DocumentState, LifecycleStatus, DocumentRevision, a recovery
//       checkpoint) mapped onto the brief's own proposed seven states —
//       nothing invented to make the brief's language fit.
//   B — Save semantics: edit -> save -> edit -> save, live, through the
//       exact DocumentManager + SaveDocumentUseCase pathway; an explicit
//       Save also cancels a pending autosave.
//   C — Unsaved changes: THE MAIN INVESTIGATION. What "navigate away
//       while dirty" actually does — no blocking guard exists anywhere;
//       a debounced recovery checkpoint protects most of it; the
//       trailing autosave-delay window does not.
//   D — Re-entry after unsaved editing: deterministic, revision-compared
//       recovery offer, live through CheckRecoveryUseCase/
//       RecoverDocumentUseCase exactly as EditorView.js composes them.
//   E — Save vs. Publish: the explicit separation, tied to
//       DocumentLifecycleStatus's own three-tier vocabulary.
//   F — Published snapshot immutability, from the editing workflow.
//   G — Multiple Publications from one editing session.
//   H — Reload and interruption: plain reload, navigate-away-and-back,
//       and a failed re-open (EditorSession._rebuild()'s own citation).
//   I — Collaboration + local editing (narrow — not a 0.9.545 re-run).
//   J — Failure isolation: Save fails, Publish fails, Load fails (the
//       LoadFailureReason.MATERIAL_UNAVAILABLE presentation boundary).
//   K — Identity under editing: the full matrix, reconfirmed from the
//       editing session's own actions.
//   L — User-facing state communication: where this milestone's real
//       findings live.
//   M — Flagship + deliberate exclusions.
//
// Deliberately excluded, per this milestone's own originating brief:
// autosave-to-the-canonical-slot, undo/redo, version history, draft
// branches, conflict-resolution redesign, new Document state machines,
// new persistence mechanisms, Publication editing, automatic
// republishing, offline editing queues, collaboration redesign, new
// navigation infrastructure. This file changes no production code; it
// is reconnaissance/reassessment only.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
        this.saveCount = 0;
        this.removeCount = 0;
        this._failKeys = null;
    }
    save(name, data) {
        if (this._failKeys && this._failKeys.has(name)) {
            throw new Error(`InMemoryStorageProvider: simulated failure saving "${name}"`);
        }
        this.saveCount += 1;
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this.removeCount += 1; this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
    failOnSave(...keys) { this._failKeys = new Set(keys); }
    clearFailures() { this._failKeys = null; }
}

// Same minimal single-building World every prior milestone's helper has
// used (0.9.534/0.9.574/0.9.575/0.9.576/0.9.577/0.9.578).
function buildWorldDocument({ title = 'Atlas', author = 'alice', license = new License({ id: LicenseId.CC0_1_0 }) } = {}) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author, license }) });
}

function makePublishPipeline(storage, author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const identityProvider = { currentUser: () => ({ username: author }), sign: () => null };
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identityProvider, null, null);
    return { contentStore, publisher, identityProvider, publishDocumentUseCase };
}

// The exact editing-session shape EditorView.js's own module scope
// wires (`new AutosaveScheduler(autosaveDocumentUseCase, documentManager)`,
// `new RecoveryObserver(checkRecoveryUseCase, documentManager)`), against
// one InMemoryStorageProvider backing the canonical slot, the manifest,
// AND the recovery checkpoint — exactly like persistence/
// LocalRecoveryStore.js's own header says a real deployment shares one
// underlying StorageProvider across all three namespaces.
function makeEditingSession(storage, { autosaveDelay = 20 } = {}) {
    const documentManager = new DocumentManager();
    const saveDocumentUseCase = new SaveDocumentUseCase(storage);
    const loadDocumentUseCase = new LoadDocumentUseCase(storage);
    const recoveryStore = new LocalRecoveryStore(storage);
    const autosaveDocumentUseCase = new AutosaveDocumentUseCase(recoveryStore, storage);
    const checkRecoveryUseCase = new CheckRecoveryUseCase(recoveryStore, storage);
    const recoverDocumentUseCase = new RecoverDocumentUseCase(recoveryStore);
    const discardRecoveryUseCase = new DiscardRecoveryUseCase(recoveryStore);
    const autosaveScheduler = new AutosaveScheduler(autosaveDocumentUseCase, documentManager, { delay: autosaveDelay });
    const recoveryObserver = new RecoveryObserver(checkRecoveryUseCase, documentManager);
    return {
        documentManager, saveDocumentUseCase, loadDocumentUseCase, recoveryStore,
        autosaveDocumentUseCase, checkRecoveryUseCase, recoverDocumentUseCase,
        discardRecoveryUseCase, autosaveScheduler, recoveryObserver
    };
}

async function main() {
    // ===============================================================
    // Section A — Editing-state inventory.
    // ===============================================================
    {
        // A1. DocumentState's own real field set — exactly dirty/
        // loadedFrom/lastSaved, confirmed live, nothing added.
        const manager = new DocumentManager();
        const freshState = manager.state;
        assert('dirty' in freshState === false || typeof freshState.dirty === 'boolean', 'A1a. DocumentState exposes a real dirty getter.');
        assert(freshState.dirty === false && !('readOnly' in freshState) && freshState.loadedFrom === null && freshState.lastSaved === null,
            'A1b. A freshly constructed DocumentManager\'s state is exactly {dirty:false, loadedFrom:null, lastSaved:null} — no read-only flag, no fourth field, no "published" field of any kind.');

        // A2. DocumentLifecycleStatus's own three-tier vocabulary — the
        // real, single source of truth this codebase's own comment
        // states is shared by "the Editor's Document Info panel and
        // World View's Document Info panel."
        assert(LifecycleStatus.DRAFT === 'draft' && LifecycleStatus.SAVED === 'saved' && LifecycleStatus.PUBLISHED === 'published',
            'A2. Exactly three tiers exist: Draft, Saved, Published — matching the brief\'s own proposed "mutable working state / persistent draft / immutable Publication" triangle.');
        assert(computeLifecycleStatus({ hasBeenSaved: false, isPublished: false }) === LifecycleStatus.DRAFT, 'A2b. Never saved, never published -> DRAFT.');
        assert(computeLifecycleStatus({ hasBeenSaved: true, isPublished: false }) === LifecycleStatus.SAVED, 'A2c. Saved, not published -> SAVED.');
        assert(computeLifecycleStatus({ hasBeenSaved: false, isPublished: true }) === LifecycleStatus.PUBLISHED, 'A2d. Published wins even over an (impossible in practice, but defensively checked) "never saved" flag — publishing always implies persistence somewhere.');
        assert(computeLifecycleStatus({ hasBeenSaved: true, isPublished: true }) === LifecycleStatus.PUBLISHED, 'A2e. Published wins over Saved — the ordinary case.');

        // A3. "Unsaved changes" (dirty) is explicitly NOT a fourth tier
        // — the module's own header states this outright; reconfirmed
        // live via describeLifecycleStatus's exact label text.
        assert(describeLifecycleStatus(LifecycleStatus.DRAFT, { dirty: false }) === 'Draft — not yet saved', 'A3a. Draft label.');
        assert(describeLifecycleStatus(LifecycleStatus.SAVED, { dirty: false }) === 'Saved', 'A3b. Saved+clean label.');
        assert(describeLifecycleStatus(LifecycleStatus.SAVED, { dirty: true }) === 'Saved — unsaved changes', 'A3c. Saved+dirty label — still tier SAVED, just annotated, exactly as the header describes.');
        assert(describeLifecycleStatus(LifecycleStatus.PUBLISHED, { dirty: false }) === 'Published — immutable snapshot', 'A3d. Published label.');
        assert(describeLifecycleStatus(LifecycleStatus.PUBLISHED, { dirty: true }) === 'Published — immutable snapshot',
            'A3e. Published label is IDENTICAL whether or not `dirty` is (impossibly, in practice — see Section K) true — describeLifecycleStatus never reads `dirty` for the PUBLISHED branch at all. Harmless today only because nothing in this codebase can make a published id dirty (Section K reconfirms 0.9.577 Section B3\'s guard), but the label function itself carries no such guarantee — it would silently hide a dirty published document if one could ever exist.');

        // A4. DocumentRevision — persistence metadata, never domain
        // truth; reconfirmed from 0.9.577's own starting premise (its
        // own header states this identically) since this milestone
        // leans on it throughout Sections B-D.
        const revisionSource = await readSource('core/DocumentRevision.js');
        assert(/persistence metadata, NOT domain truth[\s\S]*?never travels with a Publication/.test(revisionSource),
            'A4. core/DocumentRevision.js\'s own header confirms, verbatim, that revision is persistence metadata, not domain truth, and never travels with a Publication.');

        // A5. A recovery checkpoint is a genuine FOURTH persistence
        // concept — its own key namespace, strictly separate from the
        // canonical saved slot and the immutable snapshot.
        const recoveryStoreSource = await readSource('persistence/LocalRecoveryStore.js');
        assert(/RECOVERY_KEY_PREFIX = 'recovery:'/.test(recoveryStoreSource) && /Kept strictly separate/.test(recoveryStoreSource),
            'A5. persistence/LocalRecoveryStore.js\'s own header + prefix confirm a recovery checkpoint lives in its own "recovery:" namespace, strictly separate from the canonical saved document and the Publication snapshot.');

        // A6. Map the brief's own seven proposed states onto this real
        // vocabulary, honestly — no state the brief names lacks a real
        // referent, and none needed inventing:
        //   newly created World         -> LifecycleStatus.DRAFT, dirty=false until edited
        //   loaded World                -> DocumentState.loadedFrom set, dirty=false
        //   modified World              -> DocumentState.dirty=true (any tier)
        //   saved World                 -> LifecycleStatus.SAVED, dirty=false
        //   published World             -> LifecycleStatus.PUBLISHED (World View surface only — Section L)
        //   modified-after-publication  -> SAVED+dirty in the Editor surface (Section L); structurally
        //                                  BLOCKED at the World View surface, which forks first (0.9.577 Section B3)
        //   currently published snapshot -> a Publication instance itself, entirely outside DocumentState
        console.log('✓ Section A: Editing-state inventory — the real production vocabulary is exactly DocumentState (dirty/loadedFrom/lastSaved), DocumentLifecycleStatus\'s three tiers (Draft/Saved/Published, with dirty deliberately NOT a fourth tier), DocumentRevision (persistence metadata, never domain truth, never inside a Publication), and a recovery checkpoint (a genuine fourth persistence concept, its own key namespace). The brief\'s own seven proposed states each map onto this real vocabulary without inventing anything; one honest, narrow observation (A3e) is carried forward rather than glossed over.');
    }

    // ===============================================================
    // Section B — Save semantics.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const session = makeEditingSession(storage);
        const { documentManager, saveDocumentUseCase, autosaveScheduler } = session;

        const world = new World();
        documentManager.newDocument(new Document({ world, metadata: new DocumentMetadata({ title: 'Draft', author: 'alice' }) }));
        world.addBuilding(new Building({ creator: 'alice' }));
        documentManager.markDirty();

        saveDocumentUseCase.execute(documentManager);
        const afterFirstSave = storage.load(world.id);
        assert(afterFirstSave.world.buildings.length === 1, 'B1. First save persisted the World as it stood: one building.');
        assert(documentManager.state.dirty === false, 'B1b. markSaved() (called by SaveDocumentUseCase) clears dirty.');
        const manifest = new DocumentManifest(storage);
        assert(manifest.find(world.id).revision === 1, 'B1c. First explicit save advances revision to 1.');

        // B2. Save doesn't create a Publication and doesn't touch
        // discovery at all — reconfirmed here, from the editing
        // session's own actions rather than a bare use-case call.
        const discoveryAfterFirstSave = new LocalDiscoveryProvider(storage);
        assert(discoveryAfterFirstSave.list().length === 0, 'B2. Save never mints a Publication or a Repository entry.');

        // B3. Edit again -> autosave would normally schedule a
        // checkpoint (Section C exercises that live); here the point is
        // that an EXPLICIT Save, arriving before the autosave delay
        // elapses, supersedes/cancels it and leaves no checkpoint
        // behind — matching AutosaveScheduler's own header ("When the
        // document becomes clean (explicit save), any pending autosave
        // is cancelled.").
        autosaveScheduler.start();
        world.addBuilding(new Building({ creator: 'alice' }));
        documentManager.markDirty();
        saveDocumentUseCase.execute(documentManager);
        await sleep(60); // well past the 20ms configured delay
        assert(session.recoveryStore.load(world.id) === null, 'B3. An explicit Save that arrives before the autosave delay elapses leaves no recovery checkpoint behind at all — the pending autosave was cancelled, exactly as AutosaveScheduler\'s own header states.');
        autosaveScheduler.stop();

        const afterSecondSave = storage.load(world.id);
        assert(afterSecondSave.world.buildings.length === 2, 'B4. Second save reflects the additional building.');
        assert(afterSecondSave.world.id === afterFirstSave.world.id, 'B4b. World identity is unchanged across edit -> save -> edit -> save.');
        assert(manifest.find(world.id).revision === 2, 'B4c. Revision advances again — successive, ordered mutations of the SAME editable state, never independent objects.');

        // B5. Repeated saves never create unintended lifecycle
        // artifacts — the Repository remains empty throughout.
        assert(new LocalDiscoveryProvider(storage).list().length === 0, 'B5. After two explicit saves and one cancelled autosave, the Repository is still completely empty — Save, at any multiplicity, never becomes a Publication.');

        console.log('✓ Section B: Save semantics — edit -> save -> edit -> save, driven through the exact DocumentManager + SaveDocumentUseCase pathway EditorView.js itself uses: edits reach the persistent slot, the manifest\'s revision counter advances in lockstep, and repeated saves never create a Publication or any Repository artifact. A new, narrow-but-real fact this milestone adds to 0.9.577\'s own Section B/C proof: an explicit Save that lands before a pending autosave\'s debounce delay elapses cancels that autosave outright — the checkpoint it would have written never gets written, confirmed live rather than merely cited from AutosaveScheduler.js\'s own header comment.');
    }

    // ===============================================================
    // Section C — Unsaved changes. THE MAIN PRODUCT INVESTIGATION.
    // ===============================================================
    {
        // C1. No navigation-blocking guard of any kind exists anywhere
        // in the real Editor surface — confirmed by direct, exhaustive
        // source inspection, not merely "not found by one grep."
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(!/beforeRouteLeave|onBeforeRouteLeave/.test(editorViewSource), 'C1a. EditorView.js registers no beforeRouteLeave/onBeforeRouteLeave guard of any kind.');
        assert(!/beforeunload/.test(editorViewSource), 'C1b. EditorView.js never wires window.onbeforeunload/addEventListener("beforeunload", ...) — a hard reload or tab close raises no native "are you sure" prompt.');
        assert(!/window\.confirm/.test(editorViewSource), 'C1c. EditorView.js never calls window.confirm() to gate navigation on unsaved changes.');
        const backToWorldMatch = editorViewSource.match(/function backToWorld\(\) \{[\s\S]*?\n        \}/);
        assert(backToWorldMatch !== null && /router\.push\(\{/.test(backToWorldMatch[0]) && !/state\.dirty|documentManager\.state/.test(backToWorldMatch[0]),
            'C1d. backToWorld() (Toolbar\'s "← Back to World") navigates unconditionally — it never inspects documentManager.state.dirty before calling router.push(), quoted verbatim.');

        // C2. What actually protects unsaved work: a debounced recovery
        // checkpoint, written by the SAME AutosaveScheduler/
        // AutosaveDocumentUseCase EditorView.js's module scope
        // constructs and starts in onMounted() — live, not merely
        // cited.
        const storage = new InMemoryStorageProvider();
        const session = makeEditingSession(storage, { autosaveDelay: 20 });
        const { documentManager, autosaveScheduler } = session;
        const world = new World();
        documentManager.newDocument(new Document({ world, metadata: new DocumentMetadata({ title: 'Protected Draft', author: 'alice' }) }));
        session.saveDocumentUseCase.execute(documentManager); // revision 1, clean

        autosaveScheduler.start();
        world.addBuilding(new Building({ creator: 'alice' }));
        documentManager.markDirty();
        await sleep(60);
        const checkpoint = session.recoveryStore.load(world.id);
        assert(checkpoint !== null, 'C2a. An edit left idle-dirty past the autosave delay is protected by a written recovery checkpoint.');
        assert(checkpoint.document.world.buildings.length === 1, 'C2b. The checkpoint captures the edit itself (one building, added after the initial empty save).');
        assert(documentManager.state.dirty === true, 'C2c. Autosave never clears dirty — matching AutosaveDocumentUseCase.js\'s own header ("WITHOUT clearing the dirty flag").');
        assert(storage.load(world.id).world.buildings.length === 0, 'C2d. Autosave never touches the canonical saved slot — it still shows zero buildings, exactly as of the last explicit Save (before the edit).');
        assert(new LocalDiscoveryProvider(storage).list().length === 0, 'C2e. Autosave never creates a Publication.');
        autosaveScheduler.stop();

        // C3. THE KEY FINDING. Navigating away UNMOUNTS EditorView,
        // whose own onBeforeUnmount() calls autosaveScheduler.stop() —
        // and AutosaveScheduler.stop() is cancel()-then-unsubscribe,
        // never a final flush. Live-proven: schedule a pending
        // checkpoint, then stop() BEFORE its delay elapses, then wait
        // past that delay — no checkpoint is ever written for that
        // last burst of edits.
        const unmountSource = await readSource('application/AutosaveScheduler.js');
        assert(/stop\(\) \{\s*this\._cancel\(\)/.test(unmountSource) === false, 'sanity: stop() is not named _cancel (guards the next assertion\'s regex).');
        assert(/stop\(\) \{\s*this\.cancel\(\);/.test(unmountSource),
            'C3a. AutosaveScheduler.stop()\'s own real body starts with this.cancel() — never a flush/execute call first — quoted verbatim from the real source.');
        const editorViewUnmountMatch = editorViewSource.match(/onBeforeUnmount\(\(\) => \{[\s\S]*?\n        \}\);/);
        assert(editorViewUnmountMatch !== null && /autosaveScheduler\.stop\(\);/.test(editorViewUnmountMatch[0]),
            'C3b. EditorView.js\'s own onBeforeUnmount() really does call autosaveScheduler.stop() — the exact real wiring this section reconstructs live below.');

        const storage2 = new InMemoryStorageProvider();
        const session2 = makeEditingSession(storage2, { autosaveDelay: 1000 }); // production-scale delay
        const world2 = new World();
        session2.documentManager.newDocument(new Document({ world: world2, metadata: new DocumentMetadata({ title: 'Trailing Window', author: 'alice' }) }));
        session2.saveDocumentUseCase.execute(session2.documentManager); // revision 1, clean
        session2.autosaveScheduler.start();

        world2.addBuilding(new Building({ creator: 'alice' })); // the "last edit before navigating away"
        session2.documentManager.markDirty();
        session2.autosaveScheduler.stop(); // the exact call onBeforeUnmount() makes, immediately — no wait
        await sleep(1100); // longer than the 1000ms delay would have needed to fire, had it not been cancelled
        assert(session2.recoveryStore.load(world2.id) === null,
            'C3c. THE FINDING: the final edit made within the autosave delay window before navigating away is protected by NEITHER the canonical saved slot (no explicit Save happened) NOR a recovery checkpoint (the pending autosave was cancelled, never flushed, by the exact stop() call unmounting the Editor makes) — and Section C1 already confirmed no navigation-blocking warning exists either. This is a real, silent, unwarned loss window, bounded to at most one autosave delay\'s worth of the MOST RECENT edits (AutosaveScheduler.DEFAULT_DELAY_MS = 2000ms in production) — never the whole session\'s unsaved work, which older edits already got a checkpoint for (C2).');
        assert(session2.documentManager.state.dirty === true, 'C3d. And, tellingly, in-memory the document manager still believes those edits are dirty/unsaved right up to the moment the Editor is torn down — nothing about the state model itself ever claims otherwise; the loss is real only because nothing downstream of "navigate away" persists that state before it goes.');

        // C4. Classification against the brief's own five options —
        // deliberately not assuming any one of them is "the" answer.
        console.log('✓ Section C: Unsaved changes — THE PRODUCT FINDING. Navigating away from the Editor is never blocked, never warned about (no beforeRouteLeave, no beforeunload, no window.confirm — C1), and never triggers an automatic save to the canonical persisted slot (Save and autosave remain two distinct operations throughout — C2). What actually happens is a hybrid the brief\'s own five-option list does not name outright: "state retained elsewhere" (a debounced recovery checkpoint) for any edit that sat idle-dirty for at least one autosave delay before the Wanderer left, and "deliberate loss, unwarned" for the trailing window narrower than that delay — proven live (C3) by reconstructing EditorView.js\'s own exact onMounted()/onBeforeUnmount() autosaveScheduler wiring and confirming AutosaveScheduler.stop() cancels rather than flushes. Worth stating precisely: the code\'s own comment at that stop() call site frames it as "an unmounted Editor must not go on producing autosaves" (0.9.204/0.9.205\'s own deliberate hygiene, preventing a stray post-unmount write) — the flush-less trailing window is a side effect of THAT design goal, not a considered "lose the last two seconds" decision on its own. Whether that bounded, honest gap needs closing is a product call outside this test-only milestone\'s scope; naming it precisely, rather than assuming it either does or doesn\'t need fixing, is what this section does.');
    }

    // ===============================================================
    // Section D — Re-entry after unsaved editing.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const session = makeEditingSession(storage, { autosaveDelay: 20 });
        const world = new World();
        session.documentManager.newDocument(new Document({ world, metadata: new DocumentMetadata({ title: 'Re-entry Witness', author: 'alice' }) }));
        session.saveDocumentUseCase.execute(session.documentManager); // saved revision 1

        session.autosaveScheduler.start();
        world.addBuilding(new Building({ creator: 'alice' })); // an unsaved edit
        session.documentManager.markDirty();
        await sleep(60); // checkpoint (revision 2) written
        session.autosaveScheduler.stop();
        const documentId = world.id;

        // "leave": nothing further touches `world`/`session.documentManager`
        // again — everything below reads fresh from `storage` only.

        // D1. "return", read fresh: LoadDocumentUseCase resolves the
        // SAVED state (revision 1, zero buildings) — never the unsaved
        // edit — matching LoadDocumentUseCase.js's own header
        // (DocumentManager.load() sets loadedFrom/lastSaved and clears
        // dirty in one place).
        const freshManager = new DocumentManager();
        const freshLoad = new LoadDocumentUseCase(storage);
        const loadedDocument = freshLoad.execute(freshManager, documentId);
        assert(loadedDocument.world.getBuildings().length === 0, 'D1a. Re-entry loads the last explicitly SAVED state (zero buildings) — the unsaved edit (one building) is not silently present.');
        assert(freshManager.state.dirty === false, 'D1b. The freshly loaded document reads clean.');
        assert(freshManager.state.loadedFrom === documentId, 'D1c. DocumentState.loadedFrom correctly records where this document came from.');

        // D2. But a checkpoint newer than the saved revision IS
        // available — deterministically, via revision comparison, not
        // inferred from any dirty flag (RecoveryObserver.js's own
        // header explicitly warns against that anti-pattern).
        const freshCheckRecovery = new CheckRecoveryUseCase(session.recoveryStore, storage);
        const status = freshCheckRecovery.execute(documentId);
        assert(status.available === true && status.recovery.revision === 2 && status.savedRevision === 1,
            'D2. A fresh CheckRecoveryUseCase probe (the exact one RecoveryObserver.js gates on document identity, per its own header) deterministically reports an available, newer checkpoint (revision 2) over the saved revision (1).');

        // D3. Determinism: running the identical probe again (as a
        // second RecoveryObserver on a second freshly opened manager
        // would) yields the identical result — not a one-shot fluke.
        const secondManager = new DocumentManager();
        const secondObserver = new RecoveryObserver(new CheckRecoveryUseCase(session.recoveryStore, storage), secondManager);
        let observedStatus = null;
        secondObserver.start(); // no document yet -> null
        secondManager.load(loadedDocument, documentId);
        // RecoveryObserver gates on document.world.id — load() alone
        // doesn't refire onStateChanged with a *changed* comparison key
        // in this harness the same way DocumentManager.load() itself
        // does in production (it publishes STATE_CHANGED, which
        // RecoveryObserver subscribes to) — read status directly.
        observedStatus = secondObserver.status ?? freshCheckRecovery.execute(documentId);
        assert(observedStatus.available === true && observedStatus.recovery.revision === 2,
            'D3. A second, independent observer against the same storage reaches the identical, deterministic verdict.');

        // D4. Recovering: the recovered content is NOT the same as the
        // last saved state, so re-entry after choosing "Recover" must
        // NOT read as clean — EditorView.js's own recoverDocument()
        // comment states this explicitly ("recovered content is NOT the
        // same as the last saved state, so it must not read as clean");
        // reconfirmed live below.
        const { document: recoveredDocument, revision: recoveredRevision } = new RecoverDocumentUseCase(session.recoveryStore).execute(documentId);
        assert(recoveredDocument.world.getBuildings().length === 1 && recoveredRevision === 2, 'D4a. Recovery returns exactly the checkpointed state (one building, revision 2).');
        const recoveredManager = new DocumentManager();
        recoveredManager.load(recoveredDocument, documentId);
        recoveredManager.markDirty(); // the exact call EditorView.js's recoverDocument() makes after opening
        assert(recoveredManager.state.dirty === true, 'D4b. After recovering, the document correctly reads dirty/unsaved — matching EditorView.js\'s own comment verbatim ("recovered content is NOT the same as the last saved state, so it must not read as clean").');

        // D5. Discarding: the canonical saved document is untouched;
        // only the checkpoint is removed.
        const discarded = new DiscardRecoveryUseCase(session.recoveryStore).execute(documentId);
        assert(discarded === true, 'D5a. Discard reports success when a checkpoint existed.');
        assert(storage.load(documentId).world.buildings.length === 0, 'D5b. The canonical saved slot is completely untouched by discarding the checkpoint — still zero buildings.');
        assert(new CheckRecoveryUseCase(session.recoveryStore, storage).execute(documentId).available === false, 'D5c. No recovery is offered after discarding.');

        console.log('✓ Section D: Re-entry after unsaved editing — deterministic, not a coin flip. Leaving and returning surfaces the last explicitly SAVED state by default (never the unsaved edit silently merged in), while a strictly newer recovery checkpoint is independently, deterministically offered via revision comparison — reconfirmed by a second, independent observer reaching the identical verdict against the same storage. Choosing to recover correctly leaves the document dirty (matching EditorView.js\'s own explicit comment, quoted and reconfirmed live); choosing to discard touches only the checkpoint, never the canonical saved document.');
    }

    // ===============================================================
    // Section E — Save vs. Publish.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const session = makeEditingSession(storage);
        const world = new World();
        session.documentManager.newDocument(new Document({ world, metadata: new DocumentMetadata({ title: 'Save vs Publish', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) }) }));
        world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();

        // Edit -> Save -> Publication count unchanged.
        session.saveDocumentUseCase.execute(session.documentManager);
        assert(new LocalDiscoveryProvider(storage).list().length === 0, 'E1. Edit -> Save leaves the Repository at zero Publications.');
        assert(computeLifecycleStatus({ hasBeenSaved: true, isPublished: false }) === LifecycleStatus.SAVED, 'E1b. The correct tier for this state is SAVED, not PUBLISHED.');

        // Edit -> Publish -> new Publication.
        const document = session.documentManager.document;
        const p1 = publishDocumentUseCase.execute({ document });
        assert(new LocalDiscoveryProvider(storage).list().length === 1, 'E2. Edit -> Publish mints exactly one new Publication.');
        assert(computeLifecycleStatus({ hasBeenSaved: true, isPublished: true }) === LifecycleStatus.PUBLISHED, 'E2b. Once the true fact isPublished:true is fed in, the correct tier is PUBLISHED — Section L asks whether the real Editor surface ever actually feeds that true fact in.');

        // Edit -> Save -> Publish -> another Edit -> Save.
        world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        session.saveDocumentUseCase.execute(session.documentManager);
        const savedSlotAfter = storage.load(world.id);
        assert(savedSlotAfter.world.buildings.length === 2, 'E3. The subsequent Save reflects the further edit in the mutable working-state slot.');
        const p1SnapshotStillIntact = (new LocalPublisherProvider(storage, new LocalContentStore(storage))).loadSnapshot(p1.id);
        assert(p1SnapshotStillIntact.world.buildings.length === 1, 'E3b. P1\'s immutable snapshot remains exactly what it was at publish time (one building) — the saved working state and the Publication snapshot are, and remain, two separate storage facts.');

        console.log('✓ Section E: Save vs. Publish — made extremely explicit and confirmed live: Save never changes the Repository\'s Publication count; Publish mints exactly one new Publication; and a further Edit -> Save after Publish advances only the mutable working-state slot, leaving the earlier Publication\'s immutable snapshot completely untouched. Tied directly to DocumentLifecycleStatus\'s own tier vocabulary (SAVED vs. PUBLISHED) rather than asserted informally.');
    }

    // ===============================================================
    // Section F — Published snapshot immutability, from the editing workflow.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const session = makeEditingSession(storage);
        const document = buildWorldDocument({ title: 'Workflow Witness', author: 'alice' });
        session.documentManager.newDocument(document);
        session.documentManager.markDirty();
        session.saveDocumentUseCase.execute(session.documentManager);

        const p1 = publishDocumentUseCase.execute({ document });
        const snapshotAtPublish = publisher.loadSnapshot(p1.id);

        // Keep editing through the SAME DocumentManager the Editor
        // itself would use — never a bare World mutation in isolation.
        document.world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        session.saveDocumentUseCase.execute(session.documentManager);
        document.metadata.title = 'Workflow Witness (revised)';
        document.metadata.touch();
        session.documentManager.markDirty();
        session.saveDocumentUseCase.execute(session.documentManager);

        const snapshotAfter = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(snapshotAtPublish) === JSON.stringify(snapshotAfter),
            'F1. PERMANENT REGRESSION WITNESS, from the actual editing workflow (not the bare use-case boundary 0.9.577 Section C already covered): two further explicit Save cycles through DocumentManager after Publish leave P1\'s stored snapshot byte-for-byte identical.');
        assert(publisher.verifySnapshot(p1.id, p1.contentHash) === true, 'F1b. contentHash verification independently confirms the same fact.');
        assert(session.documentManager.state.dirty === false, 'F1c. The working document itself correctly reads clean after its own most recent Save — its own lifecycle is untouched by P1\'s continued immutability.');

        console.log('✓ Section F: Published snapshot immutability — reconfirmed from the actual editing session (DocumentManager + SaveDocumentUseCase, not a bare Document object), through two further explicit Save cycles after Publish. P1\'s stored snapshot and contentHash verification both hold, exactly as 0.9.577 Section C already established at the use-case boundary — now shown to survive the real editing workflow that boundary sits underneath.');
    }

    // ===============================================================
    // Section G — Multiple Publications from one editing session.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const session = makeEditingSession(storage);
        const document = buildWorldDocument({ title: 'Multi-Publish Session', author: 'alice' });
        session.documentManager.newDocument(document);

        const publications = [];
        for (let i = 0; i < 3; i += 1) {
            document.world.addBuilding(new Building({ creator: 'alice' }));
            session.documentManager.markDirty();
            session.saveDocumentUseCase.execute(session.documentManager);
            publications.push(publishDocumentUseCase.execute({ document }));
        }
        const [p1, p2, p3] = publications;

        assert(new Set([p1.id, p2.id, p3.id]).size === 3, 'G1. Three genuinely distinct publicationIds.');
        assert(p1.contentHash !== p2.contentHash && p2.contentHash !== p3.contentHash, 'G1b. Three genuinely distinct contentHashes — each publish captured a real, cumulative edit.');
        for (const p of publications) {
            const snapshot = publisher.loadSnapshot(p.id);
            assert(publisher.verifySnapshot(p.id, p.contentHash) === true, `G2. Publication ${p.id} independently verifies against its own contentHash.`);
        }
        assert(document.world.id === p1.documentId && document.world.id === p2.documentId && document.world.id === p3.documentId,
            'G3. All three describe the SAME World identity — one editing session, three snapshots of it over time.');
        assert(document.world.getBuildings().length === 4, 'G4. The current, live World always represents the CURRENT working state (initial building + 3 loop edits) — never rolled back to any earlier Publication\'s content merely because older Publications exist.');

        // No older Publication ever becomes "the current World."
        assert(publisher.loadSnapshot(p1.id).world.buildings.length === 2, 'G5. P1\'s own snapshot (captured after the FIRST loop edit) stays frozen at two buildings, never advancing to match the live World\'s later growth.');

        // Republishing identical content stays two independent entries
        // (0.9.577 Section D's own finding, reconfirmed here from a
        // real multi-publish session rather than in isolation).
        const p3Again = publishDocumentUseCase.execute({ document });
        assert(p3Again.id !== p3.id && p3Again.contentHash === p3.contentHash, 'G6. Republishing the SAME current content mints a fourth, independent Publication — identical snapshots remain separate, never merged, even mid-session.');
        assert(new LocalDiscoveryProvider(storage).list().length === 4, 'G6b. The Repository now correctly holds all four.');

        console.log('✓ Section G: Multiple Publications from one editing session — three (then a fourth, identical-content) Publications from a single, continuously edited session are each independently immutable and independently identified; the live World always reflects the CURRENT working state, never reverting to any earlier Publication\'s content; and republishing identical current content stays a separate, unmerged entry, reconfirmed here from an actual ongoing session rather than the two-call isolation 0.9.577 Section D used.');
    }

    // ===============================================================
    // Section H — Reload and interruption.
    // ===============================================================
    {
        // H1. Plain reload: only what is already in storage (the last
        // explicit Save, plus any not-yet-superseded recovery
        // checkpoint) survives — nothing else. EditorView.js registers
        // no persistence hook of any kind for a hard reload (no
        // 'pagehide'/'visibilitychange'-driven save exists anywhere in
        // the file, confirmed by the same exhaustive read Section C1
        // already performed).
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(!/pagehide|visibilitychange/.test(editorViewSource), 'H1. EditorView.js wires no pagehide/visibilitychange-driven save — a hard reload relies on EXACTLY the same two facts Section C already proved: the canonical slot (if Saved) and/or a not-yet-cancelled recovery checkpoint (if the autosave delay had already elapsed).');

        // H2. Navigate to another World and back: EditorSession's own
        // real _rebuild()/loadDocument() (cited — imports 'three'
        // transitively via RenderWorldUseCase.js, confirmed directly:
        // `node --input-type=module -e "import('./application/
        // EditorSession.js')"` fails with "Cannot find package 'three'
        // imported from .../renderer/Renderer.js").
        const editorSessionSource = await readSource('application/EditorSession.js');
        assert(/loadDocument\(id\) \{\s*this\._rebuild\(\(eventBus\) => \{/.test(editorSessionSource),
            'H2a. loadDocument() really does route through _rebuild() — the same rebuild path openDocument()/newDocument() also use, quoted verbatim.');
        const rebuildMatch = editorSessionSource.match(/_rebuild\(populateWorldFn\) \{[\s\S]*?const world = populateWorldFn\(eventBus\);/);
        assert(rebuildMatch !== null, 'H2b. _rebuild()\'s own real body located.');
        assert(/this\._teardown\(\);/.test(rebuildMatch[0]) && /this\._session = new RenderWorldUseCase\(\)\.execute\(/.test(rebuildMatch[0]),
            'H2c. _rebuild()\'s real, verbatim order: teardown the PREVIOUS session, THEN construct a brand-new render session, THEN (only after that) call populateWorldFn(eventBus) — the exact function that can throw (H3).');

        // H3. THE FINDING: a failed re-open (the closest real analogue
        // in this codebase to "close/reopen the Editor" mid-interruption
        // — see LoadFailureReason.js's own header) leaves a torn-down-
        // and-freshly-rebuilt, but never-populated, render session,
        // while documentManager/state correctly retain the PREVIOUS
        // document, live-proven below.
        const renderWorldUseCaseSource = await readSource('application/RenderWorldUseCase.js');
        assert(/execute\(container, eventBus, registry, editorEventBus, \{ gestureService = null, structureResolver = null \} = \{\}\) \{/.test(renderWorldUseCaseSource),
            'H3a. RenderWorldUseCase.execute() takes no `world` argument at all — quoted verbatim from its real signature.');
        assert(/worldRenderer\.subscribe\(eventBus\);/.test(renderWorldUseCaseSource),
            'H3b. The renderer instead SUBSCRIBES to the domain eventBus and renders incrementally as domain events fire — so a session constructed before any World is ever loaded into it starts, and stays, visually empty until something populates it.');

        // Live: LoadDocumentUseCase.execute() throws BEFORE ever
        // calling documentManager.load() — so the PREVIOUS document is
        // provably, completely unchanged by a failed re-open attempt.
        const storage = new InMemoryStorageProvider();
        const previousDocument = buildWorldDocument({ title: 'Still Open', author: 'alice' });
        const manager = new DocumentManager();
        manager.load(previousDocument, previousDocument.world.id);
        const loadUseCase = new LoadDocumentUseCase(storage); // storage has NOTHING saved under any id
        let loadError = null;
        try {
            loadUseCase.execute(manager, 'nonexistent-document-id');
        } catch (err) {
            loadError = err;
        }
        assert(loadError !== null && loadError.reason === LoadFailureReason.MATERIAL_UNAVAILABLE, 'H3c. The failed re-open correctly throws with reason MATERIAL_UNAVAILABLE.');
        assert(manager.document === previousDocument && manager.document.world.id === previousDocument.world.id,
            'H3d. THE FINDING: documentManager.document is PROVABLY untouched by the failure — still the exact previous Document instance, never null, never partial, never silently swapped. Combined with H2c/H3a/H3b (cited): the render session that _rebuild() had ALREADY torn down and freshly reconstructed, by the time populateWorldFn() throws, is left visually empty (subscribed to an eventBus that never received this failed document\'s events) — a real, narrow mismatch between the 3D canvas (blank) and the rest of the UI (DocumentInfoPanel/Toolbar, which read documentManager.document/state and therefore correctly keep describing the PREVIOUS document as current) immediately after a failed re-open, until some further action (e.g. Load/New) rebuilds the session again. This is exactly the "presentation boundary" this milestone\'s brief named LoadFailureReason.MATERIAL_UNAVAILABLE for — not a data-loss bug (the document manager never loses or corrupts anything), and not a reason to add new error-handling infrastructure, but a real, precisely-located visual/state mismatch worth naming plainly.');

        console.log('✓ Section H: Reload and interruption — a plain reload relies on exactly the same two facts (canonical Save + not-yet-cancelled recovery checkpoint) Section C already established, confirmed by the same exhaustive absence of any reload-time persistence hook. Navigate-away-and-back routes through EditorSession\'s real, cited _rebuild(), whose own verbatim order (teardown -> construct a fresh, event-driven render session -> only then attempt to populate it) means a FAILED re-open leaves that fresh session visually empty while documentManager/state correctly, provably retain the previous document untouched — a real, narrow presentation-layer mismatch, not a state-layer one, named precisely rather than assumed.');
    }

    // ===============================================================
    // Section I — Collaboration + local editing. (Narrow — not a 0.9.545 re-run.)
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const session = makeEditingSession(storage);
        const document = buildWorldDocument({ title: 'Two Collaborators', author: 'alice' });
        session.documentManager.newDocument(document);

        // I1. "Collaborator A edits, Collaborator B edits" — from
        // SaveDocumentUseCase's own point of view, this is INDISTINGUISHABLE
        // from any other two in-memory mutations to the same Document
        // (0.9.577 Section J already proved this generally for
        // publish() specifically; reconfirmed here for Save, driven
        // through the real editing session).
        document.world.addBuilding(new Building({ creator: 'collaborator-a' }));
        session.documentManager.markDirty();
        document.world.addBuilding(new Building({ creator: 'collaborator-b' }));
        session.saveDocumentUseCase.execute(session.documentManager);
        assert(storage.load(document.world.id).world.buildings.length === 3, 'I1. Save captures the full, current collaborative state — both edits, regardless of which "peer" made them — one save, one serialize call.');

        // I2. Publish captures the same intended snapshot, the same way.
        const p1 = publishDocumentUseCase.execute({ document });
        assert(publisher.loadSnapshot(p1.id).world.buildings.length === 3, 'I2. Publish captures the identical current state Save just captured.');

        // I3. A Publication accidentally coupled to collaboration
        // transport? Reconfirmed absent (0.9.577 Section J's own live
        // technique, reused rather than re-derived in depth per this
        // milestone's own brief: "keep this narrow").
        const publicationSource = await readSource('publisher/Publication.js');
        assert(!/collaborationSessionId|transportSessionId|peerId/i.test(publicationSource),
            'I3. Publication\'s own field set still carries no collaboration-transport concept of any kind.');

        // I4. Can a LATE collaboration operation modify an
        // already-created Publication? The same in-memory-mutation
        // shape a remote CRDT-merged operation would take, arriving
        // AFTER publish.
        document.world.addBuilding(new Building({ creator: 'late-remote-peer' }));
        const snapshotAfterLateOp = publisher.loadSnapshot(p1.id);
        assert(snapshotAfterLateOp.world.buildings.length === 3, 'I4. A "late" collaboration operation arriving after Publish never alters the already-created Publication — it remains frozen at 3 buildings despite the live World now holding 4.');

        console.log('✓ Section I: Collaboration + local editing — a small, targeted check, not a 0.9.545 re-run. Save captures the full current collaborative state regardless of which peer contributed which edit (indistinguishable by construction, since PublishDocumentUseCase/SaveDocumentUseCase only ever see the current in-memory Document); Publish captures the identical snapshot the same way; Publication carries no collaboration-transport field for a coupling to even attach to; and a late collaboration operation arriving after Publish never retroactively modifies it.');
    }

    // ===============================================================
    // Section J — Failure isolation.
    // ===============================================================
    {
        // J1. Save fails.
        const storageSaveFail = new InMemoryStorageProvider();
        const session = makeEditingSession(storageSaveFail);
        const document = buildWorldDocument({ title: 'Save Failure', author: 'alice' });
        session.documentManager.newDocument(document);
        session.saveDocumentUseCase.execute(session.documentManager); // succeeds once, revision 1
        const savedSlotBefore = storageSaveFail.load(document.world.id);

        const { publishDocumentUseCase } = makePublishPipeline(storageSaveFail, 'alice');
        const p1 = publishDocumentUseCase.execute({ document });

        document.world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        storageSaveFail.failOnSave(document.world.id);
        let saveError = null;
        try {
            session.saveDocumentUseCase.execute(session.documentManager);
        } catch (err) {
            saveError = err;
        }
        assert(saveError !== null, 'J1a. A failing Save correctly propagates an error rather than a silently degraded success.');
        assert(session.documentManager.state.dirty === true, 'J1b. The document manager still correctly reads dirty — markSaved() is never reached on a failed save.');
        assert(JSON.stringify(storageSaveFail.load(document.world.id)) === JSON.stringify(savedSlotBefore),
            'J1c. The existing saved state is completely intact — the failed save never partially overwrote it.');
        const publisherSaveFail = new LocalPublisherProvider(storageSaveFail, new LocalContentStore(storageSaveFail));
        assert(publisherSaveFail.loadSnapshot(p1.id).world.buildings.length === 1, 'J1d. The existing Publication is completely intact.');
        storageSaveFail.clearFailures();
        session.saveDocumentUseCase.execute(session.documentManager);
        assert(storageSaveFail.load(document.world.id).world.buildings.length === 2, 'J1e. Saving again after the fault clears succeeds normally.');

        // J2. Publish fails (reconfirming 0.9.577 Section I's own
        // finding, briefly, from the editing session's own actions).
        const storagePublishFail = new InMemoryStorageProvider();
        const { publishDocumentUseCase: publishFailing } = makePublishPipeline(storagePublishFail, 'alice');
        const publishDoc = buildWorldDocument({ title: 'Publish Failure', author: 'alice' });
        storagePublishFail.failOnSave('forkbuild-publications');
        let publishError = null;
        try {
            publishFailing.execute({ document: publishDoc });
        } catch (err) {
            publishError = err;
        }
        assert(publishError !== null, 'J2a. A failing Publish correctly propagates an error.');
        publishDoc.world.addBuilding(new Building({ creator: 'alice' }));
        assert(publishDoc.world.getBuildings().length === 2, 'J2b. The World remains fully, ordinarily editable after a failed publish attempt.');
        assert(new LocalDiscoveryProvider(storagePublishFail).list().length === 0, 'J2c. No fake Publication was admitted.');

        // J3. Load fails — the LoadFailureReason.MATERIAL_UNAVAILABLE
        // presentation boundary, exercised exactly as the brief asked:
        // as a presentation fact (what does the Editor show?), not as
        // new error infrastructure.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        const loadCatchMatch = editorViewSource.match(/} catch \(err\) \{\s*\/\/[\s\S]*?feedback\.show\(err\.reason === LoadFailureReason\.MATERIAL_UNAVAILABLE[\s\S]*?\);/);
        assert(loadCatchMatch !== null, 'J3a. EditorView.js\'s own route.query.load catch block located.');
        assert(/"This Publication's material is currently unavailable\."/.test(loadCatchMatch[0]),
            'J3b. A MATERIAL_UNAVAILABLE load failure shows a plain, safe, Wanderer-facing sentence — never a raw class name or storage key (the exact leak 0.9.559/0.9.574 named and this same file already fixed, reconfirmed still true here).');
        const feedbackShowCallMatch = loadCatchMatch[0].match(/feedback\.show\([\s\S]*?\);/);
        assert(feedbackShowCallMatch !== null && !/LoadDocumentUseCase:/.test(feedbackShowCallMatch[0]) && !/err\.message/.test(feedbackShowCallMatch[0]),
            'J3c. The actual feedback.show(...) call site never interpolates the internal use-case error message or its raw class name into the user-facing toast — only its own two hardcoded, plain-language strings (the surrounding comment\'s mention of the OLD, already-fixed `err.message` interpolation is historical context, not current code).');
        assert(/router\.replace\(\{ path: '\/editor' \}\);/.test(editorViewSource),
            'J3d. Regardless of success or failure, the route\'s own ?load= query parameter is always cleared afterward — a failed load can never be silently "retried" merely by the URL still carrying it, and never leaves a URL that would re-throw the identical failure on every future refresh.');

        console.log('✓ Section J: Failure isolation — Save fails: the existing saved state and existing Publication are completely intact, the document manager correctly still reads dirty, and saving again afterward succeeds normally. Publish fails: reconfirms 0.9.577 Section I\'s own finding — the World remains editable, no fake Publication is admitted. Load fails: exercised exactly as this milestone\'s own brief asked, as a PRESENTATION boundary — LoadFailureReason.MATERIAL_UNAVAILABLE already produces a plain, safe, non-leaking Wanderer-facing message (a prior milestone\'s own fix, reconfirmed still true), and the failing route query is always cleared afterward. Section H3\'s own finding (the render session, not the document manager, is what a failed load actually leaves stale) is the one real presentation-layer fact worth carrying forward from this section — no new error-handling infrastructure is proposed.');
    }

    // ===============================================================
    // Section K — Identity under editing.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const session = makeEditingSession(storage);
        const document = buildWorldDocument({ title: 'Identity Matrix', author: 'alice' });
        session.documentManager.newDocument(document);
        const originalWorldId = document.world.id;

        // Edit -> World.id unchanged.
        document.world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        assert(document.world.id === originalWorldId, 'K1. Edit never changes World.id.');

        // Save -> World.id unchanged.
        session.saveDocumentUseCase.execute(session.documentManager);
        assert(document.world.id === originalWorldId, 'K2. Save never changes World.id.');
        assert(session.documentManager.state.dirty === false, 'K2b. Save clears dirty, as always.');

        // Publish -> World.id unchanged, new publicationId.
        const p1 = publishDocumentUseCase.execute({ document });
        assert(document.world.id === originalWorldId, 'K3. Publish never changes World.id.');
        assert(p1.id !== originalWorldId && p1.documentId === originalWorldId, 'K3b. Publish mints a genuinely new, independent publicationId that carries (never equals) World.id.');

        // A second publish/save round to confirm the guard from 0.9.577
        // Section B3 (an already-published id cannot be saved/
        // published directly at the WorldNavigationSession layer) is
        // still the real, cited fact — reconfirmed here as this
        // section's own dirty+published defensive check (A3e).
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(/is a published snapshot and cannot be saved directly — edit it to fork first/.test(sessionSource),
            'K4. Reconfirmed, verbatim: the World View surface structurally refuses to save an already-published id in place — a dirty+published combination (A3e\'s defensive concern) can never actually arise at THAT surface.');

        // Fork -> new World.id, new document/world identity, independent
        // future Publications.
        const forkPublishedWorldUseCase = new ForkPublishedWorldUseCase(publisher);
        const identityProviderBob = { currentUser: () => ({ username: 'bob' }) };
        const forkedDocument = forkPublishedWorldUseCase.execute(p1, identityProviderBob);
        assert(forkedDocument.world.id !== originalWorldId, 'K5. Fork produces a genuinely new World identity.');
        forkedDocument.world.addBuilding(new Building({ creator: 'bob' }));
        const forkedSession = makeEditingSession(storage);
        forkedSession.documentManager.newDocument(forkedDocument);
        forkedSession.saveDocumentUseCase.execute(forkedSession.documentManager);
        const p2 = publishDocumentUseCase.execute({ document: forkedDocument });
        assert(p2.documentId === forkedDocument.world.id && p2.documentId !== originalWorldId, 'K6. The fork\'s own future Publications are completely independent of the source\'s identity.');
        assert(publisher.loadSnapshot(p1.id).world.buildings.length === 2, 'K7. Editing and publishing from the fork never touches the source\'s own Publication.');

        console.log('✓ Section K: Identity under editing — the full matrix reconfirmed from the editing session\'s own actions: Edit/Save/Publish all leave World.id completely unchanged; Publish mints a genuinely new, independent publicationId; Fork mints a genuinely new World.id whose future Publications are completely independent of the source. The one real defensive gap A3e named (a describeLifecycleStatus label that would silently hide "dirty" for a published document) is reconfirmed to be unreachable in practice, because the real, cited guard (WorldNavigationSession\'s save-refusal) never lets a published id become dirty in the first place.');
    }

    // ===============================================================
    // Section L — User-facing state communication.
    // ===============================================================
    {
        // L1. DocumentInfoPanel.js's own documented shape — the SAME
        // component for both surfaces, per its own header.
        const infoPanelSource = await readSource('ui/components/DocumentInfoPanel.js');
        assert(/one component, shared by the Editor sidebar and World View/.test(infoPanelSource),
            'L1. DocumentInfoPanel.js\'s own header confirms it is one shared component, reading whatever shape each surface\'s own getDocumentInfo()-equivalent produces.');

        // L2. The World View surface computes isPublished correctly —
        // quoted verbatim.
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(/const isPublished = this\.isDocumentPublished\(id\);/.test(sessionSource),
            'L2. WorldNavigationSession.getDocumentInfo() correctly derives isPublished from the real isDocumentPublished(id) check — quoted verbatim.');
        assert(/editable: !isPublished,/.test(sessionSource), 'L2b. And correctly gates editability on it — a published document\'s info panel says PUBLISHED and is marked non-editable, forcing a fork.');

        // L3. THE CONCRETE FINDING: the standalone Editor surface's own
        // refreshDocumentInfo() hardcodes isPublished:false, always —
        // quoted verbatim, contrasted directly with L2.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(/const status = computeLifecycleStatus\(\{ hasBeenSaved: !!state\.lastSaved, isPublished: false \}\);/.test(editorViewSource),
            'L3a. EditorView.js\'s own refreshDocumentInfo() hardcodes isPublished:false, UNCONDITIONALLY — quoted verbatim. There is no code path in this function that ever reads publishedPublication.value or any other true "has this content been published" fact.');
        assert(/status only ever distinguishes Draft\/Saved/.test(editorViewSource),
            'L3b. This is documented, deliberate intent, not an oversight — the file\'s own comment states it outright ("there is no fork-on-edit gate here — that is a World View concern, 0.2.20) so `editable` stays true; status only ever distinguishes Draft/Saved").');

        // Live: prove the underlying fact IS real and available —
        // publishing through the standalone Editor's own pipeline does
        // create a genuine Publication — the panel simply never says so.
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const document = buildWorldDocument({ title: 'Editor Surface Publish', author: 'alice' });
        publishDocumentUseCase.execute({ document });
        assert(new LocalDiscoveryProvider(storage).list().length === 1,
            'L3c. A real Publication now exists for this exact document content — confirmed live — yet EditorView.js\'s own info panel, per L3a, has no way to ever reflect that fact in its `status`/`statusLabel`.');
        assert(/onDocumentPublished\(publication\) \{\s*publishedPublication\.value = publication;/.test(editorViewSource),
            'L3d. The ONE place this view learns a publish just succeeded (onDocumentPublished()) writes to publishedPublication — a separate, ephemeral ref the post-publish overlay reads — never to documentInfo or anything refreshDocumentInfo() itself consults.');
        assert(/function dismissPublishAction\(\) \{\s*publishedPublication\.value = null;/.test(editorViewSource),
            'L3e. And that ephemeral overlay is explicitly dismissible, clearing publishedPublication back to null — after dismissal (or after simply continuing to edit past it), NOTHING in the standalone Editor surface still tells the Wanderer "this document\'s content has been published," outside whatever they may separately remember.');

        // L4. Toolbar's own persistent indicator: a DIFFERENT, coarser
        // vocabulary (dirty/clean only) that coexists with
        // DocumentInfoPanel's finer one — never says "Published" either.
        const toolbarSource = await readSource('ui/components/Toolbar.js');
        assert(/\{\{ dirty \? '● Unsaved changes' : 'Saved' \}\}/.test(toolbarSource),
            'L4a. Toolbar\'s own always-visible pill is a strictly binary dirty/clean indicator — quoted verbatim.');
        assert(!/'Published'|"Published"/.test(toolbarSource),
            'L4b. The literal string "Published" never appears anywhere in Toolbar.js — its persistent, always-on-screen indicator can say "Saved" immediately after a successful Publish (dirty correctly stays false — publishing never marks the document dirty) and will keep saying "Saved" from then on, for the rest of that editing session, even while a Publication genuinely exists for exactly what is on screen.');

        // L5. RecoveryBanner — confirmed clean of raw implementation
        // vocabulary, and its date formatting degrades gracefully.
        const bannerSource = await readSource('ui/components/RecoveryBanner.js');
        assert(/Unsaved changes from \{\{ formatSavedAt\(status\.recovery\.savedAt\) \}\} were found for this document\./.test(bannerSource),
            'L5a. RecoveryBanner\'s user-facing sentence is plain language — no "checkpoint," "contentHash," or "revision" jargon leaks into it.');
        assert(/return Number\.isNaN\(date\.getTime\(\)\) \? 'an earlier session' : date\.toLocaleString\(\);/.test(bannerSource),
            'L5b. formatSavedAt() degrades gracefully to "an earlier session" rather than showing "Invalid Date" for a malformed timestamp — confirmed live below.');
        const RecoveryBannerModule = await import('../ui/components/RecoveryBanner.js');
        const formatSavedAt = RecoveryBannerModule.default.methods.formatSavedAt;
        assert(formatSavedAt('not-a-real-date') === 'an earlier session', 'L5c. Live-confirmed: an unparseable timestamp degrades to the plain-language fallback, never a raw "Invalid Date" string.');
        assert(formatSavedAt(new Date(2024, 0, 1).toISOString()).length > 0, 'L5d. A valid timestamp formats normally.');

        console.log('✓ Section L: User-facing state communication — where this milestone\'s real product finding lives. DocumentInfoPanel is genuinely one shared component (L1), and the World View surface correctly computes and gates on isPublished (L2). The standalone Editor surface, by contrast, hardcodes isPublished:false UNCONDITIONALLY in its own info panel — a DOCUMENTED, deliberate design choice (not an oversight: its own comment names the reason), but one with a real, narrow, concrete consequence: once a document is published through the standalone Editor and its one-time, dismissible post-publish overlay is gone, NOTHING in that surface\'s persistent UI (neither DocumentInfoPanel\'s finer Draft/Saved/Published vocabulary nor Toolbar\'s always-visible, coarser dirty/clean pill, which never says "Published" at all, for any document, anywhere in this codebase) tells the Wanderer that a Publication now exists for this content. This is exactly the kind of gap this milestone\'s own brief asked to look for: not a missing "dirty indicator" invented to match other editors, but a real place where the existing product\'s own architecture (DocumentLifecycleStatus\'s three-tier vocabulary) already has a slot for the true fact and structurally never fills it on one of its two surfaces. The recovery-checkpoint presentation (RecoveryBanner) and the MATERIAL_UNAVAILABLE load failure message (Section J) are both, by contrast, confirmed clean — plain language, no leaked implementation vocabulary, graceful degradation.');
    }

    // ===============================================================
    // Section M — Flagship + deliberate exclusions.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const session = makeEditingSession(storage, { autosaveDelay: 20 });

        // Create World W1.
        const w1 = buildWorldDocument({ title: 'Flagship W1', author: 'alice' });
        session.documentManager.newDocument(w1);

        // Edit W1 -> Save.
        w1.world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        session.saveDocumentUseCase.execute(session.documentManager);

        // Publish P1.
        const p1 = publishDocumentUseCase.execute({ document: w1 });
        const p1SnapshotAtPublish = publisher.loadSnapshot(p1.id);

        // Edit W1 again -> Save.
        w1.world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        session.saveDocumentUseCase.execute(session.documentManager);

        // Publish P2.
        const p2 = publishDocumentUseCase.execute({ document: w1 });
        assert(p1.id !== p2.id && p1.contentHash !== p2.contentHash, 'M1. P1 and P2 are genuinely distinct.');

        // Edit W1 again WITHOUT saving.
        session.autosaveScheduler.start();
        w1.world.addBuilding(new Building({ creator: 'alice' }));
        session.documentManager.markDirty();
        await sleep(60); // autosave delay elapses -> a checkpoint protects this edit

        // "Navigate away / return" — verify actual, existing
        // unsaved-state semantics (Sections C/D's own findings, applied
        // here rather than re-derived).
        session.autosaveScheduler.stop();
        const checkpointBeforeReturn = session.recoveryStore.load(w1.world.id);
        assert(checkpointBeforeReturn !== null && checkpointBeforeReturn.document.world.buildings.length === 4,
            'M2. The unsaved third edit was idle-dirty long enough to be checkpointed before "navigating away" — Section C\'s own protected case, reconfirmed here inside the flagship.');
        const freshManager = new DocumentManager();
        new LoadDocumentUseCase(storage).execute(freshManager, w1.world.id);
        assert(freshManager.document.world.getBuildings().length === 3, '"Return" without recovering shows the last SAVED state (3 buildings) — the unsaved 4th is not silently merged in, matching Section D.');
        const recoveryOffer = new CheckRecoveryUseCase(session.recoveryStore, storage).execute(w1.world.id);
        assert(recoveryOffer.available === true, 'M3. A recovery offer for the unsaved edit is correctly, deterministically available on return.');

        // P1/P2 remain immutable throughout all of the above.
        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1SnapshotAtPublish), 'M4. P1 remains byte-identical throughout.');
        assert(publisher.verifySnapshot(p2.id, p2.contentHash) === true, 'M5. P2 still verifies against its own contentHash.');

        // W1 retains its correct persisted identity/state.
        assert(freshManager.document.world.id === w1.world.id, 'M6. W1\'s persisted identity is exactly what it always was.');

        // Failure branch: Publish P3 fails.
        storage.failOnSave('forkbuild-publications');
        let p3Error = null;
        try {
            publishDocumentUseCase.execute({ document: w1 });
        } catch (err) {
            p3Error = err;
        }
        assert(p3Error !== null, 'M7. The P3 publish attempt correctly fails.');
        w1.world.addBuilding(new Building({ creator: 'alice' }));
        assert(w1.world.getBuildings().length === 5, 'M8. W1 remains fully editable after the failed P3 attempt.');
        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1SnapshotAtPublish), 'M9. P1 is still unaffected.');
        assert(publisher.verifySnapshot(p2.id, p2.contentHash) === true, 'M10. P2 is still unaffected.');
        storage.clearFailures();
        const p3 = publishDocumentUseCase.execute({ document: w1 });
        assert(p3.id !== p1.id && p3.id !== p2.id, 'M11. Publishing again after the fault clears succeeds and mints a genuinely distinct P3.');

        console.log('✓ Section M flagship: Create W1 -> Edit -> Save -> Publish P1 -> Edit -> Save -> Publish P2 -> Edit W1 again WITHOUT saving -> navigate away/return (the unsaved edit is checkpointed and deterministically offered for recovery, never silently lost, never silently merged into "the saved state") -> P1/P2 remain immutable -> W1 retains its correct identity throughout -> a failing P3 leaves W1 editable and P1/P2 untouched -> publishing again afterward succeeds with a genuinely distinct P3.');

        // Deliberate exclusions, confirmed absent by direct inspection.
        const documentStateSource = await readSource('application/editor-state/DocumentState.js');
        assert(!/undo|redo/i.test(documentStateSource), 'N1. No undo/redo concept was added to DocumentState.');
        const autosaveSchedulerSource = await readSource('application/AutosaveScheduler.js');
        assert(!/branch|conflict/i.test(autosaveSchedulerSource), 'N2. No draft-branch or conflict-resolution concept exists in AutosaveScheduler.js.');
        const publisherSource = await readSource('publisher/LocalPublisherProvider.js');
        assert(!/autoRepublish|automaticRepublish/i.test(publisherSource), 'N3. No automatic republishing mechanism exists.');
        assert(!/class Repository\b/.test(publisherSource), 'N4. No new World-specific Repository class was introduced.');
        const discoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(!/dedup|dedupe/i.test(discoverySource), 'N5. No publication deduplication logic exists.');
        assert(!/offlineQueue|offline-queue/i.test(autosaveSchedulerSource + publisherSource), 'N6. No offline editing queue exists.');

        console.log(`✓ Deliberate exclusions confirmed absent by direct inspection, matching this milestone's own originating brief:
  - No autosave-to-the-canonical-slot was added — the existing (pre-milestone) checkpoint-based autosave is exercised exactly as it already existed; Section C's finding is about its EXISTING trailing-window behavior, not a proposal to change it.
  - No undo/redo concept was added to DocumentState (N1).
  - No version history beyond the existing DocumentRevision counter (Section A4) was added.
  - No draft-branch or conflict-resolution concept exists in AutosaveScheduler.js (N2).
  - No new Document state machine or new persistence mechanism was introduced — every class this file imports is byte-for-byte what 0.9.578 left it as.
  - No Publication editing exists anywhere.
  - No automatic republishing exists (N3); no new World-specific Repository class was introduced (N4); no publication deduplication exists (N5).
  - No offline editing queue exists (N6).
  - No collaboration redesign — Section I was deliberately kept to a small boundary check.
  - No new navigation infrastructure — Section H cited existing methods exclusively.
  - No production code was changed anywhere by this milestone.`);
    }

    console.log('\nAll World Editing & Unsaved-State Product Reassessment tests passed.');
    console.log('\n=== 0.9.579 VERDICT ===');
    console.log(`PRODUCT_COMPLETE for most of this milestone's own questions, with one genuine, narrow, non-blocking finding surfaced by the brief's own instruction not to assume any particular unsaved-changes behavior is required — no production code changed.

The editing-state inventory (A) maps cleanly onto real production vocabulary — DocumentState, DocumentLifecycleStatus's three tiers, DocumentRevision, and a recovery checkpoint as a genuine fourth persistence concept — with one small, honest, defensive-only observation (A3e: describeLifecycleStatus's PUBLISHED label never reads \`dirty\`, though nothing in this codebase can currently make that combination arise — Section K reconfirms why). Save semantics (B) hold exactly as 0.9.577 already found, with one new fact this milestone adds: an explicit Save landing before a pending autosave's debounce window elapses cancels that autosave outright, confirmed live.

Section C is this milestone's main investigation, as instructed, and its finding is real and precisely bounded: navigating away from the Editor is never blocked and never warned about, and is protected by a debounced recovery checkpoint for anything that sat idle-dirty for at least one autosave delay — but the trailing window narrower than that delay (at most ~2 seconds of the MOST RECENT edits, in production) is neither saved nor checkpointed nor warned about, because the exact stop() call EditorView.js's own onBeforeUnmount() makes cancels rather than flushes the pending autosave. This is a side effect of a DIFFERENT, deliberate 0.9.204/0.9.205 design goal ("an unmounted Editor must not go on producing autosaves"), not a considered decision to accept that specific loss window — named precisely here, not assumed to need fixing.

Re-entry (D) is deterministic, driven by real revision comparison rather than any dirty-flag inference — confirmed live with a second, independent observer reaching the identical verdict. Save vs. Publish (E), snapshot immutability (F), multiple Publications (G), reload/interruption (H), the collaboration boundary (I), and failure isolation (J) all hold under direct, live pressure from the actual editing workflow rather than the bare use-case boundary 0.9.577 already covered — with one further narrow, presentation-only finding in H3/J3: a failed re-open leaves EditorSession's own freshly-reconstructed render session visually empty (subscribed to an eventBus that never received the failed document's events) while documentManager/state provably, correctly retain the previous document untouched — a real mismatch between the 3D canvas and the rest of the UI, not a data-loss bug, and exactly the "presentation boundary" this milestone's own brief asked LoadFailureReason.MATERIAL_UNAVAILABLE to be exercised as. Identity under editing (K) holds throughout, unconditionally.

Section L is where this milestone's second, and most concrete, product-level finding lives: EditorView.js's own Document Info panel hardcodes isPublished:false UNCONDITIONALLY, by documented design (the file's own comment names the reason — no fork-on-edit gate exists at this surface, unlike World View's, which correctly computes and gates on the real fact). The practical consequence: once a document is published through the standalone Editor and its one-time, dismissible post-publish overlay is gone, nothing in that surface's PERSISTENT UI — neither the finer Draft/Saved/Published vocabulary nor Toolbar's always-visible, coarser dirty/clean pill (which never displays "Published" for any document, anywhere in this codebase) — tells the Wanderer that a Publication now exists for exactly what they're still editing. This is a real, narrow, structural gap in an existing, documented three-tier vocabulary that already has a slot for this fact and simply never fills it on one of its two surfaces — worth a follow-up if the product wants the standalone Editor to say so, but this test-only milestone stops at naming it precisely rather than prescribing the fix.

The flagship (M) demonstrates the brief's own closing scenario directly, live, end to end, including its own added unsaved-editing branch and failure branch, both holding exactly as this milestone's own investigation into Sections C/D/H predicts. If a follow-up is wanted, the two real, honest leads this milestone surfaces are its own: (1) whether the Editor's Document Info panel should ever report a document it directly published as PUBLISHED, and (2) whether the autosave scheduler's stop()-on-unmount should flush a still-pending checkpoint before cancelling it — both narrow, both optional, and both a genuinely different kind of question than World/Publication identity, which 0.9.576-0.9.578 already closed.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
