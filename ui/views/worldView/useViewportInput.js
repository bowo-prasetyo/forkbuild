import { InputRouter } from '../../../application/InputRouter.js';

const DRAG_THRESHOLD_PX = 6;

// Viewport input: pointer picks and hovers (focus and inspection only), and
// keyboard shortcuts routed to text inputs, Undo/Redo, then Avatar Control Mode.
export function useViewportInput({
    compassHeading, onAvatarKeyDown, redoAction, refreshHoverUI, refreshSpatialUI, session, undoAction
}) {
    let pointerStart = null;
    let isDragging = false;

    function onPointerDown(event) {
        isDragging = false;
        pointerStart = { x: event.clientX, y: event.clientY };
    }

    function onPointerMove(event) {
        if (pointerStart) {
            const dx = event.clientX - pointerStart.x;
            const dy = event.clientY - pointerStart.y;
            if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
                isDragging = true;
            }
        }
        if (event.buttons === 0) {
            session.hover(event.clientX, event.clientY);
            refreshHoverUI();
        }
        // Keep the compass turning during an orbit drag.
        if (isDragging && event.buttons !== 0) {
            compassHeading.value = session.getCompassHeading();
        }
    }

    function onPointerUp(event) {
        if (!isDragging && pointerStart) {
            session.pick(event.clientX, event.clientY, {
                toggle: event.ctrlKey || event.metaKey,
                additive: event.shiftKey
            });
            refreshSpatialUI();
        } else if (isDragging) {
            compassHeading.value = session.getCompassHeading();
        }
        pointerStart = null;
        isDragging = false;
    }

    function onKeyDown(event) {
        if (InputRouter.isTextInputTarget(event.target)) {
            if (event.key === 'Escape') {
                event.target.blur();
            }
            return;
        }
        // 2. Undo/Redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, as in the Editor.
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undoAction();
                return;
            }
            if ((key === 'z' && event.shiftKey) || key === 'y') {
                event.preventDefault();
                redoAction();
                return;
            }
        }
        // 3. Avatar Control Mode consumes W/A/S/D/Shift/Space only while on.
        if (onAvatarKeyDown(event)) {
            return;
        }
    }

    return {
        onKeyDown, onPointerDown, onPointerMove, onPointerUp
    };
}
