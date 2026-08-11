=== FILE: ./docs/user/README.md ===
# ForkBuild User Documentation

How-to guides for using ForkBuild in the browser. Everything here
describes the product as it works today; engine internals live in
[docs/Architecture.md](../Architecture.md).

## Guides

- **[Controls Reference](ControlsReference.md)** — every mouse and
  keyboard interaction in the Editor and the World View, including the
  interactive transform gizmo.
- **[Interactive Transform Gizmo](InteractiveTransformGizmo.md)** — how
  to move and rotate your selection by dragging directly in the
  viewport: handles, the pivot, committing, cancelling, undo, and how
  groups behave.

## The two places you build

ForkBuild has two editing surfaces, and as of 0.1.46 they behave the
same way:

- **Editor** (`/editor`) — your private workspace. Place bricks from
  the palette, select them, and transform them with the keyboard or
  the gizmo. Save, load, and publish documents from the toolbar.
- **World View** (`/world/:id`) — the shared spatial world. Fly between
  published worlds, inspect bricks, and — with the same gizmo — edit
  them in place.

Whatever you do in either surface, every change is one undoable step,
and `Ctrl/Cmd+Z` takes it back.
