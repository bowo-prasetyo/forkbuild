# ForkBuild 1.5 release notes

*Released 2026-10-21 as version 1.5.0.* For 1.4, see
[ReleaseNotes-1.4.md](ReleaseNotes-1.4.md); for what came after, see
[ReleaseNotes-1.6.md](ReleaseNotes-1.6.md).

1.5 makes the World round a build worth walking through, and keeps a
builder's credit with their work. Water runs and swells, weather comes and
goes, the moon waxes and wanes, the trees are real trees, and the land turns
through four seasons. Deer and residents stand in the same place on every
friend's screen, keep out of builds and settle down at night. A build that
looks like someone else's is pointed out, to the person publishing it and to
the builder it looks like, and a remix can no longer drop its original's
credit or terms. A build sent to everyone gets a short link and can be made
into a video. And the app can be spoken to: voice building, on the device,
in the Editor and World View.

There are no security fixes in this release; see "Changed" for two
hardenings. Hearts and short links are new on the networks, and voice
building downloads a speech model when it is turned on (see "Privacy"). The
protocol gains Publication Hearts, short links and the World clock, all
additive and described in [Protocol.md](Protocol.md); `PROTOCOL_VERSION` is
unchanged.

## New

### Sharing and credit

- **Short links:** a build sent to everyone is shared by a link of about 90
  characters, which names its build note on the Nostr relays instead of
  carrying the build, so Discord and Telegram take it. Builds kept to their
  link keep the long link.
- **Make a video:** beside **Save picture**, a time-lapse of a build going
  up, a turntable, or a walk-through filmed in World View: the avatar walking
  in, with the World's sounds, through its eyes if you like, after a sweep
  round the outside if you ask for one. Wide for YouTube or tall for Shorts,
  TikTok and Reels, with music, credits for everyone who built it, and a
  description that links to the build.
- **Hearts:** one tap on **♡** says you love a build, and a second takes it
  back. Comments name their authors by name instead of by key.
- **Look-alikes:** pressing **Publish** on a build that looks a lot like
  someone else's says whose, how much is the same, and that **Edit a Copy**
  credits them (once a visit; it never blocks). A build's page and World
  View's **About this build** list **Similar builds published earlier**,
  the 🔔 tells a builder when a build by someone else that looks like
  theirs appears after it, and their Explore cards show such later
  look-alikes for every build signed with their name, from any of their
  devices. Builds that only share a ready-made structure, even one their
  builders changed a little, aren't counted.
- **What a remix changed:** *What changed: Added a Barn, 2 pieces of
  furniture, and 12 other bricks* under a remix's **Remixed from**, and a
  line for each remix in a family tree.
- **Sealed exports:** **File → Export** of your own build seals it with
  your identity's key. **Import** of someone else's build makes it your copy
  crediting them when its license allows remixes, and refuses it when it
  doesn't.

### The World

- **Water:** lakes ripple, the sea swells, rivers run in carved beds with
  foam, white water over rock, cascades, springs and round pools, and an
  avatar wades rivers and rides the swell.
- **Weather:** clouds and overcast skies, rain for a few minutes at a time,
  wet ground that dries off, and gentle storms, the same for everyone at the
  same moment. Rain stays outside a build and drums on its roof, and sounds
  like rain. **Always day** keeps the sky clear.
- **The moon** goes through its eight phases.
- **Realistic trees,** taller than a house, swaying in the wind and casting
  dappled shadows; full detail close by and in view.
- **Four seasons:** blossom, summer, autumn leaves that fall, and winter
  snow that lies on the ground and on roofs. In winter the sun hangs low,
  lakes freeze hard enough to walk on, and snow crunches and keeps your
  footprints. **Season** in World View's settings keeps one season on this
  device. The weekly challenge gains six seasonal themes, the first, a
  winter cabin, in the week of 16 November 2026.
