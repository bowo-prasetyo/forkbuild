# Architecture

This file describes how ForkBuild is built today, one subsystem at a
time. It is edited in place when the code changes. Other docs:

- docs/ArchitectureHistory.md keeps the architecture notes as they were
  written, milestone by milestone, for 0.1.x through 0.3.4.
- docs/Roadmap.md records why each change was made.
- docs/Principles.md states the rules the design keeps.
- docs/Protocol.md describes what crosses the wire or gets serialized;
  docs/ProtocolHistory.md keeps the older milestone protocol notes.

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

- EditorSession (application/editor/EditorSession.js): the Editor's whole live
  runtime graph as one unit, rebuilt by start(), loadDocument(),
  newDocument() and openDocument(). It is the only place bricks,
  structures and groups are edited.
- WorldNavigationSession (application/world/WorldNavigationSession.js): World
  View's runtime graph. It observes and navigates; see "World View"
  below.

Both session classes keep their constructor, lifecycle and runtime setup;
their other methods live in one module per concern
(application/editorSession/ and application/worldNavigation/), which
utils/installMethods.js puts on the prototype as if written in the class
body.
- PublishedWorldSession (application/publication/PublishedWorldSession.js): a
  read-only projection of one Publication, with selection and
  inspection but no mutation path at all.

