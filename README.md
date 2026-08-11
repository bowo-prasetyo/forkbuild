# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.1.46** — Interactive Transform Gizmo & Viewport Editing Parity

The viewport is now a real editing surface. Selecting bricks shows an interactive transform gizmo — X/Y/Z axis handles, a center free-move pad, and a Y-rotation ring — anchored to the selection's pivot. Grabbing a handle starts a gesture: the selection follows the pointer as a live preview, releasing commits **exactly one** `transform-selection` command (one undo step, regardless of how many bricks moved), and Escape cancels with zero history. A drag with no effective movement commits nothing at all.

The gizmo is a renderer/UI milestone on top of the existing transform architecture: the pointer surface, the keyboard shortcuts, and the final command all compute through the same shared `TransformMath`, so what you see while dragging is exactly what gets committed — in **both** the Editor and the World View.

## Features

- **Editor** — Place, select, move, rotate, and delete bricks with full undo/redo support. Grid snapping and placement preview.
- **Interactive Transform Gizmo (0.1.46)** — Drag axis handles for constrained translation, the center pad for free ground-plane movement, or the rotation ring to spin the selection around its pivot. Hover highlighting, live drag preview, commit-on-release, Escape-to-cancel, and a visible selection pivot.
- **Viewport Editing Parity (0.1.46)** — The same gizmo, gesture transaction, and transform math in both the Editor and the World View. Same gesture, identical command semantics.
- **Groups (0.1.43)** — Bricks can be grouped; selecting a group resolves to its member bricks. Transform gestures change only brick transforms — group membership is never touched, and the gizmo itself has no concept of groups at all.
- **Advanced Selection (0.1.40/0.1.45)** — Click, Ctrl/Cmd/Shift-click to toggle, and marquee-select in the viewport. Multi-selection rotation happens around the selection bounds center.
- **Transform Parity (0.1.44)** — Keyboard and pointer transforms share one architecture: one gesture transaction, one math source, one `TransformSelectionCommand` per completed gesture.
- **Command Replay / Operation Timeline (0.1.39)** — Editing sessions persist as serialized command histories that replay exactly.
- **Brick Palette** — Core library with dimension-aware definitions (cube, slope, plate, window).
- **Persistence** — Save and load documents via localStorage with a document manifest.
- **Identity** — Local username-based identity provider; author attribution on documents and publications.
- **Publishing & Discovery** — Publish documents to a local discovery catalog; browse Repository View and Author View.
- **Forking** — Derive new documents from existing ones with fresh instance IDs and preserved lineage.
- **Spatial World View** — Free camera navigation (orbit, pan, zoom) through a shared coordinate system where multiple worlds stream in and out based on camera position.
- **Spatial Inspection** — Click any brick to inspect its type, position, rotation, and metadata.
- **Spatial Editing** — Move, rotate, and delete one or many selected bricks directly in World View; place new bricks with face-aware stacking on existing geometry.
- **Command History** — Every mutation is an undoable command; shared between Editor and Spatial views. Fully serializable via `CommandRegistry`.
- **Composite Commands** — Multi-brick operations execute, roll back on child failure, and undo/redo as a single atomic step.

## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with infrastructure adapters (storage, publisher, discovery, serializer, world-layout) surrounding them.

