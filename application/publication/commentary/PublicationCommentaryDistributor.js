import { LOCAL_AND_PEERS_ONLY } from '../../../core/CommentaryDistributionProvider.js';
import { UserFacingError } from '../../../core/UserFacingError.js';
import { message } from '../../../core/Message.js';

// The discovery-provider value that keeps a comment off every network: it is
// saved on this device and announced to connected peers, nothing more. For
// commenters with no network account, or who don't want the comment published.
export { LOCAL_AND_PEERS_ONLY };

// Network names, the same in every language.
const NETWORK_NAMES = { nostr: 'Nostr', arweave: 'Arweave', steem: 'Steem', blurt: 'Blurt' };

// Sends a comment that is already saved on this device onward: an announce to
// connected peers, then at most one network (Nostr, Arweave, Steem or Blurt), never
// several, or none for LOCAL_AND_PEERS_ONLY. Every failure is swallowed: a comment
// stays saved whether or not it travels, and posting never waits for a network.
// A network that accepts it is recorded in `distributionLog`, when given.
//
// `substrateFor(provider)` returns that network's distribution (anything with
// `publish(envelopeJson) -> Promise`) or null when it isn't set up;
// `defaultProvider()` is the saved comment default, else the Announcement /
// Discovery preference. Both are
// read on each call, so the composition root may fill them in later.
export function createPublicationCommentaryDistributor({ peerExchange, distributionExchange, substrateFor, defaultProvider, distributionLog = null }) {
    return function distributePublicationCommentary(commentary, discoveryProvider) {
        try {
            peerExchange.announce(commentary);
        } catch {
        }
        const provider = discoveryProvider || defaultProvider();
        if (provider === LOCAL_AND_PEERS_ONLY) {
            return;
        }
        const distribution = substrateFor(provider);
        if (!distribution) {
            return;
        }
        try {
            const envelopeJson = distributionExchange.exportCommentary(commentary);
            // Not awaited; a rejection is swallowed like the announce failure above.
            distribution.publish(envelopeJson).then((result) => {
                if (distributionLog) distributionLog.record({ commentary, substrate: provider, result });
            }).catch(() => {});
        } catch {
        }
    };
}

// Sends one comment that is already saved on this device to one network, later
// than posting: for a comment posted to connected peers only, or to add another
// network. Unlike posting, the caller waits and hears the outcome:
// resolves the logged entry ({ substrate, locator, url, at, … }) and rejects with
// a UserFacingError naming the network when it isn't set up on this device or
// doesn't accept the comment. Only the comment's author, signed in, can send it:
// distributionExchange.exportCommentary() signs it and refuses anyone else.
export function createSavedPublicationCommentaryDistributor({ distributionExchange, substrateFor, distributionLog }) {
    return async function distributeSavedPublicationCommentary(commentary, provider) {
        const network = NETWORK_NAMES[provider];
        if (!network) {
            throw new UserFacingError(message('commentaryNetworkDistribution.chooseANetwork'));
        }
        const distribution = substrateFor(provider);
        if (!distribution) {
            throw new UserFacingError(message('commentaryNetworkDistribution.networkUnavailable', { network }));
        }
        const envelopeJson = distributionExchange.exportCommentary(commentary);
        const result = await distribution.publish(envelopeJson);
        if (!result || result.published !== true) {
            throw new UserFacingError(message('commentaryNetworkDistribution.declined', { network }));
        }
        return distributionLog.record({ commentary, substrate: provider, result });
    };
}
