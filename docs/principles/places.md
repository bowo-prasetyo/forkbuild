# Principles: Places, landmarks and naming

Each rule links to its full text in [the history](../Principles.md#history).

### A Landmark Is World Content, Not Spatial Presence (0.3.7)

A `WorldLandmark` is the deliberate exception to "exploration is
derived": it is stored in `World#toJSON()`, created by an ordinary
command through `CommandHistory`, and propagated like any other World
content, with no landmark-specific sync code.

[Full text](history/0.3-0.7.md#a-landmark-is-world-content-not-spatial-presence-037)

### Derived Place Describes the World; Landmarks Deliberately Modify Its Meaning (0.3.7)

Derived exploration (terrain, hydrology, nearby structures) says what is
here, identically on every replica, authored by no one. A landmark says
what a place means to someone and is authored content. Surfaces that
show both keep the two visibly distinct.

[Full text](history/0.3-0.7.md#derived-place-describes-the-world-landmarks-deliberately-modify-its-meaning-037)

### Curation Organizes Content; It Does Not Own Content (0.3.8)

`derivePlaceContexts()` groups landmarks, structures and collaborators
by proximity on each call. No group membership is stored, so deleting a
landmark deletes nothing near it, and moving a structure updates no
list.

[Full text](history/0.3-0.7.md#curation-organizes-content-it-does-not-own-content-038)

### Personal Experience Is Not Shared World State (0.3.10)

`LocalWorldExperience` remembers only this replica's camera framing and
perspective from the last visit to a World, in local storage. It is
never a World, Document or placement field and never sent anywhere.

[Full text](history/0.3-0.7.md#personal-experience-is-not-shared-world-state-0310)

### Users Name Places; The World Derives Geography From Names (0.5.0)

A `WorldRegion` is a named area, extending the landmark exception from a
point to an area. Geometry decides containment, never authorship;
`parentRegionId` is informational only. Named content stays separate
from derived content, procedural names are a display option, and naming
needs only ordinary World membership.

[Full text](history/0.3-0.7.md#users-name-places-the-world-derives-geography-from-names-050)

### A World Map Is A Derived View, Never A Second World (0.5.1)

The map projects the same World content everything else reads
(`getMapContent()`) with plain arithmetic. Panning and zooming are local
viewer state, presentation tiers are labels rather than geometry, and
the map refreshes with everything else, not on its own loop.

[Full text](history/0.3-0.7.md#a-world-map-is-a-derived-view-never-a-second-world-051)

### A Name Is A Claim, Not A Fact (0.5.2)

A `PlaceNamingClaim` is one identity's signed opinion about what a
region should be called. It never touches the region, must always be
signed, and carries confidence, never authority. A local display
preference is a third, separate concept. `getDisplayPlaceName()`
combines region, claims and preference for display without storing the
result.

[Full text](history/0.3-0.7.md#a-name-is-a-claim-not-a-fact-052)

### Naming Exchange Distributes Claims; It Never Establishes Truth (0.5.3)

Exchanging claims moves them between replicas and settles nothing. Each
incoming claim is validated, constructed and verified before it is
stored. A claim's own `id` is its exchange identity, and `receivedAt`
lives outside the claim because no signature can cover it.

[Full text](history/0.3-0.7.md#naming-exchange-distributes-claims-it-never-establishes-truth-053)

### Geographic Similarity Suggests Identity; It Never Mutates Identity (0.5.4)

Independently created regions covering the same ground may be grouped as
one candidate place through a quantized geographic fingerprint. A match
is candidacy, never proof: no region is merged or changed, `kind` must
match exactly, and combined name ranking is added alongside the
per-region view.

[Full text](history/0.3-0.7.md#geographic-similarity-suggests-identity-it-never-mutates-identity-054)

### A Geographic Place Is A Derived View, Never A Fourth Stored Object (0.5.5)

The geographic place directory shows candidate groups for browsing. Its
representative region and ordering are presentation choices, "why
grouped together?" only explains existing evidence, and the directory is
read-only.

[Full text](history/0.3-0.7.md#a-geographic-place-is-a-derived-view-never-a-fourth-stored-object-055)

### A Geographic Place Highlights Existing Geometry; It Never Draws New Geometry (0.5.5)

"Show on Map" highlights the regions already drawn that belong to a
candidate. Nothing new is computed or drawn, and no boundary is drawn
around the group.

[Full text](history/0.3-0.7.md#a-geographic-place-highlights-existing-geometry-it-never-draws-new-geometry-055)

### A Geographic Place Is Navigable; It Does Not Become World Content (0.5.6)

You can travel to a geographic place candidate, but it never gets a
stored row in the World, which would turn a candidate into an apparent
fact. Arrival is described as "near", never "in", and one resolution
path is reused everywhere.

[Full text](history/0.3-0.7.md#a-geographic-place-is-navigable-it-does-not-become-world-content-056)

### A Discovered Naming Claim Is Still Just A Claim (0.9.253)

Finding a claim through a relay, peer or other source does not make it
worth more. Discovery says what exists, never what is true, and
discovery, selection and presentation are three separate layers.

[Full text](history/0.9.md#a-discovered-naming-claim-is-still-just-a-claim-09253)

### Proximity Filtering Is Not Ranking, Is Not Conflict Resolution (0.9.255)

Proximity selection keeps claims near the Wanderer and nothing more.
Nearness is not merit, surviving the filter is not winning, and
discovery order passes through unchanged.

[Full text](history/0.9.md#proximity-filtering-is-not-ranking-is-not-conflict-resolution-09255)

### Automatic Discovery Is Not Automatic Adoption (0.9.256)

Walking around now runs discovery and proximity selection automatically.
What becomes observable is still not authoritative: the monitor only
passes results along, and when nothing is known the default is nothing,
never an assumption.

[Full text](history/0.9.md#automatic-discovery-is-not-automatic-adoption-09256)

### Presentation Is Not Adoption (0.9.257)

Showing a nearby claim in World View never presents it as the name. An
empty list means nothing was discovered, not that nothing is named, and
a failure degrades quietly without changing anything.

[Full text](history/0.9.md#presentation-is-not-adoption-09257)

### Navigation Is Not Adoption (0.9.260)

Navigating to a claim moves the camera, never the name, and asks none of
the questions adoption, verification or trust would. If the target
cannot be resolved, there is no fallback guess.

[Full text](history/0.9.md#navigation-is-not-adoption-09260)

### Discovery Makes Adoption Available; It Never Makes Adoption Automatic (0.9.263)

Adopting a nearby claim into the local store is an explicit action built
from existing pieces. It reshapes the whole claim without re-verifying,
re-signing or re-authoring it, never resolves conflicts with other
claims, and a failed adoption leaves no trace. (A companion to
"Automatic Discovery Is Not Automatic Adoption" above.)

[Full text](history/0.9.md#discovery-makes-adoption-available-it-never-makes-adoption-automatic-09263)

### Displaying Metadata Is Not Verifying It (0.9.266)

A field being available on a row is not by itself a reason to render it.
Showing a claim's creation time is fine, but a verification badge would
need a check-only verification path, which is a bigger change than it
looks, since real verification happens only inside the adoption
boundary.

[Full text](history/0.9.md#displaying-metadata-is-not-verifying-it-09266)
