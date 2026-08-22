import { WorldLocation } from '../core/WorldLocation.js';
import { WorldLocationKind } from '../core/WorldLocationKind.js';
import { Position } from '../core/Position.js';

// 0.2.94 — World View Location & Navigation.
// 0.3.7 — World Landmarks & Personal Waypoints: added landmark locations.
//
// The ONE place a WorldLocation is ever constructed. Deliberately a
// thin READ over state `session` (a WorldNavigationSession) already
// owns for other reasons — `getLoadedDocuments()`, `getDocumentPosition()`,
// `getSavedDocumentTitle()` — exactly the same "takes `session`, calls
// back into it, never a second source of truth" shape
// application/SpatialInspectionService.js already established. This
// class never mutates `session`, never touches a Document, and never
// persists anything of its own: list() is a query, safe to call as
// often as the UI likes, always reflecting exactly what's currently
// loaded — see core/WorldLocation.js's own header for why there is no
// store to keep in sync.
//
// Deliberately WORLD-WIDE in scope, not streaming-radius-limited: a
// StructurePlacement inside a document this session has ever loaded
// stays a listed destination even after the camera wanders far enough
// that updateSpatialView() would stream its bricks back out — "where
// can I navigate to" and "what's currently rendered" are different
// questions (see docs/Principles.md, "Terrain Requires No Streaming
// Concept; Collision Does (0.2.77)" for the same kind of distinction
// drawn one milestone family over). A location for a document this
// session has never loaded simply doesn't exist yet, the same
// graceful-absence posture the rest of this file's read-only surface
// already has — this is not a second discovery/search mechanism.
export const ORIGIN_LOCATION_ID = 'origin';
const ORIGIN_TITLE = 'Origin';

export class WorldLocationDirectory {
    constructor(session) {
        this._session = session;
    }

    // Ordered: Origin first (always present, the one fixed reference
    // point), then every currently-loaded document's structure
    // placements in a stable, deterministic order — `Array.from(Map)`
    // iteration order (insertion order) for documents, then each
    // World's own `getStructurePlacements()` order — so the SAME loaded
    // world state always produces the SAME location list, on any
    // replica, matching this milestone's own determinism requirement.
    // 0.3.7: Landmarks are appended after structures, grouped by World.
    list() {
        const locations = [this._originLocation()];
        for (const document of this._session.getLoadedDocuments()) {
            locations.push(...this._structureLocationsFor(document));
            locations.push(...this._landmarkLocationsFor(document.world));
        }
        return locations;
    }

    // A single location by id — `'origin'`, a StructurePlacement's
    // own id, or a WorldLandmark's id — or null if it isn't (or is no
    // longer) navigable. Reuses list() rather than a second lookup path,
    // so "find one" and "list all" can never disagree about what
    // currently exists.
    find(locationId) {
        return this.list().find((location) => location.id === locationId) || null;
    }

    _originLocation() {
        return new WorldLocation({
            id: ORIGIN_LOCATION_ID,
            title: ORIGIN_TITLE,
            kind: WorldLocationKind.ORIGIN,
            position: new Position(0, 0, 0)
        });
    }

    _structureLocationsFor(document) {
        const documentId = document.world.id;
        const layoutPosition = this._session.getDocumentPosition(documentId);
        return document.world.getStructurePlacements().map((placement) => new WorldLocation({
            id: placement.id,
            title: this._session.getSavedDocumentTitle(placement.documentId),
            kind: WorldLocationKind.STRUCTURE,
            position: new Position(
                placement.position.x + layoutPosition.x,
                placement.position.y + layoutPosition.y,
                placement.position.z + layoutPosition.z
            )
        }));
    }

    _landmarkLocationsFor(world) {
        return world.getWorldLandmarks().map((landmark) => new WorldLocation({
            id: landmark.id,
            title: landmark.title,
            kind: WorldLocationKind.LANDMARK,
            position: landmark.position
        }));
    }
}
