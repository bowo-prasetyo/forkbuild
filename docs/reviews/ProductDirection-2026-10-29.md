# Product-direction audit, 2026-10-29

A Product Director's audit of ForkBuild 1.5.0 plus everything merged up to
"A camera drag keeps the selection" (2026-10-29). It asks one question: **do
ForkBuild's features, taken together, still fit its vision, its direction
and its strategy?** It follows
[the creative-direction audit of 2026-10-22](CreativeDirection-2026-10-22.md)
and doesn't repeat findings that have since been fixed.

This is a review, not a decision record. [Pillars.md](../Pillars.md) still
wins, and whatever is adopted goes into the roadmap the usual way.

## Verdict

**The vision is coherent, and this week's work mostly served it. The
strategy has stopped running.**

The fantasy (*build a little place, anyone can remix it, walk inside it
with friends*), the three pillars and the filter still hold the product
together, and the last week put most of its effort where the 2026-10-22
audit said it should go. Of the 36 roadmap entries since that day, 23 are
the Editor: placing, picking, rows, the Build Library, touch and the
selection. Before that audit the count was 1 in 74.

But ForkBuild's strategy, written in [NowNextLater.md](../NowNextLater.md),
is a loop: ship 1.6, put it in front of players, read a week of counts, let
the biggest drop choose what comes next. None of that loop has run.

- **1.6 was "ready to release" on 2026-10-22 and was never released.**
  `package.json` still says 1.5.0, and there are no 1.6 release notes.
- **None of Next's three items has started.** There is no
  `docs/playtests/`, no record of a builder-community post, and no week of
  counts read since the launch week.
- **The only player data is still the launch week:** 24 daily visits,
  10 Editor opens, 3 first edits, no build published.
- **Every decision since has rested on expert reviews**, five of them in
  seven days (placement, AI/ML, search, usability, this one), and none on
  players.

So the product is getting more coherent while it learns nothing. Each
entry that lands before 1.6 is released also pushes back the week whose
counts could answer the filter's fourth question. As things stand, that
question can't ever be answered.

## How this was checked

- I read Pillars.md, VISION.md, NowNextLater.md, the README, the
  2026-10-22 audit and its decisions, and every roadmap entry from
  "Release 1.5.0" to the head (`docs/roadmap/unnumbered-2026-09.md`, lines
  8781 to the end), and I sorted the entries by hand.
- I walked the product's surfaces in code: the routes (`ui/router/index.js`,
  47 paths), the main menu and More (`ui/App.js`), Explore's card
  (`ui/components/PublicationCard.js`), the person pages
  (`ui/views/AuthorView.js`, `ui/views/BuilderView.js`), the publish flow
  (`ui/components/Toolbar.js`, `PublishSheet.js`, `SimilarBuildDialog.js`),
  the season clock (`core/nature/Season.js`) and the challenge calendar
  (`core/challenge/BuildChallenge.js`).
- I measured the code by area (lines of `.js` per directory) and counted the
  English messages (4,777 in `ui/i18n/messages/en.js`, each in eight
  languages).
- I worked out the next six challenge weeks with `challengeAt()`.
- I didn't run a playtest, since that is finding 1's point.

## Where the work went since 2026-10-22

| Where the work went (roadmap entries, 2026-10-23 to 2026-10-29) | Entries |
|---|---|
| The Editor: placing, picking, rows, Build Library, touch, selection, saving | **23** |
| Look-alikes | 4 |
| Voice building, and measuring the searches | 3 |
| Renames: Signed Records, My Builds, "I follow" | 3 |
| Talking in the World: a call that goes with you, Say | 2 |
| A chat fix | 1 |
| **A playtest, a launch channel, a week of counts (Next 1–3)** | **0** |
| **Releasing 1.6 (Now)** | **0** |

## Is the vision coherent?

Yes. Nothing in the fantasy, the pillars, Words, Tone or Look needs to
change. The features fall into three groups:

**Core loop, coherent and strong.** Home → **Try it now** with a four-step
job → the Editor (now much better at placing and editing) → a one-sheet
Publish with remixing on → **Walk inside it** → a shared link with the
family tree and **Edit a Copy** → **Build with me** / **Walk here with
me**. Each step serves a pillar, and a player can see how.

**Supporting, coherent if kept in proportion.** The weekly challenge and
its plaza, stamps, hearts, video, embed, model export, Your Data, device
pairing, follow and notifications. Each one carries a pillar's promise.

**Infrastructure and side systems, coherent only if they stay out of
sight.** Networks and anchoring, Signed Records, the 13 network-settings
pages, World Encounters, chat, calls, the lobby, animals, vehicles,
swimming and voice. Pillars.md already says how these may live. The
findings below are about where they leak into the player's path, or where
the rules that hold them back have stopped being followed.

## Findings, most serious first

### 1. The learning loop has stalled (P0, strategy)

