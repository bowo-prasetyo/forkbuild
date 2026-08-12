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
