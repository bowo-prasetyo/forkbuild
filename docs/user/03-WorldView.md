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

## Inspecting a brick

Click any brick to open the **Inspection** panel, which tells you:

- What kind of brick it is
- Its position and rotation
- Which world and building it belongs to
- Who authored the world

Use **Focus Brick** to zoom right in, or **Focus World** to jump to that
creation's home position.

## Document Information and Placement

Below the header you'll find two panels for whichever document you're
currently editing:

- **Document Information** — title, description, license, status, and (if
  it's a fork) which world it was forked from. Click **Edit Metadata** to
  change the title, description, or license.
- **Placement** — *where* that document sits in shared space, in **World
  Units** (ForkBuild's own coordinate system — not meters, not GPS
  coordinates, just a shared frame every creation is placed in). Click
  **Move** to give it new X/Y/Z coordinates, or **Focus** to fly there.

These are deliberately two separate panels: what a creation *is* and where it
*sits* are two different questions, and moving a placement never edits the
document itself (or vice versa).

### World position

If another document already occupies the exact spot you're moving to, you'll
see a warning listing who's there before you're asked to confirm — sharing a
location is allowed (a courtyard scene and the building around it can
legitimately sit in the same place), ForkBuild just makes sure you see it
first.

## Building in World View

World View isn't just for looking — you can build here too.

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

## Copy, paste, and groups

Copy (`Ctrl+C`), paste (`Ctrl+V`), and the **Groups** panel all work in World
View just as they do in the Editor — see [The Editor](02-TheEditor.md).

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
