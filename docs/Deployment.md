# Deployment

ForkBuild is a static site: serve the repository folder (or a copy of it
without `node_modules/`, `tests/` and `server/`) from any static web host.
There is no build step and no application server. The rendezvous server in
`server/rendezvous-worker/` is deployed separately; see its README.

## Requirements

- **HTTPS.** WebCrypto (used to protect identity keys), microphone access for
  voice calls and WebRTC all require a secure context. `http://localhost` is
  treated as secure for local development.
- **JavaScript MIME type.** `.js` and `.mjs` files must be served as
  `text/javascript`; browsers refuse ES modules served with another type.
- **A current browser** with import maps, ES modules and WebCrypto: recent
  Chrome, Edge, Firefox or Safari.

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
`http://127.0.0.1:5001`), Bitcoin and Base APIs, the rendezvous server, STUN
servers, and the TURN credential service in `peer/IceServerConfig.js`. Most
of these can be changed under **Network Settings**.

## Content Security Policy

`index.html` carries a Content Security Policy in a `<meta>` tag, so it
applies on any host:

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Nothing loads from elsewhere unless listed below. |
| `script-src` | `'self' 'unsafe-eval'` and the import map's hash | Scripts come only from this origin. No inline script runs except the import map. |
| `style-src` | `'self'` | Only the app's own stylesheets. |
| `img-src` | `'self' data: blob:` | Thumbnails are rendered to `data:` images. |
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
