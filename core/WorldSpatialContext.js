// 0.3.6 — World Discovery & Exploration.
//
// A pure, derived value object answering "What spatial context am I in?"
// from nothing but the viewer's world position and the deterministic
// World environment (terrain ecology, hydrology, structures, collaborators).
//
// WorldSpatialContext is deliberately:
//   - READ-ONLY: never mutates session, never touches commands
//   - DERIVED: constructed fresh from position + environment queries
//   - EPHEMERAL: no persistence, no store, no identity beyond presentation
//   - DETERMINISTIC: same (seed, x, z) + world state → same context everywhere
//
// This is the architectural realization of "Exploration Is Derived From
// Place, Not Stored As Place" — see docs/Principles.md, "A World Location
// Is Read From Existing Identity, Never A New Store (0.2.94)" extended to
// include terrain/ecology/hydrology as derivable context.
//
// See also:
//   - core/TerrainEcology.js: "What kind of natural environment is this?"
//   - core/Hydrology.js: "Where does water actually collect and flow?"
//   - core/CompassHeading.js: "Which way am I facing?"
//   - application/WorldLocationDirectory.js: "Where can I navigate to?"
import { terrainHeightAt } from './TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from './TerrainSurface.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE } from './Hydrology.js';
import { Position } from './Position.js';

export class WorldSpatialContext {
    constructor({
        position,
        seed,
        terrainZone,
        hydrologyFeature,
        nearbyStructures = [],
        nearbyCollaborators = [],
        distanceFromOrigin
    } = {}) {
        if (!position) {
            throw new Error('WorldSpatialContext requires a position');
        }
        if (typeof seed !== 'number' || !Number.isFinite(seed)) {
            throw new Error('WorldSpatialContext requires a valid seed');
        }
        
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._seed = seed;
        this._terrainZone = terrainZone || null;
        this._hydrologyFeature = hydrologyFeature || null;
        this._nearbyStructures = Array.isArray(nearbyStructures)
            ? Object.freeze([...nearbyStructures])
            : Object.freeze([]);
        this._nearbyCollaborators = Array.isArray(nearbyCollaborators)
            ? Object.freeze([...nearbyCollaborators])
            : Object.freeze([]);
        this._distanceFromOrigin = typeof distanceFromOrigin === 'number' && Number.isFinite(distanceFromOrigin)
            ? distanceFromOrigin
            : null;
    }

    // The viewer's current world position (X/Y/Z)
    get position() { return this._position; }

    // The world seed used for deterministic derivation
    get seed() { return this._seed; }

    // The ecological zone at this position (FOREST, GRASSLAND, etc.)
    // Derived from TerrainEcology.ecologyZoneAt(seed, x, z)
    get terrainZone() { return this._terrainZone; }

    // The hydrology feature at this position (LAKE, RIVER, NONE)
    // Derived from Hydrology.hydrologyFeatureAt(seed, x, z)
    get hydrologyFeature() { return this._hydrologyFeature; }

    // Nearby structure placements within streaming radius
    // Each entry: { id, title, distance, direction }
    get nearbyStructures() { return this._nearbyStructures; }

    // Nearby collaborators within spatial awareness radius
    // Each entry: { identityId, displayName, activity, distance, direction }
    get nearbyCollaborators() { return this._nearbyCollaborators; }

    // Euclidean distance from world origin (0, 0, 0) in meters
    get distanceFromOrigin() { return this._distanceFromOrigin; }

    // Human-readable description of current location
    // Example: "Forest · near House · 120m from Origin"
    get description() {
        const parts = [];

        // Primary terrain zone
        if (this._terrainZone) {
            parts.push(this._formatZone(this._terrainZone));
        }

        // Hydrology feature if notable
        if (this._hydrologyFeature && this._hydrologyFeature !== HYDROLOGY_FEATURE.NONE) {
            parts.push(this._formatHydrology(this._hydrologyFeature));
        }

        // Nearest structure if very close
        const nearestStructure = this._nearbyStructures[0];
        if (nearestStructure && nearestStructure.distance < 50) {
            parts.push(`near ${nearestStructure.title}`);
        }

        return parts.join(' · ');
    }

