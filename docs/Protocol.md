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
| `forkbuild:anchor` | application/anchoring/PublicationAnchorPeerProtocol.js | anchor claims (a RESPONSE holds at most 64 anchors, and only as many as fit one message) |
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
that evidence is a separate step. Steem is a fourth, Experimental anchor
type; see "Proposed: Steem Anchoring" below.

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
- The chain accepts one comment per account every 3 seconds (`STEEM_MIN_REPLY_INTERVAL_HF20`), and Distribute posts
  a Snapshot and a Publication back to back. The announcer queues announcements and, before each broadcast, waits
  until 4.5 seconds have passed since its own last post and since the account's `last_post` on the chain (posts from
  other devices). If the chain still refuses for that reason, it waits once more and retries once.
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

## Proposed: Steem Content Storage

**Status: built, Experimental.** Code: `core/SteemContentManifest.js` (the manifest, part and locator formats),
`core/SteemResourceCredits.js` (the RC cost formula), `content/SteemContentStore.js` (encoding, `put()` with parts,
resuming and the RC check, and `get()`), `storage/SteemContentUploadStore.js` (unfinished uploads),
`application/steem/SteemResourceCreditEstimator.js` (asking a node), and `postContent()` and `postContentPart()` in
`application/steem/SteemAnnouncer.js`. `composeSteemRuntime()` builds the store, and `ui/main.js` registers it for
Snapshot storage and resolution; Publication distribution stores Signed Claims through it, and
`application/worldEncounter/SteemWorldEncounterMaterialResolver.js` reads them back.

Steem would be a third Content substrate next to IPFS and Arweave: a `ContentStore` whose `storage` is `'steem'`,
holding a Snapshot's bytes, or a Publication's Signed Claim, in Steem comments. Storing content is a separate role from announcing it. A Snapshot
stored on Steem can be announced on Nostr, Arweave or Steem, and one stored on IPFS can be announced on Steem, as
today. The chain is only a carrier: a reader loads the bytes only after they match `contentHash`, exactly as it does
for bytes from any other store, so Steem never has to be trusted.

Why Steem: every full node keeps the whole block log, so content stays available without anyone pinning it, as IPFS
needs, and without a per-upload fee, as Arweave charges. Uploading costs Resource Credits (RC), which regenerate.

Why only small builds: a transaction is at most 64 KiB, a comment body is text, and every transaction needs its own
Keychain approval and must wait out the 3-second reply interval. A build that needs many transactions is slow and
tedious to upload, and uses a lot of RC. The store therefore sets a size limit, and larger builds go to IPFS or
Arweave (see "Limits" below).

### Content threads

Content is kept out of Steem feeds and away from the discovery threads by a fifth thread family, `content` in
`STEEM_DISCOVERY_FAMILIES` (`core/SteemDiscoveryThread.js`), created by the thread account with the same operator
page, post shape and rules as the other four. Its title and body say that replies store content rather than
announce it:

    permlink:  forkbuild-content-<YYYY-MM>          (UTC month)

| Family | Content thread (September 2026) | Carries |
|--------|---------------------------------|---------|
| Content | `@forkbuild/forkbuild-content-2026-09` | content manifests (direct replies) and their parts (replies to a manifest) |

No reader lists a content thread; a locator names a manifest directly. The thread exists so that content has a
parent that is not a feed and not a discovery thread. Discovery thread readers fetch every direct reply with its
body, so large content there would slow down every reader. As with the other families, the uploader checks the
current month's content thread with `get_content` first, and refuses if it is missing, closed or can't be checked.

### Format

Content is stored as one **manifest**, a direct reply to the current month's content thread, and, when the encoded
content does not fit in the manifest, one or more **parts**, each a direct reply to the manifest. Every transaction
is a `comment` and a `comment_options` that declines payout, exactly as for announcements (see "Announcing" above).

