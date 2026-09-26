import { composePublicationMaterialUploader } from '../application/publication/distribution/PublicationMaterialUploaderComposition.js';
import { executePublicationDistributionCommand } from '../application/publication/distribution/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { SteemContentStore } from '../content/SteemContentStore.js';
import { steemContentLocator } from '../core/SteemContentManifest.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { createSteemDiscoveryThreadReader } from '../application/steem/SteemDiscoveryThreadReader.js';
import { SteemPublicationDiscoveryPublisher } from '../application/steem/SteemPublicationDiscoveryPublisher.js';
import { SteemPublicationDiscoveryQueryService } from '../application/steem/SteemPublicationDiscoveryQueryService.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { SteemWorldEncounterMaterialResolver } from '../application/worldEncounter/SteemWorldEncounterMaterialResolver.js';
import { composeWorldEncounterMaterialSources } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A Publication's Signed Claim stored on Steem (docs/Protocol.md, "Proposed:
// Steem Content Storage"): choosing Steem storage, distributing a claim with
// a Steem announcement through the real command, reading it back through
// SteemWorldEncounterMaterialResolver, and World discovery finding,
// retrieving and verifying it.

const NOW = new Date('2026-10-05T12:00:00Z');
const THREADS = ['forkbuild-content-2026-10', 'forkbuild-publication-2026-10'];

// A fake chain that keeps every post, as get_content would return it.
function fakeChain({ unreachable = false } = {}) {
    const posts = new Map();
    for (const permlink of THREADS) posts.set(`forkbuild/${permlink}`, { author: 'forkbuild', permlink, allow_replies: true });
    const broadcasts = [];
    const rpc = {
        async getContent(author, permlink) {
            if (unreachable) throw new Error('no Steem API node answered');
            return posts.get(`${author}/${permlink}`) ?? { author: '', permlink: '' };
        },
        async getContentReplies(author, permlink) {
            if (unreachable) throw new Error('no Steem API node answered');
            return [...posts.values()].filter((post) => post.parent_author === author && post.parent_permlink === permlink);
        }
    };
    const broadcaster = {
        async broadcast(account, operations) {
            broadcasts.push({ account, operations });
            const [, comment] = operations[0];
            posts.set(`${comment.author}/${comment.permlink}`, { ...comment, allow_replies: true, created: '2026-10-05T12:00:00' });
            return { transactionId: `tx${broadcasts.length}` };
        }
    };
    return { rpc, broadcaster, broadcasts, posts };
}

function announcerFor(chain) {
    let time = NOW.getTime();
    let n = 0;
    return createSteemAnnouncer({
        rpc: chain.rpc,
        getBroadcaster: () => chain.broadcaster,
        getAccount: () => 'alice',
        now: () => NOW,
        clock: () => time,
        sleep: async (ms) => { time += ms; },
        randomSuffix: () => `abcdefg${n++}`
    });
}

function signedPublication(contentUri) {
    const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
    identity.login('steem-claim-alice');
    const publication = new Publication({
        id: 'pub-steem-1',
        documentId: 'doc-1',
        title: 'A Publication whose Signed Claim is on Steem',
        author: 'alice',
        publisherIdentity: identity.getSigningIdentity().toJSON(),
        contentReference: { hash: 'placeholder-hash', uri: contentUri, storage: 'steem' },
        signature: null
    });
    return publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));
}

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

// Choosing Steem storage for a Signed Claim.
{
    let caught = null;
    try {
        composePublicationMaterialUploader({ materialStorage: 'steem' });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message === 'Steem storage is not available. Choose Arweave or IPFS storage to distribute the Signed Claim.',
        `without a Steem content store, Steem storage is refused with a reason (got ${caught?.message})`);

    const chain = fakeChain();
    const store = new SteemContentStore({ rpc: chain.rpc, announcer: announcerFor(chain), threadAccounts: ['forkbuild'] });
    const uploader = composePublicationMaterialUploader({ materialStorage: 'steem', steemMaterialStore: store });
    assert(uploader.storage === 'steem', 'with one, the uploader stores on Steem');

    const runtime = composeSteemRuntime({ fetchImpl: async () => { throw new Error('no network in tests'); } });
    assert(runtime.publicationMaterialResolver instanceof SteemWorldEncounterMaterialResolver, 'the Steem runtime includes the Signed Claim resolver');
    console.log('✓ choosing Steem storage for a Signed Claim');
}

