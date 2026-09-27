// Verifying a claimed build's Publication from the network
// (application/snapshot/claimed/VerifyClaimedBuildPublication.js): an
// announcement's objectId only chooses what to fetch; a record is admitted
// only when it is validly signed, is exactly this Publication, and names
// exactly the ghost's content.
import { verifyClaimedBuildPublication, ClaimedBuildVerificationOutcome } from '../application/snapshot/claimed/VerifyClaimedBuildPublication.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { NostrDiscoveryQueryService } from '../application/nostr/NostrDiscoveryQueryService.js';
import { NostrPublicationRelaySetDiscoveryQueryService } from '../application/nostr/NostrPublicationRelaySetDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/nostr/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { publicationRecordTag, PUBLICATION_RECORD_TAG_PREFIX } from '../core/NarrowDiscoveryTags.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { useClaimedBuilds } from '../ui/views/worldView/useClaimedBuilds.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const GLOBAL_TAG = 'forkbuild-publication';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function signer(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    return provider;
}

function signedPublication(identity, { id = 'pub-bob', hash = 'hash-1', author = 'bob', sign = true } = {}) {
    let publication = new Publication({
        id,
        documentId: `doc-${id}`,
        title: 'Bob\'s Tower',
        author,
        contentReference: new ContentReference({ hash }),
        publisherIdentity: identity.getSigningIdentity().toJSON(),
        signature: null
    });
    if (sign) {
        publication = publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));
    }
    return publication;
}

// A fake announcement query: tag -> envelopes, recording which tags were read.
function fakeService(byTag, origin = 'dweb:nostr:wss://relay.example') {
    const queried = [];
    return {
        queried,
        searchEnvelopes: async (tag) => {
            queried.push(tag);
            return (byTag[tag] || []).map((e) => ({ origin, kind: WorldEncounterKind.PUBLICATION, ...e }));
        }
    };
}

// Material by uri, as the decentralized source serves it: parsed JSON.
function materialSources(byUri) {
    return { decentralized: { load: async (selection, lead) => (byUri[lead.uri] ? JSON.parse(JSON.stringify(byUri[lead.uri])) : null) } };
}

const { verifier } = composeWorldEncounterMaterialVerifier();
const bob = signer('bob');

// Section A — outcomes.
{
    const good = signedPublication(bob);
    const admitted = [];
    const service = fakeService({ [publicationRecordTag('pub-bob')]: [{ objectId: 'pub-bob', uri: 'ar://good' }] });
    const result = await verifyClaimedBuildPublication({
        publicationId: 'pub-bob', contentHash: 'hash-1', services: [null, service], globalDiscoveryTag: GLOBAL_TAG,
        materialSources: materialSources({ 'ar://good': good.toJSON() }), verifier, admit: (p) => admitted.push(p)
    });
    assert(result.outcome === ClaimedBuildVerificationOutcome.VERIFIED, `A1. a signed record for this Publication and content verifies — got ${result.outcome}`);
    assert(admitted.length === 1 && admitted[0] instanceof Publication && admitted[0].id === 'pub-bob', 'A2. and is admitted as a real Publication');
    assert(JSON.stringify(service.queried) === JSON.stringify([`${PUBLICATION_RECORD_TAG_PREFIX}pub-bob`, GLOBAL_TAG]),
        'A3. the Publication\'s own record tag is read, then the global tag for older announcements');

    const none = await verifyClaimedBuildPublication({
        publicationId: 'pub-bob', contentHash: 'hash-1', services: [fakeService({})], globalDiscoveryTag: GLOBAL_TAG,
        materialSources: materialSources({}), verifier, admit: () => assert(false, 'nothing is admitted')
    });
    assert(none.outcome === ClaimedBuildVerificationOutcome.NOT_FOUND, 'A4. no announcement: NOT_FOUND');

    const unsigned = signedPublication(bob, { sign: false });
    const forged = signedPublication(bob);
    const forgedJson = { ...forged.toJSON(), title: 'Edited after signing' };
    const someoneElse = signedPublication(bob, { id: 'pub-other' });
    const rejected = [];
    const bad = await verifyClaimedBuildPublication({
        publicationId: 'pub-bob', contentHash: 'hash-1', globalDiscoveryTag: GLOBAL_TAG,
        services: [fakeService({ [GLOBAL_TAG]: [
            { objectId: 'pub-bob', uri: 'ar://unsigned' },
            { objectId: 'pub-bob', uri: 'ar://forged' },
            // The announcement claims pub-bob, but the record is another Publication.
            { objectId: 'pub-bob', uri: 'ar://other' },
            // An announcement for another Publication is never even fetched.
            { objectId: 'pub-other', uri: 'ar://good' }
        ] })],
        materialSources: materialSources({
            'ar://unsigned': unsigned.toJSON(), 'ar://forged': forgedJson, 'ar://other': someoneElse.toJSON(), 'ar://good': forged.toJSON()
        }),
        verifier, admit: (p) => rejected.push(p)
    });
    assert(bad.outcome === ClaimedBuildVerificationOutcome.UNVERIFIED && rejected.length === 0,
        `A5. unsigned, tampered, or another Publication's records never verify — got ${bad.outcome}`);

    const republished = signedPublication(bob, { hash: 'hash-2' });
    const mismatch = await verifyClaimedBuildPublication({
        publicationId: 'pub-bob', contentHash: 'hash-1', globalDiscoveryTag: GLOBAL_TAG,
        services: [fakeService({ [GLOBAL_TAG]: [{ objectId: 'pub-bob', uri: 'ar://re' }] })],
        materialSources: materialSources({ 'ar://re': republished.toJSON() }), verifier, admit: () => assert(false, 'never admitted')
    });
    assert(mismatch.outcome === ClaimedBuildVerificationOutcome.CONTENT_MISMATCH, 'A6. a valid record naming other content is CONTENT_MISMATCH, never admitted');

    const failing = { searchEnvelopes: async () => { throw new Error('relay down'); } };
    const partial = await verifyClaimedBuildPublication({
        publicationId: 'pub-bob', contentHash: 'hash-1', globalDiscoveryTag: GLOBAL_TAG,
        services: [failing, fakeService({ [GLOBAL_TAG]: [{ objectId: 'pub-bob', uri: 'ar://good' }] })],
        materialSources: materialSources({ 'ar://good': good.toJSON() }), verifier, admit: () => {}
    });
    assert(partial.outcome === ClaimedBuildVerificationOutcome.VERIFIED, 'A7. one failing service never hides another\'s result');
    console.log('✓ A — only a validly signed record for exactly this Publication and content verifies and is admitted');
}

