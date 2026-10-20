import { createSteemAnnouncer } from './SteemAnnouncer.js';
import { createSteemResourceCreditEstimator } from './SteemResourceCreditEstimator.js';
import { SteemAnchorPublisher } from '../../anchoring/SteemAnchorPublisher.js';
import { createSteemKeychainBroadcaster } from '../../steem/SteemKeychainBroadcaster.js';

// What posts to Steem (application/steem/SteemRuntimeComposition.js loads it
// the first time something is posted, or as the writer is switched on): the
// announcer, the resource-credit estimator and the `steem` anchor publisher.
// With no `getBroadcaster`, posts are signed through Steem Keychain, looked
// up each time.
export function composeSteemPosting({
    rpc,
    getAccount,
    getBroadcaster = () => createSteemKeychainBroadcaster(),
    isEnabled,
    threadAccount,
    appVersion
}) {
    // Nothing is posted while this device's Steem writer is switched off
    // (core/publication/NetworkWriters.js).
    const announcer = createSteemAnnouncer({ rpc, getAccount, getBroadcaster, isEnabled, threadAccount, appVersion });
    return Object.freeze({
        announcer,
        estimator: createSteemResourceCreditEstimator({ rpc }),
        anchorPublisher: new SteemAnchorPublisher({ poster: announcer, rpc })
    });
}
