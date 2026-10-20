# Creative-direction audit, 2026-10-11

A Game Director's deep audit of ForkBuild 1.3.0 plus everything merged up to
2026-10-11 ("Numbers to reach, and a guide in two parts"). It asks two
questions: is the vision coherent, and does what ships deliver it? It builds
on the two earlier reviews summed up in
[Pillars.md, "Where this came from"](../Pillars.md#where-this-came-from), and
doesn't repeat what they already fixed.

This is a review, not a decision record. [Pillars.md](../Pillars.md) still
wins. Whatever is adopted from here goes into the roadmap the usual way.

## Verdict

**The vision is now coherent on paper, and much better than it was a week
ago. The game doesn't deliver it yet.**

*Build a little place. Anyone can remix it. Walk inside it with friends.*
That is a strong fantasy: clear, filterable, and different from Minecraft,
Roblox, Bloxels or Townscaper. In two days the Pillars page settled a
four-way identity crisis, froze the expansions that had drifted away from it,
and turned most of the first ten minutes over to building.

What's left is a gap between the promise and the experience, at the three
points where it matters most:

1. **"Walk inside it" can't be done.** Door bricks and arches are solid
   boxes for the avatar, so nobody can walk into the starter house or any
   other closed ready-made building (evidence below).
2. **"Build" isn't measured.** The headline building number counts a
   build's bricks, not the bricks a person placed. The one-click starter
   house already passes it, and so does every challenge entry, because Join
   opens a finished structure.
3. **"With friends" stops at walking.** Live co-building already works under
   the hood (signed edit grants, a command protocol, conflict resolution),
   but players can't reach it. Friends can visit each other's places. They
   can't make one together.

None of these needs a new system. Each one finishes a system that already
exists. My recommendation is to **stop adding features until these three
loops close**: the next three releases make what's there true, rather than
adding more.

## What is working

Worth saying plainly, because it should be protected:

- **One fantasy, written as a filter.** The Pillars page, with its three
  questions, its "Words" table and its "What we are not making" list, is the
  best creative document in the repository. Most indie projects never write
  one.
- **The tone has settled.** It's a small, sunny, hand-built village. The
  vehicle reskin (penny-farthing, hay wagon, hot-air balloon), the 26
  village-themed challenges, the residents and the warm palette all agree.
  The ready-made structures read as one set.
- **The first ten minutes face the player.** Home → *Try it now: start with
  a house* → Editor with a guided first build → Publish asks only for a name
  → a link that carries the build and opens on **Edit a Copy**. That's a
  modern, low-friction funnel.
- **Remixing is real and visible.** Lineage, family trees on shared links
  and the challenge page, *remixed N times*, stamps that credit facts rather
  than score people. This is the genuinely novel pillar, and it reads well.
- **A principled stance against grind.** Residents wonder aloud rather than
  give quests. There are stamps, not points. These are good creative
  constraints, and they make a friendlier game.
- **Measurement before expansion.** The counters, the targets and the gate
  on new networks are exactly how a director should keep scope honest.

## Findings, most serious first

### 1. You can't walk inside what you build (P0, breaks pillar 3)

The fantasy's third beat is *walk inside it*. In practice the avatar
collides with every brick's axis-aligned box. That includes `core:door` (a
solid 1×2×0.1 panel) and `core:arch` / `core:arch_small`, which are *drawn*
with an opening (`renderer/ThreeBrickFactory.js`, `archGeometry`) but
*collide* as solid 2×2×0.5 boxes (`core/avatar/AvatarCollision.js#brickAabb`,
gathered by `application/avatar/AvatarMovementConstraint.js#obstaclesNear`,
which skips only bricks the avatar can step onto).

Checked with the real collision function (`resolveHorizontalMovement`):

| Structure | Walking in through its entrance |
|---|---|
| `village:house`, Home's starter | Stopped at the door (z = −2.40) |
| `village:house` with its door brick removed | Walks straight in |
| `village:small_chapel`, whose comment calls its arch "a functional doorway" | Stopped at the arch (z = −2.60) |

A coarse reachability sweep over the library found no reachable interior in
the house, cottage, large house, barn, stable, village hall, chapel,
lighthouse, watchtower or castle. Open structures (market, pavilion, bridge,
dock) are fine. No test checks that any ready-made building can be entered.

The harm: the hero image on Home is a village, the lead says *"then walk
through it with friends"*, and a newcomer's first walk ends with bumping into
the front door of the house they just published. The visuals promise
something the physics refuses. Players read that as broken, not as a
limitation.

