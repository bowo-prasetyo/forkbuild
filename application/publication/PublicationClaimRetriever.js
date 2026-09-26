import { describePublicationClaimLocator } from '../../core/ForkBuildAppLinks.js';
import { buildArweaveWorldEncounterMaterialResolver } from '../worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { IpfsWorldEncounterMaterialResolver } from '../worldEncounter/IpfsWorldEncounterMaterialResolver.js';
import { IpfsGatewayContentStore } from '../../content/IpfsGatewayContentStore.js';
import { IpfsGatewayFailoverContentStore } from '../../content/IpfsGatewayFailoverContentStore.js';

// Reads a Signed Claim from wherever its locator says it is stored, for
// opening a Publication from a link. Each reader is a material resolver
// (`retrieveByUri(uri)`): SteemWorldEncounterMaterialResolver,
// ArweaveWorldEncounterMaterialResolver (or its gateway failover) and
// IpfsWorldEncounterMaterialResolver. A network with no reader rejects, so the
// link says that network can't be reached rather than that nothing is there.
export function createPublicationClaimRetriever({ steem = null, arweave = null, ipfs = null } = {}) {
    const readers = { steem, arweave, ipfs };
    const names = { steem: 'Steem', arweave: 'Arweave', ipfs: 'IPFS' };
    return async function retrieveClaim(locator) {
        const where = describePublicationClaimLocator(locator);
        if (!where) return null;
        const reader = readers[where.network];
        if (!reader || typeof reader.retrieveByUri !== 'function') throw new Error(`reading from ${names[where.network]} isn't available in this browser`);
        return reader.retrieveByUri(where.locator);
    };
}

// How long each IPFS gateway gets to return a claim. Longer than a gateway
// store's usual 5 s: content that lives on someone's own IPFS node has to be
// found through the IPFS network first, which often takes tens of seconds.
export const PUBLICATION_CLAIM_IPFS_TIMEOUT_MS = 30000;

// The retriever for the app: Steem through the Steem runtime's resolver (null
// when there is none), Arweave through the configured gateways (failing over
// in order) and IPFS through the configured gateways.
export function composePublicationClaimRetriever({ steemResolver = null, arweaveGatewayUrls, ipfsGatewayUrls, ipfsTimeoutMs = PUBLICATION_CLAIM_IPFS_TIMEOUT_MS }) {
    return createPublicationClaimRetriever({
        steem: steemResolver,
        arweave: buildArweaveWorldEncounterMaterialResolver({ gatewayUrls: arweaveGatewayUrls }),
        ipfs: new IpfsWorldEncounterMaterialResolver({
            gatewayStore: ipfsGatewayUrls.length > 1
                ? new IpfsGatewayFailoverContentStore({ gatewayUrls: ipfsGatewayUrls, timeoutMs: ipfsTimeoutMs })
                : new IpfsGatewayContentStore({ gatewayUrl: ipfsGatewayUrls[0], timeoutMs: ipfsTimeoutMs })
        })
    });
}
