# Controls Reference

Every mouse and keyboard interaction in ForkBuild. **Editing shortcuts
on this page come from the same EditorActionRegistry that drives the
command palette and the sidebar** — if this document and the palette
ever disagree, the registry is the source of truth and this page is a
bug.

Open the **Command Palette** with `Ctrl/Cmd+K` in either view to search
every operation below by name.

## Camera (both views)

| Input | Action |
|---|---|
| Left-drag on empty space | Orbit |
| Right-drag | Pan |
| Scroll wheel | Zoom |
| `Home` | Reset camera (ignored while a gizmo drag is active) |

## Command Surface (both views)

| Input | Action |
|---|---|
| `Ctrl/Cmd+K` | Command Palette |

## Discovery (World View)

Not keyboard shortcuts, but the World View's own way of finding things — see
[World View](03-WorldView.md#finding-worlds) for the full explanation.

| Control | Action |
|---|---|
| Search panel, **Find** | Search publications by title/author, optionally within a radius of a coordinate |
| **Explore Here** | Open the Explore Location dialog centered on the camera's current position |
| **What's Here?** | Same, with a small fixed radius — "what's essentially right here" |
| A result's **Focus** | Fly the camera there and make it the active (editing) document |
| A result's **Select** | Make it the active document, without moving the camera |
| A result's **Inspect** | Expand a read-only summary in place |

## Selection

| Input | Action | Notes |
|---|---|---|
| Click a brick | Select it | |
| `Ctrl/Cmd/Shift`-click | Toggle brick in/out of selection | |
| Drag on empty space | Marquee-select | additive with `Ctrl/Cmd/Shift` |
| `Ctrl/Cmd+A` | Select All | |
| `Esc` | Clear Selection | last stop of the Escape chain |
| `Delete` / `Backspace` | Delete Selection | one undo step |

## Transform — keyboard

| Input | Action |
|---|---|
| `→` / `←` | Move selection along world X |
| `↑` / `↓` | Move selection along world Z |
| `PgUp` / `PgDn` | Move selection along world Y |
| `R` | Rotate +90° around the selection pivot |
| `Shift+R` | Rotate −90° |
| `Shift` while gizmo-dragging or nudging | Precision mode (0.1× increments) |

## Transform — gizmo

| Input | Action |
|---|---|
| Hover a handle | Highlights it |
| Drag an axis handle (red X / green Y / blue Z) | Move along that axis (snapped) |
| Drag the center pad (amber) | Free move on the ground plane |
| Drag the rotation ring (purple) | Rotate around the pivot (snapped) |
| Release | Commit — exactly one undo step |
| `Esc` mid-drag | Cancel — nothing changes, no history |

## Transform — numeric panel

| Input | Action |
|---|---|
| Type in X/Y/Z/R fields | Exact values; empty field = unchanged |
| Absolute / Offset toggle | Target-the-pivot vs. plain delta |
| `Enter` or Apply | One operation, one undo step — never snapped |
| `Esc` in a field | Clear the field (never clears the selection) |

## Alignment & Distribution

Available in the sidebar's Transform section and through the palette.
Alignment needs **2+ bricks**; distribution needs **3+**. Both operate
on the whole selection bounds in **world axes** and commit one command.

## Groups

| Operation | Availability |
|---|---|
| Create Group | bricks selected |
| Rename / Duplicate / Delete Group | a group selected |
| Add Selection / Remove Selection | bricks selected and a group selected |

Group transforms (move/rotate/align/distribute/numeric) operate on the
resolved member bricks; membership itself is never changed by a
transform.

## Clipboard

| Input | Action | Notes |
|---|---|---|
| `Ctrl/Cmd+C` | Copy | requires a selection |
| `Ctrl/Cmd+V` | Paste | disabled while the clipboard is empty |

## History

| Input | Action |
|---|---|
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo |

## Editor-only

| Input | Action |
|---|---|
| `1` / `2` | Switch Select / Place tool |
| `Ctrl/Cmd+S` | Save document |

## Escape priority

Escape is context-sensitive, in exactly this order:

1. **Active text input** — clears/blurs the field.
2. **Command palette** — closes the palette.
3. **Active gizmo gesture** — cancels the drag (no history).
4. **Active marquee** — cancels the marquee.
5. **Otherwise** — clears the selection (in Place mode: exits placement).
