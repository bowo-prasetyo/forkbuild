import { descriptionSnippet } from '../core/DescriptionMarkup.js';
import { groupRecentWorlds } from '../ui/views/recentWorlds/recentWorldGroups.js';
import { assert } from './support/Assert.js';

// My Worlds' shelves (ui/views/recentWorlds/recentWorldGroups.js) and the
// description snippet its cards share with Explore's.

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19, 12);
const visited = (id, daysAgo) => ({ documentId: id, lastVisitedAt: NOW - daysAgo * DAY_MS - 1000 });
const ids = (worlds) => worlds.map((world) => world.documentId).join();

// The latest World on its own, the rest by how many days ago, in order.
{
    const { latest, groups } = groupRecentWorlds([
        visited('a', 0), visited('b', 0), visited('c', 1), visited('d', 6), visited('e', 7), visited('f', 40)
    ], NOW);
    assert(latest.documentId === 'a', 'the World visited last is offered on its own');
    assert(groups.map((group) => group.id).join() === 'today,week,earlier', `three shelves (${groups.map((group) => group.id)})`);
    assert(ids(groups[0].worlds) === 'b', 'today');
    assert(ids(groups[1].worlds) === 'c,d', 'up to six days ago is this week');
    assert(ids(groups[2].worlds) === 'e,f', 'a week ago and more is earlier');
    assert(groups[1].titleKey === 'recentWorldsView.group.thisWeek', 'each titled by its message');
    console.log('✓ My Worlds shelves Worlds by when they were visited');
}

// Empty shelves are left out; with one World there are none.
{
    const one = groupRecentWorlds([visited('a', 3)], NOW);
    assert(one.latest.documentId === 'a' && one.groups.length === 0, 'one World: only the latest');
    const none = groupRecentWorlds([], NOW);
    assert(none.latest === null && none.groups.length === 0, 'no Worlds: nothing');
    const old = groupRecentWorlds([visited('a', 0), visited('b', 30)], NOW);
    assert(old.groups.map((group) => group.id).join() === 'earlier', 'no empty shelves');
    console.log('✓ empty shelves are left out');
}

// A visit with no time, or one in the future, isn't claimed to be today.
{
    const { groups } = groupRecentWorlds([visited('a', 0), { documentId: 'b' }, { documentId: 'c', lastVisitedAt: NOW + DAY_MS }], NOW);
    assert(groups.length === 1 && groups[0].id === 'earlier' && ids(groups[0].worlds) === 'b,c', 'shelved as earlier');
    console.log('✓ a visit of unknown time is shelved as earlier');
}

// The snippet: the description's words without its markup, cut with "…".
{
    assert(descriptionSnippet('') === '' && descriptionSnippet(undefined) === '', 'no description, no snippet');
    assert(descriptionSnippet('# Harbor\n\nA **small** harbor.') === 'Harbor A small harbor.', `markup dropped (${descriptionSnippet('# Harbor\n\nA **small** harbor.')})`);
    const long = 'word '.repeat(60);
    const snippet = descriptionSnippet(long, 20);
    assert(snippet === 'word word word word…', `cut at the length (${snippet})`);
    assert(descriptionSnippet('x'.repeat(200)) === 'x'.repeat(160) + '…', 'cut at 160 by default');
    console.log('✓ description snippets');
}
