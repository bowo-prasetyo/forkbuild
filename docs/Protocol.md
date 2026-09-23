# ForkBuild Protocol

This file specifies what ForkBuild serializes, stores for others to read,
or sends over the network, as it is now. It is edited in place when a
format changes. docs/ProtocolHistory.md keeps the milestone-by-milestone
protocol notes for 0.1.x–0.2.45; docs/Architecture.md describes the code
that produces these formats.

## Versions and identifiers

- `PROTOCOL_VERSION` (core/protocolVersion.js) is `'0.1'`. It is
  versioned independently of the application and stamped into
  DocumentMetadata as `protocolVersion`; a document must match it
  exactly.
- `DOCUMENT_SCHEMA_VERSION` (core/documentSchema.js) is `1`. It versions
  the JSON envelope only, and serializer/DocumentSchemaMigrator.js
  migrates older envelopes forward before anything reads them. Documents
  written before 0.2.0 have no `schemaVersion` and are treated as 0.
- Most other formats carry their own `formatVersion` or `schemaVersion`
  (currently 1) and a `kind` string where several formats share a carrier.
- Instance ids (World, Building, Brick, Group, Publication, …) are
  UUIDs from core/createId.js, opaque and never reused. Definition ids
  such as `core:cube` or `village:house` are stable, namespaced type ids
  (docs/BrickIDs.md). Identity ids are did:key strings derived from an
  Ed25519 public key.

## Never part of the protocol

