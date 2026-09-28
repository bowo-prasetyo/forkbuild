// A publisher's own signed placement travels beside its Snapshot announcement
// (core/SnapshotDiscoveryEnvelope.js), and a receiving device adopts it
// (AdoptPublisherPlacementUseCase) so World View shows the build where its
// publisher put it. Only a record signed with the known Publication's own key
// is adopted; a later move replaces an earlier one.
import {
    describeSnapshotDiscoveryEnvelope, parseSnapshotDiscoveryEnvelope, snapshotCandidateFromEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../core/SnapshotDiscoveryEnvelope.js';
import { ANNOUNCEMENT_KINDS, AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { AdoptPublisherPlacementUseCase, PublisherPlacementAdoption } from '../application/placement/AdoptPublisherPlacementUseCase.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { placementMethods } from '../application/worldNavigation/placementMethods.js';
import { useClaimedBuilds } from '../ui/views/worldView/useClaimedBuilds.js';
import { PlacementPolicy } from '../core/PlacementPolicy.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { CausalStamp } from '../core/CausalStamp.js';
import { RevisionReference } from '../core/RevisionReference.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

function publish(identity, placementPolicy) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'House', author: 'alice', placementPolicy }) });
    return new LocalPublisherProvider(new InMemoryStorageProvider()).publish(document, identity);
}

function registry() {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    return { registry: new LocalPlacementRegistry(storage, spatialIndexProvider), spatialIndexProvider };
}

// The publisher's own signed placement, exactly as PlacePublicationUseCase makes it.
function publisherPlacement(publication, identity, position) {
    const { registry: own, spatialIndexProvider } = registry();
    const discovery = { findById: (id) => (id === publication.id ? publication : null) };
    const loader = { execute: () => { throw new Error('unused'); } };
    new PlacePublicationUseCase(spatialIndexProvider, discovery, loader, null, own, identity).execute(publication.id, position);
    return own.findByPublicationId(publication.id)[0];
}

function moved(record, identity, position) {
    let next = record.withPosition(new Position(position.x, position.y, position.z));
    next = next.withCausalHistory((record.causalStamp || new CausalStamp()).advance(identity.getSigningIdentity().id), [
        new RevisionReference({ placementId: record.placementId, revision: record.revision, contentReference: { hash: record.contentHash } })
    ]);
    next = next.withContentHash(next.computeContentHash());
    return next.withSignature(identity.signCanonical(next.getSigningDescriptor()));
}

const alice = createIdentity('alice');
const bob = createIdentity('bob');
const base = { protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'abc', locator: 'ipfs://x', storage: 'ipfs' };

// Section A — the envelope carries the record.
{
    const publication = publish(alice);
    const record = publisherPlacement(publication, alice, { x: 120, y: 0, z: 40 }).toJSON();
    const claim = { ...base, publicationId: publication.id, claimedPosition: { x: 120, y: 0, z: 40 } };

    const described = describeSnapshotDiscoveryEnvelope({ ...claim, placementRecord: record });
    assert(described.placementRecord && described.placementRecord.placementId === record.placementId, 'A1. a matching signed placement rides in the envelope');
    const parsed = parseSnapshotDiscoveryEnvelope(JSON.stringify(described));
    const candidate = snapshotCandidateFromEnvelope(parsed);
    assert(candidate.placementRecord && candidate.placementRecord.signature.signature === record.signature.signature,
        'A2. it survives the wire and reaches the discovery candidate intact');

    const elsewhere = describeSnapshotDiscoveryEnvelope({ ...claim, claimedPosition: { x: 1, y: 0, z: 1 }, placementRecord: record });
    assert(elsewhere && !('placementRecord' in elsewhere), 'A3. a record that isn\'t at the claimed position is left out; the claim stands');
    const otherPub = describeSnapshotDiscoveryEnvelope({ ...claim, publicationId: 'other', placementRecord: record });
    assert(otherPub && !('placementRecord' in otherPub), 'A4. a record for another Publication is left out');
    const noClaim = describeSnapshotDiscoveryEnvelope({ ...base, placementRecord: record });
    assert(noClaim && !('placementRecord' in noClaim), 'A5. without a claim there is nothing to attach it to');
    assert(JSON.stringify(Object.keys(snapshotCandidateFromEnvelope(describeSnapshotDiscoveryEnvelope(base)))) === JSON.stringify(['contentHash', 'locator', 'storage']),
        'A6. an announcement without a claim yields exactly the candidate it always did');
    console.log('✓ Section A: the envelope carries the publisher\'s signed placement');
}