Encoding. The uploader encodes the content in one of two ways and uses whichever is shorter once escaped as a JSON
string, which is how it travels in the operations:

- `utf8`: the content text as it is (canonical JSON for a Snapshot);
- `gzip-base64`: the content's UTF-8 bytes compressed with gzip (the browser's `CompressionStream`), then base64.

Where the encoded text goes. Since format version 2 it travels in each post's `json_metadata`, as
`forkbuild.data`, and the body carries a short notice for people who come across the post on a Steem front end
(`steemContentNotice()`): "Data stored by ForkBuild. It is read by the ForkBuild app, not meant to be read here, and
its payout is declined." with a link to this section, "…continued in N replies below." on a manifest with parts, and
"Part i of N of data stored by ForkBuild. …" on a part. The notice is the same for everyone and never repeats the
Publication's title or any other text a user wrote. Resource Credits and the transaction limit count `body` and
`json_metadata` the same way, so this costs nothing; it spares Steem readers screens of base64, and front ends that
hide long comment bodies no longer do. Version 1 (the first release) put the encoded text in the body; readers still
accept it (see "Reading").

The encoded text is split into parts of at most 48 KiB each, measured as the UTF-8 length of the part escaped as a
JSON string (`STEEM_CONTENT_PART_MAX_BYTES`), which is exactly its size inside `json_metadata`, leaving room within
the 64 KiB transaction limit for the notice and the rest of the operations. When the whole encoded text fits in one
part, it goes into the manifest itself and there are no parts (the "inline" case: one transaction, one approval).
`utf8` is never used for content starting with `@@ `, which API nodes read as an edit patch in a body; version 1
needed that, and it is kept.

A manifest:

    ['comment', {
      parent_author: 'forkbuild', parent_permlink: 'forkbuild-content-2026-09',
      author: <uploader's Steem account>,
      permlink: 'forkbuild-c-<base36 ms timestamp>-<8 random [a-z0-9]>',
      title: '',
      body: <the notice>,
      json_metadata: JSON.stringify({ app: 'forkbuild/<app version>',
        forkbuild: { version: 2, content: {
          contentHash, algorithm,              // as in the ContentReference (algorithm 'fnv1a-32' today)
          mediaType, size,                     // size: the content's length in UTF-8 bytes
          encoding,                            // 'utf8' or 'gzip-base64'
          encodedLength,                       // characters of encoded text, across all parts
          parts: [ { permlink, length, sha256 } ]   // in order; [] when inline
        },
        data: <inline only: the encoded content> } })
    }]
    ['comment_options', { author, permlink, max_accepted_payout: '0.000 SBD', ... }]

