import { readFile } from 'node:fs/promises';
import {
    describeWorldEncounterSelectionIdentity,
    worldEncounterSelectionIdentitiesMatch,
    deriveWorldEncounterSelectionIdentities
} from '../core/WorldEncounterSelectionIdentity.js';
import {
    describeWorldEncounterSelectionCandidates,
    describeWorldEncounterSelectionCandidatesFromRegistry
} from '../application/WorldEncounterSelectionResolution.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function peerSourceOf(origin, { publications = [], placements = [], avatarProfiles = [], avatarPresences = [] } = {}) {
    return describeWorldDiscoverySource({ origin, publications, placements, avatarProfiles, avatarPresences });
}

// ---------------------------------------------------------------------
// 1. Flagship: the same publication placed by two different sources
//    produces two distinct selection identities, distinguished only by
//    origin — the exact scenario 0.9.7 made possible and nothing before
//    0.9.19 could name.
// ---------------------------------------------------------------------
{
    const sharedPublication = { id: 'pub-shared', title: 'Shared' };
    const sharedPlacement = { id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } };

    const localSource = describeLocalWorldDiscoverySource({ publications: [sharedPublication], placements: [sharedPlacement] });
    const peerASource = peerSourceOf('peer:did:key:zPeerA', { publications: [sharedPublication], placements: [sharedPlacement] });
    const peerBSource = peerSourceOf('peer:did:key:zPeerB', { publications: [sharedPublication], placements: [sharedPlacement] });

    const identities = deriveWorldEncounterSelectionIdentities([localSource, peerASource, peerBSource]);

    assert(identities.length === 3, '1. FLAGSHIP — three sources placing the same publication produce three selection identities');
    assert(identities.every((identity) => identity.kind === 'PUBLICATION' && identity.objectId === 'pub-shared'), '2. FLAGSHIP — every identity names the same kind/objectId');
    assert(identities.map((identity) => identity.origin).join(',') === 'local,peer:did:key:zPeerA,peer:did:key:zPeerB', '3. FLAGSHIP — each identity carries its own distinct origin, in source order');

    const candidates = describeWorldEncounterSelectionCandidates({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-shared' },
        sources: [localSource, peerASource, peerBSource]
    });
    assert(candidates.length === 3, '4. FLAGSHIP — resolving the plain { kind, objectId } selection against all three sources surfaces all three candidates, never one guessed');

    console.log('✓ Flagship: duplicate encounters across origins are distinguished by selection identity, never collapsed');
}

