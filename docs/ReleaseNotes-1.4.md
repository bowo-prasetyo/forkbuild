# ForkBuild 1.4 release notes

*Released 2026-10-14 as version 1.4.0.* For 1.3, see
[ReleaseNotes-1.3.md](ReleaseNotes-1.3.md); for what came after, see
[ReleaseNotes-1.5.md](ReleaseNotes-1.5.md).

1.4 is the builder's release. A newcomer starts from a ready-made house,
builds with a kit of fifty bricks, publishes with only a name, and shares a
link that carries the build itself. Anyone can find a published build with
no wallet or extension, and builds stand together in a village round the
weekly challenge's plaza. Friends can walk a World together, or build one
together live, from one link. World View gains day and night, a sun, a
moon, shadows, stars and music, and the app gains a light, village-coloured
look with a dark version.

To keep the first ten minutes about building, 1.4 also removes things. The
leaderboards, the reconciliation pages and Publisher Associations are gone
(see "Removed"). Posting to Bitcoin, Base, Steem and Blurt is now something
each device switches on. The menu speaks the player's words: **Build**,
**Explore**, **Challenge** and **Walk**, and **Choose a name** instead of
Login.

There are no security fixes in this release. The visitor count hears about
more moments, and a build you let everyone find is sent to public Nostr
relays (see "Privacy" below). The protocol gains tilted bricks, link-only
shares, build notes, walk and build links and co-builder credits, all
optional and described in [Protocol.md](Protocol.md); `PROTOCOL_VERSION`
is unchanged.

## New

### Starting out

- **Home shows what ForkBuild is:** a slowly turning village, a sentence on
  what it's for, and **Try it now**, which hands over a house to finish. Six
  ready-made builds open as your own copy from Home, Explore, My Worlds and
  the Editor's **New**, beside three larger showcase builds: a castle, a
  harbor island and a village square.
- **A guided first build:** the Editor walks a newcomer through placing a
  brick, stacking one, dropping in a structure, saving, publishing and
  sharing, and ends with **Walk inside it** at the build's door.
- **A first publish asks only for a name.** A passphrase can be added later
  on **My Identities**.
- **Who can find it?** is asked once, before the first publish:
  **Everyone**, or **Only people I send the link to**. Publish then sends
  the build where it goes in the same step: **Distribute** is folded into
  Publish.
- **A guest walks:** **Walk** in the menu opens this week's challenge plaza,
  and someone with no name walks it as a guest, with nothing stored or sent.

### Building

- **Fifty bricks:** 33 new bricks, among them half cubes, plates, round
  bricks and pillars, logs, gable and cone roofs, ladders, framed and round
  windows, a double door, shutters, a chimney, a barrel, a bench, and bushes,
  pines, rocks and lawn. Sixteen village colours sit beside the colour
  picker.
- **Tilt:** any brick can lie on another side, so a post becomes a beam, a
  wall a floor, and a slope an overhang.
- **Doors and arches you can walk through,** and **See inside** cuts a build
  away above its lowest floor so you can see and build in the room. The
  House is furnished.
- **Bricks that look like what they are made of:** soft edges, a shade of
  their own and the grain of their material.
- **A brick lands under the pointer,** and the first click places one.
- **A File menu** holds Export, 3D model and Import, so New fits on a phone
  again.
- **Build here:** World View starts a build for the spot you stand on, and
  publishing stands it there.
- **Stamps** on Home name facts about your own builds. They are never
  points, levels or ranks.

### Sharing and remixing

- **A link that carries its build:** **Share…** and **Copy link** work the
  moment a build is published, with no wallet, account or server.
  **Save picture** downloads a 1200 × 630 picture to post beside it.
- **Link previews:** a pasted link shows the build's title, author and a
  picture of it, through the rendezvous worker.
- **A shared link opens on the build,** with one big **Edit a Copy**, and
  remixing a build that came by link works.
- **Family trees:** a shared link and the challenge page show where a build
  came from and what was remixed from it, with every name a link to its
  builder's page.
- **Embed a build** in a web page, turning, with a way into ForkBuild. The
  rendezvous worker answers oEmbed.
- **Download a build as a 3D model:** glTF for Blender and game engines,
  STL for 3D printing, and OBJ.

### Finding each other

