=== FILE: ./docs/user/InteractiveTransformGizmo.md ===
# Interactive Transform Gizmo

*New in 0.1.46.* Whenever bricks are selected — in the Editor or in the
World View — a gizmo appears at the selection's pivot. Dragging its
handles moves or rotates the selection with a live preview; releasing
commits the change as **one undo step**.

## The gizmo

```
    Y
    ↑
    │
    │
    ●──────→ X        ●  pivot
   /
  /
 Z

    ◯
  ◯ ● ◯               rotation ring (Y axis)
    ◯
```

| Handle | Color | What it does |
|---|---|---|
| Axis arrow | Red (X) | Drag to move along X only |
| Axis arrow | Green (Y) | Drag to move along Y only |
| Axis arrow | Blue (Z) | Drag to move along Z only |
| Center pad | Amber | Free move on the ground plane (X + Z) |
| Rotation ring | Purple | Drag to rotate around the pivot |

Handles highlight when you hover them, and glow brighter while you
drag them. The gizmo keeps a comfortable screen size no matter how far
you zoom out.

## The pivot

The white marker at the gizmo's center is the **pivot**:

```
┌───────────────┐
│ ■ ■ │
│ │
│ + │ ← pivot (selection bounds center)
│ │
│ ■ ■ │
└───────────────┘
```


- Select one brick → the pivot sits at that brick's center.
- Select several bricks → the pivot sits at the center of the box
  around all of them.
- Rotation always happens around the pivot.

The pivot follows your selection automatically: select A, then add B,
then undo a move — the gizmo repositions itself every time.

## Moving

1. Select one or more bricks.
2. Grab an axis handle to move along that axis, or the center pad for
   free movement along the ground.
3. The selection follows the pointer live.
4. Release to commit.

## Rotating

1. Select one or more bricks.
2. Drag the purple ring. The selection rotates around the pivot as you
   drag.
3. Release to commit.

For multi-selections, every brick orbits around the shared pivot *and*
turns by the same angle — the arrangement keeps its shape.

## Committing, cancelling, doing nothing

| You… | Result |
|---|---|
| Release the mouse | Change committed — **exactly one** entry in the undo history, no matter how many bricks moved |
| Press `Escape` mid-drag | Cancel — everything snaps back exactly; history is untouched |
| Click-release without moving | Nothing — no command, no history entry |

`Ctrl/Cmd+Z` undoes the entire gesture in one step; `Ctrl/Cmd+Y` (or
`Ctrl/Cmd+Shift+Z`) redoes it.

## While you drag, the gesture owns the pointer

During a drag the camera will not orbit, nothing else can be selected,
and shortcuts are ignored — the drag can't accidentally fight the
camera. Release (commit) or `Escape` (cancel) returns everything to
normal. Releasing the mouse *outside* the viewport still commits
cleanly.

## Groups

Selecting a group selects its member bricks — and the gizmo treats
them exactly like any multi-selection:

- Drag moves every member; rotate spins every member around the shared
  pivot.
- The group itself is untouched: membership never changes because of a
  transform. (The gizmo doesn't even know groups exist.)
- One undo restores every member to where it was.

## Editor and World View: same gizmo, same behavior

The gizmo in the World View is not a different feature — it's the same
gesture with the same math. A 90° rotation or a 3-unit move produces an
identical result (and an identical history entry) in both surfaces, and
keyboard transforms (`R`, arrow keys) agree exactly with what a drag
does: what you see while dragging is precisely what gets committed.

## Snapping

Drags snap by default — 1 World Unit for movement, 15° for rotation — the
same increments keyboard nudging (`R`, arrow keys) uses, so a drag and a
keyboard move land in exactly the same place. Hold **Shift** while dragging
(or nudging) for **precision mode**: 0.1× the normal increment, for fine
adjustments the default grid is too coarse for.

The **numeric transform panel** and **alignment/distribution** are the
exception on purpose — they always apply the exact value or exact geometric
result you asked for, never snapped, since you already typed (or asked for)
something precise.

## Not in there yet

Deliberately — these are planned for upcoming milestones:

- **Scale handles** — the engine has no scale semantics yet; the gizmo
  will not pretend otherwise.
- **Drag-duplicate** — hold a modifier and drag to copy, coming later.

## Tips

- Hover the rotation ring and drag slowly for fine control — small
  pointer arcs near the pivot are still precise, because rotation is
  measured as an angle, not a distance.
- Use an axis handle when you want to keep two coordinates perfectly
  fixed — the constraint is exact, not visual.
- Combine surfaces: nudge with arrow keys for grid-aligned steps, then
  finish with a gizmo drag for free positioning. Both are the same
  operation under the hood, so undo/redo treats them uniformly.