    // Compass-style directional label for a structure/collaborator
    // Returns N, NE, E, SE, S, SW, W, NW based on relative position
    directionLabel(targetPosition) {
        const dx = targetPosition.x - this._position.x;
        const dz = targetPosition.z - this._position.z;
        
        const angle = Math.atan2(dx, dz) * (180 / Math.PI);
        const normalized = ((angle % 360) + 360) % 360;
        
        const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(normalized / 45) % 8;
        return labels[index];
    }

    _formatZone(zone) {
        // Convert FOREST → "Forest", GRASSLAND → "Grassland", etc.
        return zone.charAt(0) + zone.slice(1).toLowerCase();
    }

    _formatHydrology(feature) {
        if (feature === HYDROLOGY_FEATURE.LAKE) return 'lake';
        if (feature === HYDROLOGY_FEATURE.RIVER) return 'river';
        return '';
    }

    toJSON() {
        return {
            position: this._position.toJSON(),
            seed: this._seed,
            terrainZone: this._terrainZone,
            hydrologyFeature: this._hydrologyFeature,
            nearbyStructures: [...this._nearbyStructures],
            nearbyCollaborators: [...this._nearbyCollaborators],
            distanceFromOrigin: this._distanceFromOrigin,
            description: this.description
        };
    }
}

// Pure function: derive spatial context from position + world state
// This is the primary entry point for computing context without instantiation
export function deriveSpatialContext({
    position,
    seed,
    world,
    structurePlacements = [],
    collaboratorPositions = [],
    streamingRadius = 100
}) {
    if (!position) {
        throw new Error('deriveSpatialContext requires a position');
    }

    const x = Math.round(position.x);
    const z = Math.round(position.z);

    // Derive terrain zone deterministically
    const terrainZone = ecologyZoneAt(seed, x, z);

    // Derive hydrology feature deterministically
    const hydrologyFeature = hydrologyFeatureAt(seed, x, z);

    // Find nearby structures within streaming radius
    const nearbyStructures = structurePlacements
        .map((placement) => {
            const dx = placement.position.x - position.x;
            const dz = placement.position.z - position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            return {
                id: placement.id,
                title: placement.documentTitle || 'Untitled Structure',
                distance: Math.round(distance),
                direction: null // Will be computed by WorldSpatialContext instance
            };
        })
        .filter((s) => s.distance <= streamingRadius)
        .sort((a, b) => a.distance - b.distance);

    // Find nearby collaborators within spatial awareness radius
    const awarenessRadius = streamingRadius * 0.8;
    const nearbyCollaborators = collaboratorPositions
        .map((collab) => {
            const dx = collab.position.x - position.x;
            const dz = collab.position.z - position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            return {
                identityId: collab.identityId,
                displayName: collab.displayName,
                activity: collab.activity || null,
                distance: Math.round(distance),
                direction: null // Will be computed by WorldSpatialContext instance
            };
        })
        .filter((c) => c.distance <= awarenessRadius)
        .sort((a, b) => a.distance - b.distance);

    // Calculate distance from origin
    const distanceFromOrigin = Math.round(Math.sqrt(
        position.x * position.x + position.z * position.z
    ));

    // Create context instance (directions will be computed lazily)
    const context = new WorldSpatialContext({
        position,
        seed,
        terrainZone,
        hydrologyFeature,
        nearbyStructures,
        nearbyCollaborators,
        distanceFromOrigin
    });

    // Compute directions for all nearby items
    nearbyStructures.forEach((s) => {
        const placement = structurePlacements.find((p) => p.id === s.id);
        if (placement) {
            s.direction = context.directionLabel(placement.position);
        }
    });

    nearbyCollaborators.forEach((c) => {
        const collab = collaboratorPositions.find((cp) => cp.identityId === c.identityId);
        if (collab) {
            c.direction = context.directionLabel(collab.position);
        }
    });

    return context;
}
