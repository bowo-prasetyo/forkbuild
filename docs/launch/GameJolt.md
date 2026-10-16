# Game Jolt

Game Jolt is the site most like itch.io: indie games with a page each, a
community feed, followers and posts. Like itch.io, it can't host ForkBuild
itself (builds are kept in the site's own storage, the app installs from
its own address, and its rendezvous server answers only the official site),
so the Game Jolt page is a storefront that sends players to the site, with
the same launcher as itch.io's.

**Page:** not published yet. Put its address here once it is.

**Link:** <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt>

Game Jolt's add-game form has changed over the years and its help pages lag
behind it, so a field below marked *(check)* is named from older guides:
use whatever the live form calls it.

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
(version `1.4.0`, the app's own version in package.json), and upload the
zip as a **browser build** (*HTML*). Set its size to **800 × 500**, as on
itch.io, rather than **Fit to screen**: the launcher is one small card, and
a full-screen frame only stretches the castle behind it. Publish the
release; releases start hidden.

Re-zip after the launcher or the castle shot changes, and add a new release
for each app release so the page's version stays current.

## Every field

| Field | Set it to |
|---|---|
| Title | ForkBuild |
| Website *(check)* | <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt> |
| Category | **Other**, or **Strategy/Sim** if the list has no closer fit. Game Jolt has no "sandbox" or "building" category; the tags say that. |
| Development status | **Complete**, with updates: ForkBuild is released (1.4), and a "Complete" game needs a build, which the launcher is. |
| Engine/Language/Creation Tool *(check)* | **HTML5** (or **JavaScript**, whichever the list offers) |
| Description | See below. |
| Tags | `building`, `sandbox`, `cozy`, `3d`, `multiplayer`, `coop`, `opensource`, `creative`, `relaxing`, `exploration`, as many as the form takes, in that order. Game Jolt tags are one word, so `co-op` and `open-source` lose their hyphens. |
| Maturity rating | Answer the questionnaire honestly; it should come out **Everyone**. ForkBuild has no violence, no sexual content, no gambling and no purchases. It does have **chat and voice with other players**, so answer yes wherever the form asks about players talking to each other. |
| Thumbnail | `press/itch-cover.png` (630 × 500) if the form accepts it, or a crop of `press/editor-castle.png` to the size it asks for. Required before the page can be published. |
| Header | `press/itch-wide-cover.png` (1260 × 540): the logo, name and the fantasy beside the castle. |
| Screenshots | The same four as itch.io, in this order: `home-desktop.png`, `editor-castle.png`, `editor-harbor-island.png`, `home-phone.png`. |
| Video | The launch clip's YouTube link (`press/launch-clip.mp4`). |
| Ads | **Off**, in the game's settings. ForkBuild promises no ads (its description says so, and [Educators](Educators.md) says it runs no advertising), and ads beside it would read as ours. |
| Pricing | Free. |
| Comments | On. Answer them like any launch comment. |

### AI disclosure

If the form asks whether the game uses generative AI, answer as on itch.io:
**yes**, for code, text, graphics and sound. ForkBuild's code, its text in
every language, its logo and drawings (made by code) and its music
(synthesized by code) were all written with an AI assistant.

## Description

> **Build a little place. Anyone can remix it. Walk inside it with friends.**
>
> ForkBuild is a 3D building game that runs in your browser, on a computer
> or a phone. Press **Try it now** and you get a little house with no roof:
> put one on, make it yours, and walk inside it. Every other ready-made
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
> No account, no download, no ads. Your builds stay on your device until you
> share them. Free and open source, in eight languages.
>
> **Play opens ForkBuild in a new tab**, on its own site, so your builds are
> saved there and it can be installed as an app.
>
> Play: <https://bowo-prasetyo.github.io/forkbuild/?ref=gamejolt>
> Source: <https://github.com/bowo-prasetyo/forkbuild>

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
