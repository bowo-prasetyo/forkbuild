ForkBuild is an open construction platform where digital creations can be built, forked, shared, and preserved across decentralized publishing systems. The project aims to define an open protocol for collaborative world-building rather than a game tied to any single platform or blockchain.

ForkBuild is architected as an engine first: a clean domain model (core/), an event-driven core that never depends on rendering or UI, interchangeable rendering and publishing adapters, and a protocol designed for decentralized collaborative world-building. The browser editor (ui/) is the engine's first client, not the engine itself — every feature should be built asking "does this belong in the engine, or only in this client?"

The clearer aspiration: ForkBuild is Git for 3D models. Every creation has a history, can be forked, and can evolve — not a single-player building toy, but a foundation for an open construction ecosystem. First-class entity identity (UUIDs on World/Building/Brick, never array indices or sequential numbers), an aggregate root that mediates every mutation, and an event-driven core are the concrete architectural choices that make that aspiration possible rather than aspirational.

As of 0.1.26, this aspiration has three concrete navigation modes:
- **Repository View** — the "GitHub" of 3D models: browse, search, fork.
- **Author View** — the "profile": explore a creator's lineage.
- **World View** — the "Minecraft": walk through shared spaces.

All three are views over the same protocol data, not separate systems.
