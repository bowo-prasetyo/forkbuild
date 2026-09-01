import { readFile } from 'node:fs/promises';
import {
    verifyWorldEncounterMaterial,
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/WorldEncounterMaterialVerification.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.37 — World Encounter Material Verification Boundary.
// See docs/Roadmap.md, "0.9.37 — World Encounter Material Verification Boundary."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function selectionOf({ kind = WorldEncounterKind.PUBLICATION, objectId = 'P123', origin = 'decentralized:nostr' } = {}) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri = 'ar://tx-abc123', origin = 'nostr:wss://relay.example', discoveryTag = 'forkbuild_random_unique', storage = 'ar' } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

class FakeVerifier extends WorldEncounterMaterialVerifier {
    constructor(outcome) {
        super();
        this.outcome = outcome;
        this.calls = [];
    }

    async verifyIdentity(resolvedSelection, material, resolvedLead) {
        this.calls.push({ resolvedSelection, material, resolvedLead });
        return typeof this.outcome === 'function' ? this.outcome(resolvedSelection, material, resolvedLead) : this.outcome;
    }
}

// ---------------------------------------------------------------------
// 1. Flagship: Nostr-discovered lead → Arweave-retrieved Publication
//    material → an injected verifier confirming identity correspondence
//    → VERIFIED, with every input forwarded verbatim.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'P123' });
    const resolvedLead = leadOf({ uri: 'ar://tx-abc123' });
    const material = Object.freeze({
        id: 'P123',
        title: 'A Decentralized Publication',
        signature: { algorithm: 'Ed25519', signer: 'did:key:z6Mk...', signature: 'not-a-real-signature' }
    });
    const verifier = new FakeVerifier(true);

    const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });

    assert(result.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '1. FLAGSHIP — a verifier confirming correspondence resolves to VERIFIED');
    assert(result.resolvedSelection === resolvedSelection, '2. FLAGSHIP — resolvedSelection is forwarded by reference, never copied');
    assert(result.resolvedLead === resolvedLead, '3. FLAGSHIP — resolvedLead is forwarded by reference, never copied');
    assert(result.material === material, '4. FLAGSHIP — material is forwarded by reference, never copied or reshaped');
    assert(verifier.calls.length === 1, '5. FLAGSHIP — the verifier is asked exactly once');
    assert(verifier.calls[0].resolvedSelection === resolvedSelection
        && verifier.calls[0].material === material
        && verifier.calls[0].resolvedLead === resolvedLead, '6. FLAGSHIP — the verifier receives exactly the three supplied inputs, unmodified');

    console.log('✓ Flagship: Nostr lead + Arweave material + a confirming verifier resolves to VERIFIED');
}

// ---------------------------------------------------------------------
// 2. A verifier actively contradicting identity correspondence resolves
//    to REJECTED — never confused with "never checked."
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf({ objectId: 'P123' });
    const resolvedLead = leadOf();
    const material = { id: 'P999', title: 'Wrong Publication Entirely' };
    const verifier = new FakeVerifier(false);

    const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });

    assert(result.status === WorldEncounterMaterialVerificationStatus.REJECTED, '7. a verifier returning exactly false resolves to REJECTED');
    assert(result.resolvedSelection === resolvedSelection && result.resolvedLead === resolvedLead && result.material === material, '8. REJECTED still carries every real input, verbatim');

    console.log('✓ A verifier actively contradicting correspondence resolves to REJECTED');
}

// ---------------------------------------------------------------------
// 3. Only a strict boolean decides: any other resolved value from the
//    verifier — null, undefined, a truthy/falsy non-boolean — is an
//    abstention, never coerced into VERIFIED or REJECTED.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf();
    const resolvedLead = leadOf();
    const material = { id: 'P123' };

    for (const outcome of [null, undefined, 'yes', 0, 1, '', 'false', {}, []]) {
        const verifier = new FakeVerifier(outcome);
        const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });
        assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, `9. a verifier resolving ${serialize(outcome)} (not strictly true/false) collapses to UNVERIFIABLE, never guessed at`);
        assert(result.material === material, `10. UNVERIFIABLE from an abstaining verifier ${serialize(outcome)} still carries the real material`);
    }

    console.log('✓ Only a strict true/false decides; every other verifier outcome is treated as an abstention');
}

// ---------------------------------------------------------------------
// 4. A missing/malformed verifier — no verifier at all, or one exposing
//    no callable verifyIdentity — degrades to UNVERIFIABLE while still
//    carrying the real selection/lead/material.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf();
    const resolvedLead = leadOf();
    const material = { id: 'P123' };

    for (const verifier of [undefined, null, {}, { verifyIdentity: 'not-a-function' }, 'a-verifier-shaped-string']) {
        const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });
        assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, `11. a missing/malformed verifier ${serialize(verifier)} degrades to UNVERIFIABLE`);
        assert(result.resolvedSelection === resolvedSelection && result.resolvedLead === resolvedLead && result.material === material, `12. UNVERIFIABLE from a missing verifier ${serialize(verifier)} still carries every real input`);
    }

    console.log('✓ A missing/malformed verifier degrades to UNVERIFIABLE while preserving the real inputs');
}

