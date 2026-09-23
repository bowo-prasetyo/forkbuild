# Capability Matrix

This document is the normative reference for editing capability boundaries
between Editor View and World View.

0.2.1 through 0.5.8 held these two surfaces to an EDITING PARITY invariant:
whatever Editor View could mutate, World View could mutate too, through the
same shared action registry. 0.5.9 — World View Read-Only Exploration &
Fork-to-Edit — reverses that invariant on purpose. See
docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
Builds (0.5.9)".

## Editor-Only Editing Surface (0.5.9)

Every one of these now exists ONLY on `EditorSession` — `WorldNavigationSession`
does not expose the method at all (not merely a disabled UI affordance).

| Action             | Editor | World | Published |
|---------------------|--------|-------|-----------|
| select               | ✓      | ✓ (inspection/focus only) | ✓ (inspection only) |
| marquee              | ✓      | ✓ (inspection/focus only) | –         |
| move                 | ✓      | –     | –         |
| rotate               | ✓      | –     | –         |
| numeric transform    | ✓      | –     | –         |
| group / ungroup      | ✓      | –     | –         |
| copy / paste         | ✓      | –     | –         |
| duplicate / repeat    | ✓      | –     | –         |
| delete               | ✓      | –     | –         |
| align / distribute   | ✓      | –     | –         |
| placement (bricks)   | ✓      | –     | –         |
| brick color          | ✓      | –     | –         |
| structure face snapping (0.9.611) | ✓ | – | –   |
| gizmo drag           | ✓      | –     | –         |
| undo / redo          | ✓      | ✓ (Region/Landmark/Animal Decoration commands only) | – |
| save / publish       | ✓      | ✓     | –         |
| export / import document file (0.9.641/0.9.642) | ✓ | – | – |
| focus selection (camera only, 0.9.661) | ✓ | – | – |
| navigation           | ✓      | ✓     | ✓         |

## World View's Own Kept Mutation Surface (deliberate exceptions)

A few capabilities remain on `WorldNavigationSession`, on purpose. None of them
constructs brick, structure or group content:

| Action                          | World | Why it stays |
|----------------------------------|-------|---------------|
| World Region naming (create/update/remove) | ✓ | Avatar-position-driven annotation of the World, not Document construction — the Editor has no notion of "being somewhere in a live World" to build this on. |
| World Landmark naming (create/update/remove) | ✓ | Same reasoning as Region naming. |
| Move a `StructurePlacement`        | ✓ | "Moving A Placement Is Not Editing A Document" (0.2.23) — shared-layout arrangement, never touches the Document/Publication itself. |
| World Animal Decoration (create/remove, the `G` key, 0.9.702/0.9.703) | ✓ | Turns a released animal the avatar is standing next to into decorative World content, or back. Like landmark naming, it depends on being somewhere in a live World. It goes through the same fork-on-write, authorization and command-history path as landmarks, and adds no geometry. |

World View also changes **runtime state that is not document content**: riding
vehicles, storing and deploying them (`Q`), catching and releasing animals (`F`),
and transferring inventory entries to a connected avatar. These change the
avatar's inventory and the local vehicle and animal runtime stores. They never
change a Document, so they are not exceptions to the invariant below.

## Edit a Copy — the door from World View into the Editor

World View is never a dead end. A `WorldFocusContext` for a
REGION/LANDMARK/STRUCTURE (never COLLABORATOR or GEOGRAPHIC_PLACE) offers
`EDIT_COPY`: forks the Document that actually contains the focused target
(for a STRUCTURE, its own content document — never the containing World)
via the same `/editor?fork=` navigation `ui/components/PublicationCatalog.js#forkPublication()`
already used, and opens the fork in the Editor. The original is never
touched. See `application/WorldNavigationSession.js#getPublicationIdForDocument()`
and `tests/WorldViewReadOnlyFork.test.js`.

## Surface-Specific Capabilities

### Editor View
- Document management (new, load, save, publish, export/import a document file)
- Full sidebar with all panels — selection, transform, groups, clipboard, brick color
- Toolbar with save/export/import/publish/new
- Post-publish Distribute dialog
- The ONLY surface with brick/structure/group content mutation

### World View
- Spatial navigation and streaming
- Explore / Map / Places browsing, Focus (0.5.7/0.5.8)
- World Region/Landmark naming (avatar-position-driven annotation)
- World Animal Decorations (bake a released animal into the World, or undo it)
- Moving a StructurePlacement (shared-layout arrangement)
- Timeline / preview / restore (for the Region/Landmark/Animal Decoration commands above)
- Vehicles, inventory and animal catching (runtime state, not document content)
- Distribution of the user's own or encountered Publications (Distribute dialog)
- Camera controls
- "Edit a Copy" — the one way to reach Editor-only mutation from here

### Published World
- Read-only navigation
- Selection (for inspection)
- No editing operations of any kind, in either surface

## Architectural Invariant (0.5.9)

**World View Observes and Navigates; Editor Mutates and Builds.** Every
brick/structure/group content-mutation operation lives on `EditorSession`
alone. `WorldNavigationSession` exposes only read/navigation/focus
operations, plus the deliberate exceptions above (World Region/Landmark
naming, World Animal Decorations, and moving a StructurePlacement). None of
them authors new geometry or composes content. `EditorActionRegistry`/`createStandardActions()`
is no longer constructed by World View at all; there is nothing left in it
a read-only surface could offer.