Only domain state is serialized or sent: World, Building, Brick, Group,
placements, regions, landmarks, animal decorations and their metadata,
plus the signed records described below. Editor and runtime state never
is: selection, hover, inspection, the active tool and brick, camera pose,
editor settings, gizmo and gesture state, placement previews, palette
and action state, and the dirty flag (see docs/Architecture.md, "Domain
State vs Editor State"). An interactive gesture's only protocol-visible
result is the new brick transforms it commits.

## Coordinates and units

- Canonical origin: `(0, 0, 0)`, the same point on every replica by
  definition.
- Axes: right-handed, `+X` right, `+Y` up, `+Z` toward the viewer. The
  ground plane is `Y = 0`.
- Unit: one coordinate unit is one **World Unit**, and one World Unit
  represents one meter of real-world length — see docs/Principles.md,
  "A World Unit Is One Meter" (0.9.548). The contract covers spatial
  length and quantities directly derived from it (distance, dimensions,
  speed, acceleration); it is not a claim that every numeric value in
  the World model is a physical measurement in meters.
- A Brick's `position` is local to its document. A placement's position
  is in shared world space, and the two compose by addition. Stored
  positions are always absolute. Terrain height is not stored; it is a
  pure function of `(seed, x, z)` applied when rendering.

## Document envelope

A saved document, a published snapshot and an exported file all use the
same envelope, produced by DocumentSerializer (canonical: serializing,
deserializing and serializing again gives byte-identical JSON):

    {
      schemaVersion: 1,
      world: {
        id, metadata,
        buildings: [ { id, creator, library, bricks: [Brick] } ],
        groups: [ { id, name, brickIds } ],
        placements: [ { id, documentId, position, rotation } ],        // StructurePlacements
        landmarks: [ { id, worldId, authorIdentityId, title, description, position } ],
        regions: [ { id, worldId, authorIdentityId, name, description, kind,
                     position, radius, parentRegionId } ],
        animalDecorations: [ AnimalDecoration ]
      },
      metadata: {
        title, description, author, authorIdentityId, created, modified,
        protocolVersion, engineVersion, parentDocumentId, parentStructureId,
        license: { id, attribution }
      }
    }

    Brick: { id, definitionId, position: { x, y, z }, rotation, color }

- `rotation` is degrees around Y. Translate and rotate are the only
  transforms; there is no scale.
- A StructurePlacement references another Document by id and never
  copies its bricks.
- Fields added after a document was written are optional and read with a
  default (`description` as `''`, arrays as `[]`, `color` as `null`).
- The content hash of a document is serializer/contentHash.js over the
  canonical JSON (FNV-1a, 32-bit, hex). `core/ContentReference.js`
  records the algorithm (`fnv1a-32` today), so a stronger hash can be
  introduced without changing the reference shape.

### Brick Color

`BrickDefinition` carries a `color` (0xRRGGBB), the default shade for every brick of that type. It used to be
hardcoded in `renderer/ThreeBrickFactory.js`; now it is data.

A `Brick` serializes an optional `color` next to `id`, `definitionId`, `position` and `rotation`:

    { id, definitionId, position, rotation, color }   // color: 0xRRGGBB integer, or null

`null` (or a missing field, in documents written before this change) means "use the definition's color." A World
with no colors set renders exactly as before. `color` is the one addition to the Brick transform rule stated at
"Document envelope" above: it changes appearance, never geometry, placement or collision. Recoloring goes through
`SetBrickColorCommand`, so it is undoable and replayed like any other edit. `PROTOCOL_VERSION` is unchanged: the
field is additive and optional.

### World Animal Decorations (0.9.702)

A World serializes an `animalDecorations` array next to its buildings, landmarks and regions:

    { id, worldId, authorIdentityId, species, position: { x, y, z } }   // species: 'DEER' | 'RABBIT'

A decoration is authored World content, created by `CreateWorldAnimalDecorationCommand` and removed by
`RemoveWorldAnimalDecorationCommand`, so it is published, forked and replayed with the World. Unlike a
`WorldLandmark`, its `y` is authoritative and never re-derived from terrain, because it may rest on a structure.
Worlds serialized before 0.9.702 have no field and read as `[]`.

A decoration is not a live animal. It has its own id space, separate from the deterministic ids below, and other
replicas can't catch it.

### Editor Document Export File (0.9.641–0.9.642)

Editor → Export writes exactly `DocumentSerializer.serialize()`'s output, the same envelope Save stores:

    { schemaVersion, world, metadata }

It is not a Publication and is not signed. Import runs `DocumentSerializer.deserialize()` (migrate → validate →
construct), then `DocumentCloneService`. The imported document always gets a fresh `documentId`, fresh brick and
building ids, and remapped group membership, with `parentDocumentId` set to `null`. A file's own `world.id` is never
reused as a storage key. Newer `schemaVersion`s are rejected. `protocolVersion` must still match exactly; there is
no migration path for it yet.

## Publications and snapshots

A Publication (publisher/Publication.js) is pure data about one publish:

    { id, documentId, title, author, providerId, publishedAt, url,
      parentDocumentId, snapshotId, contentHash, schemaVersion,
      license, contentReference, publisherIdentity, signature }

    contentReference: { hash, algorithm, mediaType, size, uri, storage }

Local storage keys (through a StorageProvider):

- `{documentId}`: the editable document;
- `snapshot:{publicationId}`: the immutable published snapshot;
- `forkbuild-publications`: the list of Publication records;
- `recovery:{documentId}`: an autosave checkpoint.

A snapshot is loaded only after its bytes match `contentHash`. A
DiscoveryProvider answers `list()`, `findById()`, `findByAuthor()`,
`findByParentId()` and `findByDocumentId()` with Publications.

## Signatures

Every signed object is signed over a canonical envelope built in fixed
property order (core/Signature.js):

    { domain: 'forkbuild', type, id, revision, payload }

`type` separates object kinds, so a signature over one kind can never be
replayed as another. core/Signature.js's `SignatureType` lists the first
types (`publication`, `placement-record`, `spatial-index-root`,
`avatar-presence`, `avatar-profile`, `avatar-interaction`,
`peer-authentication`); each later envelope defines its own type in its
`get…SigningDescriptor()`. The signature itself is stored as:

    { algorithm: 'Ed25519', signer, signature, signedHash, domain, signedAt }

`signer` is the did:key of the signing identity.
identity/LocalAuthorizationVerifier.js checks that the signature is
authentic and that the signer is the one allowed to sign that object.

## Placement records

A published world's position in shared space is a PlacementRecord
(core/PlacementRecord.js):

    { placementId, publicationId, owner, ownerIdentity,
      authorizedBy: { identity, delegationId },
      position, rotation, scale, bounds,
      revision, contentHash, createdAt, updatedAt,
      causalStamp, parents, signature }

Each move creates a new revision with a new signature and an advanced
`causalStamp` (a vector clock, `{ version, clock: { did:key → integer } }`);
earlier revisions keep their own signatures. `causalStamp` and `parents`
are inside the signed envelope. The spatial-index formats
(SpatialCell, SpatialIndexManifest, SpatialIndexRoot) and Delegation
records are defined in core/ but not produced by the running app.

## Peer messages

Peers talk over one authenticated WebRTC data channel per connection.
Authentication (`forkbuild-peer-auth/1`, core/PeerAuthenticationEnvelope.js)
is a HELLO `{ type, sessionNonce, identityId, publicKey, challenge }`
from each side, then a PROOF that adds a signature over the other side's
challenge. The proof is bound to that one connection.

After that, every application message is a PeerMessage
(peer/PeerMessage.js), at most 64 KiB:

    { messageId, protocol, version, payload }

`protocol` routes the message to one application protocol; the bus never
reads `payload`.

| Protocol id | Payload defined in | Purpose |
|-------------|--------------------|---------|
| `forkbuild:avatar-presence` | core/AvatarPresenceAdvertisement.js | where an avatar is |
| `forkbuild:avatar-profile` | core/AvatarProfileAdvertisement.js | what an avatar looks like |
| `forkbuild:avatar-interaction` | core/AvatarInteractionAdvertisement.js | gestures |
| `forkbuild:avatar-inventory-transfer` | application/AvatarInventoryTransferPeerProtocol.js | see "Avatar Inventory Transfer (0.9.702)" |
| `forkbuild:identity-lifecycle` | core/IdentityLifecycleGossip.js | succession and revocation records |
| `forkbuild:device-authorization` | core/DeviceAuthorizationGossip.js | device grants and revocations |
| `forkbuild:friendship` | core/FriendshipAdvertisement.js | friend requests and answers |
| `forkbuild:chat` | core/ChatMessage.js | chat messages |
| `forkbuild:chat-delivery-ack` | core/ChatDeliveryAck.js | delivery acknowledgements |
| `forkbuild:chat-read` | core/ChatReadReceipt.js | read receipts |
| `forkbuild:device-conversation-sync` | core/ConversationSyncEnvelope.js | history and read state between one identity's devices |
| `forkbuild:voice-call` | core/VoiceCallSignal.js | call signalling |
| `forkbuild:voice-media` | application/VoiceUseCase.js | in-band renegotiation for audio |
| `forkbuild:world-sync` | core/WorldOperationEnvelope.js | World commands |
| `forkbuild:world-membership` | core/WorldEditAuthorizationEnvelope.js | World edit grants |
| `forkbuild:world-presence` | core/WorldPresenceAdvertisement.js | who is in a World |
| `forkbuild:world-spatial-presence` | core/WorldSpatialPresenceAdvertisement.js | where they are looking |
| `forkbuild:world-discovery` | application/WorldDiscoveryRuntimeBootstrap.js | World Encounter discovery |
| `forkbuild:document-sync` | application/DocumentCommandPropagationUseCase.js | Editor document commands |
| `forkbuild:document-operation-recovery` | core/DocumentOperationRecoveryProtocol.js | fetching missed Editor operations |
| `forkbuild:publication` | application/PublicationPeerExchange.js | Publications |
| `forkbuild:content` | application/PeerContentProtocol.js | content bytes by hash |
| `forkbuild:anchor` | application/PublicationAnchorPeerProtocol.js | anchor claims |
| `forkbuild:snapshot-placement` | application/PublicationSnapshotPlacementPeerExchange.js | Snapshot placement claims |
| `forkbuild:snapshot-possession` | application/PublicationSnapshotPossessionPeerExchange.js | which Snapshots a peer holds |
| `forkbuild:snapshot-content-transfer` | application/PublicationSnapshotContentPeerExchange.js | Snapshot bytes |
| `forkbuild:world-encounter-material` | application/PeerWorldEncounterMaterialSource.js | encounter content |
| `forkbuild:commentary-distribution` | core/PublicationCommentaryDistributionEnvelope.js | see "Publication Commentary Distribution" |

Each protocol owns its own replay, ordering and deduplication rules.
Unless noted, a message carries no signature of its own and relies on
the authenticated session; signed records are verified on arrival
regardless of which peer relayed them.

## Presence, profiles and interactions

    presence:     { avatarId, ownerIdentity, position: { x, y, z }, rotation,
                    animation, sequence, signature? }
    profile:      { avatarId, ownerIdentity, profileRevision, templateId,
                    appearance, displayName, signature? }
    interaction:  { avatarId, ownerIdentity, interactionId, kind, targetAvatarId,
                    sequence, timestamp, signature? }

- `animation` is IDLE, WALKING, RUNNING or JUMPING; gesture `kind` is
  GREET, WAVE or POINT and never appears in `animation`.
- Presence, profile and interaction messages are signed when the
  sender's identity provider can sign. A receiver binds each claim to
  the connection it arrived on and rejects replays by `sequence`.
- Presence is never persisted. A visibility policy (PUBLIC, FRIENDS,
  LOCAL, HIDDEN) decides whether it is sent at all.
- There is no proximity message. Nearness is always derived locally
  from presence already received.

## World collaboration

    world-sync:              { kind, operationId, worldDocumentId, authorIdentityId,
                               command, logicalClock }
    edit grant:              { formatVersion, worldDocumentId, subjectIdentityId,
                               grantingIdentityId, authorizedAt }   // plus a signature
    world presence:          { formatVersion, worldDocumentId, present, activity,
                               advertisedAt }
    world spatial presence:  { formatVersion, worldDocumentId, present, sequence,
                               position: { x, z }, heading, selection, activity,
                               advertisedAt }

- `command` is a serialized command from the CommandRegistry.
- Operations are ordered by `(logicalClock, operationId)`, where
  `logicalClock` is a Lamport clock.
- Only the World's owner may sign an edit grant, and grants can be
  revoked with a matching signed revocation.
- A `present: false` presence message is a leave and needs no other
  fields.

## Identity records

    revocation:   { formatVersion: 1, identityId, publicKey, algorithm, reason,
                    successorIdentityId, revokedAt }            // signed by identityId
    succession:   { formatVersion: 1, predecessorIdentityId, predecessorPublicKey,
                    successorIdentityId, successorPublicKey, declaredAt }
                                                                // signed by the predecessor
    device grant: { formatVersion, identityId, deviceIdentityId, devicePublicKey,
                    deviceLabel, algorithm, authorizedAt }      // signed by identityId

Revocation is permanent; device grants can be revoked and granted again.
Each record's signature covers every field.

## Social

    friendship:   { actorIdentity, subjectIdentity, action, sequence, inResponseTo,
                    timestamp, signature }
                  // action: REQUEST, ACCEPT, REJECT, CANCEL or UNFRIEND
    chat:         { messageId, conversationId, senderIdentity, sequence, kind, body,
                    timestamp }       // kind: TEXT
    delivery ack: { messageId, conversationId, recipientIdentity, acknowledgedAt }
    read receipt: { conversationId, readerIdentity, readThroughSequence,
                    acknowledgedAt }
    voice signal: { callId, type, callerIdentity, calleeIdentity, sentAt }
                  // type: INVITE, ACCEPT, REJECT, END or BUSY

`conversationId` is the two identity ids, sorted and joined with `|`.

## Decentralized publications and discovery

    DecentralizedPublication: { kind, schemaVersion, id, contentKind,
                                contentSchemaVersion, contentReference,
                                publisherIdentity, publishedAt, signature }
    PublicationAnchor:        { kind, schemaVersion, id, publicationId, contentHash,
                                anchorType, locator, anchoredAt, proof,
                                anchorIdentity, signature }
    naming claim:             { id, worldId, regionId, name, authorIdentityId,
                                createdAt, signature }

A DecentralizedPublication says where a copy of a signed object's bytes
can be found; the bytes are always checked against
`contentReference.hash`. A PublicationAnchor claims that external
evidence (Bitcoin, Arweave or Base) exists for a publication; verifying
that evidence is a separate step.

Announcements on Nostr (a `t` tag) and Arweave (a matching transaction
tag) are grouped into families, and a reader only queries its own:

| Family | Tag | Envelope |
|--------|-----|----------|
| Publications | `forkbuild-publication` | `{ protocol: 'forkbuild', version: 1, kind, objectId, uri }` (core/DecentralizedDiscoveryEnvelope.js) |
| Snapshots | `forkbuild-snapshot` | `{ protocol: 'forkbuild-snapshot-discovery', version: 1, publicationId, contentHash, storage, locator, claimedPosition }` (core/SnapshotDiscoveryEnvelope.js) |
| Place naming | per region, from `derivePlaceNamingDiscoveryTag(worldId, regionId)` | `{ protocol: 'forkbuild-place-naming-discovery', version: 1, worldId, regionId, claim }` (core/PlaceNamingDiscoveryEnvelope.js) |
| Commentary | `forkbuild-commentary` | see "Publication Commentary Distribution" |

The `ui/main.js` constants and the `*DiscoveryPublisher` /
`*QueryService` classes in application/ set these tags.
`forkbuild-publications` and `forkbuild-index` are local storage keys,
not wire tags.

## Publication Commentary Distribution

`core/PublicationCommentary.js` stays unsigned. Distribution wraps it in a signed envelope
(`core/PublicationCommentaryDistributionEnvelope.js`):

    {
      kind: 'forkbuild.publication-commentary-distribution',
      schemaVersion: 1,
      commentaryId, publicationId, authorIdentityId, content, createdAt,
      signature                // core/Signature.js JSON
    }

The signature has type `publication-commentary-distribution` and covers `{ commentaryId, publicationId,
authorIdentityId, content, createdAt }` (`id` = `commentaryId`, `revision` = `createdAt`).
`LocalAuthorizationVerifier#verifyPublicationCommentaryDistributionEnvelope()` requires the signer to be
`authorIdentityId`, and never accepts an unsigned envelope. A valid signature proves who wrote the comment, never
that they own the Publication. Arrival is deduplicated by `commentaryId` in `PublicationCommentaryStore`, never by a
transport's own id.

One envelope, three carriers:

| Carrier | Where | Shape |
|---------|-------|-------|
| WebRTC  | peer protocol `forkbuild:commentary-distribution` | `{ kind: 'ANNOUNCE', envelope }` — announce only, no request/response history sync |
| Nostr   | a kind-1 event on every configured relay (fan-out) | `content` = envelope JSON; tag `['t', 'forkbuild-commentary']` |
| Arweave | a tagged transaction | body = envelope JSON; tag `ForkBuild-Commentary-Discovery-Tag: forkbuild-commentary`, found through GraphQL tag search |

Posting always persists locally first, announces over WebRTC second, and then publishes to one chosen asynchronous
substrate (Nostr or Arweave; the saved Announcement/Discovery default, overridable per post). It never publishes to
both. A network failure never undoes the local write. Readers query both substrates when a Commentary section opens
or on "Check for new comments", filter by `publicationId`, and import every candidate through the same verifier.
A Nostr relay OK means "accepted," not durably stored. On Arweave, "not yet mined," "never published" and "gateway
unreachable" all surface as `ContentUnavailableError`, and are never reported as "absent."

## Vehicles, animals and inventory

### Deterministic Animal Identity (0.9.700)

Wildlife from `core/WildlifeField.js` is a pure function of `(seed, x, z)` and is never stored. Each animal's id is
derived from its lattice cell (`core/AnimalIdentity.js`):

    animal:<seed>:<cellX>,<cellZ>

Two replicas, or one replica returning to a tile, compute the same id for the same animal. Catching removes that id
from the local field (`AnimalRuntimeInstances` excludes it). Releasing creates a runtime animal with a fresh id.
Neither is sent to peers: caught and released animals, and placed vehicles, are local state persisted under
`avatar-inventory`, `vehicle-runtime-instances` and `animal-runtime-instances`.

### Avatar Inventory Transfer (0.9.702)

An inventory entry serializes as:

    { id, kind, type }   // kind: 'vehicle' | 'animal'
                         // type: a VehicleType ('bicycle' | 'motorcycle' | 'car' | 'drone')
                         //       or an ANIMAL_SPECIES ('DEER' | 'RABBIT')

Transfers use the peer message-bus protocol `forkbuild:avatar-inventory-transfer`
(`application/AvatarInventoryTransferPeerProtocol.js`), sent only to authenticated, connected peers:

    { kind: 'OFFER',   offerId, entry }
    { kind: 'ACCEPT',  offerId }
    { kind: 'DECLINE', offerId }

The sender removes the entry from its own inventory when it sends OFFER, and puts it back on DECLINE or if the
recipient disconnects before answering. The recipient adds the entry when it accepts, and then sends ACCEPT. So the
entry can't be used on the sender's side while an offer is open. There is one known gap: if the connection drops
after the recipient accepts but before ACCEPT reaches the sender, the sender restores the entry and both sides hold
it. Messages carry no signature of their own; they rely on the authenticated peer session, like the other
`forkbuild:*` peer protocols.

## Legacy collaboration envelope (0.2.7, 0.2.9)

core/CollaborationEnvelope.js and the collaboration/ transports define an
older command-broadcast format with a single ordering authority. Nothing
in the app uses it; see docs/ProtocolHistory.md, "Collaboration Protocol
(0.2.7)" and "Multi-client Synchronization (0.2.9)".
