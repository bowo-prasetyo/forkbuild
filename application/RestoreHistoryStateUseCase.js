import { Document } from '../core/Document.js';
import { CommandHistory } from './CommandHistory.js';

// Historical State Restoration (0.1.41) — the explicitly destructive
// sibling of the 0.1.40 preview. Reconstructs the historical state at
// `cursor` THROUGH THE REPLAY SYSTEM (nothing rewinds the live world),
// then rebases the live document onto it:
//
//   * the DocumentManager's document becomes a new Document —
//     reconstructed world + the ORIGINAL metadata — installed via
//     DocumentManager.load(), which preserves loadedFrom;
//   * a fresh CommandHistory is rooted at the restored world. The
//     history's constructor baseline capture makes "baseline = restored
//     state" automatic: commands = [], cursor = 0;
//   * that new history's save point is INVALIDATED (markUnsaved): the
//     storage still holds the pre-restore document, so the restored
//     document must stay dirty until an explicit Save establishes the
//     new save point. This lives in the history — not just
//     DocumentManager.markDirty() — because DocumentManager computes
//     dirty from history.isDirty() on every command event (0.1.39).
//
// The old history is returned untouched as previousHistory — the caller
// retires it. Restoration is NOT undo: it starts a new linear session
// rather than moving the old cursor, so undo/redo never reach into the
// discarded future and no old command can be duplicated into the new
// timeline. The linear history invariant stands.
//
// Replay runs first and is the only step that can fail before any
// mutation happens — an invalid cursor leaves document, manager, and
// history exactly as they were.
export class RestoreHistoryStateUseCase {
    constructor(replayDocumentUseCase) {
        this._replayDocumentUseCase = replayDocumentUseCase;
    }

    execute(documentManager, commandHistory, cursor) {
        const currentDocument = documentManager.document;
        if (!currentDocument) {
            throw new Error('RestoreHistoryStateUseCase: no document is currently open');
        }
        const restoredWorld = this._replayDocumentUseCase.execute(commandHistory, { endCursor: cursor });
        const restoredDocument = new Document({
            world: restoredWorld,
            metadata: currentDocument.metadata
        });
        const restoredHistory = new CommandHistory({ world: restoredWorld });
        restoredHistory.markUnsaved();

        // Replace the documentManager.load / markDirty calls with:
        if (typeof documentManager.load === 'function' && documentManager.state) {
            documentManager.load(restoredDocument, documentManager.state.loadedFrom);
        }
        if (typeof documentManager.markDirty === 'function') {
            documentManager.markDirty();
        }

        return {
            document: restoredDocument,
            history: restoredHistory,
            previousHistory: commandHistory
        };
    }
}
