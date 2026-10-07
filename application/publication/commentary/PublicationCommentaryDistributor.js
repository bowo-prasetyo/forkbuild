import { LOCAL_AND_PEERS_ONLY } from '../../../core/CommentaryDistributionProvider.js';

// The discovery-provider value that keeps a comment off every network: it is
// saved on this device and announced to connected peers, nothing more. For
// commenters with no network account, or who don't want the comment published.
export { LOCAL_AND_PEERS_ONLY };

// Sends a comment that is already saved on this device onward: an announce to
// connected peers, then at most one network (Nostr, Arweave, Steem or Blurt), never
// several, or none for LOCAL_AND_PEERS_ONLY. Every failure is swallowed: a comment
// stays saved whether or not it travels, and posting never waits for a network.
//
// `substrateFor(provider)` returns that network's distribution (anything with
// `publish(envelopeJson) -> Promise`) or null when it isn't set up;
// `defaultProvider()` is the saved comment default, else the Announcement /
// Discovery preference. Both are
// read on each call, so the composition root may fill them in later.
export function createPublicationCommentaryDistributor({ peerExchange, distributionExchange, substrateFor, defaultProvider }) {
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
            distribution.publish(envelopeJson).catch(() => {});
        } catch {
        }
    };
}
