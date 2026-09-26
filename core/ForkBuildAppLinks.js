import { isSteemAccountName } from './SteemDiscoveryThread.js';

// Links into the published ForkBuild app, for text written where ForkBuild
// isn't running, such as the notice on a Steem post. Written into posts that
// stay on the chain, so it changes only if the app moves.
export const FORKBUILD_APP_URL = 'https://bowo-prasetyo.github.io/forkbuild/';

const PERMLINK_PATTERN = /^[a-z0-9-]{1,256}$/;

// The app route that opens a Publication whose Signed Claim is stored on
// Steem as `@author/permlink` (ui/views/SteemPublicationLinkView.js).
export function steemPublicationViewPath(author, permlink) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Steem permlink: ${permlink}`);
    return `/view/steem/${author}/${permlink}`;
}

export function steemPublicationViewUrl(author, permlink, appUrl = FORKBUILD_APP_URL) {
    return `${appUrl}#${steemPublicationViewPath(author, permlink)}`;
}
