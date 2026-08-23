=== FILE: ./docs/VISION.md ===
ForkBuild is an open construction platform where digital creations can be built, forked, shared, and preserved across decentralized publishing systems. The project aims to define an open protocol for collaborative world-building rather than a game tied to any single platform or blockchain.

ForkBuild is architected as an engine first: a clean domain model (core/), an event-driven core that never depends on rendering or UI, interchangeable rendering and publishing adapters, and a protocol designed for decentralized collaborative world-building. The browser editor (ui/) is the engine's first client, not the engine itself — every feature should be built asking "does this belong in the engine, or only in this client?"

The clearer aspiration: ForkBuild is Git for 3D models. Every creation has a history, can be forked, and can evolve — not a single-player building toy, but a foundation for an open construction ecosystem. First-class entity identity (UUIDs on World/Building/Brick, never array indices or sequential numbers), an aggregate root that mediates every mutation, and an event-driven core are the concrete architectural choices that make that aspiration possible rather than aspirational.

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
construction in the first place.
