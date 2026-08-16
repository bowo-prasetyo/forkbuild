ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, WorldPosition,
BrickDefinition, BrickRegistry, PlacementValidator, Document,
DocumentMetadata, protocolVersion, createId, and events/ (EventBus,
DomainEvent, EventListener, and — as of 0.1.10 — EditorEvent). No
Three.js, no Vue, no browser APIs. Never imports anything from
application/, renderer/, or ui/.

Every World, Building, and Brick has a first-class UUID identity
(createId(), defaulted in each constructor) rather than a hand-picked or
sequential id. This matters once forking, merging, multiplayer, and
comments/annotations exist — everything references an id, never an array
index or a caller-chosen string. Don't confuse this with a
BrickDefinition id like "core:cube": that's a stable, namespaced *type*
identifier (docs/BrickIDs.md), not a per-instance UUID.

A Brick stores a definitionId, not geometry. BrickRegistry resolves
definitionId -> BrickDefinition (metadata only). Libraries (e.g.
core/library/CoreLibrary.js) register their definitions with the
registry at startup — see docs/BrickLibrary.md.

WorldPosition (core/WorldPosition.js), added 0.1.27, is a coordinate
in shared world space — distinct from Position so brick-local and
world-global concepts never merge accidentally.

Document (core/Document.js) is the publishable/persistable unit: a World
plus DocumentMetadata (title, author, created, modified, protocolVersion,
engineVersion). A Document is not a World; it CONTAINS one. Deliberately
excludes anything session-local (dirty, readOnly, "loaded from") —
that's DocumentState, Editor State, in application/editor-state/.

World is the aggregate root. addBuilding/removeBuilding and
addBrickToBuilding/removeBrickFromBuilding publish BuildingAdded /
BuildingRemoved / BrickAdded / BrickRemoved through an EventBus. As of
0.1.32, World.updateBrick(buildingId, brickId, changes) is the mutation
path for transform edits, publishing BRICK_UPDATED. Every transform
surface built since — gizmo preview (0.1.46), snapping (0.1.47),
alignment/distribution (0.1.48), numeric input (0.1.49) — flows through
this one method via commands; nothing touches meshes directly.

application/

Use cases. Coordinates core/ and the infrastructure layers. Constructs
the shared domain EventBus and wires it to both World and the renderer —
core/ and renderer/ never reference each other directly, only the events
between them.

EditorContext (application/EditorContext.js) holds all transient editor
state: selection, active tool, active brick, camera pose, preview,
settings. Editor State, not Domain State. Its EditorEvent vocabulary
lives in core/events/ because renderer/ subscribes to it and must never
import application/.

Tool Framework (application/tools/, ToolManager, ToolRegistry): Tool is
the base class every tool extends (pointer terminology throughout).
ToolManager owns "what is the current tool" and dispatches input to it.
As of 0.1.18, InputDispatcher normalizes raw DOM events and performs
picking ONCE per pointer event; tools receive pre-picked results and
never call PickingService themselves.

EditorSession (application/EditorSession.js), added 0.1.20C, owns the
entire live runtime graph as one unit — render session, EventBus, World,
CommandHistory, ToolManager, InputDispatcher — rebuilt identically by
start()/loadDocument()/newDocument()/openDocument(). Since 0.1.46 it
also owns the Editor's gesture service (a SpatialEditingService wired to
the open document), gizmo presentation refresh, and exclusive input
routing; 0.1.47 added TransformSettings and modifier/feedback plumbing;
0.1.48/0.1.49 added alignSelection/distributeSelection/
applyNumericTransform; 0.1.50 added selectAll()/clearSelection()/
deleteSelection()/getSelectionCount() so the action layer can drive the
Editor exactly like the World View. Group and clipboard surface
(0.1.42/0.1.43) lives wherever this session is extended in the deployed
tree; the action layer degrades gracefully when those methods are absent.

WorldNavigationSession (application/WorldNavigationSession.js), updated
0.1.30, owns the live read-only runtime graph for World View: camera
positioning via SpatialCameraController, spatial discovery via
WorldLayoutProvider, document loading, world load/unload
reconciliation, spatial selection/hover state, and a shared EventBus
feeding a single WorldRenderer. Since 0.1.46 it exposes the World View's
gizmo surface through the SAME SpatialEditingService; 0.1.47–0.1.49
mirror the Editor's transform additions; 0.1.50 added selectAll()/
getSelectionCount().

SpatialEditingService (application/SpatialEditingService.js) translates
spatial editing intent into domain mutations via CommandHistory. Since
0.1.38 it owns the transform gesture transaction:

    beginTransformGesture(selection, { mode, axis })
        capture initial transforms, compute bounds + pivot
    previewTransformGesture(selection, transform, gestureOptions)   x N
        apply to the live World directly — NO command, NO history
    commitTransformGesture(selection, transform, gestureOptions)
        restore original state, then execute ONE
        TransformSelectionCommand; returns false (no command) when
        before == after — the no-op discipline
    cancelTransformGesture(selection)
        restore original state — NO command

Since 0.1.46 the interactive pointer gizmo drives it alongside the
keyboard paths. Since 0.1.47 snapping is applied INSIDE the transaction
(gestureOptions.snap === false bypasses it for explicit-intent inputs;
modifiers.shift selects precision increments). Since 0.1.48 it owns
alignment and distribution (alignSelection/distributeSelection); since
0.1.49, numeric transform input (applyNumericTransform). One gateway,
one command type — five input sources terminate here:

    keyboard ──┐
    gizmo ─────┤
    alignment ─┼──► TransformSelectionCommand
    distribute ┤
    numeric ───┘

TransformMath (application/TransformMath.js, 0.1.46) is the single
source of truth for every transform calculation: translation, Y-axis
rotation around a pivot, angle measurement, axis projection, rotation
deltas, calculateTransforms()/transformsEqual(). Keyboard, gizmo,
alignment, distribution, numeric input, and the committed command all
resolve to these functions. renderer/ needs it without importing
application/ — resolved by INJECTION: the render use cases hand it to
the gizmo controller they construct.

TransformSnap (application/TransformSnap.js, 0.1.47) snaps GESTURE
DELTAS, never absolute positions, always from the gesture origin —
snapping once per frame from the origin makes previews stable and
pointer motion reversible. TransformSettings (application/
TransformSettings.js, 0.1.47) holds session preferences
(snappingEnabled, translationSnap 1, rotationSnap 15°,
precisionMultiplier 0.1) — never document state, never protocol.

TransformAlignment (application/TransformAlignment.js, 0.1.48) is pure
alignment/distribution math: nine world-axis alignment modes and even
center distribution with deterministic ordering (axis coordinate, then
buildingId, then brickId) and pinned endpoints. Inputs/outputs are plain
data; no group is visible to this layer.

TransformInput (application/TransformInput.js, 0.1.49) parses numeric
intent with a strict grammar and structured results; empty fields mean
"unchanged". It never calculates transformed positions — that remains
the transform machinery's job.

CommandHistory (application/CommandHistory.js): tools call
commandHistory.execute(command); linear history invariant (execute after
undo clears redo). Persistent-session shape { schemaVersion, cursor,
commands } since 0.1.37, deserialized through CommandRegistry. History
knows nothing about sessions, tools, or the renderer.

Command Serialization & Registry (0.1.35): every command carries id,
timestamp, and a stable type string; CommandRegistry maps type -> class
for reconstruction. CompositeCommand is fully serializable and, since
0.1.36, transactional: a failing child rolls back executed children in
reverse before rethrowing.

DocumentManager owns document lifecycle and DocumentState; publishes
DocumentManagerEvent.STATE_CHANGED; trackCommandHistory() marks dirty on
every executed/undone/redone command.

EditorActionRegistry (application/EditorActionRegistry.js, 0.1.50) is
the action layer: one registry of user-facing operations — id, label,
category, shortcut (display string + machine key combinations),
description, enabled(context), disabledReason(context),
execute(invocation). createStandardActions({ session, feedback, ui })
binds each surface's session into shared definitions; both views build
their registry from the same factory, so ids/labels/shortcuts/
availability rules are identical everywhere.

ACTIONS ARE NOT COMMANDS — the load-bearing distinction of 0.1.50. Some
actions produce history (delete -> DeleteBrickCommand, move ->
TransformSelectionCommand); most don't (selectAll is session state,
opening the palette is UI state, feedback is transient). The registry
never touches CommandHistory or World; it invokes the existing sessions,
which remain the single gateway to the kernel.

EditorActionContext (application/EditorActionContext.js, 0.1.50) is the
pure availability snapshot: selection count, clipboard count, groups,
selected group, undo/redo flags and labels, gesture activity, palette
state, active tool. Captured fresh on every consumption; capture() is
defensive — surfaces expose what they have, missing capabilities fall
back to inert defaults, so no surface can make the palette throw.

InputRouter (application/InputRouter.js, 0.1.50) is minimal input
routing, introduced where the fragmentation justified it and not before:
(1) the explicit Escape priority chain — input > palette > gesture >
marquee > selection — as a pure resolveEscapeTarget(state); (2)
registry-driven shortcut matching with Ctrl/Cmd parity, lowercased
keys, and key-repeat suppression; (3) text-input detection. Views
orchestrate; the router answers.

renderer/

Three.js. WorldRenderer subscribes to World's domain events and reacts
incrementally — BrickAdded creates one mesh, BrickRemoved deletes one,
BuildingAdded/BuildingRemoved handle a whole building at once. There is
no render(world) sweep. MeshRegistry maps brick id <-> mesh plus
brick/building/document ids.

PickingService answers "what brick is here" and "where does the ray hit
the ground plane". CameraController owns orbit/pan/zoom (OrbitControls),
resize, and the Home reset; CameraState is a pure data snapshot. As of
0.1.46, setEnabled() lets an active gesture freeze the camera.

SelectionRenderer, PreviewRenderer, SpatialPreviewRenderer are the
pre-0.1.46 overlays. TransformGizmoRenderer (0.1.46) is the purely
visual gizmo half: axis handles, free-move pad, rotation ring, pivot
marker, bounds box, hover/active highlighting, camera-distance scaling —
anchored to { pivot, bounds } and nothing else; it has no knowledge of
Groups. TransformGizmoController (0.1.46) is the interaction half: hit
testing, pointer down/move/up, gesture state, Escape cancellation; it
drives the gesture contract with injected TransformMath and forwards
modifier state (0.1.47); it enforces gesture exclusivity (controls
disabled, selection frozen) during drags.

Render Layers: World Layer (WorldRenderer), Overlay Layer (selection,
hover, preview), Gizmo Layer — real since 0.1.46.

ui/

Vue. Talks only to application/, never directly to core/, renderer/, or
storage/. EditorView and WorldView route every pointer/key event through
the session's gizmo surface FIRST (0.1.46); as of 0.1.50 their keyboard
surfaces are consolidated onto the EditorActionRegistry — editing
shortcuts, the palette, the sidebar, and docs/user/ControlsReference.md
all read the same action metadata. Tool switching (1/2) and Ctrl+S
remain view-local: they are not editing actions.

CommandPalette (ui/components/CommandPalette.js, 0.1.50): Ctrl/Cmd+K
modal over the registry — substring search across label/category/id,
category sections, arrow-key navigation, Enter executes only enabled
actions, Escape closes, disabled actions stay visible with their
disabledReason. All search/grouping logic lives on EditorActionRegistry
itself; the component is the thin visual layer.

ActionFeedback (ui/components/ActionFeedback.js, 0.1.50): one-line
transient messaging with a consistent vocabulary ("Aligned Left",
"Rotated +90°", "Copied selection", "Distributed Z") — aria-live, no
queue, no toast framework.

