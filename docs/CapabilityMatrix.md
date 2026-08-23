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
| gizmo drag           | ✓      | –     | –         |
| undo / redo          | ✓      | ✓ (Region/Landmark commands only) | – |
| save / publish       | ✓      | ✓     | –         |
| navigation           | ✓      | ✓     | ✓         |

## World View's Own Kept Mutation Surface (deliberate exceptions)

Two capabilities remain on `WorldNavigationSession`, on purpose — neither is
brick/structure/group content construction:

| Action                          | World | Why it stays |
|----------------------------------|-------|---------------|
| World Region naming (create/update/remove) | ✓ | Avatar-position-driven annotation of the World, not Document construction — the Editor has no notion of "being somewhere in a live World" to build this on. |
| World Landmark naming (create/update/remove) | ✓ | Same reasoning as Region naming. |
| Move a `StructurePlacement`        | ✓ | "Moving A Placement Is Not Editing A Document" (0.2.23) — shared-layout arrangement, never touches the Document/Publication itself. |

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
- Document management (new, load, save, publish)
- Full sidebar with all panels — selection, transform, groups, clipboard
- Toolbar with save/publish/new
- The ONLY surface with brick/structure/group content mutation

### World View
- Spatial navigation and streaming
- Explore / Map / Places browsing, Focus (0.5.7/0.5.8)
- World Region/Landmark naming (avatar-position-driven annotation)
- Moving a StructurePlacement (shared-layout arrangement)
- Timeline / preview / restore (for the Region/Landmark commands above)
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
operations, plus the two deliberate exceptions above (World Region/Landmark
naming, and moving a StructurePlacement) — neither of which authors new
geometry or composes content. `EditorActionRegistry`/`createStandardActions()`
is no longer constructed by World View at all; there is nothing left in it
a read-only surface could offer.
