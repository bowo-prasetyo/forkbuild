import { openSteemPublicationLink, OpenSteemPublicationLinkOutcome as Outcome } from '../application/steem/OpenSteemPublicationLink.js';
import { FORKBUILD_APP_URL, steemPublicationViewPath, steemPublicationViewUrl } from '../core/ForkBuildAppLinks.js';
import { SteemContentStore } from '../content/SteemContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { createSteemDiscoveryThreadReader } from '../application/steem/SteemDiscoveryThreadReader.js';
import { SteemSnapshotDiscoveryPublisher } from '../application/steem/SteemSnapshotDiscoveryPublisher.js';
import { SteemSnapshotDiscoveryQueryService } from '../application/steem/SteemSnapshotDiscoveryQueryService.js';
import { SteemWorldEncounterMaterialResolver } from '../application/worldEncounter/SteemWorldEncounterMaterialResolver.js';
import { composePublicationMaterialUploader } from '../application/publication/distribution/PublicationMaterialUploaderComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { LocalWorldEncounterPublicationAdmissionLog } from '../application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The "see it in 3D" link on a Signed Claim stored on Steem: the notice
// carries it, and opening it reads and verifies the claim, finds and checks
// the build through the Steem snapshot announcement, keeps it locally, and
// admits the Publication so World View can load it.

const NOW = new Date('2026-10-05T12:00:00Z');
const THREADS = ['forkbuild-content-2026-10', 'forkbuild-snapshot-2026-10'];

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
            broadcasts.push(operations);
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

// A real Publication, signed by a real identity, and its Snapshot text.
function publishBuild(title = 'A small tower') {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('steem-link-alice');
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (let y = 0; y < 4; y++) building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, y + 0.5, 0) }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }) }) }), 'doc-tower');
    const publication = new PublishDocumentUseCase(publisher, identity).execute(manager);
    return { publication, snapshotText: contentStore.getSync(publication.contentReference) };
}

// Distributes as the app does with Steem storage and Steem announcements:
// the Snapshot (stored, then announced), then the Signed Claim.
async function distribute(chain, { publication, snapshotText }, { claimJson = publication.toJSON(), announceSnapshot = true } = {}) {
    const announcer = announcerFor(chain);
    const store = new SteemContentStore({ rpc: chain.rpc, announcer, threadAccounts: ['forkbuild'] });
    const snapshotReference = await store.put(snapshotText);
    if (announceSnapshot) {
        await new SteemSnapshotDiscoveryPublisher({ announcer }).publish({ contentHash: snapshotReference.hash, locator: snapshotReference.uri, storage: 'steem' });
    }
    const uploader = composePublicationMaterialUploader({ materialStorage: 'steem', steemMaterialStore: store });
    const claimUri = await uploader.upload(JSON.stringify(claimJson));
    const [author, permlink] = claimUri.replace('steem://', '').split('/');
    return { author, permlink, snapshotReference };
}

// A visitor who has never seen the build: empty local storage.
function visitor(chain) {
    const storage = new InMemoryStorageProvider();
    const localContentStore = new LocalContentStore(storage);
    const readingStore = new SteemContentStore({ rpc: chain.rpc, threadAccounts: ['forkbuild'] });
    const snapshotQuery = new SteemSnapshotDiscoveryQueryService({ reader: createSteemDiscoveryThreadReader({ rpc: chain.rpc, now: () => NOW }) });
    const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
    const registry = new SnapshotPlacementStoreRegistry().register(readingStore);
    const searches = [];
    const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
    const admissionLog = new LocalWorldEncounterPublicationAdmissionLog(storage);
    const open = (author, permlink, overrides = {}) => openSteemPublicationLink({
        author,
        permlink,
        retrieveClaim: new SteemWorldEncounterMaterialResolver({ rpc: chain.rpc, threadAccounts: ['forkbuild'] }).retrieveByUri,
        verifier: composeWorldEncounterMaterialVerifier().verifier,
        hasLocalContent: async (reference) => localContentStore.has(reference),
        findSnapshotCandidates: async () => {
            searches.push(true);
            return snapshotQuery.searchWithOutcome('forkbuild-snapshot');
        },
        resolveSnapshotCandidate: (candidate) => resolver.resolveCandidate(candidate, { storeRegistry: registry }),
        storeSnapshotContent: (request) => new StoreSnapshotContentUseCase(localContentStore).execute(request),
        discoveryProvider,
        admissionLog,
        ...overrides
    });
    return { open, localContentStore, discoveryProvider, admissionLog, searches };
}

