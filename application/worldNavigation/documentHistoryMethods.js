import { Document } from '../../core/Document.js';
import { CommandHistory } from '../editor/CommandHistory.js';

// WorldNavigationSession document history: the timeline, restoring a past
// state, and previewing history without changing the live World.
export const documentHistoryMethods = {
    getTimeline(documentId) {
        const doc = this.getDocument(documentId || this._activeDocumentId);
        const history = doc ? this._commandHistories.get(doc.world.id) : null;
        return history ? history.getTimeline() : [];
    },

    restoreHistoryAt(cursor, documentId) {
        if (!this._replayDocumentUseCase) {
            throw new Error('no restore configured');
        }
        const docId = documentId || this._activeDocumentId;
        const doc = this.getDocument(docId);
        if (!doc) throw new Error('no loaded document');

        const history = this._commandHistories.get(doc.world.id);
        if (!history) throw new Error('no history');

        // 1. Rebuild the world and document
        const restoredWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
        const restoredDocument = new Document({
            world: restoredWorld,
            metadata: doc.metadata
        });

        // 2. Rebuild the history
        const restoredHistory = new CommandHistory({ world: restoredWorld });
        restoredHistory.markUnsaved();

        // 3. Update session state
        this._loadedDocuments.set(docId, restoredDocument);
        this._registerCommandHistory(restoredWorld.id, restoredHistory);

        // 4. Retire the old history
        if (!this._retiredHistories) this._retiredHistories = new Map();
        if (!this._retiredHistories.has(doc.world.id)) this._retiredHistories.set(doc.world.id, []);
        this._retiredHistories.get(doc.world.id).push(history);

        // 5. Update Renderer
        //
        // A preview only occupies this document's render slot if it belongs to this
        // documentId. Checking `_historyPreview.active` alone let restoring document
        // B wipe document A's preview. A preview for another document is left
        // untouched.
        if (this._session) {
            const previewingThisDocument = this._historyPreview
                && this._historyPreview.active
                && this._historyPreview.documentId === docId;
            if (previewingThisDocument) {
                this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
                this._historyPreview = null;
            } else {
                this._session.removeWorld(doc.world, docId);
            }
            this._session.addWorld(restoredWorld, docId, this._worldLayoutProvider.getPosition(docId));
        }

        this.clearSelection();
    },

    // --- History Preview & Restore ---
    beginHistoryPreview() {
        this._historyPreview = { active: true, cursor: null, world: null };
        return true;
    },

    previewHistoryAt(cursor) {
        if (!this._historyPreview || !this._historyPreview.active) {
            throw new Error('no active history preview');
        }
        const history = this._getActiveCommandHistory();
        if (!history) throw new Error('no history');

        const replayWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
        // Captured before _historyPreview is overwritten. Selecting a different
        // entry while already previewing must remove the previous preview world
        // from `replay:${docId}`, not just the (already hidden) live world, so this
        // distinguishes "first preview" from "switching entries".
        const previousPreviewWorld = this._historyPreview.world;
        const previousPreviewDocumentId = this._historyPreview.documentId;
        this._historyPreview.cursor = cursor;
        this._historyPreview.world = replayWorld;

        // Renderer integration: hide live world, show replay world.
        // Must resolve the SAME document _getActiveCommandHistory() just
        // built `history` from above — otherwise the replay could swap
        // out one document's live world while showing a different
        // document's history.
        // Remembered on _historyPreview itself (not re-resolved at cancel
        // time) so a selection/active-document change WHILE the preview
        // is open can never make cancelHistoryPreview restore the wrong
        // document.
        const docId = this._resolveMutationTargetId();
        this._historyPreview.documentId = docId;
        if (this._session && docId) {
            const doc = this.getDocument(docId);
            if (doc) {
                if (previousPreviewWorld) {
                    this._session.removeWorld(previousPreviewWorld, `replay:${previousPreviewDocumentId}`);
                } else {
                    this._session.removeWorld(doc.world, docId);
                }
                this._session.addWorld(replayWorld, `replay:${docId}`, this._worldLayoutProvider.getPosition(docId));
            }
        }
        return true;
    },

    cancelHistoryPreview() {
        if (!this._historyPreview || !this._historyPreview.active) return false;

        const docId = this._historyPreview.documentId;
        if (this._session && docId) {
            const doc = this.getDocument(docId);
            if (doc) {
                this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
                this._session.addWorld(doc.world, docId, this._worldLayoutProvider.getPosition(docId));
            }
        }
        this._historyPreview = null;
        return true;
    },

    getHistoryPreview() {
        if (!this._historyPreview || !this._historyPreview.active) return null;
        return { cursor: this._historyPreview.cursor, world: this._historyPreview.world };
    },
    getRetiredHistories(documentId) {
        return this._retiredHistories ? (this._retiredHistories.get(documentId || this._activeDocumentId) || []) : [];
    },
};
