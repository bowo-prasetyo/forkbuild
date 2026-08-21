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
│ Build Library │ │
│ [Bricks|Structures] │ │
│ │ │
│ Selection │ │
│ Transform │ │
│ Groups │ │
│ Clipboard │ │
└──────────────┴─────────────────────────────────────────────┘
</pre>
`


- **Toolbar** — save, publish, start a new creation, and reopen recent ones.
- **Tools** — switch between **Select** (`1`) and **Place** (`2`).
- **Build Library** — a search box and two tabs:
  - **Bricks** — everything you can place with the Place tool, grouped by
    category. Click one to select it (and switch to the Place tool).
  - **Structures** — six ready-made structures (House, Barn, Well, Market,
    Mill, Bridge), also grouped by category. Click **Fork** on one to start
    a brand-new creation of your own, already containing that structure —
    the exact same bricks, editable with every tool in this guide. Forking
    never changes the library's own copy: fork House ten times and each one
    is its own independent creation from the moment you click Fork.
- **Selection / Transform / Groups / Clipboard** — the editing sidebar,
  covered in the sections below.

> **Tip:** Press `Ctrl/Cmd+K` anywhere to open the **Command Palette** — a
> searchable list of every action in this guide, by name.

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

## Precise transforms: alignment, distribution, and numeric input

The sidebar's **Transform** section (below Selection) gives you two more
exact ways to move a selection, alongside the gizmo and the keys above:

- **Alignment & Distribution** — nine buttons to align the whole selection's
  edges or centers on a world axis (Left/Center/Right, Bottom/Center/Top,
  Front/Center/Back), plus three to spread it evenly (Distribute X/Y/Z).
  Alignment needs **2+ bricks** selected; distribution needs **3+**.
- **Numeric Transform** — type exact X/Y/Z/Rotation values instead of
  dragging. Toggle **Absolute** (the values are a target for the selection's
  pivot/orientation) or **Offset** (the values are added as a delta), then
  press **Apply** (or `Enter` in a field). An empty field means "leave this
  unchanged," never zero.

Either way, the whole operation is **one undo step**, exactly like a gizmo
drag or a keyboard nudge — see the
[Controls Reference](ControlsReference.md#transform--numeric-panel) for the
full field-by-field behavior.

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

## Structures: placing and editing instances

Forking a structure from the Build Library (above) gives you a brand-new,
independent document. Sometimes what you want instead is to drop a copy of
something you've already built — any saved document, not just a library
structure — into the creation you're working on right now, without leaving
it. That's a **structure instance**:

1. Open the **Recent** dropdown in the toolbar.
2. Next to any saved document, click **Place** (instead of **Load**).
3. Hover the ground, press `R` to rotate, and click to place it — exactly
   like placing a brick.

An instance is a live *reference* to that document, not a copy of its
bricks: the same document can be placed any number of times, and editing the
source document's bricks later updates every instance of it. Select an
instance with the Select tool (`1`) and the sidebar shows:

| Control | What it does |
|---|---|
| Drag in the viewport, or the [gizmo](InteractiveTransformGizmo.md) | Move / rotate, same as a brick |
| Arrow keys / Page Up / Page Down | Nudge |
| **X / Z / Rotation ° fields, then Apply** | Set an exact position and heading — elevation (Ground Y) always follows the terrain and isn't a target you set |
| **Rotate ↻ / ↺** | Rotate exactly 90° |
| **Duplicate** (`Ctrl/Cmd+D`) | Place another instance of the same structure |
| **Delete** | Remove this instance — the source document is untouched |
| **Edit Source Document** | Open the referenced document itself, to change what every instance of it looks like |

Editing a placed structure's *content* always happens by editing its source
document — there's no way to edit an instance's bricks directly, which is
exactly what keeps every instance of it in sync.

## Document Properties

Every creation has a **title**, an optional **description**, and a
**license** — set them by clicking **Edit Metadata** (in World View) or the
first time you save a brand-new document. The description shows up as a
snippet on its Repository card and is searchable there too; the license
controls whether — and how — other people are allowed to fork it. See
[Publishing & Forking](04-PublishingAndForking.md) for what each license
means.

## Saving, publishing, starting over

- **Save** (`Ctrl+S`) — keep your work on this device.
- **Publish** — share it with everyone (see
  [Publishing & Forking](04-PublishingAndForking.md)).
- **New** — start a fresh, empty creation.
- **Recent** — reopen something you saved before. Once you've saved enough
  documents, a filter box appears so you can jump straight to one by name.
  Each entry also has a **Place** button — see
  [Structures: placing and editing instances](#structures-placing-and-editing-instances)
  — for adding it to your *current* document instead of replacing it.

## Camera controls

- **Drag** — orbit around the scene
- **Scroll** — zoom in and out
- **Home** — reset the camera to the default view
