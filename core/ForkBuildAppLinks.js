import { isSteemAccountName } from './SteemDiscoveryThread.js';
import { message } from './Message.js';
import { parseSteemContentLocator, steemContentLocator } from './SteemContentManifest.js';
import { blurtContentLocator, isBlurtAccountName, parseBlurtContentLocator } from './BlurtPost.js';

// Links into the published ForkBuild app, for text written where ForkBuild
// isn't running, such as the notice on a Steem or Blurt post or a link
// shared with a friend. Written into posts that stay on the chain, so it changes only if
// the app moves.
export const FORKBUILD_APP_URL = 'https://bowo-prasetyo.github.io/forkbuild/';

const PERMLINK_PATTERN = /^[a-z0-9-]{1,256}$/;
// An Arweave transaction id: 43 base64url characters.
const ARWEAVE_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// A link-only share's payload (application/publication/sharing/
// PublicationLinkPayload.js): base64url, as one path segment.
const LINK_PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;
// An IPFS CID on its own (no path): CIDv0 (base58, "Qm…") or CIDv1 (base32,
// "b…", or base36, "k…"), letters and digits only.
const IPFS_CID_PATTERN = /^[A-Za-z0-9]{32,128}$/;

// The app route that opens a Publication whose Signed Claim is stored on
// Steem as `@author/permlink` (ui/views/PublicationLinkView.js).
export function steemPublicationViewPath(author, permlink) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Steem permlink: ${permlink}`);
    return `/view/steem/${author}/${permlink}`;
}

export function steemPublicationViewUrl(author, permlink, appUrl = FORKBUILD_APP_URL) {
    return `${appUrl}#${steemPublicationViewPath(author, permlink)}`;
}

// The same, for a Signed Claim stored on Blurt.
export function blurtPublicationViewPath(author, permlink) {
    if (!isBlurtAccountName(author)) throw new TypeError(`not a Blurt account name: ${author}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Blurt permlink: ${permlink}`);
    return `/view/blurt/${author}/${permlink}`;
}

export function blurtPublicationViewUrl(author, permlink, appUrl = FORKBUILD_APP_URL) {
    return `${appUrl}#${blurtPublicationViewPath(author, permlink)}`;
}

// Where a Signed Claim is stored, as `{ network, locator }`, from its
// locator (`steem://author/permlink`, `blurt://author/permlink`, `ar://<id>`
// or `ipfs://<cid>`); null for anything the view can't open.
export function describePublicationClaimLocator(locator) {
    if (typeof locator !== 'string') return null;
    const steem = parseSteemContentLocator(locator);
    if (steem) return Object.freeze({ network: 'steem', locator, path: steemPublicationViewPath(steem.author, steem.permlink), label: message('publicationLink.label.steem', { author: steem.author, permlink: steem.permlink }) });
    const blurt = parseBlurtContentLocator(locator);
    if (blurt) return Object.freeze({ network: 'blurt', locator, path: blurtPublicationViewPath(blurt.author, blurt.permlink), label: message('publicationLink.label.blurt', { author: blurt.author, permlink: blurt.permlink }) });
    if (locator.startsWith('ar://')) {
        const id = locator.slice('ar://'.length);
        return ARWEAVE_ID_PATTERN.test(id) ? Object.freeze({ network: 'arweave', locator, path: `/view/ar/${id}`, label: message('publicationLink.label.arweave', { id }) }) : null;
    }
    if (locator.startsWith('ipfs://')) {
        const cid = locator.slice('ipfs://'.length);
        return IPFS_CID_PATTERN.test(cid) ? Object.freeze({ network: 'ipfs', locator, path: `/view/ipfs/${cid}`, label: message('publicationLink.label.ipfs', { cid }) }) : null;
    }
    return null;
}

// The Signed Claim's locator named by an app route (`/view/steem/<author>/
// <permlink>`, `/view/blurt/<author>/<permlink>`, `/view/ar/<id>`,
// `/view/ipfs/<cid>`), or null.
export function publicationClaimLocatorFromViewPath(path) {
    if (typeof path !== 'string') return null;
    const parts = path.split('/');
    if (parts[0] !== '' || parts[1] !== 'view') return null;
    let locator = null;
    if (parts[2] === 'steem' && parts.length === 5) {
        try {
            locator = steemContentLocator(parts[3], parts[4]);
        } catch {
            return null;
        }
    } else if (parts[2] === 'blurt' && parts.length === 5) {
        try {
            locator = blurtContentLocator(parts[3], parts[4]);
        } catch {
            return null;
        }
    } else if (parts[2] === 'ar' && parts.length === 4) {
        locator = `ar://${parts[3]}`;
    } else if (parts[2] === 'ipfs' && parts.length === 4) {
        locator = `ipfs://${parts[3]}`;
    }
    return describePublicationClaimLocator(locator)?.locator ?? null;
}

// The link that opens the Publication whose Signed Claim is at `locator`, or
// null when it can't be opened from a link.
export function publicationViewUrl(locator, appUrl = FORKBUILD_APP_URL) {
    const described = describePublicationClaimLocator(locator);
    return described ? `${appUrl}#${described.path}` : null;
}

// The link to share a Publication: its view in the app, from where its
// Signed Claim was stored. `material` is a distribution's material section
// (`{ uri, storage }`); null when there is no link for it.
export function publicationShareUrl(material, appUrl = FORKBUILD_APP_URL) {
    return publicationViewUrl(material?.uri, appUrl);
}

// The app route that opens a Publication carried inside the link itself, its
// Signed Claim and its build together (`/s/<payload>`), so sharing it needs no
// network. The route is in the fragment, which browsers never send to a server.
export function linkOnlyPublicationViewPath(payload) {
    if (!isLinkOnlyPublicationPayload(payload)) throw new TypeError('not a link payload');
    return `/s/${payload}`;
}

export function linkOnlyPublicationViewUrl(payload, appUrl = FORKBUILD_APP_URL) {
    return `${appUrl}#${linkOnlyPublicationViewPath(payload)}`;
}

export function isLinkOnlyPublicationPayload(payload) {
    return typeof payload === 'string' && LINK_PAYLOAD_PATTERN.test(payload);
}

// Where a link that carries its build is shared from, so it gets a title and
// a picture when pasted into a chat or a post: the rendezvous worker's
// /b/<payload> (server/rendezvous-worker/buildPreview.js), which shows link
// previews that, and sends people on to linkOnlyPublicationViewUrl().
export const FORKBUILD_LINK_PREVIEW_URL = 'https://forkbuild-rendezvous.prazjp.workers.dev/';

export function linkPreviewUrl(payload, previewUrl = FORKBUILD_LINK_PREVIEW_URL) {
    if (!isLinkOnlyPublicationPayload(payload)) throw new TypeError('not a link payload');
    return `${previewUrl}b/${payload}`;
}

// The payload a /b/<payload> link carries, or null.
export function payloadFromLinkPreviewUrl(url) {
    const match = typeof url === 'string' ? /\/b\/([A-Za-z0-9_-]+)(?:[?#].*)?$/.exec(url) : null;
    return match ? match[1] : null;
}
