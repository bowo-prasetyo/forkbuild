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
    GROUP_UPDATED: 'GroupUpdated'
});
