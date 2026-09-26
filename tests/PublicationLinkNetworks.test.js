import { describePublicationClaimLocator, publicationClaimLocatorFromViewPath, publicationShareUrl, publicationViewUrl } from '../core/ForkBuildAppLinks.js';
import { describePublicationShare } from '../application/publication/PublicationShareLink.js';
import { openPublicationLink, OpenPublicationLinkOutcome as Outcome } from '../application/publication/OpenPublicationLink.js';
import { createPublicationClaimRetriever } from '../application/publication/PublicationClaimRetriever.js';
import { IpfsWorldEncounterMaterialResolver } from '../application/worldEncounter/IpfsWorldEncounterMaterialResolver.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Links to Publications whose Signed Claim is stored on Arweave or IPFS: the
// links themselves, what Share says about them, the IPFS claim reader, the
// retriever that picks a reader by network, and opening such links through
// the real Arweave resolver and IPFS gateway store over fake gateways.

const TX = 'Xy3_-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ab';
const CID_V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const CID_V1 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const APP = 'https://bowo-prasetyo.github.io/forkbuild/';

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

function publishBuild() {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('network-links-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title: 'Arweave Tower', author: 'alice' }) }), 'doc-net');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, snapshotText: contentStore.getSync(publication.contentReference) };
}

// The links.
{
    assert(publicationViewUrl(`ar://${TX}`) === `${APP}#/view/ar/${TX}`, 'an Arweave claim\'s link');
    assert(publicationViewUrl(`ipfs://${CID_V0}`) === `${APP}#/view/ipfs/${CID_V0}` && publicationViewUrl(`ipfs://${CID_V1}`) === `${APP}#/view/ipfs/${CID_V1}`, 'an IPFS claim\'s link, CIDv0 or CIDv1');
    assert(publicationViewUrl('steem://forkbuild/forkbuild-c-x-abcd1234') === `${APP}#/view/steem/forkbuild/forkbuild-c-x-abcd1234`, 'a Steem claim\'s link, as before');
    for (const bad of ['ar://TX1', `ar://${TX}/x`, 'ar://' + 'a'.repeat(44), `ipfs://${CID_V0}/index.html`, 'ipfs://short', 'ipfs://Qm..%2F', 'https://arweave.net/x', null]) {
        assert(publicationViewUrl(bad) === null, `${JSON.stringify(bad)} has no link`);
    }
    assert(publicationClaimLocatorFromViewPath(`/view/ar/${TX}`) === `ar://${TX}` && publicationClaimLocatorFromViewPath(`/view/ipfs/${CID_V1}`) === `ipfs://${CID_V1}`, 'a view path gives the claim\'s locator back');
    assert(publicationClaimLocatorFromViewPath('/view/steem/forkbuild/forkbuild-c-x') === 'steem://forkbuild/forkbuild-c-x', 'the Steem path too');
    for (const bad of ['/view/ar/short', `/view/ar/${TX}/more`, '/view/ipfs/', '/view/nostr/x', '/world/x', `view/ar/${TX}`, null]) {
        assert(publicationClaimLocatorFromViewPath(bad) === null, `${JSON.stringify(bad)} names no claim`);
    }
    assert(describePublicationClaimLocator(`ar://${TX}`).label === `Arweave transaction ${TX}`, 'each locator has a readable label');
    console.log('✓ the links');
}

// What Share says for each network.
{
    const share = (uri, storage) => describePublicationShare({ lifecycle: { material: { state: 'PRESENT', uri, storage } }, title: 'Tower' });
    const arweave = share(`ar://${TX}`, 'ar');
    assert(arweave.available && arweave.url === `${APP}#/view/ar/${TX}` && arweave.note.includes('few minutes'), 'Arweave: a link, and it can take a few minutes');
    const local = share(`ipfs://${CID_V0}`, 'ipfs');
    assert(local.available && local.url.endsWith(`/view/ipfs/${CID_V0}`) && local.note.includes('only while your node is online'), 'your own IPFS node: a link, while the node is online');
    assert(share(`ipfs://${CID_V0}`, 'remote-pinning').note === null, 'a pinning service keeps it available: no note');
    assert(share('steem://forkbuild/forkbuild-c-x-abcd1234', 'steem').note === null, 'Steem: no note');
    assert(publicationShareUrl({ uri: `ar://${TX}` }) === `${APP}#/view/ar/${TX}`, 'the share link is the view link');
    console.log('✓ what Share says for each network');
}

// The IPFS claim reader.
{
    const served = new Map([[CID_V0, JSON.stringify({ id: 'p1' })], [CID_V1, '[1,2,3]'], ['QmNotJsonNotJsonNotJsonNotJsonNotJsonNotJsonNo', 'not json'], ['QmHugeHugeHugeHugeHugeHugeHugeHugeHugeHugeHuge', JSON.stringify({ padding: 'x'.repeat(IpfsWorldEncounterMaterialResolver.DEFAULT_MAX_MATERIAL_BYTES) })]]);
    const asked = [];
    const gatewayStore = new IpfsGatewayContentStore({
        gatewayUrl: 'https://gateway.example',
        fetchImpl: async (url) => {
            asked.push(url);
            const cid = url.split('/ipfs/')[1];
            return served.has(cid) ? new Response(served.get(cid), { status: 200 }) : new Response('not found', { status: 404 });
        }
    });
    const resolver = new IpfsWorldEncounterMaterialResolver({ gatewayStore });
    assert((await resolver.retrieveByUri(`ipfs://${CID_V0}`))?.id === 'p1' && asked[0] === `https://gateway.example/ipfs/${CID_V0}`, 'a claim is read through the gateway');
    assert(await resolver.retrieveByUri(`ipfs://${CID_V1}`) === null, 'JSON that isn\'t an object is not a claim');
    assert(await resolver.retrieveByUri('ipfs://QmNotJsonNotJsonNotJsonNotJsonNotJsonNotJsonNo') === null, 'text that isn\'t JSON is not a claim');
    assert(await resolver.retrieveByUri('ipfs://QmHugeHugeHugeHugeHugeHugeHugeHugeHugeHugeHuge') === null, 'content larger than a claim can be is refused');
    const before = asked.length;
    assert(await resolver.retrieveByUri(`ipfs://${CID_V0}/../x`) === null && await resolver.retrieveByUri(`ar://${TX}`) === null && asked.length === before, 'anything but a bare ipfs:// CID is not its business, and nothing is fetched');
    const missing = await rejection(resolver.retrieveByUri('ipfs://QmMissingMissingMissingMissingMissingMissingMi'));
    assert(missing && /404/.test(missing.message), `a CID no gateway returns rejects (got ${missing?.message})`);
    console.log('✓ the IPFS claim reader');
}

// The retriever picks the reader by network.
{
    const asked = [];
    const reader = (name) => ({ retrieveByUri: async (uri) => { asked.push([name, uri]); return { from: name }; } });
    const retrieve = createPublicationClaimRetriever({ steem: reader('steem'), arweave: reader('arweave'), ipfs: reader('ipfs') });
    assert((await retrieve(`ar://${TX}`)).from === 'arweave' && (await retrieve(`ipfs://${CID_V0}`)).from === 'ipfs' && (await retrieve('steem://forkbuild/forkbuild-c-x')).from === 'steem', 'each network goes to its reader');
    assert(await retrieve('https://example.org/x') === null && asked.length === 3, 'something that isn\'t a claim locator reads nothing');
    const noSteem = await rejection(createPublicationClaimRetriever({})('steem://forkbuild/forkbuild-c-x'));
    assert(noSteem?.message === 'reading from Steem isn\'t available in this browser', 'a network with no reader says so');
    console.log('✓ the retriever');
}

// Opening Arweave and IPFS links, through the real readers over fake
// gateways, with a really signed Publication.
{
    const { publication, snapshotText } = publishBuild();
    const claim = JSON.stringify(publication.toJSON());
    const { verifier } = composeWorldEncounterMaterialVerifier();
    let arweaveUp = true;
    const arweave = new ArweaveWorldEncounterMaterialResolver({
        gatewayUrl: 'https://arweave.example',
        fetchImpl: async (url) => {
            if (!arweaveUp) throw new TypeError('Failed to fetch');
            return url.endsWith(`/${TX}`) ? new Response(claim, { status: 200 }) : new Response('', { status: 404 });
        }
    });
    const ipfs = new IpfsWorldEncounterMaterialResolver({
        gatewayStore: new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.example', fetchImpl: async (url) => (url.endsWith(`/ipfs/${CID_V0}`) ? new Response(claim, { status: 200 }) : new Response('', { status: 404 })) })
    });
    const retrieveClaim = createPublicationClaimRetriever({ arweave, ipfs });
    const visit = (locator) => {
        const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        return {
            localContentStore,
            discoveryProvider,
            open: () => openPublicationLink({
                locator,
                retrieveClaim,
                verifier,
                hasLocalContent: async (reference) => localContentStore.has(reference),
                findSnapshotCandidates: async () => ({ outcome: 'found', candidates: [{ contentHash: publication.contentHash, locator: `ar://${'S'.repeat(43)}`, storage: 'ar' }] }),
                resolveSnapshotCandidate: async () => ({ outcome: 'resolved', bytes: snapshotText }),
                storeSnapshotContent: (request) => new StoreSnapshotContentUseCase(localContentStore).execute(request),
                discoveryProvider
            })
        };
    };

    for (const locator of [`ar://${TX}`, `ipfs://${CID_V0}`]) {
        const guest = visit(locator);
        const result = await guest.open();
        assert(result.outcome === Outcome.OPENED && result.documentId === publication.documentId, `${locator} opens the Publication (got ${result.outcome}: ${result.message})`);
        assert(guest.discoveryProvider.list().length === 1 && guest.localContentStore.has(publication.contentReference), 'and its build is kept and the Publication admitted');
    }

    const notYet = await visit(`ar://${'N'.repeat(43)}`).open();
    assert(notYet.outcome === Outcome.CLAIM_UNAVAILABLE && notYet.message.includes('can take a few minutes'), `an Arweave claim not found yet says it may still be coming (got ${notYet.message})`);
    arweaveUp = false;
    const down = await visit(`ar://${TX}`).open();
    assert(down.outcome === Outcome.UNREACHABLE && down.message.startsWith('Arweave could not be reached') && down.message.includes('Failed to fetch'), `Arweave down (got ${down.message})`);
    const ipfsMissing = await visit('ipfs://QmMissingMissingMissingMissingMissingMissingMi').open();
    assert(ipfsMissing.outcome === Outcome.UNREACHABLE && ipfsMissing.message.startsWith('IPFS could not be reached'), `an IPFS claim no gateway returns (got ${ipfsMissing.message})`);
    assert((await visit('ftp://x').open()).outcome === Outcome.INVALID_LINK, 'a locator no link can name');
    console.log('✓ opening Arweave and IPFS links');
}

console.log('\n✅ All PublicationLinkNetworks tests passed.');
