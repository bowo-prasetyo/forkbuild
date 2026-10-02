# 12 — Archive & Leaderboards

<!-- languages -->
**English** · [Deutsch](de/12-ArchiveAndLeaderboards.md) · [Español](es/12-ArchiveAndLeaderboards.md) · [Français](fr/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](id/12-ArchiveAndLeaderboards.md) · [日本語](ja/12-ArchiveAndLeaderboards.md) · [한국어](ko/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Experimental.** Everything here may change or be removed in a later
> version, and what it produces may not carry over. On the Publications
> page, the **Wallet, Archive & Publisher Tools** panel is marked with an
> **Experimental** badge; the Leaderboard pages show an **Experimental**
> banner.

The Bitcoin, Base and IPFS tools in
[Evidence & Storage](11-EvidenceAndStorage.md) record what they observe in
a durable archive on this device. This guide covers that archive and what's
built on it: references between publications, achievements, publisher
labels, and the Leaderboard pages.

Most of these cards are on the Publications page under **Wallet, Archive &
Publisher Tools**, in its **Archive Tools** and **References &
Achievements** tabs. Each shows **Persisted locally** when what it holds
survives a reload.

A word used throughout: a **publication identity** is one Bitcoin or Base
Anchor Publication record (see
[Bitcoin Anchor Publications](11-EvidenceAndStorage.md#bitcoin-anchor-publications)).
It's a record on a chain, not a person.

## The Publication Observation Archive

One durable record, on this device, of the facts the IPFS, Bitcoin and Base
tools observe. It holds publication identities and observations only:
never a wallet connection, key or pinning credential.

### Observation Archive

The **Observation Archive** card shows how many **Publications** and
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

The **Publication Archive** card turns the archive into a JSON file:

- **Export Archive** shows the JSON and a **Download Archive Export** link.
- **Import Archive** takes a file or pasted JSON and previews how many
  publications and observations it holds against the current archive.
  Only **Replace Current Archive** applies it. Importing **replaces** the
  current archive (it doesn't merge) and can't be undone. An invalid file is
  rejected with nothing changed.

**Inspect External Archive** looks inside an export without importing it.
It shows the file's schema version, fact counts per domain (IPFS publish and
verification; Bitcoin broadcast, confirmation, content proof and
publication identity; Base inclusion and publication identity), local and
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

## Publication References

Record that one publication identity points at another.

**Publication References → Show References** opens a form: choose the
**Source publication (the one making the reference)** and the **Referenced
publication (the one being pointed at)** from your known Bitcoin and Base
publication identities (for example "Bitcoin — a1b2…c3d4 — content 9f8e…"),
then click **Record Reference**. A publication can't reference itself.
References are only ever made by you; nothing creates one automatically,
and forking elsewhere in the app doesn't either.

A reference is deliberately not called a fork: it records that the pointer
exists, not what it means (a fork, a citation, a reply).

Recorded references are listed oldest first, with both sides' chain, short
identity, content hash, and when it was recorded. Duplicates are kept as
separate references.

**Publication Reference Graph** groups the same references by publication:
totals for **Edges**, **Publications**, **Distinct sources** and **Distinct
referenced**, and for each publication its **Outgoing references** and
**Incoming references**, which expand to the individual references. The
counts aren't a ranking.

## Achievements

A publication identity earns a badge the moment it crosses a threshold;
there's nothing to claim.

**Achievements → Show Achievements** lists the badges earned so far:

| Badge | Icon | Earned when |
|---|---|---|
| First publication | 🏆 | Your first Bitcoin or Base anchor publication record. |
| Bitcoin publisher | ₿ | Your first Bitcoin one. |
| Base publisher | 🔵 | Your first Base one. |
| Multi-chain publisher | 🌐 | Records on more than one chain. |
| Ten publications | 🔟 | Your 10th, Bitcoin and Base together. |
| One hundred publications | 💯 | Your 100th. |

Click a badge to see its **Source Publication** (chain, content hash,
chain reference, creation time) and, when available, **View Publication
Lifecycle Above**, which jumps to that record's lifecycle.

Five more achievements come from references and have no badge yet: **First
reference created**, **First reference received**, **Referenced by 10
publications**, **Referenced by 100 publications**, and **First cross-chain
reference** (between a Bitcoin and a Base publication). They're listed by
name in **Achievement Profile**, where you choose a publication identity and
see its achievement count and full list, each with when it was earned.

Achievements belong to publication identities, not people: nothing here
links a publication to a person.

## Publisher Identity

**Publisher Associations** lets you label publications with a publisher
name, at your own word, for the publisher cards and leaderboard below.

A publisher identifier is a plain, self-declared label, not a verified
identity or a login. Matching is exact: `Alice`, `alice` and `ALICE` are
three publishers. Nothing is inferred from wallets, content or names.

**Show Publisher Associations**, then:

1. **Publisher identifier** — type a label, or pick one you've used before.
2. **Publication** — choose one of your Bitcoin or Base publication
   identities.
3. **Add Publication** — records the association.

**Recorded Associations** lists them, oldest first. **A Publisher's
Associated Publications** shows every publication for a chosen publisher,
with content hash and when it was associated.

Three cards on the [Leaderboard](#leaderboard-hub) page build on these
associations, each with its own **Choose A Publisher** dropdown:

| Card | Shows |
|---|---|
| **Publisher Achievement Profile** | Every achievement earned by any publication the publisher claims, and which publication earned it. |
| **Publisher Achievement Badges** | The same, limited to achievements with a badge, each linking back to its lifecycle on the Publications page. |
| **Publisher Achievement Statistics** | Counts of associated publications, achievements, achievement kinds, badges and badge kinds, publications per chain, and achievements per kind. |

With no associations yet, each card says so and points to Publisher
Associations. They report what a publisher *claims*, not who controls a
publication, and none of them ranks anyone.

## Leaderboard Hub

The **Leaderboard** page (`/leaderboard`) links the pages below, plus the
three publisher cards above. It isn't in the top bar: open it from the
**Leaderboard** link under the **Publication Archive** card on the
Publications page.

### Publisher Performance Leaderboard

`/publisher-leaderboard` ranks publishers by what this device has recorded:
**Rank**, **Publisher**, **Achievements**, **Achievement Kinds** and
**Publications**, computed fresh each time the page opens and never saved.
A publisher appears once you've associated a publication with it. Names are
your own labels, not verified identities.

### Publisher Snapshot Claim

`/publisher-snapshot-claim` signs a claim about your current leaderboard
snapshot, so a peer can compare against it. You need to be signed in.

1. **Generate & Sign Claim** — computes your snapshot and signs a claim
   about it. Shows the signer and the evidence, policy and snapshot
   fingerprints. **Start Over** discards it.
2. **Export Claim** — shows the claim as JSON with a **Download Claim**
   link, to paste into a peer's
   [Reconciliation Workspace](#reconciliation-workspace) or send as a file.

### Reconciliation Workspace

`/reconciliation-workspace`: paste a peer's exported claim into **Peer
Evidence JSON** and click **Reconcile**. It compares the claim with your
archive and, when that finds a reconciliation candidate, records a decision
and a revalidation observation in your archive and offers **View in
Leaderboard**. If there's nothing to reconcile, it says why. **Clear
Result** dismisses the result.

### Reconciliation Candidate Leaderboard

`/reconciliation-leaderboard` is read-only. It shows, for each
reconciliation candidate, the evidence your archive holds, optionally
compared with a peer's archive.

A **candidate** is a place where an external-evidence claim and a Local
Snapshot record for the same content were compared:

| Candidate label | Meaning |
|---|---|
| **Claim *X* ↔ Snapshot #*N*** | A claim and a snapshot that were compared and diverged. |
| **Claim *X* (no corresponding Snapshot)** | A claim with no snapshot to compare. |
| **Snapshot #*N* (no corresponding Claim)** | A snapshot with no claim to compare. |

Candidates come from the Reconciliation Workspace. Until you've reconciled
a peer claim there, the page shows "No reconciliation candidates to
display".

**Columns.** **Decision Evidence** (a recorded choice of which side was
trusted) and **Observation Evidence** (a later recheck of that decision)
each have three counts: **Shared** (both archives have it), **Source-only**
(only yours) and **Target-only** (only the peer's). Rows appear in the
order they were found, not by how much evidence they have; this isn't a
ranking.

**Comparing with a peer.** Paste a peer's archive export into **Peer
Archive** and click **Use as Peer Archive**. An invalid paste is rejected.
Without a peer archive, everything counts as Source-only. A line above the
table says which case you're in:

| Banner | Meaning |
|---|---|
| *No peer archive supplied — every count below reflects this replica alone.* | No peer archive yet. |
| *A peer archive was supplied, but it has no evidence recorded — every count below still reflects this replica alone.* | A real archive, but empty. |
| *Comparing against a supplied peer archive.* | A real comparison. |

**Inspect Evidence** (then **Hide Evidence**) on a row lists the decision and
observation records behind its counts, split into Shared, Source-only and
Target-only. Each observation shows the fingerprint of the plan it was
checked against (such as `plan abcdef012345…`) and whether the candidate was
**present** and **matches plan**, as recorded.
Similar-looking records stay separate.

**Evidence Filter.** Two dropdowns narrow what's shown: **Evidence type**
(**All**, **Decisions**, **Observations**) and **Replica relation** (**All**,
**Shared**, **Source-only**, **Target-only**). A row stays if it has
evidence of that type in that relation. With **Replica relation** on **All**,
nothing is filtered; with **Evidence type** on **All**, a row matches if
either type has the chosen relation. The filter also narrows each row's
Inspect Evidence list. It only hides rows and records; the counts on a row
never change.

**Evidence Export.** **Export Evidence** produces a JSON document of exactly
what the filter shows, recording the comparison state and filter used, with
a **Download Evidence Export** link
(`reconciliation-candidate-leaderboard-evidence-export.json`). Nothing is
uploaded. **Compare Exported Evidence** opens
[Evidence Export Comparison](#evidence-export-comparison).

**Import Evidence Export.** Paste an export (yours or a peer's) and click
**Import Evidence** to see its comparison state and candidate, decision and
observation counts. An invalid paste is rejected and the previous summary
kept. **Clear Imported Evidence** dismisses it. This doesn't affect the
table above.

The page reads your archive once when it opens; reopen it to see new
records. The peer archive, filter, open rows and imported summary aren't
saved.

## Evidence Export Comparison

`/evidence-export-comparison` compares two evidence exports with each other
— for example last week's and today's, or yours and a peer's. It doesn't
read your archive or affect the leaderboard.

Paste the two documents into **Source Evidence Export** and **Target
Evidence Export** and click **Compare Evidence**. An invalid side is
rejected on its own; the other side is kept. **Clear Comparison** empties
the page.

- **Comparison State and Filter** show each document's recorded comparison
  state and filter, and whether they're the same.
- Three tables — **candidate presence**, **decision evidence** and
  **observation evidence** — each count Source-only, Shared and
  Target-only, and are never combined.
- **Inspect records** (then **Hide records**) lists the records behind a
  table's counts. On a decision or observation record, **Inspect
  identity** shows the fields that identify it:

| Record | Identity fields |
|---|---|
| Decision | `decided`, `candidate`, `decision`, `decidedAt` |
| Observation | `candidate`, `decision`, `planIdentity`, `candidatePresent`, `candidateType`, `candidateMatchesPlan`, `observedAt` |

**Explicit Record Pairing.** To compare two particular records, pick a
source and a target record (from any partition) for decisions or
observations and click **Add Pair**; **Remove** takes a pair out. Nothing is
paired automatically, and the same pair can be added twice. Under **Paired
Record Differences**, each **Decision Pair *N*** or **Observation Pair *N***
shows how many identity fields differ (or **No differences**); **Inspect
differences** names them, or says **Identical on every named field**. It
never says which side is right.

Nothing on this page is saved or sent anywhere; a reload clears it.
