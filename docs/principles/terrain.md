# Principles: Terrain, water and nature

Each rule links to its full text in [the history](../Principles.md#history).

### Terrain Is A Pure Function Of World Coordinates And A World Seed, Never Persisted State (0.2.76)

`terrainHeightAt(seed, x, z)` depends only on its arguments: no
randomness, clock, mutable state or storage. Terrain is `f(seed, x, z)`,
never a lookup in stored data, so the ground never runs out and every
replica computes the same height at the same point.

[Full text](history/0.1-0.2.md#terrain-is-a-pure-function-of-world-coordinates-and-a-world-seed-never-persisted-state-0276)

### Terrain Elevation Is A Rendering-Time Offset, Never A Presence Or Placement Fact (0.2.76)

Placement and presence positions keep ground level at `y = 0`. The
renderer adds terrain height to a mesh's Y only when drawing it, and
never writes it back where a domain object could see it.

[Full text](history/0.1-0.2.md#terrain-elevation-is-a-rendering-time-offset-never-a-presence-or-placement-fact-0276)

### The Terrain Height Field Is The Shared Authority; The Renderer Is An Adapter, Not The Owner (0.2.77)

The pure `terrainHeightAt()` in `core/TerrainHeightField.js` is the one
authority for elevation. The renderer's method is only a pass-through,
and movement code imports the core function directly, with no Three.js
dependency.

[Full text](history/0.1-0.2.md#the-terrain-height-field-is-the-shared-authority-the-renderer-is-an-adapter-not-the-owner-0277)

### Terrain Walkability Is A Movement Constraint, Never A Physics Slope (0.2.77)

`isWalkableSlope()` only decides whether a step's slope is within the
walkable limit. A too-steep step is simply not taken: no sliding, force
or momentum, and a jump or fall already in progress continues.

[Full text](history/0.1-0.2.md#terrain-walkability-is-a-movement-constraint-never-a-physics-slope-0277)

### Terrain Requires No Streaming Concept; Collision Does (0.2.77)

Collision needs to know which documents are loaded; terrain does not,
because height can be computed for any coordinate. The terrain
constraint takes no loaded documents or query radius and is always
built.

[Full text](history/0.1-0.2.md#terrain-requires-no-streaming-concept-collision-does-0277)

### Terrain Surface Color Is A Function Of World Coordinates, Never Tile Coordinates (0.2.79)

`surfaceColorAt(seed, x, z)` knows nothing about tiles, so neighboring
tiles streamed independently agree exactly at their shared edge.

[Full text](history/0.1-0.2.md#terrain-surface-color-is-a-function-of-world-coordinates-never-tile-coordinates-0279)

### Terrain Surface Color Is Deliberately Restrained; Buildings And Avatars Are The Visual Focus (0.2.79)

The terrain palette is low-saturation and mid-value, and brightness
variation shifts all channels together. Terrain is background and
context; buildings and avatars are what people should look at.

[Full text](history/0.1-0.2.md#terrain-surface-color-is-deliberately-restrained-buildings-and-avatars-are-the-visual-focus-0279)

### Ecology Is A Third Pure Function Layered On Terrain, Never A New Ground Truth (0.2.88)

`ecologyZoneAt(seed, x, z)` consults the terrain surface category and
adds two low-frequency noise fields. Each layer is another pure function
of `(seed, x, z)`, so ecology zones always match the terrain beneath
them.

[Full text](history/0.1-0.2.md#ecology-is-a-third-pure-function-layered-on-terrain-never-a-new-ground-truth-0288)

### Natural Features Are Sampled, Never Stored (0.2.88)

Trees are recomputed from a fixed, jittered lattice keyed on `(seed, x,
z)`; there is no stored tree record. Forests can stream in and out
endlessly without writing anything, and every replica sees the same
trees.

[Full text](history/0.1-0.2.md#natural-features-are-sampled-never-stored-0288)

### Tree Density Is Independent Of The Zone That Gates It, So Cover Fades Instead Of Stopping (0.2.88)

Tree density has its own noise field, separate from the moisture that
decides forest versus grassland. Dense thresholds inside forest and
sparse ones in grassland make forests thin out gradually instead of
ending in a hard line.

[Full text](history/0.1-0.2.md#tree-density-is-independent-of-the-zone-that-gates-it-so-cover-fades-instead-of-stopping-0288)

### Hydrology Is A Fourth Pure Function Layered On Terrain, Sibling To Ecology, Never A New Ground Truth (0.2.89)

Hydrology answers where water collects and flows. Lakes mirror the
terrain's WATER category exactly, and rivers use their own noise field.
Hydrology is ecology's sibling: both consult the terrain surface
independently, and neither imports the other. (The same pattern as the
ecology rule above.)

[Full text](history/0.1-0.2.md#hydrology-is-a-fourth-pure-function-layered-on-terrain-sibling-to-ecology-never-a-new-ground-truth-0289)

### A River Is A Bounded, Local Channel Field, Never A Global Drainage Simulation (0.2.89)

Real drainage cannot be computed locally in an infinite world without
storing a network or unbounded cost. `isRiverAt()` is deliberately a
different kind of function, a domain-warped noise band, not an
approximation waiting to be replaced.

[Full text](history/0.1-0.2.md#a-river-is-a-bounded-local-channel-field-never-a-global-drainage-simulation-0289)

### A Lake Is Rendered Geometry; A River Is Ground Color (0.2.89)

A lake is still water at one constant level, drawn as a flat plane at
`LAKE_SURFACE_HEIGHT` and sunk below the terrain where there is no
water. A river is expressed as ground color. Every vertex is still
placed from its own world coordinates, so tiles need no seam handling.

[Full text](history/0.1-0.2.md#a-lake-is-rendered-geometry-a-river-is-ground-color-0289)

### Wildlife Is A Fifth Pure Function Layered On Terrain, Sibling To Natural Features, Never A New Ground Truth (0.9.667)

`wildlifeInRegion()` consults the ecology zone (forest hosts deer,
grassland hosts rabbits, other zones none) and vetoes rivers. It is a
sibling of natural features: animal positions never depend on tree
positions.

[Full text](history/0.1-0.2.md#wildlife-is-a-fifth-pure-function-layered-on-terrain-sibling-to-natural-features-never-a-new-ground-truth-09667)

### A Sparser Population Is A Coarser Lattice And Stricter Thresholds, Never A Second Kind Of Gate (0.9.667)

Wildlife is rarer than trees only through parameters: a coarser lattice
(10, still dividing the terrain tile size) and stricter density
thresholds. There is no second placement algorithm, tree exclusion or
population cap.

[Full text](history/0.1-0.2.md#a-sparser-population-is-a-coarser-lattice-and-stricter-thresholds-never-a-second-kind-of-gate-09667)

### Water Depth Is Still A Rendering-Time Offset (0.9.615, 0.9.634)

`AvatarPresence.position.y` never learns about lakes. The lakebed and
lake surface are applied only where the avatar is drawn. Water affects
movement only through a stateless depth gate and a speed factor, both
recomputed every tick; there is no swim state. A vehicle's position
already includes terrain height, so render code must not add it again
for a rider.

[Full text](history/0.9.md#water-depth-is-still-a-rendering-time-offset-09615-09634)
