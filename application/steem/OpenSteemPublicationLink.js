import { steemContentLocator } from '../../core/SteemContentManifest.js';
import { OpenPublicationLinkOutcome, openPublicationLink } from '../publication/OpenPublicationLink.js';
import { message } from '../../core/Message.js';

// Opening a Publication from its Steem post, by author and permlink: the
// Steem case of application/publication/OpenPublicationLink.js.

export const OpenSteemPublicationLinkOutcome = Object.freeze({
    ...OpenPublicationLinkOutcome,
    STEEM_UNREACHABLE: OpenPublicationLinkOutcome.UNREACHABLE
});

export async function openSteemPublicationLink({ author, permlink, ...rest }) {
    let locator;
    try {
        locator = steemContentLocator(author, permlink);
    } catch {
        return Object.freeze({ outcome: OpenPublicationLinkOutcome.INVALID_LINK, publication: null, documentId: null, message: message('publicationLink.notASteemPost') });
    }
    return openPublicationLink({ locator, ...rest });
}
