// A Signed Claim distributed with IPFS storage (`ipfs://<cid>`) is found by
// the Repository's and the weekly challenge's network discovery: the
// material sources route `ipfs://` to an IPFS reader
// (application/worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js),
// as links already did. Before, such a claim went to the Arweave reader and
// was never admitted.
import { composeWorldEncounterMaterialSources } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { IpfsWorldEncounterMaterialResolver } from '../application/worldEncounter/IpfsWorldEncounterMaterialResolver.js';
import { buildIpfsWorldEncounterMaterialResolver } from '../application/publication/PublicationClaimRetriever.js';
import { RepositoryNetworkDiscovery } from '../application/publication/RepositoryNetworkDiscovery.js';
import { ChallengeEntryDiscovery } from '../application/challenge/ChallengeEntryDiscovery.js';
import { ChallengeEntryLog } from '../application/challenge/ChallengeEntryLog.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const CID = 'QmXygEvpCT2y58aa6qepw8WN1RudJzFWL3vurKHdityd3h';
const TAG = 'chapel-20261005';

const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
identity.login('ipfs-alice');
let publication = new Publication({
    id: 'pub-ipfs', documentId: 'doc-ipfs', title: 'A Quiet Garden Pavilion', author: 'ipfs-alice',
    contentReference: new ContentReference({ hash: 'hash-ipfs' }),
    publisherIdentity: identity.getSigningIdentity().toJSON()
});
publication = publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));

// A gateway store that serves the claim's text for its uri, recording what was asked.
function gatewayStore() {
    const asked = [];
    return {
        asked,
        get: async ({ uri }) => {
            asked.push(uri);
            if (uri === `ipfs://${CID}`) return JSON.stringify(publication.toJSON());
            throw new Error('not on IPFS');
        }
    };
}

function announcing(tag) {
    return {
        searchEnvelopes: async (asked) => (asked === tag
            ? [{ origin: 'dweb:nostr:wss://relay.example', kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-ipfs', uri: `ipfs://${CID}` }]
            : [])
    };
}

const { verifier } = composeWorldEncounterMaterialVerifier();

// Section A — the app builds the same reader links use, from the configured gateways.
{
    const resolver = buildIpfsWorldEncounterMaterialResolver({ gatewayUrls: ['https://ipfs.io', 'https://dweb.link'] });
    assert(resolver instanceof IpfsWorldEncounterMaterialResolver && resolver.storage === 'ipfs', 'A1. an IPFS reader over the gateways');
    console.log('✓ A. the IPFS reader is built from the configured gateways');
}

// Section B — the Repository's network discovery admits a claim stored on IPFS.
{
    const admitted = [];
    const store = gatewayStore();
    const arweaveAsked = [];
    const result = await new RepositoryNetworkDiscovery({
        services: [announcing('forkbuild-publication')],
        discoveryTag: 'forkbuild-publication',
        materialSources: composeWorldEncounterMaterialSources({
            arweaveResolverOptions: { fetchImpl: async (url) => { arweaveAsked.push(url); return { ok: false, status: 404 }; } },
            ipfsMaterialResolver: new IpfsWorldEncounterMaterialResolver({ gatewayStore: store })
        }),
        verifier,
        admit: (found, details) => admitted.push({ found, details })
    }).run();
    assert(result.admitted.length === 1 && result.admitted[0].id === 'pub-ipfs', `B1. the IPFS-stored claim is admitted (got ${result.admitted.map((p) => p.id)})`);
    assert(admitted[0].details.locator === `ipfs://${CID}`, 'B2. with where it was read');
    assert(store.asked.join() === `ipfs://${CID}` && arweaveAsked.length === 0, 'B3. read from IPFS, never asked of Arweave');
    console.log('✓ B. the Repository finds builds whose claim is on IPFS');
}

// Section C — and so does the weekly challenge, under the week's tag.
{
    const entryLog = new ChallengeEntryLog(new InMemoryStorageProvider());
    const discovery = new ChallengeEntryDiscovery({
        services: [announcing(`forkbuild-tag:${TAG}`)],
        materialSources: composeWorldEncounterMaterialSources({ ipfsMaterialResolver: new IpfsWorldEncounterMaterialResolver({ gatewayStore: gatewayStore() }) }),
        verifier,
        isKnown: () => false,
        admit: () => {},
        entryLog
    });
    const result = await discovery.run(TAG);
    assert(result.found === 1 && entryLog.list(TAG).join() === 'pub-ipfs', 'C1. the entry is found and logged under the week\'s tag');
    console.log('✓ C. the challenge finds entries whose claim is on IPFS');
}
