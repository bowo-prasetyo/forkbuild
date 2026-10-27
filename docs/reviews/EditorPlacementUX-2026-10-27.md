# Editor placement UX audit, 2026-10-27

A Senior UX Designer's audit of the Editor view (ForkBuild 1.5.0, branch
head of 2026-10-27). It asks one question: **can people place bricks
easily, one brick at a time or as a whole structure?**

It follows the funnel finding in
[the creative-direction audit of 2026-10-22](CreativeDirection-2026-10-22.md):
10 Editor opens, 3 first edits and no Publish. Placing is the first thing
a builder does in that stretch, so a problem here costs every later step.

This is a review, not a decision record. [Pillars.md](../Pillars.md) still
wins, and whatever is adopted goes into the roadmap the usual way.

## How this was checked

- I read the placement path from start to end: `ui/views/EditorView.js`,
  `ui/components/BuildLibraryPanel.js`, `StructureLibraryCard.js` and
  `EditorTouchActionBar.js`, `application/editorSession/pointerInputMethods.js`,
  `application/tools/PlacementTool.js` and `StructureCompositionTool.js`,
  `application/editor/PlacementPositionService.js` and
  `StructurePlacementValidator.js`, and `renderer/CameraController.js`.
- I ran the app in Chromium (Playwright) at 1440×900, at 1366×768 and on an
  emulated iPhone 13. I counted bricks in the open document after each
  gesture, so every "placed" and "did not place" below is a measured
  result, not a guess.

## Verdict

**A single brick is easy to place, as long as you never move the camera.
Structures are hard to place, and on a phone every placement is blind.**

The basics are sound: the ghost preview, the red tint for a blocked spot,
stacking on the face you point at, a roof resting on its walls, R and T
before you place, and the colour swatches beside the bricks. But one input
bug undoes most of it. **Orbiting or panning the camera in Place mode
places a brick**, and when you are placing a structure it drops the whole
structure and leaves Place mode. Builders have to move the camera all the
time, so this costs them several times in every session.

| Task | Mouse and keyboard | Touch |
|---|---|---|
| Place one brick on the ground | ✅ Easy | ⚠️ Works, but you see nothing until it lands |
| Stack a brick on another | ✅ Easy (face-aware, rests on what is below) | ⚠️ Blind, as above |
| Look around while placing | ❌ Every drag places a brick | ✅ Two-finger and drag gestures are safe |
| Place a structure on the ground | ⚠️ One per trip to the library; nothing says why a blocked click fails | ❌ The ghost starts off-screen, the first tap commits it, and there is no Cancel |
| Place a structure on top of a build | ❌ Not possible: structures only go on the ground | ❌ Same |
| Pick a brick with the keyboard | ❌ Library tiles can't be focused | n/a |

## What works, and should be kept

- **The ghost preview** shows the brick's own colour and is tinted red when
  the spot is taken (`PlacementTool#_showPreview`).
- **Stacking by face.** Point at a side or the top of a brick and the new
  one goes there. A wide brick rests on whatever is under it, so a roof sits
  on its walls (`PlacementTool#_restOnTop`).
- **R and T before placing**, and they stay set when you switch to another
  brick.
- **Colour sits with the bricks.** The swatches appear as soon as a brick is
  chosen.
- **On a phone, picking a brick closes the drawer**, so your next tap
  reaches the scene.
- **Touch taps allow a little movement** (10 px), so a tap that wobbles a
  little does not turn into an orbit.
- **Recent structures, search by meaning, and Undo** all work as expected.

## Findings

Each finding is ranked: **P0** breaks the core loop, **P1** is a
significant barrier, and **P2** is friction or polish.

### P0-1. Moving the camera in Place mode places bricks and structures

**Fixed 2026-10-27:** only a click places now (roadmap, "Moving the camera while placing places nothing").

**What happens.** In Place mode, starting any drag places a brick at the
point where the drag began: a left-drag (orbit), a right-drag (pan) or a
middle-drag (dolly). When you are placing a structure, the same drag drops
the whole structure and returns you to Select.

