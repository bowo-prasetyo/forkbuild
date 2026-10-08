# ForkBuild Protocol

This file specifies what ForkBuild serializes, stores for others to read,
or sends over the network, as it is now. It is edited in place when a
format changes. docs/ProtocolHistory.md keeps the milestone-by-milestone
protocol notes for 0.1.x–0.2.45; docs/Architecture.md describes the code
that produces these formats.

The sections titled "Proposed: Steem …" and "Proposed: Blurt
Substrate" were written as proposals and have since been built; each
opens with its status (built, Experimental). Their titles stay as they
are because code comments cite them by title.

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
        animalDecorations: [ AnimalDecoration ],
        residents: [ WorldResident ]                                   // optional, see below
      },
      metadata: {
        title, description, author, authorIdentityId, created, modified,
        protocolVersion, engineVersion, parentDocumentId, parentStructureId,
        license: { id, attribution },
        placementPolicy                                              // optional, see below
      }
    }

    Brick: { id, definitionId, position: { x, y, z }, rotation, color }   // in memory, and in schema 1

- `rotation` is degrees around Y. Translate and rotate are the only
  transforms; there is no scale.
- A StructurePlacement references another Document by id and never
  copies its bricks.
- Fields added after a document was written are optional and read with a
  default (`description` as `''`, arrays as `[]`, `color` as `null`,
  `placementPolicy` as `'anyone'`). `placementPolicy` is written only when
  it isn't `'anyone'`, so documents that never set it hash as before.
- The content hash of a document is serializer/contentHash.js over the
  canonical JSON: SHA-256 of its UTF-8 bytes, as 64 lowercase hex
  characters (`sha256`). `core/ContentReference.js` records the algorithm.
  A signed record commits to its content through this hash, so a reader
  accepts bytes from anywhere else only when they match a SHA-256 hash.
- Content published before 2026-09-28 carries a 32-bit FNV-1a hash
  (`fnv1a-32`, 8 hex characters), which anyone can match with forged bytes
  in milliseconds. The two are told apart by length, never by the
  `algorithm` field. An FNV-1a hash is honored only for this device's own
  data (its own Publications, crash-recovery checkpoints); bytes from a
  peer, gateway, node or announcement under an FNV-1a hash are refused,
  and the author has to publish again. Nothing is anchored or placed under
  an FNV-1a hash: every anchoring and placement path refuses one before a
  publisher, wallet or store is asked, and no PublicationAnchor naming one
  is signed (`LEGACY_HASH_EXTERNAL_REASON` in serializer/contentHash.js). Text is hashed as UTF-8 and must be
  well formed: bytes that aren't valid UTF-8, a byte-order mark and lone
  surrogates are refused rather than decoded leniently, so different bytes
  can't reach the same hash.

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

### World Residents (2026-09-29)

A World with residents serializes a `residents` array next to its animal decorations:

    { id, worldId, authorIdentityId, position: { x, y, z } }   // position: the resident's home; y is always 0

A resident is authored World content, created by `CreateWorldResidentCommand` and removed by
`RemoveWorldResidentCommand`, so it is published, forked and replayed with the World. The field is written only when
the World has at least one resident, so a World without residents serializes byte for byte as before; a World
without the field reads as having none. `DocumentValidator` rejects a `residents` value that is not an array, and an
entry without string `id`, `worldId` and `authorIdentityId` or without a finite `position.x` and `position.z`.

Nothing else about a resident is stored or sent. Where it is at a moment is computed by every replica from its id,
its home, the time and the loaded Worlds' geometry (`core/ResidentMotion.js`), and it never appears in avatar
presence or any other message.

### Editor Document Export File (0.9.641–0.9.642)

Editor → Export writes exactly `DocumentSerializer.serialize()`'s output, the same envelope Save stores:

    { schemaVersion, world, metadata }

It is not a Publication and is not signed. Import runs `DocumentSerializer.deserialize()` (migrate → validate →
construct), then `DocumentCloneService`. The imported document always gets a fresh `documentId`, fresh brick and
building ids, and remapped group membership, with `parentDocumentId` set to `null`. A file's own `world.id` is never
reused as a storage key. Newer `schemaVersion`s are rejected. `protocolVersion` must still match exactly; there is
no migration path for it yet.

### Document Bundle

Editor → Recent → **Export All Documents** writes every saved document in one file:

    { kind: 'forkbuild-document-bundle', formatVersion: 1, exportedAt, documents: [ { schemaVersion, world, metadata }, … ] }

Each entry is exactly what Save stores, and each is validated on import like a single file; one that fails is
counted and skipped. A document whose `world.id` names nothing on this device is saved under that id, so documents
moved to a new device keep the placements and history that name them. One already here with the same serialized
content is skipped; one here with different content is imported as a copy with a fresh identity, as a single file
is. Recovery checkpoints are not included. Newer `formatVersion`s are rejected.

### Blueprint Bundle

**Export All** beside My Structures writes every personal structure in one file:

    { kind: 'forkbuild-blueprint-bundle', formatVersion: 1, exportedAt, blueprints: [ <blueprint package>, … ] }

Each entry is the package Export Blueprint writes (with its attributions and lineage claims), validated on its own.
A design whose blueprint fingerprint matches one already in My Structures is not added again.

## Publications and snapshots

A Publication (publisher/Publication.js) is pure data about one publish:

    { id, documentId, title, author, providerId, publishedAt, url,
      parentDocumentId, snapshotId, contentHash, schemaVersion,
      license, contentReference, publisherIdentity, placementPolicy,
      signature }

    contentReference: { hash, algorithm, mediaType, size, uri, storage }

`placementPolicy` (core/PlacementPolicy.js) is who may place the
Publication in shared space: absent means `'anyone'`, and
`'publisher-only'` means only the identity in `publisherIdentity` (or, for
an unsigned legacy Publication, the same `author` name). It is copied from
the document's metadata at publish time and is present in the record, and in
the signed payload, only when it isn't `'anyone'`, so Publications without it
keep their signatures. A receiver treats any value it doesn't recognize as
`'publisher-only'`.

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

### Link-only shares

A link can carry a Publication and its snapshot together, so it can be
shared before, or without, distributing it
(application/publication/sharing/PublicationLinkPayload.js):

    https://bowo-prasetyo.github.io/forkbuild/#/s/<payload>

    payload = "1" + base64url(deflate-raw(UTF-8(JSON)))   (no padding)
    JSON    = { "claim": <Publication JSON, signed>, "build": "<snapshot text>" }

`1` is the format version; a reader refuses any other. `build` is the
snapshot exactly as `contentHash` covers it, as a JSON string, never
re-serialized. A reader unpacks at most 4 MB and refuses more. The writer
offers a link only for a signed Publication whose payload is at most 12,000
characters (about 500 bricks). The route is in the fragment, which browsers
never send to a server.

The link Share offers is the rendezvous worker's preview of it, so it shows
a title and picture where it is pasted
(server/rendezvous-worker/buildPreview.js):

    https://forkbuild-rendezvous.prazjp.workers.dev/b/<payload>
    https://forkbuild-rendezvous.prazjp.workers.dev/b/<payload>/preview.png

