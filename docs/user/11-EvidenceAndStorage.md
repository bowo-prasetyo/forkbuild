# 11 — Evidence & Storage

> **Experimental in ForkBuild 1.0.** Everything here may change or be
> removed in a later version, and what it produces may not carry over.

Every card on the **Publications** page (see
[Publications & External Evidence](09-PublicationsAndEvidence.md)) has
sections for proving *when* a publication existed and for putting its
content somewhere others can fetch it:

- **[External Evidence](#external-evidence)** — records on Bitcoin, Base,
  Arweave or Steem that a publication's content hash existed at a certain
  time.
- **[The Bitcoin Anchor Pipeline](#the-bitcoin-anchor-pipeline)** and
  **[The Base Anchor Pipeline](#the-base-anchor-pipeline)** — step-by-step
  flows that use your own wallet to write a real transaction.
- **[Snapshot Placements](#snapshot-placements)** — signed pointers to
  where the content can be fetched: IPFS, Arweave or this device.
- **[IPFS Publishing](#ipfs-publishing)** — uploading to a remote pinning
  service.
- **[Steem](#steem)** — posting, storing, and sharing links on Steem.

Evidence and placements answer different questions. An anchor shows a hash
was recorded at some time; it says nothing about whether the bytes can
still be fetched. A placement says where the bytes can be fetched; it says
nothing about when the claim was first made.

## External Evidence

An anchor listed here only means this device holds a validly signed record
saying "this was recorded externally." Whether the recording really
happened is checked only when you click **Verify Evidence**. Nothing on the
page verifies automatically: not on load, not when evidence arrives, not
when you expand the list.

### Creating evidence

In a publication card's **Distribution** section, the **Proof / Anchoring**
block has a card per kind of evidence this device can create, each with its
own button: **Create Bitcoin Anchor**, **Create Arweave Anchor** and
**Create Steem Anchor**. Each records the publication's content hash in a
transaction on that network, with one of three outcomes:

| Outcome | Meaning |
|---|---|
| **Anchor created** | It worked. The new anchor appears in the list, not yet verified. |
| **Recording rejected** | The network was reached and refused. |
| **No anchor was created** | The network couldn't be reached, or this device can't sign for it. |

- **Create Bitcoin Anchor** always ends in **No anchor was created**: no
  wallet sits behind this button. Use
  [The Bitcoin Anchor Pipeline](#the-bitcoin-anchor-pipeline) instead.
- **Create Arweave Anchor** needs an Arweave wallet extension, such as
  Wander.
- **Create Steem Anchor** needs the Steem Keychain extension, and your
  Steem account set under
  [Network Settings → Steem](10-NetworkSettings.md#steem).

A publication made before content hashes became SHA-256 is never anchored,
by these buttons, the Bitcoin or Base steps, or **Anchor Several
Publications**: nobody else can check content against its old hash, so a
record of it would prove nothing. You get **Recording rejected** (or, for
Bitcoin and Base, a failed transaction step) saying to publish it again,
before any wallet is asked. The same goes for placements, which end in **No
placement was created**.

After a success, the button reads **Create Another … Anchor**, which makes
a second, independent anchor. Base anchors are made differently; see
[Creating a Base anchor in one step](#creating-a-base-anchor-in-one-step).

**Steem anchors are weaker than Bitcoin ones.** They cost no fee, only
Resource Credits (which refill), and the block is final about a minute
later. Until then the card reads **Waiting for finality**, then **Anchored**
(or, rarely, **Not anchored** if the chain dropped it: create it again).
**Verify Evidence** reports **Verification unavailable** during that first
minute, and afterwards says when, and by which witness, the block was
recorded. **Inspect Evidence** shows the block's time straight away, from a
copy of the signed block header your device checks offline. A Steem block is
signed by about 21 witnesses elected by stake, not secured by proof of work,
so enough of them together could rewrite history; the card says "Attested
by Steem witnesses". Use a Steem anchor as quick, free evidence alongside a
Bitcoin one, not instead of it.

**Anchoring several publications at once on Steem.** Under **Wallet, Archive
& Publisher Tools → Blockchain Anchoring**, **Anchor Several Publications on
Steem** lists your cataloged publications. Tick the ones you want (or
**Select Unanchored**) and click **Anchor N Publications on Steem**. One
Keychain approval anchors up to 64. Each publication still gets its own
anchor, verified on its own.

### Anchoring on a preferred provider

The **Proof / Anchoring** block also has a **Configure** link and a
**Use Preferred Provider** button. **Configure** opens
[Proof / Anchoring Provider](10-NetworkSettings.md#proof--anchoring-provider),
where you choose a default. **Use Preferred Provider** then anchors there
without asking, with the same outcomes as the buttons above. It reads
**Creating…** while it works and shows the new anchor's transaction and
content hash when done. Saving a preference changes neither the explicit
buttons nor existing anchors.

### Discover from Peers

Connected peers only pass on evidence created or re-announced while you're
connected. **Discover from Peers** fills the gap: it asks each connected
peer, one at a time, for every anchor they know for this publication,
including ones they learned from others. Nothing else on the page contacts a
peer.

| Message | Meaning |
|---|---|
| *N new evidence claims discovered from peers.* | They're now in the list below. |
| *No new evidence claims discovered from peers.* | These peers had nothing new. It doesn't mean no evidence exists. |
| *No authenticated peer was available to ask.* | Connect to a peer first (see [Peer Connections & Friends](07-PeerConnectionsAndFriends.md)). |
| *The requested peer discovery operation could not complete.* | Something failed locally before any peer was asked. |

Discovered anchors arrive unverified, your earlier verification results are
kept, and the same anchor is never added twice.

### The evidence list

On the card's **Decentralization & Evidence** tab, **External Evidence**
shows how many anchors are known and offers **Discover from Peers** (above).
**Show Evidence** lists every anchor known for the publication, side by
side, even ones that disagree. With more than one anchor, a **Content
binding** summary comes first, counting anchors per content hash, and warns
when they claim different hashes. It doesn't say which one is right.

Each anchor shows:

| Field | Meaning |
|---|---|
| **Locator** | Where the external system says to find the recording. |
| **Recorded** | The claimed recording time (claimed until you verify). |
| **Publication / Content hash** | What this anchor's signature binds together. |
| **Attested by** | The identity that signed the anchor. |

- **Verify Evidence** (then **Verify Again**) checks with the external
  system now; see [Verification outcomes](#verification-outcomes).
- **Inspect Evidence** shows the raw claim: the exact time, the locator,
  and for Bitcoin a block-explorer link and the raw proof. It reads only
  what's on your device. At the bottom, **Local Knowledge** says how this
  device learned the anchor: **Acquisition** (*Learned locally*, *Learned
  via package import* or *Learned via peer exchange*) and **First seen by
  this replica**. It never names the peer and isn't a trust signal.

### Verification outcomes

| Label | Meaning |
|---|---|
| **Independently verified** | The external system confirms exactly what was claimed. |
| **Proof not independently verified** | Genuinely signed, but this device can't check this kind of anchor externally. |
| **Verification unavailable** | The external system couldn't be reached. This isn't the same as invalid. |
| **Invalid evidence** / **Invalid signature** | The record is malformed or wasn't genuinely signed. |
| **Content mismatch** | The anchor doesn't match this publication. |
| **Invalid external proof** | The external system says the claim is false. |

If an anchor was verified earlier in this visit and a later check can't
reach the network, it keeps a note: "This evidence was independently
verified earlier; verification is currently unavailable."

Base anchors, whether created here or received, are verified with the same
**Verify Evidence** button.

### Bitcoin anchor reconciliation

A Bitcoin anchor's card also has a **Bitcoin Anchor** section. **Reconcile**
(then **Reconcile Again**) asks two separate questions and shows both
answers:

| Confirmation | Meaning |
|---|---|
| **Transaction confirmed** | Mined; shows block height, block hash and confirmations. |
| **Transaction not confirmed** | Not found, or not mined yet (the two aren't told apart). |
| **Confirmation status unavailable** | Couldn't be checked. |

| Content proof | Meaning |
|---|---|
| **Hash matches OP_RETURN** | The transaction carries the claimed content hash. |
| **Hash does not match OP_RETURN** | It doesn't, or the proof is malformed. |
| **Content proof unavailable** | Couldn't be checked. |

A confirmed transaction whose OP_RETURN doesn't match is shown as it is.
Each reconciliation's confirmation is added to **Show Confirmation
History**, oldest first; content proof shows only the latest result.

## The Bitcoin Anchor Pipeline

A step-by-step flow that uses your own Bitcoin wallet to write a
publication's content hash into a real transaction. Each step is its own
click.

> **This spends real bitcoin on Bitcoin mainnet.** From **Create Transaction
> Plan** on, it works with your wallet's real funds, and **Broadcast
> Transaction** sends a real transaction. There is no test mode.

All of its page-wide panels are under **Wallet, Archive & Publisher Tools →
Blockchain Anchoring**, the folded panel at the top of the Publications
page; the per-publication steps are on each publication's card.

### What you'll need

- The **UniSat** browser extension (`window.unisat`); no other Bitcoin
  wallet is supported yet.
- An account holding spendable bitcoin at a **native SegWit** address
  (starting `bc1q…`). Funding at Taproot (`bc1p…`) or legacy (`1…`, `3…`)
  addresses can be observed but not signed; review reports it as not
  reviewable.
- A publication on your Publications page; the transaction anchors its
  content hash.

### Connecting a wallet

Click **Connect Bitcoin Wallet** on the **Bitcoin Wallet** card and approve
the connection in the extension. ForkBuild never sees your keys, seed
phrase or password; it gets your address, network, and a signing
capability while connected.

| State | Meaning |
|---|---|
| **Connected** | Shows the **Account** and **Network**. |
| **Disconnected** | Not connected yet, or you declined. |
| **Wallet unavailable** | No extension, it's locked, or it can't be reached. |

The connection is used everywhere on the page. **Disconnect** drops it, and
a reload forgets it. A wallet on a network other than mainnet is reported
as a mismatch; ForkBuild never switches networks for you.

### Observing funding

Once connected, the **Bitcoin Funding** card appears. **Observe Wallet
Funding** (then **Refresh Funding**) reads what the account can spend right
now. It spends and reserves nothing, and doesn't refresh by itself.

| State | Meaning |
|---|---|
| **Funding observed** | Number of UTXOs (**Show Funding Inputs** lists them), their total, the script type, and the change address (always your own account). |
| **Unsupported address format** | An address type without fee support yet, such as legacy `3…`. |
| **Funding unavailable** | The funding source couldn't be reached. |

If you reconnect on another network afterwards, a warning says the
observation is stale.

### Building a transaction plan

On the publication card's **Decentralization & Evidence** tab, **Bitcoin
Anchor Transaction → Create Transaction Plan** is enabled once you've observed funding. It plans against
the latest observation, choosing UTXOs largest first, and computes the fee.

| State | Meaning |
|---|---|
| **Transaction plan constructed** | Network, content hash, inputs, fee, change, total input, the full input and output list, and when funding was observed and the plan built. |
| **Unable to construct transaction** | Usually, the funding can't cover the fee. |

A new plan replaces anything reviewed, signed or broadcast before it.

### Reviewing and signing

A plan fills the **Review Bitcoin Anchor Transaction** panel at once:
network, content hash, fee, change, total input, inputs and outputs, and
whether your wallet's network matches this transaction. **Sign Reviewed
Transaction** (enabled when a matching wallet is connected) asks the wallet
to sign. ForkBuild first checks that what's being signed is still exactly
what you reviewed; if not, the wallet isn't asked.

| State | Meaning |
|---|---|
| **Wallet returned a signed PSBT** | The response carries signing material for this transaction. It isn't verified yet; that's the next step. |
| **Signing declined** | You or the wallet declined. |
| **Wallet unavailable** | No wallet connected, or it can't be reached. |
| **Signing failed** | The wallet returned something unusable. |

### Verifying and finalizing

**Verify & Finalize Transaction** checks the signature cryptographically,
offline.

| State | Meaning |
|---|---|
| **Transaction finalized** | The signature is valid. Shows the transaction ID and, under **Raw transaction bytes**, the finalized transaction. |
| **Signature did not verify** | Wrong key, wrong signature, or signed over the wrong data. |
| **Finalization failed** | Some other unusable result. |

Only native SegWit (P2WPKH) inputs can be finalized. Finalizing also
records a [Bitcoin Anchor Publication](#bitcoin-anchor-publications).

### Broadcasting

**Broadcast Transaction** sends the finalized bytes, unchanged, to the
Bitcoin network.

| State | Meaning |
|---|---|
| **Transaction broadcasted** | Accepted by the network, but not mined yet. |
| **Transaction rejected** | Refused. |
| **Broadcast unavailable** | The network couldn't be reached. |

**Broadcast Again** resends the same bytes. Nothing retries by itself.

### Observing confirmation

After a broadcast, **Observe Confirmation** checks whether it has been
mined, with the same three results as
[Bitcoin anchor reconciliation](#bitcoin-anchor-reconciliation). Each check
is added to this broadcast's **Show Confirmation History**. That list is
cleared on reload, but every result is also kept in the
[Publication Observation Archive](12-ArchiveAndLeaderboards.md#the-publication-observation-archive).

### What the pipeline doesn't do

Even a confirmed transaction doesn't create an **External Evidence** entry,
so other people can't discover it as evidence. The review, signing and
broadcast screens are cleared by a new plan, a new signature, or a reload.
What's kept is the publication record made at finalization, and every
broadcast and confirmation result in the Observation Archive.

### Bitcoin Anchor Publications

The **Bitcoin Anchor Publications** card lists a record for every
transaction this device has finalized: `{ anchor ID, content hash, txid,
network, created at }`. It's made when **Verify & Finalize Transaction**
succeeds, whether or not the broadcast later works, and has no confirmed or
valid status of its own. **Show Publications** lists them. Each row has:

- **Inspect Observations** — counts of every broadcast, confirmation,
  content-proof, chain-placement and consistency fact the archive holds for
  that anchor ID.
- **Show Publication Lifecycle** — the same facts in time order, starting
  with **Publication record created**. A step with nothing recorded is
  simply absent. Opening it contacts no network.

## The Base Anchor Pipeline

The same idea on **Base**, an Ethereum-compatible network. It's separate
from Bitcoin: its own wallet, its own transaction (a self-transfer carrying
the content hash as data), its own terms.

> **This spends real funds on Base mainnet, or test funds on Base Sepolia —
> whichever network your wallet is on.** ForkBuild never chooses the
> network for you.

### What you'll need

- A browser wallet using the standard
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`
  interface, such as Coinbase Wallet or MetaMask.
- An account on chain ID **8453** (Base mainnet) or **84532** (Base
  Sepolia). Any other chain is reported as a mismatch.
- A publication on your Publications page.

### Connecting a wallet and observing an account

On the **Base Network** card (under **Wallet, Archive & Publisher Tools →
Blockchain Anchoring**), click **Connect Base Wallet** and approve it. The
states are **Connected**, **Disconnected** and **Wallet unavailable**, as
for Bitcoin; **Disconnect** drops it and a reload forgets it.

Then **Observe Base Account** (later **Refresh Observation**) reads the
account's chain and balance:

| Badge | Meaning |
|---|---|
| **Base account observed** | **Network**, **Chain ID**, **Account**, **Native balance** (in wei), and when observed. |
| **Connected network is not Base** | Shows the chain ID actually found. |
| **Base account unavailable** | The wallet couldn't be reached. |

### Building a transaction plan

On the publication card's **Decentralization & Evidence** tab, **Base
Publication Transaction → Create Base Transaction Plan** (enabled once you've observed an account) builds an
unsigned self-transfer from your account to itself, carrying the content
hash as its data.

| State | Meaning |
|---|---|
| **Transaction plan constructed** | Network, chain ID, content hash, from/to (the same address), value, nonce, gas limit, max fee and priority fee (in wei), the data, and when the account was observed and the plan built. |
| **Base network unavailable** | The account, fee or nonce couldn't be read. |
| **Unable to construct transaction** | Some other failure. |

A new plan replaces anything reviewed, signed or broadcast before it.

### Reviewing and signing

A plan fills the card's **Base Transaction Review** at once: from, to,
value, nonce, gas figures, content hash and transaction data. **Sign
Reviewed Transaction** asks the wallet to sign exactly that plan.

| State | Meaning |
|---|---|
| **Wallet returned a signed transaction** | Signed, but not verified yet. |
| **Signing declined** | You or the wallet declined. |
| **Wallet unavailable** | No wallet connected, or it can't be reached. |
| **Signing failed** | The wallet returned something unusable. |

### Creating a Base anchor in one step

In the same review card, **Create Base Anchor** signs, finalizes and
broadcasts the reviewed transaction in one click, then adds it to the
publication's evidence list. It's an alternative to the step-by-step
buttons, which still work.

| Badge | Meaning |
|---|---|
| **Anchor created** | Broadcast; the new anchor appears, expanded, in the [evidence list](#the-evidence-list). |
| **Recording rejected** | Signing, finalizing or broadcasting was refused. |
| **No anchor was created** | The wallet or network couldn't be reached. |

It then reads **Create Another Base Anchor**. Unlike **Create Bitcoin
Anchor**, this uses your wallet and sends a real transaction.

### Verifying, finalizing and broadcasting

**Verify & Finalize Transaction** checks the signature offline against the
reviewed plan and recovers the signer.

| State | Meaning |
|---|---|
| **Transaction finalized** | Valid; shows the recovered signer and transaction hash. |
| **Signature did not verify** | Wrong key, wrong signature, or wrong data. |
| **Finalization unavailable** / **Finalization failed** | Couldn't be checked, or some other unusable result. |

Finalizing records a [Base Anchor Publication](#base-anchor-publications).
Then **Broadcast Transaction** sends it: **Transaction broadcasted** (with
the **Transaction ID**; not yet included in a block), **Transaction
rejected**, or **Broadcast unavailable**. **Broadcast Again** resends the
same bytes.

### Observing inclusion

After a broadcast, the **Base Transaction Inclusion** section's **Observe
Transaction** checks whether it's in a block:

| Badge | Meaning |
|---|---|
| **Transaction included** | Base reports a receipt: block hash, block number, transaction index, confirmations. A chain reorganization is still possible and isn't detected. |
| **Transaction not included** | No receipt yet (pending and never-sent aren't told apart). |
| **Inclusion status unavailable** | Couldn't be checked. |

**Observe Transaction Again** adds to **Show Observation History**. That
list is cleared on reload, but every observation is also kept in the
[Publication Observation Archive](12-ArchiveAndLeaderboards.md#the-publication-observation-archive).

### Base Anchor Publications

Like Bitcoin's, the **Base Anchor Publications** card keeps a record per
finalized transaction: `{ content hash, txid, network, created at }`.
**Show Publications** lists them, and **Show Publication Lifecycle** shows
**Publication record created** followed by each **Inclusion observation
#N**. Base broadcast results aren't saved, so there's no broadcast entry.

Only **Create Base Anchor** adds an External Evidence entry; the
step-by-step flow never does.

## Snapshot Placements

A **snapshot placement** is a signed claim that a storage backend — **IPFS**,
**Arweave**, or this device's own **Local** storage — can serve the bytes
for a publication's content hash. It isn't a guarantee they'll be there
tomorrow. Several placements, on different backends and from different
people, can exist side by side; none is preferred.

### Creating a placement

In a publication card's **Distribution** section, the **Content** block has
a card per backend, with **Create Local Placement**, **Create IPFS
Placement** or **Create Arweave Placement**. Each takes the bytes this
device holds for the publication and hands them to that backend:

- **Placement created** — accepted; a new signed placement appears below.
- **No placement was created** — the backend couldn't be reached, or this
  device doesn't hold the content.

Then the button reads **Create Another … Placement**. Creating one only
means a backend accepted the bytes just now.

- **IPFS** needs your own IPFS node's API, by default at
  `http://127.0.0.1:5001` (change it under
  [Content Provider](10-NetworkSettings.md#content-provider)). Without a
  running node, you'll get **No placement was created**.
- **Arweave** needs a wallet extension, such as Wander.

You don't need a node to *read* IPFS placements: **Resolve Snapshot** and
**Materialize Snapshot** use public gateways (see
[IPFS Gateway](10-NetworkSettings.md#ipfs-gateway)), so you can fetch
content other people placed.

### Using a preferred provider

**Use Preferred Provider**, next to the Create buttons, creates a placement
on the backend saved under
[Content Provider](10-NetworkSettings.md#content-provider). Saving a
preference changes neither the explicit buttons nor existing placements.

| Label | Meaning |
|---|---|
| **Placement created** | Same as clicking that backend's button. |
| **No placement was created** | No preference is saved. |
| **Preferred provider not found** | The saved backend isn't registered on this device, or it's IPFS (Remote Pinning), which needs an endpoint typed in each time. |

### The Snapshot Placements list

On the card's **Placements & IPFS** tab, **Show Placements** lists every
placement known for the publication: ones
you made, ones a peer sent, and ones inside an imported Blueprint package.

| Field | Meaning |
|---|---|
| **Locator** | Where the backend says to find the bytes. |
| **Placed** | The claimed placement time. |
| **Publication** / **Content hash** | What the placement's signature binds together. |
| **Placed by** | The identity that signed it. |

Each has up to three buttons:

- **Inspect Placement** — the placement's own fields, and for IPFS a
  gateway link. It contacts no network. Below, **Local Knowledge** shows
  how this device learned it (*Learned locally*, *via package import* or
  *via peer exchange*) and when it was **First seen by this replica**.
- **Resolve Snapshot** (then **Resolve Again**) — checks with the backend
  whether the bytes are retrievable now, without storing them.
- **Materialize Snapshot** (then **Materialize Again**) — resolves and, if
  that works, stores the bytes on this device (see
  [Local Snapshot](09-PublicationsAndEvidence.md#local-snapshot)). You pick
  the placement; it never tries another one for you.

| Materialize result | Meaning |
|---|---|
| **Materialized** | Fetched, matched, and stored here. |
| **Already available** | This device already had matching bytes. |
| **Not available right now** | The backend couldn't be reached or doesn't have them. |
| **Rejected** | The bytes didn't match the placement's hash. |
| **Invalid placement** | The record is malformed or wasn't genuinely signed. |

### Resolution outcomes

| Badge | Meaning |
|---|---|
| **Content available** | The backend served bytes matching the content hash. |
| **No storage backend configured** | This device has no backend for this storage type. |
| **Content unavailable** | Reached, but it doesn't have the bytes now. |
| **Retrieved content does not match this placement** | The backend served the wrong bytes. |
| **Invalid placement** / **Invalid signature** | The record is malformed or wasn't genuinely signed. |

Results stay on this page for this visit and aren't shared. Two people can
get different results for the same placement (say, only one runs an IPFS
node). If a placement resolved earlier in the visit and later can't be
reached, it notes: "This snapshot was resolved successfully earlier; it is
currently unavailable." A mismatch is never softened this way.

### Placement relationships

With more than one placement, a **Placement relationships** card shows how
many backends and distinct locations there are, counts placements per
content hash, and reads **Content binding: AGREEMENT** or **CONFLICT** (with
a warning). It's based only on the claims, not on whether you've resolved
them, and a larger group isn't treated as more likely correct.

## IPFS Publishing

The **IPFS Publishing** section, below Snapshot Placements on the card's
**Placements & IPFS** tab, uploads the content to a pinning service you
choose. (As the section says: a local Kubo node can resolve and publish, a
remote gateway can only resolve, and remote pinning can only publish.)
Unlike a placement,
the result isn't a signed claim others can discover: it's a record that a
provider accepted these bytes. The on-screen results are cleared on reload,
but every successful publish and every verification is also kept in the
[Publication Observation Archive](12-ArchiveAndLeaderboards.md#the-publication-observation-archive).

### Configuring a remote pinning provider

ForkBuild ships with no pinning provider. Click **Configure Remote
Publishing** (**Reconfigure Remote Publishing** later):

| Field | Meaning |
|---|---|
| **Endpoint** | The service's upload URL. Required. |
| **Credential** (optional) | Sent as a bearer `Authorization` header. Never shown back; the card only says **configured** or **not configured**. |
| **Request field** (optional) | The form field for the file. Default `file`. |
| **Response field** (optional) | The response field holding the CID. Default `cid`. |

**Save Configuration** keeps it for this visit only; it's never stored, and
a reload or **Clear Configuration** discards it. Cancelling leaves the
previous configuration. Reconfiguring starts over, with nothing published
under the new provider.

### Publishing

**Publish to Remote IPFS** (then **Publish Again**) checks this device's copy
against the content hash and uploads it.

| Badge | Meaning |
|---|---|
| **Published** | Accepted; the provider returned a CID. |
| **Publish rejected** | Refused, for example a bad credential, malformed request, or quota. Change the configuration before retrying. |
| **Publish unavailable** | The provider couldn't be reached. Try again later. |
| **Publish failed** | Anything else, including a local integrity check failing first. |

A published result shows the content hash, locator (`ipfs://<cid>`),
endpoint and time. A **Nostr: Announced** / **Nostr: Not announced** badge
says whether the publish was also announced for Snapshot discovery, so
others can find it as they would a local-node publish. **Not announced**
means only the announcement failed.

### Verifying what was published

After a successful publish, **Content retrieval → Verify IPFS Content**
(then **Verify Again**) fetches the bytes through your
[IPFS gateways](10-NetworkSettings.md#ipfs-gateway) and compares them with
the recorded hash:

| Badge | Meaning |
|---|---|
| **Retrieved content matches the recorded content hash** | It matches. |
| **Retrieved content does not match the recorded content hash** | It doesn't. |
| **Content retrieval unavailable** | The gateway couldn't be reached or doesn't have it. Not a mismatch. |
| **Verification failed** | Something else went wrong. |

### Publication History

Publishing again never overwrites earlier records. **Show Publication
History** lists every publish, oldest first, with locator and time;
**Inspect** shows its locator, content hash, time and method (today always
**Remote pinning provider**). Each entry has its own **Verify Content**
button and **Show Verification History**, a time-ordered list of every
check for that record.

## Steem

*Experimental.* ForkBuild can announce, store and share over the Steem
blockchain. Announcements (Publications, Snapshots, place-name claims and
comments) are replies to monthly discovery threads such as
[`@forkbuild/forkbuild-snapshot-2026-09`](https://steemit.com/forkbuild/@forkbuild/forkbuild-snapshot-2026-09).
Reading needs no account. Whatever is found is verified like an
announcement from Nostr or Arweave; votes, payouts and reputation don't
affect it. Settings are under
[Network Settings → Steem](10-NetworkSettings.md#steem).

### Posting to Steem

Choose **Steem** in a Distribute dialog, on the Publications page, or next
to **Post Comment**, or make it your default under
[Announcement / Discovery Provider](10-NetworkSettings.md#announcement--discovery-provider).
You need the Steem Keychain extension holding your account's **posting**
key, and your account name saved on the Steem settings page. ForkBuild never
sees the key. Each post is a reply to this month's thread with payout
declined, and Keychain asks you to approve it. If this month's thread
doesn't exist yet, nothing is posted and you're told. A comment is always
saved on this device first, and its form warns you if the account or
Keychain is missing.

### Storing on Steem

Choose **Steem** as the storage in a Distribute dialog or on the
Publications page. The Snapshot is compressed and stored as replies to this
month's content thread (such as `@forkbuild/forkbuild-content-2026-10`),
with no pinning or upload fee. The data sits in each post's metadata; the
post text is a one-line note. Older posts with the data in the text still
load.

- **Size.** Up to about 2,500 bricks fit in one post. A larger build is one
  index post plus up to 20 posts of about 48 KB, up to about 30,000 bricks.
  Anything larger is refused before posting, with a suggestion to use IPFS
  or Arweave.
- **Approving.** Keychain asks for each post, at least 4.5 seconds apart,
  and the dialog shows progress ("Storing on Steem: 3 of 9 posts made").
- **Resource Credits.** Posting uses your account's Resource Credits, which
  refill over five days. If you don't have enough, nothing is posted and
  you're told how much is needed. Progress shows the share used.
- **If it stops part-way** (you decline, run out of credits, or lose the
  connection), you're told how many posts are stored. Distribute again with
  the same account and only the missing posts are made. Nothing is
  announced until every post is stored.

The Signed Claim can be stored on Steem too: one more post (and approval)
in the same thread, after the Snapshot when you distribute both. It's read
back and signature-checked like one from Arweave.

### Sharing a link

**On Steem.** A Signed Claim's post shows a picture of your build, its
title, your name and description, and a "See it in 3D" link. Keychain asks
you to approve signing the picture, which is uploaded to Steemit's image
host at no Resource Credit cost; if you decline or it can't be made, the
post goes out without it. Mentions, tags and links in your title or
description are shown as plain text, so they notify no one. Anyone who
clicks the link, even without using ForkBuild before, lands in World View on
your build, after ForkBuild checks the Publication's signature and that the
build matches its announcement (if not, the page says why). The build is
then kept in their browser. The link needs the build announced as well as
stored, which Distribute does.

**Anywhere.** Once a Signed Claim is stored on Steem, Arweave or IPFS,
**Share…** and **Copy link** appear under it: in World View's publication
panel, in the Distribute dialog's result, and on the Publications page.
**Share…** opens your device's share sheet where available; **Copy link**
copies the link, also shown for copying by hand. The link opens on any
device, as long as the Snapshot has been distributed too. The `#/world/…`
address in your address bar only works in your own browser.

- **Arweave:** right after distributing, the link can take a few minutes
  to open while the upload reaches the gateways. The page offers **Try
  again**.
- **IPFS on your own node:** it opens only while your node is online and
  reachable from public gateways. A pinning service or Arweave keeps it
  available when your computer is off.
- Friends read through the gateways in their own Network Settings. An IPFS
  gateway gets up to 30 seconds to find the claim.
