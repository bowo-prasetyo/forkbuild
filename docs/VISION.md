# Vision

**Build a little place. Anyone can remix it. Walk inside it with friends.**

ForkBuild is a 3D building game in the browser. You snap bricks into houses,
bridges and whole villages with no account and no download, share a link,
and anyone can make their own credited copy and build on it. Then you walk
through what you made, together. Your work stays yours: it lives on your
device, is signed with a key you hold, and can be published to open
networks that no single company runs. [Pillars.md](Pillars.md) turns this
into the test every feature has to pass.

## How it's built, for contributors

The game comes first. Every change answers to [Pillars.md](Pillars.md): which
pillar it serves and how a player would notice. The code underneath exists
so that the game's promises hold, and is not a product of its own.

**Why it's built this way.** A build should outlive any one copy of the app,
any one server and any one network. So a build is a signed document a player
keeps on their own device, in an open format ([Protocol.md](Protocol.md)),
that can be shared as a link, sent straight to friends, or published to open
networks, and that any copy of ForkBuild can open, check and remix with its
maker's credit. Nothing depends on a ForkBuild server being up.

**The layers** ([Architecture.md](Architecture.md) has the detail):

- `core/` is the game's rules and data, pure: worlds, buildings, bricks,
  documents, their lineage, terrain, the weekly challenge, residents. No
  Three.js, Vue or browser APIs, so it runs and is tested anywhere.
- `application/` is what a player can do (place a brick, publish, remix,
  walk with a friend), each a use case over `core/`.
- `renderer/` draws it with Three.js; `ui/` is the browser app in Vue.
- Around them sit the adapters (storage, networks, peers), each behind a
  small interface, so a network can be added or switched off without the
  game noticing.

`tests/LayerBoundaries.test.js` keeps those imports pointing one way.

**What a contributor keeps to** (the full list is
[Principles.md](Principles.md) and [CodingConventions.md](CodingConventions.md)):

- **The Editor builds; World View is for looking, walking and meeting.**
  Building happens in the Editor, and World View hands a player there with
  Build here or Edit a Copy. Naming places and decorating with an animal
  are the exceptions, since they annotate rather than build.
- **Every change to a build goes through its World** (the aggregate root),
  as an undoable command that publishes an event. Bricks, buildings and
  worlds have their own ids, never positions in a list.
- **A remix remembers where it came from**, so a build's family tree can
  always be drawn and its maker always credited.
- **Infrastructure stays out of sight.** Networks, anchoring and wallets
  live under Advanced, each network is a reader everyone runs plus a writer
  a player switches on, and no new network joins until the building
  numbers in Pillars.md say so.
- **Player's words, everywhere a player reads:** build, remix, Publish,
  structure (Pillars.md, "Words").

**Getting started:** [CONTRIBUTING.md](../CONTRIBUTING.md) covers setting up,
the tests and what a change needs; [DeveloperFAQ.md](DeveloperFAQ.md)
answers the usual first questions; the [roadmap](Roadmap.md) records why
each change was made.
