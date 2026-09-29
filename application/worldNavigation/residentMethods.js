import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { Position } from '../../core/Position.js';
import { CreateWorldResidentCommand } from '../commands/CreateWorldResidentCommand.js';
import { RemoveWorldResidentCommand } from '../commands/RemoveWorldResidentCommand.js';
import { AvatarMovementConstraint } from '../avatar/AvatarMovementConstraint.js';
import { AvatarResidentConstraint } from '../avatar/AvatarResidentConstraint.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../../core/BrickWalkability.js';
import { isResidentGroundAt, RESIDENT_COLLISION_RADIUS } from '../../core/ResidentPath.js';
import {
    ResidentRuntime,
    RESIDENT_RENDER_RADIUS,
    MAX_RENDERED_RESIDENTS,
    RESIDENT_INTERACTION_RADIUS,
    RESIDENT_OBSTACLE_QUERY_RADIUS
} from '../world/ResidentRuntime.js';

// World Residents in World View: where they are drawn and collided with,
// and how a World's author adds and removes them (the 'R' key).
//
// A resident is added to the active World at the avatar's feet, like a
// landmark (and appears there, see ResidentRuntime#newResidentIdNear()),
// through CreateWorldResidentCommand (undoable, saved, published
// and forked with the World). It must be added on open, dry ground: a
// resident walks on the ground (core/WorldResident.js), so a home up on a
// roof or in a lake is refused.

// The 'R' key: add a resident here, or remove the one right here.
const RESIDENT_KEY = 'r';

// An avatar whose feet are higher than this is standing on something (or
// jumping), not on the ground.
const ON_GROUND_TOLERANCE = 0.25;

// Why a resident can't be added right now, for the prompt and for errors.
export const RESIDENT_REFUSAL = Object.freeze({
    NOT_ON_GROUND: 'not-on-ground',
    RIDING: 'riding',
    WATER: 'water'
});

