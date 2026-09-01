import { readFile } from 'node:fs/promises';
import { loadWorldEncounterMaterialFromResolvedLead } from '../application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js';
import { DecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialSource.js';
import {
    loadWorldEncounterMaterial,
    WorldEncounterMaterialLoadStatus,
    WorldEncounterMaterialSource
} from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.34 — Lead-Aware Decentralized Material Loading Boundary.
// See docs/Roadmap.md, "0.9.34 — Lead-Aware Decentralized Material Loading Boundary."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function selectionOf({ kind, objectId, origin = 'decentralized:nostr' } = {}) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri, origin = 'https://relay.example.com', discoveryTag = 'forkbuild_random_unique', storage = null } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

class FakeDecentralizedSource extends WorldEncounterMaterialSource {
    constructor(materialByUri = {}) {
        super();
        this.materialByUri = materialByUri;
        this.calls = [];
    }

    async load(resolvedSelection, resolvedLead) {
        this.calls.push({ resolvedSelection, resolvedLead });
        const material = this.materialByUri[resolvedLead && resolvedLead.uri];
        return typeof material === 'undefined' ? null : material;
    }
}

// ---------------------------------------------------------------------
// 1. Flagship: a resolved selection plus a resolved lead retrieves
//    material through materialSources.decentralized, forwarding both
//    inputs verbatim.
// ---------------------------------------------------------------------
{
    const material = { id: 'pub-1', title: 'A Decentralized Publication' };
    const source = new FakeDecentralizedSource({ 'ar://tx-abc123': material });
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123', storage: 'ar' });

    const result = await loadWorldEncounterMaterialFromResolvedLead({
        resolvedSelection,
        resolvedLead,
        materialSources: { decentralized: source }
    });

    assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '1. FLAGSHIP — a registered decentralized source that has the material resolves to AVAILABLE');
    assert(result.resolvedSelection === resolvedSelection, '2. FLAGSHIP — resolvedSelection is forwarded by reference, never copied');
    assert(result.resolvedLead === resolvedLead, '3. FLAGSHIP — resolvedLead is forwarded by reference, never copied');
    assert(serialize(result.material) === serialize(material), '4. FLAGSHIP — material is forwarded verbatim from the source');
    assert(source.calls.length === 1 && source.calls[0].resolvedSelection === resolvedSelection && source.calls[0].resolvedLead === resolvedLead, '5. FLAGSHIP — the source is called with exactly the two supplied inputs');

    console.log('✓ Flagship: resolvedSelection + resolvedLead retrieves material via materialSources.decentralized');
}

// ---------------------------------------------------------------------
// 2. origin (discovery provenance) and uri (material provenance) stay
//    separate all the way through the result — routing never reads
//    resolvedSelection.origin or resolvedLead.origin.
// ---------------------------------------------------------------------
{
    const material = { id: 'pub-1' };
    const source = new FakeDecentralizedSource({ 'ar://tx-abc123': material });

    // A resolvedSelection.origin that names neither 'local' nor 'peer:...'
    // — nothing this boundary would ever route through 0.9.21's own
    // materialSourceFor() — still resolves here, because routing never
    // consults it.
    for (const origin of ['https://relay.example.com', 'nostr:npub1somekey', 'anything-at-all']) {
        const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin });
        const resolvedLead = leadOf({ uri: 'ar://tx-abc123', origin: 'https://relay.example.com' });
        const result = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: source } });
        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `6. a resolvedSelection.origin of "${origin}" never blocks routing to materialSources.decentralized`);
    }

    // A resolvedLead whose own origin equals the discovery service, never
    // treated as if it named the storage backend or the uri.
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123', origin: 'https://relay.example.com', storage: 'ar' });
    const result = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: source } });
    assert(result.resolvedLead.origin === 'https://relay.example.com' && result.resolvedLead.uri === 'ar://tx-abc123', '7. resolvedLead.origin and resolvedLead.uri both survive, distinct, in the result');

    console.log('✓ Discovery provenance (origin) and material provenance (uri) never collapse into one routing fact');
}

// ---------------------------------------------------------------------
// 3. materialSources.local and materialSources.peer are never read, even
//    when they are present and would have resolved something.
// ---------------------------------------------------------------------
{
    const decentralizedMaterial = { id: 'pub-1', via: 'decentralized' };
    const decentralizedSource = new FakeDecentralizedSource({ 'ar://tx-abc123': decentralizedMaterial });

    let localCalls = 0;
    let peerCalls = 0;
    const localSource = new WorldEncounterMaterialSource();
    localSource.load = async () => { localCalls++; return { via: 'local' }; };
    const peerSource = new WorldEncounterMaterialSource();
    peerSource.load = async () => { peerCalls++; return { via: 'peer' }; };

    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'local' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });

    const result = await loadWorldEncounterMaterialFromResolvedLead({
        resolvedSelection,
        resolvedLead,
        materialSources: { local: localSource, peer: peerSource, decentralized: decentralizedSource }
    });

    assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE && serialize(result.material) === serialize(decentralizedMaterial), '8. only materialSources.decentralized is ever consulted, regardless of resolvedSelection.origin');
    assert(localCalls === 0, '9. materialSources.local is never called by this boundary');
    assert(peerCalls === 0, '10. materialSources.peer is never called by this boundary');

    console.log('✓ Only materialSources.decentralized is ever read; .local and .peer are ignored entirely');
}

