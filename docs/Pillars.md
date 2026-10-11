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

## Infrastructure, kept out of sight

ForkBuild runs on serious machinery: decentralized storage and announcement
networks, anchoring, peer connections, identities with succession and
revocation. It is what makes "your work is yours" true, and it stays. But it
is a means, not the game:

- Players should see one verb, **Publish**, and one choice inside it: where
  to send the build. Network-by-network detail belongs on the Publications
  page and in Network Settings. (Today the Editor still offers **Distribute**
  as its own step after Publish; folding it in is open work.)
- Network Settings and the Publications page live under **More → Advanced**.
  The Experimental tools (the Publications page's Wallet & Archive Tools and
  the Bitcoin Endpoint page) stay hidden until **Show experimental tools**
  is turned on in Network Settings.
- Nothing infrastructural is a reason for a release to exist on its own.

### Networks: readers and writers

No new network or chain joins ForkBuild until the building numbers move (see
"Measuring it": how big published builds are, and how many builders come back
for a second one). When one does, or when an existing one is reworked, it
comes in two parts:

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

Today Nostr, Arweave, Steem and Blurt are the substrates discovery searches;
Bitcoin and Base hold anchor proofs only, so their readers are proof checks.
Bitcoin's and Base's wallets are split this way: each is a plugin switched on
under Network Settings → Wallets. So are Steem's and Blurt's writers, each
switched on with **Post to Steem (or Blurt) from this device** on its own
settings page; a device that already had an account saved to post as starts
with it on. Their writers share their readers' runtime, so the switch decides
what is offered and whether anything is posted, rather than what is loaded.

## Words

Use the player's words wherever a player reads them, in new text and when
old text is touched. Code and protocol documents keep their own terms.

| Say | Not | Notes |
|---|---|---|
| **build** | document, creation, publication | What a player makes. A "World" is the same build seen from inside, in World View. (**My Worlds** lists the Worlds visited on this device, not your builds; a page of your own builds is open work.) |
| **Publish** | distribute, announce, anchor | Going public. Distribute, announce and anchor are steps inside Publish, named only on the Publications page. |
| **remix**, **make your own copy** | fork | "Fork" stays in the name, the tagline and developer documents. |
| **structure** | blueprint, preassembled | A ready-made group of bricks in the Build Library. |
| **Advanced** | network | The menu group for everything a player doesn't need to build and share. |

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
  and publish one, and how big are the builds they publish
  (`/e/publish-bricks-0`, `-1`, `-10`, `-50` and `-200`, by range)?
- **Family tree:** are shared links opened by people the builder didn't bring
  (`/e/opened-shared-link`), copied (`/e/remix-from-link`), and are the copies
  published as remixes (`/e/remix-published`)?
- **Yours, in a world:** do people come back for a second build
  (`/e/second-build`)?

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
more challenge themes.
