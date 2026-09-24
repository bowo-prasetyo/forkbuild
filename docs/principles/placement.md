# Principles: Placement, world coordinates and overlap

Each rule links to its full text in [the history](../Principles.md#history).

### A Publication Is What; A Placement Is Where (0.2.23)

Title, description, license and content describe what a world is and
live on the Document and Publication. Position describes where it sits
in shared space and lives on a separate PlacementRecord that points to
the Publication. Coordinates never become document metadata, and editing
document properties never moves anything. This is what lets one
publication be placed in more than one location.

[Full text](history/0.1-0.2.md#a-publication-is-what-a-placement-is-where-0223)

### Moving A Placement Is Not Editing A Document (0.2.23)

Repositioning a published world never forks the Publication and never
consults the fork policy. A PlacementRecord has its own lifecycle
(versioned by revision, signed and causally stamped per revision),
separate from a document's fork-on-edit boundary.

[Full text](history/0.1-0.2.md#moving-a-placement-is-not-editing-a-document-0223)

### A Position, Once Assigned, Is A Fact — Not A Projection (0.2.23)

Publishing records a real initial placement
(`InitialPlacementStrategy`), and later queries read that recorded
position instead of recomputing one. The deterministic grid slot remains
only as a fallback for content published before recorded placements
existed.

[Full text](history/0.1-0.2.md#a-position-once-assigned-is-a-fact--not-a-projection-0223)

### World Coordinates Are Absolute; Documents Are Local (0.2.24)

A brick's position means something only inside its own document; a
placement's position means something only in shared world space. Neither
knows about the other. They combine by addition only when an effective
world position is needed (`WorldPlacement.effectiveWorldPosition()`),
which is what lets one unmodified document appear in several places.

[Full text](history/0.1-0.2.md#world-coordinates-are-absolute-documents-are-local-0224)

### Deterministic Placement Is Not Optional (0.2.24)

An algorithm that assigns a publication's initial position must be a
pure function of the publication's own identity. It must never depend on
locally observed state, such as how many publications this node happens
to know, because replicas that have not converged would compute
different positions for the same publication.

[Full text](history/0.1-0.2.md#deterministic-placement-is-not-optional-0224)

### A World Unit Is One Meter (0.9.548)

World space has a canonical origin `(0, 0, 0)` shared by every replica
and a fixed right-handed axis convention: `+X` right, `+Y` up, `+Z`
toward the viewer, ground at `Y = 0`. One World Unit is one meter. The
contract covers length and quantities derived from it (position,
distance, dimensions, speed, acceleration). It does not make every
number in the World model a physical measurement, and tuned gameplay
constants are not claims about real physics.

[Full text](history/0.1-0.2.md#a-world-unit-is-one-meter-09548)

### Overlap Is A Fact; Collision Is A Policy Decision (0.2.25)

Two placements at the same position are not invalid in themselves, so
position is deliberately not unique. Detecting overlap
(`core/SpatialOverlap.js`) is separate from deciding whether it is
acceptable (`core/SpatialAllocationPolicy.js`). Overlap is computed on
demand, never stored, and two validly signed placements that overlap are
both still valid.

[Full text](history/0.1-0.2.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)

### The Default Policy Is WARN, Not Silent Correction (0.2.25)

When a person explicitly asks for an occupied position, the system shows
what is already there and asks before acting; it never silently
substitutes another coordinate. Automatic placement at publish time
stays ALLOW, because nobody is present to ask and placement must never
block an otherwise successful publish.

[Full text](history/0.1-0.2.md#the-default-policy-is-warn-not-silent-correction-0225)

### Automatic Collision Resolution Is Deferred, Not Solved (0.2.25)

Automatic placement does not probe for a nearby empty cell. Whether a
cell is occupied can only be answered from what a replica has discovered
so far, so two replicas would resolve the same collision to different
positions. Any future resolution needs its own globally reproducible
design.

[Full text](history/0.1-0.2.md#automatic-collision-resolution-is-deferred-not-solved-0225)

### Geometric Collision Is A Later Question (0.2.25)

Only origin collision (two placements at exactly the same coordinate) is
detected. Intersection of spatial bounds at different origins is a
harder problem (rotation, scale, how much overlap counts) and is
deliberately left for a later, separate decision.

[Full text](history/0.1-0.2.md#geometric-collision-is-a-later-question-0225)
