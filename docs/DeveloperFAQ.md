# Developer FAQ

Questions that come up when working on ForkBuild's code, with short
answers and pointers to where the details live. For using the app, see
[docs/user/FAQ.md](user/FAQ.md).

## Setting up and running

### Why is there no build step? Can I add an npm package or TypeScript?

The browser loads the source files as they are, as ES modules, through the
import map in `index.html`. Working on ForkBuild needs no bundler or
compiler, so TypeScript and packages that need bundling won't work. (GitHub
Pages publishes a bundled copy, built by `scripts/build.mjs` from these same
files; see [Deployment](Deployment.md), "GitHub Pages". The source must keep
running unbundled.) A browser library can be added
only as an ES module copied into `vendor/`: pin its exact version in
`package.json`, extend `scripts/vendor.mjs`, run `node scripts/vendor.mjs`,
add it to the import map, and update the map's hash in the Content Security
Policy (`tests/ContentSecurityPolicy.test.js` prints the new value). Never
load it from a CDN, and never edit `vendor/` by hand:
`tests/VendoredLibraries.test.js` fails if `vendor/` differs from what the
script produces. See [Deployment](Deployment.md) and
[CodingConventions](CodingConventions.md).

Because Vue compiles the component templates in the browser, the policy
has to allow `'unsafe-eval'`. Removing it would need a build step.

### The page is blank, or the console fills with "Loading failed for the module"

- Serve the folder over HTTP (`python3 -m http.server 8000`); opening
  `index.html` from disk doesn't work.
- `.js` files must be served as `text/javascript`.
- On GitHub Pages, the empty `.nojekyll` file must be published, or files
  whose names start with `_` (such as `vendor/noble-hashes/_md.js`) are
  left out.
- The page fetches about 600 module files, and more the first time each
  page is opened. If the host drops one, that load fails; the app's first
  load is tried again briefly, then the page reloads once to fetch what is
  missing (`ui/loadRecovery.js`). If it fails again, the page says so and
  offers a Reload button instead of staying blank; the console names the
  module that did not arrive. A page opened later that fails the same way
  shows a notice under the header with a Reload button, rather than
  reloading on its own.

### Peers can't find each other when I run the app locally

The default rendezvous server accepts connections only from
`https://bowo-prasetyo.github.io` (`ALLOWED_ORIGINS` in
`server/rendezvous-worker/wrangler.toml`), so it refuses
`http://localhost`. Either:

- deploy your own copy of `server/rendezvous-worker/` with
  `ALLOWED_ORIGINS` including `http://localhost:8000` (or unset, which
  allows any origin), and set its URL under **Network Settings →
  Rendezvous**; or
- connect with a manual invitation (copy and paste), which needs no
  server.

See `server/rendezvous-worker/README.md`.

### How do I run one test, or the browser tests?

`npm run test:node -- Avatar` runs every `tests/*.test.js` whose name
contains `Avatar`. Each file is a standalone script that throws on its
first failed assertion, and `tests/run.mjs` runs each in its own process
with `tests/support/NodePreload.mjs` (a minimal Vue shim, and WebRTC
through `node-datachannel`). A file whose first line is
`// @environment browser` is run in headless Chromium by
`npm run test:browser` instead (install it with
`npx playwright-core install chromium`, or set `CHROMIUM_PATH`). Every
file, Node or browser, must finish its work before its module finishes
evaluating: `await run();`, never `run();` or `run().catch(...)`, which can
end the file with a pass before later checks run. The runners refuse a file
that calls one of its own async functions at top level without `await`.

`tests/support/` has the shared fakes: `InMemoryStorageProvider`,
`TestIdentity`, `FakeWindowLocalStorage` and `FakeSteemChain` among them.

### My test's fetch or WebSocket fails at once

On purpose. Under Node, `NodePreload.mjs` makes `fetch` and `WebSocket` to
any host but this machine fail immediately, so no test depends on the
internet. Inject a fake (a fetch function, a WebSocket class, a transport)
into the code under test instead.

