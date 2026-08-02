// Application events describing what CommandHistory just did — NOT
// domain events (World doesn't know about undo/redo) and NOT editor
// events (EditorContext doesn't own command history; selection/tool/
// preview state is a different concern). Both CommandHistory (publisher)
// and its subscribers (DocumentManager today) live in application/, so
// unlike DomainEvent/EditorEvent this vocabulary doesn't need to sit in
// core/ — the lowest layer both sides can reach without depending on
// each other is application/ itself, this time.
export const CommandHistoryEvent = Object.freeze({
    COMMAND_EXECUTED: 'CommandExecuted',
    COMMAND_UNDONE: 'CommandUndone',
    COMMAND_REDONE: 'CommandRedone'
});
