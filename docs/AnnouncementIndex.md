# Announcement Index

A design for discovering every other player's content without a central
server. It covers Snapshots, Place Naming claims, Publication leads and
Commentary. Each device keeps its own record of every announcement it has
seen, from peers and from the decentralized substrates (Nostr, Arweave,
Steem). The app shows what that record holds as soon as it opens, keeps
the record up to date in the background, and fetches the real bytes only
when they are needed.

This document describes the design and the order it is built in. Each
phase's section says whether it is built yet. When a phase ships, its
section here is updated to match the code, and docs/Roadmap.md gets an
entry for it.

## Why

Before this design, discovery worked like this:

- **Capped queries.** A Nostr or Arweave query returned at most 20
  announcements per tag. Snapshots and Commentary each share one global
  tag (`forkbuild-snapshot`, `forkbuild-commentary`), so only the newest
  20 in the whole network were ever seen. Steem read up to 36 months of
  threads, so it was the exception.
- **Results in memory only.** Snapshot candidates, Place Naming claims
  and Publication leads were kept in memory. Snapshots stayed only if
  automatic placement registered them. Every visit started from nothing,
  and an announcement pushed out of the newest 20 before this device
  looked was never seen at all.
- **Searches triggered by movement.** Snapshots and Place Naming were
  searched only when the player had moved 100 units. A player standing
  still never saw anything new. Commentary was checked only when its
  section opened, and Publications only on **Discover**.

The goal is that a player sees every game other players have announced,
old or new, and that the app opens showing it at once.

## What stays the same

- **Cataloging is not resolving.** This is the rule
  LocalPublicationSnapshotPlacementCatalog already keeps. The index holds
  announcements, which are pointers or small signed claims. It never
  holds content bytes. It never promises that a locator still serves its
  bytes, and it never decides which of two claims is right. Resolving,
  verifying signatures and placing content stay where they already are,
  and run on index results exactly as on network results.
- **Anyone can post under a public tag.** So what the index returns is
  still untrusted input. Every reader parses and verifies it as before.
- **The saved Announcement / Discovery Provider picks where to announce
  only.** Reading keeps querying every substrate.

## Records

Each record is one announcement, identified by its kind and its key:

    { kind, tag, key, payload, origins, firstSeenAt, lastSeenAt }

| Kind | Payload | Key |
|---|---|---|
| `snapshot` | a Snapshot candidate: `{ contentHash, locator, storage, publicationId?, claimedPosition?, placementRecord? }` | `storage contentHash locator`, plus the `placementRecord`'s own `contentHash` when there is one (so a later revision is kept beside an earlier one), the same identity SnapshotCandidateDiscoveryQueryService deduplicates by |
| `place-naming` | a parsed Place Naming discovery envelope (the whole signed claim) | `claim.id` plus the claim's signature value, so a forged copy under a real claim id can never replace the real one |
| `publication` | a Publication lead: `{ uri, storage }` | `origin uri`, because the origin decides which material source resolves the lead |

- `tag` is the discovery tag the announcement was found under.
- `origins` lists every source that reported the record: `nostr`,
  `arweave`, `steem`, a Publication discovery service's own origin, or
  `peer:<identityId>`. Hearing the same announcement from several sources
  confirms it rather than duplicating it.
- `firstSeenAt` and `lastSeenAt` are this device's clock, not the
  announcer's. They decide what goes first when a limit is reached.

**Commentary has no kind of its own.** Every signed Commentary envelope
the app accepts is already verified and saved in
storage/PublicationCommentaryStore.js. That store is the index for
Commentary; a second copy would break its own "no second Commentary
database" rule. For Commentary, this design adds only the sync cursors
(Phase 3) and the background import (Phase 4).

### Checks before a record is stored

- **The payload must parse.**
  - `snapshot`: the candidate's well-formedness check.
  - `place-naming`: `parsePlaceNamingDiscoveryEnvelope()`, and the
    envelope's world and region must give back the tag it was stored
    under. A relay that ignores the tag filter cannot fill another
    region's list.
  - `publication`: a non-empty `uri`.
