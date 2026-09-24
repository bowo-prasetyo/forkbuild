import { WorldAccessLevel } from '../../core/WorldAccessLevel.js';
import { WorldPresenceActivity } from '../../core/WorldPresenceActivity.js';
import { deriveWorldSpatialActivity } from '../../core/WorldSpatialActivity.js';
import { AvatarVerticalState } from '../../core/AvatarVerticalState.js';
import { WorldSpatialSelection } from '../../core/WorldSpatialSelection.js';
import { deriveWorldSpatialAnchor } from '../../core/WorldSpatialAnchor.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { computeCameraFraming } from '../../core/CameraPerspective.js';
import { LOCATION_FOCUS_OFFSET } from './constants.js';

// WorldNavigationSession collaboration methods: edit authorization, World
// membership, coarse World presence, and spatial presence (rendering remote
// collaborators and following one).
export const collaborationMethods = {
    // -----------------------------------------------------------------
    // World Editing Authorization
    // -----------------------------------------------------------------
    //
    // Three public queries, never an "isOwner" or role name (see
    // core/WorldAccessLevel.js, application/identity/WorldAuthorizationService.js).
    // Without a worldAuthorizationService every loaded document is editable,
    // and getWorldAccessLevel() returns EDIT even for an unresolvable id, so a
    // typo or not-yet-loaded document never looks more restrictive than having
    // no gate. With a service wired, an unresolvable id is denied: there is no
    // Document to ask about.
    getWorldAccessLevel(documentId) {
        if (!this._worldAuthorizationService) {
            return WorldAccessLevel.EDIT;
        }
        const document = this.getDocument(documentId);
        return this._worldAuthorizationService.resolveAccess(document, documentId);
    },

    // The gate every remaining mutation chokepoint here consults (the region and
    // landmark create/update/remove methods), also safe for a UI to reflect
    // (never decide) whether to offer an edit. Passes `documentId` to
    // WorldAuthorizationService so a non-owner holding a signed edit grant is
    // recognized: the same answer, consulted from BOTH the LOCAL mutation chokepoint
    // and the network one.
    canEditDocument(documentId) {
        if (!this._worldAuthorizationService) {
            return true;
        }
        return this._worldAuthorizationService.canEdit(this.getDocument(documentId), documentId);
    },

    canReadDocument(documentId) {
        if (!this._worldAuthorizationService) {
            return true;
        }
        return this._worldAuthorizationService.canRead(this.getDocument(documentId), documentId);
    },

    // -----------------------------------------------------------------
    // World Membership
    // -----------------------------------------------------------------
    //
    // "Am I this World's cryptographic owner?", the gate WorldMembershipUseCase
    // enforces before grant/revoke, exposed so a UI can decide whether to offer
    // "manage collaborators".
    isWorldOwner(documentId) {
        if (!this._worldAuthorizationService) {
            return false;
        }
        return this._worldAuthorizationService.isOwner(this.getDocument(documentId));
    },

    // Grants `subjectIdentityId` EDIT authority over `documentId` —
    // throws exactly when application/identity/WorldMembershipUseCase.js#grantEdit()
    // itself would (not wired, not this World's owner, or a malformed
    // subject). See that class's own header for the full security
    // model.
    grantWorldEdit(documentId, subjectIdentityId) {
        if (!this._worldMembershipUseCase) {
            throw new Error('WorldNavigationSession: no worldMembershipUseCase is wired — World membership grants are unavailable');
        }
        return this._worldMembershipUseCase.grantEdit(documentId, subjectIdentityId);
    },

    revokeWorldEdit(documentId, subjectIdentityId) {
        if (!this._worldMembershipUseCase) {
            throw new Error('WorldNavigationSession: no worldMembershipUseCase is wired — World membership grants are unavailable');
        }
        return this._worldMembershipUseCase.revokeEdit(documentId, subjectIdentityId);
    },

    // Every membership fact this replica currently holds for `documentId`
    // — an empty array, never a throw, when no worldMembershipUseCase is
    // wired (the same graceful-absence posture every other optional
    // collaborator in this class already follows).
    listWorldMembers(documentId) {
        if (!this._worldMembershipUseCase) {
            return [];
        }
        return this._worldMembershipUseCase.listMembers(documentId);
    },

    // Lets a Members panel reflect a gossiped grant/revocation as soon as it
    // arrives. Returns a no-op unsubscribe when not wired.
    onWorldMembershipChanged(documentId, callback) {
        if (!this._worldMembershipUseCase) {
            return () => {};
        }
        return this._worldMembershipUseCase.onMembershipChanged(documentId, callback);
    },

    // -----------------------------------------------------------------
    // World Presence
    // -----------------------------------------------------------------
    //
    // Declares this replica present in `documentId`. `activity` defaults to a
    // fresh canEditDocument() read; it is a self-reported UI hint, never an
    // authorization claim (see core/WorldPresenceActivity.js). No-op when not
    // wired.
    enterWorldPresence(documentId, activity = null) {
        if (!this._worldPresenceUseCase) {
            return;
        }
        const resolvedActivity = activity || (this.canEditDocument(documentId) ? WorldPresenceActivity.EDITING : WorldPresenceActivity.EXPLORING);
        this._worldPresenceUseCase.enterWorld(documentId, resolvedActivity);
        this._presentWorldDocumentIds.add(documentId);
    },

    // Re-derives this replica's own advertised activity from a FRESH
    // canEditDocument() read — the call a session makes after a World
    // edit grant it holds changes (granted or revoked), so its own
    // presence stays honest without waiting for a peer to notice on
    // their own. A no-op for a World this session never entered
    // presence for.
    refreshWorldPresenceActivity(documentId) {
        if (!this._worldPresenceUseCase || !this._presentWorldDocumentIds.has(documentId)) {
            return;
        }
        this._worldPresenceUseCase.setActivity(documentId, this.canEditDocument(documentId) ? WorldPresenceActivity.EDITING : WorldPresenceActivity.EXPLORING);
    },

    leaveWorldPresence(documentId) {
        if (!this._worldPresenceUseCase) {
            return;
        }
        this._worldPresenceUseCase.leaveWorld(documentId);
        this._presentWorldDocumentIds.delete(documentId);
    },

    // The roster of every OTHER participant currently present in
    // `documentId` — see application/presence/WorldPresenceUseCase.js#getRoster()'s
    // own header for the exact shape. An empty array, never a throw,
    // when no worldPresenceUseCase is wired.
    getWorldPresenceRoster(documentId) {
        if (!this._worldPresenceUseCase) {
            return [];
        }
        return this._worldPresenceUseCase.getRoster(documentId);
    },

    onWorldPresenceChanged(documentId, callback) {
        if (!this._worldPresenceUseCase) {
            return () => {};
        }
        return this._worldPresenceUseCase.onPresenceChanged(documentId, callback);
    },

    // -----------------------------------------------------------------
    // World Spatial Presence
    // -----------------------------------------------------------------
    //
    // Declares this replica spatially present in `documentId` (see
    // application/presence/WorldSpatialPresenceUseCase.js). No-op when not wired.
    // `resolveDisplayName`, an optional `(identityId) => string`, is passed to
    // every remote marker for this World; without it a truncated identityId is
    // shown.
    enterWorldSpatialPresence(documentId, { resolveDisplayName = null } = {}) {
        if (!this._worldSpatialPresenceUseCase) {
            return;
        }
        const cameraPosition = this.getCameraPosition();
        const heading = this.getCompassHeading();
        this._worldSpatialPresenceUseCase.enterWorld(documentId, {
            position: cameraPosition ? { x: cameraPosition.x, z: cameraPosition.z } : null,
            heading: heading ? heading.degrees : null
        });
        this._presentSpatialWorldDocumentIds.add(documentId);
        this._startSpatialPresenceRendering(documentId, typeof resolveDisplayName === 'function' ? resolveDisplayName : null);
    },

    // Called on a fast interval by the UI while this World is active. The one
    // place local interaction state becomes a network fact; `activity` is always
    // derived here, never passed in (see core/WorldSpatialActivity.js). No-op
    // for a World not entered.
    syncWorldSpatialPresence(documentId) {
        if (!this._worldSpatialPresenceUseCase || !this._presentSpatialWorldDocumentIds.has(documentId)) {
            return;
        }
        const cameraPosition = this.getCameraPosition();
        const heading = this.getCompassHeading();
        const selection = this._resolveWorldSpatialSelection(documentId);
        // World View has no gizmo, so this is always inactive; the shape stays
        // because deriveWorldSpatialActivity() expects gizmoActive/gizmoMode.
        const gizmoState = { active: false, mode: null };
        // The avatar's vertical motion (core/AvatarVerticalState.js), for the
        // JUMPING/FALLING activities. Without a controller neither fires.
        const verticalState = this._avatarMovementController ? this._avatarMovementController.verticalState() : null;
        const activity = deriveWorldSpatialActivity({
            gizmoActive: gizmoState.active,
            gizmoMode: gizmoState.mode,
            hasSelection: !selection.isEmpty,
            canEdit: this.canEditDocument(documentId),
            isMoving: Boolean(this._avatarMovementController && this._avatarMovementController.hasMovementInput()),
            rising: verticalState === AvatarVerticalState.RISING,
            falling: verticalState === AvatarVerticalState.FALLING
        });
        this._worldSpatialPresenceUseCase.updateSpatial(documentId, {
            position: cameraPosition ? { x: cameraPosition.x, z: cameraPosition.z } : undefined,
            heading: heading ? heading.degrees : undefined,
            selection,
            activity
        });
    },

    leaveWorldSpatialPresence(documentId) {
        if (!this._worldSpatialPresenceUseCase) {
            return;
        }
        this._worldSpatialPresenceUseCase.leaveWorld(documentId);
        this._presentSpatialWorldDocumentIds.delete(documentId);
        this._stopSpatialPresenceRendering(documentId);
    },

    // Every device-level entry currently spatially present in
    // `documentId` — see WorldSpatialPresenceUseCase#getSpatialRoster()'s
    // own header for the exact shape. An empty array, never a throw,
    // when no worldSpatialPresenceUseCase is wired.
    getWorldSpatialPresenceRoster(documentId) {
        if (!this._worldSpatialPresenceUseCase) {
            return [];
        }
        return this._worldSpatialPresenceUseCase.getSpatialRoster(documentId);
    },

    onWorldSpatialPresenceChanged(documentId, callback) {
        if (!this._worldSpatialPresenceUseCase) {
            return () => {};
        }
        return this._worldSpatialPresenceUseCase.onSpatialPresenceChanged(documentId, callback);
    },

    // Translates this session's local selection into the read-only observation
    // shape core/WorldSpatialSelection.js defines. Only a selection in this
    // World, and only brick or structure-placement kinds, is reported.
    _resolveWorldSpatialSelection(documentId) {
        const selection = this._spatialSelection;
        if (!selection || selection.isEmpty || selection.documentId !== documentId) {
            return WorldSpatialSelection.none();
        }
        if (selection.isStructurePlacementSelection) {
            return WorldSpatialSelection.placement({ documentId, placementId: selection.placementId });
        }
        if (selection.isSingle && selection.type === 'brick') {
            return WorldSpatialSelection.brick({ documentId, buildingId: selection.buildingId, brickId: selection.brickId });
        }
        return WorldSpatialSelection.none();
    },

    // The application layer drives rendering, as RemoteAvatarRegistry does for
    // avatars; WorldView.js never touches RemoteSpatialPresenceRenderer. Before
    // start() the subscription is still recorded, so nothing needs re-calling.
    _startSpatialPresenceRendering(documentId, resolveDisplayName) {
        if (this._spatialPresenceRenderSubscriptions.has(documentId)) {
            return;
        }
        this._spatialPresenceRenderedDevices.set(documentId, new Set());
        const unsubscribe = this._worldSpatialPresenceUseCase.onSpatialPresenceChanged(documentId, (roster) => {
            this._applySpatialPresenceRoster(documentId, roster, resolveDisplayName);
        });
        this._spatialPresenceRenderSubscriptions.set(documentId, unsubscribe);
        this._applySpatialPresenceRoster(documentId, this._worldSpatialPresenceUseCase.getSpatialRoster(documentId), resolveDisplayName);
    },

    _stopSpatialPresenceRendering(documentId) {
        const unsubscribe = this._spatialPresenceRenderSubscriptions.get(documentId);
        if (unsubscribe) {
            unsubscribe();
            this._spatialPresenceRenderSubscriptions.delete(documentId);
        }
        const rendered = this._spatialPresenceRenderedDevices.get(documentId);
        if (rendered && this._session && typeof this._session.removeRemoteSpatialPresence === 'function') {
            for (const deviceId of rendered) {
                this._session.removeRemoteSpatialPresence(deviceId);
            }
        }
        this._spatialPresenceRenderedDevices.delete(documentId);
    },

    // Diffs the roster against what was last rendered for `documentId`, so a
    // departed device's marker is removed.
    //
    // Each observation becomes a WorldSpatialAnchor before reaching the
    // renderer: this session's camera is the viewer, and the device's selection
    // is labeled via _resolveSpatialContextualLabel(). The renderer and UI never
    // derive this themselves.
    _applySpatialPresenceRoster(documentId, roster, resolveDisplayName) {
        if (!this._session || typeof this._session.setRemoteSpatialPresence !== 'function') {
            return;
        }
        const viewerPosition = this.getCameraPosition();
        const viewerHeading = this.getCompassHeading();
        const seen = new Set();
        for (const group of roster) {
            const label = resolveDisplayName ? resolveDisplayName(group.identityId) : this._shortIdentityLabel(group.identityId);
            for (const device of group.devices) {
                seen.add(device.deviceId);
                const anchor = deriveWorldSpatialAnchor({
                    deviceId: device.deviceId,
                    identityId: group.identityId,
                    label,
                    position: device.position,
                    heading: device.heading,
                    selection: device.selection,
                    activity: device.activity,
                    contextualLabel: this._resolveSpatialContextualLabel(device.selection),
                    viewerPosition: viewerPosition ? { x: viewerPosition.x, z: viewerPosition.z } : null,
                    viewerHeadingDegrees: viewerHeading ? viewerHeading.degrees : null
                });
                this._session.setRemoteSpatialPresence(device.deviceId, anchor);
            }
        }
        const previouslyRendered = this._spatialPresenceRenderedDevices.get(documentId) || new Set();
        for (const deviceId of previouslyRendered) {
            if (!seen.has(deviceId)) {
                this._session.removeRemoteSpatialPresence(deviceId);
            }
        }
        this._spatialPresenceRenderedDevices.set(documentId, seen);
    },

    _shortIdentityLabel(identityId) {
        if (typeof identityId !== 'string' || identityId.length === 0) {
            return '?';
        }
        return `${identityId.replace(/^did:key:/, '').slice(0, 6)}…`;
    },

    // The one place a WorldSpatialSelection becomes display text. A placement
    // resolves through `document.world.getStructurePlacement()` to its document
    // title via getSavedDocumentTitle(), in any loaded document. A brick has no
    // name (core/Building.js has no title), so it resolves to null and
    // describeSpatialActivity() shows the plain phrase ("Building"). Null, never
    // a throw, for an empty or unresolvable selection or no
    // loadDocumentUseCase.
    _resolveSpatialContextualLabel(selection) {
        if (!selection || selection.isEmpty || selection.kind !== 'placement') {
            return null;
        }
        const hostDocument = this.getDocument(selection.documentId);
        if (!hostDocument) {
            return null;
        }
        const placement = hostDocument.world.getStructurePlacement(selection.placementId);
        if (!placement) {
            return null;
        }
        return this.getSavedDocumentTitle(placement.documentId);
    },

    // Public wrapper around _resolveSpatialContextualLabel(), passed by the UI
    // as buildSpatialCollaboratorRows()'s `resolveSelectionLabel`.
    resolveSpatialSelectionLabel(selection) {
        return this._resolveSpatialContextualLabel(selection);
    },

    // Moves the camera once toward a collaborator's last known position via
    // _beginCameraFocus(). Not a subscription (see docs/Principles.md, "Follow
    // Is Local Camera Navigation, Never A Shared Camera"): a later call focuses
    // wherever they are then, and nothing is sent to their replica. Searches
    // every spatially entered World. Returns false for a device with no known
    // position.
    focusCollaborator(deviceId) {
        for (const documentId of this._presentSpatialWorldDocumentIds) {
            const roster = this.getWorldSpatialPresenceRoster(documentId);
            for (const group of roster) {
                const device = group.devices.find((candidate) => candidate.deviceId === deviceId);
                if (device && device.position) {
                    const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, device.position.x, device.position.z);
                    // A selected Camera Perspective decides Follow's offset too (see
                    // docs/Principles.md, "Camera Perspective Determines An Offset; It Never
                    // Replaces The Camera Machinery"); otherwise LOCATION_FOCUS_OFFSET.
                    const framing = this._cameraPerspective
                        ? computeCameraFraming(
                            this._cameraPerspective,
                            { x: device.position.x, y: groundY, z: device.position.z },
                            device.heading
                        )
                        : null;
                    this._beginCameraFocus(framing || {
                        position: {
                            x: device.position.x + LOCATION_FOCUS_OFFSET.x,
                            y: groundY + LOCATION_FOCUS_OFFSET.y,
                            z: device.position.z + LOCATION_FOCUS_OFFSET.z
                        },
                        target: { x: device.position.x, y: groundY, z: device.position.z }
                    });
                    return true;
                }
            }
        }
        return false;
    },

    // Resolves a documentId to a title via
    // LoadDocumentUseCase#listSavedDocuments(), the same listing
    // EditorSession#getSelectedPlacementInfo() reads. Falls back to the raw
    // documentId without a loadDocumentUseCase or a matching saved entry.
    getSavedDocumentTitle(documentId) {
        if (this._loadDocumentUseCase && typeof this._loadDocumentUseCase.listSavedDocuments === 'function') {
            const entry = this._loadDocumentUseCase.listSavedDocuments().find((doc) => doc.id === documentId);
            if (entry) {
                return entry.title;
            }
        }
        return documentId;
    },
};