The page carries Open Graph and Twitter card tags and a `refresh` to
`<APP_URL>#/s/<payload>`. Its title, description and picture come from the
claim only when the claim's signature verifies against its
`publisherIdentity.id` (did:key) over the Publication's signing descriptor
and SHA-256 of `build` equals the claim's `contentReference.hash` (or
`contentHash`); otherwise it is a plain "A shared build" card. The picture
is drawn from the snapshot's brick tables (schema 2) or brick lists
(schema 1).

Opening one (`openPublicationLink({ linkOnly })`) is the shared-link path
below with no network: the claim is verified with the World discovery
verifier, the build is kept only if it matches the claim's `contentHash`
(StoreSnapshotContentUseCase), and the Publication is admitted to the
discovery provider and the admission log. No publisher placement travels in
the link, so none is searched for: the build stands at its deterministic
grid position. When the Publication has been distributed, Share offers the
network link instead, as the shorter one.

The same payload embeds the build in another site's page, as an `<iframe>`
of the app's embed page (ui/embed/, core/ForkBuildAppLinks.js `embedCode()`):

    <iframe src="https://bowo-prasetyo.github.io/forkbuild/embed.html#<payload>"
            width="640" height="480" title="<title> on ForkBuild"
            style="border:0;max-width:100%" loading="lazy"
            referrerpolicy="no-referrer"></iframe>

The embed page checks the claim and build as opening the link does
(application/publication/sharing/OpenEmbeddedBuild.js) but keeps and admits
nothing, and links to `#/s/<payload>`. The rendezvous worker answers oEmbed
(https://oembed.com) for its `/b/` links:

    https://forkbuild-rendezvous.prazjp.workers.dev/oembed?url=<a /b/<payload> link>[&maxwidth=…][&maxheight=…][&format=json]

with a `rich` answer whose `html` is the same `<iframe>` (titled in English,
sized within `maxwidth` and `maxheight` at 4:3), plus `title`, `author_name`
and the `/b/<payload>/preview.png` thumbnail, only for a claim and build that
check out as above; anything else is 404, and a `format` other than `json`
is 501. The `/b/` page of such a build names it with
`<link rel="alternate" type="application/json+oembed">`.

## Signatures

Every signed object is signed over a canonical envelope built in fixed
property order (core/Signature.js):

    { domain: 'forkbuild', type, id, revision, payload }

`type` separates object kinds, so a signature over one kind can never be
replayed as another. core/Signature.js's `SignatureType` lists the first
types (`publication`, `placement-record`, `spatial-index-root`,
`avatar-presence`, `avatar-profile`, `avatar-interaction`,
`avatar-vehicle`, `peer-authentication`); each later envelope defines its own type in its
`get…SigningDescriptor()`. The signature itself is stored as:

    { algorithm: 'Ed25519', signer, signature, signedHash, domain, signedAt }

`signer` is the did:key of the signing identity.
identity/LocalAuthorizationVerifier.js checks that the signature is
authentic and that the signer is the one allowed to sign that object.
When a record carries its signer's identity (`{ id, algorithm, publicKey }`),
the `publicKey` must be the key its did:key `id` encodes; a record whose
identity pairs one did:key with another key is refused.

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
are inside the signed envelope. A PlacementRecord whose Publication is
`'publisher-only'` is valid only when signed by the publisher: a replica
refuses to create any other. Placements from other devices arrive only as a
publisher's own signed record beside a Snapshot (see "Signed placement"
under the discovery families), which the policy always allows. The retired
peer replication (ReplicaMergeService) also rejects one that breaks the
policy (reason `PLACEMENT_POLICY`). The spatial-index formats
(SpatialCell, SpatialIndexManifest, SpatialIndexRoot) and Delegation
records are defined in core/ but not produced by the running app. A
Delegation is signed like every other record, under the signature type
`delegation`, over `{ id, issuer, delegate, issuedFor, action, subject,
constraints, expiresAt, issuedAt, nonce, parentDelegationId }` with
`revision` 1, and is valid only with the key its issuer's did:key encodes.

## Rendezvous

A rendezvous server helps peers find each other before they connect. The
client is peer/WebSocketRendezvousTransport.js and the reference server is
server/rendezvous-worker/worker.js. It speaks JSON frames over one
WebSocket; each request carries a `requestId` and gets exactly one
`{ v: 1, type: 'OK', requestId, result }` or
`{ v: 1, type: 'ERROR', requestId, message }`.

Two contracts share the connection. Identity lookup
(peer/RendezvousTransport.js) answers only for an exact identity and can
never list anyone. The public lobby (peer/RendezvousLobbyTransport.js) lists
only identities that joined it.

