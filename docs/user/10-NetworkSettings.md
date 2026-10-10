# 10 — Network Settings

<!-- languages -->
**English** · [Deutsch](de/10-NetworkSettings.md) · [Español](es/10-NetworkSettings.md) · [Français](fr/10-NetworkSettings.md) · [Bahasa Indonesia](id/10-NetworkSettings.md) · [日本語](ja/10-NetworkSettings.md) · [한국어](ko/10-NetworkSettings.md) · [Português (Brasil)](pt-BR/10-NetworkSettings.md)
<!-- /languages -->

**Network Settings**, in the top bar, links every page that controls which
servers ForkBuild talks to. Most people never need to change anything
here: the defaults work out of the box. Come here when a server is down,
when you run your own, or to choose where your publications are stored and
announced.

For what each server learns about you, see [Privacy](../Privacy.md).

## The pages

| Page | Route | What it sets |
|---|---|---|
| **Content Provider** | `/settings/content-provider` | Where **Store on …** and **Use Preferred Provider** store new content, and which IPFS node it goes to — see [below](#content-provider) |
| **Announcement / Discovery Provider** | `/settings/announcement-discovery-provider` | Where your announcements go by default: Nostr, Arweave, Steem or Blurt — see [below](#announcement--discovery-provider) |
| **Proof / Anchoring Provider** | `/settings/anchor-provider` | Where **Anchor on …** anchors — see [below](#proof--anchoring-provider) |
| **Arweave Gateway** | `/settings/arweave-gateway` | Gateways for reading Arweave content — see [below](#arweave-gateway) |
| **IPFS Gateway** | `/settings/ipfs-gateway` | Gateways for reading IPFS content — see [below](#ipfs-gateway) |
| **Bitcoin Endpoint** *(experimental)* | `/settings/bitcoin-esplora` | The service Bitcoin anchoring uses — see [below](#bitcoin-endpoint) |
| **Nostr Relays** | `/settings/nostr-relay` | Relays for publishing and discovery over Nostr — see [below](#nostr-relays) |
| **Steem** *(experimental)* | `/settings/steem` | Your Steem account, and where Steem is read from — see [below](#steem) |
| **Blurt** *(experimental)* | `/settings/blurt` | Your Blurt account, and where Blurt is read from — see [below](#blurt) |
| **STUN Servers** / **TURN Server** | `/settings/stun`, `/settings/turn-server` | Help for peer connections — see [TURN](07-PeerConnectionsAndFriends.md#turn-relaying-peer-connections-that-cant-find-a-direct-path) |
| **Rendezvous Servers** | `/settings/rendezvous` | How peers find each other — see [Peer Connections & Friends](07-PeerConnectionsAndFriends.md) |

## Show experimental tools

At the top of the page, **Show experimental tools** lists the parts of
ForkBuild that are **Experimental**: the **Bitcoin Endpoint** page here,
and the **Wallet & Archive Tools** panel on the
[Publications page](09-PublicationsAndEvidence.md#the-publications-page). It is off until you turn it on, and is saved on
this device as soon as you change it. Nothing you need to build, publish or
share is hidden while it is off.

Below it, **Wallets** has a switch for each wallet ForkBuild can anchor
with: **Bitcoin wallet** and **Base wallet**. Each is off until you turn it
on, and is saved on this device. While one is off, the Publications page
neither offers that wallet's steps nor loads them, and Bitcoin isn't offered
as a [Proof / Anchoring Provider](#proof--anchoring-provider). Anchors
already made on Bitcoin or Base are still checked and shown either way.
Turning one off takes effect the next time the Publications page opens.

## How every page behaves

- **Reload after saving.** Changes take effect the next time the app loads
  (the Steem and Blurt accounts are the exceptions). An open World View or Editor
  keeps using the old settings until you reload.
- Each page has its own **Save**. A save that fails shows the reason and
  leaves the previous setting as it was; a successful one shows "Saved."
- Lists of choices are shown in alphabetical order.
- **Server lists come with defaults.** The Arweave Gateway, IPFS Gateway,
  Bitcoin Endpoint, Nostr Relays, Steem, Blurt, STUN and Rendezvous pages start
  with several free public servers, so things keep working when one is
  down. The page says whether it's "Using the default …" or "Using your
  saved …". With nothing saved, the text box holds the defaults, one per
  line, ready to edit. **Save** stays disabled until you change something,
  so you keep getting improved defaults from later versions. **Reset to
  Defaults** removes your list.
- **Validation checks format only.** Save rejects anything that isn't a
  well-formed URL of the right kind, but doesn't check that the server
  works; a wrong server shows up later as a failed read.
- **Defaults are third-party services.** Each one sees your IP address and
  what the app asks it for. Content read through a gateway is checked
  against its content hash, so a gateway can't swap in different bytes.

## Content Provider

Choose which storage **Store on …** (the first button in a publication's
**Content** block) and **Use Preferred Provider** create a Snapshot
Placement on (see
[Using a preferred provider](11-EvidenceAndStorage.md#using-a-preferred-provider)),
from the backends this device has registered, and click **Save**. **Local**
isn't offered, since every publication is already stored on this device.

**IPFS (Remote Pinning)** *(experimental)* is always offered. It uses the
service set up under **Remote Pinning Service**, below: with one set up,
**Store on IPFS (Remote Pinning)** and **Use Preferred Provider** place the
content there, as an ordinary IPFS placement; without one, they say none
is set up. Choosing it also pre-selects Remote Pinning as the storage in
every **Distribute** dialog.

A second section, **IPFS Node**, sets the node new IPFS placements are sent
to. The default is a local Kubo node at `http://127.0.0.1:5001`. Enter
another node's API URL and **Save**, or **Use Deployment Default** to go
back. It doesn't affect reading IPFS content, which uses the
[IPFS Gateway](#ipfs-gateway) list.

A third section, **Remote Pinning Service** *(experimental)*, sets the
pinning service IPFS (Remote Pinning) uploads to: its **Endpoint** and, if
the service needs them, the **Request field** for the file and the
**Response field** holding the CID. **Save** keeps these on this device.
The **Token** is kept only until you close or reload the page, and is never
saved; a service that needs one refuses uploads until you enter it. Every
**Distribute** dialog and the Publications page start on this service, and
you can still change it there. **Forget Service** removes it.

## Announcement / Discovery Provider

Choose **Arweave**, **Blurt** (experimental), **Nostr** or **Steem** (experimental) as the default
place your publications (Shared Worlds, Blueprint Attributions and
place-name claims), Snapshots and comments are announced. It's only a
default: every **Distribute** dialog, the Repository's per-card
Distribution picker and the network picker next to **Post Comment** start
on it, and you can switch them for one action.
Finding other people's content always searches all of them.

A second section, **Comments**, gives comments a default of their own.
**Same as the Announcement / Discovery provider above**, the default, keeps
them on the choice above. Choose a network instead, or **Local & peers
only** to keep comments off every network, which needs no network account.
Every comment form starts on it, and you can still switch a comment beside
**Post Comment**.

## Proof / Anchoring Provider

Choose where **Anchor on …** (the first button in a
publication's **Proof / Anchoring** block) creates external evidence: **Arweave**, **Bitcoin** *(experimental)*, **Blurt** *(experimental)* or **Steem** *(experimental)*, whichever this device has
registered. Base is never offered, because every Base anchor needs you to
review and sign a wallet transaction. With Bitcoin chosen there's no
**Anchor on …** button: the block shows every option and points to the
wallet steps; see
[The Bitcoin Anchor Pipeline](11-EvidenceAndStorage.md#the-bitcoin-anchor-pipeline)
for real Bitcoin anchors.

## Arweave Gateway

Gateways for reading Arweave content, one `http://` or `https://` URL per
line. The defaults are `https://arweave.net`, `https://ardrive.net` and
`https://permagate.io`.

They're tried in order: a read moves to the next gateway only if the
current one is unreachable or returns an error. Arweave content is
addressed by its transaction id, so every gateway returns the same bytes.

This list is used when retrieving a publication's material from a
decentralized source and when resolving or materializing an Arweave
Snapshot Placement. It doesn't change where your own content is uploaded.
Arweave anchors use the first gateway in the list to create and verify.

## IPFS Gateway

Gateways for reading IPFS content, one URL per line, tried in order like
Arweave's. The defaults are `https://ipfs.filebase.io`,
`https://gateway.pinata.cloud`, `https://ipfs.io`, `https://dweb.link` and
`https://4everland.io`.

This list is used when resolving or materializing an IPFS Snapshot
Placement, for **Verify IPFS Content**, and for opening shared links to
content on IPFS, and when the Repository and the weekly challenge read
builds found on the networks whose Signed Claim is on IPFS. It doesn't
change where your own content is pinned.

Some gateways, `https://ipfs.io` and `https://dweb.link` among them, refuse
requests from web pages for some content, or block them behind a bot check;
the defaults are run by different operators, so a read falls through to the
next. If **Verify** or **Resolve** keeps failing with "Failed to fetch" for
content you know is there, add your pinning provider's gateway at the top.
A list you saved before 2026-10-08 keeps its own order: **Reset to Defaults** brings
back the new defaults.

## Bitcoin Endpoint

*Experimental.* The Esplora-compatible API Bitcoin anchoring uses to
broadcast transactions, check confirmations, look up wallet funding and
verify an anchor's OP_RETURN proof. One `http://` or `https://` URL per
line; the defaults are `https://blockstream.info/api` and
`https://mempool.space/api`.

A lookup uses the first endpoint that answers. A broadcast moves to the
next endpoint only if the previous one was unreachable, never after one
rejected the transaction.

## Nostr Relays

Relays for everything ForkBuild publishes or discovers over Nostr:
publications (Shared Worlds, Blueprint Attributions and place-name
claims), Snapshots and comments. One `ws://` or `wss://` URL per line; the defaults are `wss://relay.damus.io`,
`wss://nos.lol` and `wss://relay.primal.net`. **Save** replaces the whole
list, and rejects it if any line isn't a valid URL.

Unlike gateways, relays aren't tried in order: announcements go to every
relay at once and discovery asks every relay, so each extra relay makes
your content findable by more people even while another is down. There's
no per-relay status here; a **Distribute** result lists one **Discovery**
row per relay.

## Steem

**Post to Steem from this device**, under **Posting**, is off on a new device. While it is off,
ForkBuild doesn't offer Steem when you publish, comment, name a place, store
a build or make an anchor, posts nothing there, and hides the account
field. A device that already had a Steem account saved starts with it on.
Builds and comments already on Steem are found and shown either way.

*Experimental.* Set **Your Steem account** under **Posting** (this applies
immediately, without a reload), needed to post or store on Steem — see
[Steem](11-EvidenceAndStorage.md#steem). Reading from Steem needs no
account. The rest of the page sets where Steem is read from:

- **API nodes**, one `https://` URL per line (defaults
  `https://api.steemit.com`, `https://api.justyy.com` and `https://steemd.steemworld.org`), tried in order.
- **Thread accounts**, one per line (default `forkbuild`): whose monthly
  discovery threads are read. Add another if a community runs its own
  threads.
- **First month to read** (default September 2026): ForkBuild reads every
  month from there to now, up to the last 36 months.

When no Steem node can be reached, **Check for new comments** and Snapshot
discovery name Steem as unavailable rather than reporting that nothing was
found.

## Blurt

**Post to Blurt from this device**, under **Posting**, is off on a new device. While it is off,
ForkBuild doesn't offer Blurt when you publish, comment, name a place, store
a build or make an anchor, posts nothing there, and hides the account
field. A device that already had a Blurt account saved starts with it on.
Builds and comments already on Blurt are found and shown either way.

*Experimental.* Set **Your Blurt account** under **Posting** (this applies
immediately, without a reload), needed to post, store or anchor on Blurt —
see [Blurt](11-EvidenceAndStorage.md#blurt). Reading from Blurt needs no
account. The rest of the page sets where Blurt is read from:

**API nodes**, one `https://` URL per line (defaults
`https://rpc.blurt.blog`, `https://rpc.beblurt.com` and `https://rpc.drakernoise.com`), tried in order.
ForkBuild finds posts through Nexus, Blurt's search index, which keeps
every post however old, and skips a node that doesn't offer it. When no
node offers Nexus, it falls back to Blurt's own tag list, which keeps a
post only until it pays out, after seven days, and finds older posts in
the histories of the accounts it has seen post under the tag on this
device. Even when Nexus answers, ForkBuild reads the tag list beside it,
in case Nexus leaves a post out; if it has, ForkBuild also reads that
account's history, so its older posts aren't missed either.

When no Blurt node can be reached, **Check for new comments** and Snapshot
discovery name Blurt as unavailable rather than reporting that nothing was
found.
