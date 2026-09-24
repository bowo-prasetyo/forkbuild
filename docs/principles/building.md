# Principles: Bricks, structures and blueprints

Each rule links to its full text in [the history](../Principles.md#history).

### A Brick Is A Primitive, Never A Preassembled Structure (0.2.80)

A brick definition describes a small, reusable shape (a wall segment, a
roof cap, an arch block), never a specific building. The ladder is
Brick, then Building, then Structure; a vocabulary of one-off building
bricks would have to grow forever.

[Full text](history/0.1-0.2.md#a-brick-is-a-primitive-never-a-preassembled-structure-0280)

### A Brick's Bounding Box Is An Approximation Contract, Not A Shape Description (0.2.80)

A brick's width, height and depth are an axis-aligned bounding box.
Stairs, arches, hip roofs and columns still collide and select as their
box, even where the real mesh is open.

[Full text](history/0.1-0.2.md#a-bricks-bounding-box-is-an-approximation-contract-not-a-shape-description-0280)

### A Mesh Factory's Own Orientation Belongs On The Geometry, Never On mesh.rotation (0.2.80)

`BrickRenderer` always sets `mesh.rotation.y` from the brick's placement
rotation. A factory that needs a fixed orientation bakes it into the
geometry (`geometry.rotateY(...)`), or the renderer will overwrite it.

[Full text](history/0.1-0.2.md#a-mesh-factorys-own-orientation-belongs-on-the-geometry-never-on-meshrotation-0280)

### A Structure Is The Next Rung On The Brick Ladder, Not An Escape From It (0.2.81)

A `Structure` is `{ id, name, category, tags, description, bricks }`,
where `bricks` are ordinary bricks using ordinary brick definitions. A
village house is fifteen wall segments, a door, windows, a slab and so
on, never a special house brick. A Structure has no privileged rendering
or placement of its own.

*Changed by 0.4.0 and 0.4.5:* a Structure can also be copied into the
current document and placed from its library card, not only forked.

[Full text](history/0.1-0.2.md#a-structure-is-the-next-rung-on-the-brick-ladder-not-an-escape-from-it-0281)

### Forking A Structure Records Provenance, Never A Live Dependency (0.2.81)

`metadata.parentStructureId` records which Structure a forked Document
started as, and is never consulted again. The fork gets brand-new brick
instances with fresh ids, so editing, saving or reloading it never reads
from or writes to the library.

[Full text](history/0.1-0.2.md#forking-a-structure-records-provenance-never-a-live-dependency-0281)

### A Structure Placement Transforms Its Content At Render Time, Never At Rest (0.2.90)

A placed structure's bricks are never rewritten into world coordinates.
The renderer composes each brick's local position with the placement's
rotation and position on every render, once at the placement level.

[Full text](history/0.1-0.2.md#a-structure-placement-transforms-its-content-at-render-time-never-at-rest-0290)

### A Missing Placement Target Is Absence, Not An Error (0.2.90)

If a `StructurePlacement`'s document cannot be resolved, the resolver
returns `null` and the placement contributes nothing to rendering or
collision. It is an observation about storage, not a validation failure.

[Full text](history/0.1-0.2.md#a-missing-placement-target-is-absence-not-an-error-0290)

### Selecting An Instance Selects Its Spatial Reference, Never Its Content (0.2.91)

Selecting a placed structure adds a `structure-placement` item to the
one selection system. It selects where the structure is, never its
bricks, which can only be edited through the referenced Document;
brick-based consumers see an empty brick list.

[Full text](history/0.1-0.2.md#selecting-an-instance-selects-its-spatial-reference-never-its-content-0291)

### Duplicating An Instance Is A Spatial Operation; Forking Its Content Is Not (0.2.91)

Duplicating a placed structure creates a new placement referencing the
same document id, never a new Document. Editing that Document changes
every placement of it.

[Full text](history/0.1-0.2.md#duplicating-an-instance-is-a-spatial-operation-forking-its-content-is-not-0291)

### The Interactive Gizmo Dispatches By Selection Kind; It Never Merges Two Gesture Kernels Into One (0.2.92)

Placements get the same gizmo as bricks, but through a second,
independent gesture service implementing the same narrow contract. A
dispatcher picks the service by selection kind; the two kernels are
never merged.

[Full text](history/0.1-0.2.md#the-interactive-gizmo-dispatches-by-selection-kind-it-never-merges-two-gesture-kernels-into-one-0292)

### A Placement's Elevation Is Never A Gizmo Or Numeric Target (0.2.92)

A placement's local Y never changes; terrain height is added only at
render time. The placement gesture service discards Y translation, and
numeric input offers no Y target for placements.

[Full text](history/0.1-0.2.md#a-placements-elevation-is-never-a-gizmo-or-numeric-target-0292)

### Copying Composes A Blueprint; Forking Creates One (0.4.0)

Fork turns a Structure into a new, independent Document with provenance.
Copy inserts the Structure's bricks into the currently open Document as
an ordinary `PasteBricksCommand`, with no provenance and no new command
class. Neither replaces the other, and a copied brick never depends on
its source.

[Full text](history/0.3-0.7.md#copying-composes-a-blueprint-forking-creates-one-040)

### Extraction Copies A Blueprint; It Never Moves One (0.4.2)

Creating a Structure from selected bricks copies them into a new,
independent Structure. The Document's bricks stay exactly where they
are.

[Full text](history/0.3-0.7.md#extraction-copies-a-blueprint-it-never-moves-one-042)

### A Personal Library Persists What Extraction Only Returns (0.4.3)

Saving a Structure is a separate step from extracting it.
`LocalStructureLibraryStore` keeps personal Structures separate from any
World, and deleting one breaks nothing, since nothing depends on it.

[Full text](history/0.3-0.7.md#a-personal-library-persists-what-extraction-only-returns-043)

### Library Membership Is Not Structure Identity (0.4.3)

A Structure's fields stay the same whichever library holds it. There is
no `libraryId` or `personal` flag; a Structure never records its
container.

[Full text](history/0.3-0.7.md#library-membership-is-not-structure-identity-043)

### A Structure Is A Reusable Spatial Composition, Never A Synonym For "Building" (0.4.4)

A Structure is any reusable, named collection of bricks. Market stalls,
gates, fences and docks with no walls at all are Structures too.

[Full text](history/0.3-0.7.md#a-structure-is-a-reusable-spatial-composition-never-a-synonym-for-building-044)

### Buildable Things Share One Placement Experience (0.4.5)

Selecting a brick or a Structure from the Build Library enters the same
Place interaction: preview, transform, validate, commit. What the user
intends ("Place House") and what happens to the Document (copy the
bricks in) are named separately, and each keeps its own tool and
command. Fork is a secondary menu action.

[Full text](history/0.3-0.7.md#buildable-things-share-one-placement-experience-045)

### A Blueprint Package Is Portable Data, Never A Live Dependency (0.4.6)

Sharing a Structure is export and import, never a live link. An imported
package is untrusted input and is validated before anything is built;
every id crossing the boundary is regenerated; and once imported, a
Structure is indistinguishable from a local one.

[Full text](history/0.3-0.7.md#a-blueprint-package-is-portable-data-never-a-live-dependency-046)

### A Structure Has Two Different Forks, And Neither Is A Version Of The Other (0.6.3)

A Document fork creates an editable Document from a Structure; a
Structure fork creates an independent personal Structure with fresh ids
and no Document. Neither is a version of its source, and Structures have
no source or version fields. Making a new version is Place, Modify,
Extract.

[Full text](history/0.3-0.7.md#a-structure-has-two-different-forks-and-neither-is-a-version-of-the-other-063)

### Sorting Is Presentation, Never Identity (0.6.4)

`sortStructures()` is a pure function that returns the same Structures
reordered. It never mutates them or the registry, and the result is
never stored.

[Full text](history/0.3-0.7.md#sorting-is-presentation-never-identity-064)

### Usage History Is Local Presentation Metadata, Never Structure State (0.6.4)

The Build Library's "Recent" list comes from a local, per-device usage
store, never from Structure fields. Placing a Structure consumes it and
creates no live dependency.

[Full text](history/0.3-0.7.md#usage-history-is-local-presentation-metadata-never-structure-state-064)

### A Blueprint Fingerprint Is Derived From Design Content, Never From Local Identity (0.6.5)

Structure and brick ids are local and regenerate on import. A blueprint
fingerprint identifies the design itself, derived from canonicalized
content (bricks, name, category, description) and blind to ids,
timestamps and storage. It is computed on demand and never cached as a
field.

[Full text](history/0.3-0.7.md#a-blueprint-fingerprint-is-derived-from-design-content-never-from-local-identity-065)

### Attribution Is An External Assertion About A Fingerprint, Never Structure State (0.6.5)

A `BlueprintAttribution` is a signed assertion that an identity authored
a design fingerprint. It is never stored in a Structure, a command or a
package, and changes nothing about any Structure. Signing is required,
but it proves only who asserted, never who really made the design.
Nothing is ever called "ownership".

[Full text](history/0.3-0.7.md#attribution-is-an-external-assertion-about-a-fingerprint-never-structure-state-065)

### Attribution Exchange Distributes Assertions; It Never Establishes Who Actually Made A Design (0.6.6)

Exchanging attributions moves signed assertions and establishes nothing
about real authorship. Attributions and design packages stay separate
portable things. A package's claimed fingerprint is never trusted when
the design can be fingerprinted locally, and that cross-check is
optional.

[Full text](history/0.3-0.7.md#attribution-exchange-distributes-assertions-it-never-establishes-who-actually-made-a-design-066)

### Attribution Resolution Ranks Presentation, Never Authorship (0.6.7)

When several attributions exist for one fingerprint, the view orders
them for display but never picks a winner, and never shows "Created by".
Names may compete; authors never do. Arrival time is shown but never
used for ranking.

[Full text](history/0.3-0.7.md#attribution-resolution-ranks-presentation-never-authorship-067)

### Lineage Is A Signed Claim, Never A Fact (0.6.8)

A `BlueprintLineageClaim` ("this design derives from that one") is
exactly as strong as an attribution. A design cannot be derived from
itself, there is no mutable version history, the relationship vocabulary
has one member, and contradictory claims are data, not errors.

[Full text](history/0.3-0.7.md#lineage-is-a-signed-claim-never-a-fact-068)

### Similarity Is Evidence; It Never Becomes Lineage (0.6.8)

A similarity score only suggests a pair for a person to look at. It
never signs, persists or feeds the lineage layer, identical pairs are
excluded, and the UI never asserts lineage on anyone's behalf.

[Full text](history/0.3-0.7.md#similarity-is-evidence-it-never-becomes-lineage-068)
