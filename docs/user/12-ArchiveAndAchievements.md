# 12 — Archive & Achievements

<!-- languages -->
**English** · [Deutsch](de/12-ArchiveAndAchievements.md) · [Español](es/12-ArchiveAndAchievements.md) · [Français](fr/12-ArchiveAndAchievements.md) · [Bahasa Indonesia](id/12-ArchiveAndAchievements.md) · [日本語](ja/12-ArchiveAndAchievements.md) · [한국어](ko/12-ArchiveAndAchievements.md) · [Português (Brasil)](pt-BR/12-ArchiveAndAchievements.md)
<!-- /languages -->

> **Advanced.** You don't need this chapter to build, share, remix or walk
> around with friends: the [Play chapters](README.md#play-read-in-order) cover that. Read on
> when you want to know what runs underneath.

> **Experimental.** Everything here may change or be removed in a later
> version, and what it produces may not carry over. On the Signed Records
> page, the **Wallet & Archive Tools** panel is marked with an
> **Experimental** badge.

The Bitcoin, Base and IPFS tools in
[Evidence & Storage](11-EvidenceAndStorage.md) record what they observe in
a durable archive on this device. This guide covers that archive and what's
built on it: references between records, and achievements.

Most of these cards are on the Signed Records page under **Wallet & Archive
Tools**, in its **Archive Tools** and **References &
Achievements** tabs. Each shows **Persisted locally** when what it holds
survives a reload.

A word used throughout: a **record identity** is one Bitcoin or Base
Anchor Record (see
[Bitcoin Anchor Records](11-EvidenceAndStorage.md#bitcoin-anchor-records)).
It's a record on a chain, not a person.

## The Record Observation Archive

One durable record, on this device, of the facts the IPFS, Bitcoin and Base
tools observe. It holds record identities and observations only:
never a wallet connection, key or pinning credential.

### Observation Archive

The **Observation Archive** card shows how many **Records** and
**Observations** it holds.

- **Show Archive** opens the **Archived Observation Timeline**: every IPFS
  publish and verification, every Bitcoin broadcast, confirmation and
  content proof, and every Base inclusion observation, in time order, each
  naming its domain, state and (where relevant) locator, txid or block
  height. Opening it contacts no network.
- **Clear Archive** is the only way anything is removed from the archive;
  everything else only adds to it. It's disabled when the archive is empty.

### Historical Bitcoin Anchor Evidence

The same Bitcoin facts, grouped by anchor ID, on a card in the **Blockchain
Anchoring** tab. **Show Historical Anchors**,
then an anchor ID, shows its **Broadcast History**, **Confirmation
History**, **Content-Proof History**, **Chain Placement Comparisons** and
**Observation Consistency**, with a **Combined Evidence** summary of the
five counts. The counts say how much was recorded, not how trustworthy it
is.

### Exporting, importing and inspecting the archive

The **Record Archive** card turns the archive into a JSON file:

- **Export Archive** shows the JSON and a **Download Archive Export** link.
- **Import Archive** takes a file or pasted JSON and previews how many
  records and observations it holds against the current archive.
  Only **Replace Current Archive** applies it. Importing **replaces** the
  current archive (it doesn't merge) and can't be undone. An invalid file is
  rejected with nothing changed.

**Inspect External Archive** looks inside an export without importing it.
It shows the file's schema version, fact counts per domain (IPFS publish and
verification; Bitcoin broadcast, confirmation, content proof and
record identity; Base inclusion and record identity), local and
imported fact counts, import events, its fingerprint, and the Bitcoin anchor
IDs, IPFS record indexes and Base transaction hashes it holds. From there:

- **Compare With Current Archive** lists, per domain, what's **Same**,
  **Changed**, **Only in current**, **Only in external**, or has **Different
  provenance**.
- **Review Replacement** (after a comparison) previews what replacing would
  change, with both archives' counts and fingerprints. Its **Replace Current
  Archive** button is the same import as above. Replacing marks every fact
  as newly imported, so the resulting fingerprint differs from the file's.

### Archive Provenance

Shows where facts came from: **Local facts** (observed on this device) and
**Imported facts** (from a **Replace Current Archive**). If you've ever
imported, **Archive Imports** lists each import's time, fact count and
schema version. Neither kind is treated as more trustworthy.

### Archive Fingerprint

A SHA-256 digest of every fact and provenance tag in the archive. **Copy
Fingerprint** copies it. To compare with a fingerprint from elsewhere (a
peer, say), paste it under **Compare With Another Fingerprint** and click
**Compare**:

| Result | Meaning |
|---|---|
| **MATCH** | The two archives hold identical contents. |
| **DIFFERENT** | They don't. |
| **INVALID_FINGERPRINT** | What you pasted isn't a 64-character SHA-256 fingerprint. |

A match only means the contents are identical, not that they're correct,
and nothing here says which archive is newer.

## Record References

Record that one record identity points at another.

**Record References → Show References** opens a form: choose the
**Source record (the one making the reference)** and the **Referenced
record (the one being pointed at)** from your known Bitcoin and Base
record identities (for example "Bitcoin — a1b2…c3d4 — content 9f8e…"),
then click **Record Reference**. A record can't reference itself.
References are only ever made by you; nothing creates one automatically,
and remixing elsewhere in the app doesn't either.

A reference is deliberately not called a remix: it records that the pointer
exists, not what it means (a remix, a citation, a reply).

Recorded references are listed oldest first, with both sides' chain, short
identity, content hash, and when it was recorded. Duplicates are kept as
separate references.

**Record Reference Graph** groups the same references by record:
totals for **Edges**, **Records**, **Distinct sources** and **Distinct
referenced**, and for each record its **Outgoing references** and
**Incoming references**, which expand to the individual references. The
counts aren't a ranking.

## Achievements

A record identity earns a badge the moment it crosses a threshold;
there's nothing to claim.

**Achievements → Show Achievements** lists the badges earned so far:

| Badge | Icon | Earned when |
|---|---|---|
| First publication | 🏆 | Your first Bitcoin or Base anchor record. |
| Bitcoin publisher | ₿ | Your first Bitcoin one. |
| Base publisher | 🔵 | Your first Base one. |
| Multi-chain publisher | 🌐 | Records on more than one chain. |
| Ten publications | 🔟 | Your 10th, Bitcoin and Base together. |
| One hundred publications | 💯 | Your 100th. |

Click a badge to see its **Source Record** (chain, content hash,
chain reference, creation time) and, when available, **View Record
Lifecycle Above**, which jumps to that record's lifecycle.

Five more achievements come from references and have no badge yet: **First
reference created**, **First reference received**, **Referenced by 10
publications**, **Referenced by 100 publications**, and **First cross-chain
reference** (between a Bitcoin and a Base record). They're listed by
name in **Achievement Profile**, where you choose a record identity and
see its achievement count and full list, each with when it was earned.

Achievements belong to record identities, not people: nothing here
links a record to a person.

## Retired: leaderboards, reconciliation and publisher labels

Earlier versions had Leaderboard pages: a publisher leaderboard, signed
publisher snapshot claims, a reconciliation workspace and leaderboard, and
evidence export comparison. ForkBuild doesn't rank people or keep scores
([Pillars](../Pillars.md#what-we-are-not-making)), so they were removed. An
old link to one of those pages opens Home. An archive saved while they
existed still loads and imports, with all its other records; the leaderboard
claims and reconciliation decisions it held are dropped.

Publisher Associations, which labelled your records with a publisher
name for those pages, were removed too. The labels an archive held are
dropped the same way.
