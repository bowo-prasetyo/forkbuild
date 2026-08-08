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

## Current Implementation (0.1.22)

`LocalPublisherProvider` exercises the interface without a blockchain.
It persists `Publication` records via an injected `StorageProvider`,
so the flow is real and testable even in V0.1.

As of 0.1.23, `Publication` carries `parentDocumentId` (from
`DocumentMetadata`), reserved for the upcoming Forking milestone. The
publisher passes it through automatically; it does not interpret it.

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

## Forking (0.1.24)

Implemented as a first-class document operation. ForkDocumentUseCase
loads a source document, deep-clones its world with fresh instance IDs,
sets DocumentMetadata.parentDocumentId to the source document's ID,
and opens the result as a new editable document. The publisher passes
parentDocumentId through automatically when the fork is later published.

## Future Directions

- **SteemPublisherProvider**: posts document JSON as a Steem custom_json
  operation, using `identityProvider.sign()` via Steem Keychain.
- **World Position**: an optional `worldPosition` field (or separate
  `WorldLayout` record) will let World View place published documents
  into a shared virtual space without changing the publisher interface.
