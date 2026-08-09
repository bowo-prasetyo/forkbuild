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
   `url`, and `parentDocumentId`. Repository View, Author View, and
   World View all consume Publications without knowing how they were
   created.

3. **No blockchain terminology leaks upward.**
   A Steem implementation might internally produce `author`, `permlink`,
   `transaction`, and `block`. ForkBuild doesn't care. The publisher
   contract is simply:

## Current Implementation (0.1.22–0.1.26)

`LocalPublisherProvider` exercises the interface without a blockchain.
It persists `Publication` records via an injected `StorageProvider`,
so the flow is real and testable even in V0.1.

As of 0.1.23, `Publication` carries `parentDocumentId` (from
`DocumentMetadata`), reserved for the upcoming Forking milestone. The
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
A future `SteemDiscoveryProvider` would query Steem posts and convert
them into `Publication` objects — without `SteemPublisherProvider`
knowing it exists.

This separation means the UI (Repository View, Author View, World View)
consumes `Publication` objects through `DiscoveryProvider` without
knowing the blockchain source.

## Publication Lifecycle (0.1.25–0.1.26)

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
When a `SteemPublisherProvider` arrives, it replaces only the concrete
publisher adapter; the use cases, discovery, and UI remain unchanged.

## Forking (0.1.24)

Implemented as a first-class document operation. `ForkDocumentUseCase`
loads a source document, deep-clones its world with fresh instance IDs,
sets `DocumentMetadata.parentDocumentId` to the source document's ID,
and opens the result as a new editable document. The publisher passes
`parentDocumentId` through automatically when the fork is later published.

## Future Directions

- **SteemPublisherProvider**: posts document JSON as a Steem custom_json
  operation, using `identityProvider.sign()` via Steem Keychain.
- **World Position**: an optional `worldPosition` field (or separate
  `WorldLayout` record) will let World View place published documents
  into a shared virtual space without changing the publisher interface.
