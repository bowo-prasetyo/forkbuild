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
| `snapshot` | a Snapshot candidate: `{ contentHash, locator, storage, publicationId?, claimedPosition? }` | `storage contentHash locator`, the same identity SnapshotCandidateDiscoveryQueryService deduplicates by |
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
- **Deferred to Phase 5:** a cap per announcing identity (for signed
  kinds), and keeping records from followed identities longer.

## Storage

The index uses the same storage as everything else
(storage/LocalStorageProvider.js). In the browser that is IndexedDB,
kept in memory and written in the background, so reads stay synchronous.

- **One entry per kind and tag:** `announcement-index:<kind>:<tag>`,
  holding that tag's records.
- **One entry per sync cursor:**
  `announcement-sync:<substrate>:<kind>:<tag>` (Phase 3).

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

**Planned.**

An app-level scheduler runs every sync on a timer: once shortly after the
app opens, then every few minutes, and only while the tab is visible. It
runs whether or not World View is open.

- **What it syncs.** Every tag the index has seen: the Snapshot tag, the
  Place Naming region tags searched so far, the Publication tags searched
  so far and the Commentary tag.
- **Commentary.** Every verified envelope found is imported into the
  Commentary store, whichever Publication it is about. When a Commentary
  section opens later, its comments are already there.
- **World View.** It still asks for discovery when the player moves
  100 units. That request now also reads the index, so what the
  background sync found in the meantime appears without extra network
  calls.

## Phase 5: peers share their index

**Planned.**

Peer-to-peer then becomes the fastest way a new device fills its index:
one connection to a friend gives it everything that friend has seen.

- **A new peer protocol,** `forkbuild:announcement-index`. After
  connecting, each side sends a SUMMARY: the kinds and tags it holds, and
  a count and newest time for each. The other side sends a REQUEST for
  the tags where it is behind. RESPONSE messages carry records,
  up to 64 KiB each, sent as several messages when needed.
- **Every received record is checked** exactly as a record from a
  substrate is, and recorded with the origin `peer:<identityId>`. A peer
  can never remove or overwrite a record.
- **Limits.**
  - At most one exchange in progress per peer.
  - A per-peer cap on records accepted per hour.
  - For signed kinds, a cap per announcing identity.

## Phase 6: narrower tags

**Planned.**

Narrower tags make each backfill smaller and each query more complete.

- **Commentary.** Each Commentary announcement also carries the tag
  `forkbuild-commentary:<publicationId>`. Nostr events and Arweave
  transactions can both carry more than one tag, so this costs nothing
  extra. The Commentary section reads its Publication's own tag.
- **Snapshots.** Each Snapshot announcement that carries a
  `claimedPosition` also gets a tag for its map cell,
  `forkbuild-snapshot:cell:<cx>:<cz>`, with 1,000-unit cells. World View
  reads the cells around the player.
- **Old announcements.** Anything announced before this phase carries
  only the global tag. Readers keep reading the global tags, so nothing
  already announced is lost.

## Deliberately not in this design

- **Content bytes.** Content is still fetched on demand, and stored where
  it is today.
- **Ranking or trust decisions.** No announcement is preferred over
  another beyond the size limits.
- **Deleting a record because its locator no longer answers.** A gateway
  that is down today may answer tomorrow.