- **Anyone can find a build:** with **Everyone**, each publish also sends
  the signed build to the Nostr relays under **Network Settings** as a build
  note. Explore, a builder's page and the challenge find it, with no wallet,
  extension or link.
- **A village:** a published build settles beside the build it remixes, or
  in rings round the challenge plaza, instead of on a far-off grid spot.
  Republishing never moves a build.
- **Weekly build challenge:** a theme each week (26 of them, half a year
  before one repeats), **Join** to start an empty plot pinned with the
  theme's starter and ideas, and a page and a plaza where the week's
  entries stand together. Entries are found on every network, Blurt and
  Steem included.
- **Residents wonder what's missing** nearby, with **Build there**, and
  notice when someone builds it.

### Together

- **Walk here with me:** one link brings friends into the World you are
  standing in for 30 minutes, with no identity made discoverable.
- **Build with me:** one link opens your build in a friend's Editor, and you
  build it together, live. Undo takes back only your own steps.
- **Co-builders are credited:** a build made together says who built it, in
  every copy, on its shared link and in its family tree. **Builds you helped
  make** follow you to all your devices.

### The world

- **Day and night:** World View's sky turns every 40 minutes, and windows
  and lanterns light up after dark. **Always day** keeps it noon.
- **A sun and a moon** cross the sky from where the compass says East, cast
  **Shadows** (which you can turn off), and the stars and the Milky Way
  come out at night.
- **Music:** a quiet tune generated on your device, in three moods: the
  Editor's, World View's by day and by night. **♪ Music** turns it off.
- **Two new example builds,** The Islet Lighthouse and The Harbor Wall
  Light, lit with Lanterns.
- **A visitor's World View:** it opens as a place. **Edit a Copy**,
  **Build here** and **Walk here with me** lead, and the protocol's tools
  sit under **Show advanced tools**.
- The vehicles fit the village: the motorcycle is now a penny-farthing,
  the car a hay wagon and the drone a hot-air balloon.

### The app

- **A light, village-coloured look,** and a dark one that follows the
  device or is chosen.
- **Install ForkBuild** as an app. It opens with no connection, and can
  show your notifications through your device, including when a build of
  yours is remixed.
- **Copy to another device by QR code:** **Your Data → Copy to another
  device** copies builds, structures, identities and settings to a phone
  or another browser, which adds them only when asked.
- **Comments** can stay off every network (**Local & peers only**), have a
  default network of their own, be distributed later, and be left on
  builds other people published.
- **Graduated:** Arweave anchoring and every tab of a Publications card
  (Snapshot, Decentralization & Evidence, Placements & IPFS and History)
  are regular features. History now reads what earlier visits recorded, and
  IPFS remote pinning keeps one service saved under **Content Provider**.
- **The user guide** is in two parts, Play and Advanced, has pictures of
  the main screens in every language, and speaks the app's words.

## Removed

