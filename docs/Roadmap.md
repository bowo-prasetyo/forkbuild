0.1.1  Project Skeleton                     (done)
0.1.2  Rendering Infrastructure             (done)
0.1.3  Core Domain Model                    (done)
0.1.4  WorldRenderer                        (done)
0.1.5  Brick Registry & Definitions         (done)
0.1.6  Event System & Incremental Renderer  (done)
0.1.7  Camera Infrastructure                (done)
0.1.8  Picking System                       (done)
0.1.9  Editor Context                       (done)
0.1.10 Selection Tool                       (done)
0.1.11 Brick Palette                        (done)
0.1.12 Tool Framework                       (done)
0.1.13 Placement Preview                    (done)
0.1.14 PlaceBrickCommand + Placement Tool (click commits)  (done)
0.1.15 CommandHistory + DeleteBrickCommand  (done)
0.1.16 CompositeCommand + Undo/Redo         (done)
0.1.17 Document + DocumentManager (dirty/version/lastSaved)  (done)
0.1.18 Interaction System (InputDispatcher + undo/redo labels)  (done)
0.1.19 WorldSerializer + DocumentSerializer (with validation)  (done)
0.1.20A Local Storage — persistence API (StorageProvider, Save/LoadDocumentUseCase)  (done)
0.1.20B Local Storage — UI integration (Save button, dirty indicator, Recent Documents)  (done)
0.1.20C EditorSession (runtime World replacement — New/Load)  (done)
0.1.21A Identity Adapter — provider shape (IdentityProvider, LocalIdentityProvider, author wiring)  (done)
0.1.21B Identity Adapter — UI integration (login prompt, current-user display)  (done)
0.1.22 Publisher Adapter (stub) — depends on Identity, not the reverse  (done)
0.1.23 Discovery Adapter (stub) — depends on Publisher, not the reverse  (done)
0.1.24 Forking  (done)
0.1.25 Publication lifecycle  (done)
0.1.26 Discovery Views — Repository, Author, World  (done)
0.1.27 World Layout & Spatial Discovery  (done)
0.1.28 World Navigation / Spatial Streaming  (done)
0.1.29 Spatial Interaction & World-Aware Picking  (done)
0.1.30 Free Spatial Navigation & Interaction Refinement  (done)
0.1.31 World Inspection & Spatial Metadata  (done)
0.1.32 Spatial Editing Context & Domain Mutation  (done)
0.1.33 Spatial Brick Placement & Stacking  (done)
0.1.34 Selection/Transform Tool Refinement  (done)
0.1.35 Command History Serialization & Integrity  (done)
0.1.36 Multi-Selection & Atomic Group Operations  (done)
0.1.37 Persistent Command History  (done)
0.1.38 Transform Gizmo & Group Pivot  (done)
0.1.39 Command Replay / Operation Timeline  (done)
0.1.40 Advanced Selection & Grouping  (done)
0.1.41 Unified Transform Architecture  (done)
0.1.42 Clipboard & Editing Kernel Consolidation  (done)
0.1.43 Groups & Selection Separation  (done)
0.1.44 Transform Parity & Group Gizmo Architecture  (done)
0.1.45 Advanced Selection & Editor Group Surface  (done)
0.1.46 Interactive Transform Gizmo & Viewport Editing Parity  (done)
0.1.47 Transform Precision, Snapping & Editing Polish  (done)
0.1.48 Alignment & Distribution Tools  (done)
0.1.49 Numeric Transform Input / Precision Editing
0.1.50 Editing UX Consolidation
0.2    Blockchain publishing, multiplayer

Nested Groups / Hierarchical Editing — remains OPTIONAL / post-0.2. The
architecture has reached a very nice property: groups are useful without
being hierarchical. 0.1.43–0.1.48 kept proving that resolved selections
cover the real editing needs; nothing in alignment/distribution required
a group-transform concept.

## 0.1.48 — What shipped

Alignment and distribution as transform-generation algorithms on the
existing selection → bounds → transform pipeline. No new entities, no
new commands, no persistent alignment state, no second transform engine.

- application/TransformAlignment.js — pure math. Nine alignment modes
  (x/y/z × min/center/max, all WORLD axes, never camera directions) and
  center distribution along x/y/z. Inputs: captured transforms +
  per-brick bounds + selection bounds. Outputs: exact absolute
  transforms or null for degenerate cases. No World, Group, Brick,
  renderer, history, or UI.
- SpatialEditingService.alignSelection(mode) / distributeSelection(axis)
  — the shared transaction: resolve selection → capture transforms →
  generate exact targets → transformsEqual no-op check → exactly one
  TransformSelectionCommand. Deliberately bypasses 0.1.47 gesture
  snapping: snapping governs user-authored deltas; alignment targets are
  geometric relationships and must land exactly.
- Distribution semantics: deterministic sort by axis coordinate, then
  buildingId, then brickId; endpoints pinned exactly; only interior
  members move; fewer than three bricks or a zero span is a no-op.
- Alignment semantics: reference is the WHOLE selection bounds (never
  the first brick), so selection order is irrelevant; requires two or
  more bricks to do anything useful; one brick collapses to a no-op.
- ui/components/AlignmentPanel.js — compact 9-align + 3-distribute
  surface, hosted by both EditorView (sidebar) and WorldView (overlay),
  enabled at 2+ selected bricks, distribution enabled at 3+. The UI
  passes operation identifiers only; the application layer decides what
  they mean. No keyboard shortcuts in this milestone — by design.
- tests/TransformAlignment.test.js — pure math tables, all three axes
  for both operations, selection-order independence, deterministic
  ties, two-brick / already-aligned / zero-span no-ops with zero
  history entries, exact floating-point behavior, multi-building
  selections, membership invariance, one-command commits, exact
  undo/redo, byte-equivalent replay, Editor/World parity, the flagship
  snap-independence test (1.37 / 4.91 / 9.26 aligning exactly with
  snapping enabled, undo restoring bit-exact), and rotation
  preservation.

Deliberately rejected in 0.1.48: scale, nested groups, AlignCommand/
DistributeCommand/AlignGroupCommand, persistent alignment state, smart
guides, magnetic snapping, collision-aware distribution, numeric input,
a generic GestureManager, camera-relative alignment, arbitrary-angle
alignment, and a keyboard shortcut matrix (a scoped command palette
belongs to 0.1.50).

The milestone's payoff: 0.1.47 proved the transform kernel is precise;
0.1.48 proves higher-level editing operations can be built entirely on
that kernel. Alignment and distribution are just two more consumers of
the closed transform architecture — selection determines participants,
bounds determine reference geometry, and TransformSelectionCommand
records the result. 0.1.49 (Numeric Transform Input) will be the third.
