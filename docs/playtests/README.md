# Playtests

How to watch new players try ForkBuild, and how to write down what you saw.
Each playtest is a dated file in this folder, made from
[TEMPLATE.md](TEMPLATE.md) (for example `2026-11-03.md`). Its top three fixes
join **Now** in [NowNextLater.md](../NowNextLater.md).

A playtest isn't a usability review. A review asks whether the app works as
designed. A playtest asks where people who have never seen it get stuck, so
the only rule is: **watch, don't help.**

## Who plays

- **Five people who play building games** (Minecraft, The Sims, Townscaper,
  LEGO games, Roblox building) and have never opened ForkBuild. Friends are
  fine; ForkBuild contributors are not.
- **Two of them on their own phone**, three on a computer.
- One at a time, 20 minutes each, with one observer.

## Before they arrive

- Use the official site:
  <https://bowo-prasetyo.github.io/forkbuild/>. Give it without `?ref=`, so
  the link is the one a stranger would see.
- Use a **fresh private window** (or a phone browser with the site's data
  cleared), so nothing from an earlier visit is saved: no name, no builds, no
  finished first-build guide.
- Note the date and the start time of each session. The playtest's visits
  are counted like any others on the
  [visitor counter](https://forkbuild.goatcounter.com/), so the times let the
  week's counts be read without them.
- Have a clock that shows seconds (a phone stopwatch), and a copy of
  [TEMPLATE.md](TEMPLATE.md) to fill in. A screen recording is welcome if the
  player agrees; it doesn't replace the notes.

## What to say

Say this, and nothing else about the game:

> "This is a building game in the browser. Please play with it as if you'd
> just found the link. Build something you'd be happy to show a friend, and
> share it the way the game lets you. Think out loud: say what you're looking
> for and what you expect to happen. I can't help, but I'll answer
> anything after."

Then hand over the link. Start the clock when the page has loaded.

If they ask what to do, say: "Whatever you'd do if I weren't here." If they
ask whether something is broken, say: "What do you think?"

## What to watch for

Write a line in the **Stalls** table every time one of these happens:

- **Hesitation:** they stop for more than about 10 seconds, looking for
  something.
- **Wrong turn:** they press something that doesn't do what they wanted, or
  open a page and leave it at once.
- **Question:** they ask out loud how to do something, or what something
  means.
- **Surprise:** they say something like "oh", "wait" or "huh", good or bad.
- **Gives up:** they stop trying to do something they had set out to do.

For each, note the time on the clock, where they were, what they were
trying to do, and what they said, in their own words. Write what happened,
not what you think caused it; causes go in the summary afterwards.

## The path to time

The steps every newcomer should get through in the first ten minutes. Note
the time each one is first reached, or `—` if it never is:

| Step | What counts |
|---|---|
| Home | The page has loaded (0:00) |
| Into the Editor | **Try it now: start with a house**, a ready-made build, the challenge, or **Build** |
| First brick | A brick placed by hand |
| The starter job | Its four steps done (roof, chimney, path, garden), if they took it |
| Publish | The **Publish your build** sheet sent |
| Walk inside it | Their avatar in World View at their build |
| Share | A link copied or shared |

These are the same steps the counts follow (`/e/editor-open`,
`/e/editor-edit`, `/e/publish-*`), so a playtest says *why* people stop where
the counts say *how many* do.

## Stepping in

Only when a player has been stuck on the same thing for **two minutes**, or
asks to stop. Then mark the stall **blocker**, give the smallest hint that
gets them going ("try the menu at the top"), and write down the hint. A
blocker is the most important thing a playtest finds.

## Afterwards

Ask, and write down the answers in their words:

1. What was this game about?
2. What was the best moment, and the most annoying one?
3. Would you play it again, or send it to someone? Why?
4. Is there anything you wanted to do and couldn't?

## Writing it up

When all five have played, fill in the summary at the top of the file:

- **The top three fixes.** Rank the stalls by how many players hit them, then
  by how much each one cost (a blocker beats a hesitation). Each fix names
  the stalls it answers, by player and time. These join **Now**.
- **What went well**, so a fix doesn't break it.
- **Against the counts:** where the players stopped, next to where the
  week's counts say newcomers stop (`node scripts/launch-scorecard.mjs`).

Keep each player anonymous: P1 to P5, the device, and how much they play
building games. No names, no recordings in the repository.
