import { useStructureLibrary } from '../ui/views/editorView/useStructureLibrary.js';
import { LocalStructureLibraryStore } from '../application/editor/LocalStructureLibraryStore.js';
import { LibraryUsageHistoryStore } from '../application/editor/LibraryUsageHistoryStore.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { Structure } from '../core/building/Structure.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Removing a structure from My Structures is one click, and Undo puts it back
// as it was: its id, its place in the list and in recently used (finding
// P2-13 of docs/reviews/EditorPlacementUX-2026-10-27.md).

const structure = (id, name) => new Structure({
    id, name, category: 'mine', tags: [], description: '',
    bricks: [{ definitionId: 'core:cube', position: { x: 0, y: 0.5, z: 0 }, rotation: 0, tilt: 0 }]
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup({ inUse = () => false } = {}) {
    const storageProvider = new InMemoryStorageProvider();
    const store = new LocalStructureLibraryStore({ storageProvider });
    store.addStructure(structure('mine:shed', 'Shed'), { savedAt: 1000 });
    store.addStructure(structure('mine:tower', 'Tower'), { savedAt: 2000 });
    const history = new LibraryUsageHistoryStore({ storageProvider });
    history.recordUse('mine:shed');
    const shown = [];
    const library = useStructureLibrary({
        editorSession: {}, feedback: { show: (message) => shown.push(message) },
        libraryUsageHistoryStore: history, personalStructureLibraryStore: store,
        structureRegistry: new CreateStructureRegistryUseCase().execute(),
        isRemovedNoticeInUse: inUse, removedNoticeMs: 40
    });
    const names = () => library.personalStructureGroups.value.flatMap((group) => group.structures.map((s) => s.name));
    return { store, library, shown, names };
}

// 1. Remove, then Undo: back as it was.
{
    const { store, library, shown, names } = setup();
    assert(names().join() === 'Tower,Shed', '1. newest first: Tower, then Shed');
    library.removePersonalStructure(store.getStructure('mine:shed'));
    assert(!store.hasStructure('mine:shed') && names().join() === 'Tower', '2. one click removes it');
    assert(library.removedStructure.value?.name === 'Shed', '3. and Undo is offered, naming it');
    assert(!library.recentStructures.value.some((entry) => entry.structure.id === 'mine:shed'), '4. it leaves recently used');
    library.undoRemovePersonalStructure();
    assert(store.hasStructure('mine:shed') && names().join() === 'Tower,Shed', '5. Undo puts it back, in its old place');
    assert(store.getSavedAtById()['mine:shed'] === 1000, '6. with its own saved time');
    assert(library.recentStructures.value.some((entry) => entry.structure.id === 'mine:shed'), '7. and back in recently used');
    assert(library.removedStructure.value === null, '8. the notice goes');
    assert(shown.at(-1) === t('editor.structureRestored', { name: 'Shed' }), '9. and it says so');
    library.undoRemovePersonalStructure();
    assert(names().join() === 'Tower,Shed', '10. a second Undo does nothing');
    console.log('✓ removing takes one click, and Undo puts it back as it was');
}

// 2. Undo is for the last one removed, and lapses after a while, but not
// while it is being reached for.
{
    const { store, library, names } = setup();
    library.removePersonalStructure(store.getStructure('mine:shed'));
    library.removePersonalStructure(store.getStructure('mine:tower'));
    assert(library.removedStructure.value.name === 'Tower', '11. Undo offers the last one removed');
    library.undoRemovePersonalStructure();
    assert(names().join() === 'Tower', '12. and puts back only that one');
    library.removePersonalStructure(store.getStructure('mine:tower'));
    await wait(80);
    assert(library.removedStructure.value === null, '13. untouched, the offer lapses');

    let inUse = true;
    const held = setup({ inUse: () => inUse });
    held.library.removePersonalStructure(held.store.getStructure('mine:shed'));
    await wait(80);
    assert(held.library.removedStructure.value?.name === 'Shed', '14. while the pointer or focus is on it, it stays');
    inUse = false;
    await wait(80);
    assert(held.library.removedStructure.value === null, '15. and lapses once let go');
    held.library.dismissRemovedStructure();
    console.log('✓ Undo is for the last one removed, and lapses unless in use');
}

console.log('✅ All structure remove-and-undo tests passed.');
