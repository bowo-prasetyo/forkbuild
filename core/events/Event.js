// Domain event type constants. World publishes these; anything (renderer,
// future undo history, autosave, multiplayer, publisher...) can subscribe
// without World ever knowing they exist.
export const DomainEvent = Object.freeze({
    BRICK_ADDED: 'BrickAdded',
    BRICK_REMOVED: 'BrickRemoved',
    BRICK_UPDATED: 'BrickUpdated',
    BUILDING_ADDED: 'BuildingAdded',
    BUILDING_REMOVED: 'BuildingRemoved',
    // 0.1.43 — groups are document state, so their lifecycle is a domain
    // concern exactly like bricks and buildings.
    GROUP_ADDED: 'GroupAdded',
    GROUP_REMOVED: 'GroupRemoved',
    GROUP_UPDATED: 'GroupUpdated',
    // 0.2.90 — a StructurePlacement is document state exactly like a
    // Building or a Group, so its lifecycle publishes the same way.
    // 0.2.91 — World Instance Editing & Placement Management adds
    // STRUCTURE_PLACEMENT_UPDATED: an already-placed instance can now be
    // moved/rotated in place (core/World.js#updateStructurePlacement()),
    // exactly the BRICK_UPDATED precedent for a Brick's own
    // position/rotation — never a remove+re-add, so the placement's id
    // (and anything referencing it, like a selection) survives the edit.
    STRUCTURE_PLACEMENT_ADDED: 'StructurePlacementAdded',
    STRUCTURE_PLACEMENT_REMOVED: 'StructurePlacementRemoved',
    STRUCTURE_PLACEMENT_UPDATED: 'StructurePlacementUpdated',
    // 0.3.7 — World Landmarks & Personal Waypoints: explicit, persistent
    // World content. A WorldLandmark's lifecycle is a domain concern
    // exactly like StructurePlacement above.
    WORLD_LANDMARK_ADDED: 'WorldLandmarkAdded',
    WORLD_LANDMARK_REMOVED: 'WorldLandmarkRemoved',
    WORLD_LANDMARK_UPDATED: 'WorldLandmarkUpdated'
});
