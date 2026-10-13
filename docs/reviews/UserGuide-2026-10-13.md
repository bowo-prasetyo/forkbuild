# User guide audit, 2026-10-13: complete, but written for the last menu

A technical writer's review of the user guide in `docs/user/` (18 English
pages, about 48,000 words of prose, translated into seven languages). It asks one
question: can a player who has never seen ForkBuild find what they need,
follow it, and trust it matches the app? It reports what was checked, grades
each page, lists the findings, and says which were fixed alongside this
review and which are left open.

This is a review, not a decision record. [Pillars.md](../Pillars.md) still
wins; where a finding leans on it, it says which part.

## Verdict

**The guide is unusually complete and almost entirely accurate about how
features behave, but it was not friendly to a newcomer.** Three things got
in the way. (1) It still named the menu as it was before 2026-10-12: it told
people to click **Editor**, **Repository** and **Login**, which no longer
exist in the top bar (now **Build**, **Explore** and **Choose a name**), and
a renamed dialog. (2) The two pages a newcomer reads first put the wrong
thing first: Getting Started opened with how to self-host before how to
place a brick, and World View put about 270 lines of network tools
(visible only under **Show advanced tools**) ahead of **Edit a Copy**,
**Build here** and **Walk here with me**. (3) The prose is dense: World View
averaged 26.6 words a sentence, with one sentence in six over 40 words, and
much of it explains what a control *doesn't* do. The reference pages
(Controls Reference, FAQ, Your Data, the advanced guides) are in good shape.

The fixes below address (1) fully, (2) for the newcomer pages, and (3) for
the passages a visitor meets first. The rest of (3) is listed as open work.

## How the audit was done

- Read every English page in `docs/user/`, the guide's index, and the
  parts of [Pillars.md](../Pillars.md) ("Words", "The filter") and
  [Translating.md](../Translating.md) that govern it.
- **Labels against the app.** Extracted every bold label from the newcomer
  pages and looked each one up in `ui/i18n/messages/en.js` (and in the
  code where the text isn't a message). A label the app no longer shows
  is a finding.
- **Links and anchors.** Checked every relative link and heading anchor in
  the English pages with the same slug rules
  `scripts/check-doc-translations.mjs` uses for translations (which don't
  cover the English pages).
- **Readability.** Measured, per page, words per sentence and the share of
  sentences over 40 words (prose only; tables, headings and code left out).
- **Structure.** For each page: does it start with what most readers came
  for? Is a task written as steps? Is advanced material separated?
- **Words.** Checked the newcomer pages against Pillars' "Words" table
  (build, remix, Choose a name; not document, creation, fork, Login,
  Repository).

## Scorecard

Grades are for a newcomer's experience, before the fixes in this review.

| Page | Grade | In one line |
|---|---|---|
| README (index) | B− | Good grouping (Play / Advanced / Reference), but no task-based entry ("I want to…") and old menu names |
| 01 Getting Started | C | Self-hosting and rendezvous servers before the first brick; first brick after login; menu shown with old names |
| 02 The Editor | B+ | Clear tables and steps; a few run-on paragraphs and a flattened **File** menu list |
| 03 World View | C− | Thorough but 1,280 lines, advanced panels in the middle, the longest sentences in the guide, a stale dialog name |
| 04 Publishing & Forking | B− | Good walkthroughs; "Repository", "log in" and a stale dialog name; one broken link |
| 05 Identity & Login | B | Clear; "in the top bar" for pages that are under **More** |
| 06 Avatars & Presence | B | Good tables; long Residents section; same "top bar" slip |
| 07 Peers & Friends | B | Page sketch helps; same "top bar" slip |
| 08 Chat & Conversations | B | Short and clear |
| 09–12 (advanced) | B | Appropriately technical, each opens with a clear "experimental / you don't need this" note |
| 13 Your Data | A− | Task-shaped, accurate |
| Controls Reference | A− | One lookup table per area; says the Command Palette wins when they disagree |
| Distribution | B+ | Clear three-roles model |
| FAQ | A− | Short, accurate answers; two answers disagreed with Publish's newer flow |
| Interactive Transform Gizmo | A− | Focused and complete |

## Findings

Severity: **High** stops a newcomer or sends them the wrong way; **Medium**
slows them down or contradicts another page; **Low** is polish.

### 1. The guide named the menu as it was before 2026-10-12 (High, fixed)

"Find each other" (2026-10-12) renamed the main menu to **Build · Explore ·
Challenge · Walk** and the header's Login to **Choose a name**
(tests/WordsTable.test.js keeps the app that way). The guide still said:

- "Click **Editor** in the top bar" (Getting Started, step 1 of the first
  brick), and showed the bar as `Home Editor Repository Challenge My Worlds
  More ▾ 🔔 [Login]`. **Walk** was missing.
- "the **Repository**" for the page now titled **Explore**, in Getting
  Started, The Editor, World View, Publishing & Forking, Your Data and the
  FAQ.
- "Log in", "logged in" and "logged out" in Getting Started, Publishing &
  Forking and the FAQ, where the app says **Choose a name** and offers
  **Publish unsigned**.
- **Fork Unavailable** / **Back to Shared World** for the dialog now titled
  **Can't make a copy** with **Back to the build** (World View, Publishing
  & Forking), and its two reasons quoted in their old wording.

