A structure library is a plain object with an id and a list of
Structures:

    { id, structures: [ new Structure({ id, name, category, tags, description, bricks }) ] }

Structures (core/Structure.js) are pure data — id, name, category, tags,
description, and a flat array of ordinary core/Brick.js instances
positioned in the Structure's own local coordinate space. No world
placement, no terrain, no StructureBuilder/StructureEngine/
StructureRuntime subsystem. A Structure's "dimensions" are never stored
— core/SpatialBounds.js#fromBricks(structure.bricks, brickRegistry)
derives them fresh from the bricks + the live BrickRegistry, the same
way a World's bounds always were (SpatialBounds#fromWorld is now a thin
wrapper over fromBricks).

Every brick a Structure places must be an ordinary, already-registered
BrickDefinition id — "village:house" is composed entirely of core:*
bricks (wall_1x3, slab_4x4, roof_hip, door, window_large, ...), never a
special "House" brick. See docs/Principles.md, "A Brick Is A Primitive,
Never A Preassembled Structure" — a Structure is the next rung up that
same ladder, not an exception to it.

Structure libraries register with the StructureRegistry
(core/StructureRegistry.js) at startup, the same shape
docs/BrickLibrary.md already documents for BrickRegistry:

    registry.register(VillageLibrary);
    registry.register(SomeCommunityStructureLibrary);

StructureRegistry is a catalog: get(id), has(id), getAll(),
getByCategory(category), search(tags), groupByCategory() —
byte-for-byte the same contract BrickRegistry offers, one rung up.
groupByCategory() (0.2.84) is the one method BrickRegistry got first
(0.2.80) — deferred here until the Build Library needed Structures to
group the same way Bricks already did; getAll(), getByCategory(), and
search() are unchanged since 0.2.81.

