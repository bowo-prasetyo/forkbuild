# Pillars

What ForkBuild is for, written as the test every feature has to pass. When
this page and another document disagree about what to build next, this page
wins; [VISION.md](VISION.md) says where the project is heading, and
[Principles.md](Principles.md) says how the code keeps its promises.

## The fantasy

> **Build a little place. Anyone can remix it. Walk inside it with friends.**

A player opens a link, with no account and no download, snaps bricks into a
house, a bridge or a whole village, and shares it. Someone else makes their
own copy of it, credited, and builds on it. Then they walk through what they
made, together.

The Home page's line says the same thing in nine words: *Build in 3D in your
browser. Remix anything. Own your work.*

## The three pillars

### 1. Building feels joyful

The brick kit is the game. Placing, stacking, turning and colouring bricks
should be quick, forgiving and satisfying, with enough pieces to build what
you imagine and enough limits to make it a craft.

A feature serves this pillar when it:
- adds bricks, structures or colours that open up new things to build;
- makes building faster, clearer or more forgiving (snapping, undo, touch);
- helps a newcomer finish a first build they're proud of.

### 2. Every build has a family tree

Remixing is what makes ForkBuild different from other builders. Every copy
records where it came from, so credit travels with the work, and a build can
grow through many hands.

A feature serves this pillar when it:
- makes it easier to find something to remix, or to remix it;
- shows a build's family: what it came from, what came from it, who made each;
- gives builders a reason to build together, like the weekly challenge.

### 3. Your work is yours, and lives in a world

Builds are kept on your device, signed with a key you hold, and can be
backed up, moved and exported without asking anyone. And a build isn't only a
model: it's a place you can walk into, alone or with friends.

A feature serves this pillar when it:
- keeps a player's work safe, portable and under their control;
- makes a build more worth visiting: walking, meeting people, the world around it;
- connects the world back to building, so exploring gives you reasons to build.

## The filter

Before starting a feature, answer these in its roadmap entry:

1. **Which pillar does it serve, and how would a player notice?** If the
   honest answer is "none, but it's needed", it is infrastructure: build the
   smallest version that works and keep it out of a newcomer's way.
2. **Does it make the first ten minutes harder?** Anything a newcomer can
   meet on the Home page, in the Editor, on a shared link or in the main
   menu has to be explained in a player's words, or moved to
   **More → Advanced**.
3. **Does building get at least as much as everything else?** If the last
   few releases led with something other than building, remixing or the
   world, the next one leads with them.
4. **Which first step or target should it move, and what in the counts
   says that's where players are held back?** The first steps and the
   targets are in "Measuring it" below. "We don't know yet" is an honest
   answer, and it means: get players or counts before building it.

The filter says no as well as yes (decided by the owner on 2026-10-22,
docs/reviews/CreativeDirection-2026-10-22.md, finding 5):

- **Off the newcomer's path, the owner says yes first.** Until a week of
  counts can answer question 4, a feature that doesn't touch the path from
  Home to the Editor, the first edit, Publish and Walk inside it starts only
  with the owner's explicit yes, written in its roadmap entry. Fixes to
  something broken don't need one.
- **Now, Next and Later.** [NowNextLater.md](NowNextLater.md) holds at most
  three items in each. Nothing new starts while an item in **Now** is
  unfinished, unless the owner moves it.
- **Every change a player can notice has a roadmap entry**, answering these
  four questions. No commit skips the filter. The pull request template
  (.github/pull_request_template.md) asks the same.

## Infrastructure, kept out of sight

ForkBuild runs on serious machinery: decentralized storage and announcement
networks, anchoring, peer connections, identities with succession and
revocation. It is what makes "your work is yours" true, and it stays. But it
is a means, not the game:

- Players should see one verb, **Publish**, and one choice inside it: who
  can find the build. **Everyone can find it** is on the sheet before the
  first publish, already ticked: it sends each build as a build note to the
  Nostr relays every copy of ForkBuild reads, with a key the device holds
  itself, so no wallet or extension is needed; unticked, the build stays in
  its link. Where else to send the build is a second, optional step. Network-by-network detail belongs on the Publications
  page and in Network Settings. Publish asks where the build goes once, in
  **Where it goes**, and sends each signed build there from then on.
