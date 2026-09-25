import { isPlainObject } from '../utils/typeGuards.js';

// Steem discovery threads: the monthly root posts that announcements reply
// to (docs/Protocol.md, "Proposed: Steem Announcement Substrate"). This file
// only names and describes them; it never talks to the network.

export const STEEM_DISCOVERY_THREAD_ACCOUNT = 'forkbuild';
export const STEEM_DISCOVERY_THREAD_CATEGORY = 'forkbuild';
export const STEEM_DISCOVERY_THREAD_VERSION = 1;
export const STEEM_DISCOVERY_FAMILIES = Object.freeze(['publication', 'snapshot', 'place-naming', 'commentary']);
// The chain accepts one root post per account in this interval.
export const STEEM_ROOT_POST_INTERVAL_MS = 5 * 60 * 1000;
export const STEEM_DECLINED_PAYOUT = '0.000 SBD';

const PROTOCOL_URL = 'https://github.com/bowo-prasetyo/forkbuild/blob/main/docs/Protocol.md';
const PROJECT_URL = 'https://github.com/bowo-prasetyo/forkbuild';
const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
// Steem account names: 3–16 characters, dot-separated segments that start
// with a letter.
const ACCOUNT_PATTERN = /^(?=.{3,16}$)[a-z][a-z0-9-]*[a-z0-9](\.[a-z][a-z0-9-]*[a-z0-9])*$/;

const FAMILY_TEXT = Object.freeze({
    publication: { label: 'publication', announces: 'where a signed ForkBuild publication can be found' },
    snapshot: { label: 'snapshot', announces: "where a published snapshot's content is stored, and its content hash" },
    'place-naming': { label: 'place naming', announces: 'a signed claim naming a region of a ForkBuild world' },
    commentary: { label: 'commentary', announces: 'a signed comment on a ForkBuild publication' }
});

export function isSteemDiscoveryFamily(family) {
    return STEEM_DISCOVERY_FAMILIES.includes(family);
}

export function isSteemDiscoveryPeriod(period) {
    return typeof period === 'string' && PERIOD_PATTERN.test(period);
}

export function isSteemAccountName(account) {
    return typeof account === 'string' && ACCOUNT_PATTERN.test(account);
}

