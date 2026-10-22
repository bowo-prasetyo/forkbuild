// Work left unsaved when the page closed is offered the next time the Editor
// opens (application/document/FindUnsavedWorkUseCase.js, RecoveryObserver's
// offer()). Each visit to the Editor starts a new document, so the work
// always belongs to a build that is not open: this runs the Editor's own
// sequence (autosave, a new page with a new document, the offer, Recover or
// Discard) over one storage, as a reload keeps the browser's.
import { Brick } from '../core/building/Brick.js';
import { Building } from '../core/building/Building.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { Position } from '../core/document/Position.js';
import { World } from '../core/document/World.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { RecoveryObserver } from '../application/document/RecoveryObserver.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { AutosaveDocumentUseCase } from '../application/document/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/document/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/document/RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from '../application/document/DiscardRecoveryUseCase.js';
import { FindUnsavedWorkUseCase } from '../application/document/FindUnsavedWorkUseCase.js';
import { CreatePersistenceUseCase } from '../application/document/CreatePersistenceUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function stack(storage) {
    const recoveryStore = new LocalRecoveryStore(storage);
    const checkRecoveryUseCase = new CheckRecoveryUseCase(recoveryStore, storage);
    return {
        recoveryStore,
        saveDocumentUseCase: new SaveDocumentUseCase(storage, undefined, undefined, recoveryStore),
        autosaveDocumentUseCase: new AutosaveDocumentUseCase(recoveryStore, storage),
        checkRecoveryUseCase,
        recoverDocumentUseCase: new RecoverDocumentUseCase(recoveryStore),
        discardRecoveryUseCase: new DiscardRecoveryUseCase(recoveryStore),
        findUnsavedWorkUseCase: new FindUnsavedWorkUseCase(recoveryStore, checkRecoveryUseCase)
    };
}

function newBuild(title) {
    const world = new World();
    world.addBuilding(new Building({ creator: 'tester' }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

// A DocumentManager wired with a CommandHistory, as EditorSession wires one:
// dirty follows the history.
function open(document) {
    const manager = new DocumentManager();
    manager.load(document, document.world.id);
    const history = new CommandHistory({ world: document.world });
    manager.trackCommandHistory(history);
    return { manager, history };
}

function place(history, world, count) {
    const buildingId = world.getBuildings()[0].id;
    for (let i = 0; i < count; i++) {
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(i, 0.5, 0) }));
    }
}

function brickCount(document) {
    return document.world.getBuildings().reduce((sum, building) => sum + building.getBricks().length, 0);
}

// What the Editor does when it opens with no link: a new build, the observer
// started on it, and other unsaved work offered on its banner.
function openEditor(recovery) {
    const opened = open(newBuild('Untitled'));
    let banner = null;
    const observer = new RecoveryObserver(recovery.checkRecoveryUseCase, opened.manager, { onChange: (status) => { banner = status; } });
    observer.start();
    const offer = () => {
        const status = recovery.findUnsavedWorkUseCase.execute({ excludeDocumentId: opened.manager.document.world.id });
        if (status) observer.offer(status);
    };
    offer();
    return { ...opened, observer, offer, banner: () => banner };
}

// The Editor's composition root hands it the finder over the same store.
{
    const persistence = new CreatePersistenceUseCase().execute();
    assert(persistence.findUnsavedWorkUseCase instanceof FindUnsavedWorkUseCase, 'the Editor is given a FindUnsavedWorkUseCase');
    assert(persistence.findUnsavedWorkUseCase._recoveryStore === persistence.recoveryStore, 'over the recovery store autosave writes to');
}

// A build never saved: the page closes after autosave, and the next Editor
// offers it, named, and Recover brings it back under its own id.
{
    const storage = new InMemoryStorageProvider();
    const recovery = stack(storage);
    const lost = newBuild('Lighthouse');
    const before = open(lost);
    place(before.history, lost.world, 3);
    recovery.autosaveDocumentUseCase.execute(before.manager);
    assert(recovery.recoveryStore.list().join() === lost.world.id, 'the checkpoint is listed by its build');
    const info = recovery.recoveryStore.loadInfo(lost.world.id);
    assert(info.title === 'Lighthouse' && !Number.isNaN(Date.parse(info.savedAt)) && info.revision === 1, `its info names the build and when (${JSON.stringify(info)})`);

    const editor = openEditor(recovery);
    const offered = editor.banner();
    assert(offered && offered.available && offered.otherBuild, 'the new Editor offers the unsaved work, as another build\'s');
    assert(offered.documentId === lost.world.id && offered.title === 'Lighthouse', 'naming which build it is');

    // Editing the new build keeps the offer up: its identity didn't change.
    place(editor.history, editor.manager.document.world, 1);
    assert(editor.banner() === offered, 'an edit to the open build leaves the offer');

    // Recover, as EditorView's recoverDocument() runs it.
    const { document: recovered } = recovery.recoverDocumentUseCase.execute(offered.documentId);
    editor.manager.load(recovered, recovered.world.id);
    editor.manager.markDirty();
    editor.observer.clear();
    assert(editor.manager.document.world.id === lost.world.id, 'the recovered build keeps its id');
    assert(brickCount(editor.manager.document) === 3, 'with its three bricks');
    assert(editor.banner() === null, 'and the offer is gone');
    console.log('✓ a never-saved build left by a closed page is offered by the next Editor, named, and recovers with its bricks');
}

