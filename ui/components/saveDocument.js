import { flushLocalStorage } from '../../storage/LocalStorageProvider.js';

// The Editor's explicit Save (Toolbar button, Ctrl/Cmd+S). Storage writes
// can finish after execute() returns (storage/IndexedDbStorageBackend.js),
// so Save waits for them before reporting success; if they fail, the
// document is marked unsaved again and the error is thrown for
// saveFailureMessage().
export async function saveDocument(saveDocumentUseCase, documentManager) {
    saveDocumentUseCase.execute(documentManager);
    try {
        await flushLocalStorage();
    } catch (error) {
        documentManager.markDirty();
        throw error;
    }
}