// ---------------------------------------------------------------------
// 5. Malformed/missing resolvedSelection degrades to UNVERIFIABLE with
//    every field nulled out — nothing to name — and the verifier is
//    never even called.
// ---------------------------------------------------------------------
{
    const verifier = new FakeVerifier(true);
    const resolvedLead = leadOf();
    const material = { id: 'P123' };

    for (const resolvedSelection of [undefined, null, {}, { kind: WorldEncounterKind.PUBLICATION }, { kind: 'NOT_A_KIND', objectId: 'P123', origin: 'x' }]) {
        const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });
        assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, `13. a malformed resolvedSelection ${serialize(resolvedSelection)} degrades to UNVERIFIABLE`);
        assert(result.resolvedSelection === null, `14. a malformed resolvedSelection ${serialize(resolvedSelection)} carries a null resolvedSelection`);
        assert(result.resolvedLead === null, `15. a malformed resolvedSelection ${serialize(resolvedSelection)} carries a null resolvedLead too — nothing to name`);
        assert(result.material === null, `16. a malformed resolvedSelection ${serialize(resolvedSelection)} carries a null material too`);
    }
    assert(verifier.calls.length === 0, '17. the verifier is never called when resolvedSelection is malformed');

    console.log('✓ A malformed resolvedSelection degrades fully to UNVERIFIABLE; the verifier is never consulted');
}

// ---------------------------------------------------------------------
// 6. Missing/null material degrades to UNVERIFIABLE while still naming
//    the real resolvedSelection and resolvedLead, and the verifier is
//    never called.
// ---------------------------------------------------------------------
{
    const verifier = new FakeVerifier(true);
    const resolvedSelection = selectionOf();
    const resolvedLead = leadOf();

    for (const material of [undefined, null]) {
        const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });
        assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, `18. material ${serialize(material)} degrades to UNVERIFIABLE`);
        assert(result.resolvedSelection === resolvedSelection && result.resolvedLead === resolvedLead, `19. missing material ${serialize(material)} still carries the real resolvedSelection and resolvedLead`);
        assert(result.material === null, `20. missing material ${serialize(material)} carries a null material`);
    }
    assert(verifier.calls.length === 0, '21. the verifier is never called when material is missing');

    console.log('✓ Missing material degrades to UNVERIFIABLE without ever consulting the verifier');
}

// ---------------------------------------------------------------------
// 7. resolvedLead is entirely optional — local/peer material, which
//    carries no lead at all, still verifies, and the verifier receives
//    null rather than undefined.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf({ origin: 'local' });
    const material = { id: 'P123', title: 'Local Publication' };
    const verifier = new FakeVerifier(true);

    const result = await verifyWorldEncounterMaterial({ resolvedSelection, material, verifier });

    assert(result.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '22. material with no resolvedLead at all still verifies');
    assert(result.resolvedLead === null, '23. an absent resolvedLead is reported as null, never undefined, in the result');
    assert(verifier.calls[0].resolvedLead === null, '24. the verifier itself receives null, never undefined, for an absent resolvedLead');

    console.log('✓ resolvedLead is optional — local/peer material with no lead still verifies, with resolvedLead reported as null');
}

// ---------------------------------------------------------------------
// 8. A thrown rejection from the verifier propagates, never swallowed
//    into UNVERIFIABLE.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf();
    const resolvedLead = leadOf();
    const material = { id: 'P123' };
    const failingVerifier = new WorldEncounterMaterialVerifier();
    failingVerifier.verifyIdentity = async () => { throw new Error('verifier backend unreachable'); };

    let rejected = false;
    try {
        await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier: failingVerifier });
    } catch {
        rejected = true;
    }
    assert(rejected, '25. a rejection from verifier.verifyIdentity() propagates to the caller, never swallowed as UNVERIFIABLE');

    console.log('✓ A verifier rejection propagates rather than being swallowed');
}

// ---------------------------------------------------------------------
// 9. The base WorldEncounterMaterialVerifier class throws when
//    verifyIdentity() is not overridden, and that throw propagates too.
// ---------------------------------------------------------------------
{
    const unimplemented = new WorldEncounterMaterialVerifier();
    let threwSynchronously = false;
    try {
        unimplemented.verifyIdentity(selectionOf(), { id: 'P123' }, null);
    } catch {
        threwSynchronously = true;
    }
    assert(threwSynchronously, '26. calling verifyIdentity() on the un-subclassed base class throws');

    let rejected = false;
    try {
        await verifyWorldEncounterMaterial({ resolvedSelection: selectionOf(), material: { id: 'P123' }, verifier: unimplemented });
    } catch {
        rejected = true;
    }
    assert(rejected, '27. an un-subclassed base verifier throws through verifyWorldEncounterMaterial() too, never swallowed as UNVERIFIABLE');

    console.log('✓ The base WorldEncounterMaterialVerifier class throws when unimplemented, and that throw is never swallowed');
}

