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

### Spatial Allocation & Placement Collision Policy (0.2.25)

0.2.24 made `position` deterministic; it deliberately left `position`
NOT unique — two placements can legitimately share a coordinate (an
interior view, a historical version, deliberately layered exhibits).
0.2.25 answers what happens when that occurs, split into two
genuinely separate concerns that the design deliberately keeps from
blurring together: detecting an overlap (a geometric fact) and
deciding what to do about it (a policy choice).

    core/SpatialOverlap.js               core/SpatialAllocationPolicy.js
       "is this occupied?"                  "so what happens now?"
              │                                       │
              ▼                                       ▼
      SpatialOverlap (derived,               ALLOW / WARN / REJECT /
      never persisted)                       AUTO_OFFSET (unimplemented)
              └───────────────┬───────────────────────┘
                               ▼
                    evaluateSpatialAllocation(policy, overlap)
                               ▼
                { allowed, requiresConfirmation, overlap }

- `core/SpatialOverlap.js` — `SpatialOverlap` (position + occupants,
  a plain derived observation with no persistence of its own — see
  docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
  Decision") and `detectSpatialOverlap(position, existingRecords,
  { excludePlacementId })`, a pure function over any array of
  `{placementId, publicationId, position}`-shaped values —
  `PlacementRecord` and `WorldPlacement` both qualify without
  conversion. Deliberately origin-only: two positions overlap here
  when they are the exact same coordinate, not when their (future)
  spatial bounds intersect — see "Geometric Collision Is A Later
  Question" in Principles.md for why that's not attempted yet.
- `core/SpatialAllocationPolicy.js` — the four-name vocabulary the
  design doc asked for (`ALLOW`/`WARN`/`REJECT`/`AUTO_OFFSET`) and
  `evaluateSpatialAllocation(policy, overlap)`, a pure decision
  function. Only `ALLOW`/`WARN`/`REJECT` are actually reachable from
  any wired caller in this milestone; `AUTO_OFFSET` is named but
  throws if ever invoked — see docs/Principles.md, "Automatic
  Collision Resolution Is Deferred, Not Solved," for why silently
  relocating a placement needs a globally-reproducible allocation
  algorithm this milestone does not attempt to build.
- `WorldNavigationSession` gains a `spatialAllocationPolicy`
  constructor parameter (default `WARN`) and
  `checkPlacementOverlap(documentId, newPosition)` — a pure PRE-FLIGHT
  query: it resolves the document's current placement (so moving a
  placement back onto its own current position never counts as
  overlapping itself), gathers every other current placement via
  `placementRegistry.list()`, and returns a decision plus each
  occupant resolved to a `{publicationId, title, owner}` shape a UI
  can render directly (`_describeOverlapOccupant`, using
  `discoveryProvider.findById` the same best-effort way `movable`
  already resolves owner names). Crucially, `checkPlacementOverlap`
  and `movePlacement` are entirely independent methods —
  `movePlacement` never calls it, has no idea it exists, and still
  succeeds unconditionally onto an occupied position exactly as it did
  before this milestone. The UI is what sequences "check, maybe
  confirm, then move" — the domain layer never enforces that sequence,
  because `MoveWorldPlacementUseCase` remains, as the design doc
  insisted, the sole authority for actually creating a revision.
  Automatic initial placement (`PlacePublicationUseCase`, called from
  `PublishDocumentUseCase._placeInitially`) is untouched and still
  never checks overlap at all — it stays effectively `ALLOW` by simply
  not asking, consistent with 0.2.23's "placement is best-effort,
  never blocks a publish."
- `getPlacementInfo` gains `overlapCount` — the same
  `detectSpatialOverlap` call, run passively against whatever position
  the placement is CURRENTLY at (not a requested one), so overlap
  visibility applies uniformly whether a placement got there
  automatically or through an explicit, confirmed move.

UI — a two-step confirm inside the SAME dialog, not a second modal:

- `ui/components/PlacementEditorDialog.js` — gains an `overlapWarning`
  prop. The component itself never calls `checkPlacementOverlap`; it
  stays pure presentation and still emits the identical `move({x,y,z})`
  on every click of its primary button. The HOST (`WorldView`)
  distinguishes "first click, run the check" from "second click,
  proceed" by tracking whether a pending warning's position still
  matches what's currently in the form (`warningIsCurrent`) — editing
  or nudging the fields after seeing a warning invalidates it and
  reverts the button to plain "Move," so a confirmation can never
  silently apply to a position the person changed their mind about.
- `ui/views/WorldView.js` — `onMovePlacement` now runs
  `session.checkPlacementOverlap` first (unless the pending warning
  already matches the exact position being submitted), shows the
  warning and returns without moving anything if confirmation is
  required, and only calls `session.movePlacement` once the position
  is clear or already confirmed. `placementOverlapWarning` resets on
  open, cancel, and successful move.
- `ui/components/PlacementInfoPanel.js` — a passive "⚠ N other
  documents share this location" notice from `info.overlapCount`,
  visible any time a placement's info is shown, independent of the
  Move Placement flow — this is what satisfies "the World View should
  make overlaps visible" for automatically-placed publications, which
  never go through the confirm dialog at all.

Deliberately not in 0.2.25: any implementation of `AUTO_OFFSET`
(silent, algorithmic relocation onto a different position than
requested — see docs/Principles.md); geometric/bounds-based collision
detection (only origin equality is checked); a full "click any world
location to browse everyone there" spatial inspector (the design doc's
own mockup) — overlap visibility for 0.2.25 is scoped to the currently
inspected/active placement's info panel and the Move Placement dialog,
not an arbitrary-location browser; wiring `REJECT` into any default
flow (the vocabulary exists and is tested, but nothing constructs a
session with it); and touching `PlacePublicationUseCase`/
`GridPlacementStrategy` at all — automatic placement's behavior is
byte-identical to 0.2.24.

### World Navigation & Spatial Discovery UX (0.2.26)

0.2.23–0.2.25 made the World View correctly place, coordinate, and
report overlap for publications. None of that was reachable except by
already knowing where to look: the only way to find a document you
didn't already have loaded or streamed nearby was the pre-existing
"Nearby Worlds" list, which only shows what's within
`STREAMING_RADIUS` of the camera right now. 0.2.26 adds the two things
that were actually missing — search over the full discovery catalog,
regardless of camera position, and a way to act on 0.2.25's overlap
count instead of just seeing it — without touching the placement
protocol, adding a new wire format, or building a directory as a
second source of truth.

    application/SearchWorldUseCase.js          WorldNavigationSession
       "which publications match?"          .searchWorld/getDocumentsAtPosition
              │                                    "enrich for the UI:
              ▼                                     position, hasPlacement,
      discoveryProvider.list()                      resolve documentId/title"
      (same source every other                           │
       discovery surface reads)                           ▼
                                                    ui/components/
                                              WorldSearchPanel.js
                                              LocationDocumentsDialog.js

- `application/SearchWorldUseCase.js` (new) — a case-insensitive
  substring match against `title`/`author`, both already on every
  `Publication`. `description` is deliberately NOT searched — it lives
  on `DocumentMetadata`, only available once a candidate's full
  snapshot is loaded, not on the lightweight `Publication` record
  discovery deals in; searching it would mean loading every
  candidate's content just to filter. No index is built or persisted —
  every call re-filters `discoveryProvider.list()` fresh, the same
  "computed, not stored" posture `SpatialOverlap` (0.2.25) already
  established for derived facts (see docs/Principles.md, "Discovery Is
  One Path, Not Two").
- `WorldNavigationSession.searchWorld(query)` — wraps the use case
  (optional collaborator, same "enforce/offer only when wired" rule
  every other collaborator here follows) and enriches each match with
  what a UI actually needs to act on it: `hasPlacement` (a real
  `PlacementRecord` exists) and `position` (resolved either way — via
  the explicit record, or `worldLayoutProvider.getPosition`'s
  deterministic fallback, 0.2.24 — so Focus always has somewhere to
  go). See docs/Principles.md, "Publication Found Is Not The Same As
  Placement Found."
- `WorldNavigationSession.getDocumentsAtPosition(position)` — the
  actionable half of 0.2.25's passive `overlapCount`. Reuses
  `detectSpatialOverlap` with NO `excludePlacementId` (unlike
  `checkPlacementOverlap`, which excludes the placement being moved
  because it's asking "would I collide with something else") — this
  answers "what's actually here," the currently-inspected placement
  included. Both methods now share `_describeSpatialOccupant`
  (renamed from 0.2.25's `_describeOverlapOccupant`, and extended with
  `documentId` so a result is directly focusable, not just
  displayable).
- Both are pure, read-only queries: neither loads a document, neither
  touches `MoveWorldPlacementUseCase` or any fork-on-write guard.
  `focusDocument` (pre-existing since 0.1.28/0.2.22) is what turns a
  result into an actual camera move + active-document switch — 0.2.26
  reuses it completely unchanged. See docs/Principles.md, "Focus Is
  Navigation, Not Discovery — And Never Editing."

UI:

- `ui/components/WorldSearchPanel.js` (new) — a search box with an
  explicit Find button (not live-as-you-type; matches the design doc's
  own mockup and avoids debouncing complexity this milestone doesn't
  need) and a results list in the same `.world-item` card language as
  the pre-existing Nearby/Loaded Worlds lists, so search results read
  as one family with them rather than a visually separate feature.
  A result with `hasPlacement: false` shows a small note rather than
  presenting a fallback position as if it were authored.
- `ui/components/LocationDocumentsDialog.js` (new) — opened from
  `PlacementInfoPanel`'s overlap notice (which gained a `view-here`
  emit), lists every publication `getDocumentsAtPosition` found with a
  Focus button each. An editing fork never appears in this list — see
  `getDocumentsAtPosition`'s own comment for why that's a deliberate
  boundary, not an oversight.
- `ui/views/WorldView.js` — wires both: a new "Search" section in the
  existing sidebar section stack (above "Unavailable"/"Worlds in
  View"/"Nearby Worlds"), and `openLocationDocuments`/
  `closeLocationDocuments`/`focusLocationDocument` alongside the
  existing dialog-management functions. `catalogEmpty` (from
  `allPublications`, already loaded for the Nearby/Loaded lists) lets
  the search panel distinguish "nothing published at all" from "this
  query matched nothing" without a new session method.

Deliberately not in 0.2.26:

- **Full camera/active-document/selection separation.** The design
  doc's `_focusedDocumentId` is still exactly what it was before this
  milestone: BOTH the camera's navigation target AND the "active
  document" `getActiveDocumentId()` returns. Splitting these into
  three independently-tracked concepts (camera focus, active document,
  selection) touches roughly thirty call sites across this file and is
  a genuine architectural change, not a navigation-UX addition — it is
  real future work, not attempted here. What 0.2.26 DOES establish is
  that Focus never implies edit, which is the behavioral guarantee
  that actually mattered for this milestone's goal.
- **Wiring `DecentralizedSpatialDiscoveryProvider`/`DiscoveryDiagnostics`
  into the live World View.** `CreateWorldViewUseCase` still wires the
  plain `LocalWorldLayoutProvider`/`LocalSpatialIndexProvider` pair;
  the richer decentralized provider (0.2.15/0.2.19, with manifest/
  equivocation/staleness diagnostics) remains built, tested, and used
  only by other surfaces (see docs/Principles.md, "Diagnostics Should
  Say What Is Actually True, Not What Would Be Convenient," for why
  0.2.26 does not fabricate that diagnostic detail for a stack that
  cannot actually produce it).
- **A "click anywhere in the world to see what's there" location
  browser.** `LocationDocumentsDialog` is reachable from
  `PlacementInfoPanel`'s overlap notice — a real, already-selected
  position — not from picking an arbitrary point in empty space, which
  would need new raycast/picking wiring this milestone doesn't need to
  build to deliver its actual goal.
- **Description search, live-as-you-type search, and any new wire
  format.** None of `PlacementRecord`/`WorldPlacement`/`Publication`
  changed shape; search and "documents here" are both purely additive,
  read-side queries over what 0.2.10–0.2.25 already persist.

### World View Context & Selection Model (0.2.27)

0.2.26 made two publications sharing an exact world coordinate a real,
reachable situation (Search, Documents Here). That immediately exposed
a pre-existing simplification: `_focusedDocumentId` had always meant
both "where the camera is" and "which document receives a mutation."
Those questions have the same answer right up until a person can
switch which of two co-located documents they mean without moving
anything — at which point conflating them stops being a convenience
and starts being a way to silently edit the wrong document. 0.2.27
splits the concept in two and, in doing so, finds and fixes a real
latent bug the split makes newly reachable.

    WorldNavigationSession
            │
            ├── _focusedDocumentId ── getFocusedDocumentId() ── "where is the camera?"
            │        (set by focusDocument/moveCamera; never read by any mutation)
            │
            ├── _activeDocumentId ─── getActiveDocumentId() ─── "what does an edit target?"
            │        (set by focusDocument (default), setActiveDocument, or synced
            │         from a non-empty selection's document — see below)
            │
            └── _spatialSelection ─── getSpatialSelection() ─── "what's picked right now?"
                     (kept in sync WITH _activeDocumentId, in one direction: selecting
                      something makes its document active; it is never the reverse)

- `focusDocument(documentId, { setActive = true } = {})` — unchanged
  default behavior (moves the camera AND makes `documentId` active),
  so every pre-0.2.27 caller (search results, Nearby Worlds, Documents
  Here, all still just calling `focusDocument`) keeps working exactly
  as before. `{ setActive: false }` is the new, explicit opt-out for a
  pure camera move.
- `setActiveDocument(documentId)` (new) — changes the active document
  without touching the camera at all. Clears the current selection
  when (and only when) it belongs to a DIFFERENT document — carrying
  a stale cross-document selection forward would let the very next
  transform silently fork the wrong thing again.
- `_setSpatialSelection` (the single choke point every selection
  change in this file already flowed through — picking, marquee-
  select, select-all, selecting a group, a paste's auto-selection) now
  syncs `_activeDocumentId` to the selection's own document whenever a
  real (non-ground) selection is set. Combined with `setActiveDocument`
  clearing cross-document selections, this makes "a non-empty
  selection and the active document always agree" an invariant
  enforced at one location, not a convention every call site has to
  remember to uphold.
- Every mutation fallback in the file (`commitPlacement`, the ground-
  hover placement preview, `selectAll`, marquee-select's document
  resolution, clipboard, groups, save/publish, metadata edits,
  `movePlacement`/`checkPlacementOverlap`, undo/redo's active command
  history, history replay/restore) was reading `documentId ||
  this._focusedDocumentId`. All of them now read `_activeDocumentId`
  instead — camera position no longer has any path into deciding what
  gets edited. `_remapReferencesAfterFork` remaps `_activeDocumentId`
  the same way it already remapped `_focusedDocumentId`, so forking
  the active document keeps `_activeDocumentId` pointing at something
  that still exists in the session.
- **The bug this exposed and fixed:** `createGroupFromSelection`,
  `addSelectionToSelectedGroup`, and `removeSelectionFromSelectedGroup`
  used to call `_ensureEditableSelection()` (forking the SELECTION's
  document if needed) and then SEPARATELY fork and read
  `_focusedDocumentId` — building the group command from whichever
  document was focused, using the SELECTION's brick ids. Whenever focus
  and the selection's document differed, this forked a document that
  didn't need forking and built a command mixing one document's
  `worldId` with another's `brickIds` — a real cross-document
  corruption path, latent because nothing before 0.2.26 gave the World
  View a practical reason to have two documents both loaded and
  independently selectable. All three now resolve their target
  directly from `this._spatialSelection.documentId` (already correctly
  forked by `_ensureEditableSelection`), never from a second,
  independently-forked id. `renameGroup`/`duplicateGroup`/`deleteGroup`
  (which take a `groupId`, not a selection) simply moved from
  `_focusedDocumentId` to `_activeDocumentId` — no selection to
  reconcile against.
- `previewHistoryAt`/`cancelHistoryPreview` had a matching, smaller
  version of the same class of bug: the document swapped in as a
  replay preview was resolved once at preview-start time but
  re-resolved from `_focusedDocumentId` again at cancel time — if focus
  changed while a preview was open, cancel could restore the wrong
  document's live world. The resolved id is now saved on
  `_historyPreview.documentId` at start and reused, unconditionally, at
  cancel.
- `_loadWorld`/`_unloadWorld` bootstrap and tear down `_activeDocumentId`
  the same way they already did for `_focusedDocumentId`: the first
  document ever streamed in becomes active (nothing else to be
  "instead of"), and a document leaving the session's view can't
  remain the active target either.

UI:

- `ui/views/WorldView.js` — a new, always-visible context line under
  the title: "Camera: {focused title} · Editing: {active title}" (via
  the new `getFocusedDocumentId()`), following 0.2.22's own reasoning
  for binding the header unconditionally rather than only on a
  divergence — see docs/Principles.md, "The World View Header Shows
  What It's Actually Doing." The title, status badge, route, and every
  document-scoped action (Save/Publish/Edit Metadata/Move Placement)
  are unchanged in behavior: they already read `getActiveDocumentId()`,
  which now means exactly what 0.2.22 intended it to mean, more
  precisely than it did before this milestone.

Deliberately not in 0.2.27: new UI for setting the active document
independently of Focus (search results, Nearby Worlds, and Documents
Here all still only offer "Focus," which moves both — a separate
"make active without moving the camera" affordance is real future
scope, not something this milestone's session-layer correctness fix
requires); wiring `pick()`'s screen-space brick selection through
`setActiveDocument` explicitly (it doesn't need to — `_setSpatialSelection`
already covers it, since every selection path in this file flows
through that one method); and any change to the fork-on-write
mechanism itself (0.2.20's guards are untouched — only WHICH document
id they receive as input changed).

### Spatial Query & Location Discovery (0.2.28)

0.2.26 gave the World View text search over the full discovery
catalog. 0.2.28 gives it a spatial counterpart — "what's within
`radius` World Units of `center`" — composable with text search rather
than a second, unrelated mechanism: both are just criteria narrowing
the same `searchWorld` call.

    WorldNavigationSession.searchWorld({ text, center, radius })
              │
              ▼
      SearchWorldUseCase.execute({ text, center })
        (decides: apply the text filter, or — no text but a spatial
         filter is coming — return the WHOLE catalog unfiltered)
              │
              ▼
      _describeSearchResult(publication, center)
        (resolves position — explicit PlacementRecord, or 0.2.24's
         deterministic fallback — and, only when `center` was given,
         a `distance` via core/SpatialQuery.js)
              │
              ▼
      [center && radius] → filter to isWithinRadius(...), sort nearest-first
              │
              ▼
          enriched, ordered results

- `core/SpatialQuery.js` (new) — `distanceBetween(a, b)` and
  `isWithinRadius(position, center, radius)`, plain Euclidean geometry
  with no dependencies. Deliberately NOT the same test
  `LocalSpatialIndexProvider.discover()` already performs for camera
  streaming (spatial/LocalSpatialIndexProvider.js) — that one is
  sphere/AABB intersection against a placement's bounds, correct for
  "does this world's geometry reach into view" but wrong for a
  `distance` a person reads as "how far away is this," which only
  makes sense as a straight point-to-point number. Reusing the
  bounds-aware test here would silently produce a `distance` that
  disagreed with the requested radius.
- `application/SearchWorldUseCase.js` — `execute()` now accepts either
  the original plain string (byte-identical 0.2.26 behavior, so every
  existing caller — including this milestone's own new test file —
  is unaffected) or `{ text, center, radius }`. The class still does
  ONLY text filtering; it has no placementRegistry and performs no
  geometry. What it decides is narrower: whether a spatial filter is
  coming, because that changes what "no text" should mean — blank
  text with no spatial filter still returns `[]` (0.2.26, unchanged);
  blank text WITH a spatial filter returns the unfiltered catalog,
  since a pure "what's near this point" query has no text criterion to
  apply and the caller's radius test is what actually narrows it.
- `WorldNavigationSession.searchWorld` performs the actual distance/
  radius test and nearest-first sort, AFTER `_describeSearchResult` has
  resolved each candidate's position — kept here rather than pushed
  into `SearchWorldUseCase` because position resolution already lived
  in this method (0.2.26), and a pure discovery-layer use case has no
  business knowing about placements. `searchWorldByLocation({ center,
  radius })` is a thin convenience wrapper for the pure-spatial case —
  equivalent to `searchWorld({ center, radius })`, reads more clearly
  as "find what's near this point" than a text search with the text
  left out.
- `_describeSearchResult(publication, center)` gains a `distance`
  field, computed only when `center` was actually passed — a text-only
  search's results carry `distance: null`, never a stale or invented
  number (see docs/Principles.md, "Distance Is Derived, Never
  Persisted"). `hasPlacement`/fallback-position semantics (0.2.26) are
  completely unchanged and apply identically to spatial results — a
  publication found only through its deterministic fallback position
  still reports `hasPlacement: false`, so a radius search can never
  present a fallback as an authored location (see docs/Principles.md,
  extending "Publication Found Is Not The Same As Placement Found").

UI:

- `ui/components/WorldSearchPanel.js` — gains a Location section (X/Y/Z
  + Radius, all labeled World Units) under the existing text field.
  Submitting composes both into one `{ text, center?, radius? }`
  event — `center`/`radius` are present only when Radius actually has
  a value, so leaving Location blank is exactly the pre-0.2.28 text
  search, unchanged. A submit with neither text nor a radius is a
  no-op (nothing to search for) rather than emitting a query that
  would just report "no matches" for no reason. Results show a
  resolved 📍 position (now shown for every result, not only spatial
  ones — position was already being resolved regardless, this just
  makes it visible) and, only when a spatial query actually ran, a 📏
  distance — this is what finally makes the 0.2.24 coordinate system
  something a person reads and uses, not merely an internal
  convention.
- `ui/views/WorldView.js` — `performSearch` is unchanged beyond a
  rename for clarity; it already passed whatever `WorldSearchPanel`
  emitted straight through to `session.searchWorld`, which accepts
  both shapes.

Deliberately not in 0.2.28: wiring `DecentralizedSpatialDiscoveryProvider`
or `SpatialIndexRoot`/`SpatialIndexManifest` as the actual backend for
`searchWorldByLocation` — the CONTRACT (docs/Principles.md, "A Spatial
Query Is Authoritative Over Placement, Not A Local-Cache Scan") is
written to support that swap later without changing any caller, but
the live World View still wires the plain `LocalWorldLayoutProvider`
(same honesty rule 0.2.26 already applied to text search and
diagnostics — this milestone does not claim a decentralized guarantee
the running system cannot yet back up); bounding-box, polygon, or
nearest-neighbor-indexed spatial queries (a plain Euclidean sphere,
exactly as requested, is the whole of it); any geographic unit
conversion (World Units stays the only unit named anywhere in this
UI — see docs/Principles.md, "A World Unit Is Not (Yet) A Meter",
0.2.24); and a combined spatial-query location BROWSER (clicking/
exploring a region, sorting, filtering interactively) — that is
0.2.29's proposed scope, not this one's.

### World Location Browser & Spatial Exploration (0.2.29)

0.2.28 gave the World View a spatial query: "what's within `radius`
World Units of `center`." 0.2.29 gives it a way to REACH that query
from where a person actually is — the camera — instead of requiring
they already know a document's name or type coordinates by hand. Built
entirely on top of 0.2.28's machinery; there is still exactly one
spatial query in this codebase.

    "Explore Here" / "What's Here?" (WorldView.js, header)
              │
              ▼
      WorldNavigationSession.exploreHere(radius) / whatsHere()
        (center = getSpatialState().cameraPosition — NEVER the
         active document's placement; see docs/Principles.md,
         "'Explore Here' Queries The Camera, Never The Active
         Document")
              │
              ▼
      WorldNavigationSession.exploreLocation({ center, radius })
        = searchWorldByLocation({ center, radius })   (0.2.28, unchanged)
              │
              ▼
          enriched, nearest-first results
          { documentId, title, author, hasPlacement, position, distance }
              │
              ▼
      WorldLocationBrowser.js (modal)
        Focus  → focusDocument (default: moves camera, sets active)
        Select → setActiveDocument (active only, camera untouched)
        Inspect → inspectDocument (read-only, never loads/navigates)

- `application/WorldNavigationSession.js`:
  - `DEFAULT_EXPLORE_RADIUS = 25` / `NEARBY_RADIUS = 5` — the two
    radii "Explore Here" and "What's Here?" default to, respectively a
    reasonable starting neighborhood and a small tolerance for
    "essentially right here" (see docs/Principles.md, "A Tolerance
    Radius Is What Makes 'What's Here?' Answerable From A Camera," for
    why this is a small-radius query rather than `getDocumentsAtPosition`'s
    exact-match test — a continuous camera coordinate essentially never
    lands exactly on a recorded placement).
  - `exploreLocation({ center, radius })` — thin delegate to
    `searchWorldByLocation`; exists purely so location-browser call
    sites read as "explore," not "search," without duplicating any
    logic.
  - `exploreHere(radius = DEFAULT_EXPLORE_RADIUS)` — reads
    `getSpatialState().cameraPosition` as the center; returns `[]`
    (not a throw) when there is no camera state yet (nothing loaded).
  - `whatsHere()` — `exploreHere(NEARBY_RADIUS)`.
  - `inspectDocument(documentId)` — `{ documentId, documentInfo,
    placementInfo }`, each exactly what `getDocumentInfo`/
    `getPlacementInfo` already return; never forces a load.
    `documentInfo` is legitimately `null` for a result this session
    hasn't loaded — see docs/Principles.md, "The Location Browser's
    Three Actions Are Existing Operations, Not New Ones."
  - None of the above are new mutation surfaces — `exploreLocation`/
    `exploreHere`/`whatsHere` are read-only queries, and `Select`
    (`setActiveDocument`) and `Focus` (`focusDocument`) were both
    already part of the public API before this milestone (0.2.27).

UI:

- `ui/components/WorldLocationBrowser.js` (new) — a modal dialog
  following the same convention as `LocationDocumentsDialog`/
  `PlacementEditorDialog`. Shows "📍 Center: x, y, z" and "⭕ Radius: N
  World Units," a re-query radius field ("Explore" re-runs
  `exploreLocation` at the same center with a new radius), and a
  result list with each result's 📍 title, 📏 distance, and (when
  `hasPlacement` is false) the same "No placement recorded — using a
  default position" note `WorldSearchPanel` already shows. Each result
  has Focus/Select/Inspect buttons; Inspect toggles an inline,
  read-only expansion of Document Info + Placement Info in place
  (falling back to the result's own already-known fields when
  `documentInfo` is `null`). The result count reads "Showing N of N
  discoverable documents" — deliberately not "N documents in the
  world" — the same decentralized honesty 0.2.26/0.2.28 established:
  what the currently configured discovery provider can find within the
  requested region, not a claim of omniscient knowledge (see
  docs/Principles.md, "Diagnostics Should Say What Is Actually True,
  Not What Would Be Convenient," 0.2.26). This component does not
  reuse `DocumentInfoPanel`/`PlacementInfoPanel` — both render live
  mutation affordances (an "Edit Metadata" button in particular) that
  have no place in a strictly read-only browsing surface; its inline
  expansion renders its own read-only-only fields instead.
- `ui/views/WorldView.js` — "Explore Here" / "What's Here?" buttons
  sit directly under the camera coordinate readout they both act on.
  `exploreHere()`/`whatsHere()` call the matching session methods and
  open the dialog; `reExploreLocationBrowser(radius)` handles the
  dialog's own re-query; `focusLocationBrowserResult` (closes the
  dialog, like `LocationDocumentsDialog`'s own Focus), 
  `selectLocationBrowserResult` (stays open — nothing about the
  current view changed), and `inspectLocationBrowserResult` (toggles
  the host-owned `inspected` state passed back down as a prop) wire
  the three result actions to the session.

Deliberately not in 0.2.29: box selection in world space; sphere
visualization with collision geometry; polygon regions; "all documents
intersecting this building"; spatial clustering. All of these are
about geometry the location browser doesn't reason about at all — it
is a list of discoverable documents ordered by distance, nothing more.
Also not attempted here: wiring the decentralized spatial index
(`SpatialIndexRoot`/`SpatialIndexManifest`, with 0.2.19's trust
diagnostics) as the actual backend for World View discovery — explore/
search/streaming all still read the plain `LocalWorldLayoutProvider`.
That swap — "spatial streaming/index integration" — is a proposed
future milestone (see docs/Roadmap.md), not this one's.

### Trust-Aware Spatial Discovery & Diagnostics (0.2.30)

0.2.19 built a full trust/diagnostics layer for decentralized spatial
discovery — `TrustObservation`, `DiscoveryDiagnostics`,
`DecentralizedSpatialDiscoveryProvider` — but it was never connected to
the live World View, which has run on the plain `LocalWorldLayoutProvider`/
`LocalDiscoveryProvider` scan throughout 0.2.26–0.2.29. 0.2.30 connects
the two, WITHOUT changing which provider the live app resolves
documents from — see "What stays unchanged" below for why that
restraint is deliberate, not an oversight.

    WorldNavigationSession.exploreLocation({ center, radius })
              │
              ├──► searchWorldByLocation({ center, radius })   (0.2.28, UNCHANGED)
              │        │
              │        ▼
              │    documents[]   (position, hasPlacement, distance)
              │
              └──► _runSpatialDiscoveryDiagnostics(center, radius)
                       │
                       │  spatialDiscoveryProvider (OPTIONAL) —
                       │  DecentralizedSpatialDiscoveryProvider.discover()
                       │  consulted PURELY for its diagnostics; its own
                       │  PlacementRecord[] result is discarded
                       │
                       ▼
              summarizeDiscoveryDiagnostics(rawDiagnostics | null, { fatal? })
                       │
                       ▼
              { available, fatal, complete, warnings[] }
              │
              ▼
      { documents, diagnostics }   ◄── exploreLocation's return shape

- `core/DiscoveryDiagnosticsSummary.js` (new) — `summarizeDiscoveryDiagnostics(diagnostics, { fatal })`,
  a pure function turning `spatial/DiscoveryDiagnostics.js`'s raw
  counters into the compact shape above. Duck-typed (accepts a plain
  object with the same fields, not necessarily a `DiscoveryDiagnostics`
  instance) and dependency-free, matching `core/SpatialQuery.js`/
  `core/SpatialOverlap.js`'s own posture. See docs/Principles.md,
  "Diagnostics Are Received From The Discovery Layer, Never Invented
  By The UI," for the four states it can produce and why each is
  distinguishable.
- `application/WorldNavigationSession.js`:
  - Constructor gains an OPTIONAL `spatialDiscoveryProvider` — anything
    exposing `discover(center, radius)` + `getLastDiagnostics()` (i.e.
    a real `DecentralizedSpatialDiscoveryProvider`, or a test double
    with the same shape). Absent by default; the live app's
    `CreateWorldViewUseCase` does not pass one (see below).
  - `exploreLocation`/`exploreHere`/`whatsHere` now return
    `{ documents, diagnostics }` instead of a bare array — this is a
    breaking change to those three methods specifically, judged
    acceptable because they are 0.2.29's own, one milestone old, with
    exactly one caller in this codebase (`WorldLocationBrowser`), all
    updated in the same commit. `searchWorld`/`searchWorldByLocation`
    (0.2.26/0.2.28, the more established API `WorldSearchPanel`
    depends on) are UNCHANGED — still plain arrays. This keeps the
    envelope scoped to exactly the surface the design doc's mockups
    were about, rather than propagating a shape change through the
    older, more depended-upon text/spatial search path.
  - `_runSpatialDiscoveryDiagnostics(center, radius)` — calls the
    optional provider's `discover()` purely to populate its
    diagnostics; the PlacementRecord[] it returns is discarded (the
    session's own `documents` already came from the independent local
    path). A thrown `discover()` (untrusted/equivocating root — see
    `DecentralizedSpatialDiscoveryProvider`'s own documented fatal
    cases) is caught and turned into `diagnostics.fatal` rather than
    propagating out of what is supposed to be a read-only exploration
    call.
  - `inspectDocument` gains a `trust` field: the specific
    `TrustObservation` (by `placementId`) recorded during the MOST
    RECENT `exploreLocation` call, or `null` when there is nothing to
    report (no diagnostics-capable provider wired, this document's
    cell wasn't part of the last query, or no observation exists for
    it). This is a lookup against what the last exploration already
    observed — Inspect still never triggers a fresh query of its own.
- `ui/components/WorldLocationBrowser.js` — `results` prop renamed to
  `documents`; new `diagnostics` prop drives a banner above the result
  list with exactly the four states above (unavailable: neutral;
  fatal: red; complete: green "✓ Discovery complete"; warnings:
  itemized amber lines, e.g. "⚠ 1 stale entry in the spatial index
  accelerator"). The result list itself is UNCHANGED by any of this —
  a stale or unverifiable document still appears, exactly as
  discoverable as before; diagnostics annotate, they never filter (see
  docs/Principles.md). The Inspect expansion gains a "Discovery
  status" row from `inspected.trust.status` when present.
- `ui/views/WorldView.js` — `exploreHere`/`whatsHere`/
  `reExploreLocationBrowser` now destructure the `{ documents,
  diagnostics }` envelope; `locationBrowserResults` renamed to
  `locationBrowserDocuments`, new `locationBrowserDiagnostics` ref
  passed through to the dialog.

**What stays unchanged, deliberately:** the live `CreateWorldViewUseCase`
wiring does NOT pass a `spatialDiscoveryProvider`. `DecentralizedSpatialDiscoveryProvider`
answers queries against a `SpatialIndexRoot`/`SpatialIndexManifest`
chain that only exists once something has actually built and signed
one (`SpatialIndexBuilder`) — and nothing in the live app's placement
flow does that today; `CreateWorldViewUseCase`'s `PlacePublicationUseCase`
is wired directly against the plain `LocalSpatialIndexProvider`, with
no builder in the loop. Wiring the decentralized provider as the live
diagnostics source right now would not produce real diagnostics — it
would find an empty, never-published index root and report every
query as unable to resolve anything, a strictly WORSE and actively
misleading result compared to today's honest `available: false`. This
is the same restraint 0.2.26/0.2.28/0.2.29 already exercised for
`searchWorldByLocation`'s own backend, applied consistently here: the
CONTRACT (an optional, pluggable trust source) is real and exercised
by real trust code in tests
(`tests/DiscoveryDiagnosticsSummary.test.js`, against an actual
`DecentralizedSpatialDiscoveryProvider` built via the same
`buildReplica`-style pattern `tests/TrustDiscoveryHardening.test.js`
already established) — but flipping the LIVE wiring to a provider with
nothing behind it yet would trade an honest "unavailable" for a
dishonest "nothing here." That remains future work, alongside actually
building `SpatialIndexBuilder` into the live publish/place flow.

Deliberately not in 0.2.30: changing `searchWorld`/`searchWorldByLocation`'s
return shape (see above); any new UI for configuring or choosing a
`TrustPolicy` (the existing default/pinned/untrusted modes from 0.2.19
are exercised exactly as they were, just now visible through
diagnostics when a provider is wired); filtering or hiding results
based on trust status (see docs/Principles.md — a stale/conflicting/
unverifiable document is still shown, always); and per-document
cryptographic detail beyond `status`/`reason`/`freshness` (revision
numbers and positions are already shown via the existing Placement
Info fields; showing raw causal stamps or root hashes in the UI was
judged more detail than the design doc's own "the user doesn't
necessarily need the cryptographic details" scope called for).

### Publication Catalog & Repository UX (0.2.31)

Repository/Author View were still a small demo catalog — a flat,
unpaginated list rendered in full every time, with no sort, no
pagination, and search limited to whatever `SearchWorldUseCase`
happened to already do. 0.2.31 establishes a real CATALOG MODEL first,
then builds the UI on top of it, and unifies the two views onto one
shared implementation rather than letting them slowly diverge.

    RepositoryView.js          AuthorView.js
      <PublicationCatalog />     <PublicationCatalog :author="username" />
              │                           │
              └─────────────┬─────────────┘
                             ▼
              ui/components/PublicationCatalog.js
                (owns query/page state, resolves per-page
                 enrichment, wires the toolbar/card/list/
                 pagination components)
                             │
                             ▼
            SearchPublicationsUseCase.execute(PublicationQuery)
                             │
                             ▼
                       PublicationPage
              { items, page, pageSize, totalCount,
                totalPages, hasNext, hasPrevious }

Core/application:

- `core/PublicationQuery.js` — `{ text, author, sort, page, pageSize,
  includeDescriptions }`, a plain immutable value, application-level
  and NOT tied to how any discovery provider stores or fetches
  publications (see docs/Principles.md, "A Catalog Query Is Answered
  By The Application Layer, Not Assumed Efficient By The UI"). `author`
  is the ONLY field that differs between a Repository query (`null`)
  and an Author query (a username) — see below.
- `core/PublicationPage.js` — `{ items, page, pageSize, totalCount,
  totalPages, hasNext, hasPrevious }`. `totalCount`/`totalPages` are a
  small, deliberate addition beyond the design doc's own minimal
  shape — the mockup's own "1,248 publications" / "1 2 3 4 5 ... 125"
  pagination controls need them to render at all.
- `core/PublicationSort.js` — `PublicationSort` enum (RECENTLY_PUBLISHED/
  OLDEST_PUBLISHED/TITLE_ASC/TITLE_DESC/AUTHOR_ASC) and
  `comparePublications(a, b, sort)`, the pure comparator every sort
  order shares. See docs/Principles.md, "Ordering Must Be Deterministic
  Across Replicas," for why every branch falls back to an ordinal
  `publicationId` tiebreak and never uses locale-aware collation.
- `application/SearchPublicationsUseCase.js` — the Repository/Author
  catalog's own search: filters `discoveryProvider.list()` by author
  scope and text (title/author always; description only when
  `includeDescriptions` is set — see docs/Principles.md, "Description
  Search Is Opt-In, Not Silent, Because It Has A Real Cost"), sorts via
  `comparePublications`, and paginates — all inside this one use case,
  so the UI never computes an offset itself. A description match loads
  the candidate's full Document via the wired
  `LoadPublicationDocumentUseCase`, wrapped in try/catch (a single
  corrupt/missing document never breaks search for every other
  publication — the same failure-isolation posture 0.2.15/0.2.16/0.2.19
  already established) and memoized in an instance-lifetime Map so the
  same publication's description is never loaded twice. Deliberately a
  SEPARATE use case from `SearchWorldUseCase` — see docs/Principles.md,
  "Repository Search Is Not World Search."
- `core/DocumentPreview.js` — `PreviewType` (NONE/PLACEHOLDER/THUMBNAIL)
  and `derivePlaceholderPreview(publication)`, a pure function deriving
  a deterministic hue + initial from a publication's own `id`/`title`.
  No new field on `Publication` — see docs/Principles.md, "A Preview Is
  Either Signed Or It Isn't," for why a real, immutable, content-addressed
  preview is deliberately deferred rather than added to the signed
  schema in passing.
- `core/PublicationGrouping.js` — `groupPublications(items, mode)`
  (NONE/AUTHOR/DATE/LICENSE), a pure, presentation-only bucketing of
  the CURRENT PAGE's items — see docs/Principles.md. Scoped to one page
  deliberately: grouping the whole catalog independent of pagination
  would mean a group could legitimately span multiple pages, a real UX
  question this milestone doesn't attempt to answer.
- `application/CreateDiscoveryUseCase.js` — gains
  `loadPublicationDocumentUseCase` and `searchPublicationsUseCase`
  alongside the existing `listPublicationsUseCase`/`findPublicationUseCase`.

UI:

- `ui/components/PublicationCatalog.js` (new) — the ONE implementation
  both RepositoryView and AuthorView mount, differing only by an
  `author` prop (`null` for Repository, a username for Author — see
  the proposed milestone structure's own "PublicationCatalog ...
  RepositoryView: query = all publications ... AuthorView: query =
  current user's publications"). Owns query/page/view/group state,
  calls `SearchPublicationsUseCase` on search submit / sort change /
  page navigation, and resolves per-page enrichment (description
  snippet, fork's parent title, fork count) bounded by `pageSize` —
  never the whole catalog, which is what keeps this affordable even
  against 10,000 publications.
- `ui/components/PublicationCard.js` / `PublicationList.js` — the two
  view modes the design doc asked for (cards for visual discovery,
  a compact table for scanning hundreds/thousands quickly), both pure
  presentation components reading already-resolved props, the same
  "host resolves, component renders" convention `WorldLocationBrowser`
  (0.2.29/0.2.30) established. Each card/row shows a `PublicationPreview`,
  a truncated description (when resolved), a "🔒 Published" badge plus
  the existing "↳ Fork of X" lineage line (see docs/Principles.md,
  0.2.21's "Forked stays lineage metadata, never a lifecycle state" —
  0.2.31 doesn't add Draft/Saved states to a catalog that, by
  definition, only ever contains published Publications), author/date/
  license, and the unchanged Open/Fork/Explore actions.
- `ui/components/PublicationPreview.js` — renders whichever
  `DocumentPreview` it's given; today that's always PLACEHOLDER.
- `ui/components/PublicationCatalogToolbar.js` — search (submit-driven,
  not live — same convention `WorldSearchPanel` 0.2.26 established,
  doubly important here since a submitted description search may load
  every visible result's document), the "Include descriptions"
  checkbox, a Sort dropdown, a Group dropdown, and the Cards/List
  toggle. Sort/View/Group take effect immediately (Sort re-queries;
  View/Group are pure re-presentation of the already-loaded page).
- `ui/components/PublicationPagination.js` — explicit Previous/Next
  plus a windowed page-number list with `…` gaps (e.g. "1 … 48 49 50
  51 52 … 125"), never infinite scroll — see docs/Principles.md,
  "Explicit Pagination Is A Decentralized Honesty Feature."
- `ui/views/RepositoryView.js` / `ui/views/AuthorView.js` — both now
  thin wrappers mounting `PublicationCatalog`. AuthorView keeps its
  "Original Works & Forks" `ForkTree` section as a SEPARATE, still
  fully unpaginated `listPublicationsUseCase.execute({author})` call —
  a lineage graph needs an author's WHOLE publication set to render
  correctly (a root on page 1 could have a fork only reachable on page
  4), so pagination applies to the browsable catalog list, not to the
  tree visualization below it.

Deliberately not in 0.2.31: infinite scroll (see docs/Principles.md);
a real, immutable, content-addressed preview (see the same doc, "A
Preview Is Either Signed Or It Isn't" — this requires its own
Publication schema-evolution design, not something to decide inside a
catalog-UI milestone); license/tag/status filters beyond the search box
(the design doc listed these as "eventually perhaps," not this pass);
cross-page grouping; and an indexed metadata representation that would
make description search cheap at unbounded scale (today's description
search is a real, opt-in, per-query cost against however many
publications match title/author-independent criteria — acceptable for
"local pagination over the currently discoverable collection," the
design doc's own explicit scope for a first implementation, but a real
future scaling question once a genuinely large decentralized catalog
exists).

### Client-Side Publication Preview & Lazy Rendering (0.2.32)

0.2.31 shipped `core/DocumentPreview.js` with only a PLACEHOLDER
implementation and left the real preview question open: should an
immutable, content-addressed thumbnail travel with the Publication?
0.2.32 answers it — no — and builds the alternative: a THUMBNAIL
rendered locally, on demand, from the document's actual content, kept
entirely in a disposable client-side cache.

    Decentralized Repository → Publication → Immutable Document
                                                     │
                                    (client loads content on demand)
                                                     ▼
    ui/components/PublicationPreview.js  →  application/PreviewService.js
       (visible? IntersectionObserver)          (queue, dedupe, cache,
                                                   cancellation, priority)
                                                     │
                                                     ▼
                                    renderer/DocumentThumbnailRenderer.js
                                    (reused offscreen WebGLRenderer +
                                     core/PreviewCameraFraming.js)
                                                     │
                                                     ▼
                                     data URL, cached by contentHash
                                     (never signed, never replicated)

Core:

- `core/DocumentPreview.js` — extended, not replaced. Adds `image` (a
  local data URL) to the existing `{ type, reference }` shape and a
  new `thumbnailPreview(dataUrl)` factory alongside 0.2.31's
  `derivePlaceholderPreview`. `reference` stays exactly as 0.2.31 left
  it: reserved, unused, and now explicitly documented as such — see
  docs/Principles.md, "A Preview Is Either Signed Or It Isn't
  (0.2.31, resolved 0.2.32)." No field is added to `Publication`
  itself, and `getSigningDescriptor()` is untouched.
- `core/PreviewCameraFraming.js` (new) — `computeThumbnailCamera(bounds,
  options)`, a pure function taking a `SpatialBounds` and returning a
  deterministic `{ position, target, fovDegrees, distance }`. Frames
  the document's bounding SPHERE (radius = half the AABB diagonal, so
  the whole object fits regardless of orientation) at a fixed
  isometric angle (45° azimuth, `atan(1/√2)` elevation) — see
  docs/Principles.md, "A Preview's Camera Framing Is Deterministic;
  Its Pixels Are Not." All camera-framing decisions live here, as pure
  geometry, so they're testable without Three.js or a GPU.

Infrastructure/application:

- `renderer/DocumentThumbnailRenderer.js` (new) — a "dumb executor":
  applies whatever `computeThumbnailCamera` decided
  (`this._camera.fov = framing.fovDegrees`, position, lookAt) rather
  than deriving framing itself. Named to avoid colliding with the
  pre-existing `renderer/PreviewRenderer.js` (ghost-placement mesh
  preview, unrelated). Holds ONE reusable offscreen `WebGLRenderer`
  (`preserveDrawingBuffer: true`, never appended to the DOM) for its
  entire lifetime — created lazily, on the first real request, not
  merely because the app booted — specifically to avoid exhausting the
  browser's shared ~16-context WebGL limit across a catalog of dozens
  of thumbnails (which would break OTHER WebGL surfaces on the page,
  e.g. a live World View open in another view). Only the per-render
  MESH content (geometry/material) is disposed between renders.
- `application/PreviewService.js` (new) — the queue/cache/scheduling
  brain. `getCached(contentHash)` for a synchronous cache check;
  `request(publication, { priority })` returns `{ promise, cancel }`.
  Concurrent requests for the same `contentHash` share one job with
  multiple waiters; cancelling a waiter that isn't the job's last one
  leaves the job running for the others still waiting on it — only
  cancelling the LAST waiter actually cancels the job. Jobs drain one
  per `requestIdleCallback` tick (falling back to `setTimeout` where
  unavailable) so generation never blocks the main thread or catalog
  scrolling. Cache is a `Map` keyed by `contentHash` with LRU eviction
  via insertion-order semantics (`maxCacheEntries`, default 100) — see
  docs/Principles.md, "Previews Are Derived Client State." A failed
  document load or renderer construction resolves the job with `null`
  and moves on to the next job — it never throws, and never stops the
  queue, matching the failure-isolation posture 0.2.15/0.2.16/0.2.19
  already established.
- `application/CreatePreviewUseCase.js` (new) — wires
  `LoadPublicationDocumentUseCase` (0.2.31), a `CreateBrickRegistryUseCase`
  registry, and a lazy `() => new DocumentThumbnailRenderer(registry)`
  thunk into one `PreviewService`.

UI:

- `ui/App.js` — gains a `setup()` that constructs ONE `PreviewService`
  via `CreatePreviewUseCase` and `provide()`s it at the root, so the
  cache and queue survive navigation between Repository and Author
  views (matching the existing `provide`/`inject` convention
  `LoginModal`'s `identityUseCase` already established).
- `ui/components/PublicationPreview.js` — rewritten. `inject`s the
  shared `previewService`; on mount, checks the cache synchronously
  and, if empty, sets up an `IntersectionObserver` (`rootMargin:
  '200px'`) so a request is only ever made once the card is visible or
  about to be — see docs/Principles.md, "Preview Generation Is Bounded
  By What's Actually Visible." `beforeUnmount` disconnects the
  observer and calls `cancel()` — Vue's own unmount lifecycle, firing
  automatically whenever `PublicationCatalog.js` replaces
  `pageResult.items` (a new search, sort, or page), is what makes
  "stop rendering the old page's previews the moment the query
  changes" require zero explicit cancellation plumbing anywhere else
  in the codebase. Renders the PLACEHOLDER (unchanged from 0.2.31)
  while pending, then the resolved thumbnail `<img>`; a `--pending`
  CSS class pulses the placeholder so "still generating" is visible,
  not silent.

Deliberately not in 0.2.32: any wire-format or `Publication` schema
change (see docs/Protocol.md); a service-worker or persistent-disk
preview cache (the cache is explicitly memory-only and disposable —
see docs/Principles.md); a priority-tier system beyond "visible now"
vs. "not yet" (`IntersectionObserver` already gives that distinction
for free, so the milestone doesn't build a separate near-viewport
tier); and downloading/rendering every publication in a catalog merely
because the Repository was opened — a preview is generated only for a
publication a client has actually scrolled to.

### Avatar Identity & Presence Model (0.2.33)

The first of a multi-milestone avatar arc (0.2.33 through at least
0.2.38 — see docs/Roadmap.md). This milestone builds no rendering, no
movement input, and no networking; it establishes the MODEL boundary
those later milestones will build on top of, exactly the way 0.2.31
established `PublicationQuery`/`PublicationPage` before any catalog UI
existed. See docs/Principles.md, "Identity, Avatar Profile, and
Presence Are Three Different Questions," for the full reasoning; this
section covers the concrete files.

    Identity (existing)
         │
         ▼
    application/CreateAvatarProfileUseCase.js
         │
         ▼
    application/AvatarProfileUseCase.js  ---persists via--->  StorageProvider
         │  getProfile() / updateProfile()                  (avatar-profile:<username>)
         ▼
    core/AvatarProfile.js
    { avatarId, ownerIdentity, templateId, appearance, displayName }
         │
         │ (constructs)
         ▼
    application/CreateAvatarPresenceSessionUseCase.js
         │
         ▼
    application/AvatarPresenceSession.js   (NO StorageProvider dependency)
         │  current / update() / onPresenceChanged()
         ▼
    core/AvatarPresence.js
    { avatarId, ownerIdentity, position, rotation, animation, sequence, timestamp }

Core:

- `core/AvatarProfile.js` (new) — the persistent value object: `avatarId`,
  `ownerIdentity` (a plain string, same evolutionary choice
  `Publication.author` and `PlacementRecord.owner` made — see
  docs/Principles.md, "An Avatar Profile Can Gain A Signature Layer
  Later Without A Rewrite"), `templateId` (defaults to
  `DEFAULT_AVATAR_TEMPLATE_ID = 'humanoid-01'`; 0.2.34 defines the real
  template registry), an opaque `appearance` bag (0.2.34 defines its
  shape — 0.2.33 deliberately doesn't), and `displayName`. Immutable,
  like Publication/PlacementRecord/DocumentPreview: `withTemplateId`/
  `withAppearance`/`withDisplayName` each return a new instance with
  `updatedAt` advanced, never mutate in place.
- `core/AvatarPresence.js` (new) — the ephemeral value object:
  `avatarId`, `ownerIdentity`, `position` (`core/Position.js`),
  `rotation`, `animation` (`core/AvatarAnimationState.js`), `sequence`
  (a flat per-avatar-session counter, not a `CausalStamp` — see
  docs/Principles.md), and `timestamp`. `next({position, rotation,
  animation})` is the one way it changes: a brand new snapshot with
  `sequence` advanced by exactly 1, never a mutation of the previous
  one. No `getSigningDescriptor()` exists on this class, and none
  should ever be added — see docs/Principles.md, "Presence Is Never
  Signed, Never Persisted, Never Placed."
- `core/AvatarAnimationState.js` (new) — a small closed vocabulary
  (`IDLE`/`WALKING`/`RUNNING`/`JUMPING`) so `AvatarPresence.animation`
  is never an arbitrary, typo-prone free string. Which animation is
  actually playing and how transitions blend is 0.2.36's concern; this
  milestone only needs the shared names.

Application:

- `application/AvatarProfileUseCase.js` (new) — `getProfile()` loads
  the current identity's profile, lazily creating and persisting a
  default one on first access so the same `avatarId` survives a reload
  (the exact "load-or-create-once" shape
  `LocalIdentityProvider._loadOrCreateKeyPair` already established for
  signing keys); `updateProfile({templateId, appearance, displayName})`
  applies a partial edit and persists it; `onProfileChanged` mirrors
  `IdentityUseCase.onUserChanged`'s subscription shape. One profile per
  identity, keyed `avatar-profile:<username>` in the injected
  `StorageProvider`.
- `application/AvatarPresenceSession.js` (new) — tracks ONE user's own
  live presence for a World View session. Constructed from an
  `AvatarProfile` (never a `StorageProvider` — that dependency does
  not exist on this class at all, a structural guarantee, not a
  convention); `current` / `update(...)` / `onPresenceChanged(...)`.
  Deliberately scoped to the LOCAL avatar only — a registry of other
  participants' presences is 0.2.37's job, not this one's.
- `application/CreateAvatarProfileUseCase.js` /
  `CreateAvatarPresenceSessionUseCase.js` (new) — the usual DI wiring,
  so `ui/` never imports `storage/` directly, matching
  `CreateIdentityProviderUseCase`/`CreatePublisherUseCase`.

Deliberately not in 0.2.33: any rendering of an avatar in the Three.js
scene (0.2.35); any keyboard/controller input, camera-follow, or
collision (0.2.36); any network transport for presence updates, or a
registry of remote avatars (0.2.37); replay protection, rate limiting,
or movement-plausibility checks beyond the bare `sequence` counter
(0.2.38); and the avatar creator UI or an appearance schema (0.2.34).
No UI at all ships in this milestone — it is core/application only,
verified by `tests/AvatarProfile.test.js` and
`tests/AvatarPresence.test.js`.

### Avatar Templates & Customization (0.2.34)

Stays strictly on the persistent-profile side, exactly as scoped — no
rendering, movement, or networking. Gives `core/AvatarProfile.js`'s
`appearance` bag (opaque since 0.2.33) a real, validated, declarative
schema, backed by a small built-in template registry, and ships the
first user-visible avatar surface: the Avatar Creator.

    core/library/CoreAvatarTemplateLibrary.js  (built-in templates)
                     │
                     ▼
    core/AvatarTemplateRegistry.js  (mirrors core/BrickRegistry.js)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
    AvatarProfileUseCase    ui/views/AvatarSettingsView.js
    .updateProfile()          (Avatar Creator)
      -> STRICT, throws       -> populates every control FROM
         via                     the resolved template's own
    core/AvatarAppearanceValidator.js   declared components
                     │
    AvatarProfileUseCase
    .getEffectiveAvatar()
      -> LENIENT, never throws
         via
    AvatarTemplate.resolveEffectiveAppearance()

Core:

- `core/AvatarTemplate.js` (new) — declarative template data: `body`
  (fixed, not user-selectable), `components` (a map of `{ options,
  hasColor, multiple }` per appearance field — `hasColor` accepts a
  paired `"${name}Color"` hex field, `multiple` makes the field an
  array, e.g. `accessories`), `supportedAnimations`, and
  `defaultAppearance`. Every getter returns a frozen/defensive copy —
  a template, once constructed, cannot be mutated by a caller.
  `resolveEffectiveAppearance(appearance)` is the LENIENT read-time
  resolver: fills a complete appearance field-by-field, falling back
  to this template's own default for anything missing or invalid,
  never throwing — see docs/Principles.md, "Validate Strictly On
  Write; Degrade Gracefully On Read."
- `core/AvatarAppearanceValidator.js` (new) — `validateAvatarAppearance
  (appearance, template)`, the STRICT write-time check, returning a
  `serializer/ValidationResult.js` (reused rather than inventing a
  parallel shape — core/ already depends on serializer/ elsewhere).
  Rejects: an unknown appearance field, an option value the named
  component doesn't declare, a malformed color, a `*Color` field on a
  component without `hasColor`, an `accessories` value that isn't an
  array, an unknown entry inside it, too many entries, and an
  oversized appearance object (JSON byte cap). Reports every violation
  found, not just the first.
- `core/AvatarTemplateRegistry.js` (new) — mirrors
  `core/BrickRegistry.js` exactly: `register(library)`/`get(id)`/
  `has(id)`/`getAll()`, keyed by `templateId`.
- `core/library/CoreAvatarTemplateLibrary.js` (new) — the built-in
  `{ id: 'core', templates: [...] }` library (mirrors
  `core/library/CoreLibrary.js`'s shape), shipping two templates:
  `humanoid-01` (the full option set) and `humanoid-02` (a smaller
  variant that deliberately omits RUNNING/JUMPING from
  `supportedAnimations`, proving templates genuinely differ rather
  than sharing one hardcoded option set). No decentralized template
  distribution — both are built-in, shipped with the client.

Application:

- `application/CreateAvatarTemplateRegistryUseCase.js` (new) — builds
  an `AvatarTemplateRegistry` and registers `CoreAvatarTemplateLibrary`,
  mirroring `CreateBrickRegistryUseCase`.
- `application/AvatarProfileUseCase.js` — gains a required
  `templateRegistry` constructor dependency and two new/changed
  methods: `updateProfile()` now validates `templateId`/`appearance`
  against the resolved template before persisting anything (and resets
  appearance to the new template's defaults when `templateId` changes
  without an accompanying `appearance` — see docs/Principles.md);
  `getEffectiveAvatar()` (new) is the never-throws read path described
  above, returning `{ profile, template, appearance }`.
- `application/CreateAvatarProfileUseCase.js` — now also wires
  `CreateAvatarTemplateRegistryUseCase` and returns `templateRegistry`
  alongside `avatarProfileUseCase`.

UI:

- `ui/views/AvatarSettingsView.js` (new) — the Avatar Creator, routed
  at `/avatar` (`ui/router/index.js`) and linked from the nav
  (`ui/App.js`, "My Avatar"). Every control is populated FROM the
  currently-selected template's own `componentNames`/`getComponent()`
  data — never a hardcoded field list — so `humanoid-02` genuinely
  offers a different, smaller form than `humanoid-01`. A lightweight,
  deterministic inline SVG (torso/head/hair shapes colored from the
  live `appearance` state) gives immediate visual feedback without any
  Three.js dependency — "a lightweight template representation is
  enough," per the design doc; real World View rendering is 0.2.35.
  Skin-option-id -> swatch-color is a presentation-only lookup local
  to this one file, not part of the appearance schema. Save calls
  `updateProfile()` directly and surfaces its thrown validation error
  message inline rather than silently failing.

Deliberately not in 0.2.34: custom 3D mesh uploads, arbitrary GLTF/GLB
files, user-supplied textures, a marketplace of assets, decentralized
avatar assets, avatar animation/movement, other-user avatars, presence
networking, and blockchain/storage of appearance assets — see
docs/Principles.md, "A Template Is A Closed Vocabulary, Not An Asset
Loader," for why deferring all of these is a safety property, not
merely a scheduling one. Also not in 0.2.34: per-option human-readable
labels (the Avatar Creator shows raw option ids like `hair-07`) — a
presentation-only polish item, not a modeling one.

### Avatar Rendering & World Presence (0.2.35)

Makes the avatar physically exist in the Three.js scene, combining
0.2.33's persistent profile with 0.2.34's validated appearance and
0.2.33's ephemeral presence — rendering only, no movement input, no
multiplayer. The renderer consumes two independent inputs
(`AvatarProfileUseCase.getEffectiveAvatar()` and
`AvatarPresenceSession.current`) and never modifies either — see
docs/Principles.md, "An Avatar's Location Comes From Presence, Never
From The Avatar Itself."

    AvatarProfile ──┐
                     ▼
         getEffectiveAvatar() → { template, appearance }
                     │
                     ▼
         renderer/AvatarRenderer.js (build/applyPose)
                     │
                     ▼
         renderer/AvatarVisual.js (root + poseGroup,
                                    diff/rebuild lifecycle)
                     │
                     ▼            ▲
    application/RenderWorldViewUseCase.js facade
    (setLocalAvatar / updateLocalAvatarAppearance /
     updateLocalAvatarPresence / setLocalAvatarVisible /
     removeLocalAvatar)
                     ▲
                     │
         WorldNavigationSession._setupLocalAvatar()
                     ▲
                     │
         AvatarPresence.position/rotation/animation ──┘

Core:

- `core/AvatarPoseOffsets.js` (new) — `getAvatarPoseOffsets(animation)`,
  a pure, Three.js-free function mapping an `AvatarAnimationState` to a
  static pose (`legSplayDegrees`/`armSwingDegrees`/`bodyTiltDegrees`/
  `headTiltDegrees`/`hopHeight`). Same "pure geometry, independently
  testable" split `core/PreviewCameraFraming.js` (0.2.32) established.
  Falls back to the neutral (IDLE) pose for an unrecognized value
  rather than throwing. "Static pose for each state is sufficient for
  0.2.35" per the design doc — real animation blending/timing is
  0.2.36.

Renderer:

- `renderer/AvatarRenderer.js` (new) — the "dumb executor": converts a
  `template`+`appearance` pair into a real `THREE.Group` (`build()`),
  and applies `core/AvatarPoseOffsets.js`'s numeric offsets to an
  existing pose group (`applyPose()`) without rebuilding geometry.
  Component -> geometry mapping (head=sphere, hair=hemisphere,
  shirt=box "torso", pants=box "legs") is a deliberate, renderer-owned
  decision — see docs/Principles.md, "A Template Is A Closed
  Vocabulary, Not An Asset Loader" (0.2.34) for why this mapping could
  never live in template data itself. Accessories go one level
  further: each known option id (`glasses-01`, `hat-01`, `backpack-01`,
  `scarf-01`) has its OWN builder function and its own position (face,
  head, back, neck respectively) via an `ACCESSORY_BUILDERS` lookup,
  with a single explicit fallback marker for any id not yet given a
  bespoke shape — see docs/Principles.md, "An Accessory Option Id Is
  Still Just An Id" (0.2.35 follow-up) for why the first pass's shared
  generic marker was a bug, not a simplification. `build()` returns
  `{ root, poseGroup }`: `root` is what
  a caller adds to the scene and is the ONLY thing `AvatarVisual` ever
  moves; `poseGroup`, nested inside `root`, is the ONLY thing pose
  transforms ever touch — see docs/Principles.md for why this split is
  load-bearing, not stylistic. Skin-option-id -> color is a
  presentation-only lookup local to this file (a separate, smaller
  copy of the same idea `ui/views/AvatarSettingsView.js`'s SVG preview
  already uses — the two intentionally don't share a table).
- `renderer/AvatarVisual.js` (new) — one avatar's live Three.js state:
  `setAppearance()` diffs by content (a cheap string-key comparison)
  and only rebuilds when the appearance actually changed — "if the
  first implementation simply rebuilds the avatar when its appearance
  changes, that's perfectly acceptable" per the design doc, so no
  finer-grained per-component diffing was attempted. `setPose()`/
  `setAnimation()` are pure transform writes, never geometry rebuilds.

Application:

- `application/RenderWorldViewUseCase.js` — gains a local-avatar
  facade (`setLocalAvatar`/`updateLocalAvatarAppearance`/
  `updateLocalAvatarPresence`/`setLocalAvatarVisible`/
  `removeLocalAvatar`), backed by exactly ONE `AvatarVisual` — 0.2.35
  renders only the local user's own avatar; a registry of others is
  0.2.37. The `AvatarVisual` is constructed lazily (on the first
  `setLocalAvatar` call), so a viewport with nobody logged in never
  builds one.
- `application/WorldNavigationSession.js` — gains optional
  `avatarProfileUseCase`/`avatarPresenceSession` constructor
  dependencies (absent when nobody is logged in, the same
  "enforce/offer only when the collaborator is actually wired" pattern
  `spatialDiscoveryProvider` — 0.2.30 — already established) and
  `_setupLocalAvatar()`, called from `start()`: sets the avatar's
  initial appearance/pose, then subscribes to
  `avatarProfileUseCase.onProfileChanged` (→ `updateLocalAvatarAppearance`)
  and `avatarPresenceSession.onPresenceChanged` (→
  `updateLocalAvatarPresence`) so either input changing propagates
  automatically. `dispose()` unsubscribes both before tearing down the
  render facade. `setLocalAvatarVisible(visible)`/
  `isLocalAvatarVisible()`/`hasLocalAvatar()` round out the public
  surface the UI drives. `focusDocument()` (called by
  `navigateToDocument()`) also calls `_spawnAvatarNear(layoutPos)`,
  which repositions a still-untouched (`sequence === 0`) avatar to
  spawn a small offset from whichever document is first focused,
  instead of leaving it at literal world origin — see
  docs/Principles.md, "A Fresh Avatar Spawns Near What You're Looking
  At, Not At A Fixed Point" (a 0.2.35 follow-up fix; a document's own
  placement, per 0.2.24's deterministic grid strategy, is essentially
  never near the origin, so the avatar was rendering correctly but was
  effectively always out of frame until this shipped).
- `application/CreateWorldViewUseCase.js` — wires
  `CreateAvatarPresenceSessionUseCase` (reusing the SAME
  `avatarProfileUseCase` instance it already builds internally for
  `avatarPresenceSession`, so the two never drift into independently-
  constructed views of the same identity's storage) ONLY when
  `identityProvider.currentUser()` is truthy; both stay `null`
  otherwise.

UI:

- `ui/views/WorldView.js` — now `inject`s `identityUseCase` (it never
  needed identity before this milestone) and passes
  `identityUseCase.provider` into `CreateWorldViewUseCase().execute(...)`.
  Gains a "Show My Avatar" checkbox (bound to a local `showMyAvatar`
  ref, disabled when `session.hasLocalAvatar()` is false) and a
  disabled, checked "Show Other Avatars" checkbox reserved for 0.2.37
  — see docs/Principles.md, "Avatar Visibility Is A Client Rendering
  Preference, Not Avatar State." Deliberately NO avatar selection/click
  handling — see the design doc's own "Looking at or selecting an
  avatar must never make its owner the active document"; clicking an
  avatar mesh does nothing in 0.2.35 (it isn't registered with
  `PickingService`/`MeshRegistry` at all).

Deliberately not in 0.2.35: WASD/controller movement, collision
detection, inverse kinematics or skeletal animation, multiplayer,
remote avatars, presence broadcasting, signed movement, replay
protection, avatar asset downloading, and user-uploaded 3D models —
see docs/Roadmap.md for 0.2.36-0.2.38. Also not in 0.2.35: avatar
selection/inspection (deliberately deferred as a distinct
presence-selection concept, not document selection — see the design
doc), and any change to how a document's own `WorldPlacement` is
resolved or rendered — `WorldRenderer`/`addWorld`/`removeWorld` are
completely untouched by this milestone.

### Local Avatar Movement & Animation (0.2.36)

Turns the avatar from a rendered object into an embodied local
participant — WASD movement, Shift to run, Space to jump, a real
elapsed-time gait cycle, and an optional "Follow Avatar" camera mode.
Entirely local: no network, no multiplayer, no remote avatars. The
central rule, restated from the design doc and enforced by
construction, not convention: **input changes Presence; Presence
changes the renderer — input never directly touches a Three.js
object.**

    Keyboard (WASD/Shift/Space)
              │  session.avatarKeyDown/avatarKeyUp
              │  (only while Avatar Control Mode is on)
              ▼
    application/AvatarMovementController.js
              │  tick(deltaSeconds), once per render frame
              ▼
    core/AvatarMovementSimulation.js (PURE kinematics)
              │  { position, rotationY, animation, ... }
              ▼
    AvatarPresenceSession.update(...)
              │  sequence advances by exactly 1 per accepted update
              ├──────────────────────────────┐
              ▼                               ▼
    renderer/AvatarVisual.js          WorldNavigationSession
    (setPose/setAnimation)            ._followAvatarIfEnabled()
              │                               │
              ▼                               ▼
        Three.js scene                 SpatialCameraController
                                        .moveCamera(delta)

Core:

- `core/AvatarMovementState.js` (new) — a pure snapshot of INPUT
  INTENT (`forwardAxis`/`turnAxis`/`running`/`jumpRequested`, each
  axis clamped to -1/0/1), built fresh every tick from whatever keys
  are currently held. Deliberately NOT keyboard state itself and never
  written to `AvatarPresence` — see docs/Principles.md, "AvatarPresence
  Is The Result Of Simulation, Not The Simulation Itself."
- `core/AvatarMovementSimulation.js` (new) — `simulateAvatarMovement()`,
  a pure, Three.js-free function: given a position/rotationY/
  verticalVelocity/grounded snapshot and an `AvatarMovementState`, plus
  `deltaSeconds`, returns the next tick's snapshot and the animation
  state that follows from it. Same "pure geometry, independently
  testable" split `core/PreviewCameraFraming.js`/`AvatarPoseOffsets.js`
  already established. Sanitizes NaN/Infinity, clamps `deltaSeconds`
  and per-tick step distance, and clamps Y to a reasonable range — see
  docs/Principles.md, "Movement Is Kinematic, Not Physically
  Simulated." No brick, building, or document is ever consulted —
  the avatar can walk through a published structure; that limitation
  is explicit, not an oversight.
- `core/AvatarPoseOffsets.js` — `getAvatarPoseOffsets(animation,
  animationTimeSeconds = 0)` gains its second parameter: WALKING/
  RUNNING now layer a real sine-wave gait cycle (leg swing + a bounce)
  on top of 0.2.35's static base pose, using elapsed time (never a
  frame count) — see docs/Principles.md, "Animation Is Driven By
  Elapsed Time, Never By Frame Count." `animationTimeSeconds = 0`
  reproduces 0.2.35's original static values exactly, so nothing about
  the 0.2.35 pose table changed, only what happens as time advances.
  IDLE/JUMPING are untouched by time on purpose — jumping's real
  vertical motion now comes from `AvatarMovementSimulation`'s own Y,
  not a second, competing local oscillation.

Renderer:

- `renderer/AvatarRenderer.js` — `applyPose(poseGroup, animation,
  animationTimeSeconds = 0)` passes the new parameter straight through
  to `getAvatarPoseOffsets`.
- `renderer/AvatarVisual.js` — gains `tick(deltaSeconds)`: advances a
  LOCAL gait-clock (`_animationTime`, reset to 0 on every animation
  STATE change so a fresh cycle never pops mid-stride) and re-applies
  the pose every render frame, independent of how often a new
  `AvatarPresence` actually arrives. This clock is a pure rendering-
  smoothness concern — never written back anywhere, never part of
  `AvatarPresence` (a future network peer has no reason to know or
  care about the sender's local animation clock).
- `renderer/AnimationLoop.js` — `onFrame` now receives real
  `deltaSeconds` (computed from the `requestAnimationFrame` timestamp,
  clamped to 0.25s to absorb a backgrounded-tab resume) instead of
  nothing. This is the ONE clock every time-based consumer in the
  renderer ultimately reads from.
- `renderer/Renderer.js` — gains a generic `addFrameListener(callback)`
  registry (deliberately NOT avatar-specific — this class "owns the
  visualization pipeline only," per its own header) that `_renderFrame`
  invokes with `deltaSeconds` every frame, before rendering.

Application:

- `application/AvatarMovementController.js` (new) — the one place raw
  input becomes a presence update. `keyDown`/`keyUp` recognize only
  W/A/S/D/Shift/Space (case-insensitive) and deliberately do NOT alias
  the arrow keys, which already mean "nudge the selection" (see
  `application/EditorActionRegistry.js`) — Avatar Control Mode must
  never silently steal that binding. `tick(deltaSeconds)` runs
  `simulateAvatarMovement()` and publishes a new `AvatarPresence` via
  `avatarPresenceSession.update()` ONLY when the result actually
  differs from the current presence (position/rotation/animation) — an
  avatar standing still, already grounded, with nothing held is an
  EXACT no-op, so `sequence` only ever advances on a change a viewer
  would actually notice, never once per render frame regardless of
  motion. `_verticalVelocity`/`_grounded` are this controller's own
  small bit of physics bookkeeping between ticks, deliberately never
  part of `AvatarPresence` itself. `releaseAll()` clears every held key
  — called whenever Avatar Control Mode is turned off, so a keyup the
  browser never delivered (alt-tab mid-stride) can never leave the
  avatar walking forever.
- `application/RenderWorldViewUseCase.js` — registers a frame listener
  that ticks the local `AvatarVisual`'s gait clock every frame
  (harmless no-op before any avatar exists), and exposes
  `onAnimationFrame(callback)` as a thin pass-through to
  `Renderer.addFrameListener` so `WorldNavigationSession` can tick its
  own movement controller through the same loop.
- `application/WorldNavigationSession.js` — `_setupLocalAvatar()`
  additionally constructs an `AvatarMovementController` and, when the
  render facade supports `onAnimationFrame`, subscribes to it to drive
  `controller.tick(deltaSeconds)` every frame. New public surface:
  `isAvatarControlModeActive()`/`setAvatarControlMode(active)` (turning
  it off calls `releaseAll()` immediately), `avatarKeyDown(key)`
  (forwards only while control mode is active, returns whether the key
  was consumed) / `avatarKeyUp(key)` (always forwarded, regardless of
  mode, so a key held before the mode was toggled off still cleanly
  releases), and `isFollowingAvatar()`/`setFollowAvatar(enabled)`.
  `_followAvatarIfEnabled(presence)`, invoked from the existing
  `avatarPresenceSession.onPresenceChanged` subscription, shifts the
  camera by EXACTLY the avatar's own movement delta via
  `SpatialCameraController.moveCamera(delta)` — the same method that
  already moves position and target together, preserving whatever
  orbit offset the user last set — and calls nothing else: never
  `focusDocument()`, never `setActiveDocument()`. See
  docs/Principles.md, "Following The Avatar Never Redefines What The
  Camera Is Looking At." The avatar's own last-known position is
  tracked unconditionally (even while follow is off) so re-enabling it
  never yanks the camera through movement that happened while
  unobserved. `dispose()` unsubscribes the frame listener and clears
  the movement controller alongside the existing avatar subscriptions.

UI:

- `ui/views/WorldView.js` — two new checkboxes in the Avatar panel,
  "Control My Avatar (WASD, Shift, Space)" and "Follow Avatar," both
  off by default and disabled when `hasLocalAvatar` is false, mirroring
  `showMyAvatar`'s existing pattern. A new `keyup` listener and a
  `window blur` listener (which forces control mode off — an
  alt-tab/DevTools-breakpoint can swallow a keyup entirely) sit
  alongside the existing `keydown` listener. `onKeyDown`'s existing,
  ordered guard chain (text input > palette > gizmo gesture > ...)
  gains ONE new tier, immediately after the gizmo-gesture guard: avatar
  movement keys are consumed only while Control Mode is on, and only
  when the event target isn't a text input — everything else falls
  through exactly as if the tier didn't exist. Checking any of the
  three Avatar-panel checkboxes calls a shared `blurCheckbox(event)`
  helper afterward — a `<input type="checkbox">` is, structurally, still
  an `<input>`, and `InputRouter.isTextInputTarget()` correctly treats
  every `<input>` as "owns its own keys"; without giving focus back
  immediately, the very next WASD press after checking a box would be
  silently swallowed by that same, correct rule instead of reaching
  the avatar.

Deliberately not in 0.2.36: collision or navigation constraints against
world geometry (the avatar can walk through a building), inverse
kinematics or skeletal animation, multiplayer, remote avatars, presence
broadcasting, signed movement, and replay protection — see
docs/Roadmap.md for 0.2.37/0.2.38. Also not in 0.2.36: any change to
`AvatarPresence`'s own shape (still exactly `position`/`rotation`/
`animation`/`sequence`/`timestamp`) — movement produces the same kind
of presence update 0.2.35's spawn-repositioning already did, just far
more often, and any change to how a document's own `WorldPlacement` is
resolved, rendered, or persisted — verified directly (byte-identical
placement JSON before/after two seconds of walking) in the flagship
test.

### Decentralized Avatar Presence Synchronization (0.2.37)

Makes the local avatar's presence observable by OTHER replicas, while
keeping it exactly as ephemeral and non-authoritative as 0.2.33
established — no signatures, no persistence, no CausalStamp. This is
transport and lifecycle only: sequence-tolerant acceptance of
disordered/duplicate/gapped updates, and derived (never stored)
PRESENT/STALE/ABSENT observation. Trust — is a claim even believable,
replay protection, conflict resolution — is explicitly 0.2.38's job;
see docs/Principles.md, "0.2.37 Establishes Transport Semantics; 0.2.38
Establishes Trust Semantics."

    Local:  AvatarPresenceSession.onPresenceChanged
                          │  (only on an ACCEPTED update — an idle
                          │   avatar publishes nothing)
                          ▼
            toAvatarPresenceAdvertisement()
                          │
                          ▼
            PresenceSyncService.publish()
                          │
                          ▼
            AvatarPresenceBroadcastProvider.advertise()
                          │
              (BroadcastChannel — same-origin, cross-tab)
                          ▼
    Remote: AvatarPresenceBroadcastProvider.onAdvertisement()
                          │  (queues into an inbox — never writes
                          │   directly into session state)
                          ▼
            PresenceSyncService.pull()  ◄── called once per render
                          │                  frame, THIS replica's
                          │                  own schedule
                          ▼
            LocalPresenceStore.ingest()
                          │  (core/PresenceIngestion.js: newer
                          │   sequence always wins)
                          ▼
            LocalPresenceStore.list()
                          │  (derives PRESENT/STALE/ABSENT from
                          │   elapsed time on THIS replica's clock;
                          │   prunes ABSENT records as a side effect)
                          ▼
            RemoteAvatarRegistry.sync() / .tick()
                          │  (reconcile which avatars exist;
                          │   RemoteAvatarInterpolator smooths
                          │   toward the latest AUTHORITATIVE value)
                          ▼
            render facade (setRemoteAvatar / updateRemoteAvatarPresence
                            / removeRemoteAvatar)
                          ▼
                    Three.js scene

Core:

- `core/AvatarPresenceAdvertisement.js` (new) — `toAvatarPresenceAdvertisement(presence)`,
  a pure function producing the WIRE shape: `avatarId`/`ownerIdentity`/
  `position`/`rotation`/`animation`/`sequence` — deliberately a STRICT
  SUBSET of `AvatarPresence.toJSON()`, omitting `timestamp` on purpose
  — see docs/Principles.md, "A Presence Advertisement Is A Transport
  Shape, Not A Second Presence Model." `isValidAvatarPresenceAdvertisement()`
  is the defensive shape check applied at the ingestion boundary —
  nothing arriving over a broadcast transport is trusted structurally.
- `core/PresenceLifecycleState.js` (new) — the closed vocabulary
  `PRESENT`/`STALE`/`ABSENT`, same `Object.freeze` + `isValid*`
  pattern `AvatarAnimationState` already established.
- `core/PresenceFreshness.js` (new) — `derivePresenceLifecycleState({
  receivedAt, now, staleAfterMs, absentAfterMs })`, a pure function of
  elapsed time on the RECEIVER's own clock — see docs/Principles.md,
  "Presence Lifecycle State Is A Derived Observation, Not A Stored
  Fact."
- `core/PresenceIngestion.js` (new) — `resolveIncomingPresence(current,
  incoming)`: accept if and only if `incoming.sequence >
  current.sequence` (or nothing is stored yet). The one rule that
  makes disordered/duplicate/gapped delivery a non-issue — see
  docs/Principles.md, "0.2.37 Establishes Transport Semantics; 0.2.38
  Establishes Trust Semantics."
- `core/PresenceInterpolation.js` (new) — `interpolatePresence(from,
  to, t)`: pure linear position blending plus shortest-arc rotation
  blending; `animation` is never blended, it snaps to `to`'s value.
  See docs/Principles.md, "The Authoritative Position Is Always The
  Latest Presence; Interpolation Is Only Ever A Presentation Detail."

Transport (new top-level `presence/` directory, mirroring `discovery/`'s
abstract-base + `Local*` shape):

- `presence/AvatarPresenceBroadcastProvider.js` (new) — base class:
  `advertise(advertisement)` / `onAdvertisement(callback)` /
  `dispose()`. No `save()`/`load()` — presence is never persisted, so
  this is deliberately not modeled after `StorageProvider`.
- `presence/LocalAvatarPresenceBroadcastProvider.js` (new) — the
  concrete, WORKING transport: the browser's own `BroadcastChannel`
  API, scoped to one same-origin channel name. Two browser tabs on the
  same origin genuinely see each other's avatars move — a real,
  demonstrable decentralized simulation, not a mock, the same "Local"
  pattern `LocalDiscoveryProvider`/`LocalSpatialIndexProvider` already
  established, just built on a non-persistent transport primitive
  instead of localStorage. Degrades to a silent no-op in an
  environment without `BroadcastChannel` rather than throwing.

Application:

- `application/LocalPresenceStore.js` (new) — `avatarId -> { advertisement,
  receivedAt }`, the ingestion boundary: `ingest()` runs every incoming
  advertisement through `core/PresenceIngestion.js` before accepting
  it; `list(now)` derives each record's lifecycle state and PRUNES any
  that have aged into ABSENT as a side effect of being asked. Never
  StorageProvider-backed — nothing here survives a reload.
- `application/PresenceSyncService.js` (new) — the advertise/pull round
  trip: `publish(advertisement)` hands a local update to the transport;
  `pull(now)` drains whatever arrived since the last pull through
  `LocalPresenceStore.ingest()` and returns the current known-presences
  list. The broadcast provider's own callback only ever appends to an
  inbox — `pull()` is the ONE place a raw network message becomes this
  replica's own accepted state; see docs/Principles.md, "Never Let A
  Transport Callback Write Directly Into Session State." Filters out
  the local avatar's own id defensively (a channel never delivers its
  own message, but this stays as defense in depth for a future
  transport that might not offer that guarantee for free).
- `application/RemoteAvatarInterpolator.js` (new) — ONE remote avatar's
  interpolation state (`_from`/`_to`/`_startedAt`). `retarget()` only
  fires on a genuinely new sequence, snapshotting the CURRENT
  interpolated position as the new `_from` so a rapid string of
  updates blends smoothly instead of jerking; `sequence` always reads
  `_to`, never the interpolated value.
- `application/RemoteAvatarRegistry.js` (new) — reconciles which
  remote avatars exist against `PresenceSyncService`'s known-presences
  list (`sync()`) and drives every known avatar's interpolated pose to
  the render facade every frame (`tick()`) — the same
  presence-driven-update vs. time-driven-tick split
  `renderer/AvatarVisual.js` already draws for the local avatar.
  Appearance is NOT part of what this class manages: every remote
  avatar renders with a single, fixed placeholder template+appearance
  resolved once by `WorldNavigationSession` and handed in unchanged —
  0.2.37 does not synchronize real appearance at all.
- `application/RenderWorldViewUseCase.js` — gains the remote-avatar
  counterpart to the local-avatar facade: `setRemoteAvatar`/
  `updateRemoteAvatarPresence`/`removeRemoteAvatar`/
  `setRemoteAvatarsVisible`, backed by a `Map<avatarId, AvatarVisual>`.
  Reuses `AvatarRenderer`/`AvatarVisual` completely unmodified — to
  this facade, a remote avatar is just another `AvatarVisual` driven
  by `RemoteAvatarRegistry` instead of local movement input. The
  existing per-frame gait-clock tick now covers every known remote
  avatar too.
- `application/WorldNavigationSession.js` — gains optional
  `presenceBroadcastProvider`/`avatarTemplateRegistry` constructor
  dependencies and `_setupRemoteAvatars()`, called from `start()`
  BEFORE `_setupLocalAvatar()` (whose presence-changed subscription
  now also calls `presenceSyncService.publish()` on every ACCEPTED
  local update — an idle avatar publishes nothing, extending 0.2.36's
  "no movement, no sequence advancement" rule one hop further: no
  sequence advancement, no network traffic). `_setupRemoteAvatars()`
  is deliberately independent of `hasLocalAvatar()` — see
  docs/Principles.md, "Watching Presence Never Requires Having One."
  New public surface: `isRemoteAvatarsVisible()`/
  `setRemoteAvatarsVisible()` (a pure client rendering preference,
  exactly like `setLocalAvatarVisible`) and
  `getKnownRemoteAvatarCount()` (debug/UI surface).
- `application/CreateWorldViewUseCase.js` — constructs
  `LocalAvatarPresenceBroadcastProvider` and the avatar template
  registry (via the existing `CreateAvatarTemplateRegistryUseCase`)
  UNCONDITIONALLY, never gated on login state — matching "Watching
  Presence Never Requires Having One."

UI:

- `ui/views/WorldView.js` — "Show Other Avatars" (shipped disabled
  since 0.2.35) becomes a real, functional toggle — deliberately NOT
  disabled by `hasLocalAvatar`, since seeing other replicas' avatars
  never requires having your own.

Deliberately not in 0.2.37: signatures on presence, `CausalStamp`,
conflict resolution, equivocation detection, replay protection,
persistent presence, avatar collision, avatar-to-avatar interaction,
voice/chat, remote avatar editing, avatar ownership transfer, and
decentralized avatar-template distribution — see docs/Roadmap.md for
0.2.38. Also not in 0.2.37: real appearance synchronization (every
remote avatar renders with a fixed placeholder look, never the
sender's actual customized appearance), and any change to
`AvatarPresence`'s own shape or to how a document's own
`WorldPlacement`/`Publication`/spatial index is resolved, rendered, or
persisted — verified directly (byte-identical placement JSON, unchanged
document/spatial-index counts) in the flagship test.

### Presence Trust, Replay & Conflict Handling (0.2.38)

Hardens the ingestion boundary 0.2.37 built — never redesigns
presence synchronization itself. `core/PresenceIngestion.js`,
`core/PresenceFreshness.js`, `core/PresenceInterpolation.js`,
`application/PresenceSyncService.js`, `application/RemoteAvatarInterpolator.js`,
`application/RemoteAvatarRegistry.js`, and the `presence/` transport are
all UNCHANGED. One new gate sits between "an advertisement arrived"
and "this replica's state changed":

    PresenceSyncService.pull()
                  │
                  ▼
    PresenceTrustBoundary.evaluate(incoming, current)
                  │  1. structurally valid?           (core/AvatarPresenceAdvertisement.js)
                  │  2. signature verifies, or unsigned
                  │     tolerated by policy?           (identity/LocalAuthorizationVerifier.js,
                  │                                     core/PresenceTrustPolicy.js)
                  │  3. claimant authorized for this
                  │     avatarId?                      (core/PresenceAuthority.js)
                  │  4. already accepted before?        (core/PresenceReplayWindow.js)
                  │  5. conflicts with what's held at
                  │     the same sequence?              (core/PresenceEquivocation.js)
                  │  6. actually newer?                 (core/PresenceIngestion.js — UNCHANGED)
                  ▼
    LocalPresenceStore.ingest()  ── accept: replaces the stored record
                  │                 reject: record UNCHANGED, but the
                  │                 TrustObservation is still kept
                  ▼
    LocalPresenceStore.list()  ── { advertisement, lifecycleState,
                                     trustObservation } per avatarId
                  ▼
    RemoteAvatarRegistry.sync()/.tick()   (reads .advertisement/.lifecycleState
                  │                        ONLY — trustObservation never
                  │                        reaches rendering)
                  ▼
            render facade  ──────────────────  core/PresenceDiagnosticsSummary.js
                                                        │
                                                        ▼
                                                 WorldView "Other Avatars: N
                                                 (trusted/stale/conflicting/
                                                  unavailable)"

Core (all new, all pure/stateless-or-boundedly-stateful, no I/O):

- `core/PresenceAuthority.js` — `PresenceAuthorityRegistry`: a
  trust-on-first-use `avatarId -> { ownerIdentity, signerId }` binding.
  The FIRST accepted claim for an avatarId establishes who may speak
  for it; a signed binding can never be replaced by a different signer
  or downgraded to unsigned, though an unsigned binding upgrades
  gracefully the first time a real signer claims it. Never cleared on
  ABSENT-prune — see docs/Principles.md, "An Avatar ID Identifies An
  Avatar; It Does Not Prove Who Currently Controls It."
- `core/PresenceEquivocation.js` — `detectPresenceEquivocation(current,
  incoming)`: pure, stateless comparison (not an accumulating detector
  like `core/IndexEquivocation.js` — a presence record has exactly one
  "current" slot to compare against, so no accumulator is needed).
  Returns a `PresenceEquivocation` the moment two claims share an
  avatarId and sequence but disagree on content; reuses
  `core/TrustObservation.js`'s existing `EQUIVOCATING` status.
- `core/PresenceReplayWindow.js` — bounded (default 64 entries per
  avatarId) "have I already accepted this exact claim" memory.
  Deliberately NOT `replication/ReplayGuard.js` — that class remembers
  every hash forever, appropriate for rare durable-record events, a
  leak for a 60Hz-capable ephemeral stream. See docs/Principles.md,
  "Replay Detection And Freshness Are Different Questions."
- `core/PresenceTrustPolicy.js` — the one real policy axis:
  `requireSignedPresence`. `.permissive()` (default) tolerates unsigned
  presence exactly like 0.2.37; `.hardened()` requires a valid
  signature on everything. Mirrors `identity/TrustPolicy.js`'s
  permissive/hardened shape without inheriting its unrelated
  spatial-index-specific options.
- `core/PresenceDiagnosticsSummary.js` — `summarizePresenceDiagnostics(knownPresences)`:
  pure bucketing into trusted/stale/conflicting/unavailable counts for
  World View's diagnostic line.
- `core/TrustObservation.js` gains one new status, `REPLAYED` — every
  other status this milestone needs (`VALID`, `UNAUTHORIZED`, `STALE`,
  `EQUIVOCATING`, `MISSING`, `UNAVAILABLE`, `INVALID_SIGNATURE`)
  already existed from 0.2.19.
- `core/Signature.js` gains `SignatureType.AVATAR_PRESENCE`.
- `core/AvatarPresenceAdvertisement.js` gains
  `getAvatarPresenceSigningDescriptor(advertisement)` — the canonical
  signing envelope covering EVERY field (avatarId, ownerIdentity,
  position, rotation, animation, sequence). Never a narrower subset —
  signing only avatarId+sequence would let an attacker keep a valid
  signature while swapping in a different position, recreating 0.2.18's
  causal-history signing bug one level up.

Identity:

- `identity/LocalAuthorizationVerifier.js` gains
  `verifyPresenceAdvertisement(advertisement)` — same shape as
  `verifyIndexRoot()`: an advertisement carries no identity payload of
  its own, so the did:key signer of a valid signature IS the public
  key. Unsigned is reported, not rejected, at this layer — policy
  decides whether that is tolerated.

Application:

- `application/PresenceSigning.js` (new) — `signAvatarPresenceAdvertisement(advertisement,
  identityProvider)`: attaches a real Ed25519 signature when the
  identityProvider can produce one, otherwise returns the advertisement
  completely unchanged. Never throws — a not-logged-in or
  signing-incapable identityProvider degrades to unsigned rather than
  breaking presence publishing.
- `application/PresenceTrustBoundary.js` (new) — the orchestrator
  described in the diagram above. Composes `LocalAuthorizationVerifier`,
  `PresenceAuthorityRegistry`, `PresenceReplayWindow`,
  `PresenceTrustPolicy`, `detectPresenceEquivocation`, and the
  UNCHANGED `resolveIncomingPresence`, in that order, into one
  `evaluate(incoming, current)` call returning `{ accepted, observation }`.
- `application/LocalPresenceStore.js` — `ingest()` now delegates its
  entire accept/reject decision to an injected `PresenceTrustBoundary`
  (defaulting to a permissive one, so a store built without one behaves
  EXACTLY as 0.2.37 left it). Every avatarId's most recent
  `TrustObservation` is remembered even when the claim that produced it
  was rejected, and `list()` now returns it alongside
  `advertisement`/`lifecycleState` — diagnostics-only, never consumed
  by `RemoteAvatarRegistry`.
- `application/WorldNavigationSession.js` — `_setupLocalAvatar()`'s
  publish call now runs the outgoing advertisement through
  `signAvatarPresenceAdvertisement()` before handing it to
  `PresenceSyncService.publish()`. New public surface:
  `getRemoteAvatarDiagnostics()`, reading
  `PresenceSyncService.listKnownPresences()` (never `pull()` — no side
  effects on the real per-frame ingestion loop) through
  `summarizePresenceDiagnostics()`.

UI:

- `ui/views/WorldView.js` — an unobtrusive diagnostic line under "Show
  Other Avatars": "Other Avatars: N (X trusted, Y stale, Z conflicting,
  W unavailable)", refreshed on the same 3-second cadence as the rest
  of World View's spatial UI, hidden entirely when there are no known
  remote avatars. Never rendered ON an avatar itself — see
  docs/Principles.md, "Rendering Presence And Trusting Presence Remain
  Separate."

Deliberately not in 0.2.38: physical-plausibility checks (is a claimed
position actually reachable from the previous one — see
docs/Principles.md's 0.2.38 update to "0.2.37 Establishes Transport
Semantics..."), rate limiting, mandatory signing (permissive stays the
default), `CausalStamp`, persistent presence, an `AvatarProfile`
signature/distribution layer, avatar collision, avatar-to-avatar
interaction, voice/chat, and any redesign of 0.2.37's transport or
advertise/pull round trip — every one of those files is untouched.
Also not in 0.2.38: any change to how a document's own
`WorldPlacement`/`Publication`/spatial index is resolved, rendered, or
persisted — verified directly (byte-identical placement JSON, unchanged
document/spatial-index counts) in the flagship test, exactly as 0.2.37's
own flagship verified.

### World Entity Interaction & Selection (0.2.39)

Makes avatars first-class interactive World View entities — clickable,
inspectable, followable — WITHOUT making them documents, placements,
or editable world content. See docs/Principles.md, "Avatars Are Never
Document Selection." Formalizes the click-priority chain the design
doc called for:

    click
      │
      ▼
    gizmo active? ──yes──► TransformGizmoController (unchanged)
      │no
      ▼
    brick raycast (renderer/PickingService.js)
    avatar raycast (renderer/AvatarPickingService.js)   ◄── run together,
      │                                                     compared by distance
      ▼
    nearer of {brick, avatar} wins, or ground, or empty
      │
      ├── avatar  → AvatarInteractionState set, SpatialSelectionState cleared
      ├── brick   → SpatialSelectionState set,  AvatarInteractionState cleared
      ├── ground  → SpatialSelectionState set,  AvatarInteractionState cleared
      └── empty   → both cleared

Application:

- `application/spatial-state/AvatarInteractionState.js` (new) — the
  avatar-target counterpart to `SpatialSelectionState`/`SpatialHoverState`:
  `{ avatarId }`, `isEmpty`, `static empty()`/`avatar(avatarId)`. A
  SEPARATE state slice on purpose — see docs/Principles.md.
- `application/AvatarPresenceLabels.js` (new) — `describeLifecycleState()`/
  `describeTrustStatus()`, human-readable labels for
  `PresenceLifecycleState`/`TrustStatus`, shared by `AvatarInfoPanel.js`,
  same reasoning as `application/LicenseLabels.js`.
- `application/RemoteAvatarRegistry.js` — gains `has(avatarId)` and
  `currentPosition(avatarId, now)`, reading the SAME
  `RemoteAvatarInterpolator` `tick()` already drives — used by
  avatar-follow and by pruning an interaction target the moment its
  presence actually expires.
- `application/WorldNavigationSession.js` — `pick()` now also calls
  `this._session.pickAvatar()` (guarded — a facade without it degrades
  to "no avatar hit," never throws) and compares its `distance` against
  a simultaneous brick hit's own `distance`; whichever branch wins
  explicitly clears the OTHER state slice. New public surface:
  `getAvatarInteraction()`, `getAvatarInfo()` (resolves the current
  target into plain data — local avatar from `AvatarProfileUseCase`/
  `AvatarPresenceSession`, remote avatar from `PresenceSyncService.listKnownPresences()`,
  read-only, mirrors 0.2.29's `inspectDocument()`), `isLocalAvatarId()`,
  `getCameraPosition()` (a lighter alternative to `getSpatialState().cameraPosition`),
  `followAvatarId(avatarId)`/`stopFollowingRemoteAvatar()`/
  `getFollowedRemoteAvatarId()` (the camera-follows-a-REMOTE-avatar
  counterpart to 0.2.36's `setFollowAvatar`/`isFollowingAvatar` —
  mutually exclusive with it, since there is only one camera; see
  `_followRemoteAvatarIfEnabled()`, which reuses the SAME delta-only
  `moveCamera()` shift 0.2.36 established). The remote-avatar frame
  subscription (0.2.37) now also calls `_pruneAvatarInteractionIfGone()`
  every frame, so a targeted or followed avatar whose presence expires
  clears gracefully rather than pointing at nothing.

Renderer:

- `renderer/AvatarPickingService.js` (new) — raycasts against a
  `Map<avatarId, Object3D>` of avatar `AvatarVisual.root` groups,
  `recursive: true` (an avatar's real shape is root → poseGroup → body
  parts, never one flat mesh), walking the intersection's parent chain
  back to whichever root it belongs to. A completely separate object
  set and raycaster instance from `renderer/PickingService.js` — see
  docs/Principles.md.
- `renderer/PickingService.js` — `pickRich()` now also returns
  `distance` (the raycaster's own hit distance), additive and ignored
  by every existing caller, consumed only by the new priority
  comparison above.
- `application/RenderWorldViewUseCase.js` — constructs an
  `AvatarPickingService` alongside the existing `PickingService`;
  tracks `localAvatarId` (from `setLocalAvatar`'s own `presence.avatarId`,
  cleared by `removeLocalAvatar`); exposes `pickAvatar(screenX, screenY)`,
  building the candidate roots map FRESH on every call from whichever
  avatars are CURRENTLY VISIBLE (respecting both "Show My Avatar" and
  "Show Other Avatars") — a hidden avatar is never a pickable candidate.

UI:

- `ui/components/AvatarInfoPanel.js` (new) — pure presentation,
  same shape as `DocumentInfoPanel`/`PlacementInfoPanel`: renders
  `WorldNavigationSession.getAvatarInfo()`'s output, emits
  `follow`/`stop-follow`. Deliberately shows NO edit/move/delete/save
  affordances — see docs/Principles.md, "Looking At Something Is Never
  The Same As Acting On It." "Follow" only appears for a REMOTE avatar.
- `ui/views/WorldView.js` — renders `AvatarInfoPanel` alongside
  `DocumentInfoPanel`/`PlacementInfoPanel` (at most one of the two
  families is ever populated at a time, since the underlying state
  slices are mutually exclusive); `followAvatarFromPanel()`/
  `stopFollowingAvatarFromPanel()` wire the panel's "Follow" button to
  `followAvatarId()`/`stopFollowingRemoteAvatar()`.

Deliberately not in 0.2.39: any privacy/visibility model for presence
(documented as an explicit, deliberate boundary instead — see
docs/Principles.md, "Avatar Presence Has No Privacy Guarantee Beyond
Transport Scope," and docs/Roadmap.md), avatar collision, pushing
other avatars, gestures/emotes, chat, voice, trading, avatar ownership
transfer, a friends/social graph, and decentralized avatar-template
distribution. Also not in 0.2.39: any change to `core/PresenceIngestion.js`,
`application/PresenceTrustBoundary.js`, or anything else 0.2.37/0.2.38
already established — this milestone adds an INTERACTION layer on top
of presence, never touches trust/replay/transport underneath it, and
the flagship test verifies exactly that (Alice's AvatarPresence/
AvatarProfile/Publication and the original Placement are all
byte-identical after Bob targets, inspects, AND edits — the edit forks
a document, never touches the avatar at all).

### Avatar Presence Visibility & Privacy (0.2.40)

Closes the boundary 0.2.39 explicitly left open, WITHOUT touching how
avatars move, render, trust, or interact — every 0.2.33–0.2.39 file
this milestone doesn't list below is untouched. Establishes the SENDER
half of a symmetry 0.2.38 already built the RECEIVER half of:

    Sender side                              Receiver side

    AvatarPresenceSession
            │
            ▼
    PresenceVisibilityPolicy
            │
            ├── PUBLIC  ──────► advertise                  PresenceTrustBoundary
            ├── FRIENDS ──────► advertise IF authorized ►         │
            │                   peers are configured,             ▼
            │                   else behaves like HIDDEN   Accepted Presence
            ├── LOCAL   ──────► advertise (today,
            │                   observationally == PUBLIC —
            │                   only one transport scope
            │                   exists — see docs/Principles.md)
            └── HIDDEN  ──────► publish() never called at all

"Visibility asks: should I even send this?" / "Trust asks: should I
believe what arrived?" — deliberately opposite questions, on opposite
sides of the transport, neither one aware of the other. See
docs/Principles.md, "Visibility Happens Before Broadcasting, Never
After."

Core:

- `core/PresenceVisibility.js` (new) — the closed vocabulary
  `PUBLIC`/`FRIENDS`/`LOCAL`/`HIDDEN`, same `Object.freeze` +
  `isValid*` pattern `core/PresenceLifecycleState.js` established.
- `core/PresenceVisibilityPolicy.js` (new) — an immutable, PERSISTED
  (unlike everything else in `core/Presence*.js`, which is either pure
  derivation or explicitly ephemeral) value object:
  `{ visibility, authorizedPeerIdentities }`. `shouldAdvertise()` is
  the one decision it exists to make — parameter-free, since
  visibility is a property of the SENDER's own configuration, never of
  who might be asking. `authorizedPeerIdentities` is a plain,
  manually-entered allow-list — trimmed, deduped, deterministically
  sorted — not a friend-request system. See its own header for the
  honest limitation: today's only transport has no per-recipient
  addressing, so FRIENDS currently controls WHETHER a replica
  advertises (empty list = behaves like HIDDEN), not WHO physically
  receives the bytes once it does.

Application:

- `application/PresenceVisibilityUseCase.js` (new) — persistence +
  defaults, structurally mirroring `application/AvatarProfileUseCase.js`:
  `getPolicy()` (never-fails, creates-and-persists a default PUBLIC
  policy on first access), `updatePolicy()` (throws on an unrecognized
  visibility value, never partially applies), `onPolicyChanged()`
  (same EventBus subscription shape as `onProfileChanged`/
  `onUserChanged`). Storage key `presence-visibility:<username>`,
  deliberately separate from `avatar-profile:<username>`.
- `application/CreatePresenceVisibilityUseCase.js` (new) — the
  storage-wiring shim, same shape as `CreateAvatarProfileUseCase.js`.
- `application/CreateAvatarPresenceSessionUseCase.js` — now also wires
  and returns `presenceVisibilityUseCase` alongside
  `avatarProfileUseCase`/`presenceSession`, since "which identity is
  this a live view of" is the same question all three answer.
- `application/WorldNavigationSession.js` — gains an OPTIONAL
  `presenceVisibilityUseCase` constructor dependency (same
  "enforce/offer only when wired" posture as every other optional
  avatar collaborator — a session built without one always advertises,
  exactly 0.2.37/0.2.38's own behavior, unchanged). The publish gate
  inside `_setupLocalAvatar()`'s presence-changed subscription now
  reads `presenceVisibilityUseCase.getPolicy().shouldAdvertise()`
  FRESH on every accepted presence update, before
  `PresenceSyncService.publish()` is ever called — a policy change
  mid-session takes effect on the very next movement, with no separate
  "apply" step.
- `application/CreateWorldViewUseCase.js` — threads
  `presenceVisibilityUseCase` through from the same avatar-wiring
  block that already builds `avatarProfileUseCase`/
  `avatarPresenceSession`, absent under the exact same "nobody logged
  in" condition.

UI:

- `ui/views/AvatarSettingsView.js` — gains a "Presence Visibility"
  section, deliberately a SEPARATE form with its own Save button from
  the appearance editor above it (independent underlying use cases,
  independent storage keys — see docs/Principles.md). A visibility
  dropdown; an "Authorized identities" textarea that only appears in
  FRIENDS mode, with an honest inline note that an empty list behaves
  like Hidden.

Deliberately not in 0.2.40: a friends/social graph (the allow-list is
manual, not mutual, not discovered), blocking, avatar collision,
physical pushing, voice/chat, emotes, avatar trading, persistent
remote-avatar storage, decentralized avatar-template distribution,
encrypted/private presence, precise location privacy, and
cryptographic anonymity. In particular: HIDDEN means "don't advertise,"
never "advertise an encrypted presence nobody can read" — encryption
is explicitly a separate, larger protocol problem left for later. Also
not in 0.2.40: any change to `core/PresenceIngestion.js`,
`application/PresenceTrustBoundary.js`, `application/PresenceSyncService.js`,
`application/RemoteAvatarRegistry.js`, or anything else the RECEIVER
side already established in 0.2.37/0.2.38 — visibility is entirely a
SENDER-side gate, and the flagship test verifies exactly that: Bob's
session, its `PresenceTrustBoundary`, and its `RemoteAvatarRegistry`
are never touched at all — Bob simply never receives anything while
Alice is HIDDEN, and starts receiving normally the moment she switches
to PUBLIC, with no special-casing on his side whatsoever.

### Remote Avatar Appearance Synchronization (0.2.41)

Closes the other boundary 0.2.37 explicitly left open: presence
(0.2.37/0.2.38/0.2.40) makes a remote avatar move correctly and
trustworthily, but every remote avatar still rendered with the same
fixed placeholder appearance, forever. 0.2.41 gives Bob Alice's REAL
customized appearance — a second, fully independent
advertise/trust/store/render pipeline that mirrors presence's own
shape exactly, on its own transport, at its own (much lower)
frequency:

    LOCAL avatar                                    REMOTE avatar (Bob's view)

    AvatarProfileUseCase          AvatarPresenceSession
            |  (WHAT)                    |  (WHERE)
            v                            v
    toAvatarProfileAdvertisement   toAvatarPresenceAdvertisement
            |                            |
    signAvatarProfileAdvertisement  signAvatarPresenceAdvertisement
            |                            |
            v                            v
    'forkbuild:avatar-profile'     'forkbuild:avatar-presence'   (separate BroadcastChannels)
            |                            |
            v                            v
    AvatarProfileSyncService        PresenceSyncService
    -> AvatarProfileTrustBoundary   -> PresenceTrustBoundary
    -> LocalAvatarProfileStore      -> LocalPresenceStore
    (never time-pruned)             (ABSENT-pruned on a timer)
            |                            |
            +-------------+--------------+
                          v
          RemoteAvatarAppearanceRegistry <-- consulted by --  RemoteAvatarRegistry.sync()
                (WHAT to render)                                  (WHICH avatars exist, WHERE)
                          |                            |
                          v                            v
           updateRemoteAvatarAppearance()      setRemoteAvatar() / updateRemoteAvatarPresence()
                          +-------------+--------------+
                                        v
                             renderer/AvatarRenderer.js (unmodified --
                             a remote avatar is just another avatar)

Core:

- `core/AvatarProfile.js` — gains a `revision` field (starts at `0`,
  incremented by every `withTemplateId`/`withAppearance`/
  `withDisplayName` call), the profile counterpart to presence's own
  `sequence` — "newer accepted state wins; arrival order does not
  determine state," per the design doc. Round-trips through
  `toJSON`/`fromJSON`, degrading to `0` for a pre-0.2.41 stored
  profile that predates the field.
- `core/AvatarProfileAdvertisement.js` (new) — mirrors
  `core/AvatarPresenceAdvertisement.js` exactly:
  `toAvatarProfileAdvertisement()` (profile → wire shape:
  `avatarId`, `ownerIdentity`, `profileRevision`, `templateId`,
  `appearance`, `displayName`), `isValidAvatarProfileAdvertisement()`
  (structural check only — a `templateId` this replica doesn't
  recognize is still a VALID advertisement, just one that resolves to
  a placeholder later — see docs/Principles.md, "Validate Strictly On
  Write; Degrade Gracefully On Read"), `getAvatarProfileSigningDescriptor()`.
  Deliberately NOT the complete avatar profile crammed into
  `AvatarPresenceAdvertisement` — see docs/Principles.md, "Appearance
  And Position Are Different Lifecycles, Never One Message."
- `core/Signature.js` — gains `SignatureType.AVATAR_PROFILE`.
- `core/AvatarProfileIngestion.js` (new) — `resolveIncomingProfile()`,
  the `profileRevision` counterpart to `core/PresenceIngestion.js`'s
  `sequence` comparison. A deliberate small duplicate, not a reuse of
  `resolveIncomingPresence` — the field name genuinely differs and the
  two will keep diverging (presence's freshness/staleness derivation
  has no profile equivalent at all).
- `core/AvatarProfileEquivocation.js` (new) — `detectAvatarProfileEquivocation()`,
  "equal-but-different is still a conflict" (0.2.18/0.2.38) applied to
  a `profileRevision`. Returns a plain descriptive object rather than
  a full class, since — unlike `PresenceEquivocation` — no consumer
  needs the class shape.

Identity:

- `identity/LocalAuthorizationVerifier.js` — gains
  `verifyAvatarProfileAdvertisement()`, structurally identical to
  `verifyPresenceAdvertisement()` (did:key signer recovery, unsigned
  tolerated as "structurally fine, just unauthenticated" — the policy
  question of whether to ACT on that lives entirely in the trust
  boundary, same split 0.2.38 already established for presence).

Application — the profile pipeline, deliberately NOT sharing state
with presence's own equivalents even where a class is reused:

- `application/AvatarProfileSigning.js` (new) — mirrors
  `application/PresenceSigning.js`.
- `application/AvatarProfileTrustBoundary.js` (new) — the profile
  counterpart to `application/PresenceTrustBoundary.js`, same six-step
  decision (structural validity → signature → authority → replay →
  equivocation → freshness). REUSES `core/PresenceAuthority.js`'s
  `PresenceAuthorityRegistry` directly, but with its OWN separate
  instance — presence-authority and profile-authority are
  independently TOFU-bound, so winning the race to claim an avatarId's
  PRESENCE never also hijacks its PROFILE authority. REUSES
  `replication/ReplayGuard.js` (the unbounded guard) AS-IS rather than
  presence's own bounded `core/PresenceReplayWindow.js` — profile
  updates are rare, deliberate edits, exactly the workload
  `ReplayGuard` was actually built for. No policy knob equivalent to
  `core/PresenceTrustPolicy.js` exists yet — unsigned profile claims
  are always tolerated, the same permissive default presence itself
  ships with.
- `application/LocalAvatarProfileStore.js` (new) — `avatarId →`
  latest accepted `AvatarProfileAdvertisement`, judged by an injected
  `AvatarProfileTrustBoundary` on every `ingest()`. Deliberately NEVER
  time-prunes, unlike `LocalPresenceStore` — see docs/Principles.md,
  "Appearance Is Durable; Presence Is Ephemeral."
- `application/AvatarProfileSyncService.js` (new) — the advertise/pull
  round trip, one layer up, mirroring `application/
  PresenceSyncService.js`'s shape as its own small class (not a direct
  reuse — `listKnownPresences()` reads oddly applied to profiles, and
  profile callers need an `O(1)` `getKnownProfile(avatarId)` lookup
  presence callers don't).
- `application/RemoteAvatarAppearanceRegistry.js` (new) — the
  appearance counterpart to `RemoteAvatarRegistry`: `resolve()` (pure
  read — no known profile, or an unrecognized `templateId`, both
  degrade to the same fixed placeholder), `resolveAndTrack()` (resolve
  + remember the applied `profileRevision`, called both at first-visual
  creation and by `sync()`), `sync(knownAvatarIds)` (per-frame, only
  pushes `updateRemoteAvatarAppearance` for an avatarId whose
  `profileRevision` actually changed), `forget()`/`clear()`.
- `application/RemoteAvatarRegistry.js` — gains an OPTIONAL
  `appearanceResolver` constructor dependency, consulted the moment a
  brand-new remote avatar's visual is first created (instead of always
  falling back to the fixed placeholder — full backward compatibility
  when unwired), and `knownAvatarIds()` for
  `RemoteAvatarAppearanceRegistry.sync()` to iterate.
- `application/RenderWorldViewUseCase.js` — gains
  `updateRemoteAvatarAppearance(avatarId, template, appearance)`, a
  no-op if the avatar's visual doesn't exist yet (mirrors
  `updateLocalAvatarAppearance`'s own shape).
- `application/WorldNavigationSession.js` — the integration point.
  `_setupRemoteAvatars()` conditionally builds `AvatarProfileSyncService`
  + `RemoteAvatarAppearanceRegistry` when an `avatarProfileBroadcastProvider`
  is wired; its per-frame callback drains the PROFILE inbox BEFORE
  pulling/syncing PRESENCE (see docs/Principles.md — a profile that
  already arrived must be on hand before a brand-new visual is
  created), then applies any profile-revision change for an avatar
  that already has one. `_setupLocalAvatar()`'s `onProfileChanged`
  subscription now calls the new `_publishLocalAvatarProfile()`
  immediately on every explicit edit; its existing movement frame
  callback ALSO checks a 15-second `PROFILE_REPUBLISH_INTERVAL_MS`
  timer (`_lastProfilePublishAt` starts at `0`, so the very first real
  frame publishes immediately) — see docs/Principles.md, "A
  Fire-And-Forget Transport Needs Its Own 'Catch Me Up.'"
  `_publishLocalAvatarProfile()` consults the SAME
  `presenceVisibilityUseCase.getPolicy().shouldAdvertise()` gate
  presence publishing already used (0.2.40) — see docs/Principles.md,
  "Presence And Profile Share One Publication Gate."
- `application/CreateWorldViewUseCase.js` — constructs a SECOND
  `LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-profile')`
  (the class reused directly — it has nothing presence-specific baked
  into its actual logic, just a channel name), threaded through
  alongside the existing presence provider.