// Distributing a Publication with Steem storage and a Steem announcement,
// then discovering, retrieving and verifying it. The manifest's permlink
// depends only on the (fake) time and suffix, so a first run on a scratch
// chain tells where the claim will be, and the Publication is signed with
// that locator: World discovery associates a lead with a Publication by
// that uri.
{
    const scratch = fakeChain();
    await new SteemContentStore({ rpc: scratch.rpc, announcer: announcerFor(scratch), threadAccounts: ['forkbuild'] }).put('{}');
    const expectedUri = steemContentLocator('alice', scratch.broadcasts[0].operations[0][1].permlink);
    const publication = signedPublication(expectedUri);

    const chain = fakeChain();
    const announcer = announcerFor(chain);
    const steemMaterialStore = new SteemContentStore({ rpc: chain.rpc, announcer, threadAccounts: ['forkbuild'] });
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const result = await executePublicationDistributionCommand({
        publication,
        serializedMaterial: JSON.stringify(publication.toJSON()),
        materialStorage: 'steem',
        discoveryProvider: 'steem',
        steemMaterialStore,
        steemPublicationDiscoveryPublisher: new SteemPublicationDiscoveryPublisher({ announcer }),
        lifecycleStore
    });

    assert(result.material.uri === expectedUri && result.material.storage === 'steem', `the claim is stored on Steem (got ${result.material.uri}, ${result.material.storage})`);
    assert(result.discovery && typeof result.discovery.id === 'string', 'the announcement is reported');
    assert(chain.broadcasts.length === 2, `two transactions: the claim, then its announcement (got ${chain.broadcasts.length})`);
    const [claimOps, announcementOps] = chain.broadcasts.map((b) => b.operations[0][1]);
    assert(claimOps.parent_permlink === THREADS[0] && announcementOps.parent_permlink === THREADS[1], 'the claim goes to the content thread and the announcement to the publication thread');
    const envelope = JSON.parse(announcementOps.json_metadata).forkbuild.envelope;
    assert(envelope.kind === 'PUBLICATION' && envelope.objectId === publication.id && envelope.uri === expectedUri, 'the announcement names the Steem locator');
    console.log('✓ distributing a Signed Claim to Steem storage with a Steem announcement');

    const steemMaterialResolver = new SteemWorldEncounterMaterialResolver({ rpc: chain.rpc, threadAccounts: ['forkbuild'] });
    const read = await steemMaterialResolver.retrieveByUri(expectedUri);
    assert(JSON.stringify(read) === JSON.stringify(publication.toJSON()), 'the resolver reads back exactly the stored claim');

    const reader = createSteemDiscoveryThreadReader({ rpc: chain.rpc, now: () => NOW });
    const { verifier } = composeWorldEncounterMaterialVerifier();
    const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: { steem: new SteemPublicationDiscoveryQueryService({ reader }) },
        arweaveResolverOptions: { fetchImpl: async () => { throw new Error('Arweave must not be asked for a steem:// uri'); } },
        steemMaterialResolver,
        verifier
    });
    const discovered = await runtime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: 'forkbuild-publication', publications: [publication] });
    assert(discovered.discovery.steem.length === 1, `the Steem service finds the announcement (got ${discovered.discovery.steem.length})`);
    assert(discovered.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, `the lead resolves (got ${discovered.resolution.status})`);
    assert(discovered.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'the claim is retrieved from Steem');
    assert(discovered.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, `its signature verifies (got ${discovered.inspection.verification.status})`);
    console.log('✓ discovering, retrieving and verifying a Signed Claim stored on Steem');

    // A claim changed after signing is retrieved, and then rejected by the
    // verifier, not by the resolver.
    const tamperedChain = fakeChain();
    const tamperedAnnouncer = announcerFor(tamperedChain);
    const tamperedStore = new SteemContentStore({ rpc: tamperedChain.rpc, announcer: tamperedAnnouncer, threadAccounts: ['forkbuild'] });
    await tamperedStore.put(JSON.stringify({ ...publication.toJSON(), title: 'Changed after signing' }));
    await new SteemPublicationDiscoveryPublisher({ announcer: tamperedAnnouncer }).publish({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: expectedUri });
    const tamperedRuntime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: { steem: new SteemPublicationDiscoveryQueryService({ reader: createSteemDiscoveryThreadReader({ rpc: tamperedChain.rpc, now: () => NOW }) }) },
        steemMaterialResolver: new SteemWorldEncounterMaterialResolver({ rpc: tamperedChain.rpc, threadAccounts: ['forkbuild'] }),
        verifier
    });
    const tampered = await tamperedRuntime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: 'forkbuild-publication', publications: [publication] });
    assert(tampered.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'the tampered claim is retrieved');
    assert(tampered.inspection.verification.status !== WorldEncounterMaterialVerificationStatus.VERIFIED, `a claim changed after signing never verifies (got ${tampered.inspection.verification.status})`);
    console.log('✓ a claim changed after signing is rejected');
}

