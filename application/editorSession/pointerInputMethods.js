import { PLACING_TOOLS, ToolId } from '../editor-state/ToolId.js';

// EditorSession pointer and keyboard input forwarded from EditorView: gizmo
// drags, Shift+Drag marquee selection, touch taps, mouse clicks that place,
// and key events.

// Shift+Click adds one brick; Shift+Drag draws a box. Movement under this many
// pixels counts as a click.
const MARQUEE_DRAG_THRESHOLD_PX = 6;

// A finger moves a little even when tapping, so touch gets a wider margin.
const TOUCH_TAP_SLOP_PX = 10;

// While placing by touch, a second tap this close to the one that showed the
// ghost (the camera unmoved) places it: a fingertip on the ghost.
const PLACE_AGAIN_TAP_PX = 28;

// Touch: one finger both orbits the camera and taps, and the tools act on
// pointer-down, so a touch reaches the tools only once it lifts as a tap (no
// second finger, little movement). It then replays as a hover, press and
// release at that point, so Place gets a fresh preview to commit instead of the
// last hover, which touch never had. Multi-select mode makes each tap a
// Ctrl-click, toggling a brick in or out of the selection. Gizmo handles still
// take the touch at once, as they do a mouse.
//
// Box-select mode makes a one-finger drag the Shift-drag marquee (additive with
// Multi-select on, like Ctrl+Shift). As for Shift-drag, the camera controls are
// off while the box is drawn, so they never see that finger: a second finger
// cancels the box rather than becoming a pinch.
//
// Touch while placing takes two steps, since a finger has no hover to show
// the ghost first: a tap moves the ghost there, and a second tap places it
// when it lands close to the tap that showed it (the camera unmoved) or on the
// ghost's own spot. The touch bar's Place does the same, and its Cancel puts
// the piece down. So nothing lands before it has been seen, and Rotate and
// Tilt turn a ghost that is on screen.
//
// Mouse and pen while placing: a press also starts the camera's orbit (left)
// or pan (right), so the placing tools see it only once it is released as a
// click, the rule touch follows: the left button, moved under
// MARQUEE_DRAG_THRESHOLD_PX. It then replays as a hover, press and release at
// that point. Other buttons never place. Hover still reaches the tools as it
// happens, so the ghost keeps following the pointer.
//
// Placing a brick, Shift+drag lays a row instead of drawing a box: the press,
// moves and release go straight to PlacementTool, with the camera controls
// off so they don't pan (Shift+drag) under the row. Escape or a cancelled
// pointer drops the row.

