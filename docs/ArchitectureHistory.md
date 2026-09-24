# Architecture History

The architecture notes written milestone by milestone, from 0.1.x through
0.3.4, as they were written. They are split into the parts below by
version range. They are a record, not a description of the current
system: later milestones changed or removed parts of what they describe.
For how ForkBuild works now, read docs/Architecture.md. For why each
change was made, read docs/Roadmap.md.

Don't update these files to match the code. Correct them only when they
are wrong about what was true at the time.

## Parts

<!-- parts:start (tests read these in this order through tests/support/DocText.js) -->

| Part | Covers |
|---|---|
| [0.1 to 0.2.14](architecture-history/0.1-0.2.14.md) | The layer overview (core, application, renderer, ui), transform and editing notes through 0.1.50, and durable documents, publishing, placement and collaboration foundations (0.2.0 to 0.2.14) |
| [0.2.15 to 0.2.45](architecture-history/0.2.15-0.2.45.md) | Decentralized discovery, signatures and replication, fork-on-edit, world placement and navigation, the publication catalog and previews, and avatars and presence |
| [0.2.46 to 0.2.83](architecture-history/0.2.46-0.2.83.md) | Local identity and keys, peer connections and messaging, friends, chat and voice, terrain, bricks and structures, and multi-device identity |
| [0.3.0 to 0.3.4](architecture-history/0.3.md) | Collaborative spatial presence and awareness, camera perspectives, walkable structures and vertical navigation |

<!-- parts:end -->

## Names below that no longer exist

These were removed in the 2026-09-23 cleanup passes:

- `InputRouter`'s `ESCAPE_PRIORITY`/`resolveEscapeTarget()`. `EditorView` implements the Escape chain directly.
- `EditorSession#getSelectionCount()`, `snapSelectionToGrid()`, `transformSettings` and
  `replayRecoveredOperation()`.
- `EditorContext`'s camera state and `CAMERA_STATE_CHANGED`; `DocumentState.readOnly`.
- `application/TransformSelectionUseCase.js` (replaced by `SpatialEditingService`) and
  `ui/components/GroupsPanel.js`.
- `EditorActionRegistry`'s `capabilities.canEdit` gate, `getByCategory()` and the `ui.promptCreateStructure()`
  fallback.
- The unused key-up/wheel dispatch chain.
- `IdentityUseCase` `login()`, `logout()`, `protectIdentity()`, `vaultLock()`, `isRevoked()` and
  `getRevocationRecord()`. The `LocalIdentityProvider` methods they wrapped remain.
- `onPolicyChanged()` on the two visibility use cases.
- The separate Nostr Publication Relay Set configuration.

`WorldNavigationSession#getSelectionCount()` and `PublishedWorldSession#getSelectionCount()` still exist.

Since 0.5.9 World View no longer edits bricks. Every passage in the parts above that
describes World View editing, a shared editing surface, or editing parity
between the two views describes 0.1.46–0.5.8 (see docs/Principles.md,
"World View Observes and Navigates; Editor Mutates and Builds (0.5.9)").
