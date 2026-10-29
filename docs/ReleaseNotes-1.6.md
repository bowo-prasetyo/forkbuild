# ForkBuild 1.6 release notes

*Released 2026-10-29 as version 1.6.0, and as 1.6.1 the same day* (see
"1.6.1" below). For 1.5, see [ReleaseNotes-1.5.md](ReleaseNotes-1.5.md).

1.6, "First publish", is about the stretch where 1.5's first players
stopped: between a first brick and a published build. In the launch week,
24 daily visits led to 10 Editor opens, 3 first edits and no build
published. So a first Publish is now one sheet, with remixing on. **Try it
now**'s house hands over a job in four steps. A first walk opens in daylight,
with a clearing round every build. And the Editor got a week of work on
placing and editing: a camera drag never places a brick, Shift+drag lays a
row, you can pick a brick up from the build, and dragging a selection moves
it.

There are no security fixes in this release. A line you **Say** in World
View goes to the peers who can see your avatar, and look-alikes keep two
new records on this device (see "Privacy"). The protocol gains one
additive peer message, a signed **Say** line; `PROTOCOL_VERSION` is
unchanged. The weekly challenge's themes are the same as 1.5's.

## 1.6.1

**The seasons follow the challenge week.** In a week whose challenge theme
belongs to a season, the World stays in that season from Monday to Monday,
for everyone: the land, the sky, the lakes' ice, and whether rain or snow
falls. So the *winter cabin* week of 16 November 2026 is winter all week,
with snow lying and the lakes frozen hard enough to walk on. The season
doesn't stand still: it moves from early in the season to late and back, so
the land keeps changing a little. Every other week, the seasons turn every
five hours or so, as before, and Monday changes the season and the theme
together.

- While a seasonal week runs, the challenge page says the World is in its
  season for everyone. For a seasonal week before or after, it still
  suggests choosing that season under **Season** in World View.
- **Season** in World View still keeps one season on your device, whatever
  the week.
- **Update before 16 November 2026.** A copy of 1.6.0 or older keeps
  turning the seasons through a seasonal week, so friends walking together
  on different versions see different seasons.

## New

### A first build, published

- **Publish in one sheet.** A first Publish used to ask three questions in
  turn, and one of the answers published nothing. Now it is one sheet: your
  name (a suggestion is filled in, and typing replaces it), **Others may
  remix it** and **Everyone can find it**, both already ticked and
  changeable right there, and one **Publish** button. **Publish without a
  name** waits under **Advanced**.
- **Try it now's job in four steps:** a roof, a chimney, a path to the door
  and a garden, shown one step at a time with dots and a count (*2 of 4
  stones laid*). That makes ten bricks of the builder's own. The first-build
  guide waits, folded, until the job is done, so only one tutor talks at a
  time. Its third step is now **Add something of your own** (five bricks
  placed by hand), not dropping in a structure.
- **A first walk in daylight.** A page's first visit to World View opens in
  fair late-morning light for a minute, then eases into the shared sky over
  the next. It ends at once when someone else is there, so friends share
  one sky.
- **A clearing round every build.** No tree grows within 15 units of a
  build, so **Walk inside it** arrives with nothing between you and the
  door.
- **Your own build's link** offers **Keep building** instead of **Edit a
  Copy**, and World View no longer offers to copy your own build.
- **Unsaved work after a reload:** the Editor offers back a build left
  unsaved when the page closed, even one never saved, and names it.

### Building in the Editor

- **Only a click places.** Turning or panning the camera while placing no
  longer drops a brick, or a whole structure.
- **Shift+drag lays a row** of the brick in hand, as one undo step.
- **Pick a brick from the build** with Alt-click (Option-click on a Mac), or
  a long press on a touch screen: its kind, colour, turn and tilt.
- **Keys 3 to 9 hold the bricks used lately**, like a hotbar, and each
  key shows on its tile in the Build Library.
- **A chip over the view says what a click will place**, and its colour.
- **Dragging a selected brick moves it.** A camera drag keeps the
  selection, and **See the Whole Build** (`Home`) brings a lost view back.
- **Undo and Redo in the toolbar.** **Paint selected** shows what it does,
  and a new selection brings its card into view.
- **Structures, like bricks:** one stays in hand after it is placed, and it
  rests on what's under it, so you can put a chimney on a roof or a shed on
  a deck.
- **A blocked click says so, and sounds it** (*Something's in the way
  here…*). A placed build turns only where it fits.
