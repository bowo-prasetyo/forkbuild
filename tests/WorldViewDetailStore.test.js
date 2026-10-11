import { WorldViewDetailStore } from '../application/settings/WorldViewDetailStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// World View opens as a visitor's view until this device chooses Advanced
// (application/settings/WorldViewDetailStore.js).

// A visitor's view by default, Advanced kept once chosen, and back again.
{
    const storage = new InMemoryStorageProvider();
    const store = new WorldViewDetailStore({ storageProvider: storage });
    assert(store.isAdvanced() === false, 'nothing stored is a visitor\'s view');
    assert(store.setAdvanced(true) === true, 'setAdvanced() returns the choice');
    assert(new WorldViewDetailStore({ storageProvider: storage }).isAdvanced() === true, 'a new store reads Advanced back');
    store.setAdvanced(false);
    assert(new WorldViewDetailStore({ storageProvider: storage }).isAdvanced() === false, 'and a visitor\'s view again');
    assert(store.setAdvanced('yes') === false, 'only true chooses Advanced');
    console.log('✓ a visitor\'s view by default, Advanced remembered once chosen');
}

// A damaged entry or a storage that throws reads as a visitor's view, and an
// unsaved choice still holds for the caller.
{
    const storage = new InMemoryStorageProvider();
    storage.save('world-view-detail', 'garbage');
    assert(new WorldViewDetailStore({ storageProvider: storage }).isAdvanced() === false, 'a damaged entry is a visitor\'s view');
    storage.save('world-view-detail', { advanced: 'true' });
    assert(new WorldViewDetailStore({ storageProvider: storage }).isAdvanced() === false, 'only a stored true is Advanced');

    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
        save() { throw new Error('full'); }
    }
    const throwing = new WorldViewDetailStore({ storageProvider: new ThrowingStorage() });
    assert(throwing.isAdvanced() === false, 'a storage error reads as a visitor\'s view');
    assert(throwing.setAdvanced(true) === true, 'a failed save still returns the choice');

    let threw = false;
    try {
        new WorldViewDetailStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'a StorageProvider is required');
    console.log('✓ WorldViewDetailStore tolerates damage');
}
