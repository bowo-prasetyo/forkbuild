# 03 — World View

World View is the shared 3D space where **every published creation exists side
by side**. Fly around, search for what you're looking for, discover what
others have built nearby, inspect their bricks, and even edit right where you
stand.

## Opening World View

From the **Repository**, click **Explore** on any creation — or navigate to a
world's URL directly. You'll appear next to that creation in the shared world.

## Flying around

- **Left-drag** — orbit the camera
- **Right-drag** — pan
- **Scroll** — zoom in and out
- **Home** — reset the view

As you move, nearby worlds **stream in and out** automatically. The overlay in
the corner shows you:

- **Worlds in View** — what's currently loaded around you
- **Nearby Worlds** — click one to fly straight to it

Right under your camera's coordinates you'll also find two buttons,
**Explore Here** and **What's Here?** — see [Finding worlds](#finding-worlds)
below.

The ground itself is generated the same way for everyone from a shared seed
— grass, beach, rock, forest and farmland, lakes and winding rivers all
follow the terrain's own elevation and moisture, not a random placement.
It's scenery: nothing about it is editable, and it looks identical no matter
who's looking at it or when.

## Orientation and Locations

Next to your camera coordinates, a small **compass** shows which way you're
facing (it's read-only — it never moves the camera). Two buttons sit beside
it:

- **Home** resets the camera to the default view.
- **Locations** opens a list of every place this session currently knows
  about, grouped into **World**, **Structures**, and **Landmarks** — each
  with one **Focus** button. Like Search and Explore Here/What's Here?,
  Focus only ever moves the camera; it never loads, selects, or edits
  anything.

The compass shows cardinal directions (N, E, S, W) and your current heading
in degrees, plus small dots for nearby structures, collaborators, and
landmarks — hover one for its label, or check the readable list underneath
the compass. As you move through the world, the terrain around you is
generated deterministically from the world seed — grass, beach, rock, forest
and farmland, lakes and winding rivers all follow the terrain's own elevation
and moisture.

### Explore, Map, and Places — three ways to browse, never at once

Below the navigation buttons sit three tabs: **Explore**, **Map**, and
**Places**. These are World View's three primary, mutually exclusive ways
to look around — opening one always closes whichever of the others was
open, so you're never juggling several overlapping browsing panels at the
same time.

- **Explore** is the default. It shows the arrival/welcome panel (who's
  here, and a few suggested destinations) plus a **Nearby** section with
  three collapsible groups — **Nearby Places**, **Nearby Landmarks**, and
  **Nearby People** — each just a name, a distance, and a compact **Go**
  button. Click a group's title to expand it — World View remembers which
  groups you left open even after you switch to Map or Places and come
  back.
- **Map** opens the same flat, top-down World Map described below.
- **Places** opens the geographic place directory described in
  [Geographic places](#geographic-places) below.

Switching between Explore, Map, and Places never loads a document, edits
anything, or moves your avatar — it only changes what this panel is
currently showing you, the same "Navigate ≠ Modify" boundary every other
navigation control in World View already holds to.

### Info — what am I looking at?

Next to most **Go** buttons — in Explore's Nearby rows, and in the
Locations panel — you'll also find an **Info** button. Where Go moves
your camera, Info opens a small panel describing whatever you selected
without moving anything: what it is, how far away it is, which named
place it sits inside ("You are in Willow Village") or which geographic
place candidate it's near ("You are near Kawahara Village") when
neither is known for certain. From there you can still press **Go** to
travel there, **Show on Map** to see it on the World Map, or **Names**
(for a named place) to see or publish community names for it — Info
itself never does any of those on its own.

### Landmarks — marking a place worth remembering

Unlike a structure (a placed building you or someone else built) or a
compass reading (derived fresh from where you're standing), a **landmark**
is something you deliberately create: a named point — "Old Bridge," "Great
View" — with an optional description, placed exactly where your avatar is
currently standing.

If you have EDIT access to the World you're in, the **Locations** panel's
Landmarks section shows a **+ Add Landmark** button. Give it a title (and
optionally a description) and click **Place Here** — it appears immediately
for you and, moments later, for every other collaborator in the same World,
on the compass, in their own Locations panel, and as a navigable
destination. Anyone with EDIT access can rename, redescribe, or remove any
landmark in the World, not only the person who created it — landmarks are
World content, governed by the same collaboration permissions as everything
else you build together, never a personal, private pin only you can see or
touch.

### The World Map

The **Map** tab opens a flat, top-down view of everywhere this session
currently knows about in the World — named places, landmarks, structures,
everyone else who's here, and a marker for you. Scroll or use +/− to zoom,
click empty space to pan the map, and click any place or person to move
your camera straight there. Nothing about the map is editable, and looking
at it never changes anything — it's simply a way to see the geography a
World's collaborators have already built and named, all at once, instead
of one landmark at a time.

### Geographic places

The **Places** tab opens a directory of every **geographic place** this
session has identified — places multiple people have independently named
or described (as a region — see Locations' own Places section) that turn
out to occupy roughly the same ground. Click a row to open its own detail
screen: how many descriptions and Worlds it spans, its own **Community
Names**, and **Go to Place** / **Show on Map** buttons. Click **← Back** (or
press Escape) to return to the directory — switching to Map or Explore and
back to Places later reopens exactly the screen you left, detail or list.

A place's Community Names section only shows its top few names at first,
with a **More names** button to see the full ranked list — and everything
past "publish a name of your own" (other geographic descriptions, the raw
claim history, import/export) sits behind one **More** disclosure, so the
common case — "what do people call this, and what do I call it?" — never
competes with everything else the naming system can do.

## Camera vs. Editing

The header shows two things that can genuinely differ:

```
Camera: Alice's Castle · Editing: Bob's Castle
```

**Camera** is wherever you're currently looking — flying to a world, or
clicking a search result's **Focus** button, moves the camera there.
**Editing** is whichever document your next action (moving a brick, editing
metadata, publishing) would actually apply to — clicking a brick, or a
search/location result's **Select** button, changes it *without* moving the
camera.

The two usually move together (Focus does both), but two creations can share
the exact same spot in the world — focusing one, then the other, moves the
camera nowhere the second time, yet the header still tells you which one
you're now editing. Flying around and looking at things never changes what
you're editing on its own; only actually selecting a brick or a document does.

## Finding worlds

There are three ways to find something in the shared world, each answering a
different question.

### Search — "which publications match this?"

The **Search** panel searches by **title or author**, over everything
published — not just what's currently loaded around you. Type a term and
click **Find**.

You can optionally narrow it to a **Location**: fill in X/Y/Z and a **Radius**
(in World Units) and the search only returns results within that distance of
that point. Leave Location blank for a plain text search.

Each result shows:

- 📍 its position
- 📏 how far away it is (only shown for a location search)
- a note if the position shown is a **default position** rather than one the
  author actually chose (see [World position](#world-position) below)

Click **Focus** to fly there.

### Explore Here / What's Here? — "what's around me right now?"

These two buttons, next to your camera coordinates, search **from wherever
your camera currently is** — you don't have to already know a title or type
coordinates.

- **Explore Here** searches a reasonably wide area around the camera, and
  lets you widen or narrow that radius afterward.
- **What's Here?** checks only the immediate area — useful when you want to
  know "is there anything essentially right where I'm standing?"

Both open the **Explore Location** dialog:

```
📍 Center: 100.0, 50.0, 250.0
⭕ Radius: 25 World Units

Showing 3 of 3 discoverable documents

📍 City Hall            📏 4.2 World Units away
by alice
[Focus] [Select] [Inspect]
```

Each result gives you three distinct actions:

| Button | What it does |
|---|---|
| **Focus** | Flies the camera there *and* makes it the one you're editing |
| **Select** | Makes it the one you're editing, **without** moving the camera |
| **Inspect** | Expands an inline summary — title, author, status, position, owner — without moving anything |

This dialog never moves a placement, edits a document, or publishes anything
by itself — it's purely for looking around and picking where to go next.

### Documents Here

When a placement's info panel tells you other documents share its exact
position, click **View** to open **Documents Here** — a plain list of
everyone at that spot, each with its own **Focus** button.

## Inspecting a brick — or a placed structure

Click any brick to open the **Inspection** panel, which tells you:

- What kind of brick it is
- Its position and rotation
- Which world and building it belongs to
- Who authored the world

Use **Focus Brick** to zoom right in, or **Focus World** to jump to that
creation's home position.

Click a **placed structure** (an instance of a whole document, dropped into
a creation from the Editor — see
[The Editor](02-TheEditor.md#structure-instances-a-live-reference)) and
the same panel shows what it references instead: its source document's
title, local and world position, rotation, ground elevation, and the
containing world's title and author. This is read-only in World View —
there's no gizmo, no numeric field, nothing to drag. Click **Open Source**
to jump into the Editor and edit the referenced document's bricks directly;
every instance of it, wherever it's placed, reflects that edit.

## Document Information and Placement

Below the header you'll find two panels for whichever document you're
currently editing:

- **Document Information** — title, description, license, status, and (if
  it's a fork) which world it was forked from. Click **Edit Metadata** to
  change the title, description, or license.
- **Placement** — *where* that document sits in shared space, in **World
  Units** (ForkBuild's own coordinate system — not meters, not GPS
  coordinates, just a shared frame every creation is placed in). Click
  **Move** to give it new X/Y/Z coordinates directly, or use the ± nudge
  buttons (1 / 10 / 100 World Units) to shift the current position
  relatively before confirming. **Focus** flies there.

These are deliberately two separate panels: what a creation *is* and where it
*sits* are two different questions, and moving a placement never edits the
document itself (or vice versa).

### World position

If another document already occupies the exact spot you're moving to, you'll
see a warning listing who's there before you're asked to confirm — sharing a
location is allowed (a courtyard scene and the building around it can
legitimately sit in the same place), ForkBuild just makes sure you see it
first.

### Placements you don't own

If a placement belongs to someone else, the Placement panel shows
**🔒 Placed by &lt;name&gt; — you can view this placement but not move it**
and the **Move** button is disabled. You can still **Focus** it, inspect it,
and — subject to the usual fork-on-edit rule — edit the document sitting at
that placement; only *where it sits in shared space* is theirs to move.

## Building in World View

World View isn't just for looking — you can build here too, alongside other
builders who are present in the same world.

### Collaborative building

When multiple people are building in the same world:

- **See other builders** — their avatars appear in the world with display names
  and activity indicators (e.g., "**Bob — Building House**").
- **Real-time updates** — bricks placed by others appear immediately as the
  world operations propagate.
- **No conflicts** — if two people edit the same structure simultaneously,
  deterministic ordering ensures the world converges to a consistent state.
- **Ephemeral activity feed** — a local panel shows recent operations
  ("Bob placed Block 2×2", "Alice rotated House") to help you understand
  changes even when they happen outside your current view. This feed is
  temporary and not persisted.

> **Presence describes activity; commands establish shared reality.**
> Spatial presence helps you understand what others are doing, but only
> world operations actually change the shared environment.

1. Click the **Place** tool in the overlay.
2. Pick a brick type from the dropdown.
3. Hover over the ground or a brick face — a ghost preview appears.
4. Click to place it.

Switch back to **Select** to move, rotate, or delete bricks, using the same
keys as the Editor (arrows, `R`, `Delete`), or drag the on-screen
[gizmo](InteractiveTransformGizmo.md).

> **Editing a published creation?** Your first change automatically creates
> your own editable copy — the original is never touched. ForkBuild will tell
> you the moment this happens ("Created your own editable copy — … is
> unchanged"), so you always know when you've branched off. See
> [Publishing & Forking](04-PublishingAndForking.md).

## Selecting in World View

Selection works exactly like the Editor:

- **Click** to select, **Ctrl/Cmd+Click** to toggle, **Shift+Click** to add.
- **Shift+Drag** to box-select.
- **Ctrl/Cmd+A** to select everything in the world you're currently editing.

## Copy, paste, duplicate, and groups

Copy (`Ctrl+C`), paste (`Ctrl+V`), duplicate (`Ctrl/Cmd+D`), and the
**Groups** panel all work in World View just as they do in the Editor for
an ordinary brick selection — see
[The Editor](02-TheEditor.md#copy-paste-and-duplicate). A
[placed structure](#inspecting-a-brick--or-a-placed-structure) stays
read-only here as described above: selecting one doesn't enable
duplicate, copy, or paste, since editing a placement's position, rotation,
or count is Editor-only.

## Save and publish here, too

The header has **Save**, **Publish**, and **Edit Metadata** buttons whenever
you're editing something, so you can capture and share a world without
leaving it. The status line (**🔒 Published** or **✎ Editing fork**) always
shows which one it is.

## The Operation Timeline

This is one of ForkBuild's most powerful features. Every change you make is
recorded as an **operation**, and the timeline lets you travel through them.

Click **Timeline** in the overlay to open it. You'll see a list like:

```
Place Brick
Place Brick
Move 3 Bricks
Rotate 3 Bricks
Paste 3 Bricks
```

### Preview any moment

Click an operation to **preview** what the world looked like *right after* that
step. Keep clicking to scrub backward and forward through your build history.

> **Previews never change anything.** You're just looking. Click **Cancel
> Preview** to return to where you are.

### Restore an earlier state

While previewing, click **Restore Here** to make that historical state your
**current** one. ForkBuild will ask you to confirm, because this replaces your
present edits.

This is invaluable when an experiment goes wrong — just travel back to the last
good moment and restore it.

## What's next?

Ready to share what you've made, or remix someone else's work? Continue to
**[Publishing & Forking](04-PublishingAndForking.md)**.
