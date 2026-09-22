import { Position } from './Position.js';
import { isValidAnimalSpecies } from './AnimalPresence.js';

// 0.9.702 — World Animal Decorations.
//
// The animal counterpart of core/WorldLandmark.js: explicit, persistent
// World content a player intentionally creates, stored in the World
// itself rather than derived or session-local. Where a WorldLandmark
// names a point of interest, an AnimalDecoration names "this species,
// sitting right here" — the durable, publishable record of a released
// animal (application/AnimalRuntimeInstances.js's own ephemeral,
// session-local AnimalPresence) that a player has chosen to make part
// of a World's own content, the way a brick or a StructurePlacement
// already is.
//
// UNLIKE WorldLandmark, Y IS AUTHORITATIVE, NEVER RE-DERIVED FROM
// TERRAIN AT RENDER TIME. A landmark only ever needs to sit "on the
// ground, wherever that is" (core/WorldLandmark.js's own header); an
// animal decoration can just as easily be perched on TOP of a placed
// structure (the flagship scenario this milestone shipped for — a
// rabbit released on top of a player-built pyramid). `position` is
// therefore stored and composed exactly the way core/Brick.js's and
// core/StructurePlacement.js's own local positions already are:
// relative to this World's own origin, lifted by the containing
// document's layout offset + terrain sample ONCE, as a rigid whole, at
// render time (renderer/WorldRenderer.js) — never a second, animal-
// specific terrain lookup.
//
// DECORATIVE ONLY, v1. An AnimalDecoration is inert World content, not
// a live, catchable creature — nothing resolves it as a catch target
// (core/AvatarAnimalCatchTarget.js only ever sees deterministic
// wildlife and application/AnimalRuntimeInstances.js's own live,
// session-local released animals, never a World's own decorations). A
// real shared, catchable "world creature" — synced catch state across
// every peer who loads this World, conflict resolution if two people
// grab it at once — is a substantially bigger, separate feature this
// milestone deliberately does not attempt; see
// application/WorldNavigationSession.js#decorateNearestReleasedAnimalHere()'s
// own header for where that line was drawn.
//
// species reuses core/AnimalPresence.js's own ANIMAL_SPECIES vocabulary
// directly — the same "one vocabulary, not two" discipline
// core/AvatarInventory.js's own header already documents for a carried
// animal's `type`.
export class AnimalDecoration {
    constructor({ id, worldId, authorIdentityId, species, position } = {}) {
        if (!id) {
            throw new Error('AnimalDecoration requires an id');
        }
        if (!worldId) {
            throw new Error('AnimalDecoration requires a worldId');
        }
        if (!authorIdentityId) {
            throw new Error('AnimalDecoration requires an authorIdentityId');
        }
        if (!isValidAnimalSpecies(species)) {
            throw new Error(`AnimalDecoration requires a valid ANIMAL_SPECIES, got ${JSON.stringify(species)}`);
        }
        if (!position) {
            throw new Error('AnimalDecoration requires a position');
        }

        this._id = id;
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._species = species;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
    }

    get id() { return this._id; }
    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get species() { return this._species; }
    get position() { return this._position; }

    toJSON() {
        return {
            id: this._id,
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            species: this._species,
            position: this._position.toJSON()
        };
    }

    static fromJSON(json) {
        return new AnimalDecoration({
            id: json.id,
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            species: json.species,
            position: Position.fromJSON(json.position)
        });
    }
}