- **Placing by touch takes two taps:** the first shows where it goes, and
  a second tap on it, or the touch bar's **Place**, puts it there.
  **Cancel** stops placing with nothing placed.
- **The Build Library comes first while placing**, its search stays
  pinned, previews are bigger with each brick's size, and long structure
  names wrap. It works from the keyboard, with one Tab stop per list and
  arrow keys within it.
- **Undo after removing a structure** from My Structures.
- **A group is named as it is made**, and the command palette finds Save,
  Publish, New Build, Export and the view's actions.
- **Saving…** shows until a save is stored, and a build never saved says
  **Not saved yet**.
- On a phone, the Editor's header is one row, Sound is one small button,
  and the first-build guide shrinks to its next hint while you place.

### Walking together

- **A call goes with you:** a voice call keeps playing in World View and on
  every page, with a call bar for Accept, Mute and Hang Up. You can call a
  friend from their avatar.
- **Say something:** `Enter` or **💬 Say** in World View shows a short line
  in a bubble over your avatar to the people who can see you.

### Finding your way

- **My Builds** in **More → You** opens your own builder page.
- **Signed Records:** the page called Publications is now Signed Records,
  and it says it holds signed records, not your builds. Its entries are
  records, and it says that removing one never touches a build.
- The Peers page's **Following** filter is now **I follow**, and points to
  the Following page.

## Changed

- **Publish is the meadow green**, and Save is outlined beside it.
- **First person doesn't draw your own avatar**, so its glasses no longer
  bob across the view.
- **Look-alikes are fairer both ways.** A copy laid in rows, mirrored or
  extended is found, and plain walls, floors and boxes aren't. A copy can't
  come first by its date alone: dates are backed by when this device first
  saw each build. The likeliest builds are compared first, whatever their
  age.
- **Voice building hears with Whisper base:** 93% of English commands
  right where Whisper tiny managed 68%, at about 4.3 s a command. Turning it
  on downloads about 107 MB instead of 70, and asks again if it was on
  before. Outside English it says it hears English best, and a spoken
  command acts on the selection only when it says so (*paint this red*).
- **The palette and the Build Library know more words** in every language,
  measured against what players ask.
- The example builds moved to `examples/`.

## Fixes

- Two friends who open one **Walk here with me** link at the same moment
  both get in.
- A World link to a build that isn't on this device says so, rather than
  loading for ever.
- The 3D view resizes when a banner above it closes.
- A page still downloading shows a loading line.
- An empty or too-long chat message is refused with a message you can
  read, not an internal error.
- A voice command that Whisper gets stuck on is given up after 45 seconds.

## Privacy

Also new:

- **What you Say** in World View is signed and sent to the connected peers
  who may see your avatar. It is shown for a few seconds and stored
  nowhere.
- **Look-alikes keep two records on this device:** when it first saw each
  published build (at most 5000), and how many bricks of each kind each
  build has (at most 2000). Neither is sent anywhere.
- **Voice building** downloads `onnx-community/whisper-base` instead of
  whisper-tiny, and deletes whisper-tiny's files.
- The bricks you used lately (keys 3 to 9) are kept on this device.

See [Privacy.md](Privacy.md) for the full list.

## Upgrading from 1.5.0

- Nothing to do for your data: 1.6 opens everything 1.5 saved.
- **Voice building asks again** before downloading its new model.
- **Update before 16 November 2026.** Copies of 1.4 or older show other
  weekly themes from then on, and copies older than 1.6.1 turn the seasons
  through the winter cabin's week instead of holding winter.
- A **Say** line from 1.6 isn't shown by 1.5; everything else between them
  works as before.

## Known limitations

The limitations listed for 1.5 still apply. Also:

- **Monday changes the season at once.** When a week that holds a season
  starts or ends, at 00:00 UTC, the land, the sky and any lying snow change
  in a moment rather than easing over.
- **The World's trees are still the realistic ones** from 1.5. Bringing
  them to the bricks' scale is the diorama pass, still to come.
- **The look-alike notice can still come before the Publish sheet** on a
  first publish.
- **Only the House has a starter job;** the other ready-made builds ask for
  one first brick of your own.
- **Voice building stays experimental:** 49% of commands right across
  eight languages on synthetic voices, English 93%, others 31–53%, still
  not tried with people's own voices.
- **Placing by touch:** there is no Shift+drag row on a touch screen, and
  the touch bar still scrolls sideways in seven languages.
- **Bitcoin**, **Base**, **Blurt** and **Steem** stay Experimental.