| Request | Fields | Result |
| --- | --- | --- |
| `PUBLISH` | `publication`: a signed peer/RendezvousPublication.js (an invitation carrying a WebRTC offer) | the stored publication |
| `LOOKUP` | `identityId` | the identity's current publication in an array, or `[]` (also once it has been answered) |
| `REMOVE` | `identityId`, `publicationId`, `signature` | whether one was withdrawn |
| `POST_ANSWER` | `identityId`, `publicationId`, `answer` (a PeerConnectionAnswer's JSON), `answererId`, `signature` | `true`; refused if the publication is not current or already answered |
| `FETCH_ANSWER` | `identityId`, `publicationId`, `signature`, optional `watch: true` | `{ answer, answererId }`, or `null` while none has arrived; with `watch`, always `{ answer, answererId, watching }` (`answer` null while none has arrived) |
| `JOIN_LOBBY` | `card`: a signed core/LobbyCard.js | the stored card |
| `LEAVE_LOBBY` | `identityId`, `lobby`, `cardId`, `signature` | whether one was withdrawn |
| `LIST_LOBBY` | `lobby` | `{ cards, total }`: at most 50 current cards, a random sample, and how many there are |

Signatures use the canonical envelope (see "Signatures"), with these types:

| Type | Signed by | `id` | `revision` | `payload` |
| --- | --- | --- | --- | --- |
| `rendezvous-publication` | the publishing identity | its did:key | `publicationId` | the publication (core/RendezvousPublicationEnvelope.js) |
| `rendezvous-removal` | the publishing identity | its did:key | `publicationId` | `{ publicationId, identityHint }` |
| `rendezvous-answer` | the answering identity | its did:key | `publicationId` | `{ publicationId, identityHint, answer }`; `identityHint` is the publisher |
| `rendezvous-answer-fetch` | the publishing identity | its did:key | `publicationId` | `{ publicationId, identityHint }` |
| `lobby-card` | the card's identity | its did:key | `cardId` | `{ cardId, identityId, lobby, displayName, publishedAt, expiresAt }` |
| `lobby-leave` | the card's identity | its did:key | `cardId` | `{ cardId, identityId, lobby }` |

A lobby is `public` or `world:<documentId>` (`documentId` of 1 to 128
characters from `A-Z a-z 0-9 . _ -`). A display name is at most 40
characters, whitespace collapsed and trimmed, with no control characters
(core/LobbyCard.js#normalizeDisplayName). A card carries no offer or
address. Publications and cards last at most 15 minutes; an older one
cannot replace a newer one for the same identity (and lobby), and a
withdrawn one cannot be sent again. Receivers verify every listed card by
its own signature, whatever the server says.

The server also sends one unrequested message, with no `requestId`:

    { v: 1, type: 'ANSWER', identityId, publicationId, answer, answererId }

It goes only to a connection that sent a signed `FETCH_ANSWER` with
`watch: true` for that publication (`watching: true` in the reply), once,
when the answer arrives. The watch is kept with the connection, one
publication per connection, and ends with the push or the connection.

Connecting through rendezvous: the finder LOOKUPs the identity, answers the
offer, and leaves its answer with POST_ANSWER. The publisher sends
FETCH_ANSWER with `watch: true` as soon as it publishes, which returns an
answer already waiting and registers the watch; the server then pushes the
answer and the publisher completes the connection. The publisher checks
again every 30 seconds in case a push was lost to a dropped connection, or
every 2 seconds when any of its servers did not reply `watching: true` (a
server from before pushes). Only then does the peer handshake below run.
Without a signing identity the finder gets the answer back to hand over
itself.

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
| `forkbuild:avatar-vehicle` | core/AvatarVehicleAdvertisement.js | what an avatar rides |
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
| `forkbuild:snapshot-possession` | application/snapshot/possession/PublicationSnapshotPossessionPeerExchange.js | see "Snapshot possession exchange" |
| `forkbuild:snapshot-content-transfer` | application/snapshot/materialization/PublicationSnapshotContentPeerExchange.js | Snapshot bytes |
| `forkbuild:world-encounter-material` | application/worldEncounter/PeerWorldEncounterMaterialSource.js | encounter content |
| `forkbuild:commentary-distribution` | core/PublicationCommentaryDistributionEnvelope.js | see "Publication Commentary Distribution" |
| `forkbuild:announcement-index` | application/announcementIndex/AnnouncementIndexPeerProtocol.js | see "Announcement Index exchange" |

### Announcement Index exchange

Peers share the Snapshot candidates and Place Naming claims each has
discovered (docs/AnnouncementIndex.md, "Phase 5"). Three payloads:

    SUMMARY   { kind: 'summary', entries: [{ kind, tag, count, digest }] }
    REQUEST   { kind: 'request', recordKind, tag }
    RESPONSE  { kind: 'response', recordKind, tag, payloads: [...] }

- `kind` / `recordKind` is `snapshot` or `place-naming`.
- `digest` is `<count>:<FNV-1a of the sorted record keys>`.
- Each side sends a SUMMARY once a connection authenticates, of at most
  300 entries and 48 KiB.
- The receiver REQUESTs each tag whose digest differs from its own, at
  most 50 per SUMMARY.
- RESPONSE payloads are the same shapes the index stores: a Snapshot
  candidate, or a Place Naming discovery envelope. They are split so
  each message carries at most 48 KiB of payloads.
- A RESPONSE is ignored unless it answers a REQUEST sent to that peer
  within five minutes.
- Payloads are checked like any other discovery result. The signatures
  on Place Naming claims are verified where they are used, as for claims
  from a substrate.

### Snapshot possession exchange

Asks a peer whether it holds the bytes for a content hash, for the
Publications page's **Which peers have it?**. No content crosses the wire;
fetching is `forkbuild:snapshot-content-transfer`'s job. Two payloads
(`application/snapshot/possession/PeerSnapshotPossessionProtocol.js`):

    REQUEST   { kind: 'REQUEST', publicationId, contentHash }
    RESPONSE  { kind: 'RESPONSE', publicationId, contentHash,
                possession: 'available' | 'not-available' }

- `publicationId` is a non-empty string of at most 512 characters;
  `contentHash` is hex, at most 128 characters. Any other message is
  ignored.
- A peer always answers a REQUEST, from its own local check of
  `contentHash`: `available` only when it holds bytes that match it, so a
  mismatch is `not-available`. `publicationId` is only echoed back, and no
  catalog is consulted on either side.
- The asker sends one REQUEST to each peer the person ticked, and treats no
  RESPONSE within 8 seconds as "could not determine". An answer is what
  that peer said at that moment: it is not signed, never forwarded, and
  never becomes a placement or a source of bytes.

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
    vehicle:      { avatarId, ownerIdentity, riding, vehicleId, vehicleType,
                    sequence, signature? }

- `animation` is IDLE, WALKING, RUNNING or JUMPING; gesture `kind` is
  GREET, WAVE or POINT and never appears in `animation`.
- On foot, `position.y` is measured from the terrain under the avatar
  (0 is standing on the ground or a lake or sea bed). A swimming or
  diving avatar sends its ordinary animation with a `position.y` above
  the bed; receivers work out that it is swimming from the position, so
  there is no swim field. Older clients, which floored avatars at the
  water surface beyond wading depth, draw such an avatar above the water.
- Presence, profile and interaction messages are signed when the
  sender's identity provider can sign. A receiver binds each claim to
  the connection it arrived on and rejects replays by `sequence`.
- Presence is never persisted. A visibility policy (PUBLIC, FRIENDS,
  LOCAL, HIDDEN) decides whether it is sent at all.
- There is no proximity message. Nearness is always derived locally
  from presence already received.
- The vehicle message says what an avatar rides. `riding` is true only
  with a `vehicleType` of bicycle, motorcycle, car or drone and a
  `vehicleId` (1 to 200 characters); on foot, both are null. It is
  signed as type `avatar-vehicle` over all six fields, with `avatarId`
  as the id and `sequence` as the revision, and judged like presence:
  signature, blocking, the avatar's bound signer, replay, a second
  claim at one `sequence` (equivocation), then order. It is sent when
  the avatar gets on or off and every 2 s while nothing changes, only
  where presence would be sent, and never persisted. It is a message of
  its own, not a presence field, so older clients, which don't know the
  protocol id, ignore it and still accept presence.
- A receiver draws the vehicle under a rider, at the rider's position
  (which already includes the ground height), facing the way it
  travels, and hides and refuses to mount its own copy of that
  `vehicleId` while it is ridden. Where a vehicle stands when nobody
  rides it is not sent: once the rider gets off, each replica shows it
  where it last had it.

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
                       encryptedPrivateKey, lifecycle? }
    lifecycle:       { revocation?, succession?, deviceAuthorizations?: [ { deviceIdentityId, grant, revocation } ] }
    encryptedPrivateKey: { version: 2, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM',
                           salt, nonce, ciphertext }            // hex strings

The export file is not signed; it carries the private key seed encrypted
with AES-256-GCM (additional data `forkbuild-identity-key/v2`) under a key
derived from the passphrase by PBKDF2-HMAC-SHA256 (600,000 iterations by
default, at most 10,000,000 accepted). `ciphertext` ends with the 16-byte GCM
tag. The same record shape stores a protected key on the device. Importing
still accepts `formatVersion: 1` files, whose key record has
`kdf: 'PBKDF2-HMAC-SHA512'` and a separate `tag`.

`lifecycle` is present when the identity has a revocation, a successor
declaration or device grants: the signed records above, verbatim. On import
each is verified and must name the imported identity (the revocation's and
grants' `identityId`, the succession's `predecessorIdentityId`); anything
else is dropped. A revocation or successor already on the device is kept;
for each device the later grant and the later revocation win. Older copies
ignore the field.

## Device backup

**Your Data → Back Up to a File** (or Share Backup, or a backup folder)
writes every storage entry except the device-only ones to one file,
`*.forkbuild-backup`:

    FORKBUILD-BACKUP\n
    { formatVersion: 1, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM', compression: 'gzip',
      salt, nonce }\n                                           // one line of JSON; hex strings
    <ciphertext>                                                // raw bytes, ends with the 16-byte GCM tag

The plaintext is gzip-compressed JSON, `{ formatVersion: 1, createdAt,
entries: { <storage name>: <stored value> } }`. A key remembered for
one-click and automatic backups is derived once, so the files it makes share
its `salt` and `iterations` and each has a fresh `nonce`; they open with the
passphrase like any other. Backups written to a folder are named
`forkbuild-backup-YYYY-MM-DD.forkbuild-backup` (UTC date). The key is derived from the
backup passphrase by PBKDF2-HMAC-SHA256 (600,000 iterations by default, at
most 10,000,000 accepted), and the magic line plus header line are the
cipher's additional data, so a changed header fails like a wrong
passphrase. The backup is never written unencrypted: it can hold private
keys stored without a passphrase and a TURN credential.

The device-only entries `local-session` and `device-backup-status` are
never included. Published content by hash (`content:<hash>`) is included only for your own
publications (a `contentHash` in `forkbuild-publications`), unless the user
asks for downloaded builds too. A restore writes only names this version
knows (application/backup/BackupEntryGroups.js) and reports how many it
skipped. It either replaces everything on the device, or adds what the
device lacks, keeping the device's own entry where both have one and
combining the document, identity and own-publication lists
(`forkbuild-index`, `local-identities`, `forkbuild-publications`).

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
tag) are grouped into families, and a reader only queries its own (Steem,
the third substrate, groups them by discovery thread instead; see below):