- **Size caps.** A payload over 8 KiB of JSON is refused. Each tag keeps
  at most 2,000 records of one kind. When a new record would go past
  that, the record least recently seen is removed first. It can always
  be discovered again.
- **Per author.** Phase 5 adds a cap per Place Naming author for records
  from peers.
- **Followed identities.** When a tag is full, records signed by an
  identity the signed-in identity follows are kept ahead of the rest:
  Snapshot records carrying the publisher's signed placement, and Place
  Naming claims. The signature is checked first, so only the followed
  identity can have records kept in its name. A Publication lead names no
  author, so it gets no preference.

## Storage

The index uses the same storage as everything else
(storage/LocalStorageProvider.js). In the browser that is IndexedDB,
kept in memory and written in the background, so reads stay synchronous.

- **One entry per kind and tag:** `announcement-index:<kind>:<tag>`,
  holding that tag's records.
- **One entry per sync cursor:**
  `announcement-sync:<substrate>:<endpoint>:<target>` (Phase 3).

The size caps above keep the in-memory copy bounded. At about 500 bytes a
record, a full tag is about 1 MB. The index is small next to the content
the app already keeps.

## Phase 1: record every discovery result

**Built.**

`application/announcementIndex/AnnouncementIndex.js` is the store.
`application/announcementIndex/AnnouncementKinds.js` defines each kind's
parsing and key. `application/announcementIndex/IndexedDiscoverySources.js`
connects them to the existing discovery code.

- **Record while searching.** Every network source (Nostr, Arweave,
  Steem) of Snapshot candidate discovery, Place Naming discovery and
  Publication discovery is wrapped. A successful search records what it
  returned, and then returns exactly what it would have. A failure is
  passed through unchanged, and a failure to record never breaks a
  search.
- **Read back with the network.**
  - Snapshots and Place Naming: one more source joins each discovery
    service, and answers from the index. Its results merge and
    deduplicate with the network's through the aggregator that already
    exists.
  - Publications: each wrapped service also returns what the index holds
    for that same origin and tag. A lead keeps the origin that decides
    how its material is fetched.
- **Peers.** Snapshot placements received from peers are already kept in
  LocalPublicationSnapshotPlacementCatalog, which is already a source of
  Snapshot discovery. Nothing changes there.

## Phase 2: show the index first

**Built.**

When World View opens, it does not wait for the network. On its first
refresh with a position, it reads the index alone and:

- hands every indexed Snapshot candidate to automatic placement
  (`discoverIndexedSnapshotCandidatesCommand`). Placement already does
  nothing for a candidate it has handled;
- shows the Place Naming claims the index holds for this World's regions
  near the player (`indexedPlaceNamingDiscoveryQueryService`, then
  `PlaceNamingDiscoveryMonitor#seed()`). A seed only fills an empty
  result, so it never overwrites a network answer that arrived first.

The normal network discovery runs on that same refresh, as before. Its
answer, which includes the index, replaces the seeded claims when it
arrives.

## Phase 3: sync cursors

**Built.**

Recording what a capped query returns is not enough: an announcement
pushed out of the newest page before this device looked is never
recorded. Each substrate endpoint therefore keeps a cursor for each sync
target, and pages until it has caught up. Cursors are stored under
`announcement-sync:<substrate>:<endpoint>:<target>`
(`AnnouncementSyncCursorStore`).

- **Nostr** (`NostrTagSync.js`), per relay. The cursor keeps `newest`
  (newest `created_at` read with nothing missing below it), `oldest`, a
  `gap` while newer events are still being paged down, and
  `backfillDone`.
  - *Head:* `since: newest`, paging down with `until` until a page
    reaches `newest`.
  - *Backfill:* `until: oldest`, paging down until a page comes back
    empty.
  - *End of results:* a page counts as the end only when it is empty,
    never when it is merely short, because relays cap page sizes below
    what is asked for.
  - *Page boundaries:* a page boundary is inclusive, so events sharing its
    second are read again, not skipped. Only more than a whole page of
    events in one second can lose some.
