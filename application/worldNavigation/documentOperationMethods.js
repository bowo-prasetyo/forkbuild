import { CommandHistory } from '../editor/CommandHistory.js';

// WorldNavigationSession document operations: undo and redo on the document
// the next mutation would land on, and saving, publishing, cloning and forking
// loaded documents.
export const documentOperationMethods = {
    undo() {
        if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        if (history && history.canUndo()) {
            history.undo();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return true;
        }
        return false;
    },

    redo() {
        if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        if (history && history.canRedo()) {
            history.redo();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return true;
        }
        return false;
    },

    // Read-only mirrors of undo()/redo()'s gating, so WorldView.js can disable
    // its buttons without touching CommandHistory.
    canUndo() {
        if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        return !!history && history.canUndo();
    },

    canRedo() {
        if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        return !!history && history.canRedo();
    },

    // Descriptive text straight from CommandHistory's own getUndoLabel()/
    // getRedoLabel() (e.g. "Undo Create Landmark") — never recomputed or
    // paraphrased here.
    getUndoLabel() {
        const history = this._getActiveCommandHistory();
        return history ? history.getUndoLabel() : null;
    },

    getRedoLabel() {
        const history = this._getActiveCommandHistory();
        return history ? history.getRedoLabel() : null;
    },

    // The document the next mutation would land on, shared by
    // _getActiveCommandHistory (undo/redo) and history preview so they agree
    // with every other mutation path. A non-empty selection wins, then the
    // active document, never the camera-focused one.
    _resolveMutationTargetId() {
        if (this._spatialSelection && !this._spatialSelection.isEmpty && this._spatialSelection.documentId) {
            return this._spatialSelection.documentId;
        }
        return this._activeDocumentId;
    },

    _getActiveCommandHistory() {
        const id = this._resolveMutationTargetId();
        if (!id) return null;
        const document = this._loadedDocuments.get(id);
        if (!document) return null;
        return this._commandHistories.get(document.world.id) || null;
    },

    // --- Parity Methods for Tests ---
    getActiveDocumentId() { return this._activeDocumentId; },

    isDocumentDirty(documentId) {
        const doc = this.getDocument(documentId || this._activeDocumentId);
        if (!doc) return false;
        const history = this._commandHistories.get(doc.world.id);
        return history ? history.isDirty() : false;
    },

    saveDocument(documentId) {
        const id = documentId || this._activeDocumentId;
        // Defense in depth: guarded mutations fork before marking dirty, so a
        // published document should never have anything to save. Refuse rather
        // than overwrite the published source (see docs/Principles.md, "A
        // published snapshot is never mutated in place").
        if (this._publishedDocumentIds.has(id)) {
            throw new Error(`WorldNavigationSession: "${id}" is a published snapshot and cannot be saved directly — edit it to fork first`);
        }
        const doc = this.getDocument(id);
        if (!doc) throw new Error('no loaded document');
        this._saveDocumentUseCase.execute({ document: doc, state: { dirty: true }, markSaved: () => {} });
        const history = this._commandHistories.get(doc.world.id);
        if (history) history.markSaved();
    },

    publishDocument(documentId) {
        const id = documentId || this._activeDocumentId;
        if (this._publishedDocumentIds.has(id)) {
            throw new Error(`WorldNavigationSession: "${id}" is already a published snapshot — fork it to publish an edited copy`);
        }
        const doc = this.getDocument(id);
        if (!doc) throw new Error('no loaded document');
        if (this.isDocumentDirty(doc.world.id)) this.saveDocument(doc.world.id);
        return this._publishDocumentUseCase.execute({ document: doc });
    },

    cloneDocument(documentId) {
        const doc = this.getDocument(documentId || this._activeDocumentId);
        if (!doc) throw new Error('no loaded document');
        const clone = this._documentCloneService.execute(doc, { eventBus: this._eventBus });
        this._loadedDocuments.set(clone.world.id, clone);

        const history = new CommandHistory({ world: clone.world });
        history.markUnsaved();

        this._registerCommandHistory(clone.world.id, history);
        if (this._session) this._session.addWorld(clone.world, clone.world.id, this._worldLayoutProvider.getPosition(clone.world.id));
        return clone.world.id;
    },

    forkDocument(documentId) {
        const doc = this.getDocument(documentId || this._activeDocumentId);
        if (!doc) throw new Error('no loaded document');
        const user = this._identityProvider ? this._identityProvider.currentUser() : null;
        const fork = this._documentCloneService.execute(doc, {
            title: `Fork of ${doc.metadata.title || 'Untitled'}`,
            author: user ? user.username : null,
            parentDocumentId: doc.world.id,
            eventBus: this._eventBus
        });
        this._loadedDocuments.set(fork.world.id, fork);
        const history = new CommandHistory({ world: fork.world });
        history.markUnsaved();
        this._registerCommandHistory(fork.world.id, history);
        if (this._session) this._session.addWorld(fork.world, fork.world.id, this._worldLayoutProvider.getPosition(fork.world.id));
        // An explicit "Fork" action means the person wants to work on
        // the fork next — camera AND active document both move to it,
        // same combined behavior focusDocument()'s default gives.
        this._focusedDocumentId = fork.world.id;
        this._activeDocumentId = fork.world.id;
        return fork.world.id;
    },

    // Add getDocumentManager alias for WorldViewPersistence tests
    getDocumentManager(documentId) {
        return this.getDocument(documentId);
    }
};
