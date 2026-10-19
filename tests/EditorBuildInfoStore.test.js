import { EditorBuildInfoStore } from '../application/settings/EditorBuildInfoStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The Editor shows the open build's details folded to its title until this
// device unfolds them (application/settings/EditorBuildInfoStore.js).

// Folded by default, unfolded kept once chosen, and folded again.
{
    const storage = new InMemoryStorageProvider();
    const store = new EditorBuildInfoStore({ storageProvider: storage });
    assert(store.isExpanded() === false, 'nothing stored is folded');
    assert(store.setExpanded(true) === true, 'setExpanded() returns the choice');
    assert(new EditorBuildInfoStore({ storageProvider: storage }).isExpanded() === true, 'a new store reads unfolded back');
    store.setExpanded(false);
    assert(new EditorBuildInfoStore({ storageProvider: storage }).isExpanded() === false, 'and folded again');
    assert(store.setExpanded('yes') === false, 'only true unfolds');
    console.log('✓ folded by default, unfolded remembered once chosen');
}

// A damaged entry or a storage that throws reads as folded, and an unsaved
// choice still holds for the caller.
{
    const storage = new InMemoryStorageProvider();
    storage.save('editor-build-info', 'garbage');
    assert(new EditorBuildInfoStore({ storageProvider: storage }).isExpanded() === false, 'a damaged entry is folded');

    class FailingStorage extends StorageProvider {
        load() { throw new Error('unavailable'); }
        save() { throw new Error('full'); }
    }
    const failing = new EditorBuildInfoStore({ storageProvider: new FailingStorage() });
    assert(failing.isExpanded() === false, 'an unreadable storage is folded');
    assert(failing.setExpanded(true) === true, 'an unsaved choice is still returned');
    console.log('✓ unreadable storage reads as folded, and an unsaved choice still holds');
}

{
    let threw = false;
    try { new EditorBuildInfoStore({ storageProvider: {} }); } catch { threw = true; }
    assert(threw, 'a StorageProvider is required');
    console.log('✓ a StorageProvider is required');
}
