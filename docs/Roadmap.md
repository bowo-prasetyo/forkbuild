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
0.1.49 Numeric Transform Input  (done)
0.1.50 Editing UX Consolidation
0.2    Blockchain publishing, multiplayer

Nested Groups / Hierarchical Editing — remains OPTIONAL / post-0.2.
Groups are useful without being hierarchical, and nothing in
0.1.43–0.1.49 has produced evidence that nesting is worth the extra
semantics.

## 0.1.49 — What shipped

Exact numeric translation and Y-rotation as the fifth input source on
the closed transform pipeline. No new command, no new entity, no
transform model, no persistent editing mode.

- application/TransformInput.js — pure parser. Strict grammar (10,
  10.5, -3.75, +2, .5, surrounding whitespace); rejects abc, 10foo,
  1..5, Infinity, NaN, and all exponential notation. Structured
  results ({ valid, value } / { valid: false, reason }) and a
  parsePanelInput() helper where empty fields mean "unchanged", never
  silent zero. No domain, renderer, or history dependencies; never
  calculates a transformed position.
- SpatialEditingService.applyNumericTransform(selection, intent,
  { absolute }) — translates exact intent into the same gesture-shaped
  transform every other input produces and commits it through the
  existing transaction with snapping DISABLED (gestureOptions.snap ===
  false): keyboard/gizmo → snapping applies; numeric/alignment/
  distribution → exact values. Absolute translation targets the
  selection PIVOT (every member receives the same delta, geometry
  preserved); absolute rotation targets the PRIMARY brick's orientation
  (every member receives the same delta, relative orientations
  preserved). One Apply = at most one TransformSelectionCommand;
  already-at-target input commits nothing.
- ui/components/NumericTransformPanel.js — input surface, not a mode:
  X/Y/Z + rotation fields, Absolute/Offset toggle, Apply/Clear, Enter
  applies, Escape clears (stopped locally so it never clears the
  selection), invalid fields marked and blocking, disabled with no
  selection. Hosted by EditorView (sidebar) and WorldView (overlay).
- EditorSession / WorldNavigationSession — route applyNumericTransform
  to the shared gesture service; the executed command refreshes gizmo
  presentation through the existing subscriptions.
- tests/NumericTransform.test.js — 27 sections: full parser tables,
  absolute/relative translation and rotation, partial fields, single/
  multi/group-resolved pivots, exact float preservation, the flagship
  snap-bypass test (pivot 4.37 → X=10 lands exactly 10 with snap=1,
  undo restores 4.37 exactly), already-at-target no-ops, one-Apply-one-
  command, exact undo/redo, serialization roundtrip, Editor/World
  parity, numeric-vs-keyboard parity, numeric-vs-gizmo parity, the
  three-way rotation trio (keyboard R === numeric 90 === gizmo 90,
  byte-identical serialized transforms), rotation/translation
  preservation, and membership invariance.

Deliberately rejected in 0.1.49: TransformInputCommand/
NumericTransformCommand, scale input, arbitrary Euler rotation,
persistent transform modes, expression languages, unit conversion, an
undo-transaction framework, transform presets, smart guides, nested
groups, and camera-relative numeric transforms.

## 0.1.50 — Editing UX Consolidation (next)

A genuine consolidation milestone, not another feature dump: command
palette, shortcut discoverability, selection/transform feedback
consistency, panel organization, empty/disabled states, accessibility,
and cleanup of any API seams the 0.1.42–0.1.49 run exposed. The goal
is a clean, stable editing surface before the 0.2 publishing/
multiplayer architecture is seriously considered.

The kernel now has five fundamentally different input sources, all
terminating in one command type:

    keyboard ──┐
    gizmo ─────┤
    alignment ─┼──► TransformSelectionCommand
    distribute ┤
    numeric ───┘