Deliberately not in 0.2.41: any change to movement, collision, chat,
emotes, or the world-document model; a second privacy system for
profiles (visibility is entirely reused, never duplicated); persisted
remote-avatar appearance (a page reload starts with zero known remote
profiles, exactly like presence); decentralized avatar-template
distribution (an unrecognized `templateId` degrades gracefully — it is
never fetched, downloaded, or synthesized); and any placement/document
mutation or spatial-index update — remote avatar appearance is
eventually-consistent PRESENTATION state, never authoritative world
state. `tests/AvatarAppearanceSync.test.js`'s flagship verifies the
full round trip over two real `WorldNavigationSession`s and two real
`BroadcastChannel`s: Bob renders Alice's actual customized appearance
from her visual's very first frame (her profile having arrived, and
been ingested, before her presence made the avatar visible at all), a
second stranger avatar advertising an unrecognized template degrades
to the placeholder without ever crashing, and Alice's appearance
survives a presence ABSENT-prune-and-reappear cycle untouched.

### Avatar-World Collision & Movement Constraints (0.2.42)

Closes the one conspicuous limitation the movement model has carried
since 0.2.36: an avatar could walk straight through a published wall.
The movement pipeline becomes:

    Keyboard
       │
       ▼
    AvatarMovementController        (application/ — WHEN to tick, key state)
       │
       ▼
    core/AvatarMovementSimulation.js   (pure kinematics — UNTOUCHED this milestone)
       │  proposed position
       ▼
    application/AvatarMovementConstraint.js   (WHICH geometry is currently available)
       │  + core/AvatarCollision.js            (pure geometry math)
       │  constrained position, collided
       ▼
    AvatarPresence
       │
       ▼
    AvatarVisual / renderer

