import { isNonEmptyString, isPlainObject } from '../utils/typeGuards.js';
import { isSteemAccountName, isSteemDiscoveryFamily, steemDeclinedPayoutOptions } from './SteemDiscoveryThread.js';

// A Steem announcement: a direct reply to a discovery thread carrying one
// family's envelope in `json_metadata.forkbuild` (docs/Protocol.md,
// "Proposed: Steem Announcement Substrate"). This file only reads a reply's
// shape and builds one; the envelope inside is checked by its family's own
// parser and verifier, never here.

export const STEEM_DISCOVERY_ANNOUNCEMENT_VERSION = 1;
// The chain refuses a transaction larger than this.
export const STEEM_MAX_TRANSACTION_BYTES = 64 * 1024;

const PERMLINK_SUFFIX_PATTERN = /^[a-z0-9]{8}$/;
const ANNOUNCEMENT_BODY = Object.freeze({
    publication: 'A ForkBuild publication announcement, read by the ForkBuild app. See the thread above.',
    snapshot: 'A ForkBuild snapshot announcement, read by the ForkBuild app. See the thread above.',
    'place-naming': 'A ForkBuild place name, read by the ForkBuild app. See the thread above.',
    commentary: 'A ForkBuild comment, read by the ForkBuild app. See the thread above.'
});

// A reply's permlink: unique per author, from the time and eight random
// lowercase letters or digits the caller supplies.
export function steemDiscoveryAnnouncementPermlink(timeMs, suffix) {
    if (!Number.isInteger(timeMs) || timeMs < 0) throw new TypeError(`timeMs must be a non-negative integer, got ${timeMs}`);
    if (!PERMLINK_SUFFIX_PATTERN.test(suffix)) throw new TypeError(`suffix must be eight lowercase letters or digits, got ${suffix}`);
    return `forkbuild-${timeMs.toString(36)}-${suffix}`;
}

// The reply and its options, in one transaction, as docs/Protocol.md
// ("Announcing") specifies.
export function steemDiscoveryAnnouncementOperations({ author, threadAccount, threadPermlink, family, envelope, permlink, appVersion = null }) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!isSteemAccountName(threadAccount)) throw new TypeError(`not a Steem account name: ${threadAccount}`);
    if (!isSteemDiscoveryFamily(family)) throw new TypeError(`unknown Steem discovery family: ${family}`);
    if (!isNonEmptyString(threadPermlink) || !isNonEmptyString(permlink)) throw new TypeError('a thread permlink and a reply permlink are required');
    if (!isPlainObject(envelope)) throw new TypeError('the envelope must be an object');
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        forkbuild: { version: STEEM_DISCOVERY_ANNOUNCEMENT_VERSION, family, envelope }
    };
    return [
        ['comment', {
            parent_author: threadAccount,
            parent_permlink: threadPermlink,
            author,
            permlink,
            title: '',
            body: ANNOUNCEMENT_BODY[family],
            json_metadata: JSON.stringify(metadata)
        }],
        steemDeclinedPayoutOptions(author, permlink)
    ];
}

// An upper bound on the signed transaction's size: the chain's binary form
// is smaller than the operations' JSON.
export function steemOperationsByteLength(operations) {
    return new TextEncoder().encode(JSON.stringify(operations)).length;
}

// Returns `{ envelope, author, permlink, created }` for a reply that
// announces `family` on the given thread, or null for anything else:
// nested replies, other families, unreadable metadata. Anyone can reply to
// a thread, so null is the common case for noise and never an error.
export function parseSteemDiscoveryAnnouncement(reply, { threadAccount, threadPermlink, family }) {
    if (!isSteemDiscoveryFamily(family) || !isPlainObject(reply)) return null;
    if (reply.parent_author !== threadAccount || reply.parent_permlink !== threadPermlink) return null;
    if (!isNonEmptyString(reply.author) || !isNonEmptyString(reply.permlink)) return null;
    const forkbuild = parseJsonObject(reply.json_metadata)?.forkbuild;
    if (!isPlainObject(forkbuild)) return null;
    if (forkbuild.version !== STEEM_DISCOVERY_ANNOUNCEMENT_VERSION || forkbuild.family !== family) return null;
    if (!isPlainObject(forkbuild.envelope)) return null;
    return Object.freeze({
        envelope: forkbuild.envelope,
        author: reply.author,
        permlink: reply.permlink,
        created: typeof reply.created === 'string' ? reply.created : null
    });
}

function parseJsonObject(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    try {
        const value = JSON.parse(text);
        return isPlainObject(value) ? value : null;
    } catch {
        return null;
    }
}
