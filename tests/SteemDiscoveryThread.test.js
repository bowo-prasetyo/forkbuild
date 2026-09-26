import {
    STEEM_DISCOVERY_FAMILIES,
    checkSteemDiscoveryThreadContent,
    describeSteemDiscoveryThreadPost,
    isSteemAccountName,
    steemDiscoveryPeriodOf,
    steemDiscoveryPeriodsFrom,
    steemDiscoveryThreadOperations,
    steemDiscoveryThreadPermlink
} from '../core/SteemDiscoveryThread.js';
import { assert } from './support/Assert.js';

function throws(fn) {
    try {
        fn();
        return false;
    } catch (error) {
        return error instanceof TypeError;
    }
}

// What the chain returns for a thread created from the operations below.
function chainContentFor(post, overrides = {}) {
    const [[, comment], [, options]] = steemDiscoveryThreadOperations(post);
    return {
        author: comment.author,
        permlink: comment.permlink,
        parent_author: comment.parent_author,
        parent_permlink: comment.parent_permlink,
        json_metadata: comment.json_metadata,
        max_accepted_payout: options.max_accepted_payout,
        allow_votes: options.allow_votes,
        allow_curation_rewards: options.allow_curation_rewards,
        allow_replies: true,
        ...overrides
    };
}

// Permlinks and periods.
{
    assert(steemDiscoveryThreadPermlink('snapshot', '2026-09') === 'forkbuild-snapshot-2026-09', 'permlink for snapshot, September 2026');
    assert(steemDiscoveryThreadPermlink('place-naming', '2026-10') === 'forkbuild-place-naming-2026-10', 'permlink for place naming');
    assert(throws(() => steemDiscoveryThreadPermlink('votes', '2026-09')), 'an unknown family is refused');
    assert(throws(() => steemDiscoveryThreadPermlink('snapshot', '2026-13')), 'month 13 is refused');
    assert(throws(() => steemDiscoveryThreadPermlink('snapshot', '2026-9')), 'a one-digit month is refused');

    assert(steemDiscoveryPeriodOf(new Date('2026-09-30T23:59:59Z')) === '2026-09', 'the period is the UTC month');
    assert(steemDiscoveryPeriodOf(new Date('2026-10-01T00:00:00Z')) === '2026-10', 'a new UTC month starts a new period');

    const periods = steemDiscoveryPeriodsFrom('2026-11', 4);
    assert(JSON.stringify(periods) === JSON.stringify(['2026-11', '2026-12', '2027-01', '2027-02']), `periods cross the year (got ${periods})`);
    assert(steemDiscoveryPeriodsFrom('2026-09', 0).length === 0, 'zero periods is an empty list');
    assert(throws(() => steemDiscoveryPeriodsFrom('2026-09', -1)), 'a negative count is refused');
    console.log('✓ permlinks and periods');
}

// Account names.
{
    for (const good of ['forkbuild', 'steemit', 'a-b.cde', 'abc123']) assert(isSteemAccountName(good), `${good} is an account name`);
    for (const bad of ['ab', 'ForkBuild', '1abc', 'abc-', 'a.b', 'averyveryverylongname', '']) assert(!isSteemAccountName(bad), `${bad} is not an account name`);
    assert(throws(() => describeSteemDiscoveryThreadPost({ account: 'No', family: 'snapshot', period: '2026-09' })), 'a bad account is refused');
    console.log('✓ account names');
}

// The post and its operations.
{
    const post = describeSteemDiscoveryThreadPost({ family: 'commentary', period: '2026-09' });
    assert(post.account === 'forkbuild', 'the default thread account is forkbuild');
    assert(post.permlink === 'forkbuild-commentary-2026-09', 'the post carries its permlink');
    assert(post.title === 'ForkBuild commentary announcements, 2026-09', `title (got ${post.title})`);
    assert(post.body.includes('a signed comment on a ForkBuild publication'), 'the body says what a reply announces');
    assert(post.body.includes('`@forkbuild/forkbuild-commentary-YYYY-MM`'), 'the body names the monthly pattern');

    const ops = steemDiscoveryThreadOperations(post);
    assert(ops.length === 2 && ops[0][0] === 'comment' && ops[1][0] === 'comment_options', 'a comment and its options, in that order');
    const [[, comment], [, options]] = ops;
    assert(comment.parent_author === '' && comment.parent_permlink === 'forkbuild', 'a root post in the forkbuild category');
    assert(comment.author === 'forkbuild' && options.author === 'forkbuild' && options.permlink === comment.permlink, 'the options name the same post');
    const metadata = JSON.parse(comment.json_metadata);
    assert(JSON.stringify(metadata.tags) === '["forkbuild"]', 'tagged forkbuild');
    assert(JSON.stringify(metadata.forkbuild.thread) === JSON.stringify({ version: 1, family: 'commentary', period: '2026-09' }), 'metadata describes the thread');
    assert(options.max_accepted_payout === '0.000 SBD', 'payout is declined');
    assert(options.allow_votes === true && options.allow_curation_rewards === true, 'votes and curation stay on, since Steem Keychain cannot sign them off');
    assert(!('allow_replies' in options), 'replies are left on');

    for (const family of STEEM_DISCOVERY_FAMILIES) {
        const other = describeSteemDiscoveryThreadPost({ account: 'someone', family, period: '2027-01' });
        assert(other.body.includes(`@someone/forkbuild-${family}-YYYY-MM`), `the ${family} body names its own account and family`);
    }
    console.log('✓ the thread post and its operations');
}

// Checking what the chain returned.
{
    const where = { family: 'snapshot', period: '2026-09' };
    const post = describeSteemDiscoveryThreadPost(where);

    const missing = checkSteemDiscoveryThreadContent({ author: '', permlink: '', id: 0 }, where);
    assert(!missing.exists && missing.problems.length === 0, 'an empty record is a missing thread');
    assert(!checkSteemDiscoveryThreadContent(null, where).exists, 'no record is a missing thread');

    const good = checkSteemDiscoveryThreadContent(chainContentFor(post), where);
    assert(good.exists && good.problems.length === 0, `a thread made from the operations is ready (problems: ${good.problems})`);
    assert(checkSteemDiscoveryThreadContent(chainContentFor(post, { max_accepted_payout: '0.000 SBD' }), where).problems.length === 0, 'the chain\'s zero amount counts as declined');

    const votesOff = checkSteemDiscoveryThreadContent(chainContentFor(post, { allow_votes: false, allow_curation_rewards: false }), where);
    assert(votesOff.exists && votesOff.problems.length === 0, 'a thread with votes off is ready too');

    const cases = [
        [{ max_accepted_payout: '1000000.000 SBD' }, 'payout is not declined'],
        [{ allow_replies: false }, 'replies are turned off'],
        [{ parent_author: 'someone' }, 'it is a reply'],
        [{ parent_permlink: 'steem' }, 'category is steem'],
        [{ author: 'impostor' }, 'author is impostor'],
        [{ json_metadata: '{"forkbuild":{"thread":{"version":1,"family":"publication","period":"2026-09"}}}' }, 'json_metadata does not describe'],
        [{ json_metadata: 'not json' }, 'json_metadata does not describe']
    ];
    for (const [override, expected] of cases) {
        const { exists, problems } = checkSteemDiscoveryThreadContent(chainContentFor(post, override), where);
        assert(exists && problems.some((p) => p.includes(expected)), `${JSON.stringify(override)} reports "${expected}" (got ${problems})`);
    }
    console.log('✓ checking a thread on the chain');
}
