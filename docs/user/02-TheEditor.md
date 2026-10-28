# 02 — The Editor

<!-- languages -->
**English** · [Deutsch](de/02-TheEditor.md) · [Español](es/02-TheEditor.md) · [Français](fr/02-TheEditor.md) · [Bahasa Indonesia](id/02-TheEditor.md) · [日本語](ja/02-TheEditor.md) · [한국어](ko/02-TheEditor.md) · [Português (Brasil)](pt-BR/02-TheEditor.md)
<!-- /languages -->

The Editor is where you build. This guide covers the tools, how to select and
transform bricks, and how to organize your build with groups.

## The layout

![The Editor](img/en/editor.jpg)
*The toolbar along the top; the tools, the build's name, the Selection panel and the Build Library on the left; the 3D view in the middle.*

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar: Save · Publish · New · Export · Import · Recent ·  │
│          ⌨ Shortcuts                                        │
├──────────────────────┬──────────────────────────────────────┤
│ [Select | Place]     │                                      │
│ Build title       ✎  │                                      │
│ Selection            │            3D Viewport               │
│ Build Library        │                                      │
│   [Bricks|Structures]│                                      │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Toolbar** — **Save**, **Publish** and **New** first, then **File**, a
  menu with **Export**, **3D model** and **Import**; reopen recent ones, and
  open the **⌨ Shortcuts** overlay (also `?`).
- **Tools** — switch between **Select** (`1`) and **Place** (`2`). **Place**
  stays highlighted while you're placing a brick or a structure.
  Pressing **Place** (or `2`) while you're placing keeps what you're
  holding.
  The tools stay at the top of the sidebar while everything under them scrolls.
- **Build title** — the open build's name. Click **✎** to edit its
  title, description and license. Whether it's saved is shown in the
  toolbar.
  Click the title itself (**▸**) to unfold the same **About this build**
  panel World View shows, with **Read more** for a long description;
  **▾** folds it again, and the Editor remembers which you chose.
