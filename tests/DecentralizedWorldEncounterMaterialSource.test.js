import { readFile } from 'node:fs/promises';
import { DecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialSource, loadWorldEncounterMaterial } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.33 — Decentralized World Encounter Material Source.
// See docs/Roadmap.md, "0.9.33 — Decentralized World Encounter Material Source."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function selectionOf({ kind, objectId, origin = 'decentralized:nostr' }) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri, origin = 'nostr', discoveryTag = 'forkbuild', storage = null } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

// ---------------------------------------------------------------------
// 1. Flagship: a resolved selection plus a resolved lead retrieves
//    material through the injected resolver, called with the lead's own
//    uri and nothing else.
// ---------------------------------------------------------------------
{
    const calls = [];
    const material = { id: 'pub-1', title: 'A Decentralized Publication' };
    const resolveByUri = async (uri) => {
        calls.push(uri);
        return uri === 'ar://tx-abc123' ? material : null;
    };
    const source = new DecentralizedWorldEncounterMaterialSource(resolveByUri);

    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });

    const result = await source.load(resolvedSelection, resolvedLead);
    assert(result === material, '1. FLAGSHIP — a resolved lead\'s uri retrieves material through the injected resolver, forwarded unchanged');
    assert(calls.length === 1 && calls[0] === 'ar://tx-abc123', '2. FLAGSHIP — the resolver is called with exactly the resolved lead\'s own uri');

    console.log('✓ Flagship: resolvedSelection + resolvedLead retrieves material via the injected resolver');
}

// ---------------------------------------------------------------------
// 2. A resolver that resolves null/undefined for a uri means "not
//    currently available," never a throw.
// ---------------------------------------------------------------------
{
    const source = new DecentralizedWorldEncounterMaterialSource(async () => null);
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });

    const result = await source.load(resolvedSelection, leadOf({ uri: 'ar://missing' }));
    assert(result === null, '3. a resolver reporting no material at a uri resolves to null');

    const sourceUndefined = new DecentralizedWorldEncounterMaterialSource(async () => undefined);
    const resultUndefined = await sourceUndefined.load(resolvedSelection, leadOf({ uri: 'ipfs://missing' }));
    assert(resultUndefined === null, '4. a resolver resolving undefined also degrades to null');

    console.log('✓ A resolver reporting nothing at a uri degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 3. Malformed / missing resolvedSelection or resolvedLead degrades to
//    null, and the resolver is never even called for a malformed
//    selection — validated before any retrieval is attempted.
// ---------------------------------------------------------------------
{
    let calls = 0;
    const source = new DecentralizedWorldEncounterMaterialSource(async () => { calls++; return { ok: true }; });
    const validLead = leadOf({ uri: 'ar://tx-abc123' });

    for (const resolvedSelection of [undefined, null, {}, { kind: WorldEncounterKind.PUBLICATION }, { kind: 'NOT_A_KIND', objectId: 'pub-1' }]) {
        const result = await source.load(resolvedSelection, validLead);
        assert(result === null, `5. a malformed resolvedSelection ${JSON.stringify(resolvedSelection)} degrades to null`);
    }
    assert(calls === 0, '6. the injected resolver is never called when resolvedSelection is malformed');

    const validSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' });
    for (const resolvedLead of [undefined, null, {}, { uri: '' }, { uri: 123 }, 'ar://not-an-object']) {
        const result = await source.load(validSelection, resolvedLead);
        assert(result === null, `7. a malformed resolvedLead ${JSON.stringify(resolvedLead)} degrades to null`);
    }
    assert(calls === 0, '8. the injected resolver is never called when resolvedLead carries no usable uri');

    console.log('✓ Malformed selections and leads degrade to null; the resolver is never called for either');
}

// ---------------------------------------------------------------------
// 4. resolvedLead is opaque beyond its own uri — this source never reads
//    origin/discoveryTag/storage, and a lead missing them still works.
// ---------------------------------------------------------------------
{
    const material = { avatarId: 'avatar-1' };
    const source = new DecentralizedWorldEncounterMaterialSource(async (uri) => (uri === 'ipfs://CID123' ? material : null));
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' });

    const minimalLead = Object.freeze({ uri: 'ipfs://CID123' });
    const result = await source.load(resolvedSelection, minimalLead);
    assert(result === material, '9. a resolvedLead carrying only uri (no origin/discoveryTag/storage) still resolves material');

    console.log('✓ resolvedLead is opaque beyond its own uri — no other field is ever required or read');
}

// ---------------------------------------------------------------------
// 5. Material is retrieved unverified — a signed publication-shaped
//    object is forwarded exactly as the resolver returned it, and a
//    rejection from the resolver propagates rather than being swallowed.
// ---------------------------------------------------------------------
{
    const signedMaterial = Object.freeze({
        id: 'pub-signed',
        title: 'Signed',
        signature: { algorithm: 'Ed25519', signer: 'not-a-real-signer', signature: 'not-a-real-signature' }
    });
    const source = new DecentralizedWorldEncounterMaterialSource(async () => signedMaterial);
    const result = await source.load(
        selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-signed' }),
        leadOf({ uri: 'ar://tx-signed' })
    );
    assert(result === signedMaterial, '10. a signed material object is forwarded exactly as the resolver returned it, unverified');

    const failingSource = new DecentralizedWorldEncounterMaterialSource(async () => { throw new Error('network unreachable'); });
    let rejected = false;
    try {
        await failingSource.load(
            selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' }),
            leadOf({ uri: 'ar://tx-abc123' })
        );
    } catch {
        rejected = true;
    }
    assert(rejected, '11. a rejection from the injected resolver propagates to the caller, never swallowed as null');

    console.log('✓ Material is forwarded unverified; a resolver rejection is never swallowed');
}

// ---------------------------------------------------------------------
// 6. Constructor requires a retrieveByUri function.
// ---------------------------------------------------------------------
{
    expectThrows(() => new DecentralizedWorldEncounterMaterialSource(), '12. constructing without a retrieveByUri function throws');
    expectThrows(() => new DecentralizedWorldEncounterMaterialSource(null), '13. constructing with a null retrieveByUri throws');
    expectThrows(() => new DecentralizedWorldEncounterMaterialSource('not-a-function'), '14. constructing with a non-function retrieveByUri throws');

    console.log('✓ The constructor requires a real retrieveByUri function');
}

// ---------------------------------------------------------------------
// 7. Implements the 0.9.21 WorldEncounterMaterialSource contract.
// ---------------------------------------------------------------------
{
    const source = new DecentralizedWorldEncounterMaterialSource(async () => null);
    assert(source instanceof WorldEncounterMaterialSource, '15. DecentralizedWorldEncounterMaterialSource extends the 0.9.21 WorldEncounterMaterialSource contract');

    console.log('✓ DecentralizedWorldEncounterMaterialSource is a real WorldEncounterMaterialSource');
}

// ---------------------------------------------------------------------
// 8. Direct two-argument use — this source is deliberately NOT wired
//    into loadWorldEncounterMaterial()'s own materialSources.decentralized
//    slot this milestone (see this file's own header). Calling it through
//    the 0.9.21 boundary with only one argument available still resolves
//    UNAVAILABLE, since that boundary has no decentralized origin family
//    and no resolvedLead of its own to forward.
// ---------------------------------------------------------------------
{
    const material = { id: 'pub-1' };
    const source = new DecentralizedWorldEncounterMaterialSource(async (uri) => (uri === 'ar://tx-abc123' ? material : null));
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'decentralized:nostr' });

    const throughBoundary = await loadWorldEncounterMaterial({
        resolvedSelection,
        materialSources: { decentralized: source }
    });
    assert(throughBoundary.status === 'UNAVAILABLE', '16. the unmodified 0.9.21 boundary has no decentralized origin family and never routes here on its own');

    const direct = await source.load(resolvedSelection, leadOf({ uri: 'ar://tx-abc123' }));
    assert(direct === material, '17. called directly, with both resolvedSelection and a resolvedLead, this source resolves material');

    console.log('✓ Deliberately not wired into the 0.9.21 boundary\'s own routing; usable directly with an explicit resolvedLead');
}

