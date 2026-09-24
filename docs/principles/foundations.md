# Principles: Foundations (0.1.x to 0.2.16)

The short rules written before principles had their own headings. Each
links to the full text in [the history](../Principles.md#history).

## Architecture

- Core modules must not depend on infrastructure.
- Everything is replaceable through interfaces.
- The browser is a client, not the owner of the game state.
- The ForkBuild Protocol is platform-independent, and it is versioned
  independently from the application.
- Build small, refactor often, keep every milestone runnable.
- Prefer composition over inheritance.
- **Application orchestrates; Core provides capabilities.** Use cases,
  wiring and editor workflows live in `application/`. Domain data, rules and
  the event machinery Core uses to announce changes live in `core/`.
- **Event vocabulary lives at the lowest layer that both publisher and
  subscribers can reach.** `DomainEvent` and `EditorEvent` live in `core/`
  because `renderer/` listens to them; `CommandHistoryEvent` lives in
  `application/` because both sides are already there. The question is who
  is listening, not a fixed folder.
- **A behavior with two surfaces needs one math source (0.1.47).** When
  keyboard and pointer must agree, they share one module (`TransformMath`).
  Delete the second copy rather than test both harder.
- **Inject across a boundary; never import upward (0.1.47).** When a lower
  layer needs higher-layer logic, the higher layer hands it down. If a
  second lower-layer consumer appears, move the shared file down into
  `core/`; never copy it.

## Editing

- **Actions are not commands (0.1.50).** An Editor Action describes an
  available operation. `CommandHistory` records only document and world
  mutations; the action registry is never a second history.
- **One operation, one definition, every surface (0.1.50).** An operation's
  id, label, shortcut and availability live once in
  `EditorActionRegistry`, and keyboard, palette, sidebar and docs all read
  it.

## Documents, saving and publishing

- **A document snapshot is the authoritative portable form of a world
  (0.2.0).** The serialized document envelope is what crosses every
  boundary: file, publish and network.
- **Migration happens before domain entry (0.2.0, 0.2.2).** Old formats are
  handled only in the schema migrator; domain classes see current-schema
  JSON only.
- **Save is not Publish (0.2.0).** Saving persists the editable document;
  publishing creates an immutable, validated, versioned snapshot.
- **Publishing validates before storing (0.2.0).** A corrupt document is a
  hard error, never a warning.
- **Validation is independent of the UI (0.2.2).** `DocumentValidator` is
  pure and gives the same answer for file import, server receipt, loading
  and tests.
- **Publishing creates an immutable snapshot, not a boolean flag (0.2.3).**
  Editing the source never changes a publication, and unpublishing never
  touches the source.
- **Recovery protects work without redefining domain truth (0.2.6).**
  Autosave checkpoints are not publications and never replace the saved
  document automatically; recovered data passes the same migration and
  validation.
- **Save, autosave and publish have different semantics (0.2.6).** None
  substitutes for another.
- **A Publication is never edited (0.2.8).** Editing a published world is an
  explicit fork into a new Document; the Publication, its snapshot and its
  placement stay untouched.

## Placement and discovery

- **Spatial location belongs to placement, not publication (0.2.5).** A
  `WorldPlacement` points at a Publication; moving it never changes the
  Publication, Document or content hash, and one publication can have many
  placements.
- **Placement is a separate, publishable spatial record (0.2.10).** A
  `PlacementRecord` has its own identity, owner, revision and integrity.
  Document author, publication author and placement owner can be different
  people.
- **Discover placements first; resolve content only for relevant ones
  (0.2.11).** Content is never scanned wholesale.
- **Runtime state is distinct from decentralized truth (0.2.12).** A loaded
  world in one client's memory never becomes protocol data.
- **Content is identified by its hash, not its storage location (0.2.14).**
  Storage backends are retrieval mechanisms, and retrieved bytes are always
  verified against the expected hash.
- **The spatial index accelerates discovery; it is not truth (0.2.15).** A
  stale index entry is resolved and compared by revision, never treated as
  the record.
- **Decentralized records are immutable; pointers move (0.2.15).** A new
  revision is a new object; only pointers to the latest change.

## Collaboration

- **Collaboration transmits commands, not documents (0.2.7).** The unit of
  exchange is a serialized command in a protocol envelope.
- **Concurrent edits are resolved by authoritative ordering, not by
  transforming commands (0.2.9).** Non-conflicting operations apply;
  conflicting ones are rejected with a structured reason. (Later refined by
  "Ordering Is A Deterministic Total Order, Never Wall-Clock Time (0.2.97)"
  in [Shared worlds and collaboration](collaboration.md).)

## Signatures

- **Hashes say what an object is; signatures say who authorized it
  (0.2.16).** An immutable object is authoritative only when its hash, its
  signature and the signer's authority all check out, each with its own
  failure reason.
- **Newer valid revision wins, never merely newer (0.2.16).**
- **Sign canonical data, with domain separation (0.2.16).** Signatures cover
  the canonical `{ domain, type, id, revision, payload }` envelope in fixed
  order, so no object can have two signatures or be replayed as another
  type.
- **Cryptographic semantics precede infrastructure (0.2.16).** Establish who
  signed with a local primitive first; wallets, DIDs, rotation and
  revocation are later adapters.

[Full text](history/0.1-0.2.md#foundations-01x0216)
