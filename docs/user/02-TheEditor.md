# 02 — The Editor

The Editor is where you build. This guide covers the tools, how to select and
transform bricks, and how to organize your build with groups.

## The layout

`
<pre>
┌────────────────────────────────────────────────────────────┐
│ Toolbar: Save · Publish · New · Saved ● · Recent │
├──────────────┬─────────────────────────────────────────────┤
│ Tools │ │
│ Select │ │
│ Place │ 3D Viewport │
│ │ │
│ Brick │ │
│ Palette │ │
│ │ │
│ Groups │ │
└──────────────┴─────────────────────────────────────────────┘
</pre>
`


- **Toolbar** — save, publish, start a new creation, and reopen recent ones.
- **Tools** — switch between **Select** (`1`) and **Place** (`2`).
- **Brick Palette** — the bricks you can build with.
- **Groups** — organize bricks into named collections.

## The two tools

### Place tool (`2`)

Pick a brick from the palette, hover in the viewport, and click to place it.
A translucent ghost shows exactly where the brick will land. Hover over an
existing brick's face to stack or attach.

> **Tip:** Press **Escape** to switch back to the Select tool.

### Select tool (`1`)

Click bricks to select them, then move, rotate, or delete them. This is where
you spend most of your time once the shape is roughed in.

## Selecting bricks

ForkBuild gives you precise control over selection:

| Action | Result |
|---|---|
| **Click** a brick | Selects it (replaces the current selection) |
| **Ctrl/Cmd + Click** | Toggles that brick in or out of the selection |
| **Shift + Click** | Adds that brick to the selection |
| **Shift + Drag** | Draws a box — selects everything inside |
| **Ctrl/Cmd + Shift + Drag** | Box-select and *add* to the current selection |
| **Ctrl/Cmd + A** | Select every brick in the creation |
| **Escape** | Clear the selection |

> **Why it matters:** Building anything bigger than a single brick means
> working with *many* bricks at once. Learn the Shift-drag marquee early —
> it's the fastest way to grab a whole wall.

## Moving, rotating, and deleting

With one or more bricks selected:

| Key | Action |
|---|---|
| **Arrow keys** | Nudge left/right/forward/back |
| **Page Up / Page Down** | Nudge up / down |
| **R** | Rotate 90° clockwise |
| **Shift + R** | Rotate 90° counter-clockwise |
| **Delete / Backspace** | Remove the selected bricks |

When you select multiple bricks, they rotate around their **shared center**, so
a whole section swings as one unit.

## Copy and paste

| Key | Action |
|---|---|
| **Ctrl/Cmd + C** | Copy the selected bricks |
| **Ctrl/Cmd + V** | Paste them (slightly offset so you can see them) |

This is perfect for repeating elements — build one window, then copy-paste it
across a facade.

## Undo and redo

Every change is recorded, so you can always go back:

| Key | Action |
|---|---|
| **Ctrl/Cmd + Z** | Undo the last action |
| **Ctrl/Cmd + Y** *(or Ctrl/Cmd+Shift+Z)* | Redo it |

Moving ten bricks counts as **one** undo step, so undo stays manageable even on
big builds.

## Groups

Groups let you name and reuse collections of bricks — like "Roof" or "Windows".

**Create a group:**
1. Select some bricks.
2. In the **Groups** panel, click **+ Group Selection** and give it a name.

**Use a group:**

| Button | What it does |
|---|---|
| **Select** | Selects all the bricks in that group |
| **+Sel** | Adds your current selection to the group |
| **−Sel** | Removes your current selection from the group |
| **Rename** | Change the group's name |
| **Duplicate** | Copy the whole group *and* its bricks |
| **Delete** | Delete the group (the bricks themselves are kept) |

> **Good to know:** Selecting a group just selects its bricks — it never
> changes the group. And deleting a group only removes the *label*, not the
> bricks inside it.

## Saving, publishing, starting over

- **Save** (`Ctrl+S`) — keep your work on this device.
- **Publish** — share it with everyone (see
  [Publishing & Forking](04-PublishingAndForking.md)).
- **New** — start a fresh, empty creation.
- **Recent** — reopen something you saved before.

## Camera controls

- **Drag** — orbit around the scene
- **Scroll** — zoom in and out
- **Home** — reset the camera to the default view