- **Selection** — only shows what can act on your current selection; see
  [The Selection panel](#the-selection-panel) below.
  While you're placing, it steps aside so the Build Library comes first.
- **Build Library** — a search box and two tabs. Type part of a name, or
  say what you need in your own words: *something to cross the river*
  finds the Bridge, *somewhere to sleep* the Bed. The words each brick and
  structure is found by come with the app, so nothing is sent anywhere.
  From the keyboard, Down from the search box goes to the first thing it
  found, the arrow keys move between bricks or structures, and Enter picks
  one, as a click does.
  Its tabs and search stay in view while you scroll through it, and clicking
  **Place** brings the library up to the top.
  - **Bricks** — everything you can place with the Place tool, as tiles in
    six sections (Basic, Structure, Roofs & Stairs, Openings, Details,
    Nature): fifty-nine pieces, from half cubes, round bricks and logs to
    gable and cone roofs, hipped roofs that cover a whole house in one piece
    (4x4, 4x6 and 6x6) and a long 2x4 gable, framed and round windows,
    fences, benches, bushes and pine trees, furniture (a table, a bed, a
    hearth and a shelf, in Details) for the rooms you walk into, and a
    **Lantern** that lights up at night in World View (see
    [Day and night](03-WorldView.md#day-and-night)).
    Small pieces look small in their pictures (a **Cube** looks smaller than
    a **Block 2x2**), and each piece's size is written under its name: width
    × depth × height in grid units (a **Half Cube** is 1×1×½).
    Click one to select it (and switch to the Place tool); a
    **Color** swatch then appears for choosing its color — see
    [Brick colors](#brick-colors) below.
    **Slope 45°**, **Shallow Slope 2x1**, **Stair**, **Wide Stair** and
    **Diagonal Brace 2x2** rise toward one side; rotate one twice (**R**, **R**) to turn it the other way. A
    Diagonal Brace and a copy turned 180° make a cross.
  - **Structures** — twenty-two ready-made structures across five categories
    (residential, agricultural, commercial, community, infrastructure) and
    three larger **showcase** builds, plus your own **My Structures**. Click a card to place it — see
    [Structures: composing, remixing, and your personal library](#structures-composing-remixing-and-your-personal-library)
    below.

### The Selection panel

The panel changes with what you have selected, so it never shows buttons
that can't do anything yet:

- **Nothing selected** — a short hint, **Select All**, **Paste** once
  you've copied something, and your groups (click one to select its
  bricks).
- **Bricks selected** — how many, where they are, and the everyday
  actions: **Rotate ↻ / ↺**, **Duplicate**, **Delete**, **Copy**,
  **Paste**, **Color**, **Focus** and **Deselect**. Less frequent tools are
  folded into three sections underneath: **Exact position & rotation**,
  **Align, distribute, repeat**, and **Groups & blueprint**.
- **A structure instance selected** — its own card instead, with its
  position, rotation and actions (see
  [Structure instances](#structure-instances-a-live-reference)).

> **Tip:** Press `Ctrl/Cmd+K` anywhere to open the **Command Palette** — a
> searchable list of every action in this guide, by name.

## Try it now: a house to finish

Home's **Try it now** opens a house of your own that isn't finished: its
walls are up and its room is furnished, but it has no roof. A card at the
top of the tools gives you the job, one step at a time (**Step 1 of 4**),
each with a button that picks the brick it needs and switches to Place:

1. **Give it a roof**: click **Pick the roof** (**Hip Roof 6x6**), then
   click anywhere on the house: the roof goes on top of the walls.
2. **A chimney**: click **Pick the chimney**, then click anywhere on the
   house: it goes through the roof above the hearth.
3. **A path to the door**: click **Pick a stone**, then click anywhere on
   the house four times: the stones line up from the doorstep.
4. **A garden**: click **Pick a bush**, then put four things round the
   house, wherever you like. Bushes, a fence, a lawn, a rock, a tree or a
   lantern from the Build Library all count.

Each step counts the bricks you add, in any order, and undo takes a step
back. While the job is open, the **Your first build** card waits folded, so
there is one set of instructions at a time. Once all four steps are done,
the card says the house is yours now, with **Publish it** (the same Publish
as the toolbar's, which you can also use at any time) and **Keep
building**, which puts the card away.

Every other ready-made build (Home's cards, a challenge's ideas, or one
chosen under the Editor's **New**) opens with a **Make it yours** card
instead. Click **Pick a tree** (it chooses a tree and switches to Place),
then click the ground beside the build. Once something of your own is in it,
the card offers **Publish it** the same way. On a phone the card sits over the
3D view, above the touch buttons, because the tools are folded away there.

## Your first build

The first time you open the Editor on a device, a **Your first build** card
sits in the bottom-left corner of the 3D view (on a phone it starts folded
into a small **First build · 0/6** button at the top left, and while a
house from **Try it now** has its job open it waits folded too). It lists
six steps and shows a hint for the next one:

1. **Place a brick**
2. **Stack one on another**: place a brick on top of another.
3. **Add something of your own**: place five bricks of your own, one at a
   time. A structure dropped in from the Build Library doesn't count.
4. **Save your build**
5. **Publish and share a link**: Publish, then **Copy link** or **Share…**.
6. **Walk inside it**: click **Walk inside it**, beside the link Publish
   shows (or in the card), and walk in through the door of your build in
   World View (see
   [Walk inside it](04-PublishingAndForking.md#walk-inside-it)).

Each step is ticked off when you do it, in any order; undo and redo don't
count. When all six are done, the card celebrates and offers **See other
builds** or **Keep building**, then goes away; if it was already done before walking inside
was a step, it stays away.
While **Place** is on, the card shrinks to the next step's hint, out of the
way of what you're building; **+** shows every step, and it opens in full
again when you go back to **Select**.
**–** folds it into the small
button; **Hide guide** hides it for good on this device. To bring it back,
open the command palette (**Ctrl+K**) and run **First-Build Guide**. A device
that already has saved work starts with the guide hidden.

## The two tools

### Place tool (`2`)

Pick a brick from the palette, hover in the viewport, and click to place it.
With no brick picked yet, Place starts with a **Cube**, so the first click
always places something. A translucent ghost shows exactly where the brick
will land. Hover over an existing brick's face to stack or attach. A brick
put on top of another rests on the tallest brick under it, not inside it:
a roof dropped on the middle of a house's floor sits on its walls, and a
beam across two posts on the posts.

Only a click places: press and let go without moving. Dragging to look
around (with any button) moves the camera and places nothing, so Place can
stay on while you turn the build to find the next spot.

**Shift+drag** lays a row: hold Shift, press where the first brick goes and
drag along the ground, or along the top of a wall. A ghost shows the whole
row, edge to edge, in the brick's colour and turn; let go to place it, as
one step to undo. The row runs whichever way you dragged further, at the
first brick's height. If any of its spots is taken the ghost is red and
nothing is placed; **Escape** drops the row while you drag.

**Alt-click** (Option-click on a Mac) a brick in your build to take it up:
its type, colour, turn and tilt become what you place next, and Place comes
on, so the next click places another just like it. It works from Select too,
and picks nothing on empty ground.

A click where the ghost is red places nothing: the Editor says something is
in the way and plays a soft, low knock, so you know to try another spot or
turn the piece.

While Place is on, a chip at the top left of the view shows what a click
will place: its picture, its name and, for a brick, its colour. Click the
chip to choose something else in the Build Library (on a phone it opens the
drawer), or **✕** to stop placing.

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
| **Ctrl/Cmd + A** | Select every brick in the build |
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
| **T** | Tilt onto the next side |
| **Shift + T** | Tilt the other way |
| **Delete / Backspace** | Remove the selected bricks |

When you select multiple bricks, they rotate around their **shared center**, so
a whole section swings as one unit.

**T** tilts each selected brick onto its next side, where it stands: a
post lies down as a beam, a wall becomes a floor, a slope turns upside down
as an overhang. Each brick keeps its bottom at the same height, and the
tilt is one step to undo. Four presses bring a brick back upright. While
placing, **T** tilts the brick you're about to place instead. A placed
structure turns but doesn't tilt. Older copies of ForkBuild (1.3.0 and
earlier) show tilted bricks upright.

## Brick colors

Every brick type has its own default color, but you can choose your own:

- **Before placing** — once a brick is selected in the Build Library's
  **Bricks** tab, click its **Color** swatch and pick a color. Every brick
  you place from then on uses it, and the placement ghost previews it.
  Picking a different brick type goes back to that type's own default
  color until you choose one again.
- **After placing** — select one or more bricks and use the **Color**
  swatch in the **Selection** section to recolor them all at once. Each
  change is undoable (`Ctrl/Cmd+Z`) like any other edit. The swatch isn't
  offered for a structure-instance selection — edit the structure's own
  build instead (see
  [Structure instances](#structure-instances-a-live-reference) below).

Beside each **Color** swatch is a row of **village colors** (plaster,
stone, brick, roof red, oak, leaf, sky and more) that go well together:
one click picks one, for the next bricks or for the selection. The swatch
still lets you pick any color.

A brick's color is saved with your build and travels with it when you
publish or share it.

## Precise transforms: numeric input, alignment, and repeat

The Selection panel's folded sections give you more exact ways to move a
selection, alongside the gizmo and the keys above:

- **Exact position & rotation** — type exact X/Y/Z/Rotation values instead of
  dragging. Toggle **Absolute** (the values are a target for the selection's
  pivot/orientation) or **Offset** (the values are added as a delta), then
  press **Apply** (or `Enter` in a field). An empty field means "leave this
  unchanged," never zero. **Reset fields** empties the fields without
  touching the selection.
- **Alignment & Distribution** (under **Align, distribute, repeat**) — nine buttons to align
  the whole selection's edges or centers on a world axis (Left/Center/Right,
  Bottom/Center/Top, Front/Center/Back), plus three to spread it evenly
  (Distribute X/Y/Z). Alignment needs **2+ bricks** selected; distribution
  needs **3+**.
- **Repeat** (also under **Align, distribute, repeat**) — makes **N** more copies of the
  selection, evenly spaced along one axis. If any copy would collide, no
  copies are made at all.

Each of these is **one undo step**, exactly like a gizmo drag or a keyboard
nudge — see the
[Controls Reference](ControlsReference.md#transform--numeric-panel-editor-only) for the
full field-by-field behavior.

The Selection panel's **Focus** button frames the camera on
the selected bricks without changing anything.

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

While you build together (**Build with me**, below), Undo takes back only
your own steps, never a friend's, and on every screen at once; Redo puts them
back. If a friend has changed what your step made since (deleted the brick
you placed, say), that step is skipped and the Editor says so. When someone
joins, everyone's Undo starts again from there: the newcomer never had the
steps made before.

## Groups

Groups let you name and reuse collections of bricks — like "Roof" or "Windows".

**Create a group:**
1. Select some bricks.
2. Open the Selection panel's **Groups & blueprint** section and click
   **New group**, then give it a name with **Rename group** (below).

**Use a group:** click a group's name in the list to select it (and its
bricks) — the list is in the Selection panel when nothing is selected, and
in **Groups & blueprint** otherwise. These buttons act on whichever group
is selected:

| Button | What it does |
|---|---|
| **Rename group** | Change the group's name |
| **Duplicate group** | Copy the whole group *and* its bricks |
| **Delete group** | Delete the group (the bricks themselves are kept) |
| **Add to group** | Adds your current selection to the group |
| **Remove from group** | Removes your current selection from the group |

> **Good to know:** Selecting a group just selects its bricks — it never
> changes the group. And deleting a group only removes the *label*, not the
> bricks inside it.

## Structures: composing, remixing, and your personal library

The Build Library's **Structures** tab (see [The layout](#the-layout) above)
gives you twenty-two ready-made structures — houses, barns, a well, a market, a
mill, a bridge, and more, across five categories — and three larger
**showcase** builds (a castle, a harbor island and a village square), plus
**My Structures**,
your own personal collection of anything you've saved from a build. There
are three different things you can do with any of them, and they matter for
different reasons:

- **Place** (click the card) — copies the structure's bricks straight into
  the build you're already working on, so it becomes part of one bigger
  build. This is the everyday action.
- **Remix As New Build** (in the card's **⋮** menu) — starts a brand-new,
  independent build that begins as an exact copy of that structure.
- **Remix to My Structures** (built-in cards only, in the **⋮** menu) — adds
  the structure to your own **My Structures**, with no build involved at
  all. See [My Structures](#my-structures-your-personal-blueprint-library)
  below.
- **Info** (in the card's **⋮** menu) — a read-only look at a structure's
  name, category, brick count, footprint, height, source, and description.
- Place a **saved build** of your own as a **structure instance** — a
  live, reusable reference rather than a copy — from the toolbar's **Recent**
  dropdown, not the Build Library. See
  [Structure instances](#structure-instances-a-live-reference) below.

### Placing a structure into your build

Click any card in the **Structures** tab — a built-in one or one of your own
**My Structures** — and a translucent ghost preview of the whole structure
appears, following your pointer over the ground, exactly like placing a
single brick:

1. Move the pointer to position the ghost.
2. Press `R` / `Shift+R` to rotate it in 90° steps.
3. Click to place it — every brick in the structure is added to your build
   as one **undo step**. The structure stays in hand, turned the same way,
   so each further click places another one. An occupied position tints the
   ghost red; a click there places nothing, and the Editor says something
   is in the way.
4. `Escape` (or the Select tool, or **Cancel** on a touch screen) stops
   placing — nothing more is added, and the Select tool is on.

Point at the top of a brick and the structure goes there instead, resting
on the tallest brick under it: a shed on a deck, a chimney on a roof, the
same way a wide brick rests on its walls. Pointed at the ground, or at a
brick's side, it stands on the ground.

The bricks you get are ordinary bricks in your build from the moment
they land — indistinguishable from anything you placed by hand, free to
edit, select, group, or delete like anything else. Placing several
structures is a fast way to build a scene: click House, place it; click
Barn, place it beside it; click Well, place it in the yard.

### Remixing a structure as a new build

Open a card's **⋮** menu and click **Remix As New Build** to start a
brand-new build of your own that begins as an exact copy of that
structure — the exact same bricks, editable with every tool in this guide,
in a build of its own rather than folded into whatever you currently
have open. Remixing never changes the library's own copy: remix House ten
times and each one is its own independent build from the moment you
click Remix.

### My Structures: your personal blueprint library

Built something worth reusing? Select the bricks that make it up (a whole
building, or just a section) and click **Create Blueprint** — it's in the
Selection panel's **Groups & blueprint** section once you have bricks selected, and
in the Command Palette (`Ctrl/Cmd+K`) either way. A small dialog asks for a
**name**, a **category**, and an optional **description**, with a live
preview of what you're about to save; click **Create Blueprint** and it's
normalized to its own local origin and saved immediately into **My
Structures**, a new section at the bottom of the Structures tab, right
below the built-in categories.

There's a second way a structure ends up in My Structures, with nothing to
select and nothing to build first: open any **built-in** card's **⋮** menu
and click **Remix to My Structures**. It's added exactly as it already is —
no build created, nothing extracted — so it's ready to Rename, Export,
or place right away, like any other entry in your library.

A structure in **My Structures** works exactly like a built-in one — click
to place it into your current build, or Remix As New Build — with two
extra actions in its **⋮** menu:

| Action | What it does |
|---|---|
| **Rename** | Change its name (its category and description stay as they are) |
| **Remove** | Delete it from your library; **Undo**, which then shows for a few seconds at the top of the library, puts it back |

**My Structures** only ever stores the *structure itself* — a name and a set
of bricks. Removing one never touches anything you already built with it:
every place you've already placed or remixed it into keeps those bricks
exactly as they are. And it never edits in place — if you want to change
what a saved structure actually builds, place it into a build, edit
that build, then **Create Blueprint** again (optionally under a new
name, like "Farmstead Deluxe" — it becomes its own separate entry in My
Structures, not a replacement for the original).

> **Good to know:** My Structures lives on this device. It isn't tied to
> your identity or synced anywhere automatically — see
> [Sharing blueprints](#sharing-blueprints-export-and-import) below for how
> to move one to another device or hand it to someone else.

### Sharing blueprints: export and import

Any structure — a built-in one or one of your own — can leave the device
it's on as a portable file, without ever becoming part of the shared
published World:

- **Export Blueprint** (in any card's **⋮** menu) downloads it as a small
  JSON file — a self-contained snapshot of that structure's name, category,
  tags, description, and bricks.
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

**Export All** (beside **Import Blueprint**, once you have structures of
your own) downloads every structure in My Structures as one file, each with
its attributions and lineage claims. **Import Blueprint** reads that file
too, and skips any design already in My Structures, so importing it twice
doesn't give you duplicates. To keep a copy of everything else as well, use
[Your Data](13-YourData.md).

### Claiming authorship

A structure with a Blueprint identity (most saved ones have one) can also
carry a **Community Attribution** — a signed record of who's claimed to
have designed it. Open the structure's **Info** panel from its card and
you'll find:

- **Claim authorship** — signs a claim, under your current identity, that
  you're one of its authors. Several people can each claim the same design
  independently; nobody's claim ever overrides or replaces another's.
- **Export Attribution** / **Publish to Network** — once you've claimed
  it, share that claim as a file or announce it to your connected peers.
  After **Publish to Network**, the panel offers **Distribute**, which puts
  the claim on decentralized networks too (see
  [Distribution](Distribution.md)).
- **Re-sign for this design** — claims made before 28 September 2026 used an
  older kind of design fingerprint that a different design can copy, so
  they no longer count and the panel says how many there are. If one of
  them is yours and this really is your design, this button signs your
  claim again. Check the design first: the button appears for any design
  that shares the old fingerprint.

This is optional, and entirely separate from placing, remixing, or sharing
the structure itself — it exists for situations where you want to attach
your name to a design in a way other people can independently verify, not
merely trust. See
[Signed Records & External Evidence](09-PublicationsAndEvidence.md) for what
happens to a claim once you've published it, and how to attach independent
external evidence to it.

## Structure instances: a live reference

Placing (above) copies a structure's bricks into your build once.
Sometimes what you want instead is a **live** copy of something you've
already built — any saved build, not just something in your library —
that stays in sync with its source every time you look at it. That's a
**structure instance**: it references the source build rather than
copying its bricks, so editing the source later updates every instance of
it automatically.

1. Open the **Recent** dropdown in the toolbar. (It appears once you've
   saved at least one build.)
2. Next to any saved build, click **Place**. Clicking the build's
   name instead opens it, replacing what you have open.
3. Hover the ground, press `R` to rotate, and click to place it — exactly
   like placing a brick.

An instance is a live *reference* to that build, not a copy of its
bricks: the same build can be placed any number of times, and editing the
source build's bricks later updates every instance of it. Select an
instance with the Select tool (`1`) and the sidebar shows:

| Control | What it does |
|---|---|
| Drag in the viewport, or the [gizmo](InteractiveTransformGizmo.md) | Move / rotate, same as a brick |
| Arrow keys / Page Up / Page Down | Nudge |
| **X / Z / Rotation ° fields, then Apply** | Set an exact position and heading — elevation (Ground Y) always follows the terrain and isn't a target you set |
| **Rotate ↻ / ↺** | Rotate exactly 90° |
| **Duplicate** (`Ctrl/Cmd+D`) | Place another instance of the same structure |
| **Delete** | Remove this instance — the source build is untouched |
| **Edit Source Build** | Open the referenced build itself, to change what every instance of it looks like |

**Rotate ↻ / ↺**, `R` and the **Rotation °** field only turn an instance
where it fits: a turn that would run into something leaves it as it was,
with a sound and a message saying so. (The gizmo shows a blocked turn red
and puts it back.)

Editing a placed structure's *content* always happens by editing its source
build — there's no way to edit an instance's bricks directly, which is
exactly what keeps every instance of it in sync.

## Build Properties

Every build has a **title**, an optional **description**, a
**license**, and a **Who can place it in the World** setting — set them
in the **Build Properties** dialog, opened with the **✎** button beside
the build title at the top of the Editor's sidebar (in World View, it's
the **Edit Metadata** button). A new build starts with no license, which
means nobody else can remix it until you choose one. The description shows up as a
snippet on its card in Explore and is searchable there too; the license
controls whether — and how — other people are allowed to remix it. See
[Publishing & Remixing](04-PublishingAndForking.md) for what each license
means.

The **Suggest a title** and **Suggest a description** buttons under the
title offer ideas made from the build's bricks: its Build Library
structures, its main parts and colours and, for a remix, what it added to
the build it came from (*Mill and Granary with a Barn*). Press **Suggest a
title** again for the next idea. A suggested description fills an empty
one, or goes after what you wrote. They are only suggestions, worked out on
your device; change them as you like.

A long description reads better with a little formatting, which the
**About this build** panel, World View's location browser and Steem and
Blurt posts all show:

| Write | To get |
|---|---|
| a blank line | a new paragraph (a single line break stays a line break) |
| `## Materials` at the start of a line | a heading |
| `- ` (or `* `) at the start of a line | a bullet list item |
| `**word**` | **bold** |
| `*word*` | *italic* |
| `\*`, `\#`, `\-` | the character itself |

Nothing else is formatting: links, pictures and HTML stay as plain text.
Cards in Explore show the description's words on one line, without the
formatting.

**Tags** say what the build is, like `japanese temple garden`: up to 5,
separated by spaces or commas, each made of lowercase letters, digits and
hyphens (accents are dropped, so `café` becomes `cafe`). When a build has
none, the dialog fills the field with suggestions from its title and
description, which you can keep, change or clear; the buttons under the
field add other suggestions. A remix keeps its tags. A Blurt post lists them
after ForkBuild's own, so people browsing Blurt by tag can find your build.

## Sound

Each change you make has its own short sound, so you can hear what happened
without looking: a snap when a brick or structure is placed, a pop when one
is removed, a tick for a move and a double tick for a turn, a quick run of
blips for a paste or duplicate, a bright ping for a new color, two notes for
grouping, a bell for naming a place, a falling blip for undo and a rising
one for redo, and a small chord when you save. Changes a collaborator makes
in the same build are silent.

Turn sound off or on with the **Sound** button at the top right of the view
or by pressing `M` (listed in the Keyboard Shortcuts overlay, `?`); the
slider beside it sets the volume. It's the same
setting as World View's, remembered on this device. Sound starts with your
first click or key press, as browsers require.

On a phone or a touch screen, Sound is the small 🔊 button beside **See
inside** and **Voice**, so it stays clear of your build: tap it for the
sound and music buttons, and use the device's own volume buttons for the
volume.

Music plays softly while you build, a little livelier than World View's. The **♪ Music** button beside the slider turns it off or on; it's the same choice as in World View.

## Saving, publishing, starting over

- **Save** (`Ctrl+S`) — keep your work on this device.
- **Publish** — share it with everyone (see
  [Publishing & Remixing](04-PublishingAndForking.md)). Publishing also saves
  it. A build started from a ready-made one that has nothing of your own in
  it yet is asked about once: **Keep building**, or **Publish anyway**. The
  message after it is one bar: **Walk inside it** and **Copy link**, with
  **More ways to share** holding the link itself, **Save picture**, **Make a video**
  and **Embed**. A reminder to add a passphrase to the identity you published
  with waits for your next publish when that identity was just made.
- **New** — start something new: an **Empty plot**, or one of the
  ready-made builds (a castle, a harbor island, a village square, a house, a
  mill and a bridge) as your own copy, seen whole. If what's open has
  unsaved changes, New says so first; save it to keep them.
- **File** — a menu with three more:
  - **Export** — download the current build as a JSON file, to keep a copy
    or move it to another device. Files use a compact format that stores
    bricks as a table.
  - **3D model** — download the build as a 3D model for other programs
    (see [Downloading a 3D model](#downloading-a-3d-model)).
  - **Import** — open an exported file as a new build with its own
    identity; nothing is kept until you **Save**. Files exported by earlier
    versions still open (they are converted as they load), but ForkBuild 1.0.0
    and older can't open files exported by this version.
  When you made the build, **Export** signs the file, so whoever imports it
  can trust the name and license in it. Your own builds import as
  themselves. Someone else's opens as your own copy, crediting them, when
  its license allows remixes; when it doesn't, or when the file was changed
  after its maker signed it, it isn't imported. The file carries the license
  the build has when you export it, so you can publish a build as **All
  Rights Reserved** and still give someone a copy they may build on: choose
  another license in **Build Properties**, export, then set it back.
  **Export All Builds** and its **Import**, under **Recent**, work the same
  way.
- **Recent** — reopen something you saved before (it appears after your
  first save; click a build's name to open it). Once you've saved enough
  builds, a filter box appears so you can jump straight to one by name.
  Each entry also has a **Place** button — see
  [Structure instances](#structure-instances-a-live-reference)
  — for adding it to your *current* build instead of replacing it.
  **Export All Builds** at the bottom downloads every saved build as
  one file; **Import** reads it back, saving the builds this device
  doesn't have (open them from Recent), skipping ones it has unchanged, and
  saving a copy beside any it has in a different version. Unsaved changes
  aren't included, so save first.

## Build with me: building together, live

**Build with me**, under the build's name in the sidebar, makes a link that
lets friends build this build with you, at the same time. Send it any way you
like; it also shows as a QR code for a phone. A friend who opens it chooses a
name if they haven't yet (their bricks are added under their name), clicks
**Join**, and your build opens in their Editor. From then on, each brick
either of you places, moves, recolours or deletes appears on both screens.

- A strip over the view shows who is building, each in their own colour, and
  each of you sees where the other is pointing and what they have selected,
  in that colour.
- **Undo** (`Ctrl/Cmd + Z`) takes back your own last step on every screen,
  and **Redo** puts it back; your friends' steps are theirs to undo.
- It has to be your own build: one you started, or a copy you made. A build
  you began before choosing a name becomes yours when you invite friends to it.
- Anyone who opens the link in its first 30 minutes can join, while the
  build stays open in your Editor. Everyone who joined can build until you
  press **Stop**, open another build, or leave the Editor. **Link** in the
  strip shows the link again.
- Each friend's Editor keeps its own copy, saved on their device. When you
  stop, they can keep it, but what they change no longer reaches you.
  A friend who placed no bricks isn't credited, so their copy stays your
  build: restored from a backup, it follows the build's license, like
  anyone else's.
- Everyone whose bricks your build takes in is credited on it: the build's
  panel says **Built with** and their names, and when you publish, the
  shared link and the family tree say so too, under your signature. Each
  friend's copy shows the same credits. A copy someone else makes of it
  starts with no such credits; theirs is a new build.
- Each credited name, and a shared build's author, opens that person's
  page: the builds their identity signed, and the builds others credit
  them on. In the family tree, each build's title opens it, and its
  author's and co-builders' names open their pages. **My Worlds** lists
  **Builds you helped make**, the ones a friend credited you on, each
  opening its World once it is published; your other devices list them
  too, once they have been connected to this one (or given a copy of your
  data).
- Joining connects your two devices directly, as **Walk here with me**
  does: each of you can see the other's IP address. Nobody becomes a Known
  Peer or a friend unless you choose to. It needs a rendezvous server; the
  official site has one.

## Downloading a 3D model

**3D model**, under **File** in the toolbar, downloads what's open as a file other 3D
programs open, made on this device (nothing is uploaded):

- **glTF (.glb)** — in color. Opens in Blender, Windows 3D Viewer, game
  engines such as Godot and Unity, and online model viewers. One ForkBuild
  unit is one metre.
- **For 3D printing (.stl)** — one color, in millimetres at 1:100 (a door is
  20 mm tall, a cube 10 mm), turned Z up and standing on the print bed, so a
  slicer (Cura, PrusaSlicer, Bambu Studio…) opens it ready to print; scale
  it there if you want it bigger. Bricks that touch or overlap stay
  separate pieces, which slicers join when they slice.
- **OBJ (.obj)** — in color (as vertex colors), for older programs.

Each brick keeps the exact shape and color it has in ForkBuild, and the
structures you placed come along when they are on this device (the message
says if any weren't). Every file names the build, its author and its
license, and what it was remixed from: in glTF's copyright and extras, in
the STL header, and as comments in the OBJ. A shared build's own page offers
the same downloads when its license allows copies (see
[What a link opens on](04-PublishingAndForking.md#what-a-link-opens-on)).

## Describe the build

Press `I`, or pick **Describe the Build** in the Command Palette, and the
Editor says what your build is made of: how many bricks, about how wide,
deep and high it is, the Build Library structures that stand in it, the
windows, doors, roofs, trees and other parts among the rest of its bricks,
and its main colours, named after the village colours. A screen reader reads
it out; it also stays at the top of the 3D view until you press
**Close**, a quick way to check a build without turning the camera round
it. It is worked out on your device from the bricks, so nothing is sent
anywhere. A build's picture on its shared link and in an embed carries the
same description for screen readers.

## Commands in plain words

Type what you want into the Command Palette (`Ctrl/Cmd+K`) in your own
words, like *paint the roof red*, *select all the windows*, *delete the
trees* or *paint it light blue*, and its first row, **From your words**,
says what it will do and to how many bricks: *Paint 4 windows Harbor blue*.
Press `Enter`, or click it, to do it in one step you can undo. It
understands painting, selecting and deleting; the parts of a build
(windows, doors, roofs, stairs, arches, fences, chimneys, furniture,
lanterns, trees, bushes, rocks and lawn), *everything*, or what you have
selected (*this*, *these*); and the village colours by their names or by
everyday ones (*red*, *dark grey*, *light blue*). It works in every
language ForkBuild speaks, on your device; anything else you type searches
the actions as before.

## Speak a command (voice)

Press `V`, or **🎤 Voice** at the top of the 3D view, and say what you want:
*paint the roof red*, *select all the windows*, *delete the trees*, *undo*.
Press `V` (or **Stop**) when you're done; ForkBuild says what it heard and
what it did, in one step you can undo. It understands the same requests as
[Commands in plain words](#commands-in-plain-words), and any action said by
its name. A question (*how do I invite a friend?*) offers **Ask the guide**.

The first time, it explains what turning voice on downloads, about 70 MB
once: a small speech model (Whisper) from Hugging Face and its engine from
jsDelivr. They stay in this browser, so voice works offline afterwards. What
you say is recorded and understood on your device and never sent anywhere
(see [Privacy](../Privacy.md)). **Turn voice off** and **Remove the speech
model** are in the voice panel after any command. It hears the language
ForkBuild is shown in.

World View listens too (see
[Say where to go](03-WorldView.md#say-where-to-go-voice)). The speech model
works in the background, so the view never pauses while it listens, and it
stays loaded as you move between the two.

## Camera controls

- **Drag** — orbit around the scene
- **Scroll** — zoom in and out
- **Home** — reset the camera to the default view

A build opens seen from above at an angle, framed whole.

### See inside

**See inside**, over the top left of the view (top right on a phone, under
**Tools**), cuts the build away above its ground floor, as World View does
when you walk in: the walls stand to about head height and the rooms, with
their furniture, show from above. Build in them as usual: a click goes past
what is cut away. **Show it whole** draws it all again. Nothing is removed;
only what is drawn changes.

## On a phone or tablet

The Editor works by touch. Drag with one finger to orbit, two to pan, and
pinch to zoom. A tap selects; placing takes two taps, one to see where the
piece goes and a second on it (or **Place**) to put it down. A drag never
selects or places. On a narrow screen, the sidebar opens from the **Tools**
button at the top right of the scene. A bar at the bottom of the scene has
**Undo**, **Redo**, **Rotate**, **Tilt**, **Delete**, **Multi** (each tap
adds a brick to the selection or removes it), **Box** (drag to draw a
selection box; the camera stays still until you turn it off), and **More**,
which opens the Command Palette. While you place, **Place** and **Cancel**
take the places of **Delete**, **Multi** and **Box**; **Cancel** stops
placing. On a phone the toolbar above the scene scrolls sideways, so
**Save** and **Publish** come first in it (after **Back to World**, when
there is one). See [Touch screens](ControlsReference.md#touch-screens) for
the details.
