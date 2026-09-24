# Principles: World View and the Editor

Each rule links to its full text in [the history](../Principles.md#history).

### Selection In World View Does Not Imply Editing Authority (0.2.93)

World View can select a `StructurePlacement` but never move, rotate,
duplicate or delete it. The selection it creates has no items, so no
gizmo appears and no transform command can run. Inspection shows plain
read-only data, and the only way to change a placed structure is "Open
Source", which opens its Document in the Editor.

[Full text](history/0.1-0.2.md#selection-in-world-view-does-not-imply-editing-authority-0293)

### World View Observes and Navigates; Editor Mutates and Builds (0.5.9)

World View is for observing and navigating; the Editor is for mutating
and building. This reverses 0.2.1's editor parity on purpose. Every
brick, structure and group mutation (placement, gizmo, transforms,
clipboard, groups) was removed from `WorldNavigationSession`, and World
View no longer builds an action registry, command palette or editing
sidebar. The `EditorSession` already implemented all of it.

Two exceptions stay because they curate the World rather than build
content: Region and Landmark naming at the avatar's position (through
the usual authorization and fork-on-write path), and `movePlacement()`,
which changes a PlacementRecord and never forks. Undo and redo stay for
those. Selection now serves focus and inspection only, and "Edit a Copy"
is the one door from World View into editing.

[Full text](history/0.3-0.7.md#world-view-observes-and-navigates-editor-mutates-and-builds-059)