Deliberately NOT Three.js collision logic inside the simulation — see
docs/Principles.md, "Collision Is A Constraint Applied To Movement,
Never Part Of The Movement Simulation Itself." The split mirrors
`core/PresenceIngestion.js`/`application/PresenceTrustBoundary.js`'s
own pure-kernel/applied-constraint shape, one layer over.

Core — pure geometry, no Document/WorldPlacement/BrickRegistry
knowledge at all:

- `core/AvatarCollision.js` (new) — `AVATAR_COLLISION_RADIUS`/
  `AVATAR_COLLISION_HEIGHT` (an upright AABB standing in for a true
  capsule — see docs/Principles.md, "Start Simple: A Box Is A Good
  Enough Capsule"), `avatarAabbAt()`, `brickAabb()` (axis-aligned,
  ignoring `Brick.rotation` — the same simplification
  `application/SelectionBoundsService.js` already makes),
  `translateAabb()`, `aabbsOverlap()`, and the real algorithm,
  `resolveHorizontalMovement()`: an axis-separated SWEPT slide —
  X and Z resolved independently (so a diagonal approach into a
  corner blocks one axis while the other keeps moving — a true
  slide, not a dead stop), each axis tested against the full
  `[current, proposed]` range (not just the endpoint, so a single
  large step can never tunnel through a thin obstacle). A
  directional guard excludes any obstacle already on the TRAILING
  side of the avatar's current position, so an obstacle the avatar
  is flush against never blocks a step retreating away from it — see
  that function's own inline comment for the exact edge case this
  fixes. Vertical ground/gravity is untouched — this file has no
  opinion about standing, falling, or jumping, only about whether a
  horizontal step is obstructed.

