import { readFile } from 'node:fs/promises';
import {
    WorldEncounterKind,
    describeEncounterablePublication,
    describeEncounterableAvatar,
    deriveWorldEncounters
} from '../core/WorldEncounter.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function publicationOf(overrides = {}) {
    return {
        id: 'pub-1',
        title: 'Untitled',
        publisherIdentity: { username: 'alice' },
        signature: { signedBy: 'alice' },
        ...overrides
    };
}

function placementOf(overrides = {}) {
    return {
        id: 'placement-1',
        publicationId: 'pub-1',
        position: { x: 10, y: 0, z: 20 },
        ...overrides
    };
}

function anchorOf(overrides = {}) {
    return { id: 'anchor-1', publicationId: 'pub-1', anchorType: 'bitcoin-opreturn', ...overrides };
}

function snapshotPlacementOf(overrides = {}) {
    return { id: 'sp-1', publicationId: 'pub-1', storage: 'ipfs', ...overrides };
}

function avatarProfileOf(overrides = {}) {
    return { avatarId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', ...overrides };
}

function avatarPresenceOf(overrides = {}) {
    return { avatarId: 'avatar-1', position: { x: 5, y: 0, z: 5 }, ...overrides };
}

// ---------------------------------------------------------------------
// 1. describeEncounterablePublication: basic shape
// ---------------------------------------------------------------------
{
    const encounter = describeEncounterablePublication({ publication: publicationOf(), placement: placementOf() });

    assert(encounter !== null, 'a placed publication is encounterable');
    assert(encounter.kind === WorldEncounterKind.PUBLICATION, 'kind is PUBLICATION');
    assert(encounter.objectId === 'pub-1', 'objectId is the publication id');
    assert(encounter.title === 'Untitled', 'title is copied from the publication');
    assert(encounter.publisherIdentity.username === 'alice', 'publisherIdentity is copied');
    assert(encounter.isSigned === true, 'isSigned reflects signature presence');
    assert(encounter.position.x === 10 && encounter.position.z === 20, 'position is copied from the placement');
    assert(encounter.anchorCount === 0 && encounter.placementCount === 0, 'counts default to zero when not supplied');
    assert(Object.isFrozen(encounter), 'the encounter object is frozen');

    console.log('✓ describeEncounterablePublication: basic shape');
}

// ---------------------------------------------------------------------
// 2. describeEncounterablePublication: no encounter without a location
// ---------------------------------------------------------------------
{
    assert(describeEncounterablePublication({ publication: null, placement: placementOf() }) === null,
        'a missing publication is not encounterable');
    assert(describeEncounterablePublication({ publication: publicationOf(), placement: null }) === null,
        'a publication with no placement is not encounterable');
    assert(describeEncounterablePublication({ publication: publicationOf(), placement: placementOf({ position: null }) }) === null,
        'a placement with no resolvable position is not encounterable');
    assert(describeEncounterablePublication({}) === null, 'malformed input degrades to null, never throws');

    console.log('✓ describeEncounterablePublication: no encounter without a location');
}

// ---------------------------------------------------------------------
// 3. describeEncounterableAvatar: basic shape
// ---------------------------------------------------------------------
{
    const encounter = describeEncounterableAvatar({ profile: avatarProfileOf(), presence: avatarPresenceOf() });

    assert(encounter !== null, 'a present avatar is encounterable');
    assert(encounter.kind === WorldEncounterKind.AVATAR, 'kind is AVATAR');
    assert(encounter.objectId === 'avatar-1', 'objectId is the avatarId');
    assert(encounter.ownerIdentity === 'bob', 'ownerIdentity is copied from the profile');
    assert(encounter.displayName === 'Bob', 'displayName is copied from the profile');
    assert(encounter.position.x === 5 && encounter.position.z === 5, 'position is copied from the presence');
    assert(Object.isFrozen(encounter), 'the encounter object is frozen');

    console.log('✓ describeEncounterableAvatar: basic shape');
}

// ---------------------------------------------------------------------
// 4. describeEncounterableAvatar: no encounter without a live presence
// ---------------------------------------------------------------------
{
    assert(describeEncounterableAvatar({ profile: null, presence: avatarPresenceOf() }) === null,
        'a missing profile is not encounterable');
    assert(describeEncounterableAvatar({ profile: avatarProfileOf(), presence: null }) === null,
        'a profile with no live presence is not encounterable — offline, not an error');
    assert(describeEncounterableAvatar({ profile: avatarProfileOf(), presence: avatarPresenceOf({ position: null }) }) === null,
        'a presence with no resolvable position is not encounterable');
    assert(describeEncounterableAvatar({}) === null, 'malformed input degrades to null, never throws');

    console.log('✓ describeEncounterableAvatar: no encounter without a live presence');
}

// ---------------------------------------------------------------------
// 5. deriveWorldEncounters: joins by id, never by position or guessing
// ---------------------------------------------------------------------
{
    const result = deriveWorldEncounters({
        publications: [publicationOf({ id: 'pub-1' }), publicationOf({ id: 'pub-2' }), publicationOf({ id: 'pub-3' })],
        // pub-2 has a placement; pub-3 (never placed) has none, and stays unencountered.
        placements: [placementOf({ id: 'p1', publicationId: 'pub-1' }), placementOf({ id: 'p2', publicationId: 'pub-2' })],
        avatarProfiles: [avatarProfileOf({ avatarId: 'avatar-1' }), avatarProfileOf({ avatarId: 'avatar-2' })],
        // Only avatar-1 has a live presence; avatar-2 (a profile with no presence) stays unencountered.
        avatarPresences: [avatarPresenceOf({ avatarId: 'avatar-1' })]
    });

    assert(result.publications.length === 2, 'only placed publications are encountered');
    assert(result.publications.map((e) => e.objectId).sort().join(',') === 'pub-1,pub-2', 'pub-3 (unplaced) is excluded');
    assert(result.avatars.length === 1, 'only present avatars are encountered');
    assert(result.avatars[0].objectId === 'avatar-1', 'avatar-2 (no presence) is excluded');

    // A placement naming a publication that was never supplied is silently skipped, never a partial encounter.
    const orphaned = deriveWorldEncounters({
        publications: [],
        placements: [placementOf({ publicationId: 'ghost-pub' })]
    });
    assert(orphaned.publications.length === 0, 'a placement with no matching publication produces no encounter');

    // A presence naming an avatarId that was never supplied is silently skipped.
    const ghostPresence = deriveWorldEncounters({
        avatarProfiles: [],
        avatarPresences: [avatarPresenceOf({ avatarId: 'ghost-avatar' })]
    });
    assert(ghostPresence.avatars.length === 0, 'a presence with no matching profile produces no encounter');

    console.log('✓ deriveWorldEncounters: joins by id, never by position or guessing');
}

// ---------------------------------------------------------------------
// 6. deriveWorldEncounters: anchors and placements are counted, never merged
// ---------------------------------------------------------------------
{
    const result = deriveWorldEncounters({
        publications: [publicationOf({ id: 'pub-1' })],
        placements: [placementOf({ publicationId: 'pub-1' })],
        anchors: [
            anchorOf({ id: 'a1', publicationId: 'pub-1' }),
            anchorOf({ id: 'a2', publicationId: 'pub-1' }),
            anchorOf({ id: 'a3', publicationId: 'other-pub' }) // does not count toward pub-1
        ],
        snapshotPlacements: [snapshotPlacementOf({ id: 'sp1', publicationId: 'pub-1' })]
    });

    const encounter = result.publications[0];
    assert(encounter.anchorCount === 2, 'anchorCount reflects only anchors naming this publicationId');
    assert(encounter.placementCount === 1, 'placementCount reflects only snapshot placements naming this publicationId');
    assert(!('attestations' in encounter), 'anchors and placements are never merged into one combined field');
    assert(!('verified' in encounter) && !('trust' in encounter) && !('score' in encounter),
        'no evaluative field is ever added alongside the two independent counts');

    console.log('✓ deriveWorldEncounters: anchors and placements are counted, never merged');
}

// ---------------------------------------------------------------------
// 7. FLAGSHIP: two publishers, one avatar present, one not
// ---------------------------------------------------------------------
{
    // Alice publishes and places a document, anchors it once, and places
    // its bytes on IPFS once. Bob publishes and places a second document
    // with no evidence at all. Carol publishes a third document but never
    // places it in the World — it exists, but is not encounterable.
    const alicePub = publicationOf({ id: 'alice-pub', title: "Alice's Sculpture", publisherIdentity: { username: 'alice' } });
    const bobPub = publicationOf({ id: 'bob-pub', title: "Bob's Garden", publisherIdentity: { username: 'bob' }, signature: null });
    const carolPub = publicationOf({ id: 'carol-pub', title: "Carol's Draft", publisherIdentity: { username: 'carol' } });

    const result = deriveWorldEncounters({
        publications: [alicePub, bobPub, carolPub],
        placements: [
            placementOf({ id: 'p-alice', publicationId: 'alice-pub', position: { x: 100, y: 0, z: 100 } }),
            placementOf({ id: 'p-bob', publicationId: 'bob-pub', position: { x: -50, y: 0, z: 30 } })
            // carol-pub is never placed.
        ],
        anchors: [anchorOf({ publicationId: 'alice-pub', anchorType: 'bitcoin-opreturn' })],
        snapshotPlacements: [snapshotPlacementOf({ publicationId: 'alice-pub', storage: 'ipfs' })],
        avatarProfiles: [
            avatarProfileOf({ avatarId: 'bob-avatar', ownerIdentity: 'bob', displayName: 'Bob' }),
            avatarProfileOf({ avatarId: 'alice-avatar', ownerIdentity: 'alice', displayName: 'Alice' })
        ],
        // Bob is currently in the World; Alice's avatar profile exists but she is offline right now.
        avatarPresences: [avatarPresenceOf({ avatarId: 'bob-avatar', position: { x: -48, y: 0, z: 31 } })]
    });

    assert(result.publications.length === 2, 'FLAGSHIP: exactly the two PLACED publications are encountered');
    const alice = result.publications.find((e) => e.objectId === 'alice-pub');
    const bob = result.publications.find((e) => e.objectId === 'bob-pub');
    assert(alice && bob, 'FLAGSHIP: both Alice and Bob are independently encounterable');
    assert(result.publications.every((e) => e.objectId !== 'carol-pub'), 'FLAGSHIP: Carol\'s unplaced document is never encountered');

    assert(alice.anchorCount === 1 && alice.placementCount === 1, "FLAGSHIP: Alice's evidence counts are carried, not merged");
    assert(bob.anchorCount === 0 && bob.placementCount === 0, "FLAGSHIP: Bob's publication has none, and that is a plain zero, never an omission");
    assert(alice.isSigned === true && bob.isSigned === false, 'FLAGSHIP: signature presence is per-publication, independently reported');

    assert(result.avatars.length === 1, 'FLAGSHIP: only the currently-present avatar is encountered');
    assert(result.avatars[0].objectId === 'bob-avatar', "FLAGSHIP: Bob's avatar is encountered");
    assert(result.avatars.every((e) => e.objectId !== 'alice-avatar'), "FLAGSHIP: Alice's own avatar, currently offline, is not encountered even though her PUBLICATION is");

    console.log('✓ FLAGSHIP: two publishers, one avatar present, one not');
}

// ---------------------------------------------------------------------
// 8. Vocabulary boundary: no evaluative, ranking, or network vocabulary
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/WorldEncounter.js', import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    const forbidden = [
        'score', 'rank', 'winner', 'correct', 'incorrect', 'valid', 'stale', 'preferred', 'status', 'confidence',
        'trust', 'reputation', 'verified', 'authority', 'worthiness', 'quality',
        'reconcile', 'merge', 'compare', 'comparison',
        'fetch(', 'websocket', 'WebSocket', 'gossip', 'socket'
    ];
    for (const term of forbidden) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/WorldEncounter.js code must never use the word "${term}"`);
    }

    console.log('✓ Vocabulary boundary: no evaluative, ranking, or network vocabulary');
}

console.log('\nAll world encounter tests passed.');