| Family | Tag | Envelope |
|--------|-----|----------|
| Publications | `forkbuild-publication`, plus `forkbuild-publication:<publicationId>` and `forkbuild-tag:<tag>` for each of its build's tags, for a Publication (not an avatar) | `{ protocol: 'forkbuild', version: 1, kind, objectId, uri }` (core/DecentralizedDiscoveryEnvelope.js) |
| Snapshots | `forkbuild-snapshot`, plus `forkbuild-snapshot:cell:<cx>:<cz>` when there is a `claimedPosition` | `{ protocol: 'forkbuild-snapshot-discovery', version: 1, publicationId, contentHash, storage, locator, claimedPosition, placementRecord }` (core/SnapshotDiscoveryEnvelope.js; `placementRecord` optional, see below) |
| Place naming | per region, from `derivePlaceNamingDiscoveryTag(worldId, regionId)` | `{ protocol: 'forkbuild-place-naming-discovery', version: 1, worldId, regionId, claim }` (core/PlaceNamingDiscoveryEnvelope.js) |
| Commentary | `forkbuild-commentary`, plus `forkbuild-commentary:<publicationId>` | see "Publication Commentary Distribution" |

The second tags are narrow tags (core/NarrowDiscoveryTags.js). They are
carried on the same Nostr event (a second `t` tag) or Arweave transaction
(a second transaction tag), never as a second announcement.

- **Build tags.** `forkbuild-tag:<tag>` names one of the build's own tags
  (core/BuildTags.js: lowercase letters, digits and inner hyphens), at most
  five, as the snapshot published on the announcing device has them. A
  week's build challenge (core/BuildChallenge.js) is the tag
  `<theme>-<yyyymmdd>`, its Monday in UTC, so every copy of the app names
  the same week the same way. The tag is the announcer's claim: a reader
  still fetches and verifies the signed record, and nothing checks that the
  build carries the tag.
- **Snapshot cells.** A cell is a 1,000-unit square of the claimed
  position's `x` and `z`: `cx = floor(x / 1000)`, `cz = floor(z / 1000)`.
- **Signed placement.** A Snapshot announcement with a `claimedPosition`
  may also carry `placementRecord`: the publisher's own signed
  PlacementRecord (see "Placement records") for that Publication, at
  exactly the claimed position. The envelope checks only that shape and
  otherwise leaves the record out, keeping the claim. A receiver adopts it
  (application/placement/AdoptPublisherPlacementUseCase.js) only when it
  already knows the Publication, the record is signed with that
  Publication's `publisherIdentity` key (whose did:key must encode that
  key), and it passes its own integrity check. A higher `revision` of the
  same `placementId` replaces a lower one; a record never replaces one
  held for another owner. Readers that predate the field ignore it.
- **Readers.**
  - World View reads the player's cell beside `forkbuild-snapshot`.
  - A Commentary refresh reads its Publication's tag beside
    `forkbuild-commentary`.
  - Verifying a claimed build (World View's Claimed Builds, see
    application/snapshot/claimed/VerifyClaimedBuildPublication.js) reads
    `forkbuild-publication:<publicationId>` beside `forkbuild-publication`
    to find that one Publication's signed record. An announcement's
    `objectId` only chooses which records to fetch; a record counts only
    if it is validly signed, has exactly that id, and names exactly the
    Snapshot's content hash.
  - The weekly challenge page reads `forkbuild-tag:<the week's tag>` alone
    (application/challenge/ChallengeEntryDiscovery.js), on Nostr and
    Arweave, and asks Blurt the same: a Blurt build post lists the build's
    tags in `json_metadata.tags`, so BlurtPublicationDiscoveryQueryService
    answers that query with the posts listing the tag, verifying and admitting each new record as the Repository's
    network discovery does.
  - Readers still read the global tags, so announcements made before the
    narrow tags existed are still found.
  - A reader stores a Snapshot under a cell tag only when its claimed
    position lies in that cell.

The `ui/main.js` constants and the `*DiscoveryPublisher` /
`*QueryService` classes in application/ set these tags.
`forkbuild-publications` and `forkbuild-index` are local storage keys,
not wire tags.

The Steem substrate groups by discovery thread instead of by tag; see
"Proposed: Steem Announcement Substrate" below.

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

One envelope, four carriers:

| Carrier | Where | Shape |
|---------|-------|-------|
| WebRTC  | peer protocol `forkbuild:commentary-distribution` | `{ kind: 'ANNOUNCE', envelope }` — announce only, no request/response history sync |
| Nostr   | a kind-1 event on every configured relay (fan-out) | `content` = envelope JSON; tags `['t', 'forkbuild-commentary']` and `['t', 'forkbuild-commentary:<publicationId>']` |
| Arweave | a tagged transaction | body = envelope JSON; tags `ForkBuild-Commentary-Discovery-Tag: forkbuild-commentary` and `ForkBuild-Commentary-Discovery-Tag: forkbuild-commentary:<publicationId>`, found through GraphQL tag search |
| Steem (Experimental) | a reply to the month's commentary discovery thread | `json_metadata.forkbuild.envelope` = the envelope; see "Proposed: Steem Announcement Substrate" |

