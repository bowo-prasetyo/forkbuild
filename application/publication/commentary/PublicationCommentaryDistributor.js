// Sends a comment that is already saved on this device onward: an announce to
// connected peers, then at most one network (Nostr, Arweave or Steem), never
// several. Every failure is swallowed: a comment stays saved whether or not it
// travels, and posting never waits for a network.
//
// `substrateFor(provider)` returns that network's distribution (anything with
// `publish(envelopeJson) -> Promise`) or null when it isn't set up;
// `defaultProvider()` is the saved Announcement / Discovery preference. Both are
// read on each call, so the composition root may fill them in later.
export function createPublicationCommentaryDistributor({ peerExchange, distributionExchange, substrateFor, defaultProvider }) {
    return function distributePublicationCommentary(commentary, discoveryProvider) {
        try {
            peerExchange.announce(commentary);
        } catch {
        }
        const distribution = substrateFor(discoveryProvider || defaultProvider());
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
