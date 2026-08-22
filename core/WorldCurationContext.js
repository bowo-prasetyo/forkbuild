// 0.3.8 — Collaborative World Curation.
//
// WorldCurationContext is a DERIVED, ephemeral reading of spatial
// organization — never persisted, never owned, never authoritative.
// It answers: "Given the current state of the World (landmarks,
// structures, placements), what meaningful groupings emerge from
// spatial proximity?"
//
// This file implements the principle: "Curation Organizes Content;
// It Does Not Own Content." A landmark (e.g., "Village") provides
// semantic context for nearby structures, but deleting the landmark
// does NOT delete the structures, and moving a structure does NOT
// require updating any membership list.
//
// Key design decisions:
//   - Grouping is DERIVED from distance, not stored membership
//   - Landmarks serve as "nuclei" for contextual groupings
//   - No polygons, boundaries, or geometric regions yet
//   - No explicit Area entities (may be added later if needed)
//   - Deterministic: same world state -> same grouping on any replica
//
// See docs/Principles.md, "Derived Grouping Before Explicit Membership (0.3.8)."
import { distanceXZ } from './WorldSpatialAnchor.js';

// How far from a landmark must something be to be considered "nearby"?
// Deliberately generous: a "Village" can encompass structures spread
// across a plausible settlement area. This is a heuristic, not a
// hard boundary — things just beyond this radius are not "excluded,"
// they simply aren't part of THIS landmark's immediate context.
const CURATION_PROXIMITY_RADIUS = 60;

// A plain value object representing a curated "place" — a landmark
// plus the structures/landmarks/collaborators that derive context
// from it. Never persisted; recomputed on demand from world state.
export class PlaceContext {
    constructor({ landmark, nearbyStructures = [], nearbyLandmarks = [], collaborators = [] } = {}) {
        this._landmark = landmark || null;
        this._nearbyStructures = Array.from(nearbyStructures);
        this._nearbyLandmarks = Array.from(nearbyLandmarks);
        this._collaborators = Array.from(collaborators);
    }

    get landmark() { return this._landmark; }
    get title() { return this._landmark ? this._landmark.title : ''; }
    get description() { return this._landmark ? this._landmark.description : ''; }
    get position() { return this._landmark ? this._landmark.position : null; }
    get nearbyStructures() { return this._nearbyStructures; }
    get nearbyLandmarks() { return this._nearbyLandmarks; }
    get collaborators() { return this._collaborators; }
    get isEmpty() { return !this._landmark; }

    toJSON() {
        return {
            landmark: this._landmark ? this._landmark.toJSON() : null,
            nearbyStructures: this._nearbyStructures.map(s => ({
                id: s.id,
                title: s.title,
                position: s.position,
                distance: s.distance
            })),
            nearbyLandmarks: this._nearbyLandmarks.map(l => ({
                id: l.id,
                title: l.title,
                distance: l.distance
            })),
            collaborators: this._collaborators.map(c => ({
                identityId: c.identityId,
                label: c.label,
                activity: c.activity
            }))
        };
    }
}

