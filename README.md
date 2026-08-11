# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.1.44** — Transform Parity & Group Gizmo Integration

The transformation architecture is now closed: every selection transform — single brick, multi-selection, or resolved group, from keyboard or gizmo gesture, in World View or Editor — flows through ONE path (`TransformSelectionUseCase` → exactly one `TransformSelectionCommand`). Groups never hold transforms: they define relationships, transforms modify members, and the transform layer never sees a `Group`. `MoveBrickCommand`/`RotateBrickCommand` are retired from production (kept registered to deserialize older histories).

## Features

- **Editor** — Place, select one or many bricks, move, rotate, and delete with full undo/redo support. Grid snapping and placement preview.
- **Brick Palette** — Core library with dimension-aware definitions (cube, slope, plate, window).
- **Persistence** — Save and load documents via localStorage with a document manifest.
- **Identity** — Local username-based identity provider; author attribution on documents and publications.
- **Publishing & Discovery** — Publish documents to a local discovery catalog; browse Repository View and Author View.
- **Forking** — Derive new documents from existing ones with fresh instance IDs and preserved lineage.
- **Spatial World View** — Free camera navigation (orbit, pan, zoom) through a shared coordinate system where multiple worlds stream in and out based on camera position.
- **Spatial Inspection** — Click any brick to inspect its type, position, rotation, and metadata; multi-selection exposes a primary brick plus selection count.
- **Spatial Editing** — Move, rotate-in-place, and delete one or many selected bricks directly in World View; place new bricks with face-aware stacking on existing geometry.
- **Command History** — Every mutation is an undoable command; shared between Editor and Spatial views. Now fully serializable via `CommandRegistry`.
- **Composite Commands** — Multi-brick operations execute, rollback on child failure, and undo/redo as a single atomic step.
- **World View Save & Publish** — Save the active world (button or Ctrl/Cmd+S) and publish it with automatic save-first when dirty. Per-world dirty indicators; dirty worlds are never stream-unloaded.
- **Command Replay & Operation Timeline** — Deterministic reconstruction of any historical world state from the persistent command history (baseline snapshot + serialized command re-execution, transactional and history-suppressed). Timeline panel in World View with click-to-preview, composite-aware entries, undone-state awareness, and non-destructive cancel.
- **Historical State Restoration** — Commit any previewed timeline state as the current document via an explicit, confirmed destructive action: replay-based reconstruction, rebased history with save-point invalidation (dirty until saved), retired-history artifacts, and full save/publish compatibility.
- **Document Duplication & Forking** — Duplicate or fork any loaded world from World View: fresh identities throughout, lineage metadata (`parentDocumentId`), current-user attribution, and a fresh dirty editing session. The Repository/Author fork flow now delegates to the same cloning mechanism.
- **Clipboard Copy/Paste** — Ctrl+C copies a multi-selection as pivot-relative intent (never ids); Ctrl+V pastes it as one atomic `Paste 3 Bricks` command with cascading offset, full undo/redo/replay/restore support, and automatic selection of the pasted bricks.
- **Persistent Groups** — Flat named groups as document state, with create/delete/rename/add/remove/duplicate commands; full undo/replay/restore support and a World View group panel (group selection, select/add/rename/duplicate/delete).
- **Editor Clipboard Parity** — Ctrl+C / Ctrl+V in the Editor reuse the World View clipboard machinery verbatim; group-aware copy/paste on both surfaces.
- **Unified Transform Layer** — One transform path for every selection kind with pivot semantics (multi/group rotation orbits the selection bounds center), shared transform math, and no-op suppression across keyboard and gizmo gestures.
- **Editor Transform Parity** — Arrow/Page-key nudges and R/Shift+R pivot rotation in the Editor through the exact same use case World View uses — no second transform implementation anywhere.
    
## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with infrastructure adapters (storage, publisher, discovery, serializer, world-layout) surrounding them.

- **core/** — Pure domain model: World, Building, Brick, events. No Three.js, no Vue.
- **application/** — Use cases, editor state, commands, tool framework, spatial session management, and the command subsystem (CommandHistory, CommandRegistry).
- **renderer/** — Three.js incremental renderer, picking, camera, and overlay layers.
- **ui/** — Vue 3 Composition API views and components.

See [docs/Architecture.md](docs/Architecture.md) for the full architectural overview.

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
- [x] 0.1.39 World View Persistence & Publication UI
- [x] 0.1.40 Command Replay / Operation Timeline
- [x] 0.1.41 Historical State Restoration
- [x] 0.1.42 Document Duplication, Forking & Clipboard
- [x] 0.1.43 Advanced Selection, Grouping & Editing Parity 
- [x] 0.1.44 Transform Parity & Group Gizmo Integration 
- [ ] 0.1.45 Advanced Selection / Editor Group Surface
- [ ] 0.1.46 Nested Groups / Hierarchical Editing  (optional)
- [ ] 0.2    Blockchain publishing, multiplayer
      
## License

Mozilla Public License Version 2.0
