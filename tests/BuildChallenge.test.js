// The weekly build challenge (core/BuildChallenge.js): which theme runs
// when, the tag a week's entries carry, and reading a challenge back from
// its id or its tag.
import {
    CHALLENGE_THEMES, challengeAt, challengeById, challengeDaysLeft, challengeForTag, challengeOfTags,
    isChallengeOpen, previousChallenge, withChallengeTag
} from '../core/BuildChallenge.js';
import { BUILD_TAG_MAX_COUNT, normalizeBuildTag } from '../core/BuildTags.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { assert } from './support/Assert.js';

// A week runs Monday 00:00 UTC to the next Monday; the first theme starts
// the week of 12 October 2026 and the themes then take turns.
{
    const first = challengeAt(Date.parse('2026-10-14T15:00:00Z'));
    assert(first.id === '2026-10-12', `the week starts on its Monday (got ${first.id})`);
    assert(first.themeId === CHALLENGE_THEMES[0].id, 'the first week has the first theme');
    assert(first.tag === `${CHALLENGE_THEMES[0].id}-20261012`, `the tag names the theme and its Monday (got ${first.tag})`);
    assert(first.startsAt.toISOString() === '2026-10-12T00:00:00.000Z', 'it starts at midnight UTC');
    assert(first.endsAt.toISOString() === '2026-10-19T00:00:00.000Z', 'it ends a week later');
    assert(challengeAt(Date.parse('2026-10-18T23:59:59Z')).id === '2026-10-12', 'Sunday night is still that week');
    const second = challengeAt(Date.parse('2026-10-19T00:00:00Z'));
    assert(second.id === '2026-10-19' && second.themeId === CHALLENGE_THEMES[1].id, 'Monday starts the next theme');
    const wrapped = challengeAt(Date.parse('2026-10-12T00:00:00Z') + CHALLENGE_THEMES.length * 7 * 86400000);
    assert(wrapped.themeId === CHALLENGE_THEMES[0].id, 'the themes come round again');
    const before = challengeAt(Date.parse('2026-10-08T12:00:00Z'));
    assert(before.id === '2026-10-05' && before.themeId === CHALLENGE_THEMES[CHALLENGE_THEMES.length - 1].id, 'a week before the first has the last theme');
    assert(challengeAt(new Date('2026-10-14T00:00:00Z')).id === '2026-10-12', 'a Date works as well as a time');
    assert(challengeAt(NaN) === null, 'no time, no challenge');
    console.log('✓ one theme a week, Monday to Monday, in turn');
}

// Every week's tag is a valid build tag, and every theme starts from
// built-in structures.
{
    const structures = new CreateStructureRegistryUseCase().execute();
    let start = Date.parse('2026-10-12T00:00:00Z');
    for (let week = 0; week < CHALLENGE_THEMES.length * 2; week++) {
        const challenge = challengeAt(start + week * 7 * 86400000);
        assert(normalizeBuildTag(challenge.tag) === challenge.tag, `${challenge.tag} is a valid build tag`);
    }
    assert(new Set(CHALLENGE_THEMES.map((theme) => theme.id)).size === CHALLENGE_THEMES.length, 'no theme repeats');
    for (const theme of CHALLENGE_THEMES) {
        assert(structures.has(theme.starterStructureId), `${theme.id} starts from a built-in structure`);
        assert(theme.ideaStructureIds.length > 0, `${theme.id} has ideas`);
        for (const id of theme.ideaStructureIds) assert(structures.has(id), `${theme.id}'s idea ${id} is built in`);
    }
    console.log('✓ every tag is a build tag and every theme starts from built-in structures');
}

// A challenge is found again from its id or its tag; nothing else names one.
{
    const challenge = challengeAt(Date.parse('2026-11-04T09:00:00Z'));
    assert(challengeById(challenge.id).tag === challenge.tag, 'the id finds the same challenge');
    assert(challengeForTag(challenge.tag).id === challenge.id, 'the tag finds the same challenge');
    for (const id of ['2026-11-03', '2026-02-30', '2026-11-2', 'monday', '', null, 42]) {
        assert(challengeById(id) === null, `${JSON.stringify(id)} names no challenge`);
    }
    const otherTheme = CHALLENGE_THEMES.find((theme) => theme.id !== challenge.themeId).id;
    for (const tag of [`${otherTheme}-${challenge.id.replaceAll('-', '')}`, 'lighthouse', 'lighthouse-20261013', 'Lighthouse-20261012', 'castle', null]) {
        assert(challengeForTag(tag) === null, `${JSON.stringify(tag)} enters no challenge`);
    }
    assert(challengeOfTags(['castle', challenge.tag]).id === challenge.id, 'a build\'s tags are searched for the week\'s tag');
    assert(challengeOfTags(['castle']) === null && challengeOfTags(null) === null, 'other tags enter nothing');
    assert(previousChallenge(challenge).endsAt.getTime() === challenge.startsAt.getTime(), 'the previous week ends as this one starts');
    console.log('✓ a challenge is named by its Monday or its tag');
}

// Joining puts the week's tag first, keeping the build's own tags as far as
// they fit.
{
    const challenge = challengeAt(Date.parse('2026-10-14T00:00:00Z'));
    assert(withChallengeTag([], challenge, BUILD_TAG_MAX_COUNT).join() === challenge.tag, 'an untagged build gets the tag');
    const full = withChallengeTag(['a1', 'b2', 'c3', 'd4', 'e5'], challenge, BUILD_TAG_MAX_COUNT);
    assert(full.length === BUILD_TAG_MAX_COUNT && full[0] === challenge.tag && full[4] === 'd4', 'a full list drops its last tag');
    assert(withChallengeTag(['a1', challenge.tag], challenge, BUILD_TAG_MAX_COUNT).join() === `${challenge.tag},a1`, 'the tag is never doubled');
    console.log('✓ joining tags the build without losing more than it must');
}

// Days left count a part day as a whole one; a finished week is closed.
{
    const challenge = challengeAt(Date.parse('2026-10-14T00:00:00Z'));
    assert(challengeDaysLeft(challenge, Date.parse('2026-10-12T00:00:00Z')) === 7, 'a whole week at the start');
    assert(challengeDaysLeft(challenge, Date.parse('2026-10-18T23:00:00Z')) === 1, 'the last hour is a day');
    assert(challengeDaysLeft(challenge, Date.parse('2026-10-20T00:00:00Z')) === 0, 'none after the end');
    assert(isChallengeOpen(challenge, Date.parse('2026-10-15T00:00:00Z')), 'open during its week');
    assert(!isChallengeOpen(challenge, Date.parse('2026-10-19T00:00:00Z')), 'closed once the next week starts');
    console.log('✓ days left and open or closed');
}
