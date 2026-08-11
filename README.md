# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.1.48** — Alignment & Distribution Tools

The editing kernel (0.1.42–0.1.47) now supports precision layout operations. Selected bricks can be aligned by world-axis edges or centers — nine operations across X/Y/Z — and three or more bricks can be distributed evenly along any axis. Both are implemented as transform-generation algorithms over the existing selection → bounds → transform pipeline: they compute exact absolute targets and commit them through the same single `TransformSelectionCommand` every keyboard nudge and gizmo drag produces. No new commands, no new entities, exact undo/redo/replay for free.

## Features

- **Editor** — Place, select (single, multi, group), move, and rotate bricks with the keyboard or the interactive gizmo; full undo/redo.
- **Alignment & Distribution (0.1.48)** — Align selected bricks by world-axis edges or centers and distribute three or more bricks evenly along X/Y/Z, using the unified transform command path with exact undo/redo. Alignment lands on exact geometric targets — it never passes through gesture snapping.
- **Transform Precision (0.1.47)** — Grid/increment snapping for translation and rotation, Shift-held precision mode, and identical snapping for keyboard and pointer in both views.
- **Interactive Transform Gizmo (0.1.46)** — Axis handles, free-move pad, and rotation ring with live preview, commit-on-release, Escape-to-cancel, and one undo step per drag — identical in the Editor and the World View.
- **Groups (0.1.43)** — Group selections resolve to member bricks; every transform (keyboard, gizmo, alignment, distribution) leaves membership untouched.
- **Advanced Selection (0.1.40/0.1.45)** — Click, Ctrl/Cmd/Shift-click toggle, and marquee selection.
- **Command Replay / Operation Timeline (0.1.39)** — Editing sessions persist as serialized command histories that replay exactly.
- **Brick Palette** — Core library with dimension-aware definitions (cube, slope, plate, window).
- **Persistence** — Save and load documents via localStorage with a document manifest.
- **Identity** — Local username-based identity provider; author attribution on documents and publications.
- **Publishing & Discovery** — Publish documents to a local discovery catalog; browse Repository View and Author View.
- **Forking** — Derive new documents from existing ones with fresh instance IDs and preserved lineage.
- **Spatial World View** — Free camera navigation through a shared coordinate system where multiple worlds stream in and out based on camera position.

## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with infrastructure adapters (storage, publisher, discovery, serializer, world-layout) surrounding them.

- **core/** — Pure domain model: World, Building, Brick, events. No Three.js, no Vue.
- **application/** — Use cases, editor state, commands, tool framework, the transform gesture transaction, shared transform math (TransformMath, TransformSnap, TransformAlignment), and the command subsystem (CommandHistory, CommandRegistry).
- **renderer/** — Three.js incremental renderer, picking, camera, overlay layers, and the interactive transform gizmo.
- **ui/** — Vue 3 Composition API views and components.

The transform pipeline, end to end — keyboard, gizmo, alignment, and distribution all terminate in the same place:

```
Selection ── keyboard / gizmo drag / align / distribute
│
▼
gesture service (one transaction, one math source)
│
▼
TransformSelectionCommand — exactly one per operation
│
▼
CommandHistory
│
▼
World
```


See [docs/Architecture.md](docs/Architecture.md) for the full architectural overview and [docs/user/](docs/user/README.md) for how-to guides.

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — engine architecture, layer rules, milestone notes.
- [docs/Roadmap.md](docs/Roadmap.md) — milestone roadmap.
- [docs/Protocol.md](docs/Protocol.md) — the ForkBuild Protocol.
- [docs/user/README.md](docs/user/README.md) — user guides, including the [Controls Reference](docs/user/ControlsReference.md) and the [Interactive Transform Gizmo guide](docs/user/InteractiveTransformGizmo.md).

## Quick Start

Open `index.html` in a modern browser. No build step is required.

## Roadmap

- [x] 0.1.1 – 0.1.38 — engine foundations through Transform Gizmo & Group Pivot (see docs/Roadmap.md for the full list)
- [x] 0.1.39 Command Replay / Operation Timeline
- [x] 0.1.40 Advanced Selection & Grouping
- [x] 0.1.41 Unified Transform Architecture
- [x] 0.1.42 Clipboard & Editing Kernel Consolidation
- [x] 0.1.43 Groups & Selection Separation
- [x] 0.1.44 Transform Parity & Group Gizmo Architecture
- [x] 0.1.45 Advanced Selection & Editor Group Surface
- [x] 0.1.46 Interactive Transform Gizmo & Viewport Editing Parity
- [x] 0.1.47 Transform Precision, Snapping & Editing Polish
- [x] 0.1.48 Alignment & Distribution Tools
- [ ] 0.1.49 Numeric Transform Input / Precision Editing
- [ ] 0.1.50 Editing UX Consolidation
- [ ] 0.2 Blockchain publishing, multiplayer

Nested Groups remains optional / post-0.2.

## License

Mozilla Public License Version 2.0