- **Leaderboards, publisher rankings and the reconciliation pages,** which
  were behind **Show experimental tools** in 1.3. They ranked people, which
  ForkBuild no longer does (see [Pillars.md](Pillars.md), "What we are not
  making"). An observation archive saved with leaderboard claims or
  reconciliation decisions still opens and keeps every other fact. Those
  two kinds are dropped.
- **Publisher Associations** on the Publications page. Its tools panel is
  now called **Wallet & Archive Tools**.

## Changed

- **Network writers are switches.** Every copy still reads and checks
  builds, comments and anchors on every network. Posting to one is
  something a device switches on:
  - **Bitcoin** and **Base** wallets are plugins, off until switched on
    under **Network Settings → Wallets** (with **Show experimental tools**).
  - **Steem** and **Blurt** each have **Post to Steem (Blurt) from this
    device** on their settings page. They start on for a device that
    already has an account saved to post as.
- **The words:** the Repository is **Explore**, **Login** and **Logout**
  are **Choose a name** and **Switch name**, and Shared World, fork,
  document and Distribute are build, remix and send. The top bar shows
  **Home**, **Build**, **Explore**, **Challenge**, **My Worlds** and
  **Walk**, with the rest under **More**.
- **Faster, sturdier networks:** a third default node for Steem
  (`steemd.steemworld.org`) and Blurt (`rpc.drakernoise.com`); Blurt's
  Nexus is cross-checked against the chain's own tag listing; IPFS gateways
  that answer the site come first (`ipfs.filebase.io`, then the new
  `gateway.pinata.cloud`), and a slow one no longer fails a build load.
- **Experimental tools** (Bitcoin, Base, Steem, Blurt and other unfinished
  parts) are hidden until **Show experimental tools** is on.

## Fixes

- Builds whose Signed Claim is stored on IPFS are found in Explore and the
  challenge, not only on the device that published them.
- Commenting on a publication someone else published no longer fails as
  "not authorized".
- Announcing a Snapshot on Steem or Blurt no longer fails with an internal
  error on a device without that network's runtime.
- **Walk here with me** links keep working past 15 minutes on the reference
  rendezvous server.
- The sun rises where the compass says East.
- Plaza exhibits are solid to walk into, and a week's entry published far
  away is shown on its village spot while the plaza is visited.
- The starter house's chimney sits on its roof, and its stair meets the
  door.
- The build fails on any esbuild warning, and the three it found are fixed.

## Privacy

The visitor count keeps its rules: the official site only, one image
request with a fixed path and a random number, no cookie, never with Global
Privacy Control or Do Not Track, and off under **Your Data → Daily visitor
count**. It now also hears about these moments, each as a path of its own
and never with the build, its title or who made it: a share link made and
opened, a remix from a link, installing the app, embeds, joining the
challenge, visiting the plaza and World View, a walk or build link made and
joined, a build published to everyone or kept to its link, a first
publish's brick ranges (never the exact count), a second build, a remix
published, a launch post's `?ref=`, and once per page load each of
swimming, catching or decorating an animal, using the inventory, chatting,
a voice call and joining a lobby.

Also new:

- **Who can find it? → Everyone** sends each build you publish, whole, to
  the public Nostr relays under **Network Settings**, with its tags and
  where it stands, signed by a carrier key this device makes. The key is
  not your identity. Relays keep what they are sent, and unpublishing
  doesn't withdraw a note.
- **Link previews** send a shared link, and so its build, to the
  rendezvous worker, which keeps nothing. Cloudflare may log addresses.
- **Walk here with me** and **Build with me** connect you to each friend
  who opens the link, as an ordinary peer: each learns the other's IP
  address and name. A build made together credits each friend by name and
  public key in its signed Publication, and the page the link opens says so
  before they join.
- **Notifications** stay on the device. There is no push server.
- An identity made with just a name has no passphrase until you add one, so
  anything that can read this site's storage could sign as it.

See [Privacy.md](Privacy.md) for the full list.

## Upgrading from 1.3.0

- Nothing to do for your data: 1.4 opens everything 1.3 saved.
- **Bitcoin and Base:** if you used either wallet, switch it on once under
  **Network Settings → Wallets**. Steem and Blurt stay on for a device that
  had an account saved.
- If you run your own rendezvous worker, redeploy it (`wrangler deploy`,
  with the new `APP_URL` in `wrangler.toml`) before sharing `/b/` preview
  links and for oEmbed. An older worker answers `/b/` links with its plain
  "is running" text.
- New World content needs 1.4.0 to show:
  - **Builds made together** carry their co-builders in the signed
    Publication, which 1.3.0 can't verify, so it refuses them. Builds with
    no co-builder verify in 1.3.0 as before.
  - **Builds that use the new bricks** can't be fully drawn by 1.3.0.
  - **Tilted bricks** are drawn upright by 1.3.0.
  - **Links that carry their build** (`#/s/…`), build notes, walk links and
    build links don't open in 1.3.0.
- Anyone you share with, walk with or build with should update too.

## Known limitations

The limitations listed for 1.3 still apply: everything is kept in the
browser's own storage (back it up on **Your Data**, or copy it to another
device), the security policy still allows `'unsafe-eval'`, one rendezvous
server runs by default, and re-publishing an older publication is a manual
step. Also:

- **Share links are long:** about 3,700 characters for a 127-brick build
  and up to 12,000, which Discord (2,000) and Telegram (4,096) refuse. Use
  **Everyone** so friends can find the build in Explore, or share a
  distributed build's link.
- A build note holds up to about 2,000 bricks, and notes are read only when
  Explore, a builder's page, the challenge or its plaza opens.
- Nothing brings you back once the tab is closed, unless ForkBuild is
  installed or open in the background: there is no push server.
- **Bitcoin**, **Base**, **Blurt** and **Steem** stay Experimental.