Posting always persists locally first, announces over WebRTC second, and then publishes to one chosen asynchronous
substrate (Nostr, Arweave or Steem; the saved Announcement/Discovery default, overridable per post). It never publishes
to more than one. A network failure never undoes the local write. Readers query every substrate when a Commentary
section opens or on "Check for new comments" (Nostr and Arweave under both the shared tag and the Publication's own
tag, Steem through its monthly threads), filter by `publicationId`, and import every candidate through the same
verifier. The background sync (docs/AnnouncementIndex.md) also imports
every verified envelope under the shared tag, whichever Publication it is about.
A Nostr relay OK means "accepted," not durably stored. On Arweave, "not yet mined," "never published" and "gateway
unreachable" all surface as `ContentUnavailableError`, and are never reported as "absent."

## Proposed: Steem Announcement Substrate

**Status: built, Experimental.** The discovery threads exist on the chain (from 2026-09), and the app reads and
announces all four families. It ships as Experimental alongside the other decentralized publication tooling.

Steem is a third Announcement/Discovery substrate next to Nostr and Arweave. It carries the same envelopes as
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
2. **API nodes.** Readers use a configured list of API nodes (default `https://api.steemit.com`, then
   `https://api.justyy.com`, then `https://steemd.steemworld.org`, three operators) and try them in order. Every node serves the same chain, so the first node that answers is enough.
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

Steem is a third Content substrate next to IPFS and Arweave: a `ContentStore` whose `storage` is `'steem'`,
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

A Publication's Signed Claim (`put(bytes, { kind: 'publication' })`, which `ContentStorePublicationMaterialUploader`
passes and other stores ignore) gets a notice with a link instead: "A build published with ForkBuild: [see it in
3D](…). This reply holds its signed record for the ForkBuild app, and its payout is declined." The link is
`https://bowo-prasetyo.github.io/forkbuild/#/view/steem/<author>/<permlink>`, naming the claim's own post
(`core/ForkBuildAppLinks.js`, `FORKBUILD_APP_URL`). The Snapshot's posts keep the plain notice: they are posted first
and can't know the claim's permlink, and only a signed Publication can be shown in World View. Since version 2 keeps
the data out of the body, an author can edit the notice later (for example if the app moves) without touching what
is stored.

The build's card. Before a Signed Claim is posted, the store asks its `describePublication(claim)` hook
(`application/steem/SteemPublicationNoticeCard.js`, composed in `ui/main/composeWorldDiscovery.js`) for
`{ title, author, description, imageUrl }`: the title and author from the claim, the description from the build (read
from the local content store by content hash), and a 320×200 thumbnail drawn with `DocumentThumbnailRenderer` (as in
the Repository), signed through Steem Keychain and uploaded to the image host (see "Images for notices" below). The
notice then reads:

    [![<title>](<image address>)](<view link>)

    **<title>** by <author>

    <description>

    [See it in 3D](<view link>) · A build published with ForkBuild. This reply holds its signed record for the
    ForkBuild app, and its payout is declined. [What this is](…)

and `json_metadata.image` lists the picture, so front ends can show a preview. Text the user wrote goes through
`steemNoticeText()` first: one line; links, control and direction-override characters removed; HTML and Markdown
characters escaped; `@` and `#` followed by a zero-width space so they neither notify an account nor add a tag; at
most 100 characters for the title and 40 for the author. The description is shown whole, with the formatting it may
use (`core/DescriptionMarkup.js`: paragraphs, line breaks, headings, bullet lists, bold, italic) written as Markdown
(`### ` headings) and every piece of its text made safe the same way (`steemNoticeDescription()`), cut with "…" only
past 2,000 characters of text (`STEEM_NOTICE_DESCRIPTION_MAX`); a line that would read as a numbered list stays text.
A description that says the same as the title (ignoring case, spacing and punctuation) is left out. A picture address must be an https
URL with nothing that could end the Markdown early. Every part is optional and found on its own: a build not on this
device leaves the title and author; a picture that can't be drawn or uploaded, or whose signing is declined, leaves
the words; a hook that fails leaves the plain link notice. The claim is posted in every case. The picture costs one
Keychain approval and no Resource Credits.

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
          contentHash, algorithm,              // as in the ContentReference (algorithm 'sha256')
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
signed Publication that names it. The final check is as strong as `contentHash`'s algorithm (SHA-256; a legacy
`fnv1a-32` hash is refused, see "Document envelope").

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

Images for notices. Steem front ends don't show `data:` images, so a picture on a post has to live on an
image host. `steem/SteemImageUpload.js` uploads one the way Steemit's editor does: Steem Keychain's
`requestSignBuffer` signs "ImageSigningChallenge" followed by the image bytes with the posting key, and the image is
posted as the multipart field `file` to `<host>/<account>/<signature>` (host `https://steemitimages.com` by default),
which answers `{ url }`. The same operator page's image upload check (`SteemImageUploadCheck.js`) draws a 320×200
test image, signs and uploads it, and checks that the returned address loads, to confirm this works from ForkBuild's
own site before notices use it.

Since its deployment of 2026-09-29, steemitimages.com answers uploads without CORS headers, so a browser on any other
site gets no answer and the fetch fails. When the browser can't reach the host, the same signed upload goes to the
rendezvous worker's relay, `POST <worker>/steem-image/<account>/<signature>` (`server/rendezvous-worker/README.md`),
which forwards the multipart body unchanged to steemitimages.com and returns its answer with CORS headers. The host
still checks the signature against the account's posting key over these exact bytes, so the relay can neither change
the image nor upload as anyone, and it keeps nothing. A refusal by the host itself is final: the relay would forward
to the same host. A notice that goes without its picture says so in the Distribute dialogs and on the Publications
page, with the reason.

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

Opening the link (`application/publication/OpenPublicationLink.js`; routes `/view/steem/:author/:permlink`,
`/view/ar/:id` and `/view/ipfs/:cid`, all `ui/views/PublicationLinkView.js`), for a visitor who may have nothing of
ForkBuild's on their device:

1. The claim is read where its locator says it is stored (`application/publication/PublicationClaimRetriever.js`):
   `steem://` with the resolver above, `ar://<id>` (43 base64url characters) with the Arweave material resolver over
   the configured gateways, `ipfs://<cid>` (a bare CID) with `IpfsWorldEncounterMaterialResolver` over the configured
   IPFS gateways (48 KiB at most, a JSON object; a gateway can't tell "not on IPFS" from "unreachable", so a miss
   reads as unreachable). Each IPFS gateway gets 30 s (`PUBLICATION_CLAIM_IPFS_TIMEOUT_MS`), not a gateway store's
   usual 5 s, since content kept on someone's own node has to be found through the IPFS network first; the message
   when IPFS can't be reached says to try again or add a second gateway to fall back to. It is turned into a `Publication`.
2. It is verified with the same identity and signature verifier as World discovery; a claim that is unsigned or
   whose signature fails is not shown.
3. Its Snapshot is found by the Publication's content hash: already on the device; else at the claim's own locator
   when that is a stored one; else among announced Snapshot candidates (the composite search over the local catalog,
   Nostr, Arweave and Steem), Steem first, then Arweave, then IPFS. Each candidate is resolved through the
   resolution store registry.
4. The bytes are kept locally through `StoreSnapshotContentUseCase`, which refuses bytes that don't hash to the
   Publication's content hash.