**renderer/** is Three.js. WorldRenderer subscribes to World's domain
events and reacts incrementally (one mesh per BrickAdded, and so on);
there is no render(world) sweep. See "Renderer" below.

**ui/** is Vue 3 with no build step: components are plain objects with a
template string. ui/main.js is the composition root that constructs and
wires every adapter; its larger subsystems are built by the compose
functions in ui/main/, which it calls in order.

**Adapters** sit around the layers: storage/ (StorageProvider and the
local stores), serializer/, publisher/, discovery/, identity/, peer/,
presence/, collaboration/, replication/, placement/, spatial/,
world-layout/, content/ (content stores), anchoring/ (Bitcoin, Arweave
and Base anchoring), base/ (Base/EVM transactions), nostr/ and arweave/
(injected-wallet signers and the relay client), steem/ (the Steem API
client and Keychain broadcaster), audio/ (World View's synthesized sound),
and server/ (the reference rendezvous worker).

## Dependency direction

    ui -> application -> core
    ui -> core, for read-only value types, enums and pure helpers only
    application -> renderer
    application -> adapters (storage, publisher, identity, peer, …)
    renderer -> core (reads domain events and data; never the reverse)
    core never depends on anything above it

ui/main.js, the composition root (with its compose functions in ui/main/),
is the one place in ui/ that wires every layer. application -> renderer includes injection: use cases build
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
  Touch reaches the tools only as whole taps: EditorSession's pointer
  input (application/editorSession/pointerInputMethods.js) holds a touch
  until it lifts, drops it if it moved or a second finger joined (the
  camera's orbit, pan or pinch), and otherwise replays it as a hover,
  press and release at the lift point, so tools need no touch handling.
  In touch Box-select mode a one-finger drag is the same marquee as
  Shift-drag, with the camera controls off while it is drawn.
- **Commands and history.** Every document change is a Command executed
  through CommandHistory (application/editor/CommandHistory.js): a linear
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
  the Escape chain itself, and refreshes its action context through
  `onExecute()` after any action runs (Copy changes no document state).
- **Feedback.** ActionFeedback shows one transient line after an action;
  TransformFeedback shows the live gesture state; SelectionInspector,
  inside EditingSidebar's contextual Selection panel, shows the current
  brick selection (StructureInstancePanel does the same for a structure
  placement, and EditingSidebar then renders nothing).
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

## Bricks, structures and blueprints

docs/BrickLibrary.md, docs/BrickIDs.md and docs/StructureLibrary.md are
the detailed references; in short:

- BrickRegistry (core/) holds brick definitions from core/library/CoreLibrary.js.
  StructureRegistry (core/StructureRegistry.js) holds Structures from
  core/library/VillageLibrary.js. A Structure is only ordinary bricks in
  local coordinates.
- The Editor's Build Library (ui/components/BuildLibraryPanel.js) lists
  both, with previews from application/editor/LibraryPreviewService.js. Clicking
  a structure places a copy of its bricks
  (CopyStructureIntoDocumentUseCase through StructureCompositionTool);
  Fork opens it as a new document.
- A StructurePlacement (core/StructurePlacement.js) places a whole saved
  Document inside another one by reference, resolved fresh by
  application/editor/StructureDocumentResolver.js; placements can be moved,
  rotated, duplicated and removed with their own commands.
- Blueprints: a personal structure library (LocalStructureLibraryStore,
  local to the device), BlueprintPackage export and import, and
  fingerprints, attribution and lineage claims (core/BlueprintFingerprint.js,
  BlueprintAttribution*, BlueprintLineage*) that describe a design without
  becoming part of it.

## World View

World View (ui/views/WorldView.js, route `/world/:documentId`) walks
through the shared world. A link to a Publication (routes
`/view/steem/:author/:permlink`, `/view/ar/:id`, `/view/ipfs/:cid`,
ui/views/PublicationLinkView.js), from a Steem post or shared with
Share, lands a first-time visitor here: it verifies the Publication's
Signed Claim read from Steem, Arweave or IPFS, keeps its build locally
and admits it as World discovery does
(application/publication/OpenPublicationLink.js). WorldNavigationSession owns its runtime:
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

## Local storage: IndexedDB behind a synchronous provider

Every store reaches this device's storage through StorageProvider, whose
save/load/remove/list are synchronous, and in the browser through
storage/LocalStorageProvider.js. That provider keeps JSON strings in a
backend: window.localStorage by default, or the IndexedDB backend
(storage/IndexedDbStorageBackend.js) that ui/boot.js opens before it
imports ui/main.js, so nothing reads storage before it is ready.

The IndexedDB backend reads every entry into memory when it opens and
answers reads from that copy, except cold entries: published content
(`content:`) and snapshots (`snapshot:`), whose names only are read. A
cold entry written leaves memory once stored; `loadAsync()` (backend
`loadItem()`) reads one into a most-recently-used cache of 16 M
characters (the latest one always stays); a synchronous `load()` of one
not in memory throws StorageEntryNotLoadedError, whose `ready` promise is
already reading it (`retryWhenLoaded()` wraps a synchronous reader for an
async caller). LocalContentStore's `get()` is therefore asynchronous, like
every ContentStore, with `getSync()` for World View streaming, which skips
a world whose content is still being read and loads it on a later
refresh, staying synchronous itself. Snapshot resolution
(`DecentralizedSnapshotResolver#resolveCandidate()`, given a
`localContentStore`) asks this store by content hash before the network,
so bytes fetched once are read locally from then on, verified the same
way. Editable documents stay in memory:
about twenty places read them synchronously (collision, selection,
search, catalogs). Writes change the copy at once and are
committed in the background, one transaction per task. flushLocalStorage()
commits what is waiting with strict durability and resolves once
everything is stored; the Editor's Save (ui/components/saveDocument.js)
waits for it, so a full storage (StorageFullError) is still reported, and
marks the document unsaved again if it fails. A failed background write
stays in memory and is retried with the next commit. After each commit the
written names go out on the `forkbuild-storage` BroadcastChannel and other
tabs read those entries back from IndexedDB, leaving alone any they have
written themselves and not yet stored. On open, `forkbuild:` entries still
in localStorage are moved into IndexedDB. If IndexedDB is missing or does
not open within 10 seconds, the session uses localStorage.

## Backup and restore

Clearing a browser's site data deletes everything above, so the Your Data
page (ui/views/YourDataView.js, `/settings/data`) backs it up.
application/backup/DeviceBackupUseCase.js reads every entry through the
StorageProvider (`loadAsync()`, so cold entries are included) except the
login session, and other people's published content unless asked;
application/backup/DeviceBackupFile.js compresses the entries and encrypts
them with a passphrase through WebCrypto (docs/Protocol.md, "Device
backup"). application/backup/BackupEntryGroups.js names every store's key
or prefix and the group it belongs to: the page counts entries by group,
and a restore writes only names it lists, so a store added later must be
added there. A restore replaces everything or adds what is missing (see
the Protocol section for how the document, identity and own-publication
lists are combined), waits for flushLocalStorage(), and reloads the page,
because every store read its data when the app started. The page also
shows `navigator.storage.estimate()` and asks for persistent storage.

application/backup/BackupStatusStore.js keeps when and where this device
was last backed up and its reminder and automatic-backup settings, in
`device-backup-status`, which like `local-session` is device-only: never
backed up, kept by a replacing restore, and moved forward by a restore to
the backup's date. BackupReminder.js decides when a reminder is due (a week
after the device first holds work worth backing up, then after the chosen
interval, unless snoozed); ui/components/BackupReminderBanner.js shows it
under the header everywhere but Your Data. BackupDestinations.js adds a
folder picked through the File System Access API (BackupFolder.js writes one
file a day and keeps ForkBuild's newest ten) and the remembered backup key:
a non-extractable, encrypt-only CryptoKey from
DeviceBackupFile.js#deriveBackupEncryptionKey(). Neither is JSON, so both
live in storage/IndexedDbValueStore.js (a separate `forkbuild-backup`
database) and are loaded once, so a click can ask for the folder permission
before the browser's user-activation window closes. `startAutomaticBackups()`
(ui/main.js) checks a minute after start-up and hourly and backs up to the
folder when turned on, allowed without asking, and a day has passed. Web
Share sends a backup to another app; the page keeps an encrypted backup for
a second tap when the share sheet refuses to open after a slow encryption.

Smaller exports sit where their data is: every saved document from the
Editor's Recent menu (application/document/DocumentBundle.js), every
personal structure beside My Structures
(application/blueprint/BlueprintBundle.js), and one identity with its
signed lifecycle records (identity/IdentityLifecycleTransfer.js).

Repository cards of your own publications say where this device recorded
distributing them (application/publication/OwnPublicationDistributionRecord.js):
storage from the Signed Claim's distribution lifecycle, signed snapshot
placements and application/snapshot/OwnSnapshotDistributionLog.js, and
announcements from the lifecycle's origin (a `ws:`/`wss:` relay is Nostr, a
steemit.com thread Steem, another URL the Arweave gateway) and the log. The
log (`own-snapshot-distributions`) is written by the `snapshotDistributionCommand`
ui/main/composePublicationDistribution.js provides, so every Distribute
Snapshot is kept past a reload. With no record the card says so, rather
than claiming the publication exists only here.

## Announcement Index

application/announcementIndex/ keeps every announcement this device has
discovered: Snapshot candidates, Place Naming claims and Publication
leads, one storage entry per kind and discovery tag
(`announcement-index:<kind>:<tag>`), at most 2,000 records a tag and 8 KiB
a payload. Network discovery sources are wrapped so what they return is
recorded, and the index answers beside them, so an announcement that has
left a substrate's newest page is still found. World View shows what the
index holds before the network answers. The index holds pointers and
claims only; parsing, signature checks and resolving still happen on
whatever it returns.

- **Sync cursors.** They page each Nostr relay and the Arweave GraphQL
  endpoint until every announcement under a tag has been read, a few
  pages per run.
- **Background sync.** `BackgroundAnnouncementSync` runs the sync in the
  background from the moment the app opens.
- **Peers.** The `forkbuild:announcement-index` peer protocol shares
  Snapshot and Place Naming records between connected peers.

docs/AnnouncementIndex.md has the full design.

## Documents: save, autosave, publish and fork

A Document moves through three kinds of storage, each with its own
operation (docs/Principles.md, "Save is not Publish"):

| Operation | Use case | Storage key | Nature |
|-----------|----------|-------------|--------|
| Save | SaveDocumentUseCase | `{documentId}`, plus a DocumentManifest revision | the editable copy; overwritten on every save |
| Autosave | AutosaveDocumentUseCase, run by AutosaveScheduler | `recovery:{documentId}` (persistence/LocalRecoveryStore.js) | a recovery checkpoint only; never cleans the dirty flag or publishes |
| Publish | PublishDocumentUseCase → PublisherProvider | `snapshot:{publicationId}`, and a Publication record in `forkbuild-publications` | an immutable snapshot |

**Content hashes.** Publications, Snapshots and stored content are named
by the SHA-256 of their canonical text (serializer/contentHash.js,
`computeContentHash()`), and `ContentReference#verify()` checks bytes
against it. Content published before 2026-09-28 carries a 32-bit FNV-1a
hash, which can be forged: `verify()` refuses one unless the caller passes
`allowLegacy`, which only paths reading this device's own data do
(LocalPublisherProvider's own snapshots, `isOwnPublication()`, and
crash-recovery checkpoints). FNV-1a (`computeFnv1a32()`) is still used
where a value must stay stable and a signature covers the real data: the
deterministic grid position, PlacementRecord's own hash and a Signature's
`signedHash` pre-check. Blueprint fingerprints, which signed authorship
and lineage claims name designs by, are `bp2:` plus SHA-256; claims made
under the old `bp:` (FNV-1a) fingerprints are counted apart, never shown
as authorship or lineage, and refused on import, and their author can
re-sign one for a design they are looking at
(`BlueprintAttributionUseCase#resignLegacyAttribution()`).

Stored, published and exported documents use document schema 2, which
keeps each building's bricks as one table (core/BrickTable.js: palettes of
definitions and colors, the ids, and six numbers per brick) rather than
one object per brick; Building/World/Document `toJSON()` write it when
asked for `compactBricks`, and `Building.fromJSON()` reads either form.
New bricks get 12-character ids (`createBrickId()`). Together these make
a large build about a fifth of its former size, and serializing,
hashing and parsing it several times faster.

Every document that enters the domain goes through the same pipeline:
parse → DocumentSchemaMigrator.migrate() (bring the envelope to
DOCUMENT_SCHEMA_VERSION through registered, pure migrations) →
DocumentValidator.validate() (pure structural check) →
Document.fromJSON(). DocumentSerializer is canonical: serializing,
deserializing and serializing again gives byte-identical JSON, and
serializer/contentHash.js hashes that canonical string. Publishing runs
serialize → migrate → validate → hash before it stores anything, and
loading a snapshot checks the hash before deserializing
(LoadPublishedWorldSessionUseCase), so a corrupt or tampered snapshot is
refused. Recovery checkpoints go through the same pipeline;
CheckRecoveryUseCase and DiscardRecoveryUseCase decide what to offer.
CommandHistory is not persisted with the document: after a reload or a
recovery, undo history starts empty.

**Lifecycle status** (Draft, Saved, Published) is computed on demand by
application/document/DocumentLifecycleStatus.js from facts that already exist
(has it been saved, is a Publication known for it), never stored. A fork
is not a status: it is an ordinary document whose metadata carries
`parentDocumentId` (or `parentStructureId` for a Structure fork).
UpdateDocumentMetadataUseCase edits title, description and license;
LicenseLabels holds the labels every surface shows.

**Publishing and unpublishing.** A Publication (publisher/Publication.js)
is pure data describing a snapshot: ids, author, contentHash,
schemaVersion, license, contentReference, publisher identity and
signature. Publishing the same document again adds a new Publication
for the same documentId. UnpublishDocumentUseCase removes the
Publication and its snapshot and never touches the editable document.
World View can publish too (WorldNavigationSession#publishDocument()),
but refuses a document that is itself a published snapshot. Everything
that leaves the device after publishing is a separate distribution step;
see "Distribution: independent choices, one dialog".

**Forking** never edits a Publication. ForkDocumentUseCase (behind the
Editor's `/editor?fork=` route) and ForkPublishedWorldUseCase clone the
source through DocumentCloneService: a new document id, fresh ids for
every building and brick, the current user as author, and
`parentDocumentId` pointing at the source. ForkDocumentUseCase checks the
source's license first (core/License.js, `forkAllowed`) and refuses with
ForkFailureReason.LICENSE_DENIED rather than relying on a hidden button;
a permitted fork's license carries the original attribution. World View's
fork-on-write asks the same license question. Forking never creates a
WorldPlacement.

In World View, a published snapshot that someone tries to change is
forked lazily on the first real mutation (`_forkForEdit()`), never on
navigation or selection, and the session switches its active document to
the fork at once. Since 0.5.9 that only applies to World View's few
remaining mutations (see "World View"); brick editing reaches a fork
through "Edit a Copy" and the Editor.

## Repository and Author views

RepositoryView and AuthorView both mount ui/components/PublicationCatalog.js;
AuthorView passes an author and adds the ForkTree lineage view. The
catalog asks SearchPublicationsUseCase for one page at a time with a
PublicationQuery (text, author, sort, page, pageSize,
includeDescriptions) and gets back a PublicationPage (items, totals,
hasNext/hasPrevious). The discovery provider it searches merges local
publications with the application-wide decentralized discovery provider
(application/discovery/CreateDiscoveryUseCase.js).

- Sorting (core/PublicationSort.js) always falls back to an ordinal
  publicationId tiebreak, so every replica orders the same way.
- Searching descriptions is opt-in, because it loads each candidate's
  document.
- Grouping (core/PublicationGrouping.js) only regroups the current page.
- Pagination is explicit (PublicationPagination.js); there is no
  infinite scroll.
- Previews are derived client state, never part of a Publication.
  PublicationPreview asks application/editor/PreviewService.js for a thumbnail
  only while the card is visible; PreviewService queues, deduplicates,
  caches and cancels renders done by renderer/DocumentThumbnailRenderer.js,
  and a failed preview never fails the publication.

## Placement and spatial discovery

Three things answer three questions (docs/Principles.md, "A Publication
Is What; A Placement Is Where"):

- a Document: what the world contains, in its own local coordinates;
- a Publication: which immutable version was released;
- a placement: where that version sits in shared space.

core/WorldPlacement.js is the spatial reference (publicationId, position,
rotation, local SpatialBounds). core/PlacementRecord.js wraps it as a
publishable record with its own id, owner, revision, content hash, owner
signature and causal stamp. Several placements may point at one
publication, and a document's author, its publisher and its placement's
owner can be three different people.

**What the live World View uses.** application/world/CreateWorldViewUseCase.js
wires:

- LocalSpatialIndexProvider (spatial/) and LocalPlacementRegistry
  (placement/). The registry writes every record through to the index.
- LocalWorldLayoutProvider (world-layout/). It answers "which documents
  are near the camera, and where" from each publication's placement, and
  falls back to a deterministic, id-keyed grid position
  (core/DeterministicGridPlacement.js) for a publication with none.
- PlacePublicationUseCase with GridPlacementStrategy
  (application/placement/InitialPlacementStrategy.js): the automatic first
  placement after publishing. Its position is a pure function of the
  publication id, so every replica computes the same one.
- MoveWorldPlacementUseCase and RemoveWorldPlacementUseCase. A move
  writes a new signed revision with an advanced causal stamp; earlier
  revisions keep their own signatures. Removing a placement is not
  unpublishing.
- SearchWorldUseCase, behind WorldNavigationSession#searchWorld() and
  searchWorldByLocation(); exploreLocation(), exploreHere() and
  whatsHere() build on the same spatial query.

Two placements may share a position. That is a derived observation (an
overlap), not an error. What to do about it is core/SpatialAllocationPolicy.js
(ALLOW/WARN/REJECT). An explicit move uses WARN
(WorldNavigationSession#checkPlacementOverlap()); automatic placement
always behaves as ALLOW. AUTO_OFFSET is declared but throws: automatic
collision resolution is deliberately not implemented
(docs/Principles.md, "Automatic Collision Resolution Is Deferred, Not
Solved").

**Built and tested, not wired into the running app:**

- the decentralized spatial index: SpatialCell, SpatialIndexManifest and
  SpatialIndexRoot (core/), SpatialIndexStore, SpatialIndexBuilder and
  DecentralizedSpatialDiscoveryProvider (spatial/), and
  RebuildSpatialIndexUseCase. The index is an accelerator, never the
  truth: an entry that points at an older revision is resolved and the
  newer valid revision wins;
- placement-first discovery with distance tiers (DiscoverWorldAreaUseCase,
  LocalSpatialDiscoveryProvider);
- the streaming session in world/ (WorldViewStreamingSession,
  LoadedWorld, WorldLoadState, PublicationContentCache), with separate
  load and unload radii and one content load per publication.

WorldNavigationSession accepts an optional `spatialDiscoveryProvider`
used only for trust diagnostics, but nothing passes one today, because
no live replica builds a populated index root (see the comment in
WorldNavigationSession's constructor).

Decentralized publications found through Nostr or Arweave, and Snapshots
placed through the distribution flow, reach the World a different way:
see "Publication presence across restarts" and "Distribution".

## Signatures, trust and replication

Hashes establish what an object is; signatures establish who authorized
it. identity/Ed25519.js wraps Ed25519 signing (RFC 8032, verified strictly:
non-canonical signatures and small-order keys are rejected) and SHA-512 from
the audited noble-curves and noble-hashes libraries, which are copied into
vendor/ by scripts/vendor.mjs (a test fails if vendor/ ever differs from
the pinned npm packages). It has no fallback random source: without
crypto.getRandomValues no key is created. identity/SigningIdentity.js is a public-key identity
(did:key). core/Signature.js signs a canonical envelope
`{ domain: 'forkbuild', type, id, revision, payload }`, so a signature
for one object type can never be replayed as another.
identity/LocalAuthorizationVerifier.js answers three questions for every
signed object: is the signature authentic, is the signer known, and was
the signer allowed.

**Live today:**

- Publications carry `publisherIdentity` and `signature`
  (publisher/LocalPublisherProvider.js). A Publication's
  `contentReference` (core/ContentReference.js) names the bytes by
  content hash; where they are stored is a separate, retrievable detail,
  and bytes are always checked against the hash.
- PlacementRecords carry `ownerIdentity`, `signature`, `causalStamp`
  (core/CausalStamp.js, a vector clock) and `parents`, all inside the
  signed envelope (PlacePublicationUseCase, MoveWorldPlacementUseCase).
- A Publication may carry a signed `placementPolicy`
  (core/PlacementPolicy.js), copied from the document's metadata at
  publish. PlacePublicationUseCase refuses a placement it doesn't allow
  (`PlacementNotPermittedError`), and `checkPermission()` lets World View
  disable Accept Position before anyone clicks.
- A publisher's own signed PlacementRecord travels beside its Snapshot
  announcement (`placementRecord` in core/SnapshotDiscoveryEnvelope.js;
  World View's `placementClaimFor()` picks it through
  `getPublisherPlacementRecord()`). A receiving World View adopts it
  (application/placement/AdoptPublisherPlacementUseCase.js, from
  useClaimedBuilds.js) straight into its placement registry once the
  Publication is known, so the build appears where its publisher put it.
- The same verifier checks identity lifecycle records, device
  authorizations, world edit grants, naming claims and the other signed
  records later milestones added.

**Built and tested, not wired into the running app:**

- delegation: core/Delegation.js grants one PLACE or MOVE capability.
  The issuer signs it through `signCanonical()` (signature type
  `delegation`, CreateDelegationUseCase), and
  identity/DelegationVerifier.js and
  LocalAuthorizationVerifier#verifyDelegation() check it, and the
  delegate's signed action, as real Ed25519 signatures with each key taken
  from its did:key (identity/DescriptorSignature.js). Before it is wired
  in, it still needs a way for grants to travel between devices, a signed
  revocation, a check of its `nonce` against replay, and a decision on
  chains, which are refused today;
- replica merging (application/placement/CreateReplicationUseCase.js,
  replication/ReplicaMergeService.js and LocalReplicationStore.js).
  ConflictResolver compares two causal stamps (EQUAL, BEFORE, AFTER,
  CONCURRENT), ConflictPolicy picks a deterministic presentation winner
  among concurrent revisions (smallest content hash), and core/ConflictSet.js
  records the competitors without discarding either history. Given a
  `findPublicationById`, the merge also rejects a placement its
  Publication's placement policy doesn't allow. Publisher placements from
  Snapshot announcements deliberately don't use it (see above);
- the trust layer around it: core/TrustObservation.js (what a check
  found), identity/TrustPolicy.js (what to do about it; the defaults
  reproduce the pre-0.2.19 behavior), core/FreshnessProof.js and
  core/IndexEquivocation.js (one authority signing two different roots
  at the same causal position).

The world command protocol (0.2.96–0.2.97) has its own ordering in
replication/WorldOperationOrdering.js and WorldConflictResolver.js; see
"Collaboration".

## Identity

An identity is an Ed25519 key pair held on this device
(identity/LocalIdentity.js). Its id is the did:key derived from the
public key, and the constructor checks that derivation; the `label` is a
local display name, never part of the identity. identity/Identity.js is
only the "which account is the app showing" label, and
identity/SigningIdentity.js is the public half other replicas verify
against. identity/LocalIdentityProvider.js owns every identity on the
device, and IdentityUseCase and the Identity page (`/identity`) sit on
top of it.

- **Sessions and the vault.** Whether an identity exists, whether its
  key is unlocked, and whether the session is authenticated are three
  separate facts: identity/AuthenticationSession.js
  (ANONYMOUS/AUTHENTICATED) and identity/VaultLock.js (LOCKED/UNLOCKED,
  never serialized). A protected private key is stored encrypted by
  identity/KeyEncryption.js through WebCrypto: PBKDF2-HMAC-SHA256 with
  600,000 iterations derives an AES-256-GCM key, and the GCM tag makes a
  wrong passphrase and a tampered record fail the same way. Because
  WebCrypto is asynchronous, so are the operations that derive a key
  (creating a protected identity, protect, unlock, change passphrase,
  export, import); signing stays synchronous and needs the identity
  unlocked first. Records in the earlier format (PBKDF2-HMAC-SHA512 with
  600 iterations, a SHA-512 keystream and an HMAC tag) still decrypt, and
  are re-encrypted in the current format on the next successful unlock or
  export. New passphrases need at least 8 characters, and the UI creates
  protected identities unless the user explicitly opts out.
  VaultTimeoutPolicy bounds how long a vault stays
  unlocked; FailedUnlockTracker adds a time-based lockout after failed
  unlocks (in memory only). Wrong export passphrases count against the
  same lockout.
- **Export, import and recovery.** identity/IdentityExport.js builds a
  JSON package with the encrypted private key, and the provider adds the
  identity's signed revocation, successor and device grants
  (identity/IdentityLifecycleTransfer.js); IdentityImport.js
  validates it (including the did:key derivation) before anything is
  decrypted; IdentityRecovery.js runs validate → duplicate check →
  decrypt → verify, and importing an identity the device already has
  never overwrites its key: it only adds lifecycle records that verify
  and are missing.
- **Lifecycle.** An identity can declare a successor
  (core/IdentitySuccessionEnvelope.js, signed by the predecessor) and can
  be revoked permanently (core/IdentityRevocationEnvelope.js,
  self-signed). Revocation stops new signing; it doesn't undo old
  signatures. IdentityLifecyclePropagationUseCase relays these records to
  connected peers over `forkbuild:identity-lifecycle`; a receiver trusts
  a record by its own signature, and only for identities it already
  knows.
- **Devices.** A second device is its own LocalIdentity that the parent
  identity authorizes with a signed grant (and can later revoke).
  DeviceAuthorizationPropagationUseCase relays grants over
  `forkbuild:device-authorization`. Its resolvePeerAuthority() and
  resolveConnectionIdentity() let the social protocols treat a
  connection as the parent identity, either directly or through one
  verified grant, and only after the connection has authenticated its
  own key.

## Peers, friends, chat and voice

**Connections.** A peer connection authenticates a key, not an account.
peer/WebRtcPeerConnectionProvider.js makes real WebRTC connections using
the ICE servers from the STUN and TURN settings (peer/IceServerConfig.js),
plus TURN relay credentials that the rendezvous servers hand out
(GET /turn-credentials, cached until shortly before they expire). Those are
fetched only when a connection starts:
application/peer/PeerSessionManager.js awaits the provider's
prepareIceServers() before each createOffer()/connect(), so opening the app
contacts no TURN service, and the provider key never reaches the browser.
Peers find each other through rendezvous (peer/RendezvousDiscoveryProvider.js
over peer/WebSocketRendezvousTransport.js, one per configured rendezvous
URL; the reference server is server/rendezvous-worker/) or through a
manual invitation (peer/PeerInvitation.js with an offer and answer). A
rendezvous server accepts a publication only when it is signed by the
identity it names (peer/RendezvousPublicationSigning.js), and a withdrawal
only with that identity's signature over it (the `rendezvous-removal`
signature type); it also refuses replays of older publications and limits
message size, publication lifetime, request rate and connections per
address (server/rendezvous-worker/README.md). The reference deployment
also accepts connections only from the sites listed in its
`ALLOWED_ORIGINS` (the GitHub Pages site), caps relay credentials at
`TURN_CREDENTIALS_PER_MONTH`, and reports this month's count at
GET /turn-stats. A
discovered candidate is only a hint; peer/PeerAuthenticationSession.js
runs a challenge–response over the new connection, and a signature is
bound to that one connection. application/peer/PeerSessionManager.js is the
one app-wide owner of connections (listPeers(), importCandidate(),
disconnect(), onIdentityMismatch()), and ConnectedPeerRegistry lists the
authenticated ones.

**Answer mailbox.** A rendezvous publication carries the WebRTC offer, and
the server also carries the answer back (POST_ANSWER, FETCH_ANSWER; see
docs/Protocol.md, "Rendezvous"). PeerSessionManager#connectToDiscovered()
leaves the answer through RendezvousDiscoveryProvider#deliverAnswer(), which
knows which publication each discovered record came from. publishSelf()
then asks every server, in one signed FETCH_ANSWER with `watch`, for an
answer already waiting and to push a later one down its open WebSocket;
the push reaches PeerSessionManager through the transport's
onAnswerPushed(), RendezvousDiscoveryProvider#onAnswer() (kept to this
device's own current publication) and DiscoveryBootstrap#onAnswer(), and
completeConnection() runs on whichever of push or check comes first. The
worker keeps the watch in the socket attachment, which survives
hibernation, so a waiting publisher costs the server nothing between
answers. Checks continue as a fallback: every 30 seconds while every server
confirmed the watch, every 2 seconds otherwise. Find by ID and the automatic Known Peer
connection (AutoConnectKnownPeersUseCase) therefore complete with nothing
copied by hand; when the mailbox can't be used (a locked identity, a pasted
invitation) the reply is returned to hand over as before.

**Public lobby.** application/peer/PublicLobbyUseCase.js lets people who
don't know each other's identity ids meet: one global lobby (`public`) and
one per World (`world:<documentId>`). Joining signs a core/LobbyCard.js
(identity, lobby, display name; no address) and sends it to every
rendezvous server through peer/RendezvousLobbyTransport.js, a contract kept
separate from identity lookup so that lookup still cannot list anyone.
While any lobby is joined the use case keeps this device discoverable: it
calls publishSelf({ prepareRelay: false }) and republishes as soon as a
publication is spent, so standing offers never fetch a TURN credential;
the person who connects does. Cards are renewed while the app runs and
withdrawn on leave and on `pagehide`; joining is never restored at
startup. list() keeps only cards that verify by their own signature (the
server's listing is untrusted), drops this identity and blocked ones, and
marks who is connected. connect() is FindPeerUseCase#search() and
#connect() by exact identity. A lobby connection is an ordinary
authenticated peer: publication sync and the announcement index run as for
any peer, and friendship still gates chat and voice. The UI is
ui/components/PublicLobbyPanel.js, on the Peers page and behind World
View's Lobby button.

**Protocols.** Every application protocol shares each connection through
peer/PeerMessageBus.js, which routes by a protocol id
(`forkbuild:chat`, `forkbuild:avatar-presence`, …; the full list is in
docs/Protocol.md, "Peer messages") and never
interprets the payload. Replay and ordering rules belong to each
protocol, not to the bus. A message is at most 64 KiB, so
`forkbuild:content` and `forkbuild:snapshot-content-transfer` send larger
content in parts through application/peer/ChunkedPeerTransfer.js, pausing
while the channel's send buffer (`PeerConnection#bufferedAmount`) is full;
their 8 s waits restart on each part (`onTransferProgress()`), so a
timeout bounds silence rather than the whole transfer (docs/Protocol.md,
"Large content in parts").

**Sharing Worlds with peers.** A plain Publish lists a World on this
device only. application/publication/sharing/ adds sharing on top of the
existing decentralized publication pipeline, without new wire protocols:

- SharePublicationWithPeersUseCase wraps this identity's own signed
  Publication in a signed DecentralizedPublication
  (PublicationResolver#publish(), which stores the Publication's JSON in
  publicationContentStore), catalogs it and announces it over
  `forkbuild:publication`. Being cataloged is what lets PeerContentExchange
  serve those bytes and PublicationPeerConnectionSync re-announce them to
  later peers; the World's snapshot is already in the same store from
  publishing.
- RetrieveSharedPublicationUseCase resolves a shared envelope with
  resolvePublicationView() against **only the connections authenticated as
  the sharer** (directly or as an authorized device, via
  DeviceAuthorizationPropagationUseCase#resolveConnectionIdentity()),
  requires the Publication inside to be signed by the sharer, admits it to
  DecentralizedPublicationDiscoveryProvider (the Repository), then fetches
  its snapshot over `forkbuild:snapshot-content-transfer`
  (MaterializeSnapshotFromPeerUseCase) so World View can load it. Only the
  sharer is ever a source, so what a peer can offer is limited to what its
  sharer signed.
- AutoRetrieveSharedPublicationsUseCase runs that retrieval on its own when
  a share arrives or its sharer authenticates, only if the sharer is a
  Friend or Known Peer and not blocked (the predicate is composed in
  ui/main.js). Anyone else's share waits for a click in the Repository's
  SharedWithYouPanel.

The use cases take the Publication kind from
CreatePublicationDisplayKindRegistryUseCase's `publicationKindPlugin`
rather than naming it. The UI is ui/components/SharePublicationButton.js on
Repository cards and ui/components/SharedWithYouPanel.js above the catalog.

**Relationships.** Four separate kinds of local state:

- PeerRelationshipUseCase: peers this device chose to remember, by
  identity, with a local alias. Forgetting deletes only the local record.
- FriendRelationshipUseCase: mutual friendship through signed
  REQUEST/ACCEPT/REJECT/CANCEL/UNFRIEND advertisements
  (`forkbuild:friendship`). Friendship needs both sides' consent.
- PeerBlockUseCase: a one-sided, silent block, enforced in both
  directions by this device.
- FollowUseCase (application/identity/): identities this identity follows,
  as core/FollowRecord.js entries under `follows:<identityId>`. One-sided and
  never sent; it grants the followed identity nothing. A follow is matched
  only against verified signatures, never a typed author name:
  - application/publication/FollowingFeed.js lists the Publications the
    Repository knows (this device's catalog and the
    DecentralizedPublicationDiscoveryProvider) whose signature verifies
    against a followed, unblocked identity (the Following page,
    ui/views/FollowingView.js). It fetches nothing itself.
  - FollowedAuthorPublicationNotifier listens to the provider's onAdded(),
    subscribed after the startup rebuild, and saves a
    `publication.followed-author-published` NotificationEvent, deduplicated
    by Publication id.
  - application/announcementIndex/FollowedAnnouncementRetention.js is the
    Announcement Index's `isKeptFirst`: Snapshot records with a followed
    publisher's signed placement, and Place Naming claims a followed author
    signed, are the last evicted when a tag is full.
  - AutoRetrieveSharedPublicationsUseCase's trusted-sharer predicate also
    accepts a followed identity.

Presence and profile visibility (PUBLIC/FRIENDS/…) is decided by a
visibility policy that reads these facts; see "Avatars and presence".

**Chat.** ChatUseCase runs over `forkbuild:chat` between authenticated
friends who haven't blocked each other. sendMessage() is live delivery;
sendOrQueue() adds the message to ChatOutbox, a durable queue addressed
to an identity (not a connection) that flushes on reconnect, is pruned
by expiry, and can be cancelled. Delivery acknowledgements
(`forkbuild:chat-delivery-ack`) mark messages delivered. ConversationStore
keeps the durable history per identity, so a reload continues a
conversation. ConversationReadTracker keeps this device's own read
marker; read receipts to the other side go through ConversationReadOutbox
(`forkbuild:chat-read`, coalesced to the latest value).
DeviceConversationSyncUseCase copies history and read state between
devices of the same identity (`forkbuild:device-conversation-sync`).
PeerPresenceUseCase summarizes each peer's online state for the Peers
and Conversations pages.

**Voice.** VoiceUseCase sets up calls over `forkbuild:voice-call` and
carries audio on the same WebRTC connection (`forkbuild:voice-media`),
renegotiated in-band by one fixed side. Calls use the same authorization
question as chat. Ringing times out locally (45 s by default), a local
microphone failure never ends a call by itself, and device selection
(setMuted(), listInputDevices(), output device) is local state that never
goes on the wire.

## Avatars and presence

Identity, avatar profile and presence answer three different questions:
who you are, what your avatar looks like, and where it is right now.

- **Profile.** core/AvatarProfile.js holds a template id and an
  appearance, validated strictly on write and resolved leniently on read
  (core/AvatarTemplate.js, templates from
  core/library/CoreAvatarTemplateLibrary.js via AvatarTemplateRegistry).
  AvatarProfileUseCase stores it durably per identity; the Avatar page
  (`/avatar`) edits it. AvatarProfileSyncService shares it over
  `forkbuild:avatar-profile`, signed (AvatarProfileSigning) and checked by
  AvatarProfileTrustBoundary, under its own visibility policy
  (AvatarProfileVisibilityUseCase).
- **Presence.** AvatarPresenceSession holds the local avatar's current
  AvatarPresence in memory only; it is never persisted or placed.
  AvatarMovementController simulates movement (see "Avatar movement
  constraint pipeline") and produces new presence. Touch screens drive it
  through the same keys: TouchMovementInput
  (application/avatar/TouchMovementInput.js) turns World View's joystick
  (core/TouchJoystickKeys.js) and buttons into the session's
  avatarKeyDown/avatarKeyUp calls, holding each button for at least one
  frame's sampling. Its Cruise button sends the Alt+W chords, choosing the
  next one from avatarContinuousMovementState(). PresenceSyncService
  broadcasts it as a core/AvatarPresenceAdvertisement.js, signed when the
  identity provider can sign (PresenceSigning), through a
  presence/ broadcast provider: PeerAvatarPresenceBroadcastProvider over
  authenticated peers (`forkbuild:avatar-presence`) when peers are
  available, LocalAvatarPresenceBroadcastProvider (BroadcastChannel,
  development only) otherwise. An idle avatar sends nothing.
- **Receiving presence.** PresenceTrustBoundary and core/ PresenceIngestion,
  PresenceReplayWindow, PresenceFreshness and PresenceEquivocation decide
  what to accept: a claim is bound to the connection it arrived on, and
  arrival order never picks a winner. RemoteAvatarRegistry holds accepted
  remote avatars, RemoteAvatarInterpolator smooths their movement, and
  RemoteAvatarAppearanceRegistry their appearance. Lifecycle (fresh,
  stale, gone) is derived, never stored.
- **Visibility.** core/PresenceVisibilityPolicy.js (PUBLIC, FRIENDS,
  LOCAL, HIDDEN, plus explicitly authorized identities) is applied before
  broadcasting, never after; PresenceVisibilityUseCase stores the choice
  and ui/components/VisibilityPolicyForm.js edits it. Withholding future
  presence is not remote deletion.
- **Interaction.** Selecting an avatar (0.2.39) opens AvatarInfoPanel;
  proximity (core/AvatarProximity.js) is derived, never announced.
  Gestures (core/AvatarInteractionKind.js: GREET, WAVE, POINT) are
  their own vocabulary, separate from animation state, rate-limited by
  core/AvatarInteractionCooldown.js. AvatarInteractionSyncService sends
  them as signed events over `forkbuild:avatar-interaction`, checked by
  AvatarInteractionTrustBoundary with a bounded replay window; a
  claimed target is never an instruction to the target. Facing a target
  (core/AvatarFacing.js) is a local rendering override only.
- **Riding.** What an avatar rides is its own signed message
  (core/AvatarVehicleAdvertisement.js over `forkbuild:avatar-vehicle`,
  not a presence field, so older clients keep accepting presence).
  application/worldNavigation/remoteVehicleMethods.js sends it on getting
  on or off and every 2 s (`_publishLocalVehicle()`), through the same
  visibility-gated broadcast providers as presence, and each frame
  `_syncRemoteVehicles()` pulls what arrived through
  AvatarVehicleSyncService (AvatarVehicleTrustBoundary: signature,
  blocking, the PresenceAuthorityRegistry binding, replay, equivocation,
  order), forgets avatars no longer present and tells the renderer
  (`setRemoteAvatarVehicle()`). renderer/RemoteRiderVehicles.js draws the
  vehicle under the rider, heading from its movement; the rider isn't
  lifted by the ground height again, because a rider's position already
  includes it. `_remotelyRiddenVehicleIds()` hides this replica's copy of a
  ridden vehicle from `syncVehicles()` and from
  AvatarVehicleInteractionController (`isTakenByOther`), never the local
  mount's. Unridden vehicle positions stay local, so after a dismount a
  vehicle reappears where this replica last had it.
- **Camera and movement modes.** core/CameraPerspective.js gives each
  camera perspective an offset from the avatar; it never replaces the
  camera machinery, and the chosen avatar control mode persists locally.
  Step-up, walkable stairs and slopes (core/WalkableSurface.js), jumping
  and falling (core/AvatarVerticalState.js) are height constraints, not
  physics.

## Avatar movement constraint pipeline

`application/avatar/AvatarMovementController.js` runs the simulated move through up to six optional constraints, in this
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
  (`storage/*PersistenceStore.js`). Runtime positions are written at most once a second. Only released animals are
  saved; wild ones are recomputed.
- **Wandering (2026-09-29).** `core/WildlifeMotion.js#animalPoseAt(seed, animal, time)` says where a wild animal is
  at a moment: pausing, turning and walking between hashed waypoints inside its own lattice cell, within its
  species' wander radius of where it was placed. `WorldNavigationSession`'s `wildlifeClock` (wall-clock seconds by
  default) is the one time source, handed to the renderer, `AvatarWildlifeConstraint`,
  `AvatarAnimalInteractionController` and `AnimalRuntimeInstances#sync()`, so an animal is caught and collided
  with where it is drawn. Caught animals stop colliding (`isExcluded`). Released animals and decorations stay put.
- **Rendering.** Deterministic animals are drawn by their wildlife tile (`renderer/WildlifeTileMesh.js`), which keeps
  owning them while they wander because they never leave their cell; every frame
  `updateWildlifeTileMesh()` rewrites each loaded tile's instance matrices in place. A walking animal also moves with
  its gait: `animalPoseAt()` reports `gaitPhase` (strides into the current walk, a whole number of them per walk), and
  `renderer/AnimalGait.js` turns it into body lift and pitch and a head nod about the neck (rabbits hop, deer step);
  the head is its own InstancedMesh, so it nods without new geometry or draw calls. A standing animal idles:
  `animalPoseAt()` picks one `IDLE_ACTION` per pause (GRAZE, ALERT or NONE, at per-species odds) and reports how far
  into it the animal is, and `renderer/AnimalIdle.js` eases it in and out as body and head offsets, including a
  sideways turn of the head. Ears and tails are small ellipsoids merged into the shared head and body geometry
  (`SPECIES_PRESET`), so they move with them at no extra draw calls. Catching one rebuilds its tile
  without it (`TerrainStreamingController#invalidateTile()`). Released animals are drawn every frame by
  `renderer/AnimalFieldRenderer.js`, which shares geometry with the tiles. Released animals and decorations never
  leave their spot (their Y is authoritative and may be on top of a structure) but idle and turn in place:
  `stationaryAnimalPoseAt(seed, id, species, time)` gives the pose, keyed by id, and `AnimalVisual#animateAt()`
  applies it to a body-frame/neck joint graph built by `AnimalRenderer` that matches the tiles' instance matrices.
  `AnimalFieldRenderer#animate()` and `WorldRenderer#animateDecorations()` run each frame on
  `Renderer#wildlifeTime()`, wired by `RenderWorldViewUseCase` (and `RenderWorldUseCase` for decorations in the
  Editor).
- **Watching the viewer (2026-09-29).** `renderer/AnimalReaction.js#reactToObserver()` is the last step of every
  animal's look, in all three draw paths: within its look radius (deer 8, rabbits 5) and in front of it, an animal
  turns its head toward the local avatar; while settled in a pause it also lifts its head (interrupting grazing),
  and a rabbit within 3 sits up. It is stateless and purely visual, so positions stay the same for every viewer.
  `RenderWorldViewUseCase` hands `Renderer#setWildlifeObserver()` the local avatar's drawn position (never a remote
  avatar's, which arrives late); the Editor has no observer.
- **Decorations (0.9.702/0.9.703).** `G` turns the nearest released animal into an `AnimalDecoration` in the World
  document through a registered command, or turns the nearest decoration back into a released animal. This is the
  one way a World View animal action becomes document content.
- **Transfer (0.9.702).** `AvatarInventoryTransferPeerExchange` moves an entry between connected avatars
  (`docs/Protocol.md`, "Avatar Inventory Transfer"). It is reachable from the session API only; there is no UI yet.

## World Residents

    core/WorldResident.js         World content: { id, worldId, authorIdentityId, position (home) }
            │  (loaded Worlds, homes lifted by each World's position)
    application/world/ResidentRuntime.js ── obstacles per home: AvatarMovementConstraint#obstaclesNear()
            │                                (bricks an avatar on the ground bumps into) + tree trunks,
            │                                gathered again every 2 s, one resident at a time
    core/ResidentMotion.js#residentPoseAt(resident, time, { isClear })
            │                     isClear = core/ResidentPath.js#isResidentWalkClear()
            ├── WorldNavigationSession._setupResidentRendering() → facade.syncResidents(poses)
            │      → renderer/ResidentFieldRenderer.js (one AvatarVisual each, at most 16, nearest first)
            └── AvatarResidentConstraint (last in AvatarMovementController's pipeline)

- **Content.** A resident is added and removed by `CreateWorldResidentCommand` / `RemoveWorldResidentCommand`
  (`R`, or the Avatar panel's Residents button; `application/worldNavigation/residentMethods.js`), so it is undoable,
  saved, published and forked with its World. `World#toJSON()` writes `residents` only when there is one, so a World
  without residents serializes exactly as before. A new resident's id is chosen so that it is standing at the
  avatar's feet at that moment (`ResidentRuntime#newResidentIdNear()`).
- **Motion.** Sampled from time like a wild animal's (16 s pause-then-walk segments, 1.1 m/s, within 6 m of home),
  keyed by id. A waypoint is kept only if the walk from home to it is clear; a walk between waypoints goes straight
  if clear and by way of home otherwise, turning in place there. `isClear` checks brick footprints (grown by the
  resident's 0.3 radius), tree trunks, lakes, rivers and slope. The session's `wildlifeClock` is the one clock.
- **Rendering.** Each resident is an ordinary `AvatarVisual` dressed by `core/ResidentAppearance.js` (template
  `humanoid-01`, options and an earthy palette picked from the id), kept apart from `remoteAvatarVisuals`: never
  picked, listed or hidden as a player. Its feet use the same `withGroundElevation()` as the avatar's; its walking
  legs advance with the ground it covered. `renderer/ResidentReaction.js#residentFacingFor()` turns a settled
  resident to face the local avatar within 6 (fading out toward its back), and the field renderer waves once per
  approach within 3.5.
- **Talking.** `T` (or a Talk button) calls `WorldNavigationSession#talkToNearestResident()`:
  `application/world/ResidentSurroundings.js#gatherResidentFacts()` collects what this replica knows around the
  resident — deterministic vehicles minus those `VehicleRuntimeInstances` excludes (stored), at their runtime
  positions, minus the ridden one (150 m); wild animals at the session clock minus caught ones, plus released ones
  (100 m); loaded Worlds' landmarks (1 km); structures placed in loaded Worlds (300 m), named by the document they
  place — a known publication's title and author, else this device's saved title, else not at all
  (`_residentStructureName()`); present collaborators by their shown name (500 m); other builds from
  `searchWorldByLocation()` excluding the resident's own World and its parent (5 km); the innermost region it stands
  in. `core/ResidentTalk.js#composeResidentRemarks()` turns them into one nearby sentence (kinds take turns, then
  each kind's next-nearest) and one build sentence, with rounded distances, compass words and sanitized plain-text
  titles and names. A per-resident turn counter makes each conversation move on. The facade's
  `showResidentSpeech()` puts a canvas-text sprite over the resident (`renderer/ResidentSpeechBubble.js`), gone
  after 5–14 s or beyond 8 m; the UI also announces the words through an `aria-live` region. Nothing is stored or
  sent: what a resident says is local to the viewer.
- **Focus.** `pickResidentRemarkFacts()` exposes which facts were spoken; `focusTargetsFor()` turns the ones that
  stay put (vehicles, landmarks, structures, builds) into `{ label, position }`, carried in `lastResidentSpeech()`
  with `spokenAt` and `seconds` (`speechSecondsFor()`, shared with the bubble). `ui/components/ResidentSpeechActions.js`
  shows a Focus button per target while that speech is current and the viewer is beside the resident;
  `focusResidentMention(index)` calls the camera-only `focusPosition()` at the ground there.

## Terrain layers

`renderer/Renderer.js` runs four `TerrainStreamingController`s: terrain, vegetation, water and wildlife. Each is a
pure function of `(seed, x, z)`:

- `TerrainHeightField`: how high
- `TerrainSurface`: what it looks like
- `TerrainEcology`: which zone
- `Hydrology`: lakes and river color
- `NaturalFeatureField`: trees, with CONIFER, BROADLEAF or SCRUB chosen by moisture
- `WildlifeField`: animals, where they were placed (`WildlifeMotion` adds time: where they have wandered to)

None of it is stored, so a tile that streams out and back in is identical. An unloaded tile is disposed through the
`disposeTile` hook its controller was built with (`renderer/TileDisposal.js`): terrain and water tiles free their own
geometry and material, vegetation and wildlife tiles only their instance buffers, since their geometry and materials
are shared by every tile.

## Sound

    core/AmbientSoundscape.js#ambientMixAt(seed, x, z)   level 0..1 per layer: wind, birds, insects, water, stream,
            │                                             leaves, pines
            │  (ecologyZoneAt() and isRiverAt() underfoot, on a ring at 12 m and one at 30 m)
    core/AvatarSoundCues.js#advanceAvatarSound()         per frame: footstep / jump / land cues, engine { vehicleType, load }
            │  (from WorldNavigationSession#avatarSoundObservation(): position, animation, verticalState, vehicleType)
    application/world/WorldSoundscapeService.js          samples 4×/s at the avatar (else the camera); cues and engine
            │                                             every render frame (onRenderFrame()); mute/volume
            │                                             ↔ SoundSettingsStore ('sound-settings', core/SoundSettings.js)
    core/CreatureSoundCues.js#advanceCreatureSound()     10×/s: animal calls and steps, catch/release, resident
            │  greet, speech and steps, each with { gain, pan } (soundObservationMethods.js#creatureSoundObservation())
    audio/WebAudioSoundscapeProvider.js                  Web Audio graph: ambient layers, then an effects bus for
            ├── audio/AvatarSoundSynth.js                  footsteps per surface, jump whoosh, landing thud
            ├── audio/VehicleEngineVoice.js                one held voice per ridden vehicle type
            ├── audio/CreatureSoundSynth.js                animal and resident sounds, through a gain and stereo pan
            └── audio/EditorSoundSynth.js                  the Editor's edit sounds

    Editor: EditorSession#onCommandActivity() → core/EditorSoundCues.js#editorSoundCueFor()
            → application/editor/EditorSoundService.js → WebAudioSoundscapeProvider({ ambience: false })

- **Mix.** Each ecology zone contributes a fixed level to each layer (forest: birds, sheltered from wind; highland
  and rock: wind; field and grassland: insects; lake: lapping water, faintly at a beach; river: running water). The
  spot underfoot weighs 0.4, the near ring 0.4 and the far ring 0.2, so a lake or forest is heard before it is
  reached. LEAVES and PINES come from the trees themselves: every tree `naturalFeaturesInRegion()` puts within 20 m
  adds its nearness (1 − distance / 20) over 6 to its layer, BROADLEAF fully and SCRUB at 0.4 to LEAVES, CONIFER to
  PINES. Like the terrain it is a pure function of place: nothing is stored or sent, and every viewer at a spot
  hears the same land.
- **Service.** `WorldView` makes one through the `createWorldSoundscape` factory `ui/main.js` provides
  (`ui/views/worldView/useWorldSoundscape.js`), after `session.start()`, and disposes it on unmount. It resamples
  only when the listener has moved at least 0.5 m, and plays silence while there is no listener position. `unlock()`
  is called from every pointerdown and keydown, because browsers only let audio start (and iOS only lets it resume)
  from a user gesture. `M` and the Sound button (`ui/components/SoundControl.js`) toggle mute; the preference is
  this device's own.
- **Provider.** Every sound is synthesized, so there are no audio files and the Content Security Policy is
  unchanged: looping brown noise through a gusting low-pass for wind and slow waves for a lake, band-passed white
  noise for a river, a trilled 4.4 kHz tone for insects, and separate randomly timed chirp phrases for birds, more
  often the more birds there are. Level changes fade with a 0.8 s time constant. The `AudioContext` is created on the
  first `resume()`, and suspended while muted or while the page is hidden, so it costs nothing then.
- **Avatar sounds.** `advanceAvatarSound(state, observation, deltaSeconds, seed)` is pure; the service keeps its
  state between frames. Footsteps are counted by distance, one per stride (0.75 m walking, 0.94 m running: one per
  leg swing of `core/AvatarPoseOffsets.js`'s 2 Hz and 3.2 Hz gaits at 3 and 6 m/s), so pushing against a wall is
  silent, and a move over 10 m in one frame (a teleport) makes none. Only a grounded, walking or running, on-foot
  avatar steps. `footstepSurfaceAt()` picks the surface: STRUCTURE when the avatar's simulated Y is above 0.05 (it
  stands on bricks), else WATER in a lake or on a river, SAND on a beach, STONE on rock or highland, LEAVES in a
  forest, GRASS otherwise. JUMP is SUPPORTED → RISING; LAND is a return to SUPPORTED after at least 0.15 s in the air
  (a stair step-down is shorter), its intensity growing to 1 over a 1 s fall. Riding, the engine's `load` is the
  vehicle's speed from frame to frame over its capability's top speed. The service only resends an engine when its
  type changes or its load moves by 0.02. MOUNT and DISMOUNT (with the vehicle type) are the ridden type changing,
  never on the first frame, so already riding when sound starts is silent; BRAKE is the observation's `braking`
  (`movementState().brakingRequested`) turning on at a load of at least 0.15, its intensity that load
  (`audio/VehicleEventSynth.js`).
- **Effects.** Cues are dropped unless the context is running, so a suspended (muted, hidden) context never plays a
  backlog on resume. A footstep is a filtered burst of the shared white noise, randomized ±10% in pitch and ±15% in
  level, with a second crunch for leaves, a splash sweep for water and a low knock for bricks. Engines are
  oscillator partials and filtered noise whose pitch, brightness and gain follow `load` with a 0.15 s time constant;
  a bicycle is only tyre hiss chopped by a freewheel tick, silent at a standstill; a drone hums even hovering.
  Short-lived nodes disconnect themselves when they end.
- **Creatures.** `WorldNavigationSession#creatureSoundObservation()` (`application/worldNavigation/
  soundObservationMethods.js`) reads the listener (`soundListener()`: the avatar, else the camera, and the camera's
  horizontal viewing direction), the animals within 30 m (wild ones posed at the session's `wildlifeClock` minus
  caught ones, released ones and decorations with `stationaryAnimalPoseAt()`), the animals carried, the residents
  within 30 m and `lastResidentSpeech()`. `advanceCreatureSound()` is pure. An animal calls when its `idleAction`
  turns ALERT (so every replica hears the same deer look up at the same moment) and, `startled`, when the listener
  first comes within its look radius (deer 8, rabbits 5, `renderer/AnimalReaction.js`), rearmed at twice that; it
  steps each time its `gaitPhase` passes a whole stride, within 12 m. A carried animal that appears is a CATCH, one
  that goes a RELEASE. A standing resident greets once within 3.5 m, rearmed beyond 7 m
  (`renderer/ResidentReaction.js`); a new `spokenAt` is heard as speech, 3 to 14 syllables by word count, within
  15 m; a walking one steps every 0.7 m. Nothing already true when sound starts is played. `placeSound()` fades each
  cue by distance (full within 2 m, squared falloff to its range) and pans it by its bearing against the camera's
  right (`(-forward.z, forward.x)`). Each resident's voice (110–230 Hz and its vowels' jitter) comes from a hash of
  its id. The service samples creatures on render frames every 0.1 s.
- **Editor.** `EditorSession#onCommandActivity(listener)` reports executed, undone and redone commands, whichever
  document is open, as `{ type, children }`; a collaborator's operation, applied through
  `_remoteApplyingHistory()` (a proxy of the CommandHistory whose `execute()` sets a flag), is left out.
  `editorSoundCueFor()` maps every registered command type to a cue, a composite to its first child that has one,
  and undo and redo to their own. `EditorSoundService` plays them, plus a chord on Save (the Toolbar's `saved`
  event and Ctrl+S), on a provider built with `ambience: false`: no layers, no birds, only cues.
  `application/settings/SoundPreference.js` applies and saves mute and volume for both services, and
  `ui/composables/useSoundControls.js` gives both views the Sound button, `M` and the gesture unlock.
- **World View edits.** `WorldNavigationSession#onCommandActivity(listener)` reports the same for each World's
  CommandHistory (`_registerCommandHistory()` subscribes, `_unregisterCommandHistory()` and `dispose()`
  unsubscribe), and `WorldSoundscapeService` plays the cue through `provider.playEditorCue()`. A collaborator's World
  operation is executed straight against the document by `WorldCommandPropagationUseCase`, never through these
  histories, so it is never heard. `application/commands/describeCommand.js` gives both sessions the
  `{ type, children }` shape.
- **Other players.** `remoteAvatarsForSound()` reads each remote avatar where it is drawn now
  (`RemoteAvatarRegistry#currentPresence()`, the interpolated presence the renderer uses), within 40 m, and none
  while `setRemoteAvatarsVisible(false)` hides them. `advanceCreatureSound()` runs each through the local avatar's own
  `advanceAvatarSound()` (its own state per avatar id), with the JUMPING animation standing for RISING because
  presence carries no vertical state, and the vehicle from `remoteAvatarVehicle()` (the riding message); the
  resulting footstep, jump, land, mount and dismount cues become PLAYER_FOOTSTEP/JUMP/LAND/MOUNT/DISMOUNT, footsteps
  at 0.8 of their intensity, placed within 20 m. Riders are read within 40 m (`RIDER_RANGE`): their speed, smoothed
  over about 0.4 s because interpolated positions stall between updates, drives an engine load, and a fall to half
  of its recent peak (which sinks 0.5 of top speed a second) from at least 0.45 is heard as PLAYER_BRAKE, since
  braking isn't sent. `advanceCreatureSound()` returns the nearest three (`MAX_RIDER_ENGINES`) as `engines`, placed
  like cues, and `WorldSoundscapeService` hands them to `provider.setRemoteEngines()`, which keeps one
  VehicleEngineVoice per rider id behind its own gain and PannerNode (or stereo panner), gliding loudness and place
  between the ten-a-second updates, and fades out a rider left out of the list.
- **3D.** Every placed cue carries `position` (`{ x, y, z }`, heights where things are drawn: terrain plus the
  presence's own `y`, or just that `y` for a rider, animals 0.5 m and residents 1.5 m up). With `spatial` on (`core/SoundSettings.js`, default
  true, the World View **3D**/**Stereo** button), the provider places it with a PannerNode (`panningModel` HRTF,
  `rolloffFactor` 0, since the cue's own gain already fades with distance); otherwise, or without a position, with
  the stereo `pan`. `WorldNavigationSession#soundListenerPose()` gives the AudioListener, set every render frame:
  the avatar's ears (drawn ground plus `y` plus 1.6 m; a rider's position already includes the ground), else the
  camera, facing the camera's full direction with up made perpendicular to it. The deprecated
  `setPosition()`/`setOrientation()` are used where AudioParams are missing (older Safari).
