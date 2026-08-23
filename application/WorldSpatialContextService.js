// 0.3.6 — World Discovery & Exploration.
//
// A read-only, derived service answering "What is around me right now?"
// from the viewer's current position and the deterministic World environment.
//
// WorldSpatialContextService is deliberately:
//   - STATELESS: no internal state, pure derivation from session/world
//   - READ-ONLY: never mutates session, never issues commands
//   - EPHEMERAL: returns fresh WorldSpatialContext instances on each call
//   - DETERMINISTIC: same position + world state → same context everywhere
//
// This service composes:
//   - TerrainEcology.ecologyZoneAt(seed, x, z)
//   - Hydrology.hydrologyFeatureAt(seed, x, z)
//   - StructurePlacement positions from loaded documents
//   - Collaborator positions from spatial presence
//   - Avatar/camera position from navigation session
//
// See docs/Principles.md, "Exploration Is Derived From Place, Not Stored
// As Place (0.3.6)" and core/WorldSpatialContext.js for the value object
// this service produces.
import { deriveSpatialContext, WorldSpatialContext } from '../core/WorldSpatialContext.js';

export class WorldSpatialContextService {
    constructor(session) {
        // WorldNavigationSession provides:
        //   - getAvatarPosition() / getCameraPosition()
        //   - getLoadedDocuments()
        //   - getWorldSeed()
        //   - getCollaboratorPositions() (from spatial presence)
        this._session = session;
    }

    // Derive spatial context for the viewer's current position
    // Returns a fresh WorldSpatialContext instance every time
    getCurrentContext() {
        const position = this._session.getAvatarPosition?.() || this._session.getCameraPosition?.();
        if (!position) {
            return null;
        }

        const seed = this._session.getWorldSeed?.() || 0;
        const documents = this._session.getLoadedDocuments?.() || [];
        
        // Collect all structure placements from loaded documents
        const structurePlacements = [];
        // 0.3.7 — World Landmarks & Personal Waypoints. Same collection,
        // same layoutPosition offset (see application/
        // WorldLocationDirectory.js#_landmarkLocationsFor, which applies
        // the identical transform for navigation) — a landmark's own
        // position is LOCAL to its World, exactly like a placement's.
        const landmarks = [];
        // 0.5.0 — World Regions & Decentralized Place Naming. Same
        // collection, same layoutPosition offset as landmarks above —
        // see application/WorldLocationDirectory.js#_regionLocationsFor().
        const regions = [];
        for (const document of documents) {
            const layoutPosition = this._session.getDocumentPosition?.(document.world.id) || { x: 0, y: 0, z: 0 };
            const placements = document.world.getStructurePlacements?.() || [];

            for (const placement of placements) {
                structurePlacements.push({
                    id: placement.id,
                    documentId: placement.documentId,
                    position: {
                        x: placement.position.x + layoutPosition.x,
                        y: placement.position.y + layoutPosition.y,
                        z: placement.position.z + layoutPosition.z
                    },
                    documentTitle: this._session.getSavedDocumentTitle?.(placement.documentId) || 'Untitled Structure'
                });
            }

            const worldLandmarks = document.world.getWorldLandmarks?.() || [];
            for (const landmark of worldLandmarks) {
                landmarks.push({
                    id: landmark.id,
                    title: landmark.title,
                    position: {
                        x: landmark.position.x + layoutPosition.x,
                        y: landmark.position.y + layoutPosition.y,
                        z: landmark.position.z + layoutPosition.z
                    }
                });
            }

            const worldRegions = document.world.getWorldRegions?.() || [];
            for (const region of worldRegions) {
                regions.push({
                    id: region.id,
                    name: region.name,
                    kind: region.kind,
                    radius: region.radius,
                    position: {
                        x: region.position.x + layoutPosition.x,
                        y: region.position.y + layoutPosition.y,
                        z: region.position.z + layoutPosition.z
                    }
                });
            }
        }

        // Get collaborator positions from spatial presence roster
        const collaboratorPositions = [];
        if (typeof this._session.getWorldSpatialPresenceRoster === 'function') {
            // Get roster for all loaded documents
            const documents = this._session.getLoadedDocuments?.() || [];
            for (const doc of documents) {
                const roster = this._session.getWorldSpatialPresenceRoster(doc.world.id) || [];
                for (const entry of roster) {
                    if (entry.position) {
                        collaboratorPositions.push({
                            identityId: entry.identityId,
                            displayName: entry.displayName || entry.identityId,
                            activity: entry.activity || null,
                            position: entry.position
                        });
                    }
                }
            }
        }

        return deriveSpatialContext({
            position,
            seed,
            world: null, // Not directly used; structurePlacements provided separately
            structurePlacements,
            collaboratorPositions,
            landmarks,
            regions,
            streamingRadius: 100
        });
    }

