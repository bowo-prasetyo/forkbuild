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
functions in ui/main/, which it calls in order, and what only some pages
use is built in service groups when the first of those pages opens (see
"UI" below).

**Adapters** sit around the layers: storage/ (StorageProvider and the
local stores), serializer/, publisher/, discovery/, identity/, peer/,
presence/, collaboration/, replication/, placement/, spatial/,
world-layout/, content/ (content stores), anchoring/ (Bitcoin, Arweave
and Base anchoring), base/ (Base/EVM transactions), nostr/ and arweave/
(injected-wallet signers and the relay client), steem/ (the Steem API
client and Keychain broadcaster), blurt/ (the Blurt API client and its
Keychain), audio/ (World View's synthesized sound),
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
    group membership (0.9.644). Export seals the file when the identity
    exporting is the build's author (core/DocumentSeal.js,
    identity/DocumentSealing.js), and DocumentImportPolicy decides whose
    build an import becomes: one's own opens as itself, someone else's as
    the importer's credited copy when its license allows remixes, and is
    refused when it doesn't or its seal doesn't hold. Export All Builds and
    its import (DocumentBundle.js) follow the same rules.
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
  - The guided first build: core/FirstBuildChecklist.js decides which
    of five steps an edit completes (from describeCommand(), which now
    carries a placed brick's definition and position, so a brick off the
    ground is a stack); FirstBuildChecklistTracker
    (application/onboarding/) follows EditorSession#onCommandActivity(), a
    save and a shared link, and keeps progress in FirstBuildChecklistStore
    (`first-build-guide`). ui/components/FirstBuildGuide.js shows it over
    the viewport; the `ui.firstBuildGuide` action brings it back. A device
    with saved documents starts with it hidden.
  - Publishing asks for an identity first: Toolbar's Publish opens
    LoginModal with `purpose="publish"` when no identity is logged in and
    unlocked, then publishes on `signed-in` (or unsigned on `skip`).

## Bricks, structures and blueprints

docs/BrickLibrary.md, docs/BrickIDs.md and docs/StructureLibrary.md are
the detailed references; in short:

- BrickRegistry (core/) holds brick definitions from core/library/CoreLibrary.js.
  StructureRegistry (core/StructureRegistry.js) holds Structures from
  core/library/VillageLibrary.js and core/library/ShowcaseLibrary.js (three
  larger builds, partly made of copies of Village structures). A Structure
  is only ordinary bricks in local coordinates.
- The Editor's Build Library (ui/components/BuildLibraryPanel.js) lists
  both, with previews from application/editor/LibraryPreviewService.js. Clicking
  a structure places a copy of its bricks
  (CopyStructureIntoDocumentUseCase through StructureCompositionTool);
  Fork opens it as a new document.
- Ready-made builds: application/home/FeaturedBuilds.js lists six built-in
  structures (the three showcase ones first). Home, the Repository and My
  Worlds' empty state show them with ui/components/featured/FeaturedBuilds.js
  (a grid on Home, one row elsewhere); each card opens
  `/editor?start=<structure id>`, which the Editor turns into the same Fork
  (EditorSession.forkStructure()). The Editor's New offers them beside an
  empty plot (ui/components/NewDocumentDialog.js). Either way the camera is
  then framed on the whole document (EditorSession.frameDocument(), the
  thumbnail framing from core/PreviewCameraFraming.js), so a large build is
  seen whole. Home's 3D showcase (ui/components/home/HomeShowcase.js,
  renderer/ShowcaseTurntableRenderer.js) and the cards are loaded with
  defineAsyncComponent(), since they bring in Three.js and the brick
  libraries; one thumbnail service serves them all
  (ui/components/featured/featuredLibrary.js).
- Example remix families: core/library/CollectionLibrary.js is a built-in
  structure library (`collection:*`) whose builds are remixes of other
  built-in ones, each its parent's bricks with more added.
  COLLECTION_REMIXED_FROM keeps who came from whom beside the library (a
  Structure stores no parent), and collectionFamilies() turns it into trees.
  ui/components/featured/CollectionFamilies.js shows them in the
  Repository's ready-made shelf and on a challenge week with no entries,
  each name opening `/editor?start=<id>`. They are never Publications.