**Fixed:** the newcomer pages now use the app's current labels. Getting
Started shows the real bar, explains each item in a table, and lists
**More**'s four groups as the app does. The FAQ gained "Where did the
Editor, the Repository and Login go?" for returning players. "Repository"
stays where the app itself still says it (the **Repository** field of a
distribution result, **Browse the Repository** on My Worlds) and on the
advanced pages, which Pillars lets keep their terms.

### 2. Getting Started put the first brick after self-hosting and login (High, fixed)

The page promised "five minutes to I built something", then opened with
`python3 -m http.server`, `file://` modules and rendezvous servers. The
first brick came after "Logging in" and "Taking the tour". The fastest
path the app offers (Home's **Try it now** house, which needs one click to
finish) wasn't mentioned on the page at all.

**Fixed:** the page now opens with a four-step short version (Try it now,
Pick the roof, Publish, Walk inside it), then Opening ForkBuild, Finding
your way around, Placing your first brick, Saving, Choosing a name,
Installing. Self-hosting moved to a final "Running your own copy" section
marked as being for developers. A "Keep a copy" note now points newcomers
to **Your Data** before they lose work to a cleared browser.

### 3. World View put advanced panels before the visitor's actions (High, fixed)

Pillars' filter asks that anything a newcomer doesn't need sit under
Advanced, and the app does that: World Encounters, Discover Shared World,
Place Names, Claimed Builds, Camera vs. Editing, brick inspection and My
Shared World show only with **Show advanced tools** on. The guide put four
of them (about 270 lines) between the browsing tabs and **Edit a Copy**, so
a visitor scrolling for "how do I change this?" or "how do I bring a
friend?" read about Signed Claims and Snapshot locators first.

**Fixed:** those seven sections now sit together in a final **Advanced
tools** section, introduced by what they're for and how to turn them on.
Their headings are unchanged, so every link to them still works. The page
also opens with a "short version" table of the seven things a visitor
does most, and the Explore tab's description says which groups are
advanced.

### 4. Prose density on the newcomer pages (Medium, partly fixed)

Measured on prose only:

| Page | Words / sentence (before → after) | Sentences over 40 words (before → after) |
|---|---|---|
| 01 Getting Started | 21.3 → 18.3 | 8.5% → 4.2% |
| 03 World View | 26.6 → 25.4 | 16.6% → 13.8% |
| FAQ | 15.0 → 15.2 | 0% → 0.9% |
| Whole guide | 21.3 → 20.9 | 7.2% → 6.6% |