- **Residents** step out of their doors and stroll down the lane, and walk
  home at dusk; deer and rabbits lie down for the night. Wild animals keep
  out of builds, and shrink away from one built where they graze. Wild trees
  give way to builds: no trunk grows through a floor.
- **One World clock:** connected friends agree on the time, so the deer you
  both look at is in the same spot.

### Building and finding your way

- **Commands in plain words:** *paint the roof red*, *select all the
  windows* or *delete the trees* in the command palette (`Ctrl`/`Cmd`+`K`).
- **Voice building (experimental):** **🎤 Voice** or `V` in the Editor
  (*paint the roof red*, *undo*) and in World View (*take me to the old
  mill*, *go home*, *first person*, *sound off*). Speech is understood on
  the device by a small Whisper model, downloaded once (about 70 MB) when you
  turn voice on, after saying what and from where. What you say is never
  sent anywhere.
- **Help:** **Help** under **More** answers questions from the user guide,
  in the app; a question in the command palette offers **Ask the guide**.
- **The Build Library finds what you describe** (*something to cross the
  river*), in all eight languages.
- **Suggest a title** in **Build Properties**, and **Describe the Build**
  (`I`) for a screen reader; a shared or embedded build is described too.
- **Make it yours, then publish:** every ready-made build, from Home, a
  challenge or **New**, carries a card that asks for a first change and then
  offers **Publish it**; on a phone it floats over the 3D view.
- **World View's About this build** shows on arrival, shows the build's
  comments, and opens a long description in a reading sheet. The Editor's
  build title unfolds into the same panel.
- **My Worlds** shows each World's picture and description, with the one
  visited last under **Pick up where you left off**.
- **Ground vehicles** (the hay wagon, bicycle and penny-farthing) drive up
  ramps and across bridges, and collide with walls at their own height. Two
  example builds to drive over, the Hay Wain Bridge and the Packhorse Arch,
  are in the repository to import.
- **Move to its grid spot** in **Move Placement** takes a build placed round
  the plaza between 12 and 17 October back to a spot of its own.
- **A logo that looks like the game.**

## Removed

- World Locations' trust-diagnostics banner and Inspect's Discovery status
  row, which only ever showed the same neutral text.
- Code no entry point reached: an early signed spatial index and its
  discovery, a separate streaming World View session, and the 0.2.7 / 0.2.9
  collaboration protocol. Nothing a player or peer uses changes.

## Changed

- **Builds have room again:** a newly published build stands on a spot of
  its own on the id-keyed grid, not in rings round the challenge plaza, and
  a week's plaza shows that week's entries alone. A grid spot under water is
  passed over, so no new build lands in a lake.
- **Builders keep their terms:** a remix offers only licenses that keep its
  original's terms, and keeps the credit to its builder. **Make a video**
  says what a build's license asks when someone else built it.
- **One word for each idea:** the app and the guide say *build* and
  *remix*, not fork or document.
- **A lighter site:** the published site is about 9 MB instead of 79 MB.
  Each visitor downloads only their own language, the network code loads
  once Home is drawn, and Steem's and Blurt's posting code only when
  something is posted.