- The weekly build challenge: core/BuildChallenge.js turns a time into the
  week's challenge (Monday 00:00 UTC to the next, themes taken in turn from
  CHALLENGE_THEMES starting the week of CHALLENGE_EPOCH; weeks before it
  keep the turn of the first eight themes they ran with, so their tags
  stand) and its tag,
  `<theme>-<yyyymmdd>`, so every copy of the app agrees with no server. Each
  theme names a starting structure and a few ideas, and has a twist
  (`challenge.theme.<id>.twist`). Joining (`/editor?challenge=<its Monday>`,
  or the challenge first in the Editor's New) opens an empty plot named
  after the theme, puts the week's tag first in the document's tags
  (withChallengeTag()), which is all that makes a build an entry, and pins
  challengeIdeaStructureIds() at the top of the Build Library's Structures
  (BuildLibraryPanel's `pinnedStructures`) for as long as that plot is
  open; an idea on the challenge page (`/editor?start=<id>&challenge=…`)
  forks that structure instead. From CHALLENGE_EPOCH every fourth week is a
  remix week (CHALLENGE_KIND.REMIX, tag `remix-<yyyymmdd>`, `remixOf` the
  week before; the themes keep their turn round it): its Join goes to its
  page, which lists the week before's entries, and Remix on one opens
  `/editor?fork=<doc>&publication=<id>&challenge=<Monday>`, tagged once the
  copy opens. Some themes belong to a season (`season`, core/Season.js's
  SEASON): a winter cabin, a blossom walk, a summer fair, a harvest store, a
  skating pond and a garden, every fifth theme of CHALLENGE_THEMES from the
  week of 2026-11-16, so one comes round every six or seven weeks, the
  seasons in turn; the world's seasons turn far faster than the weeks, so
  the challenge page only suggests keeping World View in that season
  (`challengeSeasonHint()`). The themes are taken in turn modulo the list's
  length, so a theme that has already run is never moved: themes are added
  or moved only after the week now running, a few weeks ahead, and copies
  from before a change agree with newer ones up to the first week it
  touches. Home shows the week
  (ui/components/challenge/ChallengeCard.js), and ui/views/ChallengeView.js
  (`/challenge`, `/challenge/<Monday>`) lists the entries:
  application/challenge/ChallengeEntries.js takes the Publications the
  Repository knows of whose published snapshot carries the tag
  (PublishedBuildTags.js) or whose id application/challenge/ChallengeEntryLog.js
  logged under it. ChallengeEntryDiscovery.js fills that log when the page
  opens: a RepositoryNetworkDiscovery over Nostr, Arweave, Steem and Blurt
  for `forkbuild-tag:<tag>` (Steem and Blurt answer it from the tags their
  announcement replies and build posts list) (see "Repository and Author views"), whose run now
  also reports the announced ids it already knew. An entry's share text
  names the challenge (ui/components/PublicationShareLink.js).
- Ready-made bricks: application/document/ReadyMadeBricksStore.js keeps, per
  World id on this device, the bricks a build was started with (a structure
  forked, `EditorSession#forkStructure()`, or a copy of a build,
  `noteReadyMadeStart()` after a `?fork=`) and the bricks of Build Library
  structures pasted in (a PasteBricksCommand whose `isLibraryStructure`,
  noted as it executes). core/PlacedBricks.js compares bricks by signature
  (definition, position, turn, tilt, colour), never by id, so a ready-made
  brick moved or recoloured is the builder's own. Publishing reports the
  placed count's range (core/VisitorCount.js, `publish-placed-*`) beside the
  brick range, and core/LaunchTargets.js's gate reads its median
  (`median-placed`).
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
`/view/steem/:author/:permlink`, `/view/blurt/:author/:permlink`,
`/view/ar/:id`, `/view/ipfs/:cid`, ui/views/PublicationLinkView.js), from
a Steem or Blurt post or shared with Share, opens a build for a
first-time visitor: it verifies the Publication's Signed Claim read from Steem, Blurt,
Arweave or IPFS, keeps its build locally,
admits it as World discovery does, and adopts its publisher's signed
placement announced beside the Snapshot
(application/publication/OpenPublicationLink.js). A link-only share
(`/s/:payload`, docs/Protocol.md "Link-only shares") carries the claim and
the build itself and takes the same path with no network; Share offers it,
by way of the rendezvous worker's `/b/<payload>` link preview
(server/rendezvous-worker/buildPreview.js: a title, a picture drawn in the
worker, then on to the app), for a Publication not yet distributed. One sent
to everyone as a build note gets a short link instead, `/n/<publication id>`
(`/n/:noteId` in the app, docs/Protocol.md "Short links"), which names the
note: the worker (server/rendezvous-worker/noteLink.js) and the app
(BuildNoteDiscovery#findLinkOnly()) read it from the relays and open the
newest that checks out; application/buildNotes/FindableBuildsStore.js says
which Publications are on the relays. Either comes with Save picture
(renderer/BuildPicture.js, a 1200 × 630 PNG drawn by
DocumentThumbnailRenderer), Make a video
(ui/components/buildVideo/BuildVideoDialog.js: core/BuildVideo.js plans a
build time-lapse or a turntable, wide or tall, and its end card, title and
description; renderer/BuildVideoRecorder.js draws it into a canvas, with
audio/MusicRecording.js's music when asked, and
records it with MediaRecorder as it plays, on the device, uploading
nothing; a walk-through hands World View the request
(ui/components/buildVideo/walkThroughFilmRequest.js) and opens it at
`/world/<id>?film=walk`, where ui/views/worldView/useWalkThroughFilm.js
waits for the build, application/worldNavigation/walkThroughFilmMethods.js
walks the avatar through core/WalkThroughFilm.js's plan (after a sweep of
the camera round the outside, when asked), from behind it or through its eyes
with a wider lens, with World View's own
movement and its third-person or first-person camera, and renderer/WorldFilmRecorder.js copies
each frame from the renderer's after-render hook (World View drawing at the
video's own size meanwhile, `Renderer#setFrameSize()`), with the soundscape's
recording (audio/WebAudioSoundscapeProvider.js#startCapture())), and Embed, the same payload as an `<iframe>` of
embed.html for other sites' pages. embed.html is a page of its own
(ui/embed/embedBoot.js), not a route: it starts no storage, peers or
relays, checks the payload as opening the link does
(application/publication/sharing/OpenEmbeddedBuild.js), keeps nothing,
and shows the build on a draggable BuildTurntable with a link to
`#/s/<payload>`. The worker's `/oembed` answers with the same `<iframe>`
for sites that embed links themselves. The link's view then shows the build on its
own screen: turning (ui/components/featured/BuildTurntable.js over
renderer/ShowcaseTurntableRenderer.js, its bricks read from the content
store and checked against the signed hash by
application/publication/sharing/ReadSharedBuild.js), with its remix
lineage and count (core/RemixLineage.js, over the Publications the
discovery providers know) and its whole family tree (core/RemixFamily.js,
drawn by ui/components/remix/RemixFamilyTree.js, which the challenge page
also uses, one tree per chain of entries), Edit a Copy (`/editor?fork=` with an
EditorEntryContext of reason `shared_link_edit_copy`) and a walk into
World View. ForkDocumentUseCase reads such a build, which is no document
of this device, from that content store by its Publication's hash when
there is no local document (`executeWhenLoaded()` waits for one still on
disk). Publishing a build with no license first asks its maker whether
others may remix it (ui/components/RemixPermissionDialog.js, from
Toolbar), and saves the answer as its license. Before that, Publish asks
application/publication/SimilarBuildFinder.js for published builds by
other people that look a lot like this one, and when it finds any shows
ui/components/SimilarBuildDialog.js, which points to Edit a Copy; the
builder can publish anyway. The finder reads the Publications the
Repository's discovery providers list, takes each one's bytes from the
publication content store only when they match its signed hash, and
compares bricks with core/BuildSimilarity.js: one point per definition and
position, the two builds lined up over four quarter turns by offsets voted
for by pairs of same-kind bricks, scored as shared over all distinct
bricks. Only the builder's own bricks (core/PlacedBricks.js
`placedBricks()`) count on their side; their own identities' builds, the
whole remix family (every build connected through `parentDocumentId`, not
cut off where core/RemixFamily.js stops drawing), and builds published after
this one's first Publication are left out; it gives up after a time budget,
and nothing is sent or stored. A build's page (PublicationLinkView) asks the
same finder's `findEarlier()` for builds published before it that look like
it and lists them under its family tree
(ui/components/remix/SimilarEarlierBuilds.js): there every brick counts,
the builder is the identity that signed the Publication (and Built with),
whoever is looking, and "before" is the signed `publishedAt`. World View's
About this build shows the same list for the shown build's Publication
(ui/views/worldView/useSimilarEarlierBuilds.js, looked up once per
Publication shown). On both sides of every comparison, bricks that form a
whole ready-made structure from the Build Library are taken out first
(core/BuildSimilarity.js `withoutReadyMade()`: each structure of at least
`MIN_READY_MADE_POINTS` distinct bricks, largest first, lined up as above
and taken while `READY_MADE_COVERAGE` of it is there, every copy of it); the
finder loads the structures with a dynamic import of
CreateStructureRegistryUseCase on first use (`readyMadeStructures`), since
the libraries aren't in the first load. An Explore card for a build this
device published (`isOwnPublication`, provided by ui/main.js) asks
`findLater()`, the builds published after it, and shows their count, opening
the same list (ui/components/remix/OwnLookAlikes.js, mounted by
PublicationCard, which itself stays the same for every build); nobody else's
card is looked up. The
finder answers one look at a time.
It is a hint like core/BlueprintSimilarity.js ("Similarity Is Evidence; It
Never Becomes Lineage"), never a finding of copying. Build here in World View
opens `/editor?plot=<world>&x=&y=&z=`: the Editor starts a new build and
keeps its plot (core/BuildPlot.js, application/plot/BuildPlotStore.js), and
CreatePublisherUseCase hands PublishDocumentUseCase a
BuildPlotPlacementStrategy, so that build's first placement is its plot
rather than a grid spot. Home's Your stamps (core/BuilderStamps.js) are
worked out from this device's own publications, snapshots and plots by
application/stamps/BuilderStampFacts.js. WorldNavigationSession owns its runtime:
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
(storage/IndexedDbStorageBackend.js) that ui/start.js opens before it
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
steemit.com thread Steem, a blurt.blog tag page Blurt, another URL the Arweave
gateway) and the log. The
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
hashing and parsing it several times faster. A table with a tilted brick
adds a `tilts` column (core/BrickOrientation.js holds the orientation
rules: the Euler order renderers use, and `orientedSize()`, which bounds,
collision, walking and stacking ask instead of reading a definition's
height and depth).

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
LocalPublisherProvider also adds the id to publisher/UnpublishedPublicationLog.js,
a per-device list (never a tombstone: nothing is announced) that Repository
network discovery counts as known, so a copy distributed earlier isn't
listed again.
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
a permitted fork's license carries the original attribution
(`License.derivedFrom()`: its builder, title, identity and license).
Changing a remix's license goes through `License.relicense()` in
UpdateDocumentMetadataUseCase and `updateDocumentMetadata()` alike: the
attribution stays, and only a license `License.remixLicenseIds()` allows for
the original's is taken (no CC0 for CC BY, nothing but CC BY-SA for
CC BY-SA, nothing commercial for CC BY-NC) unless the original's builder is
relicensing. World View's fork-on-write asks the same license question and
stamps the same attribution. Forking never creates a
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
- Repository network discovery: when the catalog mounts, it runs
  application/publication/RepositoryNetworkDiscovery.js (composed once in
  ui/main.js, through ui/components/publicationCatalog/useRepositoryNetworkDiscovery.js).
  It reads `searchEnvelopes('forkbuild-publication')` from the Nostr relay
  set, the Arweave GraphQL query, Steem and Blurt, fetches each new record through
  the World Encounter material sources (which read a Signed Claim from Arweave,
  Steem, Blurt or, for `ipfs://`, the configured IPFS gateways, as links do), and admits it to the decentralized
  discovery provider and the World Encounter admission log only when the
  verifier returns VERIFIED and it is exactly the Publication announced.
  Each run checks at most 20 new records; refused records are not fetched
  again; a Publication already listed, or one this device unpublished
  (publisher/UnpublishedPublicationLog.js), is never fetched. Where each record
  was read is kept by NetworkPublicationLocatorStore, and Explore on such a
  card opens that record's link view (`/view/ar|steem|blurt|ipfs/…`), which
  fetches and checks the build before opening World View.
- Build tags announced: the Nostr and Arweave announcement publishers take
  `buildTagsFor(publicationId)` (composed in ui/main/composePublicationDistribution.js,
  reading the snapshot published on this device) and add
  `forkbuild-tag:<tag>` for each, so the builds with one tag can be asked
  for (docs/Protocol.md).
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
#connect() by exact identity. Each successful join() fires onJoined(), on
which AutoConnectKnownPeersUseCase makes one pass over Known Peers, as it
does for Be Discoverable (FindPeerUseCase#onPublished()); renewals and
republishing never fire it, and the pass never reads the lobby listing, so
lobby strangers are never connected without a click. A lobby connection is an ordinary
authenticated peer: publication sync and the announcement index run as for
any peer, and friendship still gates chat and voice. The UI is
ui/components/PublicLobbyPanel.js, on the Peers page and behind World
View's Lobby button.

**Walk here with me.** application/walkTogether/WalkTogether.js brings a
friend into the World on screen through one link (core/WalkTogetherCode.js,
`#/walk/<code>`), so walking together needs neither the Peers page nor a
lobby. The meeting runs on a peer session of its own around a one-off
identity (application/peer/OneOffPeerSession.js, shared with device
pairing): the host's one-off key publishes a standing offer on the
rendezvous servers and republishes as each is taken, so one link serves any
number of guests for 30 minutes; the guest finds it by the key in the link
and accepts only that key. Over that connection the host sends, in parts
(ChunkedPeerTransfer), its name, the World as a link-only payload and an
invitation from the app's own PeerSessionManager; the guest checks and
keeps the World with openPublicationLink, as a `#/s/` link is opened,
accepts the invitation with its own session (expecting the host's
identity), and sends the reply and its name back, which the host applies
with completeConnection(). The result is an ordinary authenticated
connection between the two real identities, so presence, profiles,
gestures and vehicles travel as for any connected peer, under each side's
visibility settings; nobody is remembered or befriended by it, and neither
identity is made discoverable. Only a published, signed World can be walked
together, since that is what a guest can check. World View's
`Walk here with me` button and dialog (ui/views/worldView/useWalkTogether.js,
ui/components/walkTogether/) keep the link while World View is open; the
guest's page is ui/views/WalkTogetherJoinView.js, which asks for a log in
and a Join click before connecting.

**Build with me.** The same meeting (WalkTogether's createBuildHost and
createBuildGuest, `#/build/<code>`, its own protocol) connects a friend to
the Editor's open build instead of a World. application/buildTogether/
BuildTogetherSession.js then works over the ordinary connection it leaves:
the guest's Editor asks for the build (it need not be published), the host
answers only guests who joined through its link, sending the Document and
the ids of the operations it already reflects, and the guest opens it with
EditorSession#openSharedDocument(), which counts those ids as applied so
the operations that follow apply as they arrive. Edits travel as the
Editor's ordinary command protocol (DocumentCommandPropagationUseCase): the
host's replica accepts a guest's operations through `resolveWorldEditGrant`
(asked per operation at the WorldAuthorizationService gate, a session fact
that ends with Stop, another build or leaving the Editor; never stored or
signed), and `shouldRelay` passes each guest's on to the others, since each
guest is connected to the host alone. A guest accepts the host's because the
build's `authorIdentityId` is the host's, checked against the connection.
Presence (pointer and selection) travels on the same protocol and is drawn by
renderer/CoBuilderRenderer.js. While sharing, Undo and Redo become
operations of their own (application/commands/SharedUndoCommands.js:
`UndoOperationCommand`, `RedoOperationCommand`) naming the step they take back
by id: each replica finds that step in its own history (`findOperation` in the
command context) and runs the step's own `undo()` or `execute()`, as the
conflict resolver does, so no new merging is involved. EditorSession keeps the
replica's own steps (made here, `isLocal`) for Undo and Redo to go through,
and who made each operation (`operationAuthor`: the identity the command
protocol proved, noted before applying, or this replica): a step is taken back
only by an Undo from the same author, the host relays nothing else
(`shouldRelay`, EditorSession#acceptsSharedStep()), and one that would change
nothing is skipped on every replica. When the host allows someone new,
BuildTogetherSession resets everyone's own steps (`undo-reset`), since the
newcomer's copy never executed them. CommandHistory#replay() supplies the
lookup among the steps it replays, so the Operation Timeline replays them too. Making two-way editing work needed three
fixes in the Editor's replication: a collaborator's operation applied
through the local history is never broadcast again as this replica's
(`isLocal`), this replica's own operations are recorded in its causal graph
(so a collaborator's next operation, which follows one of ours, is ready
rather than deferred for ever), and the deferral boundary takes a baseline
of operations a shared copy already reflects. The Editor side is
ui/views/editorView/useBuildTogether.js and
ui/components/walkTogether/BuildTogetherStrip.js.

**Credit co-builders.** When the host's command protocol accepts a guest's
operation, BuildTogetherSession#noteEdit() credits that guest on the open
build (DocumentMetadata#creditBuilder(), core/BuiltWith.js: name and
identity, at most 12, never the author), saved with the build.
LocalPublisherProvider copies the credits onto the Publication, signed only
when present, and the rendezvous worker's link preview mirrors the same
signing fields (server/rendezvous-worker/buildPreview.js). DocumentCloneService
keeps them only for a copy by the same author. The share page, the family
tree (core/RemixFamily.js members carry `builtWith`) and the Editor's build
panel name them (ui/components/remix/builtWithText.js).

The host sends the list to its co-builders whenever it changes (`credits`),
and each guest's copy adopts it (DocumentMetadata#adoptBuiltWith()), so every
copy credits everyone, though guests' edits reach each other under the
host's identity. A guest credited there notes the build in
application/buildTogether/HelpedBuildsStore.js (per identity, on the device,
backed up). ui/views/BuilderView.js (`#/builder/<identity>`) is a person's
page by the identity that signs, not the typed name the Repository's author
pages go by: application/buildTogether/builderProfile.js lists the builds
their identity signed and those whose verified author credits them, and
helpedBuilds.js merges those credits with the device's notes for **Builds you
helped make** on My Worlds and your own page. Credited names and a shared
build's author link there (ui/components/remix/BuiltWithNames.js); in the
family tree (ui/components/remix/RemixFamilyTree.js) a member's title links
to its build, its author to their page only when its Publication's signature
verifies, and its credited names to theirs. The list of builds helped make is
kept under the identity a person's devices share, and
application/buildTogether/HelpedBuildsSyncUseCase.js gives it to their other
devices while connected (sibling devices, as DeviceConversationSyncUseCase
decides them).

**A visitor's view.** World View opens without its protocol tools: the
coordinates, Search's Location fields, the Camera · Editing line, Nearby's
Place Names, Claimed Builds and World Encounters, the Own Publication panel,
unloadable Worlds and the avatar diagnostics render only while `advanced` is
on in ui/views/WorldView.js. The choice is a per-device setting,
application/settings/WorldViewDetailStore.js, provided as
`worldViewDetailStore`; without one (an embed, a test) World View is a
visitor's view. The automatic Snapshot cascade, place-name discovery and
the claimed-build ghosts run either way; the World Encounters canvas, which
does its own discovery, runs only while it is shown, as it already ran only
in Explore mode.

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
    by Publication id. RemixedBuildNotifier, on the same onAdded(), saves a
    `publication.remixed` one when a verified Publication by someone else
    names as its parent a build this device has a Publication of signed by
    the signed-in identity. LookAlikeBuildNotifier, also on onAdded() (from
    ui/main.js, where SimilarBuildFinder is made), saves a
    `publication.looks-like-yours` one, deduplicated by Publication id, when
    a verified Publication by someone else, unblocked and not built with
    them, looks a lot like one of the signed-in identity's own published
    before it (`SimilarBuildFinder#findEarlier(publication, { by })`, its
    family left out), verifiably signed by them; one comparison at a time.
    A Publication admitted before its bytes (`SimilarBuildFinder#canCompare()`
    false: Explore's network discovery admits signed records and fetches
    builds later) waits in memory by content hash, at most
    `MAX_BUILDS_WAITING_FOR_BYTES`, oldest let go first, and is compared when
    one of the two ways incoming bytes are stored reports them, after
    verification: StoreSnapshotContentUseCase (`onStored()`; networks, shared
    links, build notes, placements, transfer packages) or PeerContentExchange
    (`onContentReceived()`; a connected peer's answer), both wired in
    ui/main.js; bytes still unreadable then let it go.
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
- **A guest.** With nobody logged in, CreateWorldViewUseCase's
  `localAvatarWiring()` builds a guest's avatar instead
  (application/avatar/GuestAvatar.js): a GuestAvatarProfileUseCase holding
  the default look in memory, and visibility policies that never advertise,
  so its presence, profile, gestures and ride reach nobody. It walks like
  any avatar but makes no signed change to a World (residents,
  decorations). When someone logs in or out while World View is open,
  ui/views/worldView/useLocalAvatarOwner.js calls
  `WorldNavigationSession#adoptLocalAvatar()` with a new wiring built where
  the avatar stands; the peer channels read whichever wiring is current.
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
  vehicle under the rider, facing the rider's own facing (a rider always
  faces its vehicle, see AvatarVehicleMovementController); the rider isn't
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

`application/avatar/AvatarMovementController.js` runs the simulated move through up to seven optional constraints, in
this order. Each is a separate class, and each can be left out:

    simulateAvatarMovement()        speed x run multiplier x water speed factor
      -> AvatarMovementConstraint   bricks of loaded Buildings and StructurePlacements
      -> AvatarTerrainConstraint    slope (not while swimming)
      -> AvatarStepConstraint       step-up / walkable surfaces; ignores bricks whose base is out of reach (not while swimming)
      -> AvatarTreeConstraint       slide around trunks
      -> AvatarWildlifeConstraint   slide around deer/rabbits
      -> AvatarResidentConstraint   slide around World Residents

The brick constraints ask core/BrickPassage.js what each brick collides as: one box (`brickAabb()`) for nearly
every brick, nothing for a standing door, and for a standing arch its jambs and a lintel stepped down to follow the
opening (`ARCH_OPENINGS`, which renderer/ThreeBrickFactory.js draws the arch with too). Over a doorway or an arch's
opening, `AvatarStepConstraint` takes a top out of a step's reach as a roof, not as ground to climb, so the avatar
stands on the passage's floor (`passageFloorAt()`). Tilted, a door or an arch is one box again. In World View, doors
swing open away from whoever walks up and shut behind them (core/DoorSwing.js; renderer/DoorSwingAnimator.js through
`WorldRenderer#animateDoors()`, fed every frame with where the local avatar, the remote avatars and the residents are
drawn). The swing is drawing only: the build still holds a shut door, and the Editor never swings one.

**Arriving at a build's door** (Walk inside it, after Publish): the Editor opens `/world/:id?arrive=door`, and
World View calls `arriveAtEntrance()` (application/worldNavigation/arrivalMethods.js) instead of a plain
`navigateToDocument()`. core/BuildEntrance.js picks the spot: the build's ground-level doors and doorway arches,
each with outside found by flooding a plan of where an avatar can stand (doorways shut) from its edge, and room to
stand on both sides of it; a door that leads in wins over a free-standing arch. The avatar is put a few steps in
front of it, facing it, and the camera behind them; a build with no way in is arrived at from its -z side. An arrival
asked for before the document is loaded finishes in `_loadWorld()`, it skips the automatic Welcome panel, and its
framing wins over the World's remembered camera. `arrivalState()` says when the avatar has gone in
(`hasWalkedInside()`: past the doorway and within the build), which ui/views/worldView/useArrival.js turns into the
guided first build's last step (core/FirstBuildChecklist.js), on World View's existing 100 ms presence tick.

`AvatarWaterConstraint` is not a step in that chain. It supplies water to the controller: the depth that slows wading
(`core/AvatarWaterWalkability.js`), in a lake or the sea or in a river's bed (`core/RiverFlow.js#riverWaterDepthAt()`,
never deep enough to swim), and where the surface of standing water lies in the presence frame. On foot, water deeper than half
the avatar's height over whatever it would stand on (`core/AvatarSwimming.js#isSwimmableDepth()`) makes the avatar
swim: the simulation still steers and moves it, at `SWIM_SPEED_FACTOR`, but its height comes from
`stepSwimFeetHeight()` (Space rises, C dives, otherwise it drifts up) between the bed and the floating height, carried
from column to column at a constant world height. Breath (`stepAvatarBreath()`, 150 s) drains while the mouth is under
water; at zero the avatar is pushed up and held at the surface until its breath is full. Swim mode and breath are
transient controller state, read through `swimState()`; none of it is in `AvatarPresence`.

`WorldNavigationSession#_setupLocalAvatar()` builds all six. Placed `StructurePlacement`s collide because the
brick constraints take the session's `structureResolver`. Documents farther than `MAX_DOCUMENT_SPAN_MARGIN` (200) are
culled before any brick test.

`AvatarPresence.position.y` is measured from the terrain under the avatar: 0 is standing on the ground (or the lake
or sea bed), and step height, jumping, gravity and swimming move it from there. The terrain height is added only
when rendering, in `RenderWorldViewUseCase#resolveAvatarRenderPosition()`, and when framing a camera perspective
(`avatarPresenceMethods#_applyCameraPerspectiveFraming()`), so a first-person eye sits at the real head height,
including just above the water while swimming. The exception is a rider on a movable vehicle: the vehicle's position
already includes real terrain height, so neither the vehicle nor the rider is lifted a second time. Residents and
released animals use `withGroundElevation()`, which also floors them at the lake surface beyond wading depth.

Swimming is derived, not sent: `deriveAvatarSwimMode()` answers NONE, SURFACE or DIVING from a position and the water
surface above its column, so `RenderWorldViewUseCase` poses local and remote avatars alike
(`AvatarVisual#setSwimMode()`, swim poses in `core/AvatarPoseOffsets.js`) and `core/AvatarSoundCues.js` splashes at the
surface and stays silent under water. Presence keeps its existing `animation` values.

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
  Drone altitude comes from `core/AvatarDroneVerticalState.js`, measured from the water surface over water
  (`core/VehicleWaterline.js#droneFloorHeight()`), and `AvatarVehicleInteractionController` refuses to dismount a
  drone in mid-air; getting off one on the water leaves the avatar floating. Wheeled vehicles stop at the waterline
  (`application/avatar/VehicleWaterConstraint.js`, `VEHICLE_MAX_WATER_DEPTH`), and can't be deployed in water.
  Ground vehicles climb bricks with their own `AvatarStepConstraint` (the avatar's, without the ice), so they drive up
  ramps and across bridges; the water depth is measured from the deck they stand on. A vehicle's position is a world
  height and bricks are measured from the ground under it, so the controller converts between the two around the step;
  getting off on a deck, and putting a vehicle down on one, convert the same way.
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
- **Wishes, and what came of them.** On a wish turn (`isWishTurn()`), `core/ResidentWish.js#residentWishNear()` names
  what the ground nearby lacks, with a Build there. Once a build, a structure or a loaded World stands within
  `WISH_CLEAR_RADIUS` of the spot it would wish for, `residentWishFulfilledNear()` finds it instead and the resident
  says so as a fact (`phraseWishFulfilled()`, by the build's title when it has one, with a Focus on it). Nothing is
  kept, counted or rewarded.

## Terrain layers

`renderer/Renderer.js` runs five `TerrainStreamingController`s: terrain, vegetation, water, underwater life and
wildlife. Each is a pure function of `(seed, x, z)`:

- `TerrainHeightField`: how high. `terrainHeightAt()` is the ground as it lies, with river beds cut into it
  (`core/RiverBed.js`, handed the land so it imports neither: a bowl along `core/RiverChannel.js`'s channels, stepped
  cascades down the steepest of them, and a pool where a channel meets highland); `baseTerrainHeightAt()` is the land
  before the beds, which everything below classifies by, so a bed's banks never read as rock nor its floor as a lake
- `TerrainSurface`: what it looks like
- `TerrainEcology`: which zone
- `Hydrology`: lakes and rivers; `RiverFlow`: a river's current, rapids, and the water in its bed
- `NaturalFeatureField`: trees, with CONIFER, BROADLEAF or SCRUB chosen by moisture; `TreeForm` is what each species
  looks like (below)
- `WildlifeField`: animals, where they were placed (`WildlifeMotion` adds time: where they have wandered to)
- `UnderwaterLifeField`: seaweed rooted on lake and sea beds, and fish schools circling where the water is deep over
  their whole circle (`fishPoseAt()` adds time)

Each frame the renderer also asks `core/UnderwaterView.js` whether the camera is under a lake or the sea, and if so
swaps the sky for a blue-green background and fog, until it surfaces into whatever sky day and night has made. Water tiles carry a back-face-only underside, so a diver looking
up sees a bright surface.

None of it is stored, so a tile that streams out and back in is identical. An unloaded tile is disposed through the
`disposeTile` hook its controller was built with (`renderer/TileDisposal.js`): terrain and water tiles free their own
geometry and material, vegetation, wildlife and underwater life tiles only their instance buffers, since their
geometry and materials are shared by every tile.

## Day and night

    core/DayCycle.js#skyLookAt(seconds)            the sky's look: background, hemisphere sky/ground color and
            │                                       intensity, sun (moon) color and intensity, glow 0..1
            │  (WorldNavigationSession's wildlife clock: wall-clock seconds)
    application/worldNavigation/dayCycleMethods.js  every render frame, unless Always day: setSkyLook(look)
            │                                       on the render facade (RenderWorldViewUseCase)
    renderer/Renderer.js#setSkyLook()              lights (renderer/Lights.js#applyLook()), background unless
            │                                       under water, nightGlow uniform for standalone meshes
    renderer/BrickInstanceRegistry.js#setNightGlow()  the instanced bricks' nightGlow uniform

    core/DayCycle.js#skyBodiesAt(seconds)          where the sun and the moon are, and where the light comes from
            │  (same clock; DAY_SKY_BODIES, a still morning sun, while Always day)
    application/worldNavigation/dayCycleMethods.js  every render frame: setSkyBodies(bodies) on the render facade
    renderer/Renderer.js#setSkyBodies()            renderer/SkyBodies.js (made on first call) and
                                                    renderer/Lights.js#setDirection(light, lightStrength)
    application/worldNavigation/dayCycleMethods.js  setShadowsOn(): setShadowsEnabled(on) on the render facade
    renderer/Renderer.js#setShadowsEnabled()       renderer/SunShadows.js, which follows the camera's target each frame

    core/Weather.js#weatherAt(seconds)             cloud cover 0..1, how overcast 0..1, rain 0..1, wetness 0..1,
            │                                       snow 0..1 and snow lying 0..1 (same clock; fair while Always day,
            │                                       over the season's snow); overcastLook() greys skyLookAt()'s look
    application/worldNavigation/dayCycleMethods.js  every render frame: setWeather(weather) on the render facade
    renderer/Renderer.js#setWeather()              renderer/CloudSky.js and renderer/RainFall.js (made on first call),
                                                    placed each frame; the shared rain { value } every water material's
                                                    rings read (renderer/RainRings.js); snow lying on the terrain,
                                                    trees and bricks (renderer/WetSurfaces.js) and snowflakes
                                                    (renderer/SeasonDrift.js)

    core/Season.js#seasonLookAt(seconds)           the season and the land's look: leaves, blossom, autumn, fruit,
            │                                       flowers, grass and field colours, leaves and petals drifting
            │  (same clock; the middle of a kept season, application/settings/WorldViewSeasonStore.js)
    application/worldNavigation/dayCycleMethods.js  every render frame: setSeason(look) on the render facade
    renderer/Renderer.js#setSeason()               renderer/SeasonalSurfaces.js' uniforms, shared by the terrain and
                                                    the trees; leaves and petals drifting (renderer/SeasonDrift.js)

World View's sky turns once every `DAY_CYCLE_SECONDS` (40 minutes): dawn, about half the cycle in day, dusk, a
little over a fifth in full night, dawn again, each look blending into the next. It is worked out from the wall
clock, the same clock wildlife wanders by, so everyone at a build sees the same sky with nothing sent or stored. A
look is a frozen object, and while the sky holds the same object comes back, so `setSkyLook()` does nothing on
those frames. NIGHT keeps a moonlit hemisphere and moon (0.6 and 0.5, against day's 1.0 and 1.8): builds stay
readable. Only World View follows the clock: the Editor, thumbnails, the Home turntable and link previews stay in
DAY, which is what `Renderer` starts with.

**The sun and the moon.** Both cross the sky from east to west on one arc leaning 50° south of overhead, by the
compass World View shows (core/CompassHeading.js: North is +z, so East is -x, South -z, West +x), so neither climbs
above 40°. The camera's view is 60° tall, so it sees at most about 30° above the horizon looking level (First
Person) and about 15° in Third Person, which looks down at the avatar: there the sun is in view only for its first
and last few minutes, near the horizon. The sun is up from just before dawn until it sets in the dusk
(-0.02 to 0.70 of the day), the moon from late in the dusk until just after dawn (0.64 to 1.02); while both are up,
the light's direction sweeps steadily back along the arc, overhead in the south, from the one setting to the one
rising, and it never comes from lower than about 14.5°, so builds aren't lit from beneath. The scene has no shadows,
so moving the light costs nothing. `renderer/SkyBodies.js` draws each as an unlit, fog-free disc (the sun with a
soft halo, orange near the horizon) at 0.8 of the camera's far plane in its direction from the camera, facing the
camera and placed again every frame, so it hangs in the sky however far you walk; builds and hills in front cover
it, and under water neither shows. Always day (and no clock) is `DAY_SKY_BODIES`, the sun standing still partway
through the morning, low in the south-east. A renderer never given sky bodies (the Editor, thumbnails) draws neither
and keeps renderer/Lights.js's fixed daytime direction, the one it always had.

**The moon's phases.** The moon goes from new to full and back in `MOON_CYCLE_DAYS` (8) of World View's days, one
of the eight `MOON_PHASES` a night (new, waxing crescent, first quarter, waxing gibbous, full, waning gibbous, third
quarter, waning crescent), each with its phase angle (0 new, pi full) and the share of its disc lit,
(1 - cos angle) / 2. `moonPhaseAt(seconds)` works the night out from the clock alone, from the same day fraction the
moon's arc is, so the phase turns on the frame the moon rises and never while it is up. The moon still crosses the
whole night whatever its phase, unlike the real one (up by day around new moon): the night has to stay moonlit, so
only how it looks and lights changes. `skyBodiesAt()` carries the night's `moonPhase` and `moonLitFrom`, the
direction its light falls on the moon from: where the sun would stand for that phase, the phase angle further west
along the same arc, so a waxing moon is lit on its western side and a waning one on its east (the real sun, set or
rising, stands elsewhere; only in the few minutes both are up at dusk and dawn could the two be compared).
`renderer/SkyBodies.js` faces the moon's disc straight at the viewer, upright as the camera is, and shades it with a
small `ShaderMaterial`: each point stands for a point on a ball, lit where it faces `moonLitFrom`, with a soft
terminator, a few soft darker seas and a little limb darkening; the dark side is the sky's colour 7% of the way
towards a pale earthshine (blended as the colours are written), so a new moon is barely there but still hides the
stars behind it, and a faint halo grows with the share lit. `moonlitLook(look, phase)` relights the night: NIGHT is a
half-lit moon's; towards new, the moon's direct light falls to 30% of NIGHT's and all it loses goes to the fill from
above, so the night is exactly as bright, only flatter, with fainter shadows, under a deeper sky; towards full, it
rises to 125%, silver, with a little more fill and a paler sky. It comes in only from dusk's glow (0.6) to night's,
so the sun at dusk and dawn and the whole day are untouched, and the same night gives back the same frozen look.
The session applies it before overcast (`overcastLook(moonlitLook(skyLookAt(now), moonPhaseAt(now)), …)`).
renderer/StarSky.js dims the stars by up to 45% and the Milky Way by up to 75% with the share of the moon lit while
it is up, so a new moon's night shows them as they always were and a full moon's washes them out. Always day has
no moon; the Editor and thumbnails never draw one.

**The stars and the Milky Way.** core/StarField.js makes, from a fixed seed, 1500 stars spread evenly over the sphere
(many faint, few bright, a few blue-white or warm) and 1600 fainter ones crowded in the Milky Way's band, plus the
band's glow as a ribbon round its great circle, all in the sky's own frame. That frame turns once a day
(`skyBodiesAt().skyTurn`, from dawn) round the celestial pole, due north and 50° up, so the celestial equator is the
sun's and the moon's own arc and stars rise in the east and set in the west (`turnSky()`). renderer/StarSky.js draws
the stars as one `Points` and the glow as one ribbon mesh, both `ShaderMaterial`s with additive blending in the opaque
pass at the lowest `renderOrder`, so the sun, the moon, builds and hills drawn after them cover them; a group placed on
the camera every frame at 0.85 of its far plane and turned by the quaternion for `-skyTurn` round the pole. They show
as the look's glow goes from 0.72 to 0.98 (deep dusk to night) and fade the same way at dawn, twinkle by a per-star
phase, thin out towards the horizon, and hide under water and in Always day. Made with the sun and the moon on the
first `setSkyBodies()`, so the Editor and thumbnails never draw them.

**Clouds and overcast.** core/Weather.js cuts the same clock into spells of 8 minutes, each with its own cloud
cover from a hash of its number: about three in five fair (a few clouds, cover 0.06 to 0.22), one in four cloudy
(0.38 to 0.62) and about one in seven overcast (0.88 to 1). Over the last 2 minutes of a spell the cover blends into
the next one's, so clouds gather and clear. It is one weather for the whole world, so everyone at a build, and
everyone walking together, shares it. From cover 0.55 to 0.88 the sky turns overcast, and `overcastLook()` greys the
look `skyLookAt()` gives: the background towards the grey of its own brightness, the fill and sunlight paler, the
sun's (moon's) light dimmed by up to 60% with 30% of what it loses handed to the fill from above, so shadows soften.
The light never drops below a clear NIGHT's moon, so builds stay readable, and lamps don't light up for clouds (the
glow is unchanged). With no overcast the same look comes back; with the same overcast the same blended look too.
renderer/CloudSky.js draws the clouds on the upper half of a sphere round the camera at 0.75 of its far plane, inside
the sun and the moon (0.8) and the stars (0.85), transparent at `renderOrder` -1, so it passes in front of them while
builds, hills and water nearer still cover it. Each pixel follows its own direction up to a layer 180 m up (at least
60 m over the camera) and reads a 256² tiling value-noise texture there twice, at 1600 and 430 m a repeat, drifting
at two speeds by the world's clock (the offsets worked out on the CPU in full precision, as fractions of a repeat).
A cover is turned into the noise threshold above which that share of the sky is cloud, from the mixed noise's own
spread, so cover means what it says; overcast fills the rest into one sheet, still darker where it is thick. The
clouds take their colour from the look: the sky's colour brightened towards its light, more so the brighter the
light (white by day, rosy at dusk and dawn, a dim grey at night). They thin out towards the horizon, never show
below it, hide under water, and aren't drawn at all with no clouds: in Always day, and in the Editor and thumbnails,
which never call `setWeather()`.

**Rain.** About four overcast spells in five rain (`spellRain()`: one spell in eight in all), each at its own
strength from 0.35 to 1. When a spell changes, rain starts over the last quarter of the change, once the clouds have
gathered, and stops over the first quarter, before they clear, so it never rains from a sky that isn't mostly
overcast. renderer/RainFall.js draws 3000 drops as one `LineSegments` of short streaks, each drop's place in a box 36
m across and 24 m tall round the camera, and how far through its fall (14 m a second, slanting a little) it is,
worked out in the vertex shader from the drop's own fixed numbers and the time; a drop's place is wrapped round the
camera, so the rain goes with it anywhere in the world at no extra cost. A drop falls only while its rank (spread
evenly from 0 to 1) is below the rain's strength; the rest are folded behind the far plane. The streaks are the
sky's light paled, fainter at night, thinning at the box's edges, depth-tested but not written, so walls and hills
in front hide them; under water, and dry, nothing is drawn. Under a roof the rain stays outside:
application/worldNavigation/avatarPresenceMethods.js#_setRainShelter() hands the renderer (`setRainShelter()`) the
build the avatar stands in (core/IndoorView.js's `indoorCutaway()`: its footprint, and its `top`, the highest of its
boxes, lifted onto the ground), whatever the camera perspective, only when that changes, and null under open sky or
riding; RainFall folds away every streak any part of which is inside that footprint and below that top, so the room
stays dry while it still rains outside its windows. Other builds' roofs it knows nothing of, but their walls hide
what falls inside them. renderer/RainRings.js is a shader chunk the lakes and sea (renderer/WaterWaveMaterial.js) and rivers
(renderer/RiverFlowMaterial.js) share: the water is cut into 0.8 m cells, in each a drop lands about every 0.9 s
(a little different per cell) at its own place, if a hash of the cell and the drop is below the rain's strength,
and a ring spreads from it to 0.55 m, fading, lightening the water and tilting its light. Each pixel looks at its
cell and the eight round it; the rings fade out from 10 to 28 m away, and at no rain the chunk returns at once. Its
`rain` is one { value } `Renderer` hands every water tile, as it does `waveTime`.

**Storms.** core/Storms.js storms in the heaviest downpours: `storminessAt()` rises from rain 0.75 to 0.9 (about a
third of rainy spells). Time is cut into 30-second slots; in each, a strike may fall within its first 10 s (so
strikes are at least 20 s apart), with a chance of 0.4 times the storminess: one about every 75 s at the height of
a storm. Each strike hashes its distance, which sets its brightness, and how soon (2.5 to 7 s) and how loud its
thunder is. `lightningAt()` is two soft pulses (the second half as bright) within half a second, and
`lightningLook()` lifts the sky's colour 35% of the way and the fill light by up to 0.6 towards a pale blue-white,
never white: dayCycleMethods' `skyLook()` applies it each frame unless Always day is on or the device asks for
reduced motion (`setNoFlashes()`, from `prefers-reduced-motion` in ui/views/WorldView.js), and the clouds take the
flash's colour from the look. `thunderBetween(from, to)` lists the thunder heard in a span, catching up at most 60 s
after a long gap; WorldSoundscapeService asks for it on every sample (`weatherClock`, `thunderBetween`, from the
session, none in Always day) and the provider's `playThunder()` plays a low, low-passed brown-noise rumble that
swells over half a second and rolls away over five in uneven rolls, never a crack.

**Wet ground.** `core/Weather.js#wetnessAt(seconds)` follows the rain (`rainAt()`) in 5-second steps on a grid fixed
in time, from dry at the start of the spell before last, towards 2.5 × the rain (so a light shower soaks too) with a
40-second time constant while it rises and a 150-second one while it dries: half dry in under two minutes, nearly in
eight. The steps followed last are kept, so a frame costs a step or two, and the answer is the same however it is
asked. renderer/WetSurfaces.js patches the terrain's material (renderer/TerrainTileMesh.js) and every brick's, the
instanced ones (renderer/BrickInstanceRegistry.js) and those `Renderer#add()` is given: by the wetness (one shared
uniform per owner, set from `setWeather()`; the registry's through the render facade) a surface darkens, the
ground by up to 32% and bricks by 20%, walls only 45% as much as what faces the sky, and what faces the sky loses
roughness (to 0.62 for ground, 0.42 for bricks) for a sheen. Below the underside of the roof over the avatar
(the shelter's `ceiling`) and inside its footprint nothing is wet, so the room it stands in stays dry while its
roof does not. At no wetness the patch changes nothing.

**Seasons.** core/Season.js cuts the same clock into a world year of `WORLD_YEAR_DAYS` (32) of World View's
days, `SEASON_DAYS` (8) to a season: one season to each turn of the moon, so spring, summer, autumn and winter each
start at dawn on the day whose night brings a new moon, and last 5 h 20 min. The year doesn't divide a real day, so
a player who always plays at the same hour still sees the seasons go round; it is the world's year, not the
calendar's, the same for everyone wherever they live. `seasonLookAt()` blends between eleven looks set at points
in the year (a thaw, blossom, late spring, high summer, harvest, early autumn, autumn colours, leaf fall, bare
trees, deep and late winter), so the land changes a little every day, never at once at a season's start; a look is
taken every thousandth of a day and comes back frozen in between. A look carries `leaves` (how much of a
broadleaf's foliage it has), `fresh`, `blossom`, `autumn`, `fruit`, `flowers`, a `groundGrade` and
`groundSaturation` for the grass, a `fieldColor` and `fieldAmount` for the fields (bare soil, young and green
crops, ripe gold, stubble), `leafDrift` and `petalDrift`, a typical `snowCover`, and `birds` and `insects` for the
sound (core/AmbientSoundscape.js#ambientMixInSeason(), sampled by WorldSoundscapeService from `session.season()`).
renderer/SeasonalSurfaces.js changes the land without rebuilding anything streamed, and leaves as little as it can
to every pixel: the bundled site's filmed walk-through renders in software (SwiftShader), which runs every line of a
shader for every pixel whatever the branches say, so code that changes nothing still costs, and compiles every
shader in software for each new page, so code that never runs costs too. The terrain takes a patch with one shared
set of uniforms (`Renderer#setSeason()`), whose code is compiled in only once a season has been shown (never in the
Editor); every terrain vertex carries `groundCover` (core/TerrainEcology.js#groundCoverAt():
grass for grassland and forest floor, a little for highland grass and a beach's edge, field for FIELD, none for
rock, soil and water); the grass is greyed or saturated and multiplied by the grade, the field's colour replaces
the crops' at the row's own brightness, so the rows stay, and in spring and summer grass is dotted with wild flowers:
a dot in some cells of a 0.7 m grid, as many as a meadow noise (9 m cells, worked out per vertex) lets through, faded
out where a cell gets too small on screen. Trees are coloured on the CPU (`TreeForest#setSeason()`, once the season's
numbers change by a hundredth, about once a minute): each has a species' `DECIDUOUS` share (a conifer 0, a
broadleaf 1, scrub 0.6) and three numbers of its own from where it stands (`treeNumbers()`), and `treeSeasonOf()`
and `seasonedTreeColour()` turn its leaf and crown instance colours: new leaves lighten towards yellow-green; autumn
gives each its own muted red, orange or yellow at the leaves' own brightness, at its own time; two in five
broadleaves blossom pink or white; a bare crown turns twig-brown. The leaf texture is grey, so this is exactly what
the same work per pixel would give. What can't be a colour is a per-instance `treeSeason` (how much foliage the tree
carries, its share of fruit specks, which fruit) on each leaf and crown mesh, read by `makeSeasonalTree()`'s patch,
whose code is compiled in only while the season needs it (`SEASON_BARE` while any leaves have dropped, autumn to
spring; `SEASON_FRUIT` while fruit hangs, summer into autumn): leaf cards drop whole sprays, by a cheap hash of where
they are, until a broadleaf is bare to its boughs; solid mid and far crowns thin to a haze of twigs, keeping 18%;
three in ten broadleaves show red or orange fruit among their leaves. The patch goes on each part's shadow material
too, whose leaf cards are cut out by the leaf texture, so a bare tree casts a bare tree's shadow.
renderer/SeasonDrift.js draws what drifts down as renderer/RainFall.js draws rain: point sprites in a box round the
camera, worked out in the vertex shader, swaying, spinning and carried by the wind (`TreeForest#windDirection`),
only as many as is falling: 1600 snowflakes as hard as it snows, 600 leaves and 700 petals as much as the look's
drift times how much of a wood of leaf-shedding trees stands within 22 m (`TreeForest#deciduousNearby`, counted as the
trees are sorted). A season kept on a device (**Season** in World View's settings, application/settings/
WorldViewSeasonStore.js, `world-view-season`, provided as `worldViewSeasonStore`) holds the middle of that season;
`weatherInSeason()` lets the world's clouds and what falls through, as snow in a kept winter over that season's snow,
as rain otherwise. Only World View is given a season: the Editor and thumbnails keep high summer, which is what the
patches look like until `setSeason()` is called.

**Snow.** core/Weather.js gives each season its own shares of fair, cloudy and overcast spells (summer 0.72 fair and
0.08 overcast, winter 0.55 and 0.18, the year 0.6, 0.25 and 0.15 as before); a world year is 160 spells, a season
40, so a spell never straddles two. What an overcast spell lets fall is `precipitationAt()`; through winter it falls
as snow (`snowAt()`), the rest of the year as rain (`rainAt()`), turning over the 2 minutes before winter starts and
before it ends (core/Season.js#snowShareAt()): there is no thunder in snow, and snow wets nothing. About one winter
spell in six snows. `snowCoverAt()` follows the snow in 30-second steps from the end of autumn, when none lies:
while it snows the cover rises towards twice the snowfall with a 150-second time constant, from patches to a
blanket in a few minutes; once it stops it melts with a time constant of an hour in winter, so it lies from one
snowfall to the next, 4 minutes once winter is over and 2 in the rain; an hour into spring, none is left. The last
steps followed are kept, as for wetness. renderer/WetSurfaces.js lays it: on what faces the sky (normal 0.45 to 0.8
up) snow covers patches of a two-scale value noise in world space below the cover, so they grow and join as it
deepens, the ground wholly, trees 0.9 and bricks never more than 0.45, so a roof still shows its colour; walls stay
clear, and the shelter keeps it out of the room the avatar stands in, as it does the wet. The snow's code is in the
shaders only while any lies: the first snow of winter and the last of it melting rebuild every patched material
(`setSnowCover()`; the patched materials are kept, and let go when disposed), so the rest of the year, and the
Editor, pay nothing for it. Seasonal colour goes on a material after the wet patch, so it comes before the darkening
and the snow in the shader.

**The sun through the year.** Each season look carries a `sky` (core/DayCycle.js#seasonalSky(), from
core/Season.js#summerAt(): a smooth wave, 1 at midsummer, day 12, -1 at midwinter, day 28, 0 in the middle of spring
and autumn): `dayShift`, up to `SEASON_DAY_SHIFT` (0.05 of the cycle) longer or shorter, and the arcs' tilts, the sun's
50° less or more `SEASON_TILT_DEGREES` (12°) and the moon's the other way, so the midsummer sun climbs to 52° and the
midwinter one only to 28°, with long shadows, while the winter full moon rides high. A longer day ends later:
`seasonalFraction()` stretches the part of the cycle before the day's pivot (0.6, between day and dusk) and squeezes the
rest, so dawn stays at the cycle's start and dusk, night and moonrise come later; the full night runs from about a fifth
of the cycle at midsummer to a quarter at midwinter. `skyLookAt()`, `skyBodiesAt()` and `moonPhaseAt()` take the sky
(the moon's phase still turns at its own moonrise, now the season's), and with none, or EQUINOX_SKY, give exactly what
they always did. dayCycleMethods hands them `season().sky`, so a kept season keeps its middle's sun; Always day keeps its
still morning sun. The light never comes from lower than `MIN_LIGHT_HEIGHT`, so builds stay readable in any season.

**Frozen lakes.** core/Season.js#lakeIceAt() freezes the lakes from the world's clock alone, never a season kept on a
device, since the ice is walked on and everyone must agree where it holds: ice forms over the half day before winter's
third day, holds hard (`isLakeFrozenAt()`) until its last, and breaks up over half a day. Only lakes
(core/Hydrology.js#isLakeAt(): standing water inland of the shelf's middle, `seaShareAt()` under LAKE_SEA_SHARE), never
the sea or rivers. Frozen hard, the avatar walks on it: application/worldNavigation/localAvatarMethods.js gives its
constraints a `frozenAt(x, z)` on the session's clock; AvatarWaterConstraint reports no depth there (no wading slowdown)
and an `iceTopAt()`, the surface in the terrain-relative frame; AvatarStepConstraint takes that as a `floorAt()`, stood on
like a brick's top, only from within a step below it, so a swimmer caught under new ice swims on beneath it to the shore;
AvatarTerrainConstraint measures slopes on the ice's level, not the bed's. The water's surface is still there for swimming
under the ice, and ground vehicles stay off it, as they stay out of water. renderer/WaterWaveMaterial.js freezes the lake's
water (`createLakeIce()`, set from `setLakeIce()` by the session each frame): flat, still, opaque and pale blue, grained,
duller than water, with no foam, ripples or rain rings, and the snow lying patchily on it; its code is compiled in only
while there is ice, so the rest of the year pays nothing for it. Underfoot it taps (`FOOTSTEP_SURFACE.ICE`).

**Snow underfoot and footprints.** With snow lying at least `SNOW_FOOTSTEP_COVER` (0.35) and no roof overhead, open
ground crunches (`FOOTSTEP_SURFACE.SNOW`: a soft, low crunch; core/AvatarSoundCues.js reads `snowCover` and `onIce` from
`avatarSoundObservation()`). And the local avatar leaves footprints there (core/Footprints.js#advanceFootprints(), each
frame from the same observation): one every `FOOTPRINT_STRIDE` (0.75 m), left and right in turn, 0.13 m to either side,
pointing the way it walks; none on bricks, ice, in the water, in the air, riding or indoors. They are this device's own:
nothing is sent or stored, and other players see none. renderer/FootprintTrail.js draws the newest 96 as one instanced
mesh of sole-sized ovals lying on the ground's slope, blue-grey as a dent in snow, fading over the last third of a
minute and with the snow as it melts (`footprintFade()`), and draws nothing once none shows.

**Shadows.** The directional light casts them when World View turns them on (`Renderer#setShadowsEnabled()`,
renderer/SunShadows.js): one 2048² PCF-soft shadow map over a square 45 m each way round the camera's target (the
avatar, or what the camera orbits), so things farther off cast none and the cost doesn't grow with the world. Every
frame the square is moved to the target in whole texels measured across the light (`snapToTexels()`), so edges don't
shimmer as you walk; the light stands 120 m towards the sun or the moon from it (`Lights#setFocus()`). Who casts and
who receives is set where meshes are made (renderer/ShadowRoles.js): bricks, standalone and instanced, and trees cast
and receive; avatars, vehicles and animals cast; terrain receives; water, life under water, markers and the sun and
moon do neither. Off, as in the Editor and thumbnails, these flags draw nothing. Through each handover the light's
`lightStrength` (core/DayCycle.js) eases from 1 to 0 and back, and `Lights` gives half of what the directional light
loses to the hemisphere fill, so shadows fade out and in instead of swinging across the ground. Shadows are this
device's choice (application/settings/WorldViewShadowStore.js, `world-view-shadows`): on by default unless the main
pointer is coarse (phones, tablets), decided in ui/main.js. Turning them on or off rebuilds the lit materials once.

**Trees.** Each species has four forms grown from a fixed seed (core/TreeForm.js): a conifer is a straight trunk with
whorls of drooping branches under sprays of needles; a broadleaf a trunk forking into limbs and twigs under clusters
of leaves; scrub a few crooked stems parting low. A form is branches (polylines with radii and `flex`, how far each
point sways, measured along the wood from the root so a branch sways exactly as its parent does where it joins) and
leaf clusters. Every tree `NaturalFeatureField` places wears one form (`treeShapeOf()`, from its position): a little
taller or wider than the form, leaned up to about 3°, its leaves and bark a shade lighter or darker. Trunks stay
inside `TREE_TRUNK_COLLISION_RADIUS`; crowns keep clear of `SETTLEMENT_TREE_CLEARANCE`. renderer/TreeGeometry.js
builds each form three ways: **near** (every branch as a tapered tube, leaves as crossed cards cut out by a leaf
texture, their normals pointing out of the crown so cards shade as a rounded mass), **mid** (trunk and main limbs
under a few solid lumps, tiers of cones for a conifer) and **far** (one trunk under one crown shape). Textures are
painted pixel by pixel from a seed (renderer/TreeMaterials.js): nothing is downloaded. renderer/TreeForest.js draws
every tree from one pool: tiles stream on the ground's grid as before, but a tile only adds its trees to the pool,
which keeps one InstancedMesh per form, part and way of drawing (at most 96 draw calls, 40 to 80 in a forest).
Which level a tree gets is decided on the CPU by its distance from the camera, re-sorted only after the camera moves
2 m or turns 8°. Only trees inside a slightly widened view get their level; of the rest, those close enough to shade
the view are drawn as the solid mid shapes, which cast shadows, and the others are skipped. HIGH detail draws near
trees within 45 m (the reach of the shadows) and mid within 100 m; LOW draws no leaf cards, which phones feel most as
overdraw, only mid shapes within 40 m and far beyond. Only trees close by cast shadows (near ones, the mid shapes
standing in for them out of view, and under LOW the mid shapes within 40 m): the shadow pass draws every caster, so
casting mid trees out to 100 m cost it nearly as much as the near ones, for shadows beyond the shadow map. The
shadow pass uses each part's own swaying depth material, and leaf cards are cut out there too, so leaves in view cast
dappled shadows. Drawing full detail only in view keeps the cost close to the old trees': a walk-through filmed in
software rendering (tests/run-bundle.mjs) takes about as long as before. The wind is a vertex patch: each
vertex is pushed downwind by its flex, in gusts that roll across the forest, with leaf cards fluttering on top; the
push is made in world space and turned into the tree's own, so it is the same however a tree is turned, leaned or
stretched. Its strength (`Renderer#setWeather()`) is a breeze in fair weather, rising with cloud and rain; trees
darken in the rain with the rest of the world (renderer/WetSurfaces.js). Detail is this device's choice
(application/settings/WorldViewTreeDetailStore.js, `world-view-tree-detail`, **Detailed trees** in World View's
settings): on by default unless the main pointer is coarse, like shadows; the Editor's renderer makes the same choice
from the pointer.

**What shines.** A brick type's `nightGlow` (core/NightGlow.js; docs/BrickLibrary.md) gives the light its bricks
give off: `BrickRenderer#describe()` adds it to a brick's visual as `glow`. Instanced bricks carry it in an
`instanceGlow` attribute beside the selection highlight's `instanceEmissive`, and the shader adds
`instanceGlow × uNightGlow` to the emissive light, one uniform per registry, so night falls with one number per
frame. Standalone brick meshes (structure placements, the plaza's square and exhibits, claimed builds) are marked
by `BrickRenderer#createMesh()` (`userData.nightGlow`), and `Renderer#add()` gives their material the same shader
addition over the renderer's own uniform (renderer/NightGlowMaterial.js); it is added to, never written into,
`material.emissive`, which selection highlighting owns. Glowing bricks don't light their surroundings: there are no
point lights and no bloom pass.

**Always day.** A per-device choice, application/settings/WorldViewSkyStore.js (`world-view-sky`), provided as
`worldViewSkyStore`. WorldView passes it to `session.setAlwaysDay()` before the session starts and whenever it is
ticked; while on, the session hands the renderer DAY and `nightLevel()` is 0, so sound stays daytime too. The
season still turns, and Always day's fair weather lies over its typical snow (core/Weather.js#fairWeatherIn()).

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
            ├── audio/EditorSoundSynth.js                  the Editor's edit sounds
            ├── audio/RainSynth.js                         rain's drops: looped beds and a bank of near drops
            └── audio/MusicPlayer.js                       the music: core/MusicScore.js#musicPhrase() scheduled on the
                                                           audio clock, a phrase at a time, under the master volume

    Editor: EditorSession#onCommandActivity() → core/EditorSoundCues.js#editorSoundCueFor()
            → application/editor/EditorSoundService.js → WebAudioSoundscapeProvider({ ambience: false })

- **Mix.** Each ecology zone contributes a fixed level to each layer (forest: birds, sheltered from wind; highland
  and rock: wind; field and grassland: insects; lake: lapping water, faintly at a beach; river: running water). The
  spot underfoot weighs 0.4, the near ring 0.4 and the far ring 0.2, so a lake or forest is heard before it is
  reached. LEAVES and PINES come from the trees themselves: every tree `naturalFeaturesInRegion()` puts within 20 m
  adds its nearness (1 − distance / 20) over 6 to its layer, BROADLEAF fully and SCRUB at 0.4 to LEAVES, CONIFER to
  PINES. SPRING is a spring bubbling where a river rises (`core/RiverFlow.js#riverSpringAt()`): the loudest spring
  found underfoot or on rings at 6 m and 12 m, by its strength times its nearness (1 − distance to its centre / 16).
  Like the terrain it is a pure function of place: nothing is stored or sent, and every viewer at a spot
  hears the same land. After dark `ambientMixAtNight(mix, nightLevel)` turns birds down to a tenth and crickets up
  (insects × (1 + night), plus 0.3 × night where there is no open water), `nightLevel` being
  `WorldNavigationSession#nightLevel()` (see "Day and night"). In the rain `ambientMixInRain(mix, rain)` sets RAIN, a
  layer no place gives, to the rain's strength, and turns birds down by up to 85% and insects by up to 80%, `rain`
  being `WorldNavigationSession#weather().rain`; under a roof (`ambientMixInRain(mix, rain, sheltered)`,
  `sheltered` being `WorldNavigationSession#isSheltered()`) ROOF, rain drumming on the roof, takes the rain's
  strength, and RAIN, heard through the walls, falls to 0.3 of it.
- **Service.** `WorldView` makes one through the `createWorldSoundscape` factory `ui/main.js` provides
  (`ui/views/worldView/useWorldSoundscape.js`), after `session.start()`, and disposes it on unmount. It resamples
  only when the listener has moved at least 0.5 m, night has deepened or lifted by 0.05, or rain has started, stopped
  or changed by 0.05, or the listener has stepped under a roof or out from one, and plays silence while there is no listener position. `unlock()`
  is called from every pointerdown and keydown, because browsers only let audio start (and iOS only lets it resume)
  from a user gesture. `M` and the Sound button (`ui/components/SoundControl.js`) toggle mute; the preference is
  this device's own.
- **Provider.** Every sound is synthesized, so there are no audio files and the Content Security Policy is
  unchanged: looping brown noise through a gusting low-pass for wind and slow waves for a lake, band-passed white
  noise for a river, a trilled 4.4 kHz tone for insects, separate randomly timed chirp phrases for birds, more
  often the more birds there are, and, only while a spring is heard, short rising plips for its bubbles, a few at a
  time, more often the nearer it is. Rain is made of drops, not filtered noise (audio/RainSynth.js): stereo loops of
  rendered drop impacts, each a tick a millisecond or so long (bigger drops longer and duller), most faint and a
  few loud, some ringing with a rising bubble "plink" as they land in water, each ear its own drops; a sparse bed
  always, and a dense one that fills in at the rain's level, so a shower is heard drop by drop and a downpour as a
  roar; over them, near drops from a bank of 48, scheduled every 0.25 s (up to 40 a second at the heaviest, at
  exponential intervals, random pitch and place) only while rain is heard; and a soft low-passed brown wash. A roof
  drums with a bed of drop taps through a band round 1.3 kHz, the roof ringing, over a low thrum. The drops are
  rendered from their own fixed seed, the first time it rains or a roof drums. Level changes fade with a 0.8 s time constant. The `AudioContext` is created on the
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
- **Music.** `core/MusicScore.js#musicPhrase(mood, index, seed)` is pure: four bars over a chord progression, a pad
  holding each chord, a bass on the bar and a melody of chord tones and steps (folded between a fifth and two octaves
  above the tonic), in one of three moods (EDITOR in C major at 88 bpm, DAY in F major at 72, NIGHT in A minor at 56,
  sparser). Phrases 6 and 7 of every 8 are rests. `audio/MusicPlayer.js` schedules a phrase at a time 0.6 s ahead on
  the audio clock (a 200 ms timer only tops it up), through its own gain at 0.65 under the provider's master, so it
  fades with mute and volume. The provider makes the player the first time music is to play (`setMusic(true)`, sound
  unmuted and unlocked, page shown) with a seed from its `random`, so each visit's tune differs; `setMusicMood()` takes
  effect at the next phrase. `SoundPreference` keeps `music` in 'sound-settings' (default on) and applies it;
  `WorldSoundscapeService#sample()` sets DAY or NIGHT from `musicMoodFor({ nightLevel })`, `EditorSoundService#start()`
  EDITOR.
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
  the Recent Worlds page. A World's saved camera framing is always one
  taken near it (within the streaming radius): World View notes the
  framing on every refresh and saves the last one seen there when you
  leave, and a restore ignores a framing, or a Camera Perspective whose
  avatar stands elsewhere, that would leave the camera away from the
  World.

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
| Where the bytes go | Arweave, IPFS (Local Kubo), IPFS (Remote Pinning, Experimental), Steem and Blurt (Experimental, small builds) | `PublicationMaterialUploaderComposition` (Publication material); `SnapshotPlacementStoreRegistry` + `ipfsRemotePublicationCoordinator` (Snapshot) |
| Where it is announced | Nostr (fan-out to every configured relay), Arweave (tagged transaction), Steem (Experimental; a reply to a monthly discovery thread) or Blurt (Experimental; the poster's own top-level build post, found by tag and by authors' histories) | `AnnouncementDiscoveryProviderRegistry`, keyed by `nostr`/`arweave`/`steem`/`blurt` (`core/AnnouncementDiscoveryProvider.js`), for Snapshot and Place Naming (`resolveSnapshotDiscoveryPublisher()`, `distributePlaceNamingClaimCommand`); `*RuntimeComposition` `discoveryProvider` for Publication and Commentary |
| Proof / anchoring | Arweave; Bitcoin, Steem and Blurt (Experimental; Bitcoin and Base only through their wallet steps) | `PreferredPublicationAnchorCreationCoordinator` |

The saved preferences live in `RoleProviderPreferenceStore` (`CONTENT`, `ANNOUNCEMENT_AND_DISCOVERY`,
`PROOF_AND_ANCHORING`). They drive the preferred-provider buttons (on the Publications page, "Store on …" and
"Anchor on …" at the top of a card's Distribution roles, and "Use Preferred Provider" under Details → Placements & IPFS),
and they seed every picker's first value through `resolveSavedProviderDefault()`; they never override a choice already
made. The Distribution roles offer that button only for a saved provider they can use
(`preferredDistributionChoice()`), never for a wallet-guided anchor type, and otherwise show every option. The
per-type anchor cards list only `oneClickAnchorTypes()`: the one-click Bitcoin publisher is registered while Bitcoin's
wallet is switched on (the Proof / Anchoring Provider page then offers Bitcoin) but has no wallet and never succeeds, so it
gets no card. On the
Publications page, Distribute Snapshot on a World distributes the World's own snapshot (the wrapped Publication's
`contentReference`, not the envelope's) with its publisher's signed placement from `PublisherPlacementClaimLookup`
(`application/placement/PublisherPlacementClaim.js`, the same record World View's `getPublisherPlacementRecord()`
picks), on the substrate chosen on that card. Distribution uses selection,
never fan-out, across substrates. Fan-out happens only across relays within Nostr. Arweave and IPFS gateways use
ordered failover instead, because any gateway can serve the same content-addressed bytes. The Steem choices are
described in docs/Protocol.md's three "Proposed: Steem …" sections, and the Blurt ones in "Proposed: Blurt
Substrate"; all are built and Experimental.

In the UI, every distribution control sits in `ui/components/WorldDistributionDialog.js` (World Encounters and My
Publication) or `ui/components/EditorDistributionDialog.js` (the Editor's post-publish overlay, and the Signed Claim
of an authorship claim just published from `StructureInfoPanel`, through a second `usePostPublishDistribution({
includeSnapshot: false })`). A place name is the exception: it has no Signed Claim of its own to store, so World View's
naming panel announces the claim itself through `distributePlaceNamingClaimCommand(claim, discoveryProvider)`, which
builds the chosen substrate's publisher per click. Each of these is offered right after the local publish and never
runs on its own, with one exception: the Editor's own publish (`usePostPublishDistribution({ rememberDestination:
true })`) keeps where a combined send that worked went, when "Send here every time I publish" is ticked
(`application/settings/PublishDestinationStore.js`, provided as `publishDestinationStore`; remote pinning is never
kept), and each signed publish after that runs the combined send there by itself, unless that network's writer has
since been switched off. One settings block
(Storage, Remote Pinning draft, Announcement/Discovery) feeds both legs. The combined "Distribute" action runs
Snapshot and Publication one after the other, because both may sign through the same wallet extension. Every
injected-wallet adapter (Nostr NIP-07, Arweave, UniSat, EIP-1193, Steem Keychain, Blurt Keychain) has a 120-second approval timeout.

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
`DEFAULT_NOSTR_RELAY_URLS`, `DEFAULT_STEEM_API_NODES`, `DEFAULT_BLURT_API_NODES`; `DEFAULT_ICE_SERVERS` and `DEFAULT_RENDEZVOUS_URLS` in `peer/`).
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
| Comment default | `/settings/announcement-discovery-provider` (its Comments section) | `commentary-distribution-preference` | `{ providerKey }`: a network or `peers` (Local & peers only); absent means comments follow the Announcement / Discovery preference |
| Steem | `/settings/steem` | `steem-reading-configuration`, `steem-announcing-configuration` | ordered `apiNodes` (read failover; anchor verification asks the first three), thread accounts and first month to read; this device's Steem account for posting. Reading changes apply on the next load |
| Blurt | `/settings/blurt` | `blurt-reading-configuration`, `blurt-announcing-configuration`, `blurt-known-authors` | ordered `apiNodes` (read failover; anchor verification asks the first three; a configuration saved with the dropped followed accounts and first month still reads); the accounts seen posting under ForkBuild's tags, whose histories are read when no node serves Nexus; this device's Blurt account for posting. Reading changes apply on the next load |

Credentials are never stored. The remote-pinning credential is kept only in tab memory
(`IpfsRemotePublishingCredentialMemory`).

## Publication Commentary

    addPublicationCommentaryCommand (Repository) / WorldNavigationSession#addPublicationCommentary (World View)
      1. PublicationCommentaryStore.add()            local, authoritative
      then distributePublicationCommentaryCommand (PublicationCommentaryDistributor):
      2. PublicationCommentaryDistributionPeerExchange.announce()   WebRTC, best effort
      3. Nostr (NostrMultiRelayPublicationCommentaryDistribution) OR Arweave OR Steem OR Blurt — one, best effort;
         none for LOCAL_AND_PEERS_ONLY ('peers', "Local & peers only")
         an accepted publish is recorded in PublicationCommentaryDistributionLog

    distributeSavedPublicationCommentaryCommand (Distribute, under your own comment)
      exportCommentary() (author only) -> one network's publish(), awaited -> PublicationCommentaryDistributionLog

    refreshPublicationCommentaryCommand (on open / "Check for new comments")
      Discover...FromNostrUseCase + ...FromArweaveUseCase + ...FromSteemUseCase + ...FromBlurtUseCase
        -> PublicationCommentaryDistributionExchange.importCommentaryEnvelope()   one verifier, one store
        -> PublicationCommentaryRemoteNotificationBridge                          notify the publisher only

`CanCommentOnPublicationUseCase` allows a comment on any publication this device knows: its own
(`LocalDiscoveryProvider`) and those found from peers, links and the networks (`DecentralizedPublicationDiscoveryProvider`,
merged with `CompositeDiscoveryProvider` in both `CreatePublicationCommentaryUseCase` and `CreateWorldViewUseCase`). The
`publication.commented` notification still reads only this device's own publications, since it tells their publisher.

`ui/components/PublicationCommentarySection.js` is the Repository's single Commentary component (card and list).
World View's Commentary panels (My Shared World and both World Encounter panels) save through their session, then
hand the saved comment to the same `distributePublicationCommentaryCommand`. World View also mounts
`PublicationCommentarySection` itself, in the About this build reading sheet (`DescriptionReaderSheet`) for an
inspected build that has a Publication (`getPublicationForDocument()`, the lookup `CanCommentOnPublicationUseCase`
also uses): WorldView provides its own session-backed `getPublicationCommentariesCommand` and
`addPublicationCommentaryCommand` to that subtree, so those comments are saved and distributed exactly like its other
panels', and the panel's comment count is re-read after each post. All of them, the Repository's included,
pick the substrate with `ui/components/CommentaryDistributionPicker.js`, which also offers "Local & peers only" for
commenters with no network account. A peers-only comment reaches only the peers connected when it is posted: the peer
exchange is announce-only, with no catch-up for peers that connect later.

Hearts (docs/Protocol.md, "Publication Hearts") reuse this machinery. `CreatePublicationCommentaryDistributionPeerExchangeUseCase`
also builds the `PublicationHeartStore` and `PublicationHeartExchange`, and wraps the comment exchange with
`withHeartRouting()`, so the peer exchange and every comment reader send a heart envelope to the heart store by its
`kind`. `ui/main.js` gives one tap through `SetPublicationHeartUseCase` (kept first), then
`createPublicationHeartDistributor()` (peers, then the network `HeartDistributionPreferenceStore` names: Nostr through
`NostrPublicationHeartDistribution` as kind-7 reactions and kind-5 deletion requests, any other through that network's
comment carrier). `PublicationHeartNotificationBridge` tells a builder of a new heart (`publication.hearted`).
`ui/components/BuildHeart.js` shows a build's hearts in World View's About this build panel and reading sheet and in
Explore's cards and rows. People are named by `application/publication/identityNames.js` (provided as
`identityNames`): this device's own name, else the name of their newest verified build, else a credit's name, else the
name the record carries; `ui/components/IdentityName.js` shows it, comment authors included, never a bare key.

Every comment form starts on `defaultCommentaryDistributionProvider`, and the distributor falls back to it when a
comment carries no choice. `ui/main/composeContentAndSnapshots.js` resolves it once at boot with
`resolveCommentaryDistributionProvider()` (`core/CommentaryDistributionProvider.js`): the saved comment default from
`CommentaryDistributionPreferenceStore`, else the Announcement / Discovery preference. It is kept apart from
`RoleProviderPreferenceStore` because Local & peers only is a choice only comments have: Snapshots, claims and place
names are always announced on a network.

`ui/components/CommentaryNetworkDistribution.js` sits under every comment in all four lists and shows only for the
signed-in author: the networks `PublicationCommentaryDistributionLog` (`own-commentary-distributions`) recorded for
that comment, and **Distribute**, which sends it to one network with `createSavedPublicationCommentaryDistributor()`.
That call waits for the network and rejects with a `UserFacingError` when the network isn't set up or declines;
posting still never waits. Both share `publicationCommentarySubstrateFor()` in `ui/main.js`, which returns null for a
network that isn't set up rather than another network, so the log names the network that was asked. The log only
knows what this device sent.

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
- **Achievements.** Achievement events, badges and profiles derived from
  evidence (application/achievement/). The leaderboards, signed leaderboard
  claims and their reconciliation were retired in October 2026; their old
  routes redirect to Home, and the observation archive reads and drops the
  collections they kept (application/publication/observationArchive/
  PublicationObservationArchive.js, "LEGACY_FIELDS").
- **Notifications.** core/NotificationEvent.js,
  storage/NotificationEventStore.js, GetRecipientNotificationEventsUseCase
  and ui/components/NotificationHistoryPanel.js, which ui/App.js hosts from
  its header's 🔔 button through application/chat/NotificationHistoryAccess.js
  (composed in ui/main.js). A mounted World View registers its focusWorld()
  so a notification's Explore moves within it. Only persistence is
  claimed: not delivery, seen or read. ui/notifications/notificationText.js
  puts the kinds ForkBuild makes into words for the panel (passed in as a
  prop). Once turned on (ui/components/DeviceNotificationSetting.js, in the
  panel's slot; application/settings/DeviceNotificationSettingsStore.js),
  application/notification/DeviceNotificationRelay.js shows the
  recipient's new events through the operating system while the page is
  open but hidden: it takes what is stored at start (or on a change of
  identity) as seen, is checked after each admission and every 20 seconds,
  and shows at most three at once (core/DeviceNotifications.js). There is no
  push service, so nothing shows while ForkBuild is closed.

The user-facing entry point is the Publications page (`/publications`,
ui/views/DecentralizedPublicationsView.js). docs/Roadmap.md has one entry
per milestone for this area, and docs/Principles.md groups its rules
under "Decentralized publication, content and replicas", "External
anchoring and chain transactions", "Achievements and credit" and
"Notifications".

## Renderer

renderer/Renderer.js owns the WebGL renderer, scene (SceneManager),
camera (CameraController, OrbitControls-based), lights, grid, the four
terrain TerrainStreamingControllers and the AnimationLoop (see
docs/RendererLifecycle.md). The Editor and World View build it the same
way, through RenderWorldUseCase and RenderWorldViewUseCase.

- WorldRenderer turns domain events into brick instances, one at a
  time, in BrickInstanceRegistry: bricks are not meshes of their own but
  instances of one InstancedMesh per definition, surface and 16-unit cube
  of space (a chunk), so a scene costs one draw call per chunk, and frustum
  culling and raycasting skip whole chunks. Each instance carries its
  transform, its color (instanceColor over a white material shared by
  every chunk of one surface)
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
- The brick look (docs/Pillars.md, "Look"): core/BrickSurface.js says what
  each brick is made of (masonry, plaster, wood, tile, glass, foliage,
  stone or plain; the plain blocks by their colour), and
  renderer/BrickSurfaceMaterial.js draws it. `withBrickBounds()` gives a
  geometry its bounding box as two attributes, and `applyBrickSurface()`
  patches a material's shader, on top of the instanced highlight and the
  night glow (makeNightGlowing() chains it), to multiply its colour by a
  soft dark line along the brick's edges, a slight shade of its own and
  its surface's grain, all worked out from the brick's object-space
  position: no images, and no reliance on UVs. Exported models
  (BuildMeshExtraction) take ThreeBrickFactory's bare geometry and carry
  none of it.
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
  Repository previews. ShowcaseTurntableRenderer draws Home's slowly turning
  village, with no controls or picking.

## UI

The look round the 3D view (docs/Pillars.md, "Look") is named once in
css/main/theme.css, the first part css/main.css imports and the one
css/embed.css imports: grounds (`--paper`, `--surface`…), lines, inks
(`--ink`…), the green `--accent`, inks, tints and edges per meaning
(`--ink-amber`, `--tint-green`, `--edge-red`…) and the paper, line and
shadow colours as RGB triplets for any strength (`rgba(var(--overlay-rgb),
0.68)`). The other stylesheets and the few inline styles in components use
those names; tests/VillageLook.test.js checks their contrast in both looks,
and that no stylesheet draws a colour of its own that the dark look would
miss.

The dark look redefines every name, once under
`@media (prefers-color-scheme: dark)` for `:root:not([data-look="light"])`
and again, identically, for `:root[data-look="dark"]`. The choice
(core/LookSettings.js: auto, light or dark) is kept by
application/settings/LookSettingsStore.js (`look-settings`); ui/start.js
applies it with ui/look.js#applyLook() before the app loads, which sets or
clears `data-look` on `<html>` and points both `theme-color` metas at the
chosen paper; ui/components/LookChoice.js offers it in the More menu.

ui/main.js builds every store, adapter and use case once, reads the
saved settings, and provides them to the Vue app. The compose functions in
ui/main/ build the larger subsystems (identity and peers, content and
Snapshots, anchoring, World discovery, injected-wallet services, publication
distribution, Snapshot discovery) and return what ui/main.js provides; every
app.provide() call stays in ui/main.js.

Services that only some pages inject are built in service groups
(ui/serviceGroups.js) rather than at startup. ui/main.js defines each group
as a function that imports its modules, builds its services from the ones
already running and provides them; ui/router/pageServiceGroups.js lists the
groups each page needs, and the router loads them beside the page's own
modules, so they are provided before it renders (a provide added after the
app mounted reaches every component created later). There are four:
`anchoring` (publication evidence, and Bitcoin, Base, Arweave, Steem and
Blurt anchoring: the Publications page and the Proof & Anchoring settings),
`distribution` (publication and Snapshot distribution,
Snapshot and place-name discovery, remote IPFS pinning, IPFS content checks
and Publication links: the Editor, World View, the Publications page and a
Publication link), `observationArchive` (the Publications page) and `sound` (World View and the Editor). What must run from
the start stays at startup: the stores, the peer exchanges that listen for
peers' messages, background announcement sync, backups, and everything the
header shows. tests/ServiceGroupCoverage.test.js fails if a page injects a
service from a group not listed for it, if a listed group goes unused, or if
the header injects a group's service.

Bitcoin's and Base's wallet steps are network writers (core/NetworkWriters.js,
docs/Pillars.md "Networks: readers and writers"), built only when switched on
in Network Settings (application/settings/NetworkWriterSettingsStore.js,
ui/components/NetworkWritersSetting.js). `anchoring` (ui/main/composeAnchoring.js)
builds every network's anchor reader: proof checks and evidence views for
Arweave, Steem, Blurt, Bitcoin and Base, and Bitcoin's confirmation and
reconcile. ui/main/NetworkWriterLoader.js then imports and builds the writer
plugins switched on (ui/main/plugins/composeBitcoinWallet.js and
composeBaseWallet.js) on what `anchoring` built, and one switched on later at
once; each provides its services like a group, and the Publications page's
composables inject them only while the switch is on
(ui/views/decentralizedPublications/networkWriterServices.js). Bitcoin's
one-shot publisher joins the shared anchor publisher registry with its
writer. tests/NetworkWriters.test.js checks that only the plugins reach the
wallet modules.

Steem's and Blurt's writers are switches too, without plugins: one runtime per
network (application/steem/SteemRuntimeComposition.js,
application/blurt/BlurtRuntimeComposition.js) holds both its reader (discovery,
material resolution, proof checks) and its writer (the announcer or poster,
the publishers over it, content storage and anchoring), on one RPC client. The
switch is enforced where everything posts: the announcer and poster refuse
while it is off (`isEnabled`, from `isNetworkWriterEnabled` in
ui/main/composeWorldDiscovery.js). Offering follows it live: the content store
joins `snapshotPlacementStoreRegistry` (storage choices) and the anchor
publisher joins the anchor publisher registry only while it is on
(ui/main/followNetworkWriterSwitches.js; the resolution registry and proof
checks keep them for everyone), and the pickers list the networks
ui/components/networkWriters/useWritableNetworks.js says can be written to.
The saved default networks seed Nostr instead of a switched-off one. The
switch itself is on each network's settings page
(ui/components/networkWriters/NetworkWriterSwitch.js), and starts on where an
account to post as is already saved.

ui/router/index.js
defines the routes: Home, Editor (`/editor`), Repository, Recent Worlds,
Author, World View (`/world/:documentId`), Live World, Avatar, Identity,
Peers, Chat and Conversations, Publications (`/publications`), the
settings pages under `/settings/…` (including Language), the weekly challenge (`/challenge`, `/challenge/:id`), and About.
The header (ui/App.js) shows Home, Editor, Repository, Challenge and My
Worlds, and groups the other pages under More (You, People,
Network, App); a phone's Menu lays More's groups out open. Views reach
application/ through injected services;
the composables in ui/composables/ share the settings-form logic
(useEndpointSettingsForm, useEndpointListSettings,
useRoleProviderPreferenceForm) and the narrow-screen layout
(useMediaQuery). A route with `meta: { experimental: true }` gets the
Experimental banner from ui/App.js. A page that is a regular feature with
Experimental parts, like the Publications page, marks those parts itself
with `.experimental-badge` instead; `decentralizedPublications/presentation.js`
lists its Experimental storage types and anchor types, so graduating one is
removing it from its list.

Text the app shows goes through ui/i18n/ (see docs/Translating.md).
ui/i18n/i18n.js holds the one Translator (ui/i18n/Translator.js: message
lookup with an English fallback, Intl.PluralRules plural forms, `{name}`
parameters, and Intl number and date formatting); components import t()
from it and expose it to their template. ui/i18n/locales.js lists the
shipped locales and picks one: the saved choice
(LanguageSettingsStore, 'language-settings', core/LanguageSettings.js),
else the browser's languages, else English. ui/start.js sets it, and the
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

index.html loads the app as ES modules with no build step. ui/boot.js, the
entry point, imports ui/start.js, which opens storage, chooses the language
and imports ui/main.js, the shell every page shares; each page but Home is
imported the first time it is opened (ui/router/index.js), and so is the
thumbnail renderer, which brings in Three.js
(application/editor/CreatePreviewUseCase.js), and so is each service group
(see "UI"). All of these go through ui/importWithRetry.js, which tries a
failed import again with backoff. That helps only where the browser fetches
a failed module again; Chromium keeps the failure for the life of the page.
So when the first load still fails to download, ui/boot.js reloads the page
once (ui/loadRecovery.js): the new page fetches what is missing, and what did
arrive comes from the HTTP cache. A second failure within a minute of that
reload, or one where sessionStorage cannot record it, shows a translated
message with a Reload button in place of the app instead of reloading again;
an error that is not a failed download is thrown as before. boot.js imports
only loadRecovery.js, so those two small files are the only ones whose loss
still leaves the page blank. A page opened later (or its service groups)
that still fails to download after a brief retry is not reloaded
automatically, since a new page ends a voice call and every peer connection:
ui/pageLoadFailure.js catches the router's error and
ui/components/PageLoadFailureNotice.js, under the header, says the page could
not load and offers Reload (onto that page) or Dismiss, warning when a voice
call would end; the next navigation that completes clears it. tests/InitialLoadModuleGraph.test.js fails
if a page, Three.js or a service group's modules are statically reachable
from ui/main.js again. index.html lists every module of the first load (ui/boot.js,
ui/start.js, ui/main.js and what they statically import, breadth first) as a
`<link rel="modulepreload">` after the import map, so the browser requests
them all at once rather than one import level at a time; a preload fetches
and parses a module without running it, so ui/main.js still runs only after
storage is open. scripts/modulepreload.mjs writes the list and
tests/ModulePreload.test.js fails when it is out of date; both use the
static import walk in scripts/moduleGraph.mjs. GitHub Pages publishes a
bundled copy instead (scripts/build.mjs, .github/workflows/pages.yml): esbuild
joins the first load into about 80 minified files and turns every import()
into its own file, resolving bare imports through the import map below;
tests/run-bundle.mjs opens every page of it (docs/Deployment.md, "GitHub
Pages"). The import map
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

A build downloads as a 3D model (the Editor's **3D model**,
ui/components/modelExport/ModelExportDialog.js, and a shared build's page
when its license allows copies): application/export/BuildModelExport.js
collects its bricks and, one level deep, its placed structures' bricks
where renderer/WorldRenderer.js draws them (TransformMath's rotation about
the placement's origin); renderer/BuildMeshExtraction.js turns them into
triangles with ThreeBrickFactory's own geometry, grouped by color; and
core/BuildModelFormats.js, with no Three.js, writes glTF binary (one
primitive per color, linear-light materials), binary STL (Z up, 10 mm a
unit, on the bed) or OBJ (vertex colors), each carrying the credit.
ui/components/modelExport/downloadBuildModel.js hands the file to the
browser; nothing leaves the device.

The built site is also installable and opens offline: scripts/build.mjs
writes `sw.js` from ui/pwa/serviceWorker.js, filled in with a version and
the files to keep on install (the page, the bundle but its translations,
the manifest and icons), and adds a `<meta name="forkbuild-service-worker">`
that ui/pwa/serviceWorkerClient.js registers from ui/main.js (the unbundled
repository has neither, so it never runs one). The worker answers the page
network-first, the content-named bundle cache-first, and the rest of the
origin network-first with a kept fallback; a new version waits for
ui/components/pwa/AppUpdateBanner.js's Reload. A clicked notification
focuses an open page (which follows `forkbuild:navigate`) or opens one.
ui/pwa/installPrompt.js keeps the browser's `beforeinstallprompt` from
ui/start.js on, for ui/components/pwa/InstallAppButton.js on Home and in
More (or Safari's Add to Home Screen hint); `appinstalled` is counted as
`/e/installed`. Its CSP allows `worker-src 'self'`.

## Directories without a section of their own

| Directory | What it holds | Where it is explained |
|-----------|---------------|------------------------|
| `anchoring/` | Anchor publishers, evidence views and proof verifiers for Bitcoin (PSBT build/sign/broadcast, confirmation and funding observers, Esplora adapters), Arweave, Base, Steem and Blurt | `docs/Roadmap.md` 0.8.0 onward; `docs/Principles.md` from "External Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)" |
| `base/` | Base (EVM) wallet connection, transaction planning, signing, broadcast and inclusion observation | `docs/Roadmap.md`, the Base milestones from "0.8.90 — Explicit Base Network & Account Observation" through 0.8.101 |
| `content/` | `ContentStore` implementations: local, Arweave, IPFS (Kubo, gateway, remote pinning), Steem (`SteemContentStore`: Snapshots and Signed Claims in a manifest post and up to 20 part posts), Blurt (`BlurtContentStore`: the same format, in replies under the poster's own build post) and the gateway-failover wrappers | `docs/Roadmap.md` 0.7.0 onward; "Distribution" and "Network endpoint configuration" above |
| `nostr/`, `arweave/` | Injected-wallet signers (NIP-07, Arweave) and the Nostr relay query client | "Distribution: independent choices, one dialog" above |
| `steem/` | The Steem JSON-RPC client (API node failover) and the Steem Keychain broadcaster. The app reads and announces on Steem through `application/steem/` (a discovery thread reader, an announcer that also posts stored content and its parts, a reader and publisher per announcement family, a Resource Credits estimator, and `content/SteemContentStore.js`, composed by `SteemRuntimeComposition.js` in `ui/main/composeWorldDiscovery.js`; `ui/main.js` registers the content store for Snapshot storage, and Publication distribution stores Signed Claims through it; `application/worldEncounter/SteemWorldEncounterMaterialResolver.js` reads Signed Claims back for World discovery); `scripts/steem-threads/` uses the same client and broadcaster to create the threads | `docs/Protocol.md`, "Proposed: Steem Announcement Substrate" and "Proposed: Steem Content Storage" |
| `blurt/` | The Blurt JSON-RPC client (API node failover, tag listings and authors' histories) and Blurt Keychain, which offers Steem Keychain's interface, so signing and image uploads reuse `steem/`. The app reads, posts, stores and anchors on Blurt through `application/blurt/` (a reader over the tag and authors' histories, a poster that groups everything one Distribute makes into one build post, a reader and publisher per announcement family and a fee estimator), `content/BlurtContentStore.js` and `anchoring/Blurt*.js`, composed by `BlurtRuntimeComposition.js` in `ui/main/composeWorldDiscovery.js`. Steem's and Blurt's binary serialization and kept block evidence share `core/GrapheneBinary.js` and `core/GrapheneBlockEvidence.js` | `docs/Protocol.md`, "Proposed: Blurt Substrate" |
| `scripts/steem-threads/` | Operator pages, not part of the app: one creates the monthly Steem discovery threads, and `content-check.html` checks that API nodes return content stored on Steem in full, and that an image can be uploaded to a Steem image host from this site | `docs/Protocol.md`, "Proposed: Steem Announcement Substrate" |
| `server/rendezvous-worker/` | Reference rendezvous server (Cloudflare Worker) for `peer/WebSocketRendezvousTransport.js` | `server/rendezvous-worker/README.md` |
| `utils/` | Small shared helpers (e.g. `sortOptionsByLabel.js`) | `docs/CodingConventions.md` |
