import { readFile } from 'node:fs/promises';
import {
    describeWorldEncounterSelectionOutcome,
    describeWorldEncounterSelectionOutcomeFromRegistry,
    WorldEncounterSelectionOutcomeStatus
} from '../application/WorldEncounterSelectionOutcome.js';
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
// 1. Flagship: zero / one / many candidates classify as UNAVAILABLE /
//    RESOLVED / AMBIGUOUS respectively — the exact three-way split
//    0.9.20's own task description named.
// ---------------------------------------------------------------------
{
    const sharedPublication = { id: 'pub-shared', title: 'Shared' };
    const sharedPlacement = { id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } };

    const localSource = describeLocalWorldDiscoverySource({ publications: [sharedPublication], placements: [sharedPlacement] });
    const peerASource = peerSourceOf('peer:did:key:zPeerA', { publications: [sharedPublication], placements: [sharedPlacement] });
    const peerBSource = peerSourceOf('peer:did:key:zPeerB', { publications: [sharedPublication], placements: [sharedPlacement] });

    const zero = describeWorldEncounterSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-does-not-exist' },
        sources: [localSource]
    });
    assert(zero.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '1. FLAGSHIP — zero candidates classify as UNAVAILABLE');
    assert(zero.resolvedSelection === null, '2. FLAGSHIP — UNAVAILABLE never carries a resolvedSelection');
    assert(Array.isArray(zero.candidates) && zero.candidates.length === 0, '3. FLAGSHIP — UNAVAILABLE still carries the (empty) candidates array');

    const one = describeWorldEncounterSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-shared' },
        sources: [localSource]
    });
    assert(one.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '4. FLAGSHIP — one candidate classifies as RESOLVED');
    assert(serialize(one.resolvedSelection) === serialize({ kind: 'PUBLICATION', objectId: 'pub-shared', origin: 'local' }), '5. FLAGSHIP — RESOLVED carries the one candidate as resolvedSelection, verbatim');
    assert(one.candidates.length === 1, '6. FLAGSHIP — RESOLVED carries exactly the one candidate in its own candidates array too');

    const many = describeWorldEncounterSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-shared' },
        sources: [localSource, peerASource, peerBSource]
    });
    assert(many.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, '7. FLAGSHIP — three candidates classify as AMBIGUOUS');
    assert(many.resolvedSelection === null, '8. FLAGSHIP — AMBIGUOUS never guesses a resolvedSelection, even with a genuine three-way tie');
    assert(many.candidates.length === 3, '9. FLAGSHIP — AMBIGUOUS carries every candidate, never a trimmed subset');
    assert(many.candidates.map((c) => c.origin).join(',') === 'local,peer:did:key:zPeerA,peer:did:key:zPeerB', '10. FLAGSHIP — AMBIGUOUS candidates preserve source order');

    console.log('✓ Flagship: zero/one/many candidates classify as UNAVAILABLE/RESOLVED/AMBIGUOUS');
}

// ---------------------------------------------------------------------
// 2. AMBIGUOUS never resolves regardless of candidate content — no
//    hidden "prefer local," "prefer the first," or "prefer the most
//    recent" rule anywhere in this file.
// ---------------------------------------------------------------------
{
    const publication = { id: 'pub-tiebreak', title: 'Tiebreak' };
    const placement = { id: 'placement-tiebreak', publicationId: 'pub-tiebreak', position: { x: 0, y: 0, z: 0 } };

    const forwardOrder = describeWorldEncounterSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-tiebreak' },
        sources: [
            describeLocalWorldDiscoverySource({ publications: [publication], placements: [placement] }),
            peerSourceOf('peer:did:key:zLast', { publications: [publication], placements: [placement] })
        ]
    });
    const reverseOrder = describeWorldEncounterSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-tiebreak' },
        sources: [
            peerSourceOf('peer:did:key:zLast', { publications: [publication], placements: [placement] }),
            describeLocalWorldDiscoverySource({ publications: [publication], placements: [placement] })
        ]
    });

    assert(forwardOrder.resolvedSelection === null && reverseOrder.resolvedSelection === null, '11. resolvedSelection stays null under AMBIGUOUS regardless of which origin appears first');
    assert(forwardOrder.candidates[0].origin === 'local' && reverseOrder.candidates[0].origin === 'peer:did:key:zLast', '12. candidate ORDER still reflects source order — only resolvedSelection is withheld, not the list itself');

    console.log('✓ AMBIGUOUS never resolves — no "prefer local" or "prefer first" rule of any kind');
}

