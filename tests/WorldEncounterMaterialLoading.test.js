import { readFile } from 'node:fs/promises';
import {
    loadWorldEncounterMaterial,
    WorldEncounterMaterialLoadStatus,
    WorldEncounterMaterialSource
} from '../application/WorldEncounterMaterialLoading.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

class FakeMaterialSource extends WorldEncounterMaterialSource {
    constructor(materialByObjectId = {}) {
        super();
        this.materialByObjectId = materialByObjectId;
        this.calls = [];
    }

    async load(resolvedSelection) {
        this.calls.push(resolvedSelection);
        const material = this.materialByObjectId[resolvedSelection.objectId];
        return typeof material === 'undefined' ? null : material;
    }
}

const localSelection = Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' });
const peerSelection = Object.freeze({ kind: 'AVATAR', objectId: 'avatar-1', origin: 'peer:did:key:zPeerA' });

// ---------------------------------------------------------------------
// 1. Flagship: a registered source that has the material resolves to
//    AVAILABLE; the exact same call with no registered source resolves
//    to UNAVAILABLE — the two-way split this milestone exists to hold.
// ---------------------------------------------------------------------
{
    const localSource = new FakeMaterialSource({ 'pub-1': { title: 'Hello World' } });

    const available = await loadWorldEncounterMaterial({
        resolvedSelection: localSelection,
        materialSources: { local: localSource }
    });
    assert(available.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '1. FLAGSHIP — a source that has the material resolves to AVAILABLE');
    assert(available.resolvedSelection === localSelection, '2. FLAGSHIP — resolvedSelection is forwarded by reference, never copied');
    assert(serialize(available.material) === serialize({ title: 'Hello World' }), '3. FLAGSHIP — material is forwarded verbatim from the source');

    const unavailable = await loadWorldEncounterMaterial({
        resolvedSelection: localSelection,
        materialSources: {}
    });
    assert(unavailable.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '4. FLAGSHIP — no registered source for the resolved origin resolves to UNAVAILABLE');
    assert(unavailable.material === null, '5. FLAGSHIP — UNAVAILABLE never carries material');
    assert(unavailable.resolvedSelection === localSelection, '6. FLAGSHIP — UNAVAILABLE still carries the resolvedSelection it was given, origin included');

    console.log('✓ Flagship: a registered source resolves AVAILABLE, an unregistered origin resolves UNAVAILABLE');
}

// ---------------------------------------------------------------------
// 2. Origin decides the slot — local vs. peer, never guessed, never
//    falling back from one slot to the other.
// ---------------------------------------------------------------------
{
    const localSource = new FakeMaterialSource({ 'pub-1': { title: 'Local Material' } });
    const peerSource = new FakeMaterialSource({ 'avatar-1': { displayName: 'Peer Avatar' } });

    const localResult = await loadWorldEncounterMaterial({
        resolvedSelection: localSelection,
        materialSources: { local: localSource, peer: peerSource }
    });
    assert(localResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '7. a local-origin selection dispatches to materialSources.local');
    assert(peerSource.calls.length === 0, '8. a local-origin selection never calls the peer source');

    const peerResult = await loadWorldEncounterMaterial({
        resolvedSelection: peerSelection,
        materialSources: { local: localSource, peer: peerSource }
    });
    assert(peerResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '9. a peer-origin selection dispatches to materialSources.peer');
    assert(localSource.calls.length === 1, '10. the peer-origin call above never re-invoked the local source');

    const noFallback = await loadWorldEncounterMaterial({
        resolvedSelection: peerSelection,
        materialSources: { local: localSource }
    });
    assert(noFallback.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '11. a peer-origin selection with only materialSources.local registered never falls back to it — UNAVAILABLE');

    console.log('✓ Origin decides the slot: local vs. peer, no cross-slot fallback of any kind');
}

// ---------------------------------------------------------------------
// 3. A source that does not have the material returns UNAVAILABLE,
//    never a thrown error, and resolvedSelection still survives.
// ---------------------------------------------------------------------
{
    const source = new FakeMaterialSource({});
    const result = await loadWorldEncounterMaterial({
        resolvedSelection: localSelection,
        materialSources: { local: source }
    });
    assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '12. a registered source resolving to null classifies as UNAVAILABLE');
    assert(result.resolvedSelection === localSelection, '13. resolvedSelection still survives an UNAVAILABLE result from a real source');
    assert(source.calls.length === 1, '14. the source was actually asked, exactly once');

    console.log('✓ A source with no matching material degrades to UNAVAILABLE, never throws');
}

// ---------------------------------------------------------------------
// 4. Malformed / missing input degrades to UNAVAILABLE with a null
//    resolvedSelection, never throws.
// ---------------------------------------------------------------------
{
    const materialSources = { local: new FakeMaterialSource({ 'pub-1': { title: 'x' } }) };

    for (const resolvedSelection of [undefined, null, {}, { kind: 'PUBLICATION' }, { kind: 'PUBLICATION', objectId: 'pub-1' }, { kind: 'NOT_A_KIND', objectId: 'pub-1', origin: 'local' }]) {
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources });
        assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, `15. a malformed resolvedSelection ${serialize(resolvedSelection)} degrades to UNAVAILABLE, never throws`);
        assert(result.resolvedSelection === null, `16. a malformed resolvedSelection ${serialize(resolvedSelection)} carries a null resolvedSelection in the result`);
    }

    const noSourcesAtAll = await loadWorldEncounterMaterial({ resolvedSelection: localSelection });
    assert(noSourcesAtAll.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '17. a missing materialSources argument degrades to UNAVAILABLE');

    const noArgsAtAll = await loadWorldEncounterMaterial();
    assert(noArgsAtAll.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '18. calling with no arguments at all degrades to UNAVAILABLE, never throws');

    console.log('✓ Malformed or missing input degrades to UNAVAILABLE throughout, never throws');
}

