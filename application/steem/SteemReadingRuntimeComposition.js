import { SteemReadingConfiguration } from '../../core/SteemReadingConfiguration.js';
import { createSteemRpcClient } from '../../steem/SteemRpcClient.js';
import { createSteemDiscoveryThreadReader } from './SteemDiscoveryThreadReader.js';
import { SteemPublicationDiscoveryQueryService } from './SteemPublicationDiscoveryQueryService.js';
import { SteemSnapshotDiscoveryQueryService } from './SteemSnapshotDiscoveryQueryService.js';
import { SteemPlaceNamingDiscoverySource } from './SteemPlaceNamingDiscoverySource.js';
import { PublicationCommentarySteemDistribution } from './PublicationCommentarySteemDistribution.js';

// One thread reader, and each family's reader over it, from the saved Steem
// reading settings (or the defaults). Reading needs no Steem account or
// Keychain.
export function composeSteemReadingRuntime({ configuration = new SteemReadingConfiguration(), fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') return null;
    const rpc = createSteemRpcClient({ nodes: [...configuration.apiNodes], fetchImpl });
    const reader = createSteemDiscoveryThreadReader({
        rpc,
        threadAccounts: [...configuration.threadAccounts],
        earliestPeriod: configuration.earliestPeriod
    });
    return Object.freeze({
        configuration,
        reader,
        publicationDiscoveryQueryService: new SteemPublicationDiscoveryQueryService({ reader }),
        snapshotDiscoveryQueryService: new SteemSnapshotDiscoveryQueryService({ reader }),
        placeNamingDiscoverySource: new SteemPlaceNamingDiscoverySource({ reader }),
        commentaryDistribution: new PublicationCommentarySteemDistribution({ reader })
    });
}