Application — supplies "the world geometry currently available to
this replica":

- `application/AvatarMovementConstraint.js` (new) — given
  WorldNavigationSession's own `_loadedDocuments` Map (BY REFERENCE,
  never a snapshot — see docs/Principles.md, "The Local Avatar Is
  Constrained By Collision Geometry Currently Available To This
  Replica"), `_getWorldPosition` (the same source of truth
  spawning/focusing/forking already use, fork-local-position-override
  included), and the shared `BrickRegistry`, builds an obstacle AABB
  list distance-culled around the avatar (a broad phase — 12 world
  units by default, deliberately much smaller than `STREAMING_RADIUS`
  150: "loaded" and "worth iterating every movement tick" are
  different concerns) and calls `core/AvatarCollision.js`'s
  `resolveHorizontalMovement()`. An unrecognized brick `definitionId`
  degrades to "not an obstacle" rather than throwing (docs/Principles.md,
  "Validate Strictly On Write; Degrade Gracefully On Read"). Nothing
  here is ever persisted or cached across ticks — every obstacle AABB
  is recomputed fresh, on demand.
- `application/AvatarMovementController.js` — gains an OPTIONAL
  `movementConstraint` constructor argument (unchanged single-argument
  construction still works, exactly 0.2.36's own signature — the same
  "enforce/offer only when wired" posture as every other optional
  collaborator here). `tick()` now: simulate (unchanged) → constrain
  (new, only if wired) → publish. `isCollided()` exposes the most
  recent tick's outcome — transient, never part of `AvatarPresence`
  (see docs/Principles.md, "Collided Is Movement Information, Not An
  Animation Vocabulary").
- `application/WorldNavigationSession.js` — `_setupLocalAvatar()`
  builds an `AvatarMovementConstraint` from state the session ALREADY
  owns (`_loadedDocuments`, `_getWorldPosition`, `_registry`) — no new
  constructor dependency on `WorldNavigationSession` itself; collision
  is entirely derived, never separately wired. Built unconditionally:
  an empty `_loadedDocuments` (nothing streamed in yet) simply means
  no obstacles are ever found.

Deliberately not in 0.2.42, matching the design doc's own scope:
avatar-avatar collision (Alice colliding with Bob raises real
multiplayer-authority questions — displayed vs. claimed remote
position — left for a later networking milestone); standing on top of
raised geometry (the avatar's vertical ground plane remains the fixed
Y=0 plane 0.2.36 established; only HORIZONTAL collision against static
geometry is added here); rotated-brick-accurate collision (see
docs/Principles.md, "Start Simple: A Box Is A Good Enough Capsule");
any new `AvatarAnimationState` value; any collision persistence or
`Avatar → Document` relationship (docs/Principles.md, "Collision Is
Derived From Document + Placement, Never A Third Relationship"); and
any change to presence's own wire shape, trust boundary, or replay
handling — `AvatarPresence` carries only avatar state before and after
this milestone, verified directly in `tests/AvatarCollision.test.js`'s
flagship. That flagship exercises the full scripted scenario: publish
a wall → place it → load it into Alice's World View → stand next to it
→ hold W → stop at the boundary → turn 90° → slide along it → jump
against it → never penetrate → Document/Publication/Placement remain
byte-identical → a real remote replica (Bob) sees Alice's
ALREADY-CONSTRAINED movement through completely ordinary presence
sync, with zero collision-aware special-casing anywhere in his own
session — collision is a local movement constraint, never a new
network authority mechanism.

### Avatar-Avatar Proximity & Interaction Targets (0.2.43)

Answers "who is near me?" as a DERIVED, purely local fact — never a
message on the wire, never a persisted relationship — computed over
the exact same trusted remote-presence state that already drives
rendering:

    Alice's own position          RemoteAvatarRegistry's known presences
            │                                    │
            └────────────────┬───────────────────┘
                              ▼
              core/AvatarProximity.js#computeNearbyAvatars()
                    (pure: sort by distance, filter by radius)
                              │
                              ▼
              WorldNavigationSession.getNearbyAvatars(radius)
                              │
                              ▼
              ui/components/NearbyAvatarsPanel.js
                    (click → targetAvatar() → getAvatarInfo() /
                     followAvatarId(), both REUSED unmodified)

Core:

- `core/AvatarProximity.js` (new) — `computeNearbyAvatars({ localPosition,
  knownPresences, radius })`, a pure function over exactly the shape
  `application/PresenceSyncService.js#listKnownPresences()` already
  returns (`{ advertisement, lifecycleState, trustObservation }`).
  Reuses `core/SpatialQuery.js`'s `distanceBetween()`/`isWithinRadius()`
  verbatim rather than reimplementing 3D distance math — see
  docs/Principles.md, "Proximity Is Derived, Never Announced." Sorts
  nearest-first, degrades gracefully (skips, never throws) on a
  malformed entry. Never filters ABSENT presences itself — see the
  next paragraph for why it structurally can't even see one.

Application:

- `application/WorldNavigationSession.js` gains three methods:
  - `getNearbyAvatars(radius = 15)` — reads
    `PresenceSyncService.listKnownPresences()` (never `pull()`, the
    same read-only posture `getRemoteAvatarDiagnostics()` already
    established) and calls `computeNearbyAvatars()`. `[]` gracefully
    when there is no local avatar or no presence sync wired.
    ABSENT-pruning happens entirely upstream: `application/
    LocalPresenceStore.js#list()` already DELETES an ABSENT record
    the moment it's asked for, so `computeNearbyAvatars()` — and this
    method — can never even receive one to filter.
  - `getAvatarDisplayName(avatarId)` — the ONE shared place a friendly
    name is resolved for any avatarId. Fixes a genuinely stale
    0.2.39 assumption: `_inspectRemoteAvatar()` used to hard-fall-back
    to `ownerIdentity`, with a comment saying a remote `displayName`
    "is never distributed" — true when written, false since 0.2.41
    started distributing `AvatarProfile.displayName` over its own
    channel. Both `getNearbyAvatars()`'s consumers and
    `_inspectRemoteAvatar()` now resolve through this one method.
  - `targetAvatar(avatarId)` — lets a UI list row reach the exact
    outcome `pick()`'s avatar branch already produces, without a
    screen-space raycast: validates `avatarId` is actually known first
    (the local avatar, or a remote one `RemoteAvatarRegistry.has()`
    still confirms), then sets `_avatarInteraction` and clears any
    document/ground selection the same way `pick()` already does. Its
    ENTIRE effect is on the caller's own local UI-focus state — see
    docs/Principles.md, "Nearness Never Authorizes Mutation."

UI:

- `ui/components/NearbyAvatarsPanel.js` (new) — the design doc's own
  mockup: a small list of nearby avatars (display name, distance,
  animation, a lifecycle/trust status dot) inside World View's
  existing AVATAR sidebar section, shown alongside "Show Other
  Avatars." Reuses `application/AvatarPresenceLabels.js` and
  `AvatarInfoPanel`'s own `.avatar-info-status-dot` CSS verbatim — one
  visual vocabulary for lifecycle/trust across both surfaces. Emits
  `select`; `ui/views/WorldView.js` handles it by calling
  `session.targetAvatar()` and refreshing — the SAME `AvatarInfoPanel`
  that already renders for a 3D-viewport click opens, with its
  existing "Follow" button already wired to `followAvatarId()`. No new
  camera mechanism, no new inspection surface — see docs/Principles.md,
  "A New Way To Reach An Avatar Is Not A New Way To Inspect One."
  `nearbyAvatars` refreshes on the SAME cadence
  `remoteAvatarDiagnostics` already does (every `refreshSpatialUI()` —
  pick/hover/session mutations, plus the existing 3-second periodic
  poll), each entry enriched with a UI-layer-resolved `displayName` the
  same way `loadedWorlds` already enriches a bare `documentId` with its
  publication's title/author.

Deliberately not in 0.2.43, matching the design doc's own scope:
avatar-avatar collision or pushing (a genuinely harder, multiplayer-
authority-laden problem — Alice's local state vs. Bob's remote,
interpolated, potentially-stale state — left for a dedicated later
milestone, if ever taken up); any change to `AvatarInteractionState`'s
shape (already exactly `{ avatarId }` since 0.2.39 — this milestone
needed nothing more); emotes, gestures, chat, or any other social
action (0.2.44+); and any persisted "friends" or relationship graph —
proximity is recomputed fresh on every call, from nothing but current
position and already-trusted presence, never cached or stored anywhere.
`tests/AvatarProximity.test.js`'s flagship runs the full arc over two
real `WorldNavigationSession`s and two real `BroadcastChannel`s: Bob's
Nearby list shows Alice with her real distance and real synced
displayName while PRESENT, she drops off the list (but not the
known-avatar registry) once she walks outside the query radius, she's
still listed but visibly STALE after real elapsed time with no
movement, she's pruned entirely once ABSENT with zero special-casing
in the proximity code itself, and — throughout every step, including
Bob targeting and following her from the Nearby list — Alice's own
`AvatarProfile`/`AvatarPresence`, read from her own session, never
change.

### Local Avatar Interaction & Social Presence (0.2.44)

```text
Bob targets Alice (existing 0.2.43 targetAvatar())
       │
Bob clicks "Wave" in the Avatar Info panel
       │
WorldNavigationSession.performAvatarInteraction('wave')
       │
   allowed?  (core/AvatarInteractionCooldown.js)
   ├── no  → ignored, no state change
   └── yes → AvatarInteractionState.withInteraction('wave', now)
                       │
             every render frame:
                       │
       ┌───────────────┴────────────────┐
       ▼                                 ▼
setLocalAvatarGesture('wave')   setLocalAvatarFacing(yaw)
(renderer/AvatarVisual.js:      (renderer/AvatarVisual.js:
 upper-body pose overlay,        temporary root.rotation.y
 core/AvatarGesturePoseOffsets)  override, core/AvatarFacing.js)
       │                                 │
       ▼                                 ▼
  Bob's OWN avatar visibly waves   Bob's OWN avatar visibly faces
  for ~1.8s, then auto-clears      Alice while stationary; an
  back to NONE                     actively-moving player's own
                                    input always wins instead
```

Nothing above ever reaches a transport. See docs/Principles.md,
"Observation Does Not Imply Authority, And Interaction Does Not Imply
Control" and "A Gesture Is Presentation, Never Presence."

Core (all pure, Three.js-free, no dependency on anything else in this
milestone):

- `core/AvatarInteractionKind.js` (new) — the closed vocabulary NONE/
  GREET/WAVE/POINT, deliberately separate from
  `core/AvatarAnimationState.js` (which lives on the broadcast
  `AvatarPresence.animation`) so a gesture structurally cannot reach
  the wire.
- `core/AvatarInteractionCooldown.js` (new) — `canPerformInteraction
  (lastPerformedAt, now, cooldownMs = 1500)`, a pure rate-limit
  predicate. One shared cooldown across the whole small vocabulary.
- `core/AvatarFacing.js` (new) — `computeFacingYawDegrees(fromPosition,
  toPosition)`, pure geometry using the exact angle convention
  `core/AvatarMovementSimulation.js` already established for
  `rotation.y` (0° faces +Z, 90° faces +X). Returns `null` when the
  two positions coincide on the X/Z plane.
- `core/AvatarGesturePoseOffsets.js` (new) — `getGesturePoseOverride
  (interactionKind, elapsedSeconds)`, a deterministic mapping from a
  gesture to an upper-body (headTilt/bodyTilt) pose override, reusing
  the SAME pose-offset vocabulary `core/AvatarPoseOffsets.js`
  established for locomotion. WAVE wobbles over elapsed time (a small
  head-tilt oscillation); GREET/POINT are static tilts. Deliberately
  never touches legSplay/hopHeight — a gesture overlays locomotion, it
  never replaces it. The avatar model has no separate arm geometry yet
  (see `renderer/AvatarRenderer.js#build()`); this reuses exactly the
  body/head articulation the renderer can already move rather than
  inventing new mesh, an honest, explicitly scoped-down first pass.

Application:

- `application/spatial-state/AvatarInteractionState.js` gains two new
  fields — `interaction` (the closed vocabulary above, default NONE)
  and `interactionStartedAt` — plus `withInteraction(interaction,
  interactionStartedAt)`, an immutable setter in the same style as
  every other spatial-state class. Deliberately keeps `avatarId` as
  the existing field name rather than the design doc's own
  illustrative `targetAvatarId` — the name is already load-bearing
  across ~20 call sites and tests; renaming it would be pure churn.
- `application/WorldNavigationSession.js` gains
  `performAvatarInteraction(kind)`: rejects when there is no current
  target, the target is the local avatar itself (gesturing at
  yourself is meaningless), the kind is invalid/NONE, or the shared
  cooldown hasn't elapsed; otherwise records the gesture on
  `_avatarInteraction` and returns `true`. A new private method,
  `_updateLocalAvatarInteractionPresentation(now)`, runs every render
  frame (added to the SAME `onAnimationFrame` callback 0.2.36's
  movement tick and 0.2.41's profile republish already share):
  auto-expires a gesture back to NONE after ~1.8s, then pushes the
  current gesture and a computed facing override to the render
  facade. Facing is computed only while
  `AvatarMovementController#hasMovementInput()` (new getter) is
  false — an actively-moving player's own input always wins over the
  temporary "look at target" override.
- `application/AvatarMovementController.js` gains `hasMovementInput()`
  — a cheap getter over already-tracked key state, added purely so the
  facing behavior above has something honest to gate on.

Renderer:

- `renderer/AvatarVisual.js` gains `setGesture(interactionKind)` and
  `setFacingOverride(yawDegrees)`. Both are purely local, rendering-
  only overlays: `setGesture` restarts its own elapsed-time wobble
  clock (ticked alongside the existing gait clock) and layers an
  upper-body pose override on top of whatever locomotion pose is
  already showing; `setFacingOverride` writes `root.rotation.y`
  directly, remembering the real presence-driven rotation
  (`_lastRotationY`) so clearing the override (`null`) restores it
  immediately with no new `setPose()` call required.
- `renderer/AvatarRenderer.js#applyPose()` gains an optional fourth
  `gestureOverride` parameter: when present, it replaces just the
  body/head tilt the locomotion pose would otherwise contribute, while
  leg splay and hop height still come from locomotion — a gesture is
  upper-body-only.
- `application/RenderWorldViewUseCase.js`'s facade gains
  `setLocalAvatarFacing(yawDegrees)` and `setLocalAvatarGesture
  (interactionKind)` — thin pass-throughs to the local
  `AvatarVisual`. Neither has a remote-avatar counterpart; see
  docs/Principles.md.

UI:

- `ui/components/AvatarInfoPanel.js` gains three buttons — Greet,
  Wave, Point — alongside the existing Follow/Stop Following, all
  REMOTE-avatar-only (`v-if="!info.isLocal"`, the same gate Follow
  already used). Each emits a single `interact` event carrying the
  `AvatarInteractionKind` string; the panel has no opinion about
  cooldowns — `WorldNavigationSession.performAvatarInteraction()` is
  the one place that decides. No "Inspect Profile" button: the panel
  being open already IS the inspection (see docs/Principles.md,
  "Looking At Something Is Never The Same As Acting On It") — reusing
  that existing surface rather than adding a second, redundant one.
  "Invite to Follow"/"Stop Following"/"Inspect" — three of the six
  intents the design doc names — needed no new code at all: they are
  exactly the existing Follow/Stop Following buttons and the existing
  "open the panel" behavior.
- `ui/views/WorldView.js` gains `performAvatarInteraction(kind)`, a
  thin handler wired to `AvatarInfoPanel`'s new `interact` event —
  calls straight through to the session method and does not
  second-guess a `false` return (no target, cooldown, or invalid
  kind all look identical to the UI: nothing visibly happens).

Deliberately not in 0.2.44, matching the design doc's own scope: any
networked/broadcast form of GREET/WAVE/POINT (0.2.45 — Networked
Ephemeral Avatar Interactions); any change to the wire protocol at all
(`docs/Protocol.md` is unchanged by this milestone); arm geometry or
any other new avatar mesh (the gesture pose reuses only body/head
articulation the renderer could already move); a visible cooldown
countdown or disabled-button UI state (a rejected click is silently a
no-op, matching the design doc's own flowchart: "no → ignore"); and any
persisted record of who gestured at whom — a gesture is transient
render state, gone the moment it expires or the session ends, never
written to a Document, a PlacementRecord, or anywhere else.
`tests/AvatarInteractionGestures.test.js` covers the pure math (facing
angles, cooldown timing, gesture pose offsets) independently of any
session, then exercises `performAvatarInteraction()` and the per-frame
presentation loop together: a gesture is rejected with no target, at
yourself, with an invalid kind, or on cooldown; accepted otherwise and
visible on the very next frame; a held movement key clears the facing
override without interrupting an in-progress gesture; and real elapsed
time auto-expires the gesture back to NONE with no explicit "stop"
call ever needed.

### Ephemeral Avatar Interaction Synchronization (0.2.45)

```text
Bob's replica                                    Alice's replica
──────────────                                    ───────────────
performAvatarInteraction('wave')
  (0.2.44 local gesture, unchanged)
       │
_publishAvatarInteraction()
       │
toAvatarInteractionAdvertisement()
  { avatarId: bob, interactionId,
    kind: 'wave', targetAvatarId: alice,
    sequence, timestamp }
       │
signAvatarInteractionAdvertisement()
       │
AvatarInteractionSyncService.publish()
       │
LocalAvatarPresenceBroadcastProvider
  ('forkbuild:avatar-interaction')  ──────────►  onAdvertisement() → inbox
                                                        │
                                          AvatarInteractionSyncService.pull()
                                                        │
                                          AvatarInteractionTrustBoundary.evaluate()
                                            structural → signature/policy →
                                            authority → replay/staleness
                                                        │
                                                    accepted?
                                                   ┌────┴────┐
                                                   no        yes
                                                   │          │
                                              dropped   _applyRemoteAvatarInteraction()
                                                             │
                                                session.setRemoteAvatarGesture(bob, 'wave')
                                                             │
                                                  renderer/AvatarVisual.js#setGesture()
                                                  — reused AS-IS on BOB'S OWN remote
                                                    avatar visual (never Alice's)
                                                             │
                                                  ~1.8s later, _expireRemoteAvatarGestures()
                                                  clears it back to null automatically
```

See docs/Principles.md, "State Synchronization And Event Synchronization
Are Different Protocols," "Presence Describes An Avatar's Current
State; Interaction Describes An Event That Happened," and "A Claimed
Target Is Never An Instruction." Nothing here touches
`AvatarPresenceAdvertisement`, `AvatarProfileAdvertisement`, a
`Document`, a `WorldPlacement`, or the spatial index — a THIRD,
independent channel/trust-boundary/sync-service, mirroring 0.2.37's
presence and 0.2.41's profile shape without sharing state with either.

Core (all pure, no dependency on transport or rendering):

- `core/AvatarInteractionAdvertisement.js` (new) — the wire shape for
  ONE performed gesture: `avatarId`, `ownerIdentity`, a fresh
  `interactionId` (UUID, for duplicate suppression independent of
  ordering), `kind` (never NONE), `targetAvatarId`, a flat per-avatar
  `sequence` (its OWN counter, never `AvatarPresence.sequence`),
  `timestamp` (event metadata only, never an authority mechanism), and
  an optional `signature`. `toAvatarInteractionAdvertisement()`,
  `isValidAvatarInteractionAdvertisement()`, and
  `getAvatarInteractionSigningDescriptor()` mirror
  `core/AvatarPresenceAdvertisement.js`'s own three-function shape
  exactly.
- `core/AvatarInteractionIngestion.js` (new) —
  `resolveIncomingInteraction(highestAcceptedSequence,
  incomingAdvertisement)`, the same pure monotonic-sequence decision
  `core/PresenceIngestion.js` makes for presence, but compared against
  a bare highwater NUMBER rather than a full retained "current claim"
  — an interaction event has no "current" slot to replace.
- `core/AvatarInteractionReplayWindow.js` (new) — a bounded, per-
  avatarId structure doing double duty: a recent-`interactionId` set
  (exact-duplicate suppression) AND a `highestSequence` highwater mark
  (staleness rejection), both consulted by the trust boundary below.
  Bounded at 32 entries per avatarId, the same anti-replay-window
  posture `core/PresenceReplayWindow.js` already established for a
  different (but analogous) reason.
- `core/AvatarInteractionTrustPolicy.js` (new) — mirrors
  `core/PresenceTrustPolicy.js` exactly: the one real policy axis is
  `requireSignedInteraction` (`permissive()`/`hardened()`), its own
  separate class/instance from presence's policy so the two can be
  configured independently.
- `core/Signature.js` gains `SignatureType.AVATAR_INTERACTION`.
- `identity/LocalAuthorizationVerifier.js` gains
  `verifyAvatarInteractionAdvertisement()`, the same did:key-is-the-
  identity shape `verifyPresenceAdvertisement()`/
  `verifyAvatarProfileAdvertisement()` already established.

Application:

- `application/AvatarInteractionSigning.js` (new) —
  `signAvatarInteractionAdvertisement(advertisement, identityProvider)`,
  mirroring `application/PresenceSigning.js` exactly: optional by
  construction, degrades to unsigned rather than throwing.
- `application/AvatarInteractionTrustBoundary.js` (new) — the
  interaction counterpart to `PresenceTrustBoundary`/
  `AvatarProfileTrustBoundary`, with its OWN `PresenceAuthorityRegistry`
  instance (never shared with presence's or profile's own). `evaluate()`
  takes ONE argument, not two — there is no "currently stored claim" to
  compare against — and has deliberately NO equivocation check; see
  docs/Principles.md, "An Event Stream Has No Room For Equivocation
  Detection, And That Gap Is Named, Not Hidden."
- `application/AvatarInteractionSyncService.js` (new) — the
  advertise/pull round trip `PresenceSyncService`/
  `AvatarProfileSyncService` already established, but deliberately
  simpler: no `LocalAvatarInteractionStore`, no `list()`/`get()`.
  `pull()` drains the inbox, judges each arrival through the trust
  boundary, and returns ONLY the events accepted THIS call — a
  transient batch, never a persisted view. No periodic republish
  (unlike profile's `PROFILE_REPUBLISH_INTERVAL_MS`) — a missed
  gesture is never something a later-joining replica should catch up
  on.
- `application/CreateWorldViewUseCase.js` wires a THIRD
  `LocalAvatarPresenceBroadcastProvider` instance, reused as-is (the
  same generic named-BroadcastChannel wrapper 0.2.41 already reused for
  profile) on its own `'forkbuild:avatar-interaction'` channel name —
  never sharing a channel with presence's or profile's own traffic.
- `application/WorldNavigationSession.js`: `performAvatarInteraction()`
  gains one more step after its existing 0.2.44 local-state update —
  `_publishAvatarInteraction(kind, targetAvatarId, now)` — which signs
  and publishes a fresh advertisement through the visibility gate
  presence/profile publishing already share (see docs/Principles.md,
  "Presence And Profile Share One Publication Gate," now covering
  interactions too). A new `_localInteractionSequence` counter (own,
  separate from presence's `sequence`) advances on every publish. The
  remote-avatar frame subscription (the same one that already drives
  `PresenceSyncService.pull()`/`AvatarProfileSyncService.pull()` each
  frame) gains a symmetric step: drain
  `AvatarInteractionSyncService.pull()`, call the new
  `_applyRemoteAvatarInteraction(event, now)` for each accepted event
  (renders on the SENDER's own remote avatar visual, tracked in a new
  `_remoteAvatarGestureExpiry` Map), then
  `_expireRemoteAvatarGestures(now)` clears anything past its ~1.8s
  lifetime (the SAME `GESTURE_DURATION_MS` constant the local half
  already used) back to no-gesture, automatically, with no "stop"
  message ever required from the sender.

Renderer:

- `application/RenderWorldViewUseCase.js`'s facade gains
  `setRemoteAvatarGesture(avatarId, interactionKind)` — the remote
  counterpart to `setLocalAvatarGesture`, but calling the EXACT SAME
  `AvatarVisual.setGesture()` 0.2.44 already built (already generic,
  nothing local-only baked into its own logic) on a REMOTE avatar's own
  visual instead. No renderer-level code changed at all —
  `renderer/AvatarVisual.js` is reused byte-for-byte. A no-op if the
  avatarId has no presence-driven visual yet, the same
  "appearance/gesture never creates a remote avatar on its own" rule
  `updateRemoteAvatarAppearance` already follows.

Deliberately not in 0.2.45, matching the design doc's own scope: chat,
direct messaging, voice, friend requests, blocking, guaranteed
delivery, per-recipient encryption, interaction history, persistent
emotes, trading, avatar-to-avatar physics, or a formal permissions
system — all left for later, unscheduled milestones, tentatively titled
"Interaction Trust, Replay & Abuse Controls" and "Avatar Privacy,
Blocking & Interaction Permissions" (0.2.46 itself opened a different
arc — Local Identity & Authentication Session, below — rather than
continuing this one). No new UI surface either: the design doc's
own framing — "a simple avatar gesture is enough," explicitly
cautioning against a chat-style notification system this early — means
the existing 3D gesture rendering (0.2.44's own `AvatarVisual.setGesture`,
now applied to a remote avatar too) IS the user-visible signal; the
Avatar Info panel and Nearby Avatars panel are unchanged from 0.2.44/
0.2.43. `docs/Protocol.md` gains a new OPTIONAL wire message shape
(the interaction advertisement) but the CORE protocol — Publication,
PlacementRecord, SpatialIndexRoot, and their signing/verification
rules — is completely unchanged.

`tests/AvatarInteractionSync.test.js` covers each new core/application
file in isolation (advertisement validity/signing, the pure ingestion
decision, the bounded replay window's dual id/sequence bookkeeping, the
trust policy, real Ed25519 verification, the trust boundary's full
accept/reject pipeline, and the sync service's publish/pull-returns-
events-not-state contract), then a `WorldNavigationSession` integration
section, then a FLAGSHIP scenario: two real sessions communicating over
a real `BroadcastChannel`, Bob WAVEs at Alice, Alice's replica renders
it on Bob's own avatar visual, an attacker replays/staleness-attacks/
tampers/impersonates the captured packet (none of it renders), the
gesture expires on its own, and `AvatarPresence`/`AvatarProfile` of
both avatars — plus the published `Document`/`WorldPlacement`/spatial
index — are verified byte-identical throughout.

### Local Identity & Authentication Session (0.2.46)

```text
0.2.16 (before)                        0.2.46 (after)
────────────────                        ───────────────
login('alice')                          createLocalIdentity('alice')
  │                                       │  generates a keypair NOW,
  │  lazily derives a keypair             │  stores it in a durable,
  │  FROM the typed string,               │  listable index — before
  │  the first time it's needed           │  any login/session exists
  ▼                                       ▼
currentUser() == signing identity       LocalIdentity
  (the same event, always)                 │  "a key THIS device holds"
                                            │  (durable, survives logout)
                                            ▼
                                         authenticate(identityId)
                                            │  "unlock a key I already
                                            │   hold" — never derive one
                                            ▼
                                         AuthenticationSession
                                            │  "is one in use right now?"
                                            │  (transient; ANONYMOUS or
                                            │   AUTHENTICATED)
                                            ▼
                                         currentUser() / getSigningIdentity()
                                            — pure, derived VIEWS of the
                                            session, never a second fact
```

0.2.16 gave every signed object an answer to "who authorized this?" —
but the KEY behind that answer was always a side effect of `login()`
receiving a username string: the first call to `getSigningIdentity()`
for a given username lazily generated and cached a keypair keyed by
that exact string. That was honest cryptography (a real Ed25519 key, a
real did:key, a real signature) sitting behind a dishonest premise: it
made "which account is the app showing" and "which cryptographic key
does this device hold" the same event by construction, so there was
never a way to ask either question independently, and no way to
express "this device holds a key but isn't currently using it" at all.

0.2.46 is deliberately the LOCAL half only of the identity/session
architecture the design doc lays out — no server, no network, no
recovery mechanism, matching the doc's own staged scope ("0.2.46 —
Local Identity & Authentication Session," explicitly local-only). It
introduces two new pure-data concepts and rebuilds the existing
provider on top of them, without changing the external shape of a
single method every other part of the codebase already calls.

Identity (all pure data, no I/O):

- `identity/LocalIdentity.js` (new) — an identity whose PRIVATE key
  THIS device currently holds: `identityId` (a did:key), `publicKey`,
  `algorithm`, a local-only `label` (presentation metadata, never part
  of the cryptographic identity and never transmitted as an
  authorization claim), and `createdAt`. The constructor verifies
  `identityId` actually derives from `publicKey`
  (`Ed25519.publicKeyToDidKey`) — a `LocalIdentity` can never silently
  disagree with the `SigningIdentity` it converts into. Deliberately a
  THIRD identity concept, distinct from the two 0.2.16/0.1.21 already
  established: `identity/SigningIdentity.js` answers "which key
  authorized this object?" with possession neither known nor implied
  (it travels with anything signed, including replicas received from
  someone else entirely); `identity/Identity.js` answers "which
  account is the app showing?" (a display label, unchanged since
  0.1.21); `LocalIdentity` answers "which keys can THIS device
  actually sign with?" — always local, always implies possession.
- `identity/AuthenticationSession.js` (new) — is one of this device's
  identities unlocked right now? `AuthenticationState.ANONYMOUS` or
  `AUTHENTICATED`, carrying `identityId`/`authenticatedAt` only in the
  latter state — invalid by construction otherwise (the constructor
  throws if `AUTHENTICATED` is requested without an `identityId`).
  There is no server to issue this session; it is the local client's
  own record that it currently holds the private key half of
  `identityId` and is therefore willing to sign on its behalf. Static
  `anonymous()`/`authenticated(identityId, at)` factories and
  `toJSON()`/`fromJSON()` mirror every other pure-data entity's shape
  in this codebase.

Identity provider (the seam every other file actually calls through):

- `identity/LocalIdentityProvider.js` (rebuilt internally; external
  shape unchanged) — durable state moves from one lazily-created
  per-username key (`local-signing-key:<username>`) to a proper
  identity index (`local-identities`, listable via
  `listLocalIdentities()`/`getLocalIdentity()`) plus a single active
  session record (`local-session`). New lifecycle methods:
  `createLocalIdentity(label)` (generates a keypair immediately,
  independent of any login — the design doc's "Identity = f(publicKey)"
  step), `authenticate(identityId)` (throws if this device doesn't
  hold that identity's key — a session can never be authenticated onto
  an identity this device didn't itself create), `endSession()`
  (clears the active session; never touches the identity or its key),
  `currentSession()`, `isAuthenticated()`. The pre-existing surface —
  `login(username)`, `logout()`, `currentUser()`, `sign(data)`,
  `getSigningIdentity()`, `signCanonical(descriptor)` — keeps its
  EXACT signature and behavior: `login(label)` finds an existing
  `LocalIdentity` carrying that label (so the same typed username
  keeps resolving to the same key on this device, exactly as 0.2.16
  guaranteed) or creates one, then calls `authenticate()`; `logout()`
  calls `endSession()`; `currentUser()` is now a PURE, DERIVED view of
  `currentSession()` — reading the authenticated identity's `label` —
  rather than a second, independently-stored fact that session state
  could drift away from; `getSigningIdentity()`/`signCanonical()` now
  require an authenticated session (`_requireAuthenticatedIdentity()`),
  throwing "no active authentication session" rather than the old
  "no user logged in" — a distinction that matters because it is now
  possible (and tested) for a `LocalIdentity` to exist on a device
  with no session currently authenticated onto it.
- `application/IdentityUseCase.js` — gains `createIdentity(label)`,
  `listIdentities()`, `authenticate(identityId)`, `endSession()`,
  `currentSession()`, `isAuthenticated()`, and `onSessionChanged()`
  alongside the unchanged `login()`/`logout()`/`currentUser()`/
  `onUserChanged()`. Every path that changes who's logged in — legacy
  `login()`/`logout()` included — publishes BOTH `IdentityChanged` and
  `AuthenticationSessionChanged`, so a component can subscribe to
  whichever question it actually cares about, and the two can never
  observably disagree.

UI:

- `ui/components/LoginModal.js` (rebuilt) — lists every
  `LocalIdentity` this device holds (`IdentityUseCase.listIdentities()`),
  each one a button that calls `authenticate(identityId)` directly;
  logging back in means picking the identity you already have, not
  retyping a string and hoping it maps to the same key. "Create New
  Identity" is a separate, explicit action
  (`createIdentity(label)` + `authenticate()`), never a side effect of
  typing a name that happens to be new.
- `ui/components/UserWidget.js` — logout now calls
  `identityUseCase.endSession()`, the new session vocabulary, instead
  of the legacy `logout()` alias (both remain equivalent; the widget
  adopts the name that matches what's actually happening).

Deliberately not in 0.2.46, matching the design doc's own staged
scope: no passphrase or encryption protecting the stored private key
(key material is exactly as protected as 0.2.16's always was — plain
local storage via `StorageProvider`, a real limitation named here, not
hidden); no portable identity export/import or recovery phrase (moving
to a new device still means creating a brand-new identity); no peer
discovery or authenticated peer session (an `AuthenticationSession`
still only ever proves something to the LOCAL device holding it —
nothing here lets Alice prove her identity to Bob over a network); and
no change at all to `core/Signature.js`, `identity/SigningIdentity.js`,
or `identity/LocalAuthorizationVerifier.js` — a signature produced
under the new model verifies through the completely unmodified 0.2.16
verification pipeline, proven directly by running
`tests/DecentralizedIdentity.test.js`'s full flagship (identity ->
publish -> place -> index -> discover -> verify -> resolve -> stream)
unmodified against the rebuilt provider.

`tests/LocalIdentitySession.test.js` covers `LocalIdentity`'s
validated construction (including a forged `identityId`/`publicKey`
pairing being rejected), that creating an identity does not by itself
authenticate a session, a single device holding multiple independent
identities (switching sessions never deletes or overwrites the other),
that logging out ends the session while the identity and its key
survive on disk, full backward compatibility of the legacy
`login`/`logout`/`currentUser`/`sign` surface (including that the same
typed username keeps resolving to the same `LocalIdentity`), signing
gated end-to-end by `AuthenticationSession` and verified against a
real `Signature` through `LocalAuthorizationVerifier`, and
`AuthenticationSession`'s own pure-data invariants. The entire
pre-existing test suite (~45 files calling `provider.login(...)`, plus
every avatar presence/profile/interaction signing path) was run
unmodified against the rebuilt provider and passes without a single
change.

### Identity Security & Key Protection (0.2.47)

```text
identity exists          identity is unlocked        session is active
────────────────          ─────────────────────        ──────────────────
LocalIdentity              VaultLock (new)               AuthenticationSession
"a key this device         "is the PRIVATE KEY            "is this identity the
 holds" — durable,          decrypted in memory            app's active user?" —
 survives everything         right now?" — transient,      persisted, survives a
 below                       NEVER persisted                page reload

                          unprotected -> always UNLOCKED
                          protected   -> LOCKED on every
                                         fresh page load,
                                         regardless of
                                         session state
```

0.2.46 separated "which key does this device hold" from "is one of
them the app's active user" — but left the key itself exactly as
exposed as 0.2.16's always was: a protected identity's seed sat in
`StorageProvider` as plain hex, readable by anything that could read
`localStorage`. That gap was named, not hidden, in 0.2.46's own
"deliberately not in 0.2.46" list. 0.2.47 closes it for identities that
opt in, and in doing so introduces a FOURTH concept the design doc's
own three-state framing asks for: `identity/VaultLock.js` answers "is
this identity's private key decrypted in memory right now?" —
genuinely independent of both `LocalIdentity` (durable, on disk) and
`AuthenticationSession` (transient, but persisted). A protected
identity can be AUTHENTICATED (the app shows it as logged in) while its
`VaultLock` is LOCKED — an idle timeout or an explicit `lock()` call
evicted the decrypted seed from memory — and signing fails with a
reason that says exactly that, distinct from "not logged in" at all.

Cryptography (all pure functions, no I/O, built from the SAME
self-contained `sha512` primitive `identity/Ed25519.js` already
established — no WebCrypto, no new dependency):

- `identity/KeyEncryption.js` (new) — three standard, textbook
  compositions of SHA-512, never a novel cipher: PBKDF2-HMAC-SHA512
  stretches a passphrase into key material (slow on purpose — see the
  file's own comment on why `DEFAULT_ITERATIONS` is tuned for
  interactive latency in a pure-JS engine rather than audited against
  modern offline-attack cost models, a real, named limitation exactly
  like `identity/Ed25519.js`'s own "self-contained... not a substitute
  for a wallet" framing); a SHA512-CTR keystream XORs the 32-byte seed
  (a block cipher would be the conventional choice — a hash-based
  stream cipher is what "no dependency beyond SHA-512" actually buys);
  and HMAC-SHA512, under a key SEPARATELY derived from encryption's own
  key, tags the ciphertext (encrypt-then-MAC). `decrypt()` checks the
  tag BEFORE trusting the ciphertext, in constant time, so a wrong
  passphrase or a tampered record is rejected outright as
  `IncorrectPassphraseError` — never silently decrypted into
  wrong-but-plausible bytes that would become an invalid signing key
  nobody noticed was invalid.

Lock state (pure data):

- `identity/VaultLock.js` (new) — `LockState.LOCKED`/`UNLOCKED`, an
  `identityId` and, only in the unlocked state, `unlockedAt`. Never
  serialized to storage anywhere in this codebase — persisting
  "unlocked" would mean writing the decrypted seed, or a fact that
  reconstructs it, to disk, defeating the entire point of encrypting it
  there. This is WHY a protected identity's vault always starts LOCKED
  on a fresh page load even when its `AuthenticationSession` is still
  `AUTHENTICATED` from before the reload — there is nothing durable
  that could remember an unlock.
- `identity/FailedUnlockTracker.js` (new) — pure, in-memory,
  per-`identityId` failed-attempt counters with an injectable clock.
  Reaching `maxAttempts` starts a `cooldownMs` window during which even
  the CORRECT passphrase is refused — the lockout is time-based, not
  passphrase-based, so an attacker who eventually guesses right during
  the cooldown still doesn't get in. Never persisted, for the same
  reason `VaultLock` isn't: this rate-limits a live guessing loop within
  one running session, not something meant to survive a restart.
- `identity/VaultTimeoutPolicy.js` (new) — `isVaultExpired(unlockedAt,
  now, timeoutMs)`, a pure function, stated honestly for what it is: a
  fixed maximum duration since last unlock, not real activity tracking.
  Wiring "reset on every click" would need an activity hook threaded
  through the entire UI for a property a bounded lifetime already
  delivers. Computed fresh on every read — never a stored "expired"
  flag — the identical "computed, not stored" discipline
  docs/Principles.md already applies to document lifecycle status and
  spatial overlap.

Identity provider (the seam, extended rather than replaced):

- `identity/LocalIdentity.js` — gains `isProtected`, defaulting to
  `false` so every entry stored before 0.2.47 existed — which never had
  a `protected` field at all — deserializes as the unprotected identity
  it has always been. Display/routing metadata exactly like `label`,
  never key material.
- `identity/LocalIdentityProvider.js` — `createLocalIdentity(label,
  passphrase)`: a passphrase means the plaintext seed is NEVER written
  to storage at all, `KeyEncryption.encrypt()` runs before the very
  first save. `protectIdentity(identityId, passphrase)` (new): migrates
  an EXISTING unprotected identity in place — reads the plaintext seed
  once, re-writes it encrypted, flips the index entry — never automatic,
  never forced, only when the owner explicitly calls it; the identity
  starts LOCKED immediately afterward, because having had the plaintext
  in hand a moment ago to encrypt it doesn't carry over into "already
  unlocked." `unlock(identityId, passphrase)`/`lock(identityId)` (new):
  decrypt the seed into (or evict it from) an in-memory-only
  `_vaultCache` Map, never touching `AuthenticationSession` — "lock/
  unlock without deleting it." `vaultLock(identityId)`/`isUnlocked(
  identityId)` (new): the lock state computed fresh, lazily evicting an
  idle-expired cache entry right there on read.
  `checkVaultTimeouts()` (new): a proactive sweep a UI timer can call so
  an idle-expired vault is announced rather than only discovered the
  next time something tries to sign. `authenticate(identityId,
  passphrase)`: a protected identity that isn't already unlocked
  requires the passphrase here — authenticating onto a locked vault
  unlocks it as part of the same call, so the common "log in" gesture
  stays one step, not two. `endSession()` now also evicts that
  identity's vault cache entry — no session should ever leave a
  protected identity's key sitting decrypted in memory with nothing
  authenticated onto it. `_requireAuthenticatedIdentity()` gains a
  SECOND check after the existing session check: "no active
  authentication session" and "identity is locked" are told apart as
  different refusal reasons, checked in that order.
  `login(username, passphrase)`/every other pre-existing method keeps
  its exact 0.1.21/0.2.16/0.2.46 signature — the passphrase parameter is
  optional and additive; every caller that passes none (all ~45
  pre-existing tests, unmodified) sees no behavior change whatsoever.
- `application/IdentityUseCase.js` — gains `protectIdentity()`,
  `unlock()`, `lock()`, `vaultLock()`, `isUnlocked()`,
  `checkVaultTimeouts()`, and a THIRD event type,
  `VaultLockChanged` (`onVaultLockChanged()`), deliberately NOT folded
  into `IdentityChanged`/`AuthenticationSessionChanged` — a vault can
  lock or unlock without who's-authenticated changing at all, and a
  component only listening for the other two would miss it.

UI:

- `ui/components/LoginModal.js` (rebuilt) — a protected identity in the
  list can't be logged into with one click any more; clicking one opens
  an inline passphrase prompt instead of calling `authenticate()`
  directly, and a wrong passphrase surfaces the provider's own
  remaining-attempts/lockout message. The "Create New Identity" section
  gains an optional passphrase field: blank creates exactly the
  unprotected identity 0.2.46 always created; filled in, the key is
  protected from the moment it's born. A new `unlockIdentityId` prop
  lets a caller open the modal straight into one identity's unlock
  prompt.
- `ui/components/UserWidget.js` — shows a THIRD, distinct state
  (🔒 name + Unlock button) when the current session is authenticated
  but its vault has idle-locked, rather than collapsing that into either
  "logged in" or "logged out" — signing genuinely won't work again until
  the passphrase is re-entered, so showing anything else would be the
  UI claiming a capability the app doesn't currently have. A 15-second
  `setInterval` calls `checkVaultTimeouts()` so an idle vault is noticed
  even if nothing happens to attempt a sign in the meantime.

Deliberately not in 0.2.47: `changePassphrase()`/removing protection
once set (a protected identity's passphrase, once chosen, is not yet
editable — a real, named gap, not an oversight); any PIN-strength or
complexity policy (a passphrase is accepted exactly as typed, with no
judgment about how guessable it is); true activity-based idle detection
(`VaultTimeoutPolicy` is a fixed unlock lifetime, not a listener on
every click/keystroke — see the file's own comment); portable identity
export/import or a recovery phrase (moving to a new device still means
creating a brand-new identity — 0.2.46 already scoped this out as its
own future milestone, and protecting a key locally doesn't change that
it's still the only copy on the only device that has it); and any peer
discovery or authenticated peer session (an unlocked vault still only
ever proves something to the LOCAL device holding it). No change
whatsoever to `core/Signature.js`, `identity/SigningIdentity.js`, or
`identity/LocalAuthorizationVerifier.js` — a signature produced by a
protected identity verifies through the completely unmodified 0.2.16
pipeline, proven directly in `tests/IdentityKeyProtection.test.js` by
running a protected identity's signature through
`LocalAuthorizationVerifier.verifyDescriptor()`.

`tests/IdentityKeyProtection.test.js` covers `KeyEncryption`'s
round-trip/wrong-passphrase/tamper-detection/salt-nonce-uniqueness
properties; `LocalIdentity` backward compatibility with pre-0.2.47
stored entries carrying no `protected` field; that a protected
identity's plaintext seed is never written to storage at all; signing
refused with distinct reasons for "not authenticated" versus "locked,"
verified end-to-end through a real `Signature`/`LocalAuthorizationVerifier`;
failed-unlock attempt counting, time-based cooldown enforcement (the
correct passphrase still refused mid-cooldown), and counter reset on
success; automatic vault expiration as a pure function of
(unlockedAt, now, timeoutMs) that locks the vault WITHOUT ending the
session; in-place, non-destructive migration of an existing unprotected
identity that preserves the exact same cryptographic key; the full
three-state distinction surviving a simulated page reload (a fresh
provider instance over the same storage keeps the identity and the
session, but not the vault); `endSession()` evicting the vault cache so
logging back in never silently reuses a stale unlock; and a
multi-identity device where a protected and an unprotected identity
carry fully independent lock states. The entire pre-existing test suite
— including `tests/LocalIdentitySession.test.js` and
`tests/DecentralizedIdentity.test.js`'s full flagship — was run
unmodified against the extended provider and passes without a single
change.

### Portable Identity, Export, Import & Recovery (0.2.48)

```text
Device A                                    Device B
LocalIdentity                               LocalIdentity
    identityId ─┐                               identityId ─┐  (same)
    publicKey   │                               publicKey   │  (same)
    privateKey  │  exportLocalIdentity()          privateKey │  (same bytes,
                │        │                                   │   re-derived
                │        ▼                                   │   & checked)
                │   ┌───────────────┐   importLocalIdentity() │
                └──▶│ export package│────────────────────────┘
                    │ (encrypted    │
                    │  private key) │
                    └───────────────┘

    starts LOCKED on Device A               starts LOCKED on Device B too
    (if protected) exactly like              (unconditionally — import never
    any other protected identity             authenticates, never unlocks)
```

0.2.46 gave a `LocalIdentity` a durable, inspectable existence; 0.2.47
protected its private key at rest — but both milestones named, rather
than closed, the same gap: the key still only ever existed on the ONE
device that generated it. 0.2.48 closes it. The central invariant
stated once and enforced in three places: exporting and importing an
identity preserves the identity itself, not merely its display name — a
signature produced on the receiving device after import must verify
with the identity's ORIGINAL public key, through the completely
unmodified `LocalAuthorizationVerifier` pipeline.

Package format (pure data, no I/O):

- `identity/IdentityExport.js` (new) — `buildExportPackage()` returns a
  plain, JSON-safe object: `formatVersion`, `identityId`, `publicKey`,
  `algorithm`, an untrusted `label` HINT (local-only presentation
  metadata exactly like `LocalIdentity.js`'s own `label` — never part of
  the cryptographic identity, never validated, never trusted for
  anything but a suggested default on the importing side), and
  `encryptedPrivateKey` — an `identity/KeyEncryption.js` record,
  VERBATIM. There is deliberately no second, separately-invented
  "portable secret" format; the export package protects its private key
  exactly the way 0.2.47 already protects one at rest.

Validation (pure, passphrase-free):

- `identity/IdentityImport.js` (new) — `validatePackage()` throws
  `IdentityPackageError` on the first structural problem it finds:
  unknown `formatVersion`, a missing/malformed field, an
  `encryptedPrivateKey` missing any of `KeyEncryption.encrypt()`'s own
  fields — and, the one check that needs actual cryptography rather
  than shape, that `identityId` is the EXACT did:key derivation of
  `publicKey` (the identical invariant `LocalIdentity.js`'s constructor
  already enforces for a live identity). This catches a tampered or
  corrupted package immediately, before anything is decrypted — public-
  key consistency needs no secret to check.

Recovery decision (storage-agnostic, side-effect-free):

- `identity/IdentityRecovery.js` (new) — `recoverIdentity({ package,
  passphrase, existingIdentities })` runs validate → duplicate-check →
  decrypt → verify, in that order, and never writes anything itself
  (its caller, `LocalIdentityProvider.importLocalIdentity()`, is the
  only thing that persists). An `identityId` already present with
  MATCHING key material short-circuits to `{ status: 'ALREADY_EXISTS' }`
  before decryption is even attempted — a duplicate import doesn't even
  need the correct passphrase, because there is genuinely nothing left
  to prove. Matching `identityId` with DIFFERENT key material throws
  `IdentityConflictError` — currently unreachable through two
  honestly-generated packages (a did:key is a bijective encoding of the
  public key itself, so two different keys can never collide), kept as
  a defensive floor rather than assumed away. Otherwise: `KeyEncryption
  .decrypt()` (wrong passphrase or a tampered record →
  `IncorrectPassphraseError`, identical to 0.2.47's own at-rest
  behavior), then the decrypted seed's OWN derived public key is checked
  AGAIN against the package's claim (`IdentityPackageError` if they
  disagree — a package whose ciphertext decrypts cleanly under the
  given passphrase but doesn't correspond to its own stated public key
  is corrupted or malicious, a distinct failure from a wrong
  passphrase) — only then is `{ status: 'IMPORTED', ...seedBytes }`
  returned for the caller to persist.

Identity provider (the seam, extended again):

- `identity/LocalIdentityProvider.js` — `exportLocalIdentity(identityId,
  passphrase)`: for a protected identity, ALWAYS re-decrypts from the
  stored record — it never reads `_vaultCache`, even if the identity is
  currently unlocked, so exporting demands the passphrase again as its
  own explicit security boundary, distinct from "is this session already
  authenticated." For an unprotected identity, the same single
  `passphrase` parameter plays a different role: there's nothing to
  decrypt, so it's simply the NEW passphrase chosen to protect the
  export for transit — the package format doesn't distinguish "was
  protected at rest" from "protected only for export." Never
  rate-limited by `FailedUnlockTracker` — a one-shot local operation by
  the identity's own owner, not a guessing surface. `importLocalIdentity
  (package, passphrase, { label })`: on `IMPORTED`, persists via the
  SAME `_storeProtectedKey()` 0.2.47 already uses — the imported copy is
  ALWAYS `protected: true`, regardless of whether the source was
  protected on its origin device, because the only secret this device
  ever had was the decrypted seed plus the import passphrase. Never
  calls `authenticate()` and never touches `_vaultCache` — the imported
  identity starts, and stays, LOCKED exactly like any other protected
  identity, because import proves this device now HOLDS the key, never
  that it has been authenticated with it.
- `application/IdentityUseCase.js` — thin `exportIdentity()`/
  `importIdentity()` delegation, the same division every other method
  in the file already follows.

UI:

- `ui/views/IdentityManagementView.js` (new, routed at `/identity`,
  linked from `App.js` as "My Identities") — a DEDICATED view, not an
  extension of `ui/components/LoginModal.js`: LoginModal answers "which
  identity is the app showing as logged in right now," a fast
  single-identity decision; this view answers "what does this device
  hold, and what can I do with each key," independent of which one (if
  any) is currently authenticated. Every identity gets its own
  lock/unlock control and an "Export Identity" action that opens an
  inline passphrase prompt — re-entered every time, exactly as
  `exportLocalIdentity()` requires — followed by the package as
  read-only JSON plus a `download` link. The import form previews
  label/identityId/algorithm/already-exists status by parsing the
  pasted (or file-loaded) JSON client-side, entirely passphrase-free,
  before the passphrase field is even shown — matching `IdentityImport
  .js`'s own "structural validation needs no secret" property — and
  surfaces the exact outcome (`ALREADY_EXISTS` vs. freshly `IMPORTED`
  and now LOCKED) rather than a generic success message.

Deliberately not in 0.2.48: changing or removing a protected identity's
passphrase (unchanged gap from 0.2.47); any recovery path that works
with only the passphrase or only the exported file — see
docs/Principles.md, "Recovery Is Not Password Recovery"; any transport
for the package besides a plain JSON file/textarea (no QR code, no
peer-to-peer transfer); and — unchanged from 0.2.46/0.2.47 — any peer
discovery mechanism or authenticated peer session. No change whatsoever
to `core/Signature.js`, `identity/SigningIdentity.js`, or `identity/
LocalAuthorizationVerifier.js` — proven directly in `tests/
PortableIdentity.test.js`'s flagship test by running a signature
produced on a post-import identity through the completely unmodified
verifier.

`tests/PortableIdentity.test.js` covers: the flagship cross-device
export → import → sign → verify round trip, including the imported
identity starting LOCKED and a locked re-export of the same identity
still requiring its passphrase; exporting demanding the passphrase again
even while the vault is currently unlocked; exporting and importing an
UNPROTECTED identity (the imported copy is always protected regardless);
duplicate import as a pure no-op that doesn't even require the correct
passphrase; a synthetic conflicting-key-material case exercised directly
against `IdentityRecovery.recoverIdentity()`; a battery of malformed/
tampered packages (bad format version, identityId/publicKey mismatch,
malformed fields, a tampered ciphertext caught by the MAC) each rejected
without leaving any partial identity behind; `IdentityImport
.validatePackage()` used standalone with no provider or passphrase at
all; and a byte-identical check that unrelated persisted state — a
stand-in "world state" storage key and a completely unrelated second
identity on the same device — survives an entire mix of successful and
failed export/import operations without a single byte changing.

### Authenticated Peer Connection Model (0.2.49)

```text
                Alice's device                         Bob's device
                LocalIdentityProvider                   LocalIdentityProvider
                (AuthenticationSession,                 (AuthenticationSession,
                 VaultLock — unchanged)                  VaultLock — unchanged)
                       │                                        │
                       ▼                                        ▼
             PeerAuthenticationSession   ◄── connection ──►  PeerAuthenticationSession
                 authenticationState                            authenticationState
                 remoteIdentity                                 remoteIdentity
                       │                                        │
                       ▼                                        ▼
                 PeerConnection          ◄── messages ────►  PeerConnection
                 transportState                                 transportState
                       │                                        │
                       └──────────── LocalPeerConnectionProvider ────────┘
                                    (shared LocalPeerNetwork)
```

Two strictly separate state machines, on purpose (see docs/
Principles.md, "Transport State And Authentication State Are Two
Different Questions"): `peer/PeerConnectionState.js`
(DISCONNECTED/CONNECTING/CONNECTED/FAILED/CLOSED) belongs to
`peer/PeerConnection.js`, and `peer/PeerAuthenticationState.js`
(IDLE/AUTHENTICATING/AUTHENTICATED/FAILED) belongs to
`peer/PeerAuthenticationSession.js`, which is constructed WITH a
connection rather than being one. `peer/PeerConnectionProvider.js` is
the abstract transport boundary — `connect(remoteAddress)` /
`onIncomingConnection()` / `dispose()` — the same throwing-stubs shape
`discovery/DiscoveryProvider.js` established; `peer/
LocalPeerConnectionProvider.js` is its first real implementation, two
or more instances sharing one `LocalPeerNetwork` (a plain address
registry) wiring pairs of `LocalPeerConnection`s together entirely
in-process, message delivery deferred by one microtask so it behaves
like a real, asynchronous transport rather than a same-tick function
call. No commitment to WebRTC or any other real network transport is
made here — see docs/Roadmap.md's own still-unscheduled "Peer Discovery
& Transport Abstraction" entry.

The handshake itself (`peer/PeerAuthenticationSession.js`) is symmetric
— there is no initiator/responder distinction, both sides run identical
logic:

```text
Alice                                          Bob
  │──────────── HELLO(idA, pkA, challengeA) ───────────►│
  │◄─────────── HELLO(idB, pkB, challengeB) ─────────────│
  │──────────── PROOF(idA, pkA, sig(challengeB)) ───────►│
  │◄─────────── PROOF(idB, pkB, sig(challengeA)) ────────│
  │                                                       │
  └──── both sides independently reach AUTHENTICATED ────┘
```

A HELLO is an identity claim plus a fresh CHALLENGE the sender wants
answered; a PROOF answers a specific HELLO with a real Ed25519
signature — `identity/LocalIdentityProvider.js`'s own `signCanonical()`,
completely unmodified — over `core/PeerAuthenticationEnvelope.js`'s new
canonical descriptor (`getPeerAuthenticationSigningDescriptor()`,
backed by a new `SignatureType.PEER_AUTHENTICATION` in `core/
Signature.js`) covering `protocol`, `purpose`, `sessionNonce`
(the connection's own connectionId), `challenge`, `identityId`, AND
`publicKey` together — never a narrower subset, for the same
causal-history reason 0.2.38 signs every field of a presence
advertisement rather than a subset. Verification reuses `identity/
LocalAuthorizationVerifier.js`'s own `verifyDescriptor()` unmodified;
0.2.49 adds a new SignatureType, not a new verifier. A verified PROOF
produces a `peer/PeerIdentity.js` — structurally identical to
`LocalIdentity`'s own identityId-must-derive-from-publicKey invariant,
but carrying no label, no createdAt, and living only as long as the
connection that proved it: the session subscribes to its connection's
`onStateChange()`, and a transition to CLOSED or FAILED immediately
resets `authenticationState` to IDLE and discards `remoteIdentity` —
see docs/Principles.md, "A Peer Authentication Signature Is Scoped To
One Connection, Never To One Identity."

Deliberately not in 0.2.49: any peer discovery or rendezvous mechanism
(finding an address to `connect()` to at all remains the still-
unscheduled "Peer Discovery & Transport Abstraction" milestone this one
was carved out of); any persistent trusted-peer/"friends" concept —
see docs/Principles.md, "A Peer Connection Authenticates A Key, Not An
Account"; a real WebRTC (or any other real network) transport; re-
authentication on an already-`AUTHENTICATED` connection; and
reconnecting presence/profile/interaction sync to run over an
authenticated peer connection instead of today's open
`BroadcastChannel` — this milestone proves the handshake, it does not
yet plug anything else into it. No file under `core/` (besides the two
new, additive files), `application/`, `world/`, `publisher/`,
`discovery/`, or `presence/` was touched.

### Peer Discovery & Rendezvous (0.2.50)

```text
Discovery                Candidate Endpoint       Peer Connection        0.2.49 Handshake
peer/PeerInvitation.js   peer/PeerDiscoveryRecord.js  peer/PeerConnectionProvider.js  peer/PeerAuthenticationSession.js
        │                          │                          │                          │
        ▼                          ▼                          ▼                          ▼
DiscoverPeersUseCase ──► candidateEndpoint ──► ConnectToPeerUseCase ──► ConnectedPeer ──► remoteIdentity
(application/)                                  (application/)          (application/)     (proven, or null)
```

0.2.50 answers the question 0.2.49 deliberately carved itself away from:
"how does Alice find Bob's address at all?" — with the one deliberately
narrow answer the design doc asked for first: a portable, invitation-based
rendezvous hint, never a network scan, a signaling server, or a DHT. The
governing rule, stated once and then enforced structurally everywhere
below rather than merely documented: **a discovery mechanism may say
"here is something that might be Bob." It must never say "this is Bob."**
Only `peer/PeerAuthenticationSession.js` — completely unmodified since
0.2.49 — may ever say the second thing.

`peer/PeerInvitation.js` (new) is the portable package: `formatVersion`,
`invitationId`, `endpoint` (opaque, the same "nothing above this interface
needs to know which transport this is" posture `peer/
PeerConnectionProvider.js` already established for `remoteAddress`),
`expiresAt`, and an optional `identityHint` — untrusted, exactly the same
"local-only, never an authorization claim" property `identity/
IdentityExport.js`'s own `label` hint already carries. Deliberately NOT
signed — see docs/Principles.md, "An Invitation Is A Rendezvous Hint,
Never A Credential." `peer/PeerDiscoveryRecord.js` (new) is the candidate
a discovery mechanism actually produces from one: `candidateEndpoint`,
`identityHint` (carried through, still untrusted), and `source`
(`peer/PeerDiscoverySource.js`, new — `INVITATION` today; `LAN`,
`RENDEZVOUS_SERVICE`, `DHT` named as future values, unimplemented).
`peer/PeerDiscoveryProvider.js` (new, abstract) is the same
throwing-stubs adapter boundary `discovery/DiscoveryProvider.js` and
`peer/PeerConnectionProvider.js` already established —
`importInvitation()`/`list()`/`forget()`/`onDiscovered()`/`dispose()` — so
a future LAN or rendezvous-service provider satisfies the exact same
contract `peer/LocalPeerDiscoveryProvider.js` (new) does today: validate
an invitation (rejecting an expired one outright, before any
`PeerDiscoveryRecord` is created — see "replay after expiry" in the
flagship test below), hold discovered records in memory, notify
subscribers.

`application/DiscoverPeersUseCase.js` (new) and `application/
ConnectToPeerUseCase.js` (new) are the use-case pair the design doc's
`DiscoverPeersUseCase`/`ConnectToPeerUseCase` sketch asked for.
`ConnectToPeerUseCase.connect(discoveryRecord)` is the ACTIVE half:
`peerConnectionProvider.connect(discoveryRecord.candidateEndpoint)`, then a
brand-new `peer/PeerAuthenticationSession.js` layered on top, started
immediately. `.listen()` is the PASSIVE half — accepting an incoming
connection runs through the identical `_authenticate()` path, because the
0.2.49 handshake itself has no initiator/responder distinction; the
symmetry is real, not merely documented. Neither method ever reads
`discoveryRecord.identityHint` — see docs/Principles.md, "Discovery Finds
A Candidate; It Never Authenticates One."

`application/ConnectedPeer.js` (new) is the live, UI-facing aggregate: a
connection plus its authentication session plus (when this side did the
discovering) the discovery record that led here. `getLifecycleState()`
calls `peer/PeerLifecycleState.js`'s new `derivePeerLifecycleState()` — a
PURE function, computed fresh on every call from the two real, unmodified
0.2.49 state machines, never a third stored one (see docs/Principles.md,
"A Peer's Lifecycle Is Derived, Never A Third State Machine"). `setAlias()`
is a deliberately narrow, local-only, never-persisted label — see
docs/Principles.md, "A Peer Alias Is A Local Note, Never A Claim About The
Peer." `application/ConnectedPeerRegistry.js` (new) tracks every live
`ConnectedPeer`, keyed by connectionId, and — structurally, not by
caller discipline — removes one automatically the instant its lifecycle
reaches CLOSED or FAILED: there is no persisted "connected peers" list
anywhere, and no automatic permanent friend relationship, matching 0.2.49's
own "no trusted-peer database, anywhere" stance one layer up.

The flagship test (`tests/PeerDiscovery.test.js`) runs the design doc's
own scripted scenario over a real `LocalPeerConnectionProvider` and two
genuinely independent `LocalIdentityProvider` instances: Alice creates an
invitation naming her own endpoint (with her own identityId riding along
as a courtesy hint) → Bob imports it → discovers her candidate endpoint →
connects → 0.2.49 mutual authentication runs to completion on BOTH sides
(Bob via `connect()`, Alice via her own `listen()`) → Bob's `ConnectedPeer`
holds Alice's real, proven `PeerIdentity`, and Alice's independently holds
Bob's. Separate tests then modify the endpoint (the connection attempt
fails outright, at the transport layer, nothing ever reaches the registry)
and the identityHint (the connection still succeeds against the genuine
endpoint, and the resulting `remoteIdentity` is still, provably, Alice —
never the tampered hint); replay a captured invitation after its own
expiry (rejected by discovery, before any connection is attempted); close
the connection (the peer disappears from both sides' registries,
automatically); and reconnect (a brand-new `ConnectedPeer`, no alias
carried over, re-authenticating completely from nothing). No file under
`core/`, `world/`, `publisher/`, `discovery/`, `presence/`, or any existing
`peer/`/`identity/` file was touched — 0.2.50 is additive only.

Deliberately not in 0.2.50: any real network transport (LAN broadcast, a
rendezvous service, a DHT) — `peer/LocalPeerConnectionProvider.js` remains
the deterministic in-process test transport, exactly as 0.2.49 left it;
see 0.2.51, below, which closes this specific gap.
Signing or otherwise cryptographically protecting a `PeerInvitation` — see
docs/Principles.md, "An Invitation Is A Rendezvous Hint, Never A
Credential," for why that would be the wrong fix for the wrong problem.
Any persistent contacts/friends list, alias-by-identityId, or other
"remember this peer across connections" mechanism — `ConnectedPeer`'s
alias is deliberately the narrowest possible answer to the design doc's
"peer aliases" idea, not a first draft of a social system. Any new UI —
`peer/`/`application/` are complete and fully tested, but wiring a live
"Connected Peers" panel into the actual browser app is deferred until
0.2.51 gives two real endpoints something more meaningful than a
same-process loopback to demonstrate; building that UI now, against a
transport that cannot yet connect two different browser sessions, would
be a toy rather than a genuine preview. An `AvatarPresence`/"online"
concept keyed off peer authentication — see docs/Principles.md's own
"Identity, Authentication, Peer, Presence, Visibility, Avatar Profile" list
this milestone deliberately leaves untouched: a peer being AUTHENTICATED
says nothing about whether any avatar is visible in the world.

`tests/PeerAuthentication.test.js` covers: `PeerIdentity`'s own
validated construction; `LocalPeerConnectionProvider` as a real
bidirectional in-process transport; the flagship two-independent-device
mutual authentication (mirroring `tests/PortableIdentity.test.js`'s own
two-device setup), followed by close discarding authentication on BOTH
ends and reconnect requiring — and successfully completing — a
brand-new handshake; a captured, entirely genuine handshake message
replayed into a fresh connection, rejected specifically on
`sessionNonce`; a modified challenge in an otherwise-genuine PROOF,
rejected; a substituted public key, rejected both as a bare
identityId/publicKey mismatch and as a fully self-consistent
impersonation attempt using a different real identity's own key (the
signature still fails because it was never produced for that
identity); a genuinely valid signature reused against a different
challenge with `sessionNonce`/`challenge` both relabeled to match the
target connection, rejected purely because the underlying signature no
longer verifies; and a final check that `core/
AvatarPresenceAdvertisement.js` signing is completely unaffected and
that a presence signature can never be mistaken for a peer-
authentication proof (`signature domain mismatch`).

### Real WebRTC Peer Transport & Signaling Handoff (0.2.51)

```text
   Alice                                              Bob
     │                                                  │
     ▼                                                  │
createOffer() ──► PeerConnectionOffer                   │
     │            (connectionId, sdp, ice, expiry)      │
     │                     │                             │
     │       (invitation endpoint / copy-paste / QR)     │
     │                     └───────────────────────────► │
     │                                                    ▼
     │                                             connect(offer) ──► PeerConnectionAnswer
     │                                                    │           (connectionId, sdp, ice, expiry)
     │       (reply / copy-paste / QR)                    │
     │◄───────────────────────────────────────────────────┘
     ▼
acceptRemoteAnswer(answer)
     │
     ▼
   WebRtcPeerConnection  ◄── real RTCDataChannel ──►  WebRtcPeerConnection
     transportState                                     transportState
     │                                                    │
     ▼                                                    ▼
peer/PeerAuthenticationSession.js  ◄── unmodified ──►  peer/PeerAuthenticationSession.js
   (0.2.49, completely unchanged)
```

0.2.51 closes the specific gap 0.2.49 named at the transport layer ("no
commitment to WebRTC or any other real network transport is made here")
and 0.2.50 named again ("finding two real, different browser sessions and
getting real bytes between them is the still-proposed 'Real Browser Peer
Transport'"). `peer/WebRtcPeerConnection.js` (new) and `peer/
WebRtcPeerConnectionProvider.js` (new) satisfy the exact same `peer/
PeerConnection.js`/`peer/PeerConnectionProvider.js` contracts `peer/
LocalPeerConnectionProvider.js` already does — `connect(remoteAddress)`,
`onIncomingConnection()`, `dispose()`, `send()`, `onMessage()`,
`onStateChange()`, `close()` — so `application/ConnectToPeerUseCase.js`
and `application/DiscoverPeersUseCase.js` needed no changes to their own
decision logic to drive a real transport instead of an in-process one.
The base `peer/PeerConnection.js` interface is deliberately widened by
exactly two things, both purely about moving bytes, never about
identity: `role` (`'offerer'` or `'answerer'` — the two sides of a WebRTC
handshake genuinely run different code, unlike 0.2.49's own symmetric
handshake) and `localSignal`/`onLocalSignalReady()`/`acceptRemoteAnswer()`
— the signaling extension a caller uses to actually relay SDP/ICE
payloads out-of-band. Nothing here ever exposes identity, an avatar, a
username, or an authenticated peer — see docs/Principles.md, "A Transport
Connection Is Never An Authenticated Peer."

WebRTC's own signaling requirement — Alice and Bob still have to exchange
an SDP offer and answer before any DataChannel can open — is answered
with the same "portable payload, deliberate out-of-band handoff" shape
0.2.50 already established for discovery, never a signaling SERVER this
milestone would have to operate. `peer/PeerConnectionOffer.js` (new) and
`peer/PeerConnectionAnswer.js` (new) are the portable packages:
`formatVersion`, `connectionId`, `sdp`, `iceCandidates`, `createdAt`,
`expiresAt` — deliberately UNSIGNED and deliberately short-lived (a 5
minute default, shorter than a `PeerInvitation`'s own longer rendezvous
window), exactly as untrusted as a `peer/PeerInvitation.js` — see docs/
Principles.md, "A Signaling Payload Is Not An Identity Proof." An offer's
own `connectionId` — minted once, by the offering side, in
`PeerConnectionOffer.create()` — becomes the eventual `peer/
PeerConnection.js#connectionId` on BOTH ends (the answerer adopts it
verbatim rather than generating its own), which in turn is the
`sessionNonce` 0.2.49's handshake already binds every signature to; no
new coordination mechanism was needed to make both sides agree on one
connectionId. `WebRtcPeerConnection` waits for `RTCPeerConnection`'s
`iceGatheringState` to reach `'complete'` before exposing `localSignal` —
non-trickle ICE, deliberately, so the entire payload is one self-
contained, copy-pasteable (or QR-able) blob rather than a live stream of
candidate messages a static invitation-style handoff has no channel for.

Critically, a serialized `PeerConnectionOffer` is usable verbatim as a
`peer/PeerInvitation.js#endpoint` — `endpoint` was already documented as
opaque at that layer since 0.2.50 — so 0.2.50's discovery flow
(`PeerInvitation` → `LocalPeerDiscoveryProvider` → `DiscoverPeersUseCase`)
plugs into this real transport with ZERO changes to any of those files;
the flagship test proves it by routing an actual WebRTC offer through
completely unmodified 0.2.50 discovery code. `application/
ConnectToPeerUseCase.js` gained exactly one new method,
`attach(connection, discoveryRecord)`, wrapping an ALREADY-EXISTING
connection in 0.2.49 authentication and the registry — for a transport
where dialing and connection-object-creation are two separate steps
(`WebRtcPeerConnectionProvider#createOffer()`'s caller holds a connection
before any remote answer has even arrived). `connect()` and `listen()`
are now both thin wrappers over it, with no observable behavior change
for either. The same use case's `_authenticate()` also stopped assuming a
connection is already CONNECTED the instant it exists — `peer/
LocalPeerConnectionProvider.js` always was, since in-process pairing is
instant, so `session.start()` used to run synchronously, same tick; a
real ICE negotiation cannot make that promise. `_authenticate()` now
waits for `transportState` to reach CONNECTED — immediately if it already
has, otherwise via `onStateChange()` — before starting the handshake,
correct for both transports at once and an exact no-op for the
already-synchronous `LocalPeerConnectionProvider` path.

Real WebRTC also has no equivalent of `LocalPeerConnection`'s instantly-
mirrored `close()` — an abrupt `RTCPeerConnection#close()` gives the
remote side nothing to react to promptly, leaving it to notice only via
ICE's own, far slower, consent-freshness/failure timers. `peer/
WebRtcPeerConnection.js#close()` sends one small, transport-level
CLOSE_SENTINEL over the DataChannel first — filtered out of `onMessage()`
and invisible to `peer/PeerAuthenticationSession.js` or anything else
above this layer, still carrying no identity — so closing propagates in
about one real network round-trip instead. A connection that never
receives it (the remote already vanished) still eventually reaches
CLOSED/FAILED via ICE's own detection regardless; the sentinel is a
latency improvement, not a correctness dependency.

Building and testing this against a REAL, two-connection, realistically-
timed transport surfaced a genuine, pre-existing bug one layer up, in
code 0.2.50 shipped: `application/ConnectedPeer.js#_notify()` iterated
its `_stateListeners` Set live, but `application/
ConnectedPeerRegistry.js`'s own auto-removal-on-CLOSED handler calls
`dispose()` — which `clear()`s that very Set — from inside that same
notification. Clearing a `Set` mid-iteration truncates a `for...of`
already in progress, so any listener registered after the registry's own
internal one silently never ran. `peer/LocalPeerConnectionProvider.js`'s
instant, synchronous close never gave any test a listener that needed to
survive registry disposal within the same notification pass to expose
this; a real, network-timed WebRTC close did. Fixed by snapshotting
(`Array.from(this._stateListeners)`) before iterating — every listener
subscribed at notification time is now called exactly once, regardless of
what it does in response. No behavior change for any existing 0.2.49/
0.2.50 code path; `tests/PeerAuthentication.test.js` and `tests/
PeerDiscovery.test.js` both still pass completely unmodified.

The flagship test (`tests/WebRtcPeerTransport.test.js`) runs the full
chain over a REAL `RTCPeerConnection`/`RTCDataChannel` pair — two
genuinely separate objects in the actual browser this test suite runs
in, not a shared in-process registry — with signaling relayed only as
JSON that has round-tripped through `JSON.stringify`/`JSON.parse`,
simulating an actual copy/paste handoff rather than a live reference:
Alice opens a WebRTC offer and attaches it to authentication immediately
(authentication does not actually start until the connection reaches
CONNECTED); the offer becomes a completely ordinary 0.2.50
`PeerInvitation`'s endpoint; Bob imports it, discovers it, and connects
through the unmodified `ConnectToPeerUseCase.connect()` path; his answer
relays back the same way; both sides independently reach AUTHENTICATED
over the real DataChannel holding the other's proven `PeerIdentity` — a
real message sent over the channel is confirmed to actually arrive.
Separate tests then prove: a stale/replayed offer is rejected by
`connect()` before any `RTCPeerConnection` work begins; an answer for the
wrong `connectionId` is rejected outright, leaving the connection
untouched (still CONNECTING, not corrupted into a half-applied state);
closing a real connection removes the peer from both sides' registries —
a genuine network fact now, not an instantly mirrored one; and
reconnecting opens a brand-new WebRTC connection with a fresh
connectionId, re-authenticating completely from nothing, no alias carried
over. See docs/Principles.md, "A Signaling Payload Is Not An Identity
Proof" and "A Transport Connection Is Never An Authenticated Peer."

Deliberately not in 0.2.51: any signaling SERVER or rendezvous service —
the offer/answer handoff is exactly as manual and deliberate as 0.2.50's
own invitation handoff, on purpose, never a centralized dependency this
milestone would have to operate; STUN/TURN configuration for real NAT
traversal across the open internet — `WebRtcPeerConnectionProvider`
accepts an `iceServers` option and passes it straight through unmodified,
but ships with none configured, so same-network/loopback connectivity is
all this milestone proves; any application-level message protocol beyond
0.2.49's own HELLO/PROOF — a `PeerConnection` still just moves opaque,
JSON-shaped messages, exactly as before; reconnecting presence/profile/
interaction sync to run over an authenticated peer connection instead of
today's open `BroadcastChannel` — unchanged from 0.2.49's and 0.2.50's
own deferral, now finally within reach; any new UI wiring a live
"Connected Peers" panel into the actual browser app; and persistent peer
trust, friends, aliases-by-identityId, or any social-graph concept —
0.2.49's "authenticates a key, not an account" stance is completely
untouched by having a real network under it.

### Authenticated Peer Messaging & Protocol Multiplexing (0.2.52)

```text
                    ┌── Presence          (still BroadcastChannel, 0.2.53+)
                    ├── Avatar Profile    (still BroadcastChannel, 0.2.53+)
Authenticated ──────┼── Avatar Interaction (still BroadcastChannel, 0.2.53+)
Peer Connection     └── test.alpha / test.beta / ...   (proven by this milestone's own flagship)
      ▲
      │  peer/PeerMessageBus.js
      │    subscribe(protocol, handler)  — once, independent of which peer sends
      │    send(connectedPeer, protocol, payload) — to exactly one peer
      │
      │  gated on: connectedPeer.getLifecycleState() === AUTHENTICATED,
      │  rechecked on EVERY message, never cached from attach() time
      │
application/ConnectedPeer.js        (0.2.50, completely unmodified)
      │
peer/PeerConnection.js  ◄── same interface, Local OR WebRTC ──►  peer/PeerConnection.js
peer/PeerAuthenticationSession.js  (0.2.49, completely unmodified)
```

0.2.52 answers the question 0.2.51's own proposed-follow-on list opened
first: once Alice and Bob have a real, authenticated peer connection
(0.2.49 through 0.2.51, all three completely unmodified here), how do
different decentralized application protocols safely share it? Not yet a
real protocol — Presence, Avatar Profile, and Avatar Interaction all
still run over their own `BroadcastChannel`s, untouched — but the
multiplexing substrate every future one will need, so that a protocol
subscribes exactly once and never learns, or needs to learn, whether the
peer underneath is `peer/LocalPeerConnectionProvider.js` or `peer/
WebRtcPeerConnectionProvider.js`.

`peer/PeerMessage.js` (new) is the deliberately boring wire envelope
every application message travels in from now on — `{ messageId,
protocol, version, payload }` — structurally validated
(`isValidPeerMessageEnvelope()`) but never interpreted: this file never
looks inside `payload`, and never will. See docs/Principles.md, "A Peer
Message Envelope Carries Routing Information, Never Meaning." It carries
no avatar state, no username, no authorization decision, no trust state,
and no signature — see the "no second signature" note below. `peer/
PeerMessageBus.js` (new) is the application-facing multiplexer sitting
directly on `application/ConnectedPeer.js`, nothing lower:
`subscribe(protocol, handler)` registers a handler for a namespaced
protocol name (`"avatar-presence"`, `"test.alpha"`, ...) ONCE, entirely
independent of which peer eventually sends under that name;
`send(connectedPeer, protocol, payload)` delivers to exactly one peer and
returns the envelope's own `messageId`. Structurally, this class never
contains `if (protocol === 'avatar-presence')` anywhere — routing is
purely a `Map` from protocol name to whatever handlers subscribed, which
is what makes "a peer connection transports messages; it does not
interpret them" a fact about the code rather than merely a comment on it
— see docs/Principles.md, "A Peer Connection Transports Messages; It Does
Not Interpret Them."

The central rule, structurally enforced rather than merely documented
(the design doc's own #4): a peer whose `getLifecycleState()` is not,
right now, `AUTHENTICATED` gets no message channel at all. `send()`
throws rather than queuing or silently dropping; every INCOMING message
is re-checked against the peer's CURRENT lifecycle at delivery time, not
merely at the moment a protocol called `attach()` — so a connection that
is CONNECTED but still AUTHENTICATING, or one whose authentication has
since FAILED, cannot inject anything through the bus even with a
perfectly well-formed envelope. `peer/PeerAuthenticationSession.js` is
completely unmodified; `PeerMessageBus` only ever reads its result
through `ConnectedPeer#getLifecycleState()`. `attach()` also auto-
detaches the moment that lifecycle reaches `CLOSED`/`FAILED` — the same
"no separate cleanup call required" discipline `application/
ConnectedPeerRegistry.js` already applies one layer down.

Transport-level hygiene only, per the design doc's own explicit list: a
malformed envelope, an oversized one (`MAX_PEER_MESSAGE_BYTES` — a
generous, arbitrary 64KB ceiling, transport hygiene never a real
per-protocol budget), and a duplicate `messageId` (suppressed within a
small BOUNDED per-connection window — deliberately NOT `replication/
ReplayGuard.js`'s own unbounded ledger, which answers a different,
persistent question) are all rejected before ever reaching a handler; an
unknown protocol is simply ignored, no error, no special case. What a
STALE or REPLAYED application message means — Presence's own freshness
rules, Interaction's own sequence/duplicate handling — is never this
layer's question; see docs/Principles.md, "Replay Semantics Belong To
The Protocol, Never The Bus."

Deliberately, per the design doc's own explicit reasoning, NO second
generic message signature was added here (no `PeerMessage.signature`
field). The connection is already authenticated — `peer/
PeerAuthenticationSession.js` already proved who controls it — and a
protocol that additionally needs cryptographic proof over its OWN
payload signs at ITS OWN layer, exactly like `core/
AvatarPresenceAdvertisement.js` and friends already do today over
`BroadcastChannel`. Adding a second, generic envelope signature here
would be a cryptographic layer with no clear purpose yet; see docs/
Principles.md, "A Peer Connection Transports Messages; It Does Not
Interpret Them."

The flagship test (`tests/PeerMessaging.test.js`) runs the identical
application-level scenario over BOTH `peer/LocalPeerConnectionProvider.js`
and `peer/WebRtcPeerConnectionProvider.js`, completely unmodified: Alice
and Bob mutually authenticate (0.2.49 through 0.2.51, untouched), Alice
sends `test.alpha`/`test.beta`/`test.unknown` through her own
`PeerMessageBus`, and Bob — subscribed only to the first two — receives
exactly those two, each exactly once, with the real, PROVEN sender
identity riding along in the delivery metadata (`meta.connectedPeer.
remoteIdentity`); the unsubscribed `test.unknown` protocol, a genuine
message over a genuine authenticated connection, is silently dropped
rather than reaching an unrelated handler, and the bus is proven
bidirectional (Bob answers back over the same connection). Running this
scenario twice, over two structurally different transports, with zero
changes to the test's own application-level assertions, is what proves
the multiplexing layer is a real abstraction rather than an interface
with one implementation underneath. Separate, deterministic tests (built
the same minimal-stand-in way `tests/PeerAuthentication.test.js`'s own
forged-message blocks are) prove the AUTHENTICATED-gating security
property directly: a message arriving on a CONNECTED-but-not-yet-
AUTHENTICATED connection is dropped, the identical connection delivers
normally the instant it reaches AUTHENTICATED, and a connection whose
authentication later FAILS goes back to dropping everything; and that a
`PeerAuthenticationSession` HELLO/PROOF message — sharing the EXACT same
`onMessage()` stream a `PeerMessage` envelope travels on — can never be
mistaken for one, so `PeerMessageBus` needs no special-case filter to
keep the two apart, only `isValidPeerMessageEnvelope()`'s ordinary
structural check.

Deliberately not in 0.2.52: any real application protocol actually using
this bus yet — Presence/Avatar Profile/Avatar Interaction all remain on
their own separate `BroadcastChannel`s, completely unchanged, until a
future milestone begins moving them over one at a time; any change to
`core/PresenceVisibilityPolicy.js`'s PUBLIC/FRIENDS/LOCAL/HIDDEN
vocabulary, even though a real per-recipient authenticated channel
finally makes FRIENDS meaningful — that redesign waits until the
substrate it would need is proven, not the other way around; a second,
generic message-level signature (see this milestone's own reasoning
above); message ordering, acknowledgment, retry, or delivery guarantees
beyond whatever the underlying `PeerConnection` already offers —
fire-and-forget, exactly like a HELLO/PROOF already is; and any UI
surface — this milestone is substrate only, with nothing yet plugged into
it worth showing.

### Peer-Based Avatar Presence (0.2.53)

```text
Local AvatarPresenceSession        (0.2.33/0.2.36, unmodified)
        │
        ▼
PresenceSyncService.publish(ad)    (0.2.37, unmodified — still ONE
        │                           argument, still no idea who receives it)
        ▼
AvatarPresenceBroadcastProvider    (0.2.37's interface, unmodified)
        │
        ├── LocalAvatarPresenceBroadcastProvider   (0.2.37 — BroadcastChannel,
        │                                            still the app's DEFAULT,
        │                                            now honestly "local/demo")
        │
        └── PeerAvatarPresenceBroadcastProvider    (NEW, 0.2.53)
                  │
                  │  for each connectedPeerRegistry.list() peer:
                  │    AUTHENTICATED right now?  (peer/PeerLifecycleState.js)
                  │    shouldAdvertiseToPeer(peer.remoteIdentity.identityId)?
                  │        (core/PresenceVisibilityPolicy.js, NEW method)
                  │    → PeerMessageBus.send(peer, 'forkbuild:avatar-presence', ad)
                  ▼
      peer/PeerMessageBus.js         (0.2.52, unmodified)
      application/ConnectedPeer.js   (0.2.50, unmodified)
      peer/PeerConnection.js — Local OR WebRTC (0.2.49/0.2.51, unmodified)
      peer/PeerAuthenticationSession.js (0.2.49, unmodified)
                  │
                  ▼            (the SAME advertisement, received)
      PeerMessageBus.subscribe('forkbuild:avatar-presence', cb)
                  │
                  ▼
      PeerAvatarPresenceBroadcastProvider#onAdvertisement(cb)
                  │
                  ▼
      PresenceSyncService.pull()          (0.2.37, unmodified)
      application/LocalPresenceStore.js   (0.2.37/0.2.38, unmodified)
      application/PresenceTrustBoundary.js (0.2.38, unmodified)
      core/PresenceIngestion.js / PresenceAuthority.js /
      PresenceReplayWindow.js / PresenceEquivocation.js  (all unmodified)
                  │
                  ▼
      RemoteAvatarRegistry → renderer      (0.2.37, unmodified)
```

0.2.53 answers the question 0.2.52's own proposed follow-on list opened
first: "Replace `BroadcastChannel` as the primary remote-presence
transport with authenticated peer messaging, while preserving the
entire 0.2.38 presence trust model" — an architectural test of a claim
0.2.37 made about itself six milestones ago, that presence's transport
was deliberately modeled as a pluggable interface rather than a
concrete dependency. The test passes almost too cleanly to be
interesting on its own: `presence/PeerAvatarPresenceBroadcastProvider.js`
(new) is a SECOND, real implementation of `presence/
AvatarPresenceBroadcastProvider.js`'s own `advertise()`/`onAdvertisement()`/
`dispose()` contract, sitting on `peer/PeerMessageBus.js` and
`application/ConnectedPeerRegistry.js` (both 0.2.50/0.2.52, both
completely unmodified) instead of the browser's `BroadcastChannel` API
— and because every file downstream of that interface
(`application/PresenceSyncService.js` through `core/PresenceFreshness.js`)
only ever depended on the INTERFACE, not on which concrete provider
implemented it, not one of them needed to change. See docs/Principles.md,
"A Transport Migration Should Leave The Trust Model Untouched."

The one genuinely new architectural fact a real point-to-point
transport introduces, and the one thing 0.2.53 DOES add code for:
presence is no longer "everyone on this origin," it is N independent
one-to-one sends, one per currently-AUTHENTICATED peer connection —
and 0.2.53 decides WHICH of those N sends happens with a brand-new
per-peer method, `core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer(peerIdentityId)`,
consulted once per peer inside `PeerAvatarPresenceBroadcastProvider#advertise()`
— never inside `PresenceSyncService` or `WorldNavigationSession`, and
never by adding a recipient/visibility field to `core/
AvatarPresenceAdvertisement.js`'s own wire shape, which gained nothing
this milestone. See docs/Principles.md, "Peer Selection Is A Transport
Concern, Never A Presence-Core Concern." This is what finally gives
PUBLIC/FRIENDS/LOCAL their honest, distinct meanings 0.2.40 could only
describe as "observationally identical today":

- **PUBLIC** — every eligible AUTHENTICATED peer, no exceptions. Not
  "the whole Internet" — there is still no global broadcast/discovery
  network, only whichever peers this replica currently has a live,
  authenticated connection with.
- **FRIENDS** — the existing coarse gate (`shouldAdvertise()`: "is the
  list non-empty at all," unchanged, still consulted first, still by
  `WorldNavigationSession` before `publish()` is even called) is now
  joined by a genuine per-peer one: only a peer whose PROVEN `peer/
  PeerIdentity.js#identityId` (a did:key, from a real 0.2.49 signed
  handshake) appears in `authorizedPeerIdentities` receives anything.
  `core/PresenceVisibilityPolicy.js`'s own header names the correction
  this required to its own 0.2.40 prediction: what a real peer
  connection can PROVE is a cryptographic key, never an
  `AvatarProfile#ownerIdentity` username (see docs/Principles.md, "A
  Peer Connection Authenticates A Key, Not An Account," 0.2.49) — so an
  entry in the list must now be the did:key you want to authorize, not
  a display name, to have any per-peer effect at all.
- **LOCAL** — deliberately given NO new semantics beyond what it always
  documented ("confined to the local, same-origin transport scope"):
  `shouldAdvertiseToPeer()` returns `false` unconditionally for LOCAL,
  so it never reaches a peer connection — even a same-machine
  `LocalPeerConnectionProvider` one — regardless of who the peer is.
  Only `presence/LocalAvatarPresenceBroadcastProvider.js`'s own
  BroadcastChannel scope still qualifies as "local" for this purpose.
- **HIDDEN** — unchanged: nothing is ever sent, and the per-peer method
  agrees for defense in depth even though the coarse gate already
  blocks it earlier.

`presence/LocalAvatarPresenceBroadcastProvider.js` is deliberately NOT
removed or deprecated — `CreateWorldViewUseCase.js` still constructs it
as the app's only wired transport, unchanged. There is still no live
"Connected Peers" UI anywhere in the running app (proposed, unscheduled,
since 0.2.50/0.2.51), so there is no way for a real user session to
have any AUTHENTICATED peers for `PeerAvatarPresenceBroadcastProvider`
to send to yet; wiring an actual network-mode/local-mode switch into
`CreateWorldViewUseCase.js` is left for whichever future milestone
finally ships that UI, exactly the same "substrate before surface"
sequencing 0.2.49 through 0.2.52 already followed. `presence/
AvatarPresenceBroadcastProvider.js` itself — the shared interface both
providers satisfy — is untouched.

Also deliberately unchanged: presence never triggers a connection.
`PeerAvatarPresenceBroadcastProvider` only ever iterates
`connectedPeerRegistry.list()` — connections that already exist for
reasons entirely outside this class's knowledge — and never calls
`connect()` on anything; see docs/Principles.md, "Presence Never
Establishes A Connection." Discovery, Connection, and Authentication
stay exactly the three separate, already-existing steps 0.2.49 through
0.2.51 built; Presence (and any future protocol on `PeerMessageBus`) is
only ever a fourth, optional step layered on top of an authenticated
connection someone else's code decided to open.

The flagship test (`tests/PeerAvatarPresence.test.js`, Section D) runs
the design doc's own scripted scenario with three real nodes over a
real `peer/LocalPeerConnectionProvider.js` network: Alice dials OUT to
both Bob and Charlie (who never connect to each other — there is
structurally no path between them, not merely a policy that happens to
block one), all three mutually authenticate via completely unmodified
0.2.49 handshakes. PUBLIC, Alice's movement reaches both Bob and
Charlie independently through their own `PeerMessageBus`es. Switching to
FRIENDS authorizing only Bob's proven `identityId`, her next movement
reaches Bob; Charlie's own view of Alice stays exactly where it was —
never updated, never told anything changed. HIDDEN blocks both, even
though Alice's own local presence genuinely keeps advancing (0.2.40's
"a publish gate, not a movement gate" holds unchanged). PUBLIC again
catches both Bob and Charlie up to the same current position with zero
special-casing. Finally, a tampered advertisement — Alice's own genuine
signature, stolen from one position and paired with a different one —
sent directly over the same authenticated connection Bob just
legitimately received presence over, is rejected by the completely
unmodified `application/PresenceTrustBoundary.js`, proving 0.2.38's
trust semantics survived the transport swap rather than merely being
untouched by inspection. Throughout, Alice's `AvatarProfile`, her
`Publication`, and its `WorldPlacement` stay byte-identical, the same
non-contamination proof 0.2.39 through 0.2.45's own flagships already
established for the avatar arc.

Deliberately not in 0.2.53, matching the design doc's own explicit
scope: automatic peer discovery, friend requests, a global online
status/peer directory, mesh routing or presence FORWARDING (Alice's
presence reaches only peers she has a direct authenticated connection
with — Bob never relays it to anyone else on her behalf, which would
immediately raise its own authorization/provenance/replay/amplification
questions), a NAT relay service, chat, voice, a persistent social graph
or persistent peer trust, and any new UI — no live "Connected Peers"
panel, no network-mode/local-mode switch in the running app. Also
deliberately not in 0.2.53: moving Avatar Profile (0.2.41) or Avatar
Interaction (0.2.45) onto `PeerMessageBus` — both remain on their own
separate `BroadcastChannel`s, untouched, exactly like Presence itself
was before this milestone.

Proposed, unscheduled follow-on milestones this opens: Peer-Based
Avatar Profile Synchronization and Peer-Based Avatar Interaction — the
identical transport swap applied to 0.2.41's and 0.2.45's own
`BroadcastChannel`-based protocols in turn, each keeping its own
existing signature/trust/replay machinery completely untouched, the
same way this milestone kept presence's own; a live "Connected Peers"
UI, finally with something real to show once any protocol uses it; and
a network-mode/local-mode transport switch wired into the actual
browser app, unchanged from 0.2.51's own proposal, now with a second
real transport to switch to.

### Peer-Based Avatar Profile Synchronization (0.2.54)

```text
Local AvatarProfileUseCase          (0.2.33/0.2.34, unmodified)
        │
        ▼
AvatarProfileSyncService.publish(ad)  (0.2.41, unmodified — still ONE
        │                               argument, still no idea who receives it)
        ▼
AvatarPresenceBroadcastProvider's interface  (0.2.37's interface, unmodified,
        │                                      reused directly for profile
        │                                      since 0.2.41 — see
        │                                      CreateWorldViewUseCase.js)
        │
        ├── LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-profile')
        │       (0.2.37/0.2.41 — BroadcastChannel, still the app's DEFAULT)
        │
        └── PeerAvatarPresenceBroadcastProvider(protocol:'forkbuild:avatar-profile')
                  (0.2.53's class, REUSED unmodified, NEW instance/protocol)
                  │
                  │  for each connectedPeerRegistry.list() peer:
                  │    AUTHENTICATED right now?  (peer/PeerLifecycleState.js)
                  │    shouldAdvertiseToPeer(peer.remoteIdentity.identityId)?
                  │        (core/AvatarProfileVisibilityPolicy.js, NEW file)
                  │    → PeerMessageBus.send(peer, 'forkbuild:avatar-profile', ad)
                  ▼
      peer/PeerMessageBus.js         (0.2.52, unmodified — the SAME shared
      application/ConnectedPeer.js    bus/registry a node's presence
      peer/PeerConnection.js          transport already attached to)
      peer/PeerAuthenticationSession.js (all unmodified)
                  │
                  ▼            (the SAME advertisement, received)
      PeerMessageBus.subscribe('forkbuild:avatar-profile', cb)
                  │
                  ▼
      PeerAvatarPresenceBroadcastProvider#onAdvertisement(cb)
                  │
                  ▼
      AvatarProfileSyncService.pull()        (0.2.41, unmodified)
      application/LocalAvatarProfileStore.js  (0.2.41, unmodified)
      application/AvatarProfileTrustBoundary.js (0.2.41, unmodified)
      core/AvatarProfileIngestion.js / AvatarProfileEquivocation.js
      application/AvatarProfileSigning.js  (all unmodified)
                  │
                  ▼
      RemoteAvatarAppearanceRegistry → renderer  (0.2.41, unmodified)
```

0.2.54 answers the second item on 0.2.53's own proposed follow-on
list: "the identical transport swap applied to 0.2.41's own
`BroadcastChannel`-based protocol, keeping its existing
signature/trust/replay machinery completely untouched." Unlike 0.2.53,
this milestone adds no second real implementation class at all —
`presence/PeerAvatarPresenceBroadcastProvider.js` is REUSED, byte-for-
byte unmodified, for the profile channel too, a SECOND instance
constructed with `protocol: 'forkbuild:avatar-profile'` instead of its
own default. This is not a shortcut; it is the identical reuse
decision `CreateWorldViewUseCase.js` already made in 0.2.41 when it
pointed `LocalAvatarPresenceBroadcastProvider` at a second
`BroadcastChannel` name rather than duplicating a presence-flavored-
in-name-only sibling class — `PeerAvatarPresenceBroadcastProvider`'s
own 0.2.53 header even named this exact future reuse as the reason its
`protocol`/`getVisibilityPolicy` constructor parameters were injectable
in the first place. Because every file downstream of `presence/
AvatarPresenceBroadcastProvider.js`'s interface only ever depended on
the interface, not on which concrete provider (or which INSTANCE of a
provider) implemented it, `application/AvatarProfileSyncService.js`
through `application/RemoteAvatarAppearanceRegistry.js` — the entire
0.2.41 profile pipeline — needed zero changes, the identical payoff
0.2.53 already collected for presence.

The one genuinely new file this milestone adds is `core/
AvatarProfileVisibilityPolicy.js`, and it exists to answer a warning
the design doc raised explicitly: a real point-to-point transport lets
"who may see my presence" and "who may see what I look like" finally
be two DIFFERENT, independently-enforceable facts — `Presence: PUBLIC,
Profile: FRIENDS` and `Presence: FRIENDS, Profile: PUBLIC` are both
real, representable configurations, never silently the same policy
wearing two hats. `core/PresenceVisibilityPolicy.js` is not reused,
not subclassed, and not read by the profile transport at all — a
brand-new, independent instance of `AvatarProfileVisibilityPolicy` is
injected as profile's OWN `getVisibilityPolicy`, consulted by the same
unmodified `PeerAvatarPresenceBroadcastProvider#advertise()` loop, once
per AUTHENTICATED peer, exactly the way presence's own policy already
is. 0.2.54's own default rule is deliberately minimal — "every
AUTHENTICATED peer is eligible," the same permissive posture
`application/AvatarProfileTrustBoundary.js` already took on the TRUST
side in 0.2.41 ("no `PresenceTrustPolicy`-equivalent knob exists for
profiles") — because there is still no live profile-sharing
configuration surface anywhere in the running app for a richer
FRIENDS/LOCAL/HIDDEN tier to hang off of. See docs/Principles.md,
"Profile Visibility Is Never Presence Visibility."

`presence/LocalAvatarPresenceBroadcastProvider.js` remains
`CreateWorldViewUseCase.js`'s only DEFAULT-wired transport for profile,
unchanged, for the identical reason presence itself was left
unswitched in 0.2.53: there is still no live "Connected Peers" UI for
a real session to ever have an authenticated peer to send a profile
to. Profile synchronization still never depends on presence in any
direction — see docs/Principles.md, "A Protocol's State-Keeping
Semantics Are Its Own, Never Borrowed From Its Neighbor" — proven in
the flagship by Charlie, who never has a presence transport wired at
all, yet still resolves Alice's real appearance through
`AvatarProfileSyncService`/`RemoteAvatarAppearanceRegistry` alone.

The flagship test (`tests/PeerAvatarProfile.test.js`, Section C) runs
a real three-node scenario over `peer/LocalPeerConnectionProvider.js`:
Alice's already-customized profile reaches Bob and Charlie through the
periodic-republish bootstrap the very first frame (0.2.41's own "0
means never published" mechanic, unmodified); a later edit strictly
increments `AvatarProfile.revision` and reaches both independently; a
genuinely-signed but now-stale revision sent directly over the bus is
rejected; two genuinely-signed, conflicting claims at the identical
revision are resolved as equivocation, the first accepted claim kept;
an unrecognized template degrades to the placeholder, never a crash;
Alice's connection to Bob closes and reconnects, and her profile is
proven byte-identical across the gap — nothing about a peer connection's
lifecycle ever prunes `LocalAvatarProfileStore`; Alice's PRESENCE is
then independently expired past staleness on Bob's side, and her
PROFILE survives that too; and finally, Alice's own genuine signature,
stolen from her current advertisement and paired with tampered
appearance, is rejected by the completely unmodified 0.2.41 trust
boundary. Throughout, her `AvatarPresence`, the original `Publication`,
and its `WorldPlacement` stay byte-identical — peer profile sync never
touches any of them.

Deliberately not in 0.2.54, matching the design doc's own explicit
scope: any FRIENDS/LOCAL/HIDDEN tier for profile visibility (0.2.54
ships PUBLIC-only, by design, until a real profile-sharing
configuration surface exists to justify one); wiring
`PeerAvatarPresenceBroadcastProvider` as profile's DEFAULT transport in
`CreateWorldViewUseCase.js` (still no "Connected Peers" UI to make that
meaningful, the same posture 0.2.53 already took for presence); a
"catch me up on demand" request/response protocol (0.2.41's periodic
republish is reused as-is, unmodified, exactly as the design doc asked);
and moving Avatar Interaction (0.2.45) onto `PeerMessageBus` — it
remains on its own separate `BroadcastChannel`, untouched.

Proposed, unscheduled follow-on milestones this opens: Peer-Based
Avatar Interaction (0.2.45's `BroadcastChannel`-based protocol, the
last of the three, moved onto `PeerMessageBus` — the one genuinely
different case, since it replicates an EVENT rather than STATE); a
real, configurable `AvatarProfileVisibilityPolicy` with FRIENDS/LOCAL/
HIDDEN tiers, once a profile-sharing configuration surface exists for
one to mean something; a live "Connected Peers" UI; and a
network-mode/local-mode transport switch wired into the actual browser
app for BOTH presence and profile together, unchanged from 0.2.51's
own proposal.

### Peer Connections & Rendezvous UI (0.2.55)

```text
ui/views/PeerConnectionsView.js          (NEW — pure presentation, /peers)
        │
        ▼
application/PeerSessionManager.js        (NEW — the only new application
        │                                 class this milestone adds)
        │
        ├── createInvitation()             Alice: WebRTC offer -> attach()
        │                                   -> onLocalSignalReady -> wrap
        │                                   as PeerInvitation
        │
        ├── acceptInvitation(invitation)    Bob: importInvitation() ->
        │                                   connect() -> onLocalSignalReady
        │                                   -> return the answer to relay
        │
        └── completeConnection(id, reply)   Alice: registry.get(id) ->
                                             connection.acceptRemoteAnswer()
                    │
                    ▼            (every verb above is a THIN wrapper —
      application/DiscoverPeersUseCase.js    no new logic lives here)
      application/ConnectToPeerUseCase.js     (0.2.50, unmodified)
      peer/WebRtcPeerConnectionProvider.js     (0.2.51, unmodified)
      application/ConnectedPeer.js             (0.2.50, unmodified)
      application/ConnectedPeerRegistry.js      (0.2.50, unmodified)
      peer/PeerAuthenticationSession.js          (0.2.49, unmodified)
      peer/PeerLifecycleState.js                  (0.2.50, unmodified —
                                                     read, never computed
                                                     by the view)
```

0.2.55 closes the one gap 0.2.53 named and 0.2.54 named again, in the
exact same words both times: "there is still no live 'Connected Peers'
UI." Every piece 0.2.55 needed had already shipped — authentication
(0.2.49), discovery and rendezvous (0.2.50), a real no-server WebRTC
transport (0.2.51), and message multiplexing (0.2.52, not used here) —
but none of it was reachable from the running app. This milestone adds
exactly one new application-layer class and one new view; it adds no
new cryptography, no new lifecycle state, and no new trust decision.

`application/PeerSessionManager.js` is the "small application
abstraction" the design doc asked for, and its own header states its
scope as narrowly as `peer/PeerMessageBus.js` states its own:
invitations → connections → authenticated peers →
`ConnectedPeerRegistry`. It owns none of the real logic — every
decision it makes was already made by `DiscoverPeersUseCase` or
`ConnectToPeerUseCase` — and it owns nothing beyond connections:
presence, profiles, avatars, and any future chat protocol attach to
the SAME `ConnectedPeerRegistry` this class exposes via `.registry`,
never by routing through `PeerSessionManager` itself. Its only real
job is hiding the one genuinely two-step part of the whole pipeline —
WebRTC's offer/answer signaling handoff, which 0.2.51 left as
something only a test file or a developer typing into a console could
drive — behind three verbs: `createInvitation()`, `acceptInvitation()`,
`completeConnection()`. `completeConnection()` deliberately takes a
`connectionId` and looks the pending connection up in
`ConnectedPeerRegistry` rather than accepting a live connection
reference — the one piece of state a UI actually needs to carry
between "I sent an invitation" and "someone pasted a reply," and
already exactly what every peer card displays.

`ui/views/PeerConnectionsView.js` follows the same use-case/view split
every other view in this codebase already keeps (see
`ui/views/IdentityManagementView.js`'s own header) and invents no
second copy of anything `peer/PeerLifecycleState.js` already computes:
the progression shown per pending peer (Rendezvous discovered → WebRTC
connecting → Peer connected → Authenticating → Authenticated) is
derived, in the view, from `peer.getLifecycleState()` alone — there is
no fourth state machine sitting beside 0.2.49's, 0.2.50's, and 0.2.51's
own three. "Invite Someone" and "Connect to Peer" render the offer and
answer as plain, readonly, copyable JSON text areas — the identical
"portable payload, deliberate out-of-band handoff" shape `tests/
WebRtcPeerTransport.test.js` already exercises with `JSON.stringify`/
`JSON.parse`, just with a Copy button standing in for a person's own
clipboard instead of a test's `relay()` helper. The Peer Identity panel
never shows a `remoteIdentity` for a peer whose `getLifecycleState()`
is not, right now, AUTHENTICATED — the same "read the derived state,
never assume" discipline `application/ConnectedPeer.js` has enforced
since 0.2.50 — and labels the connection "Ephemeral," never "Friend,"
per docs/Principles.md, "An Authenticated Peer Is Not A Friend." A
per-peer local alias (`ConnectedPeer#setAlias`) is editable directly on
its card; setting one triggers `ConnectedPeerRegistry`'s own existing
change notification (alias changes flow through `ConnectedPeer#_notify()`
exactly like a lifecycle change does — see that file's own header) and
nothing else, since an alias was never wire state to begin with.

The flagship test (`tests/PeerConnectionsUI.test.js`) drives
`PeerSessionManager` end to end over a REAL `peer/
WebRtcPeerConnectionProvider.js` connection — not a mock, matching this
codebase's standing rule that a real transport is exercised with real
code, never a stand-in. Alice's `createInvitation()`, Bob's
`acceptInvitation()`, and Alice's `completeConnection()` reach mutual
AUTHENTICATED peers, each independently visible in the OTHER side's own
`listPeers()` — never merely its own, the same mutual-proof property
`tests/PeerDiscovery.test.js` and `tests/WebRtcPeerTransport.test.js`
already established one layer down. A local alias is proven to change
only the setting side's own view of the connection. Disconnecting is
proven to remove the peer from BOTH sides' registries — a real network
close, not a locally-hidden row — and reconnecting through a fresh
invitation is proven to produce a fresh peer with no alias carried
over, unchanged from 0.2.50's and 0.2.51's own reconnect guarantees.
Separate cases prove `PeerSessionManager` never lets a raw exception
reach a caller: a garbage-text invitation, an unknown `connectionId`
passed to `completeConnection()`, and a malformed reply are all
rejected with a clear, friendly message before ever reaching the
transport; a captured invitation replayed after its own expiry is
rejected by the completely unmodified 0.2.50 discovery layer, before
any connection attempt is even made.

Deliberately not in 0.2.55, matching the design doc's own explicit,
narrow scope: chat — `peer/PeerMessageBus.js` is not imported anywhere
in `application/PeerSessionManager.js` or `ui/views/
PeerConnectionsView.js`; a persistent friends/contacts list — a closed
peer still simply disappears from `ConnectedPeerRegistry`, exactly as
it always has, and there is no "forget" operation because there is
nothing durable to forget in the first place; any discovery mechanism
beyond invitation-based rendezvous (LAN broadcast, mDNS, a rendezvous
server, a DHT all remain proposed and unscheduled, unchanged from
0.2.50's own list); and any change to Presence or Profile wiring —
`CreateWorldViewUseCase.js` still wires only `presence/
LocalAvatarPresenceBroadcastProvider.js` as the app's default
transport for both, exactly as 0.2.53 and 0.2.54 both left it.
`PeerSessionManager`'s own `ConnectedPeerRegistry` and the ones
`WorldNavigationSession` privately constructs for presence/profile
remain genuinely separate instances after this milestone — nothing
here wires them together, on purpose, since doing so is a real
architectural decision (which registry does a running session's
presence/profile transport actually attach to?) this milestone
deliberately left for its own, separate, unscheduled follow-on.

Proposed, unscheduled follow-on milestones this opens: wiring
`presence/PeerAvatarPresenceBroadcastProvider.js` and its 0.2.54
profile counterpart into `CreateWorldViewUseCase.js` as the app's real
transport, now that a running session can actually acquire an
authenticated peer through this milestone's own UI; Persistent Peer
Relationships / Friends, a deliberately separate architectural question
from "who am I connected to right now" that this milestone declined to
conflate with it; Peer/Avatar Privacy & Friends-Only Policies, which
needs that same persistent-relationship concept to mean anything beyond
today's PUBLIC-only defaults; and Peer Messaging / Minimal Social Chat,
finally giving `peer/PeerMessageBus.js` a real protocol to carry.

### Persistent Peer Relationships (0.2.56)

```text
peer/PeerIdentity.js            "Who is on the other end of THIS
   (0.2.49, unmodified)          connection, provably, right now?"
        │
        │ ONLY via rememberPeer()'s `instanceof PeerIdentity` gate —
        │ never an invitation's identityHint
        ▼
core/PeerRelationship.js        "Have I proven that identity before
   (NEW, immutable)              and chosen to remember it?"
        │  identityId, publicKey, algorithm, alias, status,
        │  createdAt, lastAuthenticatedAt — NO endpoint, NO
        │  connectionId, NO session nonce
        ▼
application/PeerRelationshipUseCase.js   (NEW)
        │  getRelationships() / getRelationship(id) / isKnown(id)
        │  rememberPeer(peerIdentity, {alias})   ← ui/views/
        │  noteAuthenticated(peerIdentity)         PeerConnectionsView.js
        │  updateAlias(id, alias)                  "Remember"/"Forget"
        │  forgetPeer(id)                           buttons, ONLY caller
        ▼
storage/LocalStorageProvider.js  (unmodified) — one record list per
                                    local owner, same shape as
                                    application/AvatarProfileUseCase.js

application/ConnectedPeerRegistry.js (0.2.50, unmodified) — answers
   "is this identity connected RIGHT NOW?" independently, always fresh;
   never read BY PeerRelationship, never written INTO it.
```

0.2.56 closes the gap 0.2.49 first named and 0.2.55 named again,
verbatim, on its way out the door: "Persistent Peer Relationships /
Friends, a genuinely separate architectural question from 'who am I
connected to right now.'" The milestone draws exactly the boundary
that sentence implies — a THIRD concept, alongside the two 0.2.49/
0.2.50 already established (a proven-but-connection-scoped
`PeerIdentity`, and a live-but-untracked `ConnectedPeerRegistry`
membership) — and stops there. It adds no new cryptography (identity
proof is still 100% `peer/PeerAuthenticationSession.js`, untouched),
no new transport, and no mutual/social semantics: `core/
PeerRelationshipStatus.js` is a vocabulary of exactly one value,
`KNOWN`, because a `PeerRelationship` is a one-sided local note, not an
agreement.

`core/PeerRelationship.js` follows the exact immutable-value-object
shape `core/AvatarProfile.js` and `core/PresenceVisibilityPolicy.js`
already established — `withAlias()`/`withLastAuthenticatedAt()` return
new instances, never mutate in place — and reuses `peer/
PeerIdentity.js`'s own self-consistency guarantee (the did:key IS
derived from the public key) rather than inventing a second one. Its
one factory, `fromPeerIdentity()`, is a plain SHAPE check only — `core/`
never imports `peer/PeerIdentity.js`, the same layering boundary every
other `core/*.js` file already keeps. The REAL security boundary — that
the identity actually came from a completed handshake — lives one
layer up, in `PeerRelationshipUseCase.rememberPeer()`'s `instanceof
PeerIdentity` check, the ONLY place in the whole application layer
allowed to construct a `PeerRelationship` from a live object rather
than from trusted storage via `fromJSON()`.

`application/PeerRelationshipUseCase.js` scopes its storage exactly
the way `application/AvatarProfileUseCase.js` already does — one
record list per `identityProvider.currentUser().username`, resolved
fresh on every call, never cached — so switching which local identity
is signed in on a device switches which Known Peers list is in view,
proven directly in the flagship test (two local identities sharing one
device's storage see two disjoint lists). `rememberPeer()` on an
ALREADY-known identity is not an error: it refreshes
`lastAuthenticatedAt` (and the alias, if a new one was supplied) on the
existing record rather than creating a duplicate — there is never more
than one relationship per identityId per owner. `noteAuthenticated()`
is the read-only-except-for-the-timestamp cousin: it looks the
identity up first and is a structural no-op — never a new relationship
— if nothing is remembered yet, matching docs/Principles.md,
"Remembering A Peer Is A Deliberate Act, Never A Side Effect Of
Authentication."

`ui/views/PeerConnectionsView.js` gains a second list, "Known Peers,"
entirely independent of "My Peers": it reads
`PeerRelationshipUseCase.getRelationships()` on its own subscription
(`onRelationshipsChanged`, mirroring `ConnectedPeerRegistry#onChange`'s
shape) and renders each relationship's alias, when it was first met,
when it was last re-authenticated, and a live "Connected now" /
"Not connected" badge computed by cross-referencing the SAME `peers`
list "My Peers" already renders — never a second, stored copy of that
fact. An authenticated peer's card in "My Peers" gains exactly one new
affordance depending on whether `PeerRelationshipUseCase.getRelationship()`
already recognizes its `remoteIdentity`: a "Remember" button if not, a
"Forget" button (plus a small "✓ Known Peer" note) if so. Deliberately
absent: any button that "connects to" a specific known peer by
identity — no such addressing exists. Rendezvous is still exactly the
manual, copy/paste invitation handoff 0.2.50/0.2.51 already
established; a known peer is simply RECOGNIZED, after the fact, once
whichever connection happens to authenticate turns out to be them.

The flagship test (`tests/PeerRelationships.test.js`) runs in two
tiers. The first — `core/PeerRelationship.js` construction/validation/
immutability, and `PeerRelationshipUseCase`'s CRUD surface, per-owner
scoping, and change notifications — needs no network transport at all.
The second drives the design doc's own end-to-end scenario over a REAL
`peer/WebRtcPeerConnectionProvider.js` connection via
`application/PeerSessionManager.js` (0.2.55, unmodified): Alice and Bob
authenticate; Alice remembers Bob using ONLY his freshly proven
`remoteIdentity`, never the invitation she originally sent him;
disconnecting empties `ConnectedPeerRegistry` exactly as 0.2.50 already
guaranteed while the relationship survives untouched; a brand-new
`PeerRelationshipUseCase` instance constructed over the SAME storage —
simulating a page reload — still finds Bob; Alice and Bob connect again
through a completely fresh invitation, connection, and authentication
(a different `connectionId`, nothing resumed from the earlier session),
and the newly proven identity is matched against, and confirmed to be,
the remembered relationship; and finally, Alice forgetting Bob is
proven to touch nothing on Bob's own device — his `LocalIdentityProvider`
session is shown still signing normally afterward, completely
unaffected by Alice's purely local deletion.

Deliberately not in 0.2.56, matching the design doc's own explicit,
narrow scope: `ONLINE`/`OFFLINE` as a stored relationship field — see
`core/PeerRelationshipStatus.js`'s own header on why that stays
derived from `ConnectedPeerRegistry` alone; directed "Connect to this
known peer" dialing — no addressing mechanism exists yet beyond manual
invitation rendezvous; a `notes` field — the design doc considered it
and explicitly deferred it; any change to `core/
PresenceVisibilityPolicy.js` or its profile counterpart — both remain
keyed on their own manually-typed identity allow-lists, completely
untouched; and, above everything else, a mutual `Friend` concept — see
docs/Principles.md, "Knowing Is Not Befriending."

Proposed, unscheduled follow-on milestones this opens: Decentralized
Friend Relationship, the mutual, two-sided upgrade from `KNOWN` to a
real `Friend` with signed requests, acceptance, and revocation;
Friend-Based Privacy, finally giving `core/PresenceVisibilityPolicy.js`'s
`FRIENDS` tier a real `PeerRelationship`-backed membership instead of a
manually-typed allow-list; Minimal Peer Chat, giving `peer/
PeerMessageBus.js` a real protocol, most naturally scoped to Known
Peers first; and Social Notifications / Presence, surfacing "a known
peer just came online" from nothing but `ConnectedPeerRegistry` change
events cross-referenced against `PeerRelationshipUseCase.getRelationships()`
— both already available, completely unmodified, today.