### A test failed although I only renamed a function or reworded a doc

Some older tests still read source text (`tests/support/SourceText.js`,
about 37 files) or the text of docs/Roadmap.md and docs/Principles.md
(`tests/support/DocText.js`). They quote code or prose, so a rename or a
rewording can fail them even when behavior is unchanged. Read the failing
assertion to see what it quotes. Don't write new tests like this: tests
should import the real module and check what it does
([CodingConventions](CodingConventions.md)).

## Finding your way around the code

### Which layer does my code belong in?

`core/` is the pure domain model; `application/` holds use cases, sessions
and services; `renderer/` is Three.js; `ui/` is Vue; the other top-level
folders are adapters. `tests/LayerBoundaries.test.js` enforces exactly two
import rules: `core/` never imports `application/`, `renderer/`, `ui/`,
`three` or `vue`, and `renderer/` never imports `application/` or `ui/`.
When a lower layer needs higher-layer logic, the higher layer passes it in.
See [Architecture](Architecture.md), "Layers" and "Dependency direction".

### I can't find a method of `WorldNavigationSession` or `EditorSession`

Both classes keep only their constructor, lifecycle and runtime setup in
their own file. Their other methods live in one module per concern, under
`application/worldNavigation/` and `application/editorSession/`, and
`utils/installMethods.js` puts them on the prototype as if they were
written in the class body (a name defined twice is an error). Search for
`methodName(` in those folders; for example
`getPublicationIdForDocument()` is in
`application/worldNavigation/forkOnWriteMethods.js`.

### Everything gets built in `ui/main.js`. Where do I wire a new service?

`ui/main.js` is the composition root: it builds every store, adapter and
use case once and `app.provide()`s them. Larger subsystems are built by the
compose functions in `ui/main/` (`composeIdentityAndPeers.js`,
`composeWorldDiscovery.js` and so on), which return what `ui/main.js` then
provides; every `app.provide()` call stays in `ui/main.js`. Views get
services with `inject`.

If only some pages use the service and nothing needs it running before they
open, build it in a service group instead, so the app doesn't load it at
startup: add it to an existing `defineServiceGroup(...)` in `ui/main.js` (or
define a new one), and list the group for each page that injects it in
`ui/router/pageServiceGroups.js`. `tests/ServiceGroupCoverage.test.js` names
any page that injects a group's service without listing the group. A
service that listens for peers' messages, runs in the background, or is used
by the header belongs at startup.

A new static import in `ui/main.js` (or anything it loads at startup) also
needs `node scripts/modulepreload.mjs`, which updates `index.html`'s list of
modules to preload; `tests/ModulePreload.test.js` fails until it is run.

### Is all of this code actually used?

Not all of it. Some subsystems are built and tested but not wired into the
running app, and are kept as documented design:

- the decentralized spatial index and placement-first streaming
  (`SpatialIndexRoot`, `SpatialIndexBuilder`,
  `DecentralizedSpatialDiscoveryProvider`, `DiscoverWorldAreaUseCase`,
  `world/WorldViewStreamingSession`);
- delegation records (`core/Delegation.js`; `DelegationVerifier` is the
  base class of every verifier, but nothing issues delegations);
- peer placement replication (`CreateReplicationUseCase`,
  `ReplicaMergeService`, `ConflictResolver`) and the trust-policy layer
  around it;
- the older collaboration protocol in `collaboration/`.

[Architecture](Architecture.md) marks each of these under "Built and
tested, not wired into the running app" or "has no callers in the app".
Check there before building on one.

### Where does the app keep its data, and how do I look at it?

In the `entries` object store of the `forkbuild` IndexedDB database, one
entry per name (documents under their id, `snapshot:<publicationId>`,
`recovery:<documentId>`, settings under their store key, and so on). If
IndexedDB can't be opened within 10 seconds, the session falls back to
`localStorage` under keys starting with `forkbuild:`.

