import { isNonEmptyString, isPlainObject } from '../utils/typeGuards.js';
import { isSteemDiscoveryFamily } from './SteemDiscoveryThread.js';

// A Steem announcement: a direct reply to a discovery thread carrying one
// family's envelope in `json_metadata.forkbuild` (docs/Protocol.md,
// "Proposed: Steem Announcement Substrate"). This file only reads a reply's
// shape; the envelope inside is checked by its family's own parser and
// verifier, never here.

export const STEEM_DISCOVERY_ANNOUNCEMENT_VERSION = 1;

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