- **Arweave** (`ArweaveTagSync.js`), per GraphQL endpoint. Pages are
  sorted newest first (`sort: HEIGHT_DESC`) and continued with each edge's
  `cursor` as `after`.
  - *Cursor:* it keeps the newest transaction ids read, a `gap` while a
    head is unfinished, the page cursor where backfill resumes, and
    `backfillDone`.
  - *Head:* reads down until an id already read appears.
  - *Backfill:* continues until GraphQL reports no next page.
  - *Bodies:* each new transaction's body is fetched with the 48 KiB cap.
- **Steem.** The thread reader already reads every month back to its
  configured start, so a sync reads it whole and records the results.
- **Per-run budget.** Each run reads at most five pages of 100 per
  endpoint, so a large backlog is read over several runs.

**Sync targets** (`AnnouncementSyncTargets.js`) say what to read and
where results go:

| Target | Tag | Results go to |
|---|---|---|
| Snapshot | `forkbuild-snapshot` | the index |
| Place Naming | one per region tag | the index, which checks each claim belongs to that region |
| Commentary | `forkbuild-commentary` | `importCommentaryEnvelope()`, which verifies each signature and saves it in the Commentary store |

`AnnouncementSync` runs one target on every relay, the Arweave endpoint
and Steem at once, and reports each endpoint's outcome. One endpoint
failing never stops the others.

**Publication leads are not synced.** Their discovery tags are typed by
the player, one per search, and a lead's origin must name the relay set
it came from. Phase 1 already keeps every lead those searches find.

## Phase 4: background sync

**Built.**

`BackgroundAnnouncementSync` runs the Phase 3 sync on a timer.
`ui/main/composeAnnouncementSync.js` wires it to the same relays, Arweave
gateway and Steem reader discovery already uses.

- **When it runs.**
  - It starts when the app opens, whichever page is shown, so the index
    is already fuller by the time World View opens. It reads only
    announcements, never content bytes, and publishes nothing;
    docs/Privacy.md lists it among the servers the app contacts.
  - First, 10 seconds after the app opens.
  - Then every 5 minutes, or every 30 seconds while any endpoint is still
    behind (a head not caught up, or a backfill not finished).
  - Nothing runs while the tab is hidden.
  - A failed run never stops the schedule.
- **What it syncs.**
  - *Core targets, every run:* the Snapshot tag and the Commentary tag.
  - *Rotating targets:* the Place Naming region tags this device has
    searched, ten per run, in turn. `AnnouncementIndex#watch()` notes a
    tag each time discovery searches it, whether or not anything was
    found. The 100 most recently searched tags are kept, and each is
    written at most once a minute.
  - Targets run one after another, so a run never floods the network.
- **Commentary.** Every verified envelope found is imported into the
  Commentary store, whichever Publication it is about, through the same
  notification bridge as other remote Commentary. A new comment on one of
  this identity's own Publications therefore raises a notification even
  when no Commentary section is open.
- **World View.** It subscribes to the scheduler. After each run it
  hands the indexed Snapshots to automatic placement again, and replaces
  the nearby Place Naming claims with what the index now holds
  (`seed(…, { replace: true })`). It still searches the network itself
  when the player moves 100 units.

## Phase 5: peers share their index

**Built.**

Peer-to-peer is now the fastest way a new device fills its index: one
connection to a friend gives it everything that friend has seen.

- **Protocol.** `forkbuild:announcement-index`
  (`AnnouncementIndexPeerProtocol.js`, `AnnouncementIndexPeerExchange.js`):
  1. When a peer authenticates, each side sends a SUMMARY: for each tag it
     holds, the kind, the tag, the record count and a digest of the
     record keys. It lists at most 300 tags, largest first, within one
     message.
  2. For each tag whose digest differs, the other side sends a REQUEST.
     There are at most 50 REQUESTs per summary.
  3. The answer is one or more RESPONSE messages, each under 48 KiB of
     payloads. Both sides end up holding the union.
