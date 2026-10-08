import { describePublicationClaimLocator } from '../../core/ForkBuildAppLinks.js';
import { message } from '../../core/Message.js';
import { UserFacingError } from '../../core/UserFacingError.js';
import { buildArweaveWorldEncounterMaterialResolver } from '../worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { IpfsWorldEncounterMaterialResolver } from '../worldEncounter/IpfsWorldEncounterMaterialResolver.js';
import { IpfsGatewayContentStore } from '../../content/IpfsGatewayContentStore.js';
import { IpfsGatewayFailoverContentStore } from '../../content/IpfsGatewayFailoverContentStore.js';

// Reads a Signed Claim from wherever its locator says it is stored, for
// opening a Publication from a link. Each reader is a material resolver
// (`retrieveByUri(uri)`): SteemWorldEncounterMaterialResolver,
// BlurtWorldEncounterMaterialResolver,
// ArweaveWorldEncounterMaterialResolver (or its gateway failover) and
// IpfsWorldEncounterMaterialResolver. A network with no reader rejects, so the
// link says that network can't be reached rather than that nothing is there.
export function createPublicationClaimRetriever({ steem = null, blurt = null, arweave = null, ipfs = null } = {}) {
    const readers = { steem, blurt, arweave, ipfs };
    return async function retrieveClaim(locator) {
        const where = describePublicationClaimLocator(locator);
        if (!where) return null;
        const reader = readers[where.network];
        if (!reader || typeof reader.retrieveByUri !== 'function') {
            throw new UserFacingError(message(`publicationLink.noReader.${where.network}`), { detail: `no ${where.network} reader` });
        }
        return reader.retrieveByUri(where.locator);
    };
}

// How long each IPFS gateway gets to return a claim. Longer than a gateway
// store's usual 5 s: content that lives on someone's own IPFS node has to be
// found through the IPFS network first, which often takes tens of seconds.
export const PUBLICATION_CLAIM_IPFS_TIMEOUT_MS = 30000;

// The retriever for the app: Steem and Blurt through their runtimes'
// resolvers (null when there is none), Arweave through the configured
// gateways (failing over in order) and IPFS through the configured gateways.
export function composePublicationClaimRetriever({ steemResolver = null, blurtResolver = null, arweaveGatewayUrls, ipfsGatewayUrls, ipfsTimeoutMs = PUBLICATION_CLAIM_IPFS_TIMEOUT_MS }) {
    return createPublicationClaimRetriever({
        steem: steemResolver,
        blurt: blurtResolver,
        arweave: buildArweaveWorldEncounterMaterialResolver({ gatewayUrls: arweaveGatewayUrls }),
        ipfs: buildIpfsWorldEncounterMaterialResolver({ gatewayUrls: ipfsGatewayUrls, timeoutMs: ipfsTimeoutMs })
    });
}

// A Signed Claim reader for `ipfs://` through the configured gateways, failing
// over in order; also what the Repository's and the challenge's network
// discovery read IPFS-stored claims with (ui/main/composeWorldDiscovery.js).
export function buildIpfsWorldEncounterMaterialResolver({ gatewayUrls, timeoutMs = PUBLICATION_CLAIM_IPFS_TIMEOUT_MS }) {
    return new IpfsWorldEncounterMaterialResolver({
        gatewayStore: gatewayUrls.length > 1
            ? new IpfsGatewayFailoverContentStore({ gatewayUrls, timeoutMs })
            : new IpfsGatewayContentStore({ gatewayUrl: gatewayUrls[0], timeoutMs })
    });
}
