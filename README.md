# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.2.22** — Fork Transition & World View Document Switching

0.2.16 gave every immutable object an answer to "who authorized
this?" (Ed25519 signing identities, signed publications / placement
revisions / spatial-index roots). 0.2.17 through 0.2.19 build on that
foundation: delegated authorization without transferring ownership,
causal replication so independently authorized replicas converge
without destroying either side's history, and a trust/discovery layer
that reasons about authority, freshness, replay, and equivocation —
not just cryptographic validity — before anything is treated as
current state. 0.2.20 closed a gap that fell out of that same
boundary: the World View can now be fully edited in place while a
published snapshot itself remains absolutely immutable, because
editing one is semantically "fork, then edit the fork" — done lazily,
on the first mutation, subject to the same fork policy as an explicit
Fork. 0.2.21 put a face on that enforcement: a Document Properties
editor, a Document Info panel, lifecycle status, and plain-language
explanations for why an edit is or isn't possible. 0.2.22 closes the
remaining gap between the two: the moment a fork is created, the World
View's title, status line, and browser route now atomically switch to
it — the screen never keeps displaying the published source while
every subsequent edit is silently landing on the fork underneath it.
See [docs/Architecture.md](docs/Architecture.md) for the full write-up
of each milestone.

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
- **Decentralized Spatial Discovery (0.2.15)** — cell-based immutable spatial index manifests; viewport queries fetch only intersecting cells; stale-index-tolerant resolution.
- **Decentralized Identity & Signatures (0.2.16)** — Ed25519 signing identities, canonical signing envelopes with domain separation, signed publications/placements/index roots, and authorization verification in decentralized discovery.
- **Delegated Ownership & Authorization (0.2.17)** — signed, narrowly-scoped delegations (e.g. "place this publication," optionally region-constrained) that let someone other than the resource owner act with explicit, verifiable authority, without transferring ownership.
- **Decentralized Replication & Conflict Handling (0.2.18)** — causal (vector-clock) history on every placement revision; independently authorized replicas that edit the same placement while disconnected converge deterministically on reconciliation, with every competing revision retained and verifiable rather than one silently overwriting the other.
- **Trust & Discovery Hardening (0.2.19)** — a trust-policy layer (pinned/discovered/untrusted authorities, legacy-content tolerance) and equivocation detection (an authority signing two different index roots at the same causal position) sit around the discovery pipeline, plus a structured diagnostics surface explaining exactly why a query returned what it did.
- **Fork-on-Edit & Immutable Snapshot Lineage (0.2.20)** — the World View lazily forks a published snapshot on its first mutation instead of ever mutating it in place; viewing never forks, exactly one fork is created per editing session, the fork carries `parentDocumentId` provenance through the existing forking mechanism, and fork policy (0.2.13 licensing) still governs whether the fork may happen at all.
- **Document Lifecycle & Metadata UI (0.2.21)** — a Document Properties editor (title/description/license) and a shared Document Info panel across the Editor and World View, showing computed lifecycle status (Draft/Saved/Published) and fork lineage; publishing now validates a title and non-empty content before creating anything immutable; a blocked or about-to-fork edit is explained in plain language, proactively and reactively, instead of failing silently.
- **Fork Transition & World View Document Switching (0.2.22)** — the moment fork-on-edit creates a fork, the World View's title, status badge ("🔒 Published" / "✎ Editing fork — forked from …"), and browser route atomically switch to it, re-derived from the session's active document on every interaction rather than a value frozen at page load; camera and scene position are untouched, only document identity changes; a denied fork leaves everything pointed at the source.
  
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
- [x] 0.1.51 Stability / Performance / Large-Document Hardening
- [x] 0.1.52 Protocol & Persistence Hardening
- [x] 0.2.0   Durable Documents & Publishing Boundary       
- [x] 0.2.1   Editor / World Editing Parity                 
- [x] 0.2.2   Schema Versioning & Real Migration Fixtures   
- [x] 0.2.3   Publish / Unpublish Lifecycle                 
- [x] 0.2.4   Read-only Published World                     
- [x] 0.2.5   World Placement & Spatial Discovery
- [x] 0.2.6   Persistence, Recovery & Autosave
- [x] 0.2.7   Collaboration Protocol Foundation           
- [x] 0.2.8   Fork / Edit Published World                 
- [x] 0.2.9   Multi-client Synchronization                
- [x] 0.2.10  Decentralized Placement Registry
- [x] 0.2.11  Spatial Discovery & Content Resolution
- [x] 0.2.12  World View Streaming & Runtime Integration  ✓
- [x] 0.2.13  Publication Licensing & Fork Policy
- [x] 0.2.14  Decentralized Content Backend
- [x] 0.2.15  Decentralized Spatial Discovery
- [x] 0.2.16  Decentralized Identity & Signatures
- [x] 0.2.17  Delegated Ownership & Authorization
- [x] 0.2.18  Decentralized Replication & Conflict Handling
- [x] 0.2.19  Trust / Discovery Hardening
- [x] 0.2.20  Fork-on-Edit & Immutable Snapshot Lineage
- [x] 0.2.21  Document Lifecycle & Metadata UI
- [x] 0.2.22  Fork Transition & World View Document Switching
    
Nested Groups remains optional and is not on the roadmap yet — the flat-group model has proven sufficient through 0.1.50.

## License

Mozilla Public License Version 2.0
