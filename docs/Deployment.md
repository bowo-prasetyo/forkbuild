# Deployment

ForkBuild is a static site: serve the repository folder (or a copy of it
without `node_modules/`, `tests/` and `server/`) from any static web host.
It needs no build step and no application server. GitHub Pages publishes a
bundled copy that loads faster (see "GitHub Pages" below); any host can do
the same with `npm run build`. The rendezvous server in
`server/rendezvous-worker/` is deployed separately; see its README.

## Requirements

- **HTTPS.** WebCrypto (used to protect identity keys), microphone access for
  voice calls and WebRTC all require a secure context. `http://localhost` is
  treated as secure for local development.
- **JavaScript MIME type.** `.js` and `.mjs` files must be served as
  `text/javascript`; browsers refuse ES modules served with another type.
- **A current browser** with import maps, ES modules and WebCrypto: recent
  Chrome, Edge, Firefox or Safari.

## GitHub Pages

`.github/workflows/pages.yml` publishes the site on every push to `main`. It
needs the repository's **Settings → Pages → Build and deployment → Source**
set to **GitHub Actions**. The workflow builds with `npm run build`
(`scripts/build.mjs`), opens every page of the result in Chromium
(`npm run test:bundle`, which also runs on every pull request), and publishes
`dist/` only if that passes. It can also be run by hand from the Actions tab
("Deploy to GitHub Pages", Run workflow).

