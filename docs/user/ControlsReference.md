# Controls Reference

Every mouse and keyboard interaction in ForkBuild. World View is for
looking around and navigating; every building control (selection for
editing, transforms, groups, clipboard, placement, and the Command
Palette) works only in the Editor. The Editor's shortcuts are the same
ones listed in its Command Palette and **⌨ Shortcuts** overlay — if this
page and the palette ever disagree, the palette is right and this page has
a bug.

Open the **Command Palette** with `Ctrl/Cmd+K` in the Editor to search
every editing operation below by name.

## Camera (both views)

| Input | Action |
|---|---|
| Left-drag on empty space | Orbit |
| Right-drag | Pan |
| Scroll wheel | Zoom |
| `Home` | Editor: reset camera (ignored while a gizmo drag is active). World View: return camera and avatar to your own current world — see [World View](03-WorldView.md#orientation-and-locations) |

## Command Surface (Editor only)

| Input | Action |
|---|---|
| `Ctrl/Cmd+K` | Command Palette |
| `?` | Keyboard Shortcuts overlay (also reachable from the toolbar's "⌨ Shortcuts" button) — every Editor shortcut |

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

## Orientation & Navigation (World View)

Purely camera navigation — none of these load a document, change
selection, or edit anything. See
[World View](03-WorldView.md#orientation-and-locations).

| Control | Action |
|---|---|
| Compass indicator | Read-only heading with contextual markers for nearby structures and terrain features |
| **Home** | Return camera and avatar to your own current world (falls back to the shared origin if you haven't focused one of your own yet this session) — see [World View](03-WorldView.md#orientation-and-locations) |
| **Locations** | Open a list of the World, its structures, landmarks, and places, each with a **Focus** button |
| **Notifications** | Open your **Notification History** — a read-only log, not a camera action; see [World View](03-WorldView.md#orientation-and-locations) |
| **Camera**: Free / First Person / Third Person / Bird's-Eye | Lock the camera to a fixed offset from your own avatar instead of flying it yourself; click the active one again to return to Free — see [Avatars & Presence](06-AvatarsAndPresence.md#camera-perspective) |

### Contextual location descriptions

As you move through the world, the interface shows derived context like:

- "**Forest · near House**" — you're in a forest biome near a structure
- "**Grassland · 120m from Origin**" — open terrain at a distance from center
- "**River · House 50m SW**" — water feature with nearby building direction

These descriptions are computed from your position, terrain ecology,
hydrology, and structure placements — nothing is stored in the world.

## Avatar Movement (World View)

Walking your avatar directly, instead of flying the camera — see
[Avatars & Presence](06-AvatarsAndPresence.md#walking-your-avatar).

| Input | Action | Notes |
|---|---|---|
| `W` / `A` / `S` / `D` | Move / turn | Blocked by nearby buildings, trees, and wildlife, same as a wall |
| `Shift` (held) | Run | |
| `Space` | Jump | |
| `Alt` + `W` / `S` | Start continuous walk forward/backward | Keeps moving after keys are released; an ordinary `W`/`S` tap without Alt cancels it |
| `Alt` + `Shift` + `W` / `S` | Start continuous run forward/backward | Same cancellation rule as above |

## Vehicles (World View)

See [Avatars & Presence](06-AvatarsAndPresence.md#vehicles). Requires Avatar
Control Mode; a prompt appears automatically when you're close enough to a
vehicle to mount it.

| Input | Action | Notes |
|---|---|---|
| `E` | Mount the nearby vehicle, or dismount the one you're on | Only shown/active when a vehicle is in range or you're mounted |
| `W` / `S` | Accelerate / reverse | Replaces on-foot walking while mounted |
| `A` / `D` | Turn your avatar's own facing | Same turn as on foot — not vehicle steering |
| `←` / `→` (press) | Turn the vehicle's own attempted travel direction left/right | A single 45° turn per press — holding the key does not keep turning |
| `Ctrl` (held) | Brake | |
| `Q` (while mounted) | Store the vehicle you're on in your inventory | Removes it from the world; dismounts you at the same time |
| `Q` (not mounted, carrying a vehicle) | Deploy the currently selected stored vehicle | Spawns and mounts it at your current position; defaults to the most recently stored one |
| `[` / `]` (carrying 2+ vehicles) | Cycle the deploy selection to an older / newer stored vehicle | Only changes which one `Q` will deploy next — never mounts or removes anything by itself |

## Animals (World View)

See [Avatars & Presence](06-AvatarsAndPresence.md#animals). Requires Avatar
Control Mode; a prompt appears automatically when a catchable animal is
nearby or you're carrying one.

| Input | Action | Notes |
|---|---|---|
| `F` (near a catchable animal) | Catch it | Adds it to your inventory and removes it from the world |
| `F` (not near a catchable animal, carrying one) | Release the most recently caught animal | Spawns it at your current position, catchable again |
| `G` (near an animal you released) | Decorate the World with it | Saves it into the World's content as a decoration — no longer catchable; needs EDIT access; no on-screen prompt |
| `G` (near an animal decoration, no released animal nearby) | Undo the decoration | Removes it from the World and turns it back into a live, catchable animal |

Your inventory, placed vehicles, and released animals are saved on this
device and survive a reload — see
[Avatars & Presence](06-AvatarsAndPresence.md#what-survives-a-reload).

## Selection (Editor; clicking a brick in World View only inspects it)

| Input | Action | Notes |
|---|---|---|
| Click a brick | Select it (replaces the selection) | in World View this opens the Inspection panel only — see [World View](03-WorldView.md#world-view-is-read-only--building-happens-in-the-editor) |
| `Shift`-click | Add brick to selection | |
| `Ctrl/Cmd`-click | Toggle brick in/out of selection | |
| `Shift`-drag | Marquee-select (replaces the selection) | `Ctrl/Cmd+Shift`-drag adds to the selection; a plain drag orbits the camera |
| `Ctrl/Cmd+A` | Select All | |
| `Esc` | Clear Selection | Editor's own Escape chain, below — World View's own Escape only ever closes whichever panel is open |
| `Delete` / `Backspace` | Delete Selection — **Editor only** | one undo step; no keyboard binding at all in World View |
| Selection panel's **Focus Selection** button — **Editor only** | Frame the camera on the selected brick(s), instantly | no keyboard shortcut; camera-only — never touches the document, selection, or undo history; brick selections only, not structure placements |

## Transform — keyboard (Editor only)

| Input | Action |
|---|---|
| `→` / `←` | Move selection along world X |
| `↑` / `↓` | Move selection along world Z |
| `PgUp` / `PgDn` | Move selection along world Y |
| `R` | Rotate +90° around the selection pivot |
| `Shift+R` | Rotate −90° |
| `Shift` while gizmo-dragging | Precision mode (0.1× increments) |

## Transform — gizmo (Editor only)

| Input | Action |
|---|---|
| Hover a handle | Highlights it |
| Drag an axis handle (red X / green Y / blue Z) | Move along that axis (snapped) |
| Drag the center pad (amber) | Free move on the ground plane |
| Drag the rotation ring (purple) | Rotate around the pivot (snapped) |
| Release | Commit — exactly one undo step |
| `Esc` mid-drag | Cancel — nothing changes, no history |

If a member of a multi-brick drag or nudge would land on a brick outside
the selection, releasing there cancels the gesture instead of committing
it — every brick reverts to exactly where it started, with no new undo
entry. Rearranging bricks within the same selection is never treated as a
collision.

## Transform — numeric panel (Editor only)

| Input | Action |
|---|---|
| Type in X/Y/Z/R fields | Exact values; empty field = unchanged |
| Absolute / Offset toggle | Target-the-pivot vs. plain delta |
| `Enter` or Apply | One operation, one undo step — never snapped |
| `Esc` in a field | Clear the field (never clears the selection) |

## Alignment & Distribution (Editor only)

Available in the sidebar's Transform section (under **Advanced**) and
through the palette. Alignment needs **2+ bricks**; distribution needs
**3+**. Both operate on the whole selection bounds in **world axes** and
commit one command.

## Repeat (Editor only)

Also in the sidebar's Transform **Advanced** section. Creates **N**
additional copies of the selection, evenly offset along one axis, as
**one undo step** — the whole batch is collision-checked before anything
is created, so a mid-batch collision blocks the entire repeat rather than
creating some copies and not others.

| Input | Action |
|---|---|
| **Copies** field | How many additional copies (the original is never touched) |
| **Offset** field | Distance between each copy |
| **Repeat X / Y / Z** | Repeat along that world axis |

## Structures (Build Library) — Editor only

Composing, forking, and your personal library — see
[The Editor](02-TheEditor.md#structures-composing-forking-and-your-personal-library).

| Input | Action | Notes |
|---|---|---|
| Click a card in the **Structures** tab | Enter structure-placement mode, ghost preview follows the pointer | works for a built-in structure or one of your own **My Structures** |
| `R` / `Shift+R` while placing | Rotate the pending ghost ±90° | same placement-preview keys as a brick |
| Click | Commit — every brick in the structure lands as one undo step | refused at an occupied (red) position |
| `Esc` while placing | Cancel — nothing added | |
| Card's **⋮** menu, **Fork As New Document** | Start a brand-new document that begins as a copy of that structure | never modifies the library entry |
| Built-in card's **⋮** menu, **Fork to My Structures** | Add it to My Structures as-is | no document created, nothing extracted |
| Any card's **⋮** menu, **Info** | Show a read-only name/category/bricks/footprint/height/source/description panel | never editable |
| Selection with **1+ bricks**, then **Create Blueprint** (Selection panel's Advanced section, or Command Palette) | Open a small dialog (name / category / description + preview); save the selection as a new entry in **My Structures** | |
| **My Structures** card's **⋮** menu, **Rename** | Edit a personal structure's name/category/tags/description | personal structures only |
| **My Structures** card's **⋮** menu, **Remove** | Delete it from your library | never touches bricks already composed or forked from it |
| Any card's **⋮** menu, **Export Blueprint** | Download it as a portable JSON file | built-in or personal |
| **Import Blueprint** button (beside the My Structures heading) | Add a blueprint file to your library as a new entry | fresh identity, even for a re-imported file |

## Structure Instances (Editor)

A **structure instance** places a whole saved document as a single,
selectable unit — a live reference, not a copy — see
[The Editor](02-TheEditor.md#structure-instances-a-live-reference).

| Input | Action | Notes |
|---|---|---|
| Toolbar **Recent** dropdown, a document's **Place** button | Enter Place-Structure mode targeting that document | sibling to that entry's **Load** button |
| `R` / `Shift+R` while placing | Rotate the pending instance ±90° | same placement-preview keys as a brick |
| Click a placed instance (Select tool) | Select it as one unit, distinct from a brick selection | |
| Drag in the viewport, or the gizmo | Move / rotate the instance | |
| `Ctrl/Cmd+D` | Duplicate — places another instance of the same document | see [Duplicate](#duplicate-editor-only) — instance selections get a fresh instance instead of a fresh brick copy |
| Instance panel **X / Z / Rotation** fields, then Apply | Set an exact position/heading | Y (elevation) is always terrain-derived, never a target |
| Instance panel **Edit Source Document** | Open the referenced document to change its bricks | every instance updates, since an instance is a live reference |
| `Delete` / `Backspace` | Remove the instance | never touches the referenced document |

## Groups (Editor only)

| Operation | Availability |
|---|---|
| Create Group | bricks selected |
| Rename / Duplicate / Delete Group | a group selected |
| Add Selection / Remove Selection | bricks selected and a group selected |

Group transforms (move/rotate/align/distribute/numeric) operate on the
resolved member bricks; membership itself is never changed by a
transform.

## Clipboard (Editor only)

| Input | Action | Notes |
|---|---|---|
| `Ctrl/Cmd+C` | Copy | requires a selection |
| `Ctrl/Cmd+V` | Paste | disabled while the clipboard is empty |

## Duplicate (Editor only)

| Input | Action | Notes |
|---|---|---|
| `Ctrl/Cmd+D` | Duplicate the current selection in place — one undo step | works on loose bricks or a resolved group; a structure-instance selection duplicates too — see [Structure Instances](#structure-instances-editor). Leaves the clipboard (and any pending paste offset) untouched |

The duplicate becomes the active selection, so it's ready to drag or nudge
immediately.

## History

| Input | Action | Where |
|---|---|---|
| `Ctrl/Cmd+Z` | Undo | Editor only — no keyboard binding in World View |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo | Editor only — no keyboard binding in World View |

World View still HAS undo/redo — a Region/Landmark naming edit is a real
command, and its own History panel (see
[World View](03-WorldView.md#history--previewing-and-restoring-earlier-states)) can preview and
restore it — there is simply no keyboard shortcut wired to it there.

## Editor-only

| Input | Action |
|---|---|
| `1` / `2` | Switch Select / Place tool |
| `Ctrl/Cmd+S` | Save document |

## Placement (Editor only)

These keys belong to the Place tool, so they don't appear in the Command
Palette (there, `R`/`Shift+R` rotate a *selection*). World View has no
Place tool at all.

| Input | Action | Notes |
|---|---|---|
| Move the pointer | Preview follows the hovered ground/brick face | tinted red when the position is currently occupied |
| `R` | Rotate the pending preview +90° | persists across brick switches; resets when you leave Place mode |
| `Shift+R` | Rotate the pending preview −90° | |
| Click | Commit the preview as a real Brick | refused at an occupied (red) position |
| Build Library **Color** swatch | Choose the color for the next bricks you place | resets to the brick type's default when you pick a different type — see [Brick colors](02-TheEditor.md#brick-colors) |

To recolor bricks you've already placed, select them and use the **Color**
swatch in the Selection section — one undo step per change.

## Escape priority (Editor)

Escape is context-sensitive, in exactly this order:

1. **Active text input** — clears/blurs the field.
2. **Keyboard Shortcuts overlay** — closes the overlay (`?` also closes it).
3. **Command palette** — closes the palette.
4. **Active gizmo gesture** — cancels the drag (no history).
5. **Active marquee** — cancels the marquee.
6. **Otherwise** — clears the selection (in Place mode: exits placement).

### Escape in World View

An active text input still owns Escape the same way; otherwise Escape
closes whichever World View panel is open (the Focus panel, a naming
panel, and so on).
