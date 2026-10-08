# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are
built from bricks, forked like source code, published through interchangeable
storage and announcement providers, and explored in a shared 3D world. There are
no accounts: identities are key pairs held on your device, and people connect to
each other directly over authenticated peer connections. The only server the
default setup uses is a rendezvous server that helps peers find each other,
plus an anonymous, cookie-free visitor count once a day that you can turn off;
see [docs/Privacy.md](docs/Privacy.md) for everything the app contacts.

**Version 1.3.0**, released 2026-10-06: see the
[release notes](docs/ReleaseNotes-1.3.md). It adds Blurt as a network,
French and Korean, swimming and the open sea, timber-framing bricks, build
tags and formatted descriptions, and finds Worlds others distributed. 1.1.0
fixed two security problems in 1.0.0, so update any copy older than that. Every milestone is recorded in
[docs/Roadmap.md](docs/Roadmap.md).

See [docs/VISION.md](docs/VISION.md) for the longer-term aim ("Git for 3D
models").

## Features

**Home**
- A landing page with a slowly turning 3D village and ready-made builds (a
  castle, a harbor island, a village square, a house, a mill and a bridge)
  that open in the Editor as your own copy, with no account needed; the
  Repository, My Worlds and the Editor's **New** offer them too. Link
  previews and an installable web app manifest for the site.

**Editor**
- Place, select (single, multi, marquee), move, rotate and delete bricks, with
  undo/redo, grid snapping and a placement preview.
- Interactive transform gizmo, numeric transform input, snapping, and alignment
  and distribution tools.
- Groups, clipboard, brick colors, and a command palette (Ctrl/Cmd+K) that
  shares one action registry with the sidebar and keyboard shortcuts.
- A Build Library of bricks and ready-made structures, a personal blueprint
  library, structure placements, and document export/import.
- Save, autosave with crash recovery, and publishing to an immutable,
  content-hashed snapshot.
- A guided first build: five steps (place a brick, stack one, drop in a
  structure, save, share a link) ticked off as you do them, ending in a small
  celebration. Logging in is asked for only when you first publish.
- Share a build the moment it's published: the link carries the signed build
  itself, so it opens in World View on any device with no wallet or account,
  shows the build's title and a picture of it when pasted into a chat or a
  post, and **Save picture** downloads a PNG of it to post alongside.

**World View**
- A shared world where published creations are placed and streamed in around
  the camera, on deterministic terrain with vegetation, water and wildlife.
- An avatar you can walk, run and jump with, which collides with buildings and
  can climb stairs and slopes; vehicles, an inventory, and catching and releasing
  animals.
- Residents: people a World's author adds, who stroll around their homes,
  walking round buildings, turn to greet you, and tell you what's around —
  with a Focus button to look at what they mention.
- Text and spatial search, a map, named regions and landmarks, and World
  Encounters with publications that connected peers are sharing.
- World View observes and navigates; editing happens in the Editor. **Edit a
  Copy** forks what you're looking at into the Editor.
  See [docs/CapabilityMatrix.md](docs/CapabilityMatrix.md).

**Phones and tablets**
- Touch controls in both views: a joystick and buttons for walking (with a
  hands-free Cruise), riding, storing vehicles, catching and decorating in
  World View, and tap-to-place with an Undo, Redo, Rotate,
  Delete and Multi-select bar in the Editor. On narrow screens the menu and
  side panels fold away so the 3D view fills the screen. See
  [Touch screens](docs/user/ControlsReference.md#touch-screens).

**Publishing and forking**
- Every published creation is immutable. Forking creates a new document that
  records its lineage, subject to the source's license and fork policy.
- Repository and Author views with search, sorting, pagination and
  client-side thumbnails.
- Decentralized publication: content on Arweave or IPFS and announcements over
  Nostr or Arweave and anchoring evidence on Arweave, managed from the
  **Publications** page, plus (*experimental*, see below) Steem, Blurt and
  anchoring on Bitcoin, Base, Steem or Blurt.
  All of it is verified by content hash and signature, never taken on trust.

**Identity, peers and social**
- Ed25519 identities (did:key) held on the device, signed with the audited
  noble-curves library. Private keys are encrypted with a passphrase by default
  (PBKDF2-SHA256 and AES-256-GCM through the browser's WebCrypto), with
  export/import, succession, revocation and multi-device grants.
- Direct WebRTC peer connections found through rendezvous or a manual
  invitation, and authenticated with a challenge–response handshake.
- An opt-in public lobby, one for everyone and one per World, for meeting
  people whose identity you don't know yet.
- Remembered peers, mutual-consent friendships, private one-sided follows
  (a Following page and notifications for new work by people you follow) and
  blocking.
- Chat with offline queuing, persistent history and read receipts, and voice
  calls.
- Avatar profiles, presence, gestures and per-audience visibility, all shared
  over authenticated peers.
- Collaborative World editing with signed membership grants.

**Your data**
- Everything lives in this browser. **Your Data** backs all of it up to one
  passphrase-encrypted file and restores it here or on another device,
  adding what's missing or replacing everything. Documents, structures and
  identities also export on their own pages, all at once or one at a time,
  and each of your publications in the Repository says where this device
  recorded distributing it.
  A reminder appears when the last backup is old, a backup can go to your
  device's share sheet, and Chrome and Edge can back up daily to a folder
  your cloud storage syncs. See [Your Data](docs/user/13-YourData.md).

**Experimental**

These areas work, but may change or be removed in a later version, and what
they produce may not carry over. The app marks them with an **Experimental**
banner, or, on the Publications page, an **Experimental** badge:
- external evidence and anchoring on Bitcoin, Base, Steem and Blurt (anchoring
  on Arweave is a regular feature), the Bitcoin and Base wallets, and their
  Network Settings;
- Steem as a place to store and announce builds (added in 1.1), and remote
  IPFS pinning;
- the Publications page's Wallet, Archive & Publisher Tools panel;
- the Leaderboard, reconciliation and publisher snapshot claim pages.

The rest of the Publications page (the list and statuses, removing
publications that can't be used, announcing on Nostr or Arweave, storing on
IPFS or Arweave, and a card's four tabs) is a regular feature.

## Quick Start

ForkBuild has no build step, but it loads as native ES modules, so serve the
repository folder over HTTP rather than opening `index.html` from disk. For
example:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Every script, including Vue and Three.js,
is served from the repository's own `vendor/` folder, so the app loads without
internet access (its network features still need it). To host it, see
[docs/Deployment.md](docs/Deployment.md).

To run the tests you need Node.js 22 or later:

```
npm install
npm test
```

`npm test` runs every test file under Node (`npm run test:node`), the rendezvous
worker's tests (`npm run test:worker`) and the few tests that need a real browser
in headless Chromium (`npm run test:browser`; install Chromium once with
`npx playwright-core install chromium`, or point `CHROMIUM_PATH` at an existing
one). Pass a filter to run matching files only, for example
`npm run test:node -- Avatar`. The same checks run on every pull request.

Peer discovery through rendezvous needs a rendezvous server; a reference
Cloudflare Worker is in [server/rendezvous-worker/](server/rendezvous-worker/README.md).

## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with
infrastructure adapters around them:

- **core/**: the pure domain model and value types. No Three.js, no Vue, no
  browser APIs.
- **application/**: use cases, sessions (Editor, World View, published
  world), commands and services.
- **renderer/**: Three.js rendering, driven incrementally by domain events.
- **ui/**: Vue 3 views and components; `ui/main.js` is the composition root.
- **Adapters**: storage, serializer, publisher, discovery, identity, peer,
  presence, collaboration, replication, placement, spatial, content,
  anchoring, and the Nostr, Arweave, Base and Steem integrations.

See [docs/Architecture.md](docs/Architecture.md) for the full description.

## Documentation

- [docs/user/](docs/user/README.md): user guides, including the
  [Controls Reference](docs/user/ControlsReference.md).
- [docs/Architecture.md](docs/Architecture.md): how the system is built
  today.
- [docs/Principles.md](docs/Principles.md): the design rules the code keeps.
- [docs/Protocol.md](docs/Protocol.md): current serialized and wire formats.
- [docs/Deployment.md](docs/Deployment.md): hosting requirements, the
  vendored libraries and the Content Security Policy.
- [docs/CapabilityMatrix.md](docs/CapabilityMatrix.md): what each surface
  (Editor, World View, published world) may do.
- [docs/AnnouncementIndex.md](docs/AnnouncementIndex.md): how announcements
  are recorded, synced in the background and shared between peers.
- [docs/DeveloperFAQ.md](docs/DeveloperFAQ.md): answers to questions
  contributors often have, with pointers into the code.
- [docs/Roadmap.md](docs/Roadmap.md): every milestone and why it was made.
  This is the project's changelog.
- [docs/ArchitectureHistory.md](docs/ArchitectureHistory.md) and
  [docs/ProtocolHistory.md](docs/ProtocolHistory.md): the per-milestone
  notes as they were written.
- Reference: [BrickLibrary](docs/BrickLibrary.md), [BrickIDs](docs/BrickIDs.md),
  [StructureLibrary](docs/StructureLibrary.md), [Publishing](docs/Publishing.md),
  [RendererLifecycle](docs/RendererLifecycle.md) and
  [CodingConventions](docs/CodingConventions.md).

## Security, privacy and contributing

- [SECURITY.md](SECURITY.md): how to report a vulnerability, and what is in
  scope.
- [docs/Privacy.md](docs/Privacy.md): what ForkBuild stores, and every server
  it can contact.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to set up, test and submit changes.
- [docs/ReleaseNotes-1.3.md](docs/ReleaseNotes-1.3.md),
  [docs/ReleaseNotes-1.2.md](docs/ReleaseNotes-1.2.md),
  [docs/ReleaseNotes-1.1.md](docs/ReleaseNotes-1.1.md) and
  [docs/ReleaseNotes-1.0.md](docs/ReleaseNotes-1.0.md): what each release
  includes and changed, how to upgrade, and known limitations.

## License

Mozilla Public License Version 2.0. See [LICENSE](LICENSE).
