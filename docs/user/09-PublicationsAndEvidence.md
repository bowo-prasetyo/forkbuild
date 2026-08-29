# 09 — Publications & External Evidence

This guide covers the **Publications** page — a different, more technical
layer than the Repository you already know from
[Publishing & Forking](04-PublishingAndForking.md). Where the Repository is
about *Documents and Worlds*, Publications is about **signed claims**: "I
authored this structure" or "I'm calling this place X" — and, once you have
one, several independent kinds of optional depth you can attach to it:
**external evidence** that the claim was recorded somewhere independent of
ForkBuild, like a Bitcoin transaction that timestamps it; **snapshot
placements** that name where the claim's own content can currently be
retrieved from, like an IPFS node; an [**IPFS Publishing**](#ipfs-publishing)
section that explicitly publishes a claim's content to a remote pinning
provider and independently verifies it's still retrievable; a **Local
Snapshot** section that reports what your own device already holds and lets
you actually pull those bytes in, from a placement, from a peer, or from a
file someone hands you; and a **Decentralization** overview that puts your
evidence and placements side by side; and, separately, two full,
independent pipelines that each connect a real browser wallet and walk a
real transaction all the way from observed funding to a broadcast,
on-chain-observed anchor — a
[Bitcoin Anchor Pipeline](#the-bitcoin-anchor-pipeline) and, one chain
over, a [Base Anchor Pipeline](#the-base-anchor-pipeline) — plus the
durable, cross-chain [Publication Observation Archive](#the-publication-observation-archive)
both pipelines (and IPFS Publishing) quietly write their own facts into;
and, built on top of the durable publication identities those two
pipelines mint, an explicit [**Publication References**](#publication-references)
relationship between two publications (and a graph view over all of
them), an [**Achievements**](#achievements) system that quietly badges a
publication identity's own milestones, and a [**Publisher
Identity**](#publisher-identity) layer that lets you explicitly associate
a self-declared publisher label with your publications and see that
publisher's own achievements and stats. None of these are required by
any other, and none are required to use the rest of ForkBuild.

None of this is required to use ForkBuild. Skip this guide entirely if you
just want to build, publish Documents, and explore — everything in
[The Editor](02-TheEditor.md), [World View](03-WorldView.md), and
[Publishing & Forking](04-PublishingAndForking.md) works exactly the same
without ever visiting this page.

## Two different meanings of "publish"

It's easy to confuse these, so here's the short version:

| | **Publish** (Repository) | **Publications page** |
|---|---|---|
| What it shares | A Document/World snapshot | A signed *claim* — authorship of a structure, or a place name |
| Where you see it | Repository, Author view, World View | The **Publications** page (top bar) |
| Chapter | [Publishing & Forking](04-PublishingAndForking.md) | This one |

A Document you publish through the ordinary **Publish** button never shows up
on the Publications page, and nothing on the Publications page is a Document
you can open or fork. They're independent systems that happen to share a
word.

## Where a publication comes from

You never create a publication directly from the Publications page itself —
it's a read-only catalog of claims that reached this device some other way.
There are two kinds today:

### Claiming authorship of a structure

Open a structure's **Info** panel from **My Structures** in the Editor's
Build Library. If it has a Blueprint identity (most saved structures do),
you'll see a **Community Attribution** section with:

- **Claim authorship** — signs a claim, under your current identity, that
  you authored this design. Shown only once, before you've claimed it.
- **Export Attribution** — saves your claim as a file you can hand to
  someone directly.
- **Publish to Network** — announces your claim to every peer you're
  currently connected to. This is what makes it show up on *their*
  Publications page, and (once you've published it) on your own.

### Naming a place

Open the naming panel for a Region or Landmark in World View and use
**Publish A Name** — see
[Geographic places](03-WorldView.md#geographic-places). Publishing a name
works the same way: it announces a signed claim to your connected peers.

### Receiving one from a peer

You don't have to publish anything yourself to see entries here. The moment
you're connected to a peer (see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)), anything
*they* publish while you're connected reaches your device automatically and
appears on your own Publications page. Cataloging a publication only ever
means your device has **seen a validly signed claim** — never that whatever
it points to is sitting on your device right now, which is exactly what the
page's status badge tells you.

## The Publications page

Open **Publications** in the top bar.

```
Publications

Every signed publication this device has cataloged — its own, or one a
connected peer announced. Status is always checked fresh, never remembered
from last time.

┌───────────────────────────────────────────────┐
│  Blueprint Attribution          [Available]    │
│  Published by …a1b2c3d4e5f6a7 · received       │
│  8/20/2026, 4:12:09 PM                         │
│  Blueprint attribution — fp:9f8e…, claimed by  │
│  …a1b2c3d4e5f6a7                               │
│  Available locally. The content matching this  │
│  publication's cryptographic hash is stored    │
│  on this device.                               │
│  [Re-check]                                    │
│                                                 │
│  External Evidence                             │
│  No external evidence known                    │
│  [Discover from Peers]                         │
│                                                 │
│  Snapshot Placements                           │
│  No snapshot placements known                  │
└───────────────────────────────────────────────┘
```

Below the status badge, every card also has its own **Local Snapshot**
section (what *this device* actually holds, and how to get it),
**Decentralization** overview (evidence and placements side by side),
**External Evidence** section, **Snapshot Placements** section, and
**IPFS Publishing** section — five independent questions, none of which
answer each other. See [Local Snapshot](#local-snapshot),
[Decentralization](#decentralization-evidence-and-placements-at-a-glance),
[Snapshot Placements](#snapshot-placements), and
[IPFS Publishing](#ipfs-publishing) below.

Each card shows:

- The kind of publication and who published it (the `…lastNchars` shortened
  form you'll see throughout the app).
- A **status badge**: **Available**, **Content unavailable**, or a more
  specific rejection like **Invalid publication signature** — see
  [Status meanings](#status-meanings) below. It's re-derived every time the
  page loads or you click **Re-check**; nothing here is remembered from a
  previous visit.
- A one-line summary of what was claimed (an attribution's fingerprint and
  claimant, or a place name and claimant).
- **Retrieve from Peers**, shown whenever the content is currently
  unavailable (disabled until you have at least one connected peer) —
  asks every connected peer, in order, for the actual bytes. Bytes handed
  over by a peer are only ever accepted after your device independently
  recomputes their hash and confirms it matches — never because of who
  the peer happened to be.
- **Re-check** — re-derives the status from scratch, right now.

### Status meanings

| Badge | Meaning |
|---|---|
| **Available** | The content this publication points to is on this device right now. |
| **Content unavailable** | The claim itself is genuine, but the actual content isn't here yet — try **Retrieve from Peers**. |
| **Invalid publication envelope** / **Invalid publication signature** | The publication record itself is malformed, or wasn't genuinely signed. |
| **Content does not match its own reference** / **Invalid content** / **Invalid content signature** | The bytes retrieved don't match what the publication claims. |
| **Failed a domain-specific check** | The content is well-formed and signed, but fails a check specific to its kind. |
| **Unsupported publication kind** | This device doesn't yet know how to display this kind of publication. |

None of these is a claim about whether the underlying *design or name is
good* — only about whether the signed record and its content check out
mechanically.

## Local Snapshot

Every publication card also has its own **Local Snapshot** section — a
question none of the other sections on this page answer: *does this
particular device, right now, actually hold the bytes for this
publication's content?* External Evidence and Snapshot Placements (below)
both describe **distributed claims** — things somebody, somewhere, has
signed. Local Snapshot describes a fact about **your own storage**, and
nothing else: it never checks a signature, never asks whether a placement
resolves, and never touches the network unless you explicitly click one of
the retrieval actions below it.

### At a glance: Snapshot Acquisition

Once you've checked local availability at least once, or made at least one
of the attempts described below, a **Snapshot Acquisition** summary opens
this section — a small, composed view sitting above everything else here,
never a replacement for it:

```
Snapshot Acquisition
Current possession: Available
Acquisition history: 4 attempts · 2 stored · 1 already available · 1 hash mismatch
1 via transfer package · 2 via placement · 1 via peer

Show Acquisition History
```

**Current possession** always mirrors the same check described just below.
**Acquisition history** is a plain count of every explicit attempt this
session — never a verdict, and never used to correct or second-guess
current possession. The two are reported entirely independently: a history
that shows a stored attempt doesn't mean the bytes are still here (they
could have been deleted since), and a history showing only a rejected
attempt doesn't mean they're missing now (a later, unrecorded success could
have replaced them). If this replica doesn't currently possess a valid
snapshot, one honest hint appears pointing at the three actions further
down this same section — never an automatic retry.

Click **Show Acquisition History** to inspect that same count one attempt
at a time — see [Every attempt, in order](#every-attempt-in-order) below.

### Checking what you already have

```
Local Snapshot

[Check Local Snapshot]   Available

Publication: known locally · Snapshot: available
```

Click **Check Local Snapshot** (or **Check Again**) to find out. It always
produces one of three honest, exact answers:

| Badge | Meaning |
|---|---|
| **Available** | This device holds bytes for this publication's content, and they still match its hash. |
| **Not available** | This device has never stored anything under this hash. |
| **Hash mismatch** | This device *has* something stored under this hash — and it no longer matches. This is a stronger, more alarming finding than "Not available": your own storage disagrees with itself. |

Two people can hold the byte-identical, identically signed publication and
get different answers here, purely because their own devices' storage
differs — that's expected, not a bug. Once you've checked at least once
this session, a short composed line appears underneath: *"Publication:
known locally / not known locally · Snapshot: available / not available"*
— the two separate facts of whether your device has ever cataloged the
publication's signed envelope at all, and whether it currently possesses
valid bytes for it.

### Bringing the bytes in

Checking only tells you what's already there. Three separate, explicit
actions can actually bring bytes onto your device — each is its own click,
none is ever triggered automatically by opening the page, checking
availability, or by each other:

**Import Snapshot** — click it to reveal a file picker and a paste box for
a **Publication Snapshot Transfer Package**: a portable JSON bundle of one
publication's content, however you obtained it (a file someone emailed
you, a paste from a chat). Choose a file or paste its contents, then click
**Import Snapshot** again to actually import it. Outcomes:

| Badge | Meaning |
|---|---|
| **Imported** | The package's bytes were stored and verified against its own claimed hash. |
| **Already available** | This device already had matching bytes — never treated as a failure. |
| **Import rejected** | The package's own bytes didn't match its own claimed hash. |
| **Snapshot was not imported** | What you supplied wasn't a valid package at all (bad JSON, wrong shape). |

**Get Snapshot from Peer** — choose one currently authenticated peer from
the dropdown and click **Get Snapshot from Peer** (or **…Again**) to ask
that specific peer, directly, for the bytes. Nothing here ranks peers,
races several of them, or automatically tries a second peer if the first
doesn't answer — it always asks exactly the one you picked. Outcomes:

| Badge | Meaning |
|---|---|
| **Obtained** | The peer sent bytes, and they matched this publication's content hash. |
| **Already available** | This device already had matching bytes. |
| **Not available right now** | The peer didn't answer, or doesn't currently hold the bytes — the two look identical from here, honestly. |
| **Rejected** | The peer answered, but with bytes that didn't match the claimed hash. |

Once either of these — or a **Materialize Snapshot** click from a
placement card (see [Snapshot Placements](#snapshot-placements)) — has
actually stored bytes this session, a one-line **Source:** note appears in
this section naming which of the three ("Transfer package," "Placement,"
or "Peer") most recently succeeded. It's stated plainly, never as
"preferred" or "recommended" — the three are just three different ways
bytes ended up here.

### Asking a peer what they have, without asking for the bytes

A separate **Peer Snapshot Possession** control lets you ask a connected
peer a question, without requesting a single byte: choose a peer and click
**Check with Peer** (or **…Again**). This is deliberately independent from
**Get Snapshot from Peer** above — one asks "do you have this?", the other
asks "give me this" — each with its own peer selection. Outcomes are
phrased as reports, never verdicts:

| Badge | Meaning |
|---|---|
| **Peer reports snapshot available** | That peer says it currently holds the bytes. |
| **Peer reports snapshot not available** | That peer says it doesn't. |
| **No answer from peer** | The peer didn't respond — indistinguishable from a peer that simply isn't there right now. |

Once an answer comes back, an **Observed:** line shows exactly when that
peer reported it. A single check like this replaces the previous one for
that entry; it's a fact about one moment, not a running history.

### Comparing several peers at once

**Peer Snapshot Possession Comparison** extends the same idea to more than
one peer at a time. Tick the checkbox next to every connected peer you
want to ask, then click **Check Selected Peers** (or **…Again**). The
result is a per-peer table — Peer, Reports (**Available** / **Not
available** / **Could not determine**), and when it was observed — plus a
running count across the group. Nothing here ranks or recommends a peer;
it only reports what each one said. Every check you run also joins an
**Observation History** you can expand with **Show Observation History**
— a full chronological log of every comparison check this session, never
trimmed down to only the latest answer per peer. Each row in that log is
its own compact summary you can click to expand — see
[Every observation, in order](#every-observation-in-order) below.

### Every attempt, in order

Once at least one of Import Snapshot, Get Snapshot from Peer, or
Materialize Snapshot has been attempted for this entry, a **Show
Acquisition History** button appears nested under **Snapshot Acquisition**
above — click it to see every attempt this session, in order, including
ones that were rejected for a hash mismatch (which the one-line
**Source:** note above never records, since it only ever names the most
recent *success*). Each attempt is its own compact row:

```
20:14 — Placement → Stored
20:16 — Peer → Hash mismatch
```

Click any one row to expand it and see the facts the compact row leaves
out:

| Field | Meaning |
|---|---|
| **Outcome** | The full sentence — *Snapshot stored locally*, *Snapshot was already available*, or *Content hash mismatch*. |
| **Publication** | Which publication this attempt was for. |
| **Content hash** | The content hash this attempt was made against. |

Expanding one row never affects any other row, and never affects the
**Current possession** line or the count sentences above — it's a plain
narration of what happened and when, never a ranking, and never a claim
that one source is more trustworthy than another, or an explanation of
*why* a hash mismatch happened.

### Every observation, in order

Once at least one **Check Selected Peers** click has completed, a **Show
Observation History** button appears nested under **Peer Snapshot
Possession Comparison** above (see
[Comparing several peers at once](#comparing-several-peers-at-once)) —
click it to see every observation this session, in order, including
repeat checks of the same peer. Each observation is its own compact row:

```
20:21:04 — Alice → Available
20:21:07 — Dave → Could not determine
```

Click any one row to expand it and see the facts the compact row leaves
out:

| Field | Meaning |
|---|---|
| **Reported** | The full sentence — *Peer reports snapshot available*, *Peer reports snapshot not available*, or *No answer from peer*. |
| **Publication** | Which publication this observation was for. |
| **Content hash** | The content hash this observation was made against. |

Expanding one row never affects any other row, and never affects the
comparison table or its counts above. This is the same distinction drawn
throughout this section, restated one more time because it's easy to
lose sight of once a history builds up: an observation records what a
peer said *at that moment* — it's never rewritten by anything that peer
does afterward. If Alice reports **Available** at 20:21 and later deletes
her own copy, that row still reads **Available** at 20:21; only a *new*,
later check can honestly report otherwise, as its own new row. There's
also deliberately no percentage, score, or "most reliable peer" summary
anywhere in this history, however tempting one might look after several
checks — it's a factual log, never a reliability ranking.

### Snapshot State: everything in one place

Once you've checked local availability, made at least one attempt to
bring bytes in, loaded this publication's placements, or compared at
least one peer, a **Snapshot State** section opens beneath everything
above — one place that shows all four of those facts side by side:

```
Snapshot State

Content
  Publication: pub-a1b2c3
  Content hash: 9f8e...

Local possession
  Available and matches content hash

Acquisition
  3 attempts · 2 stored · 1 hash mismatch

Placements
  Conflict · 2 known placements · 2 storage backends · 2 distinct locations

Peer observations
  2 available · 1 not available · 1 could not determine
```

Each of the five parts — Content, Local possession, Acquisition,
Placements, Peer observations — only appears once you've actually caused
that particular fact to be observed this session; nothing here is ever
shown as a false "zero" before that. And nothing here is ever combined
into a single verdict, either: it's entirely normal to see local
possession read **Available** while Placements reads **Conflict** and
Peer observations shows a mix of answers, all on the same card, at the
same time. This section never decides whether that combination is
"healthy" or "risky" — it only shows you, plainly, what's known. Each of
the individual sections above and below — **Snapshot Acquisition**,
**Peer Snapshot Possession Comparison**, **Snapshot Placements** — still
has its own full detail; **Snapshot State** is a map of them, never a
replacement for any one of them.

## Decentralization: Evidence and Placements at a glance

Every publication card also has a **Decentralization** section, visible as
soon as it has at least one known anchor or placement — a combined view
that puts [External Evidence](#external-evidence) and
[Snapshot Placements](#snapshot-placements) side by side so you don't have
to expand both lists separately just to compare them.

```
Decentralization

Publication: known locally

External Evidence                    Snapshot Placements
2 anchor claims                      3 placement claims · 2 storage types
Relationship: Agreement              Relationship: Conflict

⚠ Known snapshot placements conflict, while external evidence claims
  agree with each other. Multiple agreeing placements do not establish
  that any external evidence claim is true.

[Synchronize with Peers]
```

At the top, **Publication: known locally / not known locally** states one
plain fact ahead of everything else: whether this replica has the signed
publication envelope itself cataloged at all — independent of how many
anchor or placement claims it happens to also know about. Unlike Local
Snapshot's version of this line above, this one is always shown, with
nothing to click first — it's recomputed fresh every time the page or
either list below it loads.

Below that, two cards — **External Evidence** and **Snapshot Placements**
— each show how many claims are known and whether they agree
(**Agreement**) or disagree (**Conflict**) about the content hash. Neither
card is ever styled or worded as more significant than the other. If the
two dimensions' relationships genuinely differ — one agrees while the
other conflicts — an extra sentence says so explicitly, without ever
implying that agreement in one dimension makes the other more (or less)
trustworthy.

### Synchronizing with peers

If a **Synchronize with Peers** button is present, clicking it (or
**Synchronize Again**) asks every currently connected peer, in turn,
for anything they know — evidence and placements alike — that this
replica doesn't already have, in one combined action. It's never
triggered by opening the page or expanding a disclosure, only by this
explicit click. Afterward you'll see a summary sentence, plus a
breakdown:

| Field | Meaning |
|---|---|
| **New claims** | How many new anchors and how many new placements were received. |
| **Already known** | How many of each peers offered that this replica already had. |

### Replica Knowledge

Click **Show Replica Knowledge** to expand a claim-by-claim inventory of
*how this replica came to know* every anchor and placement it lists above
— never a verdict about which to trust, just an accounting. For each
known anchor and placement you'll see:

| Field | Meaning |
|---|---|
| **Acquisition** | *Learned locally*, *Learned via package import*, or *Learned via peer exchange* — the same three sources the per-claim **Local Knowledge** sections below already use. |
| **First seen** | When this replica first learned the claim. |
| **Verification** / **Resolution** | This replica's current lifecycle state for that claim — *Not yet verified/resolved*, *Verified*/*Resolved*, *Verified (proof unverified)*, *Currently unavailable*, *Rejected*, *Content hash mismatch*, or *Invalid placement*, matching the badges you'd see by inspecting that claim individually. |

This disclosure never itself checks anything over the network — it's a
recomputed snapshot of state you've already gathered by verifying evidence
or resolving placements elsewhere on the card.

## External Evidence

Every publication card has its own **External Evidence** section — a place
to attach and inspect independent evidence that a claim existed at a
particular time, entirely separate from whether the claim itself is
available or well-formed.

> **Evidence is not verification, and known is not verified.** A piece of
> evidence appearing here means only that your device holds a genuinely
> signed record saying "this was externally recorded." Whether that
> recording actually happened is a separate question you answer explicitly,
> below, with **Verify Evidence** — never assumed just because an anchor is
> listed.

### Creating evidence

If this device has an evidence publisher configured, you'll see a card per
type it can create (today, that's Bitcoin — labeled **Bitcoin Op Return**,
the specific technique used to write a hash into a Bitcoin transaction):

- **Create Bitcoin Op Return Anchor** records a claim that this
  publication's content hash was written into a real Bitcoin transaction.
  Clicking it always produces one of three honest outcomes:
  - **Anchor created** — the recording succeeded, and the new anchor
    immediately appears below, unverified.
  - **Recording rejected** — the external system was reached and refused.
  - **No anchor was created** — the external system couldn't currently be
    reached (or nothing on this device is configured to publish to it yet
    — this build ships no real Bitcoin wallet, so you'll always see this
    outcome unless one has been connected).
- Clicking again after a success offers **Create Another Bitcoin Op Return
  Anchor** — a second, fully independent anchor, never a replacement for
  the first.

Creating evidence never verifies it. A freshly created anchor shows up in
the list below exactly like any other, "Not yet verified," until you check
it yourself.

### Discover from Peers

```
External Evidence

3 anchors known                              [Show Evidence]

[Discover from Peers]   2 new evidence claims discovered from peers.
```

Ordinary peer connections only ever gossip evidence created or re-announced
*while you're connected* — if a peer signed an anchor a week before you two
ever connected, you'll never hear about it just by being connected now.
**Discover from Peers** closes that gap: click it, and your device asks
every peer you're currently connected to, one at a time, "what evidence do
you know about for this publication?" — including anything they learned
about historically, from someone else entirely.

This is always something you trigger yourself. Opening the Publications
page, or expanding **Show Evidence**, never contacts a peer on its own — the
only thing that ever does is this button.

What you'll see afterward, right under the button:

| Message | Meaning |
|---|---|
| *N new evidence claims discovered from peers.* | Peers answered, and you now know about anchors you didn't before. They're already in the list below. |
| *No new evidence claims discovered from peers.* | Peers answered, but had nothing you didn't already have. **This is not the same as "no evidence exists"** — it only describes what these specific peers, right now, had to offer. |
| *No authenticated peer was available to ask.* | There was nobody currently connected to ask. Connect to a peer first (see [Peer Connections & Friends](07-PeerConnectionsAndFriends.md)) and try again. |
| *The requested peer discovery operation could not complete.* | Something went wrong locally before any peer could even be asked. |

Discovering evidence never verifies it, either — it works exactly like
receiving evidence any other way: a discovered anchor lands in the list
below "Not yet verified," and your own past verification results for
anchors you already knew about are completely unaffected. Discovering the
same anchor a second time (from the same peer or a different one) never
creates a duplicate.

### The evidence list

Click **Show Evidence** to see every anchor known for this publication.
Several independent anchors — even ones that disagree — are always shown
side by side; nothing here ever picks a "winner."

If more than one anchor is known, a **Content binding** summary appears
first:

```
Content binding

  a1b2c3d4e6…f9a0  2 anchors      b3c4d5e6f7…a1b2  1 anchor

  ⚠ Evidence claims disagree about the content hash — 2 different
    content hashes are each claimed by at least one anchor.
```

The warning appears only when known anchors genuinely disagree about which
content hash this publication corresponds to. It's a heads-up, never a
verdict about which claim is correct.

Each anchor's own card shows:

| Field | Meaning |
|---|---|
| **Locator** | Where the external system says to find this recording. |
| **Recorded** | The claimed recording time — *claimed*, because nobody has re-checked it yet unless you click Verify. |
| **Publication / Content hash** | Exactly what this anchor's signature binds together. |
| **Attested by** | The identity that signed this anchor. |

And two buttons:

- **Verify Evidence** (or **Verify Again**) — the one thing that actually
  reaches out to the external system this anchor names, right now, and
  tells you what it currently finds. See
  [Verification outcomes](#verification-outcomes) below.
- **Inspect Evidence** — opens the raw claim: the exact recording time
  claimed, the external locator, and (for a recognized type like Bitcoin) a
  followable link to a block explorer plus the raw proof data. Purely a
  local read of what's already on your device — it never touches the
  network and never changes what **Verify Evidence** would later find.

  A separate **Local Knowledge** section, at the bottom, answers a
  different question — not "what does this evidence claim," but "how did
  *this device* come to know about it":

  | Field | Meaning |
  |---|---|
  | **Acquisition** | *Learned locally* (you created it), *Learned via package import* (it arrived bundled in a package you imported), or *Learned via peer exchange* (a peer sent or synchronized it to you). |
  | **First seen by this replica** | When this device first learned the claim — never reset by learning it again some other way later. |

  This is bookkeeping about your own device's history, nothing more. It
  never names *which* peer, and it's never a hint about which evidence to
  trust more — see [Verification outcomes](#verification-outcomes) below
  for the only thing that actually speaks to whether a claim holds up.

### Verification outcomes

| Label | Meaning |
|---|---|
| **Independently verified** | The external system was reached and confirms exactly what was claimed. |
| **Proof not independently verified** | Genuinely signed evidence, but this device has no way to check the external system for this anchor's type. |
| **Verification unavailable** | The external system couldn't currently be reached — not the same as invalid. |
| **Invalid evidence** / **Invalid signature** | The record itself is malformed or wasn't genuinely signed. |
| **Content mismatch** | This anchor's claim doesn't match the publication you're looking at. |
| **Invalid external proof** | The external system was reached, and it says the claim is false. |

If an anchor was **Independently verified** earlier in this visit but a
later check comes back **Verification unavailable**, you'll see one extra
line: *"This evidence was independently verified earlier; verification is
currently unavailable."* It's never downgraded to "invalid" — an external
system being temporarily unreachable doesn't erase what you already
confirmed.

> **Verifying is always your own choice, every time.** Nothing on this page
> ever checks external evidence automatically — not on load, not when new
> evidence is discovered, not when you expand the list. You decide, per
> anchor, when it's worth the round trip.

### Bitcoin Anchor: confirmation and content-proof reconciliation

Every **Bitcoin Op Return** anchor's own expanded card also has a second,
independent way of checking on it, alongside **Verify Evidence** above: a
**Bitcoin Anchor** section that asks two narrower, more mechanical
questions and shows the answers side by side — never merged into one
verdict.

```
Bitcoin Anchor

Transaction: a1b2c3…
Content hash: 9f8e…

Confirmation
  Transaction confirmed
  Block height: 920123 · Confirmations: 6

Content proof
  Hash matches OP_RETURN

[Reconcile Again]   [Show Confirmation History]
```

Click **Reconcile** (or **Reconcile Again**) — the one action in this
section — to ask, right now:

- **Confirmation** — has the Bitcoin network actually mined this
  transaction into a block?

  | Badge | Meaning |
  |---|---|
  | **Transaction confirmed** | Found, and mined — shown with its block height, block hash, and confirmation count. |
  | **Transaction not confirmed** | Not found, or found but not yet mined — this app doesn't distinguish "still in the mempool" from "never broadcast." |
  | **Confirmation status unavailable** | The confirmation source couldn't currently be reached. |

- **Content proof** — does this specific transaction's OP_RETURN output
  actually carry the content hash the anchor claims?

  | Badge | Meaning |
  |---|---|
  | **Hash matches OP_RETURN** | It does. |
  | **Hash does not match OP_RETURN** | It doesn't, or the proof itself is malformed. |
  | **Content proof unavailable** | Couldn't currently be checked. |

A transaction reading **Transaction confirmed** right next to a content
proof reading **Hash does not match OP_RETURN** is a real, legitimate
combination this section shows you plainly, exactly as it found it — never
resolved, hidden, or explained away.

Every **Reconcile** click's confirmation joins a **Show Confirmation
History** log for this anchor — the same kind of append-only, oldest-first,
never-rewritten record described in
[Every attempt, in order](#every-attempt-in-order) above. Content proof has
no history of its own: an OP_RETURN output's own hash match doesn't evolve
the way confirmation depth does, so only the current reconciliation's
content proof is ever shown.

## The Bitcoin Anchor Pipeline

Everything above in [External Evidence](#external-evidence) either creates
an anchor through **Create Bitcoin Op Return Anchor** — which, in this
build, always reports **No anchor was created**, since nothing behind that
button holds a real wallet — or inspects an anchor that already exists.
Separately from that, the Publications page has a full, step-by-step
pipeline that connects an actual browser wallet, builds a real transaction
plan for a publication's content hash, has the wallet sign it, verifies
and finalizes that signature cryptographically, broadcasts it, and lets
you check whether it's been mined — each stage its own explicit click,
never chained or automated.

> **This moves real bitcoin, on Bitcoin mainnet.** Every step from
> **Create Transaction Plan** onward operates on your connected wallet's
> real spendable funds, and **Broadcast Transaction** submits a real
> transaction to the public Bitcoin network. There is no test mode, no
> testnet switch, and no simulated broadcaster anywhere in this pipeline.
> Only proceed past **Sign Reviewed Transaction** with a wallet and an
> amount you're genuinely willing to spend.

### What you'll need

- A Bitcoin wallet browser extension — today, specifically **UniSat**
  (`window.unisat`). No other wallet extension is supported yet; without
  one installed, connecting reports the wallet **unavailable** rather than
  failing silently.
- A wallet account funded with real, spendable bitcoin, using a **native
  SegWit address** (one starting `bc1q…`). This pipeline can *observe*
  funding for other address types, but can only carry a **Taproot**
  (`bc1p…`) or **legacy** (`1…`/`3…`) account through to a *signable*
  transaction — for anything else, the review step honestly reports it
  isn't reviewable yet, rather than guessing.
- At least one publication already on your own Publications page (see
  [Where a publication comes from](#where-a-publication-comes-from)) — the
  transaction plan anchors that publication's own content hash.

### Connecting a wallet

The **Bitcoin Wallet** control lives inside an existing **Bitcoin Op
Return** anchor's own expanded card — click **Show Evidence** on a
publication that already has one (see
[The evidence list](#the-evidence-list)), then look underneath that
anchor's own fields. Since **Create Bitcoin Op Return Anchor** never
actually succeeds in this build, you'll need to have received an anchor
from a peer, or imported one, before you have a card to expand — see
[Where a publication comes from](#where-a-publication-comes-from) and
[Discover from Peers](#discover-from-peers).

```
Bitcoin Wallet

[Connect Bitcoin Wallet]
```

Click **Connect Bitcoin Wallet**. Your browser's wallet extension asks you
to approve the connection — nothing here can approve it for you, and
ForkBuild never sees a private key, a seed phrase, or a wallet password;
it only ever receives a public account address, a network name, and a
narrow signing capability for as long as the connection stays open.
Outcomes:

| State | Meaning |
|---|---|
| **Connected** | Shows the connected **Account** and **Network**. |
| **Disconnected** | Either you haven't connected yet, or you declined the extension's own approval prompt. |
| **Wallet unavailable** | No extension is installed, it's locked, or it couldn't currently be reached. |

Connecting here connects the wallet for the **whole page** — the same
connection powers Bitcoin Funding, transaction review, and signing
everywhere else, not just this one card. Click **Disconnect** to drop it.
Nothing about the connection is remembered after you reload the page —
you'll need to connect again next time.

If the connected wallet's own network doesn't match what a given
transaction needs, you'll see an explicit mismatch warning rather than a
silent failure — ForkBuild never switches networks, disconnects, or picks
a different wallet on your behalf; you reconnect the right one yourself.

### Observing funding

Once a wallet is connected, a page-level **Bitcoin Funding** panel appears
near the top of the Publications page, above the list of publications:

```
Bitcoin Funding

Network: mainnet
Account: …a1b2c3

[Observe Wallet Funding]
```

Click **Observe Wallet Funding** (or **Refresh Funding**) to ask what the
connected account can currently spend. This is a plain, one-off read —
nothing is selected, reserved, or spent by observing it, and nothing here
re-checks itself automatically; it's a fact about the moment you clicked,
and can already be stale by the time you look at it again. Outcomes:

| State | Meaning |
|---|---|
| **Funding observed** | Shows the number of UTXOs found (expand **Show Funding Inputs** to see each one), their total value, the account's own script type, and the change destination — always the same account, since this build never asks a wallet extension which address to send change to. |
| **Unsupported address format** | A real address ForkBuild simply has no fee-estimation support for yet (for example, a legacy P2SH `3…` address). |
| **Funding unavailable** | The funding source couldn't currently be reached. |

If the wallet has since reconnected on a different network than this
observation was made on, a staleness warning says so — refresh funding
before relying on it.

### Building a transaction plan

Each publication's own card also has a **Bitcoin Anchor Transaction**
section:

```
Bitcoin Anchor Transaction

[Create Transaction Plan]
```

**Create Transaction Plan** is disabled until you've observed funding at
least once, and never re-observes it on its own — it always plans against
whatever funding you most recently observed, however stale that's become.
Click it to select UTXOs (largest first, deterministically — never an
"optimal" or privacy-aware selection) and compute a fee for anchoring
**this publication's own content hash**. Outcomes:

| State | Meaning |
|---|---|
| **Transaction plan constructed** | Shows the network, content hash, how many inputs were selected, the fee, the change, the total input value, and the full input/output list — plus, separately, when funding was observed and when the plan itself was built, since the two are genuinely different moments. |
| **Unable to construct transaction** | Most commonly, the observed funding can't even cover the fee. |

A fresh **Create Transaction Plan** click always replaces whatever was
previously under review, signed, finalized, or broadcast — so nothing
downstream can ever be left pointing at a stale plan.

### Reviewing and signing

A successful plan immediately populates a page-level **Review Bitcoin
Anchor Transaction** panel — no extra click needed, since reviewing
touches no wallet and commits to nothing:

```
Review Bitcoin Anchor Transaction

Network: mainnet          Content hash: 9f8e…
Fee: 400 sat               Change: 4200 sat
Total input: 10000 sat

Inputs                                Outputs
…                                     …

Wallet: ✓ Network matches.

[Sign Reviewed Transaction]
```

This shows you exactly what you're about to authorize — no verdict, no
"safe" or "recommended" label, just the plan's own facts — plus whether
your connected wallet's network matches this specific transaction's own
network (never a page-wide default). Click **Sign Reviewed Transaction** —
disabled until a matching wallet is connected — and your wallet extension
asks you to approve signing. ForkBuild independently re-checks, byte for
byte, that what's about to be signed is still exactly what was reviewed;
if the plan changed in between (say, you rebuilt it), the wallet is never
even asked. Outcomes:

| State | Meaning |
|---|---|
| **Wallet returned a signed PSBT** | The wallet signed. This means only that ForkBuild independently confirmed the response carries recognized signing material for exactly this transaction — **not** that the signature has been cryptographically verified yet; that's the next, separate step. |
| **Signing declined** | You (or the wallet) definitely declined. |
| **Wallet unavailable** | No wallet connected, or it couldn't be reached. |
| **Signing failed** | The wallet claimed success but returned something unusable. |

### Verifying and finalizing

Once the wallet returns a signed PSBT, a **Verify & Finalize Transaction**
button appears:

```
[Verify & Finalize Transaction]

✓ Verified
Verified inputs: 1 / 1
Transaction ID: 7f3a…

▸ Raw transaction bytes
```

This is the one step that actually, cryptographically checks the
signature — recomputing the exact hash a correct signature would have
covered and verifying it against the claimed key and signature, entirely
offline. Outcomes:

| State | Meaning |
|---|---|
| **Transaction finalized** | The signature checked out. Shows the real transaction ID and, behind a **Raw transaction bytes** disclosure, the actual finalized bytes. |
| **Signature did not verify** | It didn't — a wrong key, a wrong signature, or a signature over the wrong data. |
| **Finalization failed** | Some other unacceptable result, distinct from a definite bad signature. |

Today, this can only finalize a **native SegWit (P2WPKH)** input — the one
script type this pipeline can fully decode and verify. A Taproot or legacy
account's transaction review will already have told you it wasn't
reviewable, before you ever reached this step.

### Broadcasting

Once finalized, a **Broadcast** section appears with the transaction's own
ID and a **Broadcast Transaction** button. Click it to submit the exact
finalized bytes — nothing is re-signed, re-built, or substituted — to the
real Bitcoin network:

| State | Meaning |
|---|---|
| **Transaction broadcasted** | The network accepted it. This means only that it was accepted for broadcast — **not** that it's been mined yet; see Observing confirmation, next. |
| **Transaction rejected** | The network refused it outright. |
| **Broadcast unavailable** | Couldn't currently reach the network. |

A rejected or unavailable attempt is the end of that attempt — click
**Broadcast Again** to resubmit the identical, already-finalized bytes;
nothing here retries automatically or substitutes a different transaction.

### Observing confirmation

Once broadcast, a separate **Confirmation** section appears, with its own
**Observe Confirmation** button — reaching a broadcasted state never
checks confirmation automatically; you ask, explicitly, every time:

| Badge | Meaning |
|---|---|
| **Transaction confirmed** | Mined — shows the block height, block hash, and confirmation count. |
| **Transaction not confirmed** | Not yet mined (or not found at all — this app doesn't distinguish the two). |
| **Confirmation status unavailable** | Couldn't currently be checked. |

Each click appends to its own **Show Confirmation History** log for this
specific broadcast — oldest first, never rewritten by a later check, and
kept entirely separate from the
[Bitcoin Anchor reconciliation history](#bitcoin-anchor-confirmation-and-content-proof-reconciliation)
described above, which tracks **Reconcile** clicks against an
already-cataloged publication anchor instead. The two are never merged:
one is about a transaction you just walked through this pipeline
yourself, the other about a signed anchor claim someone (possibly you,
earlier) already published.

Every one of these confirmation observations is also, quietly, written
into the durable
[Publication Observation Archive](#the-publication-observation-archive),
keyed by this exact broadcast's own txid — so, unlike the **Show
Confirmation History** list on this screen, that copy survives a reload;
see [What survives a reload](#what-survives-a-reload).

### What this pipeline does not do

However far you take a transaction through this pipeline — even all the
way to **Transaction confirmed** — it never, on its own, creates a
cataloged **External Evidence** entry on this or anyone else's
Publications page. Nothing here calls the same code
**Create Bitcoin Op Return Anchor** does, and this pipeline's own review,
signing, and broadcast/confirmation *screens* are ephemeral: shown for
this visit, and replaced or cleared the moment you build a new plan, sign
again, or reload the page. One narrow fact is the exception — see
**Bitcoin Anchor Publications**, next — and every broadcast and
confirmation result also joins the durable
[Publication Observation Archive](#the-publication-observation-archive).
Publishing your own real, on-chain-anchored transaction as an evidence
claim other people can discover is separate work this build doesn't yet
connect for you.

### Bitcoin Anchor Publications: a durable identity and lifecycle

A page-level **Bitcoin Anchor Publications** card, further down the
Publications page, keeps one small, durable fact this pipeline mints —
independent of everything else described as ephemeral just above:

```
Bitcoin Anchor Publications                     [Persisted locally]

Every Bitcoin anchor publication attempt this replica has minted a
durable identity for — created the moment a transaction is finalized,
independent of whether its broadcast later succeeds. A publication
record names WHAT was published, AS WHICH transaction, and on WHICH
network — never whether it was later confirmed.

Publications: 1

[Show Publications]
```

The moment **Verify & Finalize Transaction** succeeds (see
[Verifying and finalizing](#verifying-and-finalizing) above) — never
earlier, and never re-run on a later broadcast attempt for that same
finalized transaction — this replica mints itself a durable **publication
record**: exactly `{ anchor ID, content hash, txid, network, created at }`,
nothing else. It carries no confirmed/valid/trusted/status field of any
kind, and whether the broadcast that follows succeeds, fails, or is never
attempted never retroactively erases it. Click **Show Publications** to
list every one this replica has ever minted.

Each row has two independent disclosures:

- **Inspect Observations** — a plain count of every broadcast,
  confirmation, content-proof, chain-placement, and consistency fact this
  archive holds for that exact anchor ID (see
  [The Publication Observation Archive](#the-publication-observation-archive)
  below) — a correlation of independently recorded facts, never a verdict.
- **Show Publication Lifecycle** — the same facts **Inspect Observations**
  shows grouped by category, interleaved instead into one chronological
  read: a **Publication record created** entry, then every broadcast,
  confirmation, content-proof, chain-placement, and consistency entry this
  anchor ID has, in the order they actually happened. A stage nothing has
  recorded yet (say, no content-proof observation) simply produces no
  entry — never a fabricated "missing" or "failed" row. Collapsed by
  default; opening or closing it performs zero network operations, since
  every fact it shows was already durably recorded elsewhere on this page.

## The Base Anchor Pipeline

A second, entirely independent pipeline — one chain over from
[The Bitcoin Anchor Pipeline](#the-bitcoin-anchor-pipeline) above — connects
a real browser wallet to **Base**, an Ethereum-compatible network, and
walks a real transaction from an observed account all the way to a
broadcast, network-observed anchor for a publication's content hash.
Bitcoin and Base are deliberately never merged into one generic
"blockchain anchor" flow: each gets its own wallet connection, its own
transaction shape, and its own vocabulary, because the two chains' own
underlying facts genuinely differ (a Bitcoin PSBT and UTXO set versus a
Base account nonce, gas price, and self-transfer transaction) — see
[Bitcoin Anchor: confirmation and content-proof reconciliation](#bitcoin-anchor-confirmation-and-content-proof-reconciliation)
above for the same restraint stated the other way around.

> **This can move real funds on Base mainnet, or none at all on Base
> Sepolia testnet — whichever network your connected wallet reports.**
> Every step from **Create Base Transaction Plan** onward operates on
> whatever account your wallet connects with, on whatever network that
> account happens to be on. Connect a testnet account with a testnet
> wallet and this pipeline spends only test funds; connect a mainnet
> account and **Broadcast Transaction** submits a real transaction to
> Base's production network. ForkBuild never switches, defaults, or
> assumes a network on your behalf — the network shown throughout this
> pipeline is always whatever your wallet actually reported.

### What you'll need

- A **Base-capable browser wallet extension** implementing the standard
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`
  interface — Coinbase Wallet, MetaMask, and most other injected Ethereum
  wallets qualify. Unlike the Bitcoin pipeline above, no single named
  extension is required; without any compatible extension installed,
  connecting reports the wallet **unavailable** rather than failing
  silently.
- A wallet account connected to one of the two chain IDs this app
  recognizes as genuinely Base — **8453** (mainnet) or **84532** (Base
  Sepolia testnet). Connecting on any other chain is reported as an
  explicit **mismatch**, never silently relabeled as Base.
- At least one publication already on your own Publications page (see
  [Where a publication comes from](#where-a-publication-comes-from)) — the
  transaction plan anchors that publication's own content hash, exactly
  like the Bitcoin pipeline's plan does.

### Connecting a wallet and observing an account

Unlike the Bitcoin pipeline's wallet control — nested inside an existing
anchor's own card — a page-level **Base Network** panel appears near the
top of the Publications page on its own, with nothing to expand first:

```
Base Network

Observing an account here never constructs, signs, or broadcasts a
transaction — it is a fact about a moment, read fresh every time this
is asked.

[Connect Base Wallet]
```

Click **Connect Base Wallet**. Your browser's wallet extension asks you to
approve the connection — exactly like the Bitcoin pipeline, ForkBuild never
sees a private key, a seed phrase, or a password; it only ever receives an
address for as long as the connection stays open. States:

| Badge | Meaning |
|---|---|
| **Connected** | Shows the connected **Account**. |
| **Disconnected** | Not yet connected, or you declined the extension's approval prompt. |
| **Wallet unavailable** | No compatible extension installed, or it couldn't currently be reached. |

Click **Disconnect** to drop the connection. Nothing about it is remembered
after you reload the page.

Once connected, click **Observe Base Account** (or **Refresh Observation**)
to ask, right now, which chain that account is actually on and what it can
spend — a plain, one-off read that never constructs, signs, or broadcasts
anything, and never re-checks itself automatically:

| Badge | Meaning |
|---|---|
| **Base account observed** | Shows the **Network**, **Chain ID**, **Account**, **Native balance** (in wei), and when it was observed. |
| **Connected network is not Base** | The wallet answered, but with a chain ID this app doesn't recognize as Base mainnet or testnet — shown with the actual chain ID it found, never silently relabeled. |
| **Base account unavailable** | The wallet couldn't currently be reached. |

### Building a transaction plan

Each publication's own card also has a **Base Publication Transaction**
section:

```
Base Publication Transaction

Turns the Base account observed above into an unsigned, self-transfer
transaction plan carrying THIS publication's own content hash as raw
transaction data. Nothing is signed or broadcast by constructing this —
it only names the nonce, gas limit, and fee figures the account was
observed with, and the exact bytes the transaction would carry.

[Create Transaction Plan]
```

Unlike Bitcoin's OP_RETURN output, a Base anchor is a **self-transfer**: an
ordinary transaction from the observed account back to itself, carrying
the content hash as its raw transaction data instead of moving value to
anyone else. **Create Base Transaction Plan** is disabled until you've
observed an account at least once, and never re-observes it on its own —
it always plans against whatever observation you most recently made,
however stale that's become. Outcomes:

| State | Meaning |
|---|---|
| **Transaction plan constructed** | Shows the network, chain ID, content hash, from/to (to always equals from), value, nonce, gas limit, max fee per gas, priority fee (all in wei), the transaction data, and separately when the account was observed versus when the plan itself was built. |
| **Base network unavailable** | The account observation, or a fee/nonce figure needed to build the plan, couldn't currently be obtained. |
| **Unable to construct transaction** | Construction failed for some other reason. |

A fresh **Create Transaction Plan** click always replaces whatever was
previously under review, signed, finalized, or broadcast for this
publication.

### Reviewing and signing

A successful plan immediately populates that same card's **Base
Transaction Review** section — no extra click, since reviewing a Base
plan is local and read-only:

```
Base Transaction Review

The following transaction plan will be supplied to the signing
capability if you explicitly continue. Reviewing it does not sign,
broadcast, or validate it against the network — it names exactly what
a wallet would be asked to sign, nothing more, and nothing assumed.

From: …          To: … (self-transfer)
Value: 0 wei      Nonce: 4
Gas limit: 60000  Max fee per gas: … wei   Priority fee: … wei

Content Hash: 9f8e…
Transaction Data: 0x9f8e…

[Sign Reviewed Transaction]
```

Click **Sign Reviewed Transaction** and your wallet extension asks you to
approve signing exactly the plan shown above — nothing is reconstructed or
modified first. Outcomes:

| State | Meaning |
|---|---|
| **Wallet returned a signed transaction** | The wallet signed. This means only that a signed artifact came back for a plan that still matched its own review — **not** that it's been cryptographically verified yet; that's the next, separate step. |
| **Signing declined** | You (or the wallet) declined. |
| **Wallet unavailable** | No wallet connected, or it couldn't be reached. |
| **Signing failed** | The wallet claimed success but returned something unusable. |

### Verifying and finalizing

Once signed, a **Verify & Finalize Transaction** button appears:

```
[Verify & Finalize Transaction]

Transaction finalized
Recovered signer: …
Transaction hash: 7f3a…
```

This independently, cryptographically verifies the signed transaction
against the exact plan reviewed above — including recovering the actual
signer from the signature itself, entirely offline. Outcomes:

| State | Meaning |
|---|---|
| **Transaction finalized** | The signature checked out. Shows the recovered signer and the transaction hash. Ready for the separate broadcast step. |
| **Signature did not verify** | It didn't — a wrong key, a wrong signature, or a signature over the wrong data. |
| **Finalization unavailable** / **Finalization failed** | Couldn't currently be checked, or some other unacceptable result distinct from a definite bad signature. |

**This is also the one moment this pipeline mints a durable fact** — see
[Base Anchor Publications](#base-anchor-publications-a-durable-identity-and-lifecycle),
next.

### Broadcasting

Once finalized, a **Broadcast** section appears with the transaction's own
hash and a **Broadcast Transaction** button. Click it to submit the exact
finalized bytes — unmodified — to Base's own network:

| State | Meaning |
|---|---|
| **Transaction broadcasted** | The network accepted it for broadcast — **not** that it's been mined yet; see Observing inclusion, next. Shows the **Transaction ID**. |
| **Transaction rejected** | The network refused it outright. |
| **Broadcast unavailable** | Couldn't currently reach the network. |

A rejected or unavailable attempt is the end of that attempt — click
**Broadcast Again** to resubmit the identical, already-finalized bytes.

### Observing inclusion

Once broadcast, a **Base Transaction Inclusion** section appears, with its
own **Observe Transaction** button — broadcast acceptance is never chain
inclusion, and reaching a broadcasted state never checks inclusion
automatically:

| Badge | Meaning |
|---|---|
| **Transaction included** | Base's network currently reports a receipt for this exact transaction hash — shown with block hash, block number, transaction index, and confirmation count. This does **not** mean safe, final, or irreversible; a chain reorganization remains possible, and this isn't detected. |
| **Transaction not included** | No receipt was returned at this observation — this app doesn't distinguish "still pending" from "never broadcast." |
| **Inclusion status unavailable** | Couldn't currently be checked. |

Every click is preserved, never overwritten — click **Observe Transaction
Again**, and once more than one observation exists, **Show Observation
History** to see every past click for this exact transaction, oldest
first, each with its own state, block details, and timestamp.

Exactly like Bitcoin's own **Observing confirmation** step in its
pipeline, every one of these observations is also durably archived
automatically the moment it completes — see
[The Publication Observation Archive](#the-publication-observation-archive)
below. That archived copy is what
[Base Anchor Publications](#base-anchor-publications-a-durable-identity-and-lifecycle),
next, actually reads from, and it's the one place these facts survive a
reload — the **Show Observation History** list on this card itself is
still session-only, exactly like the rest of this pipeline's own screens;
see [What survives a reload](#what-survives-a-reload).

### Base Anchor Publications: a durable identity and lifecycle

A page-level **Base Anchor Publications** card, further down the page,
mirrors [Bitcoin Anchor Publications](#bitcoin-anchor-publications-a-durable-identity-and-lifecycle)
above exactly, one chain over:

```
Base Anchor Publications                        [Persisted locally]

Every Base publication attempt this replica has minted a durable
identity for — created the moment a transaction is finalized,
independent of whether its broadcast later succeeds.

Publications: 1

[Show Publications]
```

The moment **Verify & Finalize Transaction** succeeds — never earlier, and
never re-run on a later broadcast attempt for the same finalized
transaction — this replica mints a durable publication record: exactly
`{ content hash, txid, network, created at }`. Click **Show Publications**
to list every one, then **Show Publication Lifecycle** on any row to
interleave that record with every recorded **Observe Transaction** result
for its exact txid into one chronological read.

Base's own lifecycle carries only **two** entry kinds — **Publication
record created** and **Inclusion observation #N** — never a **Broadcast**
entry the way Bitcoin's six-entry-kind timeline does, because this
codebase has never made a Base broadcast result itself durable, only the
inclusion observations that follow it. A stage nothing has recorded yet
simply produces no entry, and this disclosure performs zero network
operations of its own — everything it shows was already recorded
elsewhere on this page.

### What this pipeline does not do

Exactly like the Bitcoin pipeline above: however far you take a
transaction through this pipeline — even to **Transaction included** — it
never creates any kind of cataloged **External Evidence** entry, and there
is no "Create Base Anchor" button anywhere in External Evidence to begin
with; this whole pipeline lives only here. The review, signing, and
broadcast/inclusion *screens* are ephemeral, replaced or cleared by a new
plan, a new sign, or a reload. The two durable exceptions are the
publication record minted at finalization and the inclusion observations
archived after every **Observe Transaction** click — both described above.

## Publication References

Two page-level cards, further down the Publications page, build directly
on the durable publication identities the two pipelines above mint — not
the anchors themselves, but the fact that one published record
explicitly points at another.

### Recording a reference

```
Publication References                          [Persisted locally]

References recorded: 2

[Show References]
```

Click **Show References** to expand a small form:

- **Source publication (the one making the reference)** and **Referenced
  publication (the one being pointed at)** — two dropdowns, each listing
  every publication identity this replica currently knows from its own
  Bitcoin and Base Anchor Publications records above (for example,
  "Bitcoin — a1b2…c3d4 — content 9f8e…"). There's no free-text field, and
  no way to name a publication that doesn't already have a durable
  identity here.
- **Record Reference** — disabled until both dropdowns are chosen. Click
  it to durably record that fact.

A publication can never reference itself — choosing the identical
publication on both sides is rejected, with the reason shown inline,
rather than silently accepted. Recording a reference is entirely your
own explicit act: nothing on this page ever infers one from matching
content, timestamps, or authors, and publishing or forking something
elsewhere never creates one automatically.

> **Deliberately not called "fork."** A reference is the plain fact that
> one publication's identity points at another's. What that pointer
> *means* — a fork, a citation, a response — is an interpretation this
> record refuses to make; it states only that the pointer exists.

Recorded references are listed underneath, oldest first, each showing
both publications' blockchain and shortened identity, their content
hashes, and when the reference was recorded. The same publication can be
the source of several references, the target of several references, or
both — nothing here deduplicates or limits that, and referencing the
same publication twice is recorded as two separate references, never
collapsed into one.

### Publication Reference Graph

A second card, **Publication Reference Graph**, groups those same
recorded references — never a second, independently entered set — into a
per-publication view:

```
Publication Reference Graph                     [Persisted locally]

Edges: 5   Publications: 4
Distinct sources: 3   Distinct referenced: 2

[Show Reference Graph]
```

Expanding it lists every publication that appears on either side of at
least one reference, with its own **Outgoing references** and **Incoming
references** counts. Click a publication to expand it and see the exact
edges behind those counts — which publications it references, and which
reference it, each with when it was recorded. Two references between the
same pair of publications are always shown as two separate lines here,
never merged into one.

> **A count is not a ranking.** "7 incoming references" is a plain,
> attributable fact this graph states about a publication — never a
> score, and never a claim that it's "more valuable" or "more popular"
> than one with fewer. There's no leaderboard, weighting, or
> "most-referenced" list anywhere in this graph.

## Achievements

Publishing on this page can, on its own, quietly earn a **publication
identity** — never a person, a wallet, or an account — a badge the
moment a specific, plainly named threshold is crossed. Nothing needs to
be claimed or requested; a badge simply appears the instant its
threshold is crossed by something you did elsewhere on this page.

### The Achievements card

```
Achievements                                    [Persisted locally]

Badges earned: 3

[Show Achievements]
```

Expand it to see every badge this replica's own Bitcoin and Base
publication records have earned so far:

| Badge | Icon | Earned when |
|---|---|---|
| First publication | 🏆 | Your very first Bitcoin or Base anchor publication record is minted. |
| Bitcoin publisher | ₿ | Your first Bitcoin anchor publication record. |
| Base publisher | 🔵 | Your first Base anchor publication record. |
| Multi-chain publisher | 🌐 | You've minted a publication record on more than one chain. |
| Ten publications | 🔟 | Your 10th publication record, Bitcoin and Base combined. |
| One hundred publications | 💯 | Your 100th. |

Click a badge to expand it and see the exact **Source Publication** that
earned it — its blockchain, content hash, chain reference, and when it
was created — and, when this replica can resolve it, a **View
Publication Lifecycle Above** button that jumps straight to that
publication's own lifecycle timeline (see
[Bitcoin Anchor Publications](#bitcoin-anchor-publications-a-durable-identity-and-lifecycle)
and
[Base Anchor Publications](#base-anchor-publications-a-durable-identity-and-lifecycle)
above). A badge is a presentation of that one already-durable fact —
never a new claim, a score, a rank, or a statement about anyone's worth.

Five further thresholds — earned by making or receiving an explicit
[Publication Reference](#publication-references) rather than by
publishing — have no badge presentation here yet: **First reference
created**, **First reference received**, **Referenced by 10
publications**, **Referenced by 100 publications**, and **First
cross-chain reference** (a reference between a Bitcoin and a Base
publication). They're real, earned achievements this replica already
tracks; you'll find them listed by name, not badge, in **Achievement
Profile**, next.

### Achievement Profile

A publication identity's own complete slice of every achievement it's
earned — badge-presented or not:

```
Achievement Profile

[Show Achievement Profile]
```

Choose a publication from the dropdown (the same known publication
identities every other card here draws from) to see its **Achievements**
count and the full list — each shown as "🏆 *label*" with when it was
earned.

**Deliberately not a user or wallet profile.** This page can state that
a *publication* earned an achievement, never yet that a *person* did,
because nothing here durably links a publication identity to a human
being.

## Publisher Identity

Everything above — anchor publications, references, achievements — is
scoped to a **publication identity**: a specific record on a specific
chain. Nothing about it names who published it, in any human sense.
**Publisher Associations**, and the three cards built on top of it, let
you say, explicitly, "publisher *X* claims this publication" — entirely
at your own word.

> **A publisher identifier is a bare, self-declared label — never a
> verified identity.** Typing "Alice" here is not a login, a
> cryptographic proof, or a claim this page checks against anything.
> `Alice`, `alice`, and `ALICE` are three different publisher identities,
> compared exactly, case for case. Nothing here infers a publisher from a
> shared wallet, matching content, or a matching name — only from what
> you explicitly typed and confirmed.

### Publisher Associations

```
Publisher Associations                          [Persisted locally]

Associations recorded: 2

[Show Publisher Associations]
```

Expand it, then:

- **Publisher identifier** — type a label (for example, "Publisher A");
  a dropdown of identifiers you've already used elsewhere on this page
  offers autocomplete, but typing a brand-new one is exactly as valid.
- **Publication** — choose one of your known Bitcoin/Base publication
  identities.
- **Add Publication** — disabled until both are filled in. Click it to
  durably record that this publisher claims that publication.

**Recorded Associations** lists every one you've made, oldest first.
Below that, **A Publisher's Associated Publications** lets you pick any
publisher identifier that's been used at least once and see every
publication currently associated with it, with its own content hash and
when it was associated.

This is stated plainly as **an explicit claim, not a verified fact** — it
says the association was recorded, never that this replica has proven
who actually controls those publications.

### Publisher Achievement Profile, Badges, and Statistics

Three further cards compose the same publisher/publication association
with everything [Achievements](#achievements) above already computes —
never a second, competing achievement engine — each answering a
different question about one chosen publisher:

| Card | Answers |
|---|---|
| **Publisher Achievement Profile** | The full list of achievements earned by *any* publication that publisher has claimed, each showing which publication earned it. |
| **Publisher Achievement Badges** | The same, narrowed to only the achievements that already have a badge presentation in [Achievements](#achievements) — with the identical **View Publication Lifecycle Above** link. |
| **Publisher Achievement Statistics** | Plain counts: associated publications, achievements earned, distinct achievement kinds, badges earned, distinct badge kinds, and a per-blockchain publication count — plus a breakdown of how many achievements were earned of each kind. |

Each of the three has its own **Choose A Publisher** dropdown, populated
from every publisher identifier **Publisher Associations** has recorded
— choosing one is independent across the three cards, so picking a
publisher in one doesn't select it in another. If no publisher has been
associated with anything yet, each card says so and points back to
**Publisher Associations**.

All three carry the identical caveat as Publisher Associations: what
they show is a fact about publications that publisher has *explicitly
claimed*, never proof of who controls, owns, or is the human behind any
of them — and none of the three ever produces a score, a rank, a level,
a tier, or a leaderboard entry.

## Snapshot Placements

Every publication card also has its own **Snapshot Placements** section —
one of several independent questions a card can answer:

| Question | Where it's answered |
|---|---|
| Does *this device* have the bytes right now? | The card's own status badge, or the more precise, hash-checked [Local Snapshot](#local-snapshot) section |
| Was this claim recorded by an outside system, at some point? | **External Evidence** |
| Where else, right now, can the bytes be fetched from? | **Snapshot Placements** |

A **snapshot placement** is a signed claim, made by whoever created it,
that a specific storage backend — today, **IPFS** or this device's own
**Local** storage — can presently serve the bytes for this publication's
content hash. It's not a copy of the claim itself, not a guarantee the
backend will still have the bytes tomorrow, and not a ranking of one
backend over another: several independent placements, on different
backends, from different people, coexist side by side, and none is ever
preferred.

> **A placement is a locator, not evidence of history.** A Bitcoin anchor
> recording a hash proves nothing about whether the bytes can still be
> fetched anywhere; a storage backend serving the bytes proves nothing
> about when the claim was first made. The two answer genuinely different
> questions, on purpose — see [External Evidence](#external-evidence)
> above for the first.

### Creating a placement

If this device has at least one storage backend configured — this build
always ships **Local** (this device's own storage) and **IPFS** (a real
IPFS node's HTTP API, expected at `http://127.0.0.1:5001`) — you'll see a
card per backend:

- **Create Local Placement** / **Create Ipfs Placement** — takes the bytes
  this device already holds for this publication and hands them to that
  backend. Clicking it always produces one of two honest outcomes:
  - **Placement created** — the backend accepted the bytes, and a new
    signed placement immediately appears in the list below.
  - **No placement was created** — the backend couldn't currently be
    reached (for **IPFS**, this is what you'll see unless a real IPFS node
    is actually running and reachable at that address), or this device
    has no local content for this publication to place at all.
- Clicking again after a success offers **Create Another … Placement** — a
  second, fully independent placement, never a replacement for the first.

The strongest thing this ever tells you is *"a snapshot placement was
recorded for `<storage>`."* Never "decentralized," "permanent," or
"available everywhere" — a created placement only means a storage backend
accepted these bytes just now.

> **Creating an IPFS placement needs your own IPFS node; resolving one
> doesn't.** **Create Ipfs Placement** always talks to a real IPFS node's
> HTTP API on this device (expected at `http://127.0.0.1:5001`) — without
> one running, you'll see **No placement was created**. **Resolve
> Snapshot** and **Materialize Snapshot**, just below, are different: they
> reach a public IPFS gateway (`https://ipfs.io` by default) instead,
> whether or not you have a node of your own running. That means you can
> resolve and materialize an `ipfs` placement someone *else* created —
> theirs or a peer's — without ever installing or running IPFS software
> yourself; only creating a brand-new IPFS placement still requires it.

### The Snapshot Placements list

```
Snapshot Placements

3 placements known                              [Show Placements]
```

Click **Show Placements** to see every placement known for this
publication — one you created, one a connected peer sent you, or one that
arrived bundled inside an imported Blueprint Package (see
[The Editor](02-TheEditor.md#structures-composing-forking-and-your-personal-library)
for exporting/importing blueprints). Each card shows:

| Field | Meaning |
|---|---|
| **Locator** | Where the storage backend says to find the bytes — an opaque string this app never tries to parse or improve on. |
| **Placed** | The *claimed* placement time — claimed, because nobody has resolved it yet unless you ask. |
| **Publication** / **Content hash** | Exactly what this placement's signature binds together. |
| **Placed by** | The identity that signed this placement. |

And, kept deliberately separate, up to three buttons:

- **Inspect Placement** — a purely local read of the placement's own
  claimed fields, plus, for a recognized backend like IPFS, a followable
  gateway link. Never touches the network, never checks whether the bytes
  are actually still there.
- **Resolve Snapshot** (or **Resolve Again**) — the one action that
  actually reaches out to the named storage backend, right now, and
  reports what it currently finds. This only ever *observes* whether the
  bytes are retrievable — it never writes anything to this device's own
  storage.
- **Materialize Snapshot** (or **Materialize Again**) — a third, separate
  action that runs the identical resolution **Resolve Snapshot** does and,
  only if it succeeds, actually writes the retrieved bytes into this
  device's own storage. This is the bridge between "I know where this
  could be retrieved from" (Resolve) and "I now possess it" (see
  [Local Snapshot](#local-snapshot) above). Choosing which placement to
  materialize from is always your own explicit click on one specific
  card — this page never picks a "best" placement or tries a second one
  automatically if the first fails. Outcomes:

  | Badge | Meaning |
  |---|---|
  | **Materialized** | The backend was reached, served matching bytes, and they're now stored on this device. |
  | **Already available** | This device already had matching bytes — never a failure. |
  | **Not available right now** | The backend couldn't be reached, or doesn't currently have the bytes. |
  | **Rejected** | The backend answered with bytes that didn't match the placement's claimed hash. |
  | **Invalid placement** | The placement record itself is malformed, or wasn't genuinely signed. |

### Resolution outcomes

| Badge | Meaning |
|---|---|
| **Content available** | The backend was reached and served bytes that match this placement's content hash. |
| **No storage backend configured** | This device has no backend registered for this placement's storage type. |
| **Content unavailable** | The backend was reached, but it doesn't currently have the bytes. |
| **Retrieved content does not match this placement** | The backend answered, but with the wrong bytes — a definite finding, not a maybe. |
| **Invalid placement** / **Invalid signature** | The placement record itself is malformed, or wasn't genuinely signed. |

Resolving a placement never rewrites the placement itself, and the result
is never shared with anyone or written back to the catalog — it lives only
on this page, for as long as it stays open. Two different people can hold
the byte-identical, identically signed placement and get two entirely
different, entirely honest resolution outcomes (say, because only one of
them has an IPFS node running) — neither one is wrong.

If a placement resolved successfully earlier in this visit but a later
check comes back unavailable, you'll see one extra line: *"This snapshot
was resolved successfully earlier; it is currently unavailable."* Exactly
like the equivalent note for evidence above, it's never downgraded to
"invalid" or "corrupted" — a store being temporarily unreachable doesn't
erase what you already confirmed — and it never appears after a **Retrieved
content does not match this placement** finding, which stays its own
definite result regardless of any earlier success.

### Local Knowledge

Expand **Inspect Placement** and, below the placement's own claimed
fields, you may see a separate **Local Knowledge** section — not "what
does this placement claim," but "how did *this device* come to know about
it":

| Field | Meaning |
|---|---|
| **Acquisition** | *Learned locally* (you created it), *Learned via package import* (it arrived bundled in a package you imported), or *Learned via peer exchange* (a connected peer sent it to you). |
| **First seen by this replica** | When this device first learned the claim — never reset by learning it again some other way later. |

Just like the equivalent section for external evidence, this is
bookkeeping about your own device's history, nothing more — never a
peer's name, never a hint about which placement to trust more.

### Placement relationships

When more than one placement is known and the list is expanded, a
**Placement relationships** card appears above the per-placement list:

```
Placement relationships

3 known placements · 2 storage backends · 3 distinct locations

  a1b2c3d4e6…f9a0  2 placements      b3c4d5e6f7…a1b2  1 placement

Content binding: AGREEMENT
```

It summarizes how the whole known set relates to *itself* — how many
distinct storage backends and physical locations are represented, and
whether every placement agrees on the content hash (**AGREEMENT**) or not
(**CONFLICT**, shown with a warning). Exactly like **Content binding** for
external evidence, a bigger group is never styled, ordered, or worded as
more likely correct — and unlike that comparison, this one is never
affected by whether you've actually resolved any of the placements; it's
derived purely from the claims themselves, every time.

## IPFS Publishing

Every publication card also has its own **IPFS Publishing** section,
directly below Snapshot Placements — a different way of getting a
publication's content onto IPFS than **Create Ipfs Placement** above.

```
IPFS Publishing

Local Kubo can resolve and publish. A remote gateway can only resolve.
Remote pinning, configured below, can only publish.

Remote pinning
Endpoint: not configured
Credential: not configured

[Configure Remote Publishing]
```

A **snapshot placement** (above) is a signed, cataloged claim that gets
stored, exchanged with peers, and re-inspected later. A **remote
publish** here is a different kind of record: it's one explicit call to a
pinning provider you configure yourself, and the result is shown only for
as long as this page stays open (see
[What survives a reload](#what-survives-a-reload)) — though every
successful publish and every content-retrieval check against a history
entry is *also* written, quietly, into the same durable
[Publication Observation Archive](#the-publication-observation-archive)
every Bitcoin and Base fact on this page writes into; that copy survives
a reload even though this card's own on-screen history does not. It
never touches the Snapshot Placement catalog, and never creates a signed
placement claim on its own — it's a plain record of "a provider accepted
these bytes," never a cataloged claim someone else can discover.

### Configuring a remote pinning provider

This build ships no commercial pinning provider by default — you supply
one yourself, generically, as an HTTP endpoint. Click **Configure Remote
Publishing** (or **Reconfigure Remote Publishing**, once you already
have one) to open a small form:

| Field | Meaning |
|---|---|
| **Endpoint** | The pinning service's own upload URL — required. |
| **Credential** (optional) | Sent as a bearer `Authorization` header. Never displayed back to you once saved — the card only ever shows **Credential: configured** or **not configured**, never the value itself. |
| **Request field** (optional) | The multipart field name the service expects the file under — defaults to `file`. |
| **Response field** (optional) | The field name the service returns the CID under — defaults to `cid`. |

Nothing you type here is saved anywhere — not to this device's storage,
not to a peer, not to the publication catalog. It lives only in this
page's own memory for as long as this browsing session and this card
stay open, and is discarded immediately by a page reload or by clicking
**Clear Configuration**. Click **Save Configuration** to actually commit
the draft; canceling the form (or never saving it) leaves whatever was
configured before, if anything, untouched. (Re)configuring always
retires whatever was previously published under the old configuration —
a freshly configured provider always starts unpublished again.

### Publishing

Once a provider is configured, a **Publish to Remote IPFS** button
appears (**Publish Again** after the first attempt). Clicking it always
starts from this device's own locally held bytes for the publication —
verified against the publication's own content hash first — and hands
them to the configured provider. Outcomes:

| Badge | Meaning |
|---|---|
| **Published** | The provider accepted the bytes and returned a CID. This is an observation of what the provider just said, not a promise it will still be retrievable later, and not a cataloged Snapshot Placement. |
| **Publish rejected** | The provider reached a definite no — an invalid or expired credential, a malformed request, or a quota/size limit. Retrying the identical request isn't expected to succeed; the configuration has to change first. |
| **Publish unavailable** | The provider couldn't currently be reached — an unreachable host, a timeout, or a server error. Retrying later, with **Publish Again**, may succeed. |
| **Publish failed** | The attempt couldn't be completed for some other reason, including a local integrity check failing before the provider was ever contacted, or a provider response this device couldn't make sense of. |

A **Published** result shows the content hash, the IPFS locator
(`ipfs://<cid>`), the provider endpoint, and when it happened. As with
every other outcome on this page, none of this is ever worded as
"verified," "trusted," "safe," "permanent," or "guaranteed" — only that
the provider accepted these particular bytes just now.

### Verifying what was published

Once you've published successfully at least once, a separate **Content
retrieval** box appears with a **Verify IPFS Content** button (**Verify
Again** afterward). This is an entirely independent check: it goes back
to the exact record the most recent successful publish produced, fetches
whatever bytes are presently retrievable at that locator through a
public IPFS gateway, and compares them against the recorded content
hash — never assumed just because publishing itself reported success.

| Badge | Meaning |
|---|---|
| **Retrieved content matches the recorded content hash** | The gateway served bytes, and they match. |
| **Retrieved content does not match the recorded content hash** | The gateway served bytes, and they don't — a real, definite finding. |
| **Content retrieval unavailable** | The gateway couldn't currently be reached, or doesn't currently have the bytes — not the same as a mismatch. |
| **Verification failed** | Something else prevented a clean answer. |

Nothing here checks automatically — not on publishing, not on opening
this section, not on a timer. You decide, every time, when it's worth
the round trip.

### Publication History

Publishing more than once — the same content again, or after
reconfiguring the provider — never overwrites what came before, and every
successful publish is quietly also recorded in the durable
[Publication Observation Archive](#the-publication-observation-archive) —
though, like the rest of this section, the **on-screen** history you're
about to expand here still resets on reload (see
[What survives a reload](#what-survives-a-reload)). Once at least one
publish has succeeded, a **Show Publication History** button
appears: click it to see every record this entry has ever published, in
order, oldest first, with each one's locator and time. Click a row to
**Inspect** it and see its own Locator, Content hash, Published at, and
(when known) Method — **Local IPFS node (Kubo)** or **Remote pinning
provider**, naming which of ForkBuild's two publish paths produced that
particular record; today, **Publish to Remote IPFS** above is the only
way this page ever adds to this history, so every record you see here
reads **Remote pinning provider**. This history alone is never a claim
about whether a record is "current" or "still good" — only what was
published, where, and when; see the next paragraph for whether it still
resolves.

Each history entry also has its **own** independent **Content
retrieval** box, exactly like the one described above for the most
recent publish, with its own **Verify Content** / **Verify Again**
button and its own **Latest: …** badge. Verifying one history entry
never affects another — checking whether the very first thing you ever
published to IPFS still resolves today has no bearing on whether a later
republish does, and vice versa. Every check for a given entry also joins
that entry's own **Show Verification History** log — a plain,
chronological list of every observation ever made for that one record,
oldest first, never rewritten by a later check:

```
11:03 — Retrieved content matches the recorded content hash
11:17 — Content retrieval unavailable
11:31 — Retrieved content matches the recorded content hash
```

All three of those stand side by side, unchanged — a later observation
never retroactively edits an earlier one, and there's no averaging,
scoring, or "current status" computed across them anywhere in this list.

## The Publication Observation Archive

Underneath [External Evidence](#external-evidence),
[The Bitcoin Anchor Pipeline](#the-bitcoin-anchor-pipeline),
[The Base Anchor Pipeline](#the-base-anchor-pipeline), and
[IPFS Publishing](#ipfs-publishing), this device keeps one shared,
page-level, durable record of facts across all three domains — IPFS,
Bitcoin, and Base alike. It never stores a wallet connection, a signing
capability, a private key, or a pinning-provider credential; only
publication identities and observations. A family of cards, further down
the Publications page, reads and manages this one archive directly.

### Observation Archive

```
Observation Archive                             [Persisted locally]

Publication and observation facts, kept durable across a page reload.

Publications: 3      Observations: 11

[Show Archive]   [Clear Archive]
```

Click **Show Archive** to expand an **Archived Observation Timeline** —
every IPFS publication and content-verification fact, every Bitcoin
broadcast/confirmation/content-proof fact, and every Base transaction
inclusion fact this device has ever recorded, chronologically
interleaved on one list, each entry naming its own domain (IPFS /
Bitcoin / Base), state, and (where relevant) locator, txid, or block
height. Nothing here is fetched, verified, or reconciled — expanding it
performs zero network operations, since every fact shown was already
recorded elsewhere on this page at the moment it happened.

**Clear Archive** is the *only* action anywhere on this page that
discards a durably recorded fact — publishing, verifying, broadcasting,
or observing anything elsewhere only ever *adds* to this archive,
automatically, never removes from it. It's disabled once the archive is
already empty.

### Historical Bitcoin Anchor Evidence

A companion card, reading the identical archive, organizes the same
underlying Bitcoin facts a different way — by their own explicit anchor
ID, regardless of whether that anchor's own evidence card happens to be
expanded anywhere else on the page right now:

```
Historical Bitcoin Anchor Evidence              [Persisted locally]

Anchors: 2

[Show Historical Anchors]
```

Click **Show Historical Anchors**, then a specific anchor ID, to see —
grouped under their own headings — that anchor's full **Broadcast
History**, **Confirmation History**, **Content-Proof History**, **Chain
Placement Comparisons**, and **Observation Consistency** findings, plus a
**Combined Evidence** summary restating the same five counts together.
Counts here describe how much this replica has recorded for that
anchor — never how complete, reliable, or trustworthy its evidence is,
and this is a correlation of independently recorded facts by explicit
anchor ID, never a verdict.

### Exporting, importing, and inspecting the archive

A **Publication Archive** card turns the archive into a portable JSON
file — publication identities and observations only, never a wallet
connection, key, or credential:

- **Export Archive** — read-only; produces a JSON blob shown in a text
  box plus a **Download Archive Export** link. Performs no network
  operation.
- **Import Archive** — opens a file picker and paste box. Importing is an
  explicit **replacement**, never a merge: after choosing a file or
  pasting JSON, a preview shows how many publications and observations
  the imported archive holds versus what's currently here, and only a
  further, explicit **Replace Current Archive** click actually discards
  the current archive and adopts the new one — this cannot be undone. A
  file that isn't a valid archive export is rejected outright, with
  nothing changed.

A separate **Inspect External Archive** card lets you look inside an
exported archive file *without* importing it — the archive above, and
everything derived from it, stays exactly as it is:

```
Inspect External Archive                        [Read-only]

[Inspect Archive]
```

Choosing a file or pasting JSON and expanding the result shows that
external archive's own schema version, per-domain fact counts (IPFS
publication/verification, Bitcoin broadcast/confirmation/content-proof/
publication-identity, Base transaction-inclusion/publication-identity),
local-vs-imported fact counts, import-event count, its own fingerprint
(see below), and — when present — the actual Bitcoin anchor IDs, IPFS
publication record indexes, and Base transaction hashes it holds. This
never touches, compares against, or replaces the current archive; there
is no "Replace" button on this card, and none ever appears here — that
action stays on **Import Archive** above, behind its own confirmation.

From an inspected external archive, two further, explicit actions are
available, each its own separate click:

- **Compare With Current Archive** — describes which facts and which
  provenance tags *differ* between the current archive and this external
  one, per domain (Same / Changed / Only in current / Only in external /
  Different provenance) — it never says which archive is correct or
  newer, only what's different.
- **Review Replacement** (shown once a comparison exists) — composes that
  difference with both archives' own publication/observation/local/
  imported/import-event counts and current vs. external fingerprints
  into one preview of exactly what replacing would change. Only the
  explicit **Replace Current Archive** button on this review — reusing
  the identical import mechanism above — ever actually changes the
  current archive; reviewing it, however far, changes nothing on its
  own. Replacing always restamps every fact from the external archive as
  freshly imported, so the resulting current fingerprint differs from
  the external archive's own fingerprint shown here, even though the
  underlying observations are now identical.

### Archive Provenance

An **Archive Provenance** card states, for every fact the archive holds,
only *where it entered* — never whether it's trustworthy:

```
Archive Provenance                    [Where facts entered this archive]

Local facts: 9      Imported facts: 2
```

**Local facts** were observed by this replica directly, through the
pages described above. **Imported facts** entered through a prior
**Replace Current Archive** import. Neither is styled or worded as more
trustworthy than the other. If any import has ever happened, an
**Archive Imports** list shows each one's timestamp, how many facts it
brought in, and the imported archive's own schema version.

### Archive Fingerprint

An **Archive Fingerprint** card computes a deterministic digest of every
fact and provenance tag recorded above:

```
Archive Fingerprint                                       [SHA-256]

Fingerprint: 9f8e2a1c…

[Copy Fingerprint]

Compare With Another Fingerprint
[ Paste a 64-character SHA-256 fingerprint ]     [Compare]
```

Two replicas whose fingerprints match hold byte-identical durable
archive contents — this states nothing about whether those contents are
authentic, verified, or correct, only that they're the same bytes. Paste
a fingerprint you obtained elsewhere (from a peer, say) and click
**Compare** to check it against this archive's own, computed fresh every
time — typing or pasting alone compares nothing. Outcomes:

| Result | Meaning |
|---|---|
| **MATCH** | The pasted fingerprint equals this archive's own digest. |
| **DIFFERENT** | It doesn't. |
| **INVALID_FINGERPRINT** | What was pasted isn't a well-formed 64-character SHA-256 fingerprint — nothing was compared. |

None of MATCH, DIFFERENT, or a difference/replacement review above ever
states which archive is newer, better, or more correct — only whether
the two are, or are not, the identical durable bytes.

## What survives a reload

Evidence you've cataloged — your own, a peer's, or something you
discovered — is stored on this device and is still there after you close
the tab and come back, exactly like everything else this app saves locally.
So does each anchor's **Local Knowledge** (see above) — how and when your
device first learned it stays exactly as it was the first time, even if the
identical evidence later reaches you a second way. **Verification results
are not** — they're only ever known for the current visit. Reload the page and every anchor you'd checked goes back to "Not yet
verified" until you check it again; nothing about that is a bug; it simply
reflects that "was this true a moment ago" and "is this device holding a
genuine claim" are two different facts, and only the second one is worth
keeping around.

**Snapshot Placements follow the identical rule.** A cataloged placement
and its own **Local Knowledge** are stored on this device and survive a
reload exactly like evidence does. **Resolution results do not** — every
placement you'd resolved goes back to "Not yet resolved" until you click
**Resolve Snapshot** again, for the same reason a verification result
resets: "was this retrievable a moment ago" and "is this device holding a
genuine claim" are two different facts, and only the second is worth
keeping around.

**Everything in Local Snapshot is session-only, with one exception.** A
**Check Local Snapshot** result, an **Import Snapshot** / **Materialize
Snapshot** / **Get Snapshot from Peer** attempt and its **Source:** note,
a **Peer Snapshot Possession** check, a possession comparison and its
**Observation History**, and the **Acquisition History** log all reset
the moment you reload — none of them is a claim anyone signed, so none of
them is worth remembering past this visit. The one thing that *does*
survive is the actual bytes: once a materialization action succeeds, the
content itself is written to this device's own storage and stays there —
only the on-screen record of how and when you got it disappears.

**Decentralization behaves differently again.** The evidence/placement
counts, their Agreement/Conflict relationship, and the "Publication: known
locally" line are never something you have to check first — they're
recomputed fresh from your own device's catalog every time the page loads,
so there's nothing to reset. Only an explicit **Synchronize with Peers**
result (the New claims / Already known breakdown) resets on reload,
exactly like a verification or resolution result would.

**[IPFS Publishing](#ipfs-publishing)'s own on-screen record is
session-only — but a quiet, durable copy of some of it is not.** Your
configured pinning provider (endpoint and credential alike), every
publish outcome shown on this card, the Publication History list itself,
and every entry's own Verification History list all live only in this
page's own memory and disappear the moment you reload — reconfigure the
provider and publish again to pick up where you left off. Underneath
that, though, every successful publish and every per-history-entry
verification is *also* written into the durable
[Publication Observation Archive](#the-publication-observation-archive),
which does survive a reload — you just won't see it again on this
particular card; open the Observation Archive card instead. The bytes
you published stay wherever the provider put them either way, exactly as
any real IPFS publish would.

**[The Bitcoin Anchor Pipeline](#the-bitcoin-anchor-pipeline) and
[The Base Anchor Pipeline](#the-base-anchor-pipeline) follow the identical
split, one chain each.** Your wallet connection, observed funding/account,
transaction plan, review, signature, finalized bytes, broadcast result, and
the on-screen confirmation/inclusion history list all disappear the moment
you reload — even after a real transaction has been broadcast to the real
network. Reconnect the wallet and observe funding/an account again to pick
up where you left off. Two things about each pipeline are durable,
though, and do survive: the **Bitcoin/Base Anchor Publications** record
minted the moment a transaction is finalized (see
[Bitcoin Anchor Publications](#bitcoin-anchor-publications-a-durable-identity-and-lifecycle)
and
[Base Anchor Publications](#base-anchor-publications-a-durable-identity-and-lifecycle)),
and every confirmation/inclusion observation either pipeline makes, which
is quietly archived into the same
[Publication Observation Archive](#the-publication-observation-archive)
by its own txid — visible again after a reload through that archive, the
publication's own Publication Lifecycle disclosure, or (for Bitcoin)
Historical Bitcoin Anchor Evidence, even though the pipeline's own
in-progress wizard screen has gone back to a blank slate.

**[Publication References](#publication-references) and [Publisher
Identity](#publisher-identity) are durable; everything they're read
through is recomputed fresh, so there's nothing to lose.** A recorded
reference or publisher association is stored on this device and survives
a reload exactly like a publication record does. The **Publication
Reference Graph**, **Achievements**, **Achievement Profile**, and all
three **Publisher Achievement …** cards never store anything of their
own — each one is recomputed, from scratch, from the archive's own
durable facts every time its card renders, so reloading the page changes
nothing about what they show; only which dropdown option or which badge
you'd expanded resets, the same as any other collapsed-by-default card
on this page.

**[The Publication Observation Archive](#the-publication-observation-archive)
itself is the one place on this page built to survive a reload with no
exception.** Every fact described as "also archived durably" above —
IPFS publications and per-history verifications, Bitcoin broadcast/
confirmation/content-proof observations (from both the evidence-card
Reconcile action and the Bitcoin Anchor Pipeline's own confirmation
step), Base transaction-inclusion observations, and both chains'
publication-identity records — lives here, persisted on this device,
until the moment you explicitly click **Clear Archive**: the only action
on this whole page that ever discards a durably recorded fact. Its own
export/import, provenance, and fingerprint history (archive import
events) are durable in exactly the same way.

## What's next?

Publications, their evidence, their snapshot placements, and the local
content behind them are entirely optional depth on top of everything else
ForkBuild does. If you came here from
[Publishing & Forking](04-PublishingAndForking.md), that's still where
sharing your actual builds happens — head back there, or to
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md) to connect
with more people whose publications, evidence, and placements you might
want to see.
