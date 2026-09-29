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
import { gatherResidentFacts, RESIDENT_KNOWLEDGE_RADIUS } from '../world/ResidentSurroundings.js';
import { pickResidentRemarkFacts, phraseFact, focusTargetsFor, speechSecondsFor, QUIET_REMARK } from '../../core/ResidentTalk.js';
import { terrainHeightAt } from '../../core/TerrainHeightField.js';
import { regionsContaining } from '../../core/WorldRegionGeography.js';

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

// The 'T' key: talk to the resident right here (see talkToNearestResident()).
const RESIDENT_TALK_KEY = 't';

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
    // `canTalk` says whether 'T' would talk to someone.
    residentInteractionState() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            return null;
        }
        const nearest = this._residentRuntime().nearest(avatarPos, RESIDENT_INTERACTION_RADIUS, this._wildlifeClock());
        if (nearest) {
            return { canAdd: false, canRemove: true, canTalk: true, refusal: null, targetResidentId: nearest.id };
        }
        const refusal = this._residentRefusalAt(avatarPos);
        return { canAdd: refusal === null, canRemove: false, canTalk: false, refusal, targetResidentId: null };
    },

    // -----------------------------------------------------------------
    // Talking. A resident tells you what's around, never what to do (see
    // docs/principles/vehicles.md, "A Resident Tells You What's Around,
    // Never What To Do"). What it says is gathered from this replica's own
    // view (application/world/ResidentSurroundings.js), spoken from where
    // the resident stands, and shown only on this screen: nothing is stored
    // or sent.
    // -----------------------------------------------------------------

    // How people are named when a resident mentions them: the same
    // `(identityId) => string` the UI uses for its People lists. Without
    // one, a shortened identity id.
    setResidentDisplayNameResolver(resolveDisplayName) {
        this._residentDisplayNameResolver = typeof resolveDisplayName === 'function' ? resolveDisplayName : null;
    },

    // Talks to the resident nearest the avatar (within
    // RESIDENT_INTERACTION_RADIUS of where it is now): gathers what it knows
    // about its surroundings and returns { residentId, remarks } — one or two
    // sentences (core/ResidentTalk.js), which the facade also shows over the
    // resident's head. Each conversation with the same resident moves on to
    // other things. Null when nobody is close enough.
    talkToNearestResident() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            return null;
        }
        const time = this._wildlifeClock();
        const nearest = this._residentRuntime().nearest(avatarPos, RESIDENT_INTERACTION_RADIUS, time);
        if (!nearest) {
            return null;
        }
        if (!this._residentConversationTurns) {
            this._residentConversationTurns = new Map();
        }
        const turn = this._residentConversationTurns.get(nearest.id) || 0;
        this._residentConversationTurns.set(nearest.id, turn + 1);
        const picked = pickResidentRemarkFacts(this._residentFactsAround(nearest, time), { turn });
        const remarks = picked.length > 0 ? picked.map(phraseFact) : [QUIET_REMARK];
        const speech = {
            residentId: nearest.id,
            remarks,
            // What the viewer may choose to look at: see focusResidentMention().
            focusTargets: focusTargetsFor(picked),
            spokenAt: Date.now(),
            seconds: speechSecondsFor(remarks)
        };
        this._lastResidentSpeech = speech;
        if (this._session && typeof this._session.showResidentSpeech === 'function') {
            this._session.showResidentSpeech(nearest.id, remarks);
        }
        return speech;
    },

    // What the last conversation said, or null: { residentId, remarks,
    // focusTargets, spokenAt (ms), seconds (how long it stays up) }. For the
    // UI's Focus buttons and screen-reader announcement.
    lastResidentSpeech() {
        return this._lastResidentSpeech || null;
    },

    // Looks at the `index`th thing the last conversation mentioned
    // (lastResidentSpeech().focusTargets): the same camera-only move the
    // Locations panel's Focus makes (focusPosition()), framed on the ground
    // there. Never moves the avatar, never changes the active World, and is
    // only ever the viewer's own choice — a resident never moves anyone's
    // camera by itself. Returns whether the camera moved.
    focusResidentMention(index) {
        const speech = this._lastResidentSpeech;
        const target = speech && Array.isArray(speech.focusTargets) ? speech.focusTargets[index] : null;
        if (!target) {
            return false;
        }
        const { x, z } = target.position;
        return this.focusPosition({ x, y: terrainHeightAt(this.getWorldSeed(), x, z), z });
    },

    // How a structure placed in a World is named when a resident mentions
    // it: by the document it places — a known publication's title and author,
    // else the title this device saved it under. Null when neither names it:
    // a resident never speaks a bare document id.
    _residentStructureName(documentId) {
        const provider = this._publicationActionDiscoveryProvider;
        if (provider && typeof provider.findByDocumentId === 'function') {
            const publication = (provider.findByDocumentId(documentId) || []).find((candidate) => candidate && candidate.title);
            if (publication) {
                return { title: publication.title, author: publication.author || null };
            }
        }
        if (this._loadDocumentUseCase && typeof this._loadDocumentUseCase.listSavedDocuments === 'function') {
            const saved = this._loadDocumentUseCase.listSavedDocuments().find((entry) => entry.id === documentId);
            if (saved && saved.title) {
                return { title: saved.title, author: null };
            }
        }
        return null;
    },

    // Everything gatherResidentFacts() needs, from this session, around a
    // resident's pose (from ResidentRuntime).
    _residentFactsAround(pose, time) {
        const position = { x: pose.x, y: 0, z: pose.z };
        const landmarks = [];
        const structures = [];
        for (const document of this.getLoadedDocuments()) {
            const offset = this.getDocumentPosition(document.world.id) || { x: 0, y: 0, z: 0 };
            for (const landmark of document.world.getWorldLandmarks()) {
                landmarks.push({
                    id: landmark.id,
                    title: landmark.title,
                    position: { x: landmark.position.x + offset.x, z: landmark.position.z + offset.z }
                });
            }
            for (const placement of document.world.getStructurePlacements()) {
                const name = this._residentStructureName(placement.documentId);
                if (!name) continue;
                structures.push({
                    id: placement.id,
                    title: name.title,
                    author: name.author,
                    position: { x: placement.position.x + offset.x, z: placement.position.z + offset.z }
                });
            }
        }
        const self = resolveSigningIdentityId(this._identityProvider);
        const people = this._getPresentCollaborators(this._residentDisplayNameResolver || undefined)
            .filter((person) => person.identityId !== self)
            .map((person) => ({ identityId: person.identityId, displayName: person.label, position: person.position }));
        // The resident's own World, and what it was forked from, aren't
        // "another build".
        const home = this.getDocument(pose.documentId);
        const excludedDocumentIds = [pose.documentId, pose.worldId, home && home.metadata ? home.metadata.parentDocumentId : null];
        const mount = this.avatarVehicleMount();
        const place = regionsContaining(position, this._collectRegions())[0];
        return gatherResidentFacts({
            position,
            seed: this.getWorldSeed(),
            timeSeconds: time,
            vehicleRuntime: this._vehicleRuntimeInstances || null,
            mountedVehicleId: mount ? mount.vehicleId : null,
            riddenVehicleIds: [...this._remotelyRiddenVehicleIds()],
            animalRuntime: this._animalRuntimeInstances || null,
            landmarks,
            structures,
            people,
            builds: this.searchWorldByLocation({ center: position, radius: RESIDENT_KNOWLEDGE_RADIUS.BUILD }),
            excludedDocumentIds,
            placeName: place ? place.name : null
        });
    },

    // The seam from the 'T' key to talkToNearestResident(), on the rising
    // edge only, never letting an error escape.
    _processResidentTalkInput(key, type) {
        if (String(key || '').toLowerCase() !== RESIDENT_TALK_KEY) {
            return false;
        }
        if (type === 'keyup') {
            this._residentTalkKeyHeld = false;
            return true;
        }
        if (!this._residentTalkKeyHeld) {
            this._residentTalkKeyHeld = true;
            try {
                this.talkToNearestResident();
            } catch {
                // Nobody to talk to, or nothing to say: nothing happens.
            }
        }
        return true;
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