Code never touches either directly. It uses a `StorageProvider`, whose
`save`/`load`/`remove`/`list` are synchronous: `ui/start.js` opens the
database and reads every entry into memory before the app starts, and
writes reach disk in the background. The exception is cold entries
(`content:` and `snapshot:`), which are read from disk on demand. A
synchronous `load()` of one not yet in memory throws
`StorageEntryNotLoadedError`; use `loadAsync()`, or `retryWhenLoaded()`.
Call `flushLocalStorage()` when you need to know a write reached disk.
See [Architecture](Architecture.md), "Local storage".

## Extending the app

### How do I add a brick type?

Add its definition to a library, a mesh to the renderer's geometry table,
and, for a ramp or steps, an entry in the walkable-surface table. No schema
change is needed. Copies of the app that don't know the new id can't draw
a document that uses it. See [BrickLibrary](BrickLibrary.md).

### How do I add a new kind of edit that can be undone?

Subclass `application/commands/Command.js`: give it a stable `type`
string, `execute(context)`, `undo(context)`, `toJSON()` and a static
`fromJSON(json, registry)`. Then register the type in
`application/editor/CreateCommandRegistryUseCase.js` and run it through
`CommandHistory` (in the Editor, through the session, never on the World
directly). Registering matters beyond undo: live collaboration sends
commands, not documents, and a receiving replica rebuilds them from the
registry. A replica running a version without your type rejects the
operation as `UNKNOWN_COMMAND` and doesn't apply it, so replicas on
different versions can diverge until both have the type.

Only the Editor may change bricks, structures and groups. World View's few
mutations are listed in [CapabilityMatrix](CapabilityMatrix.md); don't add
another one there without updating that document.

### How do I add a new peer-to-peer message?

Pick a protocol id (`forkbuild:<name>`) and use `peer/PeerMessageBus.js`:
`subscribe(protocol, (payload, meta) => …)` receives from every
authenticated peer (`meta.connectedPeer.remoteIdentity` says who sent it),
and `send(connectedPeer, protocol, payload)` refuses a peer that isn't
authenticated. The bus never reads the payload, so your protocol owns its
own validation, replay and ordering rules. A message is at most 64 KiB;
for more, use `application/peer/ChunkedPeerTransfer.js` as
`forkbuild:content` does. A record that must be trusted beyond the one
connection needs its own signature (next question). Add the protocol to
the table in [Protocol](Protocol.md), "Peer messages".

### How do I add a signed record?

Sign through `core/Signature.js`, which signs the canonical envelope
`{ domain: 'forkbuild', type, id, revision, payload }`. Give the record its
own `type` string so its signatures can't be replayed as another kind, and
verify with `identity/LocalAuthorizationVerifier.js`. Signing and hashing
come from the vendored noble libraries (`identity/Ed25519.js`) and key
derivation and encryption from WebCrypto; never implement a primitive
yourself. A record that carries its signer's public key must use the key
its did:key id encodes, or it is refused. Describe the format in
[Protocol](Protocol.md).

### How do I add a network setting?

Follow the pattern in [Architecture](Architecture.md), "Network endpoint
configuration": a `core/*Configuration.js` value object, a
`storage/*Store.js` under one key, a `Set*ConfigurationUseCase`, a view on
`ui/composables/useEndpointSettingsForm.js` (or `useEndpointListSettings.js`
for a list), and a route under `/settings/…`. `ui/main.js` reads the value
once at startup, so most changes apply on the next load. If the setting
names a server the app contacts, add it to [Privacy](Privacy.md).

### How do I add a page, and mark it Experimental?

Add a route in `ui/router/index.js`. A route with
`meta: { experimental: true }` shows the Experimental banner
(`ui/App.js`). To mark only part of a page, as the Publications page does,
put `<span class="experimental-badge">{{ t('publications.experimental') }}</span>`
next to that part's heading, and "(Experimental)" in an
`<option>`'s text (`publications.experimentalOption`), since a select can't
hold a badge. A storage or anchor type is marked through
`EXPERIMENTAL_STORAGE_TYPES` or `EXPERIMENTAL_ANCHOR_TYPES` in
`ui/views/decentralizedPublications/presentation.js`. Components are plain objects with a `template` string;
prefer `setup()` in new code, and sort choice lists by label with
`utils/sortOptionsByLabel.js`.

