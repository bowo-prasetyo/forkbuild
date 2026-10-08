// The Publications page is a regular feature with Experimental parts: Steem
// and remote pinning are labelled Experimental wherever they are offered,
// Bitcoin and Base get no one-click anchor card (the one-click Bitcoin
// publisher has no wallet and never succeeds), a relationship between zero
// claims is not called "Agreement", and a World's Snapshot is announced with
// its publisher's own signed placement, the same record World View picks.
import {
    oneClickAnchorTypes, describeClaimRelationship, humanizeDiscoveryProvider, discoveryProviderConfigurationRoute,
    storageTypeOptionLabel, isExperimentalStorageType, isExperimentalAnchorType, everyAnchorTypeExperimental
} from '../ui/views/decentralizedPublications/presentation.js';
import { latestPublisherPlacementRecord, PublisherPlacementClaimLookup } from '../application/placement/PublisherPlacementClaim.js';
import { placementMethods } from '../application/worldNavigation/placementMethods.js';
import { assert } from './support/Assert.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Anchoring: only the types a click can make.
assert(same(oneClickAnchorTypes(['bitcoin-op-return', 'arweave', 'steem', 'base']), ['arweave', 'steem']), 'Bitcoin and Base get no one-click card');
assert(same(oneClickAnchorTypes(['bitcoin-op-return']), []), 'with only Bitcoin registered, there is nothing to click');
assert(same(oneClickAnchorTypes(null), []), 'and nothing registered is nothing');

// Relationships.
assert(describeClaimRelationship('agreement', 0) === 'Nothing to compare yet', 'zero claims do not agree');
assert(describeClaimRelationship(undefined, 0) === 'Nothing to compare yet', 'nor with no relationship at all');
assert(describeClaimRelationship('agreement', 2) === 'Agreement', 'claims that agree');
assert(describeClaimRelationship('conflict', 2) === 'Conflict', 'claims that conflict');
console.log('✓ anchoring offers only one-click types, and zero claims are nothing to compare');

// Experimental labels.
assert(isExperimentalStorageType('steem') && isExperimentalStorageType('remote-pinning'), 'Steem and remote pinning are Experimental storage');
assert(!isExperimentalStorageType('ipfs') && !isExperimentalStorageType('ar') && !isExperimentalStorageType('local'), 'IPFS, Arweave and Local are not');
assert(storageTypeOptionLabel('steem') === 'Steem (Experimental)' && storageTypeOptionLabel('ar') === 'Arweave', 'storage options say so');
assert(humanizeDiscoveryProvider('arweave') === 'Arweave', 'substrates have names');
assert(discoveryProviderConfigurationRoute('steem') === '/settings/steem'
    && discoveryProviderConfigurationRoute('arweave') === '/settings/arweave-gateway'
    && discoveryProviderConfigurationRoute('nostr') === '/settings/nostr-relay', 'and a settings page each');
console.log('✓ Steem and remote pinning storage are labelled Experimental; IPFS, Arweave and Local are not');

// Anchor types are Experimental one by one, so one can graduate on its own; the
// Proof / Anchoring block is Experimental as a whole only while all it offers are.
assert(['bitcoin-op-return', 'base', 'steem', 'blurt'].every(isExperimentalAnchorType), 'Bitcoin, Base, Steem and Blurt anchors are Experimental');
assert(!isExperimentalAnchorType('arweave'), 'Arweave anchors graduated');
assert(!isExperimentalAnchorType('some-new-chain') && !isExperimentalAnchorType(undefined), 'a type not on the list is not');
assert(everyAnchorTypeExperimental(['steem', 'blurt']) && everyAnchorTypeExperimental(['bitcoin-op-return']), 'a block offering only Experimental types is Experimental');
assert(!everyAnchorTypeExperimental(['arweave', 'steem']), 'Arweave alone is enough to drop the block-wide badge');
assert(!everyAnchorTypeExperimental([]) && !everyAnchorTypeExperimental(null), 'and a block offering nothing claims nothing');
console.log('✓ anchor types are Experimental one by one, and the block only while all are');

// The publisher's placement.
function record({ owner, signed = true, updatedAt, x }) {
    const json = { placementId: `p-${x}`, publicationId: 'pub-1', position: { x, y: 0, z: 0 }, updatedAt };
    return {
        ...json,
        ownerIdentity: owner ? { id: owner } : null,
        signature: signed ? { signer: owner } : null,
        updatedAt: new Date(updatedAt),
        toJSON: () => ({ ...json, ownerIdentity: owner ? { id: owner } : null })
    };
}
const records = [
    record({ owner: 'did:key:zpub', updatedAt: '2026-09-01T00:00:00Z', x: 1 }),
    record({ owner: 'did:key:zpub', updatedAt: '2026-09-20T00:00:00Z', x: 2 }),
    record({ owner: 'did:key:zpub', signed: false, updatedAt: '2026-09-25T00:00:00Z', x: 3 }),
    record({ owner: 'did:key:zother', updatedAt: '2026-09-27T00:00:00Z', x: 4 })
];
assert(latestPublisherPlacementRecord(records, 'did:key:zpub').position.x === 2,
    "the publisher's latest signed placement wins; an unsigned one and someone else's never do");
assert(latestPublisherPlacementRecord(records, 'did:key:znobody') === null, 'none for a publisher who placed nothing');
assert(latestPublisherPlacementRecord(records, null) === null, 'none without a publisher');

const registry = { findByPublicationId: (id) => (id === 'pub-1' ? records : []) };
const lookup = new PublisherPlacementClaimLookup(registry);
const claim = lookup.claimFor({ id: 'pub-1', publisherIdentity: { id: 'did:key:zpub' } });
assert(claim.publicationId === 'pub-1' && same(claim.claimedPosition, { x: 2, y: 0, z: 0 }) && claim.placementRecord.placementId === 'p-2',
    'a placed World is announced with its id, position and signed record');
assert(same(lookup.claimFor({ id: 'pub-2', publisherIdentity: { id: 'did:key:zpub' } }), {}),
    'an unplaced one with neither id nor position, which travel together or not at all');
assert(same(new PublisherPlacementClaimLookup({ findByPublicationId: () => { throw new Error('storage'); } })
    .claimFor({ id: 'pub-1', publisherIdentity: { id: 'did:key:zpub' } }), {}), 'a failing registry never throws');
let refused = false;
try { new PublisherPlacementClaimLookup(null); } catch { refused = true; }
assert(refused, 'a lookup needs a registry');

// World View picks the same record.
const session = {
    ...placementMethods,
    _placementRegistry: registry,
    findPublicationById: (id) => (id === 'pub-1' ? { id, publisherIdentity: { id: 'did:key:zpub' } } : null)
};
assert(session.getPublisherPlacementRecord('pub-1').placementId === 'p-2', "World View's session announces the same record");
assert(session.getPublisherPlacementRecord('pub-2') === null, 'and none for an unknown Publication');
console.log("✓ a World's Snapshot carries its publisher's latest signed placement, as in World View");