export const residentMethods = {
    // The one ResidentRuntime this session asks where residents are. Built on
    // first use: it only reads `_loadedDocuments` and the layout, which are
    // live references, so building it late loses nothing.
    _residentRuntime() {
        if (!this._residentRuntimeInstance) {
            // The bricks an avatar on the ground would bump into, gathered
            // around a resident's home out to where its walks can reach.
            const obstacles = new AvatarMovementConstraint({
                loadedDocuments: this._loadedDocuments,
                getWorldPosition: (documentId) => this._getWorldPosition(documentId),
                brickRegistry: this._registry,
                queryRadius: RESIDENT_OBSTACLE_QUERY_RADIUS,
                maxStepHeight: DEFAULT_MAX_STEP_HEIGHT,
                structureResolver: this._structureResolver
            });
            this._residentRuntimeInstance = new ResidentRuntime({
                loadedDocuments: this._loadedDocuments,
                getWorldPosition: (documentId) => this._getWorldPosition(documentId),
                obstaclesNear: (position) => obstacles.obstaclesNear(position, {
                    supportHeight: 0,
                    avatarRadius: RESIDENT_COLLISION_RADIUS
                }),
                seed: this.getWorldSeed()
            });
        }
        return this._residentRuntimeInstance;
    },

    // Every frame, the residents near the avatar (or the camera, for a
    // spectator) go to the facade's syncResidents(). Absent when the facade
    // lacks onAnimationFrame or syncResidents.
    _setupResidentRendering() {
        if (typeof this._session.onAnimationFrame !== 'function' || typeof this._session.syncResidents !== 'function') {
            return;
        }
        this._residentRenderFrameSubscription = this._session.onAnimationFrame(() => {
            const position = this.getAvatarPosition() || this.getCameraPosition();
            if (!position) {
                return;
            }
            this._session.syncResidents(
                this._residentRuntime().posesNear(position, RESIDENT_RENDER_RADIUS, this._wildlifeClock(), { limit: MAX_RENDERED_RESIDENTS })
            );
        });
    },

    // Residents block the avatar where they are drawn: same runtime, same
    // clock as _setupResidentRendering().
    _buildAvatarResidentConstraint() {
        return new AvatarResidentConstraint({ runtime: this._residentRuntime(), clock: this._wildlifeClock });
    },

    // Every resident within `radius` of the avatar right now, nearest first:
    // { id, worldId, documentId, x, z, rotationY, moving, ... }. A pure read.
    residentsNearAvatar(radius = RESIDENT_RENDER_RADIUS) {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            return [];
        }
        return this._residentRuntime().posesNear(avatarPos, radius, this._wildlifeClock());
    },

    // Why a resident can't be added at the avatar's feet, or null if it can.
    _residentRefusalAt(avatarPos) {
        if (this._isRidingMovableVehicle() || this.avatarVehicleMount()) {
            return RESIDENT_REFUSAL.RIDING;
        }
        if (!(avatarPos.y < ON_GROUND_TOLERANCE)) {
            return RESIDENT_REFUSAL.NOT_ON_GROUND;
        }
        if (!isResidentGroundAt(this.getWorldSeed(), avatarPos.x, avatarPos.z)) {
            return RESIDENT_REFUSAL.WATER;
        }
        return null;
    },

    // Adds a resident whose home is the avatar's feet to the active World.
    // Returns the new resident's id. Throws when there is no avatar, no
    // editable World, no permission or no signed-in identity, and when the
    // ground here won't do (see RESIDENT_REFUSAL).
    addResidentHere() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot add a resident without a live avatar position');
        }
        const refusal = this._residentRefusalAt(avatarPos);
        if (refusal) {
            throw new Error(`WorldNavigationSession: a resident can't be added here (${refusal})`);
        }
        this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
        const doc = this.getDocument(this._activeDocumentId);
        if (!doc) {
            throw new Error('WorldNavigationSession: no active World to add a resident to');
        }
        const worldId = doc.world.id;
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to add a resident to this World');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('WorldNavigationSession: sign in to add a resident');
        }
        const layoutPosition = this.getDocumentPosition(worldId);
        const cmd = new CreateWorldResidentCommand({
            worldId,
            authorIdentityId,
            position: new Position(avatarPos.x - layoutPosition.x, 0, avatarPos.z - layoutPosition.z),
            // It appears right where it was added, standing, rather than
            // wherever its path would have taken it by now.
            residentId: this._residentRuntime().newResidentIdNear({ x: avatarPos.x, z: avatarPos.z }, this._wildlifeClock())
        });
        this._commandHistories.get(worldId).execute(cmd);
        return cmd.executedResidentId;
    },

    // Removes the resident nearest the avatar, within
    // RESIDENT_INTERACTION_RADIUS of where it is right now, from its World.
    // Returns its id, or null when none is that close. Throws when its World
    // can't be edited.
    removeNearestResidentHere() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot remove a resident without a live avatar position');
        }
        const nearest = this._residentRuntime().nearest(avatarPos, RESIDENT_INTERACTION_RADIUS, this._wildlifeClock());
        if (!nearest) {
            return null;
        }
        const worldId = this._ensureEditableDocumentId(nearest.documentId);
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to remove a resident from this World');
        }
        this._commandHistories.get(worldId).execute(
            new RemoveWorldResidentCommand({ worldId, residentId: nearest.id })
        );
        return nearest.id;
    },

    // The 'R' key's dispatcher: a resident right here is removed; otherwise
    // one is added here. Removing wins, so pressing 'R' twice never stacks
    // two residents in one spot (and a removal is one Ctrl+Z from undone).
    toggleResidentHere() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot add or remove a resident without a live avatar position');
        }
        if (this._residentRuntime().nearest(avatarPos, RESIDENT_INTERACTION_RADIUS, this._wildlifeClock())) {
            return this.removeNearestResidentHere();
        }
        return this.addResidentHere();
    },

    // What an 'R' press would do right now, for the prompt:
    // { canAdd, canRemove, refusal, targetResidentId }. Whether this viewer
    // may edit the World is not checked here (the press reports that), the
    // same split animalDecorationInteractionState() keeps. Null without an
    // avatar.
    residentInteractionState() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            return null;
        }
        const nearest = this._residentRuntime().nearest(avatarPos, RESIDENT_INTERACTION_RADIUS, this._wildlifeClock());
        if (nearest) {
            return { canAdd: false, canRemove: true, refusal: null, targetResidentId: nearest.id };
        }
        const refusal = this._residentRefusalAt(avatarPos);
        return { canAdd: refusal === null, canRemove: false, refusal, targetResidentId: null };
    },

    // The seam from the 'R' key to toggleResidentHere(), on the rising edge
    // only, never letting an error escape — the same shape as
    // _processWorldAnimalDecorationInput() ('G'), for the same reasons.
    _processResidentInput(key, type) {
        if (String(key || '').toLowerCase() !== RESIDENT_KEY) {
            return false;
        }
        if (type === 'keyup') {
            this._residentKeyHeld = false;
            return true;
        }
        if (!this._residentKeyHeld) {
            this._residentKeyHeld = true;
            try {
                this.toggleResidentHere();
            } catch {
                // A stray 'R' that does nothing is the right outcome.
            }
        }
        return true;
    }
};
