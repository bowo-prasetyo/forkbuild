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

## Bricks, structures and blueprints

docs/BrickLibrary.md, docs/BrickIDs.md and docs/StructureLibrary.md are
the detailed references; in short:

- BrickRegistry (core/) holds brick definitions from core/library/CoreLibrary.js.
  StructureRegistry (core/StructureRegistry.js) holds Structures from
  core/library/VillageLibrary.js. A Structure is only ordinary bricks in
  local coordinates.
- The Editor's Build Library (ui/components/BuildLibraryPanel.js) lists
  both, with previews from application/LibraryPreviewService.js. Clicking
  a structure places a copy of its bricks
  (CopyStructureIntoDocumentUseCase through StructureCompositionTool);
  Fork opens it as a new document.
- A StructurePlacement (core/StructurePlacement.js) places a whole saved
  Document inside another one by reference, resolved fresh by
  application/StructureDocumentResolver.js; placements can be moved,
  rotated, duplicated and removed with their own commands.
- Blueprints: a personal structure library (LocalStructureLibraryStore,
  local to the device), BlueprintPackage export and import, and
  fingerprints, attribution and lineage claims (core/BlueprintFingerprint.js,
  BlueprintAttribution*, BlueprintLineage*) that describe a design without
  becoming part of it.

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

## Documents: save, autosave, publish and fork

A Document moves through three kinds of storage, each with its own
operation (docs/Principles.md, "Save is not Publish"):

| Operation | Use case | Storage key | Nature |
|-----------|----------|-------------|--------|
| Save | SaveDocumentUseCase | `{documentId}`, plus a DocumentManifest revision | the editable copy; overwritten on every save |
| Autosave | AutosaveDocumentUseCase, run by AutosaveScheduler | `recovery:{documentId}` (persistence/LocalRecoveryStore.js) | a recovery checkpoint only; never cleans the dirty flag or publishes |
| Publish | PublishDocumentUseCase → PublisherProvider | `snapshot:{publicationId}`, and a Publication record in `forkbuild-publications` | an immutable snapshot |

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
application/DocumentLifecycleStatus.js from facts that already exist
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
(application/CreateDiscoveryUseCase.js).

- Sorting (core/PublicationSort.js) always falls back to an ordinal
  publicationId tiebreak, so every replica orders the same way.
- Searching descriptions is opt-in, because it loads each candidate's
  document.
- Grouping (core/PublicationGrouping.js) only regroups the current page.
- Pagination is explicit (PublicationPagination.js); there is no
  infinite scroll.
- Previews are derived client state, never part of a Publication.
  PublicationPreview asks application/PreviewService.js for a thumbnail
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

**What the live World View uses.** application/CreateWorldViewUseCase.js
wires:

- LocalSpatialIndexProvider (spatial/) and LocalPlacementRegistry
  (placement/). The registry writes every record through to the index.
- LocalWorldLayoutProvider (world-layout/). It answers "which documents
  are near the camera, and where" from each publication's placement, and
  falls back to a deterministic, id-keyed grid position
  (core/DeterministicGridPlacement.js) for a publication with none.
- PlacePublicationUseCase with GridPlacementStrategy
  (application/InitialPlacementStrategy.js): the automatic first
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
it. identity/Ed25519.js is a self-contained Ed25519/SHA-512
implementation. identity/SigningIdentity.js is a public-key identity
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
- The same verifier checks identity lifecycle records, device
  authorizations, world edit grants, naming claims and the other signed
  records later milestones added.

**Built and tested, not wired into the running app:**

- delegation: core/Delegation.js grants one PLACE or MOVE capability,
  checked by identity/DelegationVerifier.js;
- replica merging (application/CreateReplicationUseCase.js,
  replication/ReplicaMergeService.js and LocalReplicationStore.js).
  ConflictResolver compares two causal stamps (EQUAL, BEFORE, AFTER,
  CONCURRENT), ConflictPolicy picks a deterministic presentation winner
  among concurrent revisions (smallest content hash), and core/ConflictSet.js
  records the competitors without discarding either history;
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
  identity/KeyEncryption.js: PBKDF2-HMAC-SHA512 for the key, a
  SHA-512 counter-mode keystream, and an HMAC tag checked in constant
  time before decrypting, so a wrong passphrase and a tampered record
  fail the same way. VaultTimeoutPolicy bounds how long a vault stays
  unlocked; FailedUnlockTracker adds a time-based lockout after failed
  unlocks (in memory only). Wrong export passphrases count against the
  same lockout.