5. The Publication is admitted as World discovery admits a verified one, to the in-memory discovery provider and the
   durable World Encounter admission log.
6. Its publisher's signed placement, announced beside the Snapshot (`placementRecord`), is adopted through
   `AdoptPublisherPlacementUseCase` (`application/placement/LinkedPublisherPlacement.js`) into the device's
   placement registry and spatial index: only a record signed with the Publication's own publisher key, newest
   revision winning. While the device holds no such placement, the announcements are searched for one even when the
   build was already here. A missing or rejected placement never stops the link from opening.

The view then opens `/world/<documentId>`, and World View loads it like any discovered Publication, at its placement,
or at its deterministic grid position when it has none.

Sharing. The same link is what the app offers to share once the Publication is distributed (before that, a
link-only share; see "Link-only shares") (`core/ForkBuildAppLinks.js` `publicationShareUrl()`,
`application/publication/PublicationShareLink.js`, `ui/components/PublicationShareLink.js`): it is derived from a
Publication's distribution record (`material.uri`, a `steem://`, `ar://` or `ipfs://` locator; `core/ForkBuildAppLinks.js`
`publicationViewUrl()` makes the link and `publicationClaimLocatorFromViewPath()` reads it back), so it needs no
network call. Share adds a note for an Arweave claim (a new upload can take minutes to reach the gateways) and for
one on the builder's own IPFS node (reachable only while that node is online). Every
Publication's record is saved to local storage when it changes (`PublicationDistributionLifecyclePersistenceBridge
#observeAll()` over the store's `subscribeAll()`), and restored on demand for Publications that startup doesn't
restore (startup restores catalogued Publications only). Share uses the
Web Share API where the browser offers it, otherwise the clipboard, otherwise the link is shown to copy by hand. It
is a permalink to the post: it works on any device, and opens whatever validly signed claim that post holds.

Anything that stops it (a link naming no post, a post that isn't a claim, Steem unreachable, a failed signature, a
build that isn't announced anywhere or doesn't match) is shown with a reason; "Try again" is offered when Steem or
the search was unreachable or the build wasn't found. Nothing is admitted without its build.

## Proposed: Steem Anchoring

**Status: built, Experimental.** Code: `core/SteemAnchor.js` (the operation, proof, locator and batch formats),
`core/SteemBinary.js` (Steem's binary serialization, ids and Merkle tree), `core/SteemBlockEvidence.js` (kept block
evidence), `anchoring/SteemProofVerifier.js`, `anchoring/SteemAnchorPublisher.js`,
`anchoring/SteemAnchorFinalityObserver.js`, `anchoring/SteemAnchorEvidenceView.js`, and `postAnchor()` in
`application/steem/SteemAnnouncer.js`. `composeSteemRuntime()` builds them, and `ui/main.js` registers them with the
other anchor types, so the Publications page offers **Create Steem Anchor**, anchoring several publications at once
(Blockchain Anchoring tools), and the Proof/Anchoring settings page offers Steem. Not yet tried against a live node
or a real Keychain.

Steem is a fourth Proof/Anchoring choice next to Bitcoin, Arweave and Base: an anchor type `steem` whose
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
5. The verifier asks the configured API nodes (Network Settings → Steem, the first three of any list but the defaults) separately, and every node
   that answers must agree on the block's id, whether it holds the transaction, and whether that carries the anchor.
   If they disagree, the result is unavailable and names each node's answer. If any answering node doesn't see the
   block as irreversible yet, the result is unavailable. A node that returns a block whose id doesn't start with the
   requested block number is treated as not answering. With nothing saved, it asks only the first two default nodes
   (`https://api.steemit.com` and `https://api.justyy.com`, `DEFAULT_STEEM_PROOF_NODES`), not the third used for
   reading: the check already compares two independent operators, and each extra node is one more that can hold a
   valid proof back as unavailable. With only one node configured, nothing is compared.
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

## Proposed: Blurt Substrate

