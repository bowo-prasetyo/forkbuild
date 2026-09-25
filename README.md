# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are
built from bricks, forked like source code, published through interchangeable
storage and announcement providers, and explored in a shared 3D world. There are
no accounts: identities are key pairs held on your device, and people connect to
each other directly over authenticated peer connections. The only server the
default setup uses is a rendezvous server that helps peers find each other; see
[docs/Privacy.md](docs/Privacy.md) for everything the app contacts.

**Version 1.0.0**, released 2026-09-25: see the
[release notes](docs/ReleaseNotes-1.0.md). Every milestone is recorded in
[docs/Roadmap.md](docs/Roadmap.md).

See [docs/VISION.md](docs/VISION.md) for the longer-term aim ("Git for 3D
models").

## Features

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

**World View**
- A shared world where published creations are placed and streamed in around
  the camera, on deterministic terrain with vegetation, water and wildlife.
- An avatar you can walk, run and jump with, which collides with buildings and
  can climb stairs and slopes; vehicles, an inventory, and catching and releasing
  animals.
- Text and spatial search, a map, named regions and landmarks, and World
  Encounters with publications that connected peers are sharing.
- World View observes and navigates; editing happens in the Editor. **Edit a
  Copy** forks what you're looking at into the Editor.
  See [docs/CapabilityMatrix.md](docs/CapabilityMatrix.md).

**Publishing and forking**
- Every published creation is immutable. Forking creates a new document that
  records its lineage, subject to the source's license and fork policy.
- Repository and Author views with search, sorting, pagination and
  client-side thumbnails.
- Decentralized publication (*experimental*, see below): content on Arweave or
  IPFS, announcements over Nostr or Arweave, and optional anchoring evidence on
  Bitcoin, Arweave or Base. All of it is verified by content hash and
  signature, never taken on trust.

**Identity, peers and social**
- Ed25519 identities (did:key) held on the device, signed with the audited
  noble-curves library. Private keys are encrypted with a passphrase by default
  (PBKDF2-SHA256 and AES-256-GCM through the browser's WebCrypto), with
  export/import, succession, revocation and multi-device grants.
- Direct WebRTC peer connections found through rendezvous or a manual
  invitation, and authenticated with a challenge–response handshake.
- Remembered peers, mutual-consent friendships and blocking.
- Chat with offline queuing, persistent history and read receipts, and voice
  calls.
- Avatar profiles, presence, gestures and per-audience visibility, all shared
  over authenticated peers.
- Collaborative World editing with signed membership grants.

**Experimental in 1.0**

These areas work, but may change or be removed in a later version, and what
they produce may not carry over. The app marks them with an **Experimental**
banner:
- the **Publications** page and its decentralized publication tooling;
- external evidence and anchoring (Bitcoin, Arweave and Base), and their
  Network Settings;
- the Leaderboard, reconciliation and publisher snapshot claim pages.

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
  anchoring, and the Nostr, Arweave and Base integrations.

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
- [docs/ReleaseNotes-1.0.md](docs/ReleaseNotes-1.0.md): what's in 1.0, what
  changed on the way to it, and known limitations.

## License

Mozilla Public License Version 2.0. See [LICENSE](LICENSE).
