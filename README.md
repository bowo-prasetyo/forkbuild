# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.2.1** — Editor / World Editing Parity

Both editing surfaces now share the same editing capabilities through
the action registry. The difference between Editor View and World View
is presentation and navigation emphasis, not different meanings of
operations. The capability matrix is the normative reference. A parity
test locks the invariant against regression.

## Features

- **Command Surface (0.1.50)** — One action registry driving shortcuts, the command palette (Ctrl/Cmd+K), and the sidebar; consistent feedback; disabled states with reasons; empty-state guidance.
- **Numeric Transform Input (0.1.49)** — Exact translation and rotation values with absolute/relative modes, bypassing gesture snapping.
- **Alignment & Distribution (0.1.48)** — Nine world-axis alignment operations and even center distribution along X/Y/Z, through the unified transform command path.
- **Transform Precision (0.1.47)** — Grid/increment snapping with Shift precision mode, identical for keyboard and pointer.
- **Interactive Transform Gizmo (0.1.46)** — Axis handles, free-move pad, rotation ring; one undo step per drag; identical in both views.
- **Groups (0.1.43)** — Create, rename, duplicate, delete; selections resolve to member bricks and transforms never touch membership.
- **Clipboard (0.1.42)** — Copy/paste selections through the command path.
- **Editor** — Place, select (single/multi/marquee), move, rotate, delete, undo/redo, grid snapping, placement preview.
- **Command Replay / Operation Timeline (0.1.39)** — Serialized command histories that replay exactly.
- **Brick Palette** — Core library with dimension-aware definitions (cube, slope, plate, window).
- **Persistence** — Save and load documents via localStorage with a document manifest.
- **Identity** — Local username-based identity provider; author attribution on documents and publications.
- **Publishing & Discovery** — Publish documents to a local discovery catalog; browse Repository View and Author View.
- **Forking** — Derive new documents from existing ones with fresh instance IDs and preserved lineage.
- **Spatial World View** — Free camera navigation through a shared coordinate system where multiple worlds stream in and out based on camera position.

## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with infrastructure adapters (storage, publisher, discovery, serializer, world-layout) surrounding them.

- **core/** — Pure domain model: World, Building, Brick, events. No Three.js, no Vue.
- **application/** — Use cases, editor state, commands, the transform gesture transaction, shared transform math, and the command subsystem (CommandHistory, CommandRegistry). As of 0.1.50 also the EditorActionRegistry / EditorActionContext / InputRouter action layer — above the kernel, never inside it.
- **renderer/** — Three.js incremental renderer, picking, camera, overlay layers, and the interactive transform gizmo.
- **ui/** — Vue 3 Composition API views and components.

The editing stack, end to end:

```
Command Palette / Sidebar / Shortcuts
│
▼
EditorActionRegistry (actions — not commands)
│
▼
Existing Sessions
│
┌─────────────┼─────────────┐
▼ ▼ ▼
Selection Transform Groups/Clipboard
│ │ │
└─────────────┼─────────────┘
▼
Existing Commands
│
▼
CommandHistory
```

See [docs/Architecture.md](docs/Architecture.md) for the full architectural overview and [docs/user/](docs/user/README.md) for how-to guides.

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — engine architecture, layer rules, milestone notes.
- [docs/Roadmap.md](docs/Roadmap.md) — milestone roadmap.
- [docs/Protocol.md](docs/Protocol.md) — the ForkBuild Protocol.
- [docs/Principles.md](docs/Principles.md) — engineering principles, including "Actions are not commands".
- [docs/user/README.md](docs/user/README.md) — user guides, including the [Controls Reference](docs/user/ControlsReference.md) (generated from the action registry) and the [Interactive Transform Gizmo guide](docs/user/InteractiveTransformGizmo.md).

## Quick Start

Open `index.html` in a modern browser. No build step is required. Press **Ctrl/Cmd+K** in the Editor or World View to open the command palette.

## Roadmap

- [x] 0.1.1 – 0.1.38 — engine foundations through Transform Gizmo & Group Pivot (see docs/Roadmap.md)
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
- [x] 0.1.49 Numeric Transform Input
- [x] 0.1.50 Editing UX Consolidation & Command Surface
- [ ] 0.1.51 Stability / Performance / Large-Document Hardening
- [ ] 0.1.52 Protocol & Persistence Hardening
- [ ] 0.2 Blockchain publishing, multiplayer

Nested Groups remains optional and is not on the roadmap yet — the flat-group model has proven sufficient through 0.1.50.

## License

Mozilla Public License Version 2.0
