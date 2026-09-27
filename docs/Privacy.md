# Privacy

ForkBuild has no accounts and no analytics. It stores your work in your own
browser and talks to other computers only for the features that need them.
This page lists what it stores, and every server it can contact and when.

## What stays on your device

Everything below lives in this browser's storage (the `forkbuild` IndexedDB
database; browsers without IndexedDB use `localStorage`, under keys starting
with `forkbuild:`) and never leaves the device unless you publish, export or
send it:

- your documents, crash-recovery copies of unsaved changes, and saved
  structures;
- your identities: each one's public key, and its private key, encrypted with
  your passphrase unless you chose to create it without one;
- known peers, friends, blocks, chat history and queued messages;
- your avatar profile, settings, and a TURN server's username and credential
  if you enter one under **Network Settings**.

Clearing this site's data in the browser deletes all of it. Export any
identity you want to keep first (**My Identities → Export Identity**): there
is no other copy and no way to recover it.

## What other people can see

- **Anything you publish** is public: its content, title, description and
  license, and your identity's public key, which signs it. Once other people
  have a copy, you can't take it back.
- **Peers you connect to** learn your identity's public key, and your IP
  address (a direct connection needs it; a TURN relay hides it from the peer
  but not from the relay). Connected peers can see your avatar and presence
  according to its visibility setting, and your friends can message you.
  They also receive the Snapshot and Place Naming announcements your device
  has discovered, so they learn which World regions you have searched for
  place names (docs/AnnouncementIndex.md).

## Servers ForkBuild contacts

Every script, style and font comes from the site the app is served from
(see [docs/Deployment.md](Deployment.md)). One thing starts on its own: about
10 seconds after the app opens, and every few minutes while its tab is
visible, it reads new announcements from the Nostr relays, the Arweave
gateway and the Steem nodes configured under **Network Settings**
(docs/AnnouncementIndex.md). It reads only announcements (small pointers and
signed claims), never content, and publishes nothing. Everything else happens
only when you use the feature, and each server can be changed under
**Network Settings**. Each server sees your IP address and what you ask it for.

| When | Server (default) | What it receives |
| --- | --- | --- |
| You make yourself discoverable, or look someone up, in **Peers** | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | your identity's public key and a connection offer, kept for at most 15 minutes; the identity you look up |
| A peer connection starts | STUN servers (`stun.l.google.com`) | nothing but a request for your public IP address |
| A peer connection starts, if the rendezvous server offers a relay | the rendezvous server's `/turn-credentials`, then its TURN relay (Cloudflare) | a request for short-lived relay credentials; relayed traffic is end-to-end encrypted by WebRTC |
| The app is open and its tab visible (background announcement sync) | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`) | queries for ForkBuild's discovery tags: the shared Snapshot and Commentary tags, and the Place Naming regions and map cells you have visited |
| You distribute or discover publications over Nostr (*experimental*) | Nostr relays (`relay.damus.io`) | signed announcements you publish; your queries |
| You store or fetch content on Arweave (*experimental*) | an Arweave gateway (`arweave.net`) | the content you publish; what you fetch |
| You fetch content from IPFS (*experimental*) | an IPFS gateway (`ipfs.io`), or your own IPFS node (`127.0.0.1:5001`) | what you fetch or add |
| You pin content with a remote pinning service (*experimental*) | the service you enter | the content, and the token you type for that one upload (never stored) |
| You anchor or verify evidence on Bitcoin (*experimental*) | an Esplora API (`blockstream.info`) | the transaction you broadcast or look up |
| You verify evidence on Base (*experimental*) | a Base JSON-RPC endpoint (`mainnet.base.org`) | the transaction you look up |
| You connect a browser wallet (*experimental*) | the wallet extension you choose | whatever it asks you to approve |

ForkBuild never sends your private key, your passphrase, or your saved
documents to any of these servers.

## If you run your own copy

A deployment decides the defaults above: its rendezvous server
(`peer/RendezvousConfig.js`), whether that server offers a TURN relay
(`server/rendezvous-worker/README.md`), and the other defaults under
**Network Settings**. The default rendezvous server accepts only the
official site's origin, so a copy hosted elsewhere needs its own (see
[docs/Deployment.md](Deployment.md)). If you host ForkBuild for others,
update this page to name your servers.
