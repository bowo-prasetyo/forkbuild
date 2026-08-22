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
        }

        // Get collaborator positions from spatial presence (if available)
        const collaboratorPositions = this._session.getCollaboratorPositions?.() || [];

        return deriveSpatialContext({
            position,
            seed,
            world: null, // Not directly used; structurePlacements provided separately
            structurePlacements,
            collaboratorPositions,
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
        }

        const collaboratorPositions = this._session.getCollaboratorPositions?.() || [];

        return deriveSpatialContext({
            position,
            seed,
            world: null,
            structurePlacements,
            collaboratorPositions,
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
