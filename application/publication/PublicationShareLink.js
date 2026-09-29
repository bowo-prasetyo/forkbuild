import { describePublicationClaimLocator, publicationShareUrl } from '../../core/ForkBuildAppLinks.js';
import { PublicationDistributionState } from './distribution/PublicationDistributionLifecycle.js';
import { message } from '../../core/Message.js';

// Sharing a distributed Publication with friends: the link that opens it in
// World View on any device (core/ForkBuildAppLinks.js), taken from where its
// Signed Claim was stored, as the distribution lifecycle records it.

// What to offer for `lifecycle` (a PublicationDistributionLifecycleMemoryStore
// entry, or null): null before the Publication has been distributed;
// `{ available: true, url, title, text, note }` when it can be shared (`note`
// says what to expect where the claim is stored, or is null);
// `{ available: false, reason }` when its claim is stored where no link can
// reach it. `reason`, `note` and `text` are messages (core/Message.js), and so
// is `title` when the Publication has none; the UI hands the share functions
// below a copy with them turned into text.
export function describePublicationShare({ lifecycle, title = null }) {
    const material = lifecycle?.material;
    if (!material || material.state !== PublicationDistributionState.PRESENT) return null;
    const url = publicationShareUrl(material);
    if (!url) {
        return Object.freeze({
            available: false,
            reason: message('share.unreachable')
        });
    }
    const name = typeof title === 'string' && title.trim() ? title.trim() : message('share.untitled');
    return Object.freeze({ available: true, url, title: name, text: message('share.text', { title: name }), note: shareNote(material) });
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