// The link, and the notice that carries it.
{
    assert(steemPublicationViewPath('alice', 'forkbuild-c-x-abcd1234') === '/view/steem/alice/forkbuild-c-x-abcd1234', 'the view route names the post');
    assert(steemPublicationViewUrl('alice', 'p') === 'https://bowo-prasetyo.github.io/forkbuild/#/view/steem/alice/p' && FORKBUILD_APP_URL.endsWith('/forkbuild/'), 'the link points at the published app');
    let refused = 0;
    for (const [author, permlink] of [['Not An Account', 'p'], ['alice', 'Bad Permlink'], ['alice', 'x)[y']]) {
        try {
            steemPublicationViewPath(author, permlink);
        } catch {
            refused += 1;
        }
    }
    assert(refused === 3, 'names that aren\'t a Steem account and permlink are refused, so nothing odd lands in a link');

    const chain = fakeChain();
    const build = publishBuild();
    const { author, permlink } = await distribute(chain, build);
    const claimPost = chain.posts.get(`${author}/${permlink}`);
    assert(claimPost.body.startsWith('A build published with ForkBuild: [see it in 3D](https://bowo-prasetyo.github.io/forkbuild/#/view/steem/alice/') && claimPost.body.includes(`/${permlink})`),
        `the claim's notice links to the view of its own post (got ${claimPost.body})`);
    const snapshotPost = chain.broadcasts[0][0][1];
    assert(snapshotPost.body.startsWith('Data stored by ForkBuild.') && !snapshotPost.body.includes('#/view/'), `the Snapshot keeps the plain notice (got ${snapshotPost.body})`);
    console.log('✓ the link, and the notice that carries it');

    // Opening it: the claim is verified, the build found through the Steem
    // snapshot announcement, kept locally, and the Publication admitted.
    const guest = visitor(chain);
    const result = await guest.open(author, permlink);
    assert(result.outcome === Outcome.OPENED && result.documentId === build.publication.documentId, `the link opens the Publication (got ${result.outcome}: ${result.message})`);
    assert(guest.localContentStore.has(build.publication.contentReference), 'the build is kept on this device');
    assert(guest.discoveryProvider.findByDocumentId(build.publication.documentId).length === 1 && guest.admissionLog.list().length === 1, 'the Publication is admitted to discovery and the durable log');
    const session = new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), guest.localContentStore).execute(result.publication);
    const bricks = session.getDocument().world.getBuildings().reduce((n, b) => n + b.getBricks().length, 0);
    assert(session.getDocument().metadata.title === 'A small tower' && bricks === 4, `World View's loader reads the build back (got ${bricks} bricks)`);
    console.log('✓ opening a link shows the build');

    const again = await guest.open(author, permlink);
    assert(again.outcome === Outcome.OPENED && guest.searches.length === 1, 'opening it again uses the kept build without searching');
    console.log('✓ opening it again');
}

// What stops a link from opening.
{
    const chain = fakeChain();
    const build = publishBuild();
    const guest = visitor(chain);

    assert((await guest.open('Not An Account', 'p')).outcome === Outcome.INVALID_LINK, 'a link that names no Steem post');
    assert((await guest.open('alice', 'forkbuild-c-missing-abcd1234')).outcome === Outcome.CLAIM_UNAVAILABLE, 'a post that does not exist');
    const unreachable = await visitor(fakeChain({ unreachable: true })).open('alice', 'forkbuild-c-x-abcd1234');
    assert(unreachable.outcome === Outcome.STEEM_UNREACHABLE && unreachable.message.includes('no Steem API node answered'), `Steem that can't be reached (got ${unreachable.message})`);

    const notClaim = await distribute(chain, build, { claimJson: { hello: 'world' }, announceSnapshot: false });
    assert((await guest.open(notClaim.author, notClaim.permlink)).outcome === Outcome.NOT_A_PUBLICATION, 'content that is not a Publication');

    const tamperedChain = fakeChain();
    const tamperedPost = await distribute(tamperedChain, build, { claimJson: { ...build.publication.toJSON(), title: 'Changed after signing' } });
    const rejected = await visitor(tamperedChain).open(tamperedPost.author, tamperedPost.permlink);
    assert(rejected.outcome === Outcome.NOT_VERIFIED && rejected.message.includes('does not check out'), `a claim changed after signing is not shown (got ${rejected.outcome}: ${rejected.message})`);

    const unsignedChain = fakeChain();
    const unsigned = await distribute(unsignedChain, build, { claimJson: { ...build.publication.toJSON(), signature: null } });
    assert((await visitor(unsignedChain).open(unsigned.author, unsigned.permlink)).outcome === Outcome.NOT_VERIFIED, 'an unsigned claim is not shown');

    const lonelyChain = fakeChain();
    const lonely = await distribute(lonelyChain, build, { announceSnapshot: false });
    const lonelyGuest = visitor(lonelyChain);
    const notFound = await lonelyGuest.open(lonely.author, lonely.permlink);
    assert(notFound.outcome === Outcome.BUILD_NOT_FOUND && notFound.publication?.title === 'A small tower' && notFound.message.includes('has not been found'),
        `a verified claim whose build is nowhere announced says so, naming the Publication (got ${notFound.message})`);
    assert(lonelyGuest.discoveryProvider.list().length === 0, 'and nothing is admitted without its build');
    const searchDown = await lonelyGuest.open(lonely.author, lonely.permlink, { findSnapshotCandidates: async () => ({ outcome: 'unavailable', candidates: [] }) });
    assert(searchDown.outcome === Outcome.BUILD_NOT_FOUND && searchDown.message.includes("couldn't be looked for"), `a search that fails says to try later (got ${searchDown.message})`);

    const wrongBuildChain = fakeChain();
    const wrong = await distribute(wrongBuildChain, build);
    const other = publishBuild('Something else');
    const wrongGuest = visitor(wrongBuildChain);
    const mismatch = await wrongGuest.open(wrong.author, wrong.permlink, {
        resolveSnapshotCandidate: async () => ({ outcome: 'resolved', bytes: other.snapshotText })
    });
    assert(mismatch.outcome === Outcome.BUILD_NOT_FOUND && mismatch.message.includes('does not match'), `a build that doesn't match the Publication is not kept (got ${mismatch.message})`);
    assert(!wrongGuest.localContentStore.has(other.publication.contentReference), 'the mismatched build is not stored');
    console.log('✓ what stops a link from opening');
}

console.log('\n✅ All SteemPublicationLink tests passed.');
