// 0.3.9 — World Welcome & Guided Exploration.
//
// WorldWelcomeContext is a DERIVED, ephemeral reading of the World state
// at arrival time — never persisted, never owned, never authoritative.
// It answers: "I just entered this World. What should I look at, and why
// should I care?"
//
// This file implements the principle: "Exploration Guides Attention, Never
// Ownership or Mutation." A Welcome Context describes the World; it does
// not become part of the World.
//
// Key design decisions:
//   - All data is DERIVED from existing World content and presence
//   - No new persistence layer or storage
//   - No quest system, objectives, XP, achievements, or gamification
//   - Suggestions are ephemeral presentation hints only
//   - Camera navigation uses existing focusLocation()/focusCollaborator()
//
// See docs/Principles.md, "Exploration Guides Attention, Never Ownership
// or Mutation (0.3.9)."
import { distanceXZ } from './WorldSpatialAnchor.js';

// How far to look for nearby content when building welcome context.
// Deliberately generous to ensure meaningful first impressions.
const WELCOME_CONTEXT_RADIUS = 80;

// An ephemeral suggestion for where to explore next.
// Never persisted; purely a presentation hint derived from World state.
export class WorldExplorationSuggestion {
    constructor({ location, reason, kind = 'default' } = {}) {
        if (!location) {
            throw new Error('WorldExplorationSuggestion requires a location');
        }
        if (!reason) {
            throw new Error('WorldExplorationSuggestion requires a reason');
        }
        
        // Valid kinds: 'landmark', 'structure', 'collaborator', 'place'
        const validKinds = ['landmark', 'structure', 'collaborator', 'place', 'default'];
        if (!validKinds.includes(kind)) {
            throw new Error(`Invalid suggestion kind: ${kind}`);
        }
        
        this._location = location;
        this._reason = reason;
        this._kind = kind;
    }
    
    get location() { return this._location; }
    get reason() { return this._reason; }
    get kind() { return this._kind; }
    
    // The target position to focus on
    get position() {
        if (this._location.landmark) {
            return this._location.landmark.position;
        }
        if (this._location.structure) {
            return this._location.structure.position;
        }
        if (this._location.collaborator) {
            return this._location.collaborator.position;
        }
        if (this._location.place) {
            return this._location.place.position;
        }
        return null;
    }
    
    // Human-readable label for UI display
    get label() {
        if (this._location.landmark) {
            return this._location.landmark.title || 'Landmark';
        }
        if (this._location.structure) {
            return this._location.structure.title || 'Structure';
        }
        if (this._location.collaborator) {
            return this._location.collaborator.label || 'Collaborator';
        }
        if (this._location.place) {
            return this._location.place.title || 'Place';
        }
        return 'Unknown';
    }
    
    toJSON() {
        return {
            location: this._location,
            reason: this._reason,
            kind: this._kind,
            label: this.label,
            position: this.position
        };
    }
}

// The main welcome context value object.
// Contains everything needed to render a meaningful arrival experience.
export class WorldWelcomeContext {
    constructor({
        world,
        currentPlace,
        nearbyLandmarks = [],
        nearbyStructures = [],
        nearbyCollaborators = [],
        suggestedDestinations = [],
        activitySummary = []
    } = {}) {
        this._world = world || null;
        this._currentPlace = currentPlace || null;
        this._nearbyLandmarks = Array.from(nearbyLandmarks);
        this._nearbyStructures = Array.from(nearbyStructures);
        this._nearbyCollaborators = Array.from(nearbyCollaborators);
        this._suggestedDestinations = Array.from(suggestedDestinations);
        this._activitySummary = Array.from(activitySummary);
    }
    
    get world() { return this._world; }
    get worldId() { return this._world ? this._world.id : null; }
    get worldTitle() { return this._world && this._world.metadata ? this._world.metadata.title : 'Untitled World'; }
    get currentPlace() { return this._currentPlace; }
    get nearbyLandmarks() { return this._nearbyLandmarks; }
    get nearbyStructures() { return this._nearbyStructures; }
    get nearbyCollaborators() { return this._nearbyCollaborators; }
    get suggestedDestinations() { return this._suggestedDestinations; }
    get activitySummary() { return this._activitySummary; }
    
    // Count of structures in this welcome context
    get structureCount() { return this._nearbyStructures.length; }
    
    // Count of landmarks in this welcome context
    get landmarkCount() { return this._nearbyLandmarks.length; }
    
    // Count of collaborators currently present
    get collaboratorCount() { return this._nearbyCollaborators.length; }
    
