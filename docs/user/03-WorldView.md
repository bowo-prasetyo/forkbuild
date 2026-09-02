# 03 — World View

World View is the shared 3D space where **every published creation exists side
by side**. Fly around, search for what you're looking for, discover what
others have built nearby, and inspect their bricks — World View is a
read-only exploration surface, never a second place to build. The moment
you want to change something, **Edit a Copy** hands you an independent copy
in the Editor, the one place ForkBuild ever builds — see
[Edit a Copy](#edit-a-copy--taking-something-into-the-editor) below.

World Region and Landmark naming is the one exception: naming a place you're
standing at is annotation, not construction, so it stays right here — see
[Landmarks](#landmarks--marking-a-place-worth-remembering) below.

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
  four collapsible groups — **Nearby Places**, **Nearby Landmarks**,
  **Nearby People**, and **World Encounters** (see
  [World Encounters](#world-encounters--publications-and-avatars-your-peers-are-sharing)
  below) — each just a name, a distance, and a compact **Go** button
  (World Encounters instead shows its own small map and inspection panel,
  described below). Click a group's title to expand it — World View
  remembers which groups you left open even after you switch to Map or
  Places and come back.
- **Map** opens the same flat, top-down World Map described below.
- **Places** opens the geographic place directory described in
  [Geographic places](#geographic-places) below.

Switching between Explore, Map, and Places never loads a document, edits
anything, or moves your avatar — it only changes what this panel is
currently showing you, the same "Navigate ≠ Modify" boundary every other
navigation control in World View already holds to.

### World Encounters — publications and avatars your peers are sharing

The **World Encounters** group, inside Explore's Nearby section, is a
small flat map of its own — separate from the World Map described
below — that plots two kinds of thing your connected peers have told you
about: other **publications** (see
[Publications & External Evidence](09-PublicationsAndEvidence.md)) placed
nearby, and other people's **avatars**, each as its own marker alongside
a marker for you.

Click a marker to open an inspection panel:

- A **publication** marker shows its title, publisher, whether it's
  signed, its position, and how many external-evidence anchors and
  snapshot placements it has.
- An **avatar** marker shows its display name, owner, and position.

If more than one connected peer offers the same encounter, a
**Choose Source** list appears so you can pick which peer's copy to
inspect. Like everything else in World View, this is purely for
looking — nothing here moves your camera or edits anything.

World Encounters only ever shows what a currently or recently connected
peer has actually told you about; it reads **Nothing encounterable here
yet** until at least one has. See
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md) for
connecting to someone.

### Info — what am I looking at?

Next to most **Go** buttons — in Explore's Nearby rows, and in the
Locations panel — you'll also find an **Info** button. Where Go moves
your camera, Info opens a small panel describing whatever you selected
without moving anything: what it is, how far away it is, which named
place it sits inside ("You are in Willow Village") or which geographic
place candidate it's near ("You are near Kawahara Village") when
neither is known for certain. From there you can still press **Go** to
travel there, **Show on Map** to see it on the World Map, **Names**
(for a named place) to see or publish community names for it, or
**Edit a Copy** to open it in the Editor — see below. Info itself
never does any of those on its own.

### Edit a Copy — taking something into the Editor

Wherever World View shows you something specific — a region, a landmark,
a placed structure, a brick, or bare ground — the panel that describes it
has one more button: **Edit a Copy**. It creates an independent copy of
the document that actually contains what you were looking at — never the
whole World, never anyone else's original — and opens it straight into
the Editor, ready to build on. Two panels offer it: the **Focus** panel
(the Info button on Explore/Locations rows, for a region/landmark/
structure) and the **Inspection** panel (a direct click in the 3D view,
for a brick, bare ground, or a placed structure) — same action, same
button, either way you got there.

- For a **landmark**, a **region**, a **brick**, or **bare ground**,
  that's the World document they belong to.
- For a **placed structure**, that's the structure's own content — not
  the World it happens to be sitting in.

The original is never touched — ForkBuild tells you the moment your copy
is ready, exactly like any other fork (see
[Publishing & Forking](04-PublishingAndForking.md)). A **geographic
place** and a **collaborator** never offer Edit a Copy — a geographic
place is a grouping of several people's own regions with no single
document of its own to copy (open one of its regions instead), and a
person is not a document at all.

This is the *only* door out of World View's read-only surface. Everything
else here — flying around, Search, Explore Here/What's Here?, the compass,
the Map, Info — only ever looks.

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

> Publishing a name announces it to your connected peers the same way
> claiming authorship of a structure does — see
> [Publications & External Evidence](09-PublicationsAndEvidence.md) if
> you want to see every claim this device has published or learned about,
> in one place.

## Camera vs. Editing

The header shows two things that can genuinely differ:

```
Camera: Alice's Castle · Editing: Bob's Castle
```

**Camera** is wherever you're currently looking — flying to a world, or
clicking a search result's **Focus** button, moves the camera there.
**Editing** is whichever document your next action (adding a landmark or
region, editing metadata, publishing) would actually apply to — clicking a
brick or placement, or a search/location result's **Select** button,
changes it *without* moving the camera. (Editing bricks themselves is
Editor-only now — see [Edit a Copy](#edit-a-copy--taking-something-into-the-editor)
above; nothing you can do to a brick in World View changes which document
is "being edited" here.)

The two usually move together (Focus does both), but two creations can share
the exact same spot in the world — focusing one, then the other, moves the
camera nowhere the second time, yet the header still tells you which one
you're now editing. Flying around and looking at things never changes what
you're editing on its own; only actually selecting a brick or a document does.

## My Worlds — worlds you've actually been to

Click **My Worlds** in the top bar to see every World this device has
visited before, most-recently-visited first, each showing its title,
author, and structure/landmark counts where known. Click any card to fly
straight back in.

This is a purely local, personal history — never a shared or published
list, and not the same as the Repository or a search result: a World only
appears here once you've actually entered it, and it stays here (on this
device only) even if you never publish or share anything of your own.
Haven't visited anywhere yet? **Browse the Repository** to find your first
one.

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
creation's home position. Right beside those, an **Edit a Copy** button
forks the World this brick belongs to and opens the copy in the Editor —
leaving the original untouched. Clicking bare ground inside a creation
opens the same kind of panel (position and the containing world/author,
no brick-specific fields) with its own **Edit a Copy** button, for the
same reason: forking doesn't require finding something notable first,
just clicking anywhere inside the World you want to build on.

Click a **placed structure** (an instance of a whole document, dropped into
a creation from the Editor — see
[The Editor](02-TheEditor.md#structure-instances-a-live-reference)) and
the same panel shows what it references instead: its source document's
title, local and world position, rotation, ground elevation, and the
containing world's title and author. This is read-only in World View —
there's no gizmo, no numeric field, nothing to drag. Click **Open Source**
to jump straight into the Editor on the referenced document itself; every
other instance of it, wherever it's placed, reflects whatever you edit
there. Its own **Edit a Copy** button, right beside Open Source, targets
that same referenced document instead of the World merely positioning it
— if you'd rather work on an independent copy, leaving every other
instance (and the original) untouched, use that one instead of Open
Source.

Every "Edit a Copy" button in World View — here, and on a region/landmark/
structure's own Focus panel — is the same action, described in full in
[Edit a Copy](#edit-a-copy--taking-something-into-the-editor) below. You
don't have to go find something in a list first; clicking on it directly
works too.

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

## World View is read-only — building happens in the Editor

World View is for looking around, not building: there's no Place tool, no
transform gizmo, no copy/paste, no groups, and clicking a brick selects it
for **inspection only** — nothing about clicking, dragging, or pressing a
key here ever changes a brick. The moment you want to build on something
you found, use its Focus panel's **[Edit a Copy](#edit-a-copy--taking-something-into-the-editor)**
button to open an independent copy in the Editor — the one place ForkBuild
ever builds. See [The Editor](02-TheEditor.md) for placing, transforming,
grouping, and every other construction tool.

World Region and Landmark naming is the one exception — see
[Landmarks](#landmarks--marking-a-place-worth-remembering) above — because
naming a place is annotation, not construction.

### Seeing other collaborators

When multiple people are present in the same World:

- **See other people** — their avatars appear with display names and
  activity indicators (e.g., "**Bob — exploring nearby**").
- **Real-time updates** — anything they publish (a landmark, a name, a
  fresh fork of their own) appears for you as it happens.
- **Ephemeral activity feed** — a local panel shows recent activity to help
  you understand what's changed even outside your current view. This feed
  is temporary and not persisted.

> **Presence describes activity; it never changes anything on its own.**
> Spatial presence helps you understand what others are doing, but only an
> actual mutation — always in the Editor now, except Region/Landmark
> naming — changes the shared environment.

## Save and publish here, too

The header has **Save**, **Publish**, and **Edit Metadata** buttons whenever
you're editing something, so you can capture and share a world without
leaving it. The status line (**🔒 Published** or **✎ Editing fork**) always
shows which one it is.

## The Operation Timeline

This is one of ForkBuild's most powerful features. Every change you make —
here, that means adding, renaming, or removing a landmark or region — is
recorded as an **operation**, and the timeline lets you travel through them.

Click **Timeline** in the overlay to open it. You'll see a list like:

```
Add Landmark "Old Bridge"
Rename Region "Willow Village"
Remove Landmark "Great View"
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
