import { deflateRawSync } from 'node:zlib';
import {
    FORKBUILD_APP_URL, isLinkOnlyPublicationPayload, linkOnlyPublicationViewPath, linkOnlyPublicationViewUrl
} from '../core/ForkBuildAppLinks.js';
import {
    MAX_LINK_PAYLOAD_LENGTH, decodePublicationLinkPayload, encodePublicationLinkPayload
} from '../application/publication/sharing/PublicationLinkPayload.js';
import {
    ShareLinkKind, describePublicationShare as describePublicationShareMessages, prepareLinkOnlyShare
} from '../application/publication/PublicationShareLink.js';
import { openPublicationLink, OpenPublicationLinkOutcome as Outcome } from '../application/publication/OpenPublicationLink.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { LocalWorldEncounterPublicationAdmissionLog } from '../application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';
import { displayText } from '../ui/i18n/i18n.js';

// Sharing a build inside the link itself (`#/s/<payload>`): the Signed Claim
// and the build travel together, so a link exists the moment a build is
// published, with no network, and opening it checks the signature and the
// content hash as for a claim read from any network.

const CASTLE = ShowcaseLibrary.structures.find((structure) => structure.id === 'showcase:castle');

function publishBuild({ title = 'My castle', bricks = CASTLE.bricks, signedIn = true } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    if (signedIn) identity.login('link-only-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of bricks) {
        building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    }
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }) }) }), 'doc-castle');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore, brickCount: bricks.length };
}

// Someone who has never seen the build. Every network-facing dependency
// fails the test if it is called.
function visitor() {
    const storage = new InMemoryStorageProvider();
    const localContentStore = new LocalContentStore(storage);
    const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
    const admissionLog = new LocalWorldEncounterPublicationAdmissionLog(storage);
    const networkCalls = [];
    const open = (linkOnly) => openPublicationLink({
        linkOnly,
        retrieveClaim: async () => { networkCalls.push('claim'); return null; },
        verifier: composeWorldEncounterMaterialVerifier().verifier,
        hasLocalContent: async (reference) => localContentStore.has(reference),
        findSnapshotCandidates: async () => { networkCalls.push('search'); return { candidates: [] }; },
        resolveSnapshotCandidate: async () => { networkCalls.push('resolve'); return null; },
        storeSnapshotContent: (request) => new StoreSnapshotContentUseCase(localContentStore).execute(request),
        discoveryProvider,
        admissionLog,
        publisherPlacement: { has: () => false, adopt: async () => { networkCalls.push('placement'); } }
    });
    return { open, localContentStore, discoveryProvider, admissionLog, networkCalls };
}

function payloadOf(url) {
    return url.slice(url.indexOf('#/s/') + '#/s/'.length);
}

function describePublicationShare(input) {
    const share = describePublicationShareMessages(input);
    return share && { ...share, title: displayText(share.title), hint: displayText(share.hint), reason: displayText(share.reason) };
}

// The route.
{
    assert(linkOnlyPublicationViewPath('1abc_-Z9') === '/s/1abc_-Z9', 'a payload is one path segment');
    assert(linkOnlyPublicationViewUrl('1abc') === `${FORKBUILD_APP_URL}#/s/1abc`, 'the link points at the published app');
    for (const bad of ['', '1a/b', '1a b', '1a+b', '1a=', null, 7]) {
        assert(!isLinkOnlyPublicationPayload(bad), `${JSON.stringify(bad)} is not a payload`);
    }
    let refused = false;
    try {
        linkOnlyPublicationViewPath('1a/../b');
    } catch {
        refused = true;
    }
    assert(refused, 'nothing odd lands in a link');
    console.log('✓ the route');
}