// ---------------------------------------------------------------------
// 10. Freezing.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf();
    const resolvedLead = leadOf();
    const material = { id: 'P123' };

    const verified = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier: new FakeVerifier(true) });
    assert(Object.isFrozen(verified), '28. a VERIFIED result object is frozen');

    const rejected = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier: new FakeVerifier(false) });
    assert(Object.isFrozen(rejected), '29. a REJECTED result object is frozen');

    const unverifiable = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material });
    assert(Object.isFrozen(unverifiable), '30. an UNVERIFIABLE result object is frozen');

    console.log('✓ Every result object is frozen, regardless of status');
}

// ---------------------------------------------------------------------
// 11. No caching: two calls against the same inputs and verifier each
//     invoke the verifier's own verifyIdentity() again.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf();
    const resolvedLead = leadOf();
    const material = { id: 'P123' };
    const verifier = new FakeVerifier(true);

    await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });
    await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier });
    assert(verifier.calls.length === 2, '31. no caching layer — the same inputs call verifyIdentity() again on a second request');

    console.log('✓ No caching: repeated calls invoke the verifier again every time');
}

// ---------------------------------------------------------------------
// 12. Calling with no arguments at all degrades to UNVERIFIABLE rather
//     than throwing.
// ---------------------------------------------------------------------
{
    const result = await verifyWorldEncounterMaterial();
    assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '32. calling with no arguments at all degrades to UNVERIFIABLE, never throws');
    assert(result.resolvedSelection === null && result.resolvedLead === null && result.material === null, '33. calling with no arguments names nothing at all');

    console.log('✓ Calling with no arguments degrades gracefully to a fully-null UNVERIFIABLE result');
}

// ---------------------------------------------------------------------
// 13. Architectural regression: no concrete verifier, no signature/
//     authorization machinery, no discovery/lead/loading imports, no
//     identity-matching logic of this file's own, no trust/ranking
//     vocabulary, and neither loading-boundary file is ever modified.
// ---------------------------------------------------------------------
{
    const path = '../application/WorldEncounterMaterialVerification.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('core/Signature'), '34. never imports core/Signature.js — no concrete cryptographic scheme');
    assert(!codeOnly.includes('SigningIdentity'), '35. never imports core/SigningIdentity.js');
    assert(!codeOnly.includes('AuthorizationVerifier'), '36. never imports identity/LocalAuthorizationVerifier.js or any AuthorizationVerifier');
    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadResolution'), '37. never imports the 0.9.28 lead resolution boundary');
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), '38. never imports the 0.9.26 lead registry');
    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAwareMaterialLoading'), '39. never imports the 0.9.34 loading boundary — a caller supplies already-loaded material');
    assert(!codeOnly.includes('WorldEncounterMaterialLoading'), '40. never imports the 0.9.21 loading boundary either');
    assert(!codeOnly.includes('DecentralizedWorldEncounterMaterialSource'), '41. never imports or constructs any concrete material source');
    assert(!codeOnly.includes('ArweaveWorldEncounterMaterialResolver'), '42. never imports the 0.9.35 Arweave resolver');
    assert(!/\bmaterial\.id\b/.test(codeOnly) && !/\bmaterial\.signature\b/.test(codeOnly), '43. never reads a field off material itself — no identity-matching logic of this file\'s own');
    assert(!/\bresolvedLead\.origin\b/.test(codeOnly) && !/\bresolvedLead\.storage\b/.test(codeOnly) && !/\bresolvedLead\.uri\b/.test(codeOnly), '44. never reads any field off resolvedLead — it is opaque context forwarded to the verifier alone');
    assert(!/fetch\(/.test(codeOnly), '45. never calls fetch(...) directly');
    assert(!codeOnly.includes('WebSocket'), '46. never references WebSocket directly');

    const forbiddenTerms = ['trusted', 'reputation', 'authority', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `47. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
    }

    const decentralizedLoadingSource = await readFile(new URL('../application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js', import.meta.url), 'utf8');
    assert(!decentralizedLoadingSource.includes('WorldEncounterMaterialVerification'), '48. the 0.9.34 loading boundary is never modified to know about this file');

    const loadingBoundarySource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
    assert(!loadingBoundarySource.includes('WorldEncounterMaterialVerification'), '49. the 0.9.21 loading boundary is never modified to know about this file either');

    console.log('✓ Architectural regression: no concrete verifier, no signature machinery, no upstream imports, no trust vocabulary; both loading boundaries untouched');
}

console.log('\nAll WorldEncounterMaterialVerification tests passed.');