**Evidence.** These are measured brick counts from a new document in Place
mode:

| Gesture | Bricks |
|---|---|
| Start | 1 |
| Left-drag to orbit | 2 |
| Right-drag to pan | 3 |
| Click | 4 |
| Placing "Cottage", then a left-drag to orbit | 5 → **26**, and the tool returns to Select |

**Why.** `PlacementTool#onPointerDown` (`application/tools/PlacementTool.js:141`)
and `StructureCompositionTool#onPointerDown`
(`application/tools/StructureCompositionTool.js:92`) commit on pointer
down, and neither checks which button was pressed. `OrbitControls` takes
the same pointer down as the start of an orbit or a pan. Touch input does
not have this bug, because `pointerInputMethods.js` holds back a touch
until it lifts as a tap (`TOUCH_TAP_SLOP_PX`, `_replayTouchTap`). The mouse
path has no such check.

**Impact.** This is the most important finding in the audit. Builders orbit
all the time to see where a brick will go, so they keep making stray bricks
and have to Undo them. With a structure, one stray drag commits 20 or more
bricks in the wrong place. New builders are likely to read this as "the
editor is broken" rather than as their own mistake. It probably explains
part of the gap between 10 Editor opens and 3 first edits.

**Recommendation.** Commit on **pointer up**, and only for the **primary
button**, and only when the pointer moved less than a small threshold since
pointer down (reuse `MARQUEE_DRAG_THRESHOLD_PX`, which is 6 px). This is the
rule touch already follows, applied to the mouse too. Keep the ghost
following the pointer while the camera moves.

### P1-2. A blocked placement fails silently

**Fixed 2026-10-27:** a blocked click now shows a message and plays a soft "blocked" sound (roadmap, "A click on a blocked spot says so, and sounds it"). The fix also made the Editor's message strip readable: it had been dark text on a dark strip in the light theme. The red ghost's pulse is not done yet.

**What happens.** Clicking while the ghost is red does nothing. There is no
message, no sound and no shake. It looks the same as a missed click.

**Evidence.** I placed a House, then hovered a second House over it. The
preview was `valid: false`. I clicked, and the brick count stayed at 47. No
feedback message appeared.

**Recommendation.** When a click lands on a blocked spot, give a short
response: a message such as *"Something's in the way. Try another spot, or
press R to turn it."*, a soft "blocked" sound (the Editor already has a
sound service) and a quick pulse of the red ghost. Use the same response for
bricks and for structures.

### P1-3. Structures can only be placed on the ground

**Fixed 2026-10-27:** pointed at the top of a brick, a structure goes there and rests on the tallest brick under it (roadmap, "A structure rests on what's under it").

**What happens.** A structure's preview always sits at height 0. If you
point at an existing build to put a structure on it (a chimney on a roof, a
tower on a platform, a shed on a deck), the ghost drops to the ground
behind the build, turns red, and cannot be placed.

**Why.** `StructureCompositionTool#onPointerMove` only calls
`calculateStructureGround()` (line 84) and never reads `pickedBrick`. The
code calls this out as intended ("no structure-on-structure Y-stacking"),
but builders will not expect it, because a single brick does stack.

**Recommendation.** When the pointer is on the top face of a brick, raise
the structure to rest on what is under its footprint. This is the same rule
`PlacementTool#_restOnTop` already uses for wide bricks. Bricks and
structures then follow one rule, which matches
docs/Principles.md, *Buildable Things Share One Placement Experience*.

### P1-4. A structure places once, but a brick places again and again

**Fixed 2026-10-27:** a structure stays in hand after it is placed, turned the same way, until Escape, Select or Cancel (roadmap, "A structure stays in hand, like a brick").

**What happens.** After you place a brick you are still in Place mode, so
you can click again to add another. After you place a structure the Editor
returns to Select, so placing four trees or a row of fences takes four trips
to the library. On a phone each trip means opening and closing the drawer.

