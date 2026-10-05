# Privacy

<!-- languages -->
**English** · [Deutsch](user/de/Privacy.md) · [Español](user/es/Privacy.md) · [Français](user/fr/Privacy.md) · [Bahasa Indonesia](user/id/Privacy.md) · [日本語](user/ja/Privacy.md) · [한국어](user/ko/Privacy.md) · [Português (Brasil)](user/pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild has no accounts and does not track you. It stores your work in
your own browser and talks to other computers only for the features that
need them, plus one anonymous visitor count a day so its makers know roughly
how many people use it (see "Visitor count" below, and how to turn it off).
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
  if you enter one under **Network Settings**;
- whether this browser takes part in the daily visitor count, and the last
  day it did;
- other people's Publications this device has found and verified, from
  peers, links, World View or the Repository's search of the networks, and,
  for those found on the networks, where each one's signed record was read.
- the ids of Publications you unpublished on this device, so the Repository's
  search of the networks doesn't list copies you distributed earlier again.

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

## Visitor count

Once a day, the first time ForkBuild opens on this device that calendar day,
the official site (`https://bowo-prasetyo.github.io/forkbuild/`) loads one
tiny image from GoatCounter (`forkbuild.goatcounter.com`), a counter that
sets no cookies. That request is all it sends:

- **What GoatCounter receives:** your IP address and your browser's
  User-Agent, as with any web request, plus a fixed path (`/`) and a random
  number that stops the image being cached. No page, document, World,
  identity, referrer or anything ForkBuild stores is included, so it cannot
  tell what you do in the app, or even which page you opened.
- **What it keeps:** totals only: visitors per hour and per day, and which
  browsers, systems, countries and languages they came from, each counted
  separately so they can't be linked to each other. Its privacy policy
  (<https://www.goatcounter.com/help/privacy>) says it never stores IP
  addresses or the full User-Agent: it holds them in memory for up to 8
  hours, only to recognize a repeat visit, without cookies.
- **Anyone can see the totals** on the public dashboard,
  <https://forkbuild.goatcounter.com/>.

It is never sent:

- when your browser sends Global Privacy Control or Do Not Track;
- when you turn off **Your Data → Daily visitor count → Count this
  browser** (the choice is kept in this browser only);
- from any copy of ForkBuild served from somewhere other than the official
  site, including `localhost`.

The code is `core/VisitorCount.js`, `application/settings/CountDailyVisit.js`
and `ui/start.js`.

## Servers ForkBuild contacts

Every script, style and font comes from the site the app is served from
(see [docs/Deployment.md](Deployment.md)), apart from the visitor count's one
image a day described above. One more thing starts on its own: about
10 seconds after the app opens, and every few minutes while its tab is
visible, it reads new announcements from the Nostr relays, the Arweave
gateway, and the Steem and Blurt nodes configured under **Network Settings**
(docs/AnnouncementIndex.md). It reads only announcements (small pointers and
signed claims), never content, and publishes nothing. Everything else happens
only when you use the feature, and each server can be changed under
**Network Settings**. Each server sees your IP address and what you ask it for.

| When | Server (default) | What it receives |
| --- | --- | --- |
| The app opens on the official site, at most once a day (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with a fixed path, no referrer and no cookie |
| You make yourself discoverable, or look someone up, in **Peers** | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | your identity's public key and a connection offer, kept for at most 15 minutes; the identity you look up; when you connect to someone you found, your connection reply (it lists your network addresses), which only they can collect |
| You join, or look into, a public lobby | the same rendezvous server | your signed lobby card (public key, display name, which lobby), kept for at most 15 minutes and renewed while you stay; which lobby you look into |
| A peer connection starts | STUN servers (`stun.l.google.com`) | nothing but a request for your public IP address |
| You start a peer connection, if the rendezvous server offers a relay | the rendezvous server's `/turn-credentials`, then its TURN relay (Cloudflare) | a request for short-lived relay credentials, at most about once an hour; relayed traffic is end-to-end encrypted by WebRTC |
| The app is open and its tab visible (background announcement sync) | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`), Blurt nodes (`rpc.blurt.blog`) | queries for ForkBuild's discovery tags: the shared Snapshot and Commentary tags, and the Place Naming regions and map cells you have visited |
| You open the Repository or an author's page | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`), Blurt nodes (`rpc.blurt.blog`) | a query for the shared Publication tag (`forkbuild-publication`); then a request for each newly announced Publication's signed record, at most 20 per visit or **Check again** |
| You distribute or discover publications over Nostr | Nostr relays (`relay.damus.io`) | signed announcements you publish; your queries |
| You store or fetch content on Arweave | an Arweave gateway (`arweave.net`) | the content you publish; what you fetch |
| You fetch content from IPFS | an IPFS gateway (`ipfs.io`), or your own IPFS node (`127.0.0.1:5001`) | what you fetch or add |
| You pin content with a remote pinning service (*experimental*) | the service you enter | the content, and the token you type for that one upload (never stored) |
| You store, announce or anchor on Steem, or discover Steem announcements (*experimental*) | Steem API nodes (`api.steemit.com`, then `api.justyy.com`); signing goes through the Steem Keychain extension | your Steem account name; what you post (announcements, stored content, anchors) is public on the chain for good, and edits leave the earlier version in its history |
| You store, announce or anchor on Blurt, or discover Blurt posts (*experimental*) | Blurt API nodes (`rpc.blurt.blog`, then `rpc.beblurt.com`); signing goes through the Blurt Keychain extension (or WhaleVault) | your Blurt account name, and the accounts whose post histories are read (the ones you follow, and every account this device has seen post under ForkBuild's tags, remembered on this device); what you post is public on the chain for good, under your own account, and edits leave the earlier version in its history. Every transaction pays a small fee in BLURT from your account |
| You distribute a Publication's Signed Claim on Blurt (*experimental*) | Blurt's image host (`blurt.blog/imagesup`), directly or, when the browser can't reach it, through the rendezvous server's `/blurt-image` relay, which keeps nothing | a 320×200 picture of the build for the post's preview, signed with your Blurt posting key |
| You distribute a Publication's Signed Claim on Steem (*experimental*) | the Steem image host (`steemitimages.com`), directly or, when the browser can't reach it, through the rendezvous server's `/steem-image` relay, which keeps nothing | a 320×200 picture of the build for the post's preview, signed with your Steem posting key |
| You open a shared link to a Publication (`#/view/…`) | the Steem or Blurt node, Arweave gateway or IPFS gateway the link names, then the announcement substrates to find its build | which post, transaction or CID you open |
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
**Network Settings**. The visitor count only runs on the official site, so
a copy hosted elsewhere counts nothing; to count your own visitors, change
the addresses in `core/VisitorCount.js` and the `img-src` entry in
`index.html`'s Content Security Policy. The default rendezvous server
accepts only the official site's origin, so a copy hosted elsewhere needs
its own (see
[docs/Deployment.md](Deployment.md)). If you host ForkBuild for others,
update this page to name your servers.
