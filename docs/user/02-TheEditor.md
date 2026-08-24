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
  - **Structures** — twenty ready-made structures across five categories
    (residential, agricultural, commercial, community, infrastructure),
    plus your own **My Structures**. Click a card to place it — see
    [Structures: composing, forking, and your personal library](#structures-composing-forking-and-your-personal-library)
    below.
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

> **Collisions are blocked.** Dragging the gizmo or nudging with the keyboard
> checks the result against every brick outside the selection. If releasing
> would land any member on top of one of them, the whole move is cancelled
> instead of committed — every brick in the selection snaps back to exactly
> where it started, with no new undo entry. Rearranging bricks *within* your
> own selection (like swapping two bricks' places with a rotation) is never
> treated as a collision.

## Copy, paste, and duplicate

| Key | Action |
|---|---|
| **Ctrl/Cmd + C** | Copy the selected bricks |
| **Ctrl/Cmd + V** | Paste them (slightly offset so you can see them) |
| **Ctrl/Cmd + D** | Duplicate the selection in place — copy and paste in one step |

Copy-then-paste is perfect for repeating elements — build one window, then
copy-paste it across a facade. **Duplicate** does the same job in a single
gesture and a single undo step, and leaves your clipboard untouched: an
earlier Ctrl+C is still there to paste after you duplicate something else.
The duplicate becomes your new selection, so the natural flow is
select → duplicate → drag or nudge it into place. Duplicate works on any
selection — loose bricks, a full group, or a single
[structure instance](#structure-instances-a-live-reference).

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

## Structures: composing, forking, and your personal library

The Build Library's **Structures** tab (see [The layout](#the-layout) above)
gives you twenty ready-made structures — houses, barns, a well, a market, a
mill, a bridge, and more, across five categories — plus **My Structures**,
your own personal collection of anything you've saved from a build. There
are three different things you can do with any of them, and they matter for
different reasons:

- **Place** (click the card) — copies the structure's bricks straight into
  the document you're already working on, so it becomes part of one bigger
  build. This is the everyday action.
- **Fork As New Document** (in the card's **⋮** menu) — starts a brand-new,
  independent document that begins as an exact copy of that structure.
- Place a **saved document** of your own as a **structure instance** — a
  live, reusable reference rather than a copy — from the toolbar's **Recent**
  dropdown, not the Build Library. See
  [Structure instances](#structure-instances-a-live-reference) below.

### Placing a structure into your document

Click any card in the **Structures** tab — a built-in one or one of your own
**My Structures** — and a translucent ghost preview of the whole structure
appears, following your pointer over the ground, exactly like placing a
single brick:

1. Move the pointer to position the ghost.
2. Press `R` / `Shift+R` to rotate it in 90° steps.
3. Click to commit — every brick in the structure is added to your document
   as one **undo step**. An occupied position tints the ghost red and
   refuses the click, the same way a single brick refuses to place on top
   of another.
4. `Escape` cancels — nothing is added, and you're returned to whichever
   tool you were using before.

The bricks you get are ordinary bricks in your document from the moment
they land — indistinguishable from anything you placed by hand, free to
edit, select, group, or delete like anything else. Placing several
structures is a fast way to build a scene: click House, place it; click
Barn, place it beside it; click Well, place it in the yard.

### Forking a structure as a new document

Open a card's **⋮** menu and click **Fork As New Document** to start a
brand-new creation of your own that begins as an exact copy of that
structure — the exact same bricks, editable with every tool in this guide,
in a document of its own rather than folded into whatever you currently
have open. Forking never changes the library's own copy: fork House ten
times and each one is its own independent creation from the moment you
click Fork.

### My Structures: your personal blueprint library

Built something worth reusing? Select the bricks that make it up (a whole
building, or just a section) and run **Create Structure** from the Command
Palette (`Ctrl/Cmd+K`). You'll be asked for a **name**, a **category**, and
an optional **description**; the structure is normalized to its own local
origin and saved immediately into **My Structures**, a new section at the
bottom of the Structures tab, right below the built-in categories.

A structure in **My Structures** works exactly like a built-in one — click
to place it into your current document, or Fork As New Document — with two
extra actions in its **⋮** menu:

| Action | What it does |
|---|---|
| **Rename** | Change its name, category, tags, or description |
| **Remove** | Delete it from your library |

**My Structures** only ever stores the *structure itself* — a name and a set
of bricks. Removing one never touches anything you already built with it:
every place you've already placed or forked it into keeps those bricks
exactly as they are. And it never edits in place — if you want to change
what a saved structure actually builds, place it into a document, edit
that document, then **Create Structure** again (optionally under a new
name, like "Farmstead Deluxe").

> **Good to know:** My Structures lives on this device. It isn't tied to
> your identity or synced anywhere automatically — see
> [Sharing blueprints](#sharing-blueprints-export-and-import) below for how
> to move one to another device or hand it to someone else.

### Sharing blueprints: export and import

Any structure in **My Structures** can leave the device it was created on
as a portable file, without ever becoming part of the shared published
World:

- **Export Blueprint** (in a personal structure's **⋮** menu) downloads it
  as a small JSON file — a self-contained snapshot of that structure's
  name, category, tags, description, and bricks.
- **Import Blueprint** (button beside the **My Structures** heading) reads
  a blueprint file back in and adds it to your own My Structures as a new,
  independent entry — a fresh copy with its own identity, never linked back
  to wherever it came from. Importing the same file twice gives you two
  separate entries, not one that silently overwrites the other. A malformed
  or unrecognized file is rejected with an explanation rather than silently
  producing something broken.

This is how you hand a build to a friend, or carry your own structures
between your own devices: export on one side, send the file however you
like, import on the other.

## Structure instances: a live reference

Placing (above) copies a structure's bricks into your document once.
Sometimes what you want instead is a **live** copy of something you've
already built — any saved document, not just something in your library —
that stays in sync with its source every time you look at it. That's a
**structure instance**: it references the source document rather than
copying its bricks, so editing the source later updates every instance of
it automatically.

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
  [Structure instances](#structure-instances-a-live-reference)
  — for adding it to your *current* document instead of replacing it.

## Camera controls

- **Drag** — orbit around the scene
- **Scroll** — zoom in and out
- **Home** — reset the camera to the default view
