import { Position } from '../../core/Position.js';
import { SpatialHoverState } from '../spatial-state/SpatialHoverState.js';
import { CommandHistory } from '../editor/CommandHistory.js';
import { STREAMING_RADIUS } from './constants.js';
import { isStorageEntryNotLoadedError } from '../../storage/StorageEntryNotLoadedError.js';

// WorldNavigationSession streaming: loading Worlds near the camera,
// unloading distant ones, retrying failed loads, and resolving a document
// from local storage or published material.

const RETRY_DELAYS = [2000, 5000, 10000];

export const worldStreamingMethods = {
    updateSpatialView() {
        if (!this._session) {
            return { loaded: [], visible: [], failed: this._getFailedIds() };
        }
        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(
            cameraState.position.x,
            cameraState.position.y,
            cameraState.position.z
        );
        const visibleIds = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );
        const currentlyLoaded = new Set(this._loadedDocuments.keys());
        const toUnload = Array.from(currentlyLoaded).filter((id) => {
            if (visibleIds.includes(id)) return false;
            // Pin dirty documents against streaming unload
            if (this.isDocumentDirty(id)) return false;
            // A lazily-forked document is never a publication, so it can never re-enter
            // `visibleIds`; unlike the dirty flag, this pin survives a save. Without it a
            // saved fork would stream out on the next camera move for good.
            if (this._localOnlyDocumentIds.has(id)) return false;
            return true;
        });
        const now = Date.now();
        const toLoad = visibleIds.filter((id) => {
            if (currentlyLoaded.has(id)) {
                return false;
            }
            const failure = this._failedLoads.get(id);
            if (!failure) {
                return true;
            }
            if (failure.attempts > RETRY_DELAYS.length) {
                return false;
            }
            return now - failure.lastAttemptAt >= RETRY_DELAYS[failure.attempts - 1];
        });
        for (const id of toUnload) {
            this._unloadWorld(id);
        }
        for (const id of toLoad) {
            try {
                this._loadWorld(id);
                this._failedLoads.delete(id);
            } catch (err) {
                console.warn(`WorldNavigationSession: failed to load world ${id} — ${err.message}`);
                const existing = this._failedLoads.get(id);
                this._failedLoads.set(id, {
                    attempts: existing ? existing.attempts + 1 : 1,
                    lastAttemptAt: now
                });
            }
        }
        this._refreshGizmo();
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible: visibleIds,
            failed: this._getFailedIds()
        };
    },

    // Tries local storage first, unchanged. Only when storage[documentId] is
    // empty (any other failure, such as validation, still propagates) does it
    // fall back to the read-through material bridge for a Publication surfaced
    // by worldLayoutProvider but never published locally. `.getDocument()` keeps
    // `_loadedDocuments` holding ordinary Documents, never a
    // PublishedWorldSession and never a copy into storage.
    // Returns { document, isMaterializedPublication }, so _loadWorld() can mark
    // fallback documents immutable without consulting fork policy's
    // _findPublications()/_discoveryProvider.
    _resolveWorldDocument(documentId) {
        try {
            return { document: this._loadPublicationDocumentUseCase.execute(documentId, this._eventBus), isMaterializedPublication: false };
        } catch (error) {
            if (!/no document found/.test(error.message)) {
                throw error;
            }
            const publication = this._resolvePublicationMaterial(documentId);
            if (!publication) {
                throw error;
            }
            const document = this._loadPublishedWorldSessionUseCase.execute(publication, this._eventBus).getDocument();
            return { document, isMaterializedPublication: true };
        }
    },

    // Resolves a materializable Publication through
    // `_publicationActionDiscoveryProvider`, never the narrow fork-policy
    // provider. Returns null when no fallback is possible, so
    // _resolveWorldDocument() re-throws the original "not found".
    _resolvePublicationMaterial(documentId) {
        if (!this._loadPublishedWorldSessionUseCase || !this._publicationActionDiscoveryProvider
            || typeof this._publicationActionDiscoveryProvider.findByDocumentId !== 'function') {
            return null;
        }
        const publications = this._publicationActionDiscoveryProvider.findByDocumentId(documentId) || [];
        const publication = publications[0];
        return (publication && publication.contentReference) ? publication : null;
    },

    _loadWorld(documentId) {
        let resolved;
        try {
            resolved = this._resolveWorldDocument(documentId);
        } catch (error) {
            // Its published content is on disk and now being read (the read
            // started when load() threw): not a failure, and nothing to wait
            // for here, since navigation stays synchronous. A later
            // updateSpatialView() (every few seconds) finds it in memory
            // and loads it.
            if (isStorageEntryNotLoadedError(error)) {
                return;
            }
            throw error;
        }
        const { document, isMaterializedPublication } = resolved;
        this._loadedDocuments.set(documentId, document);
        // A streamed-in world is a published snapshot, immutable until an edit forks
        // it (see _ensureEditableDocumentId), but only when a Publication resolves.
        // In streaming that's always true, since only published documents become
        // visible. Without a discoveryProvider this session can't tell, so it
        // doesn't claim to. A materialized Publication is marked immutable too,
        // without consulting _isKnownPublication().
        if (isMaterializedPublication || this._isKnownPublication(documentId)) {
            this._publishedDocumentIds.add(documentId);
        }
        if (!this._focusedDocumentId) {
            this._focusedDocumentId = documentId;
        }
        // Set once, like _focusedDocumentId, but never cleared by _unloadWorld();
        // see the _homeDocumentId constructor comment.
        if (!this._homeDocumentId) {
            this._homeDocumentId = documentId;
        }
        // Bootstrap the active document the same way.
        if (!this._activeDocumentId) {
            this._activeDocumentId = documentId;
        }
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        this._session.addWorld(document.world, documentId, layoutPos);
        if (!this._commandHistories.has(document.world.id)) {
            this._registerCommandHistory(document.world.id, new CommandHistory({ world: document.world }));
        }
    },

    _unloadWorld(documentId) {
        if (this._focusedDocumentId === documentId) {
            this._focusedDocumentId = null;
        }
        // An unloaded document can't stay active; a mutation would have nowhere to
        // land.
        if (this._activeDocumentId === documentId) {
            this._activeDocumentId = null;
        }
        if (this._spatialSelection.documentId === documentId) {
            this.clearSelection();
        }
        if (this._spatialHover.documentId === documentId) {
            this._setSpatialHover(SpatialHoverState.empty());
            if (this._session) {
                this._session.clearHover();
            }
        }
        const document = this._loadedDocuments.get(documentId);
        if (document) {
            this._unregisterCommandHistory(document.world.id);
        }
        if (document && this._session) {
            this._session.removeWorld(document.world, documentId);
        }
        this._loadedDocuments.delete(documentId);
        this._refreshGizmo();
    },

    _getFailedIds() {
        return Array.from(this._failedLoads.keys());
    }
};