// Sharing a published castle, and opening the link somewhere else.
{
    const { publication, contentStore, brickCount } = publishBuild();
    const prepared = await prepareLinkOnlyShare({ publication, contentStore });
    assert(prepared.url?.startsWith(`${FORKBUILD_APP_URL}#/s/1`), `the castle gets a link (got ${JSON.stringify(prepared.reason ?? prepared)})`);
    assert(prepared.payloadLength <= MAX_LINK_PAYLOAD_LENGTH && prepared.payloadLength < 6000, `the castle's link is short enough to paste anywhere (${prepared.payloadLength} characters)`);
    assert(prepared.snapshotText === contentStore.getSync(publication.contentReference), 'the build is kept for a picture');
    console.log(`✓ a published castle (${brickCount} bricks) shares as a ${prepared.payloadLength}-character link`);

    const guest = visitor();
    const linkOnly = await decodePublicationLinkPayload(payloadOf(prepared.url));
    const result = await guest.open(linkOnly);
    assert(result.outcome === Outcome.OPENED && result.documentId === publication.documentId, `the link opens (got ${result.outcome}: ${displayText(result.message)})`);
    assert(guest.networkCalls.length === 0, `nothing is read from a network (got ${guest.networkCalls})`);
    assert(guest.localContentStore.has(publication.contentReference), 'the build is kept on the visitor\'s device');
    assert(guest.discoveryProvider.findById(publication.id) && guest.admissionLog.has(publication.id), 'the Publication is admitted as World discovery admits one');
    const session = new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), guest.localContentStore).execute(result.publication);
    const bricks = session.getDocument().world.getBuildings().reduce((n, b) => n + b.getBricks().length, 0);
    assert(session.getDocument().metadata.title === 'My castle' && bricks === brickCount, `World View's loader reads the castle back (got ${bricks} bricks)`);
    assert((await guest.open(linkOnly)).outcome === Outcome.OPENED, 'opening it again works');
    console.log('✓ opening the link shows the build, with no network');
}

// What the signature and the hash refuse.
{
    const { publication, contentStore } = publishBuild();
    const { url } = await prepareLinkOnlyShare({ publication, contentStore });
    const genuine = await decodePublicationLinkPayload(payloadOf(url));

    const retitled = visitor();
    const renamed = await retitled.open({ claim: { ...genuine.claim, title: 'Not my castle' }, snapshotText: genuine.snapshotText });
    assert(renamed.outcome === Outcome.NOT_VERIFIED && !retitled.localContentStore.has(publication.contentReference), 'a claim changed after signing is refused, and its build not kept');

    const swapped = visitor();
    const other = publishBuild({ bricks: CASTLE.bricks.slice(0, 10) });
    const otherText = other.contentStore.getSync(other.publication.contentReference);
    const mismatch = await swapped.open({ claim: genuine.claim, snapshotText: otherText });
    assert(mismatch.outcome === Outcome.BUILD_NOT_FOUND && displayText(mismatch.message).includes('does not match'), `a build swapped for another is refused (got ${mismatch.outcome})`);
    assert(!swapped.localContentStore.has(publication.contentReference) && !swapped.discoveryProvider.findById(publication.id), 'and nothing is kept or admitted');

    const unsigned = publishBuild({ signedIn: false });
    const unsignedShare = await prepareLinkOnlyShare({ publication: unsigned.publication, contentStore: unsigned.contentStore });
    assert(!unsignedShare.url && displayText(unsignedShare.reason).includes('not signed') && unsignedShare.snapshotText, 'an unsigned build gets no link, but can still have a picture');
    console.log('✓ a changed claim or a swapped build is refused');
}