**Status: built, Experimental.** Code: `core/BlurtPost.js` (posts, tags, metadata, the content manifest, locators and
what a post anchors), `core/BlurtBinary.js` (Blurt's binary serialization), `core/BlurtFees.js` (the fee formula),
`blurt/BlurtRpcClient.js`, `application/blurt/` (the poster, the reader, one adapter per family, the fee estimator
and `BlurtRuntimeComposition.js`), `content/BlurtContentStore.js`, and `anchoring/Blurt*.js`. Tried against live
nodes and a real Blurt Keychain before release 1.3.0.

Blurt is a fork of Steem (2020) with the same accounts, keys, posts, `custom_json` and `condenser_api`, so it can
fill all three roles, Announcement/Discovery, Content and Proof/Anchoring, as Steem does. It differs from Steem in
the ways that shape this design:

- **No downvotes.** Nobody can push a post's payout down or hide it by voting, so ForkBuild posts on Blurt keep
  their payout and earn rewards when people upvote them. Readers still ignore votes, payout and reputation.
- **No central account.** There are no discovery threads. Each person posts from their own Blurt account, as
  top-level posts under the `forkbuild` category, and readers find them by tag. Nothing depends on an account
  ForkBuild runs.
- **Fees instead of Resource Credits.** Every transaction pays `operation_flat_fee` per operation plus
  `bandwidth_kbytes_fee` per KiB of the signed transaction, both chosen by the witnesses (see "Fees").
- **Its own chain.** Chain id `cd8d90f2…6381f` (SHA-256 of `blurt`), key prefix `BLT`, the asset `BLURT` (3
  decimals), and operation numbers that differ from Steem's (see "Keeping evidence"). Results are never mixed with
  Steem's: Blurt is its own substrate, storage type `blurt` and anchor type `blurt`.

As on Steem, the chain is only a carrier. Every envelope goes through its family's existing verifier, content is
checked against `contentHash`, and a Blurt account never becomes a publisher identity.

The chain rules this design follows (from Blurt's source, `blurt/blurt` on GitLab): one top-level post per account
every 5 minutes (`BLURT_MIN_ROOT_COMMENT_INTERVAL`), one comment every 3 seconds (`BLURT_MIN_REPLY_INTERVAL_HF20`),
at most 64 KiB per transaction, a post pays out after 7 days, payout is on unless `comment_options` turns it off
(the default `max_accepted_payout` is 1,000,000 BLURT), and an edit (a `comment` with an existing permlink) is not
held to either interval, only to one edit per account per block.

### Build posts

Everything ForkBuild posts on Blurt hangs off a **build post**: a top-level post by the poster's own account.

    ['comment', {
      parent_author: '', parent_permlink: 'forkbuild',              // category, the first tag
      author: <poster's Blurt account>,
      permlink: 'forkbuild-<base36 ms timestamp>-<8 random [a-z0-9]>',
      title: <what the post carries, see below>,
      body: <for people: the build's card when there is one, and what the post carries>,
      json_metadata: JSON.stringify({ app: 'forkbuild/<app version>',
        tags: ['forkbuild', 'forkbuild-snapshot', 'forkbuild-publication'],   // forkbuild, then one per family
        image: [<the build's picture>],                                       // only when there is one
        forkbuild: { version: 1,
          announcements: [ { family: 'snapshot', envelope: <the family's envelope object> }, … ],
          anchors: [ <contentHash>, … ] } })
    }]

- No `comment_options` is sent, so payout, votes and curation stay at the chain's defaults (on). One operation per
  transaction also keeps the flat fee to one.
- Tags: `forkbuild`, then `forkbuild-<family>` for each family the post announces, in the order first announced.
  The family tags are the same strings as the Nostr `t` tags (`forkbuild-publication`, `forkbuild-snapshot`,
  `forkbuild-place-naming`, `forkbuild-commentary`). The chain's tags plugin indexes at most five tags, which is
  exactly `forkbuild` and the four families. After them come the build's own tags, when the post announces a
  Publication whose card is known: at most five, from `DocumentMetadata.tags`, which its author sets (with
  suggestions from the title and description) in Document Properties (`core/BuildTags.js`: lowercase `a–z`, `0–9`
  and inner hyphens, 2 to 24 characters, starting with a letter, never starting with `forkbuild`, so none can pass
  as a family tag). Nexus indexes every tag; readers only ever look for ForkBuild's own.
- `announcements` holds at most 16 entries and `anchors` at most 16 contentHashes. Either may be empty.
- Title: the build's title when the post announces a Publication whose card is known, otherwise a fixed phrase for
  what it carries ("ForkBuild build", "ForkBuild place name", "ForkBuild comment", "ForkBuild anchor", "ForkBuild
  data"). Text a user wrote goes through the same sanitizing as Steem notices (`steemNoticeText()`), at most 100
  characters.
- Body: the build's card (picture linking to the app's view, title, author, description, "See it in 3D") when the
  post announces a Publication (the description whole and formatted, cut with "…" only past 2,000 characters
  of text, exactly as in a Steem notice: `steemNoticeDescription()`), then a list of what the post carries, then one paragraph saying that the ForkBuild
  app reads the post's `json_metadata` and checks every content hash and signature, that the Blurt account that
  posted it is not treated as the author, and a link to this section.

**Grouping.** The poster keeps the build post it made most recently. Until that post is 30 minutes old
(`BLURT_BUILD_POST_GROUPING_MS`), and while it is the same account and the same app session, anything else posted
joins it instead of starting a new top-level post:

- an announcement or a single anchor **edits** the build post: the same `comment` with the same permlink, its
  `announcements` or `anchors` extended, the family tag added, and the title and body redrawn;
- stored content is a **reply** to it (see "Content").

So one Distribute (Snapshot data, Snapshot announcement, Signed Claim, Publication announcement) makes one
top-level post, with edits and replies, and never waits out the 5-minute interval. An edit that would exceed 16
announcements, 16 anchors or 56 KiB of operations starts a new build post instead. When a new build post is needed
and the account's `last_root_post` (another device or app) is less than 5 minutes old, the poster waits until it
isn't, says so in the progress line, and posts. If the chain still refuses for that reason, it waits once more and
retries once. Edits re-send the whole post, so each costs its own fee.

All posts from one app go through one queue, one at a time, each at least 4.5 seconds after the account's previous
post (`last_post` on the chain, and this poster's own record), as on Steem. Every transaction is signed with the
posting key through Blurt Keychain (`blurt_keychain.requestBroadcast(account, operations, 'Posting', callback)`, the
same interface Steem Keychain offers; WhaleVault offers it too). ForkBuild never holds a Blurt key. The account is
a per-device setting, `blurt-announcing-configuration`, looked up each time something is posted.

### Announcing

An announcement is an entry `{ family, envelope }` in a build post's `announcements`, added by a new build post or
by an edit (see "Grouping"). The envelopes are each family's existing ones, unchanged (see "Decentralized
publications and discovery" and "Publication Commentary Distribution"). The publishers resolve to
`{ published: true, id: '@author/permlink', url: 'https://blurt.blog/@author/permlink', relayUrl:
'https://blurt.blog/created/forkbuild-<family>' }`. Status is "accepted": the block becomes irreversible about a
minute later.

The one-substrate rule holds: each action announces on exactly one of Nostr, Arweave, Steem or Blurt.

### Reading

For a family, a reader asks Nexus and cross-checks it against the chain's own indexes:

1. **Nexus.** Nexus (`blurt/nexus-go`) is Blurt's indexer, in the role Hivemind plays on Hive, served through the
   `bridge` API. `bridge.get_ranked_posts({ sort: 'created', tag: 'forkbuild-<family>', limit: 100, observer: '' })`,
   paging with `start_author` and `start_permlink` (the page starts after that post), lists every top-level post
   carrying the tag in its category or `json_metadata.tags`, newest first, paid out or not, as long as it isn't
   deleted, muted or grayed. The reader pages until a post is older than `2026-10`, the first month ForkBuild
   posted on Blurt, at most 20 pages. A node that doesn't serve `bridge` is skipped for the next one. Nexus returns
   `json_metadata` parsed and leaves a top-level post's parent empty, so the reader takes `depth: 0` and `category`
   as the parent.
2. **The tag, always.** `condenser_api.get_discussions_by_created([{ tag: 'forkbuild-<family>',
   limit: 100, truncate_body: 1 }])`, paging with `start_author` and `start_permlink`, at most 10 pages. The chain's
   tags plugin drops a post from its tag index when the post pays out, so this finds the last 7 days. It is read
   whether or not Nexus answered, as a cross-check: Nexus is one indexer, and a node's Nexus can lag, leave out what
   it counts as muted or grayed, or be filtered by its operator. A build post the tag lists and Nexus doesn't is
   reported in the read's `nexusMissed` (a post a few seconds old may only not be indexed yet).
3. **Authors' histories.** `condenser_api.get_discussions_by_author_before_date([author, startPermlink,
   '1970-01-01T00:00:00', 100])`, which lists an account's top-level posts newest first for as long as the chain
   exists, paging until a post is older than `2026-10` or 5 pages are read. When Nexus answered, only the authors of
   the posts it missed are read, since it may have missed their older, paid-out posts too: usually none, at most
   100, newest post first.
   When no node serves Nexus, every account the reader has seen a ForkBuild build post from is read (remembered on
   the device, the 100 most recent, `blurt-known-authors`; Nexus and tag results add to it).

A post counts when it is a top-level post (`parent_author` empty) in the `forkbuild` category whose
`json_metadata.forkbuild` has `version: 1` and an `announcements` list; each entry whose `family` is the requested
one and whose `envelope` is an object is a candidate. Anything else is skipped as noise, never an error. Posts are
deduplicated by author and permlink; the reader takes the version the node returns (edits only ever add
announcements). Candidates go through the family's verifier exactly as on Steem ("Reading", step 6), with origin
`dweb:blurt`.

The Nexus and tag listings are cached for 30 seconds and an author's history for 10 minutes. When every source fails, the read
is "unavailable": the snapshot search reports unavailable, place naming and commentary reject so the caller names
Blurt as unreachable, and publication discovery finds no leads. Nodes may also drop posts by accounts the node
operator lists as spam (the tags plugin's spam filter); an author's history is not filtered that way.

Reading needs no account. API nodes: Network Settings → Blurt (`blurt-reading-configuration`), tried in order;
defaults `https://rpc.blurt.blog`, then `https://rpc.beblurt.com`, then `https://rpc.drakernoise.com` (three
operators, all serving Nexus).

### Content

`BlurtContentStore` (storage `blurt`) stores a Snapshot's bytes or a Publication's Signed Claim in the same
manifest-and-parts format as Steem v2 ("Proposed: Steem Content Storage", "Format"), with these differences:

- The **manifest** is a reply to the poster's current build post (a new build post is made first when there is
  none to group with), with permlink `forkbuild-c-<base36 ms timestamp>-<8 random>`, and
  `json_metadata.forkbuild` = `{ version: 1, content: { contentHash, algorithm, mediaType, size, encoding,
  encodedLength, parts }, data? }`.
- A **part** is a reply to the manifest, `<manifest permlink>-p<index>`, with `forkbuild` = `{ version: 1, part: {
  index, count }, data }`.
- Payout stays on; there are no `comment_options`.
- The manifest's notice links to the app's view (`#/view/blurt/<author>/<permlink>`) for a Signed Claim, in one
  line naming the build's title when its card is known. Unlike a Steem notice it doesn't repeat the card: the
  manifest is always a reply to its build post, whose body shows it, and every byte costs a fee. The card is drawn
  as on Steem (picture uploaded the Steem way to `https://img-upload.blurt.blog`, where
  blurt.blog's own front end uploads, signed through Blurt Keychain's `requestSignBuffer`; when the browser can't
  reach it the same signed upload goes through the rendezvous worker's relay,
  `POST <worker>/blurt-image/<account>/<signature>`, and a picture neither can take is left out) and shown in the
  build post's body.
- Readers accept a manifest wherever it is (any post by its author with a well-formed `content`); integrity comes
  from `contentHash`, as everywhere. Parts must be the manifest author's replies to the manifest, at the listed
  permlinks, lengths and SHA-256s.
- Locator: `blurt://<author>/<manifest permlink>`.
- Limits, encoding, decoding, resuming (`blurt-content-upload:<author>:<contentHash>`) and progress are Steem's,
  with "Blurt" in the messages.

Before posting, the store estimates the fees of every transaction it will make and refuses with
`BlurtFeeError` ("Storing this build on Blurt costs about 1.234 BLURT in fees, and your account has 0.500 BLURT")
when the account's liquid balance is short. If the node can't say, the upload goes ahead; a chain refusal
("sufficient funds for transaction fee") is reported in those words.

### Fees

From `process_tx_fee()` in Blurt's `database.cpp`:

    fee = max(operation_flat_fee × operations, 0.001) + max(floor(size × bandwidth_kbytes_fee / 1024), 0.001)

in BLURT's smallest unit (0.001 BLURT), where `size` is the packed size of the signed transaction and the fees are
the witnesses' median (`condenser_api.get_chain_properties`). The fee is burned and paid by each account whose
authority the transaction needs. `core/BlurtFees.js` computes it from the operations packed by `core/BlurtBinary.js`
with one signature, which is exact for a single-signature transaction. A build post with a Signed Claim's card is
about 3 KiB, a full content part about 49 KiB.

### Anchoring

A `blurt` anchor's evidence is a transaction in an irreversible Blurt block that commits to the Publication's
`contentHash`. Two kinds of operation commit:

- a `comment` (a build post, an edit of one, or a content manifest) by the anchoring account whose
  `json_metadata.forkbuild` has `version: 1` and lists the contentHash in `anchors`, or has a `snapshot`
  announcement whose envelope's `contentHash` is it, or is a content manifest whose `content.contentHash` is it;
- a `custom_json` with `id: 'forkbuild-anchor'` and `json` `{ version: 1, contentHash }` or, for a batch,
  `{ version: 1, merkleRoot, count }`, exactly as on Steem ("Proposed: Steem Anchoring", "Batches").

**The announcement post is the anchor.** `BlurtAnchorPublisher#publish(contentHash)` first looks for a post this
device already made with the current account that commits to the contentHash (recorded locally after each accepted
post, `blurt-post-record:<account>:<contentHash>` = `{ author, permlink, trxId, blockNum }`), and, when it finds
one, anchors to that transaction without posting anything. A Distributed Snapshot's announcement and its stored
data both commit to its contentHash, so anchoring a Publication distributed on Blurt costs nothing. Otherwise it adds
the contentHash to `anchors` of the current build post (an edit) or posts a new build post titled "ForkBuild
anchor", and anchors to that transaction.

**Batches** (`publishBatch()`, at most 64) are one `custom_json` from the anchoring account, since a build post
can't commit to a Merkle root on behalf of others' builds. That is the only `custom_json` ForkBuild sends on Blurt.

The proof is `{ blockNum, trxId, chain: 'blurt', batch?: { path }, evidence?, post?: { author, permlink } }` and the
locator `blurt:<trxId>`. `post` names the build post for people; the verifier never relies on it. Finding the block
(Keychain's result, else scanning from just before the broadcast), verifying (every configured node up to three, or with the
defaults only the first two, `DEFAULT_BLURT_PROOF_NODES`, asked separately, must agree; not yet irreversible is "unavailable"), finality (`BlurtAnchorFinalityObserver`) and
the evidence view work as on Steem, with "Blurt witnesses (elected by stake, not proof of work)". A post can be
edited later, but the verifier reads the operation from its block, so an edit never changes what was anchored.

### Keeping evidence

As on Steem ("Keeping evidence"), the publisher keeps the block header, the anchor transaction and its Merkle path,
and `checkBlurtBlockEvidence()` checks them offline. `core/BlurtBinary.js` serializes Blurt's operations 0–36
(`blurt/protocol/operations.hpp`: Steem's list without the market, SBD and feed operations, so the numbers differ;
`comment_options` is 13 and `custom_json` 12, and `comment_options` has no `percent_steem_dollars`), the
`legacy_chain_properties` of `witness_update`, the header extension `fee_info` (variant 3, two `int64`s), and keys
with the `BLT` prefix. Block ids, transaction ids and the Merkle tree are computed as on Steem.

### Status

Tried for real before release 1.3.0: builds distributed from a browser through a real Blurt
Keychain, pictures uploaded to `img-upload.blurt.blog`, and the default API nodes checked with
`node scripts/check-network-defaults.mjs` from outside the development environment, which can reach no Blurt host.
Blurt stays Experimental, as Steem does.

## Vehicles, animals and inventory

### Deterministic Animal Identity (0.9.700)

Wildlife from `core/WildlifeField.js` is a pure function of `(seed, x, z)` and is never stored. Each animal's id is
derived from its lattice cell (`core/AnimalIdentity.js`):

    animal:<seed>:<cellX>,<cellZ>

Two replicas, or one replica returning to a tile, compute the same id for the same animal. Catching removes that id
from the local field (`AnimalRuntimeInstances` excludes it). Releasing creates a runtime animal with a fresh id.
Neither is sent to peers: caught and released animals, and placed vehicles, are local state persisted under
`avatar-inventory`, `vehicle-runtime-instances` and `animal-runtime-instances`. Only which vehicle an avatar is
riding is sent, on `forkbuild:avatar-vehicle` (see "Presence, profiles and interactions").

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
