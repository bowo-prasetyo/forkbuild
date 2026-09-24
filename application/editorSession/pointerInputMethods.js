// EditorSession pointer and keyboard input forwarded from EditorView: gizmo
// drags, Shift+Drag marquee selection, and key events.

// Shift+Click adds one brick; Shift+Drag draws a box. Movement under this many
// pixels counts as a click.
const MARQUEE_DRAG_THRESHOLD_PX = 6;

export const pointerInputMethods = {
    onPointerDown(event) {
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
