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
retrieved from, like an IPFS node; a **Local Snapshot** section that reports
what your own device already holds and lets you actually pull those bytes
in, from a placement, from a peer, or from a file someone hands you; and a
**Decentralization** overview that puts your evidence and placements side by
side. None of these are required by any other, and none are required to use
the rest of ForkBuild.

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
**External Evidence** section, and **Snapshot Placements** section — four
independent questions, none of which answer each other. See
[Local Snapshot](#local-snapshot),
[Decentralization](#decentralization-evidence-and-placements-at-a-glance),
and [Snapshot Placements](#snapshot-placements) below.

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

## What's next?

Publications, their evidence, their snapshot placements, and the local
content behind them are entirely optional depth on top of everything else
ForkBuild does. If you came here from
[Publishing & Forking](04-PublishingAndForking.md), that's still where
sharing your actual builds happens — head back there, or to
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md) to connect
with more people whose publications, evidence, and placements you might
want to see.
