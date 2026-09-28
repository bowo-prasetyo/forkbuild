# ForkBuild 1.1 release notes

*Released 2026-09-28 as version 1.1.0.* For 1.0, see
[ReleaseNotes-1.0.md](ReleaseNotes-1.0.md).

1.1 fixes two security problems in 1.0.0, so update. It also moves storage
to IndexedDB, adds a compact document format, touch controls, a public
lobby, share links, background discovery and, as an Experimental option,
Steem.

## Security

- **Content hashes are SHA-256** (advisory GHSA-8ggw-xpjf-w4rh). In 1.0.0 a
  build's content hash was 32-bit FNV-1a, which anyone can match with a
  different build in milliseconds. A Publication's signature covers its
  hash, so a forged build could show under another author's name and valid
  signature, served by a peer, a gateway, a node or anyone announcing a
  Snapshot. Publications are now hashed with SHA-256.
  - Your own earlier publications still open on your device. Other people's
    publications from before 1.1 are refused, with a message saying their
    author needs to publish them again.
  - Blueprint fingerprints, which authorship and lineage claims name designs
    by, are SHA-256 too. Older claims are no longer counted or imported;
    re-sign your own from a structure's **Info** panel
    (**Re-sign for this design**).
- **A signature's key must be the one its did:key names.** In 1.0.0 a
  record that carries its signer's identity (a Publication, a placement, an
  anchor) was checked against the key it carried, without checking that the
  key belongs to the did:key it names, so anyone could sign with their own
  key and label the record with someone else's identity. Every such record
  is now refused.

## New

- **Storage:** data is kept in an IndexedDB database instead of
  `localStorage`, so it is no longer limited to a few megabytes; existing
  data moves over on first start. Published content and snapshots stay on
  disk until they are needed instead of being held in memory.
- **Large builds:** bricks are drawn as instanced meshes, a few hundred draw
  calls for tens of thousands of bricks instead of one each.
- **Document schema 2:** stored and published documents keep bricks as a
  compact table, and new bricks get 12-character ids, making a large build
  about a fifth of its former size. Schema 1 documents are upgraded when
  opened, and published schema 1 snapshots still verify; version 1.0.0
  cannot open schema 2 documents.
- **Sharing large builds:** peers send content too large for one message in
  parts. Arweave takes at most 256 KiB per build, and a larger one is
  refused before anything is signed, pointing to IPFS.
- **Finding people:** an opt-in public lobby (one for everyone and one per
  World); rendezvous servers carry the connection reply back, so Find by ID
  and Known Peers connect without copying anything by hand. **Be
  Discoverable** says to unlock a locked identity instead of failing.
- **Sharing:** **Share with Peers** sends a published World to connected
  peers' Repositories, and a distributed Publication has a link that opens
  it in World View on any device (`#/view/steem/…`, `#/view/ar/…`,
  `#/view/ipfs/…`).
- **Background discovery:** the app keeps a local index of every
  announcement it has seen and, about 10 seconds after it opens, starts
  reading new ones from Nostr, Arweave and Steem in the background. 1.0.0
  contacted nothing on its own; see [docs/Privacy.md](Privacy.md).
- **Steem (Experimental):** a third substrate for announcements and content
  and a fourth anchor type, signed through Steem Keychain.
- **Placement:** a publisher can limit who may place a Publication, and a
  publisher's own placement travels with its Snapshot announcement, so a
  build appears where its publisher put it.
- **Phones and tablets:** touch controls in both views, including a
  hands-free Cruise, box selection, and vehicles and animals by touch, and a
  compact layout.
- **Layout:** World View's panel, the Editor's sidebar (one contextual
  Selection panel) and the Peers page (one People list) are reorganized.
  Unpublish and Distribute appear only on your own World in World View.
- **Network Settings** default to several free public servers per list,
  with Reset to Defaults.
- **Publications page:** the Bitcoin wallet is on the page, and the
  Publications guide is split into four shorter guides.

## Fixes

- World View's **Home** key goes home, as the guides say.

## Upgrading from 1.0.0

- Your data moves from `localStorage` to IndexedDB the first time 1.1 opens.
  After that, 1.0.0 can't open documents saved in the new format.
- Publications you made with 1.0.0 still open on your device. To let other
  people open one, publish it again. Ask the authors of other people's
  publications from before 1.1 to do the same.
- Blueprint authorship claims from 1.0.0 no longer count. Open each of your
  structures' **Info** panel and choose **Re-sign for this design**, and
  declare lineage again with **Derived from this**.
- Operators of a rendezvous server: redeploy `server/rendezvous-worker/` for
  the answer mailbox and the public lobby.

## Known limitations

- **Storage:** everything is kept in the browser's own storage. Export
  documents and identities you want to keep; clearing the site's data
  deletes them.
- **`'unsafe-eval'`:** the security policy still allows it, because Vue
  compiles the app's templates in the browser. Removing it needs a build
  step.
- **One rendezvous server** runs by default. If it is down, use invitations
  (copy and paste) to connect, or configure another server under **Network
  Settings**.
- **Re-publishing** an older publication is a manual step; there is no
  one-click upgrade yet.