- **Kinds shared.** Only Snapshot candidates and Place Naming claims.
  - A Publication lead's origin names the relay set it came from, which a
    peer cannot vouch for.
  - Commentary already has its own peer protocol.
- **Checks.** Every received record goes through the same checks as a
  record from a substrate, and is recorded with the origin
  `peer:<identityId>`. A peer can add records, never remove or change one.
- **Limits.**
  - A RESPONSE is accepted only for a tag this device asked that peer for
    in the last five minutes.
  - Each peer may add at most 20,000 records an hour.
  - A Place Naming author may hold at most 100 claims per region tag,
    counting what is already stored.
- **World View.** It hears about new peer records, grouped over one
  second, through the same signal as a finished sync, and shows them.
- **Privacy.** A connected peer learns which tags this device holds. For
  Place Naming, those tags name the World regions this device has
  searched.

## Phase 6: narrower tags

**Built.**

Narrower tags make each backfill smaller and each query more complete.
They also keep nearby Snapshots in the index when the global Snapshot tag
reaches its 2,000-record cap. The tags come from `core/NarrowDiscoveryTags.js`.

- **Commentary.** Each Commentary announcement also carries the tag
  `forkbuild-commentary:<publicationId>`.
  - Nostr events and Arweave transactions can both carry more than one
    tag, so this costs nothing extra.
  - On Arweave, `uploadTaggedTransaction()` takes optional extra tags.
  - `discover(publicationId)` on the Nostr and Arweave distributions
    reads that tag beside the shared one, and the Commentary refresh
    passes its Publication.
- **Snapshots.** Each Snapshot announcement that carries a
  `claimedPosition` also gets the tag of its map cell,
  `forkbuild-snapshot:cell:<cx>:<cz>`, with 1,000-unit cells. Readers use
  it in three places:
  - World View's discovery reads the player's cell beside the global tag,
    so the cell becomes a watched tag.
  - The background sync reads watched cells in turn.
  - On startup, World View shows what the index holds for the 3×3 cells
    around the player.
  - The index stores a Snapshot under a cell tag only when its claimed
    position lies in that cell.
- **Publications.** Each Publication announcement (not an avatar's) also
  carries `forkbuild-publication:<publicationId>`, on Nostr and Arweave.
  World View reads it when verifying a claimed build, so one Publication's
  signed record is found however far back it was announced. Reading goes
  straight to the network: these lookups are rare and user-initiated, so
  nothing is watched or stored in the index for them.
- **Steem.** Steem posts do carry tags (`json_metadata.tags`), but
  ForkBuild announces as replies to monthly discovery threads, and Steem's
  tag feeds list only top-level posts, so a tag on a reply cannot be
  searched. Readers instead fetch each thread's replies whole
  (`get_content_replies` has no page cap) and filter on the device, so a
  narrow tag would not make a Steem read more complete. The cell tags
  would not be valid Steem tags anyway: those allow only lowercase
  letters, digits and dashes. The Steem Snapshot reader answers only for
  the global tag. Steem's limit is the 2,000 replies read per thread and
  month; a family outgrowing that needs smaller threads, not tags.
- **Old announcements.** Anything announced before this phase carries
  only the global tag. Readers keep reading the global tags, so nothing
  already announced is lost.

## Deliberately not in this design

- **Content bytes.** Content is still fetched on demand, and stored where
  it is today. A Snapshot already stored on this device is read from there
  rather than fetched again, and World View fetches only the Snapshots near
  the player (docs/roadmap/unnumbered-2026-09.md, "Snapshot bytes: read
  locally first, fetched only nearby").
- **Ranking or trust decisions.** No announcement is preferred over
  another beyond the size limits.
- **Deleting a record because its locator no longer answers.** A gateway
  that is down today may answer tomorrow.