The two modes also contradict each other on screen. After a structure lands,
the First Build Guide still says *"With Place still on, click the top of a
brick…"*, but Place is no longer on.

**Recommendation.** Keep structure placement active after each placement,
as bricks already are (and as `StructurePlacementTool` is). Leave it with
Esc, Select or Cancel. If one-shot placement is ever wanted, make it the
exception, for example after a Paste.

### P1-5. On touch, every placement is blind

**Fixed 2026-10-27:** placing by touch takes two taps, one to see the ghost and a second on it (or **Place**) to put it down (roadmap, "Placing by touch: see it, then place it"). A structure's ghost still starts beside the build until the first tap.

**What happens.** Touch has no hover, so the Editor plays a tap back as
"hover, press, release" all at once. The ghost exists only for the moment
the brick is committed.

- **Bricks.** You cannot see where a brick will land, or which way it faces,
  until it has landed. Pressing Rotate or Tilt beforehand only shows a
  message ("Rotated +90°"). Nothing visible changes.
- **Structures.** The ghost starts at an automatic spot beside the build
  (x = 6 to 7). On a phone that spot is mostly off the right edge of the
  screen and behind the Sound panel. Your first tap moves the structure
  there *and* commits it, so you never see it where you put it.

**Recommendation.** Use two steps on touch. The **first tap moves the
ghost** and leaves it there. A **second tap on the ghost**, or a **✓ Place**
button in the touch bar, commits it. Rotate and Tilt then turn a ghost you
can see. Start a structure's ghost at the centre of the view, not beside
the build.

### P1-6. Touch has no Cancel, and Tilt reports a change that did not happen

**Fixed 2026-10-27:** the touch bar has **Cancel** while placing, Tilt is on only for a brick, and picking a structure says what to tap (same roadmap entry).

- **No way out.** Esc is the only way to cancel placing a structure. A
  phone has no Esc, and no Cancel button appears anywhere (measured: no
  visible Cancel, Done or Stop button). The only way out is to open the
  Tools drawer and press Select, which is hard to discover.
- **Tilt says something that is not true.** While you place a structure,
  the touch bar's Tilt button stays enabled. It shows *"Tilted onto its next
  side — tap the ground to place"*, but `StructureCompositionTool` ignores
  T, so nothing tilts (`ui/views/EditorView.js:1525`).
- **Desktop wording on a phone.** The message shown when you start placing
  a structure (`editor.placingStructure`) says *"click to place, R to
  rotate, Esc to cancel"* on a phone as well.

**Recommendation.** While placing, show **✕ Cancel** in the touch bar
(and **✓ Place**, from P1-5). Disable Tilt when the piece being placed
cannot tilt. Add a touch version of `editor.placingStructure`, as
`touchPlaceHint` already exists for bricks.

### P1-7. The Build Library cannot be used from the keyboard

**What happens.** Brick tiles and structure cards are `<li @click>`
elements with `tabIndex -1` (`BuildLibraryPanel.js:721`,
`StructureLibraryCard.js:31`). In the library, Tab reaches only the two
tabs, the search box and each card's ⋮ button. Someone using the keyboard
or a switch device cannot choose a brick or place a structure. This fails
WCAG 2.1.1 (Keyboard).

**Recommendation.** Make each tile a `<button>` that says whether it is
selected (`aria-pressed`). Let the arrow keys move through the brick grid,
and let Enter choose a brick or start placing a structure. Search should
already make this usable: type "roof", press ↓ and then Enter.

### P2-8. The library is below the fold

At 1366×768 the first brick tile starts at **y = 524 px**, and the sidebar
is **2,789 px tall** for 59 bricks and 32 structures. The build's info
panel, *Build with me* and the Selection card all sit above the library. In
Place mode the Selection card has nothing useful to show. So the area you
use most is the one you have to scroll to, and when you scroll down to
bricks, the tool switcher and hint scroll out of view.

**Recommendation.** Put the Build Library first, or let it fill the sidebar
in Place mode. Fold the build info by default. Keep the tabs and search
fixed at the top while the list scrolls.

