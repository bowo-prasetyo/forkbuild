# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.1.36** — Multi-Selection & Atomic Group Operations

ForkBuild now supports multi-brick selection and group editing. Ctrl/Cmd-click toggles bricks into and out of the current selection, while move, rotate-in-place, and delete operations are emitted as `CompositeCommand` trees so the whole group appears as one undo/redo step. `CompositeCommand` execution is now transactional: if a child command fails, already-executed children are rolled back before the error is rethrown.

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
- [ ] 0.1.37 Persistent Command History
- [ ] 0.1.38 Transform Gizmo & Group Pivot
- [ ] 0.1.39 Command Replay / Operation Timeline
- [ ] 0.1.40 Advanced Selection & Grouping
- [ ] 0.2 Blockchain publishing, multiplayer

## License

Mozilla Public License Version 2.0