    // Whether there's anything interesting to show
    get hasContent() {
        return this.structureCount > 0 || 
               this.landmarkCount > 0 || 
               this.collaboratorCount > 0;
    }
    
    // Get the primary suggested destination (first in list)
    get primarySuggestion() {
        return this._suggestedDestinations[0] || null;
    }
    
    // Human-readable summary for display
    get summary() {
        const parts = [];
        
        if (this.worldTitle) {
            parts.push(this.worldTitle);
        }
        
        const details = [];
        if (this.landmarkCount > 0) {
            details.push(`${this.landmarkCount} landmark${this.landmarkCount !== 1 ? 's' : ''}`);
        }
        if (this.structureCount > 0) {
            details.push(`${this.structureCount} structure${this.structureCount !== 1 ? 's' : ''}`);
        }
        if (this.collaboratorCount > 0) {
            details.push(`${this.collaboratorCount} ${this.collaboratorCount === 1 ? 'person' : 'people'} here now`);
        }
        
        if (details.length > 0) {
            parts.push(details.join(' · '));
        }
        
        return parts.join('\n');
    }
    
    toJSON() {
        return {
            world: this._world ? { id: this._world.id, title: this.worldTitle } : null,
            currentPlace: this._currentPlace ? this._currentPlace.toJSON?.() : null,
            nearbyLandmarks: this._nearbyLandmarks.map(l => ({
                id: l.id,
                title: l.title,
                distance: l.distance
            })),
            nearbyStructures: this._nearbyStructures.map(s => ({
                id: s.id,
                title: s.title,
                distance: s.distance
            })),
            nearbyCollaborators: this._nearbyCollaborators.map(c => ({
                identityId: c.identityId,
                label: c.label,
                activity: c.activity,
                deviceId: c.deviceId,
                distance: c.distance
            })),
            suggestedDestinations: this._suggestedDestinations.map(s => s.toJSON()),
            activitySummary: this._activitySummary,
            structureCount: this.structureCount,
            landmarkCount: this.landmarkCount,
            collaboratorCount: this.collaboratorCount,
            hasContent: this.hasContent,
            summary: this.summary
        };
    }
}

// Derive a welcome context from World state and presence.
// This is the primary entry point for computing welcome context.
//
// Parameters:
//   - world: the World instance
//   - position: current avatar/camera position (optional, for proximity-based filtering)
//   - landmarks: array of WorldLandmark instances
//   - structurePlacements: array of StructurePlacement instances
//   - structureTitles: Map<documentId, title> for resolving placement titles
//   - collaborators: array of { identityId, label, position, activity }
//   - placeContexts: optional pre-computed PlaceContext array from WorldCurationContext
//
// Returns: WorldWelcomeContext instance
export function deriveWorldWelcomeContext({
    world,
    position,
    landmarks = [],
    structurePlacements = [],
    structureTitles = new Map(),
    collaborators = [],
    placeContexts = []
} = {}) {
    if (!world) {
        throw new Error('deriveWorldWelcomeContext requires a world');
    }
    
    // Find nearby landmarks. With no position given, include all of
    // them (distance unranked) rather than filtering by proximity.
    const nearbyLandmarks = [];
    for (const landmark of landmarks) {
        if (!position) {
            nearbyLandmarks.push({
                id: landmark.id,
                title: landmark.title,
                position: landmark.position,
                distance: null
            });
            continue;
        }
        const distance = distanceXZ(position, landmark.position);
        if (distance !== null && distance <= WELCOME_CONTEXT_RADIUS) {
            nearbyLandmarks.push({
                id: landmark.id,
                title: landmark.title,
                position: landmark.position,
                distance: Math.round(distance * 10) / 10
            });
        }
    }
    nearbyLandmarks.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    // Find nearby structures
    const nearbyStructures = [];
    for (const placement of structurePlacements) {
        if (position) {
            const distance = distanceXZ(position, placement.position);
            if (distance !== null && distance <= WELCOME_CONTEXT_RADIUS) {
                nearbyStructures.push({
                    id: placement.id,
                    documentId: placement.documentId,
                    title: structureTitles.get(placement.documentId) || 'Untitled Structure',
                    position: placement.position,
                    distance: Math.round(distance * 10) / 10
                });
            }
        } else {
            nearbyStructures.push({
                id: placement.id,
                documentId: placement.documentId,
                title: structureTitles.get(placement.documentId) || 'Untitled Structure',
                position: placement.position,
                distance: null
            });
        }
    }
    nearbyStructures.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    // Find nearby collaborators
    const nearbyCollaborators = [];
    for (const collab of collaborators) {
        if (!collab.position) continue;
        if (position) {
            const distance = distanceXZ(position, collab.position);
            if (distance !== null && distance <= WELCOME_CONTEXT_RADIUS) {
                nearbyCollaborators.push({
                    identityId: collab.identityId,
                    label: collab.label,
                    activity: collab.activity,
                    position: collab.position,
                    // Carried through, unfiltered, so a "Follow" action
                    // built from a suggestion/row can call
                    // focusCollaborator(deviceId) directly — see
                    // application/WorldNavigationSession.js#_getPresentCollaborators().
                    deviceId: collab.deviceId,
                    distance: Math.round(distance * 10) / 10
                });
            }
        } else {
            nearbyCollaborators.push({
                identityId: collab.identityId,
                label: collab.label,
                activity: collab.activity,
                position: collab.position,
                deviceId: collab.deviceId,
                distance: null
            });
        }
    }
    nearbyCollaborators.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    // Determine current place context (nearest landmark with content)
    let currentPlace = null;
    if (position && placeContexts && placeContexts.length > 0) {
        // Find the place context that contains our position
        for (const place of placeContexts) {
            const placePos = place.position;
            if (!placePos) continue;
            const distance = distanceXZ(position, placePos);
            if (distance !== null && distance <= WELCOME_CONTEXT_RADIUS) {
                currentPlace = place;
                break;
            }
        }
    }
    if (!currentPlace && placeContexts.length > 0) {
        // Fall back to first available place
        currentPlace = placeContexts[0];
    }
    
    // Generate suggested destinations
    const suggestions = deriveExplorationSuggestions({
        position,
        landmarks: nearbyLandmarks,
        structures: nearbyStructures,
        collaborators: nearbyCollaborators,
        currentPlace
    });
    
    // Generate activity summary ("What's happening?")
    const activitySummary = deriveActivitySummary(collaborators);
    
    return new WorldWelcomeContext({
        world,
        currentPlace,
        nearbyLandmarks,
        nearbyStructures,
        nearbyCollaborators,
        suggestedDestinations: suggestions,
        activitySummary
    });
}

