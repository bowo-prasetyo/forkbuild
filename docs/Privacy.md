# Privacy

<!-- languages -->
**English** · [Deutsch](user/de/Privacy.md) · [Español](user/es/Privacy.md) · [Bahasa Indonesia](user/id/Privacy.md) · [日本語](user/ja/Privacy.md)
<!-- /languages -->

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
- known peers, friends, the people you follow, blocks, chat history and
  queued messages (nobody is told you follow them, and nothing about a follow
  is ever sent);
- your avatar profile, settings (including whether World View plays sound,
  how loud, and in 3D or stereo, and the language you chose; when you
  haven't chosen one, ForkBuild reads the browser's preferred languages on
  the device and sends them nowhere), and a TURN server's username and credential
  if you enter one under **Network Settings**.

Clearing this site's data in the browser deletes all of it, and there is no
other copy and no way to recover it. Back it up first with **Your Data →
Back Up to a File**: the file holds all of the above except which identity
is logged in, encrypted with a passphrase you choose, and stays wherever you
put it. ForkBuild never uploads it. **Share Backup** hands the file to the
app you pick on your device. If you choose a backup folder, the browser
keeps ForkBuild's permission for it, and ForkBuild keeps the folder and, if
you ask, a key made from your backup passphrase that can only make backups
(never open them) in a separate `forkbuild-backup` IndexedDB database; when
and where you last backed up is kept with the rest of the data but left out
of backups.

## What other people can see

- **Anything you publish** is public: its content, title, description and
  license, and your identity's public key, which signs it. Once other people
  have a copy, you can't take it back.
- **Peers you connect to** learn your identity's public key, and your IP
  address (a direct connection needs it; a TURN relay hides it from the peer
  but not from the relay). Connected peers can see your avatar and presence
  according to its visibility setting, including which vehicle you are riding
  (its type and id, sent only while presence would be; where you left a
  vehicle is never sent), and your friends can message you.
  They also receive the Snapshot and Place Naming announcements your device
  has discovered, so they learn which World regions you have searched for
  place names (docs/AnnouncementIndex.md).
- **Peers, for Worlds you share.** **Share with Peers** in the Repository
  offers one of your published Worlds to everyone you're connected to now and
  to anyone who connects later, lobby strangers included: they receive its
  listing and can fetch the World itself from your device while you're
  connected. Your Friends' and Known Peers' devices fetch it on their own;
  anyone else's only when they click **Retrieve**. A World you only
  **Publish** is never sent to anyone.
- **Anyone, while you are in a public lobby.** Joining the public lobby
  (**Peers**) or a World's lobby (**Lobby** in World View) lists your
  identity's public key and the display name you choose, for anyone who
  opens that lobby. A World's lobby also tells them which World you have
  open. Your listing lasts until you leave, close the app (then up to 10
  minutes), or the card expires. It holds no network address, but anyone in
  the lobby can connect to you, and a stranger who connects is an ordinary
  connected peer: they learn your IP address, see your avatar and presence
  as your visibility settings allow, and **exchange Snapshot and Place Naming
  announcements and publication metadata with you, exactly as any connected
  peer does**, before you Remember or befriend them. Chat and voice still
  need a mutual friendship. **Block** in the lobby hides someone from your
  lobby lists and blocks them as it does on the Peers page (presence,
  profile, chat and friend requests).

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
| You make yourself discoverable, or look someone up, in **Peers** | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | your identity's public key and a connection offer, kept for at most 15 minutes; the identity you look up; when you connect to someone you found, your connection reply (it lists your network addresses), which only they can collect |
| You join, or look into, a public lobby | the same rendezvous server | your signed lobby card (public key, display name, which lobby), kept for at most 15 minutes and renewed while you stay; which lobby you look into |
| A peer connection starts | STUN servers (`stun.l.google.com`) | nothing but a request for your public IP address |
| You start a peer connection, if the rendezvous server offers a relay | the rendezvous server's `/turn-credentials`, then its TURN relay (Cloudflare) | a request for short-lived relay credentials, at most about once an hour; relayed traffic is end-to-end encrypted by WebRTC |
| The app is open and its tab visible (background announcement sync) | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`) | queries for ForkBuild's discovery tags: the shared Snapshot and Commentary tags, and the Place Naming regions and map cells you have visited |
| You distribute or discover publications over Nostr | Nostr relays (`relay.damus.io`) | signed announcements you publish; your queries |
| You store or fetch content on Arweave | an Arweave gateway (`arweave.net`) | the content you publish; what you fetch |
| You fetch content from IPFS | an IPFS gateway (`ipfs.io`), or your own IPFS node (`127.0.0.1:5001`) | what you fetch or add |
| You pin content with a remote pinning service (*experimental*) | the service you enter | the content, and the token you type for that one upload (never stored) |
| You store, announce or anchor on Steem, or discover Steem announcements (*experimental*) | Steem API nodes (`api.steemit.com`, then `api.justyy.com`); signing goes through the Steem Keychain extension | your Steem account name; what you post (announcements, stored content, anchors) is public on the chain for good, and edits leave the earlier version in its history |
| You distribute a Publication's Signed Claim on Steem (*experimental*) | the Steem image host (`steemitimages.com`) | a 320×200 picture of the build for the post's preview, signed with your Steem posting key |
| You open a shared link to a Publication (`#/view/…`) | the Steem node, Arweave gateway or IPFS gateway the link names, then the announcement substrates to find its build | which post, transaction or CID you open |
| You anchor or verify evidence on Bitcoin (*experimental*) | an Esplora API (`blockstream.info`) | the transaction you broadcast or look up |
| You verify evidence on Base (*experimental*) | a Base JSON-RPC endpoint (`mainnet.base.org`) | the transaction you look up |
| You connect a browser wallet (*experimental*) | the wallet extension you choose | whatever it asks you to approve |

ForkBuild never sends your private key, your passphrase, or your saved
documents to any of these servers.

**Relays are used only when needed.** A connection always tries a direct
path first, then one found through STUN, and falls back to the TURN relay
only when neither works. While you wait in a lobby, the offers your device
keeps ready never ask for relay credentials, so a lobby stay does not use up
the relay allowance the rendezvous server hands out each month; the person
who connects to you asks for one, if they need it.

## If you run your own copy

A deployment decides the defaults above: its rendezvous server
(`peer/RendezvousConfig.js`), whether that server offers a TURN relay
(`server/rendezvous-worker/README.md`), and the other defaults under
**Network Settings**. The default rendezvous server accepts only the
official site's origin, so a copy hosted elsewhere needs its own (see
[docs/Deployment.md](Deployment.md)). If you host ForkBuild for others,
update this page to name your servers.
