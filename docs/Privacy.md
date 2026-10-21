# Privacy

<!-- languages -->
**English** · [Deutsch](user/de/Privacy.md) · [Español](user/es/Privacy.md) · [Français](user/fr/Privacy.md) · [Bahasa Indonesia](user/id/Privacy.md) · [日本語](user/ja/Privacy.md) · [한국어](user/ko/Privacy.md) · [Português (Brasil)](user/pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild has no accounts and does not track you. It stores your work in
your own browser and talks to other computers only for the features that
need them, plus an anonymous visitor count, once a day, when a share
link is used and when it is installed, so its makers know roughly how many
people use it and share builds (see "Visitor count" below, and how to turn
it off).
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
- the carrier key that sends your builds to everyone (a Nostr key, made the
  first time you choose **Everyone** under **Who can find it?**). It is not
  your identity and signs nothing of yours: anyone who had it could only send
  notes that every reader checks against your identity's own signature;
- your answer to **Who can find it?**;
- an identity made with just a name, at a first publish or walk, has no
  passphrase until you add one on **My Identities**, so anything that can
  read this site's storage could sign as it;
- known peers, friends, the people you follow, blocks, chat history and
  queued messages (nobody is told you follow them, and nothing about a follow
  is ever sent);
- your avatar profile (walking World View before you choose a name, you
  are a guest: that avatar is kept nowhere, not even here, and is never
  sent to anyone), settings (including whether World View plays sound,
  how loud, in 3D or stereo, and with or without music, whether World View shows its advanced
  tools, whether it is always day there, whether the sun and the moon cast shadows there, where Publish sends your builds, the language you chose, and whether the look is light, dark or follows the device; when you
  haven't chosen one, ForkBuild reads the browser's preferred languages on
  the device and sends them nowhere), and a TURN server's username and credential
  if you enter one under **Network Settings**;
- whether this browser takes part in the daily visitor count, and the last
  day it did;
- other people's Publications this device has found and verified, from
  peers, links, World View or Explore's search of the networks, and,
  for those found on the networks, where each one's signed record was read.
- the ids of Publications you unpublished on this device, so Explore's
  search of the networks doesn't list copies you distributed earlier again.
- for each week's build challenge you open, the ids of the entries found on
  the networks, so its page lists them again before searching.
- which networks this device sent each of your comments to, and when, so
  each comment can say where it went.
- every heart record this device made or accepted, the network chosen for
  hearts, which networks each of your own hearts was sent to (with the
  Nostr event, so taking a heart back can ask relays to delete it), and
  whether the first heart's explanation was shown.
- which builds this device knows are on the Nostr relays as build notes
  (your own, once a relay took the note, and others' it opened from one),
  so they can be shared by a short link.
- for each build you started with **Build here**, the World and the spot
  you chose, so publishing it stands it there.
- the ids and content hashes of other people's builds whose bytes haven't
  reached this device yet, and since when (at most 500, each for 30 days),
  so each can still be compared with your own builds when its bytes arrive,
  even after ForkBuild was closed (the 🔔's **… published a build that looks
  like yours**).
- for each build started from a ready-made structure or as a copy of a
  build, and for each ready-made structure dropped into one, what its
  bricks were and where they stood, so publishing can tell the bricks you
  placed from the ones you started with (only which range they fall in is
  ever counted; see "Visitor count").
- for each identity, the builds a friend credited it on while you built
  them together (**Build with me**): each build's title, its author's name
  and identity, and when, for **Builds you helped make** on My Worlds and
  your own builder page. It is kept under the identity your devices share,
  and while another device of yours is connected (an authorized device of
  the same identity) the two give each other their lists; it never goes to
  anyone else's device. Your stamps on Home are
  worked out from what is already listed here and aren't stored.

Clearing this site's data in the browser deletes all of it, and there is no
other copy and no way to recover it. Back it up first with **Your Data →
Back Up to a File**: the file holds all of the above except which name
you were using, encrypted with a passphrase you choose, and stays wherever you
put it. ForkBuild never uploads it. **Share Backup** hands the file to the
app you pick on your device. If you choose a backup folder, the browser
keeps ForkBuild's permission for it, and ForkBuild keeps the folder and, if
you ask, a key made from your backup passphrase that can only make backups
(never open them) in a separate `forkbuild-backup` IndexedDB database; when
and where you last backed up is kept with the rest of the data but left out
of backups.

On the official site, the browser also keeps ForkBuild's own files (its
code, stylesheet, icons and the language you use) through the site's
service worker, so ForkBuild opens without a connection and can be installed
as an app. They are the same files for everyone and hold nothing of yours.
Whether notifications on this device are turned on is kept with your
settings (see "Notifications on this device" below).

## What other people can see

- **Anything you publish** is public: its content, title, description,
  tags and license, and your identity's public key, which signs it. Once
  other people have a copy, you can't take it back.
- **Who can find it?** is asked before your first publish. With
  **Everyone**, each signed build you publish is also sent, whole, to the
  public Nostr relays under **Network Settings** as a build note
  (docs/Protocol.md, "Build notes"), with its tags and where it stands in the
  World, so anyone using ForkBuild finds it in Explore, the challenge and the
  World. The note is signed with this device's carrier key, not your identity.
  Relays keep what they are sent; you can't take a note back. With **Only
  people I send the link to**, nothing is sent and the build travels only in
  its link. The choice is remembered on this device and can be changed from
  the message after Publish. Once you choose where
  your builds go, each Publish sends the build there too; until then,
  Publish sends nothing. When you distribute it
  to Nostr or Arweave, its announcement also lists its tags (as
  `forkbuild-tag:<tag>`), so anyone can find the builds with a tag, such as a
  week's challenge entries.
- **Hearts you give** are public: each says that your identity loves that
  build, or no longer does, under the name you signed in with, signed with
  your identity's key. It goes to connected peers and to the network chosen
  for hearts (Nostr unless you change it), where anyone can read it, and to
  the builder as a notification. Taking a heart back sends a newer record;
  the earlier one may stay where it was sent, and on Nostr a deletion
  request is only a request.
- **Your clock, to connected peers.** While you are connected, your device and
  each connected peer tell each other what their clocks say (a few times on
  connecting, then once a minute), so animals and residents stand in the same
  place on everyone's screen. Only the time is sent.
- **Peers you connect to** learn your identity's public key, and your IP
  address (a direct connection needs it; a TURN relay hides it from the peer
  but not from the relay). Connected peers can see your avatar and presence
  according to its visibility setting, including which vehicle you are riding
  (its type and id, sent only while presence would be; where you left a
  vehicle is never sent), and your friends can message you.
  They also receive the Snapshot and Place Naming announcements your device
  has discovered, so they learn which World regions you have searched for
  place names (docs/AnnouncementIndex.md).
- **Peers, for Worlds you share.** **Share with Peers** in Explore
  offers one of your published Worlds to everyone you're connected to now and
  to anyone who connects later, lobby strangers included: they receive its
  listing and can fetch the World itself from your device while you're
  connected. Your Friends' and Known Peers' devices fetch it on their own;
  anyone else's only when they click **Retrieve**. A World you only
  **Publish** is never sent to anyone.
- **Friends you walk with.** Anyone who opens a **Walk here with me** link
  you made, while it works, receives the World you are in (its signed
  Publication and build, as a shared link carries them) and your display
  name, and connects to you as an ordinary connected peer: they learn your
  IP address and see your avatar and presence as your visibility settings
  allow. You learn theirs the same way, and the name they walk under.
- **Friends you build with.** Anyone who opens a **Build with me** link you
  made, while it works, connects to you the same way and receives your
  display name, the build's title and, once their Editor asks, the build
  itself, then every change either of you makes to it, where your pointer
  is and what you have selected, while you build together. They keep their
  copy. You learn their IP address, the name they build under, and where
  they point the same way. Each friend whose change your build takes in is
  credited on it, by the name they built under and their identity's public
  key, and when you publish it that credit is part of its signed
  Publication, which anyone who sees the build can read (the page a
  **Build with me** link opens says so before they join). While you build
  together, everyone's copy follows that list, so each friend sees who else
  is credited.
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

The same counter also hears about these moments in sharing a build, each as
one more image request of the same kind, under its own fixed path:

- `/e/share-link`: a link to a build was copied or shared with **Copy link**
  or **Share…**;
- `/e/share-link-short`: that link was a short one (`/n/…`), heard as well
  as `/e/share-link`, never instead of it;
- `/e/opened-shared-link`: a shared link opened a build;
- `/e/remix-from-link`: a build opened from a shared link was copied into
  the Editor (at most once per build each time the app is open).

It also hears, the same way, when ForkBuild is installed as an app
(`/e/installed`), and about builds embedded in other sites' pages (see
"Servers ForkBuild contacts" below):

