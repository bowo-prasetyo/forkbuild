import { EditorEvent } from '../core/events/EditorEvent.js';

// The single entry point for the Brick Palette. Deliberately holds no
// state of its own: "what's available" already lives in BrickRegistry,
// "what's currently selected" already lives in EditorContext.activeBrick
// (built in 0.1.9 for exactly this). A separate PaletteModel duplicating
// either would risk the two disagreeing.
//
// onActiveBrickChanged() wraps the event subscription too, so ui/ never
// needs to import core/events/EditorEvent itself just to react when the
// active brick changes from somewhere other than a palette click (e.g. a
// future keyboard shortcut cycling through recently-used bricks).
export class PaletteUseCase {
    constructor(registry, editorContext) {
        this._registry = registry;
        this._editorContext = editorContext;
    }

    getDefinitions() {
        return this._registry.getAll();
    }

    getDefinitionsByCategory(category) {
        return this._registry.getByCategory(category);
    }

    getSelectedDefinitionId() {
        return this._editorContext.activeBrick.definitionId;
    }

    selectDefinition(definitionId) {
        this._editorContext.setActiveBrick(definitionId);
    }

    // Returns an unsubscribe function.
    onActiveBrickChanged(callback) {
        const subscription = this._editorContext.eventBus.subscribe(
            EditorEvent.ACTIVE_BRICK_CHANGED,
            ({ definitionId }) => callback(definitionId)
        );
        return () => subscription.unsubscribe();
    }
}