// ---------------------------------------------------------------------
// 3. Malformed / empty input degrades to UNAVAILABLE, never throws.
// ---------------------------------------------------------------------
{
    for (const selectedEncounter of [undefined, null, {}, { kind: 'PUBLICATION' }, { objectId: 'pub-1' }, { kind: 'NOT_A_KIND', objectId: 'pub-1' }]) {
        const outcome = describeWorldEncounterSelectionOutcome({ selectedEncounter, sources: [] });
        assert(outcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, `13. a malformed selectedEncounter ${serialize(selectedEncounter)} degrades to UNAVAILABLE, never throws`);
    }
    for (const sources of [undefined, null, [], 'not-an-array', 7, {}]) {
        const outcome = describeWorldEncounterSelectionOutcome({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, sources });
        assert(outcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, `14. malformed sources ${serialize(sources)} degrades to UNAVAILABLE, never throws`);
    }
    assert(describeWorldEncounterSelectionOutcome().status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '15. calling with no arguments at all degrades to UNAVAILABLE, never throws');

    console.log('✓ Malformed or empty input degrades to UNAVAILABLE throughout, never throws');
}

// ---------------------------------------------------------------------
// 4. describeWorldEncounterSelectionOutcomeFromRegistry() mirrors
//    describeWorldEncounterSelectionCandidatesFromRegistry()'s own
//    wrapper shape exactly.
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

    const outcome = describeWorldEncounterSelectionOutcomeFromRegistry({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-R1' },
        registry
    });
    assert(outcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, '16. the registry wrapper classifies from the registry\'s own current listSources() snapshot');
    assert(outcome.candidates.length === 2, '17. both the local and peer origins are surfaced as candidates');

    const singleRegistry = new WorldDiscoverySourceRegistry();
    singleRegistry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-R2' }],
        placements: [{ id: 'placement-R2', publicationId: 'pub-R2', position: { x: 0, y: 0, z: 0 } }]
    }));
    const resolved = describeWorldEncounterSelectionOutcomeFromRegistry({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-R2' },
        registry: singleRegistry
    });
    assert(resolved.status === WorldEncounterSelectionOutcomeStatus.RESOLVED && resolved.resolvedSelection.origin === 'local', '18. a single-source registry resolves automatically to that one origin');

    const malformedRegistry = {};
    const degraded = describeWorldEncounterSelectionOutcomeFromRegistry({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-R1' }, registry: malformedRegistry });
    assert(degraded.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '19. a registry missing listSources() degrades to UNAVAILABLE, never throws');

    console.log('✓ describeWorldEncounterSelectionOutcomeFromRegistry(): mirrors 0.9.19\'s own registry wrapper shape');
}

// ---------------------------------------------------------------------
// 5. Freezing and determinism.
// ---------------------------------------------------------------------
{
    const source = describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-F1' }],
        placements: [{ id: 'placement-F1', publicationId: 'pub-F1', position: { x: 0, y: 0, z: 0 } }]
    });

    const outcome = describeWorldEncounterSelectionOutcome({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-F1' }, sources: [source] });
    assert(Object.isFrozen(outcome), '20. the returned outcome object is frozen');

    const first = serialize(describeWorldEncounterSelectionOutcome({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-F1' }, sources: [source] }));
    const second = serialize(describeWorldEncounterSelectionOutcome({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-F1' }, sources: [source] }));
    assert(first === second, '21. describeWorldEncounterSelectionOutcome() is deterministic across repeated calls');

    console.log('✓ Freezing and determinism hold throughout');
}

// ---------------------------------------------------------------------
// 6. Architectural regression: forbidden imports and vocabulary.
// ---------------------------------------------------------------------
{
    const path = '../application/WorldEncounterSelectionOutcome.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('PeerMessageBus'), '22. never imports PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), '23. never references PeerConnection');
    assert(!/fetch\(/.test(codeOnly), '24. never calls fetch(...)');
    assert(!codeOnly.includes('WebSocket'), '25. never references WebSocket');
    assert(!/\blocalStorage\b/.test(codeOnly), '26. never references localStorage');
    assert(!codeOnly.includes("from '../core/"), '27. never imports a core/ module directly');

    const forbiddenTerms = [
        'trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'priority',
        'weight', 'confidence', 'ranking', 'scoring', 'nearest', 'proximity', 'winner',
        'preferred', 'dedup', 'reconcile', 'compare', '.find('
    ];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `28. code must never use "${term}" — no way to silently pick one candidate among several`);
    }

    console.log('✓ Architectural regression: no peer transport, storage, core/ import, or trust/ranking/picking vocabulary');
}

console.log('\nAll WorldEncounterSelectionOutcome tests passed.');