NowNextLater.md says: *"Nothing new starts while an item in **Now** is
unfinished."* Now's last step, releasing 1.6, is unfinished, and 36 entries
started anyway. Next's three items are the only way the project gets new
evidence, and none of them is code. They keep losing to work that is
(understandably) more pleasant and more visible.

The cost goes up every day:
- The 1.6 counts the filter waits for can't start until 1.6 ships.
- The players who arrive keep meeting 1.5, which is the build whose funnel
  failed.
- The Editor work is being tuned by reviewers who aren't the target player.
  The 2026-10-29 usability review was run with Playwright, not with people.

**Recommend:** release 1.6 this week as it stands, with no more features
riding along. Then do Next 1 and 2 before the next code change a player can
notice. Run the five-person playtest in the week after the release, and
write it to `docs/playtests/`.

### 2. The filter is followed in form, not in substance (P1, process)

The 2026-10-22 decisions made the filter one that says no. In practice:

- **"Not now" lists more voice and more look-alike work.** On 2026-10-28,
  seven entries did one or both. Only the switch to Whisper base records the
  owner's decision (AI/ML audit, line 249), and none of the seven gives a
  reason in the counts. The voice download went from about 70 MB to 107 MB.
- **The side systems are "frozen: kept working, with no new features"**
  until their use counts are read (Pillars, "The side systems"). Chat and
  voice calls then gained a call bar on every page and **Say** in World
  View. Both carry the owner's yes, so the rule wasn't broken. But
  `/e/chat-sent` and `/e/voice-call` have never been read against the 2%
  bar that was meant to decide this.
