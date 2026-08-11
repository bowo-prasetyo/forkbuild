=== FILE: ./docs/user/ControlsReference.md ===
# Controls Reference

All mouse and keyboard controls in ForkBuild, for both the Editor and
the World View. New in 0.1.46: the interactive transform gizmo, marked
with ★ below.

## Camera (both views)

| Input | Action |
|---|---|
| Left-drag on empty space | Orbit |
| Right-drag | Pan |
| Scroll wheel | Zoom |
| `Home` | Reset camera (ignored while a gizmo drag is active) |

## Editor

### Tools

Switch tools with the sidebar buttons, or the temporary shortcuts
`1` (Select) and `2` (Place).

### Select tool

| Input | Action |
|---|---|
| Click a brick | Select it |
| `Ctrl/Cmd/Shift`-click a brick | Toggle it in/out of the selection |
| Drag on empty space | Marquee-select |
| Click empty space | Clear selection |
| `Escape` | Clear selection (or cancel an active gizmo drag) |
| `Delete` / `Backspace` | Delete the selection (one undo step) |

### Transforming the selection

| Input | Action |
|---|---|
| Arrow keys | Nudge selection on X/Z (grid step) |
| `Page Up` / `Page Down` | Nudge selection on Y |
| `R` / `Shift+R` | Rotate selection ±90° around its pivot |
| ★ Drag a gizmo handle | Interactive translate/rotate (see the gizmo guide) |

### Place tool

| Input | Action |
|---|---|
| Move pointer | Ghost preview follows ground / brick faces |
| Click | Place the brick (one undo step) |
| Palette click | Choose which brick to place |

### Global

| Input | Action |
|---|---|
| `Ctrl/Cmd+S` | Save |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` (or `Ctrl/Cmd+Shift+Z`) | Redo |

## World View

### Navigation

Orbit/pan/zoom/Home as above. Nearby worlds are listed in the overlay —
click one to fly to it. The camera position drives which worlds stream
in and out.

### Selection & inspection

| Input | Action |
|---|---|
| Click a brick | Select & inspect it |
| `Ctrl/Cmd/Shift`-click | Toggle brick in/out of the selection |
| Hover | Transient identity panel (no selection change) |
| Click ground | Select ground point |
| `Escape` | Clear selection / cancel placement / cancel gizmo drag |

### Editing (Select tool)

| Input | Action |
|---|---|
| Arrow keys / `Page Up` / `Page Down` | Nudge selection |
| `R` / `Shift+R` | Rotate selection ±90° |
| `Delete` / `Backspace` | Delete selection |
| ★ Gizmo drag | Interactive translate/rotate |
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Y` | Undo / Redo |

### Placement (Place tool)

Choose a brick from the overlay dropdown, hover ground or a brick face,
click to place. `Escape` returns to the Select tool.

## The interactive transform gizmo ★

Appears whenever bricks are selected (in either view). Full details in
the [Interactive Transform Gizmo guide](InteractiveTransformGizmo.md).

| Input | Action |
|---|---|
| Hover a handle | Highlights it |
| Drag an axis handle (red X / green Y / blue Z) | Move along that axis |
| Drag the center pad (amber) | Free move on the ground plane |
| Drag the rotation ring (purple) | Rotate around the pivot |
| Release | Commit — exactly one undo step |
| `Escape` mid-drag | Cancel — nothing changes, no history |
| Click-release without moving | Nothing happens (no history entry) |

While a gizmo drag is active, the camera, selection, and all shortcuts
are frozen — the gesture owns the pointer until you release or cancel.