- **Not yet.** Vehicles other people ride (presence doesn't say who is riding what), and a player's landing
  weight (their vertical speed isn't sent).

## Collaboration

Several people can edit one World at the same time. The live design
(0.2.95–0.2.99) sends commands, never documents:

- WorldAuthorizationService decides, on every mutation attempt, whether
  this identity may edit this World: by owning it, or through a signed
  grant. Nothing is cached, so a revocation takes effect on the next try.
- WorldMembershipUseCase issues and gossips grants and revocations
  (core/WorldEditAuthorizationEnvelope.js, owner-signed only) over
  `forkbuild:world-membership`.
- WorldCommandPropagationUseCase sends each local command as a
  core/WorldOperationEnvelope.js over `forkbuild:world-sync`, checks the
  sender's authority for that specific World, and applies remote
  operations idempotently. Operations are totally ordered by a Lamport
  clock and operation id (core/LogicalClock.js,
  replication/WorldOperationOrdering.js), never by wall-clock time;
  replication/WorldConflictResolver.js reorders rather than rewrites,
  and delete is terminal. Remote operations never enter the local undo
  stack.
- WorldPresenceUseCase (`forkbuild:world-presence`) says who is online in
  a World, recomputing `canEdit` locally rather than trusting a claim.
  WorldSpatialPresenceUseCase (`forkbuild:world-spatial-presence`) shares
  camera position, heading, selection and activity as ephemeral
  observation, drawn by RemoteSpatialPresenceRenderer. Following another
  person is local camera navigation.
- ui/components/WorldCollaborationRoster.js joins these for
  WorldMembersPanel, WorldPresenceIndicator and WorldCollaboratorIndicator.

The Editor has its own live propagation for the one document it has
open (0.9.222 onward): DocumentCommandPropagationUseCase sends each local
command over `forkbuild:document-sync`, and
RemoteDocumentOperationApplicationUseCase applies authorized remote ones.
Editor documents have no membership grants, so "authorized" means the
owner identity, typically across its own authorized devices. Each
operation names its causal predecessors: a replica that is missing one
notices the gap (DocumentOperationCausalGapObservationUseCase), asks for
it over `forkbuild:document-operation-recovery`
(DocumentOperationRecoveryUseCase), and defers applying later operations
until it arrives (DocumentOperationDeferralUseCase).

The earlier protocol from Collaboration Protocol Foundation (0.2.7) and
Multi-client Synchronization (0.2.9) (collaboration/: CollaborationSession,
DocumentAuthority and the transports, wired by
application/document/CreateCollaborationUseCase.js) still exists but has no callers
in the app; the design notes are in docs/ArchitectureHistory.md.

## Places, landmarks and naming

- **Regions and landmarks** (core/WorldRegion.js, core/WorldLandmark.js,
  core/RegionKind.js) are World content: World View creates, updates and
  removes them with commands at the avatar's position, so they are
  undoable and follow the World's authorization. World Animal
  Decorations follow the same path.
- **Derived structure.** core/WorldCurationContext.js groups content
  near landmarks; core/WorldRegionGeography.js and the
  core/GeographicPlace*.js modules derive geographic places from region
  names. Places are computed views: they highlight existing geometry and
  are navigable, but never become stored objects. WorldLocationDirectory
  lists locations from existing identity data, and WorldFocusContext
  describes what is being looked at.
- **Naming claims.** A name is a claim, not a fact: core/PlaceNamingClaim.js
  is a signed claim, managed by PlaceNamingClaimUseCase, shared by file
  (PlaceNamingClaimExchange) or published and discovered over Nostr or
  Arweave (PlaceNaming*Discovery* and *RuntimeComposition files) with a
  per-region tag. Discovering a claim never adopts it: adopting a nearby
  discovered claim is an explicit action in World View that runs the same
  import path (PlaceNamingClaimExchange#importClaim()) as a manual import
  from PlaceNamingPanel.
- **Personal state.** LocalWorldExperienceStore remembers where you were
  in each World you visited. It is local, never World content, and feeds
  the Recent Worlds page.

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
| Where the bytes go | Arweave, IPFS (Local Kubo), IPFS (Remote Pinning, Experimental), Steem (Experimental, small builds) | `PublicationMaterialUploaderComposition` (Publication material); `SnapshotPlacementStoreRegistry` + `ipfsRemotePublicationCoordinator` (Snapshot) |
| Where it is announced | Nostr (fan-out to every configured relay), Arweave (tagged transaction) or Steem (Experimental; a reply to a monthly discovery thread) | `*RuntimeComposition` `discoveryProvider` for Publication, Snapshot, Place Naming and Commentary; `resolveSnapshotDiscoveryPublisher()` |
| Proof / anchoring (Experimental) | Bitcoin, Arweave, Steem (Bitcoin and Base only through their wallet steps) | `PreferredPublicationAnchorCreationCoordinator` |

The saved preferences live in `RoleProviderPreferenceStore` (`CONTENT`, `ANNOUNCEMENT_AND_DISCOVERY`,
`PROOF_AND_ANCHORING`). They drive the preferred-provider buttons (on the Publications page, "Store on …" and
"Anchor on …" at the top of a card's Distribution roles, and "Use Preferred Provider" under Details → Placements & IPFS),
and they seed every picker's first value through `resolveSavedProviderDefault()`; they never override a choice already
made. The Distribution roles offer that button only for a saved provider they can use
(`preferredDistributionChoice()`), never for a wallet-guided anchor type, and otherwise show every option. The
per-type anchor cards list only `oneClickAnchorTypes()`: the one-click Bitcoin publisher stays registered (the
Proof / Anchoring Provider page offers Bitcoin) but has no wallet and never succeeds, so it gets no card. On the
Publications page, Distribute Snapshot on a World distributes the World's own snapshot (the wrapped Publication's
`contentReference`, not the envelope's) with its publisher's signed placement from `PublisherPlacementClaimLookup`
(`application/placement/PublisherPlacementClaim.js`, the same record World View's `getPublisherPlacementRecord()`
picks), on the substrate chosen on that card. Distribution uses selection,
never fan-out, across substrates. Fan-out happens only across relays within Nostr. Arweave and IPFS gateways use
ordered failover instead, because any gateway can serve the same content-addressed bytes. The Steem choices are
described in docs/Protocol.md's three "Proposed: Steem …" sections, which are built and Experimental.

In the UI, every distribution control sits in `ui/components/WorldDistributionDialog.js` (World Encounters and My
Publication) or `ui/components/EditorDistributionDialog.js` (the Editor's post-publish overlay). One settings block
(Storage, Remote Pinning draft, Announcement/Discovery) feeds both legs. The combined "Distribute" action runs
Snapshot and Publication one after the other, because both may sign through the same wallet extension. Every
injected-wallet adapter (Nostr NIP-07, Arweave, UniSat, EIP-1193, Steem Keychain) has a 120-second approval timeout.

A store may limit how large one item can be (`ContentStore#maxContentBytes`, Infinity unless set). The Arweave stores
take it from the signer's `maxDataBytes`: the injected wallet signs single-chunk transactions, 256 KiB. Snapshot
distribution checks it before anything is signed or uploaded and refuses a larger build with `ContentTooLargeError`,
which tells the user to choose IPFS. IPFS has no limit; its uploads (local node and remote pinning) get one more second
of timeout per 128 KiB (`utils/uploadTimeout.js`).

## Network endpoint configuration

Every user-set endpoint follows one pattern. There is a `core/*Configuration.js` value object, a `storage/*Store.js`
under one key, a `Set*ConfigurationUseCase`, and a settings view built on `ui/composables/useEndpointSettingsForm.js`
(`useRoleProviderPreferenceForm.js` for the three preference pages). `ui/main.js` resolves each value once at
startup and falls back to the deployment default.

The list-shaped settings default to several free public servers, declared next to their value object
(`DEFAULT_ARWEAVE_GATEWAY_URLS`, `DEFAULT_IPFS_GATEWAY_URLS`, `DEFAULT_BITCOIN_ESPLORA_API_URLS`,
`DEFAULT_NOSTR_RELAY_URLS`, `DEFAULT_STEEM_API_NODES`; `DEFAULT_ICE_SERVERS` and `DEFAULT_RENDEZVOUS_URLS` in `peer/`).
The singular `DEFAULT_*_URL` constants are each list's first entry, used by the paths that take one endpoint. A saved
list replaces the defaults; it is never merged with them. Their pages use `ui/composables/useEndpointListSettings.js`:
the textarea starts from the list in effect, Save is disabled while it is unchanged (so the defaults are never saved
as a preference), and Reset to Defaults clears the store. `node scripts/check-network-defaults.mjs` checks that every
default still answers and allows CORS.

| Setting | Route | Store key | Shape |
|---------|-------|-----------|-------|
| Arweave Gateway | `/settings/arweave-gateway` | `arweave-gateway-configuration` | ordered `gatewayUrls`, read failover |
| IPFS Gateway | `/settings/ipfs-gateway` | `ipfs-gateway-configuration` | ordered `gatewayUrls`, read failover (0.9.665/0.9.666) |
| IPFS Node (Kubo API) | on `/settings/content-provider` | `ipfs-node-configuration` | `apiUrl` for the IPFS write path |
| Bitcoin Endpoint (Esplora) | `/settings/bitcoin-esplora` | `bitcoin-esplora-configuration` | ordered `apiUrls` for broadcast, confirmation, funding and proof checks; failover (`anchoring/BitcoinEsploraFailover.js`) |
| Nostr Relays | `/settings/nostr-relay` | `nostr-relay-configuration` | `relayUrls`, one set for every Nostr feature, fan-out |
| STUN / TURN / Rendezvous | `/settings/stun`, `/settings/turn-server`, `/settings/rendezvous` | `ice-server-configuration`, `turn-server-configuration`, `rendezvous-configuration` | as before |
| Content / Announcement / Proof preferences | `/settings/content-provider`, `/settings/announcement-discovery-provider`, `/settings/anchor-provider` | `role-provider-preference:by-role` | one provider key per role |
| Steem | `/settings/steem` | `steem-reading-configuration`, `steem-announcing-configuration` | ordered `apiNodes` (read failover; anchor verification asks the first three), thread accounts and first month to read; this device's Steem account for posting. Reading changes apply on the next load |

Credentials are never stored. The remote-pinning credential is kept only in tab memory
(`IpfsRemotePublishingCredentialMemory`).

## Publication Commentary

    addPublicationCommentaryCommand
      1. PublicationCommentaryStore.add()            local, authoritative
      2. PublicationCommentaryDistributionPeerExchange.announce()   WebRTC, best effort
      3. Nostr (NostrMultiRelayPublicationCommentaryDistribution) OR Arweave OR Steem — one, best effort

    refreshPublicationCommentaryCommand (on open / "Check for new comments")
      Discover...FromNostrUseCase + Discover...FromArweaveUseCase + Discover...FromSteemUseCase
        -> PublicationCommentaryDistributionExchange.importCommentaryEnvelope()   one verifier, one store
        -> PublicationCommentaryRemoteNotificationBridge                          notify the publisher only

`ui/components/PublicationCommentarySection.js` is the Repository's single Commentary component (card and list).
World View's Commentary panels still post only locally.

## Decentralized publications, anchoring and evidence

This is the largest part of the codebase (0.7.x–0.9.x). The sections
above on publication presence, distribution, network settings and
commentary describe what a user drives day to day; this is the map of
the rest.

- **Decentralized publication.** core/DecentralizedPublication.js is a
  signed, protocol-neutral statement that a Publication's bytes can be
  found at a locator, verified by content hash wherever they came from.
  Peers exchange publications and content over `forkbuild:publication`
  and `forkbuild:content` (PublicationPeerExchange, PeerContentExchange,
  PeerContentRetrievalCoordinator). discovery/DecentralizedPublicationDiscoveryProvider.js
  is the one application-wide catalog of verified, admitted publications,
  rebuilt at startup from LocalPublicationCatalog.
- **Snapshots.** A Snapshot placement records where a publication's raw
  content was stored (Arweave, IPFS, local). Its application/ files
  (*SnapshotPlacement*, Materialize*, DecentralizedSnapshotResolver)
  cover creating, announcing, discovering, resolving and explicitly
  materializing Snapshots. content/ holds the stores and
  application/ipfs/IpfsRemotePublicationCoordinator.js the remote-pinning path.
- **World Encounters.** The DecentralizedWorld*/WorldDiscovery*
  application files turn discovered publications and Snapshots into
  encounters shown by ui/components/WorldEncounterCanvas.js.
- **Anchoring.** core/PublicationAnchor.js is a claim that external
  evidence (a Bitcoin OP_RETURN, an Arweave transaction or a Base
  transaction) exists for a publication. anchoring/ and base/ build,
  review, sign, broadcast and observe those transactions; proof verifiers
  check them. Anchors are stored (LocalPublicationAnchorStore/Catalog),
  exchanged over `forkbuild:anchor`, and never treated as authority:
  verification results and observations are dated facts, kept apart from
  the claims (see docs/Principles.md, "External anchoring and chain
  transactions").
- **Evidence, archives and timelines.** Observation histories, archives
  with fingerprints and differences, and lifecycle timelines
  (PublicationObservationArchive*, *TimelineView, *ArchiveView).
- **Achievements, rankings and reconciliation.** Achievement events,
  badges and profiles derived from evidence; leaderboards as a
  presentation of a ranking policy; signed leaderboard claims and their
  reconciliation (the `/leaderboard`, `/publisher-leaderboard`,
  `/reconciliation-*` and `/evidence-export-comparison` routes).
- **Notifications.** core/NotificationEvent.js,
  storage/NotificationEventStore.js, GetRecipientNotificationEventsUseCase
  and ui/components/NotificationHistoryPanel.js, which ui/App.js hosts from
  its header's 🔔 button through application/chat/NotificationHistoryAccess.js
  (composed in ui/main.js). A mounted World View registers its focusWorld()
  so a notification's Explore moves within it. Only persistence is
  claimed: not delivery, seen or read.

The user-facing entry point is the Publications page (`/publications`,
ui/views/DecentralizedPublicationsView.js). docs/Roadmap.md has one entry
per milestone for this area, and docs/Principles.md groups its rules
under "Decentralized publication, content and replicas", "External
anchoring and chain transactions", "Achievements, rankings and
reconciliation" and "Notifications".

## Renderer

renderer/Renderer.js owns the WebGL renderer, scene (SceneManager),
camera (CameraController, OrbitControls-based), lights, grid, the four
terrain TerrainStreamingControllers and the AnimationLoop (see
docs/RendererLifecycle.md). The Editor and World View build it the same
way, through RenderWorldUseCase and RenderWorldViewUseCase.

- WorldRenderer turns domain events into brick instances, one at a
  time, in BrickInstanceRegistry: bricks are not meshes of their own but
  instances of one InstancedMesh per definition and 16-unit cube of
  space (a chunk), so a scene costs one draw call per chunk, and frustum
  culling and raycasting skip whole chunks. Each instance carries its
  transform, its color (instanceColor over one shared white material)
  and a highlight (an `instanceEmissive` attribute the material's shader
  adds to its emissive light); a chunk grows by doubling, and removing a
  brick moves the chunk's last instance into its slot. The registry maps
  brick ids to documents and buildings and answers position, bounds,
  highlight and ray-hit questions for picking, selection and presence.
  Structure placements are still standalone meshes, drawn from their
  resolved documents and tracked in PlacementMeshRegistry.
  BrickRenderer describes a brick (definition, transform, color) and,
  with ThreeBrickFactory, builds standalone meshes for placements,
  previews and thumbnails; ThreeBrickFactory also supplies the geometry
  instances share.
- PickingService answers "what brick is here" (a ray hit on a chunk,
  resolved through the instance id; the hit normal includes the
  instance's rotation) and "where does the ray hit the ground";
  AvatarPickingService does the same for avatars.
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
saved settings, and provides them to the Vue app. The compose functions in
ui/main/ build the larger subsystems (identity and peers, content and
Snapshots, anchoring, World discovery, injected-wallet services, publication
distribution, Snapshot discovery) and return what ui/main.js provides; every
app.provide() call stays in ui/main.js. ui/router/index.js
defines the routes: Home, Editor (`/editor`), Repository, Recent Worlds,
Author, World View (`/world/:documentId`), Live World, Avatar, Identity,
Peers, Chat and Conversations, Publications (`/publications`), the
settings pages under `/settings/…` (including Language), the leaderboard and reconciliation
views, and About. Views reach application/ through injected services;
the composables in ui/composables/ share the settings-form logic
(useEndpointSettingsForm, useEndpointListSettings,
useRoleProviderPreferenceForm) and the narrow-screen layout
(useMediaQuery). A route with `meta: { experimental: true }` gets the
Experimental banner from ui/App.js. A page that is a regular feature with
Experimental parts, like the Publications page, marks those parts itself
with `.experimental-badge` instead; `decentralizedPublications/presentation.js`
lists its Experimental storage types.

Text the app shows goes through ui/i18n/ (see docs/Translating.md).
ui/i18n/i18n.js holds the one Translator (ui/i18n/Translator.js: message
lookup with an English fallback, Intl.PluralRules plural forms, `{name}`
parameters, and Intl number and date formatting); components import t()
from it and expose it to their template. ui/i18n/locales.js lists the
shipped locales and picks one: the saved choice
(LanguageSettingsStore, 'language-settings', core/LanguageSettings.js),
else the browser's languages, else English. ui/boot.js sets it, and the
page's `lang` and `dir`, after opening storage and before importing the
app, so text is in that language from the first render. The locale never
changes while the app runs: the Language page (`/settings/language`)
saves the choice and reloads. The pseudo-locale `en-XA`
(ui/i18n/pseudoLocalize.js) shows English accented and padded, to find
text not yet moved to t(). core/ and application/ never write text for the
screen: they return message descriptors (core/Message.js, a key and its
parameters) and throw UserFacingError (core/UserFacingError.js) for refusals
a person should read, and the UI shows them with t(), displayText() or
errorText(). The Editor action registry, the license, placement, document
status and presence label modules, the passphrase rules, opening a
Publication link, fork-on-edit and the World welcome suggestions work this
way; built-in library items are translated by id (ui/i18n/libraryText.js).
Many components still write English directly and are moved over area by
area.

index.html loads the app as ES modules with no build step. Its import map
resolves `vue`, `vue-router`, `@vue/devtools-api`, `three` and
`three/addons/` to copies in vendor/, which scripts/vendor.mjs makes from
the exact versions pinned in package.json (tests/VendoredLibraries.test.js
fails if vendor/ drifts), so every script comes from the app's own origin.
Vue is the full build because component templates are strings compiled in
the browser. A Content Security Policy in index.html allows scripts only
from the app's origin plus the import map by hash, with `'unsafe-eval'`
for that template compiler; tests/ContentSecurityPolicy.test.js keeps the
hash and the restrictive directives in step. docs/Deployment.md explains
the policy and the headers a host should add.

## Directories without a section of their own

| Directory | What it holds | Where it is explained |
|-----------|---------------|------------------------|
| `anchoring/` | Anchor publishers, evidence views and proof verifiers for Bitcoin (PSBT build/sign/broadcast, confirmation and funding observers, Esplora adapters), Arweave and Base | `docs/Roadmap.md` 0.8.0 onward; `docs/Principles.md` from "External Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)" |
| `base/` | Base (EVM) wallet connection, transaction planning, signing, broadcast and inclusion observation | `docs/Roadmap.md`, the Base milestones from "0.8.90 — Explicit Base Network & Account Observation" through 0.8.101 |
| `content/` | `ContentStore` implementations: local, Arweave, IPFS (Kubo, gateway, remote pinning), Steem (`SteemContentStore`: Snapshots and Signed Claims in a manifest post and up to 20 part posts) and the gateway-failover wrappers | `docs/Roadmap.md` 0.7.0 onward; "Distribution" and "Network endpoint configuration" above |
| `nostr/`, `arweave/` | Injected-wallet signers (NIP-07, Arweave) and the Nostr relay query client | "Distribution: independent choices, one dialog" above |
| `steem/` | The Steem JSON-RPC client (API node failover) and the Steem Keychain broadcaster. The app reads and announces on Steem through `application/steem/` (a discovery thread reader, an announcer that also posts stored content and its parts, a reader and publisher per announcement family, a Resource Credits estimator, and `content/SteemContentStore.js`, composed by `SteemRuntimeComposition.js` in `ui/main/composeWorldDiscovery.js`; `ui/main.js` registers the content store for Snapshot storage, and Publication distribution stores Signed Claims through it; `application/worldEncounter/SteemWorldEncounterMaterialResolver.js` reads Signed Claims back for World discovery); `scripts/steem-threads/` uses the same client and broadcaster to create the threads | `docs/Protocol.md`, "Proposed: Steem Announcement Substrate" and "Proposed: Steem Content Storage" |
| `scripts/steem-threads/` | Operator pages, not part of the app: one creates the monthly Steem discovery threads, and `content-check.html` checks that API nodes return content stored on Steem in full, and that an image can be uploaded to a Steem image host from this site | `docs/Protocol.md`, "Proposed: Steem Announcement Substrate" |
| `server/rendezvous-worker/` | Reference rendezvous server (Cloudflare Worker) for `peer/WebSocketRendezvousTransport.js` | `server/rendezvous-worker/README.md` |
| `utils/` | Small shared helpers (e.g. `sortOptionsByLabel.js`) | `docs/CodingConventions.md` |
