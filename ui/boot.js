import { openBrowserStorage } from '../storage/openBrowserStorage.js';

// The page's entry point. Storage is opened first because every store
// reads it synchronously (see storage/IndexedDbStorageBackend.js); the
// app is imported only after that, so none of its modules can read
// storage before it is ready.
await openBrowserStorage();
await import('./main.js');