// ---------------------------------------------------------------------
// 4. Malformed / missing resolvedSelection or resolvedLead degrades to
//    UNAVAILABLE, and the source is never even called for either.
// ---------------------------------------------------------------------
{
    let calls = 0;
    const source = new FakeDecentralizedSource();
    source.load = async () => { calls++; return { ok: true }; };
    const validLead = leadOf({ uri: 'ar://tx-abc123' });

    for (const resolvedSelection of [undefined, null, {}, { kind: WorldEncounterKind.PUBLICATION }, { kind: 'NOT_A_KIND', objectId: 'pub-1', origin: 'x' }]) {
        const result = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead: validLead, materialSources: { decentralized: source } });
        assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, `11. a malformed resolvedSelection ${serialize(resolvedSelection)} degrades to UNAVAILABLE`);
        assert(result.resolvedSelection === null, `12. a malformed resolvedSelection ${serialize(resolvedSelection)} carries a null resolvedSelection in the result`);
        assert(result.resolvedLead === null, `13. a malformed resolvedSelection ${serialize(resolvedSelection)} carries a null resolvedLead too — nothing to name`);
    }
    assert(calls === 0, '14. the decentralized source is never called when resolvedSelection is malformed');

    const validSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    for (const resolvedLead of [undefined, null, {}, { uri: '' }, { uri: 123 }, 'ar://not-an-object']) {
        const result = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection: validSelection, resolvedLead, materialSources: { decentralized: source } });
        assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, `15. a malformed resolvedLead ${serialize(resolvedLead)} degrades to UNAVAILABLE`);
        assert(result.resolvedSelection === validSelection, `16. a malformed resolvedLead ${serialize(resolvedLead)} still carries the well-formed resolvedSelection in the result`);
        assert(result.resolvedLead === null, `17. a malformed resolvedLead ${serialize(resolvedLead)} carries a null resolvedLead — nothing to name`);
    }
    assert(calls === 0, '18. the decentralized source is never called when resolvedLead carries no usable uri');

    console.log('✓ Malformed selections and leads degrade to UNAVAILABLE; the source is never called for either');
}

// ---------------------------------------------------------------------
// 5. A well-formed selection and lead with no registered decentralized
//    source, or a source resolving to nothing, both degrade to
//    UNAVAILABLE while still carrying the real inputs.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });

    const noSource = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: {} });
    assert(noSource.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '19. no registered materialSources.decentralized resolves to UNAVAILABLE');
    assert(noSource.resolvedSelection === resolvedSelection && noSource.resolvedLead === resolvedLead, '20. UNAVAILABLE from a missing source still carries the real resolvedSelection and resolvedLead');

    const noSourcesAtAll = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead });
    assert(noSourcesAtAll.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '21. a missing materialSources argument entirely degrades to UNAVAILABLE');

    const malformedSource = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: {} } });
    assert(malformedSource.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '22. a materialSources.decentralized without a load() method degrades to UNAVAILABLE, never throws');

    const emptySource = new FakeDecentralizedSource({});
    const empty = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: emptySource } });
    assert(empty.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '23. a registered source resolving to null classifies as UNAVAILABLE');
    assert(empty.resolvedSelection === resolvedSelection && empty.resolvedLead === resolvedLead, '24. resolvedSelection and resolvedLead both survive an UNAVAILABLE result from a real source');
    assert(emptySource.calls.length === 1, '25. the source was actually asked, exactly once');

    const noArgsAtAll = await loadWorldEncounterMaterialFromResolvedLead();
    assert(noArgsAtAll.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '26. calling with no arguments at all degrades to UNAVAILABLE, never throws');

    console.log('✓ A missing/empty/malformed source all degrade to UNAVAILABLE while preserving real inputs where honest');
}

// ---------------------------------------------------------------------
// 6. Material is forwarded unverified, and a rejection from the source
//    propagates rather than being swallowed.
// ---------------------------------------------------------------------
{
    const signedMaterial = Object.freeze({
        id: 'pub-signed',
        title: 'Signed',
        signature: { algorithm: 'Ed25519', signer: 'not-a-real-signer', signature: 'not-a-real-signature' }
    });
    const source = new FakeDecentralizedSource({ 'ar://tx-signed': signedMaterial });
    const result = await loadWorldEncounterMaterialFromResolvedLead({
        resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-signed' }),
        resolvedLead: leadOf({ uri: 'ar://tx-signed' }),
        materialSources: { decentralized: source }
    });
    assert(result.material === signedMaterial, '27. a signed material object is forwarded exactly as the source returned it, unverified');

    const failingSource = new WorldEncounterMaterialSource();
    failingSource.load = async () => { throw new Error('network unreachable'); };
    let rejected = false;
    try {
        await loadWorldEncounterMaterialFromResolvedLead({
            resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' }),
            resolvedLead: leadOf({ uri: 'ar://tx-abc123' }),
            materialSources: { decentralized: failingSource }
        });
    } catch {
        rejected = true;
    }
    assert(rejected, '28. a rejection from materialSources.decentralized propagates to the caller, never swallowed as UNAVAILABLE');

    console.log('✓ Material is forwarded unverified; a source rejection is never swallowed');
}

