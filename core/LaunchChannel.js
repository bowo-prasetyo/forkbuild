import { VISITOR_COUNT_ENDPOINT } from './VisitorCount.js';

// Where a visit came from, when it came through a link ForkBuild's own launch
// posts use (docs/launch/README.md): `?ref=<channel>` on the site's address,
// one of a fixed list. The visitor counter (docs/Privacy.md, "Visitor count")
// hears it as one more fixed path, `/r/<channel>`, under the same rules as
// the other moments it counts. Any other value, and any other parameter,
// names nothing and is never sent.
export const LAUNCH_CHANNELS = Object.freeze([
    'hn', 'producthunt', 'reddit', 'itch', 'nostr', 'steem', 'blurt', 'edu', 'github'
]);

export const LAUNCH_CHANNEL_PARAMETER = 'ref';

const CHANNELS = new Set(LAUNCH_CHANNELS);

// The launch channel a page address's query (`location.search`) names, or
// null.
export function launchChannelOf(search) {
    if (typeof search !== 'string' || !search) return null;
    let value;
    try {
        value = new URLSearchParams(search).getAll(LAUNCH_CHANNEL_PARAMETER);
    } catch {
        return null;
    }
    return value.length === 1 && CHANNELS.has(value[0]) ? value[0] : null;
}

export function launchChannelHitUrl(channel, random) {
    if (!CHANNELS.has(channel)) throw new TypeError(`not a launch channel: ${channel}`);
    return `${VISITOR_COUNT_ENDPOINT}?p=${encodeURIComponent(`/r/${channel}`)}&rnd=${encodeURIComponent(random)}`;
}

// `href` without its `ref` parameter, or null when it has none, so the
// address a visitor sees, bookmarks or passes on doesn't carry it.
export function addressWithoutLaunchChannel(href) {
    let url;
    try {
        url = new URL(href);
    } catch {
        return null;
    }
    if (!url.searchParams.has(LAUNCH_CHANNEL_PARAMETER)) return null;
    url.searchParams.delete(LAUNCH_CHANNEL_PARAMETER);
    return url.toString();
}
