# Security Policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use
GitHub's private vulnerability reporting: open the repository's **Security**
tab and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do
with it. We aim to acknowledge a report within 7 days and to agree on a fix
and disclosure date with you. Please give us a reasonable time to release a
fix before publishing details; we will credit you unless you prefer
otherwise.

## Supported versions

Security fixes go into the latest release. Older versions are not patched;
update to the latest.

## Scope

In scope:

- the web app in this repository: identity keys and their encryption
  (`identity/`), signatures and their verification, peer authentication
  (`peer/`), and anything that lets a page, peer or server read or change what
  it shouldn't;
- the reference rendezvous server (`server/rendezvous-worker/`), including
  its TURN credential endpoint;
- the Content Security Policy and the vendored libraries (`vendor/`, see
  [docs/Deployment.md](docs/Deployment.md)).

Out of scope:

- vulnerabilities in the third-party services the app can use (Nostr relays,
  Arweave and IPFS gateways, Bitcoin and Base endpoints, TURN providers,
  browser wallets): report those to their operators;
- someone with access to your unlocked device or browser profile;
- denial of service against a deployment's own infrastructure beyond what the
  rendezvous server's limits are meant to prevent;
- features marked **Experimental** may still have known gaps, but reports are
  welcome.

## How ForkBuild protects you

- Identity keys are Ed25519, signed and verified with the audited
  noble-curves library. Private keys are encrypted with your passphrase using
  PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM through the browser's
  WebCrypto.
- Every script is served from the app's own origin under a Content Security
  Policy; nothing loads from a CDN.
- Peers prove who they are with a signed challenge on every connection. The
  rendezvous server only accepts entries signed by the identity they name.
- Published content is verified by content hash and signature, never taken
  on trust.

See [docs/Privacy.md](docs/Privacy.md) for what the app stores and which
servers it contacts.
