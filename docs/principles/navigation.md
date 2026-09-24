# Principles: World navigation, focus and spatial discovery

Each rule links to its full text in [the history](../Principles.md#history).

### Discovery Is One Path, Not Two (0.2.26)

Search never keeps a second, UI-maintained catalog of what exists.
`SearchWorldUseCase` filters exactly what `discoveryProvider.list()`
returns, the same source every other discovery surface reads, so search
and discovery cannot drift apart.

[Full text](history/0.1-0.2.md#discovery-is-one-path-not-two-0226)

### Publication Found Is Not The Same As Placement Found (0.2.26)

A search result either has a recorded `PlacementRecord` (`hasPlacement:
true`) or is known to discovery but has never been placed
(`hasPlacement: false`, positioned only by the deterministic fallback
grid). Neither is an error, and the UI says which one it is, so a
placeholder position never looks like a chosen one.

[Full text](history/0.1-0.2.md#publication-found-is-not-the-same-as-placement-found-0226)

### Focus Is Navigation, Not Discovery — And Never Editing (0.2.26)

Every way of focusing a document (search results, "Documents Here",
Nearby Worlds) goes through the same `focusDocument()`. Focus moves the
camera and changes the active document. It creates nothing and never
mutates or forks the document, so it is safe to offer wherever a
document is named.

[Full text](history/0.1-0.2.md#focus-is-navigation-not-discovery--and-never-editing-0226)

### Diagnostics Should Say What Is Actually True, Not What Would Be Convenient (0.2.26)

Only report failure states the wired discovery stack can really produce.
A synchronous local read cannot be "temporarily unavailable", so the UI
must not show that message for it. It distinguishes the real cases:
nothing published, no search match, a publication with no recorded
placement, and so on.

[Full text](history/0.1-0.2.md#diagnostics-should-say-what-is-actually-true-not-what-would-be-convenient-0226)

### Camera Focus, Active Document, and Selection Are Three Different Things (0.2.27)

Where the camera looks (`getFocusedDocumentId()`) and which document
mutations land on (`getActiveDocumentId()`) are tracked separately.
`focusDocument()` still moves both by default, but they can differ.
Whenever a non-empty brick selection exists, it and the active document
always agree on which document that is.

[Full text](history/0.1-0.2.md#camera-focus-active-document-and-selection-are-three-different-things-0227)

### Only The Active Document Is An Editing Target (0.2.27)

Every mutation in `WorldNavigationSession` resolves its target from the
active document (or the selection's document), never from camera focus.
Reading focus for this once made commands mix one document's `worldId`
with another's brick ids. Since 0.5.9 this applies to World View's few
remaining mutations.

[Full text](history/0.1-0.2.md#only-the-active-document-is-an-editing-target-0227)

### Navigation Never Implies Editing (0.2.27)

Moving the camera (`focusDocument`, `moveCamera`, streaming a document
into view) never mutates anything and never forks a published snapshot.
The camera-only field is never read by the fork-on-write guards or by
any command construction.

[Full text](history/0.1-0.2.md#navigation-never-implies-editing-0227)

### The World View Header Shows What It's Actually Doing (0.2.27)

The header always shows both the camera focus and the active document
("Camera: Alice's Castle · Editing: Bob's Castle"), not only when they
differ, so people keep trusting it. Its status badge and document
actions read the active document; camera position never decides what an
action targets.

[Full text](history/0.1-0.2.md#the-world-view-header-shows-what-its-actually-doing-0227)

### A Spatial Query Is Authoritative Over Placement, Not A Local-Cache Scan (0.2.28)

A query like "everything within 25 World Units of this point" promises
everything discoverable in that region, whichever replica answers it.
`searchWorldByLocation` is written against that contract, not against
today's local scan, so a decentralized backend can answer the same
question later without changing callers.

[Full text](history/0.1-0.2.md#a-spatial-query-is-authoritative-over-placement-not-a-local-cache-scan-0228)

### Distance Is Derived, Never Persisted (0.2.28)

A result's `distance` is computed at query time from the query center
and the resolved position. It is never stored or replicated. A result
from a text search carries `distance: null`, because there is no
distance without a center.

[Full text](history/0.1-0.2.md#distance-is-derived-never-persisted-0228)

### Exploring A Location Is Not A Second Search (0.2.29)

`exploreLocation`, `exploreHere` and `whatsHere` are thin wrappers over
`searchWorldByLocation`. None of them reimplements position resolution,
the distance test or nearest-first sorting, because a second
implementation would eventually answer a slightly different question.

[Full text](history/0.1-0.2.md#exploring-a-location-is-not-a-second-search-0229)

### "Explore Here" Queries The Camera, Never The Active Document (0.2.29)

`exploreHere` centers its query on the camera's position, never on the
active document's placement. A person may be looking at empty space, or
at something unrelated to the active document, and still want to explore
right there.

[Full text](history/0.1-0.2.md#explore-here-queries-the-camera-never-the-active-document-0229)

### A Tolerance Radius Is What Makes "What's Here?" Answerable From A Camera (0.2.29)

A camera position is continuous and almost never lands exactly on a
recorded placement, so an exact-match query would nearly always return
nothing. "What's Here?" is `exploreHere(NEARBY_RADIUS)`: a small-radius
spatial query rather than coordinate equality.

[Full text](history/0.1-0.2.md#a-tolerance-radius-is-what-makes-whats-here-answerable-from-a-camera-0229)

### The Location Browser's Three Actions Are Existing Operations, Not New Ones (0.2.29)

Focus, Select and Inspect on a location result reuse existing
operations. Focus is `focusDocument()`, Select is `setActiveDocument()`
(no camera move), and neither forks or edits. Inspect never navigates or
loads the document; it only bundles `getDocumentInfo()` and
`getPlacementInfo()`.

[Full text](history/0.1-0.2.md#the-location-browsers-three-actions-are-existing-operations-not-new-ones-0229)

### Discovery And Trust Are Related, But They Are Not The Same Operation (0.2.30)

"Did I find it?" and "should I trust it?" are answered by different
layers. Found documents come from ordinary resolution and are never
hidden, filtered or reordered by trust. Diagnostics are an additional,
parallel observation from an optional trust-capable provider, so even an
unverifiable region still shows its documents.

[Full text](history/0.1-0.2.md#discovery-and-trust-are-related-but-they-are-not-the-same-operation-0230)

### Diagnostics Are Received From The Discovery Layer, Never Invented By The UI (0.2.30)

`DiscoveryDiagnosticsSummary` is a pure function of real counters
recorded during discovery and never fabricates a "valid" or "complete"
claim. It has four states: not available (no trust-capable provider
consulted, the default today), fatal (the index root could not be
trusted), complete (no issues) and incomplete (itemized warnings). "No
documents here", "I know of no documents here" and "documents here, some
untrusted" stay distinct.

[Full text](history/0.1-0.2.md#diagnostics-are-received-from-the-discovery-layer-never-invented-by-the-ui-0230)

### A World Location Is Read From Existing Identity, Never A New Store (0.2.94)

A `WorldLocation` is never persisted and has no ids of its own.
`WorldLocationDirectory.list()` derives each one from identity that
already exists (a `StructurePlacement`'s id and position, or the world
origin). When the placement is deleted, the location simply stops being
listed.

[Full text](history/0.1-0.2.md#a-world-location-is-read-from-existing-identity-never-a-new-store-0294)

### A Camera Focus Never Jumps; It Interpolates Through A Deterministic Path (0.2.94)

Camera moves animate instead of cutting. `CameraFocusAnimator` is a pure
function of `(from, to, durationMs, elapsedMs)` with no clock, renderer
or session state, sampled once per frame. The same inputs give the same
framing on any replica, whatever the frame rate.

[Full text](history/0.1-0.2.md#a-camera-focus-never-jumps-it-interpolates-through-a-deterministic-path-0294)

### A Compass Heading Is Computed From Camera Orientation, Never Stored Or Broadcast (0.2.94)

`computeCompassHeading()` is a pure function of the camera's position
and target, reusing the avatar-facing angle convention (0° faces +Z, 90°
faces +X). It is recomputed on every call and never stored in a
Document, placement or advertisement.

*Changed by 0.3.0:* raw camera orientation may now travel as ephemeral
presence; the heading label still stays local (see "A Compass Heading's
LABEL Stays Local…" in Shared worlds and collaboration).

[Full text](history/0.1-0.2.md#a-compass-heading-is-computed-from-camera-orientation-never-stored-or-broadcast-0294)

### World View Navigation Operates On Spatial Observation, Never On Document Mutation (0.2.94)

`getWorldLocations()`, `focusLocation()`, `goHome()` and
`getCompassHeading()` are read and camera-only operations. They never
touch the active document, selection, inspection, a Document, command
history or any placement. Location is a fourth concept alongside camera
focus, active document and selection: focusing "the House" never makes
its Document the editing target.

[Full text](history/0.1-0.2.md#world-view-navigation-operates-on-spatial-observation-never-on-document-mutation-0294)

### World Navigation Is Position Replacement, Not A Page Stack — Except At The Boundary Into World View (0.9.587)

Entering World View from elsewhere (Editor, Publication Catalog, a URL)
uses `router.push()`, so browser Back returns to where you came from.
Moving between Worlds or refocusing inside World View uses
`router.replace()`, so it behaves like panning a map, not turning pages.
The session keeps no back-stack of its own. Restoring a World's camera
framing comes from `LocalWorldExperienceStore`, separately from
navigation, and a Publication is never kept as navigation state, only
its document id. Custom back-stacks, breadcrumbs and bookmarks are
deliberately not built.

[Full text](history/0.1-0.2.md#world-navigation-is-position-replacement-not-a-page-stack--except-at-the-boundary-into-world-view-09587)

### Exploration Is Derived From Place, Not Stored As Place (0.3.6)

`deriveSpatialContext()` answers "what is around me" from a position,
the seed, loaded `StructurePlacement`s and the presence roster, all
values that already exist. No World state records "Alice is in the
forest", and replicas agree on the context without storing or sending
it.

[Full text](history/0.3-0.7.md#exploration-is-derived-from-place-not-stored-as-place-036)

### Exploration Guides Attention, Never Ownership or Mutation (0.3.9)

`WorldWelcomeContext` and its exploration suggestions are derived and
ephemeral, recomputed on every call and never part of `World#toJSON()`.
There is no welcome message, visit count or recommended location stored
on a World. Choosing a suggestion is ordinary navigation.

[Full text](history/0.3-0.7.md#exploration-guides-attention-never-ownership-or-mutation-039)

### A Focus Context Describes What You Are Looking At; It Does Not Navigate (0.5.8)

`WorldFocusContext` answers "what am I looking at?" the same way from
every surface: a derived, read-only view rebuilt on each call, never
persisted. The words stay distinct: Focus (the noun) shows information,
Go moves the 3D camera, and Map moves the 2D map viewport. A focus
context never navigates; it only lists the actions the host may offer.
"In" is never upgraded to "near", or the reverse.

[Full text](history/0.3-0.7.md#a-focus-context-describes-what-you-are-looking-at-it-does-not-navigate-058)
