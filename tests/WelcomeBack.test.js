import { daysSince, enteredChallenge, latestSavedBuild, welcomeBack } from '../application/home/WelcomeBack.js';
import { challengeAt } from '../core/challenge/BuildChallenge.js';
import { assert } from './support/Assert.js';

// What Home's Welcome back offers a returning builder, from this device's
// own records: the build changed last, how many builds were published, and
// whether one of them entered this week's challenge.

const NOW = Date.parse('2026-10-29T12:00:00Z');
const challenge = challengeAt(NOW);
const lastWeek = challengeAt(NOW - 7 * 24 * 60 * 60 * 1000);
const DAY = 24 * 60 * 60 * 1000;

function snapshots(byId) {
    return async (name) => {
        const value = byId[name.replace(/^snapshot:/, '')];
        if (value instanceof Error) throw value;
        return value ?? null;
    };
}

// The build changed last, whatever order the manifest keeps.
{
    const latest = latestSavedBuild([
        { id: 'a', title: 'Shed', modified: '2026-10-20T10:00:00Z' },
        { id: 'b', title: '  Cottage  ', modified: '2026-10-27T10:00:00Z' },
        { id: 'c', title: 'Mill', modified: '2026-10-25T10:00:00Z' }
    ]);
    assert(latest.documentId === 'b' && latest.title === 'Cottage' && latest.modified === Date.parse('2026-10-27T10:00:00Z'), `the newest, its title trimmed (${JSON.stringify(latest)})`);
    assert(latestSavedBuild([{ id: 'x', modified: 'not a date' }, { title: 'no id', modified: '2026-10-27T10:00:00Z' }]) === null, 'entries without an id or a time are skipped');
    assert(latestSavedBuild(null) === null && latestSavedBuild([]) === null, 'none saved, none offered');
    assert(latestSavedBuild([{ id: 'u', modified: '2026-10-27T10:00:00Z' }]).title === '', 'an untitled build has an empty title');
    console.log('✓ the build changed last');
}

// Whole days, never negative.
{
    assert(daysSince(NOW, NOW) === 0 && daysSince(NOW - DAY + 1, NOW) === 0, 'today');
    assert(daysSince(NOW - DAY, NOW) === 1 && daysSince(NOW - 5 * DAY - 1, NOW) === 5, 'whole days');
    assert(daysSince(NOW + DAY, NOW) === 0, 'a time ahead of the clock reads as today');
    console.log('✓ days since a change');
}

// A newcomer gets nothing; a returning builder gets the build and the count, at once.
{
    assert(welcomeBack({ savedBuilds: [], ownPublications: [{ id: 'p', documentId: 'd' }] }) === null, 'no saved build: nothing to welcome back to');

    const ownPublications = [
        { id: 'p1', documentId: 'd1', publishedAt: new Date('2026-10-20T10:00:00Z') },
        { id: 'p2', documentId: 'd1', publishedAt: new Date('2026-10-21T10:00:00Z') },
        { id: 'p3', documentId: 'd2', publishedAt: new Date('2026-10-22T10:00:00Z') },
        { id: 'broken' },
        null
    ];
    const welcome = welcomeBack({ savedBuilds: [{ id: 'd1', title: 'Cottage', modified: '2026-10-27T10:00:00Z' }], ownPublications });
    assert(!(welcome instanceof Promise) && welcome.build.documentId === 'd1' && welcome.publishedBuilds === 2, `builds published, each counted once, without waiting (${welcome.publishedBuilds})`);
    assert(await enteredChallenge({ ownPublications, challenge, loadSnapshot: snapshots({}) }) === false, 'nothing published this week: not entered');
    assert(await enteredChallenge({ ownPublications, challenge }) === false, 'nothing to read snapshots with: not entered');
    console.log('✓ a returning builder\'s build and published count');
}

// Entered this week only by a build published since it began, carrying its tag.
{
    const thisWeek = new Date(challenge.startsAt.getTime() + DAY);
    const entered = await enteredChallenge({
        ownPublications: [{ id: 'p1', documentId: 'd1', publishedAt: thisWeek }],
        challenge,
        loadSnapshot: snapshots({ p1: { metadata: { tags: ['cozy', challenge.tag] } } })
    });
    assert(entered === true, 'a build tagged for this week, published this week, entered it');

    const oldTag = await enteredChallenge({
        ownPublications: [{ id: 'p1', documentId: 'd1', publishedAt: thisWeek }],
        challenge,
        loadSnapshot: snapshots({ p1: { metadata: { tags: [lastWeek.tag] } } })
    });
    assert(oldTag === false, 'last week\'s tag doesn\'t enter this week');

    let read = 0;
    const before = await enteredChallenge({
        ownPublications: [{ id: 'p1', documentId: 'd1', publishedAt: new Date(challenge.startsAt.getTime() - DAY) }],
        challenge,
        loadSnapshot: async () => { read++; return { metadata: { tags: [challenge.tag] } }; }
    });
    assert(before === false && read === 0, 'a build published before the week began isn\'t read');

    const unreadable = await enteredChallenge({
        ownPublications: [
            { id: 'p1', documentId: 'd1', publishedAt: thisWeek },
            { id: 'p2', documentId: 'd2', publishedAt: thisWeek.toISOString() }
        ],
        challenge,
        loadSnapshot: snapshots({ p1: new Error('gone'), p2: { metadata: { tags: [challenge.tag] } } })
    });
    assert(unreadable === true, 'an unreadable snapshot is skipped, not fatal');
    console.log('✓ this week\'s challenge entered');
}
