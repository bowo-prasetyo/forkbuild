// EditorSession pointer and keyboard input forwarded from EditorView: gizmo
// drags, Shift+Drag marquee selection, touch taps, and key events.

// Shift+Click adds one brick; Shift+Drag draws a box. Movement under this many
// pixels counts as a click.
const MARQUEE_DRAG_THRESHOLD_PX = 6;

// A finger moves a little even when tapping, so touch gets a wider margin.
const TOUCH_TAP_SLOP_PX = 10;

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
export const pointerInputMethods = {
    onPointerDown(event) {
        if (event.pointerType === 'touch') {
            return this._onTouchPointerDown(event);
        }
        if (event.button === 0 && this._session
            && this._session.gizmoPointerDown(event.clientX, event.clientY, this._editorContext.selection)) {
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
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerMove(event);
        }
        return null;
    },

    onPointerUp(event) {
        if (event.pointerType === 'touch') {
            return this._onTouchPointerUp(event);
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
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerUp(event);
        }
        return null;
    },

    // The browser took the touch over (e.g. for scrolling), so it is no tap.
    onPointerCancel(event) {
        if (event.pointerType !== 'touch') {
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
            this._touchTap = null;
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
            this._inputDispatcher.dispatchPointerMove(click);
            this._inputDispatcher.dispatchPointerDown({ ...click, buttons: 1 });
            this._inputDispatcher.dispatchPointerUp(click);
        }
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
