// Normalizes raw DOM PointerEvent/KeyboardEvent/WheelEvent into stable,
// platform-independent interaction events, performs picking ONCE per
// pointer event (so tools never call PickingService themselves), and
// forwards everything to ToolManager. This is where "input" and "where
// does it go" meet: DOM specifics stop here — ToolManager and every Tool
// only ever see the normalized shapes below, never a browser Event.
//
// pointerType is the raw event's own ('mouse', 'pen' or 'touch'). Touch
// arrives only as whole taps, replayed by EditorSession's pointer input
// (application/editorSession/pointerInputMethods.js), so no Tool needs
// touch-specific handling.
//
// Interaction pointer event shape:
//   {
//       pointerType,              // 'mouse', 'pen' or 'touch'
//       buttons,                  // bitmask, matches native PointerEvent.buttons
//       modifiers: { ctrl, shift, alt, meta },
//       screenPosition: { x, y },
//       worldPosition,            // core/Position | null — ground-plane hit
//       pickedBrick,               // { brickId, buildingId } | null
//       pickedPlacement            // { placementId, point, normal, distance } | null (0.2.91; normal added 0.9.611)
//   }
//
// pickedBrick, pickedPlacement, and worldPosition are always computed,
// regardless of which one a given tool ends up using — InputDispatcher
// only normalizes and computes, it never decides what a tool should do
// with the result. That's a conscious trade-off: extra raycasts per
// pointer move instead of one, in exchange for every tool receiving a
// complete, uniform snapshot of "what's under the cursor" rather than
// InputDispatcher guessing which part a given tool cares about.
//
// pickPlacement (0.2.91, optional) — a SEPARATE raycast against
// StructurePlacement meshes (renderer/PlacementMeshRegistry.js), never
// merged into pickedBrick: a placement's bricks are never registered
// with the ordinary brick mesh registry at all (renderer/WorldRenderer.js's
// 0.2.90 header), so the two picks are always disjoint in practice.
// Optional so a caller/test harness that never wires one in (an older
// call site, or a surface that has no placements at all) simply always
// gets pickedPlacement: null, never a thrown error.
export class InputDispatcher {
    constructor(toolManager, pick, pickGround, pickPlacement = null) {
        this._toolManager = toolManager;
        this._pick = pick;
        this._pickGround = pickGround;
        this._pickPlacement = pickPlacement;
    }

    dispatchPointerMove(rawEvent) {
        this._toolManager.onPointerMove(this._toInteractionEvent(rawEvent));
    }

    dispatchPointerDown(rawEvent) {
        this._toolManager.onPointerDown(this._toInteractionEvent(rawEvent));
    }

    dispatchPointerUp(rawEvent) {
        this._toolManager.onPointerUp(this._toInteractionEvent(rawEvent));
    }

    dispatchKeyDown(rawEvent) {
        this._toolManager.onKeyDown(this._toKeyEvent(rawEvent));
    }

    _toInteractionEvent(rawEvent) {
        const screenPosition = { x: rawEvent.clientX, y: rawEvent.clientY };

        return {
            pointerType: rawEvent.pointerType || 'mouse',
            buttons: rawEvent.buttons,
            modifiers: this._toModifiers(rawEvent),
            screenPosition,
            worldPosition: this._pickGround(screenPosition.x, screenPosition.y),
            pickedBrick: this._pick(screenPosition.x, screenPosition.y),
            pickedPlacement: this._pickPlacement ? this._pickPlacement(screenPosition.x, screenPosition.y) : null
        };
    }

    _toKeyEvent(rawEvent) {
        return {
            key: rawEvent.key,
            modifiers: this._toModifiers(rawEvent)
        };
    }

    _toModifiers(rawEvent) {
        return {
            ctrl: rawEvent.ctrlKey || false,
            shift: rawEvent.shiftKey || false,
            alt: rawEvent.altKey || false,
            meta: rawEvent.metaKey || false
        };
    }
}
