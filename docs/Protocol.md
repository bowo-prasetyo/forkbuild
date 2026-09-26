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
- `DOCUMENT_SCHEMA_VERSION` (core/documentSchema.js) is `2`. It versions
  the JSON envelope only, and serializer/DocumentSchemaMigrator.js
  migrates older envelopes forward before anything reads them. Documents
  written before 0.2.0 have no `schemaVersion` and are treated as 0;
  schema 1 stored bricks as objects, schema 2 as a table (see "Brick
  table" below). An app that predates schema 2 refuses schema 2
  documents as newer than it supports.
- Most other formats carry their own `formatVersion` or `schemaVersion`
  (currently 1) and a `kind` string where several formats share a carrier.
- Instance ids (World, Building, Group, Publication, …) are UUIDs from
  core/createId.js, opaque and never reused. Brick ids created since
  schema 2 are 12 random characters from `[0-9A-Za-z]`
  (`createBrickId()`); older bricks keep their UUIDs, and nothing may
  assume either shape. Definition ids
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
      schemaVersion: 2,
      world: {
        id, metadata,
        buildings: [ { id, creator, library, brickTable: BrickTable } ],
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

    Brick: { id, definitionId, position: { x, y, z }, rotation, color }   // in memory, and in schema 1

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

### Brick table (schema 2)

A building's bricks are stored as one table rather than one object each
(core/BrickTable.js):

    BrickTable: {
      definitions: [ definitionId ],   // each definitionId used, in first-use order
      colors: [ color ],               // each non-null color used, in first-use order
      ids: [ brickId ],                // one per brick, in brick order
      values: [ d, x, y, z, r, c, … ]  // six numbers per brick
    }

For brick `i`, `values[6i … 6i+5]` are the index of its definition in
`definitions`, its position `x`, `y`, `z`, its `rotation` in degrees, and
`0` for no color or `1 +` the index of its color in `colors`. Bricks keep
their order, so the table is canonical: the same World always produces
the same table. The migration from schema 1 turns each `bricks` array
into a table and changes nothing else; brick ids, including UUIDs, are
kept. A published schema 1 snapshot keeps its bytes, so its content hash
still verifies.

The table is about a quarter of the object form's size with UUID brick
ids, and a fifth with short ones: the hollow 233-base pyramid (54,289
bricks) is 7.49 MB as objects with UUIDs, 3.09 MB as a table with the
same ids, and 1.79 MB built anew.

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
- `recovery:{documentId}`: an autosave checkpoint, and
  `recovery-info:{documentId}`: its `{ revision }`, so autosave and Save
  need not read the whole checkpoint.

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
| `forkbuild:avatar-inventory-transfer` | application/avatar/AvatarInventoryTransferPeerProtocol.js | see "Avatar Inventory Transfer (0.9.702)" |
| `forkbuild:identity-lifecycle` | core/IdentityLifecycleGossip.js | succession and revocation records |
| `forkbuild:device-authorization` | core/DeviceAuthorizationGossip.js | device grants and revocations |
| `forkbuild:friendship` | core/FriendshipAdvertisement.js | friend requests and answers |
| `forkbuild:chat` | core/ChatMessage.js | chat messages |
| `forkbuild:chat-delivery-ack` | core/ChatDeliveryAck.js | delivery acknowledgements |
| `forkbuild:chat-read` | core/ChatReadReceipt.js | read receipts |
| `forkbuild:device-conversation-sync` | core/ConversationSyncEnvelope.js | history and read state between one identity's devices |
| `forkbuild:voice-call` | core/VoiceCallSignal.js | call signalling |
| `forkbuild:voice-media` | application/chat/VoiceUseCase.js | in-band renegotiation for audio |
| `forkbuild:world-sync` | core/WorldOperationEnvelope.js | World commands |
| `forkbuild:world-membership` | core/WorldEditAuthorizationEnvelope.js | World edit grants |
| `forkbuild:world-presence` | core/WorldPresenceAdvertisement.js | who is in a World |
| `forkbuild:world-spatial-presence` | core/WorldSpatialPresenceAdvertisement.js | where they are looking |
| `forkbuild:world-discovery` | application/discovery/WorldDiscoveryRuntimeBootstrap.js | World Encounter discovery |
| `forkbuild:document-sync` | application/document/DocumentCommandPropagationUseCase.js | Editor document commands |
| `forkbuild:document-operation-recovery` | core/DocumentOperationRecoveryProtocol.js | fetching missed Editor operations |
| `forkbuild:publication` | application/publication/PublicationPeerExchange.js | Publications |
| `forkbuild:content` | application/peer/PeerContentProtocol.js | content bytes by hash |
| `forkbuild:anchor` | application/anchoring/PublicationAnchorPeerProtocol.js | anchor claims |
| `forkbuild:snapshot-placement` | application/snapshot/placement/PublicationSnapshotPlacementPeerExchange.js | Snapshot placement claims |
| `forkbuild:snapshot-possession` | application/snapshot/possession/PublicationSnapshotPossessionPeerExchange.js | which Snapshots a peer holds |
| `forkbuild:snapshot-content-transfer` | application/snapshot/materialization/PublicationSnapshotContentPeerExchange.js | Snapshot bytes |
| `forkbuild:world-encounter-material` | application/worldEncounter/PeerWorldEncounterMaterialSource.js | encounter content |
| `forkbuild:commentary-distribution` | core/PublicationCommentaryDistributionEnvelope.js | see "Publication Commentary Distribution" |

### Large content in parts

`forkbuild:content` and `forkbuild:snapshot-content-transfer` send
content that does not fit one message (their RESPONSE takes at most
48 KiB) as `RESPONSE_PART` messages instead
(application/peer/ChunkedPeerTransfer.js). Each carries the same fields
that name the content as a RESPONSE (`hash`, or `publicationId` and
`contentHash`) plus:

    { transferId, index, count, totalLength, part }

`part` is a slice of the content's text whose JSON-escaped length is at
most 60 KiB, so the message fits MAX_PEER_MESSAGE_BYTES; the parts of one
`transferId`, joined in `index` order, are `totalLength` characters long.
A transfer is at most 64 MiB (8,192 parts). The sender waits while the
data channel's send buffer holds more than 1 MiB. The receiver accepts
parts only for content it requested in the last five minutes, holds at
most two transfers at once, drops a transfer idle for 30 s, and checks the
joined content exactly like a RESPONSE (for `forkbuild:content`, also that
`totalLength` matches the catalogued size). Content that fits is still
one RESPONSE, and a peer that predates `RESPONSE_PART` ignores it.

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

    identity export: { formatVersion: 2, identityId, publicKey, algorithm, label, createdAt,
                       encryptedPrivateKey }
    encryptedPrivateKey: { version: 2, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM',
                           salt, nonce, ciphertext }            // hex strings

The export file is not signed; it carries the private key seed encrypted
with AES-256-GCM (additional data `forkbuild-identity-key/v2`) under a key
derived from the passphrase by PBKDF2-HMAC-SHA256 (600,000 iterations by
default, at most 10,000,000 accepted). `ciphertext` ends with the 16-byte GCM
tag. The same record shape stores a protected key on the device. Importing
still accepts `formatVersion: 1` files, whose key record has
`kdf: 'PBKDF2-HMAC-SHA512'` and a separate `tag`.

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

The proposed Steem substrate groups by discovery thread instead of by tag;
see "Proposed: Steem Announcement Substrate" below.

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

## Proposed: Steem Announcement Substrate

**Status: built, Experimental.** The discovery threads exist on the chain (from 2026-09), and the app reads and
announces all four families. It ships as Experimental alongside the other decentralized publication tooling.

Steem would be a third Announcement/Discovery substrate next to Nostr and Arweave. It carries the same envelopes as
they do, unchanged, and is only a transport: every candidate is verified by content hash and ForkBuild signature
through the family's existing verifier. A Steem account never becomes a publisher identity, and the UI never shows
it as a Publication's author.

Why Steem: blocks every 3 seconds become irreversible within about a minute, so an announcement gets a durable,
ordered, timestamped place in the chain. A Nostr relay may drop an event, and Steem charges no per-post fee as
Arweave does. The cost is that announcing needs a registered Steem account with enough Resource Credits. Reading
needs no account.

### Discovery threads

Announcements are **replies** to a root post per family and month, not top-level posts. Replies stay out of tag
feeds, so they don't clutter Steem front ends, and a reader finds a family by reading one post's replies instead of
querying a tag. A discovery thread is a root post by a thread account, `@forkbuild` by default:

    permlink:  forkbuild-<family>-<YYYY-MM>          (UTC month)

| Family | Discovery thread (September 2026) | Envelope |
|--------|-----------------------------------|----------|
| Publications | `@forkbuild/forkbuild-publication-2026-09` | core/DecentralizedDiscoveryEnvelope.js |
| Snapshots | `@forkbuild/forkbuild-snapshot-2026-09` | core/SnapshotDiscoveryEnvelope.js |
| Place naming | `@forkbuild/forkbuild-place-naming-2026-09` | core/PlaceNamingDiscoveryEnvelope.js |
| Commentary | `@forkbuild/forkbuild-commentary-2026-09` | core/PublicationCommentaryDistributionEnvelope.js |

Place naming uses one thread for every region, not one per region as its Nostr tag does. Readers filter by the
envelope's `worldId` and `regionId`.

Threads rotate monthly because `condenser_api.get_content_replies` returns every direct reply at once, without
paging. One thread per family for all time would grow until API nodes time out. Readers derive the permlinks for a
time range, so rotation needs no index.

A discovery thread post is broadcast by the thread account as one transaction:

    ['comment', {
      parent_author: '', parent_permlink: 'forkbuild',     // category
      author: 'forkbuild', permlink: 'forkbuild-snapshot-2026-09',
      title: 'ForkBuild snapshot announcements, 2026-09',
      body: <human-readable explanation of the thread>,
      json_metadata: JSON.stringify({ tags: ['forkbuild'],
        forkbuild: { thread: { version: 1, family: 'snapshot', period: '2026-09' } } })
    }]
    ['comment_options', {
      author: 'forkbuild', permlink: 'forkbuild-snapshot-2026-09',
      max_accepted_payout: '0.000 SBD', percent_steem_dollars: 10000,
      allow_votes: true, allow_curation_rewards: true, extensions: []
    }]

`allow_replies` stays true. The thread account's operator creates threads at least twelve months ahead, and never
turns replies off on a current or future thread. Turning them off is the operator's one lever: it stops new
announcements on that thread, but cannot remove existing ones, since the chain refuses to delete a post that has
replies.

`core/SteemDiscoveryThread.js` names and describes threads (permlinks, periods, the post and its operations, and the
checks a thread must pass). `scripts/steem-threads/index.html` is the operator page that creates them: served with
the app (`python3 -m http.server`) and opened in a browser with Steem Keychain, it checks which threads exist, shows
the operations, and creates the missing ones five minutes apart, confirming each on the chain. It stops at the first
refusal, a thread that does not appear, or a thread that comes out wrong, and never edits an existing thread.

### Announcing

An announcement is one transaction of two operations, a reply to the current UTC month's thread for its family and
its options:

    ['comment', {
      parent_author: 'forkbuild', parent_permlink: 'forkbuild-snapshot-2026-09',
      author: <announcer's Steem account>,
      permlink: 'forkbuild-<base36 ms timestamp>-<8 random [a-z0-9]>',
      title: '',
      body: <one human-readable line naming the family; never empty, the chain rejects an empty body>,
      json_metadata: JSON.stringify({ app: 'forkbuild/<app version>',
        forkbuild: { version: 1, family: 'snapshot', envelope: <the family's envelope object> } })
    }]
    ['comment_options', {
      author, permlink,
      max_accepted_payout: '0.000 SBD', percent_steem_dollars: 10000,
      allow_votes: true, allow_curation_rewards: true, extensions: []
    }]

- Payout is declined in the same transaction because options can only be set before a post has votes, and bots vote
  on new posts within minutes. With no payout, a vote moves no rewards, so there is little reason to downvote an
  announcement, and readers ignore votes anyway.
- Votes and curation stay on. Steem Keychain refuses to sign `comment_options` with `allow_votes` or
  `allow_curation_rewards` set to false (it reports "Posting key is incorrect" without broadcasting), and the
  same options with both true sign and broadcast normally.
- The transaction is signed with the announcer's posting key through Steem Keychain
  (`steem_keychain.requestBroadcast(account, operations, 'Posting', callback)`), the injected signer that plays the
  part NIP-07 plays for Nostr. ForkBuild never holds a Steem key.
- The announcer's account is a per-device setting (Network Settings → Steem, `core/SteemAnnouncingConfiguration.js`,
  stored under `steem-announcing-configuration`), because Keychain doesn't tell a page which accounts it holds. It
  and Keychain are looked up each time something is announced, so an account set later, or an extension that
  injects itself after load, is picked up without a reload.
- Announcements go to the first configured thread account's threads.
- The announcer checks the operations' JSON size, an upper bound on the signed transaction's binary size, against
  the chain's 64 KiB limit before broadcasting, and refuses an oversized one rather than truncating the envelope.
- Before the first announcement to a thread, the announcer reads it with `get_content`. If the current month's
  thread does not exist, or no longer accepts replies, or can't be checked, announcing fails with a clear error. It
  never falls back to another thread, so a reader always knows where to look.
- The one-substrate rule holds: each action announces on exactly one of Nostr, Arweave or Steem, never on several,
  and a network failure never undoes the local write.
- Where it's chosen: the Distribute dialogs (Editor and World View), the Publications page, the commentary form, and
  the saved Announcement / Discovery default all offer Steem. Publications and Snapshots report the reply as
  `@author/permlink` and its thread as the relay; Commentary, like the other carriers, is fire-and-forget after the
  local save, so its form warns before posting when no account is set or Keychain is missing.
- Code: `application/steem/SteemAnnouncer.js`, with one publisher per family beside the readers
  (`SteemPublicationDiscoveryPublisher`, `SteemSnapshotDiscoveryPublisher`, `SteemPlaceNamingDiscoveryPublisher`,
  and `PublicationCommentarySteemDistribution#publish()`), composed in `SteemRuntimeComposition.js`.

### Reading

1. **Thread set.** Readers read every configured thread account (default `['forkbuild']`). A community can add its
   own thread account if `@forkbuild` becomes unavailable or stops accepting replies, just as relays are
   configured for Nostr. For each account and family, readers read every month from the configured earliest period
   (default `2026-09`) up to the current UTC month, at most the 36 most recent months. Earlier months' replies are
   cached for 10 minutes, since announcers only reply to the current month's thread; the current month is cached
   for 30 seconds, enough to absorb a burst such as place naming asking region by region.
2. **API nodes.** Readers use a configured list of API nodes (default `https://api.steemit.com`) and try them in
   order. Every node serves the same chain, so the first node that answers is enough.
3. **Fetch.** `condenser_api.get_content_replies(threadAccount, threadPermlink)`. A thread that doesn't exist yields
   nothing. A thread whose author isn't a configured thread account is ignored.
4. **Direct replies only.** Readers accept a reply only when its `parent_author` and `parent_permlink` name the
   thread. They ignore nested replies, which are conversation, not announcements.
5. **Parse defensively.** Anyone can reply, so readers skip a reply whose `json_metadata` is not JSON, lacks
   `forkbuild.version === 1`, names a `family` other than the thread's, or has no `envelope`. Readers keep the
   newest 2,000 replies of a thread and report the thread as truncated.
6. **Verify.** Each envelope goes through the family's existing path, exactly as one from Nostr or Arweave does,
   and is deduplicated there by its own identifier (for example `commentaryId` or `objectId`), never by Steem
   author and permlink:
   - publications become leads in the World discovery registry (origin `dweb:steem:<thread accounts>`), resolved
     and verified like any other lead;
   - snapshots join the snapshot candidate search, whose bytes are checked against `contentHash` when resolved;
   - place naming envelopes are kept only when their `worldId` and `regionId` derive the requested region's tag,
     then parsed and verified by the place naming query;
   - commentary is imported by the commentary exchange on "Check for new comments", filtered by `publicationId`.
7. **Ignore Steem signals.** Votes, payout, reputation and front-end muting never affect whether a candidate is
   accepted.
8. **Edits.** A reply can be edited, and `get_content_replies` returns only its current version. Readers take that
   version as the candidate. An edit can only replace one signed envelope with another, because anything unsigned
   or altered fails verification. Earlier versions stay in the chain's history, but readers don't scan it.

Where reading is configured: Network Settings → Steem (`/settings/steem`, `core/SteemReadingConfiguration.js`,
stored under `steem-reading-configuration`) holds the API nodes, thread accounts and first month; a change applies
the next time the app loads. The code is `application/steem/`: `SteemDiscoveryThreadReader.js` reads threads, and
one adapter per family presents what it finds in that family's existing shape
(`SteemRuntimeComposition.js` builds them).

### Status

Reading: a thread that can't be read is counted as unavailable, and one failed thread never hides the others. When
no thread could be read, the snapshot search reports "unavailable", place naming and commentary reject so the
caller names Steem as unreachable, and publication discovery finds no leads; none of them reports that nothing was
announced.

Announcing: a broadcast the node accepted is reported with status "accepted", not "irreversible"; the block becomes
irreversible about a minute later (at or below the chain's `last_irreversible_block_num`), which the app doesn't yet
track. A missing or closed thread, an unreachable node, no account, no Keychain, an oversized announcement and a
declined signature are each refused with their own message, never reported as published.

The same format works on Hive by pointing at Hive API nodes and a Hive thread account. If Hive is added, it is a
separate substrate choice, never merged with Steem results.

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
(`application/avatar/AvatarInventoryTransferPeerProtocol.js`), sent only to authenticated, connected peers:

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
