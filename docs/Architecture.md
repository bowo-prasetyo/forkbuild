# Architecture

This file describes how ForkBuild is built today, one subsystem at a
time. It is edited in place when the code changes. Other docs:

- docs/ArchitectureHistory.md keeps the architecture notes as they were
  written, milestone by milestone, for 0.1.x through 0.3.4.
- docs/Roadmap.md records why each change was made.
- docs/Principles.md states the rules the design keeps.
- docs/Protocol.md describes what crosses the wire or gets serialized.

## Layers

ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

**core/** is the pure domain model: World, Building, Brick, Group,
Position, WorldPosition, BrickDefinition, BrickRegistry, Document,
DocumentMetadata, protocolVersion, createId, and events/ (EventBus,
DomainEvent, EditorEvent, EventListener), plus the pure value types and
functions later subsystems added (terrain, identity envelopes,
placements, evidence records and so on). No Three.js, no Vue, no browser
APIs. Never imports anything from
application/, renderer/, or ui/.

Every World, Building, and Brick has a UUID identity (createId(),
defaulted in each constructor), never an array index or a caller-chosen
string. A BrickDefinition id like "core:cube" is different: a stable,
namespaced *type* identifier (docs/BrickIDs.md). A Brick stores a
definitionId, not geometry; BrickRegistry resolves it to a
BrickDefinition (metadata only), and libraries register their
definitions at startup (docs/BrickLibrary.md).

Document (core/Document.js) is the publishable unit: a World plus
DocumentMetadata (title, description, author, authorIdentityId,
created, modified, protocolVersion, engineVersion, license, and the
lineage fields parentDocumentId and parentStructureId). World is the aggregate root: addBuilding(),
removeBuilding(), addBrickToBuilding(), removeBrickFromBuilding() and
updateBrick() publish DomainEvents (BrickAdded, BrickUpdated, …) through
an EventBus, and every transform surface reaches updateBrick() through
commands. Nothing touches meshes directly.

**application/** holds use cases, sessions and services. It constructs
the shared EventBus and wires it to both World and the renderer, so
core/ and renderer/ only ever meet through events. The main sessions:

- EditorSession (application/EditorSession.js): the Editor's whole live
  runtime graph as one unit, rebuilt by start(), loadDocument(),
  newDocument() and openDocument(). It is the only place bricks,
  structures and groups are edited.
- WorldNavigationSession (application/WorldNavigationSession.js): World
  View's runtime graph. It observes and navigates; see "World View"
  below.
- PublishedWorldSession (application/PublishedWorldSession.js): a
  read-only projection of one Publication, with selection and
  inspection but no mutation path at all.

**renderer/** is Three.js. WorldRenderer subscribes to World's domain
events and reacts incrementally (one mesh per BrickAdded, and so on);
there is no render(world) sweep. See "Renderer" below.

**ui/** is Vue 3 with no build step: components are plain objects with a
template string. ui/main.js is the composition root that constructs and
wires every adapter.

**Adapters** sit around the layers: storage/ (StorageProvider and the
local stores), serializer/, publisher/, discovery/, identity/, peer/,
presence/, collaboration/, replication/, placement/, spatial/,
world-layout/, content/ (content stores), anchoring/ (Bitcoin, Arweave
and Base anchoring), base/ (Base/EVM transactions), nostr/ and arweave/
(injected-wallet signers and the relay client), and server/ (the
reference rendezvous worker).

## Dependency direction

    ui -> application -> core
    ui -> core, for read-only value types, enums and pure helpers only
    application -> renderer
    application -> adapters (storage, publisher, identity, peer, …)
    renderer -> core (reads domain events and data; never the reverse)
    core never depends on anything above it

ui/main.js, the composition root, is the one ui/ file that wires every
layer. application -> renderer includes injection: use cases build
renderer subsystems and hand them collaborators (TransformMath into
TransformGizmoController, for example), so renderer/ never imports
application/.

## Domain State vs Editor State

- **Domain state**: World, Building, Brick, Group, Document and
  DocumentMetadata (core/). Publishable, serializable, shared, forkable.
- **Editor state**: EditorContext plus application/editor-state/
  (DocumentState, SelectionState, ActiveBrickState, PreviewState, …).
  Local to one session, never serialized.
- **Spatial and runtime state**: application/spatial-state/
  (SpatialSelectionState, SpatialInspectionState, TransformGizmoState,
  AvatarInteractionState, …), gesture feedback, action availability,
  palette state. Runtime only, never part of the protocol.

A SpatialSelectionState may reference only a currently loaded document;
unloading a document clears the selection first.

## Coordinates and units

A document's own content and a placement's position are two coordinate
systems that compose by addition. Stored positions are always absolute.
The coordinate system itself is a stated contract (see docs/Principles.md,
"A World Unit Is One Meter," and docs/Protocol.md): canonical origin
`(0, 0, 0)`, right-handed `+X`/`+Y`/`+Z` axes with the ground plane at
`Y = 0`, and one coordinate unit named a
**World Unit**, equal to one meter of real-world length for spatial
quantities (0.9.548). Avatar positions stay on a flat simulated plane
and terrain height is added when rendering; vehicle positions are the
exception (see "Avatar movement constraint pipeline").

## Naming convention

| Purpose                            | Suffix    |
|------------------------------------|-----------|
| Persistent domain object           | *(none)* — World, Brick, Building |
| Mutable editor or spatial state    | State     |
| Long-lived shared state container  | Context   |
| Lookup/index                       | Registry  |
| Adapter to external systems        | Provider  |
| Pure application workflow          | UseCase   |
| Renderer subsystem                 | Renderer  |
| Interaction driver                 | Controller |
| Short-lived event payload          | Event     |
| Engine capability                  | Service   |
| Executable, undoable action        | Command   |
| User-facing operation              | Action (a registry entry, not a class suffix) |

An Action is not a Command: EditorActionRegistry entries are plain data
plus closures, and most of them change session state, not the document.

## Editing (Editor)

The Editor (ui/views/EditorView.js over EditorSession) is the only
surface that creates or changes brick, structure and group content. See
docs/CapabilityMatrix.md for exactly what each surface may do.

- **Tools.** Tool (application/tools/Tool.js) is the base class;
  ToolManager owns the current tool and ToolRegistry lists them
  (SelectionTool, PlacementTool, StructurePlacementTool,
  StructureCompositionTool). InputDispatcher normalizes DOM events and
  picks once per pointer event, so tools receive pre-picked results.
- **Commands and history.** Every document change is a Command executed
  through CommandHistory (application/CommandHistory.js): a linear
  history where executing after an undo clears redo. Commands carry an
  id, timestamp and stable type string; CommandRegistry
  (application/commands/CommandRegistry.js) maps the type back to a
  class. CompositeCommand is transactional: a failing child rolls back
  the children already run. DocumentManager tracks DocumentState and
  marks the document dirty on every executed, undone or redone command.
- **Transforms.** SpatialEditingService owns the transform gesture
  transaction: beginTransformGesture(), previewTransformGesture() (live,
  no history), commitTransformGesture() (one TransformSelectionCommand,
  none if nothing changed) and cancelTransformGesture(). Keyboard,
  gizmo, alignment, distribution and numeric input all end in that one
  command. TransformMath is the single source of transform math;
  TransformSnap snaps gesture deltas from the gesture origin;
  TransformSettings holds snapping preferences; TransformAlignment and
  TransformInput provide alignment/distribution math and numeric
  parsing. Transforms are translate and rotate only; there is no scale.
- **Actions.** EditorActionRegistry (created by createStandardActions())
  is the one list of user-facing operations: id, label, category,
  shortcut, `tier`, enabled()/disabledReason() and execute().
  EditorActionContext is the availability snapshot it reads. The command
  palette (Ctrl/Cmd+K, ui/components/CommandPalette.js), the sidebar
  (ui/components/EditingSidebar.js), keyboard dispatch
  (InputRouter#matchShortcut()) and the shortcuts overlay
  (KeyboardShortcutsOverlay.js) all read the same registry. `tier`
  only decides what the sidebar shows by default. EditorView implements
  the Escape chain itself.
- **Feedback.** ActionFeedback shows one transient line after an action;
  TransformFeedback shows the live gesture state; SelectionInspector
  shows the current brick selection (StructureInstancePanel does the
  same for a structure placement).
- **Other Editor features.**
  - Export/Import (0.9.641/0.9.642): ExportDocumentUseCase and
    ImportDocumentUseCase, reached from the Toolbar. Import always clones
    to a fresh identity through DocumentCloneService, which also remaps
    group membership (0.9.644).
  - Focus Selection (0.9.661): the `selection.focus` action calls
    getSelectionSummary() then frameCameraOn().
  - Structure face snapping (0.9.611): PickingService#pickPlacement()
    returns a face normal, and
    PlacementPositionService#calculateStructureStack() places a
    structure flush against another one's side.
  - Brick colors: BrickDefinition#color is the default and Brick#color an
    optional override, set with SetBrickColorCommand. ActiveBrickState
    carries the color for the next placement.
  - Save failures (0.9.653): both Save entry points catch errors and show
    SAVE_FAILURE_MESSAGE. The sidebar scrolls inside `.sidebar-scroll`.

## World View

World View (ui/views/WorldView.js, route `/world/:documentId`) walks
through the shared world. WorldNavigationSession owns its runtime:
camera positioning (SpatialCameraController), which documents are
loaded near the camera (through WorldLayoutProvider and the spatial
index), loading and unloading them, the local avatar, and selection.

World View observes and navigates; it does not edit document content
(0.5.9). Selection serves inspection and focus only
(getSpatialInspection(), focusDocument()). The session tracks the
camera's focus and the active document separately (0.2.27), so camera
movement never changes what a mutation would target. Its few mutations
are listed in docs/CapabilityMatrix.md:

- naming a Region or Landmark where the avatar stands, and World Animal
  Decorations. These go through the same authorization, fork-on-write and
  CommandHistory path as the Editor, so undo()/redo() work for them;
- moving or removing a published world's WorldPlacement (movePlacement(),
  removePlacement()). These change a PlacementRecord, never a Document,
  and never fork.

Riding vehicles, catching animals and the inventory are avatar runtime
state, not document changes (see "Vehicles, inventory and animals").
"Edit a Copy" on a focused Region, Landmark or Structure forks the
containing document into the Editor through `/editor?fork=`.

Finding things: searchWorld() is text search over the same discovery
catalog every surface reads; searchWorldByLocation({ center, radius }) is
the spatial half. The Explore / Map / Places panels (WorldMapPanel,
LocationsPanel, GeographicPlaceDirectoryPanel), WorldFocusPanel (over
core/WorldFocusContext.js) and WorldSearchPanel sit on those queries.
World Encounters (ui/components/WorldEncounterCanvas.js, also mounted
alone at `/live-world`) show decentralized publications met while
walking; see "Publication presence across restarts".

## Avatar movement constraint pipeline

`application/AvatarMovementController.js` runs the simulated move through up to six optional constraints, in this
order. Each is a separate class with a `{ position, blocked | collided }` result, and each can be left out:

    simulateAvatarMovement()        speed x run multiplier x water speed factor
      -> AvatarMovementConstraint   bricks of loaded Buildings and StructurePlacements
      -> AvatarTerrainConstraint    slope
      -> AvatarWaterConstraint      too-deep water blocks; depth slows (0.9.634)
      -> AvatarStepConstraint       step-up / walkable surfaces; ignores bricks whose base is out of reach
      -> AvatarTreeConstraint       slide around trunks
      -> AvatarWildlifeConstraint   slide around deer/rabbits (2026-09-21)

`WorldNavigationSession#_setupLocalAvatar()` builds all six. Placed `StructurePlacement`s collide because the
brick constraints take the session's `structureResolver`. Documents farther than `MAX_DOCUMENT_SPAN_MARGIN` (200) are
culled before any brick test.

`AvatarPresence.position.y` is still a flat simulated plane (step height, jump and gravity only). Terrain height,
lake floors and the lake-surface clamp are applied only when rendering, in
`RenderWorldViewUseCase#resolveAvatarRenderPosition()`/`withGroundElevation()`. The exception is a rider on a
movable vehicle: the vehicle's position already includes real terrain height, so neither the vehicle nor the rider
is lifted a second time. Released animals get the same lift as remote avatars.

## Vehicles, inventory and animals

    core/VehiclePlacement.js      deterministic spawn: bicycle 65% / motorcycle 25% / car 8% / drone 2%
    core/WildlifeField.js         deterministic deer (FOREST) / rabbit (GRASSLAND), id animal:<seed>:<x>,<z>
            │                                   │
    VehicleRuntimeInstances            AnimalRuntimeInstances
      (placed, ridden, deployed;          (caught ids excluded; released
       stored ids excluded)                animals tracked separately)
            │                                   │
    AvatarVehicleInteractionController   AvatarAnimalInteractionController
      E mount/dismount, Q store/deploy,    F catch / release
      [ ] cycle selection
            └──────────── AvatarInventoryStore ─────────┘
                           (one AvatarInventory of { id, kind, type } entries,
                            every read and cycle scoped by kind)

- **Movement.** `AvatarVehicleMovementController` moves every vehicle type in `MOVABLE_VEHICLE_TYPES` (all four).
  Drone altitude comes from `core/AvatarDroneVerticalState.js`, and `AvatarVehicleInteractionController` refuses
  to dismount a drone in mid-air.
- **Persistence (0.9.701).** The inventory and both runtime stores persist through optional stores
  (`storage/*PersistenceStore.js`). Runtime positions are written at most once a second.
- **Rendering.** Deterministic animals are baked into wildlife tiles (`renderer/WildlifeTileMesh.js`). Catching one
  rebuilds its tile without it (`TerrainStreamingController#invalidateTile()`). Released animals are drawn every
  frame by `renderer/AnimalFieldRenderer.js`, which shares geometry with the tiles.
- **Decorations (0.9.702/0.9.703).** `G` turns the nearest released animal into an `AnimalDecoration` in the World
  document through a registered command, or turns the nearest decoration back into a released animal. This is the
  one way a World View animal action becomes document content.
- **Transfer (0.9.702).** `AvatarInventoryTransferPeerExchange` moves an entry between connected avatars
  (`docs/Protocol.md`, "Avatar Inventory Transfer"). It is reachable from the session API only; there is no UI yet.

## Terrain layers

`renderer/Renderer.js` runs four `TerrainStreamingController`s: terrain, vegetation, water and wildlife. Each is a
pure function of `(seed, x, z)`:

- `TerrainHeightField`: how high
- `TerrainSurface`: what it looks like
- `TerrainEcology`: which zone
- `Hydrology`: lakes and river color
- `NaturalFeatureField`: trees, with CONIFER, BROADLEAF or SCRUB chosen by moisture
- `WildlifeField`: animals

None of it is stored, so a tile that streams out and back in is identical.

## Publication presence across restarts

At startup, before the app mounts, `ui/main.js` rebuilds the in-memory `DecentralizedPublicationDiscoveryProvider`
from two durable records:

- `ReconstructPublicationDiscoveryUseCase` replays `LocalPublicationCatalog`, which holds signed decentralized
  envelopes (0.9.608).
- `ReconstructWorldEncounterPublicationDiscoveryUseCase` replays `LocalWorldEncounterPublicationAdmissionLog`, which
  holds Publications admitted from World Encounters (0.9.651).

Both re-run full verification, skip ids already present, and never touch the network. World rendering uses
`publicationActionDiscoveryProvider` (a `CompositeDiscoveryProvider`) for layout. `WorldNavigationSession#_loadWorld()`
falls back to `LoadPublishedWorldSessionUseCase` (content-hash material) when `storage[documentId]` is empty (0.9.605).

## Distribution: independent choices, one dialog

Distributing a Publication or a Snapshot involves separate choices, each with its own seam:

| Choice | Values | Seam |
|--------|--------|------|
| Where the bytes go | Arweave, IPFS (Local Kubo), IPFS (Remote Pinning) | `PublicationMaterialUploaderComposition` (Publication material); `SnapshotPlacementStoreRegistry` + `ipfsRemotePublicationCoordinator` (Snapshot) |
| Where it is announced | Nostr (fan-out to every configured relay) or Arweave (tagged transaction) | `*RuntimeComposition` `discoveryProvider` for Publication, Snapshot, Place Naming and Commentary; `resolveSnapshotDiscoveryPublisher()` |
| Proof / anchoring | Bitcoin, Arweave (Base only through its own button) | `PreferredPublicationAnchorCreationCoordinator` |

The saved preferences live in `RoleProviderPreferenceStore` (`CONTENT`, `ANNOUNCEMENT_AND_DISCOVERY`,
`PROOF_AND_ANCHORING`). They drive the "Use Preferred Provider" buttons, and they seed every picker's first value
through `resolveSavedProviderDefault()`; they never override a choice already made. Distribution uses selection,
never fan-out, across substrates. Fan-out happens only across relays within Nostr. Arweave and IPFS gateways use
ordered failover instead, because any gateway can serve the same content-addressed bytes.

In the UI, every distribution control sits in `ui/components/WorldDistributionDialog.js` (World Encounters and My
Publication) or `ui/components/EditorDistributionDialog.js` (the Editor's post-publish overlay). One settings block
(Storage, Remote Pinning draft, Announcement/Discovery) feeds both legs. The combined "Distribute" action runs
Snapshot and Publication one after the other, because both may sign through the same wallet extension. Every
injected-wallet adapter (Nostr NIP-07, Arweave, UniSat, EIP-1193) has a 120-second approval timeout.

## Network endpoint configuration

Every user-set endpoint follows one pattern. There is a `core/*Configuration.js` value object, a `storage/*Store.js`
under one key, a `Set*ConfigurationUseCase`, and a settings view built on `ui/composables/useEndpointSettingsForm.js`
(`useRoleProviderPreferenceForm.js` for the three preference pages). `ui/main.js` resolves each value once at
startup and falls back to the deployment default.

| Setting | Route | Store key | Shape |
|---------|-------|-----------|-------|
| Arweave Gateway | `/settings/arweave-gateway` | `arweave-gateway-configuration` | ordered `gatewayUrls`, read failover |
| IPFS Gateway | `/settings/ipfs-gateway` | `ipfs-gateway-configuration` | ordered `gatewayUrls`, read failover (0.9.665/0.9.666) |
| IPFS Node (Kubo API) | on `/settings/content-provider` | `ipfs-node-configuration` | `apiUrl` for the IPFS write path |
| Bitcoin Endpoint (Esplora) | `/settings/bitcoin-esplora` | `bitcoin-esplora-configuration` | one base URL, used for broadcast, confirmation, funding and proof checks |
| Nostr Relays | `/settings/nostr-relay` | `nostr-relay-configuration` | `relayUrls`, one set for every Nostr feature, fan-out |
| STUN / TURN / Rendezvous | `/settings/stun`, `/settings/turn-server`, `/settings/rendezvous` | `ice-server-configuration`, `turn-server-configuration`, `rendezvous-configuration` | as before |
| Content / Announcement / Proof preferences | `/settings/content-provider`, `/settings/announcement-discovery-provider`, `/settings/anchor-provider` | `role-provider-preference:by-role` | one provider key per role |

Credentials are never stored. The remote-pinning credential is kept only in tab memory
(`IpfsRemotePublishingCredentialMemory`).

## Publication Commentary

    addPublicationCommentaryCommand
      1. PublicationCommentaryStore.add()            local, authoritative
      2. PublicationCommentaryDistributionPeerExchange.announce()   WebRTC, best effort
      3. Nostr (NostrMultiRelayPublicationCommentaryDistribution) OR Arweave — one, best effort

    refreshPublicationCommentaryCommand (on open / "Check for new comments")
      Discover...FromNostrUseCase + Discover...FromArweaveUseCase
        -> PublicationCommentaryDistributionExchange.importCommentaryEnvelope()   one verifier, one store
        -> PublicationCommentaryRemoteNotificationBridge                          notify the publisher only

`ui/components/PublicationCommentarySection.js` is the Repository's single Commentary component (card and list).
World View's Commentary panels still post only locally.

## Renderer

renderer/Renderer.js owns the WebGL renderer, scene (SceneManager),
camera (CameraController, OrbitControls-based), lights, grid, the four
terrain TerrainStreamingControllers and the AnimationLoop (see
docs/RendererLifecycle.md). The Editor and World View build it the same
way, through RenderWorldUseCase and RenderWorldViewUseCase.

- WorldRenderer turns domain events into meshes, one at a time, and
  records them in MeshRegistry; structure placements are drawn from
  their resolved documents and tracked in PlacementMeshRegistry.
  BrickRenderer and ThreeBrickFactory build a brick's mesh from its
  definitionId.
- PickingService answers "what brick is here" and "where does the ray
  hit the ground"; AvatarPickingService does the same for avatars.
- Overlays: SelectionRenderer, SpatialSelectionRenderer,
  PreviewRenderer, SpatialPreviewRenderer, StructurePreviewRenderer,
  CompositionPreviewRenderer, and the gizmo (TransformGizmoRenderer draws
  it, TransformGizmoController handles pointer input with an injected
  TransformMath).
- World View adds AvatarRenderer, RemoteSpatialPresenceRenderer,
  VehicleRenderer/VehicleFieldRenderer and
  AnimalRenderer/AnimalFieldRenderer. DocumentThumbnailRenderer draws
  Repository previews.

## UI

ui/main.js builds every store, adapter and use case once, reads the
saved settings, and provides them to the Vue app. ui/router/index.js
defines the routes: Home, Editor (`/editor`), Repository, Recent Worlds,
Author, World View (`/world/:documentId`), Live World, Avatar, Identity,
Peers, Chat and Conversations, Publications (`/publications`), the
settings pages under `/settings/…`, the leaderboard and reconciliation
views, and About. Views reach application/ through injected services;
the two composables in ui/composables/ share the settings-form logic.

## Subsystems described elsewhere for now

These areas have no current-state section here yet. Until they do, their
design is described in docs/ArchitectureHistory.md (the section named in
the middle column) and docs/Roadmap.md.

| Area | docs/ArchitectureHistory.md | Also see |
|------|-----------------------------|----------|
| Documents: save, autosave, publish, fork, lifecycle | Durable Documents & Publishing Boundary (0.2.0) through Fork / Edit Published World (0.2.8); Publication Licensing & Fork Policy (0.2.13); 0.2.20–0.2.22 | docs/Publishing.md |
| Placement and spatial discovery | World Placement & Spatial Discovery (0.2.5); 0.2.10–0.2.12; 0.2.15; 0.2.23–0.2.30 | docs/Principles.md, "Placement, world coordinates and overlap" |
| Repository catalog and previews | 0.2.31–0.2.32 | |
| Trust, signatures and replication | Decentralized Content Backend (0.2.14); 0.2.16–0.2.19 | |
| Identity | 0.2.46–0.2.48, 0.2.67–0.2.68, 0.2.78, 0.2.82 | |
| Peers, friends, chat and voice | 0.2.49–0.2.57, 0.2.69–0.2.75, 0.2.83 | docs/Protocol.md, "Wire Formats Not Yet Described Here" |
| Avatars and presence | 0.2.33–0.2.45, 0.3.2–0.3.4 | "Avatar movement constraint pipeline" above |
| Collaboration | Collaboration Protocol Foundation (0.2.7); Multi-client Synchronization (0.2.9); 0.3.0–0.3.1 | docs/Roadmap.md, 0.2.95–0.2.99 |
| Places, landmarks and naming | (none) | docs/Roadmap.md, 0.3.6–0.3.10 and 0.5.x |
| Bricks, structures and blueprints | 0.2.80–0.2.81 | docs/BrickLibrary.md, docs/StructureLibrary.md |
| Anchoring, evidence and achievements | (none) | docs/Roadmap.md, 0.8.0 onward |

Directories without a section of their own:

| Directory | What it holds | Where it is explained |
|-----------|---------------|------------------------|
| `anchoring/` | Anchor publishers, evidence views and proof verifiers for Bitcoin (PSBT build/sign/broadcast, confirmation and funding observers, Esplora adapters), Arweave and Base | `docs/Roadmap.md` 0.8.0 onward; `docs/Principles.md` from "External Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)" |
| `base/` | Base (EVM) wallet connection, transaction planning, signing, broadcast and inclusion observation | `docs/Roadmap.md`, the Base milestones from "0.8.90 — Explicit Base Network & Account Observation" through 0.8.101 |
| `content/` | `ContentStore` implementations: local, Arweave, IPFS (Kubo, gateway, remote pinning) and the gateway-failover wrappers | `docs/Roadmap.md` 0.7.0 onward; "Distribution" and "Network endpoint configuration" above |
| `nostr/`, `arweave/` | Injected-wallet signers (NIP-07, Arweave) and the Nostr relay query client | "Distribution: independent choices, one dialog" above |
| `server/rendezvous-worker/` | Reference rendezvous server (Cloudflare Worker) for `peer/WebSocketRendezvousTransport.js` | `server/rendezvous-worker/README.md` |
| `utils/` | Small shared helpers (e.g. `sortOptionsByLabel.js`) | `docs/CodingConventions.md` |