// Section B — the Announcement Index keeps each revision.
{
    const publication = publish(alice);
    const first = publisherPlacement(publication, alice, { x: 120, y: 0, z: 40 });
    const second = moved(first, alice, { x: 130, y: 0, z: 40 });
    const normalize = ANNOUNCEMENT_KINDS[AnnouncementKind.SNAPSHOT].normalize;
    const candidate = (record) => ({ ...base, publicationId: publication.id, claimedPosition: { ...record.toJSON().position }, placementRecord: record.toJSON() });
    const a = normalize(candidate(first), 'forkbuild-snapshot');
    const b = normalize(candidate(second), 'forkbuild-snapshot');
    assert(a.payload.placementRecord.contentHash === first.contentHash, 'B1. the index stores the record with the announcement');
    assert(a.key !== b.key, 'B2. a later revision is kept beside an earlier one, not ignored as a duplicate');
    console.log('✓ Section B: the Announcement Index keeps the record and each revision');
}

// Section C — adoption.
{
    const publication = publish(alice, PlacementPolicy.PUBLISHER_ONLY);
    const record = publisherPlacement(publication, alice, { x: 120, y: 0, z: 40 });
    const known = new Map([[publication.id, publication]]);
    const { registry: viewer } = registry();
    const adopt = new AdoptPublisherPlacementUseCase({
        placementRegistry: viewer, verifier: new LocalAuthorizationVerifier(), findPublicationById: (id) => known.get(id) || null
    });

    const unknown = new AdoptPublisherPlacementUseCase({ placementRegistry: viewer, verifier: new LocalAuthorizationVerifier(), findPublicationById: () => null });
    assert(unknown.execute(record.toJSON()).outcome === PublisherPlacementAdoption.PUBLICATION_UNKNOWN, 'C1. without the Publication there is nobody to check the signer against');

    const bobs = (() => {
        let r = new PlacementRecord({ ...record.toJSON(), signature: null, ownerIdentity: null });
        r = r.withOwnerIdentity(bob.getSigningIdentity().toJSON());
        return r.withSignature(bob.signCanonical(r.getSigningDescriptor()));
    })();
    assert(adopt.execute(bobs.toJSON()).outcome === PublisherPlacementAdoption.NOT_PUBLISHER, 'C2. a placement signed by someone else is refused');

    const forged = (() => {
        const identity = { ...bob.getSigningIdentity().toJSON(), id: alice.getSigningIdentity().id };
        let r = new PlacementRecord({ ...record.toJSON(), signature: null, ownerIdentity: null }).withOwnerIdentity(identity);
        const signature = bob.signCanonical(r.getSigningDescriptor()).toJSON();
        return r.withSignature({ ...signature, signer: identity.id });
    })();
    assert(adopt.execute(forged.toJSON()).outcome !== PublisherPlacementAdoption.ADOPTED, 'C3. claiming the publisher\'s id with another key is refused');

    const tampered = { ...record.toJSON(), position: { x: 999, y: 0, z: 999 } };
    assert(adopt.execute(tampered).outcome === PublisherPlacementAdoption.INVALID, 'C4. a record whose position was altered is refused');
    assert(viewer.list().length === 0, 'C5. nothing refused reaches the registry');

    const adopted = adopt.execute(record.toJSON());
    assert(adopted.outcome === PublisherPlacementAdoption.ADOPTED, 'C6. the publisher\'s own placement is adopted, even for a publisher-only build');
    const held = viewer.findByPublicationId(publication.id);
    assert(held.length === 1 && held[0].position.x === 120 && held[0].ownerIdentity.id === alice.getSigningIdentity().id,
        'C7. the device now holds it at the publisher\'s position, still owned by the publisher');
    assert(adopt.execute(record.toJSON()).outcome === PublisherPlacementAdoption.ALREADY_CURRENT, 'C8. the same record again changes nothing');

    const later = moved(record, alice, { x: 300, y: 0, z: 80 });
    assert(adopt.execute(later.toJSON()).outcome === PublisherPlacementAdoption.ADOPTED
        && viewer.get(record.placementId).position.x === 300, 'C9. the publisher moving it replaces the earlier position');
    assert(adopt.execute(record.toJSON()).outcome === PublisherPlacementAdoption.ALREADY_CURRENT
        && viewer.get(record.placementId).position.x === 300, 'C10. the older revision arriving late never moves it back');
    console.log('✓ Section C: only the publisher\'s own signed placement is adopted, and moves replace it');
}