**Fix (small):** give doors and arches collision that matches what they
look like. Make doors non-solid (or open as you approach, with the existing
editor sound vocabulary). Give arches an opening-shaped collider: two
jambs and a lintel. Then add a test that walks an avatar into every closed
ready-made structure. Some structures will need an interior that's 2+ units
wide to be worth entering, which is a content task.

### 2. The building metric can't see building (P0, the gate is open by default)

The building target is *"the median published build at 10 bricks or more"*,
and it is also the gate on new networks. It's computed from
`worldBrickCount(document.world)` at publish (`ui/views/EditorView.js`,
`funnelEventCounter.publishedBuild`). Measured against the library:

- Home's *Try it now* starts from `village:house`, which is **26 bricks**.
  Publishing it untouched lands in `/e/publish-bricks-10`.
- **Join the challenge** forks the week's *finished* starter structure
  (`startFromChallenge` → `editorSession.forkStructure`) and tags it. A
  lighthouse is 11 bricks, a cottage 21, a mill 18. A one-click entry passes.

So the number that says "players are building" and unlocks more networks can
be met with zero bricks placed. The challenge has the same design problem:
if Join hands you a finished lighthouse, the lowest-effort entry is the stock
lighthouse. The plaza then fills with identical models, and the remix family
tree fills with copies of a template, not remixes of people.

**Fix:** count *bricks placed or changed since the starting point* (the
editor already knows a fork's source; diffing it against the publish is
cheap), and report it beside the total. Re-base the gate on that number.
For the challenge, see finding 5.

### 3. "With friends" is visiting, not building (P1, the biggest untapped asset)

"Walk here with me" is a well-made feature. But the multiplayer that a
*building* game is remembered for is building together, and ForkBuild
already has the engine for it:

- signed, owner-only World edit grants (`docs/principles/collaboration.md`,
  0.2.95 to 0.2.99);
- a deterministic command protocol with conflict resolution;
- `EditorSession` applies remote operations
  (`RemoteDocumentOperationApplicationUseCase`).

Reaching it today takes: connect on **Peers**, open the World in World
View, find **World Members**, **Grant Edit** to an identity, and have both
people open the same build in the Editor. The user guide's "Build together"
paragraph (docs/user/README.md) actually describes *seeing* avatars and then
**Edit a Copy** on your own. That isn't building together.

**Fix:** one link, **Build with me**, the twin of Walk here with me. It
grants Edit on this one build to whoever joins (time-limited, revocable,
shown in the existing roster) and opens both people in the Editor, each
seeing the other's cursor and selection (the remote-selection observation
already exists). This is the single feature most likely to move the
second-build and walk-joined numbers, and it adds almost no new protocol.

### 4. The World has no front door and five meanings (P1, clarity)

The third pillar is "lives in a world", but:

- **No navigation entry.** The main nav is Home, Editor, Repository,
  Challenge, My Worlds. You reach World View only through a specific build
  (**Explore** in the Repository, a link, or the plaza). "My Worlds" is a
  history of visits, and starts empty.
- **Too many meanings of "World".** "World" means a build seen from inside
  (Pillars). "The shared world" means every published build side by side
  (user guide 03). "Shared World" is a *published build* on the shared-link
  page, in 56 English strings, including the error a newcomer sees when a
  link fails: *"This link does not name a Shared World…"*. "My Worlds" means
  places visited. And **Home**, in World View, means "your own world". The
  Words table settles build/Publish/remix but not World.
- **Tool words in the primary nav.** *Editor* and *Repository* are a
  developer's names. Players say *Build* and *Explore* (Home's own buttons
  already do: "Explore builds").