EditingSidebar (ui/components/EditingSidebar.js, 0.1.50): consolidated
Selection / Transform / Groups / Clipboard sections composing the
existing AlignmentPanel and NumericTransformPanel unchanged, with empty
states ("No bricks selected — select bricks to transform, align,
distribute, or edit numerically") and disabled reasons instead of dead
buttons. Organization, not a new UI architecture.

TransformFeedback (0.1.47) remains the in-gesture overlay: mode/axis,
effective snap increment, precision tag, snapped Δ — what the
transaction decided will commit.

world-layout/ / storage/ / serializer/ / publisher/ / discovery/ /
identity/

Spatial adapter family (0.1.27): WorldLayoutProvider answers "where do
published worlds exist"; LocalWorldLayoutProvider arranges publications
on a deterministic grid. StorageProvider (0.1.20A) is the most decoupled
layer — names and blobs only. Serializer (0.1.19) wraps World/Document
toJSON/fromJSON with protocol-version validation. PublisherProvider
(0.1.22) receives an IdentityProvider and may call sign() without
knowing how. DiscoveryProvider (0.1.23) answers "what has been
published"; the three views consume Publications without knowing the
source. IdentityProvider (0.1.21): login/logout/currentUser/sign.

Spatial Inspection (0.1.31) — SpatialInspectionState resolved from
loaded Document/World, never the renderer. Highlight Compositor
(0.1.31) — selection and hover composited independently. Spatial Focus
Navigation (0.1.31) — focusDocument/focusTarget. Multi-World Layout
Offsets (0.1.31) — addWorld applies layout offsets.

Spatial Editing Context (0.1.32) — capability flags; SpatialEditingService
is the sole mutation authority; Domain -> Event -> Renderer, never the
reverse. Spatial Placement & Stacking (0.1.33) — the complete loop
Select → Position → Preview → Place → Domain Mutation → Event →
Renderer, reusing PlaceBrickCommand. Brick Dimensions (0.1.33) —
width/height/depth metadata. Coordinate Space Discipline (0.1.33) —
screen → ray/hit → world → domain-local. BRICK_UPDATED (0.1.32).

Transform Gesture Architecture (0.1.38 foundation, 0.1.46 pointer
surface, consolidated through 0.1.49)

The invariants this architecture protects:

- One command per operation. Pointer moves never create commands; only
  commit produces history. No-op gestures, no-op alignments, and
  already-at-target numeric input commit nothing — the transformsEqual
  discipline, unchanged since 0.1.38.
- One math source. Keyboard, gizmo, alignment, distribution, numeric,
  and the committed command all resolve to TransformMath.
- The gizmo never knows about groups. A group selection is flattened to
  member bricks before the gizmo sees it; transforms change only brick
  transforms; membership is untouched; one undo restores every member.
  Alignment, distribution, and numeric inherit the same invisibility.
- Pivot semantics are the 0.1.44 semantics: single brick → own center;
  multi-selection (manual or group-resolved) → union-bounds center.
- Session state stays out of history. TransformGizmoState, hover/active
  handle state, gesture feedback, and (0.1.50) action feedback and
  palette state never enter CommandHistory and never serialize.
- An active editing gesture temporarily owns the pointer. Generalized
  in 0.1.50 to the full Escape priority chain: input > palette >
  gesture > marquee > selection.
- Parity is structural. Same operation in either view → byte-identical
  committed transforms; since 0.1.50, identical action definitions too.

Transform Precision & Snapping (0.1.47)

Snapping lives INSIDE the gesture transaction so keyboard and pointer
are byte-identical by construction. Snap the gesture DELTA, never
absolute positions, always from the gesture origin; once per frame.
Precision mode (Shift) scales increments down per frame — interpretation,
not document state. Numeric input and alignment/distribution bypass
snapping (explicit intent / exact geometry); keyboard and gizmo snap.

Alignment & Distribution (0.1.48)

Transform-generation algorithms, not new command types. Selection
resolves to brick transforms; selection bounds provide the reference;
calculated absolute transforms go through TransformSelectionCommand.
Nine world-axis alignment operations; center distribution with
deterministic ordering and pinned endpoints; no group visibility;
no-ops create zero history.

Numeric Transform Input (0.1.49)

An input surface, not a transform system. Parses exact intent
(TransformInput), translates to the gesture-shaped transform, commits
through the existing transaction with snapping disabled. Absolute
translation targets the selection pivot (same delta to every member);
absolute rotation targets the primary brick's orientation. One Apply =
at most one TransformSelectionCommand.

Editing UX Consolidation & Command Surface (0.1.50)

The consolidation milestone: discoverability and consistency for the
accumulated kernel, sitting entirely ABOVE it.

    Command Palette / Sidebar / Shortcuts
                     │
                     ▼
            EditorActionRegistry   (actions — not commands)
                     │
                     ▼
              Existing Sessions
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
    Selection     Transform     Groups/Clipboard
       │             │             │
       └─────────────┼─────────────┘
                     ▼
             Existing Commands
                     │
                     ▼
               CommandHistory

The key properties:

- One registry, two surfaces. Both views construct
  createStandardActions() with their own session bound in; ids, labels,
  shortcuts, and availability rules are shared by construction. No
  second shortcut table, no Editor-only behavior.
- Actions are not commands. The action layer never touches
  CommandHistory or World; it invokes sessions. Some actions produce
  commands; most don't. This protects the architecture from the common
  future failure mode of a "UI command history".
- One shortcut source of truth. Keyboard dispatch, palette, sidebar,
  and docs/user/ControlsReference.md all read the same metadata —
  documentation drift is structurally impossible as long as the docs
  are regenerated from the registry.
- Explicit Escape routing. InputRouter.resolveEscapeTarget encodes the
  priority chain; views implement the consequences. No scattered
  if (Escape) handlers.
- Feedback with reasons. Disabled actions explain why ("Select at least
  2 bricks", "Select at least 3 bricks", "Clipboard is empty", "Select
  a group"); empty states describe what the surface is for; transient
  ActionFeedback reports what just happened in a consistent vocabulary.
- Graceful degradation. Where a surface predates a capability (group or
  clipboard API absent), the action shows friendly feedback instead of
  throwing — the palette is inert, never broken.
- Accessibility minimums. Visible focus, logical Tab order, Enter
  activates, Escape closes transient UI, disabled actions expose
  aria-disabled, the palette manages focus on open, numeric fields are
  fully keyboard-operable, and no operation depends exclusively on
  pointer hover.

Untouched by 0.1.50, by design: TransformSelectionCommand,
CommandHistory, TransformMath/Snap/Alignment/Input, SelectionState,
SpatialSelectionState, group commands, replay, restore, and the
protocol. Those layers are mature; the milestone proved the kernel can
be wrapped without being changed.

View Modes

Repository View (technical exploration), Author View (social
exploration), World View (spatial exploration — and, since 0.1.46, a
full editing surface with identical gizmo/transform semantics, since
0.1.48 alignment/distribution, since 0.1.49 numeric input, since 0.1.50
the consolidated command surface). All three consume the same
DiscoveryProvider and Publication abstraction.

Domain State vs Editor State

Domain State — World, Building, Brick, Document/DocumentMetadata (core/).
Publishable, serializable, shared, forkable. Editor State — everything
in EditorContext plus DocumentState: purely local, never serialized.
Spatial State — SpatialCameraState/SelectionState/HoverState/
InspectionState/EditingContext/PlacementState, TransformGizmoState,
gesture feedback: runtime-only, never protocol. As of 0.1.50, action
availability (EditorActionContext), palette state, and action feedback
join this side of the line — they describe the current session, never
the construction.

Spatial Selection Invariant

A SpatialSelectionState may reference only a currently loaded document;
unloading clears the selection first. Enforced by
WorldNavigationSession._unloadWorld().

Publication vs Document vs Location

Publication — the publishing fact (metadata only). Document/World — the
creation itself. WorldLayout/WorldPosition — where it exists. No
abstraction leaks into another.

Dependency direction

ui -> application -> core
application -> renderer
application -> storage / publisher / identity / serializer / discovery / world-layout
renderer -> core (reads domain events and data; never the reverse)
core never depends on anything above it.

application -> renderer includes construction AND injection (0.1.46):
use cases build renderer subsystems and hand them collaborators —
including TransformMath into TransformGizmoController — so renderer/
never imports application/ even when it needs application-owned logic.

Naming convention

| Purpose                           | Suffix    |
|------------------------------------|-----------|
| Persistent domain object          | *(none)* — World, Brick, Building |
| Mutable editor state               | State     |
| Spatial observation state          | State     |
| Long-lived shared state container | Context   |
| Lookup/index                       | Registry  |
| Adapter to external systems        | Provider  |
| Pure application workflow          | UseCase   |
| Renderer subsystem                 | Renderer  |
| Short-lived event payload          | Event     |
| Engine capability                  | Service   |
| Executable action (undoable later)| Command   |
| User-facing operation (0.1.50)     | Action (registry entry, not a class suffix) |

Refined as of 0.1.12 (Service), 0.1.46 (Controller for interaction
drivers), and 0.1.50: an "action" is deliberately NOT a Command — see
Principles. EditorActionRegistry entries are plain data + closures, not
a class hierarchy, because they carry no lifecycle and must never grow
one.

Recognized, not implemented (future direction, not a commitment):

Workspace — deliberately above DocumentManager, not a replacement.

EditingGesture family — MarqueeGesture and TransformGizmoGesture share
one lifecycle shape; alignment/distribution deliberately did not join
it (not gestures). A common abstraction waits for a third true gesture.

Command palette extensions — fuzzy search, recently-used ordering,
per-surface filtering, nested command arguments. Substring matching is
deliberately all 0.1.50 ships.

Full accessibility framework — 0.1.50 established the minimums; ARIA
live regions for gesture feedback, screen-reader announcements for
selection changes, and focus-trap hardening are future passes.

Smart guides, magnetic snapping, edge-to-edge distribution,
collision-aware distribution, camera-relative alignment, expression
languages, unit conversion — all deferred; each would introduce a new
interaction/presentation subsystem or mini-language immediately after
the kernel was proven.

Scale semantics — no settled domain model yet; every transform surface
stays Translate + Rotate until there is one.

Numeric direct entry enhancements — live property display of the current
selection, typed-in deltas with units — wait for real usage evidence.

Nested groups — optional, deliberately off the roadmap through 0.1.52;
the flat-group model has proven sufficient for every operation built so
far. If nesting is ever needed, it becomes its own architectural
milestone.

Next: 0.1.51 Stability / Performance / Large-Document Hardening, then
0.1.52 Protocol & Persistence Hardening, then 0.2 Publishing &
Multiplayer. The editing kernel is complete and consolidated; the
architecture has earned the hardening pass.

Durable Documents & Publishing Boundary (0.2.0)

The 0.2.0 milestone establishes the document as a durable, portable
artifact that can safely cross the boundary from editor to outside world.

Key components:
- core/documentSchema.js — DOCUMENT_SCHEMA_VERSION constant
- serializer/DocumentValidator.js — pure structural validation
- serializer/DocumentSchemaMigrator.js — migration infrastructure
- serializer/contentHash.js — deterministic content hash
- publisher/PublishedSnapshot semantics — immutable, validated, versioned

The serialization pipeline:
    Document → toJSON() → schemaVersion + world + metadata
    → DocumentSerializer.serialize()
    → JSON string (canonical, deterministic)

The deserialization pipeline:
    JSON string → parse
    → DocumentSchemaMigrator.migrate() (bring to current schema)
    → DocumentValidator.validate() (structural check)
    → DocumentSerializer.deserialize() → Document.fromJSON()

The publishing pipeline:
    Document → serialize → migrate → validate → hash
    → store at snapshot:{snapshotId} (immutable)
    → create Publication record with snapshotId, contentHash, schemaVersion

Mutation isolation: published snapshots live at their own storage key,
separate from the editable document. Editing and saving the source
document cannot overwrite a published snapshot.

Canonical serialization: serialize → deserialize → serialize produces
byte-identical JSON. Property ordering is insertion-ordered (ES2015
guarantee); array ordering follows Map insertion order.

Editing Capability Parity (0.2.1)

The 0.2.1 milestone establishes that both editing surfaces are clients
of the same editing capabilities. The difference between Editor View
and World View is presentation and navigation emphasis, not different
meanings of operations.

The capability matrix (see docs/CapabilityMatrix.md) is the normative
reference. Every mutable document operation supported by Editor View is
available through the same action/command pathway in World View, subject
only to explicitly documented presentation or navigation constraints.

The action registry (0.1.50) is the authoritative capability vocabulary.
Both views construct createStandardActions() with their own session
bound in. If an operation is missing from a session, the action degrades
to friendly feedback — it never silently disappears.

The parity test (tests/EditingParity.test.js) verifies:
- Both sessions expose the same set of editing methods
- The action registry produces identical action IDs for equivalent contexts
- EditorActionContext.capture() works identically on both surfaces
- The capability matrix is internally consistent
- Surface-specific methods are documented and separated

This is the foundation for collaboration: when multiplayer arrives,
both surfaces will synchronize document mutations through the same
command layer, not through surface-specific behavior.

Schema Versioning & Migration (0.2.2)

The document envelope carries an explicit `schemaVersion` field at the
top level, distinct from `metadata.protocolVersion` (the domain model
version) and `metadata.engineVersion` (the engine version).

The deserialization pipeline is:
    1. Migrate (DocumentSchemaMigrator) — bring the envelope to the
       current schema BEFORE anything domain-shaped sees it.
    2. Validate (DocumentValidator) — pure structural check, no UI,
       no renderer, no session.
    3. Construct (Document.fromJSON) — enter the domain.

Migration is idempotent, never mutates the input, and walks a chain
of registered pure functions from the document's declared version to
DOCUMENT_SCHEMA_VERSION. Adding a future schema 2 means writing one
migration function and registering it.

DocumentValidator is pure: no Vue, no Three.js, no session, no browser
APIs. Given only a plain object, it answers "is this structurally a
valid ForkBuild document?" This makes validation usable from file
import, server receipt, published-world loading, and test suites
identically.

Historical fixtures in tests/fixtures/historicalDocuments.js represent
documents as they were serialized at various points in the project's
history: pre-groups (0.1.19), with-groups (0.1.43), and current (0.2.x).
Each fixture exercises a different migration path.

Publish / Unpublish Lifecycle (0.2.3)

Publishing creates an immutable snapshot of the document at a point in
time. The snapshot is stored at `snapshot:{publicationId}`, separate
from the editable document at `{documentId}`. This is the
mutation-isolation guarantee: editing and saving the source document
cannot overwrite a published snapshot.

The Publication record carries identity and integrity metadata (id,
documentId, contentHash, schemaVersion, publishedAt, author). It is
pure data — no editing capability, no commands, no document mutation.

Unpublishing removes the publication record and its snapshot. The
editable document is never touched.

The publish pipeline: serialize → migrate → validate → hash → store
immutably. The load pipeline: load → migrate → validate → deserialize.
Both use the same DocumentSerializer infrastructure, ensuring published
snapshots are always valid and can be loaded after schema evolution.

Storage model:
  - `{documentId}` — editable document (managed by SaveDocumentUseCase)
  - `snapshot:{publicationId}` — immutable published snapshot
  - `forkbuild-publications` — array of Publication metadata records

Read-only Published World (0.2.4)

A Published World is a runtime projection of a Publication, not a new
domain entity. The domain model (Document, World, Brick) remains
untouched; read-only-ness is enforced by the session's shape and an
explicit capability boundary.

PublishedWorldSession wraps a deserialized Document and its Publication
record. It exposes selection and inspection methods (selectBrick,
clearSelection, getSelectionCount) but deliberately omits every editing,
history, and persistence method (moveSelection, deleteSelection, undo,
saveDocument).

The session exposes a frozen `capabilities` object (e.g. canEdit: false).
EditorActionContext.capture() reads this object, and the
EditorActionRegistry's `editingAllowed` rule checks it. If canEdit is
false, all mutation actions are formally disabled in the UI and palette.

LoadPublishedWorldSessionUseCase verifies the contentHash against the
stored snapshot bytes before deserialization. If the hash mismatches
(corruption or tampering), the load is rejected outright. A
PublishedWorldSession can only be created from an intact snapshot.

World Placement & Spatial Discovery (0.2.5)

The 0.2.5 milestone establishes the spatial layer as a strictly
separated concern from the document and publication models.

Three concepts, one new persistent domain entity:
- Document = WHAT the world contains (local coordinates)
- Publication = WHICH immutable version was released (content hash)
- Placement = WHERE that version exists (global coordinates)

WorldPlacement is a lightweight spatial reference to a Publication.
It holds a publicationId, global position/rotation/scale, and local
SpatialBounds. It does not own the world content. Multiple placements
can reference the same publication.

Coordinates never enter Document, World, or Publication. Moving a
world is a placement operation, not a document mutation, and never
requires republishing. Local brick coordinates remain untouched.

SpatialIndexProvider is the infrastructure abstraction. The V0.1
implementation (LocalSpatialIndexProvider) uses StorageProvider with
a placement:{id} key namespace. Discovery performs sphere-AABB
intersection testing against global bounds, not merely origin-distance
checks.

Integration: LocalWorldLayoutProvider delegates to SpatialIndexProvider.
WorldNavigationSession continues to call findVisibleDocuments() and
getPosition() unchanged, but the answers now come from explicit
placements rather than a deterministic grid.

Persistence, Recovery & Autosave (0.2.6)

State is separated into three layers with different persistence semantics:

    Durable State    -> Documents, Publications, Snapshots, Placements
    Recovery State   -> Autosave checkpoints, recovery metadata
    Runtime State    -> Selection, camera, hover, UI panels (not persisted)

Save, autosave, and publish are three distinct operations:

    Save      -> canonical document key + manifest revision, clears checkpoint
    Autosave  -> recovery:{documentId} checkpoint only; does not clean or publish
    Publish   -> immutable snapshot:{publicationId}; unrelated to both

Revision is a monotonic counter computed statelessly as
max(savedRevision, recoveryRevision) + 1. It is persistence metadata —
never part of Document.toJSON(), never part of a Publication — and is
strictly separate from schemaVersion, protocolVersion, and publicationId.

Recovery pipeline (never bypasses validation):
    checkpoint -> verify contentHash -> DocumentSerializer.deserialize
               -> migrate -> validate -> Document

CommandHistory is NOT persisted in 0.2.6; after recovery the undo history
starts empty. The durable truth is the Document, not the command log.

AutosaveScheduler is application-level (depends on DocumentManager +
AutosaveDocumentUseCase) and framework-agnostic; persistence/ must not
import application/.


### `docs/Architecture.md` — add section

```markdown
Collaboration Protocol Foundation (0.2.7)

The 0.2.7 milestone establishes the protocol for multiple clients
manipulating the same durable document, without implementing actual
network synchronization.

Key components:
- core/CollaborationEnvelope.js — pure data protocol envelope
- collaboration/CollaborationTransport.js — adapter base class
- collaboration/LocalCollaborationTransport.js — in-memory broadcast
- collaboration/CollaborationSession.js — local participant
- application/CreateCollaborationUseCase.js — DI wiring

The collaboration layer sits BESIDE CommandHistory, not inside it.
CollaborationSession observes COMMAND_EXECUTED events and broadcasts
them as envelopes. Remote operations are deserialized via
CommandRegistry and executed through the SAME CommandHistory.

Echo prevention is enforced at two levels:
1. Transport level: the sender never receives its own envelope.
2. Session level: the _isApplyingRemote flag suppresses re-broadcast
   when applying a remote command.

Idempotency: each operation carries a unique operationId. Duplicate
operationIds are safely ignored via a seen-set.

Undo/redo are deliberately NOT propagated in 0.2.7. They are
local-only operations. Propagating undo requires inverse-command
design, which is 0.2.8 territory.

The CollaborationTransport adapter follows the same pattern as
StorageProvider / DiscoveryProvider / PublisherProvider: a base class
with a concrete local implementation, swappable for WebSocket/WebRTC
in 0.2.8.

Fork / Edit Published World (0.2.8)

The 0.2.8 milestone establishes the complete content lifecycle:
create → save → publish → place → inspect → fork → edit → save →
publish → coexist.

Key components:
- application/ForkPublishedWorldUseCase.js — forks a Publication
  snapshot into a new editable Document
- application/CreateWorldViewUseCase.js — wires the fork use case

The three operations on a Publication:
- Inspect: Publication → PublishedWorldSession (read-only)
- Fork: Publication → Document (new editable, independent)
- Place: Publication → WorldPlacement (spatial reference)

Critical invariants:
- A Publication is never mutated.
- A PublishedWorldSession never gains editing capabilities.
- Forking creates fresh identities (documentId, buildingIds, brickIds).
- Editing the fork never touches the source snapshot.
- Saving the fork writes to its own storage key.
- Publishing the fork creates a new Publication.
- Forking does NOT auto-create a WorldPlacement.
- The source placement remains unchanged.
- The editing kernel is completely untouched.

No new domain entity called "Fork" exists. A fork is an application
operation that produces a new Document. The existing Document,
Publication, and WorldPlacement concepts remain sufficient.

Multi-client Synchronization (0.2.9)

The 0.2.9 milestone solves the central collaboration problem: what
happens when Alice and Bob both edit revision 10 concurrently?

The answer: a DocumentAuthority that orders operations globally,
detects conflicts against the current authoritative state, applies
non-conflicting operations, and rejects conflicting ones.

Key components:
- collaboration/DocumentAuthority.js — central ordering service
- collaboration/AuthorityCollaborationTransport.js — transport routing
  through the authority
- application/CreateCollaborationUseCase.js — updated with
  executeAuthority() for authority mode

Conflict detection is the heart of the milestone. Most ForkBuild
operations are naturally non-conflicting because they reference
specific brick/group IDs. Two operations on DIFFERENT entities can
always be applied in any order. Conflicts arise only when:
- A position is already occupied (PlaceBrickCommand)
- A referenced brick no longer exists (Move/Rotate/Delete)
- A referenced group no longer exists (group commands)
- A composite contains any conflicting child

This is NOT full Operational Transform. OT would transform command A
against command B so both can be applied. Here, we reject conflicting
operations. The client can then re-apply its edit against the updated
state. This is correct, simple, and sufficient for the common cases.

The CollaborationSession from 0.2.7 is completely unchanged. The
authority is a transport-level concern, transparent to the session.

Decentralized Placement Registry (0.2.10)

The 0.2.10 milestone establishes that placement is a separate,
publishable spatial record with its own identity, ownership, revision
history, and integrity — independent of the Publication it references.

Key components:
- core/PlacementRecord.js — publishable spatial record
- placement/PlacementRegistry.js — adapter interface
- placement/LocalPlacementRegistry.js — V0.1 concrete implementation
- application/DiscoverPlacementsUseCase.js — richer discovery queries
- application/CreatePlacementRegistryUseCase.js — DI wiring

The three ownership layers:
- Document author — who created the content
- Publication author — who published it
- Placement owner — who placed it in the virtual world

These three can be different people. Moving a placement changes the
PlacementRecord, not the Publication, not the Document.

The LocalPlacementRegistry writes to BOTH the registry AND the spatial
index, so the existing DiscoverWorldsUseCase continues to work unchanged.

The coordinate system is virtual, not geographic. Tokyo, London, and
New York are labels for virtual positions, not latitude/longitude.
A user's physical location does not determine a publication's location.

Spatial Discovery & Content Resolution (0.2.11)

The 0.2.11 milestone formalizes the placement-first discovery pipeline:
the World View discovers spatial records first, determines which
publications are relevant to the current viewport, and only then loads
the corresponding snapshots.

Key components:
- discovery/SpatialDiscoveryProvider.js — "Where are things?" adapter
- discovery/LocalSpatialDiscoveryProvider.js — V0.1 concrete
- discovery/ContentResolver.js — "Where/how do I retrieve content?" adapter
- discovery/LocalContentResolver.js — V0.1 concrete
- application/DiscoverWorldAreaUseCase.js — spatial discovery orchestration
- application/ResolvePublicationUseCase.js — content resolution
- application/CreateSpatialDiscoveryUseCase.js — DI wiring

The four adapter boundaries:
- SpatialDiscoveryProvider — "Where are things?"
- PlacementRegistry — "What placement records exist?"
- ContentResolver — "Where/how do I retrieve this publication?"
- Snapshot loader — "How do I turn content into a safe session?"

Progressive loading: DiscoverWorldAreaUseCase.executeWithDistanceTiers()
splits placements into "nearby" (load snapshot) and "distant" (metadata
only), giving the World View the foundation for streaming an eventually
enormous virtual world without downloading the entire universe.

The pipeline:
  SpatialDiscoveryProvider → PlacementRecord[] → publicationIds
  → ContentResolver → Snapshot JSON → DocumentSerializer
  → PublishedWorldSession

Existing interfaces (WorldPlacement, SpatialIndexProvider,
PlacementRegistry, DiscoverWorldsUseCase) are unchanged.

World View Streaming & Runtime Integration (0.2.12)

The 0.2.12 milestone bridges the spatial discovery pipeline with the
live World View runtime. The WorldViewStreamingSession acts as a
runtime coordinator, translating camera movement into spatial discovery,
deduplication, content resolution, and placement lifecycle management.

Key components:
- world/WorldLoadState.js — lifecycle state machine (DISCOVERED, LOADED, FAILED, etc.)
- world/LoadedWorld.js — ephemeral runtime state for a placement instance
- world/PublicationContentCache.js — prevents redundant snapshot I/O
- world/WorldViewStreamingSession.js — the runtime coordinator
- application/CreateWorldViewStreamingUseCase.js — DI wiring

Hysteresis: The session uses separate loadRadius and unloadRadius
thresholds. Worlds crossing out of the load radius drop their heavy
session to save memory (becoming metadata-only), but remain tracked
until they cross the larger unload radius, preventing boundary flickering.

Content Deduplication: Because a single Publication can have multiple
PlacementRecord instances in the virtual world, the PublicationContentCache
ensures that network/storage I/O and content verification happen exactly
once per unique publication, regardless of how many placements reference it.

Graceful Failure: A failed snapshot resolution marks the placement
FAILED without crashing the entire streaming session.

Publication Licensing & Fork Policy (0.2.13)

The 0.2.13 milestone establishes licensing as a first-class, cryptographically
bound property of the publication model. It draws a hard architectural line
between technical capability (can the bytes be copied?) and application
enforcement (does the ForkBuild protocol permit this derivation?).

Key components:
- core/License.js — Standardized license identifiers and permission matrices
- DocumentMetadata.license — Carries attribution and license terms
- Publication.license — Immutable, hashed record of the release terms
- ForkDocumentUseCase — Hard enforcement of forkAllowed permissions

The Enforcement Invariant: Use cases evaluate the source publication's
license before cloning. If forkAllowed is false (e.g., CC-BY-ND-4.0 or
ALL-RIGHTS-RESERVED), the use case throws an error. Hiding the "Fork"
button in the UI is insufficient; the application layer formally rejects
the operation.

Attribution travels with the publication metadata. When a permitted fork
occurs, the derivative License object is stamped with the original author,
title, and source publication ID. This becomes part of the new publication's
immutable, hashed metadata, preventing silent stripping of required attribution.

Decentralized Content Backend (0.2.14)

The 0.2.14 milestone separates content identity from storage location. The
Publication no longer contains the snapshot bytes; it contains a verifiable
reference to immutable content (ContentReference).

Three independent decentralized information systems emerge:
1. Publications (Registry) — "What exists?"
2. Placements (Spatial Index) — "Where is it?"
3. Content (ContentStore) — "What are the bytes?"

The application remains unaware of the actual storage backend. The
ContentStore abstraction allows seamless migration from LocalContentStore
to IPFSContentStore or ArweaveContentStore without altering the publication
pipeline. Trust is anchored to the content hash: resolvers retrieve by
location but verify by content identity.

<!-- === FILE: ./docs/Architecture.md === (append after the 0.2.14 section) -->

### Decentralized Spatial Discovery (0.2.15)

The 0.2.15 milestone brings the decentralized implementation behind
the SpatialDiscoveryProvider interface established in 0.2.11, and
draws the most important line of the milestone:

> **PlacementRecord is authoritative spatial truth; the spatial index
> is a discoverability accelerator.**

Like a database index, a spatial index may be stale, partial, or
replicated. An index entry pointing at an outdated revision is not
corruption — the client resolves the referenced record, compares
revisions, and the newer revision wins. Missing or tampered cell
manifests are isolated and counted; only a tampered index ROOT is a
hard failure.

Key components:

- core/SpatialCell.js — deterministic uniform 3D grid partitioning of
  virtual space (floor division, negative-safe, no geography).
- core/SpatialIndexManifest.js — immutable per-cell manifest:
  placement references { placementId, revision, recordReference }.
  No timestamps: a pure function of its placements, so rebuilds are
  byte-identical.
- core/SpatialIndexRoot.js — immutable directory mapping cell keys to
  manifest references.
- spatial/SpatialIndexStore.js — content-addressed adapter for
  immutable index content plus the single mutable root pointer.
- spatial/LocalSpatialIndexStore.js — V0.1 concrete implementation.
- spatial/SpatialIndexBuilder.js — PlacementRecords -> immutable
  revision records + cell manifests + root. Deterministic and
  idempotent.
- spatial/DecentralizedSpatialDiscoveryProvider.js — viewport ->
  cells -> manifests -> record resolution -> spatial filter. Never
  loads publication content.
- application/RebuildSpatialIndexUseCase.js — full rebuild from the
  authoritative PlacementRegistry.
- application/CreateDecentralizedSpatialDiscoveryUseCase.js — DI
  wiring, counterpart of CreateSpatialDiscoveryUseCase.

Immutable revisions, mutable pointers:

    placement-123 / revision-1    immutable content
    placement-123 / revision-2    immutable content
    registry latest pointer       -> revision-2
    index root pointer            -> current SpatialIndexRoot

Two index maintenance shapes:

- Full rebuild — deterministic snapshot of the registry's current
  records; idempotent (same records -> identical content hashes).
- Incremental revision publishing — SpatialIndexBuilder
  .addOrUpdatePlacement(), wired into MoveWorldPlacementUseCase
  (optional third argument): the new immutable revision is stored and
  only the affected cells' manifests advance. Cells of the old
  position keep the old revision reference until a rebuild — the
  intended eventual-consistency story, resolved away at discovery
  time by the newer-revision-wins rule plus the spatial filter.

Query pipeline:

    camera/viewport -> intersecting SpatialCells -> cell manifests
    (only the ones the root actually has) -> placement references
    -> PlacementRecord resolution -> sphere filter -> PlacementRecord[]
    -> ContentResolver (unchanged from 0.2.11)

Existing interfaces are untouched: SpatialDiscoveryProvider,
DiscoverWorldAreaUseCase, ResolvePublicationUseCase, and
WorldViewStreamingSession consume the decentralized provider without
modification. LocalSpatialDiscoveryProvider remains the local
implementation.

Deliberately not in 0.2.15: cryptographic ownership proofs (0.2.16),
consensus between competing indexes, peer-to-peer replication,
geographic coordinates, publication content retrieval, renderer or
editing-kernel changes.

<!-- === FILE: ./docs/Architecture.md === (append after the 0.2.15 section) -->

### Decentralized Identity & Signatures (0.2.16)

The four decentralized planes (publications, placements, spatial
index, content) can now each answer the question they previously
could not: **who authorized this object?**

> **Hashes establish what an object is. Signatures establish who
> authorized it.**

| Mechanism      | Question                                        |
| -------------- | ----------------------------------------------- |
| Content hash   | "What exactly is this?"                         |
| Revision       | "Which version is this?"                        |
| Signature      | "Who authorized it?"                            |
| Identity       | "Which public key represents that authority?"   |

The trust invariant:

    Hash valid + Signature valid + Signer authorized = Trusted object
    Hash valid + Signature invalid                   = Untrusted
    Hash valid + Signature valid + wrong signer      = Untrusted

Key components:

- identity/Ed25519.js — self-contained Ed25519 + SHA-512 (pure
  BigInt; synchronous like the rest of the engine; proven against
  FIPS 180-4 and RFC 8032 vectors before any other test runs).
- identity/SigningIdentity.js — the public-key identity
  (did:key id, algorithm, publicKey). Deliberately distinct from
  identity/Identity.js (0.1.21), the LOGIN identity: Identity is
  "which account is using the app", SigningIdentity is "which key
  authorized the object". LocalIdentityProvider links the two —
  every logged-in user gets a persisted Ed25519 keypair.
- core/Signature.js — explicit signature data (algorithm, signer,
  signature, signedHash, domain) plus the canonical signing envelope
  { domain: 'forkbuild', type, id, revision, payload }. Domain
  separation is structural: a placement-record signature can never be
  replayed as a publication signature.
- identity/AuthorizationVerifier.js / LocalAuthorizationVerifier.js —
  the three trust questions (authentic? signer known? signer
  authorized?) with deliberately simple 0.2.16 rules: publisher signs
  publications, owner signs placement revisions, builder signs index
  roots (optional pinned index authority).
- application/VerifyPublicationUseCase.js, VerifyPlacementUseCase.js,
  CreateIdentityUseCase.js.

Signed objects (no parallel Signed* entities — the signature field
lives directly on each object):

- Publication gains publisherIdentity + signature. The signed
  publication is the authoritative statement: "this identity
  authorized this exact publication metadata and content reference" —
  completing the chain Identity -> Publication -> ContentReference ->
  bytes.
- PlacementRecord gains ownerIdentity + signature. contentHash keeps
  its exact 0.2.10 definition (stored records stay verifiable); the
  signature is an attestation layered on top, covering a canonical
  envelope that INCLUDES the contentHash — binding
  identity -> revision -> exact record content. withPosition() clears
  the signature: a new revision is a new immutable object that must
  be re-signed; signatures never move between revisions.
- SpatialIndexRoot gains signature. Meaning: "this index root was
  published by the index authority" — NOT "every listed placement is
  true". The index remains an accelerator; discovery still resolves
  and verifies every underlying placement. Manifests stay
  content-hashed only.

The resolution rule evolved from "newer revision wins" to:

> **Newer VALID revision wins.**

DecentralizedSpatialDiscoveryProvider now filters candidates through
integrity + signature authorization BEFORE comparing revisions. A
forged revision 5 never displaces an authentic revision 4.

Failure isolation:

    Invalid placement signature -> record rejected + counted, others go on
    Tampered/missing manifest   -> skipped + counted, other cells go on
    Invalid root signature      -> THROW (mirrors "tampered root is fatal")

Backward compatibility: unsigned pre-0.2.16 objects are tolerated and
reported as signed: false — the deployed corpus keeps working.
Non-cryptographic identity providers keep the legacy attribution-stamp
publishing path untouched.

Deliberately not in 0.2.16: DID resolution networks, blockchain
wallets, DAO authorization, key rotation, multisig, delegated
placement rights, revocation registries, social recovery, hardware
wallets. Those are identity INFRASTRUCTURE — adapters around the
abstraction this milestone establishes. 0.2.17 answers "was that
identity ALLOWED to do this?" (delegation and authorization policy).

### Delegated Ownership & Authorization (0.2.17)

0.2.16 answers "who signed this?" with one direct rule: the resource
owner signs. 0.2.17 answers the next question — "was the signer
ALLOWED to do this, even when they are not the owner?" — by
introducing a narrowly-scoped capability, not a second ownership
model.

Key components:
- core/Delegation.js — an immutable, signed capability: issuer grants
  delegate the right to perform one `action` (`PLACE` | `MOVE`) on one
  `subject`, optionally constrained (e.g. to a spatial region) and
  optionally time-limited. Revocation is deliberately excluded.
- identity/DelegationVerifier.js — the general authorization oracle:
  given a signature and an optional delegationId, decides DIRECT
  (signer === owner) or DELEGATED (a resolvable, unexpired,
  matching-action/subject/constraint Delegation from owner to signer),
  or a named rejection reason.
- identity/LocalDelegationResolver.js, application/
  CreateDelegationUseCase.js, VerifyDelegationUseCase.js.
- PlacementRecord gains `authorizedBy` — `{ identity, delegationId }`
  — recording that a delegate, not the owner, produced this revision.

`PLACE` and `MOVE` are separate capabilities: possessing permission to
place a publication does not implicitly grant permission to move an
existing placement. Direct ownership remains the simplest path;
delegation adds authority without transferring it.

Deliberately not in 0.2.17: revocation, delegation chaining
(sub-delegation), multi-party/DAO policy consensus, and wiring
DelegationVerifier into the record-level trust check every replicated
revision passes through (identity/LocalAuthorizationVerifier.
verifyPlacement) — that verifier still checks direct ownership only.
0.2.17 establishes the delegation PRIMITIVE and proves it end-to-end
against its own authorization decisions; folding it into the
replicated-object trust path is future integration work, not a gap in
this milestone's own guarantees.

### Decentralized Replication & Conflict Handling (0.2.18)

0.2.16 and 0.2.17 answer "is this revision authentic, and was its
signer allowed to produce it?" — questions a SINGLE authoritative
copy can answer alone. 0.2.18 answers the question that only exists
once more than one node can legitimately write: **when two
independently authorized replicas each produce a revision from the
same parent, how do they converge without either replica destroying
the other's history?**

    CONTENT      -> What is it?             (0.2.10/14)
    SIGNATURE    -> Who authorized it?      (0.2.16)
    AUTHORITY    -> Was the signer allowed? (0.2.17)
    CAUSALITY    -> What did this revision know about? (0.2.18)

The architectural rule: **replication never overwrites immutable
objects. It exchanges immutable revisions and deterministically
reconciles competing valid histories.** A revision's place in that
history is now itself authorized data:

    Newer VALID revision wins                          (0.2.16)
                    |
                    v
    Causally newer VALID revision wins. Concurrent valid
    revisions coexist and are deterministically reconciled
    without destroying either history.                  (0.2.18)

Key components:
- core/CausalStamp.js — a vector clock (`{ version, clock: { did:key
  -> integer } }`). `A happens-before B` iff every component of A is
  `<=` the matching component of B and at least one is strictly
  smaller; otherwise, if neither dominates, they are CONCURRENT. No
  timestamps, no arrival order — purely which revisions an actor had
  observed when it created this one.
- core/RevisionReference.js — the immutable identity of one revision
  (`placementId`, `revision`, `contentReference`), letting replicas
  exchange "I have revision 5A" without transferring the full record.
- PlacementRecord gains `causalStamp` and `parents`. Both live INSIDE
  the signed envelope (see getSigningDescriptor) when present — a
  revision's causal position is authorized data, not metadata an
  attacker can rewrite after the fact without invalidating the
  signature. contentHash's 0.2.10 shape is untouched: causality is a
  signature-layer concern, exactly like ownerIdentity was in 0.2.16.
- replication/ConflictResolver.js — pure comparison of two
  CausalStamps: EQUAL, BEFORE, AFTER, or CONCURRENT.
- replication/ConflictPolicy.js — the deterministic tie-break for
  presentation: among concurrent-or-indistinguishable valid revisions,
  the lexicographically smallest content hash wins. No timestamps, no
  "whichever replica answered first" — every replica computes the
  identical winner from the identical inputs.
- core/ConflictSet.js — the immutable record of competing revisions
  for a placement and which one currently wins presentation. A
  conflict is not an error; it is multiple independently authorized
  histories that existed without knowledge of each other. No member is
  ever deleted.
- replication/ReplicaMergeService.js — the only place an incoming
  replicated revision can change what a replica presents. Fixed
  pipeline: integrity -> signature + authorization -> (only then) the
  revision enters the content-addressed replication store -> causal
  comparison -> dominated (retained, not presented) | dominates
  (becomes the new presented revision) | concurrent (ConflictSet,
  deterministic winner). A revision that fails integrity or
  authorization never reaches causal comparison at all — 0.2.16's
  "newer VALID revision wins" is unchanged; 0.2.18 only adds what
  happens once two revisions are BOTH valid.
- replication/ReplicationStore.js / LocalReplicationStore.js — the
  minimal transport-independent seam (`getReferences(scope)`, `get`,
  `put`, `has`) that exchanges immutable objects, namespaced by scope
  (`placement-revision` today). It never interprets or merges anything.
- application/ReplicatePlacementUseCase.js — accepts a single incoming
  revision through ReplicaMergeService.
- application/SynchronizeReplicaUseCase.js — the batch flow: advertise
  references, diff against what this replica already has, pull and
  merge exactly what's missing. Deliberately pull-only: a replica's
  registry only ever changes through ITS OWN merge pipeline, never by
  another replica writing into it directly — "remote" may be a real
  network peer that exposes nothing but those four store methods. Two
  replicas converge by each running this once against the other.
- placement/LocalPlacementRegistry.js gains `setLatest` (moves the
  presentation pointer without touching history — what lets a
  CONCURRENT merge's winner be the pre-existing `current` record
  rather than the incoming one), `getHistory`, `getConflictSet` /
  `setConflictSet`. The mutable pointer still moves; immutable history
  — including every losing revision — is retained alongside it.

Two correctness properties worth naming explicitly:

- **Equal-but-different is still a conflict.** Two revisions can have
  identical causal stamps (e.g. two edits from the SAME signer's two
  disconnected devices, each simply advancing that signer's own vector
  component from the same parent) yet different content. Causally
  that's EQUAL, not CONCURRENT — but it carries exactly as little
  ordering information, so ReplicaMergeService treats it identically:
  a ConflictSet, never a silent drop. This is also what keeps
  pre-0.2.18 (uncausaled) revisions safe: two legacy records with no
  causal stamp at all compare EQUAL and, if their content differs, get
  the same treatment.
- **A conflict set can grow past two.** A third concurrent revision of
  the same placement widens the existing ConflictSet (its members are
  read back from the registry and unioned in) rather than replacing a
  two-member conflict with a new one — no competing valid history is
  ever dropped merely because another revision arrived later.

Spatial index interaction: the index must never manufacture or resolve
a conflict itself. ReplicaMergeService optionally rebuilds the
decentralized spatial index (SpatialIndexBuilder) from the reconciled
winner after every merge that changes it — replication state is
authoritative, the index is rebuilt/updated FROM it, never the other
way around (carrying forward 0.2.15's "the spatial index is a
discoverability accelerator, not truth"). A stale index entry pointing
at a losing revision is resolved the same way a stale index has always
been resolved: DecentralizedSpatialDiscoveryProvider prefers the live
registry record on a tie, so a lagging index cache cannot resurrect a
revision the registry has already superseded.

Deliberately not in 0.2.18: blockchain consensus, CRDTs, DAO voting,
or any global consensus protocol — those solve a larger problem than
ForkBuild has today. Also not here: folding 0.2.17 delegation into the
replicated trust check (LocalAuthorizationVerifier.verifyPlacement
still checks direct ownership only — see the 0.2.17 section above),
malicious/equivocating replicas, replay attacks, and discovery
poisoning. Those are 0.2.19's question: "what happens when the network
itself is hostile?" — 0.2.18 answers "how do HONEST replicas
converge?"

### Trust & Discovery Hardening (0.2.19)

0.2.14 through 0.2.18 built a pipeline where cryptographic validity
answers every question that pipeline was designed to ask:

    content hash -> WHAT      signature  -> WHO
    authorization -> ALLOWED?  causality  -> HISTORY
    conflict resolution        -> CONVERGENCE

But a decentralized environment can attack the INFORMATION FLOW around
that pipeline without breaking Ed25519 at all: replay an old valid
object, advertise something valid-but-irrelevant, hand different
replicas different index roots, hide a valid revision, return stale
manifests, present two competing signed roots, flood discovery with
references, or replay a delegation. 0.2.19's premise:

> **Cryptographic validity is necessary, but the system must also
> reason about freshness, provenance, replay, completeness, and
> equivocation.**

None of this changes the pipeline above — 0.2.19 adds a layer AROUND
it, and changes nothing about how content hashes, signatures,
authorization, or causal comparison individually work.

Key components:

- core/TrustObservation.js — the shared vocabulary ("bad signature",
  "stale", "missing" used to be scattered strings; now a fixed
  TrustStatus enum) for what a verification step found. Purely
  descriptive — it never decides what should happen next.
- identity/TrustPolicy.js — the decision layer: is this authority
  trusted (PINNED/DISCOVERED/UNTRUSTED), is legacy unsigned content
  tolerated, is a detected equivocation rejected outright. Two
  different policies can look at the identical TrustObservation and
  decide differently. Defaults reproduce pre-0.2.19 behavior exactly
  — see "Defaults never silently harden" below.
  did:key identifies a public key; TrustPolicy decides whether that
  key is trusted. Identity is not trust.
- core/FreshnessProof.js — evidence of an observation's causal
  position, never a wall-clock timestamp (a malicious node can lie
  about a timestamp trivially; it cannot forge a signed CausalStamp
  relationship). Reuses core/CausalStamp.js's vector-clock machinery
  rather than inventing a second notion of "newer".
- core/IndexEquivocation.js + EquivocationDetector — catches an
  authority signing two DIFFERENT roots at the SAME causal sequence.
  A valid signature proves the authority signed something; it does not
  prove the authority signed only one thing. Reuses the exact
  same-causal-position-different-content pattern 0.2.18 already
  established for placement conflicts (ConflictResolver), applied here
  to roots instead of placements — one mechanism, two surfaces.
- SpatialIndexRoot gains revision, previousRootReference, and
  causalStamp — a verifiable, hash-linked, causally-ordered history
  instead of each rebuild being an unrelated signed snapshot.
  SpatialIndexBuilder chains every new root onto the previous one and
  advances the authority's own CausalStamp component, whether the
  rebuild was a full build() or an incremental
  addOrUpdatePlacement() — a full rebuild is just another revision in
  the SAME history, not a new lineage. All three fields live inside
  the signed envelope only once the root actually carries history —
  see "Backward compatibility" below.
- replication/ReplayGuard.js — answers exactly one question, "have I
  already accepted this exact immutable object?", kept strictly
  separate from "is it eligible to affect current state?" (causal
  comparison, unchanged from 0.2.18). Conflating the two is how a
  replayed-but-historically-valid object would end up masquerading as
  new information. A hit only ever skips redundant re-verification of
  bytes already proven authentic — it never changes a merge or
  discovery outcome.
- spatial/DiscoveryDiagnostics.js — the parallel diagnostic surface
  discover() was missing: cellsQueried, manifestsLoaded/Missing/
  Invalid, recordsChecked/Rejected, conflicts, staleEntries,
  equivocations, and the raw TrustObservation list. discover()'s
  return type is untouched — PlacementRecord[], exactly as it has been
  since 0.2.11 — this is an ADDITIONAL surface
  (provider.getLastDiagnostics()), not a replacement.
- DecentralizedSpatialDiscoveryProvider's root layer gains three
  checks before a single manifest is read: authenticity (unchanged
  from 0.2.16), authority trust (TrustPolicy.acceptsAuthority — a
  validly-signed root from a non-pinned signer is exactly as unusable
  as a forged one), and equivocation. Missing/tampered manifests keep
  being isolated and counted, never fatal; a root that fails any of
  its three checks IS fatal (throws) — the existing "tampered root is
  fatal" symmetry, extended, not replaced.
- core/Delegation.js gains issuedFor (the delegate's did:key, flat),
  nonce (an anti-replay/anti-duplication token distinct from the
  already-existing stable `id`), scope/scopeHash (the canonical,
  normalized capability — action + subject + optional spatial region —
  independent of incidental JSON shape, so two replicas that
  independently serialized "the same capability" can compare it by
  hash), and parentDelegationId. identity/DelegationVerifier.js
  rejects any delegation carrying a parentDelegationId with
  UNSUPPORTED_DELEGATION_CHAIN — a delegate re-delegating under
  authority they only hold via another delegation is EXPLICITLY
  refused, not silently mis-authorized as direct ownership and not
  partially/accidentally supported.

Backward compatibility — deliberately asymmetric, and intentionally
so: PlacementRecord's 0.2.18 pattern repeats exactly for
SpatialIndexRoot. The new history fields (like PlacementRecord's
causalStamp/parents) are included in the signed envelope ONLY when the
root actually carries history; a genesis root — revision 1, no
previous root, no causal stamp — signs and verifies under EXACTLY the
pre-0.2.19 shape, so every already-deployed root keeps verifying
unchanged. Delegation is the one exception: its new fields
(issuedFor/nonce/parentDelegationId) are always part of the signed
payload, a real shape change from 0.2.17. This is deliberate, not an
oversight — Delegation is not wired into any live application flow
(PlacePublicationUseCase/MoveWorldPlacementUseCase never consult it;
it is exercised only by its own test suite), so there is no deployed
signed-delegation corpus this could break, unlike PlacementRecord and
SpatialIndexRoot which real users' data already depends on.

Defaults never silently harden: TrustPolicy's bare constructor
defaults (requireSignedRoot: false, requireAuthorizedPlacements:
false, allowLegacyUnsigned: true) reproduce pre-0.2.19 behavior
exactly, and every provider/use case that does not receive an explicit
trustPolicy constructs one with those same defaults. TrustPolicy.
hardened() is the fully strict configuration this milestone's design
describes as the target — no legacy content, an authority must be
pinned, equivocation rejected outright — available to any caller ready
to opt in, but never forced on existing callers or existing data.

Deliberately not in 0.2.19: blockchain consensus, proof-of-stake, DAO
voting, economic incentives, Byzantine consensus protocols, automatic
or social key recovery, hardware wallets, a global identity discovery
network, CRDT conversion of the document model, and automatic merging
of arbitrary document content. Also not here: full delegation chaining
(0.2.19 only detects and rejects chain attempts — see
core/Delegation.js above), and delegation revocation (still deferred
from 0.2.17). This milestone hardens the trust and discovery layer
already built; it does not turn ForkBuild into a consensus system.

### Fork-on-Edit & Immutable Snapshot Lineage (0.2.20)

0.2.8 established the rule for the Editor: "A Publication is never
edited — editing a published world is an explicit fork operation."
That rule was never actually enforced inside the shared spatial World
View. WorldNavigationSession streams published worlds in and out of
one live session and — unlike the read-only PublishedWorldSession —
exposes the full editing surface (move/rotate/delete/align/distribute/
numeric transform/groups/paste/placement) directly against whatever is
loaded, with no check for whether "whatever is loaded" was a published
snapshot. A user (including the original author) could move a brick
in a streamed-in published world and hit Save, silently overwriting
the storage slot `SaveDocumentUseCase` and `LoadPublicationDocumentUseCase`
both key by `document.world.id` — the published source's own storage.

> **A published World View is immutable; a World View SESSION is
> editable.**

0.2.20 closes that gap with lazy Copy-on-Write:

    Published World (immutable)
             |
             | open / view — navigate, select, hover, inspect: no fork
             v
    World View Session
             |
             | FIRST mutation
             v
    Fork Document (new id, new owner, parentDocumentId lineage)
             |
             | continue editing — same fork, no re-fork
             v
    Publish (optional) -> new Publication, new ContentReference
             |
             v
    Original Publication — untouched, still resolves identically

Key components:

- WorldNavigationSession tracks which of its currently-loaded
  documentIds are still straight, unforked views of a published
  snapshot (`_publishedDocumentIds` — populated in `_loadWorld` only
  when a real Publication can be resolved for the id via
  `discoveryProvider.findByDocumentId`; see "Enforce only when the
  session can tell" below). `isDocumentPublished(documentId)` exposes
  this.
- `_ensureEditableSelection()` / `_ensureEditableDocumentId(documentId)`
  are the guards every mutation entry point calls first:
  moveSelection, deleteSelection, rotateSelection, alignSelection,
  distributeSelection, applyNumericTransform, commitPlacement, every
  group command, pasteClipboard, and gizmoPointerDown (armed before
  the drag reaches the renderer, so a gizmo-driven mutation crosses the
  boundary exactly like a keyboard-driven one — see "The gizmo path"
  below). A no-op when the target is already editable.
- `_forkForEdit(sourceDocumentId)` is the actual Copy-on-Write: checks
  fork policy (0.2.13 — a forbidding license throws, the mutation is
  rejected outright, never silently forked or silently dropped), forks
  via the existing DocumentCloneService (the SAME cloning mechanism
  Duplicate/explicit-Fork have used since 0.1.42/0.1.24 — no second
  clone path), registers the fork's own CommandHistory, and swaps the
  renderer's view of the source for the fork. The published source is
  unloaded from THIS session (never mutated — a fresh load of the same
  publication elsewhere is byte-for-byte unchanged) so the pending
  mutation cannot land anywhere but the fork.
- Selection/focus/hover referencing the source are remapped onto the
  fork POSITIONALLY (same building index, same brick index within it)
  rather than by id — DocumentCloneService gives every brick a fresh
  id but preserves structure and order exactly, so position is a
  stable identity across the fork boundary. A multi-brick selection
  remaps every member, not just the primary.
- `saveDocument`/`publishDocument` refuse outright (rather than
  silently persisting) if ever called against a documentId still
  tracked as published — defense in depth behind the guards above,
  for exactly the storage-slot collision described above.

The gizmo path: a gizmo drag is armed via `gizmoPointerDown`, which
receives `this._spatialSelection` and hands it to the renderer, which
drives `SpatialEditingService.beginTransformGesture/commitTransformGesture`
directly — bypassing WorldNavigationSession's own moveSelection/
rotateSelection wrappers entirely. Forking one command later (inside
SpatialEditingService, which knows nothing about publications or
forks) would be too late and too coupled; forking at
`gizmoPointerDown`, before the selection reference is ever handed to
the renderer, means every subsequent gizmo callback for that drag
already sees the fork. `SpatialEditingService` — shared with
EditorSession, whose documents are never published snapshots — stays
completely unaware that forking exists.

Enforce only when the session can tell: `isDocumentPublished` and fork
policy are both gated on actually resolving a Publication via
`discoveryProvider.findByDocumentId` — a session with no
discoveryProvider wired (many existing unit tests construct
WorldNavigationSession this way, exercising paste/group/replay
mechanics against an arbitrary loaded document, not published content)
has no way to tell a published world from any other loaded document
and does not claim to, exactly the same "enforce only when the
information is actually available" rule 0.2.13's fork-policy check
already followed. In real streaming usage this is not a loophole: a
documentId only becomes visible/loadable via `updateSpatialView` in
the first place because WorldLayoutProvider/discoveryProvider already
know it as published, and CreateWorldViewUseCase always wires a real
discoveryProvider into the live session.

Deliberately not in 0.2.20: eager forking (forking the instant a
published world is opened, before any edit — this milestone is
specifically lazy, on first mutation), a new provenance data model
(fork lineage reuses parentDocumentId, the mechanism 0.1.24/0.2.8
already established — not a second "forkOf" field), automatic
re-placement of a fork at its source's spatial coordinates (a fork
gets its own independent Placement when placed — 0.2.10's "a fork is a
different placement, even at the same coordinates" boundary, untouched
here since this milestone only reaches the Document/Publication layer,
not placement), and fixing DocumentCloneService's pre-existing
limitation that cloned Groups keep their own id but lose valid
membership (their brickIds still reference the source's pre-clone
brick ids) — a real, separate bug in the 0.1.42 cloning mechanism
every fork already inherits, not something 0.2.20 introduces or
scopes to fix.

#### Hardening follow-up: lazy in practice, not just in intent

The first pass above shipped a real gap in how `gizmoPointerDown`
decides to fork, and missed that a fork is, by construction, invisible
to two systems that had never before had to deal with a loaded
document that isn't a publication:

- **Eager forking on the gizmo path.** `gizmoPointerDown` runs on
  every pointer-down while something is selected — that's the
  pre-existing "gizmo-first" pattern (try the gizmo, fall back to a
  plain click-select on pointer-up), unrelated to 0.2.20. The first
  pass called `_ensureEditableSelection()` unconditionally before the
  renderer's own hit-test, so ANY click while a published brick was
  selected forked — including a click that only meant to select a
  *different* brick. Fixed by hit-testing first: the renderer now
  exposes a side-effect-free `gizmoHitTest(x, y)` (backed by
  `TransformGizmoController.hitTest`, the same `_pickHandle` the real
  `onPointerDown` already used, just without arming a drag), and
  `gizmoPointerDown` only forks when that hit-test actually finds a
  handle under the pointer. A click anywhere else returns `false`,
  same as it always did before there was anything to fork.
- **Position drift after forking.** A fork is never itself
  discoverable (it hasn't been published), so
  `WorldLayoutProvider.getPosition(forkId)` has nothing to resolve and
  falls back to its "unknown document" default — fine for `addWorld`
  at fork time (called with the SOURCE's position, computed before the
  swap), but wrong for every position lookup afterward:
  `_refreshGizmo()`'s pivot/bounds, placement-preview offsets,
  `focusDocument`, `getDocumentPosition`. The gizmo in particular would
  silently detach from the bricks it was supposed to control — visibly
  "selected but ungrabbable." Fixed with `_localPositions`, a session-
  local map from documentId to the position it inherited at fork time;
  `_getWorldPosition(documentId)` checks this before falling through
  to the layout provider, and every lookup above now goes through it.
- **Streaming silently drops a saved fork.** `updateSpatialView`'s
  unload pass only pins documents that are *dirty*. A fork starts
  dirty (`history.markUnsaved()` at fork time) but `saveDocument`
  clears that — and a fork can never re-enter `findVisibleDocuments`'s
  results on its own, so the very next camera-driven streaming pass
  would unload it: bricks torn down, CommandHistory discarded, with no
  way to stream it back in. Fixed with `_localOnlyDocumentIds`, set
  alongside `_localPositions` at fork time; `updateSpatialView`'s
  unload filter now also excludes anything in that set, independent of
  dirty state.
- **Stale renderer selection/gizmo after the swap.**
  `_remapReferencesAfterFork` updated `_spatialSelection` but never
  told the renderer: `selectBricks` was never re-called with the
  fork's (fresh) brick ids, and `_refreshGizmo()` was never re-run.
  Both are now called at the end of `_remapReferencesAfterFork`.
- **Denials reaching the UI as raw exceptions.** A fork-policy denial
  (or any guard rejection) is meant to be rejected outright — see
  above — but "rejected outright" was implemented as a thrown `Error`
  with nothing downstream to catch it, so it surfaced as an uncaught
  exception in whatever pointer/keyboard handler triggered it, with no
  on-screen explanation. `EditorActionRegistry`'s `surfaceCall` — the
  single choke point every registry-driven mutating action already
  goes through — now catches and routes the message to the existing
  `ActionFeedback` toast; the World View's own direct call sites
  (`gizmoPointerDown`, `commitPlacement`, align/distribute/numeric
  transform, which predate the registry and call the session directly)
  go through an equivalent local `guarded()` wrapper. This is the same
  contract 0.1.50 already documented for a *missing* capability
  ("the action degrades to transient feedback instead of throwing"),
  extended to a *refused* one. Proactively, `getEditabilityNotice
  (documentId)` lets the World View explain a published snapshot
  BEFORE an edit is attempted — "your first edit forks it" for a
  forkable one, the specific license and why for a blocked one —
  rendered next to the inspection panel.

### Document Lifecycle & Metadata UI (0.2.21)

0.2.20 made fork-on-edit *enforceable* — a published snapshot cannot
be mutated, a fork-forbidding license rejects the edit outright. It
did not give the user any way to see or change the metadata that
enforcement depends on: title, description, and — decisively —
license. A document sitting at "Untitled ForkBuild World" with
`license: UNSPECIFIED` (the constructor defaults) is not a bug; it is
correct behavior with no UI for the user to notice or fix it. 0.2.21
is the UI layer that closes that gap: Document Properties editing,
a Document Info panel, and lifecycle status made visible, built
entirely on top of 0.2.20's enforcement — it puts a face on the
existing security semantics rather than changing them.

    Create Document
          |
          v
    Draft / Local Document        <- DocumentLifecycleStatus.DRAFT
          |
          | Save
          v
    Persisted Document             <- SAVED
          |
          | Publish (validates title + non-empty world)
          v
    Immutable Publication          <- PUBLISHED

"Forked" is deliberately not a fourth tier in that diagram — a fork is
an ordinary Draft or Saved document that happens to carry a
`parentDocumentId`. Status and lineage are shown side by side in the
Document Info panel, not blended into one field.

Core additions:

- `core/DocumentMetadata.js` gains `description` (defaults to `''`,
  never `null` — see docs/Principles.md, "A default value is not an
  absent one") alongside the existing `title`/`license`, plus direct
  `title`/`description` setters (license already had one) and a single
  `touch()` that stamps `modified` — callers apply a batch of field
  changes, then call `touch()` once, rather than every setter stamping
  a timestamp itself. `toJSON`/`fromJSON` carry the new field with a
  tolerant default (`json.description || ''`) for pre-0.2.21 documents
  — no `DOCUMENT_SCHEMA_VERSION`/`PROTOCOL_VERSION` bump, the same
  backward-compatible pattern `license` and `parentDocumentId` were
  added under.
- `application/DocumentLifecycleStatus.js` — `computeLifecycleStatus`
  and `describeLifecycleStatus`, the one place status is computed
  (from facts that already exist: has this been saved, is a
  Publication known for it) rather than a fourth piece of state to
  keep in sync. Shared by the Editor's and World View's Document Info
  panels.
- `application/LicenseLabels.js` — human-readable labels for every
  `LicenseId` (`describeLicense`) and the ordered option list the
  license selector renders (`LICENSE_OPTIONS`), so the read view and
  the edit form can never show a different label for the same license.
- `application/UpdateDocumentMetadataUseCase.js` — the Editor's entry
  point: applies whichever of title/description/license the caller
  passed to `documentManager.document.metadata`, calls `touch()`,
  marks the document dirty. Thin by design — DocumentMetadata's
  setters do the actual mutation.
- `WorldNavigationSession.updateDocumentMetadata(documentId, {...})` —
  the World View's equivalent, and the one place metadata editing had
  to be more than "call the setters": it routes through
  `_ensureEditableDocumentId` first, the SAME fork-on-first-mutation
  gate every other guarded method uses (docs/Principles.md, "A
  published snapshot is never mutated in place"). Editing a published
  snapshot's title is a mutation exactly like moving a brick — it must
  fork, it must respect fork policy, and it must reject outright (not
  silently fork or silently drop the edit) when the license forbids
  it. Returns the documentId the edit actually landed on, so the UI
  can re-select/re-focus the fork it didn't ask for by name.
- `WorldNavigationSession.getDocumentInfo(documentId)` — normalizes a
  published snapshot, a fork, or an ordinary loaded document into one
  shape (`title`, `description`, `author`, `license`,
  `parentDocumentId`, `status`, `statusLabel`, `dirty`, `editable`,
  `editabilityNotice`) so `ui/components/DocumentInfoPanel.js` never
  needs to know which kind of document it's looking at.
  `hasBeenSaved` is approximated as "not dirty": every fork starts
  dirty the instant `_forkForEdit` creates it
  (`history.markUnsaved()`), so a clean history reliably means an
  explicit `saveDocument()` happened since.
- `WorldNavigationSession.consumeForkNotice()` — a drain, not an
  event subscription: `_forkForEdit` leaves a one-shot
  `{ sourceDocumentId, sourceTitle, forkId, forkTitle }` record behind
  right before it returns; the next `consumeForkNotice()` call
  retrieves and clears it. World View's `guarded()` wrapper (0.2.20
  hardening) drains it after every successful call and, if present,
  shows "Created your own editable copy — the original is unchanged"
  — so a fork happening no longer just silently changes which
  documentId subsequent actions target. A flag-and-drain was chosen
  over a new EventBus topic because the UI already re-polls session
  state once per interaction (`refreshSpatialUI`); a fork fires at
  most once per interaction, so there's nothing a subscription would
  buy that the existing poll doesn't already give for free.
- `PublishDocumentUseCase._validate(document)` — a title (trimmed,
  non-empty) and at least one building, checked before anything
  immutable is created. Deliberately does NOT validate license choice:
  UNSPECIFIED and ALL_RIGHTS_RESERVED are legitimate, maximally-
  restrictive choices an author is entitled to make (0.2.13) — this
  guards against publishing something meaningless, not against
  publishing something restrictive. Shared by both surfaces: World
  Navigation­Session.publishDocument calls this same class with a
  duck-typed `{ document }` stand-in for `documentManager` (unchanged
  from 0.2.3), so a fork published from World View is validated
  identically to a document published from the Editor.
- `DocumentCloneService` now carries `description` through a clone —
  added in 0.2.21 alongside `description` itself; without this, every
  fork/duplicate would have silently dropped the source's description,
  the same class of gap `title`/`author`/`license`/`parentDocumentId`
  already avoid.

UI additions — one shared vocabulary, two hosts:

- `ui/components/DocumentInfoPanel.js` — pure presentation, no
  session/use-case imports; renders whatever `getDocumentInfo()`-shaped
  object it's given and emits `edit-metadata`. Used identically in
  `EditorView`'s sidebar (sourced from `documentManager.document.
  metadata` + `documentManager.state`) and `WorldView`'s inspection
  column (sourced from `session.getDocumentInfo(...)`) — the same "one
  operation, one definition, every surface" reasoning 0.1.50 drew for
  EditorActionRegistry, one level further: this component isn't even
  in that registry, it's presentation only.
- `ui/components/MetadataEditorDialog.js` — the Document Properties
  editor: title/description/license fields, Save/Cancel, modal overlay
  following CommandPalette's existing convention (fixed inset,
  click-outside/Escape to cancel) rather than a second dialog pattern.
  Emits `save({ title, description, license })` with a real `License`
  instance (not a bare id) so it passes straight through to
  `UpdateDocumentMetadataUseCase`/`updateDocumentMetadata` unchanged.
  Preserves the license's existing `attribution` (fork provenance
  stamped by `ForkDocumentUseCase`) only when the user leaves the
  license id unchanged — picking a genuinely different license starts
  clean rather than carrying stale provenance.
- `ui/components/Toolbar.js` — Save/Publish report through the same
  `ActionFeedback` toast every other action already uses
  (`feedback.show(...)`, an optional prop) instead of a blocking
  `alert()`; falls back to `alert()` only if no `feedback` prop is
  supplied, so this is additive, not a breaking prop change.
  `EditorView` now always supplies one. `PublishDocumentUseCase`'s new
  validation surfaces through the same toast rather than a browser
  dialog, and `EditorView`'s fork-on-open flow (`route.query.fork`)
  reports "Created your editable fork of …" the same way, addressing
  the design's "avoid silently making the user wonder why the document
  ID changed" for the Editor's own fork entry point, not just World
  View's lazy one.

Deliberately not in 0.2.21: a distinct "Forked" lifecycle tier (see
above — it's orthogonal metadata, not a status); license CHOICE
validation at publish time (0.2.13's restrictive choices remain
legitimate); a blocking confirmation dialog before a lazy fork happens
(the existing proactive `editabilityNotice` plus the new reactive
`consumeForkNotice` toast were judged sufficient — a modal in the
middle of a drag gesture would be worse UX, not better); extending
`publisher/Publication.js` with a `description` field (Publication's
wire shape is a protocol-adjacent surface spanning 0.2.3/0.2.13/0.2.16
— a cosmetic field there is a separate, deliberate decision, not a
side effect of this milestone); and a separate "New Document" creation
wizard (a fresh Document already has sensible metadata defaults the
instant it exists — see "A default value is not an absent one" — so
0.2.21 lets the user open the SAME Document Properties editor
immediately afterward rather than building a second, near-identical
form just for the moment of creation).

### Fork Transition & World View Document Switching (0.2.22)

0.2.20 made fork-on-edit correct: a mutation on a published snapshot
forks it, and every subsequent mutation lands on the fork. What it did
not do is make that switch visible. `WorldNavigationSession` had
tracked which document is "active" (`getActiveDocumentId()`,
pre-existing since well before 0.2.20) correctly the whole time — the
gap was entirely in `ui/views/WorldView.js`, which bound its header
title to a value captured ONCE at mount (`const initialDocumentId =
route.params.documentId`) and never revisited it. The result: after a
fork, the session's internal state was exactly right — selection,
gizmo, mutation target all correctly pointed at the fork — while the
screen kept displaying the source's title and the URL kept naming the
source's documentId. A user watching the title bar had no way to tell
that "Alice's World" had, mutation by mutation, become something they
now silently owned.

    Before the fork:
        title/route/mutation-target  ──┐
                                        ├──►  source documentId (A)
        selection/gizmo               ──┘

    After the fork (0.2.20, pre-0.2.22):
        selection/gizmo/mutation-target ──►  fork documentId (B)
        title/route                     ──►  STILL A  (stale)

    After the fork (0.2.22):
        title/route/selection/gizmo/mutation-target ──►  ALL B

The fix is deliberately small and structural, not a new event system:
`getActiveDocumentId()` is already the single source of truth every
guarded mutation updates (via `_remapReferencesAfterFork`'s
`this._focusedDocumentId = forkId`); `WorldView.js`'s
`refreshSpatialUI()` — already called after literally every pointer
interaction, every registry-driven keyboard/palette action, and the
periodic streaming poll (`setInterval`) — now re-derives title,
author, and a `Document Info` snapshot (`activeDocumentInfo`) from
`session.getActiveDocumentId()` on every one of those refreshes,
instead of a value frozen at mount. When the active id has changed
since the last refresh, `router.replace({ path: '/world/' +
activeId })` follows it — the exact same
`session.focusDocument(id); router.replace(...)` pairing
`focusWorld()` already used for an explicit "Focus World" click,
just applied automatically instead of only on request. Vue Router
reuses the `WorldView` component instance across a `:documentId`
param change on the same matched route (no `:key`, no
`beforeRouteUpdate` — confirmed by `focusWorld()` already relying on
exactly this), so this never remounts the view, never reconstructs
`session`, and never touches the camera: only the identity POINTED at
changes, not the scene or the viewpoint.

    Rendered scene    ─┐
    Selection         ─┤
    Gizmo             ─┼──►  session.getActiveDocumentId()
    Mutation target   ─┤        (single source of truth,
    Document metadata ─┤         re-read every refresh —
    Route             ─┘         not cached anywhere)

The reverse case needed no new code: `_ensureEditableSelection`/
`_forkForEdit` already throw BEFORE mutating `_focusedDocumentId` or
`_loadedDocuments` when fork policy denies the edit (0.2.20), so a
denied fork leaves `getActiveDocumentId()` unchanged — `WorldView`'s
refresh sees the same id it saw before, makes no route change, and the
screen simply never moves. There is no third state where the active
document is ambiguous: every refresh either confirms the source or
confirms the fork, never something in between.

A visible status line accompanies the title
(`world-view-status`/`world-view-status--published`): "🔒 Published"
for an unforked snapshot, "✎ Editing fork — forked from …" once the
active document has a `parentDocumentId`, sourced from
`getDocumentInfo(activeId)` (0.2.21) plus a best-effort title lookup
against the publications list already loaded for the hover/inspection
panels (the parent itself is no longer loaded in this session, but it
is still a real Publication, so its title is resolvable from the same
list). `consumeForkNotice()` (0.2.21) still fires the transient toast
— "Created your own editable copy — … is unchanged" — but per the
design's own framing, that notice is now backward-compatible plumbing
for the transient announcement, not the mechanism the UI relies on to
know which document is active: `getActiveDocumentId()` /
`getDocumentInfo()` are the durable, always-queryable state; the
notice is a one-shot drain layered on top for the toast, exactly as
0.2.21 introduced it.

Deliberately not in 0.2.22: a blocking confirmation dialog before a
lazy fork (see docs/Principles.md, "A fork is not a modal
interruption" — it would defeat the point of lazy fork-on-edit); a new
"Document Transition" domain entity or event log (the design floated
one, but `getActiveDocumentId()`/`getDocumentInfo()` already ARE
first-class, always-queryable state — a parallel event-shaped
structure would be a second source of the same fact, exactly what
"Status is computed, not stored" (0.2.21) argues against); and any
change to the fork MECHANISM itself (positional remap, fork policy,
streaming pin, gizmo hit-test gating) — all of that was already
correct as of the 0.2.20 hardening pass; 0.2.22 is purely about making
an already-correct internal state visible.

#### Further hardening: a fork must render live, not just once

0.2.22's title/route fix made it possible to actually SEE which
document was active — which is what surfaced a real, independent bug
the 0.2.20 hardening pass had missed: a fork's brick MESH froze at
wherever it was placed the instant the fork was created, and never
updated again for the rest of the session, however many further edits
were applied to it. The domain model was correct the whole time (the
brick's stored position genuinely advanced); nothing ever told the
renderer.

The cause: `DocumentCloneService.execute()` rebuilds the cloned World
via `World.fromJSON(worldJson)` with no `eventBus` argument. A Brick
with no eventBus never publishes `BRICK_UPDATED`/`BRICK_ADDED`/
`BRICK_REMOVED` when mutated, so `WorldRenderer` — subscribed to the
session's OWN eventBus in `start()` — never hears about it.
`WorldNavigationSession._loadWorld` already passes `this._eventBus`
into `loadPublicationDocumentUseCase.execute(documentId, this._eventBus)`
for the SOURCE document (so a published world's rendering wiring was
always correct — moot, since it's never mutated in place); `_forkForEdit`
never made the equivalent connection for the fork it hands the renderer
straight to. `EditorSession.openDocument()` had always avoided this
same trap by rebuilding the world with a fresh eventBus itself before
handing it to the renderer (`ui/views/EditorView.js`'s explicit-fork
flow, `route.query.fork`) — World View's lazy fork-on-edit had no
equivalent rebuild step, so the gap that method's caller papered over
was exposed here.

Fixed at the source: `DocumentCloneService.execute()` now accepts an
`eventBus` option and threads it into `World.fromJSON(worldJson,
eventBus)`; `_forkForEdit` (and, for consistency, the pre-existing
`forkDocument`/`cloneDocument` methods) pass `this._eventBus` — the
exact bus `_loadWorld` already uses and the active `WorldRenderer`
already subscribed to. One clone mechanism, one place a caller that
needs live rendering asks for it, rather than every caller
individually remembering to rebuild the world afterward.

`tests/ForkOnEdit.test.js` and `tests/ForkTransition.test.js` could not
have caught this: both use a duck-typed stub renderer with no mesh and
no event subscription, correct for testing session/document logic but
structurally blind to a rendering-wiring gap. `tests/ForkRenderSync.test.js`
adds a third kind of test double — a REAL `WorldRenderer` backed by a
minimal `{ add, remove }` low-level renderer (real Three.js meshes, no
WebGL/browser needed) — so a mesh's actual position can be asserted
after a fork, a second mutation on the same fork, and a brick add/
remove, the same way the deployed viewport would show them.

#### Further hardening: World View had a fork it could edit but never persist

`WorldNavigationSession.saveDocument`/`publishDocument` have existed
since 0.2.20 (defense in depth against saving/publishing a
still-published id; `publishDocument` already auto-saves a dirty
document before publishing) and are already exercised end-to-end by
`tests/ForkOnEdit.test.js`'s flagship scenario. Nothing in
`ui/views/WorldView.js` ever called them — the Editor has always had
`ui/components/Toolbar.js` for Save/Publish/New; World View never
received an equivalent, because before 0.2.20 there was nothing in
World View TO save (published worlds were read-only, full stop). Once
fork-on-edit made real, persistent editing possible, the missing
button became a dead end: a user could fork, move bricks, place new
ones, rotate — and every bit of it lived only in
`WorldNavigationSession._loadedDocuments`, gone on the next reload,
with no way to ever get it into storage or publish it.

Fixed with two buttons next to the header's status badge (`world-view-
actions`) — Save and Publish, shown whenever `activeDocumentInfo.
editable` is true (i.e. never on a still-published snapshot, where
both would just throw the existing defense-in-depth error) — calling
`session.saveDocument(activeDocumentInfo.documentId)` /
`session.publishDocument(...)` through the same `guarded()` wrapper
and `ActionFeedback` toast every other World View action already
uses. Deliberately bound to `activeDocumentInfo` (the header's
document), not the selection-scoped `documentInfo` the inspection
panel and Document Properties editor use — "save the document I'm
editing" means the ACTIVE document specifically, and the two states,
while normally in agreement, are not the same field. No new
application-layer code: this exposes already-correct, already-tested
session methods that had no caller in this surface, the same class of
gap as the render-sync fix above, just one layer higher (persistence
instead of rendering).

#### Further hardening: Edit Metadata was only reachable by accident

0.2.21 gave World View a Document Properties editor — but it was
wired to `documentInfo`, the SELECTION-scoped info object the
inspection panel populates only once a specific brick is selected.
Save/Publish, just added next to the header's status badge, are bound
to `activeDocumentInfo` and always visible whenever the active
document is editable — no selection required. The mismatch meant a
user who forked by moving a brick, saved, and then went looking for a
way to rename their fork before publishing had no obvious path to it:
the metadata editor existed, but only behind "select a brick in that
world first," a prerequisite Save/Publish never needed.

Fixed by adding an "Edit Metadata" button to the SAME header actions
row as Save/Publish, bound to `activeDocumentInfo` exactly like they
are. Both entry points now open the same `MetadataEditorDialog`; a new
`metadataEditTarget` ref records which info object (`activeDocumentInfo`
from the header, or `documentInfo` from the inspection panel — still
useful on its own for inspecting/editing a DIFFERENT nearby world's
metadata while only browsing it, not editing the active one) actually
opened it, so `onSaveMetadata` edits the right document regardless of
which button was clicked. `updateDocumentMetadata` (0.2.21) was
already correct and already routes metadata edits through the same
fork-on-first-mutation gate as every other mutation — this is again
pure UI wiring, not new application-layer behavior.

### World Placement & Spatial Positioning (0.2.23)

Unlike every prior milestone in this stretch, 0.2.23's gap was not
that a feature had never been built — it was that a genuinely mature
feature (`core/WorldPlacement.js`, `core/PlacementRecord.js`,
`placement/LocalPlacementRegistry.js`, `application/
PlacePublicationUseCase.js`, `application/MoveWorldPlacementUseCase.js`
— revisioned, signed per-revision (0.2.16), causally stamped per-
revision (0.2.18), fully covered by `tests/PlacementRegistry.test.js`
and `tests/WorldPlacement.test.js`) had never been connected to
anything a user could reach. `CreateWorldViewUseCase.js` wired only
the plain `LocalSpatialIndexProvider` directly; nothing ever called
`PlacePublicationUseCase`, so no publication ever had an explicit
placement, and `LocalWorldLayoutProvider`'s deterministic-grid
fallback silently stood in for "no placement exists" — indefinitely,
for every publication, since nothing was ever wired to create one.

Two real bugs sat underneath that gap, both a confusion between
`Publication.id` (the publication's own identity) and
`Publication.documentId` (the World's identity — two independently
generated ids; see `publisher/LocalPublisherProvider.js`:
`publicationId = createId()`, `documentId: document.world.id`).
`WorldPlacement`/`PlacementRecord` are keyed by `publicationId`
throughout, but `LocalWorldLayoutProvider.getPosition`/
`findVisibleDocuments` queried the spatial index directly with a
`documentId` — a key an explicit placement can never match — and
`findVisibleDocuments`'s explicit-placement branch added the
placement's `publicationId` into its visible-set instead of the
`documentId` every caller of the method actually expects. Together
these meant an explicit placement, even if one had existed, could
neither be found by position lookup nor stream in by spatial
proximity. Both are fixed by resolving `documentId ->
discoveryProvider.findByDocumentId -> Publication.id` before ever
touching the spatial index (`_resolvePublicationId`, and the
equivalent resolve-then-lookup in `findVisibleDocuments`).

    DOCUMENT                                 PUBLICATION
        |                                          |
        | metadata: title/description/license      | id (publicationId)
        | (what it is)                             | documentId ------.
        v                                          v                  |
    Editor/World View                        WorldPlacement /         |
    Save / Publish                           PlacementRecord          |
                                              (where it is)            |
                                                   ^                   |
                                                   `-- keyed by -------'
                                                       publicationId, not
                                                       documentId

Making placement explicit and reachable:

- `application/InitialPlacementStrategy.js` — `GridPlacementStrategy`,
  the ONE strategy implemented (reproducing the pre-existing
  fallback's exact grid math, so a freshly published world still
  lands where it always visually appeared to). `NextAvailable`/
  `Origin`/`UserSpecified` are deliberately not built speculatively —
  `computePosition(context)` is the interface any of them would
  implement, added only when a real requirement asks for one (see
  docs/Principles.md, "A position, once assigned, is a fact — not a
  projection").
- `PublishDocumentUseCase` now accepts optional `placePublicationUseCase`/
  `initialPlacementStrategy` and calls them right after a successful
  publish, so EVERY publish — Editor or World View, a fresh document
  or a published fork — gets exactly one initial placement, one
  guarantee at the one place publishing happens rather than something
  every caller has to remember. Best-effort: a placement failure is
  logged and swallowed, never thrown — the fallback grid math still
  answers "where is this" for an unplaced publication, so a
  spatial-index hiccup degrades to pre-0.2.23 behavior, never a failed
  publish (see docs/Principles.md, "A Publication Is What; A
  Placement Is Where" — publishing succeeding is a document-level
  fact placement failure has no business vetoing).
- `CreateWorldViewUseCase.js`/`CreatePublisherUseCase.js` both now wire
  a real `LocalPlacementRegistry` (which already writes through to the
  same `LocalSpatialIndexProvider` `WorldLayoutProvider` reads, so a
  placement created/moved here needs no separate sync step) and pass
  `PlacePublicationUseCase`/`GridPlacementStrategy` into
  `PublishDocumentUseCase`, and `placementRegistry`/
  `MoveWorldPlacementUseCase` into `WorldNavigationSession` — the same
  DI-per-factory convention every other adapter in this codebase
  already follows.
- `WorldNavigationSession.getPlacementInfo(documentId)` — resolves the
  document's Publication, then its most-recently-updated
  PlacementRecord (a document CAN have more than one placement — the
  same publication exhibited in several places — picking the latest
  is a deliberate simplification, matching `getPosition`'s own choice;
  browsing/choosing among several is future scope, not something the
  data model prevents), and returns a UI-shaped
  `{ documentId, placementId, publicationId, position, rotation,
  revision, owner, movable }`. `movable` is a LOCAL, best-effort
  ownership signal for the UI only (current user's username matches
  the recorded owner, or no owner is recorded at all) — never the
  actual authorization boundary. A move this session allows still
  gets signed as whoever is currently logged in; if that doesn't
  match the placement's real owner (or a valid 0.2.17 delegation —
  not wired into this check), the revision fails verification
  wherever it's actually checked. This is the same "the writer
  doesn't gate itself, the reader verifies" decentralized posture
  0.2.19's trust layer already established, applied to placement
  instead of discovery.
- `WorldNavigationSession.movePlacement(documentId, newPosition)` —
  resolves which placement "the document currently showing as
  documentId" means, then delegates the actual revision to
  `MoveWorldPlacementUseCase` (signed, causally-stamped — already
  correct, already tested). Deliberately does NOT route through
  `_ensureEditableDocumentId`/any fork-on-write guard: moving a
  placement is not a document mutation (see docs/Principles.md,
  "Moving a placement is not editing a document") and must work on a
  still-published, un-forked snapshot exactly as well as on a fork.

UI — a placement panel deliberately separate from the document one:

- `ui/components/PlacementInfoPanel.js` — position/revision/owner,
  Focus/Move buttons, disabled Move when `!info.movable`. Pure
  presentation, same shape as `DocumentInfoPanel`, rendered as a
  sibling of it (never merged into it) wherever a world's info is
  shown — the inspection column (selection-scoped, `placementInfo`)
  and the header (active-document-scoped, `activePlacementInfo`,
  alongside Save/Publish/Edit Metadata) — mirroring the exact
  dual-scope pattern `documentInfo`/`activeDocumentInfo` and
  `metadataEditTarget` already established in 0.2.21/0.2.22's
  hardening. The header's "Move Placement" button is gated only on a
  placement existing, NOT on `activeDocumentInfo.editable` — a
  still-published snapshot has no editable document but can still
  have a movable placement, and the button must reflect that.
- `ui/components/PlacementEditorDialog.js` — plain X/Y/Z number
  inputs, not a gizmo-drag interaction. Moving a placement is a
  distinct, much rarer operation than moving a brick (the transform
  gizmo already owns that), and the design explicitly favored an
  explicit model over a sophisticated positioning interaction before
  one is actually needed.

Deliberately not in 0.2.23: rotation/scale editing UI (WorldPlacement/
PlacementRecord already carry both — untouched, just not exposed in
the editor yet); a placement browser for a document with multiple
placements (shows/edits only the most recently updated one, as noted
above); hard, session-level enforcement of placement ownership (the
`movable` UI signal, not a rejection — matching the decentralized
"writer doesn't gate itself" posture); wiring 0.2.17 delegated
authorization into the ownership check (a real, natural extension —
"Bob is authorized to place/move Alice's castle without owning it" —
deliberately deferred, not built speculatively); and any additional
`InitialPlacementStrategy` beyond Grid.

### World Coordinate Semantics & Placement UX (0.2.24)

0.2.23 connected placement to the UI but left one implicit assumption
in place: `GridPlacementStrategy.computePosition` read
`discoveryProvider.list().length` — how many publications THIS LOCAL
NODE happened to already know about — to pick a position. That is
locally-observed state, not a fact about the publication being placed,
and it broke the one property a shared, decentralized world coordinate
system actually needs: the same publication must resolve to the same
absolute coordinate on every replica, regardless of what else that
replica has or hasn't discovered yet. Two nodes independently placing
different publications before either has heard of the other's could
land both at slot 0; the same node placing the same publication after
discovering a different number of others first could produce a
different slot depending purely on timing. This milestone's core fix
is small in code and large in consequence: make `computePosition` a
pure function of `publicationId` alone.

- `core/DeterministicGridPlacement.js` (new) —
  `computeDeterministicGridPosition(id)`: hashes `id` via
  `serializer/contentHash.js`'s existing FNV-1a `computeContentHash`
  (reused purely as a stable string→integer function, no cryptographic
  property needed) and maps it into a bounded grid (`GRID_EXTENT = 64`
  cells per axis, `GRID_SPACING = 40`, both centralizing values that
  used to be duplicated between `InitialPlacementStrategy.js` and
  `LocalWorldLayoutProvider.js`). Bounded so placements land in an
  explorable region rather than scattered across the entire hash
  range — at the cost of accepting that two different ids CAN land on
  the same cell. Resolving that is explicitly out of scope (see
  docs/Roadmap.md); determinism is the only property established here.
- `application/InitialPlacementStrategy.js` — `GridPlacementStrategy`
  now just calls the function above with `context.publicationId` and
  drops its `discoveryProvider` constructor parameter entirely, since
  nothing it does depends on local discovery state anymore.
  `CreateWorldViewUseCase.js`/`CreatePublisherUseCase.js` updated to
  `new GridPlacementStrategy()` accordingly.
- `world-layout/LocalWorldLayoutProvider.js` — its own fallback grid
  (for publications that predate 0.2.23 and so carry no
  PlacementRecord at all) had the identical non-determinism, keyed off
  each publication's index in `discoveryProvider.list()`. Both
  `getPosition` and `findVisibleDocuments` now call the same
  `computeDeterministicGridPosition` GridPlacementStrategy uses — a
  legacy publication now resolves to the exact same fallback position
  on every replica, matching the guarantee an explicitly-placed one
  already gets from its PlacementRecord.

The second half of the milestone makes explicit something the code
already did correctly but never stated: a brick's position and a
placement's position are two different coordinate systems that
compose by addition, not one coordinate system with two writers.

    document-local position  +  WorldPlacement position  =  effective world position
       (core/Brick.js)          (core/WorldPlacement.js)      (what actually renders)

- `core/Position.js` gains `add(other)` — plain componentwise
  addition, accepting any `{x,y,z}`-shaped value.
- `core/WorldPlacement.js` gains `effectiveWorldPosition(localPosition)`
  — `localPosition.add(this.position)` — giving the composition a
  name and making it independently testable
  (`tests/CoordinateSemantics.test.js`) outside
  `renderer/WorldRenderer.js`, which was already performing the exact
  same addition per-mesh via its `_documentOffsets` map and is
  unchanged by this milestone.

The coordinate system itself — origin, axes, unit — is now stated as
an explicit contract rather than left implicit in whatever Three.js
happens to default to (see docs/Principles.md, "A World Unit Is Not
(Yet) A Meter," and docs/Protocol.md's new section for the full
statement): canonical origin `(0, 0, 0)`, right-handed `+X`/`+Y`/`+Z`
axes with the ground plane at `Y = 0`, and one coordinate unit named a
**World Unit** — explicitly not claimed to equal one meter or any
other physical unit, so a later milestone can add that claim without
touching a single stored coordinate. No code enforces this beyond what
already existed; it is a documentation contract two independent
implementations need to agree on to interoperate, which is exactly
what belongs in docs/Protocol.md.

UI — the Move Placement dialog gains a relative convenience over the
same absolute fields, not a new persisted primitive:

- `ui/components/PlacementEditorDialog.js` — a step-size selector
  (1/10/100 World Units) and ±X/±Y/±Z nudge buttons that adjust the
  dialog's own local X/Y/Z numbers, exactly as if they'd been typed.
  "Move" still submits the resulting absolute position through the
  unchanged `WorldNavigationSession.movePlacement` →
  `MoveWorldPlacementUseCase` path — nothing relative is ever
  constructed, signed, or persisted (see docs/Principles.md, "World
  Coordinates Are Absolute; Documents Are Local").
- `ui/components/PlacementInfoPanel.js`/`PlacementEditorDialog.js` —
  position fields now labeled "World Units," so the unit convention
  above is visible where a person actually reads or enters a
  coordinate, not just in the docs.

Deliberately not in 0.2.24: any collision-avoidance or "next available
slot" logic for `GridPlacementStrategy` (determinism was the ask; two
ids landing on the same cell is a known, accepted limitation — see
docs/Roadmap.md); a `relativeTo`/offset field on `PlacementRecord`
("50 units north of Alice's Castle" persisted as a relationship rather
than computed once into an absolute position) — the nudge UI computes
and submits an absolute position, nothing relational is stored;
physical-unit conversion (meters, etc.) for World Units; and touching
`renderer/WorldRenderer.js`, which already performed the local+
placement composition correctly and needed no change.
