# Launch kit

How ForkBuild goes to the places new builders are, in what order, what to
post, and how to tell which posts worked. The drafts here are starting
points to put in your own words: every community below dislikes copy that
reads like an advert, and most of them ask that you say you made it.

- [Show HN](ShowHN.md)
- [Product Hunt](ProductHunt.md)
- [Reddit](Reddit.md)
- [itch.io](ItchIo.md): published at <https://forkbuild.itch.io/forkbuild>
- [Game Jolt](GameJolt.md): the next storefront, with the same launcher
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
| Game Jolt | <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt> |
| IndieDB | <https://bowo-prasetyo.github.io/forkbuild/?ref=indiedb> |
| YouTube (the launch clip's description) | <https://bowo-prasetyo.github.io/forkbuild/?ref=youtube> |

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
- [ ] On the device you post from, **Post to Steem from this device** and
      **Post to Blurt from this device** are ticked (Network Settings → Steem
      and → Blurt). They start ticked where your account was already saved;
      a new visitor's start unticked, so their builds go to Nostr unless they
      switch one on.
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
- [ ] Your Reddit account has a history in the communities you'll post in,
      and a short screen recording is ready (see
      [Reddit](Reddit.md#before-you-post-the-account)).
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
| Tuesday–Thursday, once your Reddit account has a history there | r/threejs, then r/WebGL, then r/SideProject, a day apart, as text posts with a recording | Technical audiences likely to try a no-account, peer-to-peer app and say what breaks; fix what each finds before the next. Reddit's filter removes link posts from new accounts ([Reddit](Reddit.md#before-you-post-the-account)) |
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
- **Where do newcomers stop?** Against the daily count `/`, in the order a
  newcomer takes them: `/e/editor-open` (the Editor opened, any way in),
  `/e/starter-open` (a ready-made build opened from Home's main button or a
  challenge), `/e/editor-edit` (a first edit made), then the builds
  published (the five `/e/publish-bricks-…` paths). Each Editor step counts
  at most once a page load. The biggest drop between two of them is where
  to look first: few opening the Editor is Home's page; many opening it
  but few editing is the Editor's first minute; many editing but few
  publishing is Publish. The scorecard prints these first as FIRST STEPS.
- **How much did they build?** The five `/e/publish-bricks-…` paths, one per
  build published for the first time, so together they are the builds
  published. The range holding the middle one is the median build's size:
  `-0` (structures only), `-1` (1–9 bricks), `-10` (10–49), `-50` (50–199),
  `-200` (200 or more). Mostly `-1` means people publish a first try and
  leave; the kit and the guided first build are where to look. The five
  `/e/publish-placed-…` paths count the same builds by the bricks their
  builder placed or changed, ready-made ones left out: a ready-made build
  published untouched is `-0` there. That is the median the gate on new
  networks reads (core/LaunchTargets.js, `median-placed`).
- **Did they come back?** `/e/second-build` against the builds published:
  the share of builders who published a second one.
- **Do entrants look at each other's builds?** `/e/plaza-visit` against
  `/e/challenge-join`: visits to a week's challenge plaza.
- **Do people walk together?** `/e/walk-joined` against `/e/walk-link`:
  friends who arrived through a "Walk here with me" link, per link made.
- **Do people build together?** `/e/build-joined` against `/e/build-link`:
  friends who joined through a "Build with me" link, per link made; and
  `/e/publish-together` against `/e/build-joined`: builds made together
  that were published, crediting everyone who built.
- **Do builds have a family tree?** `/e/remix-published` against the builds
  published: remixes per build. `/e/remix-from-link` counts copies started
  from a link; this counts the ones finished and published.
- **Did it spread?** `/e/share-link` (links made), `/e/opened-shared-link`
  (links opened by someone), `/e/remix-from-link` (copies made from a link).
  Opened links per week is the number that says whether ForkBuild is being
  seen by people its makers didn't bring.
  `/e/share-link-short` counts the links made that were short ones (a build
  sent to everyone, `/n/…`): set against `/e/share-link`, it says how many
  links could be pasted into Discord or Telegram at all.

Each of these has a number to reach (docs/Pillars.md, "The numbers to
reach"). For a week, export the hits from GoatCounter (or write the totals
as lines of `/e/<event> <total>`) and run

```
node scripts/launch-scorecard.mjs export.csv
```

It prints each target as met, below, or too few to say, grouped by pillar,
and whether the gate on new networks is open.

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