// ---------------------------------------------------------------------
// 7. Works directly with a real DecentralizedWorldEncounterMaterialSource
//    (0.9.33) as materialSources.decentralized, and is not reachable
//    through the unmodified 0.9.21 boundary on its own.
// ---------------------------------------------------------------------
{
    const material = { id: 'pub-1' };
    const realSource = new DecentralizedWorldEncounterMaterialSource(async (uri) => (uri === 'ar://tx-abc123' ? material : null));
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'decentralized:nostr' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });

    const result = await loadWorldEncounterMaterialFromResolvedLead({
        resolvedSelection,
        resolvedLead,
        materialSources: { decentralized: realSource }
    });
    assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE && result.material === material, '29. a real 0.9.33 DecentralizedWorldEncounterMaterialSource works as materialSources.decentralized here');

    const throughOldBoundary = await loadWorldEncounterMaterial({
        resolvedSelection,
        materialSources: { decentralized: realSource }
    });
    assert(throughOldBoundary.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '30. the unmodified 0.9.21 loadWorldEncounterMaterial() still never routes to a decentralized slot on its own');

    console.log('✓ Works with a real 0.9.33 source; the unmodified 0.9.21 boundary still never reaches it on its own');
}

// ---------------------------------------------------------------------
// 8. Freezing.
// ---------------------------------------------------------------------
{
    const source = new FakeDecentralizedSource({ 'ar://tx-abc123': { title: 'Frozen' } });
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });

    const available = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: source } });
    assert(Object.isFrozen(available), '31. an AVAILABLE result object is frozen');

    const unavailable = await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: {} });
    assert(Object.isFrozen(unavailable), '32. an UNAVAILABLE result object is frozen');

    console.log('✓ Every result object is frozen');
}

// ---------------------------------------------------------------------
// 9. No caching: two calls against the same inputs and source each
//    invoke the source's own load() again.
// ---------------------------------------------------------------------
{
    const source = new FakeDecentralizedSource({ 'ar://tx-abc123': { title: 'Fresh Every Time' } });
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });

    await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: source } });
    await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources: { decentralized: source } });
    assert(source.calls.length === 2, '33. no caching layer — the same inputs call load() again on a second request');

    console.log('✓ No caching: repeated calls invoke the source again every time');
}

// ---------------------------------------------------------------------
// 10. Architectural regression: no rediscovery, no lead resolution, no
//     concrete decentralized backend, no trust/storage-routing
//     vocabulary, and the 0.9.21 boundary file is never modified.
// ---------------------------------------------------------------------
{
    const path = '../application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadResolution'), '34. never imports the 0.9.28 lead resolution boundary');
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), '35. never imports the 0.9.26 lead registry');
    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAssociation'), '36. never imports the 0.9.28/0.9.32 lead association modules');
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryQuery'), '37. never imports the 0.9.25 discovery query adapter');
    assert(!codeOnly.includes('DecentralizedWorldEncounterMaterialSource'), '38. never imports or constructs the concrete 0.9.33 source — one is only ever injected via materialSources.decentralized');
    assert(!codeOnly.includes('ContentReference'), '39. never constructs or imports a ContentReference');
    assert(!/fetch\(/.test(codeOnly), '40. never calls fetch(...) directly');
    assert(!codeOnly.includes('WebSocket'), '41. never references WebSocket directly');
    assert(!codeOnly.includes('PeerMessageBus') && !codeOnly.includes('PeerConnection'), '42. never references any peer transport');
    assert(!/\bresolvedSelection\.origin\b/.test(codeOnly), '43. never reads resolvedSelection.origin for routing');
    assert(!/\bresolvedLead\.origin\b/.test(codeOnly) && !/\bresolvedLead\.storage\b/.test(codeOnly), '44. never reads resolvedLead.origin or resolvedLead.storage — a lead is opaque beyond its own uri here too');

    const forbiddenTerms = ['trusted', 'trust(', 'reputation', 'verify(', 'authority', 'weight', 'confidence', 'ranking', 'scoring', 'signature'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `45. code must never use "${term}" — no trust/verification vocabulary at this boundary`);
    }

    const loadingBoundarySource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
    assert(!loadingBoundarySource.includes('DecentralizedWorldEncounterLeadAwareMaterialLoading'), '46. the 0.9.21 loading boundary itself is never modified to know about this file');
    assert(!loadingBoundarySource.includes('resolvedLead'), '47. the 0.9.21 loading boundary gains no resolvedLead parameter of its own');

    console.log('✓ Architectural regression: no rediscovery, no concrete backend, no origin/storage-based routing, no trust vocabulary; 0.9.21 boundary untouched');
}

console.log('\nAll DecentralizedWorldEncounterLeadAwareMaterialLoading tests passed.');