- **Export, import and recovery.** identity/IdentityExport.js builds a
  JSON package with the encrypted private key; IdentityImport.js
  validates it (including the did:key derivation) before anything is
  decrypted; IdentityRecovery.js runs validate → duplicate check →
  decrypt → verify, and importing an identity the device already has is
  a no-op, never an overwrite.
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
the ICE servers from the STUN and TURN settings (peer/IceServerConfig.js).
Peers find each other through rendezvous (peer/RendezvousDiscoveryProvider.js
over peer/WebSocketRendezvousTransport.js, one per configured rendezvous
URL; the reference server is server/rendezvous-worker/) or through a
manual invitation (peer/PeerInvitation.js with an offer and answer). A
discovered candidate is only a hint; peer/PeerAuthenticationSession.js
runs a challenge–response over the new connection, and a signature is
bound to that one connection. application/PeerSessionManager.js is the
one app-wide owner of connections (listPeers(), importCandidate(),
disconnect(), onIdentityMismatch()), and ConnectedPeerRegistry lists the
authenticated ones.

**Protocols.** Every application protocol shares each connection through
peer/PeerMessageBus.js, which routes by a protocol id
(`forkbuild:chat`, `forkbuild:avatar-presence`, …; the full list is in
docs/Protocol.md, "Wire Formats Not Yet Described Here") and never
interprets the payload. Replay and ordering rules belong to each
protocol, not to the bus.

**Relationships.** Three separate kinds of local state:

- PeerRelationshipUseCase: peers this device chose to remember, by
  identity, with a local alias. Forgetting deletes only the local record.
- FriendRelationshipUseCase: mutual friendship through signed
  REQUEST/ACCEPT/REJECT/CANCEL/UNFRIEND advertisements
  (`forkbuild:friendship`). Friendship needs both sides' consent.
- PeerBlockUseCase: a one-sided, silent block, enforced in both
  directions by this device.

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
  constraint pipeline") and produces new presence. PresenceSyncService
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
- **Camera and movement modes.** core/CameraPerspective.js gives each
  camera perspective an offset from the avatar; it never replaces the
  camera machinery, and the chosen avatar control mode persists locally.
  Step-up, walkable stairs and slopes (core/WalkableSurface.js), jumping
  and falling (core/AvatarVerticalState.js) are height constraints, not
  physics.

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

The earlier protocol from Collaboration Protocol Foundation (0.2.7) and
Multi-client Synchronization (0.2.9) (collaboration/: CollaborationSession,
DocumentAuthority and the transports, wired by
application/CreateCollaborationUseCase.js) still exists but has no callers
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
  application/IpfsRemotePublicationCoordinator.js the remote-pinning path.
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
  and ui/components/NotificationHistoryPanel.js. Only persistence is
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

## Directories without a section of their own

| Directory | What it holds | Where it is explained |
|-----------|---------------|------------------------|
| `anchoring/` | Anchor publishers, evidence views and proof verifiers for Bitcoin (PSBT build/sign/broadcast, confirmation and funding observers, Esplora adapters), Arweave and Base | `docs/Roadmap.md` 0.8.0 onward; `docs/Principles.md` from "External Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)" |
| `base/` | Base (EVM) wallet connection, transaction planning, signing, broadcast and inclusion observation | `docs/Roadmap.md`, the Base milestones from "0.8.90 — Explicit Base Network & Account Observation" through 0.8.101 |
| `content/` | `ContentStore` implementations: local, Arweave, IPFS (Kubo, gateway, remote pinning) and the gateway-failover wrappers | `docs/Roadmap.md` 0.7.0 onward; "Distribution" and "Network endpoint configuration" above |
| `nostr/`, `arweave/` | Injected-wallet signers (NIP-07, Arweave) and the Nostr relay query client | "Distribution: independent choices, one dialog" above |
| `server/rendezvous-worker/` | Reference rendezvous server (Cloudflare Worker) for `peer/WebSocketRendezvousTransport.js` | `server/rendezvous-worker/README.md` |
| `utils/` | Small shared helpers (e.g. `sortOptionsByLabel.js`) | `docs/CodingConventions.md` |
