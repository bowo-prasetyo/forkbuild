# Launch kit

How ForkBuild goes to the places new builders are, in what order, what to
post, and how to tell which posts worked. The drafts here are starting
points to put in your own words: every community below dislikes copy that
reads like an advert, and most of them ask that you say you made it.

- [Show HN](ShowHN.md)
- [Product Hunt](ProductHunt.md)
- [Reddit](Reddit.md)
- [itch.io](ItchIo.md): published at <https://forkbuild.itch.io/forkbuild>
- [Nostr, Steem and Blurt](Communities.md)
- [Educators](Educators.md)
- [Press kit](PressKit.md): screenshots, one-liners, facts

## The link every post uses

Every post links to the site with a `ref` naming where it was posted:

| Channel | Link |
| --- | --- |
| Hacker News | <https://bowo-prasetyo.github.io/forkbuild/?ref=hn> |
| Product Hunt | <https://bowo-prasetyo.github.io/forkbuild/?ref=producthunt> |
| Reddit | <https://bowo-prasetyo.github.io/forkbuild/?ref=reddit> |
| itch.io | <https://bowo-prasetyo.github.io/forkbuild/?ref=itch> |
| Nostr | <https://bowo-prasetyo.github.io/forkbuild/?ref=nostr> |
| Steem | <https://bowo-prasetyo.github.io/forkbuild/?ref=steem> |
| Blurt | <https://bowo-prasetyo.github.io/forkbuild/?ref=blurt> |
| Teachers and schools | <https://bowo-prasetyo.github.io/forkbuild/?ref=edu> |
| The GitHub README | <https://bowo-prasetyo.github.io/forkbuild/?ref=github> |

A visit through one of these is counted once as `/r/<channel>` on the
public visitor counter, <https://forkbuild.goatcounter.com/>, under the same
rules as the daily count (official site only, never with Global Privacy
Control or Do Not Track, never when **Count this browser** is off; see
[Privacy](../Privacy.md#visitor-count)). The app then takes `ref` out of the
address, so a reload or a copied address doesn't count it again. Only the
values above are counted (core/LaunchChannel.js); anything else is ignored.
Links to one build (a shared link or an embed) don't need a `ref`: they
already have their own counts (`/e/opened-shared-link`, `/e/embed-open`).

## Before launch

Each of these is something a first visitor from a launch post will hit.

- [ ] The GitHub repository's description matches the README:
      "Build in 3D in your browser. Remix anything. Own your work." (Settings
      → General, and the About box's website set to the site with
      `?ref=github`), and topics `threejs`, `webgl`, `3d`, `nostr`,
      `local-first`, `p2p`, `browser-game`.
- [ ] This week's challenge has entries: publish three to five builds of the
      week's theme yourself and distribute them to Nostr, so the
      **Challenge** page isn't empty. Do the same for the next week before it
      starts.
- [ ] The press screenshots are current (`node scripts/press-kit.mjs`) and
      the Product Hunt gallery is uploaded.
- [ ] Open the site on a phone and a slow connection; open a shared link in
      a private window; check that the rendezvous worker's monthly TURN
      allowance (`TURN_CREDENTIALS_PER_MONTH` in
      `server/rendezvous-worker/wrangler.toml`) can take a spike of peers.
- [ ] Your Hacker News account has a history of taking part, so it can
      post a Show HN (see [Show HN](ShowHN.md#before-you-post-the-account)).
      Until it can, the launch goes ahead without it.
- [ ] Be free for the whole of launch day to answer every comment, and have
      a known-issues list ready (below).

## Order

One channel at a time, so each can be answered properly and its numbers read
on their own.

| Day | Where | Why then |
| --- | --- | --- |
| Monday | The week's challenge starts | The posts have something current to point at |
| Tuesday–Thursday | r/threejs, then r/WebGL, then r/SideProject, a day apart | Technical audiences likely to try a no-account, peer-to-peer app and say what breaks; fix what each finds before the next |
| Same week | Nostr, Steem, Blurt | Communities ForkBuild already publishes to |
| The following Tuesday, 12:01 am US Pacific | Product Hunt | Needs the gallery and a few early comments; runs the whole day |
| A Tuesday, 8–10 am US Eastern, once your HN account can post it | Show HN | Hacker News refuses Show HN from accounts without a history there ([Show HN](ShowHN.md#before-you-post-the-account)); by then the first fixes are in |
| Each Monday | A devlog on the itch.io page naming the week's theme | The page is up ([itch.io](ItchIo.md)); a devlog tells its followers there's something new |
| After the first weeks | Teachers | A slower, longer-lived channel |

## Measuring it

Read these on <https://forkbuild.goatcounter.com/> for the launch week and
the week after, by day:

- **Arrivals per channel:** `/r/hn`, `/r/producthunt`, `/r/reddit`, …
- **Did they build?** `/e/challenge-join` against the arrivals; the daily
  count `/`.
- **Did it spread?** `/e/share-link` (links made), `/e/opened-shared-link`
  (links opened by someone), `/e/remix-from-link` (copies made from a link).
  Opened links per week is the number that says whether ForkBuild is being
  seen by people its makers didn't bring.

The counter keeps totals only, so these are rough: a visitor who blocks the
counter isn't counted, and the paths can't be joined into one person's path.
That is on purpose (docs/Privacy.md).

## Known issues to say up front

Saying these before someone finds them reads as honest rather than
defensive:

- Everything lives in this browser: back up with **Your Data → Back Up to a
  File**; there is no account to recover.
- Distributing to Nostr needs a NIP-07 browser extension; Arweave, Steem and
  Blurt need their wallets. Sharing a link needs none of them.
- Talking to someone needs you both online and friends with each other.
- The challenge page finds others' entries only when they were distributed
  to Nostr, Arweave, Steem or Blurt.