// Damaged and hostile links.
{
    const { publication, contentStore } = publishBuild({ bricks: CASTLE.bricks.slice(0, 20) });
    const { url } = await prepareLinkOnlyShare({ publication, contentStore });
    const payload = payloadOf(url);
    for (const [label, bad] of [
        ['empty', ''], ['another version', `2${payload.slice(1)}`], ['cut short', payload.slice(0, Math.floor(payload.length / 2))],
        ['not base64url', '1!!!!'], ['not compressed', `1${Buffer.from('{"claim":{}}').toString('base64url')}`],
        ['not JSON', `1${deflateRawSync('hello').toString('base64url')}`],
        ['no build', `1${deflateRawSync(JSON.stringify({ claim: { id: 'x' } })).toString('base64url')}`],
        ['a list for a claim', `1${deflateRawSync(JSON.stringify({ claim: [], build: 'x' })).toString('base64url')}`]
    ]) {
        assert(await decodePublicationLinkPayload(bad) === null, `a payload that is ${label} decodes to nothing`);
    }
    // A few kilobytes that would unpack to 8 MB.
    const bomb = `1${deflateRawSync(JSON.stringify({ claim: { id: 'x' }, build: ' '.repeat(8 * 1024 * 1024) }), { level: 9 }).toString('base64url')}`;
    assert(bomb.length < 20000 && await decodePublicationLinkPayload(bomb) === null, 'a payload that unpacks too large is refused');
    const guest = visitor();
    assert((await guest.open({ claim: null, snapshotText: 'x' })).outcome === Outcome.INVALID_LINK, 'a link-only open without a claim is an invalid link');
    console.log('✓ damaged and hostile links decode to nothing');
}

// Round trip is exact: the build's bytes are what its hash covers.
{
    const snapshotText = '{"a":"é ✓ 🧱","b":[1,2.5,-0]}';
    const decoded = await decodePublicationLinkPayload(await encodePublicationLinkPayload({ claim: { id: 'p' }, snapshotText }));
    assert(decoded.snapshotText === snapshotText && decoded.claim.id === 'p', 'the build comes back byte for byte');
    console.log('✓ an exact round trip');
}

// What the share offers: the network link once distributed, the link-only one
// before, or why there is none.
{
    const linkOnly = { url: `${FORKBUILD_APP_URL}#/s/1abc` };
    const onSteem = { material: { state: 'PRESENT', uri: 'steem://forkbuild/forkbuild-c-muiesncy-wkg6k1nb', storage: 'steem' } };
    const before = describePublicationShare({ lifecycle: null, title: 'Castle', linkOnly });
    assert(before.available && before.kind === ShareLinkKind.LINK_ONLY && before.url === linkOnly.url && before.hint.includes('inside the link'), 'before distributing, the link-only share');
    const after = describePublicationShare({ lifecycle: onSteem, title: 'Castle', linkOnly });
    assert(after.kind === ShareLinkKind.NETWORK && after.url.includes('#/view/steem/'), 'once distributed, the shorter network link');
    const unreachable = describePublicationShare({ lifecycle: { material: { state: 'PRESENT', uri: 'ar://TX1' } }, linkOnly });
    assert(unreachable.kind === ShareLinkKind.LINK_ONLY, 'a claim stored where no link reaches still shares inside the link');
    assert(describePublicationShare({ lifecycle: null, linkOnly: null }) === null, 'nothing while the link is being made');

    const { publication, contentStore } = publishBuild();
    const tooLarge = await prepareLinkOnlyShare({ publication, contentStore, maxPayloadLength: 100 });
    const offered = describePublicationShare({ lifecycle: null, linkOnly: tooLarge });
    assert(!offered.available && offered.reason.includes('too large'), `a build too large for a link says how to get one (got ${JSON.stringify(offered)})`);
    const elsewhere = await prepareLinkOnlyShare({ publication, contentStore: new LocalContentStore(new InMemoryStorageProvider()) });
    assert(!elsewhere.url && elsewhere.snapshotText === null && displayText(elsewhere.reason).includes('not stored on this device'), 'a build not on this device gets no link');
    const custom = await prepareLinkOnlyShare({ publication: publication.toJSON(), contentStore, appUrl: 'https://example.org/app/' });
    assert(custom.url.startsWith('https://example.org/app/#/s/1'), 'a Publication\'s JSON and another app address work too');
    console.log('✓ what the share offers');
}
