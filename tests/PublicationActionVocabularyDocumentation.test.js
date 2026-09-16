import { readFile } from 'node:fs/promises';

// 0.9.563 — Publication Action Vocabulary Documentation.
//
// 0.9.560 (Cross-Surface Publication Action Consistency Audit) named two
// real, deliberate vocabulary divergences that were never written down
// anywhere a USER would see them (DOCUMENTATION_GAP, Section I):
//
//   1. "Fork" (Repository/Author/World Encounters) and "Edit a Copy"
//      (World View's Focus panel and Inspection panel) name the
//      IDENTICAL action — byte-identical route shape, identical
//      ForkDocumentUseCase, identical ForkFailureDialog (0.9.560
//      Sections B/E/H) — under two different labels.
//   2. "Explore" (Repository/Author) / "Continue Exploring" (My Worlds)
//      name one mechanic (a fresh `/world/:id` push); "Focus" (Search/
//      Locations/Placement) / "Go" (Explore's Nearby rows, the Focus
//      panel's own camera-move button) name a second (focusWorld()/
//      focusLocation()/focusCollaborator()) — four words for two
//      mechanics.
//
// This milestone is documentation-only, exactly as 0.9.560 recommended:
// it adds the missing cross-references to docs/user/03-WorldView.md and
// docs/user/04-PublishingAndForking.md so a reader encountering one label
// is told, in plain language, what the other label means and why it
// differs — without renaming any button, without claiming Fork/Edit a
// Copy bypasses license enforcement, without claiming Explore/Focus/Go
// creates a new Publication or placement, and without introducing
// internal identifiers (publicationId, documentId, use-case class names)
// into the user-facing prose. Zero production source files changed.
//
// Sections:
//   A — docs/user/04-PublishingAndForking.md names "Edit a Copy" as the
//       same action as "Fork," and cross-references My Worlds' "Continue
//       Exploring" from the Explore row.
//   B — docs/user/03-WorldView.md's "Edit a Copy" section names "Fork" as
//       the same action, and the "My Worlds" section names its own
//       button ("Continue Exploring") and ties it to "Explore."
//   C — docs/user/03-WorldView.md ties "Go" to "Focus" as the same
//       camera-move mechanic, without overclaiming that every "Go"/
//       "Focus" button also changes the editing document.
//   D — Vocabulary boundary: no touched doc introduces publicationId,
//       documentId, contentHash, or an internal use-case/command class
//       name into the new prose.
//   E — Semantic guardrails: no touched doc claims Fork/Edit a Copy
//       bypasses the license/fork policy, claims Fork mutates the
//       original, or claims Explore/Continue Exploring/Focus/Go creates
//       a new Publication, placement, or World state.
//   F — Historical/existing content preserved: the pre-existing "Every
//       'Edit a Copy' button in World View... is the same action"
//       sentence, the license table, and the Fork Unavailable dialog
//       explanation are all still present, untouched in substance.
//   G — Production guard: only documentation + this test file + its
//       tests.html registration changed.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function main() {
    let worldViewDoc, forkingDoc;

    // ===================================================================
    // Section A — docs/user/04-PublishingAndForking.md
    // ===================================================================
    {
        forkingDoc = await readSource('docs/user/04-PublishingAndForking.md');

        assert(/Also called "Edit a Copy" in World View/.test(forkingDoc),
            '1. LIVE: the Forking section explicitly names "Edit a Copy" as World View\'s label for Fork.');
        assert(/it's the same underlying\s+> operation either way/i.test(forkingDoc),
            '2. LIVE: the note states this is the SAME underlying operation, not a similar or related one.');
        assert(/\[Edit a Copy\]\(03-WorldView\.md#edit-a-copy--taking-something-into-the-editor\)/.test(forkingDoc),
            '3. LIVE: the note links back to World View\'s own Edit a Copy walkthrough.');
        assert(/Continue Exploring.{0,120}does\s+the same thing as \*\*Explore\*\*/s.test(forkingDoc),
            '4. LIVE: the Explore/Fork/Open table is followed by a cross-reference tying My Worlds\' "Continue Exploring" to "Explore" here.');

        console.log('✓ A: docs/user/04-PublishingAndForking.md now names "Edit a Copy" as Fork\'s World View label and "Continue Exploring" as Explore\'s My Worlds label.');
    }

    // ===================================================================
    // Section B — docs/user/03-WorldView.md: Edit a Copy <-> Fork, My Worlds
    // ===================================================================
    {
        worldViewDoc = await readSource('docs/user/03-WorldView.md');

        assert(/This is the same action as the Repository, Author view, and World\s+Encounters' own "Fork" button/.test(worldViewDoc),
            '1. LIVE: the Edit a Copy section explicitly names "Fork" as the same action.');
        assert(/\[Forking: make it your own\]\(04-PublishingAndForking\.md#forking-make-it-your-own\)/.test(worldViewDoc),
            '2. LIVE: it links back to the Publishing & Forking guide\'s own Forking section.');
        assert(/Click a card's\s+\*\*Continue Exploring\*\* button to fly straight back in/.test(worldViewDoc),
            '3. LIVE: the My Worlds section now names its own button, "Continue Exploring," rather than leaving it unnamed.');
        assert(/the same fresh\s+entry into World View as the Repository and Author view's own \*\*Explore\*\*/.test(worldViewDoc),
            '4. LIVE: My Worlds ties Continue Exploring back to Explore as the same mechanic.');

        console.log('✓ B: docs/user/03-WorldView.md\'s Edit a Copy section names Fork as the same action, and My Worlds names and cross-references Continue Exploring.');
    }

    // ===================================================================
    // Section C — docs/user/03-WorldView.md: Go <-> Focus
    // ===================================================================
    {
        assert(/names the same camera-move mechanic as the "Focus" buttons in\s+Search, Locations, and Placement/.test(worldViewDoc),
            '1. LIVE: "Go" is explicitly tied to "Focus" as the same camera-move mechanic.');
        // Must NOT claim every Go/Focus button also changes the editing
        // document — Locations' own Focus is camera-only (goFromFocusPanel
        // -> session.focusLocation()/focusCollaborator(), never
        // session.focusDocument()), unlike Search's Focus
        // (focusWorld() -> session.focusDocument()). Overclaiming here
        // would misstate real, still-current behavioral differences this
        // milestone must not erase (criterion D).
        assert(/still depends on context exactly as described in each panel's own\s+section/.test(worldViewDoc),
            '2. LIVE: the note explicitly defers to each panel\'s own, already-accurate description rather than asserting a single uniform side effect for every Go/Focus button.');
        assert(!/"Go" always (also )?(changes|selects)/i.test(worldViewDoc),
            '3. LIVE: no overclaiming sentence asserts "Go" always changes/selects the editing document (Locations\' own Focus is camera-only, per that section\'s pre-existing text).');

        console.log('✓ C: "Go" is tied to "Focus" as the same camera-move mechanic without overclaiming a uniform side effect across every instance.');
    }

    // ===================================================================
    // Section D — Vocabulary boundary (criterion H)
    // ===================================================================
    {
        // Isolate just the new prose this milestone added, so the check
        // doesn't flag internal identifiers that pre-existing text in
        // these same files may legitimately use elsewhere.
        const newForkingProse = forkingDoc.match(/Also called "Edit a Copy" in World View[\s\S]*?for World View's own walkthrough of it\./)?.[0]
            + forkingDoc.match(/\(\*\*My Worlds\*\*' own \*\*Continue Exploring\*\*[\s\S]*?for the first time\.\)/)?.[0];
        const newWorldViewProse =
            worldViewDoc.match(/This is the same action as the Repository, Author view, and World[\s\S]*?picking it out of a list\./)?.[0]
            + worldViewDoc.match(/"Go," on Explore's Nearby rows[\s\S]*?changes none of that\./)?.[0]
            + worldViewDoc.match(/Click a card's\s+\*\*Continue Exploring\*\*[\s\S]*?finding for the first time\./)?.[0];

        assert(newForkingProse && newForkingProse.length > 100, 'sanity: new Forking-doc prose extracted for the boundary check.');
        assert(newWorldViewProse && newWorldViewProse.length > 100, 'sanity: new World View prose extracted for the boundary check.');

        const forbiddenIdentifiers = [
            /publicationId/,
            /documentId/,
            /contentHash/,
            /ForkDocumentUseCase/,
            /ForkFailureDialog/,
            /WorldFocusContext/,
            /focusWorld\(\)/,
            /session\.focus/
        ];
        for (const prose of [newForkingProse, newWorldViewProse]) {
            for (const pattern of forbiddenIdentifiers) {
                assert(!pattern.test(prose), `1. LIVE: new user-facing prose avoids the internal identifier ${pattern} — ordinary users never see a publicationId/documentId/use-case name.`);
            }
        }

        console.log('✓ D: the new documentation prose stays in plain, user-facing vocabulary — no publicationId/documentId/contentHash/internal class names leaked in.');
    }

    // ===================================================================
    // Section E — Semantic guardrails (criteria E, F, G)
    // ===================================================================
    {
        // E — must not imply Fork/Edit a Copy bypasses license/fork policy.
        assert(/the same license rules/.test(forkingDoc) && /the same\s+license rules\./.test(worldViewDoc),
            '1. LIVE: both docs state Edit a Copy follows the SAME license rules as Fork, never a bypass.');
        assert(!/without (a |the )?license|regardless of license|skip(s)? the license/i.test(forkingDoc + worldViewDoc),
            '2. LIVE: neither doc suggests Edit a Copy or Fork can proceed without regard to license.');

        // F — must not describe Fork as modifying the original.
        assert(/the original left\s+exactly as it was/.test(worldViewDoc) || /original is never touched/.test(worldViewDoc),
            '3. LIVE: World View doc still states the original is never touched/modified.');
        assert(!/(modifies|changes|updates|alters) the original/i.test(forkingDoc + worldViewDoc),
            '4. LIVE: neither doc claims Fork/Edit a Copy modifies, changes, updates, or alters the original.');

        // G — must not imply Explore/Focus/Go creates a new
        // Publication, placement, or World state merely by navigating.
        assert(!/(explore|continue exploring|focus|"go").{0,80}(creates|publishes|adds) a (new )?(publication|placement|world)/i.test(forkingDoc + worldViewDoc),
            '5. LIVE: neither doc implies Explore/Continue Exploring/Focus/Go creates a new Publication, placement, or World state.');
        assert(/moves the camera/.test(worldViewDoc),
            '6. LIVE: the new Go/Focus note frames the shared mechanic strictly as camera movement, matching Principles.md\'s own "Focus Is Navigation, Not Discovery — And Never Editing."');

        console.log('✓ E: license semantics, original-identity semantics, and World/navigation semantics all stay exactly as strict as the pre-existing documentation already established.');
    }

    // ===================================================================
    // Section F — Historical/existing content preserved (criterion I)
    // ===================================================================
    {
        assert(/Every "Edit a Copy" button in World View — here, and on a region\/landmark\/\s*structure's own Focus panel — is the same action/.test(worldViewDoc),
            '1. LIVE: the pre-existing 0.5.x-era "every Edit a Copy button is the same action" sentence is untouched.');
        assert(/CC0 1\.0 — Public Domain/.test(forkingDoc) && /All Rights Reserved/.test(forkingDoc),
            '2. LIVE: the full license table is still present, untouched.');
        assert(/Fork Unavailable/.test(forkingDoc) && /Fork Unavailable/.test(worldViewDoc),
            '3. LIVE: the Fork Unavailable dialog explanation survives in both docs.');
        assert(/A typical creative loop/.test(forkingDoc),
            '4. LIVE: unrelated historical/narrative sections (e.g. "A typical creative loop") are untouched.');

        console.log('✓ F: pre-existing explanations (the cross-panel Edit a Copy sentence, the license table, Fork Unavailable, the creative-loop walkthrough) all survive unrewritten.');
    }

    // ===================================================================
    // Section G — Production guard (criterion C, J)
    // ===================================================================
    {
        const gitStatus = await import('node:child_process').then((cp) =>
            new Promise((resolve, reject) => {
                cp.exec('git status --porcelain', { cwd: new URL('../', import.meta.url) }, (err, stdout) => {
                    if (err) return reject(err);
                    resolve(stdout);
                });
            })
        );
        const changedLines = gitStatus.split('\n').filter((l) => l.trim().length > 0);
        const expectedSuffixes = [
            'docs/user/03-WorldView.md',
            'docs/user/04-PublishingAndForking.md',
            'tests/PublicationActionVocabularyDocumentation.test.js',
            'tests.html'
        ];
        const unexpected = changedLines.filter((l) => !expectedSuffixes.some((suffix) => l.includes(suffix)));
        assert(unexpected.length === 0, `1. LIVE: git status reports no changed file besides this milestone's own documentation + test + registration set (unexpected: ${JSON.stringify(unexpected)}) — zero component, command, route, use case, or data model file touched.`);

        console.log('✓ G: only the two user-facing docs, this test file, and its tests.html registration changed — no production source file touched.');
    }

    console.log('\nAll Publication Action Vocabulary Documentation tests passed.');
    console.log('\n=== 0.9.563 VERDICT ===');
    console.log(`DOCUMENTATION_GAP CLOSED.

0.9.560's Section I finding — "Fork"/"Edit a Copy" and "Explore"/"Continue Exploring"/"Focus"/"Go" are each one
action under multiple deliberate, self-documented labels never written down anywhere a user would see the
equivalence — is closed with plain-language cross-references in docs/user/03-WorldView.md and
docs/user/04-PublishingAndForking.md:

  - "Edit a Copy" (World View) and "Fork" (Repository/Author/World Encounters) are now each explicitly named as
    the other's label for the identical action, with the real reason the label differs (looking at one specific
    thing vs. picking one out of a list) stated plainly, and both docs' pre-existing license/original-untouched/
    Fork Unavailable explanations left exactly as strict as they were.
  - "Continue Exploring" (My Worlds) is now named for the first time as the button it actually is, and tied to
    "Explore" (Repository/Author) as the same fresh-entry mechanic.
  - "Go" (Explore's Nearby rows, the Focus panel's camera-move button) is tied to "Focus" (Search/Locations/
    Placement) as the same camera-move mechanic — WITHOUT overclaiming a uniform "also changes what you're
    editing" side effect, since Locations' own Focus is camera-only while Search's Focus is not; each panel's own,
    already-accurate description is left as the authority on that point.

No button was renamed. No component, command, route, use case, or data model file changed — this milestone is
documentation plus this one regression test, exactly as 0.9.560 recommended and scoped.`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
