import { describePublicationClaimLocator, linkOnlyPublicationViewUrl, publicationShareUrl, FORKBUILD_APP_URL } from '../../core/ForkBuildAppLinks.js';
import { PublicationDistributionState } from './distribution/PublicationDistributionLifecycle.js';
import { ContentReference } from '../../core/ContentReference.js';
import { MAX_LINK_PAYLOAD_LENGTH, encodePublicationLinkPayload } from './sharing/PublicationLinkPayload.js';
import { message } from '../../core/Message.js';

// Sharing a Publication with friends: the link that opens it in World View on
// any device (core/ForkBuildAppLinks.js). Once the Publication is distributed,
// the link names where its Signed Claim was stored, as the distribution
// lifecycle records it. Before that, a build small enough travels inside the
// link itself (a link-only share), so sharing needs no network, wallet or
// account anywhere.

export const ShareLinkKind = Object.freeze({
    NETWORK: 'network',
    LINK_ONLY: 'link-only'
});

// What to offer for `lifecycle` (a PublicationDistributionLifecycleMemoryStore
// entry, or null) and `linkOnly` (what prepareLinkOnlyShare() resolved to, or
// null while it hasn't): null when there is nothing to share yet;
// `{ available: true, kind, url, title, text, hint, note }` when it can be
// shared (`note` says what to expect where the claim is stored, or is null);
// `{ available: false, reason }` when no link reaches it. A distributed
// Publication's network link comes first, as the shorter link. `reason`,
// `hint`, `note` and `text` are messages (core/Message.js), and so is `title`
// when the Publication has none; the UI hands the share functions below a copy
// with them turned into text.
export function describePublicationShare({ lifecycle, title = null, linkOnly = null }) {
    const name = typeof title === 'string' && title.trim() ? title.trim() : message('share.untitled');
    const material = lifecycle?.material;
    const distributed = Boolean(material && material.state === PublicationDistributionState.PRESENT);
    const networkUrl = distributed ? publicationShareUrl(material) : null;
    if (networkUrl) {
        return Object.freeze({
            available: true, kind: ShareLinkKind.NETWORK, url: networkUrl, title: name,
            text: message('share.text', { title: name }), hint: message('share.hint'), note: shareNote(material)
        });
    }
    if (linkOnly?.url) {
        return Object.freeze({
            available: true, kind: ShareLinkKind.LINK_ONLY, url: linkOnly.url, title: name,
            text: message('share.text', { title: name }), hint: message('share.linkOnlyHint'), note: null
        });
    }
    if (distributed) return Object.freeze({ available: false, reason: message('share.unreachable') });
    if (linkOnly?.reason) return Object.freeze({ available: false, reason: linkOnly.reason });
    return null;
}

// The link-only share for `publication` (a Publication, or its JSON), read
// from `contentStore`: `{ url, payloadLength, snapshotText }`, or `{ reason,
// snapshotText }` (`reason` a message) when it can't be offered: unsigned, its
// build not on this device (`snapshotText` then null), or too large for a
// link. `snapshotText` is the build, for a picture of it. Never throws.
export async function prepareLinkOnlyShare({ publication, contentStore, appUrl = FORKBUILD_APP_URL, maxPayloadLength = MAX_LINK_PAYLOAD_LENGTH }) {
    const claim = typeof publication?.toJSON === 'function' ? publication.toJSON() : publication;
    const hash = claim?.contentReference?.hash ?? claim?.contentHash;
    let snapshotText = null;
    try {
        snapshotText = hash && contentStore ? await readContent(contentStore, new ContentReference({ hash })) : null;
        if (snapshotText && typeof snapshotText !== 'string') snapshotText = new TextDecoder().decode(snapshotText);
    } catch {
        snapshotText = null;
    }
    if (!snapshotText) return Object.freeze({ reason: message('share.linkOnlyNoBuild'), snapshotText: null });
    // Opening the link checks the signature, so an unsigned one would only fail there.
    if (!claim.signature || !claim.publisherIdentity) {
        return Object.freeze({ reason: message('share.linkOnlyUnsigned'), snapshotText });
    }
    let payload;
    try {
        payload = await encodePublicationLinkPayload({ claim, snapshotText });
    } catch {
        return Object.freeze({ reason: message('share.linkOnlyUnavailable'), snapshotText });
    }
    if (payload.length > maxPayloadLength) return Object.freeze({ reason: message('share.linkOnlyTooLarge'), snapshotText });
    return Object.freeze({ url: linkOnlyPublicationViewUrl(payload, appUrl), payloadLength: payload.length, snapshotText });
}

// A local store may hold content on disk and not yet in memory; getSync()
// then throws an error whose `ready` settles once it is loaded.
async function readContent(contentStore, reference) {
    if (typeof contentStore.getSync !== 'function') return contentStore.get(reference);
    try {
        return contentStore.getSync(reference);
    } catch (error) {
        if (!error?.ready) throw error;
        await error.ready;
        return contentStore.getSync(reference);
    }
}

// What a friend should expect, from where the claim is stored.
function shareNote(material) {
    const network = describePublicationClaimLocator(material.uri)?.network;
    if (network === 'arweave') return message('share.arweaveNote');
    if (network === 'ipfs' && material.storage !== 'remote-pinning') {
        return message('share.ipfsNodeNote');
    }
    return null;
}

// Whether this browser offers the system share sheet for `share`.
export function canUseShareSheet(share, navigatorImpl = globalThis.navigator) {
    if (!share?.available || typeof navigatorImpl?.share !== 'function') return false;
    return typeof navigatorImpl.canShare !== 'function' || navigatorImpl.canShare(shareData(share));
}

// Opens the system share sheet. Resolves to 'shared', 'cancelled' (the person
// closed it), or, when it can't be used, what copyPublicationShareLink()
// resolves to.
export async function sharePublicationLink(share, navigatorImpl = globalThis.navigator) {
    if (!canUseShareSheet(share, navigatorImpl)) return copyPublicationShareLink(share, navigatorImpl);
    try {
        await navigatorImpl.share(shareData(share));
        return 'shared';
    } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
        return copyPublicationShareLink(share, navigatorImpl);
    }
}

// Copies the link. Resolves to 'copied', or 'unavailable' when the browser
// won't allow it (the link is then shown to copy by hand).
export async function copyPublicationShareLink(share, navigatorImpl = globalThis.navigator) {
    if (!share?.available || typeof navigatorImpl?.clipboard?.writeText !== 'function') return 'unavailable';
    try {
        await navigatorImpl.clipboard.writeText(share.url);
        return 'copied';
    } catch {
        return 'unavailable';
    }
}

function shareData(share) {
    return { title: share.title, text: share.text, url: share.url };
}
