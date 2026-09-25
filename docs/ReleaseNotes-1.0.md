# ForkBuild 1.0 release notes

*Draft for the 1.0 release. The app still reports version 0.9.703 until the
release is tagged.*

ForkBuild is a browser-based building platform: build with bricks, publish
what you make, fork other people's work like source code, and explore
everything published in a shared 3D world. There are no accounts: your
identity is a key pair on your own device, and you connect to other people
directly.

## What 1.0 includes

**Stable core**

- **Editor:** bricks and ready-made structures, selection, a transform gizmo,
  groups, colors, undo/redo, a command palette, your own blueprint library,
  save, autosave with crash recovery, and document export/import.
- **World View:** a shared world on generated terrain with water, trees and
  wildlife; an avatar you can walk, run, climb and jump with; vehicles and an
  inventory; search, a map, named places, and **Edit a Copy** to fork what
  you find.
- **Publishing and forking:** immutable, content-hashed publications, licenses
  and fork policies, lineage, and the Repository and Author catalogs.
- **Identity:** Ed25519 identities protected by a passphrase, with export and
  import, succession, revocation and multi-device grants.
- **Peers:** direct, authenticated WebRTC connections found through rendezvous
  or an invitation; remembered peers, friends and blocking; chat with offline
  delivery and read receipts; voice calls; shared avatar presence;
  collaborative World editing.

**Experimental** (marked in the app with an **Experimental** banner; may
change or be removed in a later version, and what it produces may not carry
over)

- the **Publications** page and decentralized publication over Arweave, IPFS
  and Nostr;
- external evidence and anchoring on Bitcoin, Arweave and Base;
- the Leaderboard, reconciliation and publisher snapshot claim pages.

## Changes since 0.9.703

**Security**

- Identity keys are signed and verified with the audited noble-curves library
  instead of hand-written code, and private keys are encrypted with
  PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM through WebCrypto instead
  of a home-made cipher with 600 iterations. There is no longer a
  `Math.random` fallback for key generation.
- New identities get a passphrase by default (at least 8 characters). An
  unprotected identity is marked **⚠ Unprotected**, and can be protected from
  **My Identities**.
- Vue, Vue Router and Three.js are served from the app itself instead of a
  CDN, under a Content Security Policy.
- The rendezvous server only accepts entries signed by the identity they name,
  refuses replayed entries, and limits message size, entry lifetime, request
  rate and connections per address.
- The app no longer contains a TURN provider key, and no longer contacts
  anything when it opens. Relay credentials come from the rendezvous server,
  expire after an hour, and are requested only when a connection starts.

**Fixes**

- Placing bricks while logged out no longer raises an error on every brick.
- When the browser's storage is full, saving and crash recovery say so and
  point to **Export**, instead of suggesting "Try again".

**Documentation and project**

- New: [docs/Privacy.md](Privacy.md) (what the app stores and every server it
  contacts), [docs/Deployment.md](Deployment.md) (hosting and the security
  policy), [SECURITY.md](../SECURITY.md) and
  [CONTRIBUTING.md](../CONTRIBUTING.md).
- The test suite (about 800 files) runs on every pull request. Tests that
  searched source text instead of checking behavior were removed.

## Upgrading from 0.9.x

- **Identities:** keys protected under the old scheme still unlock with your
  passphrase and are re-encrypted in the new format the first time you do.
  Identity files exported by 0.9.x still import.
- **Being discoverable** now needs your identity unlocked, because the
  rendezvous server only accepts signed entries.
- **Operators of a rendezvous server:** redeploy `server/rendezvous-worker/`.
  To offer a TURN relay, set `METERED_DOMAIN` and the `METERED_SECRET_KEY`
  secret. If you used the Metered API key that earlier versions of the app
  contained, rotate it: it was public.

## Known limitations

- **Storage:** everything is kept in the browser's own storage, a few
  megabytes per site. Export documents and identities you want to keep;
  clearing the site's data deletes them.
- **`'unsafe-eval'`:** the security policy still allows it, because Vue
  compiles the app's templates in the browser. Removing it needs a build step.
- **One rendezvous server** runs by default. If it is down, use invitations
  (copy and paste) to connect, or configure another server under **Network
  Settings**.
- **Browsers:** current Chrome, Edge, Firefox and Safari. The controls need a
  mouse and keyboard; touch input isn't supported yet.
- The roadmap has no entries for 0.9.400 to 0.9.586; those milestones' notes
  were not kept.