// Section B — announcements carry the record tag; envelope searches keep objectId.
{
    const events = [];
    const nostrPublisher = new NostrPublicationDiscoveryPublisher({
        relayUrl: 'wss://relay.example', discoveryTag: GLOBAL_TAG,
        publishImpl: async (relayUrl, template) => { events.push(template); return { published: true, id: 'a'.repeat(64) }; }
    });
    await nostrPublisher.publish({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-bob', uri: 'ar://good' });
    const tagValues = events[0].tags.map((t) => t[1]);
    assert(JSON.stringify(tagValues) === JSON.stringify([GLOBAL_TAG, 'forkbuild-publication:pub-bob']), `B1. a Nostr Publication announcement carries its record tag — got ${tagValues}`);
    await nostrPublisher.publish({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1', uri: 'ar://a' });
    assert(events[1].tags.length === 1, 'B2. an avatar announcement gets no record tag');

    const uploads = [];
    const arweavePublisher = new ArweaveAnnouncementPublisher({
        discoveryTag: GLOBAL_TAG,
        uploadTaggedTransaction: async (material, tag, extraTags) => { uploads.push({ tag, extraTags }); return { id: 'b'.repeat(43) }; }
    });
    await arweavePublisher.publish({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-bob', uri: 'ar://good' });
    assert(uploads[0].tag.value === GLOBAL_TAG && uploads[0].extraTags.length === 1 && uploads[0].extraTags[0].value === 'forkbuild-publication:pub-bob',
        'B3. an Arweave Publication announcement carries its record tag as an extra tag');

    const relayEvents = {
        'wss://one.example': [{ content: JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-bob', uri: 'ar://x' }) }, { content: 'junk' }],
        'wss://two.example': [{ content: JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-bob', uri: 'ar://y' }) }]
    };
    const queryImpl = async (relayUrl, filter) => {
        assert(filter['#t'] ? filter['#t'][0] === 'forkbuild-publication:pub-bob' : true, 'B4. the query asks for the given tag');
        return relayEvents[relayUrl];
    };
    const single = new NostrDiscoveryQueryService({ queryImpl, relayUrl: 'wss://one.example' });
    const singleEnvelopes = await single.searchEnvelopes('forkbuild-publication:pub-bob');
    assert(singleEnvelopes.length === 1 && singleEnvelopes[0].objectId === 'pub-bob' && singleEnvelopes[0].uri === 'ar://x' && singleEnvelopes[0].origin === single.origin,
        'B5. searchEnvelopes keeps each envelope\'s objectId and origin, skipping junk');
    const plain = await single.search('forkbuild-publication:pub-bob');
    assert(plain.length === 1 && !('objectId' in plain[0]), 'B6. search() itself is unchanged');
    const relaySet = new NostrPublicationRelaySetDiscoveryQueryService({ queryImpl, relayUrls: ['wss://one.example', 'wss://two.example'] });
    const both = await relaySet.searchEnvelopes('forkbuild-publication:pub-bob');
    assert(JSON.stringify(both.map((e) => e.uri).sort()) === JSON.stringify(['ar://x', 'ar://y']), 'B7. the relay set concatenates every relay\'s envelopes');
    console.log('✓ B — announcements carry a per-Publication record tag, and envelope searches keep what they found');
}

// Section C — World View: Verify enables Accept Position, and shows the signing key.
{
    const document = new Document({
        world: new World(),
        metadata: new DocumentMetadata({ title: 'Bob\'s Tower', author: 'bob', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    const text = JSON.stringify(document.toJSON());
    const hash = computeContentHash(text);
    const publications = new Map();
    const verifyCalls = [];
    let nextOutcome = ClaimedBuildVerificationOutcome.NOT_FOUND;
    const messages = [];
    const session = {
        getPlacementInfoForPublication: () => null,
        listKnownPlacements: () => [],
        findPublicationById: (id) => publications.get(id) || null,
        showClaimedBuild: () => 0,
        hideClaimedBuild: () => {},
        placePublication: () => {}
    };
    const claimed = useClaimedBuilds({
        session,
        publicationContentStore: { get: async () => text },
        feedback: { show: (m) => messages.push(m) },
        guarded: (fn) => fn(),
        refreshSpatialUI: () => {},
        getViewerPosition: () => ({ x: 0, y: 0, z: 0 }),
        verifyClaimedBuildPublicationCommand: async (request) => {
            verifyCalls.push(request);
            if (nextOutcome === ClaimedBuildVerificationOutcome.VERIFIED) {
                publications.set('pub-bob', signedPublication(bob, { hash }));
            }
            return { outcome: nextOutcome };
        }
    });
    claimed.noteSnapshotCandidateResult({ publicationId: 'pub-bob', contentHash: hash, claimedPosition: { x: 10, y: 0, z: 10 } },
        { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId: 'pub-bob', contentHash: hash });
    await flush(); await flush();
    let row = claimed.claimedBuildRows.value[0];
    assert(row && row.canVerify && !row.acceptable && !row.publisherKey, 'C1. an unknown Publication offers Verify, not Accept');

    await claimed.verifyClaimedBuild(row);
    row = claimed.claimedBuildRows.value[0];
    assert(verifyCalls[0].publicationId === 'pub-bob' && verifyCalls[0].contentHash === hash, 'C2. Verify asks for exactly this Publication and content');
    assert(!row.acceptable && /distributed only the Snapshot/.test(row.verificationMessage), 'C3. nothing found: Accept stays off, and the row says why');

    nextOutcome = ClaimedBuildVerificationOutcome.VERIFIED;
    await claimed.verifyClaimedBuild(row);
    row = claimed.claimedBuildRows.value[0];
    assert(row.acceptable && !row.canVerify && !row.verificationMessage, 'C4. once verified, Accept Position is enabled — for a key this device doesn\'t know, too');
    assert(row.signedBy === 'bob' && row.publisherKey && row.publisherKey.startsWith('did:key:'), 'C5. the row shows who signed it, as their key');
    assert(/Verified/.test(messages[messages.length - 1]), 'C6. and says so');
    console.log('✓ C — Verify turns an unknown claimed build into an acceptable one, showing the signing key');
}

// Section D — Arweave round trip: an announcement published with its record
// tag is found by that tag through searchEnvelopes().
{
    const { ArweaveGraphqlDiscoveryQueryService } = await import('../application/arweave/ArweaveGraphqlDiscoveryQueryService.js');
    const ledger = new Map();
    let nextId = 0;
    const uploadTaggedTransaction = async (material, tag, extraTags = []) => {
        nextId += 1;
        const id = `Announce${String(nextId).padStart(8, '0')}`;
        ledger.set(id, { data: material, tags: [tag, ...extraTags] });
        return { id: id.padEnd(43, 'x') };
    };
    const fetchImpl = async (url, options = {}) => {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST' && parsed.pathname === '/graphql') {
            const match = JSON.parse(options.body).query.match(/name:\s*"([^"]*)"\s*,\s*values:\s*\[\s*"([^"]*)"\s*\]/);
            const edges = [];
            for (const [id, entry] of ledger.entries()) {
                if (match && entry.tags.some((t) => t.name === match[1] && t.value === match[2])) {
                    edges.push({ node: { id: id.padEnd(43, 'x') } });
                }
            }
            return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
        }
        const entry = ledger.get(parsed.pathname.slice(1).replace(/x+$/, ''));
        return entry ? new Response(entry.data, { status: 200 }) : new Response('not found', { status: 404 });
    };
    const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: GLOBAL_TAG, uploadTaggedTransaction });
    await publisher.publish({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-bob', uri: 'ar://bob-record' });
    await publisher.publish({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-carol', uri: 'ar://carol-record' });
    const service = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl });
    const found = await service.searchEnvelopes(publicationRecordTag('pub-bob'));
    assert(found.length === 1 && found[0].objectId === 'pub-bob' && found[0].uri === 'ar://bob-record' && found[0].origin === service.origin,
        `D1. the record tag finds exactly that Publication's announcement — got ${JSON.stringify(found)}`);
    const all = await service.searchEnvelopes(GLOBAL_TAG);
    assert(all.length === 2, 'D2. the global tag still finds every announcement');
    console.log('✓ D — on Arweave, a Publication\'s record tag finds exactly its announcement');
}
