import { createBlurtPoster } from './BlurtPoster.js';
import { createBlurtFeeEstimator } from './BlurtFeeEstimator.js';
import { BlurtAnchorPublisher } from '../../anchoring/BlurtAnchorPublisher.js';
import { createBlurtKeychainBroadcaster } from '../../blurt/BlurtKeychain.js';

// What posts to Blurt (application/blurt/BlurtRuntimeComposition.js loads it
// the first time something is posted, or as the writer is switched on): the
// poster, the fee estimator and the `blurt` anchor publisher. With no
// `getBroadcaster`, posts are signed through Blurt Keychain, looked up each
// time.
export function composeBlurtPosting({
    rpc,
    getAccount,
    getBroadcaster = () => createBlurtKeychainBroadcaster(),
    isEnabled,
    appVersion,
    records,
    onWaiting
}) {
    // Nothing is posted while this device's Blurt writer is switched off
    // (core/publication/NetworkWriters.js).
    const poster = createBlurtPoster({ rpc, getAccount, getBroadcaster, isEnabled, appVersion, records, onWaiting });
    return Object.freeze({
        poster,
        estimator: createBlurtFeeEstimator({ rpc }),
        anchorPublisher: new BlurtAnchorPublisher({ poster, rpc })
    });
}