core/library/VillageLibrary.js (namespaced "village:structure", mirroring
docs/BrickIDs.md's own "library:brick" convention) is the current built-in
structure library. 0.2.81 shipped six structures; 0.4.4 (Village Library
Expansion) grew the same library to twenty, across five categories —
content only, no new architecture, no new brick primitive:

    residential      village:house, village:cottage, village:large_house,
                      village:tool_shed
    agricultural      village:barn, village:mill, village:stable,
                      village:granary, village:silo
    commercial         village:market, village:market_stall
    community          village:village_hall, village:pavilion,
                      village:small_chapel
    infrastructure     village:well, village:bridge, village:village_gate,
                      village:watchtower, village:fence_segment,
                      village:dock

Five of those twenty (village:market_stall, village:pavilion,
village:village_gate, village:fence_segment, village:dock) place zero
wall_1x3 bricks — deliberately: see docs/Roadmap.md, 0.4.4, "Structure
!= Building."

## Forking a Structure

application/ForkStructureUseCase.js turns a Structure into a brand-new,
independent Document:

    const document = new ForkStructureUseCase().execute(structure, identityProvider);
    editorSession.openDocument(document);   // the SAME editor — no second UI

The fork gets a fresh document identity (world.id) and fresh brick
identities throughout — every Brick placed into the new Document is a
newly constructed instance, never one of the library Structure's own
Brick objects, so nothing about editing a fork can ever mutate the
library. `document.metadata.parentStructureId` records which Structure
the fork came from (core/DocumentMetadata.js) — provenance only, never a
live dependency: editing, saving, or reloading a fork never reads from
or writes back to the Structure it was forked from, and the Structure
keeps existing (and forkable again) exactly as it was, indefinitely.

Forking a Structure does NOT create a WorldPlacement — forking is a
content operation, placing is a spatial operation, the exact separation
application/ForkPublishedWorldUseCase.js already draws for published
worlds. A forked Document is placed in the World like any other document,
whenever that becomes a separate, later action.

ui/components/BuildLibraryPanel.js (0.2.84; replaces the earlier
standalone ui/components/StructureLibraryPanel.js) is the UI surface
today: the Structures tab of the unified "Build Library," grouped by
category via groupByCategory() above, searchable by name/category/tag,
each entry showing a small rendered preview (application/
LibraryPreviewService.js, same BrickRenderer/ThreeBrickFactory pipeline
every Structure's bricks already render with) and a Fork button, wired
through EditorSession.forkStructure(structure) (application/
EditorSession.js) — which forks, then calls the session's own
openDocument(), the identical path Load and "Fork Published World"
already use. There is no separate structure-editing mode. Clicking Fork
is the only action a Structure entry offers — nothing in the Build
Library ever places a Structure directly into the current document,
exactly as 0.2.81 established.

## Placing a Document as a Structure (0.2.90)

Forking produces an ordinary, independent Document — nothing about that
Document knows it started life as a library Structure beyond
`metadata.parentStructureId`, a provenance label, per "Forking a
Structure" above. 0.2.90 answers the question 0.2.81 deliberately left
open next: once you have such a Document (or any other saved Document —
placing has nothing to do with a Structure library specifically), how do
you put it INTO the World you're currently building, more than once,
without copying its bricks?

`core/StructurePlacement.js` is a lightweight spatial REFERENCE — `id`,
`documentId`, `position`, `rotation` — mirroring `core/WorldPlacement.js`
one rung down (which places a whole published World in shared global
space); a StructurePlacement places one Document inside another
Document's own `core/World.js`, alongside its ordinary Buildings and
Groups. It never owns bricks. `application/StructureDocumentResolver.js`
resolves `documentId` to its CURRENT content fresh from storage on every
call — there is exactly one authoritative representation of a
structure's bricks, never a cached copy that could drift out of sync
with the Document itself. This is what makes multiple placements of the
SAME Document genuinely useful: fork House once, place it at A and at B
with independent positions and rotations, edit House later, and both
instances reflect the edit the next time anything resolves them — see
docs/Principles.md, "A Structure Placement References Content, It Never
Copies It."

The entry point is deliberately the simplest one available rather than a
new document browser: `ui/components/Toolbar.js`'s existing Recent
Documents dropdown gains a Place button beside the pre-existing Load —

    editorSession.placeDocument(doc.id, doc.title);

— which enters `ToolId.PLACE_STRUCTURE` mode, a dedicated
`application/tools/StructurePlacementTool.js` (a separate `Tool` from
`PlacementTool`, not a mode flag on it — what's being placed, what
decides validity, and what gets committed all diverge). Hovering the
ground shows a text hint (`StructurePreviewState`/`StructurePreviewUseCase`
— there is no 3D ghost mesh preview yet, see docs/Roadmap.md, 0.2.90's
own "deliberately not" list); 'R'/Shift+R rotate the pending placement in
90° increments, following the exact "orient once, place a row" workflow
0.2.87 established for ordinary bricks; a click commits a
`PlaceStructureCommand`, exactly like `PlaceBrickCommand` one rung down,
with the same undo/redo and CommandRegistry serialization support.
Collision is conservative and AABB-only
(`application/StructurePlacementValidator.js`, translate-only, rotation
ignored — the same V1 simplification `core/SpatialBounds.js` already
declared for whole-World bounds) against both ordinary bricks and other
placements.

Rendering resolves and composes at RENDER TIME only —
`renderer/WorldRenderer.js` rotates each resolved Brick's local position
around the origin by the placement's own rotation, translates by the
placement's own position, then applies the containing document's own
terrain offset exactly as it already does for ordinary bricks (0.2.76) —
so a placed structure always arrives as one rigid, upright, undeformed
unit. Placement meshes are tracked separately from `meshRegistry` and are
NOT yet pickable — selecting, moving, rotating, duplicating, or deleting
an already-placed instance through the viewport is "0.2.91 — World
Editing / Placement Management," a deliberately later milestone; 0.2.90
is the data model and reliable rendering of instances only. Removing a
placement (`application/commands/RemoveStructurePlacementCommand.js`)
never touches the Document it referenced — a placement and its content
are two different lifecycles, exactly as removing a Brick never touches
the BrickDefinition it was an instance of.

## Copying a Structure Into the Current Document (0.4.0)

Forking (above) and Placing (0.2.90, above) both let a Structure or
Document be reused without hand-recreating its bricks, but neither puts
a Structure's own bricks INTO the document you already have open — Fork
opens a brand-new Document; Placing references a whole separate
Document from within a World. 0.4.0 (Structure Composition & Blueprint
Library) answers the remaining question: how do I fold a Structure's
bricks directly into the document I'm already building, so House + Well
+ Barn become one larger blueprint under one undo history? See
docs/Principles.md, "Copying Composes A Blueprint; Forking Creates One
(0.4.0)."

`application/CopyStructureIntoDocumentUseCase.js` turns a Structure into
ONE `PasteBricksCommand` (0.1.42) — the same command a clipboard paste
already produces, reused rather than duplicated (see that use case's own
header for why no parallel `PasteStructureCommand` exists):

    const command = new CopyStructureIntoDocumentUseCase().execute(structure, {
        worldId: document.world.id,
        buildingId: document.world.getBuildings()[0].id,
        world: document.world,
        registry: brickRegistry
    });
    commandHistory.execute(command);   // one undo entry, however many bricks

`EditorSession.copyStructureIntoDocument(structure)` wraps this the same
way `paste()` already wraps `PasteClipboardUseCase` — same "document and
CommandHistory must exist" guard, same single execute() call. Positioning
(Composition Offset) is deterministic, not manual: copying into an EMPTY
document keeps the Structure's own untranslated local geometry (so
copying House into a blank document produces byte-identical bricks to
forking House); copying into a document that already has content appends
the new Structure just past the document's current occupied footprint
along X (`core/SpatialBounds.js#fromWorld()`/`#fromBricks()` — the same
derived-bounds math `core/Structure.js` already uses for itself), so
composing several structures never requires picking coordinates by hand
and never overlaps what's already there.

`ui/components/BuildLibraryPanel.js` offers Copy Into Document beside
Fork As New Document on every structure entry — Fork still emits `fork`
exactly as before. Copying carries no provenance field: a copied brick
is an ordinary brick in the current document, indistinguishable from
one placed by hand the instant it lands — composition is about what the
current blueprint now contains, never about where each piece came from.

## Interactive Structure Composition (0.4.1)

0.4.0 named its own gap in "Deliberately excluded": Copy Into Document
committed immediately, at the deterministic auto-offset position, with
no way to see or adjust where a Structure would land before it did.
0.4.1 closes that gap by turning Copy into an interactive ghost-preview
placement flow, reusing `application/tools/StructurePlacementTool.js`'s
own 0.2.90 UX one rung over rather than inventing a second placement
mechanism — see `application/tools/StructureCompositionTool.js`'s own
header.

Copy's own emitted `copy` event now wires to
`EditorSession.beginStructureComposition(structure)`, which sets
`EditorContext.activeComposition` and switches to the new
`COMPOSE_STRUCTURE` tool — it never touches the Document itself. The
tool seeds its ghost preview at exactly the same deterministic position
`CopyStructureIntoDocumentUseCase#defaultTransform()` already computed
for the 0.4.0 immediate-copy path, so "Copy Into Document" always
previews where the non-interactive path would have placed it before the
user moves anything. From there:

- Hovering the ground moves the ghost (`PlacementPositionService#calculateStructureGround()`,
  shared with `StructurePlacementTool`).
- `R`/`Shift+R` rotates the ghost in exact 90° steps — the SAME
  rotation convention (and the same `application/TransformMath.js`
  formula) every other rotation gesture in this codebase already uses.
- Collision reuses `application/StructurePlacementValidator.js`
  unchanged — the Structure's own AABB checked against the World's
  existing bricks and `StructurePlacement`s; an occupied position tints
  the ghost and refuses to commit.
- Clicking a valid position commits through the exact same
  `CopyStructureIntoDocumentUseCase#execute()` 0.4.0 already used, now
  passed an explicit `transform: { position, rotation }` instead of
  falling back to `defaultTransform()` — still ONE `PasteBricksCommand`,
  still no `PasteStructureCommand`, still no provenance field. Preview
  and commit resolve through the SAME
  `application/StructureCompositionTransform.js#transformStructureBricks()`
  pipeline, so the ghost is a visualization of the exact command that
  will run, never an approximation of it.
- `Escape` cancels with zero Document mutation. Composing is one-shot —
  unlike `StructurePlacementTool`, which stays active for placing the
  same structure repeatedly, committing or cancelling a composition
  returns to Select; "compose House once" is closer to a paste gesture
  than a placement mode.

`renderer/CompositionPreviewRenderer.js` renders the ghost — a sibling
of `renderer/StructurePreviewRenderer.js` that never needs a
`StructureDocumentResolver`: a library Structure's bricks are already
in hand (no Document reference to resolve), so the ghost is built
straight from `structure.bricks`.

A built-in structure library rich enough to make composition genuinely
useful (more categories, more structures per category), a User
Blueprint Library ("Save As Blueprint" from the current document), and
generated preview thumbnails remain out of scope here — see
docs/Roadmap.md, 0.4.1's own "Deliberately excluded."

## Structure Extraction & Blueprint Creation (0.4.2)

0.4.0/0.4.1 only ever moved content ONE direction: a library Structure
into the document a user already has open. 0.4.2 closes the loop —
turning bricks a user has already composed back into a reusable
Structure:

    Structure --copy/compose--> Document --extract--> Structure

`application/CreateStructureFromSelectionUseCase.js` reads a selection
(`application/editor-state/SelectionState.js`) out of a Document and
returns a brand-new `core/Structure.js` instance — pure observation, the
same "no UI, no persistence, no World mutation" restraint
`application/CopySelectionUseCase.js` already applies to the clipboard:

    const farmstead = new CreateStructureFromSelectionUseCase().execute(selection, document, {
        registry: brickRegistry,
        name: 'Farmstead',
        category: 'residential',
        tags: ['farmstead'],
        description: 'House, well and barn compound'
    });

`EditorSession.createStructureFromSelection(metadata)` wraps this the
same way `copySelection()` already wraps `CopySelectionUseCase` — reads
the current selection and the open Document, touches neither. The
returned Structure isn't saved anywhere by this call: nothing here adds
it to the `StructureRegistry` or writes it to storage. A Personal
Blueprint Library to save it into is 0.4.3's own question, not this
milestone's.

**Normalization.** The selection's own minimum X/Z occupied bounds
become the new Structure's local origin — the exact same
`core/SpatialBounds.js#fromBricks()` math `core/Structure.js` and
`CopyStructureIntoDocumentUseCase` already use, never a second bounds
calculation. Y is left exactly as authored (every built-in Structure
already measures Y from the ground up), so extracting the same shape is
deterministic no matter where in the Document it was composed. See
docs/Principles.md, "Extraction Copies A Blueprint; It Never Moves One
(0.4.2)."

**Selection rule: brick selections only.** A `StructurePlacement`
selection (0.2.93) is a reference to an entirely different Document —
extraction refuses it outright, throwing `"Create Structure requires
brick selections only."` rather than silently dereferencing and
flattening someone else's whole Document, or silently doing nothing.

**Copy, never move.** After extraction, the Document it read from is
exactly what it was before the call — same bricks, same ids, same
geometry. The new Structure's bricks are fresh instances with fresh
ids, never references to the Document's own bricks.

`application/EditorActionRegistry.js` exposes this as `structure.createFromSelection`
("Create Structure") in a new `Structure` category, gated exactly like
`clipboard.copy` except a `StructurePlacement` selection, which is never
eligible — reachable today from the Command Palette (0.1.50), where
every registered action already renders with no per-action wiring
needed. `ui/views/EditorView.js#actionUi.promptCreateStructure()`
captures Name/Category/Description with the same `window.prompt()`
pattern `ui/components/GroupsPanel.js` already uses for a group's name;
author, version, and generated thumbnails are deliberately not asked
for here — they belong to the Personal Blueprint Library (0.4.3), not
the extraction mechanic itself.

A round trip through the whole recursive loop — build, extract, fork
the extraction, copy the extraction, compose it alongside others, and
repeat the whole pipeline a second time to confirm the result is
deterministic — is `tests/StructureExtraction.test.js`'s own flagship
coverage.

## Personal Blueprint Library (0.4.3)

0.4.2 answered "can I turn what I just built into something reusable?"
but stopped at `createStructureFromSelection()` returning a valid
Structure — it is never saved anywhere by that call. 0.4.3 gives it
somewhere to go: `application/LocalStructureLibraryStore.js`, a local,
per-device catalog of the user's OWN Structures, architecturally separate
from both the shared World (`World`/`Document`/`Command`) and the
built-in Village Library (`core/StructureRegistry.js`/
`core/library/VillageLibrary.js`):

    Shared World          Built-in Library         Personal Library
      World / Documents /    StructureRegistry          LocalStructureLibraryStore
      Commands                (VillageLibrary)            (user's own Structures)

A personal blueprint is reusable content, not shared World state — see
docs/Principles.md, "A Personal Library Persists What Extraction Only
Returns (0.4.3)."

**No new domain object.** `LocalStructureLibraryStore` stores ordinary
`core/Structure.js` values — the exact same class the built-in library
already uses and `CreateStructureFromSelectionUseCase` already returns.
Nothing here adds a `libraryId` or a `personal: true` field to `Structure`
itself; see docs/Principles.md, "Library Membership Is Not Structure
Identity (0.4.3)." `core/groupStructuresByCategory.js` is a small, pure
grouping helper extracted from `StructureRegistry#groupByCategory()`
specifically so the personal library's own `groupByCategory()` groups its
contents exactly the same way the built-in one always has, rather than a
second grouping loop.

**Basic operations**, backed by the same `StorageProvider` (`storage/
LocalStorageProvider.js` in the browser) `application/LocalWorldExperienceStore.js`
(0.3.10) already uses for its own per-device state:

    addStructure(structure)
    getStructure(id)
    hasStructure(id)
    listStructures()                 // most-recently-saved first
    removeStructure(id)
    updateStructureMetadata(id, { name, category, tags, description })
    groupByCategory()                 // same [{ category, structures }] shape as StructureRegistry
    search(tags)                      // same contract as StructureRegistry#search()

`application/CreatePersonalStructureLibraryUseCase.js` is the composition-
root factory — the same shape `application/CreatePersistenceUseCase.js`
and `application/CreateWorldViewUseCase.js` already establish for their
own local-only stores.

**Saving, chained, not folded in.** `EditorSession.saveStructureToPersonalLibrary(structure)`
is always called SEPARATELY, after `createStructureFromSelection()` has
already returned a valid Structure — extraction itself stays exactly the
pure, unpersisted observation 0.4.2 made it:

    const structure = editorSession.createStructureFromSelection(metadata);  // 0.4.2, unchanged
    editorSession.saveStructureToPersonalLibrary(structure);                 // 0.4.3, chained after

`application/EditorActionRegistry.js`'s `structure.createFromSelection`
action performs exactly this chain, then calls the optional
`ui.onPersonalLibraryChanged()` hook so a surface that offers one (like
`ui/views/EditorView.js`) can refresh its own list immediately. The 0.4.0
→ 0.4.3 workflow this completes:

    Select bricks -> Create Structure -> metadata dialog ->
        Personal Library -> Structure appears immediately -> Compose/Fork

**UI.** `ui/components/BuildLibraryPanel.js` renders a "My Structures"
section beneath the built-in category groups, reusing the identical
`BuildLibraryPreview`, search, and Copy Into Document/Fork As New
Document actions a Village entry already offers — a personal Structure
composes and forks through the exact same `EditorSession` methods as a
built-in one. Two actions are personal-library-only: Rename and Remove;
Village stays read-only, exactly as it always has.

**Deletion never touches a Document.** By the time a Structure's bricks
are inside a Document (via Copy or Fork), they are ordinary bricks —
structurally incapable of noticing their source Structure was ever
removed from the library, the same copy-not-reference guarantee 0.4.0/
0.4.2 already established one rung down. `tests/PersonalStructureLibrary.test.js`
proves this directly: compose a Structure into two independent Documents,
delete it from the library, and assert both Documents are byte-identical
to before the deletion.

**No in-place editing.** A saved Structure stays immutable/value-like —
`updateStructureMetadata()` only ever changes name/category/tags/
description, never bricks. Changing what a Structure actually builds
always goes back through the existing loop: Compose it into a Document,
modify that Document, Extract a NEW Structure, save it (optionally under
a new name, e.g. "Farmstead Deluxe") — never a direct mutation of the
original.

**Local, not synchronized (yet).** A Personal Structure Library is
per-device application state, exactly like `LocalWorldExperience`
(0.3.10) — a user's "My Structures" on desktop and on a tablet can
legitimately differ today. Making personal blueprints follow a user
across devices is a deliberately separate, later milestone — see
docs/Roadmap.md, 0.4.3's own "Deliberately excluded."

## Unified Build Placement (0.4.5)

Every UI reference above to "Copy Into Document beside Fork As New
Document" describes how `ui/components/BuildLibraryPanel.js` looked
through 0.4.4. As of 0.4.5, a structure card's whole click target is
Place — the same click-a-card-to-place interaction a Brick card already
offered — emitting `place-structure` (handled by the same
`EditorSession#beginStructureComposition()` → `StructureCompositionTool`
→ `CopyStructureIntoDocumentUseCase` path 0.4.0/0.4.1 already built).
Fork As New Document, and — for a personal Structure — Rename and
Remove, moved into a small secondary "⋮" menu on the card rather than
sitting beside Place as competing buttons. Nothing about composing,
forking, extracting, or personally storing a Structure changed; see
docs/Roadmap.md, 0.4.5, and docs/Principles.md, "Buildable Things Share
One Placement Experience (0.4.5)."
