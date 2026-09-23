# Publishing

ForkBuild's publishing layer is built on three principles:

1. **Publisher knows Identity, not the reverse.**
   A `PublisherProvider` receives an `IdentityProvider` and may call
   `identityProvider.sign(data)` to attest authorship. It never knows
   whether that signature is a local attribution stamp or a blockchain
   transaction.

2. **Publication is the bridge.**
   The result of `publish()` is a `Publication` — pure data carrying
   `id`, `documentId`, `title`, `author`, `providerId`, `publishedAt`,
   `url` and `parentDocumentId`, plus (since 0.2.x) `snapshotId`,
   `contentHash`, `schemaVersion`, `license`, `contentReference`,
   `publisherIdentity` and `signature` (see `publisher/Publication.js`).
   Repository View, Author View, and
   World View all consume Publications without knowing how they were
   created.

3. **No blockchain terminology leaks upward.**
   A Steem implementation might internally produce `author`, `permlink`,
   `transaction`, and `block`. ForkBuild doesn't care. The publisher
   contract is simply (`publisher/PublisherProvider.js`):

       publish(document, identityProvider)  -> Publication
       unpublish(publicationId)             -> boolean (did it exist?)

## Current Implementation (0.1.22–0.1.33)

`LocalPublisherProvider` exercises the interface without a blockchain.
It persists `Publication` records via an injected `StorageProvider`,
so the flow is real and testable without any network.

As of 0.1.23, `Publication` carries `parentDocumentId` (from
`DocumentMetadata`), which Forking (0.1.24) sets. The
publisher passes it through automatically; it does not interpret it.

As of 0.1.26, the completed publication lifecycle connects to three
discovery views:

- **Repository View** — lists all publications; operates on metadata.
- **Author View** — filters by author; renders fork trees from
  `parentDocumentId` links.
- **World View** — spatial exploration; loads the actual `Document`/
  `World` geometry via `LoadPublicationDocumentUseCase` because it
  needs bricks and buildings to render.

This proves the architectural boundary: `Publication` describes that
something was published; `Document`/`World` describes what exists.
Repository and Author Views need only the former. World View needs both.

## Discovery (0.1.23)

Publishing and Discovery are deliberately separate adapter families:

- **Publisher**: "How do I publish this document?"
- **Discovery**: "How do I find published documents?"

`LocalDiscoveryProvider` reads the same storage key that
`LocalPublisherProvider` writes to, returning `Publication` objects.
A remote discovery provider queries its own network and converts what it
finds into `Publication` objects without the matching publisher knowing it
exists. The Steem pair planned here was never built;
`discovery/DecentralizedPublicationDiscoveryProvider.js` (Nostr/Arweave) is
the real example.

This separation means the UI (Repository View, Author View, World View)
consumes `Publication` objects through `DiscoveryProvider` without
knowing the blockchain source.

## Publication Lifecycle (0.1.25–0.1.33)

The local simulation is now complete:

1. Alice creates a document in the Editor.
2. Alice saves it (`SaveDocumentUseCase` → `StorageProvider`).
3. Alice publishes it (`PublishDocumentUseCase` → `PublisherProvider`).
   `LocalPublisherProvider` persists both the Publication record and the
   document JSON, so the document remains available for Open/Fork/Explore.
4. Bob discovers it in Repository View (`DiscoveryProvider.list()`).
5. Bob opens it (loads by `documentId`), forks it (clones with fresh
   IDs and `parentDocumentId`), or explores it in World View (loads
   the full `Document` geometry into a read-only renderer).
6. Bob's fork gets his identity via `IdentityProvider`, and can be
   published as a new `Publication` with its own `publication.id`.

This exercises the full social/creation lifecycle without blockchain.
A new publisher backend replaces only the concrete publisher adapter; the
use cases, discovery, and UI remain unchanged.

## Forking (0.1.24)

Implemented as a first-class document operation. `ForkDocumentUseCase`
loads a source document, deep-clones its world with fresh instance IDs,
sets `DocumentMetadata.parentDocumentId` to the source document's ID,
and opens the result as a new editable document. The publisher passes
`parentDocumentId` through automatically when the fork is later published.

## Spatial Integration (0.1.27–0.1.33)

Published documents are positioned in a shared spatial coordinate system
via `WorldLayoutProvider`. `LocalWorldLayoutProvider` reads each
publication's explicit placement from the spatial index (0.2.5, 0.2.23) and
falls back to a deterministic, id-keyed grid for publications that have none
(0.2.24). World View streams documents in and out based on camera position
and lets users inspect them in this spatial context — all without the
publisher interface changing. Since 0.5.9 World View does not edit bricks;
see "Forking from World View" below and `docs/CapabilityMatrix.md`.

