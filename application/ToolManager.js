import { EditorEvent } from '../core/events/EditorEvent.js';

// Owns "what is the current tool" and dispatches input to it. Doesn't
// decide what tools exist (that's ToolRegistry) or what "the active tool"
// means (that's EditorContext.tool, via ToolState, set through
// EditorContext.setActiveTool() — unchanged since 0.1.9). ToolManager is
// just the glue: when the active tool id changes (EditorEvent.TOOL_CHANGED),
// resolve it to a live Tool instance via ToolRegistry, deactivate() the
// old one, activate() the new one, and forward every subsequent input
// event to whichever tool is currently active.
export class ToolManager {
    constructor(toolRegistry, toolContext, editorContext) {
        this._toolRegistry = toolRegistry;
        this._toolContext = toolContext;
        this._editorContext = editorContext;
        this._activeTool = null;
        this._subscription = null;
    }

    start() {
        this._activateTool(this._editorContext.tool.activeTool);
        this._subscription = this._editorContext.eventBus.subscribe(
            EditorEvent.TOOL_CHANGED,
            ({ activeTool }) => this._activateTool(activeTool)
        );
    }

    stop() {
        if (this._subscription) {
            this._subscription.unsubscribe();
            this._subscription = null;
        }
        if (this._activeTool) {
            this._activeTool.deactivate();
            this._activeTool = null;
        }
    }

    onPointerMove(pointerEvent) {
        if (this._activeTool) {
            this._activeTool.onPointerMove(pointerEvent);
        }
    }

    onPointerDown(pointerEvent) {
        if (this._activeTool) {
            this._activeTool.onPointerDown(pointerEvent);
        }
    }

    onPointerUp(pointerEvent) {
        if (this._activeTool) {
            this._activeTool.onPointerUp(pointerEvent);
        }
    }

    onKeyDown(keyEvent) {
        if (this._activeTool) {
            this._activeTool.onKeyDown(keyEvent);
        }
    }

    onKeyUp(keyEvent) {
        if (this._activeTool) {
            this._activeTool.onKeyUp(keyEvent);
        }
    }

    onWheel(wheelEvent) {
        if (this._activeTool) {
            this._activeTool.onWheel(wheelEvent);
        }
    }

    _activateTool(toolId) {
        if (this._activeTool) {
            this._activeTool.deactivate();
        }
        const ToolClass = this._toolRegistry.get(toolId);
        this._activeTool = ToolClass ? new ToolClass(this._toolContext) : null;
        if (this._activeTool) {
            this._activeTool.activate();
        }
    }
}