`dist/` is the app bundled by esbuild into `bundle/`, an `index.html` and
`embed.html` that load it, and the few files of the repository a browser
asks for: the manifest, the favicon, `assets/`, the licences (the
vendored libraries' too, since their code is in the bundle), and the user
guide's text, `docs/user/**/*.md` without its pictures, which Help reads
(application/help/GuideLibrary.js). The rest of the repository (its source,
the rest of `docs/`, `tests/`) is not published: the app links to the
documentation on GitHub. The guide's files are not kept on install: the
service worker keeps each one the first time Help reads it, so only the
chosen language's are ever downloaded. `npm run test:bundle` fails if a page asks
for a file the site left out.

- The first load is about 70 minified files instead of about 250 modules;
  every page, service group, translation (English too: each visitor
  downloads only their own language) and the thumbnail renderer is still
  its own file, loaded when first needed. So is the network runtime
  (peers, publications, World discovery, Steem and Blurt), loaded once
  Home is on screen. `npm run test:bundle` holds the
  first load to a budget.
- Bare imports resolve through `index.html`'s import map, so the bundle runs
  the same vendored files, with one exception: the components' templates are
  compiled when the site is built (`scripts/templatePlugin.mjs`), so the
  bundle uses Vue's runtime-only build. The published pages' Content
  Security Policy therefore has no `'unsafe-eval'`, and, with no import map,
  no hash for one: `script-src 'self' 'wasm-unsafe-eval'` for the app (see
  "Content Security Policy") and `script-src 'self'` for the embed.
- File names carry a content hash, so a page opened after a new deployment
  never mixes old and new files. Someone with the old version open who then
  opens a page whose files are gone gets the "This page couldn't load" notice
  and reloads onto the new version.
- The Steem operator pages (`scripts/steem-threads/`) are bundled too, each
  into the script its page loads.
- There are no source maps: the source they would show is this repository.
  `node scripts/build.mjs dist --sourcemaps` builds a copy with them, for
  debugging the bundle locally.

To go back to publishing the repository as it is, set the Source to
**Deploy from a branch** (`main`, `/ (root)`). The repository's empty
`.nojekyll` file must be published then: without it, Pages runs Jekyll,
which leaves out every file whose name starts with `_` (such as
`vendor/noble-hashes/_md.js`), and the app shows a blank page. A deployment
from the workflow runs no Jekyll.

**Many requests at once.** There is no bundler, so the browser fetches
about 600 module files when the page opens, and a few to a few hundred more
the first time each page is opened (the World View and the Editor are the
largest). `index.html` lists the first load's modules as
`<link rel="modulepreload">` hints, so the browser requests them all as soon
as it reads the page instead of discovering them one import at a time. Serve
over HTTP/2 or later so they share one connection. If the
host drops or refuses even one of them (GitHub Pages has been seen doing
this in Firefox), the browser aborts that import. The console then fills
with "Loading failed for the module with source" errors, each naming a
module that was still in flight. `ui/importWithRetry.js` retries a page's
load briefly, which helps in browsers that fetch a failed module again; if
it still fails, a notice under the header offers to reload ForkBuild on that
page. Chromium does not, for the life of the page, so when the app's
first load fails to download `ui/boot.js` reloads the page once
(`ui/loadRecovery.js`); files that already loaded come back from the HTTP
cache, so the reload requests only what is missing. If that fails too, the
page shows a message with a Reload button rather than a blank page.

## Link previews and installing

`index.html` carries what search engines and link previews read: a
`description`, Open Graph tags (`og:title`, `og:description`, `og:image` and
the rest) and a `twitter:card`. A pasted link to the site shows the picture
in `assets/social/forkbuild-card.png` (1200 × 630, drawn from the Home
page's own 3D showcase) with that title and description. Link previews need
absolute addresses, so `og:url` and `og:image` name the official site,
`https://bowo-prasetyo.github.io/forkbuild/`; a copy hosted elsewhere can
change those two lines to its own address. The app itself never fetches
them, so the Content Security Policy needs nothing for them.

`manifest.webmanifest` (linked from `index.html`) names the app, its colors
and its icons (`assets/icons/logo.svg`, and PNGs in `assets/icons/` for
browsers that want them, including a maskable one), so browsers that install
web apps can install ForkBuild from the address bar. The page's own tab icon
is `favicon.svg`, the logo's small version. `node scripts/brand-icons.mjs`
draws the PNGs and the link-preview card from the logo. The manifest's
addresses are relative, so it works unchanged wherever the folder is
served. The manifest is fetched from the page's own origin, which
`default-src 'self'` already allows.

### Installing and working offline

The built site (`node scripts/build.mjs`, which GitHub Pages publishes) has a
service worker, `sw.js` at its root, generated from
`ui/pwa/serviceWorker.js`, and its `index.html` names it in a
`<meta name="forkbuild-service-worker">` tag, which
`ui/pwa/serviceWorkerClient.js` registers. On the first visit it keeps the
page, the bundle's code and stylesheet, the manifest and the icons (about
4.6 MB; translations are kept once used, and the page passes on the files it
loaded before the worker was in charge, so the language in use works
offline). From then on:

- the page is asked of the network first and the kept copy used offline;
- the bundle's files, named by their content, are used from the cache first;
- anything else from the site is kept as fetched and used offline;
- nothing from any other origin is touched.

A new build has a new `sw.js` (its version is a hash of the page and the
file list). Browsers check for it on each visit; it installs beside the
running one, the page says **A new version of ForkBuild is ready**, and
**Reload** starts it. Otherwise it starts once every ForkBuild tab is
closed, and only then are the old version's files deleted, so an open tab
never loses a file it may still load.

Serve `sw.js` with a JavaScript content type, from the same folder as
`index.html` (its scope is that folder). It is a classic script, so any
browser with service workers runs it. The unbundled repository has no
`<meta>` tag and registers nothing, so working on ForkBuild never meets a
stale cache. To stop a published copy using one, delete `sw.js` from it:
browsers then drop the registration on their next update check.

A shared build's own link gets its own title and picture from the rendezvous
worker: **Share…** and **Copy link** point at its `/b/<payload>`, which
serves the preview and sends people on to `APP_URL#/s/<payload>` (see
`server/rendezvous-worker/README.md`, "Link previews for shared builds").
A build sent to everyone is shared by a short link, the worker's
`/n/<publication id>`, which reads the build's note from the Nostr relays in
`NOSTR_RELAYS` (the app's defaults when unset) and sends people on to
`APP_URL#/n/<publication id>` (same README, "Short links").
Redeploy the worker before publishing an app that shares such links. A copy
hosted elsewhere sets the worker's `APP_URL` to its own address and
`FORKBUILD_LINK_PREVIEW_URL` in `core/app/ForkBuildAppLinks.js` to its worker.

### Embeds

**Embed** copies an `<iframe>` of `embed.html#<payload>`, which shows a
build inside another site's page. `embed.html` sits beside `index.html`
and loads `ui/embed/embedBoot.js` (bundled by `scripts/build.mjs` into its
own entry, sharing the app's chunks) and `css/embed.css`. It has its own
Content Security Policy: as `index.html`'s, with the same import map and
hash, but `connect-src 'self'` and `worker-src 'none'`. It opens no
storage and starts none of the app's connections, and the service worker
keeps it as itself, never in place of the app's page. Other sites must be
allowed to frame it: GitHub Pages sends no `X-Frame-Options`, and a host
that sends `frame-ancestors` must leave `embed.html` out (see
"Recommended HTTP headers"). The worker's `/oembed` (see the worker's
README) lets sites that embed links themselves turn a `/b/` link into the
same `<iframe>`; it is part of the same worker deployment.

## Everything is served from your own origin

The page loads no scripts, styles or fonts from anywhere else. The
third-party libraries the browser runs (Vue, Vue Router,
`@vue/devtools-api`, Three.js, and the noble cryptography libraries) are
copied into `vendor/` by `scripts/vendor.mjs` from the exact versions pinned
in `package.json`, and `index.html`'s import map points at those copies.
`tests/VendoredLibraries.test.js` fails if `vendor/` ever differs from what
the script produces.

To upgrade one of them: change its exact version in `package.json`, run
`npm install`, then `node scripts/vendor.mjs`. If a file name changed, update
the import map in `index.html`, then update the import map's hash in the
Content Security Policy (the failing `tests/ContentSecurityPolicy.test.js`
prints the new value).

The app does make network requests of its own, to the endpoints its features
use: Nostr relays, Arweave and IPFS gateways, an IPFS node (by default
`http://127.0.0.1:5001`), Bitcoin and Base APIs, Steem API nodes (and, when
a build is posted to Steem, the Steem image host), the rendezvous server, and
STUN servers. About 10 seconds after the app opens it starts reading
announcements from the relays, the Arweave gateway and the Steem nodes in
the background (docs/AnnouncementIndex.md, "Phase 4"). On the official site
only, it also loads one image a day from GoatCounter for the daily visitor
count, and one each time a share link is copied or shared, a shared link is
opened, or a build opened from one is copied into the Editor
(`core/app/VisitorCount.js`); a copy served from anywhere else never sends
them. Everything else waits for a feature to be used. docs/Privacy.md lists each server. When a peer connection starts (and only then), it asks the
rendezvous server for TURN relay credentials; the TURN provider's key lives
only on that server (see `server/rendezvous-worker/README.md`). Most of these
can be changed under **Network Settings**.

**The default rendezvous server serves only the GitHub Pages site.** The
reference deployment (`peer/RendezvousConfig.js`) accepts connections only
from `https://bowo-prasetyo.github.io` (`ALLOWED_ORIGINS` in
`server/rendezvous-worker/wrangler.toml`). A copy served from anywhere else,
including `http://localhost`, is refused, so finding peers there needs your
own rendezvous server (set it in `peer/RendezvousConfig.js` or under
**Network Settings**) or invitations; everything else works.

## Content Security Policy

`index.html` carries a Content Security Policy in a `<meta>` tag, so it
applies on any host. This is the repository's, which compiles templates in
the browser; the published site's (see "GitHub Pages") drops
`'unsafe-eval'` and the hash, leaving `script-src 'self' 'wasm-unsafe-eval'`
(`embed.html`, which has no voice building, has `script-src 'self'`):

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Nothing loads from elsewhere unless listed below. |
| `script-src` | `'self' 'unsafe-eval' 'wasm-unsafe-eval'` and the import map's hash | Scripts come only from this origin. No inline script runs except the import map. `'wasm-unsafe-eval'` lets voice building's speech engine compile its WebAssembly (application/voice/SpeechRuntime.js): it allows WebAssembly only, never JavaScript's `eval`, and the engine is refused unless its SHA-256 is the pinned one. The engine runs in a worker, which a browser may hold to the page's policy, so the page keeps it. |
| `style-src` | `'self'` | Only the app's own stylesheets. |
| `font-src` | `'self'` | Only the app's own fonts. |
| `img-src` | `'self' data: blob: https://forkbuild.goatcounter.com` | Thumbnails are rendered to `data:` images; the visitor count's hits are images from GoatCounter (docs/Privacy.md, "Visitor count"). |
| `media-src` | `'self' blob:` | Voice call audio. |
| `connect-src` | `'self' https: wss: http://127.0.0.1:* http://localhost:*` | Relays, gateways and APIs are user-configurable, so any HTTPS/WSS endpoint is allowed; plain HTTP only to a local IPFS node. |
| `worker-src` | `'self'` | The built site's service worker, `sw.js` (see "Installing and working offline"), and voice building's speech worker (`application/voice/speechWorker.js`, bundled to `bundle/voice/`). `embed.html` has `'none'`, and `connect-src 'self'` (see "Embeds"). |
| `object-src`, `frame-src` | `'none'` | Not used. |
| `base-uri`, `form-action` | `'none'` | Every form is handled in script. |

**`'unsafe-eval'` is only for the unbundled repository.** Served as it is,
the app has Vue compile the components' string templates in the browser,
which needs `new Function`. The published site is built with
`scripts/build.mjs`, which compiles them beforehand, so its policy leaves
`'unsafe-eval'` out; serve a build (`npm run build`) rather than the
repository wherever that matters. What the repository's policy still
guarantees: no script from another origin, and no injected inline script or
event handler attribute, can run.

## Recommended HTTP headers

A `<meta>` policy cannot set everything. If your host lets you add response
headers, also send:

    Content-Security-Policy: frame-ancestors 'none'
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
    Permissions-Policy: camera=(), geolocation=(), microphone=(self)

`frame-ancestors 'none'` stops other sites from embedding ForkBuild in a
frame (clickjacking); it only works as a header. When a policy arrives both
as a header and in the page, the browser enforces both. Send it for every
page except `embed.html`, which exists to be framed by other sites (see
"Embeds"); that page has nothing to click that changes anything, only a
link that opens ForkBuild in a new tab.