    // Derive spatial context for an arbitrary world position
    // Useful for UI previews, compass markers, etc.
    getContextAtPosition(position) {
        if (!position) {
            return null;
        }

        const seed = this._session.getWorldSeed?.() || 0;
        const documents = this._session.getLoadedDocuments?.() || [];
        
        const structurePlacements = [];
        // 0.3.7 — same collection, same layoutPosition offset as
        // getCurrentContext() above.
        const landmarks = [];
        // 0.5.0 — same collection, same layoutPosition offset as
        // getCurrentContext() above.
        const regions = [];
        for (const document of documents) {
            const layoutPosition = this._session.getDocumentPosition?.(document.world.id) || { x: 0, y: 0, z: 0 };
            const placements = document.world.getStructurePlacements?.() || [];

            for (const placement of placements) {
                structurePlacements.push({
                    id: placement.id,
                    documentId: placement.documentId,
                    position: {
                        x: placement.position.x + layoutPosition.x,
                        y: placement.position.y + layoutPosition.y,
                        z: placement.position.z + layoutPosition.z
                    },
                    documentTitle: this._session.getSavedDocumentTitle?.(placement.documentId) || 'Untitled Structure'
                });
            }

            const worldLandmarks = document.world.getWorldLandmarks?.() || [];
            for (const landmark of worldLandmarks) {
                landmarks.push({
                    id: landmark.id,
                    title: landmark.title,
                    position: {
                        x: landmark.position.x + layoutPosition.x,
                        y: landmark.position.y + layoutPosition.y,
                        z: landmark.position.z + layoutPosition.z
                    }
                });
            }

            const worldRegions = document.world.getWorldRegions?.() || [];
            for (const region of worldRegions) {
                regions.push({
                    id: region.id,
                    name: region.name,
                    kind: region.kind,
                    radius: region.radius,
                    position: {
                        x: region.position.x + layoutPosition.x,
                        y: region.position.y + layoutPosition.y,
                        z: region.position.z + layoutPosition.z
                    }
                });
            }
        }

        // Get collaborator positions from spatial presence roster
        const collaboratorPositions = [];
        if (typeof this._session.getWorldSpatialPresenceRoster === 'function') {
            // Get roster for all loaded documents
            const documents = this._session.getLoadedDocuments?.() || [];
            for (const doc of documents) {
                const roster = this._session.getWorldSpatialPresenceRoster(doc.world.id) || [];
                for (const entry of roster) {
                    if (entry.position) {
                        collaboratorPositions.push({
                            identityId: entry.identityId,
                            displayName: entry.displayName || entry.identityId,
                            activity: entry.activity || null,
                            position: entry.position
                        });
                    }
                }
            }
        }

        return deriveSpatialContext({
            position,
            seed,
            world: null,
            structurePlacements,
            collaboratorPositions,
            landmarks,
            regions,
            streamingRadius: 100
        });
    }

    // Get a human-readable description of the current location
    // Example: "Forest · near House · 120m from Origin"
    getCurrentLocationDescription() {
        const context = this.getCurrentContext();
        return context ? context.description : 'Unknown Location';
    }

    // Find the nearest structure to the viewer's current position
    // Returns { id, title, distance, direction } or null if none nearby
    findNearestStructure() {
        const context = this.getCurrentContext();
        if (!context || !context.nearbyStructures || context.nearbyStructures.length === 0) {
            return null;
        }
        return context.nearbyStructures[0];
    }

    // Find collaborators near the viewer's current position
    // Returns array of { identityId, displayName, activity, distance, direction }
    findNearbyCollaborators() {
        const context = this.getCurrentContext();
        if (!context) {
            return [];
        }
        return context.nearbyCollaborators || [];
    }
}
