import { EditorContext } from './EditorContext.js';

// Builds the EditorContext for an editing session, with its own EventBus —
// separate from the domain EventBus World publishes through. Mirrors
// CreateEventBusUseCase/CreateBrickRegistryUseCase: application/
// constructs it, ui/ (or a future non-Vue client) just receives it.
export class CreateEditorContextUseCase {
    execute() {
        return new EditorContext();
    }
}
