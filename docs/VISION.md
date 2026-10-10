# Vision

**Build a little place. Anyone can remix it. Walk inside it with friends.**

ForkBuild is a 3D building game in the browser. You snap bricks into houses,
bridges and whole villages with no account and no download, share a link,
and anyone can make their own credited copy and build on it. Then you walk
through what you made, together. Your work stays yours: it lives on your
device, is signed with a key you hold, and can be published to open
networks that no single company runs. [Pillars.md](Pillars.md) turns this
into the test every feature has to pass.

## How it's built

Under the game is an open construction protocol, so that builds outlive
any one copy of the app, any one server and any one network.

ForkBuild is architected as an engine first: a clean domain model (core/), an event-driven core that never depends on rendering or UI, interchangeable rendering and publishing adapters, and a protocol designed for decentralized collaborative world-building. The browser editor (ui/) is the engine's first client, not the engine itself — every feature should be built asking "does this belong in the engine, or only in this client?"

The engine's aspiration is Git for 3D models. Every creation has a history, can be forked, and can evolve, so the game is never a single-player toy: it is the first client of an open construction ecosystem. The engine serves the game's pillars; it is not a product in its own right. First-class entity identity (UUIDs on World/Building/Brick, never array indices or sequential numbers), an aggregate root that mediates every mutation, and an event-driven core are the concrete architectural choices that make that aspiration possible rather than aspirational.

As of 0.1.46, this aspiration has three concrete navigation modes:

- **Repository View** — the "GitHub" of 3D models: browse, search, fork.
- **Author View** — the "profile": explore a creator's lineage.
- **World View** — the "Minecraft": walk through shared spaces and
  inspect bricks, then open an independent copy in the Editor the
  moment you want to build.

All three are views over the same protocol data, not separate systems.

As of 0.1.46, building was a first-class, direct experience identically
in the Editor and the World View: an interactive transform gizmo, live
drag preview, one undoable operation per commit — the classic editing
kernel (select, transform, group, clipboard, history, replay) complete
under real pointer interaction in both surfaces. As of 0.5.9, that
parity is deliberately reversed: World View observes and navigates,
the Editor alone mutates and builds — see docs/Principles.md, "World
View Observes and Navigates; Editor Mutates and Builds (0.5.9)." World
Region/Landmark naming (annotating a place you're standing at) is the
one exception, kept in World View because it was never brick-level
construction in the first place. World Animal Decorations (0.9.702),
which bake an animal you released into the World you're standing in,
follow the same reasoning. Vehicles, inventory and caught animals are the
avatar's own runtime state, never document edits. See
docs/CapabilityMatrix.md.