### P2-9. Library previews are too small to tell pieces apart

The previews are 32 px, and every piece is scaled to fill its square. As a
result Cube, Half Cube and Block 2×2 look almost the same, and Plate 1×1
looks as big as Plate 2×4. Structures (Cottage, House, Large House, Tool
Shed) are hard to tell apart at that size, and long names are cut off
("Garden Cott…").

**Recommendation.** Use previews of 56 to 64 px. Show sizes as a small
label (1×4, 2×2). Lay structure cards out in a grid with larger previews,
and show the full name on hover or on focus.

### P2-10. Nothing in the view says what you are holding

On desktop the hint says *"Hover the ground, R to rotate, click to place"*
but does not name the brick. On a phone the hint lives inside the closed
drawer, so once you pick a brick nothing shows that you are in Place mode,
which brick you chose, or which colour.

**Recommendation.** Add a small **holding chip** in the view, next to the
touch bar on a phone: a preview, the name, a colour dot and ✕. Tapping the
chip opens the library again. It is always visible and always tells you
what will happen when you click.

### P2-11. Floating panels cover the area where you build

- On a phone the **Sound** panel covers about 60% of the view's height,
  across half its width. My first test tap on the "ground" landed on it.
- On desktop the **First Build Guide** covers about 300×280 px of the view,
  and the feedback message slides in underneath it.

**Recommendation.** Move Sound into the toolbar's overflow menu on small
screens. Let the guide fold to a chip on its own while you place, as it
already does on a phone ("First build · 0/6").

### P2-12. Structure collision ignores rotation

**Partly fixed 2026-10-27:** a structure from the Build Library, and every brick already in the build, are now checked by their turned footprints (same roadmap entry). A placed build's own box (Place Structure) still ignores its turn.

`StructurePlacementValidator#canPlace` receives the structure's
**unrotated** bounds (`StructureCompositionTool.js:129`). A long structure
turned 90° is therefore checked against the wrong footprint. The ghost can
be green while it overlaps something, or red when the spot is clear, and
builders will lose trust in the colour.

**Recommendation.** Rotate the bounds before the check. This is the same
transform `transformStructureBricks()` already applies when the structure
is committed.

### P2-13. Smaller issues

- **The Place button means two things.** It stays highlighted while you
  place a structure, but pressing it cancels the structure and switches to
  bricks without telling you (`EditorView.js:280`).
- **Removing a structure from My Structures** happens at once, with no
  confirmation and no Undo.

## Beyond the fixes

These are not defects, but each would make building noticeably faster once
the fixes above are in.

- **Drag to lay a row.** Hold Shift and drag across the ground to lay a
  line of the current brick. Walls and paths are what people build most.
- **Pick from the scene.** Alt-click (or a long press) an existing brick to
  take its type, colour and rotation. Builders expect this from other
  building games.
- **Number keys for recent bricks.** Let 3 to 9 choose the seven bricks used
  most recently. 1 and 2 are already Select and Place.

## Suggested order

| # | Change | Size | Why first |
|---|---|---|---|
| 1 | P0-1: commit on a primary-button release without a drag | Small: one rule in `pointerInputMethods.js` | Removes the most frequent error, and it is already solved for touch |
| 2 | P1-2: feedback for a blocked click | Small | Makes every other placement rule understandable |
| 3 | P1-5 and P1-6: two-step placement on touch, Cancel, and Tilt only when it applies | Medium | Phones are where first visits arrive from shared links |
| 4 | P1-4: keep structure placement active after placing | Small | One rule for bricks and structures |
| 5 | P1-3: structures rest on what is under them | Medium | Lets builders compose structures, not only place them side by side |
| 6 | P1-7: keyboard access to the library | Small to medium | Accessibility, and fast for experienced builders |
| 7 | P2-8 to P2-12 | Small each | Polish that adds up |

Items 1 and 2 together are probably less than a day's work, and they
change how the Editor feels more than anything else in this list.