- **core/** — Pure domain model: World, Building, Brick, events. No Three.js, no Vue.
- **application/** — Use cases, editor state, commands, tool framework, spatial session management, the transform gesture transaction (`SpatialEditingService`), shared `TransformMath`, and the command subsystem (CommandHistory, CommandRegistry).
- **renderer/** — Three.js incremental renderer, picking, camera, overlay layers, and (as of 0.1.46) the interactive transform gizmo: `TransformGizmoRenderer` (visual) + `TransformGizmoController` (interaction).
- **ui/** — Vue 3 Composition API views and components.

The 0.1.46 transform pipeline, end to end:

Selection ── keyboard / gizmo drag / future input
│
▼
gesture contract (begin / preview / commit / cancel)
│
▼
TransformMath (one source of truth)
│
▼
TransformSelectionCommand — exactly one per gesture
│
▼
CommandHistory
│
▼
World


See [docs/Architecture.md](docs/Architecture.md) for the full architectural overview and [docs/user/](docs/user/README.md) for how-to guides.

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — engine architecture, layer rules, milestone notes.
- [docs/Roadmap.md](docs/Roadmap.md) — milestone roadmap.
- [docs/Protocol.md](docs/Protocol.md) — the ForkBuild Protocol.
- [docs/user/README.md](docs/user/README.md) — user guides, including the [Controls Reference](docs/user/ControlsReference.md) and the [Interactive Transform Gizmo guide](docs/user/InteractiveTransformGizmo.md).

## Quick Start

Open `index.html` in a modern browser. No build step is required.

## Roadmap

- [x] 0.1.1 Project Skeleton
- [x] 0.1.2 Rendering Infrastructure
- [x] 0.1.3 Core Domain Model
- [x] 0.1.4 WorldRenderer
- [x] 0.1.5 Brick Registry & Definitions
- [x] 0.1.6 Event System & Incremental Renderer
- [x] 0.1.7 Camera Infrastructure
- [x] 0.1.8 Picking System
- [x] 0.1.9 Editor Context
- [x] 0.1.10 Selection Tool
- [x] 0.1.11 Brick Palette
- [x] 0.1.12 Tool Framework
- [x] 0.1.13 Placement Preview
- [x] 0.1.14 PlaceBrickCommand + Placement Tool
- [x] 0.1.15 CommandHistory + DeleteBrickCommand
- [x] 0.1.16 CompositeCommand + Undo/Redo
- [x] 0.1.17 Document + DocumentManager
- [x] 0.1.18 Interaction System
- [x] 0.1.19 WorldSerializer + DocumentSerializer
- [x] 0.1.20A Local Storage — persistence API
- [x] 0.1.20B Local Storage — UI integration
- [x] 0.1.20C EditorSession — runtime World replacement
- [x] 0.1.21A Identity Adapter — provider shape
- [x] 0.1.21B Identity Adapter — UI integration
- [x] 0.1.22 Publisher Adapter (stub)
- [x] 0.1.23 Discovery Adapter (stub)
- [x] 0.1.24 Forking
- [x] 0.1.25 Publication lifecycle
- [x] 0.1.26 Discovery Views — Repository, Author, World
- [x] 0.1.27 World Layout & Spatial Discovery
- [x] 0.1.28 World Navigation / Spatial Streaming
- [x] 0.1.29 Spatial Interaction & World-Aware Picking
- [x] 0.1.30 Free Spatial Navigation & Interaction Refinement
- [x] 0.1.31 World Inspection & Spatial Metadata
- [x] 0.1.32 Spatial Editing Context & Domain Mutation
- [x] 0.1.33 Spatial Brick Placement & Stacking
- [x] 0.1.34 Selection/Transform Tool Refinement
- [x] 0.1.35 Command History Serialization & Integrity
- [x] 0.1.36 Multi-Selection & Atomic Group Operations
- [x] 0.1.37 Persistent Command History
- [x] 0.1.38 Transform Gizmo & Group Pivot
- [x] 0.1.39 Command Replay / Operation Timeline
- [x] 0.1.40 Advanced Selection & Grouping
- [x] 0.1.41 Unified Transform Architecture
- [x] 0.1.42 Clipboard & Editing Kernel Consolidation
- [x] 0.1.43 Groups & Selection Separation
- [x] 0.1.44 Transform Parity & Group Gizmo Architecture
- [x] 0.1.45 Advanced Selection & Editor Group Surface
- [x] 0.1.46 Interactive Transform Gizmo & Viewport Editing Parity
- [ ] 0.1.47 Editing UX / Alignment / Snapping
- [ ] 0.1.48 Nested Groups / Hierarchical Editing (optional)
- [ ] 0.2 Blockchain publishing, multiplayer

## License

Mozilla Public License Version 2.0
