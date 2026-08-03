// Base class every tool extends. Uses pointer-event terminology
// (onPointerMove/Down/Up), not mouse-specific terms, so touch, stylus, and
// VR controller input can drive the exact same tools later without any
// API changes.
//
// As of 0.1.18, pointer events arrive pre-normalized and pre-picked by
// InputDispatcher — { pointerType, buttons, modifiers, screenPosition,
// worldPosition, pickedBrick }. A tool never calls PickingService itself
// (context no longer even exposes pick()/pickGround()); it just reads
// pickedBrick/worldPosition off the event it's handed. Key/wheel events
// are similarly normalized ({ key, modifiers } / { deltaY, modifiers }).
//
// A tool receives its ToolContext once, at construction — the context
// doesn't change while a tool is active. ToolManager owns calling
// activate()/deactivate() on tool switches and forwarding every input
// event to whichever tool is currently active; a tool never reaches
// outside its own context to find out what's going on.
export class Tool {
    constructor(context) {
        this.context = context;
    }

    activate() {}
    deactivate() {}
    onPointerMove(pointerEvent) {}
    onPointerDown(pointerEvent) {}
    onPointerUp(pointerEvent) {}
    onKeyDown(keyEvent) {}
    onKeyUp(keyEvent) {}
    onWheel(wheelEvent) {}
}