A part:

    ['comment', {
      parent_author: <uploader>, parent_permlink: <manifest permlink>,
      author: <uploader>,
      permlink: '<manifest permlink>-p<index>',          // index from 0
      title: '',
      body: <the notice>,
      json_metadata: JSON.stringify({ app: 'forkbuild/<app version>',
        forkbuild: { version: 2, part: { index, count }, data: <this part's slice of the encoded text> } })
    }]
    ['comment_options', { ... payout declined ... }]

`sha256` is the SHA-256 (WebCrypto) of the part's slice as hex, and `length` is its length in characters. Part
permlinks and hashes are known before anything is posted, so the manifest is posted first and lists every part.

The part hashes only let a reader find a wrong or edited part quickly. They are not a security boundary: anyone can
write a manifest, so what makes content trustworthy is the same as for every other store, `contentHash` and the
signed Publication that names it. The final check is as strong as `contentHash`'s algorithm (`fnv1a-32` today).

The locator, used as the `ContentReference`'s `uri` and the Snapshot envelope's `locator`:

    steem://<uploader>/<manifest permlink>

### Uploading

`put(bytes, { onProgress })` on the Steem store:

1. Encodes the content and plans the parts, before any network call. Content that fits one post is inline; otherwise
   it is always `gzip-base64`, split into parts, and each part's SHA-256 is computed. More than 20 parts is refused
   (see "Limits").
2. Looks for an unfinished upload of the same content by the same account (below).
3. Estimates the Resource Credits the posts need and refuses before posting if the account has too few (below).
4. Posts the manifest, then each part in order, through the same queue as `application/steem/SteemAnnouncer.js`, so
   posts from one account are at least 4.5 seconds apart and content and announcements never collide. The manifest
   post checks the current month's content thread first. Each transaction is signed through Steem Keychain with the
   posting key; ForkBuild never holds a Steem key. Several parts can't share a transaction, since the limit is per
   transaction.
5. Returns `ContentReference{ hash, algorithm, mediaType, size, uri: steem://…, storage: 'steem' }` only after the
   node has accepted every post.

Progress. `put()` reports `{ phase, done, total, resumed, resourceCredits }` to its `onProgress` and to the store's
`progress` sink: phase `'checking'`, then `'posting'` after each accepted post, then `'stored'` or `'failed'`. `total`
counts the manifest and every part; `done` starts at what an earlier attempt already stored. The app keeps the
latest report in one shared value (`steemContentUploadProgress`, provided by `ui/main.js`), and the Editor and World
View Distribute dialogs and the Publications page show it while their Snapshot is being distributed:
"Storing on Steem: 3 of 9 posts made. Approve each post in Steem Keychain." (`describeSteemContentUploadProgress()`).
One shared value is enough because posts from the app are made one at a time.

Resuming. Once the manifest of an upload with parts is accepted, the store records `{ author, permlink, contentHash }`
in local storage (`steem-content-upload:<author>:<contentHash>`), and removes the record when every part is stored.
If a part fails (declined, out of RC, node unreachable), `put()` throws `SteemContentUploadIncompleteError`, naming
how many posts are stored and saying to distribute again with the same account; nothing is announced. Storing the
same content again with the same account reads the recorded manifest back from the chain. If it still describes the
same content, encoding and parts (lengths and SHA-256), the store posts only the parts that are missing, and edits
any part whose data differs (a `comment` alone, without `comment_options`, since the post already exists and its
payout is already declined). If the manifest is gone or doesn't match, for example because the compressor produced
different bytes or it was posted in format version 1, the record is dropped and the upload starts over, so one
upload never mixes versions. The chain stays the source of truth: the record
only says where to look. A manifest whose parts never all arrive stays on the chain as an incomplete upload, and
readers report it as unavailable.

Resource Credits. Before posting, the store asks the API node for `rc_api.find_rc_accounts`,
`rc_api.get_resource_params`, `rc_api.get_resource_pool` and `condenser_api.get_dynamic_global_properties`, and
computes what the planned transactions cost exactly as the chain's rc plugin does (steemit/steem,
`libraries/plugins/rc`): per transaction, history bytes are its packed size; state bytes are `35 × 174` plus
`174` per packed byte plus, per comment, `201 × 10000` plus `10000` per permlink byte and `20000` per parent permlink
byte; execution time is `114100` per comment and `13200` per `comment_options`. Each resource costs
`((rc_regen × coeff_a >> shift) + 1) × count / (coeff_b + max(pool, 0)) + 1`, where `rc_regen` is the total vesting
shares divided by `144000`, and an account's RC regenerates linearly to `max_rc` over five days. If the total is more
than the account has, `put()` throws `SteemResourceCreditsError` ("needs about 40% of your account's Resource
Credits, and it has 12% right now…") before anything is posted. If the node can't answer (no `rc_api`, unreachable,
an unknown account), the upload goes ahead, and a refusal from the chain ("has … RC, needs … RC") is reported as
running out of Resource Credits rather than as a raw error. The estimate's shares are also shown in the progress line.
The formula follows the chain's source; it has not yet been compared with a live node from the development
environment, which can't reach one.

### Reading

The Steem store's `get(reference)` for a `steem://` locator:

1. `condenser_api.get_content(uploader, permlink)`. A manifest that doesn't exist, isn't a direct reply to a
   `forkbuild-content-<YYYY-MM>` thread of a configured thread account, or whose `json_metadata` lacks
   `forkbuild.version` 1 or 2 or a well-formed `content`, is unavailable. An inline manifest's encoded text is
   `forkbuild.data` in version 2 and the body in version 1, and must be `encodedLength` characters long.
2. The manifest's `contentHash` must equal the requested one; otherwise the locator is for different content.
3. A manifest may list at most 20 parts, whose permlinks must be `<manifest permlink>-p<index>` and whose lengths
   must add up to `encodedLength`. Parts are fetched with one `get_content_replies(uploader, permlink)`, falling back
   to `get_content` for any part it didn't return. A part is accepted only when its author is the manifest's author,
   its permlink is the one the manifest lists, and its parent is the manifest. Anyone can reply to a manifest; other
   replies are ignored. A part's encoded text is read in the manifest's version: `forkbuild.data` (with
   `forkbuild.version` equal to the manifest's) in version 2, the body in version 1. A part whose `json_metadata` is
   missing or cut short is reported as carrying no ForkBuild data.
4. Each part's `length` and `sha256` must match. The parts are joined in order, and the result must be
   `encodedLength` characters long.
5. `gzip-base64` is decoded and decompressed with the browser's `DecompressionStream`, stopping as soon as the output
   exceeds `size` or the store's decoded limit, so a small upload can't expand without bound. The result must be
   exactly `size` bytes.
6. The content is verified against `contentHash` by the existing path, as for bytes from any other store.

A missing part, a failed check or an unreachable node is a `ContentUnavailableError`, never "absent". The reader
uses the API nodes from Network Settings → Steem, as the announcement readers do. Votes, payout, reputation and
front-end muting are ignored. An edit to a manifest or part after upload makes the content unavailable (checks 4 or
6 fail) rather than changing it. Verified bytes are kept locally like any other published copy, so a later edit or
node outage doesn't lose a copy already loaded.

### Limits

- A part (or an inline manifest) is at most 48 KiB of encoded text, escaped as above, and the operations of one
  transaction are checked against the 64 KiB limit before signing, as for announcements.
- An upload is at most 20 parts (960 KiB of encoded text, about 720 KiB compressed), so at most 21 posts and 21
  Keychain approvals. `maxContentBytes` can't be known before compressing, so the store compresses first and throws
  `SteemContentTooLargeError` (a `ContentTooLargeError`) pointing to IPFS or Arweave before anything is posted.
- Measured compression (gzip, then base64) is about 1.6 times on typical builds, because every brick's UUID is
  random and doesn't compress: the whole village structure library (315 bricks) encodes to 6.5 KB, and a plain
  2,000-brick block to 35 KB. One post therefore holds a build of about 2,500 bricks, and 20 parts about 30,000.
  Builds with short brick ids compress much better.
- The decoded content is at most 64 MiB, the same bound as a peer transfer.

Checking API nodes. Version 2 depends on API nodes returning a post's `json_metadata` in full, close to 48 KiB.
`scripts/steem-threads/content-check.html`, an operator page served like the thread page, stores random test content
that needs a manifest and two near-full parts through the real `SteemContentStore`, then reads it back from each
listed node on its own (`get_content` and `get_content_replies`), reporting per node whether it came back unchanged
(`scripts/steem-threads/SteemContentCheck.js`).

### Scope

Steem storage holds a Snapshot's bytes and a Publication's Signed Claim (the material the Arweave and IPFS uploaders
also place), in the same manifest format. A Signed Claim is a few kilobytes, so it is always one inline manifest.
The work was done in the order the proposal suggested: the inline case, then parts with progress and resuming, then
the Resource Credits estimate, then Signed Claims. Still open: comparing the RC estimate with a live node, and
measuring compression on more real builds to confirm the part size and part limit.

Where it's chosen: the Storage choice in the Editor and World View Distribute dialogs offers **Steem** next to IPFS
and Arweave; the Publications page's Content choice and the Content Provider settings page offer **Steem** too. The
Distribute dialogs share one Storage choice between the Snapshot and the Signed Claim. With Steem chosen,
`composePublicationMaterialUploader()` stores the claim through the Steem runtime's `SteemContentStore`, and the
Publication announcement's `uri` is the claim's `steem://<author>/<permlink>` locator, on whichever substrate
announces it. It ships as Experimental, like the Steem announcement substrate.

Reading a Signed Claim back: World discovery's decentralized material source sends a `steem://` uri to
`application/worldEncounter/SteemWorldEncounterMaterialResolver.js` and every other uri to the Arweave resolver. The
resolver reads through its own `SteemContentStore` with no announcer and a 48 KiB decoded limit (the Arweave
resolver's limit for material), and follows the Arweave resolver's contract: a missing post, a post that isn't a
content manifest, changed parts, oversized content, or content that isn't a JSON object reads as unavailable; a Steem
node that can't be reached rejects. It never checks the claim's signature; the material verifier does, as for every
substrate.

## Proposed: Steem Anchoring

**Status: built, Experimental.** Code: `core/SteemAnchor.js` (the operation, proof, locator and batch formats),
`core/SteemBinary.js` (Steem's binary serialization, ids and Merkle tree), `core/SteemBlockEvidence.js` (kept block
evidence), `anchoring/SteemProofVerifier.js`, `anchoring/SteemAnchorPublisher.js`,
`anchoring/SteemAnchorFinalityObserver.js`, `anchoring/SteemAnchorEvidenceView.js`, and `postAnchor()` in
`application/steem/SteemAnnouncer.js`. `composeSteemRuntime()` builds them, and `ui/main.js` registers them with the
other anchor types, so the Publications page offers **Create Steem Anchor**, anchoring several publications at once
(Blockchain Anchoring tools), and the Proof/Anchoring settings page offers Steem. Not yet tried against a live node
or a real Keychain.

Steem would be a fourth Proof/Anchoring choice next to Bitcoin, Arweave and Base: an anchor type `steem` whose
evidence is the Publication's `contentHash` in an irreversible Steem block. As with the other anchor types, the
anchor claims only that the anchoring identity recorded this hash where `locator` says (`core/PublicationAnchor.js`).
Checking that claim against the chain is a separate step, done by a `ProofVerifier`. Steem anchoring is separate
from the Steem announcement substrate and from Steem content storage. An anchor is not an announcement, and none of
the three needs either of the others.

Why Steem: a block is produced every 3 seconds, on a fixed witness schedule, and becomes irreversible when more than
two thirds of the witnesses have built on it, about a minute later. Bitcoin takes about an hour for six
confirmations, and a Bitcoin block's own timestamp may be off by up to about two hours. Anchoring costs Resource
Credits, which regenerate, not a fee per anchor as on Bitcoin, Arweave and Base.

### What it is weaker at

Steem anchoring is offered next to Bitcoin anchoring, never instead of it. The UI and user guide say so plainly
("attested by Steem witnesses"), never "secured like Bitcoin".

- **Who backs the timestamp.** Bitcoin's history is protected by proof of work, so rewriting it costs energy. Steem's
  is signed by about 21 witnesses elected by stake. Enough of them colluding could sign a different history. This has
  nearly happened: in 2020 exchange-held stake voted in new witnesses, which led to the Hive fork, and the chain has
  frozen accounts by soft fork. Many nodes keep copies of the block log, so rewriting
  history would be noticed. Blocks from before the Hive fork (20 March 2020) are also kept on Hive.
- **Checking an anchor years later.** A Bitcoin anchor can be checked with block headers alone, and Bitcoin is very
  likely to last longer than this project. Steem has no light client and few public API nodes, and the verifier
  trusts the nodes that answer, though it asks every configured one (see "Verifying" below). `BitcoinOpReturnProofVerifier`
  also trusts a single Esplora API today, so the two are closer in practice than in principle.
- **Edits and deletions.** A post's body can be edited, and a post with no votes or replies can be deleted, so
  `get_content` shows what a post says now, not what was broadcast. For that reason the anchor is a `custom_json`
  operation, which can't be edited, and the verifier reads it from its block, never from `get_content`.

### Anchoring

One transaction of one operation, signed with the anchoring account's posting key through Steem Keychain
(`steem_keychain.requestBroadcast(account, operations, 'Posting', callback)`, the same call announcements use).
ForkBuild never holds a Steem key.

    ['custom_json', {
      required_auths: [],
      required_posting_auths: [<anchoring Steem account>],
      id: 'forkbuild-anchor',
      json: JSON.stringify({ version: 1, contentHash })            // one Publication
         or JSON.stringify({ version: 1, merkleRoot, count })      // a batch, see "Batches"
    }]

- `contentHash` is the Publication's own, as raw text. It is never hashed again and never re-encoded, the same rule
  `BitcoinOpReturnProofVerifier` and `BaseProofVerifier` follow. Nothing else is carried: a publisher is handed only
  the contentHash (`CreateExternalPublicationAnchorUseCase`), the same as for the other anchor types.
- A `custom_json` never shows in Steem feeds, needs no discovery thread, and doesn't count against the 3-second
  reply interval. It still goes through the same queue as announcements and content, so posts from one account
  never race each other.
- The anchoring account is the Steem account from Network Settings → Steem. The Steem account never becomes a
  ForkBuild identity: `anchorIdentity` and the anchor's signature stay the ForkBuild identity's, as for every other
  anchor type.
- After the node accepts the broadcast, the publisher finds the block the transaction landed in. Keychain's result
  usually names the block and transaction; the publisher checks that block with `condenser_api.get_block`. When the
  result names no block, or a block that doesn't hold the transaction, it reads the blocks produced since just
  before the broadcast (the head from `get_dynamic_global_properties`, at most 100 blocks, a block interval apart)
  and finds the operation by account and contentHash, and by transaction id when Keychain gave one. It returns:

      { published: true, locator: 'steem:<trxId>', proof: { blockNum, trxId, chain: 'steem', evidence? } }

  `evidence` is the kept block (see "Keeping evidence"), present whenever the publisher could check the block.

  As `ArweaveAnchorPublisher` does, the publisher never invents `anchoredAt`. "Published" means an API node accepted
  the transaction, not that its block is irreversible; until it is, verifying reports the proof as unavailable.
  A transaction the chain accepted but whose block can't be found is reported as unavailable, naming the
  transaction, so the person can check the account's history before anchoring again.
- No account, no Keychain, a declined signature and an unreachable node are each reported as unavailable with the
  reason, never thrown; the Publications page shows them as "No anchor was created".
- Several Publications can share one operation (see "Batches"), so one Keychain approval covers them all.

### Batches

`publishBatch(contentHashes)` anchors up to 64 distinct contentHashes (`STEEM_ANCHOR_MAX_BATCH`) with one operation
carrying their Merkle root, as OpenTimestamps does. The tree (`steemAnchorBatch()` in `core/SteemAnchor.js`) is built
over the distinct contentHashes in the order given:

    leaf  = SHA-256(0x00 ‖ UTF-8(contentHash))
    node  = SHA-256(0x01 ‖ left ‖ right)
    an odd last node is carried up unchanged; merkleRoot is the top node, as 64 hex characters

The 0x00 and 0x01 prefixes keep a leaf from passing for an inner node (as in RFC 6962). Each Publication's proof is
the shared `{ blockNum, trxId, chain, evidence }` plus `batch: { path }`, its siblings from the leaf up, each
`{ position: 'left' | 'right', hash }`. The verifier follows the path from the Publication's own contentHash and
requires the operation's `merkleRoot` to equal the result, so a path from another Publication, or a batch
transaction presented as a single anchor, is rejected. A repeated contentHash shares one leaf and one proof; a batch
with one distinct contentHash is published as a single anchor.

`CreateExternalPublicationAnchorUseCase#executeBatch(publicationIds, anchorType)` runs a batch for any publisher with
`publishBatch()`, and creates and signs one `PublicationAnchor` per Publication from its proof, exactly as a single
anchor is created. `PublicationAnchorCreationCoordinator` offers `batchAnchorTypes()` and `createBatch()`. On the
Publications page, Wallet, Archive & Publisher Tools → Blockchain Anchoring has **Anchor Several Publications on
Steem**: pick publications (**Select Unanchored** picks those without a Steem anchor), then one click and one
Keychain approval anchor them all.

### Verifying

`SteemProofVerifier` (`anchorType` `'steem'`) checks `{ blockNum, trxId, chain }`, and `batch.path` for a batch
anchor, against `{ contentHash }`:

1. `chain` must be `'steem'`. Hive would be a separate anchor type with its own verifier, never mixed with Steem
   results, as for announcements.
2. `condenser_api.get_dynamic_global_properties`: if `blockNum` is above `last_irreversible_block_num`, the result
   is unavailable ("not yet irreversible"), never a rejection. That matches an unconfirmed Bitcoin transaction.
3. `condenser_api.get_block(blockNum)`: a node that can't be reached, or returns no block, gives unavailable. A
   block whose `transaction_ids` doesn't include `trxId` is a definite rejection, since an irreversible block never
   changes.
4. The transaction at that position must contain a `custom_json` with `id` `'forkbuild-anchor'`, whose `json` parses
   to `version: 1` and whose `contentHash` equals the anchor's (for a batch anchor: whose `merkleRoot` equals the root
   the path leads to from the anchor's contentHash). Anything else is a definite rejection.
5. The verifier asks every configured API node (Network Settings → Steem, at most three) separately, and every node
   that answers must agree on the block's id, whether it holds the transaction, and whether that carries the anchor.
   If they disagree, the result is unavailable and names each node's answer. If any answering node doesn't see the
   block as irreversible yet, the result is unavailable. A node that returns a block whose id doesn't start with the
   requested block number is treated as not answering. The default configuration has one node
   (`https://api.steemit.com`), so adding a second is what makes the check compare nodes.
6. Every result carries `details`: the block number, whether it is a batch anchor, and the kept evidence checked
   offline (`evidence: { ok, … }` or null); a valid result adds the block's id, `timestamp` (UTC) and `witness`, and
   how many nodes agreed out of how many were asked; a not-yet-final one adds the last irreversible block.
   `ExternalAnchorVerifier` passes a proof verifier's `details` on in its result (never reading them to decide the
   outcome), and the Publications page shows them under the anchor after **Verify Evidence**: "Recorded in Steem
   block N at T UTC by witness W. 2 of 2 API nodes answered and agree. The kept block evidence checks out offline."
7. Kept evidence never decides the outcome. Evidence that doesn't check out is reported in `details.evidence` while
   the chain's answer stands, and evidence that does check out never turns an unreachable chain into valid; the
   unavailable reason then says the evidence checks out offline.

Votes, reputation, payout and front-end muting play no part.

The evidence view (`SteemAnchorEvidenceView`) never calls a node. It shows the block number, the transaction id,
whether it is a batch anchor, and "Attested by: Steem witnesses (elected by stake, not proof of work)", and links to
the block on SteemWorld (`https://steemworld.org/block/<blockNum>`). When the proof keeps block evidence, it checks
it offline and shows the block's own time, witness and signing key from it, so the time the block was recorded is
shown without any network, rather than the anchor's `anchoredAt` (only a report, see `core/PublicationAnchor.js`).

### Keeping evidence

The publisher keeps the block it found in the proof, as `evidence` (`core/SteemBlockEvidence.js`), so the anchor
carries it wherever it goes and it is covered by the anchor's signature:

    evidence: {
      version: 1,
      header: { previous, timestamp, witness, transaction_merkle_root, extensions, witness_signature },
      signingKey: 'STM…',                       // the key that made witness_signature
      transaction: { ref_block_num, ref_block_prefix, expiration, operations, extensions, signatures },
      merklePath: [{ position: 'left' | 'right', hash }]   // SHA-256 digests, from the transaction up
    }

It is about 1–2 KB whatever the block's size, since only the anchor transaction and its Merkle path are kept.
`checkSteemBlockEvidence()` checks, without any network:

1. the signed header hashes to a block id (SHA-224 of the packed signed header, cut to 20 bytes, with the block
   number, one more than `previous`'s, in its first 4 bytes) whose number is the proof's `blockNum`;
2. the witness signature, over SHA-256 of the packed unsigned header, recovers (secp256k1) to `signingKey`;
3. the transaction's id (the first 20 bytes of SHA-256 over the packed unsigned transaction) is the proof's
   `trxId`, and it carries this anchor;
4. SHA-256 of the packed signed transaction, followed up `merklePath` (pairs hashed with SHA-256, the top cut to
   RIPEMD-160, as the chain builds it), gives the header's `transaction_merkle_root`.

What it can't show offline is that `signingKey` was the named witness's key at that time, or that the block is on
the chain and irreversible; that still needs a node, and the verifier checks it there.

To keep evidence, the publisher must reproduce the block exactly: `core/SteemBinary.js` serializes transactions and
every operation current Steem blocks carry (ids 0–13, 15–29 and 31–46 of steemit/steem's `operations.hpp`; not the
retired `pow`/`pow2`) as `fc::raw::pack` does, and the block header with its version and hardfork-vote extensions.
Its output matches dsteem 0.11.3 byte for byte for every one of those operations (dsteem signs real Steem
transactions), and a header signature made by dsteem recovers to dsteem's key; `tests/SteemAnchorEvidence.test.js`
keeps dsteem's transaction ids as fixed vectors. Evidence is kept only after the block's id, Merkle root and
signature all check out against what the node returned, so a serialization mistake or an operation this code
doesn't know means an anchor without kept evidence, never evidence that is wrong. Cryptography comes from the
vendored noble libraries (`secp256k1`, SHA-224/256, RIPEMD-160).

### Finality

`SteemAnchorFinalityObserver` watches a newly created anchor, checking `last_irreversible_block_num` every 3 seconds
for up to 3 minutes. States: `pending` (not final yet), `final` (the block is irreversible and still holds the
transaction), `dropped` (the final block doesn't hold it: a fork dropped it before finality) and `unknown` (no node
answered, or the wait ran out). `ui/main.js` provides it as `anchorFinalityObservers` (by anchorType), and the
Publications page watches every Steem anchor it creates, singly, by the preferred provider or in a batch: the card
shows "Waiting for finality: Steem block N holds the anchor but isn't final yet…", then "Anchored: Steem block N is
final (recorded at T UTC), so the chain can no longer undo this anchor." The observer is a convenience for the
person who clicked; it proves nothing to anyone else, and verifying is still what checks an anchor.

### Order of work

1. Done: `SteemProofVerifier` with a fake node in tests, and its evidence view.
2. Done: `SteemAnchorPublisher` through Keychain, registered in the Proof/Anchoring choice as **Steem (Experimental;
   attested by Steem witnesses, weaker than Bitcoin)**, with the user guide explaining the trust difference.
3. Done: finality after publishing, the block's time in the app, kept block evidence, and batches.
4. Still open: trying it against a live node and a real Keychain (neither is reachable from the development
   environment), and checking a kept signing key against the witness's key history.

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
