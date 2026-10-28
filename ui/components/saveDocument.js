import { ref } from 'vue';
import { flushLocalStorage } from '../../storage/LocalStorageProvider.js';

// Saves started and not yet stored. The document reads as saved the moment
// execute() returns, but its writes reach storage a moment later, so the
// toolbar says "Saving…" until they have (ui/components/Toolbar.js) rather
// than "Saved" for a save a reload could still lose.
export const savesInProgress = ref(0);

// The Editor's explicit Save (Toolbar button, Ctrl/Cmd+S). Storage writes
// can finish after execute() returns (storage/IndexedDbStorageBackend.js),
// so Save waits for them before reporting success; if they fail, the
// document is marked unsaved again and the error is thrown for
// saveFailureMessage().
export async function saveDocument(saveDocumentUseCase, documentManager) {
    saveDocumentUseCase.execute(documentManager);
    savesInProgress.value += 1;
    try {
        await flushLocalStorage();
    } catch (error) {
        documentManager.markDirty();
        throw error;
    } finally {
        savesInProgress.value -= 1;
    }
}
