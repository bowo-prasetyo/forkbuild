# Show HN

[Show HN](https://news.ycombinator.com/showhn.html) is for things people can
try. ForkBuild fits: no sign-up, nothing to install. Post it yourself, as the
person who made it, and stay to answer comments for the first few hours.

**Link:** <https://bowo-prasetyo.github.io/forkbuild/?ref=hn>

## Before you post: the account

Hacker News can refuse a Show HN from an account without a history on the
site. In October 2026 it was turning them away with "We're temporarily
restricting Show HNs because of a massive influx, mostly by users who
aren't yet familiar with the site or its culture", and asking newcomers to
take part first. So Show HN doesn't come first in the launch order (see
[Order](README.md#order)):

- Use an account you already comment from. If you don't have one, start
  weeks ahead: read the [guidelines](https://news.ycombinator.com/newsguidelines.html)
  and [welcome page](https://news.ycombinator.com/newswelcome.html), and
  comment where you have something to add, such as threads on browser 3D,
  Three.js, WebRTC, Nostr or local-first apps.
- Then submit, as below. If it's refused again, carry on with the other
  channels and try later; nothing else in the launch waits on it.
- Don't get round the refusal: no posting the same link as an ordinary
  story, and no asking anyone else to post or upvote it. HN treats both as
  abuse, and a penalty on the site's domain would also sink the Show HN
  when it does go up.

## Title (80 characters at most)

> Show HN: ForkBuild – Build 3D in the browser, fork anything, no accounts

Alternatives:

> Show HN: Git-style forking for 3D brick builds, local-first and peer-to-peer

> Show HN: A browser building game where every build can be forked and remixed

## First comment

Post this as the first comment right after submitting:

> Hi HN, I made ForkBuild, a 3D building app that runs in the browser.
> You snap bricks into houses, bridges or whole villages, and any published
> build can be forked: you get your own copy, and it remembers where it came
> from, a bit like Git for 3D.
>
> A few choices that might be interesting here:
>
> - No accounts and no backend for your data. Your identity is a key pair in
>   your browser; builds are signed, and named by the SHA-256 of their
>   content.
> - A shared link carries the signed build itself in the URL fragment, so it
>   opens on any device without a server holding anything. A small
>   Cloudflare Worker only draws the link preview picture.
> - Builds can optionally be announced on Nostr and stored on Arweave or
>   IPFS; people connect to each other directly over WebRTC.
> - Every week has a build challenge (this week: <theme>), and builds export
>   to glTF, OBJ and STL for Blender or a 3D printer.
>
> It's open source (MPL-2.0), about <N> lines of vanilla JS, Vue 3 without a
> build step, and Three.js: https://github.com/bowo-prasetyo/forkbuild
>
> Known rough edges: everything lives in one browser unless you back it up,
> and talking to someone needs you both online. I'd love to hear what breaks
> and what you'd build.

Fill in `<theme>` and `<N>` on the day.

## Answering

- Answer questions about the architecture with links into `docs/`
  (Architecture, Protocol, Privacy).
- Say plainly what doesn't work yet; offer to file an issue and do it.
- Don't ask anyone to upvote, anywhere: HN penalizes it.
