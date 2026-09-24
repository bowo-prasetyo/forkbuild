import { CommandHistory } from '../editor/CommandHistory.js';
import { License } from '../../core/License.js';
import { SpatialSelectionState } from '../spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from '../spatial-state/SpatialHoverState.js';

// WorldNavigationSession fork-on-write: a published snapshot is never edited
// in place; its first mutation forks a new Document and remaps selection,
// focus and hover onto it.
export const forkOnWriteMethods = {
    // True while `documentId` is still a straight, unforked view of a
    // published snapshot — i.e. still immutable as far as this session
    // is concerned.
    isDocumentPublished(documentId) {
        return this._publishedDocumentIds.has(documentId);
    },

    // Tells the UI what would happen on the first edit of `documentId`, so it
    // can explain before the user tries. Null for anything already editable.
    // Otherwise:
    //   { blocked: false, message } — editable; first edit forks silently
    //   { blocked: true,  message } — fork policy forbids it
    getEditabilityNotice(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return null;
        }
        const { allowed, license } = this._checkForkPolicy(documentId);
        if (!allowed) {
            const licenseLabel = license ? license.id : 'UNSPECIFIED';
            return {
                blocked: true,
                message: `Published under "${licenseLabel}" — the author has not allowed forking, so this world can be viewed but not edited.`
            };
        }
        return {
            blocked: false,
            message: 'Published snapshot — your first edit creates your own editable fork; the original is never changed.'
        };
    },

    // Document Properties entry point. Metadata edits are mutations, so they go
    // through the same fork-on-first-mutation gate (_ensureEditableDocumentId).
    // Returns the documentId the edit landed on (the fork's, if one was made).
    updateDocumentMetadata(documentId, { title, description, license } = {}) {
        const id = this._ensureEditableDocumentId(documentId || this._activeDocumentId);
        const doc = this.getDocument(id);
        if (!doc) {
            throw new Error(`WorldNavigationSession: no loaded document "${id}"`);
        }
        const metadata = doc.metadata;
        if (title !== undefined) metadata.title = title;
        if (description !== undefined) metadata.description = description;
        if (license !== undefined) metadata.license = license;
        metadata.touch();
        let history = this._commandHistories.get(id);
        if (!history) {
            history = new CommandHistory({ world: doc.world });
            this._registerCommandHistory(id, history);
        }
        history.markUnsaved();
        return id;
    },

    // Guard for document-scoped mutations. Returns the documentId to operate on:
    // unchanged when editable, otherwise the new fork's id.
    _ensureEditableDocumentId(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return documentId;
        }
        return this._forkForEdit(documentId);
    },

    // The actual Copy-on-Write: forks `sourceDocumentId`, swaps this session's
    // view to the fork (the source is unloaded so the mutation lands on the
    // fork), and remaps selection, focus and hover. Returns the fork's id.
    //
    // Throws if the fork policy forbids forking, like ForkDocumentUseCase.
    _forkForEdit(sourceDocumentId) {
        const sourceDoc = this._loadedDocuments.get(sourceDocumentId);
        if (!sourceDoc) {
            throw new Error(`WorldNavigationSession: no loaded document "${sourceDocumentId}" to fork`);
        }

        const policy = this._checkForkPolicy(sourceDocumentId);
        if (!policy.allowed) {
            throw new Error(
                `WorldNavigationSession: forking is not permitted under license `
                + `${policy.license ? policy.license.id : 'UNSPECIFIED'} for document "${sourceDocumentId}"`
            );
        }

        const user = this._identityProvider ? this._identityProvider.currentUser() : null;
        const fork = this._documentCloneService.execute(sourceDoc, {
            title: `Fork of ${sourceDoc.metadata.title || 'Untitled'}`,
            author: user ? user.username : null,
            parentDocumentId: sourceDoc.world.id,
            // Without the eventBus the fork's later mutations update the model but never
            // reach the renderer, freezing the mesh. Same bus _loadWorld and the
            // WorldRenderer use.
            eventBus: this._eventBus
        });
        const forkId = fork.world.id;

        this._loadedDocuments.set(forkId, fork);
        const history = new CommandHistory({ world: fork.world });
        history.markUnsaved();
        this._registerCommandHistory(forkId, history);

        // The fork inherits the source's position permanently: it is
        // not discoverable (never published), so the layout/discovery
        // providers can never resolve a position for `forkId` on their
        // own — every later lookup must come back here, not fall
        // through to their "unknown document" default.
        const pos = this._getWorldPosition(sourceDocumentId);
        this._localPositions.set(forkId, pos);
        this._localOnlyDocumentIds.add(forkId);

        if (this._session) {
            this._session.removeWorld(sourceDoc.world, sourceDocumentId);
            this._session.addWorld(fork.world, forkId, pos);
        }

        // The published source is superseded in THIS session's view —
        // it was never mutated (a fresh reload of the same publication
        // elsewhere still resolves it byte-for-byte unchanged), but
        // this session now works against the fork exclusively.
        this._loadedDocuments.delete(sourceDocumentId);
        this._unregisterCommandHistory(sourceDocumentId);
        this._publishedDocumentIds.delete(sourceDocumentId);

        this._remapReferencesAfterFork(sourceDocumentId, sourceDoc, forkId, fork);

        // So the UI can say what happened instead of the document id silently
        // changing; see consumeForkNotice() / WorldView's guarded().
        this._pendingForkNotice = {
            sourceDocumentId,
            sourceTitle: sourceDoc.metadata.title || 'Untitled',
            forkId,
            forkTitle: fork.metadata.title
        };

        return forkId;
    },

    // Drains the notice _forkForEdit leaves behind, if any. Returns
    // null (not just falsy) when nothing forked since the last call —
    // callers can `if (notice) ...` without worrying about undefined.
    consumeForkNotice() {
        const notice = this._pendingForkNotice;
        this._pendingForkNotice = null;
        return notice;
    },

    // The world position to render/pivot `documentId` at. Prefers a
    // remembered local position (set at fork time — see _forkForEdit)
    // over the layout provider, because the provider can only resolve
    // positions for documents it can discover, and a fork never is
    // one. Used everywhere a position is needed for a document that
    // might be a fork, not just inside _forkForEdit itself.
    _getWorldPosition(documentId) {
        if (this._localPositions.has(documentId)) {
            return this._localPositions.get(documentId);
        }
        return this._worldLayoutProvider.getPosition(documentId);
    },

    // Every Publication on record for `documentId`, or [] when there is
    // no discoveryProvider wired to ask at all. The one lookup shared by
    // _isKnownPublication (is this world published at all?) and
    // _checkForkPolicy (may it be forked?).
    _findPublications(documentId) {
        if (!this._discoveryProvider || typeof this._discoveryProvider.findByDocumentId !== 'function') {
            return [];
        }
        return this._discoveryProvider.findByDocumentId(documentId) || [];
    },

    // Is `documentId` a real, published world — the actual condition
    // fork-on-write exists to protect? A session with no
    // discoveryProvider wired cannot tell, and does not claim to (see
    // _loadWorld).
    _isKnownPublication(documentId) {
        return this._findPublications(documentId).length > 0;
    },

    // Does the license governing `documentId` permit forking? Only enforced
    // when a Publication resolves, like ForkDocumentUseCase. In practice only
    // reached for ids _isKnownPublication confirmed, so the no-publication
    // branch is defensive.
    _checkForkPolicy(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) {
            return { allowed: true, license: null };
        }
        // Most recent publication of this document governs.
        const publication = publications.reduce((latest, p) =>
            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
        const license = publication.license instanceof License
            ? publication.license
            : new License(publication.license || {});
        return { allowed: license.forkAllowed, license };
    },

    // The governing publication id, for a caller building a `/editor?fork=`
    // link like PublicationCatalog.js#forkPublication(); without the
    // `publication` param, ForkDocumentUseCase never enforces the license. Uses
    // _checkForkPolicy()'s "most recent Publication governs" rule so the
    // outcome matches in-session fork-on-write. Null for an unknown
    // publication.
    getPublicationIdForDocument(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) {
            return null;
        }
        const publication = publications.reduce((latest, p) =>
            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
        return publication.id;
    },

    // The Publication object governing `documentId`, for callers that need the
    // object rather than an id (e.g. World View's own "distribute my snapshot",
    // bound to OwnPublicationPanel's `publication` prop). Performs the same
    // "most recent Publication for this documentId wins" reduction as
    // _resolvePublicationForPlacement(), but over
    // `_publicationActionDiscoveryProvider`, so a Repository-admitted
    // Publication this replica never published resolves here without
    // _isKnownPublication()/_checkForkPolicy() treating a never-published
    // document as known or applying that license to it. Placement resolution and
    // fork policy stay on the narrow `_findPublications()`. Null when no
    // Publication is known.
    getPublicationForDocument(documentId) {
        if (!this._publicationActionDiscoveryProvider || typeof this._publicationActionDiscoveryProvider.findByDocumentId !== 'function') {
            return null;
        }
        const publications = this._publicationActionDiscoveryProvider.findByDocumentId(documentId) || [];
        if (publications.length === 0) return null;
        return publications.reduce((latest, p) => (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
    },

    // Remaps this session's live references — selection, focus, active
    // document, hover — from the just-superseded source document onto
    // its fork. Bricks get fresh ids on clone (DocumentCloneService),
    // so brick references are remapped POSITIONALLY (same building
    // index, same brick index within it) rather than by id; the clone
    // preserves structure and order exactly, so position is a stable
    // identity across the fork boundary.
    _remapReferencesAfterFork(sourceDocumentId, sourceDoc, forkId, forkDoc) {
        if (this._focusedDocumentId === sourceDocumentId) {
            this._focusedDocumentId = forkId;
        }
        // A fork only happens because a mutation targeted the source. If the source
        // was active, the fork becomes active, or the next mutation would target a
        // document that was just unloaded.
        if (this._activeDocumentId === sourceDocumentId) {
            this._activeDocumentId = forkId;
        }
        if (this._spatialSelection && this._spatialSelection.documentId === sourceDocumentId) {
            if (this._spatialSelection.type === 'ground') {
                this._spatialSelection = SpatialSelectionState.ground(this._spatialSelection.position);
            } else {
                const items = this._spatialSelection.items
                    .map((item) => item.type === 'brick'
                        ? this._remapBrickReference(sourceDoc, forkDoc, item.buildingId, item.brickId)
                        : null)
                    .filter((item) => item !== null);
                this._spatialSelection = items.length > 0
                    ? SpatialSelectionState.bricks({ documentId: forkId, items })
                    : SpatialSelectionState.empty();
            }
            // The renderer's own selection highlight and the transform
            // gizmo were both set up against the source document's
            // (now-removed) brick meshes. Without this, the visuals
            // stay pinned to whatever was on screen before the fork —
            // typically nothing, since removeWorld just tore those
            // meshes down — and the gizmo can no longer be grabbed even
            // though the (correct, forked) selection state says
            // something is selected.
            if (this._session) {
                this._session.selectBricks(this._spatialSelection.brickIds, this._spatialSelection.brickId);
            }
            this._refreshEditingContext();
            this._refreshInspection();
            this._refreshGizmo();
        }
        if (this._spatialHover && this._spatialHover.documentId === sourceDocumentId) {
            this._setSpatialHover(SpatialHoverState.empty());
        }
    },

    // Positional remap: same building index, same brick index within
    // it. Returns null if the source reference cannot be resolved
    // (defensive — should not happen for a fresh, unedited clone).
    _remapBrickReference(sourceDoc, forkDoc, buildingId, brickId) {
        const sourceBuildings = sourceDoc.world.getBuildings();
        const buildingIndex = sourceBuildings.findIndex((b) => b.id === buildingId);
        if (buildingIndex === -1) return null;
        const sourceBricks = sourceBuildings[buildingIndex].getBricks();
        const brickIndex = sourceBricks.findIndex((b) => b.id === brickId);
        if (brickIndex === -1) return null;

        const forkBuildings = forkDoc.world.getBuildings();
        const forkBuilding = forkBuildings[buildingIndex];
        if (!forkBuilding) return null;
        const forkBrick = forkBuilding.getBricks()[brickIndex];
        if (!forkBrick) return null;
        return { type: 'brick', buildingId: forkBuilding.id, brickId: forkBrick.id };
    },
};
