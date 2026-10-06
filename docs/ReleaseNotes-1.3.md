# ForkBuild 1.3 release notes

*Released 2026-10-06 as version 1.3.0.* For 1.2, see
[ReleaseNotes-1.2.md](ReleaseNotes-1.2.md).

1.3 adds Blurt as a fifth decentralized network, speaks French and Korean,
lets avatars swim and dive in a World that now has open sea, and makes
Worlds that others distributed show up in your Repository. It also fixes
mirrored directions: East is now on your right, and left turns go left.
There are no security fixes in this release. The official site now counts
daily visitors (see "Privacy" below). The protocol gains Blurt and a few
optional fields, all described in [Protocol.md](Protocol.md);
`PROTOCOL_VERSION` is unchanged.

## New

- **Blurt (Experimental):** Blurt can announce, store and anchor your work,
  like Nostr, Arweave, IPFS and Steem. There is no ForkBuild account on
  Blurt: you post from your own account through Blurt Keychain, as a post
  in the `forkbuild` category that keeps its payout and earns BLURT when
  upvoted. One Distribute makes one build post, and later announcements
  and anchors are added to it. ForkBuild works out Blurt's fee before
  posting and stops if your balance is too low. Posts are found through
  Blurt's Nexus indexer, so builds stay findable after their seven-day
  payout. Pictures upload to Blurt's image host, or through the rendezvous
  worker when the browser can't reach it. Blurt appears wherever Steem
  does, with a new **Network Settings → Blurt** page. A Signed Claim asks
  Keychain for two approvals, and the second window may open behind the
  browser.
- **Languages:** ForkBuild can be shown in French and Korean, so it now
  speaks eight languages. The user guide is translated into both.
- **Swimming and the sea:** World View has open sea, far from the origin
  so the land under existing builds is unchanged. Avatars wade until the
  water reaches their neck, then swim. `C` dives and `Space` rises, and an
  **Air** meter shows how long you can stay under. Fish and seaweed live
  on lake and sea beds, and the view turns blue-green under water. Touch
  screens get **Dive** and **Swim Up** buttons. Bicycles, motorcycles and
  cars stop at the waterline, and a drone can fly over the water and land
  on it.
- **Finding others' Worlds:** opening the Repository or an author's page
  now searches Nostr, Arweave, Steem and Blurt for Worlds others distributed, and
  lists the ones that pass their check, with **Check again**. A World you
  unpublish on this device isn't listed again from the networks, although
  copies already distributed stay there for others.
- **Shared with you:** each shared World is listed by its signed title,
  and a share whose World doesn't have that title is refused. You can
  dismiss shares you don't want. The panel explains old shares, shares
  their sharer didn't send, and Worlds whose old content hash peers can't
  check.
- **Distribute everywhere you publish:** after publishing authorship of a
  structure or a place name, a **Distribute** step is offered, as it
  already was for Worlds. Place names can go to any network, and World
  View's comments go to the network you choose. Publishing still never
  distributes by itself.
- **Placement travels with a build:** opening a Publication link shows the
  build where its publisher placed it, and the Editor's Distribute
  announces that placement.
- **Timber framing:** two new bricks, a square **Post** and a diagonal
  **Brace** (turn it 180° for the other diagonal). The 45° slope is now
  drawn as the wedge it has always been walked as, and the Village
  library's roofs were redone to match.
- **Tags and formatted descriptions:** a build can have up to five tags,
  set in Document Properties, which suggests some from the title and
  description. A description can use a little formatting: paragraphs,
  headings, bullet lists, **bold** and *italic*. Blurt posts and Steem
  notices show the whole description, up to 2,000 characters, with its
  formatting, and Blurt posts list the tags.
- **Known Peers connect on joining a lobby:** joining a public lobby gives
  each Known Peer one automatic connection attempt, as Be Discoverable
  does. Strangers in the lobby are never connected on their own.
- **Steem pictures again:** Steem notices regain their picture by going
  through the rendezvous worker, since steemitimages.com stopped allowing
  uploads from other sites. A notice that still goes out without its
  picture now says why.

## Fixes

- **Directions:** the compass, the world map and every spoken direction
  were mirrored. Facing North, East is now on your right. `A` and `D`, the
  `←`/`→` steering pulses and the touch turn buttons turn the way they say.
- **Vehicles:** wheels now roll in the direction of travel instead of
  standing sideways, and riders face the way their vehicle points.
  Reversing or sliding along a wall no longer spins the vehicle.
- **Collision:** turned bricks block, and are walked on, where they are
  drawn. Walls built from turned segments no longer let avatars through,
  and turned floors no longer drop them.
- **Explore** opens the World you asked for. Before, a World you had
  visited could open at a camera framing saved somewhere else.
- After a reload, the avatar starts outside the build, and each World
  keeps its own saved camera framing. The view-mode buttons show the
  restored perspective.
- The location reading names the sea.
- The animation loop keeps running after an error in one frame.
- Document Properties is wider, with a larger description field.

## Privacy

The official site (`https://bowo-prasetyo.github.io`) now counts visitors
once a day with GoatCounter. The count is one image request with a fixed
path, without a cookie, a referrer or anything about your builds or
identity. It is never sent from copies hosted elsewhere or when your
browser sends Global Privacy Control or Do Not Track. You can turn it off
under **Your Data → Daily visitor count**. See
[Privacy.md](Privacy.md), "Visitor count", which also lists the Blurt
nodes and image hosts ForkBuild can contact.

## Upgrading from 1.2.0

- Nothing to do for your data: 1.3 opens everything 1.2 saved.
- If you run your own rendezvous worker, redeploy it (`wrangler deploy`)
  for the `/steem-image` and `/blurt-image` picture relays.
- New World content needs 1.3.0 to show:
  - **Builds that use the Post or Brace bricks** can't be fully drawn by
    1.2.0.
  - **Tags** are dropped by 1.2.0 if it saves the build.
  - **Formatted descriptions** show their marks (`**`, `#`, `-`) as plain
    text in 1.2.0.
- **Sharing with peers:** a World shared from 1.3.0 carries its signed
  title, which 1.2.0 can't verify, so it refuses the share. Peers who share
  Worlds with each other should both update.
- Players still on 1.2.0 see someone swimming or diving floating at the
  water surface.

## Known limitations

The limitations listed for 1.2 still apply: everything is kept in the
browser's own storage (back it up on **Your Data**), the security policy
still allows `'unsafe-eval'`, one rendezvous server runs by default, and
re-publishing an older publication is a manual step. Also:

- **Blurt** and **Steem** stay Experimental. Blurt has been tried against
  live nodes and a real Blurt Keychain.
- Unpublishing a World on one device doesn't hide it on your other
  devices, and Worlds unpublished before 1.3 that were already found
  again stay listed.
- Finding others' Worlds checks at most 20 new records per visit or
  **Check again**.