export const pointerInputMethods = {
    onPointerDown(event) {
        if (event.pointerType === 'touch') {
            return this._onTouchPointerDown(event);
        }
        if (event.button === 0 && this._session
            && this._session.gizmoPointerDown(event.clientX, event.clientY, this._editorContext.selection)) {
            return null;
        }
        if (event.button === 0 && event.shiftKey && this._editorContext.tool.activeTool === ToolId.PLACE) {
            this._rowPress = { pointerId: event.pointerId };
            if (this._session) {
                this._session.setControlsEnabled(false);
            }
            if (this._inputDispatcher) {
                this._inputDispatcher.dispatchPointerDown(event);
            }
            return null;
        }
        // A Shift-held left button starts a marquee instead of reaching SelectionTool.
        // Checked after the gizmo so Shift on a gizmo handle still means precision.
        // Click or marquee is decided on release.
        if (event.button === 0 && event.shiftKey) {
            this._marqueeState = {
                additive: !!(event.ctrlKey || event.metaKey),
                x0: event.clientX,
                y0: event.clientY,
                x1: event.clientX,
                y1: event.clientY,
                moved: false
            };
            // The marquee must own the pointer like the gizmo does, or orbit pans the
            // scene under the rectangle.
            if (this._session) {
                this._session.setControlsEnabled(false);
            }
            return null;
        }
        if (this._isPlacing()) {
            this._placePress = event.button === 0
                ? { pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, moved: false }
                : null;
            return null;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerDown(event);
        }
        return null;
    },

    onPointerMove(event) {
        if (event.pointerType === 'touch') {
            return this._onTouchPointerMove(event);
        }
        if (this._marqueeState) {
            this._marqueeState.x1 = event.clientX;
            this._marqueeState.y1 = event.clientY;
            const dx = this._marqueeState.x1 - this._marqueeState.x0;
            const dy = this._marqueeState.y1 - this._marqueeState.y0;
            if (Math.hypot(dx, dy) > MARQUEE_DRAG_THRESHOLD_PX) {
                this._marqueeState.moved = true;
            }
            return null;
        }
        if (this._session) {
            const result = this._session.gizmoPointerMove(
                event.clientX,
                event.clientY,
                this._editorContext.selection,
                this._toKeyEvent(event).modifiers
            );
            if (result && result.consumed) {
                return result;
            }
        }
        const press = this._placePress;
        if (press && press.pointerId === event.pointerId
            && Math.hypot(event.clientX - press.x0, event.clientY - press.y0) > MARQUEE_DRAG_THRESHOLD_PX) {
            press.moved = true;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerMove(event);
        }
        return null;
    },

    onPointerUp(event) {
        if (event.pointerType === 'touch') {
            return this._onTouchPointerUp(event);
        }
        if (this._rowPress && this._rowPress.pointerId === event.pointerId) {
            this._rowPress = null;
            if (this._session) {
                this._session.setControlsEnabled(true);
            }
            if (this._inputDispatcher) {
                this._inputDispatcher.dispatchPointerUp(event);
            }
            return null;
        }
        if (this._marqueeState) {
            const { x0, y0, x1, y1, additive, moved } = this._marqueeState;
            this._marqueeState = null;
            if (this._session) {
                this._session.setControlsEnabled(true);
            }
            if (moved) {
                this.marqueeSelect({ x0, y0, x1, y1 }, { additive });
            } else if (this._inputDispatcher) {
                // Never passed the threshold: replay as an ordinary Shift-click.
                this._inputDispatcher.dispatchPointerDown(event);
                this._inputDispatcher.dispatchPointerUp(event);
            }
            return null;
        }
        if (this._session) {
            const result = this._session.gizmoPointerUp(
                event.clientX,
                event.clientY,
                this._editorContext.selection,
                this._toKeyEvent(event).modifiers
            );
            if (result && result.consumed) {
                this._refreshGizmo();
                return result;
            }
        }
        if (this._isPlacing()) {
            const press = this._placePress;
            this._placePress = null;
            if (press && press.pointerId === event.pointerId && event.button === 0 && !press.moved
                && Math.hypot(event.clientX - press.x0, event.clientY - press.y0) <= MARQUEE_DRAG_THRESHOLD_PX) {
                this._replayClick(event);
            }
            return null;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerUp(event);
        }
        return null;
    },

    // The browser took the pointer over, so it is no tap or click.
    onPointerCancel(event) {
        if (this._rowPress && this._rowPress.pointerId === event.pointerId) {
            this.cancelRow();
            return;
        }
        if (event.pointerType !== 'touch') {
            if (this._placePress && this._placePress.pointerId === event.pointerId) {
                this._placePress = null;
            }
            return;
        }
        this._touchPointerIds.delete(event.pointerId);
        if (this._marqueeState && this._marqueeState.pointerId === event.pointerId) {
            this.cancelMarquee();
        }
        if (this._touchTap && this._touchTap.pointerId === event.pointerId) {
            this._touchTap = null;
        }
    },

    // A Shift+drag row being laid (see above).
    isRowActive() {
        return this._rowPress !== null && this._rowPress !== undefined;
    },

    // Drops the row being laid; nothing is placed.
    cancelRow() {
        if (!this.isRowActive()) return;
        this._rowPress = null;
        if (this._session) {
            this._session.setControlsEnabled(true);
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchKeyDown({ key: 'Escape' });
        }
    },

    setTouchMultiSelect(active) {
        this._touchMultiSelect = Boolean(active);
    },

    isTouchMultiSelect() {
        return this._touchMultiSelect;
    },

    setTouchBoxSelect(active) {
        this._touchBoxSelect = Boolean(active);
    },

    isTouchBoxSelect() {
        return this._touchBoxSelect;
    },

    _onTouchPointerDown(event) {
        // The first finger down starts afresh, so an id whose pointerup was never
        // delivered cannot turn every later tap into a pinch.
        if (event.isPrimary) {
            this._touchPointerIds.clear();
        }
        this._touchPointerIds.add(event.pointerId);
        if (this._touchPointerIds.size > 1) {
            // A second finger: pinch or pan, never a tap or a box.
            this._touchTap = null;
            this._lastPlacingTap = null;
            this.cancelMarquee();
            return null;
        }
        if (this._session
            && this._session.gizmoPointerDown(event.clientX, event.clientY, this._editorContext.selection)) {
            this._touchTap = null;
            return null;
        }
        if (this._touchBoxSelect) {
            this._marqueeState = {
                pointerId: event.pointerId,
                additive: this._touchMultiSelect,
                x0: event.clientX,
                y0: event.clientY,
                x1: event.clientX,
                y1: event.clientY,
                moved: false
            };
            if (this._session) {
                this._session.setControlsEnabled(false);
            }
            return null;
        }
        this._touchTap = { pointerId: event.pointerId, x0: event.clientX, y0: event.clientY };
        return null;
    },

    _onTouchPointerMove(event) {
        const marquee = this._marqueeState;
        if (marquee && marquee.pointerId === event.pointerId) {
            marquee.x1 = event.clientX;
            marquee.y1 = event.clientY;
            if (Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) > TOUCH_TAP_SLOP_PX) {
                marquee.moved = true;
            }
            return null;
        }
        const tap = this._touchTap;
        if (tap && tap.pointerId === event.pointerId
            && Math.hypot(event.clientX - tap.x0, event.clientY - tap.y0) > TOUCH_TAP_SLOP_PX) {
            // A drag turns the camera, so the ghost has moved on screen.
            this._touchTap = null;
            this._lastPlacingTap = null;
        }
        if (this._session) {
            const result = this._session.gizmoPointerMove(
                event.clientX,
                event.clientY,
                this._editorContext.selection,
                this._toKeyEvent(event).modifiers
            );
            if (result && result.consumed) {
                return result;
            }
        }
        // No hover on touch: a finger on the glass is always a press.
        return null;
    },

    _onTouchPointerUp(event) {
        this._touchPointerIds.delete(event.pointerId);
        const marquee = this._marqueeState;
        if (marquee && marquee.pointerId === event.pointerId) {
            this.cancelMarquee();
            if (marquee.moved) {
                const { x0, y0, x1, y1, additive } = marquee;
                this.marqueeSelect({ x0, y0, x1, y1 }, { additive });
            } else {
                // Never passed the slop: an ordinary tap.
                this._replayTouchTap(event);
            }
            return null;
        }
        if (this._session) {
            const result = this._session.gizmoPointerUp(
                event.clientX,
                event.clientY,
                this._editorContext.selection,
                this._toKeyEvent(event).modifiers
            );
            if (result && result.consumed) {
                this._refreshGizmo();
                return result;
            }
        }
        const tap = this._touchTap;
        if (!tap || tap.pointerId !== event.pointerId) {
            return null;
        }
        this._touchTap = null;
        this._replayTouchTap(event);
        return null;
    },

    _replayTouchTap(event) {
        if (this._inputDispatcher) {
            const placing = this._isPlacing();
            const ghostBefore = placing ? this._placingGhostKey() : null;
            const last = placing ? this._lastPlacingTap : null;
            const click = {
                pointerType: 'touch',
                clientX: event.clientX,
                clientY: event.clientY,
                button: 0,
                buttons: 0,
                ctrlKey: this._touchMultiSelect,
                shiftKey: false,
                altKey: false,
                metaKey: false
            };
            // On the ghost by where it was tapped: placed as it stands, since a
            // finger on a stacked ghost can hit the ground behind it.
            if (last && ghostBefore !== null && last.ghost === ghostBefore
                && Math.hypot(click.clientX - last.click.clientX, click.clientY - last.click.clientY) <= PLACE_AGAIN_TAP_PX) {
                this._placeAt(last.click);
                return;
            }
            this._inputDispatcher.dispatchPointerMove(click);
            if (placing) {
                const ghost = this._placingGhostKey();
                // The first tap only shows where it would go.
                if (ghostBefore === null || ghostBefore !== ghost) {
                    this._lastPlacingTap = ghost === null ? null : { click, ghost };
                    return;
                }
                this._placeAt(click);
                return;
            }
            this._inputDispatcher.dispatchPointerDown({ ...click, buttons: 1 });
            this._inputDispatcher.dispatchPointerUp(click);
        }
    },

    _placeAt(click) {
        this._lastPlacingTap = null;
        this._inputDispatcher.dispatchPointerDown({ ...click, buttons: 1 });
        this._inputDispatcher.dispatchPointerUp(click);
    },

    // Whether a piece being placed shows its ghost (the touch bar's Place).
    hasPlacementGhost() {
        return this._isPlacing() && this._placingGhostKey() !== null;
    },

    // The touch bar's Place: puts the piece down where its ghost is, as a tap on
    // the ghost would. False with no ghost to place.
    confirmPlacement() {
        if (!this.hasPlacementGhost() || !this._inputDispatcher) {
            return false;
        }
        this._placeAt(this._lastPlacingTap?.click || { pointerType: 'touch', clientX: 0, clientY: 0, button: 0, buttons: 0 });
        return true;
    },

    // The touch bar's Cancel (Escape on a keyboard): stops placing and goes
    // back to Select, with nothing placed. False when nothing is being placed.
    cancelPlacement() {
        if (!this._isPlacing()) {
            return false;
        }
        this._lastPlacingTap = null;
        if (this._editorContext.tool.activeTool === ToolId.COMPOSE_STRUCTURE) {
            this._editorContext.setActiveComposition(null);
        }
        this._editorContext.setActiveTool(ToolId.SELECT);
        return true;
    },

    // Where the active placing tool's ghost is, as text to compare, or null
    // when it shows none.
    _placingGhostKey() {
        const context = this._editorContext;
        const preview = {
            [ToolId.PLACE]: context.preview,
            [ToolId.COMPOSE_STRUCTURE]: context.compositionPreview,
            [ToolId.PLACE_STRUCTURE]: context.structurePreview
        }[context.tool?.activeTool];
        if (!preview || !preview.visible || !preview.position) {
            return null;
        }
        const { x, y, z } = preview.position;
        return `${x},${y},${z}`;
    },

    // A mouse or pen click while placing, replayed at its release point.
    _replayClick(event) {
        if (this._inputDispatcher) {
            // Copied field by field: a DOM event's fields are getters a spread drops.
            const click = {
                pointerType: event.pointerType,
                clientX: event.clientX,
                clientY: event.clientY,
                button: 0,
                buttons: 0,
                ctrlKey: event.ctrlKey || false,
                shiftKey: event.shiftKey || false,
                altKey: event.altKey || false,
                metaKey: event.metaKey || false
            };
            this._inputDispatcher.dispatchPointerMove(click);
            this._inputDispatcher.dispatchPointerDown({ ...click, buttons: 1 });
            this._inputDispatcher.dispatchPointerUp(click);
        }
    },

    _isPlacing() {
        return PLACING_TOOLS.has(this._editorContext.tool?.activeTool);
    },

    // Marquee UI: read by EditorView to draw the overlay and to route Escape
    // (gesture > marquee > selection).
    isMarqueeActive() {
        return !!this._marqueeState;
    },

    getMarqueeRect() {
        if (!this._marqueeState) {
            return null;
        }
        const { x0, y0, x1, y1 } = this._marqueeState;
        return { x0, y0, x1, y1 };
    },

    cancelMarquee() {
        if (!this._marqueeState) {
            return false;
        }
        this._marqueeState = null;
        if (this._session) {
            this._session.setControlsEnabled(true);
        }
        return true;
    },

    onKeyDown(event) {
        const keyEvent = this._toKeyEvent(event);
        if (this._session
            && this._session.gizmoKeyDown(keyEvent, this._editorContext.selection)) {
            this._refreshGizmo();
            return;
        }
        if (this.isGestureActive()) {
            return;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchKeyDown(event);
        }
    },

    _toKeyEvent(event) {
        return {
            key: event.key,
            modifiers: {
                ctrl: event.ctrlKey || false,
                shift: event.shiftKey || false,
                alt: event.altKey || false,
                meta: event.metaKey || false
            }
        };
    }
};