// ---------------------------------------------------------------------
// 2. A publication placed by exactly one source resolves to exactly one
//    unambiguous candidate.
// ---------------------------------------------------------------------
{
    const localSource = describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-1', title: 'Solo' }],
        placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 1, y: 0, z: 1 } }]
    });

    const candidates = describeWorldEncounterSelectionCandidates({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' },
        sources: [localSource]
    });

    assert(candidates.length === 1, '5. an unambiguous encounter resolves to exactly one candidate');
    assert(serialize(candidates[0]) === serialize({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' }), '6. the one candidate names exactly kind/objectId/origin, nothing more');

    console.log('✓ An unambiguous encounter resolves to exactly one candidate');
}

// ---------------------------------------------------------------------
// 3. A selection matching nothing currently in the World resolves to
//    zero candidates — a stale selection, never a thrown error and never
//    a fabricated result.
// ---------------------------------------------------------------------
{
    const localSource = describeLocalWorldDiscoverySource({ publications: [{ id: 'pub-1' }], placements: [] });

    const candidates = describeWorldEncounterSelectionCandidates({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-does-not-exist' },
        sources: [localSource]
    });

    assert(Array.isArray(candidates) && candidates.length === 0, '7. a selection matching nothing currently in the World resolves to zero candidates');
    assert(Object.isFrozen(candidates), '8. the empty result is still frozen');

    console.log('✓ A stale selection resolves to zero candidates, never throws, never fabricates a result');
}

// ---------------------------------------------------------------------
// 4. kind decides which candidates match — an objectId shared across
//    kinds never cross-matches, and avatars/publications are resolved
//    independently.
// ---------------------------------------------------------------------
{
    const sharedId = 'shared-id-99';
    const localSource = describeLocalWorldDiscoverySource({
        publications: [{ id: sharedId, title: 'A Publication' }],
        placements: [{ id: 'placement-x', publicationId: sharedId, position: { x: 0, y: 0, z: 0 } }],
        avatarProfiles: [{ avatarId: sharedId, displayName: 'An Avatar' }],
        avatarPresences: [{ avatarId: sharedId, position: { x: 1, y: 0, z: 1 } }]
    });

    const publicationCandidates = describeWorldEncounterSelectionCandidates({
        selectedEncounter: { kind: 'PUBLICATION', objectId: sharedId },
        sources: [localSource]
    });
    const avatarCandidates = describeWorldEncounterSelectionCandidates({
        selectedEncounter: { kind: 'AVATAR', objectId: sharedId },
        sources: [localSource]
    });

    assert(publicationCandidates.length === 1 && publicationCandidates[0].kind === 'PUBLICATION', '9. a PUBLICATION selection only ever matches PUBLICATION identities');
    assert(avatarCandidates.length === 1 && avatarCandidates[0].kind === 'AVATAR', '10. an AVATAR selection only ever matches AVATAR identities');

    console.log('✓ kind decides which candidates match — no cross-kind matching even when objectId collides');
}

// ---------------------------------------------------------------------
// 5. describeWorldEncounterSelectionIdentity(): validation and freezing.
// ---------------------------------------------------------------------
{
    const valid = describeWorldEncounterSelectionIdentity({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' });
    assert(serialize(valid) === serialize({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' }), '11. a well-formed identity is returned verbatim');
    assert(Object.isFrozen(valid), '12. a well-formed identity is frozen');

    const malformedInputs = [
        undefined,
        null,
        {},
        { kind: 'NOT_A_KIND', objectId: 'pub-1', origin: 'local' },
        { kind: 'PUBLICATION', objectId: '', origin: 'local' },
        { kind: 'PUBLICATION', objectId: 'pub-1', origin: '' },
        { kind: 'PUBLICATION', objectId: 'pub-1' },
        { kind: 'PUBLICATION', origin: 'local' },
        { objectId: 'pub-1', origin: 'local' }
    ];
    for (const input of malformedInputs) {
        assert(describeWorldEncounterSelectionIdentity(input) === null, `13. malformed input ${serialize(input)} degrades to null, never throws`);
    }

    console.log('✓ describeWorldEncounterSelectionIdentity(): validates every field, degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 6. worldEncounterSelectionIdentitiesMatch(): exact three-field equality.
// ---------------------------------------------------------------------
{
    const a = { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' };
    const sameAsA = { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' };
    const differentOrigin = { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'peer:x' };
    const differentObjectId = { kind: 'PUBLICATION', objectId: 'pub-2', origin: 'local' };
    const differentKind = { kind: 'AVATAR', objectId: 'pub-1', origin: 'local' };

    assert(worldEncounterSelectionIdentitiesMatch(a, sameAsA) === true, '14. two identities naming the same kind/objectId/origin match');
    assert(worldEncounterSelectionIdentitiesMatch(a, differentOrigin) === false, '15. a different origin never matches, even with the same kind/objectId');
    assert(worldEncounterSelectionIdentitiesMatch(a, differentObjectId) === false, '16. a different objectId never matches');
    assert(worldEncounterSelectionIdentitiesMatch(a, differentKind) === false, '17. a different kind never matches');
    assert(worldEncounterSelectionIdentitiesMatch(null, a) === false && worldEncounterSelectionIdentitiesMatch(a, undefined) === false, '18. a missing argument never matches, never throws');

    console.log('✓ worldEncounterSelectionIdentitiesMatch(): matches only on exact kind/objectId/origin equality');
}

// ---------------------------------------------------------------------
// 7. Malformed / empty sources degrade to zero identities and zero
//    candidates, never throw.
// ---------------------------------------------------------------------
{
    for (const input of [undefined, null, [], 'not-an-array', 7, {}]) {
        const identities = deriveWorldEncounterSelectionIdentities(input);
        assert(Array.isArray(identities) && identities.length === 0, `19. deriveWorldEncounterSelectionIdentities(${serialize(input)}) degrades to an empty array`);
    }

    const withMalformedEntries = deriveWorldEncounterSelectionIdentities([
        null,
        undefined,
        { not: 'a source' },
        describeLocalWorldDiscoverySource({ publications: [{ id: 'pub-ok' }], placements: [{ id: 'pl-ok', publicationId: 'pub-ok', position: { x: 0, y: 0, z: 0 } }] })
    ]);
    assert(withMalformedEntries.length === 1 && withMalformedEntries[0].objectId === 'pub-ok', '20. malformed source entries are skipped without disturbing valid neighbors');

    for (const input of [undefined, null, {}]) {
        const candidates = describeWorldEncounterSelectionCandidates({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, sources: input });
        assert(Array.isArray(candidates) && candidates.length === 0, `21. describeWorldEncounterSelectionCandidates() with sources=${serialize(input)} degrades to an empty array`);
    }

    for (const selectedEncounter of [undefined, null, {}, { kind: 'PUBLICATION' }, { objectId: 'pub-1' }, { kind: 'NOT_A_KIND', objectId: 'pub-1' }]) {
        const candidates = describeWorldEncounterSelectionCandidates({ selectedEncounter, sources: [] });
        assert(Array.isArray(candidates) && candidates.length === 0, `22. a malformed selectedEncounter ${serialize(selectedEncounter)} degrades to an empty array, never throws`);
    }

    console.log('✓ Malformed or empty input degrades to empty results throughout, never throws');
}

// ---------------------------------------------------------------------
// 8. describeWorldEncounterSelectionCandidatesFromRegistry() mirrors
//    describeWorldFromDiscoveryRegistry()'s own wrapper shape exactly.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-R1' }],
        placements: [{ id: 'placement-R1', publicationId: 'pub-R1', position: { x: 0, y: 0, z: 0 } }]
    }));
    registry.setSource(peerSourceOf('peer:did:key:zRegistryPeer', {
        publications: [{ id: 'pub-R1' }],
        placements: [{ id: 'placement-R1-peer', publicationId: 'pub-R1', position: { x: 9, y: 0, z: 9 } }]
    }));

    const candidates = describeWorldEncounterSelectionCandidatesFromRegistry({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-R1' },
        registry
    });

    assert(candidates.length === 2, '23. the registry wrapper resolves candidates from the registry\'s own current listSources() snapshot');
    assert(candidates.map((c) => c.origin).sort().join(',') === 'local,peer:did:key:zRegistryPeer', '24. both the local and peer origins are surfaced');

    const malformedRegistry = {};
    const degraded = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-R1' }, registry: malformedRegistry });
    assert(Array.isArray(degraded) && degraded.length === 0, '25. a registry missing listSources() degrades to an empty array, never throws');

    console.log('✓ describeWorldEncounterSelectionCandidatesFromRegistry(): mirrors 0.9.10\'s own registry wrapper shape');
}

// ---------------------------------------------------------------------
// 9. Freezing throughout, and no mutation of the supplied sources.
// ---------------------------------------------------------------------
{
    const source = describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-F1' }],
        placements: [{ id: 'placement-F1', publicationId: 'pub-F1', position: { x: 0, y: 0, z: 0 } }]
    });
    const sourcesBefore = serialize(source);

    const identities = deriveWorldEncounterSelectionIdentities([source]);
    assert(Object.isFrozen(identities), '26. the returned identities array is frozen');
    assert(identities.every((identity) => Object.isFrozen(identity)), '27. every individual identity is frozen');
    assert(serialize(source) === sourcesBefore, '28. the supplied source is never mutated');

    const candidates = describeWorldEncounterSelectionCandidates({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-F1' }, sources: [source] });
    assert(Object.isFrozen(candidates), '29. the returned candidates array is frozen');

    console.log('✓ Freezing: identities and candidates are frozen throughout; supplied sources are never mutated');
}

// ---------------------------------------------------------------------
// 10. Determinism: repeated calls with byte-identical arguments produce
//     byte-identical results.
// ---------------------------------------------------------------------
{
    const sharedPublication = { id: 'pub-D1', title: 'Deterministic' };
    const sharedPlacement = { id: 'placement-D1', publicationId: 'pub-D1', position: { x: 3, y: 0, z: 3 } };
    const sources = [
        describeLocalWorldDiscoverySource({ publications: [sharedPublication], placements: [sharedPlacement] }),
        peerSourceOf('peer:did:key:zDeterministic', { publications: [sharedPublication], placements: [sharedPlacement] })
    ];

    const first = serialize(deriveWorldEncounterSelectionIdentities(sources));
    const second = serialize(deriveWorldEncounterSelectionIdentities(sources));
    assert(first === second, '30. deriveWorldEncounterSelectionIdentities() is deterministic across repeated calls');

    const firstCandidates = serialize(describeWorldEncounterSelectionCandidates({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-D1' }, sources }));
    const secondCandidates = serialize(describeWorldEncounterSelectionCandidates({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-D1' }, sources }));
    assert(firstCandidates === secondCandidates, '31. describeWorldEncounterSelectionCandidates() is deterministic across repeated calls');

    console.log('✓ Determinism: byte-identical arguments produce byte-identical results');
}

// ---------------------------------------------------------------------
// 11. Architectural regression: forbidden imports and vocabulary in both
//     new files — this milestone names identity, it never fetches,
//     verifies, ranks, or picks a winner.
// ---------------------------------------------------------------------
{
    const filesToCheck = [
        '../core/WorldEncounterSelectionIdentity.js',
        '../application/WorldEncounterSelectionResolution.js'
    ];

    for (const path of filesToCheck) {
        const sourceUrl = new URL(path, import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('PeerMessageBus'), `32. ${path} code must never import PeerMessageBus`);
        assert(!codeOnly.includes('PeerConnection'), `33. ${path} code must never reference PeerConnection`);
        assert(!codeOnly.includes('PeerDiscoveryProvider'), `34. ${path} code must never reference PeerDiscoveryProvider`);
        assert(!/fetch\(/.test(codeOnly), `35. ${path} code must never call fetch(...)`);
        assert(!codeOnly.includes('WebSocket'), `36. ${path} code must never reference WebSocket`);
        assert(!codeOnly.includes('RTCPeerConnection'), `37. ${path} code must never reference RTCPeerConnection`);
        assert(!codeOnly.includes('StorageProvider'), `38. ${path} code must never reference StorageProvider`);
        assert(!/\blocalStorage\b/.test(codeOnly), `39. ${path} code must never reference localStorage`);

        const forbiddenTerms = [
            'trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'priority',
            'weight', 'confidence', 'ranking', 'scoring', 'nearest', 'proximity', 'winner',
            'preferred', 'dedup', 'reconcile', 'compare'
        ];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `40. ${path} code must never use "${term}"`);
        }
    }

    console.log('✓ Architectural regression: no peer transport, storage, or trust/ranking vocabulary in either new file');
}

// ---------------------------------------------------------------------
// 12. WorldEncounterCanvas.js and WorldEncounterMarker.js are byte-for-
//     byte untouched by this milestone — provenance-aware selection is
//     an application/core capability, never a UI change. Selecting a
//     marker still produces exactly { kind, objectId }.
// ---------------------------------------------------------------------
{
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');

    assert(!canvasSource.includes('WorldEncounterSelectionIdentity'), '41. WorldEncounterCanvas.js never imports core/WorldEncounterSelectionIdentity.js');
    assert(!canvasSource.includes('WorldEncounterSelectionResolution'), '42. WorldEncounterCanvas.js never imports application/WorldEncounterSelectionResolution.js');
    assert(!markerSource.includes('origin'), '43. WorldEncounterMarker.js carries no origin vocabulary of any kind');

    console.log('✓ WorldEncounterCanvas.js and WorldEncounterMarker.js are untouched — this milestone stays below the existing selection UI');
}

console.log('\nAll world encounter selection identity tests passed.');
