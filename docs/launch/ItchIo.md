# itch.io

itch.io is where people look for small browser games. ForkBuild can't run
inside itch's own frame as the full app: it keeps your builds in its own
site's storage, installs from its own address, and its rendezvous server
answers only the official site. So the itch page is a storefront that sends
players to the site.

**Page:** <https://forkbuild.itch.io/forkbuild> (published 9 October 2026;
brought up to 1.4 on 14 October 2026)

**Link:** <https://bowo-prasetyo.github.io/forkbuild/?ref=itch>

## The upload

[itch/index.html](itch/index.html) is the launcher: the castle behind a
paper card with the logo, the fantasy in one line and one big **Play
ForkBuild** button that opens the site in a new tab with `?ref=itch`. It
follows the device's light or dark look. Zip it with the castle shot beside
it, from the repository's root:

```
zip -j forkbuild-itch.zip docs/launch/itch/index.html docs/launch/press/editor-castle.png
```

Upload the zip, mark it **This file will be played in the browser**, and
delete the old upload. Re-zip after the press shots change.

## Every field on the edit page

| Field | Set it to |
|---|---|
| Title | ForkBuild |
| Short description | See below. |
| Classification | Games |
| Kind of project | HTML |
| Release status | Released |
| Pricing | No payments. (**$0 or donate** needs a payment account set up on itch first.) |
| Embed | **Embed in page**, manually set size 800 × 500 |
| Frame options | Tick **Mobile friendly** (orientation Default) and **Automatically start on page load**: the launcher is one small page, so players see its button straight away instead of itch's grey "Run game" box. Leave fullscreen, scrollbars and SharedArrayBuffer off. |
| Description | See below. |
| Genre | Simulation |
| Tags | `building`, `sandbox`, `3d`, `creative`, `open-source`, `multiplayer`, `cozy`, `co-op`, `relaxing`, `exploration` (ten, itch's limit; not `browser`, since itch asks that tags not repeat the platform) |
| AI generation disclosure | **Yes**, see below |
| App store links | None yet. Add Google Play or the Windows Store once ForkBuild is listed there (docs/reviews/Growth-2026-10-13.md, item 13). |
| Custom noun | Leave blank. |
| Community | **Comments** on. A page with comments looks alive, and they're where itch players say what broke. Answer them like any launch comment. |
| Visibility | Public |
| Cover image | `press/itch-cover.png` (630 × 500): the castle, with the logo, name and tagline on a paper band. |
| Gameplay video | `press/launch-clip.mp4`, uploaded to YouTube (or Vimeo) and its link pasted here: *Try it now → put the roof on → Publish it → Walk inside it*, 30 seconds, 1280 × 720, no sound, captioned, ending on where to play. Pages with a video are clicked more than pages without one. Remake it with `node scripts/launch-clip.mjs` after a visible change to those screens. |
| Screenshots | Four, in this order, from [the press kit](press/): `home-desktop.png`, `editor-castle.png`, `editor-harbor-island.png`, `home-phone.png`. None names a week's theme, so they don't go out of date. |
| Promo images | Under **Metadata → Promo images**: **Wide cover** `press/itch-wide-cover.png` (1260 × 540, 21:9; itch only features a game on its home page with one), **Social media image** `assets/social/forkbuild-card.png`, **Favicon** `assets/icons/icon-512.png`. Leave **Logo** empty until there is a wide, transparent logo with the name in it: itch shows the title instead. |

### AI generation disclosure

itch asks this of every project. ForkBuild's code, its text in every
language, its logo and drawings (made by code) and its music (synthesized by
code) were all written with an AI assistant, so the honest answer is **Yes**,
with **Code**, **Text & Dialog**, **Graphics** and **Sounds** ticked. itch
adds filtering tags from the answer, so some players who filter out AI work
won't see the page; answering "No" isn't an option.

## Short description

> Build a little village in 3D, remix anyone's build, and walk inside it with friends. No account.

## Description

> **Build a little place. Anyone can remix it. Walk inside it with friends.**
>
> ForkBuild is a 3D building game that runs in your browser, on a computer or
> a phone. Press **Try it now** and you get a little house with no roof:
> put one on, add a chimney, a path and a garden, and walk inside it.
>
> - **Fifty-nine bricks** that look like what they're made of: stone, timber,
>   plaster, roof tiles, glass and leaves, in sixteen village colours.
> - **Remix anything.** Every build you find can be copied and changed, and
>   every copy remembers who made the original, so each build has a family
>   tree.
> - **A weekly build challenge.** A new theme every Monday, each with a twist,
>   and every entry stands in a village round the week's plaza.
> - **Build with me and Walk here with me.** Send a friend one link and build
>   together live, or walk the village together, day and night.
> - **Share a build as a link** that shows a picture of it when you paste it,
>   embed it in a web page, or download it for Blender or a 3D printer.
>
> No account, no download, no ads. Your builds stay on your device until you
> share them. Free and open source, in eight languages.
>
> **Play opens ForkBuild in a new tab**, on its own site, so your builds are
> saved there and it can be installed as an app.
>
> Play: <https://bowo-prasetyo.github.io/forkbuild/?ref=itch>
> Source: <https://github.com/bowo-prasetyo/forkbuild>

## Devlogs

Each Monday, post a devlog naming the new challenge theme and its twist,
with one entry from last week, so the page's followers hear there's
something new. When a release ships, post one for it. For 1.4:

> **ForkBuild 1.4: the builder's release**
>
> 1.4 is about building. Try it now hands you a house to finish, the kit has
> fifty-nine bricks that can tilt onto any side, and doors and arches you can
> walk through. Builds you send to everyone get a short link that works in
> Discord and Telegram. Friends can build together live or walk the village
> together from one link. The world has day and night, a sun and moon,
> shadows, stars and music, and the app has a warm, village-coloured look
> with a dark version.
>
> This week's challenge is on the Challenge page. Play:
> <https://bowo-prasetyo.github.io/forkbuild/?ref=itch>
>
> Everything in this release:
> <https://github.com/bowo-prasetyo/forkbuild/blob/main/docs/ReleaseNotes-1.4.md>

## Measuring it

Arrivals from the page are counted as `/r/itch` (see the
[launch kit](README.md#measuring-it)). itch's own **Analytics** tab shows
views, plays (clicks on the launcher's frame) and referrers; plays against
`/r/itch` says how many people who opened the launcher also pressed its
button.
