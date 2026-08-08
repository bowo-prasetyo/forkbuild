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
   and `url`. Repository View, Author View, and World View all consume
   Publications without knowing how they were created.

3. **No blockchain terminology leaks upward.**
   A Steem implementation might internally produce `author`, `permlink`,
   `transaction`, and `block`. ForkBuild doesn't care. The publisher
   contract is simply:

   ```javascript
   publish(document, identityProvider) → Publication
   ```

## Current Implementation (0.1.22)

`LocalPublisherProvider` exercises the interface without a blockchain.
It persists `Publication` records via an injected `StorageProvider`,
so the flow is real and testable even in V0.1.

## Future Directions

- **SteemPublisherProvider**: posts document JSON as a Steem custom_json
  operation, using `identityProvider.sign()` via Steem Keychain.
- **World Position**: an optional `worldPosition` field (or separate
  `WorldLayout` record) will let World View place published documents
  into a shared virtual space without changing the publisher interface.
- **Forking**: a `parentDocumentId` field on `Publication` will let
  Repository View render fork trees and World View place evolutionary
  stages next to each other.