// What the resolver refuses, and when it rejects.
{
    const chain = fakeChain();
    const store = new SteemContentStore({ rpc: chain.rpc, announcer: announcerFor(chain), threadAccounts: ['forkbuild'] });
    const resolver = new SteemWorldEncounterMaterialResolver({ rpc: chain.rpc, threadAccounts: ['forkbuild'] });

    assert(await resolver.retrieveByUri('ar://TX1') === null && await resolver.retrieveByUri(undefined) === null, 'a uri that isn\'t a Steem locator is not its business');
    assert(await resolver.retrieveByUri('steem://alice/forkbuild-c-missing-abcd1234') === null, 'a missing post resolves to null');
    chain.posts.set('alice/hello', { author: 'alice', permlink: 'hello', parent_author: 'forkbuild', parent_permlink: THREADS[0], body: 'hi', json_metadata: '{}' });
    assert(await resolver.retrieveByUri('steem://alice/hello') === null, 'a post that isn\'t a content manifest resolves to null');

    const notJson = await store.put('not json at all');
    assert(await resolver.retrieveByUri(notJson.uri) === null, 'content that isn\'t JSON resolves to null');
    const array = await store.put('[1,2,3]');
    assert(await resolver.retrieveByUri(array.uri) === null, 'JSON that isn\'t an object resolves to null');
    const large = await store.put(JSON.stringify({ padding: 'x'.repeat(SteemWorldEncounterMaterialResolver.DEFAULT_MAX_MATERIAL_BYTES) }));
    assert(await resolver.retrieveByUri(large.uri) === null, 'content larger than a Signed Claim can be resolves to null');
    const small = await store.put('{"ok":true}');
    assert((await resolver.retrieveByUri(small.uri))?.ok === true, 'a JSON object is returned as parsed');

    const down = new SteemWorldEncounterMaterialResolver({ rpc: fakeChain({ unreachable: true }).rpc, threadAccounts: ['forkbuild'] });
    const error = await rejection(down.retrieveByUri(small.uri));
    assert(error && /Couldn't read/.test(error.message), `an unreachable node rejects rather than reading as missing (got ${error?.message})`);
    console.log('✓ what the resolver refuses, and when it rejects');
}

// Routing: steem:// goes to the Steem resolver, everything else to Arweave;
// without a Steem resolver nothing changes.
{
    const asked = [];
    const steemMaterialResolver = { retrieveByUri: async (uri) => { asked.push(['steem', uri]); return { from: 'steem' }; } };
    const arweaveResolverOptions = { fetchImpl: async (url) => { asked.push(['arweave', url]); return new Response(JSON.stringify({ from: 'arweave' }), { status: 200 }); } };
    const { decentralized } = composeWorldEncounterMaterialSources({ arweaveResolverOptions, steemMaterialResolver });
    const selection = { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'dweb:steem:forkbuild' };
    assert((await decentralized.load(selection, { uri: 'steem://alice/p' }))?.from === 'steem', 'a steem:// uri is read from Steem');
    assert((await decentralized.load(selection, { uri: 'ar://TX1' }))?.from === 'arweave', 'an ar:// uri is still read from Arweave');
    assert(asked.length === 2 && asked[0][0] === 'steem' && asked[1][0] === 'arweave', `each uri asks one substrate (got ${JSON.stringify(asked)})`);

    const { decentralized: arweaveOnly } = composeWorldEncounterMaterialSources({ arweaveResolverOptions });
    assert(await arweaveOnly.load(selection, { uri: 'steem://alice/p' }) === null, 'without a Steem resolver a steem:// uri stays unavailable');
    console.log('✓ routing by uri');
}

console.log('\n✅ All SteemPublicationMaterial tests passed.');
