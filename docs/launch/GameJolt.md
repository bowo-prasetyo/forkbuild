# Game Jolt

Game Jolt is the site most like itch.io: indie games with a page each, a
community feed, followers and posts. Like itch.io, it can't host ForkBuild
itself (builds are kept in the site's own storage, the app installs from
its own address, and its rendezvous server answers only the official site),
so the Game Jolt page is a storefront that sends players to the site, with
the same launcher as itch.io's.

**Page:** <https://gamejolt.com/games/forkbuild/1108002> (published 16 October 2026)

**Link:** <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt>

The fields below are named as Game Jolt's game dashboard named them on 16
October 2026, page by page (**Details**, **Description**, **Design**,
**Packages**, **Maturity**, **Settings**).

## The upload

[gamejolt/index.html](gamejolt/index.html) is the launcher: the itch.io one
with Game Jolt's `ref`, so its **Play ForkBuild** button opens the site in a
new tab with `?ref=gamejolt`. Game Jolt wants `index.html` at the top of the
zip, not in a folder. Zip it with the castle shot beside it, from the
repository's root:

```
zip -j forkbuild-gamejolt.zip docs/launch/gamejolt/index.html docs/launch/press/editor-castle.png
```

Under **Packages**, make a package (call it *ForkBuild*), add a release
with **Version Number** `1.6.1` (the app's own version in package.json; a
new release starts at 0.1.0, so change it), and upload the zip under
**Upload Browser Build**. Leave **Fit to screen?** off: the launcher is one
small card, and a full-screen frame only stretches the castle behind it.
Leave **HTTPS support?** on. Publish the release; releases start hidden.

Re-zip after the launcher or the castle shot changes, and add a new release
for each app release so the page's version stays current.

## Every field

| Page → field | Set it to |
|---|---|
| Details → Development Stage | **Complete/Stable**: ForkBuild is released (1.4) and has a playable build, the launcher. |
| Details → Title | ForkBuild |
| Details → URL Path | `forkbuild`: the page's own address on Game Jolt, letters, numbers and hyphens only. The site's link goes in **Website**, not here. |
| Details → Website (optional) | <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt> |
| Details → Engine/Language/Creation Tool | **HTML 5/JS** |
| Details → Add to partner system? | Off. It only applies to paid games. |
| Description → Game Description | See below, with the hashtags at its end. |
| Description → Game Tags | **#other**. The listed tags are genres (action, horror, puzzle…) and none fits a building game; Game Jolt takes your own tags as `#hashtags` in the description instead: `#building #sandbox #cozy #3d #multiplayer #coop #opensource #creative #relaxing #exploration`, one word each, so `co-op` and `open-source` lose their hyphens. |
| Design → Change Header | `press/itch-wide-cover.png` (1260 × 540): the logo, name and the fantasy beside the castle. |
| Design → Add Media | The same four screenshots as itch.io, in this order: `home-desktop.png`, `editor-castle.png`, `editor-harbor-island.png`, `home-phone.png`; and the launch clip's YouTube link (`press/launch-clip.mp4`). |
| Design → Game Thumbnail | `press/itch-cover.png` (630 × 500), or a crop of `press/editor-castle.png` if the form asks for another size. Required before the page can be published. |
| Design → Color Theme | The app's green, `#357f52`, if it's offered. |
| Maturity → Age Rating | **All Ages**, with every content descriptor (violence, substances, sex/nudity, language, humor, gambling) at **None**. The form doesn't ask about players talking to each other; the description says there's chat and voice. |
| Music | Nothing for now: it takes MP3s only, and ForkBuild's music is synthesized as it plays. |
| Settings → Allow comments? | On. Answer them like any launch comment. |
| Settings → Allow ratings? | On. |

The dashboard has no ads setting and no generative-AI question. Game Jolt
shows its own ads on game pages, so the description says ForkBuild has no
ads *in the game*, rather than a bare "no ads" sitting beside one.

## Description

> **Build a little place. Anyone can remix it. Walk inside it with friends.**
>
> ForkBuild is a 3D building game that runs in your browser, on a computer
> or a phone. Press **Try it now** and you get a little house with no roof:
> put one on, add a chimney, a path and a garden, and walk inside it. Every other ready-made
> build (a castle, a harbor island, a village square) asks you to make it
> yours too.
>
> - **Fifty-nine bricks** that look like what they're made of: stone,
>   timber, plaster, roof tiles, glass and leaves, in sixteen village
>   colours.
> - **Remix anything.** Every build you find can be copied and changed, and
>   every copy remembers who made the original, so each build has a family
>   tree.
> - **A weekly build challenge.** A new theme every Monday, each with a
>   twist, and every entry stands in a village round the week's plaza.
> - **Build with me and Walk here with me.** Send a friend one link and
>   build together live, or walk the village together, day and night.
> - **Share a build as a link** that shows a picture of it when you paste it,
>   embed it in a web page, or download it for Blender or a 3D printer.
>
> No account, no download, no ads in the game. Your builds stay on your
> device until you share them. Free and open source, in eight languages.
>
> **Play opens ForkBuild in a new tab**, on its own site, so your builds are
> saved there and it can be installed as an app.
>
> Play: <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt>
>
> Source: <https://github.com/bowo-prasetyo/forkbuild>
>
> #building #sandbox #cozy #3d #multiplayer #coop #opensource #creative #relaxing #exploration

## Posts

Game Jolt's game pages have posts, which go to the page's followers and the
feeds of the communities they're shared to. Post the same Monday challenge
devlog as on itch.io (see [itch.io](ItchIo.md#devlogs)), with the
`?ref=gamejolt` link instead of `?ref=itch`, and an image: posts without one
are easy to scroll past.

Share each post to one or two **communities** that fit (building, cozy or
indie-games communities), following each community's own rules about
self-promotion.

## Measuring it

Arrivals from the page are counted as `/r/gamejolt` (see the
[launch kit](README.md#measuring-it)). Game Jolt's dashboard shows the
page's views and plays; plays against `/r/gamejolt` says how many people who
opened the launcher also pressed its button, as with itch.io. Give it the
same few weeks as itch.io before comparing the two.