// ---------------------------------------------------------------------
// 9. Architectural regression: no lead registry, no lead resolution, no
//    concrete decentralized backend, no signature/trust vocabulary, and
//    the 0.9.21 boundary file itself is never modified.
// ---------------------------------------------------------------------
{
    const path = '../application/DecentralizedWorldEncounterMaterialSource.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadResolution'), '18. never imports the 0.9.28 lead resolution boundary');
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), '19. never imports the 0.9.26 lead registry');
    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAssociation'), '20. never imports the 0.9.28 lead association module');
    assert(!codeOnly.includes('ContentReference'), '21. never constructs or imports a ContentReference');
    assert(!/fetch\(/.test(codeOnly), '22. never calls fetch(...) directly — retrieval is injected, never hardcoded');
    assert(!codeOnly.includes('WebSocket'), '23. never references WebSocket directly');
    assert(!codeOnly.includes('PeerMessageBus') && !codeOnly.includes('PeerConnection'), '24. never references any peer transport');

    const forbiddenTerms = ['trusted', 'trust(', 'reputation', 'verify(', 'authority', 'weight', 'confidence', 'ranking', 'scoring'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `25. code must never use "${term}" — retrieval only, no trust/verification vocabulary`);
    }

    const loadingBoundarySource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
    assert(!loadingBoundarySource.includes('DecentralizedWorldEncounterMaterialSource'), '26. the 0.9.21 loading boundary itself is never modified to know about this source');

    console.log('✓ Architectural regression: no rediscovery, no concrete backend, no trust vocabulary; 0.9.21 boundary untouched');
}

console.log('\nAll DecentralizedWorldEncounterMaterialSource tests passed.');