- **A first Publish is one sheet, with remixing on** (decided by the owner
  on 2026-10-22, docs/reviews/CreativeDirection-2026-10-22.md, finding 1).
  Remixing is the pillar that makes ForkBuild different, so a build is
  remixable unless its builder says otherwise. The sheet has the name to
  publish under (a suggestion filled in, which they can change) and two
  choices already made, **Others may remix it** and **Everyone can find
  it**, each changeable right there, and one **Publish** button. No choice
  on it is a dead end that publishes nothing, and publishing unsigned moves
  under Advanced. Built on 2026-10-22 (ui/components/PublishSheet.js; the
  roadmap, "A first Publish in one sheet"); a name that is locked, or one of
  several, is still asked for after the sheet.
- Network Settings and the Publications page live under **More → Advanced**.
  The Experimental tools (the Publications page's Wallet & Archive Tools and
  the Bitcoin Endpoint page) stay hidden until **Show experimental tools**
  is turned on in Network Settings.
- Nothing infrastructural is a reason for a release to exist on its own.

### Networks: readers and writers

No new network or chain joins ForkBuild until the building numbers move: both
building targets in "Measuring it" (the median published build holding 10
bricks or more that its builder placed, ready-made ones left out, and a
second build from at least 20% of builders) met over a week
with at least 50 builds published. `node scripts/launch-scorecard.mjs` says
whether the gate is open. When one does join, or when an existing one is
reworked, it comes in two parts:

- **A reader**: finding its announcements, fetching builds and comments
  stored there, and checking its proofs. Every copy of ForkBuild runs every
  reader, whatever a player has switched on, so discovery searches every
  substrate. A reader is paid for by every player (traffic, slow or failing
  nodes, data from strangers), so adding one is a project decision recorded
  in the roadmap, and the Privacy page names the servers it contacts. No
  reader holds up another (each gives up on its own), and none has to load
  before the first screen.
- **A writer**: publishing, announcing, storing, anchoring, wallets and
  their settings. A writer is a plugin a player switches on. Nothing outside
  it names its network, and ForkBuild works with none switched on.

Build notes (2026-10-12) are no new network: they are Nostr, already a
reader on every copy, written with a key the device holds, and read by the
same copies. Their reader is paid for like any other (it asks the relays
under Network Settings only when Explore, an author's page or the challenge
opens) and is named on the Privacy page.

Today Nostr, Arweave, Steem and Blurt are the substrates discovery searches;
Bitcoin and Base hold anchor proofs only, so their readers are proof checks.
Bitcoin's and Base's wallets are split this way: each is a plugin switched on
under Network Settings → Wallets. So are Steem's and Blurt's writers, each
switched on with **Post to Steem (or Blurt) from this device** on its own
settings page; a device that already had an account saved to post as starts
with it on. Their writers are part of their readers' runtime, but the code
that posts (application/steem/SteemPostingComposition.js,
application/blurt/BlurtPostingComposition.js) loads only when the switch goes
on or something is posted, so the switch decides what is offered, whether
anything is posted, and whether that code is loaded at all.

**Who signs.** A writer signs and pays through the player's own browser
extension or wallet whenever one exists for its network (a Nostr extension,
an Arweave wallet, Steem or Blurt Keychain, a Bitcoin or Base wallet), and
ForkBuild never holds a key for those networks itself (decided 2026-10-11).
The one exception is IPFS remote pinning: no extension or wallet exists for
it, so ForkBuild holds its access details. The service's address and fields
are saved in Network Settings, and its token is kept only for the visit, as
docs/principles/publication.md's "A Configured Credential Lives Only As Long
As The Capability It Grants" requires.

## Words

Use the player's words wherever a player reads them, in new text and when
old text is touched. Code and protocol documents keep their own terms.

| Say | Not | Notes |
|---|---|---|
| **build** | document, creation, publication, Shared World | What a player makes. A "World" is the same build seen from inside, in World View. (**My Worlds** lists the Worlds visited on this device, not your builds; a page of your own builds is open work.) |
| **Publish** | distribute, announce, anchor | Going public. Distribute, announce and anchor are steps inside Publish, named only on the Publications page. |
| **remix**, **make your own copy** | fork | "Fork" stays in the name, the tagline and developer documents. The name stays **ForkBuild**: the owner confirmed it on 2026-10-13. |
| **structure** | blueprint, preassembled | A ready-made group of bricks in the Build Library. |
| **Choose a name**, **Switch name**, your name | Login, Logout, log in, sign in | There is no account. The header shows **Choose a name** or the player's name, whose menu holds My Avatar, My Identities, Your Data and **Switch name** (another name, a new one, or **Go on without a name**). "Identity" stays on My Identities and in developer documents. |
| **Advanced** | network | The menu group for everything a player doesn't need to build and share. |
| **Build · Explore · Challenge · Walk** | Editor · Repository | The main menu. **Walk** opens this week's challenge plaza, the square the village of published builds grows round. |

