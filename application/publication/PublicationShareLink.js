import { describePublicationClaimLocator, publicationShareUrl } from '../../core/ForkBuildAppLinks.js';
import { PublicationDistributionState } from './distribution/PublicationDistributionLifecycle.js';

// Sharing a distributed Publication with friends: the link that opens it in
// World View on any device (core/ForkBuildAppLinks.js), taken from where its
// Signed Claim was stored, as the distribution lifecycle records it.

// What to offer for `lifecycle` (a PublicationDistributionLifecycleMemoryStore
// entry, or null): null before the Publication has been distributed;
// `{ available: true, url, title, text, note }` when it can be shared (`note`
// says what to expect where the claim is stored, or is null);
// `{ available: false, reason }` when its claim is stored where no link can
// reach it.
export function describePublicationShare({ lifecycle, title = null }) {
    const material = lifecycle?.material;
    if (!material || material.state !== PublicationDistributionState.PRESENT) return null;
    const url = publicationShareUrl(material);
    if (!url) {
        return Object.freeze({
            available: false,
            reason: 'This Publication\'s Signed Claim is stored where a link can\'t reach it. Distribute it again with Steem, Arweave or IPFS storage to get a link.'
        });
    }
    const name = typeof title === 'string' && title.trim() ? title.trim() : 'A build';
    return Object.freeze({ available: true, url, title: name, text: `${name}, built with ForkBuild`, note: shareNote(material) });
}

// What a friend should expect, from where the claim is stored.
function shareNote(material) {
    const network = describePublicationClaimLocator(material.uri)?.network;
    if (network === 'arweave') return 'Stored on Arweave: right after distributing, the link can take a few minutes to open.';
    if (network === 'ipfs' && material.storage !== 'remote-pinning') {
        return 'Stored on your own IPFS node: friends can open the link only while your node is online and reachable. Remote pinning or Arweave keeps it available.';
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