// ---------------------------------------------------------------------
// 5. A source missing a load() method is treated the same as no source
//    at all — never throws.
// ---------------------------------------------------------------------
{
    const result = await loadWorldEncounterMaterial({
        resolvedSelection: localSelection,
        materialSources: { local: {} }
    });
    assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '19. a materialSources.local without a load() method degrades to UNAVAILABLE, never throws');

    console.log('✓ A malformed material source degrades to UNAVAILABLE, never throws');
}

// ---------------------------------------------------------------------
// 6. The base WorldEncounterMaterialSource contract throws when called
//    directly — it is a contract, never a silent no-op implementation.
// ---------------------------------------------------------------------
{
    const base = new WorldEncounterMaterialSource();
    let threw = false;
    try {
        base.load(localSelection);
    } catch (error) {
        threw = true;
    }
    assert(threw, '20. WorldEncounterMaterialSource.load() throws when not overridden by a subclass');

    console.log('✓ The base WorldEncounterMaterialSource contract throws when not implemented');
}

// ---------------------------------------------------------------------
// 7. No caching: two calls against the same selection and source each
//    invoke the source's own load() again.
// ---------------------------------------------------------------------
{
    const source = new FakeMaterialSource({ 'pub-1': { title: 'Fresh Every Time' } });
    await loadWorldEncounterMaterial({ resolvedSelection: localSelection, materialSources: { local: source } });
    await loadWorldEncounterMaterial({ resolvedSelection: localSelection, materialSources: { local: source } });
    assert(source.calls.length === 2, '21. no caching layer — the same selection calls load() again on a second request');

    console.log('✓ No caching: repeated calls invoke the source again every time');
}

// ---------------------------------------------------------------------
// 8. Both encounter kinds are handled identically — PUBLICATION and
//    AVATAR are never special-cased or merged into a third shape.
// ---------------------------------------------------------------------
{
    const publicationSelection = Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-2', origin: 'local' });
    const avatarSelection = Object.freeze({ kind: 'AVATAR', objectId: 'avatar-2', origin: 'local' });
    const source = new FakeMaterialSource({ 'pub-2': { title: 'A Publication' }, 'avatar-2': { displayName: 'An Avatar' } });

    const publicationResult = await loadWorldEncounterMaterial({ resolvedSelection: publicationSelection, materialSources: { local: source } });
    const avatarResult = await loadWorldEncounterMaterial({ resolvedSelection: avatarSelection, materialSources: { local: source } });

    assert(publicationResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE && publicationResult.resolvedSelection.kind === 'PUBLICATION', '22. a PUBLICATION selection loads and forwards its own kind unchanged');
    assert(avatarResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE && avatarResult.resolvedSelection.kind === 'AVATAR', '23. an AVATAR selection loads and forwards its own kind unchanged, through the exact same dispatch path');

    console.log('✓ PUBLICATION and AVATAR are dispatched identically, kind forwarded unchanged');
}

// ---------------------------------------------------------------------
// 9. Freezing.
// ---------------------------------------------------------------------
{
    const source = new FakeMaterialSource({ 'pub-1': { title: 'Frozen' } });
    const available = await loadWorldEncounterMaterial({ resolvedSelection: localSelection, materialSources: { local: source } });
    assert(Object.isFrozen(available), '24. an AVAILABLE result object is frozen');

    const unavailable = await loadWorldEncounterMaterial({ resolvedSelection: localSelection, materialSources: {} });
    assert(Object.isFrozen(unavailable), '25. an UNAVAILABLE result object is frozen');

    console.log('✓ Every result object is frozen');
}

// ---------------------------------------------------------------------
// 10. Architectural regression: forbidden imports and vocabulary.
// ---------------------------------------------------------------------
{
    const path = '../application/WorldEncounterMaterialLoading.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('PeerMessageBus'), '26. never imports PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), '27. never references PeerConnection');
    assert(!/fetch\(/.test(codeOnly), '28. never calls fetch(...)');
    assert(!codeOnly.includes('WebSocket'), '29. never references WebSocket');
    assert(!/\blocalStorage\b/.test(codeOnly), '30. never references localStorage');
    assert(!codeOnly.includes('StorageProvider'), '31. never imports StorageProvider');

    const forbiddenTerms = [
        'trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority',
        'weight', 'confidence', 'ranking', 'scoring', 'signature'
    ];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `32. code must never use "${term}" — no trust/verification vocabulary at this boundary`);
    }

    assert(!codeOnly.includes("from '../ui/"), '33. never imports from ui/');

    console.log('✓ Architectural regression: no peer transport, storage, or trust/verification vocabulary');
}

console.log('\nAll WorldEncounterMaterialLoading tests passed.');