Typical patterns: a sentence that chains three em-dash asides; a sentence
explaining what a control never does ("never loads, selects, or edits
anything"); and implementation detail a player can't act on ("two signing
requests fired at once is a real extension failure mode").

**Fixed:** the densest visitor-facing passages of World View were
rewritten in plain, shorter sentences: Home, the Explore / Map / Places
tabs, Info (now a list of its four buttons), Edit a Copy (now says where
the button is, as a list), Landmarks, Geographic places and My Worlds. The
Sound section now starts with its controls. **Open:** the rest of World
View (Flying around, Sound's descriptions, Document Information and
Placement), 06 Avatars & Presence's Residents section and 04's
distribution walkthrough would benefit from the same pass.

### 5. "In the top bar" for pages under More (Medium, fixed)

Avatars & Presence, Identity & Login, Peers & Friends and Chat said to
open My Avatar, My Identities, Peers, Following, Network Settings and
Conversations "in the top bar". They are under **More** (or the name menu).
**Fixed:** each now says **More → …**.

### 6. FAQ answers that disagreed with Publish (Medium, fixed)

- "I published my creation, but my friend can't find it" said only Share
  with Peers or Distribute would help, missing the two easiest ways the
  app now offers: send the link, or **Let everyone find it**.
- "How do I make my work available to everyone?" said to distribute with
  a wallet extension, where **Who can find it? → Everyone** needs nothing.
- "Do I need a crypto wallet?" said a wallet is only for experimental
  features, while the previous answer said Arweave distribution (a regular
  feature) needs Wander.
- "Does publishing need me to be logged in?" said it works logged out,
  where Getting Started said Publish asks for a name.

**Fixed:** all four now agree with each other and with Publish's dialogs.

### 7. Broken link (Low, fixed)

Publishing & Forking linked `[Privacy](Privacy.md)`, which doesn't exist
next to it; the page is `docs/Privacy.md`. **Fixed.** No other English link
or anchor is broken.

### 8. No task-based way in (Low, fixed)

The index listed pages by topic only. **Fixed:** an "I want to…" table now
maps the eleven most common tasks to the section that answers each.

### 9. Formatting slips (Low, fixed)

The Editor's **File** menu items (Export, 3D model, Import) were listed as
siblings of **File** instead of under it; the FAQ said **3D model** is in
the toolbar rather than under **File**. **Fixed.**

## Open, for the owner or a later pass

1. **Translations.** *Done the same day:* all 77 translations of the 11
   changed pages were brought up to date in all seven languages and
   stamped (see the roadmap entry "The user guide's fixes, in every
   language"). The English of 11 pages had changed, so their translations
   had carried the standard "the English has changed" banner until then.
2. **No pictures.** *Done the same day:* Getting Started, The Editor and
   World View now show Home, the Editor and World View at the challenge
   plaza, in each of the eight languages, taken by
   `scripts/user-guide-screenshots.mjs` (see the roadmap entry "Pictures of
   the main screens, in every language"). Only the light look is shown.
   Until then the guide had no screenshots or diagrams apart from two ASCII
   sketches.
3. **Page titles still use protocol words.** "Publishing & Forking" and
   "Identity & Login" name a page by words Pillars says not to show a
   newcomer (fork, Login). Renaming changes file names or headings that
   seven translations and the app's About link depend on, so it's left for
   a deliberate change.
4. **World View is still long** (1,275 lines). Splitting it into "Visiting
   the World" and "World View: advanced tools" is the natural next step
   now that the advanced material sits together.
5. **The app is inconsistent in a few advanced messages.** It says "Sign in"
   on commentary, Peers, Following, Conversations and Chat, "Browse the Repository" on
   My Worlds, and "Repository" in a distribution result. These are outside
   the namespaces tests/WordsTable.test.js checks, so the guide follows the
   app there; the messages themselves could follow Pillars' words.
6. **Prose pass.** Finding 4's remaining passages.