// Section D — the publisher side picks its own signed record to announce.
{
    const publication = publish(alice);
    const own = publisherPlacement(publication, alice, { x: 10, y: 0, z: 10 });
    const { registry: device } = registry();
    device.add(own);
    const bobsPlacement = (() => {
        let r = new PlacementRecord({ ...own.toJSON(), placementId: 'bobs', signature: null, ownerIdentity: null, position: new Position(50, 0, 50) });
        r = r.withOwnerIdentity(bob.getSigningIdentity().toJSON());
        r = r.withContentHash(r.computeContentHash());
        return r.withSignature(bob.signCanonical(r.getSigningDescriptor()));
    })();
    device.add(bobsPlacement);
    const session = { _placementRegistry: device, findPublicationById: (id) => (id === publication.id ? publication : null) };
    const announced = placementMethods.getPublisherPlacementRecord.call(session, publication.id);
    assert(announced && announced.placementId === own.placementId, 'D1. only the publisher\'s own signed placement is announced, never someone else\'s');
    assert(placementMethods.getPublisherPlacementRecord.call(session, 'unknown') === null, 'D2. nothing is announced for an unknown Publication');
    console.log('✓ Section D: distribution announces the publisher\'s own signed placement');
}

// Section E — World View adopts from discovery, and retries once the Publication is known.
{
    const publications = new Map();
    const adoptions = [];
    let refreshed = 0;
    const session = {
        getPlacementInfoForPublication: () => null,
        listKnownPlacements: () => [],
        findPublicationById: (id) => publications.get(id) || null,
        showClaimedBuild: () => 1,
        hideClaimedBuild: () => {},
        adoptPublisherPlacement: (record) => {
            adoptions.push(record.placementId);
            return Promise.resolve({
                outcome: publications.has(record.publicationId) ? PublisherPlacementAdoption.ADOPTED : PublisherPlacementAdoption.PUBLICATION_UNKNOWN
            });
        }
    };
    let clock = 0;
    const claimed = useClaimedBuilds({
        session,
        publicationContentStore: { get: async () => null },
        feedback: { show: () => {} },
        guarded: (fn) => fn(),
        refreshSpatialUI: () => { refreshed += 1; },
        getViewerPosition: () => ({ x: 0, y: 0, z: 0 }),
        now: () => clock
    });
    const record = { placementId: 'pl-a', publicationId: 'pub-a', contentHash: 'r1', position: { x: 1, y: 0, z: 1 } };
    claimed.noteSnapshotCandidateResult({ contentHash: 'h', publicationId: 'pub-a', claimedPosition: record.position, placementRecord: record }, null);
    await flush();
    assert(adoptions.length === 1 && refreshed === 0, 'E1. a candidate\'s signed placement is offered at once; unknown, it waits');

    clock += 5000;
    claimed.reconcileClaimedBuilds();
    await flush();
    assert(adoptions.length === 1, 'E2. it isn\'t retried while its Publication is still unknown');

    publications.set('pub-a', { id: 'pub-a' });
    clock += 5000;
    claimed.reconcileClaimedBuilds();
    await flush();
    assert(adoptions.length === 2 && refreshed === 1, 'E3. once the Publication is known it is adopted and the World redrawn');

    clock += 5000;
    claimed.reconcileClaimedBuilds();
    await flush();
    assert(adoptions.length === 2, 'E4. an adopted placement is not offered again');
    claimed.disposeClaimedBuilds();
    console.log('✓ Section E: World View adopts publisher placements from discovery');
}
