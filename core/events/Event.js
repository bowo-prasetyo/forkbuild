// Domain event type constants. World publishes these; anything (renderer,
// future undo history, autosave, multiplayer, publisher...) can subscribe
// without World ever knowing they exist.
export const DomainEvent = Object.freeze({
    BRICK_ADDED: 'BrickAdded',
    BRICK_REMOVED: 'BrickRemoved',
    BUILDING_ADDED: 'BuildingAdded',
    BUILDING_REMOVED: 'BuildingRemoved'
});