tests/WordsTable.test.js fails when a word from the *Not* column comes back
on a screen a newcomer meets (the menu, Home, the Editor, a shared link,
Explore, the challenge and Publish's dialogs), and since 2026-10-16 on the
rest of the Editor (Build Properties, structures, history, recovery,
Import and Export), World View's placement dialogs and Your Data. It also
keeps the English user guide (docs/user/) saying build and remix.

## Tone

A small, sunny, hand-built village: houses, mills, chapels, markets,
lighthouses and bridges, in warm colours. The ready-made structures, the
showcase builds and every weekly challenge theme already share this look.
New content fits it: things a village would have, and ways to get around one
(on foot, by cart, boat or glider) before cars and drones. The vehicles the
World already had were brought into it on 2026-10-10: the bicycle stays, and
the motorcycle, car and drone are now drawn and heard as a penny-farthing, a
hay wagon and a hot-air balloon. Only their look, sound and names changed;
their ids, which peers and saved inventories carry, and how each one moves
stayed as they were.

## Look

Everything round the 3D view looks like the village it frames, not like a
developer's tool: warm paper and wood for the grounds, dark brown ink for
words, and one meadow green for the thing to press (**Try it now**,
**Join the challenge**, **Publish** sends it on its way). Bricks keep their
own colours; the shell never competes with them. Chosen on 2026-10-13
(docs/reviews/CreativeDirection-2026-10-12c.md, finding 4), replacing the
near-black shell the app had until then.

- The colours are named once, in css/main/theme.css (`--paper`,
  `--surface`, `--ink`, `--accent` and the rest); new rules use those names
  rather than new colours. The embed takes them too.
- Words stay readable: every ink reads at 4.5:1 or more on the page and its
  panels, and white on the green buttons (tests/VillageLook.test.js).
- A panel over the 3D view is warm paper, nearly opaque, so the world shows
  at its edges and the words don't fight it.

The logo is a little house, and a remix of it behind (2026-10-14): the
fantasy's *build a little place, anyone can remix it* in one picture, drawn
like the bricks, with the same soft dark line along its edges, in the
village's colours: a terracotta roof, plaster walls and a meadow-green door,
and the copy behind in greens. It is assets/icons/logo.svg (on paper, for
the app's icon) and assets/icons/logo-mark.svg (without, beside the name in
the header and on the link-preview card). A browser tab is too small for two
houses, so favicon.svg is one green brick, drawn heavy enough to read at
16 px. It replaced a green cube with a Git branch on a near-black tile,
which looked like a developer's tool and read as a parcel at tab size.

Bricks look like what they are made of (2026-10-13): a soft dark line
along every brick's edges, a slight shade of its own, and the grain of its
surface, masonry courses, plaster, wood, roof tiles, glass, leaves or rough
stone (core/building/BrickSurface.js). A plain block is read by its colour: grass
green is grass, pale sand smooth, dark brown timber, the rest laid in
courses. The brick's colour still decides its colour.

Music plays softly under the world's sounds (2026-10-13): a gentle tune
made up as it goes from a seed (core/app/MusicScore.js), a music-box melody over
a warm pad and a round bass, synthesized like every other sound, so nothing
is downloaded. It has three moods: the Editor's a little lively, World
View's warm by day and slow and low after dark. Pieces end in quiet spells,
so it comes and goes rather than droning, and it sits below the ambience.
One **♪ Music** button turns it off; mute and volume take it with
everything else.

The same village after dark (2026-10-13), for a device set to dark mode or
anyone who picks **Dark** under More → App: lamp-lit wood for the grounds,
cream ink for the words, the same meadow green to press. Every colour has a
name in css/main/theme.css and a dark value beside it; the stylesheets use
only the names, so both looks reach every page. **Auto** (the default)
follows the device; **Light** keeps the village by day. The 3D view keeps
its own sky either way: day and night there are the World's.

### The World is a diorama, not a simulation

Decided by the owner on 2026-10-22 (docs/reviews/CreativeDirection-2026-10-22.md,
finding 2). The World round a build is part of the toy, drawn at the bricks'
scale and with the bricks' level of detail, so the player's build is always the
thing worth looking at:

- **Scale.** Near a build, nothing natural stands taller than a two-storey
  build. A tree the World grows and the **Pine Tree** brick a player places
  should look as if they belong to the same village.
- **Detail.** Nature is drawn about as simply as the bricks: clear shapes
  and colours, not every branch and leaf. A newcomer's device gets that look
  by default.
- **Room.** Every build and the plaza stand in a clearing, a meadow round
  them, so a build reads as a place and not as a thing hidden in a wood.
  "Walk inside it" arrives with nothing between the camera and the door.
  Built on 2026-10-22: no tree grows within BUILD_CLEARING (15 units) of a
  build's bricks (core/nature/TreeDisplacement.js), worked out from the
  trees' shapes and the arrival camera (tests/BuildClearing.test.js); the
  plaza already had its clearing.
- **First sight.** A visitor's first World View visit of a page opens in
  fair late-morning light and catches up with the shared clock over the
  first minute or two. Joining a friend puts both on the shared clock.
  Built on 2026-10-22 (core/nature/FirstSight.js): a minute of Always day's
  sky, then a minute easing into the shared one; it ends at once when
  someone else is in the World.

What's already in the World and doesn't meet this (the realistic trees of
2026-10-18 above all) is brought into line by the diorama pass in
[NowNextLater.md](NowNextLater.md); new World content meets it from now on.

### One clock that matters: the week

Decided by the owner on 2026-10-22 (docs/reviews/CreativeDirection-2026-10-22.md,
finding 3). The World's seasons follow the weekly challenge, not a clock of
their own, so a seasonal theme (a winter cabin, a summer fair) is shown in its
season for everyone, and Monday brings a new theme and a changed village
together. Day and night keep their 40 minutes. Until that is built, the
seasons turn every five hours or so, as core/nature/Season.js describes.

## What we are not making

- **A blockchain product.** Chains are one of several places a build can be
  stored or proven; no feature exists to promote one.
- **A scoreboard.** No points, levels or rankings of people (see
  [Principles](principles/achievements.md)). Facts about a build, such as
  "remixed 12 times" or "entered three challenges", are welcome as credit.
- **A quest game.** Residents and animals make the world feel lived in; they
  never hand out goals. Goals come from building: the challenge, a remix, a
  friend's village.
- **An engine with a demo.** The clean core and the protocol matter because
  they keep players' work safe and portable, not as a product in their own
  right.

## Measuring it

Each pillar has a question the launch counters can answer
(see [the launch kit](launch/README.md#measuring-it)):

- **Building:** do people who arrive start a build (`/e/challenge-join`)
  and publish one, and how much of it did they build themselves
  (`/e/publish-placed-0`, `-1`, `-10`, `-50` and `-200`: the bricks placed or
  changed, by range, the ready-made ones a build started with or had dropped
  in left out; `/e/publish-bricks-…` counts them all)?
- **Family tree:** are shared links opened by people the builder didn't bring
  (`/e/opened-shared-link`), copied (`/e/remix-from-link`), and are the copies
  published as remixes (`/e/remix-published`)?
- **Yours, in a world:** do people come back for a second build
  (`/e/second-build`)?
  And do they walk in it with friends: how many "Walk here with me" links
  are made (`/e/walk-link`), and how many friends arrive through them
  (`/e/walk-joined`)? And build with them: how many "Build with me" links
  are made (`/e/build-link`), how many friends join through them
  (`/e/build-joined`), and how many builds made together are published
  crediting them (`/e/publish-together`)?

Also counted, with no target yet: how many visitors walk World View
before they have a name (`/e/guest-walk`, once a page load; see "A guest
walks" in the roadmap).
And the first steps between arriving and publishing, once a page load each,
with no target yet: the Editor opened (`/e/editor-open`), a ready-made build
opened in it from Home or a challenge (`/e/starter-open`), and a first edit
made there (`/e/editor-edit`). Read against the daily count, they say where
newcomers stop (`node scripts/launch-scorecard.mjs` prints them first).

### The numbers to reach

Each question has a number, read over one week (core/app/LaunchTargets.js holds
them; `node scripts/launch-scorecard.mjs <counts>` prints a week's against
them, from GoatCounter's export or a list of totals). Below its minimum, a
number is "too few to say" rather than met or missed.

| Pillar | Target | Number | Minimum |
|---|---|---|---|
| Building | The median published build's placed bricks (`/e/publish-placed-…`) | 10 or more | 50 builds |
| Building | The median published build's range, ready-made bricks included (`/e/publish-bricks-…`) | 10 bricks or more | 50 builds |
| Building | Second builds per build published (`/e/second-build`) | 20% | 50 builds |
| Family tree | Links opened per link made (`/e/opened-shared-link` / `/e/share-link`) | 100% | 20 links |
| Family tree | Copies made per link opened (`/e/remix-from-link` / `/e/opened-shared-link`) | 10% | 50 opens |
| Family tree | Remixes per build published (`/e/remix-published`) | 15% | 50 builds |
| Yours, in a world | Friends arrived per walk link (`/e/walk-joined` / `/e/walk-link`) | 50% | 20 links |
| Yours, in a world | Friends joined per build link (`/e/build-joined` / `/e/build-link`) | 50% | 20 links |
| Yours, in a world | Builds made together published, per friend joined (`/e/publish-together` / `/e/build-joined`) | 30% | 20 joins |
| Yours, in a world | Plaza visits per challenge join (`/e/plaza-visit` / `/e/challenge-join`) | 25% | 20 joins |
| Yours, in a world | World View visits that see someone else's build, the ready-made village left out (`/e/world-neighbour` / `/e/world-visit`) | 50% | 50 visits |

The placed bricks and the second builds are the gate on new networks
(above): a ready-made build published untouched holds plenty of bricks but
none placed, so it never opens it. A missed
target says where to look next, not that a feature failed: a small median
build points at the kit and the guided first build, few second builds at
what brings a builder back, few copies per opened link at the shared link's
**Edit a Copy**. The numbers are a first guess for launch; change them here
and in core/app/LaunchTargets.js together, with the reason in the roadmap.

## The side systems

Catching and decorating with animals, the inventory, swimming, chat, voice
and the public lobby serve no pillar directly, and the reviews of 2026-10-11
and 2026-10-12 asked for a decision on each. The owner's decision
(2026-10-12): **keep them, and watch them.** Each is counted when used, at
most once a page load (core/app/SideSystemUse.js; `/e/swam`, `/e/animal-caught`,
`/e/animal-decorated`, `/e/inventory-used`, `/e/chat-sent`, `/e/voice-call`,
`/e/lobby-joined`), and scripts/launch-scorecard.mjs shows what share of
visits used each: World View visits for the first four, daily visits for the
rest (core/app/LaunchTargets.js, `SIDE_SYSTEMS`). One that fewer than 2% of
visits use, once 50 World View visits or 100 daily visits are counted, is
flagged **rarely used**, and the owner looks at it again: fold it into
building, move it under Advanced, or remove it. Until then they stay frozen
as above: kept working, with no new features.

## Where this came from

A creative-direction review of 1.3.0 (October 2026) found four visions
competing in the app: an open protocol (VISION.md and the About page), a
creative builder (the Home page), an exploration game (swimming, vehicles,
animals) and a publishing system (anchoring, wallets, leaderboards). The Home
page had already chosen the builder, and this page makes that choice the
project's. The review's other recommendations, in order:

1. This page, and the About page, VISION.md and the menu brought in line with it.
2. A Builder's release: a larger brick kit (about 50 pieces, tilting, a
   village colour palette), each build's family tree on its shared link and
   on the challenge page, building on a plot in a World and publishing back
   to it, and builder stamps for facts like "your build was remixed".
   Done on 2026-10-10, and tilting bricks onto their other sides soon
   after; and later that day, each week's entries standing together in the
   challenge plaza, a clearing in the shared World.
3. No new networks or chains until the building numbers move (written down
   on 2026-10-10, with how a network is added: "Networks: readers and
   writers" above), and later each existing one made optional (done on
   2026-10-10: Bitcoin's and Base's wallets, then Steem's and Blurt's writers); the
   reconciliation and publisher leaderboard pages archived (done on
   2026-10-10: removed, with their code); no new vehicle or swimming
   features until building catches up, and the vehicles given the village's
   look (done on 2026-10-10, see "Tone" above).
4. Counting what says whether the fantasy lands: how big published builds
   are, how many builders publish a second build, and how many builds are
   remixes. Done on 2026-10-10 (see "Measuring it" above).

A follow-up review on 2026-10-11 found the first impression still let the
pillars down: the starter house's chimney floated, the Editor named a copy's
origin by its id, and Home's tagline still said "Fork". Those were fixed that
day, with the Mill given sails and the player's words brought into the
Repository, the Editor and the challenge (see the roadmap, "First-impression
polish"). It recommended next: a "walk here with me" link, so the third
pillar's "with friends" needs no Peers page; publishing without first
creating a passphrase identity; Distribute folded into Publish; World View
opening as a visitor's view, with its protocol panels under Advanced; and
more challenge themes. The "walk here with me" link was added the same day (see the
roadmap, "Walk here with me"), and then publishing without first creating a
passphrase identity ("A first publish asks only for a name"), and World View
opening as a visitor's view, with the plaza given a square of its own ("A
visitor's World View"), Distribute folded into Publish ("Publish sends
it where it goes"), and residents wondering aloud what the ground nearby
lacks, with Build there ("Residents wonder what's missing"), and 26 challenge
themes with example remix families for empty shelves ("Half a year of
themes, and families to start from"), and numbers for the counters with the
user guide split into Play and Advanced ("Numbers to reach, and a guide in
two parts"), with each Advanced chapter marked optional, VISION.md's second
half rewritten for contributors and chapter 12 renamed ("Advanced chapters
marked, VISION for contributors").

A third review on 2026-10-12
([reviews/CreativeDirection-2026-10-12.md](reviews/CreativeDirection-2026-10-12.md))
found the single-player loop complete and the multiplayer half resting on a
wallet, a crowd and a place to meet. Its Release D, "Find each other", was
done the same day (see the roadmap, "Find each other"): Who can find it?
inside Publish, with build notes needing no wallet; builds settling beside
what they remix and in a village round the plaza; **Walk** in the menu,
opening the plaza with the ready-made builds round it; and the player's
words in the menu, Explore, a shared link's page and the Editor, kept so by
a test. Its Release E, "A room worth entering", followed the same day (see
the roadmap): the build above your head cut away and the camera coming in
with you, furniture and a furnished House six across, ready-made homes that
come lived in, World View's panel leading with what a visitor came to do,
and one celebration after Publish.

A fourth review the same day
([reviews/CreativeDirection-2026-10-12b.md](reviews/CreativeDirection-2026-10-12b.md))
found the vision coherent and three seams where the game broke its own
promise. Its Release F, "Make it yours, in the village", followed (see the
roadmap), taking the review's recommendation on two of its open questions:
the plaza is a place, not a view, and Home's main button hands over a build
with a job left to do. The square and the six ready-made builds stand in
every World View, with published builds settling just outside them; **Try
it now** opens the House with no roof and a card naming the job; Place with
no brick chosen places a cube, and a brick put on top of others rests on
them; hipped roofs that cover a whole building in one piece; and a
visitor's click in World View selects nothing, with the Words test covering
World View.

A fifth review on 2026-10-12
([reviews/CreativeDirection-2026-10-12c.md](reviews/CreativeDirection-2026-10-12c.md))
found the vision coherent and the process steering it weak, and four seams
in the first five minutes. The owner took two of its recommendations on
2026-10-13 (see the roadmap, "A guest walks, in a village-coloured
shell"): someone with no name walks World View as a guest, seen only on
their own screen, and the shell round the 3D view is light and warm (see
"Look" above). The name stays ForkBuild.

A sixth review on 2026-10-22
([reviews/CreativeDirection-2026-10-22.md](reviews/CreativeDirection-2026-10-22.md))
found the vision coherent and the work drifting from it: the launch week's
counts (24 daily visits, 3 first edits, no build published) pointed at
building, and most of what followed went to the World. The owner took all
four of its decisions the same day (see the roadmap, "Four decisions:
diorama, remix by default, the week's seasons, a filter that says no"): the
World is a diorama (see "Look"), a first Publish is one sheet with remixing
on (see "Infrastructure, kept out of sight"), the seasons follow the
challenge week (see "Look"), and the filter has a fourth question and says
no (see "The filter"), with [NowNextLater.md](NowNextLater.md) saying what
comes first.