// Saved, then changed and left: offered too; once saved again it isn't.
{
    const storage = new InMemoryStorageProvider();
    const recovery = stack(storage);
    const mill = newBuild('Mill');
    const session = open(mill);
    place(session.history, mill.world, 1);
    recovery.saveDocumentUseCase.execute(session.manager);
    assert(openEditor(recovery).banner() === null, 'a saved build with nothing after its save is not offered');
    place(session.history, mill.world, 2);
    recovery.autosaveDocumentUseCase.execute(session.manager);
    assert(openEditor(recovery).banner()?.documentId === mill.world.id, 'changes after the save are offered');
    recovery.saveDocumentUseCase.execute(session.manager);
    assert(openEditor(recovery).banner() === null, 'and saving them ends the offer');
    console.log('✓ a saved build\'s later changes are offered until they are saved');
}

// Several: the newest first; Discard offers the next; the open build's own
// checkpoint is the observer's to offer, not the finder's.
{
    const storage = new InMemoryStorageProvider();
    const recovery = stack(storage);
    const older = newBuild('Older');
    const newer = newBuild('Newer');
    const olderSession = open(older);
    place(olderSession.history, older.world, 1);
    recovery.autosaveDocumentUseCase.execute(olderSession.manager);
    const newerSession = open(newer);
    place(newerSession.history, newer.world, 1);
    recovery.autosaveDocumentUseCase.execute(newerSession.manager);
    // Made unambiguous: the same millisecond would tie.
    const olderCheckpoint = recovery.recoveryStore.load(older.world.id);
    recovery.recoveryStore.save(older.world.id, { ...olderCheckpoint, savedAt: '2026-01-01T00:00:00.000Z' });

    const editor = openEditor(recovery);
    assert(editor.banner().title === 'Newer', `the newest unsaved work is offered first (${editor.banner().title})`);
    recovery.discardRecoveryUseCase.execute(editor.banner().documentId);
    editor.observer.clear();
    editor.offer();
    assert(editor.banner().title === 'Older', 'Discard offers the next');
    recovery.discardRecoveryUseCase.execute(editor.banner().documentId);
    editor.observer.clear();
    editor.offer();
    assert(editor.banner() === null, 'until there is none');

    const reopened = open(newBuild('Open'));
    place(reopened.history, reopened.manager.document.world, 1);
    recovery.autosaveDocumentUseCase.execute(reopened.manager);
    assert(recovery.findUnsavedWorkUseCase.execute({ excludeDocumentId: reopened.manager.document.world.id }) === null,
        'the open build\'s own checkpoint is never offered as another build\'s');
    console.log('✓ the newest unsaved work comes first, Discard offers the next, and the open build is left to its own banner');
}

// A corrupt checkpoint is dropped and the next one offered; an info record
// from before it carried the time and title still works.
{
    const storage = new InMemoryStorageProvider();
    const recovery = stack(storage);
    const good = newBuild('Good');
    const bad = newBuild('Bad');
    for (const build of [good, bad]) {
        const session = open(build);
        place(session.history, build.world, 1);
        recovery.autosaveDocumentUseCase.execute(session.manager);
    }
    const tampered = recovery.recoveryStore.load(bad.world.id);
    tampered.document.metadata.title = 'Tampered';
    storage.save(`recovery:${bad.world.id}`, tampered);
    // The newest, so it is checked first.
    storage.save(`recovery-info:${bad.world.id}`, { revision: 1, savedAt: '2099-01-01T00:00:00.000Z', title: 'Bad' });
    storage.save(`recovery-info:${good.world.id}`, { revision: 1 });

    const offered = openEditor(recovery).banner();
    assert(offered && offered.documentId === good.world.id && offered.title === 'Good', 'the corrupt checkpoint is passed over, and an old info record falls back to the checkpoint');
    assert(!recovery.recoveryStore.exists(bad.world.id), 'and the corrupt one removed');
    console.log('✓ a corrupt checkpoint is passed over and removed; an older info record still names its build');
}

// No checkpoints at all: nothing offered, and a store that can't be read
// never stops the Editor.
{
    const recovery = stack(new InMemoryStorageProvider());
    assert(openEditor(recovery).banner() === null, 'a first visit offers nothing');
    const broken = new FindUnsavedWorkUseCase({
        list: () => ['a', 'b'],
        loadInfo: (id) => { if (id === 'a') throw new Error('unreadable'); return { savedAt: null, title: null }; }
    }, { execute: () => { throw new Error('unreadable'); } });
    assert(broken.execute() === null, 'unreadable checkpoints are skipped, not thrown');
    console.log('✓ nothing to offer, or nothing readable, offers nothing');
}
