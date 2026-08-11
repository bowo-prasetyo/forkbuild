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
0.1.48 Alignment & Distribution Tools
0.1.49 Numeric Transform Input / Precision Editing
0.1.50 Editing UX Consolidation
0.2    Blockchain publishing, multiplayer

Nested Groups / Hierarchical Editing — moved to OPTIONAL / post-0.2.
The architecture has reached a very nice property: groups are useful
without being hierarchical. There is no evidence yet that nesting is
needed badly enough to justify the additional semantics, and the editing
kernel should keep proving itself through precision and usability before
any new structural axis is introduced.

## 0.1.47 — What shipped

Precision and predictability for the existing transform system. No new
entities, no new transform commands, no scale, no second gizmo —
snapping is a pure application-layer interpretation of the gestures the
0.1.38–0.1.46 architecture already runs.

- application/TransformSnap.js — pure snap math. Snaps the GESTURE
  DELTA (never absolute positions), once per frame from the gesture
  origin (never an already-snapped value), after axis-constraint
  resolution, identically for every selection member. Floating-point
  hygiene included so snapped values are stable in commands, replay
  comparisons, and the feedback readout.
- application/TransformSettings.js — session/application preferences:
  snappingEnabled, translationSnap (1, matching the placement grid),
  rotationSnap (15°), precisionMultiplier (0.1). NOT document state,
  never serialized, protocol untouched.
- SpatialEditingService — the gesture transaction is now the single
  home of snapping: preview/commit snap the raw gesture against
  TransformSettings, with modifier-driven precision (Shift) applied per
  frame. Keyboard selection transforms (moveSelection/rotateSelection)
  are routed through the same transaction as instantaneous gestures, so
  keyboard and gizmo emit byte-identical transform-selection commands.
  Transient gesture feedback (snapped transform + effective increments
  + precision flag) exposed via getGestureFeedback().
- TransformGizmoController — forwards raw gesture values AND modifier
  state into the transaction; reads the feedback blob back out for the
  overlay. The controller decides nothing about snapping — geometry
  (axis planes) stays renderer-side, interpretation stays
  application-side.
- ui/components/TransformFeedback.js — transient overlay: mode/axis,
  effective snap increment, precision tag, and the snapped Δ readout
  ("Move X • Grid 1 / Δ +3", "Rotate Y • 15° (precision) / Δ +13.5°").
  Self-contained inline styles; no persistent HUD system.
- EditorSession / WorldNavigationSession / EditorView / WorldView —
  modifier plumbing into the transaction, feedback plumbing up to the
  overlay, keyboard nudges/rotations forwarding Shift for precision.
- tests/TransformSnapping.test.js — snap tables (positive, negative,
  rotation), precision increments, multi-selection preservation,
  constraint-before-snap ordering, gesture-origin semantics, preview
  stability / no cumulative rounding, disabled-snapping pass-through,
  no-op discipline, one-command commits, undo/redo, byte-equivalent
  replay, membership invariance, Editor/World parity, and the flagship
  keyboard/gizmo parity (keyboard +3 === gizmo drag snapped to +3;
  keyboard 90° === gizmo drag snapped to 90°).
- tests/InteractiveGizmo.test.js — updated to snap-aligned drag end
  points; all 0.1.46 semantics unchanged.

Deliberately rejected in 0.1.47: scale (still no domain semantics),
nested groups, alignment commands (a new interaction family — that is
0.1.48), persistent/grid settings in the document protocol, transform
history redesign, new transform commands, a generic GestureManager,
direct numeric entry (0.1.49, deliberately), and group-specific
snapping (groups remain resolved selections).

The milestone's property, stated plainly: at 0.1.46 the engine proved
"the editing architecture works"; at 0.1.47 it proves "the editing
architecture is precise enough to trust." 0.1.48 (Alignment &
Distribution) will build higher-level operations on this same
selection → transform architecture rather than inventing another one.