// The UTC month a moment falls in, as `YYYY-MM`.
export function steemDiscoveryPeriodOf(date) {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}`;
}

// `count` consecutive periods starting at `start`.
export function steemDiscoveryPeriodsFrom(start, count) {
    requirePeriod(start);
    if (!Number.isInteger(count) || count < 0) throw new TypeError(`count must be a non-negative integer, got ${count}`);
    const [, year, month] = PERIOD_PATTERN.exec(start);
    const first = Number(year) * 12 + Number(month) - 1;
    return Array.from({ length: count }, (_, i) => {
        const index = first + i;
        return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    });
}

export function steemDiscoveryThreadPermlink(family, period) {
    requireFamily(family);
    requirePeriod(period);
    return `forkbuild-${family}-${period}`;
}

// The root post for one family and month: what the thread account
// broadcasts, before it is turned into operations.
export function describeSteemDiscoveryThreadPost({ account = STEEM_DISCOVERY_THREAD_ACCOUNT, family, period }) {
    requireAccount(account);
    const permlink = steemDiscoveryThreadPermlink(family, period);
    const { label, announces } = FAMILY_TEXT[family];
    return Object.freeze({
        account,
        family,
        period,
        permlink,
        title: `ForkBuild ${label} announcements, ${period}`,
        body: threadBody({ account, family, period, label, announces }),
        jsonMetadata: Object.freeze({
            tags: [STEEM_DISCOVERY_THREAD_CATEGORY],
            forkbuild: { thread: { version: STEEM_DISCOVERY_THREAD_VERSION, family, period } }
        })
    });
}

// The post and its options, in one transaction: votes can only be turned
// off before a post has any.
export function steemDiscoveryThreadOperations(post) {
    return [
        ['comment', {
            parent_author: '',
            parent_permlink: STEEM_DISCOVERY_THREAD_CATEGORY,
            author: post.account,
            permlink: post.permlink,
            title: post.title,
            body: post.body,
            json_metadata: JSON.stringify(post.jsonMetadata)
        }],
        ['comment_options', {
            author: post.account,
            permlink: post.permlink,
            max_accepted_payout: STEEM_DECLINED_PAYOUT,
            percent_steem_dollars: 10000,
            allow_votes: false,
            allow_curation_rewards: false,
            extensions: []
        }]
    ];
}

// Checks what `condenser_api.get_content` returned for a thread. A missing
// post comes back from the chain as an empty record (`author: ''`).
// Returns `{ exists, problems }`; a thread is usable when it exists and has
// no problems.
export function checkSteemDiscoveryThreadContent(content, { account = STEEM_DISCOVERY_THREAD_ACCOUNT, family, period }) {
    const permlink = steemDiscoveryThreadPermlink(family, period);
    if (!isPlainObject(content) || !content.author) return Object.freeze({ exists: false, problems: Object.freeze([]) });
    const problems = [];
    if (content.author !== account) problems.push(`author is ${content.author}, expected ${account}`);
    if (content.permlink !== permlink) problems.push(`permlink is ${content.permlink}, expected ${permlink}`);
    if (content.parent_author !== '') problems.push('it is a reply, not a root post');
    if (content.parent_permlink !== STEEM_DISCOVERY_THREAD_CATEGORY) problems.push(`category is ${content.parent_permlink}, expected ${STEEM_DISCOVERY_THREAD_CATEGORY}`);
    if (!isDeclinedPayout(content.max_accepted_payout)) problems.push(`payout is not declined (max_accepted_payout ${content.max_accepted_payout})`);
    if (content.allow_votes !== false) problems.push('votes are allowed');
    if (content.allow_curation_rewards !== false) problems.push('curation rewards are allowed');
    if (content.allow_replies !== true) problems.push('replies are turned off, so nobody can announce here');
    const thread = parseJson(content.json_metadata)?.forkbuild?.thread;
    if (!isPlainObject(thread) || thread.version !== STEEM_DISCOVERY_THREAD_VERSION || thread.family !== family || thread.period !== period) {
        problems.push('json_metadata does not describe this thread');
    }
    return Object.freeze({ exists: true, problems: Object.freeze(problems) });
}

function threadBody({ account, family, period, label, announces }) {
    return [
        `This is a **ForkBuild discovery thread** for ${label} announcements in ${period} (UTC).`,
        '',
        `Each direct reply to this post announces ${announces}. The ForkBuild app reads these replies to discover content; people normally won't need to read them.`,
        '',
        "- **What a reply contains.** The announcement is in the reply's `json_metadata` under `forkbuild`. The reply text is only a short note for people reading the thread.",
        "- **Nothing is trusted because it's posted here.** ForkBuild accepts an announcement only if its content hash and ForkBuild signature check out. The Steem account that posted a reply isn't treated as the author.",
        '- **No rewards, no voting.** This thread and every announcement decline payout and have voting turned off.',
        "- **Replying.** Reply here only through the ForkBuild app. The app ignores replies to replies, and ignores anything it can't verify.",
        '',
        `A new thread opens each month: \`@${account}/forkbuild-${family}-YYYY-MM\`.`,
        '',
        `Protocol: ${PROTOCOL_URL}`,
        `Project: ${PROJECT_URL}`
    ].join('\n');
}

// The chain reports amounts as "<number> <symbol>"; any zero amount means
// payout is declined.
function isDeclinedPayout(amount) {
    if (typeof amount !== 'string') return false;
    const [value] = amount.split(' ');
    return value !== '' && Number(value) === 0;
}

function parseJson(text) {
    if (typeof text !== 'string') return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function requireFamily(family) {
    if (!isSteemDiscoveryFamily(family)) throw new TypeError(`unknown Steem discovery family: ${family}`);
}

function requirePeriod(period) {
    if (!isSteemDiscoveryPeriod(period)) throw new TypeError(`a period must be YYYY-MM, got ${period}`);
}

function requireAccount(account) {
    if (!isSteemAccountName(account)) throw new TypeError(`not a Steem account name: ${account}`);
}