## World View Publishing (0.1.39)

Publish is reachable from World View as well as the Editor.
WorldNavigationSession.publishDocument() publishes the given document, or
the session's active document (0.2.27), refuses one that is itself a
published snapshot, auto-saves it when dirty, then delegates to PublishDocumentUseCase — the exact same use case
the Editor's Publish button uses. The rule: a Publication always
references the canonical current Document, never a stale saved version,
and never transient spatial/editor state. Republishing an edited world
appends a new Publication record pointing at the same documentId —
document identity stays stable, publication identity is fresh per
publish.

## Forking from World View (0.1.42, changed in 0.5.9)

0.1.42 added WorldNavigationSession.forkDocument(), which forks the live
loaded document in place. Since 0.5.9 World View no longer edits, and its
UI does not call forkDocument(). Its "Edit a Copy" action navigates to
`/editor?fork=` instead, and the Editor forks the document there (see
`docs/CapabilityMatrix.md`, "Edit a Copy"). Both paths use the same
DocumentCloneService the storage-based ForkDocumentUseCase delegates to:
new document identity, fresh brick identities, "Fork of <title>", the current user
as author, lineage via parentDocumentId — adopted as a fresh dirty
session (rooted history, invalidated save point) that the user edits,
saves, and eventually publishes as a NEW publication referencing the
fork. The source document and its publications are never touched:

    Document A ── Publication P1
        │ fork
        ▼
    Document B ── (edit, save) ── Publication P2   (parentDocumentId → A)

The three identity layers hold exactly as designed: document identity
stable per creation, publication identity fresh per publish, blockchain
identity (future) a third layer again.

## Current State: Publishing vs. Distribution (as of 2026-09-23)

The sections above describe the local publishing core, which is still how
every Publication starts: `PublishDocumentUseCase` → `LocalPublisherProvider`,
stored on this device. Everything that leaves the device is a separate,
explicit step called **distribution**. It is never a side effect of Publish.

**What can be distributed.**

- *Publication distribution* uploads the Publication's material and announces a
  locator for it (a signed `DecentralizedPublication`), so other people can
  discover it and verify it.
- *Snapshot distribution* uploads the raw content bytes and announces a Snapshot
  locator.

The two are independent protocols with separate results. A combined
"Distribute" action runs them one after the other.

**The choices** (see `docs/Architecture.md`, "Distribution: independent
choices, one dialog"):

- **Storage** for the bytes: Arweave, IPFS (Local Kubo, at the configured IPFS
  Node URL), or IPFS (Remote Pinning, any Pinata-compatible service; the
  credential is kept in tab memory only).
- **Announcement/Discovery** substrate: Nostr (every configured relay) or
  Arweave (a tagged transaction). Each action uses one of them, never both.
- **Proof/Anchoring**, optional and separate: Bitcoin, Arweave, or Base (Base
  only through its own reviewed-transaction button).

The saved Content, Announcement/Discovery and Proof/Anchoring preferences
(Network Settings) seed every picker's first value and power the "Use
Preferred Provider" buttons. They never trigger a network action on their own.

**Where it happens.** The Editor's post-publish overlay and World View (My
Publication, World Encounters) each open a Distribute dialog with one shared
settings block. The Publications page (`/publications`) keeps the full
per-entry controls: Remote IPFS publishing, snapshot placements, anchoring,
evidence and history.

**Discovery and presence.** Distributed Publications are found through Nostr
or Arweave discovery (and World Encounters while walking), verified, and then
admitted to the Repository. Admissions are recorded durably
(`LocalPublicationCatalog`, `LocalWorldEncounterPublicationAdmissionLog`) and
rebuilt at startup, so a placed Publication is still in the World after a
restart.

**Commentary** on a Publication is signed and distributed the same way
(WebRTC to connected peers, plus Nostr or Arweave). It is fetched when a
Commentary section opens. See `docs/Protocol.md`, "Publication Commentary
Distribution".

A Steem publisher was planned early on (see the Steem examples above) but
never built. Nostr and Arweave filled that role through the discovery and
distribution adapters instead, with the `publisher/` contract unchanged.
Real-time collaborative editing also exists now, but as command propagation
with deterministic ordering (0.2.96/0.2.97), not as a publishing feature and
never via OT or CRDTs; see `docs/Principles.md`, "Ordering Is A Deterministic
Total Order, Never Wall-Clock Time (0.2.97)".