- **Hardening:** the published site's Content Security Policy no longer
  allows `'unsafe-eval'` (it allows `'wasm-unsafe-eval'`, for voice
  building's WebAssembly only); and the reference rendezvous worker no
  longer sends the TURN provider's error text to visitors.
- **The voice model is pinned:** voice building loads
  `onnx-community/whisper-tiny` at one commit, and the speech engine at one
  version, and refuses any file whose SHA-256 differs.

## Fixes

- **Walk inside it** always reaches inside: the arrival stands you in front
  of a tree by the door, not behind it.
- Rivers no longer stop on dry land, and pools are round.
- Rain no longer falls inside a build.
- Residents no longer stay shut in their house or fenced garden, and walk
  round what was just built nearby.
- Wild animals no longer stand inside houses or walk through walls.
- A locked name is asked to unlock, not to choose a name.
- World View's **About this build** no longer stays empty until a brick is
  clicked.
- A look-alike is still noticed when its bytes reach this device after its
  listing, or after a restart, and copies made through **My Structures**
  are compared like any other.
- Voice building starts with the model pinned, and hears *undo* when Whisper
  writes it "and do".

## Privacy

The visitor count keeps its rules: the official site only, one image
request with a fixed path, no cookie, never with Global Privacy Control or
Do Not Track, and off under **Your Data → Daily visitor count**. It now also
hears, once each time ForkBuild is opened, when the Editor opens, when a
ready-made build opens in it, and when a first edit is made there; when a
shared link is a short one; and `?ref=` from Game Jolt, IndieDB and YouTube.

Also new:

- **Hearts you give are public:** each says, under your name and signed
  with your identity's key, that you love a build or no longer do. It goes
  to connected peers and to the network chosen for hearts (Nostr unless you
  change it), where anyone can read it. Taking a heart back sends a newer
  record; the earlier one may stay where it was sent.
- **Short links** send the build's Publication id to the rendezvous worker,
  which asks the public Nostr relays for its note and keeps nothing; the
  app then asks the relays for the note too.
- **Voice building** downloads its model from Hugging Face and its engine
  from jsDelivr when you turn it on. What you say is recorded and
  understood on your device, and never sent anywhere.
- **Your clock, to connected peers:** while connected, your device and each
  peer tell each other the time, a few times on connecting and then once a
  minute. Only the time is sent.
- This device keeps the hearts it made or accepted, which of its builds are
  on the Nostr relays, and, for at most 500 builds and 30 days each, the
  builds whose bytes haven't arrived yet, so they can be compared with yours.

See [Privacy.md](Privacy.md) for the full list.

## Upgrading from 1.4.0

- Nothing to do for your data: 1.5 opens everything 1.4 saved.
- **Update before 16 November 2026.** Every copy works out the weekly
  challenge from the date, and 1.5 spreads the seasonal themes through the
  weeks. The weeks up to 9 November keep their themes; from 16 November a
  copy of 1.4 shows a different theme and tag from everyone on 1.5.
- If you run your own rendezvous worker, redeploy it (`wrangler deploy`)
  before sharing short links; `NOSTR_RELAYS` in `wrangler.toml` chooses the
  relays it reads, the app's defaults when unset. An older worker doesn't
  answer `/n/` links.
- What 1.4.0 doesn't show:
  - **Hearts:** 1.4.0 skips them.
  - **Short links** (`/n/…`, `#/n/…`) don't open in 1.4.0.
  - **Sealed exports** import into 1.4.0 as a plain build, without the seal's
    checks.
  - A build that was never given a placement and whose grid spot is under
    water is shown on dry ground by 1.5 and in the water by 1.4.
- Anyone you share with, walk with or build with should update too.

## Known limitations

The limitations listed for 1.4 still apply, except that a build sent to
everyone now has a short link and the published site no longer allows
`'unsafe-eval'` (running the repository unbundled still does). Everything is
kept in the browser's own storage (back it up on **Your Data**, or copy it to
another device), one rendezvous server runs by default, re-publishing an
older publication is a manual step, a build kept to its link still has a
long link, and there is no push server. Also:

- **Voice building is experimental.** It was tried end to end with a
  synthesized voice, in the Editor and World View, and did what was meant
  for twelve of thirteen commands, but not yet with people's own voices,
  rooms and phones. Whisper tiny mishears short words (*undo* as "and do",
  *add* as "at"), and voice does what the command palette does: paint,
  select, delete and actions by name, not placing new bricks.
- **Look-alike hints** only compare builds this device has seen.
- Birdsong and parked vehicles still go by the trees the World's seed grows,
  so a tree that gave way to a build can still be heard.
- **Bitcoin**, **Base**, **Blurt** and **Steem** stay Experimental.
