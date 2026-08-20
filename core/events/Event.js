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
    // There is no STRUCTURE_PLACEMENT_UPDATED: 0.2.90 deliberately does
    // not support moving/rotating an already-placed instance in place
    // (see docs/Roadmap.md, 0.2.91 — "World Editing / Placement
    // Management") — a placement is only ever added whole (with its
    // final position/rotation already chosen) or removed whole.
    STRUCTURE_PLACEMENT_ADDED: 'StructurePlacementAdded',
    STRUCTURE_PLACEMENT_REMOVED: 'StructurePlacementRemoved'
});