## Formats and compatibility

### Which version number do I change?

There are three, and they are independent:

- `VERSION` in `core/version.js` (and `version` in `package.json`) is the
  app's version. It is shown on the About page and stamped into each
  document's `engineVersion`; changing it changes nothing else.
- `PROTOCOL_VERSION` in `core/protocolVersion.js` (`'0.1'`) is stamped into
  every document, and a document must match it **exactly** to load. There
  is no migration for it yet, so changing it would make every existing
  document and publication unreadable.
- `DOCUMENT_SCHEMA_VERSION` in `core/documentSchema.js` (`2`) versions the
  document envelope. To change the envelope, bump it and register one pure
  migration (schema N to N+1) in `serializer/DocumentSchemaMigrator.js`;
  domain classes only ever see the current schema. Older copies of the app
  refuse documents with a newer schema, and a published snapshot keeps its
  original bytes so its content hash still verifies.

Most other records carry their own `formatVersion` or `schemaVersion`. See
[Protocol](Protocol.md), "Versions and identifiers".

### Which hash do I use?

`computeContentHash()` (serializer/contentHash.js) is SHA-256, and it is
what binds a signed record to its content. To check bytes against a hash,
use `ContentReference#verify()` or `contentHashMatches()`; never compare
hashes you computed yourself with `===`, since that skips the checks on
legacy hashes and malformed text.

Content published before 2026-09-28 carries a 32-bit FNV-1a hash, which
anyone can match with forged bytes. `verify()` refuses such a hash unless
you pass `{ allowLegacy: true }`; do that only when the bytes can only
have come from this device, as for its own Publications
(`LocalPublisherProvider#isOwnPublication()`) and recovery checkpoints.
`computeFnv1a32()` is for a cheap, stable number that nobody gains by
colliding (the grid layout, for example), never for trusting content. See
[Protocol](Protocol.md), "Document envelope".

### Is Steem support a proposal or real?

Real, and Experimental. docs/Protocol.md's three "Proposed: Steem …"
sections (announcements, content storage, anchoring) were written as
proposals and then built; each opens with its status. The titles stay
because code comments cite them. What is still open is listed in each
section (for example, checking the Resource Credits estimate and the
anchor publisher against a live node).

### Publish, Distribute, Share: what leaves the device?

- **Publish** makes an immutable, signed snapshot and lists it in this
  device's Repository. Nothing is sent anywhere.
- **Distribute** (Editor, World View, Publications page) uploads the
  bytes to a content store and announces them on one substrate (Nostr,
  Arweave or Steem), optionally with an anchor.
- **Share with Peers** sends a published World to connected peers only.
  **Share** on a distributed Publication gives a link that opens it in
  World View.

See [Publishing](Publishing.md) and [Architecture](Architecture.md),
"Distribution".

## Documentation

### Which document do I update?

- How the system works now: [Architecture](Architecture.md), edited in
  place.
- A format that is stored or sent: [Protocol](Protocol.md), edited in
  place.
- What each surface may change: [CapabilityMatrix](CapabilityMatrix.md).
- A server the app contacts, or data it keeps: [Privacy](Privacy.md).
- A design rule: a short version in the theme file under `principles/`,
  and the full text at the end of the last file under
  `principles/history/`. Principle titles are cited from code, so never
  rename one.
- Why a change was made: a new entry at the end of the last
  [Roadmap](Roadmap.md) part. Old entries, ArchitectureHistory and
  ProtocolHistory are records; correct them only when they were wrong at
  the time.
- Anything a player sees: the guides in `docs/user/`.

See [CodingConventions](CodingConventions.md) and
[CONTRIBUTING](../CONTRIBUTING.md).
