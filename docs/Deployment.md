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

`dist/` is the repository's files as they are (without `tests/`, `server/`
and `.github/`), plus the app bundled by esbuild into `bundle/` and an
`index.html` that loads it:

- The first load is about 80 minified files instead of about 600 modules;
  every page, service group, translation and the thumbnail renderer is still
  its own file, loaded when first needed.
- Bare imports resolve through `index.html`'s import map, so the bundle runs
  the same vendored files. The published `index.html` has no import map, so
  its Content Security Policy has no hash for one; `'unsafe-eval'` stays, for
  Vue's template compiler.
- File names carry a content hash, so a page opened after a new deployment
  never mixes old and new files. Someone with the old version open who then
  opens a page whose files are gone gets the "This page couldn't load" notice
  and reloads onto the new version.
- Everything else is served unchanged, including `scripts/steem-threads/`.
- Source maps (`.map`) sit beside the bundled files, so the browser's
  developer tools show the original source.

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
and its icons (`favicon.svg`, and `assets/icons/` for browsers that want
PNGs, including a maskable one), so browsers that install web apps can
install ForkBuild from the address bar. Its addresses are relative, so it
works unchanged wherever the folder is served. There is no service worker:
an installed ForkBuild still needs its host to load. The manifest is fetched
from the page's own origin, which `default-src 'self'` already allows.

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
count (`core/VisitorCount.js`); a copy served from anywhere else never
sends it. Everything else waits for a feature to be used. docs/Privacy.md lists each server. When a peer connection starts (and only then), it asks the
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
applies on any host:

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Nothing loads from elsewhere unless listed below. |
| `script-src` | `'self' 'unsafe-eval'` and the import map's hash | Scripts come only from this origin. No inline script runs except the import map. |
| `style-src` | `'self'` | Only the app's own stylesheets. |
| `font-src` | `'self'` | Only the app's own fonts. |
| `img-src` | `'self' data: blob: https://forkbuild.goatcounter.com` | Thumbnails are rendered to `data:` images; the daily visitor count is one image from GoatCounter (docs/Privacy.md, "Visitor count"). |
| `media-src` | `'self' blob:` | Voice call audio. |
| `connect-src` | `'self' https: wss: http://127.0.0.1:* http://localhost:*` | Relays, gateways and APIs are user-configurable, so any HTTPS/WSS endpoint is allowed; plain HTTP only to a local IPFS node. |
| `object-src`, `frame-src`, `worker-src` | `'none'` | Not used. |
| `base-uri`, `form-action` | `'none'` | Every form is handled in script. |

**`'unsafe-eval'` is a known limitation.** Vue compiles the components'
string templates in the browser, which needs `new Function`. Removing it
means precompiling templates, which needs a build step. What the policy
still guarantees: no script from another origin, and no injected inline
script or event handler attribute, can run.

## Recommended HTTP headers

A `<meta>` policy cannot set everything. If your host lets you add response
headers, also send:

    Content-Security-Policy: frame-ancestors 'none'
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
    Permissions-Policy: camera=(), geolocation=(), microphone=(self)

`frame-ancestors 'none'` stops other sites from embedding ForkBuild in a
frame (clickjacking); it only works as a header. When a policy arrives both
as a header and in the page, the browser enforces both.