- **The recent entries don't answer the filter's four questions.** They
  name a pillar, or an audit finding, and stop there. Question 4 ("which
  first step should it move, and what in the counts says so") is answered
  nowhere.

This isn't a fault in any one entry. The owner's yes has become a way
round the filter rather than a stage inside it, and audit findings are
being treated as if they were counts. If that is the intended rule, write
it down. If it isn't, enforce the one that is written.

**Recommend:** a test that fails on a new roadmap entry missing the four
answers, written the same way as tests/WordsTable.test.js. Also one line in
Pillars.md saying whether the owner's yes stands in for question 4 or sits
next to it.

### 3. A builder has two pages (P1, pillar 2)

Clicking a builder's name takes you to one of two pages, and which one
depends on where you clicked:

| Where the name is clicked | Opens | Keyed by |
|---|---|---|
| Explore's card, Following, the Challenge page | `/author/:username` (AuthorView) | the typed name, which several people may share |
| A shared link, the family tree, "built with" credits, look-alikes, **My Builds** | `/builder/:identityId` (BuilderView) | the identity that signed |

The two pages show different builds, have different layouts and carry
different trust. AuthorView even runs a check to warn when one name covers
several identities. Pillar 2 promises *"who made each"*, and the name a
player sees on Explore's card is the weaker of the two answers.

**Recommend:** one builder page, by identity, everywhere. Keep the name
search as a filter inside Explore, not as a person's page.

### 4. "Your builds" is still hard to find, and Explore leaks infrastructure (P1, first ten minutes)

- **The main menu shows My Worlds and hides My Builds.** My Worlds is the
  list of Worlds visited on this device. My Builds, the player's own work,
  sits under **More → You** and appears only once you have a name. The
  Words table says the main menu is *Build · Explore · Challenge · Walk*,
  and its own note says *"a page of your own builds is open work"*. That
  page now exists, in the wrong place.
- **A second verb for sharing.** Your own cards in Explore offer **Share
  with Peers**, next to the build you already published. Pillars says
  *"Players should see one verb, **Publish**"*.
- **Network words on Explore's cards.** Cards read *"Stored on … · Announced
  on …"*. "Announce" is in the Words table's *Not* column, and Explore is
  one of the newcomer screens that table covers.
  tests/WordsTable.test.js doesn't catch it.

**Recommend:** put **My Builds** in the main menu in place of My Worlds,
and make visited Worlds a section inside it. Move **Share with Peers** and
the distribution line to Signed Records, which is where the rest of that
machinery already lives. Extend the Words test to Explore's card.

### 5. Winter-cabin week arrives on 16 November, and the seasons won't be ready (P1, time-bound)

`challengeAt()` puts *winter-cabin* on the week of 2026-11-16, 18 days from
now. The owner decided on 2026-10-22 that seasons follow the challenge
week. That work is still under Later, and `core/nature/Season.js` still
turns a season every five hours or so. A winter-cabin entry will mostly be
seen in spring, summer or autumn, in the first themed week the decision was
made for.

The change is small: every theme in `BuildChallenge.js` already carries a
`season`. It is the one item that should jump the queue, because it has a
date.

**Recommend:** move "Seasons on the challenge week" into 1.6, or into a
1.6.1 out before 16 November, or decide in writing to accept the miss.

### 6. A first Publish can still be three screens (P2, pillar 1)

"A first Publish is one sheet" was decided and built. But before the sheet
opens, `Toolbar.js` can show a "nothing added" prompt and then
**SimilarBuildDialog**, the look-alike check. The check runs on every
build's first publish in a visit, including a builder's very first build.
The 2026-10-22 audit asked that look-alikes *"never show on a first
publish"*. That advice wasn't taken up, and the look-alike work since has
made the check find more matches.

**Recommend:** skip the look-alike dialog on a builder's first published
build, or fold it into the sheet as one line. Credit is still kept: the
🔔 notice reaches the original builder whatever happens.

### 7. The weight carried behind the game (P2, scope)

| Measure | Today |
|---|---|
| `application/` lines in publication, snapshot and anchoring | 45,600 of 123,200 (37%) |
| `application/` lines in editor, commands, editorSession and blueprint | 13,600 (11%) |
| Network-settings pages | 13, plus Signed Records |
| World Encounters (application + its World View canvas) | about 6,500 lines + 16 UI files |
| UI messages | 4,777, each kept in 8 languages |
| Test files | 1,062 |

None of this is wrong on its own. Pillars.md keeps it, and it is what makes
*"your work is yours"* true. The cost shows up in speed. Every feature a
player can see now ships with eight translations, eight guide chapters and
tests across that machinery, and two hours on the Editor competes with
upkeep on a protocol nobody has published to yet. On 2026-10-10 the project
showed it can subtract, when it archived the leaderboards and reconciliation
pages. A second pass like that is due.

**Recommend (owner's call):** a subtraction review, with the candidates
judged against the side-systems counts once they exist: World Encounters,
the Steem and Blurt writers, and experimental anchoring on Bitcoin, Base,
Steem and Blurt. Separately, make new features English-first, with
translations following in a batch. That keeps "new languages" in Not now
without making every feature cost eight times its text.

### 8. The README sells a different product (P2, messaging)

The README is what GitHub, Show HN and itch visitors read first. Its
Features list runs to more than forty bullets. Arweave, IPFS, Nostr, Steem,
Blurt, Bitcoin and Base all appear under "Publishing and forking", and a
reader reaches the three pillars only through a link. Pillars says
*"not a blockchain product"* and *"an engine with a demo"* is something
ForkBuild isn't making. The README reads as both.

**Recommend:** open the README with the fantasy, the three pillars and the
loop (Try it now → Publish → Walk inside → Edit a Copy) in a short screen,
and move the networks to a "How your work stays yours" section further
down.

## Pillar scorecard

| Pillar | Grade | Why |
|---|---|---|
| 1. Building feels joyful | **B+** (up from C) | A week of real Editor work, and the first Publish in one sheet. Unproven with players. The look-alike dialog still stands in front of a first publish. |
| 2. Every build has a family tree | **B−** | Remix on by default, family trees and credit by identity are strong. Two builder pages split the credit, and look-alikes add friction at the point where the funnel dies. |
| 3. Yours, in a world | **B** | Your Data, pairing, Walk here with me and the clearing are good. The diorama pass and the challenge-week seasons are still waiting, and the World keeps gaining side features (Say, the call bar). |
| Strategy and process | **C** | The vision is right and the plan is right. The plan isn't being carried out: no release, no playtest, no channel, no counts. |

## Recommended: stop, ship, listen

1. **This week:** release 1.6 as it is, with the challenge-week seasons
   (finding 5) as its one addition, or as a 1.6.1 before 16 November. No
   other feature work.
2. **Next week:** the five-person playtest (Next 1) and one post to a
   builder community (Next 2), both with nothing new in the build.
3. **The week after:** read a week of 1.6 counts (Next 3). The biggest drop
   in FIRST STEPS chooses 1.7. Findings 3, 4 and 6 are the likely
   coherence items for it. Finding 4 is on the newcomer's path, so it goes
   first if the playtest shows people looking for their builds.
4. **Alongside, no code:** the filter test and the Pillars line
   (finding 2), the README opening (finding 8), and the owner's subtraction
   decision (finding 7).

*Measured by:* the same counts 1.6 was aimed at (`/e/editor-edit` →
`/e/publish-*`, and the median of `/e/publish-placed-…`), now with a 1.6 to
measure.

## Decisions only the project owner can make

1. **Release 1.6 now, as it is?** I recommend yes, and a feature freeze
   until the playtest is written down.
2. **What does the owner's yes replace?** Should it stand in for the
   filter's fourth question, or must an entry still name a count? I
   recommend the second. Otherwise "Not now" means "not unless asked", and
   it stops saying no.
3. **Seasons before 16 November, or accept the miss?** I recommend before.
4. **One builder page, by identity?** I recommend yes (finding 3).
5. **A subtraction pass?** If so, which of World Encounters, the Steem and
   Blurt writers, and experimental anchoring should it look at first?
6. **Carried, still open since 2026-10-12:** who hears about ForkBuild
   next, and when.