**Fix:** pick one meaning ("a World is a build you can walk into"; "the
countryside" or "the map" for the shared terrain they all stand on). Add
"Shared World → build" to the Words table and sweep player-facing strings.
Rename the nav to **Build · Explore · Challenge · Walk** (Walk opens the
plaza, or your last World, or a starter village). Then nobody needs a
build of their own before the world opens to them.

### 5. The challenge is a reskin loop, not a creative prompt (P1)

All 26 themes are single nouns (Lighthouse, Bridge, Barn…). Every one starts
from the finished structure of the same name, and they repeat after half a
year. Good challenges in creative games give a *constraint* or a *twist*,
because that's what makes entries differ and makes looking at them fun.

**Fix, in order of cost:**
- Join starts from a **plot plus a hint**: an empty base, the theme's
  structures pinned in the Build Library, and an optional "ideas" strip.
  Players who want the stock model can still drop it in, but then they've
  chosen it.
- Add a **twist** to each theme's brief, as text only: "a lighthouse no
  taller than your avatar can climb", "a bridge for a hay wagon", "a tiny
  home under 60 bricks". The brief is already free text, so this is
  translation work, not code.
- Every few weeks, a **remix week**: "start from one of last week's
  entries". It feeds pillar 2 directly and gives older builds a second life.
- The plaza shows each entry's *placed-by-you* count (finding 2) as credit,
  never as a ranking.

### 6. Loops that open and never close (P1)

Several good features start a loop and then leave the player hanging:

- **Residents wish, and never notice.** A resident wonders whether a bridge
  would be nice here. You build one. Nothing acknowledges it. The no-quests
  principle can be kept *and* paid off: a resident who passes a build made
  on a wished-for spot can say a one-line *fact* ("Someone built a bridge
  here!"), with no reward, tracking or checklist. That turns "the world
  connects back to building" from an aspiration into a felt moment.
- **The first-build guide ends at "share".** Its five steps are place,
  stack, structure, save and publish-and-share. The fantasy has three beats,
  and the guide teaches two. A sixth step, **Walk inside it**, which opens
  World View standing at the door (once finding 1 is fixed), completes the
  promise in the first session.
- **There are two achievement systems.** Builder stamps (credit, on Home)
  and the chain-observation "Achievements" (experimental, under Wallet &
  Archive Tools, from 0.8.102) use the same word for unrelated things.
  Retire the old one, or rename it to "Archive milestones", so
  "achievement" means one thing.

### 7. Old visions still leak into the copy (P2)

The earlier reviews won the argument, but traces remain where players read:

| Where | What it says | Problem |
|---|---|---|
| Home, *Why ForkBuild* | "Fork published builds like source code" | "Fork" is on the Words table's *Not* list. "Source code" speaks to developers. |
| Home, *Explore together* | "Walk, ride, swim and fly through a shared 3D world" | Leads with the expansion the Pillars froze. Should be "walk through what you and your friends built". |
| Editor, Build Library card | "Fork As New Document", "Fork to My Structures" | Two banned words in the newcomer's main tool |
| Shared-link page | "Shared World", in eight error and explanation strings | Protocol term on the most important first-contact page |
| Publication card | "…use Distribute under My Shared World" | Distribute was folded into Publish on 2026-10-11 |
| About page | "…how to build, publish, fork, and explore" | "fork" |
| VISION.md, "How it's built" | "architected as an engine first"; "Repository View — the GitHub of 3D models"; history back to 0.1.46 | Half the page still argues the engine-first identity that Pillars says "we are not making". Move it to Architecture.md. |
| User guide 12 | "Archive & Achievements" | See finding 6 |

A one-day copy pass. Add a test that fails when a Words-table *Not* term
appears in the Home, Editor, shared-link and challenge namespaces, so it
doesn't regress.

### 8. Orphaned systems carry cost without serving a pillar (P2)

Frozen isn't the same as decided. These systems are large, fully built, and
connected to building only loosely:

- **Catching animals, an inventory, and decorating with them.** A
  collection mechanic from another genre. Decorating (G) is the one link to
  building.
- **Swimming, diving, a breath meter, underwater life.** Charming, but a
  survival-game grammar.
- **Vehicles.** Now in tone, which is good. They're for getting around a
  village that, for most players, won't exist yet.
- **Chat with read receipts, voice calls, a public lobby, follows,
  friendships.** A social network's surface, built before the game had
  players.

Each one costs translation in 8 languages, tests, guide pages (World View's
guide is about 1,200 lines) and new-player attention. **Recommendation:**
for each, either *fold it into building* within two releases or *move it
under Advanced*. For example, animals become placeable ambient life in the
Editor's Build Library; vehicles spawn from a "stable" or "dock" a player
built; swimming stays as traversal but leaves Home's copy. The test is the
Pillars' third question: does building get at least as much?

### 9. Velocity is outrunning validation (P2, process)

- About 40 milestones landed in four days (2026-10-08 to 10-11), each with
  docs in up to 8 languages. None has met a real player at scale yet. Launch
  hasn't happened (the launch kit's checklist is open), so every target in
  `core/app/LaunchTargets.js` is, by its own words, "a first guess".
- Over the project's history, around 300 of the roughly 1,000 roadmap
  milestones are about networks, anchoring, wallets and claims, about 180
  about building, and about **12** about remixing and the challenge (by
  roadmap heading). The Pillars correct the direction, but the codebase's
  mass still sits on the infrastructure side. That's why so many strings and
  guide pages still talk protocol.
- The roadmap is 6 MB across 11 parts. As a decision record it's thorough.
  As a way for a new contributor (or a director) to see where the game is
  going, it's unreadable.

**Recommendation:**
- **Playtest before the next feature.** Five people who've never seen
  ForkBuild, each given only the Home URL, watched for 15 minutes (on a
  phone for at least two of them). Write down where each one stalled. It
  costs one afternoon and will re-rank this list better than any review.
- **Launch to one channel**, read a week of counters, *then* pick the next
  release from the missed targets, as "Measuring it" already says.
- **Keep a one-page "Now / Next / Later"** above the roadmap table, with no
  more than three items in each. The roadmap stays the changelog.

## Pillar scorecard

| Pillar | On paper | In the experience | Biggest gap |
|---|---|---|---|
| 1. Building feels joyful | Strong | Good: 50 bricks, palette, tilting, sounds, guided start, touch | Starting from finished models skips the joy. The metric can't tell. |
| 2. Every build has a family tree | Strong | Good: lineage, family trees, remix counts, stamps | Challenge entries are copies of templates, not of people |
| 3. Yours, and lives in a world | Strong | Weak: you can't enter buildings, the world has no front door, and friends can only visit | Doors and arches, Build with me, a nav entry |

## Recommended next three releases

Each one leads with a pillar (Pillars' third filter question), adds almost
no new systems, and is measurable with the counters that already exist.

**Release A, "Step inside" (pillar 3, about a week)**
1. Doors you can walk through, and arches whose collider matches their
   opening. A test walks into every closed ready-made structure.
2. Widen the starter house's interior if needed, so stepping inside feels
   like arriving somewhere.
3. The first-build guide's sixth step, **Walk inside it**, and a
   post-publish button that opens World View at the build's door.
4. A **Walk** (or Explore) nav entry that works with no build of your own.
5. The copy pass from finding 7, with its regression test.

*Measured by:* walk-link and walk-joined, and a new `/e/walked-inside-own`.

**Release B, "Make it yours" (pillars 1 and 2)**
1. Count bricks placed or changed since the starting point. Re-base the
   network gate on it.
2. Join the challenge starts from a plot with the theme's structures pinned,
   not a finished model.
3. A twist line on each theme, and a remix week every fourth week.
4. Residents notice builds made where they wished, as a one-line fact.

*Measured by:* the median *placed* bricks per build, second builds, and
remixes per build.

**Release C, "Build with me" (pillar 3)**
1. A one-link, time-limited co-building invitation, the twin of Walk here
   with me, on the existing edit-grant and command protocol.
2. Both people in the Editor, each seeing the other's cursor and selection.
3. A shared build credits both builders in its family tree.

*Measured by:* a new pair, `/e/build-link` and `/e/build-joined`, with
second builds per builder.

**Not now:** new networks (the gate is closed), new vehicles, new
traversal (diving, gliding), new social surfaces, new languages, and new
bricks beyond what the interior work in Release A needs.

## Decisions only the project owner can make

1. **Is "walk *inside*" literal?** If yes, Release A is the top priority. If
   the fantasy is really "walk *among*" what you build, change the line, not
   the colliders. (I recommend keeping *inside*: it's the emotional hook.)
2. **What is a World, in one sentence?** Then the vocabulary sweep follows.
3. **For each orphaned system in finding 8: fold it in or move it under
   Advanced?** A short list, decided once and written into Pillars.
4. **Is live co-building in scope for this year?** If yes, it should be the
   flagship of the next big release, because it's the most distinctive thing
   the engine can already do.

## Method

- Read Pillars.md, VISION.md, the README, the 1.3 release notes, the launch
  kit, the Play half of the user guide, the main navigation (`ui/App.js`),
  Home, About, the challenge (`core/challenge/BuildChallenge.js`, `EditorView.js`'s
  Join), residents' wishes (`core/world/ResidentWish.js`), the first-build
  checklist, the structure libraries and the English message catalogue.
- Measured roadmap effort by matching keywords against all 998 roadmap
  headings. These are rough counts, meant to show proportions.
- Checked collision with the real `core/avatar/AvatarCollision.js` functions on
  the real `VillageLibrary` brick lists, and counted structure bricks from
  the same libraries. Reproduce with:

  ```js
  import { CoreLibrary } from './core/library/CoreLibrary.js';
  import { VillageLibrary } from './core/library/VillageLibrary.js';
  import { brickAabb, resolveHorizontalMovement } from './core/AvatarCollision.js';
  const defs = new Map(CoreLibrary.definitions.map((d) => [d.id, d]));
  const house = VillageLibrary.structures.find((s) => s.id === 'village:house');
  const obstacles = house.bricks.map((b) => brickAabb(b.position, defs.get(b.definitionId), b.rotation, b.tilt));
  // Walk from the entry step through the door toward the middle of the house.
  console.log(resolveHorizontalMovement({ position: { x: -0.5, y: 1, z: -2.6 }, dx: 0, dz: 2.6, obstacles }));
  // → { x: -0.5, z: -2.4001, collided: true }
  ```