// Derive exploration suggestions from available content.
// Returns an array of WorldExplorationSuggestion instances.
function deriveExplorationSuggestions({
    position,
    landmarks = [],
    structures = [],
    collaborators = [],
    currentPlace
} = {}) {
    const suggestions = [];
    
    // Priority 1: Active collaborators doing something interesting
    for (const collab of collaborators) {
        if (collab.activity && collab.position) {
            suggestions.push(new WorldExplorationSuggestion({
                location: { collaborator: collab },
                reason: `${collab.label} is ${formatActivity(collab.activity)}`,
                kind: 'collaborator'
            }));
        }
    }
    
    // Priority 2: Landmarks (especially if we're in a place)
    for (const landmark of landmarks) {
        let reason = 'Nearby landmark';
        if (currentPlace && currentPlace.landmark && currentPlace.landmark.id === landmark.id) {
            reason = 'You are here';
        }
        suggestions.push(new WorldExplorationSuggestion({
            location: { landmark },
            reason,
            kind: 'landmark'
        }));
    }
    
    // Priority 3: Structures
    for (const structure of structures) {
        suggestions.push(new WorldExplorationSuggestion({
            location: { structure },
            reason: 'A structure in this place',
            kind: 'structure'
        }));
    }
    
    // Priority 4: Current place itself (if different from landmark)
    if (currentPlace && currentPlace.title && !landmarks.some(l => l.title === currentPlace.title)) {
        suggestions.push(new WorldExplorationSuggestion({
            location: { place: currentPlace },
            reason: 'Explore this area',
            kind: 'place'
        }));
    }
    
    return suggestions;
}

// Derive a human-readable activity summary from collaborators.
// E.g., "Bob is building the Market"
function deriveActivitySummary(collaborators = []) {
    const summaries = [];
    
    for (const collab of collaborators) {
        if (collab.activity && collab.label) {
            const activityText = formatActivity(collab.activity);
            const target = collab.activityTarget ? ` the ${collab.activityTarget}` : '';
            summaries.push(`${collab.label} is ${activityText}${target}`);
        }
    }
    
    return summaries;
}

// Format activity enum into human-readable text
function formatActivity(activity) {
    if (!activity) return 'exploring';
    
    const activityMap = {
        'BUILDING': 'building',
        'EDITING': 'editing',
        'INSPECTING': 'inspecting',
        'WALKING': 'exploring',
        'IDLE': 'standing by'
    };
    
    return activityMap[activity] || activity.toLowerCase();
}
