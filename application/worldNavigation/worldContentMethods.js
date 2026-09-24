import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { CreateWorldLandmarkCommand } from '../commands/CreateWorldLandmarkCommand.js';
import { Position } from '../../core/Position.js';
import { UpdateWorldLandmarkCommand } from '../commands/UpdateWorldLandmarkCommand.js';
import { RemoveWorldLandmarkCommand } from '../commands/RemoveWorldLandmarkCommand.js';
import { ANIMAL_INTERACTION_RADIUS } from '../../core/AvatarAnimalCatchTarget.js';
import { CreateWorldAnimalDecorationCommand } from '../commands/CreateWorldAnimalDecorationCommand.js';
import { RemoveWorldAnimalDecorationCommand } from '../commands/RemoveWorldAnimalDecorationCommand.js';
import { AnimalPresence } from '../../core/AnimalPresence.js';
import { createId } from '../../core/createId.js';
import { RegionKind } from '../../core/RegionKind.js';
import { CreateWorldRegionCommand } from '../commands/CreateWorldRegionCommand.js';
import { UpdateWorldRegionCommand } from '../commands/UpdateWorldRegionCommand.js';
import { RemoveWorldRegionCommand } from '../commands/RemoveWorldRegionCommand.js';

// WorldNavigationSession methods for explicit World content: landmarks,
// animal decorations and regions, each an ordinary Command on the World.
export const worldContentMethods = {
    // -----------------------------------------------------------------
    // World Landmarks: explicit, persistent World content.
    // -----------------------------------------------------------------
    //
    // Landmarks already appear in getWorldLocations() for navigation. This
    // section is the mutation surface (create, update, remove), each an ordinary
    // Command through `this._commandHistories.get(worldId).execute(cmd)`, so
    // propagation and undo/redo need no landmark-specific code. See
    // core/WorldLandmark.js and docs/Principles.md, "A Landmark Is World
    // Content, Not Spatial Presence".
    //
    // getLandmark() reads the raw WorldLandmark, since a WorldLocation lacks
    // description, authorIdentityId and worldId. It searches every loaded
    // document, so the Edit form can prefill from whichever World holds it.
    // Null when no loaded document has it.
    getLandmark(landmarkId) {
        const doc = this._resolveLandmarkOwner(landmarkId);
        if (!doc) return null;
        return doc.world.getWorldLandmark(landmarkId).toJSON();
    },

    // Which loaded document's World actually owns landmarkId. Landmarks
    // are world-wide destinations exactly like structures (see
    // WorldLocationDirectory's own header) — a landmark shown in the
    // Locations panel may belong to any currently loaded document, not
    // only the active one — so getLandmark()/update/remove below resolve
    // by searching rather than assuming "the active document."
    _resolveLandmarkOwner(landmarkId) {
        for (const doc of this.getLoadedDocuments()) {
            if (doc.world.getWorldLandmark(landmarkId)) {
                return doc;
            }
        }
        return null;
    },

    // "Place Here": a landmark at the avatar's position in the active
    // document's World, behind the same fork-on-write guard and canEditDocument
    // gate ("any EDIT member can modify World landmarks"). Naming a place is
    // annotation, not building, so it stays in World View (see
    // docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
    // Builds").
    //
    // Requires a live avatar and throws without one. The stored Y is the
    // avatar's real Y. The avatar is in shared layout space, so this World's
    // layout offset (getDocumentPosition) is subtracted to get the local
    // position, the inverse of what WorldLocationDirectory adds for display.
    createLandmarkHere(title, description = '') {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot add a landmark without a live avatar position');
        }
        this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
        const doc = this.getDocument(this._activeDocumentId);
        if (!doc) {
            throw new Error('WorldNavigationSession: no active World to add a landmark to');
        }
        const worldId = doc.world.id;
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to add landmarks to this World');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('WorldNavigationSession: sign in to add a landmark');
        }
        const layoutPosition = this.getDocumentPosition(worldId);
        const cmd = new CreateWorldLandmarkCommand({
            worldId,
            authorIdentityId,
            title,
            description,
            position: new Position(
                avatarPos.x - layoutPosition.x,
                avatarPos.y - layoutPosition.y,
                avatarPos.z - layoutPosition.z
            )
        });
        this._commandHistories.get(worldId).execute(cmd);
        return cmd.executedLandmarkId;
    },

    updateLandmark(landmarkId, { title, description } = {}) {
        const owner = this._resolveLandmarkOwner(landmarkId);
        if (!owner) {
            throw new Error(`WorldNavigationSession: no landmark "${landmarkId}" known`);
        }
        const worldId = this._ensureEditableDocumentId(owner.world.id);
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to edit landmarks in this World');
        }
        this._commandHistories.get(worldId).execute(
            new UpdateWorldLandmarkCommand({ worldId, landmarkId, title, description })
        );
        return true;
    },

    removeLandmark(landmarkId) {
        const owner = this._resolveLandmarkOwner(landmarkId);
        if (!owner) {
            throw new Error(`WorldNavigationSession: no landmark "${landmarkId}" known`);
        }
        const worldId = this._ensureEditableDocumentId(owner.world.id);
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to remove landmarks from this World');
        }
        this._commandHistories.get(worldId).execute(
            new RemoveWorldLandmarkCommand({ worldId, landmarkId })
        );
        return true;
    },

    // -----------------------------------------------------------------
    // World Animal Decorations: bakes the nearest released (session-local, not
    // tile-baked) animal into the active document's World as durable content.
    // Same guard, authorization and layout-offset subtraction as
    // createLandmarkHere(), sourcing species and position from the animal. No
    // update/remove counterpart beyond undecorate (see core/AnimalDecoration.js,
    // decorative only).
    //
    // Unlike a landmark, Y is kept: avatarPos.y includes real height gained from
    // standing on bricks, so subtracting only the layout offset (never
    // re-deriving from terrain) keeps "released on top of a pyramid" through
    // save, publish and reload.
    //
    // Returns null, never throws, when nothing nearby qualifies: pressing the
    // key with nothing around is expected. (No live avatar at all still
    // throws.)
    //
    // Ownership moves from runtime to document: once the command commits, the
    // source AnimalPresence is discard()'d, so it can't be re-caught or
    // re-decorated, and it isn't a live creature for later loaders either.
    decorateNearestReleasedAnimalHere() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot decorate a World without a live avatar position');
        }
        const target = this._animalRuntimeInstances.nearestReleased(avatarPos, ANIMAL_INTERACTION_RADIUS);
        if (!target) {
            return null;
        }
        this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
        const doc = this.getDocument(this._activeDocumentId);
        if (!doc) {
            throw new Error('WorldNavigationSession: no active World to add a decoration to');
        }
        const worldId = doc.world.id;
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to decorate this World');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('WorldNavigationSession: sign in to decorate a World');
        }
        const layoutPosition = this.getDocumentPosition(worldId);
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId,
            authorIdentityId,
            species: target.species,
            position: new Position(
                target.position.x - layoutPosition.x,
                target.position.y - layoutPosition.y,
                target.position.z - layoutPosition.z
            )
        });
        this._commandHistories.get(worldId).execute(cmd);
        this._animalRuntimeInstances.discard(target.id, target.position);
        return cmd.executedDecorationId;
    },

    // The 'G' key's dispatcher, mirroring the 'F' priority rule:
    //
    //   a released animal is in range   -> G decorates it
    //   otherwise, a decoration is in range -> G undecorates it
    //   otherwise                       -> G does nothing
    //
    // Decorating wins a tie, as catching wins over releasing.
    toggleNearestAnimalDecorationHere() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot toggle a World animal decoration without a live avatar position');
        }
        if (this._animalRuntimeInstances.nearestReleased(avatarPos, ANIMAL_INTERACTION_RADIUS)) {
            return this.decorateNearestReleasedAnimalHere();
        }
        return this.undecorateNearestAnimalDecorationHere();
    },

    // The nearest AnimalDecoration within `radius`, searched across every loaded
    // document (undecorating can target any streamed-in World). Returns
    // `{ decoration, doc, globalPosition }` or null. A pure read.
    _nearestAnimalDecorationNear(avatarPos, radius) {
        let best = null;
        let bestDistance = Infinity;
        for (const doc of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(doc.world.id);
            for (const decoration of doc.world.getAnimalDecorations()) {
                const globalPosition = {
                    x: decoration.position.x + layoutPosition.x,
                    y: decoration.position.y + layoutPosition.y,
                    z: decoration.position.z + layoutPosition.z
                };
                const dx = globalPosition.x - avatarPos.x;
                const dz = globalPosition.z - avatarPos.z;
                const distance = dx * dx + dz * dz;
                if (distance > radius * radius) {
                    continue;
                }
                if (best === null || distance < bestDistance || (distance === bestDistance && decoration.id < best.decoration.id)) {
                    best = { decoration, doc, globalPosition };
                    bestDistance = distance;
                }
            }
        }
        return best;
    },

    // Undo of decorateNearestReleasedAnimalHere(): removes the nearest
    // decoration and hands it back to AnimalRuntimeInstances as a live,
    // catchable animal. It gets a fresh id: decoration ids are durable World
    // content identities, while released animals always get new ids at release,
    // and the two spaces must not mix.
    //
    // Same guard and authorization as other World mutations. Returns null,
    // never throws, when nothing nearby qualifies.
    undecorateNearestAnimalDecorationHere() {
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot undecorate a World without a live avatar position');
        }
        const found = this._nearestAnimalDecorationNear(avatarPos, ANIMAL_INTERACTION_RADIUS);
        if (!found) {
            return null;
        }
        const { decoration, doc, globalPosition } = found;
        const worldId = this._ensureEditableDocumentId(doc.world.id);
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to remove a decoration from this World');
        }
        this._commandHistories.get(worldId).execute(
            new RemoveWorldAnimalDecorationCommand({ worldId, decorationId: decoration.id })
        );
        this._animalRuntimeInstances.add(new AnimalPresence({
            id: createId(),
            species: decoration.species,
            position: new Position(globalPosition.x, globalPosition.y, globalPosition.z)
        }));
        return decoration.id;
    },

    // -----------------------------------------------------------------
    // World Regions: a named area (center + radius) rather than a landmark's
    // point. Same Command chokepoint, world-wide resolution and
    // canEditDocument() gate as landmarks. See core/WorldRegion.js and
    // docs/Principles.md, "Users Name Places; The World Derives Geography From
    // Names".
    // -----------------------------------------------------------------

    getRegion(regionId) {
        const doc = this._resolveRegionOwner(regionId);
        if (!doc) return null;
        return doc.world.getWorldRegion(regionId).toJSON();
    },

    _resolveRegionOwner(regionId) {
        for (const doc of this.getLoadedDocuments()) {
            if (doc.world.getWorldRegion(regionId)) {
                return doc;
            }
        }
        return null;
    },

    // "Name This Area": a region centered on the avatar in the active World,
    // with createLandmarkHere()'s guard and authorization. `radius` is required
    // (an area has no sensible default extent). `kind` defaults to
    // RegionKind.PLACE; `parentRegionId` is optional, since hierarchy is never
    // mandatory.
    createRegionHere(name, { description = '', kind = RegionKind.PLACE, radius, parentRegionId = null } = {}) {
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new Error('WorldNavigationSession: a region requires a positive radius');
        }
        const avatarPos = this.getAvatarPosition();
        if (!avatarPos) {
            throw new Error('WorldNavigationSession: cannot add a region without a live avatar position');
        }
        this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
        const doc = this.getDocument(this._activeDocumentId);
        if (!doc) {
            throw new Error('WorldNavigationSession: no active World to add a region to');
        }
        const worldId = doc.world.id;
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to add regions to this World');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('WorldNavigationSession: sign in to add a region');
        }
        const layoutPosition = this.getDocumentPosition(worldId);
        const cmd = new CreateWorldRegionCommand({
            worldId,
            authorIdentityId,
            name,
            description,
            kind,
            radius,
            parentRegionId,
            position: new Position(
                avatarPos.x - layoutPosition.x,
                avatarPos.y - layoutPosition.y,
                avatarPos.z - layoutPosition.z
            )
        });
        this._commandHistories.get(worldId).execute(cmd);
        return cmd.executedRegionId;
    },

    updateRegion(regionId, { name, description, kind, radius } = {}) {
        const owner = this._resolveRegionOwner(regionId);
        if (!owner) {
            throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
        }
        const worldId = this._ensureEditableDocumentId(owner.world.id);
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to edit regions in this World');
        }
        this._commandHistories.get(worldId).execute(
            new UpdateWorldRegionCommand({ worldId, regionId, name, description, kind, radius })
        );
        return true;
    },

    removeRegion(regionId) {
        const owner = this._resolveRegionOwner(regionId);
        if (!owner) {
            throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
        }
        const worldId = this._ensureEditableDocumentId(owner.world.id);
        if (!this.canEditDocument(worldId)) {
            throw new Error('WorldNavigationSession: not authorized to remove regions from this World');
        }
        this._commandHistories.get(worldId).execute(
            new RemoveWorldRegionCommand({ worldId, regionId })
        );
        return true;
    },
};