- `/e/embed-code`: a build's embed code was copied with **Embed → Copy embed
  code**;
- `/e/embed-view`: an embedded build was shown on a page;
- `/e/embed-open`: an embedded build was opened in ForkBuild from that page.

And when someone joins the weekly build challenge (**Join the challenge**,
or the challenge in the Editor's **New**): `/e/challenge-join`; and when someone
opens a week's challenge plaza in World View: `/e/plaza-visit`. And each time World View opens: `/e/world-visit`; and, once a visit, when someone else's build stands in view there (a build this device didn't publish and can't edit; the ready-made builds round the plaza don't count): `/e/world-neighbour`. And, at most once each time ForkBuild is opened, when someone with no name yet walks there as a guest: `/e/guest-walk`; nothing about where they walked is sent. And, at most once each time ForkBuild is opened, when the Editor opens: `/e/editor-open`; when a ready-made build opens in it as your own copy from a link on Home or a challenge page: `/e/starter-open`; and when you make a first edit there: `/e/editor-edit`. None of these says which build it was or what was changed. And, at most once each time ForkBuild is opened, when someone uses one of the side systems: swims (`/e/swam`), catches an animal (`/e/animal-caught`), decorates a build with one (`/e/animal-decorated`), carries something, an animal or a stored vehicle (`/e/inventory-used`), sends a chat message (`/e/chat-sent`), makes or answers a voice call (`/e/voice-call`), or joins a public lobby (`/e/lobby-joined`). None of these says what was caught, said, called or joined. And when
someone makes a **Walk here with me** link in World View: `/e/walk-link`; and
when a friend arrives through one: `/e/walk-joined`. And when someone makes a
**Build with me** link in the Editor: `/e/build-link`; and when a friend joins
through one: `/e/build-joined`; and the first time a build is published
crediting friends who built it together: `/e/publish-together`. And each time
a build is published: `/e/publish-found` when it was sent to everyone, or
`/e/publish-link-only` when it was kept to its link.

And the first time a build is published from this browser (publishing it
again later sends nothing):

- its size, as one of five ranges of bricks placed directly, structures
  aside: `/e/publish-bricks-0`, `/e/publish-bricks-1` (1 to 9),
  `/e/publish-bricks-10` (10 to 49), `/e/publish-bricks-50` (50 to 199) or
  `/e/publish-bricks-200` (200 or more). Never the exact count;
- the same five ranges for the bricks its builder placed or changed, the
  ready-made ones it started with or had dropped in left out:
  `/e/publish-placed-0` to `/e/publish-placed-200`;
- `/e/second-build`, when it is the second build published from this
  browser, which happens once;
- `/e/remix-published`, when it is a copy of a build this browser didn't
  publish.

These are worked out from the builds this browser has published, which it
already keeps (see "What stays on your device"), and, for the bricks placed,
a note of the bricks each build started with, kept beside it on this device
and never sent anywhere.

And when ForkBuild is opened through a link in one of its own launch posts,
which ends in `?ref=` and the name of the place it was posted (`hn`,
`producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu`,
`gamejolt`, `indiedb`, `youtube` or `github`; any other value is ignored):
`/r/` and that name, such as `/r/hn`, once. The app then takes `ref` out of
the address, so reloading or passing the address on doesn't send it again. This tells which posts brought people,
and nothing about who they are or what they did.

Each sends only its path and the random number: never the link, the build,
its title or who made it. Which builds were opened from a link is kept only
in the open page's memory, and forgotten when it closes.

None of these is ever sent:

- when your browser sends Global Privacy Control or Do Not Track;
- when you turn off **Your Data → Daily visitor count → Count this
  browser** (the choice is kept in this browser only);
- from any copy of ForkBuild served from somewhere other than the official
  site, including `localhost`.

An embedded build can't read the **Count this browser** choice: it opens no
storage, and browsers keep a site's storage apart inside other sites' pages
anyway. So `/e/embed-view` and `/e/embed-open` follow only the other two
rules: never with Global Privacy Control or Do Not Track, and only from the
official site.

The code is `core/app/VisitorCount.js`, `core/app/LaunchChannel.js`,
`application/settings/CountDailyVisit.js`,
`application/settings/CountLaunchChannel.js`,
`application/settings/FunnelEventCounter.js`, `ui/counterHit.js`,
`ui/start.js` and `ui/embed/embedBoot.js`.

## Servers ForkBuild contacts

Every script, style and font comes from the site the app is served from
(see [docs/Deployment.md](Deployment.md)), apart from the visitor count's one
image a day described above. One more thing starts on its own: about
10 seconds after the app opens, and every few minutes while its tab is
visible, it reads new announcements from the Nostr relays, the Arweave
gateway, and the Steem and Blurt nodes configured under **Network Settings**
(docs/AnnouncementIndex.md). It reads only announcements (small pointers and
signed claims), never content, and publishes nothing. Build notes, which
carry whole builds, are read only when you open Explore, an author's page,
the challenge or its plaza (see the table). Everything else happens
only when you use the feature, and each server can be changed under
**Network Settings**. Each server sees your IP address and what you ask it for.

Voice building, once you turn it on in the Editor or World View, also downloads its
speech model from Hugging Face and its speech engine (WebAssembly) from
jsDelivr, once; the engine is refused unless it is the exact file ForkBuild
expects (its SHA-256 is fixed in the app). What you say is recorded and
understood on your device, and never sent anywhere.

| When | Server (default) | What it receives |
| --- | --- | --- |
| You turn on voice building in the Editor or World View (once, and again only after removing its files) | Hugging Face (`huggingface.co` and its file servers), jsDelivr (`cdn.jsdelivr.net`) | requests for the speech model's files (`onnx-community/whisper-tiny`) and the speech engine's WebAssembly file (`onnxruntime-web`, one exact version); never anything you say |
| The app opens on the official site, at most once a day (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with a fixed path, no referrer and no cookie |
| On the official site, you copy or share a link to a build, open a shared link, or copy a build opened from one into the Editor (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with a fixed path naming which of the three it was, no referrer and no cookie |
| You install ForkBuild from the official site (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with the fixed path `/e/installed`, no referrer and no cookie |
| On the official site, you copy a build's embed code, or an embedded build is shown, or opened in ForkBuild (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with a fixed path naming which of the three it was, no referrer and no cookie |
| On the official site, you join the weekly build challenge, or open its plaza (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with the fixed path `/e/challenge-join` or `/e/plaza-visit`, no referrer and no cookie |
| On the official site, you open World View, and someone else's build stands in view there (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with the fixed path `/e/world-visit`, and at most one with `/e/world-neighbour` a visit, no referrer and no cookie |
| On the official site, you walk in World View before choosing a name (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | at most one image request with the fixed path `/e/guest-walk` each time ForkBuild is opened, no referrer and no cookie |
| On the official site, you open the Editor, open a ready-made build in it from Home or a challenge, or make an edit there (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | at most one image request each time ForkBuild is opened for each, with its fixed path (`/e/editor-open`, `/e/starter-open`, `/e/editor-edit`), no referrer and no cookie |
| On the official site, you swim, catch an animal, decorate a build with one, carry something, send a chat message, make or answer a voice call, or join a public lobby (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | at most one image request a page load for each, with its fixed path (`/e/swam`, `/e/animal-caught`, `/e/animal-decorated`, `/e/inventory-used`, `/e/chat-sent`, `/e/voice-call`, `/e/lobby-joined`), no referrer and no cookie |
| On the official site, you make a **Walk here with me** link, or arrive through one (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with the fixed path `/e/walk-link` or `/e/walk-joined`, no referrer and no cookie |
| On the official site, you make a **Build with me** link, or join through one (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with the fixed path `/e/build-link` or `/e/build-joined` (and `/e/publish-together` when a build made together is first published crediting them), no referrer and no cookie |
| On the official site, you publish a build for the first time (see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with a fixed path naming its range of bricks, and one more for a second build or a remix, no referrer and no cookie |
| You open the official site through a launch post's link (`?ref=…`, see "Visitor count") | GoatCounter (`forkbuild.goatcounter.com`) | one image request with the fixed path `/r/<channel>`, no referrer and no cookie |
| You make yourself discoverable, or look someone up, in **Peers** | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | your identity's public key and a connection offer, kept for at most 15 minutes; the identity you look up; when you connect to someone you found, your connection reply (it lists your network addresses), which only they can collect |
| You join, or look into, a public lobby | the same rendezvous server | your signed lobby card (public key, display name, which lobby), kept for at most 15 minutes and renewed while you stay; which lobby you look into |
| You copy to another device (**Your Data** → **Copy to another device**), or open its link on the other device | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | a public key made for this one copy (not your identity's) and a connection offer, kept for at most 10 minutes; from the other device, that key and its connection reply. What is copied goes directly between the devices, encrypted with a key only the code holds |
| You make a **Walk here with me** link in World View, or open one | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | a public key made for this one link (not your identity's) and a connection offer, each kept for at most 10 minutes and offered anew while the link works (at most 30 minutes) and after each friend joins; from a friend, that key and their connection reply. The World, both names and the invitation that connects your two peer sessions go directly between your devices |
| You make a **Build with me** link in the Editor, or open one | the same rendezvous server | the same as for **Walk here with me**. The build's title, both names, the invitation, the build and every change to it go directly between your devices |
| A peer connection starts | STUN servers (`stun.l.google.com`) | nothing but a request for your public IP address |
| You start a peer connection, if the rendezvous server offers a relay | the rendezvous server's `/turn-credentials`, then its TURN relay (Cloudflare) | a request for short-lived relay credentials, at most about once an hour; relayed traffic is end-to-end encrypted by WebRTC |
| The app is open and its tab visible (background announcement sync) | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`), Blurt nodes (`rpc.blurt.blog`) | queries for ForkBuild's discovery tags: the shared Snapshot and Commentary tags, and the Place Naming regions and map cells you have visited |
| You open Explore or an author's page | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`), Blurt nodes (`rpc.blurt.blog`) | a query for the shared Publication tag (`forkbuild-publication`); then a request for each newly announced Publication's signed record, at most 20 per visit or **Check again** |
| You open a week's build challenge (**Challenge**) | Nostr relays (`relay.damus.io`), an Arweave gateway (`arweave.net`), Steem nodes (`api.steemit.com`), Blurt nodes (`rpc.blurt.blog`) | a query for that week's tag (`forkbuild-tag:<tag>`); then a request for each newly announced entry's signed record, at most 20 per visit or **Check again** |
| You publish a build with **Everyone** chosen under **Who can find it?** | every Nostr relay under **Network Settings** (`relay.damus.io`, `nos.lol`, `relay.primal.net`) | a build note: the signed build itself, its tags and its publisher's signed placement, signed with this device's carrier key |
| You open Explore, an author's page, a week's challenge or its plaza | every Nostr relay under **Network Settings** | a query for build notes (`forkbuild-build`, or that week's `forkbuild-tag:<tag>`); each new note is checked and opened on this device, at most 40 per visit |
| You distribute or discover publications over Nostr | Nostr relays (`relay.damus.io`) | signed announcements you publish; your queries |
| You store or fetch content on Arweave | an Arweave gateway (`arweave.net`) | the content you publish; what you fetch |
| You fetch content from IPFS | an IPFS gateway (`ipfs.filebase.io`, then others), or your own IPFS node (`127.0.0.1:5001`) | what you fetch or add |
| You pin content with a remote pinning service (*experimental*) | the service you enter | the content, and the token you type, kept only until you close or reload the page (never stored); the service's address and field names are kept on this device once you save them under **Content Provider** |
| You store, announce or anchor on Steem, or discover Steem announcements (*experimental*) | Steem API nodes (`api.steemit.com`, then `api.justyy.com`, then `steemd.steemworld.org`); signing goes through the Steem Keychain extension | your Steem account name; what you post (announcements, stored content, anchors) is public on the chain for good, and edits leave the earlier version in its history |
| You store, announce or anchor on Blurt, or discover Blurt posts (*experimental*) | Blurt API nodes (`rpc.blurt.blog`, then `rpc.beblurt.com`, then `rpc.drakernoise.com`); signing goes through the Blurt Keychain extension (or WhaleVault) | your Blurt account name, and the accounts whose post histories are read (the ones you follow, and every account this device has seen post under ForkBuild's tags, remembered on this device); what you post is public on the chain for good, under your own account, and edits leave the earlier version in its history. Every transaction pays a small fee in BLURT from your account |
| You distribute a Publication's Signed Claim on Blurt (*experimental*) | Blurt's image host (`img-upload.blurt.blog`), directly or, when the browser can't reach it, through the rendezvous server's `/blurt-image` relay, which keeps nothing | a 320×200 picture of the build for the post's preview, signed with your Blurt posting key |
| You distribute a Publication's Signed Claim on Steem (*experimental*) | the Steem image host (`steemitimages.com`), directly or, when the browser can't reach it, through the rendezvous server's `/steem-image` relay, which keeps nothing | a 320×200 picture of the build for the post's preview, signed with your Steem posting key |
| Someone opens, or a site previews, a link to a build that carries it (`/b/…`) | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`) | the link, which holds the build and its Signed Claim; it keeps nothing |
| Someone opens, or a site previews, a short link to a build sent to everyone (`/n/…`) | the rendezvous server (`forkbuild-rendezvous.prazjp.workers.dev`), which asks the Nostr relays (`relay.damus.io`, `nos.lol`, `relay.primal.net`) for the build's note | the link, which names the build's Publication; the server keeps nothing, and Cloudflare keeps a found build's page and picture in its cache for a day |
| You open a short link (`#/n/…`) | every Nostr relay under **Network Settings** | a query for that one build's notes (`forkbuild-build:<id>`); the newest that checks out is opened on this device |
| Someone opens a page with a build embedded in it (`embed.html#…`) | the site ForkBuild is served from (`bowo-prasetyo.github.io`) | requests for the embed's files, with no referrer; never the build, which is in the part of the address browsers don't send |
| A site or editor asks how to embed a `/b/…` or `/n/…` link (oEmbed) | the rendezvous server's `/oembed` (`forkbuild-rendezvous.prazjp.workers.dev`) | the link, which holds the build and its Signed Claim; it keeps nothing |
| You open a shared link to a Publication (`#/view/…`) | the Steem or Blurt node, Arweave gateway or IPFS gateway the link names, then the announcement substrates to find its build | which post, transaction or CID you open |
| You anchor or verify evidence on Bitcoin (*experimental*) | an Esplora API (`blockstream.info`) | the transaction you broadcast or look up |
| You verify evidence on Base (*experimental*) | a Base JSON-RPC endpoint (`mainnet.base.org`) | the transaction you look up |
| You connect a browser wallet (*experimental*) | the wallet extension you choose | whatever it asks you to approve |

ForkBuild never sends your private key, your passphrase, or your saved
documents to any of these servers.

**A link that carries its build** (made by **Copy link** or **Share…**
before a build is distributed) holds your signed Shared World and the build
itself. It points at the rendezvous server
(`forkbuild-rendezvous.prazjp.workers.dev/b/…`) so that chat apps and social
sites can show the build's title and a picture of it: opening the link, or a
site previewing it, sends it, and so the build, to that server, which checks
the signature, draws the picture, sends people on to the app (`#/s/…`, a
part of the address browsers never send to a server) and keeps nothing.
Cloudflare, which runs the server, may log the addresses requested. Making a
link contacts nothing. Anyone who has the link can see the build, its title,
description and author name, and your identity's public key, as with any
Shared World you distribute.

**A short link** (offered instead once a build was sent to everyone, see
**Who can find it?** above) holds only the id of the build's Publication
(`forkbuild-rendezvous.prazjp.workers.dev/n/…`). Opening it, or a site
previewing it, sends that id to the rendezvous server, which asks the public
Nostr relays for the build's note, checks it as it checks a link that
carries its build, draws the picture, sends people on to the app (`#/n/…`)
and keeps nothing; the app then asks the relays for the note itself. The
build was already public on those relays, which is what a short link relies
on: it stops working if no relay keeps the note. Builds kept to their link
never get one.

**An embedded build** (the code **Embed** copies: an `<iframe>` of
`embed.html#…` on the site ForkBuild is served from) holds the same, your
signed Shared World and the build. The page it is pasted into loads the
embed from that site, which learns neither the build (it sits in the part of
the address browsers never send to a server) nor the page around it (the
frame sends no referrer). In the reader's browser, the embed checks the
signature and the build, shows it, and stores nothing; it starts none of the
app's connections, so no peers, relays or other networks are contacted.
Anyone who can see the page can see the build, as with its link.

**Relays are used only when needed.** A connection always tries a direct
path first, then one found through STUN, and falls back to the TURN relay
only when neither works. While you wait in a lobby, the offers your device
keeps ready never ask for relay credentials, so a lobby stay does not use up
the relay allowance the rendezvous server hands out each month; the person
who connects to you asks for one, if they need it.

## Notifications on this device

If you turn on **Notify me on this device** (in the 🔔 panel), your device
shows your new notifications itself while ForkBuild is open in a background
tab or as an installed app. No push service is used and nothing is sent
anywhere for it: the open page hands the notification to your browser,
which shows it through your operating system. The notification's text (for
example a build's title and its maker's name) may then be kept in your
device's notification history, as with any app's. Turn it off in the same
panel, or block ForkBuild's notifications in the browser's site settings.

## If you run your own copy

A deployment decides the defaults above: its rendezvous server
(`peer/RendezvousConfig.js`), whether that server offers a TURN relay
(`server/rendezvous-worker/README.md`), and the other defaults under
**Network Settings**. The visitor count only runs on the official site, so
a copy hosted elsewhere counts nothing; to count your own visitors, change
the addresses in `core/app/VisitorCount.js` and the `img-src` entry in
`index.html`'s Content Security Policy. The default rendezvous server
accepts only the official site's origin, so a copy hosted elsewhere needs
its own (see
[docs/Deployment.md](Deployment.md)). If you host ForkBuild for others,
update this page to name your servers.