// The main entry point: given a world state and optional collaborator
// presence data, derive all meaningful place contexts. Returns an array
// of PlaceContext objects, one per landmark that has any nearby content.
//
// Parameters:
//   - landmarks: array of WorldLandmark instances
//   - structurePlacements: array of StructurePlacement instances
//   - structureTitles: Map<documentId, title> for resolving placement titles
//   - collaborators: optional array of { identityId, label, position, activity }
//
// Returns: array of PlaceContext objects (may be empty if no landmarks exist)
export function derivePlaceContexts({ landmarks, structurePlacements, structureTitles = new Map(), collaborators = [] } = {}) {
    if (!landmarks || landmarks.length === 0) {
        return [];
    }

    const contexts = [];

    for (const landmark of landmarks) {
        const landmarkPos = landmark.position;

        // Find nearby structures
        const nearbyStructures = [];
        for (const placement of structurePlacements) {
            const distance = distanceXZ(landmarkPos, placement.position);
            if (distance !== null && distance <= CURATION_PROXIMITY_RADIUS) {
                nearbyStructures.push({
                    id: placement.id,
                    documentId: placement.documentId,
                    title: structureTitles.get(placement.documentId) || 'Untitled Structure',
                    position: placement.position,
                    distance: Math.round(distance * 10) / 10
                });
            }
        }

        // Sort by distance for consistent ordering
        nearbyStructures.sort((a, b) => a.distance - b.distance);

        // Find nearby landmarks (excluding self)
        const nearbyLandmarks = [];
        for (const other of landmarks) {
            if (other.id === landmark.id) continue;
            const distance = distanceXZ(landmarkPos, other.position);
            if (distance !== null && distance <= CURATION_PROXIMITY_RADIUS) {
                nearbyLandmarks.push({
                    id: other.id,
                    title: other.title,
                    distance: Math.round(distance * 10) / 10
                });
            }
        }
        nearbyLandmarks.sort((a, b) => a.distance - b.distance);

        // Find nearby collaborators
        const nearbyCollaborators = [];
        for (const collab of collaborators) {
            if (!collab.position) continue;
            const distance = distanceXZ(landmarkPos, collab.position);
            if (distance !== null && distance <= CURATION_PROXIMITY_RADIUS) {
                nearbyCollaborators.push({
                    identityId: collab.identityId,
                    label: collab.label,
                    activity: collab.activity,
                    distance: Math.round(distance * 10) / 10
                });
            }
        }
        nearbyCollaborators.sort((a, b) => a.distance - b.distance);

        // Only include this place if it has any nearby content
        if (nearbyStructures.length > 0 || nearbyLandmarks.length > 0 || nearbyCollaborators.length > 0) {
            contexts.push(new PlaceContext({
                landmark,
                nearbyStructures,
                nearbyLandmarks,
                collaborators: nearbyCollaborators
            }));
        }
    }

    // Sort by landmark title for deterministic ordering
    contexts.sort((a, b) => a.title.localeCompare(b.title));

    return contexts;
}

// Derive a single place context for a specific landmark id.
// Returns null if the landmark doesn't exist or has no nearby content.
export function derivePlaceContextFor({ landmarkId, landmarks, structurePlacements, structureTitles = new Map(), collaborators = [] } = {}) {
    const landmark = landmarks.find(l => l.id === landmarkId);
    if (!landmark) {
        return null;
    }

    const contexts = derivePlaceContexts({
        landmarks: [landmark],
        structurePlacements,
        structureTitles,
        collaborators
    });

    return contexts.length > 0 ? contexts[0] : null;
}

// Given a position, find the nearest landmark within range.
// Returns { landmark, distance } or null if none found.
export function findNearestLandmark({ position, landmarks, maxDistance = CURATION_PROXIMITY_RADIUS } = {}) {
    if (!position || !landmarks || landmarks.length === 0) {
        return null;
    }

    let nearest = null;
    let minDistance = maxDistance;

    for (const landmark of landmarks) {
        const distance = distanceXZ(position, landmark.position);
        if (distance !== null && distance < minDistance) {
            minDistance = distance;
            nearest = landmark;
        }
    }

    return nearest ? { landmark: nearest, distance: Math.round(minDistance * 10) / 10 } : null;
}

// Build a human-readable "you are here" message based on spatial context.
// E.g., "You are in Village, near the Market" or "You are near Old Bridge".
export function describeLocation({ position, landmarks, structurePlacements, structureTitles = new Map() } = {}) {
    if (!position) {
        return '';
    }

    const nearest = findNearestLandmark({ position, landmarks });
    if (!nearest) {
        // Check if near any structure
        let nearestStructure = null;
        let minDistance = 15;
        for (const placement of structurePlacements) {
            const distance = distanceXZ(position, placement.position);
            if (distance !== null && distance < minDistance) {
                minDistance = distance;
                nearestStructure = placement;
            }
        }
        if (nearestStructure) {
            const title = structureTitles.get(nearestStructure.documentId) || 'Structure';
            return `Near ${title}`;
        }
        return '';
    }

    const { landmark, distance } = nearest;
    const prefix = distance < 15 ? 'In' : 'Near';
    return `${prefix} ${landmark.title}`;
}
